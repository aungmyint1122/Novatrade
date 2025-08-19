// js/views/market.js
import { COINS, PriceFeed, fmt, CandleChart, loadKlines, CONFIG } from '../core.js';

export default function MarketView(cb) {
  const view = document.createElement('div');
  view.className = 'grid';

  const top = document.createElement('section');
  top.className = 'card';
  top.innerHTML = `
    <h3>Market Watch <span class="small" style="opacity:.8">(Live)</span></h3>
    <div class="row" style="justify-content:space-between;align-items:center;margin-bottom:8px">
      <div class="badge small">Tap a row to load the chart</div>
      <div class="row" style="gap:6px">
        <input id="search" class="input" placeholder="Search coin (btc, eth, sam)" style="min-width:240px"/>
        <button id="clear" class="btn">Clear</button>
      </div>
    </div>
    <table class="table">
      <thead><tr><th>#</th><th>Asset</th><th>Price (USDT)</th><th>24h %</th></tr></thead>
      <tbody id="tbody"></tbody>
    </table>
  `;
  view.appendChild(top);

  const tb = top.querySelector('#tbody');

  // --- build full list (COINS + SAM admin coin)
  function getCoins() {
    const cfg = CONFIG.load();
    const list = [...COINS]; // Binance coins
    if (!list.includes("SAM")) list.push("SAM"); // ensure SAM is always listed
    return list.map(sym => {
      if (sym === "SAM") {
        return {
          sym,
          price: cfg.samUsd || 0.01,
          change: cfg.samChange || 0, // optional % daily change
        };
      }
      const d = PriceFeed.map[sym] || {};
      return { sym, price: d.price || 0, change: d.change || 0 };
    });
  }

  function seed() {
    tb.innerHTML = '';
    const list = getCoins();
    list.forEach((coin, i) => {
      const tr = document.createElement('tr');
      tr.className = 'click';
      tr.setAttribute('data-base', coin.sym);
      tr.innerHTML = `
        <td>${i+1}</td>
        <td><b>${coin.sym}</b></td>
        <td class="p">${fmt(coin.price)}</td>
        <td class="${coin.change>=0?'positive':'negative'}">
          ${(coin.change>=0?'+':'')}${coin.change.toFixed(2)}%
        </td>
      `;
      tb.appendChild(tr);
    });
  }
  seed();

  // live update (Binance only; SAM uses admin update)
  PriceFeed.on(function(sym, price){
    const row = tb.querySelector('tr[data-base="'+sym+'"]');
    if (!row) return;
    const cell = row.querySelector('.p');
    if (cell) cell.textContent = fmt(price);
    row.classList.remove('flash'); void row.offsetWidth; row.classList.add('flash');
  });

  // chart card
  const chart = document.createElement('section');
  chart.className = 'card';
  chart.innerHTML = `
    <h3>Live Chart</h3>
    <div class="chartbox"><canvas id="chart"></canvas></div>
  `;
  view.appendChild(chart);

  const canvas = chart.querySelector('#chart');
  const c = new CandleChart(canvas);
  if (window.ResizeObserver) new ResizeObserver(()=>c.resize()).observe(canvas.parentElement||canvas);
  setTimeout(()=>c.resize(), 100);

  let current = 'BTC';
  function load(base){
    current = base;
    if (base === "SAM") {
      // no Binance chart for SAM → fake static line
      c.setData([{t:Date.now(),o:CONFIG.load().samUsd,h:CONFIG.load().samUsd,l:CONFIG.load().samUsd,c:CONFIG.load().samUsd}], '1d');
    } else {
      loadKlines(base,'1m', rows => c.setData(rows,'1m'));
    }
    tb.querySelectorAll('tr').forEach(r=>r.style.background='transparent');
    const sel = tb.querySelector('tr[data-base="'+base+'"]');
    if (sel) sel.style.background = 'rgba(32,208,255,.06)';
  }
  load('BTC');

  PriceFeed.on((sym, price) => { if (sym === current && sym !== "SAM") c.pushLive(price); });

  tb.addEventListener('click', function(e){
    const el = e.target.closest ? e.target.closest('tr[data-base]') : null;
    if (!el) return;
    load(el.getAttribute('data-base'));
  });

  // search
  const search = top.querySelector('#search'), clear = top.querySelector('#clear');
  let t = 0;
  function apply(){
    const q = (search.value||'').toLowerCase();
    tb.querySelectorAll('tr').forEach(tr=>{
      const sym = (tr.getAttribute('data-base')||'').toLowerCase();
      tr.style.display = (!q || sym.indexOf(q)>=0) ? '' : 'none';
    });
  }
  search.addEventListener('input', () => { clearTimeout(t); t=setTimeout(apply, 120); });
  clear.addEventListener('click', () => { search.value=''; apply(); });

  cb(view);
}
