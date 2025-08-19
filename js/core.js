// js/core.js

/* ---------- helpers & banner ---------- */
export function $(s, r){ return (r||document).querySelector(s); }
export function showBanner(msg){
  try{ const b=$('#banner'); if(b){ b.textContent=msg; b.style.display='block'; } }catch(e){}
}

/* ---------- config/auth (localStorage demo) ---------- */
export const CONFIG = {
  key:'nl.config',
  load(){
    try{
      const o = JSON.parse(localStorage.getItem(this.key)||'{}')||{};
      if(typeof o.samUsd!=='number') o.samUsd=0.01;
      return o;
    }catch(e){ return {samUsd:0.01}; }
  }
};

const UKEY='nl.users', SKEY='nl.session';
export const AUTH = {
  storageKey:UKEY, sessionKey:SKEY,
  async hash(s){
    try{
      if(crypto && crypto.subtle){
        const e=new TextEncoder().encode(s);
        const b=await crypto.subtle.digest('SHA-256',e);
        return Array.from(new Uint8Array(b)).map(x=>x.toString(16).padStart(2,'0')).join('');
      }
    }catch(e){}
    try{ return btoa(unescape(encodeURIComponent(s))).split('').reverse().join(''); }
    catch(e){ return s; }
  },
  ensureShape(u){ if(!u)u={}; if(!u.role)u.role='user'; if(!u.status)u.status='active';
    if(!u.balances)u.balances={ETH:0,BTC:0,USDT:0,SAM:0}; if(!u.ledger)u.ledger=[]; return u; },
  users(){ try{ let a=JSON.parse(localStorage.getItem(UKEY)||'[]'); if(!Array.isArray(a)) a=[]; return a.map(this.ensureShape); }catch(e){ return []; } },
  save(a){ localStorage.setItem(UKEY, JSON.stringify(a)); },
  me(){ try{ const s=JSON.parse(localStorage.getItem(SKEY)||'null')||{}; const email=s.email||''; return this.users().find(u=>u.email===email)||null; }catch(e){ return null; } },
  async signup(email, pass){
    const h = await this.hash(pass);
    const a=this.users(); if(a.some(u=>u.email===email)) return {error:'exists'};
    a.unshift(this.ensureShape({email,passHash:h,createdAt:new Date().toISOString()}));
    this.save(a); localStorage.setItem(SKEY, JSON.stringify({email})); return {ok:true};
  },
  async signin(email, pass){
    const h=await this.hash(pass); const a=this.users(); const u=a.find(x=>x.email===email);
    if(!u) return {error:'no'}; if(u.status==='locked') return {error:'locked'};
    if(u.passHash!==h) return {error:'bad'}; localStorage.setItem(SKEY, JSON.stringify({email})); return {ok:true};
  },
  signout(){ localStorage.removeItem(SKEY); }
};

/* ---------- coins + http helpers ---------- */
export const COINS=['BTC','ETH','BNB','SOL','XRP','SAM','DOGE','ADA','TRX','TON','DOT','AVAX','LINK','LTC','BCH','MATIC','ATOM','XLM','UNI','APT','NEAR','ARB','OP','SUI','PEPE','SHIB','FIL','AAVE','ICP','ETC'];
export const BINANCE_BASE='https://api.binance.com';
const WS_BASE='wss://stream.binance.com:9443/stream?streams=';

export function fmt(n){
  try{
    if(n>=1000) return n.toLocaleString(undefined,{maximumFractionDigits:2});
    if(n>=1)    return n.toLocaleString(undefined,{maximumFractionDigits:4});
    return n.toLocaleString(undefined,{maximumFractionDigits:8});
  }catch(e){ return String(n); }
}

export function xhrJSON(url, timeoutMs, cb){
  try{
    let done=false; const t=setTimeout(()=>{ if(done) return; done=true; try{cb(null);}catch(e){} }, timeoutMs||8000);
    const x=new XMLHttpRequest();
    x.onreadystatechange=function(){
      try{
        if(x.readyState===4){
          if(done) return; done=true; clearTimeout(t);
          if((x.status>=200&&x.status<300)||x.status===0) { try{ cb(JSON.parse(x.responseText)); }catch(e){ cb(null); } }
          else cb(null);
        }
      }catch(e){ try{cb(null);}catch(_e){} }
    };
    x.open('GET', url, true); x.send();
  }catch(e){ try{cb(null);}catch(_e){} }
}

