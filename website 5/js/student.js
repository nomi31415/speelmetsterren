const Student = (() => {
  const SESSIE_SLEUTEL = 'leerling-sessie';
  const KANDIDAAT_SLEUTEL = 'kandidaat-code';
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const VERBINDINGSFOUT = 'Er ging iets mis met de verbinding. Probeer het zo nog eens.';

  const get = () => {
    try {
      const sessie = JSON.parse(localStorage.getItem(SESSIE_SLEUTEL));
      return sessie && UUID.test(sessie.studentId) && UUID.test(sessie.classId) ? sessie : null;
    } catch {
      return null;
    }
  };

  const set = (studentId, classId) => {
    try {
      localStorage.setItem(SESSIE_SLEUTEL, JSON.stringify({ studentId, classId }));
      return true;
    } catch {
      return false;
    }
  };

  const clear = () => {
    try {
      localStorage.removeItem(SESSIE_SLEUTEL);
    } catch {
      return;
    }
  };

  const kandidaat = {
    get: () => sessionStorage.getItem(KANDIDAAT_SLEUTEL),
    set: (code) => sessionStorage.setItem(KANDIDAAT_SLEUTEL, code),
    clear: () => sessionStorage.removeItem(KANDIDAAT_SLEUTEL),
  };

  const naarStart = () => {
    location.replace(`${BASE}index.html`);
    return new Promise(() => {});
  };

  const uitloggen = () => {
    clear();
    kandidaat.clear();
    location.href = `${BASE}index.html`;
  };

  const sessieOphalen = async () => {
    const sessie = get();
    if (!sessie) return null;
    const { data, error } = await db.rpc('get_student_session', { p_student_id: sessie.studentId });
    if (error) throw error;
    if (!data?.length) {
      clear();
      return null;
    }
    return {
      ...sessie,
      naam: data[0].student_name,
      klas: data[0].class_name,
      toegang: data[0].access_level,
    };
  };

  const vereis = async () => (await sessieOphalen()) ?? naarStart();

  const heeftVolledigeToegang = (sessie) => sessie.toegang === 'full';

  const lessen = async (studentId) => {
    const { data, error } = await db.rpc('get_lessons', { p_student_id: studentId });
    if (error) throw error;
    return data ?? [];
  };

  const initNaam = () => {
    const code = kandidaat.get();
    if (!code) {
      location.replace('index.html');
      return;
    }

    const formulier = document.getElementById('naam-formulier');
    const veld = document.getElementById('naam');
    const fout = document.getElementById('naam-fout');
    const knop = formulier.querySelector('button[type="submit"]');

    const toonFout = (tekst) => {
      fout.textContent = tekst;
      fout.hidden = false;
      veld.setAttribute('aria-invalid', 'true');
    };

    veld.addEventListener('input', () => {
      fout.hidden = true;
      veld.removeAttribute('aria-invalid');
    });

    formulier.addEventListener('submit', async (event) => {
      event.preventDefault();
      const naam = veld.value.replace(/\s+/g, ' ').trim();

      if (!naam) {
        toonFout('Vul eerst je naam in.');
        veld.focus();
        return;
      }
      if (naam.length > 30) {
        toonFout('Je naam mag niet langer zijn dan 30 tekens.');
        veld.focus();
        return;
      }

      knop.disabled = true;
      const { data, error } = await db.rpc('create_student', { p_code: code, p_name: naam });
      knop.disabled = false;

      if (error) {
        if (error.message.includes('ongeldige_code')) {
          kandidaat.clear();
          toonFout('Deze klascode werkt niet meer. Ga terug en vraag je juf of meester om hulp.');
        } else {
          toonFout(VERBINDINGSFOUT);
        }
        return;
      }

      if (!set(data.student_id, data.class_id)) {
        toonFout('Je browser laat niet toe dat we je ingelogd houden. Zet privé browsen uit en probeer het opnieuw.');
        return;
      }

      kandidaat.clear();
      location.href = 'leerling.html';
    });
  };

  const tegel = (href, symbool, titel) =>
    el(
      'li',
      {},
      el(
        'a',
        { class: 'tegel', href },
        el('span', { class: 'tegel-nummer', 'aria-hidden': 'true' }, symbool),
        el('span', {}, titel),
      ),
    );

  const initHome = async () => {
    const status = document.getElementById('status');
    const lijst = document.getElementById('lessen-lijst');
    const extra = document.getElementById('extra');

    document.getElementById('uitlog-knop').addEventListener('click', uitloggen);

    const toonVerbindingsfout = () => {
      status.replaceChildren(
        el('p', { class: 'melding fout' }, VERBINDINGSFOUT),
        el('button', { class: 'knop knop-klein', type: 'button', onclick: () => location.reload() }, 'Opnieuw proberen'),
      );
    };

    try {
      const sessie = await vereis();
      document.getElementById('klas-naam').textContent = sessie.klas;
      document.getElementById('leerling-naam').textContent = sessie.naam;

      const beschikbaar = await lessen(sessie.studentId);
      status.replaceChildren();

      if (!beschikbaar.length) {
        status.append(el('p', { class: 'melding' }, 'Er zijn nog geen lessen geopend. Vraag het aan je juf of meester.'));
      }

      lijst.replaceChildren(
        ...beschikbaar.map((les) => tegel(`lessen/les${les.lesson_number}.html`, String(les.lesson_number), les.title)),
      );

      extra.hidden = !heeftVolledigeToegang(sessie);
    } catch {
      toonVerbindingsfout();
    }
  };

  const paginas = { naam: initNaam, leerling: initHome };
  paginas[document.body.dataset.pagina]?.();

  return { get, set, clear, kandidaat, uitloggen, vereis, heeftVolledigeToegang, lessen };
})();
