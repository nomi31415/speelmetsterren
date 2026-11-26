(() => {
  const pagina = document.body.dataset.pagina;
  const ALGEMENE_FOUT = 'Er ging iets mis. Probeer het zo nog eens.';
  const TOEGANG = {
    lesson1: 'Les 1',
    lesson2: 'Les 1 t/m 2',
    lesson3: 'Les 1 t/m 3',
    full: 'Volledige toegang',
  };

  const nooitKlaar = () => new Promise(() => {});

  const huidigeSessie = async () => {
    const { data } = await db.auth.getSession();
    return data.session;
  };

  const vereisSessie = async () => {
    const sessie = await huidigeSessie();
    if (sessie) return sessie;
    location.replace('login.html');
    return nooitKlaar();
  };

  const initKop = (sessie) => {
    document.getElementById('docent-email').textContent = sessie.user.email ?? '';
    document.getElementById('uitlog-knop').addEventListener('click', async () => {
      await db.auth.signOut();
      location.href = 'login.html';
    });
  };

  const zetMelding = (node, tekst, soort = '') => {
    node.textContent = tekst;
    node.className = `melding ${soort}`.trim();
    node.hidden = !tekst;
  };

  const toegangOpties = (select, waarde) => {
    select.replaceChildren(
      ...Object.entries(TOEGANG).map(([sleutel, label]) =>
        el('option', { value: sleutel, selected: sleutel === waarde }, label),
      ),
    );
  };

  const authFout = (error) => {
    console.error('Inloggen mislukt:', error);
    const tekst = (error.message ?? '').toLowerCase();
    if (tekst.includes('api key') || tekst.includes('apikey')) return 'De sleutel in js/supabase-client.js klopt niet of ontbreekt.';
    if (tekst.includes('failed to fetch') || tekst.includes('networkerror')) return 'Er is geen verbinding met Supabase. Controleer de URL in js/supabase-client.js.';
    if (tekst.includes('provider is not enabled') || tekst.includes('unsupported provider')) return 'Dit type inloggen is nog niet aangezet in Supabase.';
    if (tekst.includes('email logins are disabled')) return 'Inloggen met e-mail staat uit in Supabase.';
    if (tekst.includes('invalid login')) return 'Het e-mailadres of wachtwoord klopt niet.';
    if (tekst.includes('not confirmed')) return 'Bevestig eerst je e-mailadres via de e-mail die we je hebben gestuurd.';
    if (tekst.includes('already registered')) return 'Er bestaat al een account met dit e-mailadres.';
    if (tekst.includes('rate limit')) return 'Je hebt te vaak geprobeerd. Wacht even en probeer het later opnieuw.';
    if (tekst.includes('password')) return 'Kies een wachtwoord van minstens 8 tekens.';
    return ALGEMENE_FOUT;
  };

  const initLogin = async () => {
    if (await huidigeSessie()) {
      location.replace('dashboard.html');
      return;
    }

    const doel = new URL('dashboard.html', location.href).href;
    const melding = document.getElementById('login-melding');

    document.querySelectorAll('[data-provider]').forEach((knop) => {
      knop.addEventListener('click', async () => {
        knop.disabled = true;
        zetMelding(melding, '');
        const { data, error } = await db.auth.signInWithOAuth({
          provider: knop.dataset.provider,
          options: { redirectTo: doel, skipBrowserRedirect: true },
        });
        if (error || !data?.url) {
          knop.disabled = false;
          zetMelding(melding, error ? authFout(error) : ALGEMENE_FOUT, 'fout');
          return;
        }
        const adres = new URL(data.url);
        adres.searchParams.set('apikey', SUPABASE_ANON_KEY);
        location.assign(adres.href);
      });
    });

    document.getElementById('inlog-formulier').addEventListener('submit', async (event) => {
      event.preventDefault();
      const email = document.getElementById('inlog-email').value.trim();
      const wachtwoord = document.getElementById('inlog-wachtwoord').value;
      if (!email || !wachtwoord) {
        zetMelding(melding, 'Vul je e-mailadres en wachtwoord in.', 'fout');
        return;
      }

      const knop = event.submitter;
      knop.disabled = true;
      const { error } = await db.auth.signInWithPassword({ email, password: wachtwoord });
      knop.disabled = false;

      if (error) {
        zetMelding(melding, authFout(error), 'fout');
        return;
      }
      location.href = 'dashboard.html';
    });

    document.getElementById('aanmaak-formulier').addEventListener('submit', async (event) => {
      event.preventDefault();
      const email = document.getElementById('aanmaak-email').value.trim();
      const wachtwoord = document.getElementById('aanmaak-wachtwoord').value;
      if (!email) {
        zetMelding(melding, 'Vul je e-mailadres in.', 'fout');
        return;
      }
      if (wachtwoord.length < 8) {
        zetMelding(melding, 'Kies een wachtwoord van minstens 8 tekens.', 'fout');
        return;
      }

      const knop = event.submitter;
      knop.disabled = true;
      const { data, error } = await db.auth.signUp({
        email,
        password: wachtwoord,
        options: { emailRedirectTo: doel },
      });
      knop.disabled = false;

      if (error) {
        zetMelding(melding, authFout(error), 'fout');
        return;
      }
      if (data.user?.identities?.length === 0) {
        zetMelding(melding, 'Er bestaat al een account met dit e-mailadres.', 'fout');
        return;
      }
      if (data.session) {
        location.href = 'dashboard.html';
        return;
      }
      zetMelding(melding, `We hebben een e-mail gestuurd naar ${email}. Klik op de link in die e-mail om je account te bevestigen en log daarna in.`, 'succes');
    });
  };

  const klasKaart = (klas, opnieuwLaden) => {
    const aantal = klas.students?.[0]?.count ?? 0;
    const melding = el('p', { class: 'melding', role: 'status', hidden: true });
    const codeVeld = el('span', { class: 'code-groot' }, klas.code);
    const kopieerKnop = el('button', { class: 'knop knop-secundair', type: 'button' }, 'Kopieer code');
    const selectId = `toegang-${klas.id}`;
    const select = el('select', { id: selectId, class: 'veld' });
    toegangOpties(select, klas.access_level);
    const nieuweCodeKnop = el('button', { class: 'knop knop-secundair', type: 'button' }, 'Nieuwe code genereren');

    kopieerKnop.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(codeVeld.textContent);
        kopieerKnop.textContent = 'Gekopieerd!';
        setTimeout(() => {
          kopieerKnop.textContent = 'Kopieer code';
        }, 2000);
      } catch {
        zetMelding(melding, 'Kopiëren lukt niet. Selecteer de code en kopieer hem zelf.', 'fout');
      }
    });

    select.addEventListener('change', async () => {
      select.disabled = true;
      const { data, error } = await db
        .from('classes')
        .update({ access_level: select.value })
        .eq('id', klas.id)
        .select('id');
      select.disabled = false;

      if (error || !data?.length) {
        zetMelding(melding, 'Opslaan is niet gelukt. Probeer het opnieuw.', 'fout');
        select.value = klas.access_level;
        return;
      }
      klas.access_level = select.value;
      zetMelding(melding, 'Toegang opgeslagen.', 'succes');
    });

    nieuweCodeKnop.addEventListener('click', async () => {
      const zeker = confirm(
        'Weet je het zeker? De oude code werkt daarna niet meer. Leerlingen die al zijn aangemeld, blijven in de klas.',
      );
      if (!zeker) return;

      nieuweCodeKnop.disabled = true;
      const { data, error } = await db.rpc('regenerate_class_code', { p_class_id: klas.id });
      nieuweCodeKnop.disabled = false;

      if (error) {
        zetMelding(melding, 'Een nieuwe code maken is niet gelukt. Probeer het opnieuw.', 'fout');
        return;
      }
      codeVeld.textContent = data;
      zetMelding(melding, 'Nieuwe code gemaakt. Geef deze aan je leerlingen.', 'succes');
    });

    return el(
      'article',
      { class: 'kaart' },
      el('h3', {}, klas.name),
      el('p', { class: 'klas-meta' }, `${aantal} ${aantal === 1 ? 'leerling' : 'leerlingen'} aangemeld`),
      el('div', { class: 'code-blok' }, codeVeld, kopieerKnop),
      el('p', { class: 'hint' }, 'Geef deze code aan je leerlingen; hiermee loggen ze in tijdens de les.'),
      el('label', { class: 'veldlabel', for: selectId }, 'Toegang'),
      select,
      el(
        'div',
        { class: 'acties' },
        nieuweCodeKnop,
        el('a', { class: 'knop knop-secundair', href: `voortgang.html?klas=${klas.id}` }, 'Voortgang bekijken'),
      ),
      melding,
    );
  };

  const initDashboard = async () => {
    const sessie = await vereisSessie();
    initKop(sessie);

    const lijst = document.getElementById('klassen-lijst');
    const status = document.getElementById('lijst-status');
    const formulier = document.getElementById('klas-formulier');
    const naamVeld = document.getElementById('klas-naam');
    const toegangVeld = document.getElementById('klas-toegang');
    const formMelding = document.getElementById('klas-melding');

    toegangOpties(toegangVeld, 'lesson1');

    const laden = async () => {
      const { data, error } = await db
        .from('classes')
        .select('id, name, code, access_level, created_at, students(count)')
        .order('created_at', { ascending: false });

      if (error) {
        lijst.replaceChildren();
        status.textContent = ALGEMENE_FOUT;
        status.className = 'melding fout';
        return;
      }

      status.className = 'melding';
      status.textContent = data.length ? '' : 'Je hebt nog geen klassen. Maak hierboven je eerste klas aan.';
      lijst.replaceChildren(...data.map((klas) => klasKaart(klas, laden)));
    };

    formulier.addEventListener('submit', async (event) => {
      event.preventDefault();
      const naam = naamVeld.value.trim();
      if (!naam) {
        zetMelding(formMelding, 'Geef de klas een naam.', 'fout');
        naamVeld.focus();
        return;
      }

      const knop = event.submitter;
      knop.disabled = true;
      const { data, error } = await db.rpc('create_class', {
        p_name: naam,
        p_access_level: toegangVeld.value,
      });
      knop.disabled = false;

      if (error) {
        zetMelding(formMelding, 'De klas kon niet worden aangemaakt. Probeer het opnieuw.', 'fout');
        return;
      }

      naamVeld.value = '';
      zetMelding(formMelding, `Klas aangemaakt. De code is ${data.code}.`, 'succes');
      await laden();
    });

    await laden();
  };

  const datum = (iso) => new Date(iso).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' });

  const resultatenDetail = (resultaten) => {
    if (!resultaten.length) return el('p', { class: 'melding', style: 'margin: 0' }, 'Nog geen spelresultaten.');

    const perLes = Map.groupBy(resultaten, (resultaat) => resultaat.lesson_number);
    return el(
      'div',
      {},
      ...[...perLes.keys()].sort().flatMap((les) => [
        el('h4', { style: 'margin: 0.5rem 0 0.25rem' }, `Les ${les}`),
        el(
          'ul',
          { style: 'margin: 0 0 0.5rem' },
          ...perLes
            .get(les)
            .sort((a, b) => a.created_at.localeCompare(b.created_at))
            .map((resultaat) =>
              el('li', {}, `${resultaat.game_id}: ${resultaat.score} van ${resultaat.max_score} (${datum(resultaat.created_at)})`),
            ),
        ),
      ]),
    );
  };

  const leerlingRijen = (leerling) => {
    const resultaten = leerling.game_results ?? [];
    const score = resultaten.reduce((som, resultaat) => som + resultaat.score, 0);
    const maximum = resultaten.reduce((som, resultaat) => som + resultaat.max_score, 0);
    const gemiddelde = maximum ? `${Math.round((score / maximum) * 100)}%` : '–';
    const detailId = `details-${leerling.id}`;

    const knop = el(
      'button',
      { class: 'tabel-knop', type: 'button', 'aria-expanded': 'false', 'aria-controls': detailId },
      leerling.name,
    );
    const detail = el('tr', { id: detailId, hidden: true }, el('td', { colspan: '4' }, resultatenDetail(resultaten)));

    knop.addEventListener('click', () => {
      const open = knop.getAttribute('aria-expanded') === 'true';
      knop.setAttribute('aria-expanded', String(!open));
      detail.hidden = open;
    });

    return [
      el(
        'tr',
        {},
        el('td', {}, knop),
        el('td', {}, datum(leerling.created_at)),
        el('td', {}, String(resultaten.length)),
        el('td', {}, gemiddelde),
      ),
      detail,
    ];
  };

  const initVoortgang = async () => {
    const sessie = await vereisSessie();
    initKop(sessie);

    const keuze = document.getElementById('klas-keuze');
    const inhoud = document.getElementById('voortgang-inhoud');
    let aanvraag = 0;

    const { data: klassen, error } = await db.from('classes').select('id, name').order('name');

    if (error) {
      inhoud.replaceChildren(el('p', { class: 'melding fout' }, ALGEMENE_FOUT));
      return;
    }

    if (!klassen.length) {
      keuze.disabled = true;
      inhoud.replaceChildren(
        el('p', { class: 'melding' }, 'Je hebt nog geen klassen.'),
        el('a', { class: 'knop', href: 'dashboard.html' }, 'Klas aanmaken'),
      );
      return;
    }

    const gewenst = new URLSearchParams(location.search).get('klas');
    keuze.replaceChildren(
      ...klassen.map((klas) => el('option', { value: klas.id, selected: klas.id === gewenst }, klas.name)),
    );

    const toon = async (klasId) => {
      const dezeAanvraag = ++aanvraag;
      inhoud.replaceChildren(el('p', { class: 'melding' }, 'Even laden…'));

      const { data, error: fout } = await db
        .from('students')
        .select('id, name, created_at, game_results(id, lesson_number, game_id, score, max_score, created_at)')
        .eq('class_id', klasId)
        .order('name');

      if (dezeAanvraag !== aanvraag) return;

      if (fout) {
        inhoud.replaceChildren(el('p', { class: 'melding fout' }, ALGEMENE_FOUT));
        return;
      }

      if (!data.length) {
        inhoud.replaceChildren(el('p', { class: 'melding' }, 'Er hebben zich nog geen leerlingen aangemeld in deze klas.'));
        return;
      }

      inhoud.replaceChildren(
        el('p', { class: 'klas-meta' }, `${data.length} ${data.length === 1 ? 'leerling' : 'leerlingen'} aangemeld`),
        el(
          'div',
          { class: 'tabel-wrap' },
          el(
            'table',
            { class: 'tabel' },
            el(
              'thead',
              {},
              el(
                'tr',
                {},
                el('th', { scope: 'col' }, 'Leerling'),
                el('th', { scope: 'col' }, 'Aangemeld'),
                el('th', { scope: 'col' }, 'Spelresultaten'),
                el('th', { scope: 'col' }, 'Gemiddelde score'),
              ),
            ),
            el('tbody', {}, ...data.flatMap(leerlingRijen)),
          ),
        ),
      );
    };

    keuze.addEventListener('change', () => toon(keuze.value));
    await toon(keuze.value);
  };

  const lesKaart = (les, beheerder) => {
    if (!beheerder) {
      return el(
        'article',
        { class: 'kaart' },
        el('h2', {}, les.title),
        el('p', { class: 'lestekst' }, les.teaching_guide || 'Er zijn nog geen aanwijzingen voor deze les.'),
      );
    }

    const titelId = `titel-${les.lesson_number}`;
    const uitlegId = `uitleg-${les.lesson_number}`;
    const titel = el('input', { id: titelId, class: 'veld', type: 'text', maxlength: '200', value: les.title });
    const uitleg = el('textarea', { id: uitlegId, class: 'veld' });
    uitleg.value = les.teaching_guide;
    const melding = el('p', { class: 'melding', role: 'status', hidden: true });
    const formulier = el(
      'form',
      { novalidate: true },
      el('label', { class: 'veldlabel', for: titelId }, 'Titel van de les'),
      titel,
      el('label', { class: 'veldlabel', for: uitlegId, style: 'margin-top: 1rem' }, 'Uitleg hoe je de les geeft'),
      uitleg,
      el('p', {}, el('button', { class: 'knop', type: 'submit' }, 'Opslaan')),
      melding,
    );

    formulier.addEventListener('submit', async (event) => {
      event.preventDefault();
      const nieuweTitel = titel.value.trim();
      if (!nieuweTitel) {
        zetMelding(melding, 'De titel mag niet leeg zijn.', 'fout');
        titel.focus();
        return;
      }

      const knop = event.submitter;
      knop.disabled = true;
      const { data, error } = await db
        .from('lesson_content')
        .update({ title: nieuweTitel, teaching_guide: uitleg.value })
        .eq('lesson_number', les.lesson_number)
        .select('lesson_number');
      knop.disabled = false;

      if (error || !data?.length) {
        zetMelding(melding, 'Opslaan is niet gelukt. Alleen de beheerder mag lessen aanpassen.', 'fout');
        return;
      }
      zetMelding(melding, 'Opgeslagen.', 'succes');
    });

    return el('article', { class: 'kaart' }, el('h2', {}, `Les ${les.lesson_number}`), formulier);
  };

  const initLessen = async () => {
    const sessie = await vereisSessie();
    initKop(sessie);

    const lijst = document.getElementById('lessen-lijst');
    const [beheerderAntwoord, lessenAntwoord] = await Promise.all([
      db.rpc('is_admin'),
      db.from('lesson_content').select('lesson_number, title, teaching_guide').order('lesson_number'),
    ]);

    if (lessenAntwoord.error) {
      lijst.replaceChildren(el('p', { class: 'melding fout' }, ALGEMENE_FOUT));
      return;
    }

    const beheerder = beheerderAntwoord.data === true;
    document.getElementById('lessen-uitleg').hidden = beheerder;
    lijst.replaceChildren(...lessenAntwoord.data.map((les) => lesKaart(les, beheerder)));
  };

  const initUitleg = async () => {
    const sessie = await huidigeSessie();
    if (sessie) {
      initKop(sessie);
      return;
    }
    document.querySelector('.docent-gebruiker').replaceChildren(el('a', { href: 'login.html' }, 'Inloggen'));
  };

  const paginas = {
    login: initLogin,
    dashboard: initDashboard,
    voortgang: initVoortgang,
    lessen: initLessen,
    uitleg: initUitleg,
  };

  paginas[pagina]?.();
})();