function fallbackTickers(){
  return {BTC:{price:68000,change:0.5},ETH:{price:3500,change:-0.8},BNB:{price:600,change:1.2},SOL:{price:160,change:3.1},XRP:{price:0.6,change:-2.2},
    DOGE:{price:0.12,change:1.1},ADA:{price:0.45,change:-1.5},TRX:{price:0.12,change:0.3},TON:{price:7.2,change:0.4},DOT:{price:6.1,change:-1.1},
    AVAX:{price:32,change:2.3},LINK:{price:19,change:-0.6},LTC:{price:84,change:0.2},BCH:{price:460,change:-0.4},MATIC:{price:0.78,change:0.9},
    ATOM:{price:8.1,change:-0.2},XLM:{price:0.12,change:0.1},UNI:{price:9.2,change:-0.9},APT:{price:8.9,change:1.0},NEAR:{price:5.0,change:-0.4},
    ARB:{price:1.2,change:0.6},OP:{price:1.9,change:-0.3},SUI:{price:1.6,change:1.1},PEPE:{price:0.000012,change:4.2},SHIB:{price:0.00002,change:-0.7},
    FIL:{price:5.3,change:0.4},AAVE:{price:102,change:-1.1},ICP:{price:10.5,change:0.7},ETC:{price:23,change:-0.5}};
}

/* ---------- live price feed (incl. 24h stats) ---------- */
export const PriceFeed = {
  map:{},              // last price + change%
  t24:{},              // 24h high/low/volume
  listeners:[],
  ws:null, pollId:null, samTimer:null,

  on(fn){ this.listeners.push(fn); },
  emit(sym,price){ this.listeners.forEach(fn=>{ try{fn(sym,price);}catch(e){} }); },

  refresh24h(){
    xhrJSON(BINANCE_BASE+'/api/v3/ticker/24hr',8000,(arr)=>{
      if(!Array.isArray(arr)) return;
      const t24={};
      for(const r of arr){
        const s=r.symbol||'';
        if(s.endsWith('USDT')){
          const base=s.replace('USDT','');
          if(COINS.includes(base)){
            t24[base]={ high:+r.highPrice, low:+r.lowPrice, vol:+r.volume };
            // seed price if missing
            this.map[base] ||= { price:+r.lastPrice, change:+r.priceChangePercent };
          }
        }
      }
      this.t24=t24;
    });
  },

  start(){
    xhrJSON(BINANCE_BASE+'/api/v3/ticker/24hr',8000,(arr)=>{
      let seeded=false;
      if(Array.isArray(arr)){
        for(const r of arr){
          const s=r.symbol||'';
          if(s.endsWith('USDT')){
            const base=s.replace('USDT','');
            if(COINS.includes(base)){
              this.map[base]={price:+r.lastPrice,change:+r.priceChangePercent};
              this.t24[base]={high:+r.highPrice,low:+r.lowPrice,vol:+r.volume};
              seeded=true;
            }
          }
        }
      }
      if(!seeded){ this.map=fallbackTickers(); showBanner('Using demo prices (network limited).'); }

      // make SAM feel live
      const base=+(CONFIG.load().samUsd||0.01);
      this.map.SAM=this.map.SAM||{price:base,change:0};
      if(!this.samTimer){
        this.samTimer=setInterval(()=>{
          const p=this.map.SAM.price||base;
          const np=+(p*(1+(Math.random()-0.5)*0.004)).toFixed(6);
          this.map.SAM.price=np; this.map.SAM.change=+(((np-base)/(base||1))*100).toFixed(2);
          this.emit('SAM',np);
        },1000);
      }

      try{
        const streams=COINS.map(c=>(c+'USDT').toLowerCase()+'@miniTicker');
        this.ws=new WebSocket(WS_BASE+streams.join('/'));
        this.ws.onmessage=(ev)=>{
          try{
            const m=JSON.parse(ev.data), d=m.data||{}, s=d.s||'';
            if(s && s.endsWith('USDT')){
              const base=s.replace('USDT',''), price=parseFloat(d.c||d.p||d.l||d.h||0);
              if(price>0){ this.map[base]=this.map[base]||{price,change:0}; this.map[base].price=price; this.emit(base,price); }
            }
          }catch(e){}
        };
        this.ws.onerror=()=>this.fallbackPoll();
        this.ws.onclose =()=>this.fallbackPoll();
      }catch(e){ this.fallbackPoll(); }

      this.refresh24h();
      setInterval(()=>this.refresh24h(), 15000);
    });
  },

  fallbackPoll(){
    if(this.pollId) return;
    this.pollId=setInterval(()=>{
      xhrJSON(BINANCE_BASE+'/api/v3/ticker/price',7000,(arr)=>{
        if(Array.isArray(arr)){
          for(const r of arr){
            const s=r.symbol||'';
            if(s.endsWith('USDT')){
              const base=s.replace('USDT',''), p=parseFloat(r.price);
              if(p>0){ this.map[base]=this.map[base]||{price:p,change:0}; this.map[base].price=p; this.emit(base,p); }
            }
          }
        }
      });
      this.refresh24h();
    },1000);
  }
};

