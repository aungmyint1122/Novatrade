// js/views/trade.js
import {
  COINS, PriceFeed, fmt, CandleChart, loadKlines,
  AUTH, FEE_RATE, ordersAll, placeMarket, placeLimit, cancelOrder, matchOpenOrders
} from '../core.js';

export default function TradeView(cb) {
  const wrap = document.createElement('div');
  wrap.className = 'grid';

  const card = document.createElement('section');
  card.className = 'card';
  card.innerHTML = `
    <h3>Trade</h3>
    <div class="toolbar">
      <div class="row">
        <span class="badge">Symbol</span>
        <select id="sym" class="sel"></select>
      </div>
      <div class="pills" id="tfs">
        <button class="pill" data-tf="1m">1m</button>
        <button class="pill" data-tf="5m">5m</button>
        <button class="pill active" data-tf="1h">1h</button>
        <button class="pill" data-tf="1d">1d</button>
      </div>
      <div class="badge" id="px">Price: —</div>
    </div>
    <div class="split">
      <div class="box"><div class="chartbox"><canvas id="chart"></canvas></div></div>
      <div class="box" id="tradePanel"></div>
    </div>
  `;
  wrap.appendChild(card);

  // fill symbols
  const sel = card.querySelector('#sym');
  COINS.forEach(c=>{
    const o=document.createElement('option');
    o.value=c; o.textContent=c+' / USDT';
    sel.appendChild(o);
  });
  sel.value='BTC';

  const pxBadge = card.querySelector('#px');
  const canvas  = card.querySelector('#chart');
  const chart   = (()=>{ const c=new CandleChart(canvas); if(window.ResizeObserver) new ResizeObserver(()=>c.resize()).observe(canvas.parentElement||canvas); setTimeout(()=>c.resize(),100); return c; })();

  const state = { base:'BTC', tf:'1h' };

  function refresh(){
    loadKlines(state.base, state.tf, rows => chart.setData(rows, state.tf));
    renderPanel();
  }

  let updateTotalsRef = function(){};
  const tradePanel = card.querySelector('#tradePanel');

  function lastPrice(){ return (PriceFeed.map[state.base] && PriceFeed.map[state.base].price) || 0; }

  function renderPanel(){
    if(!tradePanel) return;
    const me = AUTH.me?.();
    if(!me){
      tradePanel.innerHTML = `
        <div class="badge small">Please sign in to trade.</div>
        <div class="row" style="margin-top:10px">
          <a class="btn" onclick="selectTab('auth')">Go to Auth</a>
        </div>`;
      updateTotalsRef = function(){};
      return;
    }

    const b = me.balances || {};
    tradePanel.innerHTML = `
      <div class="row" style="justify-content:space-between;align-items:center;margin-bottom:6px">
        <div class="badge"><b>Wallet</b></div>
        <div class="badge small" id="miniBal">USDT: ${fmt(b.USDT||0)} · ${state.base}: ${fmt(b[state.base]||0)}</div>
      </div>
      <div class="pills" id="sideTabs" style="margin-bottom:8px">
        <button class="pill active" data-side="BUY">Buy</button>
        <button class="pill" data-side="SELL">Sell</button>
      </div>
      <div class="row" style="gap:8px;margin:8px 0">
        <select id="ordType" class="sel">
          <option value="market">Market</option>
          <option value="limit">Limit</option>
        </select>
        <input id="priceIn" class="input" type="number" step="0.000001" placeholder="Price (${state.base}/USDT)" disabled>
      </div>
      <div class="row" style="gap:8px;margin:8px 0">
        <input id="qtyIn" class="input" type="number" step="0.00000001" placeholder="Amount (${state.base})">
      </div>
      <div class="row small" style="justify-content:space-between;margin:4px 0">
        <div>Est Total: <b id="estTotal">—</b></div>
        <div>Fee (0.1%): <b id="estFee">—</b></div>
      </div>
      <div class="row" style="gap:8px;margin:8px 0">
        <button id="submit" class="btn" style="flex:1">Place Order</button>
        <div id="msg" class="small"></div>
      </div>
      <h3 style="margin-top:14px">Open Orders</h3><div id="openTbl" class="small"></div>
      <h3 style="margin-top:14px">Recent Fills</h3><div id="fillsTbl" class="small"></div>
    `;

    let side = 'BUY';
    const sideTabs = tradePanel.querySelector('#sideTabs');
    const ordType  = tradePanel.querySelector('#ordType');
    const priceIn  = tradePanel.querySelector('#priceIn');
    const qtyIn    = tradePanel.querySelector('#qtyIn');
    const est      = tradePanel.querySelector('#estTotal');
    const fee      = tradePanel.querySelector('#estFee');
    const msg      = tradePanel.querySelector('#msg');

    sideTabs.addEventListener('click',e=>{
      const el=e.target.closest('[data-side]'); if(!el) return;
      side = el.getAttribute('data-side');
      sideTabs.querySelectorAll('.pill').forEach(p=>p.classList.toggle('active', p===el));
      updateTotals(); paintOpen(); paintFills();
    });

    ordType.onchange = () => {
      priceIn.disabled = (ordType.value === 'market');
      if (ordType.value === 'market') priceIn.value = '';
      updateTotals();
    };

    [priceIn, qtyIn].forEach(el => el.addEventListener('input', updateTotals));

    function updateTotals(){
      const px = (ordType.value==='market') ? lastPrice() : +priceIn.value;
      const q  = +qtyIn.value;
      if(!px || !q){ est.textContent='—'; fee.textContent='—'; return; }
      const total = q * px;
      est.textContent = '$ ' + total.toLocaleString(undefined,{maximumFractionDigits:2});
      fee.textContent = '$ ' + (total * FEE_RATE).toLocaleString(undefined,{maximumFractionDigits:2});

      const me=AUTH.me?.(), bb=(me&&me.balances)||{};
      const mini=tradePanel.querySelector('#miniBal');
      if(mini) mini.textContent='USDT: '+fmt(bb.USDT||0)+' · '+state.base+': '+fmt(bb[state.base]||0);
    }
    updateTotalsRef = updateTotals;

    tradePanel.querySelector('#submit').onclick = function(){
      msg.textContent='';
      const me=AUTH.me?.(); if(!me){ msg.textContent='Sign in first'; return; }
      const q=+qtyIn.value; if(!q || q<=0){ msg.textContent='Enter amount'; return; }

      let result;
      if (ordType.value === 'market'){
        const px = lastPrice(); if(!px){ msg.textContent='No price'; return; }
        result = placeMarket(me.email, state.base, side, q, px);
      } else {
        const pxL = +priceIn.value; if(!pxL || pxL<=0){ msg.textContent='Enter price'; return; }
        result = placeLimit(me.email, state.base, side, q, pxL);
      }
      if (result.status==='rejected'){
        msg.textContent = 'Rejected: ' + (result.reason || 'insufficient');
      } else {
        msg.textContent = (result.status==='filled' ? 'Filled' : 'Placed') + ' ✓';
        qtyIn.value=''; priceIn.value='';
        updateTotals(); paintOpen(); paintFills();
      }
    };

    function paintOpen(){
      const email = (AUTH.me?.() && AUTH.me().email) || '';
      const all = ordersAll().filter(o=>o.email===email && o.status==='open' && o.base===state.base);
      const t = tradePanel.querySelector('#openTbl'); if(!t) return;
      if(!all.length){ t.innerHTML='<div class="badge small">No open orders</div>'; return; }
      const rows = all.map(o=>`
        <tr>
          <td>${o.type.toUpperCase()}</td>
          <td>${o.side}</td>
          <td>${o.qty}</td>
          <td>${o.type==='limit'?o.price:'—'}</td>
          <td>${new Date(o.ts).toLocaleTimeString()}</td>
          <td><button class="btn" data-cancel="${o.id}">Cancel</button></td>
        </tr>`).join('');
      t.innerHTML = `<table class="table"><thead><tr><th>Type</th><th>Side</th><th>Qty</th><th>Price</th><th>Time</th><th></th></tr></thead><tbody>${rows}</tbody></table>`;
      t.querySelectorAll('[data-cancel]').forEach(btn=>{
        btn.onclick = () => { cancelOrder(btn.getAttribute('data-cancel'), (AUTH.me?.() && AUTH.me().email)||''); paintOpen(); };
      });
    }

    function paintFills(){
      const email = (AUTH.me?.() && AUTH.me().email) || '';
      const all = ordersAll().filter(o=>o.email===email && o.status==='filled' && o.base===state.base).slice(0,10);
      const t = tradePanel.querySelector('#fillsTbl'); if(!t) return;
      if(!all.length){ t.innerHTML='<div class="badge small">No fills yet</div>'; return; }
      const rows = all.map(o=>`
        <tr>
          <td>${o.type.toUpperCase()}</td>
          <td>${o.side}</td>
          <td>${o.qty}</td>
          <td>${o.avgPrice.toFixed(6)}</td>
          <td>${new Date(o.fillTs||o.ts).toLocaleTimeString()}</td>
        </tr>`).join('');
      t.innerHTML = `<table class="table"><thead><tr><th>Type</th><th>Side</th><th>Qty</th><th>Avg Price</th><th>Time</th></tr></thead><tbody>${rows}</tbody></table>`;
    }

    paintOpen(); paintFills(); updateTotals();
  }

  refresh();

  PriceFeed.on(function(sym, price){
    matchOpenOrders(sym, price);
    if(sym === state.base){
      chart.pushLive(price);
      const b = card.querySelector('#px');
      if (b) b.textContent = state.base+'USDT · Price: '+fmt(price);
      try{ updateTotalsRef(); }catch{}
    }
  });

  card.querySelector('#tfs').addEventListener('click',(e)=>{
    const el = e.target.closest('[data-tf]'); if(!el) return;
    state.tf = el.getAttribute('data-tf');
    card.querySelectorAll('.pill').forEach(p=>p.classList.toggle('active', p===el));
    refresh();
  });
  sel.addEventListener('change',()=>{ state.base = sel.value; refresh(); });

  cb(wrap);
}
