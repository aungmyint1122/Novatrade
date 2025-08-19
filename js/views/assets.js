// js/views/assets.js
import { AUTH, CONFIG, PriceFeed } from '../core.js';

export default function AssetsView(cb){
  const view = document.createElement('div');
  view.className = 'grid';
  view.id = 'assets';

  const me = AUTH.me?.();
  const sec = document.createElement('section');
  sec.className = 'card';

  if (!me){
    sec.innerHTML = '<h3>Assets</h3><div class="badge small">Sign in</div>';
    view.appendChild(sec); cb(view); return;
  }

  /* ============ helpers ============ */
  const usd = n => '$' + Number(n||0).toLocaleString(undefined,{maximumFractionDigits:2});

  // Use live feed where possible (includes SAM drift), fallback to config
  function prices(){
    const cfg = CONFIG.load();
    const samFromFeed = PriceFeed?.map?.SAM?.price;
    return {
      BTC: (PriceFeed.map.BTC && PriceFeed.map.BTC.price) || 0,
      ETH: (PriceFeed.map.ETH && PriceFeed.map.ETH.price) || 0,
      USDT: 1,
      // ⬇️ key change: prefer drifted feed price for SAM
      SAM: (typeof samFromFeed === 'number' && samFromFeed > 0)
            ? samFromFeed
            : (cfg.samUsd || 0.01)
    };
  }

  function users(){ try{ return JSON.parse(localStorage.getItem('nl.users')||'[]')||[]; }catch(e){ return []; } }
  function saveUsers(a){ localStorage.setItem('nl.users', JSON.stringify(a)); }

  function deposits(){ try{ return JSON.parse(localStorage.getItem('nl.deposits')||'[]')||[]; }catch(e){ return []; } }
  function saveDeposits(a){ localStorage.setItem('nl.deposits', JSON.stringify(a)); }

  function withdrawals(){ try{ return JSON.parse(localStorage.getItem('nl.withdrawals')||'[]')||[]; }catch(e){ return []; } }
  function saveWithdrawals(a){ localStorage.setItem('nl.withdrawals', JSON.stringify(a)); }

  // optional: add to user ledger for history
  function pushLedger(entry){
    try{
      const all = users();
      const i = all.findIndex(u => u.email === me.email);
      if (i >= 0){
        all[i].ledger = all[i].ledger || [];
        all[i].ledger.unshift(entry);
        saveUsers(all);
      }
    }catch(e){}
  }

  /* ============ assets summary ============ */
  function paint(){
    const px = prices();
    const b = Object.assign({BTC:0,ETH:0,USDT:0,SAM:0}, me.balances||{});
    const total = (b.BTC||0)*px.BTC + (b.ETH||0)*px.ETH + (b.USDT||0)*1 + (b.SAM||0)*px.SAM;

    sec.innerHTML = `
      <h3>Assets</h3>
      <div class="row">
        <div class="badge"><b>Total Value :</b> ${usd(total)}</div>
      </div>
      <table class="table">
        <thead><tr><th>Asset</th><th>Balance</th><th>USD</th></tr></thead>
        <tbody>
          <tr><td>BTC</td><td>${(b.BTC||0).toFixed(6)}</td><td>${usd((b.BTC||0)*px.BTC)}</td></tr>
          <tr><td>ETH</td><td>${(b.ETH||0).toFixed(6)}</td><td>${usd((b.ETH||0)*px.ETH)}</td></tr>
          <tr><td>USDT</td><td>${(b.USDT||0).toFixed(2)}</td><td>${usd((b.USDT||0)*1)}</td></tr>
          <tr><td>SAM</td><td>${(b.SAM||0).toFixed(2)}</td><td>${usd((b.SAM||0)*px.SAM)}</td></tr>
        </tbody>
      </table>
    `;
  }
  paint();
  PriceFeed.on(paint);           // refresh when feed (incl. drift) updates
  view.appendChild(sec);

  /* ============ Transfer (accordion) ============ */
  const transfer = document.createElement('section');
  transfer.className = 'card transfer';
  transfer.innerHTML = `
    <h3>Transfer</h3>
    <div class="row" style="gap:10px;margin-bottom:12px">
      <button id="btnDeposit"  type="button" class="pill">Deposit</button>
      <button id="btnWithdraw" type="button" class="pill">Withdraw</button>
    </div>

    <!-- Deposit -->
    <div id="depositBox" class="transferBox" style="display:none">
      <h4>Deposit (Admin approval required)</h4>
      <div class="row" style="gap:8px">
        <select id="depAsset" class="sel"><option>BTC</option><option>ETH</option><option>USDT</option></select>
        <input id="depAmt" class="input" type="number" step="0.00000001" placeholder="Amount" style="max-width:220px"/>
        <button id="depSubmit" class="btn primary" type="button">Submit</button>
      </div>
      <div class="row small" style="margin-top:8px"><div class="badge">ERC-20 for ETH · TRC20 for USDT</div></div>
      <div class="row" id="addrBox" style="margin-top:8px"></div>
      <div id="depMsg" class="small" style="margin-top:8px"></div>
    </div>

    <!-- Withdraw -->
    <div id="withdrawBox" class="transferBox" style="display:none">
      <h4>Withdraw (Admin approval required)</h4>
      <div class="row" style="gap:8px;margin-bottom:8px">
        <select id="wAsset" class="sel"><option>BTC</option><option>ETH</option><option>USDT</option><option>SAM</option></select>
        <select id="wNet" class="sel">
          <option value="BTC">BTC</option>
          <option value="ERC20">ERC-20</option>
          <option value="TRC20">TRC20</option>
          <option value="INTERNAL">INTERNAL</option>
        </select>
      </div>
      <div class="row" style="gap:8px;margin-bottom:8px">
        <input id="wAddr" class="input" placeholder="Destination address"/>
        <input id="wAmt"  class="input" type="number" step="0.00000001" placeholder="Amount" style="max-width:220px"/>
      </div>
      <div class="row small" style="justify-content:space-between">
        <div>Fee (est.): <b id="wFee">$0.00</b></div>
        <div>Will receive (est.): <b id="wRecv">$0.00</b></div>
      </div>
      <div class="row" style="gap:8px;margin-top:8px">
        <button id="wSubmit" class="btn primary" type="button">Submit</button>
        <div id="wMsg" class="small"></div>
      </div>
    </div>
  `;
  view.appendChild(transfer);

  // accordion toggles
  const btnDep = transfer.querySelector('#btnDeposit');
  const btnWdr = transfer.querySelector('#btnWithdraw');
  const boxDep = transfer.querySelector('#depositBox');
  const boxWdr = transfer.querySelector('#withdrawBox');
  btnDep.onclick = () => { boxDep.style.display = (boxDep.style.display==='none')?'block':'none'; boxWdr.style.display='none'; };
  btnWdr.onclick = () => { boxWdr.style.display = (boxWdr.style.display==='none')?'block':'none'; boxDep.style.display='none'; };

  // deposit addresses
  function addressFor(asset){
    if(asset==='BTC') return {addr:'1LyZHu2xzqYyzLesS7UYecXUTW6AGngBFR', net:'BTC'};
    if(asset==='ETH') return {addr:'0x1016a1ff1907e77afa6f4889f8796b4c3237252d', net:'ERC-20'};
    if(asset==='USDT') return {addr:'TBdEXqVLqdrdD2mtPGysRQRQj53PEMsT1o', net:'TRC20'};
    if(asset==='SAM') return {addr:'sam_demo_address_9XK2', net:'INTERNAL'};
    return {addr:'', net:''};
  }
  function renderAddr(){
    const asset = transfer.querySelector('#depAsset').value;
    const info  = addressFor(asset);
    const box   = transfer.querySelector('#addrBox');
    box.innerHTML = `
      <div class="badge"><b>Address</b> (${asset} <span class="small">/ Network: ${info.net}</span>):</div>
      <input class="input" value="${info.addr}" readonly style="min-width:380px"/>
      <button class="btn" id="copy" type="button">Copy</button>
    `;
    const btn = box.querySelector('#copy');
    btn.onclick = () => { try{ navigator.clipboard.writeText(info.addr); }catch{} btn.textContent='Copied ✓'; setTimeout(()=>btn.textContent='Copy',900); };
  }
  transfer.querySelector('#depAsset').onchange = renderAddr;
  renderAddr();

  /* ============ Submit: PENDING requests only ============ */

  // DEPOSIT → push to nl.deposits (admin-users.html lists & approves)
  transfer.querySelector('#depSubmit').onclick = function(){
    const asset = transfer.querySelector('#depAsset').value;
    const amt   = +transfer.querySelector('#depAmt').value;
    const msg   = transfer.querySelector('#depMsg');
    msg.textContent = '';
    if (!amt || amt <= 0){ msg.textContent = 'Enter a valid amount'; return; }

    const req = { ts: Date.now(), email: me.email, asset, amount: +amt, status: 'pending' };
    const list = deposits(); list.unshift(req); saveDeposits(list);

    // user ledger (optional)
    pushLedger({ ts: req.ts, type: 'deposit', asset, amount: +amt, status: 'pending' });

    transfer.querySelector('#depAmt').value = '';
    msg.textContent = 'Submitted ✓ Waiting for admin approval';
    setTimeout(()=>msg.textContent='', 1600);
  };

  // WITHDRAW → push to nl.withdrawals (no balance change)
  const FEE_RATE = 0.001; // 0.1% est.
  function updateWithdrawEst(){
    const asset = transfer.querySelector('#wAsset').value;
    const amt   = +transfer.querySelector('#wAmt').value || 0;
    const p = prices(); const px = p[asset] || 0;
    const feeUsd = amt*px*FEE_RATE, recvUsd = Math.max(0, amt*px-feeUsd);
    transfer.querySelector('#wFee').textContent  = usd(feeUsd);
    transfer.querySelector('#wRecv').textContent = usd(recvUsd);
  }
  transfer.querySelector('#wAsset').onchange = updateWithdrawEst;
  transfer.querySelector('#wAmt').addEventListener('input', updateWithdrawEst);
  updateWithdrawEst();

  transfer.querySelector('#wSubmit').onclick = function(){
    const asset = transfer.querySelector('#wAsset').value;
    const amt   = +transfer.querySelector('#wAmt').value;
    const addr  = (transfer.querySelector('#wAddr').value||'').trim();
    const net   = transfer.querySelector('#wNet').value;
    const msg   = transfer.querySelector('#wMsg');
    msg.textContent = '';

    if (!addr){ msg.textContent = 'Enter destination address'; return; }
    if (!amt || amt <= 0){ msg.textContent = 'Enter a valid amount'; return; }

    const req = { ts: Date.now(), email: me.email, asset, amount: +amt, address: addr, network: net, status: 'pending' };
    const list = withdrawals(); list.unshift(req); saveWithdrawals(list);

    pushLedger({ ts: req.ts, type: 'withdraw', asset, amount: +amt, address: addr, network: net, status: 'pending' });

    transfer.querySelector('#wAmt').value = '';
    msg.textContent = 'Submitted ✓ Waiting for admin approval';
    setTimeout(()=>msg.textContent='', 1600);
  };

  cb(view);
}