/* ---------- CandleChart (zoom + pan + axes + crosshair) ---------- */
export class CandleChart {
  constructor(canvas){
    this.c   = canvas;
    this.ctx = canvas.getContext('2d');
    this.data = [];
    this.view = { from: 0, to: 0 };
    this.tf   = '1m';

    this._mouse = null;                             // crosshair
    this.drag   = { active:false, startX:0, startFrom:0, startTo:0 };

    this._bindEvents();
    addEventListener('resize', () => this.resize());
    if (window.ResizeObserver) new ResizeObserver(() => this.resize()).observe(this.c.parentElement || this.c);

    this.resize();
  }

  _stepMs(){
    return { '1m':60000,'5m':300000,'1h':3600000,'1d':86400000,'1w':604800000,'1M':2592000000 }[this.tf] || 60000;
  }
  _fmtPrice(n){ try{
    if(n>=1000) return n.toLocaleString(undefined,{maximumFractionDigits:2});
    if(n>=1)    return n.toLocaleString(undefined,{maximumFractionDigits:4});
    return n.toLocaleString(undefined,{maximumFractionDigits:8});
  }catch(e){ return String(n);} }
  _chartBox(){ const W=this.c.clientWidth,H=this.c.clientHeight; return {x:40,y:10,w:W-80,h:H-40}; }
  _yAtPrice(p, min, max, plotH){ const pad=8; return pad+(1-(p-min)/(max-min||1))*(plotH-2*pad); }

  _bindEvents(){
    this._onWheel=(e)=>{
      e.preventDefault();
      if(!this.data.length) return;
      const box=this._chartBox();
      const span=Math.max(1,this.view.to-this.view.from+1);
      const cursorRel=(e.offsetX-box.x)/Math.max(1,box.w);
      const center=this.view.from+cursorRel*span;
      const factor=e.deltaY>0?1.12:1/1.12;
      let newSpan=Math.max(20,Math.min(400,Math.round(span*factor)));
      let from=Math.round(center-cursorRel*newSpan);
      let to=from+newSpan-1;
      if(from<0){ to-=from; from=0; }
      if(to>this.data.length-1){ from-=to-(this.data.length-1); to=this.data.length-1; }
      from=Math.max(0,from);
      this.view.from=from; this.view.to=Math.max(from,to); this.draw();
    };

    this._onDown=(e)=>{
      this.c.setPointerCapture?.(e.pointerId);
      this.drag.active=true; this.drag.startX=e.clientX;
      this.drag.startFrom=this.view.from; this.drag.startTo=this.view.to;
      const r=this.c.getBoundingClientRect();
      this._mouse={x:e.clientX-r.left,y:e.clientY-r.top}; // show crosshair immediately
      this.draw();
    };

    this._onMove=(e)=>{
      const r=this.c.getBoundingClientRect();
      const x=e.clientX-r.left, y=e.clientY-r.top;
      if(this.drag.active){
        const box=this._chartBox(); const span=Math.max(1,this.view.to-this.view.from+1);
        const pxPerCandle=box.w/span;
        const dx=e.clientX-this.drag.startX;
        let shift=Math.round(-dx/Math.max(1,pxPerCandle));
        let from=this.drag.startFrom+shift;
        let to=this.drag.startTo+shift;
        if(from<0){ to-=from; from=0; }
        if(to>this.data.length-1){ from-=to-(this.data.length-1); to=this.data.length-1; }
        from=Math.max(0,from);
        this.view.from=from; this.view.to=Math.max(from,to); this.draw();
      }else{
        this._mouse={x,y}; this.draw();
      }
    };

    this._onUp   = ()=>{ this.drag.active=false; };
    this._onLeave= ()=>{ this._mouse=null; this.drag.active=false; this.draw(); };

    this.c.addEventListener('wheel', this._onWheel, {passive:false});
    this.c.addEventListener('pointerdown', this._onDown);
    window.addEventListener('pointermove', this._onMove);
    window.addEventListener('pointerup',   this._onUp);
    this.c.addEventListener('pointerleave', this._onLeave);
  }

