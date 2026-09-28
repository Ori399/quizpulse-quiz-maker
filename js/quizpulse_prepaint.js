(() => {
  const root = document.documentElement;
  let collapsed = false;
  try {
    collapsed = localStorage.getItem('quizpulseSidebarCollapsed') === '1';
  } catch (_) {}

  root.classList.toggle('qp-sidebar-collapsed-prepaint', collapsed);

  // The matching prepaint rules live in quizpulse_final.css so CSP remains strict.
})();

// Apply the last server-validated theme before first paint. The runtime refreshes it.
(() => {
  const root = document.documentElement;
  const path = location.pathname.replace(/\/+$/, '') || '/';
  const pageMap = {
    '/': 'auth', '/dashboard': 'dashboard', '/profile': 'profile', '/chat': 'chat', '/subjects': 'subjects', '/college': 'subjects',
    '/academic-management': 'academic-management', '/lectures': 'lectures', '/lessons': 'lessons', '/lesson-builder': 'lessons', '/lesson-import': 'lessons', '/lesson-questions': 'lessons', '/lesson-settings': 'lessons', '/lesson-view': 'lessons', '/grades': 'grades', '/grade-master': 'grades',
    '/creator': 'creator', '/library': 'library', '/question-bank': 'question-bank', '/statistics': 'statistics', '/reports': 'statistics', '/practical-exam': 'statistics', '/exams': 'grades', '/exam': 'grades',
    '/shop': 'shop', '/settings': 'settings', '/reviews': 'reviews', '/support': 'support', '/server-status': 'server-status',
    '/admin-users': 'admin-users', '/admin-users/new': 'admin-users', '/control': 'admin-users', '/browser-register': 'join', '/admin-live': 'admin-live', '/admin-security': 'admin-security',
    '/host': 'host', '/join': 'join', '/player': 'player', '/preview': 'preview',
    '/solo': 'practice', '/perspective': 'practice', '/lecture-answer': 'lecture-answer'
  };
  const pageId = path.startsWith('/profile/') ? 'profile' : pageMap[path];
  if (!pageId) return;
  if (pageId === 'lessons') root.dataset.qpThemePending = '1';
  try {
    const theme = JSON.parse(localStorage.getItem(`quizpulseResolvedTheme:${pageId}`) || 'null');
    if (!theme) return;
    if (theme.themeId === 'quiz-pulse-classic') {
      delete root.dataset.qpThemePending;
      return;
    }
    if (!theme.tokens || typeof theme.tokens !== 'object') return;
    const colors = { background: '--qpt-background', surface: '--qpt-surface', surfaceAlt: '--qpt-surface-alt', text: '--qpt-text', muted: '--qpt-muted', border: '--qpt-border', primary: '--qpt-primary', primaryText: '--qpt-primary-text', accent: '--qpt-accent', accentText: '--qpt-accent-text', success: '--qpt-success', warning: '--qpt-warning', danger: '--qpt-danger', info: '--qpt-info' };
    Object.entries(colors).forEach(([key, property]) => {
      const value = String(theme.tokens[key] || '');
      if (/^#[0-9a-f]{6}$/i.test(value)) document.documentElement.style.setProperty(property, value);
    });
    if (Number(theme.tokens.fontScale) >= .9 && Number(theme.tokens.fontScale) <= 1.15) document.documentElement.style.setProperty('--qpt-font-scale', String(theme.tokens.fontScale));
    for (const [key, max] of [['cardRadius', 32], ['controlRadius', 24], ['borderWidth', 2]]) {
      const value = Number(theme.tokens[key]);
      if (value >= 0 && value <= max) document.documentElement.style.setProperty(`--qpt-${key.replace(/[A-Z]/g, letter => `-${letter.toLowerCase()}`)}`, `${value}px`);
    }
    document.documentElement.dataset.qpTheme = String(theme.themeId).slice(0, 80);
    document.documentElement.dataset.qpThemeActive = '1';
    // A dark theme needs more than different tokens. A number of surfaces in
    // the stylesheet are painted white outright rather than from a token, and
    // the browser's own scrollbars, date pickers and dropdowns have to be told
    // as well. Both hang off this one flag, decided here so the very first
    // paint is already right. Read from the background's luminance, so any
    // dark theme gets it - not only the built-in one.
    const background = String(theme.tokens.background || '');
    if (/^#[0-9a-f]{6}$/i.test(background)) {
      const level = Number.parseInt(background.slice(1), 16);
      const part = value => {
        const unit = value / 255;
        return unit <= 0.03928 ? unit / 12.92 : Math.pow((unit + 0.055) / 1.055, 2.4);
      };
      const luminance = 0.2126 * part((level >> 16) & 255) + 0.7152 * part((level >> 8) & 255) + 0.0722 * part(level & 255);
      const scheme = luminance < 0.22 ? 'dark' : 'light';
      document.documentElement.dataset.qpScheme = scheme;
      document.documentElement.style.colorScheme = scheme;
      // The corrections a dark theme needs are a separate stylesheet, fetched
      // only by the readers who are on one. Added here, from the theme this
      // browser saw last, so it is already in the head when the page paints.
      if (scheme === 'dark' && !document.querySelector('link[data-quizpulse-dark-styles]')) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = '/css/quizpulse_dark.css?v=9fc817d3a86d';
      link.dataset.quizpulseDarkStyles = '1';
      document.head.appendChild(link);
      }
    }
    if (['inter', 'system', 'academic-serif'].includes(theme.tokens.fontFamily)) document.documentElement.dataset.qpFontFamily = theme.tokens.fontFamily;
    if (['compact', 'comfortable', 'spacious'].includes(theme.tokens.density)) document.documentElement.dataset.qpDensity = theme.tokens.density;
    if (['none', 'subtle', 'medium'].includes(theme.tokens.shadow)) document.documentElement.dataset.qpShadow = theme.tokens.shadow;
    const themeMotion = theme.themeId === 'academic-pulse' ? 'standard' : theme.tokens.motion;
    if (['reduced', 'standard'].includes(themeMotion)) document.documentElement.dataset.qpMotion = themeMotion;
    Object.entries(theme.components || {}).forEach(([key, value]) => {
      if (/^[a-zA-Z]+$/.test(key) && /^[a-z-]+$/.test(String(value))) document.documentElement.dataset[`qp${key[0].toUpperCase()}${key.slice(1)}`] = String(value);
    });
    delete root.dataset.qpThemePending;
  } catch (_) {}
})();

