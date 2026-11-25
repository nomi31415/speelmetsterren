(() => {
  const SELECTOR = '.moeilijk-woord';
  const POPUP_ID = 'woord-uitleg';
  const MARGE = 12;

  let popup = null;
  let actief = null;

  const sluit = () => {
    if (!popup) return;
    popup.remove();
    popup = null;
    actief.setAttribute('aria-expanded', 'false');
    actief.removeAttribute('aria-describedby');
    actief = null;
  };

  const plaats = (woord) => {
    const rect = woord.getBoundingClientRect();
    const breedte = popup.offsetWidth;
    const hoogte = popup.offsetHeight;
    const midden = rect.left + rect.width / 2 - breedte / 2;
    const links = Math.min(Math.max(midden, MARGE), document.documentElement.clientWidth - breedte - MARGE);
    const onder = rect.bottom + 8;
    const boven = rect.top - hoogte - 8;
    const past = onder + hoogte <= window.innerHeight - MARGE;
    const top = past || boven < MARGE ? onder : boven;
    popup.style.left = `${Math.max(links, MARGE) + window.scrollX}px`;
    popup.style.top = `${top + window.scrollY}px`;
  };

  const open = (woord) => {
    sluit();
    const uitleg = woord.dataset.uitleg;
    if (!uitleg) return;

    popup = document.createElement('div');
    popup.id = POPUP_ID;
    popup.className = 'woord-popup';
    popup.setAttribute('role', 'note');
    popup.textContent = uitleg;
    popup.style.left = '0px';
    popup.style.top = '0px';
    document.body.append(popup);

    actief = woord;
    woord.setAttribute('aria-expanded', 'true');
    woord.setAttribute('aria-describedby', POPUP_ID);
    plaats(woord);
  };

  const verrijk = () => {
    document.querySelectorAll(SELECTOR).forEach((woord) => {
      if (woord.hasAttribute('tabindex')) return;
      woord.tabIndex = 0;
      woord.setAttribute('role', 'button');
      woord.setAttribute('aria-expanded', 'false');
    });
  };

  document.addEventListener('click', (event) => {
    const woord = event.target.closest(SELECTOR);
    if (woord) {
      event.preventDefault();
      if (woord === actief) sluit();
      else open(woord);
      return;
    }
    if (popup && !popup.contains(event.target)) sluit();
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && popup) {
      const woord = actief;
      sluit();
      woord.focus();
      return;
    }
    if ((event.key === 'Enter' || event.key === ' ') && event.target.matches?.(SELECTOR)) {
      event.preventDefault();
      event.target.click();
    }
  });

  window.addEventListener('resize', sluit);

  new MutationObserver(verrijk).observe(document.body, { childList: true, subtree: true });
  verrijk();
})();
