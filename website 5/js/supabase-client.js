const SUPABASE_URL = 'https://JOUW-PROJECT-ID.supabase.co';
const SUPABASE_ANON_KEY = 'JOUW-ANON-KEY';
const SITE_NAAM = '[SITE-NAAM]';
const BASE = document.documentElement.dataset.base || '';

const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const el = (tag, props = {}, ...children) => {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (value === false || value == null) continue;
    if (key === 'class') node.className = value;
    else if (key.startsWith('on')) node.addEventListener(key.slice(2), value);
    else node.setAttribute(key, value === true ? '' : value);
  }
  node.append(...children);
  return node;
};

document.title = document.title.replace('[SITE-NAAM]', SITE_NAAM);
document.querySelectorAll('[data-site-naam]').forEach((node) => {
  node.textContent = node.textContent.replace('[SITE-NAAM]', SITE_NAAM);
});
