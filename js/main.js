// js/main.js
import { PriceFeed, showBanner, AUTH, CONFIG } from './core.js';
import { selectTab, enableTabs } from './router.js';
import { setSamPlan, enableSamDrift } from './sam-drift.js';

window.selectTab = selectTab;

// --- tiny helper: read tab from URL hash ---
function tabFromHash() {
  return (location.hash.replace(/^#\/?/, '') || 'home').split('?')[0];
}

// Banners
window.addEventListener('error', (e) =>
  showBanner('⚠️ Script error: ' + (e?.message || 'unknown'))
);
window.addEventListener('unhandledrejection', () =>
  showBanner('⚠️ Network/data issue – using demo.')
);

window.addEventListener('DOMContentLoaded', () => {
  // App boot
  enableTabs();
  PriceFeed.start();

  // mount the tab that the URL asks for (default: home)
  selectTab(tabFromHash());

  // keep UI in sync if the hash changes (links, back/forward, manual edits)
  window.addEventListener('hashchange', () => selectTab(tabFromHash()));

  // ── SAM daily drift (reads admin plan from nl.config.samPlan) ───────────
  try {
    const cfg = CONFIG.load?.() || {};
    if (cfg.samPlan) setSamPlan(cfg.samPlan); // e.g., { '2025-08-12': 29 }
    enableSamDrift();                          // smooth 0% → target% over the day
  } catch (e) {
    console.warn('SAM drift init failed:', e);
  }
  // ────────────────────────────────────────────────────────────────────────

  /* ---------------- Crisp chat: toggle from header button ---------------- */
  const chatBtn = document.getElementById('btn-chat');
  if (chatBtn) {
    chatBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      window.$crisp = window.$crisp || [];
      if (window.__crispChatOpen) {
        window.$crisp.push(['do', 'chat:close']);
      } else {
        window.$crisp.push(['do', 'chat:show']);
        window.$crisp.push(['do', 'chat:open']);
      }
    });
  }

  // Identify user in Crisp (queue-safe + keep existing READY handler)
  const me = AUTH.me?.();
  if (me?.email) {
    const setCrispUser = () => {
      window.$crisp = window.$crisp || [];
      window.$crisp.push(['set', 'user:email', [me.email]]);
    };
    setCrispUser();
    const prevReady = window.CRISP_READY_TRIGGER;
    window.CRISP_READY_TRIGGER = function () {
      if (typeof prevReady === 'function') prevReady();
      setCrispUser();
    };
  }

  /* ---------------- Language switcher ---------------- */
  const I18N = {
    en: { chat: 'Chat', guest: 'Guest',
      'nav.home': 'Home', 'nav.market': 'Market', 'nav.trade': 'Trade',
      'nav.assets': 'Assets', 'nav.auth': 'Auth', flag: '🇬🇧', label: 'EN'
    },
    ja: { chat: 'チャット', guest: 'ゲスト',
      'nav.home': 'ホーム','nav.market':'マーケット','nav.trade':'トレード','nav.assets':'資産','nav.auth':'認証',
      flag:'🇯🇵', label:'JA'
    },
    ko: { chat: '채팅', guest: '게스트',
      'nav.home':'홈','nav.market':'마켓','nav.trade':'트레이드','nav.assets':'자산','nav.auth':'인증',
      flag:'🇰🇷', label:'KO'
    },
    vi: { chat: 'Trò chuyện', guest: 'Khách',
      'nav.home':'Trang chủ','nav.market':'Thị trường','nav.trade':'Giao dịch','nav.assets':'Tài sản','nav.auth':'Tài khoản',
      flag:'🇻🇳', label:'VI'
    },
    th: { chat: 'แชท', guest: 'ผู้เยี่ยมชม',
      'nav.home':'หน้าแรก','nav.market':'ตลาด','nav.trade':'เทรด','nav.assets':'สินทรัพย์','nav.auth':'บัญชี',
      flag:'🇹🇭', label:'TH'
    },
    ar: { chat: 'الدردشة', guest: 'زائر',
      'nav.home':'الرئيسية','nav.market':'السوق','nav.trade':'تداول','nav.assets':'الأصول','nav.auth':'الحساب',
      flag:'🇦🇪', label:'AR'
    },
    de: { chat:'Chat', guest:'Gast',
      'nav.home':'Start','nav.market':'Markt','nav.trade':'Handel','nav.assets':'Vermögen','nav.auth':'Anmeldung',
      flag:'🇩🇪', label:'DE'
    },
    it: { chat:'Chat', guest:'Ospite',
      'nav.home':'Home','nav.market':'Mercato','nav.trade':'Trading','nav.assets':'Asset','nav.auth':'Accesso',
      flag:'🇮🇹', label:'IT'
    },
    fr: { chat:'Discussion', guest:'Invité',
      'nav.home':'Accueil','nav.market':'Marché','nav.trade':'Échange','nav.assets':'Actifs','nav.auth':'Compte',
      flag:'🇫🇷', label:'FR'
    },
    'zh-TW': { chat:'聊天', guest:'訪客',
      'nav.home':'首頁','nav.market':'市場','nav.trade':'交易','nav.assets':'資產','nav.auth':'帳戶',
      flag:'🇹🇼', label:'繁'
    },
    ru: { chat:'Чат', guest:'Гость',
      'nav.home':'Главная','nav.market':'Рынок','nav.trade':'Торговля','nav.assets':'Активы','nav.auth':'Аккаунт',
      flag:'🇷🇺', label:'RU'
    },
    tr: { chat:'Sohbet', guest:'Misafir',
      'nav.home':'Ana Sayfa','nav.market':'Piyasa','nav.trade':'Al-Sat','nav.assets':'Varlıklar','nav.auth':'Hesap',
      flag:'🇹🇷', label:'TR'
    },
    pt: { chat:'Chat', guest:'Convidado',
      'nav.home':'Início','nav.market':'Mercado','nav.trade':'Negociação','nav.assets':'Ativos','nav.auth':'Conta',
      flag:'🇵🇹', label:'PT'
    },
    es: { chat:'Chat', guest:'Invitado',
      'nav.home':'Inicio','nav.market':'Mercado','nav.trade':'Trading','nav.assets':'Activos','nav.auth':'Cuenta',
      flag:'🇪🇸', label:'ES'
    }
  };

  const langRoot  = document.querySelector('.lang');
  const langBtn   = document.getElementById('btn-lang');
  const langMenu  = document.getElementById('lang-menu');

  function applyLanguage(lang) {
    const dict = I18N[lang] || I18N.en;
    document.querySelectorAll('[data-i18n]').forEach(el => {
      const key = el.getAttribute('data-i18n');
      if (dict[key]) el.textContent = dict[key];
    });
    if (langBtn) langBtn.textContent = `${dict.flag} ${dict.label} ▾`;
    document.documentElement.lang = (lang === 'zht' ? 'zh-TW' : lang);
    document.documentElement.setAttribute('dir', lang === 'ar' ? 'rtl' : 'ltr');
    try { localStorage.setItem('nl.lang', lang); } catch {}
  }

  function closeLangMenu() { langRoot?.classList.remove('open'); }
  function openLangMenu()  { langRoot?.classList.add('open'); }

  if (langBtn && langMenu) {
    const saved = localStorage.getItem('nl.lang') || 'en';
    applyLanguage(saved);
    langBtn.addEventListener('click', (e) => {
      e.preventDefault(); e.stopPropagation();
      if (langRoot?.classList.contains('open')) closeLangMenu();
      else openLangMenu();
    });
    langMenu.addEventListener('click', (e) => {
      const li = e.target.closest('[data-lang]'); if (!li) return;
      const lang = li.getAttribute('data-lang');
      applyLanguage(lang); closeLangMenu();
    });
    document.addEventListener('click', () => closeLangMenu());
    langMenu.addEventListener('click', (e) => e.stopPropagation());
  }
});