  resize(){
    const dpr=window.devicePixelRatio||1;
    this.c.width=this.c.clientWidth*dpr;
    this.c.height=this.c.clientHeight*dpr;
    this.ctx.setTransform(dpr,0,0,dpr,0,0);
    this.draw();
  }

  setData(rows, tf){
    this.data=rows||[];
    this.tf=tf||this.tf;
    this.view.to=Math.max(0,this.data.length-1);
    this.view.from=Math.max(0,this.view.to-150);
    this.draw();
  }

  pushLive(price){
    if(!this.data.length) return;
    const step=this._stepMs();
    const slot=Math.floor(Date.now()/step)*step;
    const k=this.data[this.data.length-1];
    if(k.t<slot-1){
      const open=k.c, close=price;
      const h=Math.max(open,close), l=Math.min(open,close);
      this.data.push({t:slot,o:open,h,l,c:close});
      if(this.data.length>500) this.data.shift();
      const span=Math.max(1,this.view.to-this.view.from+1);
      this.view.to=this.data.length-1;
      this.view.from=Math.max(0,this.view.to-span+1);
    }else{
      if(price>k.h) k.h=price;
      if(price<k.l) k.l=price;
      k.c=price;
    }
    this.draw();
  }

  _drawLastPriceLine(min,max,plotH,box){
    const last=this.data[this.view.to]; if(!last) return;
    const prevClose=(this.data[this.view.to-1]&&this.data[this.view.to-1].c) ?? last.o;
    const isUp=last.c>=prevClose;
    const yLast=this._yAtPrice(last.c,min,max,plotH);
    const ctx=this.ctx;
    ctx.save();
    ctx.strokeStyle=isUp?'#18c964':'#ff4d4f';
    ctx.setLineDash([6,4]);
    ctx.beginPath(); ctx.moveTo(box.x,yLast); ctx.lineTo(box.x+box.w,yLast); ctx.stroke();
    ctx.setLineDash([]);
    const txt=this._fmtPrice(last.c);
    ctx.font='12px system-ui,-apple-system,Segoe UI,Roboto,sans-serif';
    const pw=ctx.measureText(txt).width+10, ph=16, labelX=Math.floor(box.x+box.w+6);
    ctx.fillStyle=isUp?'rgba(24,201,100,0.12)':'rgba(255,77,79,0.12)';
    ctx.strokeStyle=isUp?'#18c964':'#ff4d4f';
    ctx.fillRect(labelX,yLast-ph/2,pw,ph); ctx.strokeRect(labelX,yLast-ph/2,pw,ph);
    ctx.fillStyle='#e8eefc'; ctx.textAlign='left'; ctx.textBaseline='middle'; ctx.fillText(txt,labelX+4,yLast);
    ctx.restore();
  }

