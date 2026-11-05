import { applyCachedBroadcasters } from './gemini';

// « mis à jour il y a X min »
const upd = document.querySelector<HTMLElement>('[data-updated]');
if (upd?.dataset.updated) {
  const mins = Math.round((Date.now() - new Date(upd.dataset.updated).getTime()) / 60000);
  const txt =
    mins < 1 ? "à l'instant" : mins < 60 ? `il y a ${mins} min` : mins < 48 * 60 ? `il y a ${Math.round(mins / 60)} h` : `il y a ${Math.round(mins / 1440)} jours`;
  upd.textContent = `Données mises à jour ${txt}`;
}

applyCachedBroadcasters();

if ('serviceWorker' in navigator) {
  const base = document.body.dataset.base ?? '/';
  navigator.serviceWorker.register(`${base}sw.js`, { scope: base }).catch(() => {});
}
