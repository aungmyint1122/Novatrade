// js/views/home.js
import { AUTH, CONFIG, PriceFeed, COINS } from '../core.js';
import MarketView from './market.js'; // default import

// Router helper: click the real tab button (what your router already listens for)
function nav(tab){
  const btn = document.querySelector(`#tabs .tab[data-tab="${tab}"]`);
  if (btn) {
    btn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    return;
  }
  if (typeof window !== 'undefined' && typeof window.selectTab === 'function') {
    setTimeout(() => window.selectTab(tab), 0);
  } else {
    location.hash = `#/${tab}`;
  }
}

export default function HomeView(cb){
  const wrap = document.createElement('div');
  wrap.className = 'grid';

  // ===== Hero / Welcome =====
  const hero = document.createElement('section');
  hero.className = 'card';
  hero.innerHTML = `
    <h3 id="welcomeTitle">Welcome to Nova</h3>
    <p id="heroSub" class="small" style="margin:6px 0 10px">
      Create a free account to trade, track assets and see live market data.
    </p>
    <div class="row small" style="gap:8px;margin-bottom:12px">
      <div class="badge">Live prices from Binance (with fallback)</div>
      <div class="badge" id="estTotal">Est Total Value (USD): $0.00</div>
    </div>
    <div id="ctaRow" class="row" style="gap:10px">
      <button id="ctaStart"  type="button" class="btn">Get started</button>
      <button id="ctaSignin" type="button" class="btn ghost">I already have an account</button>
    </div>
  `;
  wrap.appendChild(hero);

  function goAuth(mode){
    try { sessionStorage.setItem('authMode', mode); } catch {}
    nav('auth');
  }

  // --- anti-jitter state ---
  let lastMode = null;          // 'in' | 'out'
  let lastEst  = '';            // last Est Total text
  let lastTick = 0;             // throttle updates

  function updateHero(){
    const now = Date.now();
    if (now - lastTick < 600) return; // throttle to ~0.6s
    lastTick = now;

    const me  = AUTH.me?.();
    const cfg = CONFIG.load();
    const px  = {
      BTC: (PriceFeed.map.BTC && PriceFeed.map.BTC.price) || 0,
      ETH: (PriceFeed.map.ETH && PriceFeed.map.ETH.price) || 0,
      USDT: 1,
      SAM: (cfg.samUsd || 0.01)
    };

    let total = 0;
    if (me){
      const b = me.balances || {};
      total = (b.BTC||0)*px.BTC + (b.ETH||0)*px.ETH + (b.USDT||0)*1 + (b.SAM||0)*px.SAM;
    }

    const title = hero.querySelector('#welcomeTitle');
    const sub   = hero.querySelector('#heroSub');
    const est   = hero.querySelector('#estTotal');
    const row   = hero.querySelector('#ctaRow');

    // only touch total text if it changed
    const estText = 'Est Total Value (USD): $ ' + total.toLocaleString(undefined,{maximumFractionDigits:2});
    if (est && estText !== lastEst){
      est.textContent = estText;
      lastEst = estText;
    }

    // swap CTA set ONLY when mode changes
    const mode = me ? 'in' : 'out';
    if (mode !== lastMode){
      if (me){
        if (title) title.textContent = `Welcome, ${me.email}`;
        if (sub)   sub.textContent   = 'You’re signed in. Explore markets and manage your assets.';
        if (row){
          row.innerHTML = `
            <button type="button" class="pill" id="ctaGoTrade">Go to Trade</button>
            <button type="button" class="pill" id="ctaGoAssets">View Assets</button>
            <button type="button" class="pill" id="ctaGoMarket">Market Overview</button>
          `;
          row.querySelector('#ctaGoTrade').onclick  = () => nav('trade');
          row.querySelector('#ctaGoAssets').onclick = () => nav('assets');
          row.querySelector('#ctaGoMarket').onclick = () => nav('market');
        }
      } else {
        if (title) title.textContent = 'Welcome to Nova';
        if (sub)   sub.textContent   = 'Create a free account to trade, track assets and see live market data.';
        if (row){
          row.innerHTML = `
            <button id="ctaStart"  type="button" class="btn">Get started</button>
            <button id="ctaSignin" type="button" class="btn ghost">I already have an account</button>
          `;
          row.querySelector('#ctaStart').onclick  = () => goAuth('create');
          row.querySelector('#ctaSignin').onclick = () => goAuth('login');
        }
      }
      lastMode = mode;
    }
  }
  updateHero();
  PriceFeed.on(updateHero);

  // ===== Quick actions (render only when LOGGED OUT) =====
  if (!AUTH.me?.()){
    const quick = document.createElement('section');
    quick.className = 'card';
    quick.innerHTML = `
      <h3>Quick actions</h3>
      <div class="row" style="gap:8px">
        <button type="button" class="pill" id="qa-trade">Go to Trade</button>
        <button type="button" class="pill" id="qa-assets">View Assets</button>
        <button type="button" class="pill" id="qa-market">Market Overview</button>
      </div>
    `;
    wrap.appendChild(quick);
    quick.querySelector('#qa-trade').onclick  = () => nav('trade');
    quick.querySelector('#qa-assets').onclick = () => nav('assets');
    quick.querySelector('#qa-market').onclick = () => nav('market');
  }

  // ===== Market Watch (reuse MarketView — table only) =====
  const marketHolder = document.createElement('div');
  wrap.appendChild(marketHolder);

  MarketView(function(m){
    const firstCard = m.querySelector('section.card');
    if (firstCard){
      const box = document.createElement('section');
      box.className = 'card';
      box.innerHTML = `<h3>Market Watch</h3>`;
      const tableWrap = firstCard.querySelector('table')?.parentElement || firstCard;
      box.appendChild(tableWrap.cloneNode(true));
      marketHolder.appendChild(box);
    }
    renderMovers();
    cb(wrap);
  });

  // ===== Top Movers (24h) =====
  function renderMovers(){
    const movers = document.createElement('section');
    movers.className = 'card';
    movers.innerHTML = `
      <h3>Top Movers (24h)</h3>
      <div class="grid" style="grid-template-columns:1fr 1fr; gap:16px">
        <div>
          <div class="badge small" style="margin-bottom:6px">Gainers</div>
          <table class="table"><thead><tr><th>Asset</th><th>Change</th></tr></thead><tbody id="gainers"></tbody></table>
        </div>
        <div>
          <div class="badge small" style="margin-bottom:6px">Losers</div>
          <table class="table"><thead><tr><th>Asset</th><th>Change</th></tr></thead><tbody id="losers"></tbody></table>
        </div>
      </div>
    `;
    wrap.appendChild(movers);

    function paintMovers(){
      const rows = COINS.map(sym => {
        const d = PriceFeed.map[sym] || {};
        return { sym, chg: +d.change || 0 };
      });
      const sorted = rows.slice().sort((a,b)=>b.chg - a.chg);
      const topG  = sorted.slice(0,5);
      const topL  = sorted.slice(-5).reverse();
      const gT = movers.querySelector('#gainers');
      const lT = movers.querySelector('#losers');
      gT.innerHTML = topG.map(r => `<tr><td><b>${r.sym}</b></td><td class="positive">+${r.chg.toFixed(2)}%</td></tr>`).join('');
      lT.innerHTML = topL.map(r => `<tr><td><b>${r.sym}</b></td><td class="negative">${r.chg.toFixed(2)}%</td></tr>`).join('');
    }

    paintMovers();
    PriceFeed.on(paintMovers);
  }
}
