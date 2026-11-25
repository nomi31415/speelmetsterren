(() => {
  const hoofd = document.getElementById('inhoud');
  const VERBINDINGSFOUT = 'Er ging iets mis met de verbinding. Probeer het zo nog eens.';

  const html = (tag, props, inhoud) => {
    const node = el(tag, props);
    node.innerHTML = inhoud;
    return node;
  };

  const terugLink = (href, tekst) => el('a', { class: 'tekstlink', href }, tekst);

  const toonBericht = (tekst, href, linkTekst, fout = false) =>
    hoofd.replaceChildren(
      el('p', { class: fout ? 'melding fout' : 'melding' }, tekst),
      el('a', { class: 'knop', href }, linkTekst),
    );

  const toonVerbindingsfout = () => toonBericht(VERBINDINGSFOUT, location.href, 'Opnieuw proberen', true);

  const toonInhoud = ({ titel, intro, body, terug, spel }) => {
    document.title = `${titel} – ${SITE_NAAM}`;
    hoofd.replaceChildren(
      terug,
      el('h1', {}, titel),
      html('p', { class: 'intro' }, intro),
      html('div', {}, body),
      ...(spel ? [spel] : []),
    );
  };

  const initLes = async () => {
    const nummer = Number(document.body.dataset.les);
    try {
      const sessie = await Student.vereis();
      const { data, error } = await db.rpc('get_lesson', {
        p_student_id: sessie.studentId,
        p_lesson_number: nummer,
      });
      if (error) throw error;

      if (!data?.length) {
        toonBericht('Deze les is nog niet geopend voor jouw klas.', `${BASE}leerling.html`, 'Terug naar je lessen');
        return;
      }

      const les = data[0];
      toonInhoud({
        titel: les.title,
        intro: les.intro,
        body: les.body,
        terug: terugLink(`${BASE}leerling.html`, 'Terug naar je lessen'),
        spel: el(
          'a',
          { class: 'knop knop-groot knop-spel', href: `${BASE}spelletjes/spel${nummer}.html` },
          'Naar het spel van deze les',
        ),
      });
    } catch {
      toonVerbindingsfout();
    }
  };

  const initArtikel = async () => {
    const slug = document.body.dataset.slug;
    try {
      const sessie = await Student.vereis();
      if (!Student.heeftVolledigeToegang(sessie)) {
        toonBericht('Dit artikel is er alleen voor klassen met volledige toegang.', `${BASE}leerling.html`, 'Terug naar je lessen');
        return;
      }

      const { data, error } = await db.rpc('get_article', { p_student_id: sessie.studentId, p_slug: slug });
      if (error) throw error;

      if (!data?.length) {
        toonBericht('Dit artikel bestaat niet.', `${BASE}verdieping/index.html`, 'Naar de verdieping');
        return;
      }

      const artikel = data[0];
      toonInhoud({
        titel: artikel.title,
        intro: artikel.intro,
        body: artikel.body,
        terug: terugLink(`${BASE}verdieping/index.html`, 'Terug naar de verdieping'),
      });
    } catch {
      toonVerbindingsfout();
    }
  };

  const initArtikelen = async () => {
    try {
      const sessie = await Student.vereis();
      if (!Student.heeftVolledigeToegang(sessie)) {
        toonBericht('Verdieping is er alleen voor klassen met volledige toegang.', `${BASE}leerling.html`, 'Terug naar je lessen');
        return;
      }

      const { data, error } = await db.rpc('get_articles', { p_student_id: sessie.studentId });
      if (error) throw error;

      hoofd.replaceChildren(
        terugLink(`${BASE}leerling.html`, 'Terug naar je lessen'),
        el('h1', {}, 'Verdieping'),
        el('p', { class: 'intro' }, 'Wil je nog meer weten? Lees hier verder over dingen die je tijdens de les niet hebt gezien.'),
        data?.length
          ? el(
              'ul',
              { class: 'tegels' },
              ...data.map((artikel, index) =>
                el(
                  'li',
                  {},
                  el(
                    'a',
                    { class: 'tegel', href: `${artikel.slug}.html` },
                    el('span', { class: 'tegel-nummer', 'aria-hidden': 'true' }, String(index + 1)),
                    el('span', {}, artikel.title),
                  ),
                ),
              ),
            )
          : el('p', { class: 'melding' }, 'Er zijn nog geen artikelen.'),
      );
    } catch {
      toonVerbindingsfout();
    }
  };

  const paginas = {
    les: initLes,
    artikel: initArtikel,
    artikelen: initArtikelen,
    spel: () => Student.vereis().catch(() => {}),
  };

  paginas[document.body.dataset.pagina]?.();
})();