// Start protected-page data requests while the browser is still parsing the page.
// Page modules consume these promises later, avoiding serial network round trips.
(() => {
  const path = location.pathname.replace(/\/+$/, '') || '/';
  // Start sign-in session detection early too: the page must recognize an
  // existing session, and must preserve a signed-out-elsewhere notice.
  const loadJson = url => fetch(url, { credentials: 'same-origin', headers: { Accept: 'application/json' } })
    .then(async response => {
      if (!response.ok) return null;
      const data = await response.json().catch(() => null);
      return data && typeof data === 'object' ? data : null;
    })
    .catch(() => null);
  // Unlike the page-data loaders, the auth check keeps its body when the
  // request fails: a refusal carries why the session ended, and collapsing
  // every failure to null would throw that away before anyone could read it.
  // The offline creator (tools/build-offline-creator.js) has no server to ask: no one is signed in.
  if (window.QUIZPULSE_OFFLINE_CREATOR === true) {
    window.__quizpulseAuthMePromise = Promise.resolve(null);
    window.__quizpulsePageData = window.__quizpulsePageData || {};
    return;
  }
  window.__quizpulseAuthMePromise = fetch('/api/auth/me', { credentials: 'same-origin', headers: { Accept: 'application/json' } })
    .then(async response => {
      const data = await response.json().catch(() => null);
      return data && typeof data === 'object' ? data : null;
    })
    .catch(() => null);
  window.__quizpulsePageData = window.__quizpulsePageData || {};
  if (path === '/chat') window.__quizpulsePageData.chat = loadJson('/api/messages/bootstrap');
  if (path === '/shop') window.__quizpulsePageData.shop = loadJson('/api/shop');
  if (path === '/admin-users') {
    window.__quizpulsePageData.adminUsers = loadJson('/api/admin/users?limit=50');
    window.__quizpulsePageData.adminContext = loadJson('/api/admin/import-context');
  }
  if (path === '/host') window.__quizpulsePageData.liveAudio = loadJson('/api/settings/live-audio');
})();

// The picture behind the sign-in page, chosen before the browser paints.
//
// It hangs off a custom property rather than sitting in the stylesheet, because
// the address carries the version of the picture it holds. That is what makes
// this both immediate and correct: the address is remembered from the last
// visit, so a returning browser paints out of its own cache without asking the
// server anything at all, and when an administrator uploads something else the
// address changes with it, so no cache anywhere can go on showing the old one.
(() => {
  const path = location.pathname.replace(/\/+$/, '') || '/';
  if (!['/', '/auth'].includes(path) || window.QUIZPULSE_OFFLINE_CREATOR === true) return;
  const root = document.documentElement;
  const KEY = 'quizpulseSignInBackground';

  const paint = record => {
    const version = record && String(record.version || '');
    if (!version) {
      root.style.removeProperty('--qp-signin-image');
      root.style.removeProperty('--qp-signin-blur');
      delete root.dataset.qpSignInPicture;
      return;
    }
    root.style.setProperty('--qp-signin-image', `url("/api/branding/sign-in-background?v=${encodeURIComponent(version)}")`);
    // A few hundred bytes that paint at once, so the page is never bare while
    // the full picture is still arriving. Only ever an image data URL.
    const blur = String(record.blur || '');
    if (/^data:image\/(png|jpeg|webp);base64,[a-z0-9+/=]+$/i.test(blur)) root.style.setProperty('--qp-signin-blur', `url("${blur}")`);
    else root.style.removeProperty('--qp-signin-blur');
    root.dataset.qpSignInPicture = '1';
  };

  let remembered = null;
  try { remembered = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (_) {}
  paint(remembered);

  // The only request this page makes for the picture, and it carries no file.
  fetch('/api/branding/sign-in-background.json', { headers: { Accept: 'application/json' } })
    .then(response => (response.ok ? response.json() : null))
    .then(payload => {
      const next = (payload && payload.background) || null;
      if (JSON.stringify(next) === JSON.stringify(remembered)) return;
      paint(next);
      try {
        if (next) localStorage.setItem(KEY, JSON.stringify(next));
        else localStorage.removeItem(KEY);
      } catch (_) {}
    })
    .catch(() => {});
})();

// quizpulse_theme.css follows each page's critical subset as a non-blocking stylesheet (media="print"),
// see tools/theme-critical-css.js. It applies the moment it has loaded. The capture listener sees the load
// of a link parsed after this script; the DOMContentLoaded pass covers a sheet that was already cached.
(() => {
  const promote = link => { if (link.hasAttribute('data-qp-theme-full') && link.media === 'print') link.media = 'all'; };
  document.addEventListener('load', event => { if (event.target instanceof HTMLLinkElement) promote(event.target); }, true);
  const sweep = () => document.querySelectorAll('link[data-qp-theme-full]').forEach(link => { if (link.sheet) promote(link); });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', sweep, { once: true });
  else sweep();
})();
