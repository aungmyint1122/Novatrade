// js/router.js
import { $, AUTH } from './core.js';

import HomeView   from './views/home.js';    // default imports
import MarketView from './views/market.js';
import TradeView  from './views/trade.js';
import AssetsView from './views/assets.js';
import AuthView   from './views/auth.js';

export const routes = {
  home:   HomeView,
  market: MarketView,
  trade:  TradeView,
  assets: AssetsView,
  auth:   AuthView
};

export function mount(tab){
  const app = $('#app');
  if (!app) return;
  app.innerHTML = '';

  try {
    routes[tab](view => {
      try {
        app.appendChild(view);
      } catch (e) {
        const box = document.createElement('div');
        box.className = 'card';
        box.textContent = 'Render failed.';
        app.appendChild(box);
      }
    });
  } catch (e) {
    const banner = document.getElementById('banner');
    if (banner) {
      banner.textContent = 'View error: ' + e.message;
      banner.style.display = 'block';
    }
  }

  try {
    const me = AUTH.me();
    const who = document.getElementById('who');
    if (who) who.textContent = (me && me.email) ? me.email : 'Guest';
  } catch {}
}

export function enableTabs(){
  const tabs = document.getElementById('tabs');
  if (!tabs) return;
  tabs.addEventListener('click', e => {
    const el = e.target.closest('[data-tab]');
    if (!el) return;
    selectTab(el.getAttribute('data-tab'));
  });
}

export function selectTab(name){
  document.querySelectorAll('#tabs .tab').forEach(btn => {
    btn.classList.toggle('active', btn.getAttribute('data-tab') === name);
  });
  mount(name);
}
// ---- add to router.js ----
function routeFromHash() {
  const name = (location.hash.replace(/^#\/?/, '') || 'home').split('?')[0];
  // fall back to 'home' if unknown
  const valid = Object.prototype.hasOwnProperty.call(routes, name) ? name : 'home';
  // keep tabs ui in sync (if you use it)
  document.querySelectorAll('#tabs .tab').forEach(btn => {
    btn.classList.toggle('active', btn.getAttribute('data-tab') === valid);
  });
  mount(valid);
}

// bootstrap hash routing once, globally
window.addEventListener('hashchange', routeFromHash);
window.addEventListener('load', routeFromHash);
