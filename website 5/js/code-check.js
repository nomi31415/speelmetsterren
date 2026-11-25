(() => {
  if (Student.get()) {
    location.replace('leerling.html');
    return;
  }

  const formulier = document.getElementById('code-formulier');
  const veld = document.getElementById('code');
  const knop = formulier.querySelector('button[type="submit"]');
  const fout = document.getElementById('code-fout');
  const codeStap = document.getElementById('code-stap');
  const bevestigStap = document.getElementById('bevestig-stap');
  const klasNaam = document.getElementById('klas-naam');
  const bevestigKnop = document.getElementById('bevestig-knop');
  const andereKnop = document.getElementById('andere-knop');

  let gevondenCode = null;

  const toonFout = (tekst) => {
    fout.textContent = tekst;
    fout.hidden = false;
    veld.setAttribute('aria-invalid', 'true');
  };

  const verbergFout = () => {
    fout.hidden = true;
    veld.removeAttribute('aria-invalid');
  };

  veld.addEventListener('input', () => {
    const schoon = veld.value.replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 6);
    if (schoon !== veld.value) veld.value = schoon;
    verbergFout();
  });

  formulier.addEventListener('submit', async (event) => {
    event.preventDefault();
    const code = veld.value;

    if (code.length !== 6) {
      toonFout('Een klascode heeft 6 tekens. Kijk nog eens goed naar de code.');
      veld.focus();
      return;
    }

    knop.disabled = true;
    const { data, error } = await db.rpc('check_code', { p_code: code });
    knop.disabled = false;

    if (error) {
      toonFout('Er ging iets mis met de verbinding. Probeer het zo nog eens.');
      return;
    }

    if (!data) {
      toonFout('Deze code kennen we niet. Kijk nog eens goed naar de code van je juf of meester.');
      veld.focus();
      return;
    }

    gevondenCode = code;
    klasNaam.textContent = data;
    codeStap.hidden = true;
    bevestigStap.hidden = false;
    bevestigKnop.focus();
  });

  bevestigKnop.addEventListener('click', () => {
    Student.kandidaat.set(gevondenCode);
    location.href = 'naam.html';
  });

  andereKnop.addEventListener('click', () => {
    gevondenCode = null;
    bevestigStap.hidden = true;
    codeStap.hidden = false;
    veld.value = '';
    verbergFout();
    veld.focus();
  });
})();