  draw(){
    const ctx=this.ctx, box=this._chartBox();
    const W=this.c.clientWidth, H=this.c.clientHeight;

    ctx.clearRect(0,0,W,H);
    ctx.fillStyle='#0b0f1a'; ctx.fillRect(0,0,W,H);

    if(!this.data.length) return;

    const from=this.view.from, to=this.view.to;
    const span=Math.max(1,to-from+1);

    let min=Infinity, max=-Infinity;
    for(let i=from;i<=to;i++){ const k=this.data[i]; if(!k) continue; if(k.l<min) min=k.l; if(k.h>max) max=k.h; }
    const pad=8;
    const yOf=(p)=>pad+(1-(p-min)/(max-min||1))*(box.h-2*pad);

    // price grid + labels
    ctx.save();
    ctx.strokeStyle='rgba(32,208,255,0.08)';
    ctx.fillStyle='#a9b3d1';
    ctx.font='11px system-ui,-apple-system,Segoe UI,Roboto,sans-serif';
    ctx.textAlign='left'; ctx.textBaseline='middle';
    const rows=4;
    for(let i=0;i<=rows;i++){
      const v=min+(i/rows)*(max-min), y=yOf(v);
      ctx.beginPath(); ctx.moveTo(box.x,y); ctx.lineTo(box.x+box.w,y); ctx.stroke();
      ctx.fillText(this._fmtPrice(v), box.x+box.w+8, y);
    }
    ctx.restore();

    // candles
    const cw=Math.max(3,Math.min(22,Math.floor(box.w/span*0.7)));
    for(let i=from;i<=to;i++){
      const k=this.data[i]; if(!k) continue;
      const x=Math.floor(box.x+(i-from+0.5)*(box.w/span));
      const yO=yOf(k.o), yC=yOf(k.c), yH=yOf(k.h), yL=yOf(k.l);
      const up=k.c>=k.o;
      ctx.strokeStyle=up?'#18c964':'#ff4d4f';
      ctx.beginPath(); ctx.moveTo(x,yH); ctx.lineTo(x,yL); ctx.stroke();
      const top=Math.min(yO,yC), h=Math.max(1,Math.abs(yC-yO));
      ctx.fillStyle=up?'#18c964':'#ff4d4f';
      ctx.fillRect(x-cw/2,top,cw,h);
      ctx.strokeStyle=up?'#139f55':'#cc3a3c';
      ctx.strokeRect(Math.round(x-cw/2)+0.5,Math.round(top)+0.5,Math.max(1,cw-1),Math.max(1,h-1));
    }

    // time labels
    ctx.save();
    ctx.fillStyle='#a9b3d1';
    ctx.font='11px system-ui,-apple-system,Segoe UI,Roboto,sans-serif';
    ctx.textAlign='center'; ctx.textBaseline='top';
    const step=Math.max(1,Math.floor(span/8));
    for(let i=from;i<=to;i+=step){
      const k=this.data[i]; if(!k) continue;
      const x=Math.floor(box.x+(i-from+0.5)*(box.w/span));
      const ts=k.t||0;
      const label=(this.tf==='1d'||this.tf==='1w'||this.tf==='1M')
        ? new Date(ts).toLocaleDateString(undefined,{month:'short',day:'numeric'})
        : new Date(ts).toLocaleTimeString(undefined,{hour:'2-digit',minute:'2-digit'});
      ctx.fillText(label, x, box.y+box.h+6);
    }
    ctx.restore();

    this._drawLastPriceLine(min,max,box.h,box);

    // crosshair
    if(this._mouse){
      const mx=this._mouse.x,my=this._mouse.y;
      if(mx>=box.x && mx<=box.x+box.w && my>=box.y && my<=box.y+box.h){
        ctx.save();
        ctx.strokeStyle='rgba(32,208,255,0.25)';
        ctx.beginPath(); ctx.moveTo(mx,box.y); ctx.lineTo(mx,box.y+box.h);
        ctx.moveTo(box.x,my); ctx.lineTo(box.x+box.w,my); ctx.stroke();
        ctx.restore();
      }
    }
  }
}

export default CandleChart;

/* ---------- klines (REST + SAM random walk fallback) ---------- */
function _rndWalk(start,n,vol){
  const out=[]; let p=start;
  for(let i=n;i>0;i--){
    const c=+(p*(1+(Math.random()-0.5)*vol)).toFixed(6);
    const h=+(Math.max(p,c)*(1+Math.random()*vol*0.3)).toFixed(6);
    const l=+(Math.min(p,c)*(1-Math.random()*vol*0.3)).toFixed(6);
    out.push({o:+(+p).toFixed(6),h,l,c}); p=c;
  }
  return out;
}
function _volWalk(tf){
  if(tf==='1d') return 0.06;
  if(tf==='1h') return 0.012;
  if(tf==='1w'||tf==='1M') return 0.08;
  return 0.006;
}
function _volWalkFallback(tf){
  if(tf==='1d') return 0.02;
  if(tf==='1h') return 0.01;
  if(tf==='1w'||tf==='1M') return 0.08;
  return 0.006;
}

export function loadKlines(base, tf, cb){
  const stepMap={'1m':60000,'5m':300000,'1h':3600000,'1d':86400000,'1w':604800000,'1M':2592000000};
  const step=stepMap[tf||'1m']||60000;

  if(base==='SAM'){
    const p0=(CONFIG.load().samUsd||0.01);
    const n=500;
    const rows=_rndWalk(p0,n,_volWalk(tf));
    const now=Date.now();
    for(let i=0;i<rows.length;i++) rows[i].t=now-(n-i)*step;
    return cb(rows);
  }

  xhrJSON(BINANCE_BASE+'/api/v3/klines?symbol='+base+'USDT&interval='+(tf||'1m')+'&limit=500',8000,(arr)=>{
    if(Array.isArray(arr)&&arr.length){
      const out=[]; for(const r of arr){ out.push({t:+r[0],o:+(+r[1]).toFixed(6),h:+(+r[2]).toFixed(6),l:+(+r[3]).toFixed(6),c:+(+r[4]).toFixed(6)}); }
      cb(out);
    }else{
      const start=(PriceFeed.map[base]&&PriceFeed.map[base].price)||100;
      const n=500, rows=_rndWalk(start,n,_volWalkFallback(tf)), now=Date.now();
      for(let j=0;j<rows.length;j++) rows[j].t=now-(n-j)*step;
      cb(rows);
    }
  });
}

