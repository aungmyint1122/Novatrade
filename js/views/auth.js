// js/views/auth.js
import { AUTH } from '../core.js';

// same tab-click navigation for reliability
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

function getMode(){
  // prefer sessionStorage flag set by Home buttons
  try {
    const m = (sessionStorage.getItem('authMode') || '').toLowerCase();
    if (m === 'create' || m === 'login') return m;
  } catch {}
  // fallback to hash query (?mode=...) if present
  const h = location.hash || '';
  const q = h.split('?')[1] || '';
  const p = new URLSearchParams(q);
  const mode = (p.get('mode') || '').toLowerCase();
  return mode === 'create' ? 'create' : 'login';
}
function setMode(mode){
  try { sessionStorage.setItem('authMode', mode); } catch {}
}

export default function AuthView(cb){
  const view = document.createElement('div');
  view.className = 'grid';

  const me = AUTH.me?.();
  if (me){
    const sec = document.createElement('section');
    sec.className = 'card';
    sec.innerHTML = `
      <h3>Account</h3>
      <div class="row"><div class="badge">Signed in as</div><div class="badge">${me.email}</div></div>
      <div class="row" style="margin-top:10px"><button id="logout" type="button" class="btn">Logout</button></div>
    `;
    sec.querySelector('#logout').onclick = () => { AUTH.signout(); location.reload(); };
    view.appendChild(sec);
    cb(view);
    return;
  }

  const mode = getMode();
  const sec = document.createElement('section');
  sec.className = 'card';

  if (mode === 'create'){
    // ----- Create account -----
    sec.innerHTML = `
      <h3>Create Account</h3>
      <div class="row"><input id="su-email" class="input" placeholder="Email"/></div>
      <div class="row"><input id="su-pass"  type="password" class="input" placeholder="Password"/></div>
      <div class="row"><input id="su-pass2" type="password" class="input" placeholder="Confirm Password"/></div>
      <div class="row"><button id="do-create" type="button" class="btn">Create</button><div id="su-msg" class="small"></div></div>
      <div class="row small" style="margin-top:8px">
        <span class="badge">Have an account?</span>
        <a id="go-login" class="pill small" style="text-decoration:none;cursor:pointer" role="button">Go to Login</a>
      </div>
    `;
    view.appendChild(sec);

    sec.querySelector('#do-create').onclick = function(){
      const email = sec.querySelector('#su-email').value.replace(/\s+/g,'');
      const p1 = sec.querySelector('#su-pass').value;
      const p2 = sec.querySelector('#su-pass2').value;
      const msg = sec.querySelector('#su-msg'); msg.textContent='';
      if(!email || !p1 || p1!==p2){ msg.textContent='Check inputs'; return; }
      AUTH.signup(email,p1).then(r=>{
        if(r.error==='exists'){ msg.textContent='Exists'; }
        else {
          setMode('login');
          nav('auth');
        }
      });
    };
    sec.querySelector('#go-login').onclick = () => { setMode('login'); nav('auth'); };

  } else {
    // ----- Login -----
    sec.innerHTML = `
      <h3>Sign In</h3>
      <div class="row"><input id="si-email" class="input" placeholder="Email"/></div>
      <div class="row"><input id="si-pass" type="password" class="input" placeholder="Password"/></div>
      <div class="row"><button id="do-login" type="button" class="btn">Login</button><div id="si-msg" class="small"></div></div>
      <div class="row small" style="margin-top:8px">
        <span class="badge">New here?</span>
        <a id="go-create" class="pill small" style="text-decoration:none;cursor:pointer" role="button">Create Account</a>
      </div>
    `;
    view.appendChild(sec);

    const doLogin = function(){
      const email = sec.querySelector('#si-email').value.replace(/\s+/g,'');
      const p = sec.querySelector('#si-pass').value;
      const msg = sec.querySelector('#si-msg'); msg.textContent='';
      AUTH.signin(email,p).then(r=>{
        if(r.error==='no') msg.textContent='No user';
        else if(r.error==='bad') msg.textContent='Wrong pass';
        else if(r.error==='locked') msg.textContent='Locked';
        else location.reload();
      });
    };
    sec.querySelector('#do-login').onclick = doLogin;
    sec.querySelector('#si-pass').addEventListener('keydown', e => { if(e.key==='Enter') doLogin(); });
    sec.querySelector('#go-create').onclick = () => { setMode('create'); nav('auth'); };
  }

  cb(view);
}
