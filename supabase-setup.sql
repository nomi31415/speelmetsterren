create extension if not exists pgcrypto with schema extensions;

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  is_admin boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.classes (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 120),
  code text not null unique check (code ~ '^[2-9BCDFGHJKMNPQRSTVWXZ]{6}$'),
  access_level text not null default 'lesson1' check (access_level in ('lesson1', 'lesson2', 'lesson3', 'full')),
  created_at timestamptz not null default now()
);

create index classes_teacher_id_idx on public.classes (teacher_id);

create table public.students (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.classes (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 30),
  created_at timestamptz not null default now()
);

create index students_class_id_idx on public.students (class_id);

create table public.lesson_content (
  id bigint generated always as identity primary key,
  lesson_number smallint not null unique check (lesson_number between 1 and 3),
  title text not null,
  intro text not null default '',
  body text not null default '',
  teaching_guide text not null default ''
);

create table public.articles (
  id bigint generated always as identity primary key,
  slug text not null unique check (slug ~ '^[a-z0-9-]+$'),
  title text not null,
  intro text not null default '',
  body text not null default '',
  sort_order smallint not null default 0
);

create table public.game_results (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students (id) on delete cascade,
  lesson_number smallint not null check (lesson_number between 1 and 3),
  game_id text not null check (char_length(game_id) between 1 and 60),
  score integer not null check (score >= 0),
  max_score integer not null check (max_score > 0),
  created_at timestamptz not null default now(),
  check (score <= max_score)
);

create index game_results_student_id_idx on public.game_results (student_id);

create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id) values (new.id) on conflict do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

insert into public.profiles (id) select id from auth.users on conflict do nothing;

create function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select p.is_admin from public.profiles p where p.id = auth.uid()), false);
$$;

create function public.lessons_allowed(p_level text)
returns integer
language sql
immutable
as $$
  select case p_level
    when 'lesson1' then 1
    when 'lesson2' then 2
    when 'lesson3' then 3
    when 'full' then 3
    else 0
  end;
$$;

