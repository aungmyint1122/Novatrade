// js/views/market.js
import { COINS, PriceFeed, fmt, CandleChart, loadKlines } from '../core.js';

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

  function seed(){
    tb.innerHTML = '';
    for (let i=0;i<COINS.length;i++){
      const base = COINS[i];
      const d = PriceFeed.map[base] || {};
      const price = d.price || 0;
      const chg = d.change || 0;
      const tr = document.createElement('tr');
      tr.className = 'click';
      tr.setAttribute('data-base', base);
      tr.innerHTML = `
        <td>${i+1}</td>
        <td><b>${base}</b></td>
        <td class="p">${fmt(price)}</td>
        <td class="${chg>=0?'positive':'negative'}">${(chg>=0?'+':'')}${(chg?chg.toFixed(2):'0.00')}%</td>
      `;
      tb.appendChild(tr);
    }
  }
  seed();

  // live price blink
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
    loadKlines(base,'1m', rows => c.setData(rows,'1m'));
    // highlight selection
    tb.querySelectorAll('tr').forEach(r=>r.style.background='transparent');
    const sel = tb.querySelector('tr[data-base="'+base+'"]');
    if (sel) sel.style.background = 'rgba(32,208,255,.06)';
  }
  load('BTC');

  PriceFeed.on((sym, price) => { if (sym === current) c.pushLive(price); });

  tb.addEventListener('click', function(e){
    const el = e.target.closest ? e.target.closest('tr[data-base]') : null;
    if (!el) return;
    load(el.getAttribute('data-base'));
  });

  // search (light debounce)
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