/* ---------- tiny trading engine (demo) ---------- */
export const FEE_RATE = 0.001;
const ORD_KEY='nl.orders';
export function ordersAll(){ try{ const a=JSON.parse(localStorage.getItem(ORD_KEY)||'[]'); return Array.isArray(a)?a:[]; }catch(e){ return []; } }
function saveOrders(a){ localStorage.setItem(ORD_KEY, JSON.stringify(a)); }
function userByEmail(email){ return AUTH.users().find(u=>u.email===email); }
function saveUser(u){ const a=AUTH.users(); const i=a.findIndex(x=>x.email===u.email); if(i>=0) a[i]=u; localStorage.setItem(UKEY, JSON.stringify(a)); }

export function placeMarket(email, base, side, qty, px){
  const u=userByEmail(email); if(!u) return {status:'rejected', reason:'no user'};
  u.balances=u.balances||{BTC:0,ETH:0,USDT:0,SAM:0};
  const cost=qty*px, fee=cost*FEE_RATE;
  if(side==='BUY'){
    if((u.balances.USDT||0) < cost+fee) return {status:'rejected', reason:'insufficient USDT'};
    u.balances.USDT -= (cost+fee); u.balances[base]=(u.balances[base]||0)+qty;
  }else{
    if((u.balances[base]||0) < qty) return {status:'rejected', reason:'insufficient '+base};
    u.balances[base] -= qty; u.balances.USDT += (cost-fee);
  }
  saveUser(u);
  const a=ordersAll(); a.unshift({id:'mkt-'+Date.now(), email, base, side, type:'market', qty, avgPrice:px, status:'filled', ts:Date.now(), fillTs:Date.now()}); saveOrders(a);
  return {status:'filled'};
}
export function placeLimit(email, base, side, qty, price){
  const u=userByEmail(email); if(!u) return {status:'rejected', reason:'no user'};
  u.balances=u.balances||{BTC:0,ETH:0,USDT:0,SAM:0};
  const cost=qty*price, fee=cost*FEE_RATE;
  if(side==='BUY'){
    if((u.balances.USDT||0) < cost+fee) return {status:'rejected', reason:'insufficient USDT'};
    u.balances.USDT -= (cost+fee);  // reserve
  }else{
    if((u.balances[base]||0) < qty) return {status:'rejected', reason:'insufficient '+base};
    u.balances[base] -= qty;        // reserve
  }
  saveUser(u);
  const a=ordersAll(); const id='lim-'+Date.now();
  a.unshift({id,email,base,side,type:'limit',qty,price,status:'open',ts:Date.now()}); saveOrders(a);
  return {status:'open', id};
}
export function cancelOrder(id, email){
  const a=ordersAll(); const i=a.findIndex(o=>o.id===id && o.email===email && o.status==='open'); if(i<0) return;
  const o=a[i]; const u=userByEmail(email); if(!u) return;
  const cost=o.qty*o.price, fee=cost*FEE_RATE;
  if(o.side==='BUY') u.balances.USDT += (cost+fee); else u.balances[o.base]=(u.balances[o.base]||0)+o.qty;
  saveUser(u);
  a.splice(i,1); saveOrders(a);
}
export function matchOpenOrders(sym, price){
  const a=ordersAll(); let changed=false;
  for(const o of a){
    if(o.status!=='open' || o.base!==sym) continue;
    if((o.side==='BUY'  && price<=o.price) || (o.side==='SELL' && price>=o.price)){
      const u=userByEmail(o.email); if(!u) continue;
      const cost=o.qty*price, fee=cost*FEE_RATE;
      if(o.side==='BUY'){ u.balances[o.base]=(u.balances[o.base]||0)+o.qty; }
      else{ u.balances.USDT += (cost-fee); }
      saveUser(u);
      o.status='filled'; o.avgPrice=price; o.fillTs=Date.now(); changed=true;
    }
  }
  if(changed) saveOrders(a);
}