create function public.student_access_level(p_student_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select c.access_level
  from public.students s
  join public.classes c on c.id = s.class_id
  where s.id = p_student_id;
$$;

create function public.generate_class_code()
returns text
language plpgsql
volatile
set search_path = public, extensions
as $$
declare
  alphabet constant text := '23456789BCDFGHJKMNPQRSTVWXZ';
  candidate text;
  byte_value integer;
  i integer;
  ok boolean;
begin
  loop
    candidate := '';
    while char_length(candidate) < 6 loop
      byte_value := get_byte(gen_random_bytes(1), 0);
      if byte_value < 243 then
        candidate := candidate || substr(alphabet, (byte_value % 27) + 1, 1);
      end if;
    end loop;

    ok := char_length(regexp_replace(candidate, '[^2-9]', '', 'g')) between 2 and 3
      and candidate !~ '[2-9]{3}'
      and candidate !~ '[A-Z]{3}'
      and (select count(distinct teken) from regexp_split_to_table(candidate, '') as teken) = 6;

    if ok then
      for i in 1..5 loop
        if abs(position(substr(candidate, i, 1) in alphabet) - position(substr(candidate, i + 1, 1) in alphabet)) = 1 then
          ok := false;
          exit;
        end if;
      end loop;
    end if;

    exit when ok and not exists (select 1 from public.classes k where k.code = candidate);
  end loop;

  return candidate;
end;
$$;

alter table public.profiles enable row level security;
alter table public.classes enable row level security;
alter table public.students enable row level security;
alter table public.lesson_content enable row level security;
alter table public.articles enable row level security;
alter table public.game_results enable row level security;

revoke all on all tables in schema public from anon, authenticated;

grant select on public.profiles to authenticated;
grant select, delete on public.classes to authenticated;
grant update (name, access_level) on public.classes to authenticated;
grant select, delete on public.students to authenticated;
grant select on public.game_results to authenticated;
grant select on public.lesson_content to authenticated;
grant update (title, intro, body, teaching_guide) on public.lesson_content to authenticated;
grant select, insert, update, delete on public.articles to authenticated;

create policy "eigen profiel lezen" on public.profiles
  for select to authenticated
  using (id = auth.uid());

create policy "eigen klassen lezen" on public.classes
  for select to authenticated
  using (teacher_id = auth.uid());

create policy "eigen klassen aanpassen" on public.classes
  for update to authenticated
  using (teacher_id = auth.uid())
  with check (teacher_id = auth.uid());

create policy "eigen klassen verwijderen" on public.classes
  for delete to authenticated
  using (teacher_id = auth.uid());

create policy "leerlingen van eigen klassen lezen" on public.students
  for select to authenticated
  using (exists (
    select 1 from public.classes c
    where c.id = students.class_id and c.teacher_id = auth.uid()
  ));

create policy "leerlingen van eigen klassen verwijderen" on public.students
  for delete to authenticated
  using (exists (
    select 1 from public.classes c
    where c.id = students.class_id and c.teacher_id = auth.uid()
  ));

create policy "resultaten van eigen klassen lezen" on public.game_results
  for select to authenticated
  using (exists (
    select 1
    from public.students s
    join public.classes c on c.id = s.class_id
    where s.id = game_results.student_id and c.teacher_id = auth.uid()
  ));

create policy "lessen lezen" on public.lesson_content
  for select to authenticated
  using (true);

create policy "lessen aanpassen door beheerder" on public.lesson_content
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy "artikelen lezen" on public.articles
  for select to authenticated
  using (true);

create policy "artikelen beheren door beheerder" on public.articles
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create function public.check_code(p_code text)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select k.name from public.classes k where k.code = upper(btrim(p_code));
$$;

create function public.create_student(p_code text, p_name text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  klas public.classes;
  schone_naam text;
  nieuwe public.students;
begin
  select * into klas from public.classes k where k.code = upper(btrim(p_code));
  if not found then
    raise exception 'ongeldige_code';
  end if;

  schone_naam := btrim(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g'));
  if char_length(schone_naam) not between 1 and 30 then
    raise exception 'ongeldige_naam';
  end if;

  insert into public.students (class_id, name)
  values (klas.id, schone_naam)
  returning * into nieuwe;

  return jsonb_build_object('student_id', nieuwe.id, 'class_id', nieuwe.class_id);
end;
$$;

create function public.get_student_session(p_student_id uuid)
returns table (student_name text, class_name text, access_level text)
language sql
stable
security definer
set search_path = public
as $$
  select s.name, c.name, c.access_level
  from public.students s
  join public.classes c on c.id = s.class_id
  where s.id = p_student_id;
$$;

create function public.get_lessons(p_student_id uuid)
returns table (lesson_number smallint, title text)
language sql
stable
security definer
set search_path = public
as $$
  select l.lesson_number, l.title
  from public.lesson_content l
  where l.lesson_number <= public.lessons_allowed(public.student_access_level(p_student_id))
  order by l.lesson_number;
$$;

create function public.get_lesson(p_student_id uuid, p_lesson_number integer)
returns table (lesson_number smallint, title text, intro text, body text)
language sql
stable
security definer
set search_path = public
as $$
  select l.lesson_number, l.title, l.intro, l.body
  from public.lesson_content l
  where l.lesson_number = p_lesson_number
    and l.lesson_number <= public.lessons_allowed(public.student_access_level(p_student_id));
$$;

create function public.get_articles(p_student_id uuid)
returns table (slug text, title text, intro text)
language sql
stable
security definer
set search_path = public
as $$
  select a.slug, a.title, a.intro
  from public.articles a
  where public.student_access_level(p_student_id) = 'full'
  order by a.sort_order, a.id;
$$;

create function public.get_article(p_student_id uuid, p_slug text)
returns table (slug text, title text, intro text, body text)
language sql
stable
security definer
set search_path = public
as $$
  select a.slug, a.title, a.intro, a.body
  from public.articles a
  where a.slug = p_slug
    and public.student_access_level(p_student_id) = 'full';
$$;

create function public.search_content(p_student_id uuid, p_query text)
returns table (kind text, slug text, lesson_number smallint, title text, snippet text)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  q text := lower(btrim(coalesce(p_query, '')));
begin
  if char_length(q) < 2 or char_length(q) > 60 then
    return;
  end if;

  if public.student_access_level(p_student_id) is distinct from 'full' then
    return;
  end if;

  return query
  with inhoud as (
    select 'les'::text as soort,
           null::text as artikel_slug,
           l.lesson_number as les_nummer,
           l.title as titel,
           btrim(regexp_replace(l.intro || ' ' || l.body, '<[^>]*>', ' ', 'g')) as tekst
    from public.lesson_content l
    union all
    select 'artikel'::text,
           a.slug,
           null::smallint,
           a.title,
           btrim(regexp_replace(a.intro || ' ' || a.body, '<[^>]*>', ' ', 'g'))
    from public.articles a
  ),
  treffers as (
    select i.*,
           position(q in lower(i.titel)) as titel_pos,
           position(q in lower(i.tekst)) as tekst_pos
    from inhoud i
  )
  select t.soort,
         t.artikel_slug,
         t.les_nummer,
         t.titel,
         case
           when t.tekst_pos > 0 then
             (case when t.tekst_pos > 60 then '…' else '' end)
             || substr(t.tekst, greatest(t.tekst_pos - 60, 1), 160)
             || (case when char_length(t.tekst) > greatest(t.tekst_pos - 60, 1) + 160 then '…' else '' end)
           else left(t.tekst, 160) || (case when char_length(t.tekst) > 160 then '…' else '' end)
         end
  from treffers t
  where t.titel_pos > 0 or t.tekst_pos > 0
  order by (t.titel_pos > 0) desc, t.soort, t.les_nummer, t.titel;
end;
$$;

create function public.save_game_result(
  p_student_id uuid,
  p_lesson_number integer,
  p_game_id text,
  p_score integer,
  p_max_score integer
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  niveau text := public.student_access_level(p_student_id);
begin
  if niveau is null then
    raise exception 'ongeldige_leerling';
  end if;

  if p_lesson_number > public.lessons_allowed(niveau) then
    raise exception 'geen_toegang';
  end if;

  insert into public.game_results (student_id, lesson_number, game_id, score, max_score)
  values (p_student_id, p_lesson_number, p_game_id, p_score, p_max_score);
end;
$$;

create function public.create_class(p_name text, p_access_level text)
returns public.classes
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  nieuwe public.classes;
begin
  if auth.uid() is null then
    raise exception 'niet_ingelogd';
  end if;

  loop
    begin
      insert into public.classes (teacher_id, name, code, access_level)
      values (auth.uid(), btrim(p_name), public.generate_class_code(), p_access_level)
      returning * into nieuwe;
      return nieuwe;
    exception when unique_violation then
      null;
    end;
  end loop;
end;
$$;

create function public.regenerate_class_code(p_class_id uuid)
returns text
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  nieuwe_code text;
begin
  if auth.uid() is null then
    raise exception 'niet_ingelogd';
  end if;

  loop
    begin
      update public.classes
      set code = public.generate_class_code()
      where id = p_class_id and teacher_id = auth.uid()
      returning code into nieuwe_code;

      if not found then
        raise exception 'klas_niet_gevonden';
      end if;

      return nieuwe_code;
    exception when unique_violation then
      null;
    end;
  end loop;
end;
$$;

revoke execute on all functions in schema public from public, anon, authenticated;

grant execute on function public.check_code(text) to anon, authenticated;
grant execute on function public.create_student(text, text) to anon, authenticated;
grant execute on function public.get_student_session(uuid) to anon, authenticated;
grant execute on function public.get_lessons(uuid) to anon, authenticated;
grant execute on function public.get_lesson(uuid, integer) to anon, authenticated;
grant execute on function public.get_articles(uuid) to anon, authenticated;
grant execute on function public.get_article(uuid, text) to anon, authenticated;
grant execute on function public.search_content(uuid, text) to anon, authenticated;
grant execute on function public.save_game_result(uuid, integer, text, integer, integer) to anon, authenticated;
grant execute on function public.create_class(text, text) to authenticated;
grant execute on function public.regenerate_class_code(uuid) to authenticated;
grant execute on function public.is_admin() to authenticated;

insert into public.lesson_content (lesson_number, title, intro, body, teaching_guide) values
(
  1,
  'Les 1: [Lorem ipsum over het zonnestelsel]',
  'Lorem ipsum dolor sit amet, consectetur adipiscing elit. In deze les ontdek je het <span class="moeilijk-woord" data-uitleg="Het zonnestelsel is de zon met alle planeten, manen en andere dingen die er in een baan omheen draaien.">zonnestelsel</span>.',
  $les1$
<section>
  <h2>Lorem ipsum dolor sit amet</h2>
  <p>Sed ut perspiciatis unde omnis iste natus error sit voluptatem. Een <span class="moeilijk-woord" data-uitleg="Een planeet is een grote bol die om een ster draait. De aarde is een planeet.">planeet</span> draait in een <span class="moeilijk-woord" data-uitleg="De baan is het pad dat een planeet volgt als hij om de zon draait.">baan</span> om de zon, nemo enim ipsam voluptatem quia voluptas sit aspernatur.</p>
  <figure>
    <img src="../afbeeldingen/placeholder.svg" alt="Tijdelijke afbeelding: hier komt een tekening van het zonnestelsel" width="800" height="450">
    <figcaption>Hier komt een tekening van het zonnestelsel.</figcaption>
  </figure>
</section>
<section>
  <h2>Consectetur adipiscing elit</h2>
  <p>Ut enim ad minima veniam, quis nostrum exercitationem ullam corporis suscipit laboriosam. De <span class="moeilijk-woord" data-uitleg="Zwaartekracht is de kracht waarmee grote dingen, zoals de zon en de aarde, andere dingen naar zich toe trekken.">zwaartekracht</span> houdt alles bij elkaar, neque porro quisquam est qui dolorem ipsum.</p>
</section>
<section>
  <h2>Sed do eiusmod tempor</h2>
  <p>Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.</p>
  <figure>
    <img src="../afbeeldingen/placeholder.svg" alt="Tijdelijke afbeelding: hier komt een foto van de zon" width="800" height="450">
    <figcaption>Hier komt een foto van de zon.</figcaption>
  </figure>
</section>
$les1$,
  'Doel van de les: [lorem ipsum]. Duur: ongeveer 45 minuten. Voorbereiding: lorem ipsum dolor sit amet. Tip voor de les: laat de leerlingen eerst vertellen wat ze al weten over het zonnestelsel.'
),
(
  2,
  'Les 2: [Lorem ipsum over de maan]',
  'Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore.',
  $les2$
<section>
  <h2>Ut enim ad minim veniam</h2>
  <p>Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore. De maan draait om de aarde door de <span class="moeilijk-woord" data-uitleg="Zwaartekracht is de kracht waarmee grote dingen andere dingen naar zich toe trekken.">zwaartekracht</span>, eu fugiat nulla pariatur.</p>
  <figure>
    <img src="../afbeeldingen/placeholder.svg" alt="Tijdelijke afbeelding: hier komt een foto van de maan" width="800" height="450">
    <figcaption>Hier komt een foto van de maan.</figcaption>
  </figure>
</section>
<section>
  <h2>Nemo enim ipsam voluptatem</h2>
  <p>At vero eos et accusamus et iusto odio dignissimos ducimus qui blanditiis praesentium voluptatum deleniti atque corrupti.</p>
</section>
$les2$,
  'Doel van de les: [lorem ipsum]. Duur: ongeveer 45 minuten. Voorbereiding: lorem ipsum dolor sit amet.'
),
(
  3,
  'Les 3: [Lorem ipsum over sterren]',
  'Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore.',
  $les3$
<section>
  <h2>Quis autem vel eum iure</h2>
  <p>Nam libero tempore, cum soluta nobis est eligendi optio. Met een <span class="moeilijk-woord" data-uitleg="Een telescoop is een kijker waarmee je dingen die ver weg zijn groter en duidelijker ziet.">telescoop</span> kun je sterren bekijken, omnis voluptas assumenda est.</p>
  <figure>
    <img src="../afbeeldingen/placeholder.svg" alt="Tijdelijke afbeelding: hier komt een foto van de sterrenhemel" width="800" height="450">
    <figcaption>Hier komt een foto van de sterrenhemel.</figcaption>
  </figure>
</section>
<section>
  <h2>Temporibus autem quibusdam</h2>
  <p>Itaque earum rerum hic tenetur a sapiente delectus, ut aut reiciendis voluptatibus maiores alias.</p>
</section>
$les3$,
  'Doel van de les: [lorem ipsum]. Duur: ongeveer 45 minuten. Voorbereiding: lorem ipsum dolor sit amet.'
)
on conflict (lesson_number) do nothing;

insert into public.articles (slug, title, intro, body, sort_order) values
(
  'artikel1',
  'Verdieping 1: [Lorem ipsum over zwarte gaten]',
  'Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt.',
  $a1$
<section>
  <h2>Lorem ipsum dolor sit amet</h2>
  <p>Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.</p>
  <figure>
    <img src="../afbeeldingen/placeholder.svg" alt="Tijdelijke afbeelding: hier komt een illustratie bij dit artikel" width="800" height="450">
    <figcaption>Hier komt een illustratie.</figcaption>
  </figure>
</section>
<section>
  <h2>Consectetur adipiscing elit</h2>
  <p>Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur.</p>
</section>
$a1$,
  1
),
(
  'artikel2',
  'Verdieping 2: [Lorem ipsum over leven in het heelal]',
  'Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt.',
  $a2$
<section>
  <h2>Sed ut perspiciatis</h2>
  <p>Nemo enim ipsam voluptatem quia voluptas sit aspernatur aut odit aut fugit, sed quia consequuntur magni dolores.</p>
</section>
<section>
  <h2>Neque porro quisquam</h2>
  <p>Quis autem vel eum iure reprehenderit qui in ea voluptate velit esse quam nihil molestiae consequatur.</p>
</section>
$a2$,
  2
)
on conflict (slug) do nothing;
