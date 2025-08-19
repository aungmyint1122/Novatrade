// js/sam-drift.js
// Smooth daily drift overlay for SAM.
// Usage:
//   import { setSamPlan, enableSamDrift } from './sam-drift.js'
//   setSamPlan({ '2025-08-12': 29 });  // +29% over that day (local time)
//   enableSamDrift();

import { CONFIG, PriceFeed } from './core.js';

const LS_BASE_PREFIX = 'nl.sam.base.';   // per-day baseline storage
let PLAN = {};                           // e.g., { '2025-08-12': 29 }
let enabled = false;

// nice, gentle ease from 0->1 across the day
function easeCos01(t){                    // t in [0,1]
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  // half-cosine ease (ease-in-out)
  return 0.5 - 0.5 * Math.cos(Math.PI * t);
}

// yyyy-mm-dd (local)
function dayKey(d=new Date()){
  const y = d.getFullYear();
  const m = String(d.getMonth()+1).padStart(2,'0');
  const dd= String(d.getDate()).padStart(2,'0');
  return `${y}-${m}-${dd}`;
}

function startOfToday(){
  const d = new Date();
  d.setHours(0,0,0,0);
  return d;
}

function fractionOfDay(now=new Date()){
  const start = startOfToday().getTime();
  const end   = start + 24*60*60*1000;
  const t = (now.getTime() - start) / (end - start);
  return Math.min(1, Math.max(0, t));
}

function loadBaseForDay(key){
  try{
    const x = localStorage.getItem(LS_BASE_PREFIX + key);
    return x ? +x : null;
  }catch(e){ return null; }
}

function saveBaseForDay(key, val){
  try{ localStorage.setItem(LS_BASE_PREFIX + key, String(val)); }catch(e){}
}

function currentSamSpot(){
  // Prefer live feed; fallback to config.samUsd; final fallback 0.01
  const cfg = CONFIG.load?.() || {};
  const fromFeed = PriceFeed?.map?.SAM?.price;
  return (typeof fromFeed === 'number' && fromFeed > 0) ? fromFeed
       : (typeof cfg.samUsd === 'number' && cfg.samUsd > 0) ? cfg.samUsd
       : 0.01;
}

function applyDrift(){
  if (!enabled) return;

  const today = dayKey();
  const pctTarget = PLAN[today];
  if (typeof pctTarget !== 'number' || !isFinite(pctTarget)) return; // no plan today

  // ensure a stable baseline for this day
  let base = loadBaseForDay(today);
  if (base == null || !(base > 0)){
    base = currentSamSpot();
    saveBaseForDay(today, base);
  }

  const t = fractionOfDay();
  const x = easeCos01(t);               // 0→1 over the day
  const factor = 1 + (pctTarget/100) * x;
  const price  = base * factor;
  const changePct = (price/base - 1) * 100;

  // write back into feed map
  if (!PriceFeed.map.SAM) PriceFeed.map.SAM = {};
  PriceFeed.map.SAM.price  = price;
  PriceFeed.map.SAM.change = changePct;
}

// Public API
export function setSamPlan(obj){
  // obj: { 'YYYY-MM-DD': percent, ... }
  PLAN = Object.assign({}, PLAN, obj || {});
}

export function enableSamDrift(){
  if (enabled) return;
  enabled = true;

  // Re-apply on every feed update (your feed already emits)
  if (typeof PriceFeed.on === 'function'){
    PriceFeed.on(applyDrift);
  }

  // Also tick every ~20s just in case
  setInterval(applyDrift, 20000);

  // Apply immediately on load
  applyDrift();
}
