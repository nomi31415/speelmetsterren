(async () => {
  const formulier = document.getElementById('zoek-formulier');
  const veld = document.getElementById('zoekterm');
  const knop = formulier.querySelector('button[type="submit"]');
  const status = document.getElementById('zoek-status');
  const resultaten = document.getElementById('resultaten');

  const meld = (tekst, fout = false) => {
    status.textContent = tekst;
    status.classList.toggle('fout', fout);
  };

  const markeer = (tekst, term) => {
    const klein = tekst.toLowerCase();
    const delen = [];
    let van = 0;
    for (let i = klein.indexOf(term); i !== -1; i = klein.indexOf(term, van)) {
      delen.push(tekst.slice(van, i), el('mark', {}, tekst.slice(i, i + term.length)));
      van = i + term.length;
    }
    delen.push(tekst.slice(van));
    return delen;
  };

  const href = (rij) =>
    rij.kind === 'les' ? `lessen/les${rij.lesson_number}.html` : `verdieping/${rij.slug}.html`;

  const toonResultaten = (rijen, term) => {
    resultaten.replaceChildren(
      ...rijen.map((rij) =>
        el(
          'li',
          {},
          el(
            'a',
            { class: 'resultaat', href: href(rij) },
            el('strong', {}, ...markeer(rij.title, term)),
            el('span', {}, ...markeer(rij.snippet, term)),
          ),
        ),
      ),
    );
  };

  let sessie;
  try {
    sessie = await Student.vereis();
  } catch {
    formulier.hidden = true;
    meld('Er ging iets mis met de verbinding. Probeer het zo nog eens.', true);
    return;
  }

  if (!Student.heeftVolledigeToegang(sessie)) {
    formulier.hidden = true;
    meld('Zoeken is er alleen voor klassen met volledige toegang.');
    return;
  }

  formulier.addEventListener('submit', async (event) => {
    event.preventDefault();
    const term = veld.value.trim().toLowerCase();
    resultaten.replaceChildren();

    if (term.length < 2) {
      meld('Typ minstens 2 letters.', true);
      veld.focus();
      return;
    }

    knop.disabled = true;
    meld('Even zoeken…');
    const { data, error } = await db.rpc('search_content', { p_student_id: sessie.studentId, p_query: term });
    knop.disabled = false;

    if (error) {
      meld('Er ging iets mis met de verbinding. Probeer het zo nog eens.', true);
      return;
    }

    if (!data?.length) {
      meld(`Niets gevonden voor "${term}". Probeer een ander woord.`);
      return;
    }

    meld(data.length === 1 ? '1 resultaat' : `${data.length} resultaten`);
    toonResultaten(data, term);
  });
})();
