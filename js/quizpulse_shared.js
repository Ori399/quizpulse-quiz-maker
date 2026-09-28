window.QuizPulse = (() => {
  // The offline creator (tools/build-offline-creator.js) has no QuizPulse server behind it: nothing is asked of one.
  const OFFLINE = window.QUIZPULSE_OFFLINE_CREATOR === true;
  const memoryStorage = new Map();
  const STORAGE_COOKIE_MAX_LENGTH = 3000;
  let storageAvailability = null;

  function browserStorage() {
    if (storageAvailability === false) return null;
    try {
      if (typeof localStorage === 'undefined') {
        storageAvailability = false;
        return null;
      }
      if (storageAvailability !== true) {
        const testKey = '__quizpulse_storage_test__';
        localStorage.setItem(testKey, '1');
        localStorage.removeItem(testKey);
        storageAvailability = true;
      }
      return localStorage;
    } catch (_) {
      storageAvailability = false;
      return null;
    }
  }

  function storageCookieName(key) {
    return encodeURIComponent(String(key || ''));
  }

  function storageCookieAllowed(key, value = '') {
    const cleanKey = String(key || '');
    return cleanKey && !cleanKey.startsWith('quizpulseSfx:') && String(value || '').length <= STORAGE_COOKIE_MAX_LENGTH;
  }

  function storageCookieGet(key) {
    try {
      if (typeof document === 'undefined' || typeof document.cookie !== 'string') return null;
      const name = `${storageCookieName(key)}=`;
      const entry = document.cookie.split(/;\s*/).find(item => item.startsWith(name));
      return entry ? decodeURIComponent(entry.slice(name.length)) : null;
    } catch (_) {
      return null;
    }
  }

  function storageCookieSet(key, value) {
    try {
      if (typeof document === 'undefined' || !storageCookieAllowed(key, value)) return;
      document.cookie = `${storageCookieName(key)}=${encodeURIComponent(String(value || ''))}; path=/; max-age=31536000; SameSite=Lax`;
    } catch (_) {}
  }

  function storageCookieRemove(key) {
    try {
      if (typeof document === 'undefined') return;
      document.cookie = `${storageCookieName(key)}=; path=/; max-age=0; SameSite=Lax`;
    } catch (_) {}
  }

  function storageGet(key, fallback = '') {
    const cleanKey = String(key || '');
    if (!cleanKey) return fallback;
    try {
      const store = browserStorage();
      if (store) {
        const value = store.getItem(cleanKey);
        return value == null ? fallback : value;
      }
    } catch (_) {}
    const cookieValue = storageCookieGet(cleanKey);
    if (cookieValue != null) return cookieValue;
    return memoryStorage.has(cleanKey) ? memoryStorage.get(cleanKey) : fallback;
  }

  function storageSet(key, value) {
    const cleanKey = String(key || '');
    if (!cleanKey) return;
    const cleanValue = String(value ?? '');
    memoryStorage.set(cleanKey, cleanValue);
    try {
      const store = browserStorage();
      if (store) {
        store.setItem(cleanKey, cleanValue);
        return;
      }
    } catch (_) {}
    if (storageCookieAllowed(cleanKey, cleanValue)) storageCookieSet(cleanKey, cleanValue);
    else storageCookieRemove(cleanKey);
  }

  function storageRemove(key) {
    const cleanKey = String(key || '');
    if (!cleanKey) return;
    memoryStorage.delete(cleanKey);
    try {
      const store = browserStorage();
      if (store) store.removeItem(cleanKey);
    } catch (_) {}
    storageCookieRemove(cleanKey);
  }

  function storageKeys() {
    const keys = new Set(memoryStorage.keys());
    try {
      const store = browserStorage();
      if (store) Object.keys(store).forEach(key => keys.add(key));
    } catch (_) {}
    try {
      if (typeof document !== 'undefined' && typeof document.cookie === 'string') {
        document.cookie.split(/;\s*/).forEach(item => {
          const name = item.split('=')[0];
          if (name) keys.add(decodeURIComponent(name));
        });
      }
    } catch (_) {}
    return [...keys];
  }

  function applyTheme() {
    const value = 'light';
    if (!document.documentElement.dataset.qpTheme && document.documentElement.dataset.qpThemePending !== '1') {
      document.documentElement.dataset.theme = value;
    }
    // A versioned theme owns the colour scheme. This legacy helper used to set
    // it unconditionally, which turned every scrollbar and native control back
    // to light under a dark theme.
    if (!document.documentElement.dataset.qpScheme) document.documentElement.style.colorScheme = 'light';
    storageSet('quizpulseTheme', value);
    return value;
  }
  function toggleTheme() {
    return applyTheme();
  }
  applyTheme();
  document.addEventListener('DOMContentLoaded', applyTheme);

  // The versioned admin theme runtime is isolated from the legacy light-mode API.
  if (!OFFLINE && document.head?.appendChild && !window.QuizPulseTheme && !document.querySelector('script[data-quizpulse-theme-runtime]')) {
    const themeRuntime = document.createElement('script');
    themeRuntime.src = '/js/quizpulse_theme_runtime.js?v=f34d55bbfbbd';
    themeRuntime.defer = true;
    themeRuntime.dataset.quizpulseThemeRuntime = '1';
    document.head.appendChild(themeRuntime);
  }

  const LANGUAGE_KEY = 'quizpulseLanguage';
  const SUPER_ADMIN_PAGES = new Set(['/organizations', '/plans', '/discover-reports', '/shop', '/character-management', '/artists', '/platform-settings']);
  // A group admin belongs to no organization either (src/server/groups.service.js): its group's page is all it uses.
  const GROUP_ADMIN_PAGES = new Set(['/group']);
  // Nor does an artist (src/server/routes/artists.routes.js): the Shop's character and title studio is all it uses.
  const ARTIST_PAGES = new Set(['/character-management']);
  // The platform's own accounts: no plan, no messages, no organization.
  const PLATFORM_ACCOUNT_ROLES = ['super_admin', 'group_admin', 'artist'];

  /* -- plans ---------------------------------------------------------------- */

  // What a member's organization plan leaves out stays in view with a lock, and opening it asks for an upgrade
  // (src/server/plans.service.js). The pages that belong to each feature, by path; keep it beside plan-gates.js.
  const PLAN_PAGE_FEATURES = Object.freeze({
    '/lectures': 'lectures', '/lecture-answer': 'lectures',
    '/lessons': 'lessons', '/lesson-builder': 'lessons', '/lesson-import': 'lessons', '/lesson-questions': 'lessons',
    '/lesson-settings': 'lessons', '/lesson-view': 'lessons',
    '/question-bank': 'questionBank',
    '/statistics': 'statistics',
    '/exams': 'practicalExams', '/exam': 'practicalExams', '/practical-exam': 'practicalExams',
    '/grades': 'grades', '/grade-master': 'grades',
    '/mastery': 'mastery',
    '/chat': 'chat',
    '/shop': 'shop'
  });
  const PLAN_LOCK_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7.5a4 4 0 0 1 8 0V11"/></svg>';
  const planTranslations = {
    en: {
      title: 'You need to upgrade', pill: 'Plan', upgrade: 'Upgrade', cancel: 'Cancel', ok: 'OK', thisFeature: 'This feature',
      feature: (name, plan) => `${name} is not included in your organization's plan${plan ? ` (${plan})` : ''}.`,
      limit: (name, plan) => `Your organization's plan${plan ? ` (${plan})` : ''} has no room for more ${name}.`,
      questionType: (name, plan) => `${name} questions are not included in your organization's plan${plan ? ` (${plan})` : ''}.`,
      askAdmin: 'Ask your organization\'s admin to upgrade.',
      features: { lessons: 'Lessons', lectures: 'Lectures', questionBank: 'The question bank', statistics: 'Statistics', practicalExams: 'Practical exams',
        grades: 'Grades', mastery: 'Mastery practice', spreadsheets: 'XLSX import and export', chat: 'Chat', shop: 'The shop', uims: 'UIMS sign-in',
        branding: 'Sign-in branding and posts' },
      limits: { livePlayers: 'players in a live room', admins: 'admins', collegeManagers: 'college managers', teachers: 'teachers', students: 'students' },
      // A school's college managers are its deputies (academicTerms).
      schoolLimits: { collegeManagers: 'deputies' }
    },
    ar: {
      title: 'تحتاج إلى الترقية', pill: 'الخطة', upgrade: 'ترقية', cancel: 'إلغاء', ok: 'حسنًا', thisFeature: 'هذه الميزة',
      feature: (name, plan) => `${name} غير متاح في خطة مؤسستك${plan ? ` (${plan})` : ''}.`,
      limit: (name, plan) => `وصلت خطة مؤسستك${plan ? ` (${plan})` : ''} إلى الحد الأقصى لعدد ${name}.`,
      questionType: (name, plan) => `أسئلة ${name} غير متاحة في خطة مؤسستك${plan ? ` (${plan})` : ''}.`,
      askAdmin: 'اطلب من مسؤول مؤسستك ترقية الخطة.',
      features: { lessons: 'الدروس', lectures: 'المحاضرات', questionBank: 'بنك الأسئلة', statistics: 'الإحصاءات', practicalExams: 'الامتحانات العملية',
        grades: 'الدرجات', mastery: 'تدريب الإتقان', spreadsheets: 'استيراد وتصدير XLSX', chat: 'المحادثات', shop: 'المتجر', uims: 'تسجيل الدخول عبر UIMS',
        branding: 'واجهة تسجيل الدخول والمنشورات' },
      limits: { livePlayers: 'اللاعبين في الغرفة المباشرة', admins: 'المسؤولين', collegeManagers: 'مدراء الكليات', teachers: 'الأساتذة', students: 'الطلاب' },
      schoolLimits: { collegeManagers: 'المعاونين' }
    }
  };
  let upgradePromptOpen = false;
  let lastUpgradePrompt = { key: '', at: 0 };

  const planText = () => planTranslations[document.documentElement.lang === 'ar' || document.documentElement.dataset.language === 'ar' ? 'ar' : 'en'];

  // The owner of a personal account (src/server/personal-accounts.service.js): its pages are a player's and a quiz maker's,
  // not a school's, so a school's pages send it to its dashboard.
  function isPersonalAccount(profile = currentStudent()) {
    return profile?.personalOwner === true || String(profile?.organization?.type || '') === 'personal';
  }
  const PERSONAL_BLOCKED_PAGES = new Set(['/subjects', '/college', '/lectures', '/lecture-answer', '/lessons', '/lesson-builder', '/lesson-import',
    '/lesson-questions', '/lesson-settings', '/lesson-view', '/grades', '/grade-master', '/chat', '/statistics', '/support', '/exams', '/exam',
    '/practical-exam', '/academic-management', '/admin-users', '/admin-users/new', '/control']);

  // The member's plan, or null when there is none to follow: the super admin, or a profile kept from before plans. A page
  // may pass an account read from its own request, without the plan; the kept profile of the same account has it.
  function currentPlan(profile = currentStudent()) {
    const isPlan = value => !!value && typeof value === 'object';
    if (isPlan(profile?.plan)) return profile.plan;
    const kept = profile ? currentStudent() : null;
    return kept && String(kept.id || '') === String(profile.id || '') && isPlan(kept.plan) ? kept.plan : null;
  }

  function planAllowsFeature(feature, profile = currentStudent()) {
    const plan = currentPlan(profile);
    return !plan || !feature || plan.features?.[feature] !== false;
  }

  function planAllowsQuestionType(type, profile = currentStudent()) {
    const plan = currentPlan(profile);
    return !plan || !Array.isArray(plan.questionTypes) || plan.questionTypes.includes(String(type || ''));
  }

  // The feature a page belongs to when the member's plan leaves it out, or ''.
  function planLockedFeatureForPath(path, profile = currentStudent()) {
    const feature = PLAN_PAGE_FEATURES[String(path || '')] || '';
    return feature && !planAllowsFeature(feature, profile) ? feature : '';
  }

  // "You need to upgrade": what is locked, with Upgrade and Cancel for an admin, who is taken to the Upgrade page, and
  // OK for anyone else, who is told to ask their admin. Resolves true when an admin chose Upgrade. A quiet prompt - a
  // refusal from the server - is not repeated for the same thing within 20 seconds, so an autosave does not nag.
  async function showUpgradePrompt({ feature = '', limit = '', questionType = '', quiet = false } = {}) {
    const key = `${feature}|${limit}|${questionType}`;
    if (upgradePromptOpen || (quiet && lastUpgradePrompt.key === key && Date.now() - lastUpgradePrompt.at < 20000)) return false;
    lastUpgradePrompt = { key, at: Date.now() };
    const text = planText();
    const profile = currentStudent();
    const planName = currentPlan(profile)?.name || '';
    const typeLabel = (window.QuizPulse?.questionTypes || []).find(type => type.id === questionType)?.label || questionType;
    const limitLabel = (academicTerms(undefined).school && text.schoolLimits[limit]) || text.limits[limit] || limit;
    const message = questionType ? text.questionType(typeLabel, planName)
      : limit ? text.limit(limitLabel, planName)
        : text.feature(text.features[feature] || text.thisFeature, planName);
    // An admin, or a personal account's owner, can ask for another plan.
    const admin = String(profile?.role || '').toLowerCase() === 'admin' || isPersonalAccount(profile);
    upgradePromptOpen = true;
    try {
      const chosen = await confirmDialog(admin
        ? { title: text.title, message, confirmText: text.upgrade, cancelText: text.cancel, pill: text.pill, icon: '🔒' }
        : { title: text.title, message: `${message} ${text.askAdmin}`, confirmText: text.ok, dismissOnly: true, pill: text.pill, icon: '🔒' });
      if (admin && chosen) location.assign('/upgrade');
      return admin && chosen;
    } finally {
      upgradePromptOpen = false;
    }
  }

  // A page the plan leaves out asks for an upgrade once, then goes back to the dashboard unless an admin upgrades.
  function guardLockedPage(profile, role = String(profile?.role || '').toLowerCase()) {
    const lockedHere = PLATFORM_ACCOUNT_ROLES.includes(role) ? '' : planLockedFeatureForPath(location.pathname, profile);
    if (!lockedHere || !document.body || document.body.dataset.planLockedPage) return;
    document.body.dataset.planLockedPage = lockedHere;
    showUpgradePrompt({ feature: lockedHere }).then(upgrading => { if (!upgrading) location.replace('/dashboard'); });
  }

  // The plan arrives with the account, which a page may already have drawn without it: the menu's locks, a locked page's
  // prompt and anything listening for quizpulse:plan-updated (the creator) follow it once it is known.
  // Only a plan this page has not applied yet does anything: a listener that redraws, and in doing so reads the account
  // again, would otherwise redraw forever.
  let appliedPlanKey = '';
  function applyPlanToPage(profile) {
    const role = String(profile?.role || '').toLowerCase();
    const plan = currentPlan(profile);
    if (!plan || PLATFORM_ACCOUNT_ROLES.includes(role)) return;
    const key = `${String(profile?.id || '')}:${JSON.stringify(plan)}`;
    if (key === appliedPlanKey) return;
    appliedPlanKey = key;
    document.querySelectorAll('.qp-dashboard-sidebar .qp-dashboard-nav a.qp-nav-link').forEach(link => {
      window.QuizPulseSidebar?.setLinkLock?.(link, planLockedFeatureForPath(link.getAttribute('href'), profile));
    });
    guardLockedPage(profile, role);
    document.dispatchEvent(new CustomEvent('quizpulse:plan-updated', { detail: { plan } }));
  }

  // Anything marked with the feature it needs - a menu link, a button - asks for an upgrade instead of opening.
  document.addEventListener('click', event => {
    const locked = event.target?.closest?.('[data-plan-locked]');
    if (!locked) return;
    event.preventDefault();
    showUpgradePrompt({ feature: locked.dataset.planLocked });
  });
  const navigationTranslations = {
    en: {
      dashboard: 'Dashboard', profile: 'Profile', chat: 'Chat', mySubjects: 'My subjects', subjects: 'Subjects', lectures: 'Lectures', lessons: 'Lessons',
      users: 'Users', organizations: 'Organizations', plans: 'Plans', upgrade: 'Plan and upgrade', live: 'Live', security: 'Security', academicStructure: 'Academic structure', create: 'Create', createQuiz: 'Create Quiz', quizzes: 'Quizzes', moreTools: 'More tools',
      questions: 'Questions', stats: 'Stats', reports: 'Quiz Reports', grades: 'Grades', gradeMaster: 'Grade Master', join: 'Join', shop: 'Shop', settings: 'Settings', platformSettings: 'Platform settings', discoverReports: 'Discover reports',
      server: 'Server', reviews: 'Reviews', support: 'Support', exams: 'Exams', control: 'Control', mainMenu: 'Main menu', home: 'QuizPulse home', group: 'Group',
      artists: 'Artists', studio: 'Studio',
      toggleSidebar: 'Toggle sidebar', showLabels: 'Show sidebar labels', hideLabels: 'Hide sidebar labels'
    },
    ar: {
      support: 'الدعم',
      dashboard: 'لوحة التحكم', profile: 'الحساب', chat: 'المحادثات', mySubjects: 'موادي', subjects: 'المواد', lessons: 'الدروس',
      users: 'المستخدمون', organizations: 'المؤسسات', plans: 'الخطط', upgrade: 'الخطة والترقية', live: 'البث المباشر', security: 'الأمان', academicStructure: 'الهيكل الأكاديمي', create: 'إنشاء', createQuiz: 'إنشاء اختبار', quizzes: 'الاختبارات', moreTools: 'المزيد من الأدوات',
      questions: 'الأسئلة', stats: 'الإحصاءات', reports: 'تقارير الاختبارات', grades: 'الدرجات', gradeMaster: 'إدارة الدرجات', join: 'الانضمام', shop: 'المتجر', settings: 'الإعدادات', platformSettings: 'إعدادات المنصة', discoverReports: 'بلاغات الاكتشاف', group: 'المجموعة', artists: 'الفنانون', studio: 'الاستوديو',
      server: 'الخادم', reviews: 'التقييمات', exams: 'الامتحانات', control: 'التحكم', mainMenu: 'القائمة الرئيسية', home: 'الصفحة الرئيسية لـ QuizPulse',
      toggleSidebar: 'إظهار أو إخفاء القائمة الجانبية', showLabels: 'إظهار عناوين القائمة', hideLabels: 'إخفاء عناوين القائمة'
    }
  };
  const accountTranslations = {
    en: { admin: 'Admin', college_manager: 'College Manager', teacher: 'Teacher', student: 'Student', current: 'Current logged-in account' },
    ar: { admin: 'مسؤول النظام', college_manager: 'مدير الكلية', teacher: 'أستاذ', student: 'طالب', current: 'الحساب المسجل حاليًا' }
  };
  navigationTranslations.ar.lectures = '\u0627\u0644\u0645\u062d\u0627\u0636\u0631\u0627\u062a';

  function normalizeLanguage(value) {
    return String(value || '').toLowerCase() === 'ar' ? 'ar' : 'en';
  }

  function language() {
    return normalizeLanguage(storageGet(LANGUAGE_KEY, 'en'));
  }

  function navigationText(key) {
    return navigationTranslations[language()]?.[key] || navigationTranslations.en[key] || key;
  }

  function syncLanguageToggle() {
    document.querySelectorAll('[data-language-toggle]').forEach(button => {
      const current = language();
      button.dataset.language = current;
      button.setAttribute('aria-label', current === 'ar' ? 'Switch language to English' : 'تغيير اللغة إلى العربية');
      button.setAttribute('title', current === 'ar' ? 'English' : 'العربية');
      button.innerHTML = `<span class="${current === 'ar' ? '' : 'active'}">EN</span><i aria-hidden="true"></i><span class="${current === 'ar' ? 'active' : ''}">AR</span>`;
    });
  }

  function ensureLanguageToggle() {
    const actions = document.querySelector('.qp-dashboard-top-actions');
    if (!actions || actions.querySelector('[data-language-toggle]')) return;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'qp-language-toggle';
    button.dataset.languageToggle = '1';
    button.addEventListener('click', () => setLanguage(language() === 'ar' ? 'en' : 'ar'));
    actions.insertBefore(button, actions.firstChild);
    syncLanguageToggle();
  }

  function applyLanguage() {
    const current = language();
    document.documentElement.lang = current;
    document.documentElement.dataset.language = current;
    document.body?.classList.toggle('qp-language-ar', current === 'ar');
    syncLanguageToggle();
    syncAccountChipLanguage();
    return current;
  }

  function setLanguage(value) {
    const next = normalizeLanguage(value);
    storageSet(LANGUAGE_KEY, next);
    applyLanguage();
    syncDashboardSidebar();
    document.dispatchEvent(new CustomEvent('quizpulse:language-changed', { detail: { language: next } }));
    return next;
  }

  applyLanguage();
  document.addEventListener('DOMContentLoaded', () => {
    applyLanguage();
    ensureLanguageToggle();
  });



  // A UIMS sign-in fetches the account's subjects after it has signed in (subject-sync.service.js), so the first page
  // can open before they arrive. The sign-in page notes that they are on their way; the pages after it ask the server
  // until they have come, and a page that lists subjects is drawn again with them - instead of an empty list that only
  // signing out and in again would fill.
  const UIMS_SUBJECTS_KEY = 'qpUimsSubjectsSince';
  const UIMS_SUBJECTS_WAIT_MS = 3 * 60 * 1000;
  // Enough asks to outlast UIMS's slowest answer and both retries, a few seconds apart.
  const UIMS_SUBJECTS_ASK_MS = [1000, 1500, 2000, 2000, 3000, 3000, 5000, 5000, 5000, 10000, 10000, 10000, 15000, 15000];
  const UIMS_SUBJECTS_PAGES = ['/dashboard', '/subjects'];
  const uimsSubjectsText = {
    en: { waiting: 'Getting your subjects from UIMS…', ready: 'Your subjects are here', readyRefresh: 'Your subjects are here - refresh the page to see them',
      failed: 'UIMS did not send your subjects. Sign in again later to try again.' },
    ar: { waiting: 'جارٍ جلب موادك من UIMS…', ready: 'وصلت موادك', readyRefresh: 'وصلت موادك - حدّث الصفحة لتراها',
      failed: 'لم يرسل UIMS موادك. سجّل الدخول مرة أخرى لاحقاً للمحاولة من جديد.' }
  };

  function expectUimsSubjects(signIn) {
    try {
      if (signIn?.subjects === 'syncing') sessionStorage.setItem(UIMS_SUBJECTS_KEY, String(Date.now()));
      else sessionStorage.removeItem(UIMS_SUBJECTS_KEY);
    } catch (_) { /* without storage the page simply does not wait */ }
  }

  // The page's toast, kept up while waiting.
  function uimsSubjectsNote(text, { lasting = false } = {}) {
    const el = document.getElementById('toast');
    if (!el) return;
    el.textContent = text;
    el.classList.add('show');
    clearTimeout(el._timer);
    if (!lasting) el._timer = setTimeout(() => el.classList.remove('show'), 4000);
  }

  async function watchUimsSubjects() {
    let since = 0;
    try { since = Number(sessionStorage.getItem(UIMS_SUBJECTS_KEY) || 0); } catch (_) { return; }
    if (!since) return;
    const stop = () => { try { sessionStorage.removeItem(UIMS_SUBJECTS_KEY); } catch (_) { /* nothing to forget */ } };
    if (Date.now() - since > UIMS_SUBJECTS_WAIT_MS) return stop();
    const text = uimsSubjectsText[language()];
    const listsSubjects = UIMS_SUBJECTS_PAGES.includes(location.pathname.replace(/\/+$/, ''));
    const hideNote = () => { if (listsSubjects) document.getElementById('toast')?.classList.remove('show'); };
    if (listsSubjects) uimsSubjectsNote(text.waiting, { lasting: true });
    for (const delay of UIMS_SUBJECTS_ASK_MS) {
      await new Promise(resolve => setTimeout(resolve, delay));
      if (Date.now() - since > UIMS_SUBJECTS_WAIT_MS) break;
      let status;
      try {
        const response = await fetch('/api/auth/uims/subjects-status', { credentials: 'same-origin', cache: 'no-store' });
        if (response.status === 401) { stop(); return hideNote(); }
        if (!response.ok) continue;
        status = await response.json();
      } catch (_) { continue; }
      if (status?.state === 'syncing') continue;
      stop();
      if (status?.state === 'failed') return uimsSubjectsNote(text.failed);
      if (status?.state !== 'done') return hideNote();
      // This page's list was drawn without them, so it is drawn again - unless that would take something from under the
      // account: a field being typed in, or a dialog or the guided tour open (the first visit opens one).
      const typing = document.activeElement?.matches?.('input, textarea, select, [contenteditable="true"]');
      const dialogOpen = [...document.querySelectorAll('[role="dialog"]')].some(dialog => dialog.getClientRects().length > 0);
      if (listsSubjects && !typing && !dialogOpen) return location.reload();
      return uimsSubjectsNote(listsSubjects ? text.readyRefresh : text.ready);
    }
    stop();
    hideNote();
  }
  document.addEventListener('DOMContentLoaded', () => { watchUimsSubjects(); });

  function enhanceDashboardShell() {
    document.querySelectorAll('.qp-topbar-brand').forEach(brand => brand.remove());
    applySidebarState();
    syncDashboardSidebar();
  }
  document.addEventListener('DOMContentLoaded', enhanceDashboardShell);

  const SIDEBAR_COLLAPSED_KEY = 'quizpulseSidebarCollapsed';
  function sidebarCollapsed() {
    try { return storageGet(SIDEBAR_COLLAPSED_KEY) === '1'; } catch (_) { return false; }
  }
  function applySidebarState() {
    const collapsed = sidebarCollapsed();
    document.documentElement?.classList.toggle('qp-sidebar-collapsed-prepaint', collapsed);
    document.body?.classList.toggle('qp-sidebar-collapsed', collapsed);
    document.querySelectorAll('[data-sidebar-collapse]').forEach(button => {
      button.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
      button.setAttribute('title', collapsed ? navigationText('showLabels') : navigationText('hideLabels'));
      button.innerHTML = collapsed ? '&#x203A;' : '&#x2039;';
    });
  }
  function setSidebarCollapsed(collapsed) {
    try { storageSet(SIDEBAR_COLLAPSED_KEY, collapsed ? '1' : '0'); } catch (_) {}
    applySidebarState();
  }

  // An admin whose organization is in its grace days is told when its access ends, at the top of the page's content -
  // below the top bar however a layout places it. Nobody else is: the server tells only admins their organization's
  // access (src/server/routes/auth.routes.js).
  function renderOrganizationGraceNotice(profile, role) {
    const content = document.querySelector('.qp-dashboard-main .qp-dashboard-content');
    // A page may hand over the bare account; the stored profile still knows its organization's access.
    const organization = profile?.organization ?? currentStudent()?.organization;
    let notice = document.querySelector('[data-organization-grace]');
    if (role !== 'admin' || organization?.status !== 'grace' || !content) {
      notice?.remove();
      return;
    }
    const ends = Date.parse(organization.graceEndsAt || '');
    const when = Number.isFinite(ends) ? new Date(ends).toLocaleDateString() : '';
    if (!notice) {
      notice = document.createElement('div');
      notice.className = 'qp-organization-grace';
      notice.setAttribute('role', 'status');
      notice.dataset.organizationGrace = '';
      content.prepend(notice);
    }
    notice.textContent = `Your organization's subscription has ended. Its access ends${when ? ` on ${when}` : ' soon'} unless the super admin renews it.`;
  }

  function syncDashboardSidebar(user = null) {
    const sidebar = document.querySelector('.qp-dashboard-sidebar');
    const nav = sidebar?.querySelector('.qp-dashboard-nav');
    if (!sidebar || !nav) return;
    const profile = user || currentStudent();
    const role = String(profile?.role || (teacherSession() ? teacherRole() : 'student')).toLowerCase();
    // The super admin uses only the administration pages; from anywhere else it goes to Organizations.
    if (role === 'super_admin' && !SUPER_ADMIN_PAGES.has(location.pathname)) {
      location.replace('/organizations');
      return;
    }
    // A group admin uses its group's page; from anywhere else it goes there.
    if (role === 'group_admin' && !GROUP_ADMIN_PAGES.has(location.pathname)) {
      location.replace('/group');
      return;
    }
    // An artist uses the studio; from anywhere else it goes there.
    if (role === 'artist' && !ARTIST_PAGES.has(location.pathname)) {
      location.replace('/character-management');
      return;
    }
    const personal = !PLATFORM_ACCOUNT_ROLES.includes(role) && isPersonalAccount(profile);
    if (personal && PERSONAL_BLOCKED_PAGES.has(location.pathname)) {
      location.replace('/dashboard');
      return;
    }
    const path = window.QuizPulseSidebar?.normalizedPath?.() || location.pathname;
    const logo = sidebar.querySelector('.qp-dashboard-logo');
    if (logo) {
      const onDashboard = path === '/dashboard';
      logo.href = role === 'super_admin' ? '/organizations' : role === 'group_admin' ? '/group' : role === 'artist' ? '/character-management' : '/dashboard';
      logo.classList.toggle('active', onDashboard);
      logo.setAttribute('aria-label', navigationText('home'));
      logo.setAttribute('title', navigationText('home'));
      if (onDashboard) logo.setAttribute('aria-current', 'page');
      else logo.removeAttribute('aria-current');
      logo.innerHTML = '<span class="qp-dashboard-logo-icon" aria-hidden="true">&#x26A1;</span><span class="qp-dashboard-logo-title">Quiz<strong>Pulse</strong></span>';
    }
    const sidebarRenderer = window.QuizPulseSidebar?.render;
    if (typeof sidebarRenderer !== 'function') return;
    sidebarRenderer({ sidebar, nav, role, path, text: navigationText, personal,
      lockedFeature: href => (PLATFORM_ACCOUNT_ROLES.includes(role) ? '' : planLockedFeatureForPath(href, profile)) });
    if (!sidebar.querySelector('[data-sidebar-collapse]')) {
      const collapseButton = document.createElement('button');
      collapseButton.type = 'button';
      collapseButton.className = 'qp-sidebar-collapse-btn';
      collapseButton.dataset.sidebarCollapse = '1';
      collapseButton.setAttribute('aria-label', navigationText('toggleSidebar'));
      collapseButton.addEventListener('click', () => setSidebarCollapsed(!sidebarCollapsed()));
      sidebar.insertBefore(collapseButton, nav);
    }
    applySidebarState();
    renderOrganizationGraceNotice(profile, role);
    guardLockedPage(profile, role);
    sidebar.setAttribute('aria-label', navigationText('mainMenu'));
    sidebar.querySelectorAll('.qp-space-chip').forEach(element => element.remove());
    document.dispatchEvent(new CustomEvent('quizpulse:navigation-updated', {
      detail: {
        role,
        accountKey: String(profile?.id || profile?.username || role || 'session')
      }
    }));
    // Messages, announcements, push and the guide belong to app users; the super admin only administers.
    if (!PLATFORM_ACCOUNT_ROLES.includes(role)) scheduleAccountBackgroundServices(profile);
  }

  let messageNotificationSocket = null;
  let messageSocketLoader = null;
  let messageNotificationSocketBound = false;
  let adaptiveChatUser = null;
  let adaptiveChatLoadPromise = null;
  let adaptiveChatSummaryTimer = 0;
  let adaptiveChatLauncherBound = false;
  const scheduledBackgroundAccounts = new Set();
  const messageNotificationTimers = new Map();
  const defaultPushSetupAccounts = new Set();

  function scheduleAccountBackgroundServices(user = null) {
    const accountId = String(user?.id || '');
    const livePath = ['/host', '/join', '/player'].some(path => location.pathname === path || location.pathname.startsWith(`${path}/`));
    if (!accountId || livePath || scheduledBackgroundAccounts.has(accountId)) return;
    scheduledBackgroundAccounts.add(accountId);
    // Chat follows the plan: without it there is no Messages button and no message alerts to set up, while the
    // announcements that share the socket still arrive.
    const chat = planAllowsFeature('chat', user);
    if (chat) setupAdaptiveChatLauncher(user);
    ensureGuideRuntime();
    const start = () => {
      startMessageNotifications(user);
      if (chat) enableDefaultMessagePush(user);
      checkForPost();
    };
    if (typeof window.requestIdleCallback === 'function') window.requestIdleCallback(start, { timeout: 1600 });
    else setTimeout(start, 850);
  }

  function chatSurfaceExcludedPath() {
    return ['/auth', '/host', '/join', '/player', '/preview', '/perspective', '/solo'].some(path => location.pathname === path || location.pathname.startsWith(`${path}/`));
  }

  // The guide rides along with the app shell: it is needed on the dashboard
  // (the chooser), in the creator (the tour), and in settings (the button).
  // Loaded once, after the page, so it never delays a paint.
  function ensureGuideRuntime() {
    if (OFFLINE || document.querySelector('script[data-quizpulse-guide]')) return;
    const styles = document.createElement('link');
    styles.rel = 'stylesheet';
    styles.href = '/css/quizpulse_guide.css?v=f34d55bbfbbd';
    styles.dataset.quizpulseGuideStyles = '1';
    document.head.appendChild(styles);
    for (const src of ['/js/quizpulse_guide.js?v=f34d55bbfbbd']) {
      const script = document.createElement('script');
      script.src = src;
      script.defer = true;
      script.dataset.quizpulseGuide = '1';
      document.head.appendChild(script);
    }
  }

  // A tour can end on a screen that is not the app shell - the quiz preview,
  // where a quiz is started - and that page never runs the account bootstrap
  // that loads this. So while a tour is in progress the runtime loads on any
  // page, or the tour would simply stop at the door.
  try {
    if (localStorage.getItem('quizpulseGuideProgress')) ensureGuideRuntime();
  } catch (_) {}

  function ensureAdaptiveChatStyles() {
    if (document.querySelector('link[data-quizpulse-chat-styles]')) return;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = '/css/quizpulse_chat.css?v=f34d55bbfbbd';
    link.dataset.quizpulseChatStyles = '1';
    document.head.appendChild(link);
  }

  function chatLauncherSummary(data = {}) {
    const items = [...(data.groups || []), ...(data.conversations || [])]
      .filter(item => Number(item.unreadCount || 0) > 0)
      .sort((a, b) => String(b.lastMessage?.createdAt || b.createdAt || '').localeCompare(String(a.lastMessage?.createdAt || a.createdAt || '')));
    const unread = items.reduce((total, item) => total + Number(item.unreadCount || 0), 0);
    return { items: items.slice(0, 3), unread };
  }

  function renderAdaptiveChatLauncher(data = {}) {
    const launcher = document.getElementById('qpAdaptiveChatLauncher');
    if (!launcher) return;
    const summary = chatLauncherSummary(data);
    syncHeaderNotificationCount(summary.unread);
    const avatars = summary.items.map(item => {
      const user = item.user;
      const face = avatarFace(user, { group: !!item.title });
      const motionClass = face.motionClass;
      if (face.picture) return `<span class="qp-chat-launcher-avatar"><img src="${escape(face.picture)}" alt="" /></span>`;
      return `<span class="qp-chat-launcher-avatar ${motionClass}" aria-hidden="true">${item.title ? '&#x1F465;' : escape(avatarEmoji(user?.avatar || 'fox', user?.avatarEmoji))}</span>`;
    }).join('');
    launcher.innerHTML = `<span class="qp-chat-launcher-icon" aria-hidden="true">&#x2709;</span><strong>Messages</strong><span class="qp-chat-launcher-avatars">${avatars}</span>${summary.unread ? `<b aria-label="${summary.unread} unread messages">${Math.min(99, summary.unread)}</b>` : ''}`;
  }

  async function refreshAdaptiveChatLauncher(data = null) {
    const launcher = document.getElementById('qpAdaptiveChatLauncher');
    if (!launcher) return;
    // A plan read after the button was drawn can leave chat out: the button goes rather than asking for chat.
    if (!planAllowsFeature('chat')) return launcher.remove();
    if (data) return renderAdaptiveChatLauncher(data);
    clearTimeout(adaptiveChatSummaryTimer);
    adaptiveChatSummaryTimer = setTimeout(async () => {
      try { renderAdaptiveChatLauncher(await api('/api/messages/lists')); } catch (_) {}
    }, 120);
  }

  function loadAdaptiveChatController() {
    if (window.QuizPulseChat?.open) return Promise.resolve(window.QuizPulseChat);
    if (adaptiveChatLoadPromise) return adaptiveChatLoadPromise;
    ensureAdaptiveChatStyles();
    adaptiveChatLoadPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = '/js/pages/quizpulse_chat_page.js?v=f34d55bbfbbd';
      script.async = true;
      script.onload = () => window.QuizPulseChat?.open ? resolve(window.QuizPulseChat) : reject(new Error('Chat could not be loaded'));
      script.onerror = () => reject(new Error('Chat could not be loaded'));
      document.head.appendChild(script);
    });
    return adaptiveChatLoadPromise;
  }

  async function openAdaptiveChat(request = {}) {
    if (chatSurfaceExcludedPath()) return;
    if (matchMedia('(max-width: 1024px)').matches && location.pathname !== '/chat') {
      const query = new URLSearchParams();
      if (request.type === 'group' && request.id) query.set('group', request.id);
      else if (request.id) query.set('user', request.id);
      location.href = `/chat${query.size ? `?${query}` : ''}`;
      return;
    }
    try {
      const controller = await loadAdaptiveChatController();
      await controller.open({ actor: adaptiveChatUser, request });
    } catch (error) { toast(error.message || 'Chat could not be loaded'); return; }
    offerMessagePush(adaptiveChatUser);
  }

  function setupAdaptiveChatLauncher(user = null) {
    adaptiveChatUser = user || adaptiveChatUser;
    if (!adaptiveChatUser?.id || chatSurfaceExcludedPath() || location.pathname === '/chat') return;
    ensureAdaptiveChatStyles();
    let launcher = document.getElementById('qpAdaptiveChatLauncher');
    if (!launcher) {
      launcher = document.createElement('button');
      launcher.type = 'button';
      launcher.id = 'qpAdaptiveChatLauncher';
      launcher.className = 'qp-chat-launcher';
      launcher.setAttribute('aria-label', 'Open messages');
      launcher.setAttribute('aria-expanded', 'false');
      launcher.setAttribute('aria-controls', 'qpAdaptiveChatSurface');
      launcher.innerHTML = '<span class="qp-chat-launcher-icon" aria-hidden="true">&#x2709;</span><strong>Messages</strong>';
      launcher.addEventListener('click', () => openAdaptiveChat());
      document.body.appendChild(launcher);
    }
    if (!adaptiveChatLauncherBound) {
      adaptiveChatLauncherBound = true;
      document.addEventListener('quizpulse:open-chat', event => openAdaptiveChat(event.detail || {}));
      document.addEventListener('click', event => {
        const link = event.target.closest?.('a[href^="/chat"]');
        if (!link || event.defaultPrevented || event.button > 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        if (matchMedia('(max-width: 1024px)').matches) return;
        const url = new URL(link.href, location.origin);
        event.preventDefault();
        const group = String(url.searchParams.get('group') || '').slice(0, 100);
        const direct = String(url.searchParams.get('user') || '').slice(0, 100);
        openAdaptiveChat(group ? { type: 'group', id: group } : direct ? { type: 'direct', id: direct } : {});
      }, true);
    }
    const schedule = window.requestIdleCallback || (callback => setTimeout(callback, 700));
    schedule(() => refreshAdaptiveChatLauncher());
    try {
      const pending = sessionStorage.getItem('quizpulsePendingChat');
      if (pending && !matchMedia('(max-width: 1024px)').matches) {
        sessionStorage.removeItem('quizpulsePendingChat');
        const request = JSON.parse(pending);
        setTimeout(() => openAdaptiveChat(request && typeof request === 'object' ? request : {}), 0);
      }
    } catch (_) {}
  }

  function loadMessageSocketClient() {
    if (typeof window.io === 'function') return Promise.resolve(window.io);
    if (messageSocketLoader) return messageSocketLoader;
    messageSocketLoader = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = '/socket.io/socket.io.min.js';
      script.async = true;
      script.onload = () => typeof window.io === 'function' ? resolve(window.io) : reject(new Error('Messaging is unavailable'));
      script.onerror = () => reject(new Error('Messaging is unavailable'));
      document.head.appendChild(script);
    });
    return messageSocketLoader;
  }

  function dismissMessageNotification(element) {
    if (!element) return;
    const key = String(element.dataset.notificationKey || '');
    clearTimeout(messageNotificationTimers.get(key));
    messageNotificationTimers.delete(key);
    element.classList.add('is-leaving');
    setTimeout(() => element.remove(), 180);
  }

  function showMessageNotification(payload = {}) {
    if (['/host', '/join', '/player'].some(path => location.pathname === path || location.pathname.startsWith(`${path}/`))) return;
    if (location.pathname === '/chat') return;
    if (document.body.classList.contains('qp-chat-surface-open')) return;
    const notification = payload.notification;
    if (!notification || !notification.conversationId) return;
    const key = `${notification.type}:${notification.conversationId}:${payload.message?.id || notification.createdAt || Date.now()}`;
    let stack = document.querySelector('.qp-message-notification-stack');
    if (!stack) {
      stack = document.createElement('section');
      stack.className = 'qp-message-notification-stack';
      stack.setAttribute('aria-label', 'Message notifications');
      stack.setAttribute('aria-live', 'polite');
      document.body.appendChild(stack);
    }
    if (stack.querySelector(`[data-notification-key="${CSS.escape(key)}"]`)) return;
    while (stack.children.length >= 3) dismissMessageNotification(stack.firstElementChild);

    const item = document.createElement('article');
    item.className = 'qp-message-notification';
    item.dataset.notificationKey = key;
    item.dataset.type = notification.type === 'group' ? 'group' : 'direct';
    item.dataset.conversationId = String(notification.conversationId).slice(0, 100);

    const open = document.createElement('button');
    open.type = 'button';
    open.className = 'qp-message-notification-open';
    open.setAttribute('aria-label', `Open message from ${String(notification.title || 'QuizPulse user')}`);

    const avatar = document.createElement('span');
    const senderFace = avatarFace(notification.sender, { group: notification.type === 'group' });
    const senderMotionClass = senderFace.motionClass;
    avatar.className = `qp-message-notification-avatar ${senderMotionClass}`;
    if (senderFace.picture) {
      const image = document.createElement('img');
      image.src = senderFace.picture;
      image.alt = '';
      avatar.appendChild(image);
    } else {
      avatar.textContent = notification.type === 'group' ? '\u{1F465}' : String(notification.sender?.avatarEmoji || '\u{1F464}');
    }
    const copy = document.createElement('span');
    copy.className = 'qp-message-notification-copy';
    const title = document.createElement('strong');
    title.textContent = String(notification.title || 'New message');
    const context = document.createElement('small');
    context.textContent = notification.context ? `${notification.context}: ${notification.preview || ''}` : String(notification.preview || 'New message');
    copy.append(title, context);
    open.append(avatar, copy);

    const actions = document.createElement('span');
    actions.className = 'qp-message-notification-actions';
    const mute = document.createElement('button');
    mute.type = 'button';
    mute.className = 'qp-message-notification-action';
    mute.title = 'Mute this chat';
    mute.setAttribute('aria-label', 'Mute notifications from this chat');
    mute.textContent = '\u{1F515}';
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'qp-message-notification-action';
    close.title = 'Dismiss';
    close.setAttribute('aria-label', 'Dismiss notification');
    close.textContent = '\u00D7';
    actions.append(mute, close);
    item.append(open, actions);
    stack.appendChild(item);

    open.addEventListener('click', () => {
      dismissMessageNotification(item);
      openAdaptiveChat({ type: notification.type === 'group' ? 'group' : 'direct', id: String(notification.conversationId || '') });
    });
    close.addEventListener('click', () => dismissMessageNotification(item));
    mute.addEventListener('click', async () => {
      mute.disabled = true;
      const type = item.dataset.type;
      const id = item.dataset.conversationId;
      try {
        await api(`/api/messages/preferences/${type}/${encodeURIComponent(id)}`, {
          method: 'PATCH',
          body: JSON.stringify({ muted: true })
        });
        document.querySelectorAll('.qp-message-notification').forEach(candidate => {
          if (candidate.dataset.type === type && candidate.dataset.conversationId === id) dismissMessageNotification(candidate);
        });
        toast('Chat notifications muted');
      } catch (error) {
        mute.disabled = false;
        toast(error.message || 'Could not mute this chat');
      }
    });
    requestAnimationFrame(() => item.classList.add('is-visible'));
    messageNotificationTimers.set(key, setTimeout(() => dismissMessageNotification(item), 7000));
    refreshAdaptiveChatLauncher();
  }

  async function getMessageSocket(user = null) {
    if (['/host', '/join', '/player'].some(path => location.pathname === path || location.pathname.startsWith(`${path}/`))
      || !user?.id || !document.querySelector('.qp-dashboard-sidebar')) return null;
    try {
      const socketFactory = await loadMessageSocketClient();
      if (!messageNotificationSocket) messageNotificationSocket = socketFactory({ transports: ['websocket'], upgrade: false, rememberUpgrade: true, timeout: 10000 });
      if (!messageNotificationSocketBound) {
        messageNotificationSocketBound = true;
        // Announcements ride the socket the dashboard pages already hold, so an
        // admin pressing Send reaches open pages at once. Live-game pages never
        // create this socket, which is what keeps a popup out of a quiz.
        messageNotificationSocket.on('quizpulse:post', post => showPost(post));
        messageNotificationSocket.on('quizpulse:post-retired', payload => {
          if (document.getElementById('qpPostPopup') && storageGet(SEEN_POST_KEY, '') === String(payload?.id || '')) dismissPost();
        });
        messageNotificationSocket.on('quizpulse:chat-message', showMessageNotification);
        messageNotificationSocket.on('quizpulse:chat-message', () => refreshAdaptiveChatLauncher());
        messageNotificationSocket.on('quizpulse:chat-preference', payload => {
          if (payload?.preference?.muted) document.querySelectorAll('.qp-message-notification').forEach(item => {
            if (item.dataset.type === payload.type && item.dataset.conversationId === String(payload.conversationId || '')) dismissMessageNotification(item);
          });
          refreshAdaptiveChatLauncher();
        });
      }
      return messageNotificationSocket;
    } catch (_) { return null; }
  }

  async function startMessageNotifications(user = null) {
    await getMessageSocket(user);
  }

  function pushApplicationKey(value) {
    const raw = String(value || '');
    const padded = `${raw.replace(/-/g, '+').replace(/_/g, '/')}${'='.repeat((4 - raw.length % 4) % 4)}`;
    const binary = atob(padded);
    return Uint8Array.from(binary, character => character.charCodeAt(0));
  }

  async function messagePushRegistration() {
    if (!window.isSecureContext || !('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return null;
    return await navigator.serviceWorker.getRegistration('/') || navigator.serviceWorker.register('/sw.js?v=f34d55bbfbbd', { scope: '/' });
  }

  function supportsMessagePush() {
    return window.isSecureContext && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  }

  function messagePushPreferenceKey(user = currentStudent()) {
    return `quizpulsePushDisabled:${String(user?.id || user?.username || 'account')}`;
  }

  async function messagePushStatus() {
    const registration = await messagePushRegistration();
    if (!registration) return { supported: false, enabled: false, permission: 'unsupported' };
    const subscription = await registration.pushManager.getSubscription();
    return {
      supported: true,
      enabled: !!subscription && Notification.permission === 'granted',
      permission: Notification.permission
    };
  }

  async function setMessagePushEnabled(enabled, options = {}) {
    let permission = 'Notification' in window ? Notification.permission : 'unsupported';
    if (enabled && permission === 'denied') throw new Error('Allow notifications in your browser settings first');
    if (enabled && permission !== 'granted' && permission !== 'unsupported') permission = await Notification.requestPermission();
    if (enabled && permission !== 'granted') throw new Error('Notification permission was not enabled');
    const registration = enabled
      ? await messagePushRegistration()
      : supportsMessagePush() ? await navigator.serviceWorker.getRegistration('/') : null;
    if (!registration) {
      if (!enabled || options.quiet) return { supported: supportsMessagePush(), enabled: false, permission };
      throw new Error('Device notifications are not supported in this browser');
    }
    let subscription = await registration.pushManager.getSubscription();
    if (!enabled) {
      if (subscription) {
        await api('/api/messages/push-subscription', {
          method: 'DELETE',
          body: JSON.stringify({ endpoint: subscription.endpoint })
        });
        await subscription.unsubscribe();
      }
      if (!options.transient) storageSet(messagePushPreferenceKey(), '1');
      return { supported: true, enabled: false, permission: Notification.permission };
    }
    const config = await api('/api/messages/push-config');
    if (!config?.publicKey) throw new Error('Device notifications are unavailable');
    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: pushApplicationKey(config.publicKey)
      });
    }
    await api('/api/messages/push-subscription', {
      method: 'POST',
      body: JSON.stringify({ subscription: subscription.toJSON() })
    });
    storageRemove(messagePushPreferenceKey());
    return { supported: true, enabled: true, permission: 'granted' };
  }

  // On page load this only renews a subscription the browser already allows; it never asks. Asking is left to
  // offerMessagePush, when the user opens Messages - a prompt that opened on its own took over whatever page (or
  // confirm dialog, which it shares) the user was in the middle of.
  async function enableDefaultMessagePush(user = null) {
    const accountId = String(user?.id || '');
    const livePath = ['/host', '/join', '/player'].some(path => location.pathname === path || location.pathname.startsWith(`${path}/`));
    if (!accountId || livePath || defaultPushSetupAccounts.has(accountId) || storageGet(messagePushPreferenceKey(user), '') === '1') return;
    defaultPushSetupAccounts.add(accountId);
    let status;
    try { status = await messagePushStatus(); } catch (_) { return; }
    if (!status.supported || status.enabled || status.permission !== 'granted') return;
    try { await setMessagePushEnabled(true, { quiet: true }); } catch (_) {}
  }

  // Asked once per account on this browser, right after the user opens Messages. "Not now" is final here;
  // Settings and the chat privacy dialog still turn notifications on.
  async function offerMessagePush(user = currentStudent()) {
    const accountId = String(user?.id || '');
    const askedKey = `quizpulsePushAsked:${accountId}`;
    if (!accountId || storageGet(askedKey, '') === '1' || storageGet(messagePushPreferenceKey(user), '') === '1') return;
    let status;
    try { status = await messagePushStatus(); } catch (_) { return; }
    if (!status.supported || status.enabled || status.permission !== 'default') return;
    // Never over another question: the confirm dialog is shared, and taking it over would leave that one unanswered.
    if (document.hidden || document.querySelector('#qpGlobalConfirm.show')) return;
    storageSet(askedKey, '1');
    const allowed = await confirmDialog({
      title: 'Turn on notifications?',
      message: 'Get new message alerts on this computer even when QuizPulse is closed.',
      confirmText: 'Allow notifications',
      cancelText: 'Not now'
    });
    if (!allowed) return;
    try {
      await setMessagePushEnabled(true);
      toast('Device notifications enabled');
    } catch (error) {
      toast(error.message || 'Could not enable device notifications');
    }
  }

  const performanceModes = ['normal', 'high'];
  function normalizePerformanceMode(mode) {
    const value = String(mode || '').toLowerCase().replace(/[_\s]+/g, '-');
    return ['high', 'large', 'high-performance'].includes(value) ? 'high' : 'normal';
  }
  function canManagePerformanceMode() {
    return String(currentStudent()?.role || '').toLowerCase() === 'admin';
  }
  function performanceMode() {
    if (!canManagePerformanceMode()) return 'normal';
    return normalizePerformanceMode(storageGet('quizpulsePerformanceMode', 'normal') || 'normal');
  }
  function setPerformanceMode(mode) {
    const value = canManagePerformanceMode() ? normalizePerformanceMode(mode) : 'normal';
    if (canManagePerformanceMode()) storageSet('quizpulsePerformanceMode', value);
    else storageRemove('quizpulsePerformanceMode');
    applyPerformanceMode(value);
    return value;
  }
  function applyPerformanceMode(mode = performanceMode()) {
    const value = canManagePerformanceMode() ? normalizePerformanceMode(mode) : 'normal';
    if (!canManagePerformanceMode()) storageRemove('quizpulsePerformanceMode');
    document.documentElement.dataset.qpPerformance = value;
    document.body?.classList.toggle('qp-high-performance', value === 'high');
    document.querySelectorAll('[data-performance-mode]').forEach(btn => btn.classList.toggle('active', normalizePerformanceMode(btn.dataset.performanceMode) === value));
    document.querySelectorAll('[data-performance-label]').forEach(el => { el.textContent = value === 'high' ? 'High performance' : 'Normal'; });
    return value;
  }
  function performanceControlsHtml(compact = false) {
    if (!canManagePerformanceMode()) return '';
    const value = performanceMode();
    return `<div class="qp-performance-choice ${compact ? 'compact' : ''}" role="group" aria-label="Performance mode">
      <button type="button" data-performance-mode="normal" class="${value === 'normal' ? 'active' : ''}">Normal</button>
      <button type="button" data-performance-mode="high" class="${value === 'high' ? 'active' : ''}">High performance</button>
    </div>`;
  }
  function bindPerformanceControls(root = document) {
    if (!canManagePerformanceMode()) {
      applyPerformanceMode('normal');
      return;
    }
    root.querySelectorAll('[data-performance-mode]').forEach(btn => {
      if (btn.dataset.performanceBound === '1') return;
      btn.dataset.performanceBound = '1';
      btn.addEventListener('click', () => {
        const mode = setPerformanceMode(btn.dataset.performanceMode);
        toast(mode === 'high' ? 'High performance mode' : 'Normal mode');
      });
    });
    applyPerformanceMode();
  }

  const colors = ['red', 'blue', 'yellow', 'green'];

  const answerShapes = [
    { icon: '▲', label: 'Triangle' },
    { icon: '◆', label: 'Diamond' },
    { icon: '●', label: 'Circle' },
    { icon: '■', label: 'Square' }
  ];
  function answerShape(index) {
    return answerShapes[index % answerShapes.length];
  }
  const avatarList = [
    { id: 'fox', name: 'Fox', emoji: '🦊' },
    { id: 'robot', name: 'Robot', emoji: '🤖' },
    { id: 'dragon', name: 'Dragon', emoji: '🐉' },
    { id: 'cat', name: 'Cat', emoji: '🐱' },
    { id: 'lion', name: 'Lion', emoji: '🦁' },
    { id: 'panda', name: 'Panda', emoji: '🐼' },
    { id: 'owl', name: 'Owl', emoji: '🦉' },
    { id: 'rocket', name: 'Rocket', emoji: '🚀' },
    { id: 'ghost', name: 'Ghost', emoji: '👻' },
    { id: 'wizard', name: 'Wizard', emoji: '🧙' }
  ];
  const premiumAvatarStyles = new Set();
  let cosmeticsRuntimePromise = null;
  function ensureCosmeticsRuntime() {
    if (window.QuizPulseCosmetics) return Promise.resolve(window.QuizPulseCosmetics);
    if (cosmeticsRuntimePromise) return cosmeticsRuntimePromise;
    cosmeticsRuntimePromise = new Promise((resolve, reject) => {
      if (!document.querySelector('link[data-qp-cosmetics]')) {
        const stylesheet = document.createElement('link');
        stylesheet.rel = 'stylesheet';
        stylesheet.href = '/css/quizpulse_cosmetics.css?v=f34d55bbfbbd';
        stylesheet.dataset.qpCosmetics = '1';
        document.head.appendChild(stylesheet);
      }
      const existing = document.querySelector('script[data-qp-cosmetics]');
      if (existing) {
        existing.addEventListener('load', () => resolve(window.QuizPulseCosmetics), { once: true });
        existing.addEventListener('error', reject, { once: true });
        return;
      }
      const script = document.createElement('script');
      script.src = '/js/quizpulse_cosmetics.js?v=f34d55bbfbbd';
      script.defer = true;
      script.dataset.qpCosmetics = '1';
      script.onload = () => resolve(window.QuizPulseCosmetics);
      script.onerror = reject;
      document.head.appendChild(script);
    });
    return cosmeticsRuntimePromise;
  }
  function cosmeticAvatarClass(id) {
    const slug = String(id || 'fox').toLowerCase().replace(/[^a-z0-9_-]+/g, '-').slice(0, 96) || 'fox';
    ensureCosmeticsRuntime().catch(() => {});
    return `qp-character-slot qp-character-id--${slug}`;
  }
  function ensurePremiumAvatarStyle(id) {
    const safeId = String(id || '').toLowerCase();
    if (!/^premium_[a-z0-9_]{2,80}$/.test(safeId)) return '';
    const slug = safeId.replace(/^premium_/, '').replace(/_/g, '-');
    const className = `qp-avatar-dynamic-${slug}`;
    if (!premiumAvatarStyles.has(className) && typeof document !== 'undefined') {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = `/avatar-style/${encodeURIComponent(safeId)}.css`;
      link.dataset.qpPremiumAvatar = safeId;
      (document.head || document.documentElement).appendChild(link);
      premiumAvatarStyles.add(className);
    }
    return `qp-avatar-premium ${className}`;
  }
  function avatarMotionClass(id) {
    return [ensurePremiumAvatarStyle(id), cosmeticAvatarClass(id)].filter(Boolean).join(' ');
  }
  // Which face to show for a person, in one place because four screens ask.
  //
  // A picture someone uploaded wins over their character: uploading one is how
  // they said they did not want the character. The character class has to come
  // off with it, because the cosmetics runtime mounts a character into any
  // .qp-character-slot and would paint straight over the picture.
  //
  // Every caller used to write `motionClass ? '' : picture`, meaning "show the
  // picture only when there is no character class". cosmeticAvatarClass()
  // always returns a class - it falls back to fox - so that condition was never
  // true and an uploaded picture never appeared anywhere in the app.
  function avatarFace(user, options = {}) {
    if (options.group) return { picture: '', motionClass: '', emoji: '\u{1F465}' };
    const picture = safeMediaUrl(user?.profileImageUrl || '', 'image/');
    if (picture) return { picture, motionClass: '', emoji: '' };
    const id = user?.avatar || 'fox';
    return { picture: '', motionClass: avatarMotionClass(id), emoji: avatarEmoji(id, user?.avatarEmoji) };
  }
  function characterHtml(id, explicitEmoji = '', context = 'default') {
    ensureCosmeticsRuntime().catch(() => {});
    if (window.QuizPulseCosmetics) return window.QuizPulseCosmetics.characterHtml(id, avatarEmoji(id, explicitEmoji), context);
    return `<span class="${cosmeticAvatarClass(id)} qp-character-context-${escape(context)}" data-qp-character-id="${escape(id || 'fox')}" aria-hidden="true">${escape(avatarEmoji(id, explicitEmoji))}</span>`;
  }
  // How an organization names its academic levels. A school keeps its classes and sub-classes in one hidden college
  // and department made for it - a hierarchy marks that college schoolFrame (school-structure.service.js) - and calls
  // its College Manager a Deputy. Pages ask for the words here rather than writing College, Stage or Group.
  const ACADEMIC_TERMS = Object.freeze({
    university: Object.freeze({ school: false, college: 'College', colleges: 'Colleges', department: 'Department', departments: 'Departments',
      stage: 'Stage', stages: 'Stages', group: 'Group', groups: 'Groups', collegeManager: 'College Manager', collegeManagers: 'College Managers' }),
    school: Object.freeze({ school: true, college: 'School', colleges: 'School', department: 'School', departments: 'School',
      stage: 'Class', stages: 'Classes', group: 'Sub-class', groups: 'Sub-classes', collegeManager: 'Deputy', collegeManagers: 'Deputies' })
  });

  // source is a structure ('school' or 'university'), an academic hierarchy, or nothing - then the signed-in member's
  // organization type.
  function academicTerms(source) {
    const school = source === 'school'
      || (Array.isArray(source) && source.some(course => course?.schoolFrame === true))
      || (source === undefined && String(currentStudent()?.organization?.type || '') === 'school');
    return school ? ACADEMIC_TERMS.school : ACADEMIC_TERMS.university;
  }

  function titleHtml(id, fallbackText = '') {
    ensureCosmeticsRuntime().catch(() => {});
    return window.QuizPulseCosmetics ? window.QuizPulseCosmetics.titleHtml(id, fallbackText) : escape(fallbackText);
  }
  const questionTypes = [
    { id: 'mcq', label: 'Multiple Choice', icon: '🔴' },
    { id: 'truefalse', label: 'True / False', icon: '✅' },
    { id: 'multiselect', label: 'Multiple Select', icon: '☑️' },
    { id: 'order', label: 'Order', icon: '↕️' },
    { id: 'type', label: 'Type Answer', icon: '⌨️' },
    { id: 'hotspot', label: 'Pin on Image', icon: '📍' },
    { id: 'slider', label: 'Slider / Bar', icon: '🎚️' },
    { id: 'matching', label: 'Matching / Connect Pairs', icon: '🔗' },
    { id: 'fillblank', label: 'Fill in the Blank', icon: '✍️' },
    { id: 'poll', label: 'Poll / Survey', icon: '📊' },
    { id: 'wordcloud', label: 'Word Cloud', icon: '☁️' }
  ];

  const QUESTION_STYLE_TYPES = Object.freeze(['matching', 'fillblank', 'type']);
  const DEFAULT_QUESTION_STYLES = Object.freeze({ matching: 'old', fillblank: 'old', type: 'old' });
  let questionStyles = { ...DEFAULT_QUESTION_STYLES };
  let questionStylesRequest = null;
  let questionStylesLoaded = false;

  function normalizeQuestionStyles(value = {}) {
    const source = value && typeof value === 'object' ? value : {};
    return Object.fromEntries(QUESTION_STYLE_TYPES.map(type => [type, source[type] === 'new' ? 'new' : 'old']));
  }

  function questionStyleFor(type) {
    return questionStyles[String(type || '').toLowerCase()] === 'new' ? 'new' : 'old';
  }

  function usesNewQuestionStyle(type) {
    return questionStyleFor(type) === 'new';
  }

  async function refreshQuestionStyles(force = false) {
    if (questionStylesLoaded && !force) return { ...questionStyles };
    if (questionStylesRequest && !force) return questionStylesRequest;
    questionStylesRequest = (async () => {
      try {
        const response = OFFLINE ? null : await fetch('/api/settings/question-styles', { cache: 'no-store', signal: AbortSignal.timeout(3000) });
        if (response?.ok) questionStyles = normalizeQuestionStyles((await response.json()).questionStyles);
      } catch (_) { /* Old stays the safe default when the setting cannot be loaded. */ }
      finally {
        questionStylesLoaded = true;
        questionStylesRequest = null;
      }
      document.dispatchEvent(new CustomEvent('quizpulse:question-styles-ready', { detail: { ...questionStyles } }));
      return { ...questionStyles };
    })();
    return questionStylesRequest;
  }

  // Begin early so live questions and the creator normally render the chosen style on their first paint.
  refreshQuestionStyles().catch(() => {});



  const TEACHING_SPACE_KEY = 'quizpulseTeachingSpace';
  function currentAccountStorageKey() {
    try {
      const user = currentStudent();
      return String(user?.id || user?.username || '').trim();
    } catch (_) { return ''; }
  }
  function currentTeachingSpace() {
    try {
      const value = JSON.parse(storageGet(TEACHING_SPACE_KEY, 'null') || 'null');
      if (!value || typeof value !== 'object') return null;
      const ownerId = String(value.ownerId || '').trim();
      const currentOwnerId = currentAccountStorageKey();
      if (!ownerId || (currentOwnerId && ownerId !== currentOwnerId)) return null;
      const courseId = String(value.courseId || '').trim();
      const subjectId = String(value.subjectId || '').trim();
      if (!courseId || !subjectId) return null;
      return {
        ownerId,
        courseId,
        courseName: String(value.courseName || '').trim(),
        subjectId,
        subjectName: String(value.subjectName || '').trim()
      };
    } catch (_) { return null; }
  }

  function setTeachingSpace(space) {
    const safe = {
      ownerId: currentAccountStorageKey(),
      courseId: String(space?.courseId || '').trim(),
      courseName: String(space?.courseName || '').trim(),
      subjectId: String(space?.subjectId || '').trim(),
      subjectName: String(space?.subjectName || '').trim()
    };
    if (!safe.ownerId || !safe.courseId || !safe.subjectId) return clearTeachingSpace();
    storageSet(TEACHING_SPACE_KEY, JSON.stringify(safe));
    return safe;
  }

  function clearTeachingSpace() {
    storageRemove(TEACHING_SPACE_KEY);
    return null;
  }

  function clearWorkspaceSelectionCache() {
    clearTeachingSpace();
    try {
      storageRemove('quizpulseActiveCollegeId');
      storageKeys().forEach(key => {
        if (key.startsWith('quizpulseActiveCollegeId:')) storageRemove(key);
      });
    } catch (_) {}
  }

  function withTeachingSpaceUrl(url, modeFallback = '') {
    const space = currentTeachingSpace();
    const absolute = String(url || '/creator');
    let parsed;
    try { parsed = new URL(absolute, location.origin); }
    catch (_) { return absolute; }
    if (modeFallback && !parsed.searchParams.get('mode')) parsed.searchParams.set('mode', modeFallback);
    if (space?.courseId) parsed.searchParams.set('courseId', space.courseId);
    if (space?.subjectId) parsed.searchParams.set('subjectId', space.subjectId);
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  }

  function teacherPin() {
    storageRemove('quizpulseTeacherPin');
    return '';
  }

  function setTeacherPin(value) {
    const pin = String(value || '').trim();
    if (pin) storageSet('quizpulseTeacherPin', pin);
    else storageRemove('quizpulseTeacherPin');
  }

  function teacherSession() {
    storageRemove('quizpulseTeacherSession');
    return '';
  }

  function setTeacherSession(token) {
    const value = String(token || '').trim();
    if (value) storageSet('quizpulseTeacherSession', value);
    else {
      storageRemove('quizpulseTeacherSession');
      storageRemove('quizpulseTeacherRole');
    }
  }

  function teacherRole() {
    return storageGet('quizpulseTeacherRole', 'teacher') || 'teacher';
  }

  function setTeacherRole(role) {
    const value = String(role || '').trim();
    if (value) storageSet('quizpulseTeacherRole', value);
    else storageRemove('quizpulseTeacherRole');
  }

  async function logoutTeacher() {
    try {
      await fetch('/api/teacher/logout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin', body: '{}' });
    } catch (_) {}
    setTeacherSession('');
    setTeacherRole('');
    setStudentSession('');
    setCurrentStudent(null);
  }

  function studentSession() {
    return storageGet('quizpulseStudentSession') || '';
  }

  function setStudentSession(token) {
    const value = String(token || '').trim();
    if (value) storageSet('quizpulseStudentSession', value === 'cookie' ? 'cookie' : value);
    else storageRemove('quizpulseStudentSession');
  }

  function currentStudent() {
    try { return JSON.parse(storageGet('quizpulseStudentProfile', 'null') || 'null'); }
    catch (_) { return null; }
  }

  function setCurrentStudent(user) {
    if (user) storageSet('quizpulseStudentProfile', JSON.stringify(user));
    else { storageRemove('quizpulseStudentProfile'); recentProfile = null; }
  }

  // The page guard, the account chip and the onboarding guide each asked for the signed-in
  // account in the first second of a page, three /api/auth/me requests. They now share an answer
  // that is a few seconds old at most. Anything that needs a fresh read still calls
  // refreshStudentProfile directly.
  let recentProfile = null;
  async function recentStudentProfile(maxAgeMs = 10000) {
    if (studentProfileRefreshPromise) return studentProfileRefreshPromise;
    if (recentProfile && Date.now() - recentProfile.at < maxAgeMs) return recentProfile.user;
    return refreshStudentProfile();
  }

  function offlineRefusal() {
    return Object.assign(new Error('Not available in the offline quiz maker'), { status: 0, offline: true });
  }

  async function authApi(url, options = {}) {
    if (OFFLINE) throw offlineRefusal();
    const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
    const response = await fetch(url, { ...options, headers, credentials: 'same-origin' });
    const text = await response.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch (_) { data = text ? { error: text } : null; }
    if (!response.ok) throw new Error(data?.error || `Request failed: ${response.status}`);
    return data;
  }

  let studentProfileRefreshPromise = null;

  // Why the last session ended, kept just long enough for the sign-in page to
  // say it once. Without this a student whose account was opened on another
  // device is dropped on a blank sign-in screen with no idea what happened.
  const SIGN_OUT_REASON_KEY = 'quizpulseSignOutReason';
  // The server says why with a cookie of its own (SIGNED_OUT_COOKIE_NAME), because the answer that carries the reason
  // is also the answer that signs this browser out, and it is not always the one this page was waiting on.
  const SIGNED_OUT_COOKIE_NAME = 'quizpulse_signed_out';
  const SIGN_OUT_REASONS = {
    SIGNED_IN_ELSEWHERE: 'You were signed out because your account was used on another device.',
    ORGANIZATION_NOT_OPEN: 'Your organization\'s access has ended. Contact the super admin.'
  };

  function readSignedOutCookie() {
    try {
      if (typeof document === 'undefined' || typeof document.cookie !== 'string') return '';
      const name = `${SIGNED_OUT_COOKIE_NAME}=`;
      const entry = document.cookie.split(/;\s*/).find(item => item.startsWith(name));
      return entry ? decodeURIComponent(entry.slice(name.length)) : '';
    } catch (_) {
      return '';
    }
  }

  function forgetSignedOutCookie() {
    try {
      if (typeof document !== 'undefined') document.cookie = `${SIGNED_OUT_COOKIE_NAME}=; path=/; max-age=0; SameSite=Lax`;
    } catch (_) {}
  }

  function noteSignOutReason(message) {
    if (message) storageSet(SIGN_OUT_REASON_KEY, String(message));
  }

  // Said once: whichever of the two said it, both are forgotten on the way out.
  function takeSignOutReason() {
    const remembered = storageGet(SIGN_OUT_REASON_KEY, '') || '';
    const code = readSignedOutCookie();
    if (remembered) storageRemove(SIGN_OUT_REASON_KEY);
    if (code) forgetSignedOutCookie();
    return remembered || SIGN_OUT_REASONS[code] || '';
  }

  async function refreshStudentProfile() {
    if (studentProfileRefreshPromise) return studentProfileRefreshPromise;
    studentProfileRefreshPromise = (async () => {
      try {
        const preloaded = window.__quizpulseAuthMePromise;
        window.__quizpulseAuthMePromise = null;
        const data = preloaded ? await preloaded : await authApi('/api/auth/me');
        if (!data?.user) {
          // A preloaded refusal arrives as a body rather than a thrown error,
          // so the reason is lifted out of it here instead.
          const refusal = new Error(data?.error || 'Sign in required');
          refusal.code = data?.code || '';
          throw refusal;
        }
        setStudentSession('cookie');
        // An admin's profile keeps its organization's access, for the grace notice - kept, remembered and returned,
        // since pages pass the returned profile on to the sidebar.
        // Its plan is kept too, so pages lock what the plan leaves out without asking again.
        // Its group travels with it too (src/server/groups.service.js), so the creator and the library can offer the
        // group's shelf without asking again.
        const profile = {
          ...data.user,
          ...(data.group ? { group: data.group } : {}),
          ...(data.organization ? { organization: data.organization, ...(data.plan ? { plan: data.plan } : {}) } : {})
        };
        setCurrentStudent(profile);
        recentProfile = { user: profile, at: Date.now() };
        // Shown as soon as the profile is known, whenever this page syncs its sidebar.
        renderOrganizationGraceNotice(profile, String(profile?.role || '').toLowerCase());
        applyPlanToPage(profile);
        return profile;
      } catch (error) {
        // Said once on the sign-in page: signed in elsewhere, or an organization whose access has ended.
        if (['SIGNED_IN_ELSEWHERE', 'ORGANIZATION_NOT_OPEN'].includes(error?.code)) noteSignOutReason(error.message);
        setStudentSession('');
        setCurrentStudent(null);
        return null;
      }
    })();
    try {
      return await studentProfileRefreshPromise;
    } finally {
      studentProfileRefreshPromise = null;
    }
  }

  async function logoutStudent() {
    try { await setMessagePushEnabled(false, { quiet: true, transient: true }); } catch (_) {}
    try { await authApi('/api/auth/logout', { method: 'POST', body: '{}' }); } catch (_) {}
    setStudentSession('');
    setCurrentStudent(null);
  }

  async function requireTeacherPage() {
    const user = await refreshStudentProfile();
    const role = String(user?.role || '').toLowerCase();
    if (role === 'teacher' || role === 'college_manager' || role === 'admin') return true;
    location.replace('/');
    return false;
  }

  async function requireCreatorAccountPage() {
    const user = await refreshStudentProfile();
    if (user) return { role: String(user.role || 'student').toLowerCase(), user };
    location.replace('/');
    return false;
  }


  async function requireAdminPage() {
    const actor = await requireCreatorAccountPage();
    if (!actor) return false;
    if (String(actor.role || '').toLowerCase() === 'admin') return actor;
    toast('Admin account required');
    location.replace('/dashboard');
    return false;
  }

  async function requireAcademicManagerPage() {
    const actor = await requireCreatorAccountPage();
    if (!actor) return false;
    if (['admin', 'college_manager'].includes(String(actor.role || '').toLowerCase())) return actor;
    toast('Admin or College Manager account required');
    location.replace('/dashboard');
    return false;
  }

  async function requireSuperAdminPage() {
    const actor = await requireCreatorAccountPage();
    if (!actor) return false;
    if (String(actor.role || '').toLowerCase() === 'super_admin') return actor;
    toast('Super admin account required');
    location.replace('/dashboard');
    return false;
  }

  // The Shop's studio: the super admin's and its artists'.
  async function requireShopEditorPage() {
    const actor = await requireCreatorAccountPage();
    if (!actor) return false;
    if (['super_admin', 'artist'].includes(String(actor.role || '').toLowerCase())) return actor;
    toast('Super admin or artist account required');
    location.replace('/dashboard');
    return false;
  }

  async function requireGroupAdminPage() {
    const actor = await requireCreatorAccountPage();
    if (!actor) return false;
    if (String(actor.role || '').toLowerCase() === 'group_admin') return actor;
    toast('Group admin account required');
    location.replace('/dashboard');
    return false;
  }

  /* -- announcements ------------------------------------------------------- */

  // An admin's announcement, shown once per reader. The id of the last one seen
  // is kept locally, so a reader who has already read it is not interrupted by
  // it again on every page they open.
  const SEEN_POST_KEY = 'quizpulseSeenPostId';
  let postShowing = false;

  // The author of an announcement has just read it - twice, in the composer and
  // the preview - so the broadcast that follows should not interrupt them with
  // it a third time, on top of the controls they are still using.
  function markPostSeen(id) {
    if (id) storageSet(SEEN_POST_KEY, String(id));
  }

  function dismissPost() {
    const card = document.getElementById('qpPostPopup');
    if (!card) return;
    card.classList.remove('is-open');
    postShowing = false;
    setTimeout(() => card.remove(), 220);
  }

  function showPost(post, { force = false } = {}) {
    if (!post?.id || postShowing) return;
    if (!force && storageGet(SEEN_POST_KEY, '') === String(post.id)) return;
    document.getElementById('qpPostPopup')?.remove();
    postShowing = true;
    storageSet(SEEN_POST_KEY, String(post.id));
    document.body.insertAdjacentHTML('beforeend', `
      <div class="qp-post-popup" id="qpPostPopup" role="dialog" aria-modal="false" aria-labelledby="qpPostPopupTitle"
        style="--from:${escape(post.from)};--to:${escape(post.to)};--ink:${escape(post.ink)}">
        <article class="qp-post-card">
          <div class="qp-post-card-glow" aria-hidden="true"></div>
          <button class="qp-post-close" type="button" data-post-close aria-label="Close">&#215;</button>
          <div class="qp-post-card-body">
            <span class="qp-post-card-eyebrow">Announcement</span>
            <h3 id="qpPostPopupTitle">${escape(post.title)}</h3>
            <p>${escape(post.body)}</p>
            <button class="qp-btn qp-post-got-it" type="button" data-post-close>Got it</button>
          </div>
        </article>
      </div>`);
    const card = document.getElementById('qpPostPopup');
    card?.querySelectorAll('[data-post-close]').forEach(button => button.addEventListener('click', dismissPost));
    requestAnimationFrame(() => card?.classList.add('is-open'));
  }

  async function checkForPost() {
    try {
      const payload = await api('/api/posts/active');
      if (payload?.post) showPost(payload.post);
    } catch (_) { /* an announcement is never worth breaking a page over */ }
  }

  const apiGetInflight = new Map();

  async function apiRequest(url, options = {}) {
    // The offline creator has no server: the caller gets its usual failure at once.
    if (OFFLINE) throw offlineRefusal();
    const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
    const response = await fetch(url, {
      ...options,
      headers,
      credentials: 'same-origin'
    });
    const text = await response.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; }
    catch (_) { data = text ? { error: text } : null; }
    if (!response.ok) {
      const error = new Error(data?.error || `Request failed: ${response.status}`);
      // The code is what lets a caller tell "never signed in" apart from
      // "signed out because this account is in use elsewhere".
      error.code = data?.code || '';
      error.status = response.status;
      // Something the member did that the plan refuses asks for an upgrade; a page merely loading does not.
      const method = String(options.method || 'GET').toUpperCase();
      if (/^PLAN_(FEATURE_LOCKED|LIMIT_REACHED|QUESTION_TYPE_LOCKED)$/.test(error.code) && !['GET', 'HEAD'].includes(method)) {
        error.planLocked = true;
        showUpgradePrompt({ feature: data?.feature || '', limit: data?.limit || '', questionType: data?.questionType || '', quiet: true });
      }
      throw error;
    }
    return data;
  }

  async function api(url, options = {}, retryingPin = false) {
    const method = String(options.method || 'GET').toUpperCase();
    const canCoalesce = method === 'GET' && !options.signal && !options.body;
    if (!canCoalesce) {
      const result = await apiRequest(url, options);
      if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) {
        apiGetInflight.clear();
        if (/^\/api\/academic(?:\/|$)/.test(String(url))) {
          try { localStorage.setItem('quizpulseAcademicRevisionHint', `${Date.now()}:${Math.random().toString(36).slice(2)}`); } catch (_) {}
        }
      }
      return result;
    }
    const key = String(url);
    if (apiGetInflight.has(key)) return apiGetInflight.get(key);
    const request = apiRequest(url, options).finally(() => apiGetInflight.delete(key));
    apiGetInflight.set(key, request);
    return request;
  }

  function escape(value) {
    return String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  function safeMediaUrl(value, expectedType = '') {
    const raw = String(value || '').trim();
    if (!raw || raw.length > 12 * 1024 * 1024) return '';
    if (/^\/(?!\/)[a-zA-Z0-9/_?&=.%+\-]+$/.test(raw)) return raw;
    const type = String(expectedType || '').toLowerCase();
    const dataMatch = raw.match(/^data:([a-z0-9.+-]+\/[a-z0-9.+-]+);base64,[a-z0-9+/=\s]+$/i);
    if (dataMatch) {
      const mime = dataMatch[1].toLowerCase();
      const allowed = /^(image\/(png|jpe?g|webp|gif)|audio\/(mpeg|mp3|wav|x-wav|ogg|aac|mp4|m4a|x-m4a)|video\/(mp4|webm|ogg))$/;
      if (!allowed.test(mime)) return '';
      if (type.startsWith('image/') && !mime.startsWith('image/')) return '';
      if (type.startsWith('audio/') && !mime.startsWith('audio/')) return '';
      if (type.startsWith('video/') && !mime.startsWith('video/')) return '';
      return raw;
    }
    try {
      const parsed = new URL(raw, location.origin);
      if (!['http:', 'https:'].includes(parsed.protocol)) return '';
      parsed.username = '';
      parsed.password = '';
      return parsed.href;
    } catch (_) {
      return '';
    }
  }

  function safeCssUrl(value, expectedType = 'image/') {
    const safe = safeMediaUrl(value, expectedType);
    if (!safe) return '';
    return safe
      .replaceAll('\\', '%5C')
      .replaceAll('"', '%22')
      .replaceAll("'", '%27')
      .replaceAll('(', '%28')
      .replaceAll(')', '%29')
      .replaceAll('\r', '')
      .replaceAll('\n', '');
  }

  function id(prefix = 'id') {
    return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  }

  function toast(message) {
    const el = document.getElementById('toast');
    // While the upgrade prompt says why, the caller's own error toast would only repeat it.
    if (!el || upgradePromptOpen) return;
    el.textContent = message;
    el.classList.add('show');
    clearTimeout(el._timer);
    el._timer = setTimeout(() => el.classList.remove('show'), 2300);
  }


  function confirmDialog(options = {}) {
    const opts = typeof options === 'string' ? { message: options } : (options || {});
    const title = opts.title || 'Are you sure?';
    const message = opts.message || '';
    const confirmText = opts.confirmText || 'Confirm';
    const cancelText = opts.cancelText || 'Cancel';
    const danger = !!opts.danger;
    const dismissOnly = !!opts.dismissOnly;
    const variant = danger ? 'danger' : (opts.variant === 'success' ? 'success' : 'confirm');
    return new Promise(resolve => {
      let modal = document.getElementById('qpGlobalConfirm');
      if (!modal) {
        document.body.insertAdjacentHTML('beforeend', `
          <div class="qp-global-confirm" id="qpGlobalConfirm" hidden>
            <div class="qp-global-confirm-backdrop" data-confirm-cancel></div>
            <section class="qp-global-confirm-card" role="dialog" aria-modal="true" aria-labelledby="qpGlobalConfirmTitle">
              <div class="qp-global-confirm-icon" id="qpGlobalConfirmIcon">?</div>
              <div class="qp-global-confirm-copy">
                <p class="qp-pill" id="qpGlobalConfirmPill">Confirm</p>
                <h3 id="qpGlobalConfirmTitle"></h3>
                <p id="qpGlobalConfirmMessage"></p>
              </div>
              <div class="qp-global-confirm-actions">
                <button class="qp-btn" id="qpGlobalConfirmCancel" data-confirm-cancel type="button">Cancel</button>
                <button class="qp-btn primary" id="qpGlobalConfirmOk" type="button">Confirm</button>
              </div>
            </section>
          </div>`);
        modal = document.getElementById('qpGlobalConfirm');
      }
      const titleEl = modal.querySelector('#qpGlobalConfirmTitle');
      const messageEl = modal.querySelector('#qpGlobalConfirmMessage');
      const pillEl = modal.querySelector('#qpGlobalConfirmPill');
      const iconEl = modal.querySelector('#qpGlobalConfirmIcon');
      const ok = modal.querySelector('#qpGlobalConfirmOk');
      const cancel = modal.querySelector('#qpGlobalConfirmCancel');
      titleEl.textContent = title;
      messageEl.textContent = message;
      pillEl.textContent = opts.pill || (variant === 'success' ? 'All set' : (danger ? 'Important action' : 'Please confirm'));
      pillEl.classList.toggle('danger', danger);
      iconEl.textContent = opts.icon || (variant === 'success' ? '✓' : (danger ? '⚠' : '?'));
      ok.textContent = confirmText;
      cancel.textContent = cancelText;
      cancel.hidden = dismissOnly;
      ok.className = `qp-btn ${danger ? 'danger' : 'primary'}`;
      modal.querySelector('.qp-global-confirm-card')?.classList.toggle('is-success', variant === 'success');
      const cleanup = (value) => {
        modal.classList.remove('show');
        document.removeEventListener('keydown', onKey);
        modal.dataset.hideTimer = String(setTimeout(() => { modal.hidden = true; }, 140));
        resolve(value);
      };
      const onKey = (event) => { if (event.key === 'Escape') cleanup(dismissOnly); };
      modal.querySelectorAll('[data-confirm-cancel]').forEach(el => { el.onclick = () => cleanup(false); });
      ok.onclick = () => cleanup(true);
      document.addEventListener('keydown', onKey);
      // The previous close hides the shared modal on a timer. Reopening inside
      // that window would otherwise be hidden out from under the new prompt,
      // leaving the caller awaiting a dialog nobody can see.
      clearTimeout(Number(modal.dataset.hideTimer || 0));
      delete modal.dataset.hideTimer;
      modal.hidden = false;
      requestAnimationFrame(() => modal.classList.add('show'));
      setTimeout(() => ok.focus(), 40);
    });
  }

  const shownLevelUpIds = new Set();
  let levelUpQueue = Promise.resolve();

  function showLevelUps(notifications = []) {
    const rows = (Array.isArray(notifications) ? notifications : [notifications]).filter(Boolean);
    for (const notification of rows) {
      const notificationId = String(notification.id || '');
      if (notificationId && shownLevelUpIds.has(notificationId)) continue;
      if (notificationId) shownLevelUpIds.add(notificationId);
      levelUpQueue = levelUpQueue.then(async () => {
        const language = document.documentElement.lang === 'ar' || document.documentElement.dataset.language === 'ar' ? 'ar' : 'en';
        const level = notification.level || {};
        const number = Math.max(1, Number(notification.toLevel || level.number || 1));
        const title = String(level.title || '');
        await confirmDialog({
          title: language === 'ar' ? `تهانينا! أصبحت الآن في المستوى ${number}` : `Congrats! You're now Level ${number}`,
          message: language === 'ar'
            ? `لقد وصلت إلى «${title || `المستوى ${number}`}». استمر في التقدم!`
            : `You've reached “${title || `Level ${number}`}”. Keep going!`,
          confirmText: language === 'ar' ? 'متابعة' : 'Continue',
          variant: 'success',
          dismissOnly: true
        });
        if (notificationId) {
          try {
            await api(`/api/statistics/me/level-ups/${encodeURIComponent(notificationId)}/ack`, { method: 'POST', body: '{}' });
          } catch (_) { /* the durable notification will be offered again after a later sign-in */ }
        }
      });
    }
    return levelUpQueue;
  }

  document.addEventListener('quizpulse:level-up', event => showLevelUps(event.detail));

  function promptDialog(options = {}) {
    const opts = typeof options === 'string' ? { message: options } : (options || {});
    const title = opts.title || 'Enter a value';
    const message = opts.message || '';
    const confirmText = opts.confirmText || 'Save';
    const cancelText = opts.cancelText || 'Cancel';
    const placeholder = opts.placeholder || '';
    const defaultValue = opts.defaultValue || '';
    const maxLength = opts.maxLength || null;
    const secret = opts.inputType === 'password';
    return new Promise(resolve => {
      let modal = document.getElementById('qpGlobalPrompt');
      if (!modal) {
        document.body.insertAdjacentHTML('beforeend', `
          <div class="qp-global-confirm" id="qpGlobalPrompt" hidden>
            <div class="qp-global-confirm-backdrop" data-prompt-cancel></div>
            <section class="qp-global-confirm-card" role="dialog" aria-modal="true" aria-labelledby="qpGlobalPromptTitle">
              <div class="qp-global-confirm-icon" id="qpGlobalPromptIcon">✎</div>
              <div class="qp-global-confirm-copy">
                <p class="qp-pill" id="qpGlobalPromptPill">Edit</p>
                <h3 id="qpGlobalPromptTitle"></h3>
                <p id="qpGlobalPromptMessage"></p>
                <input class="qp-input qp-global-confirm-input" id="qpGlobalPromptInput" type="text">
              </div>
              <div class="qp-global-confirm-actions">
                <button class="qp-btn" id="qpGlobalPromptCancel" data-prompt-cancel type="button">Cancel</button>
                <button class="qp-btn primary" id="qpGlobalPromptOk" type="button">Save</button>
              </div>
            </section>
          </div>`);
        modal = document.getElementById('qpGlobalPrompt');
      }
      const titleEl = modal.querySelector('#qpGlobalPromptTitle');
      const messageEl = modal.querySelector('#qpGlobalPromptMessage');
      const pillEl = modal.querySelector('#qpGlobalPromptPill');
      const input = modal.querySelector('#qpGlobalPromptInput');
      const ok = modal.querySelector('#qpGlobalPromptOk');
      const cancel = modal.querySelector('#qpGlobalPromptCancel');
      titleEl.textContent = title;
      messageEl.textContent = message;
      messageEl.style.display = message ? '' : 'none';
      pillEl.textContent = opts.pill || 'Edit';
      ok.textContent = confirmText;
      ok.classList.toggle('danger', !!opts.danger);
      ok.classList.toggle('primary', !opts.danger);
      input.type = secret ? 'password' : 'text';
      input.autocomplete = secret ? 'current-password' : 'off';
      cancel.textContent = cancelText;
      input.value = defaultValue;
      input.placeholder = placeholder;
      if (maxLength) input.maxLength = maxLength; else input.removeAttribute('maxlength');
      const cleanup = (value) => {
        modal.classList.remove('show');
        document.removeEventListener('keydown', onKey);
        input.removeEventListener('keydown', onInputKey);
        modal.dataset.hideTimer = String(setTimeout(() => { modal.hidden = true; }, 140));
        resolve(value);
      };
      const onKey = (event) => { if (event.key === 'Escape') cleanup(null); };
      const typed = () => (secret ? input.value : input.value.trim());
      const onInputKey = (event) => {
        if (event.key === 'Enter') { event.preventDefault(); cleanup(typed()); }
      };
      modal.querySelectorAll('[data-prompt-cancel]').forEach(el => { el.onclick = () => cleanup(null); });
      ok.onclick = () => cleanup(typed());
      input.addEventListener('keydown', onInputKey);
      document.addEventListener('keydown', onKey);
      // A prompt opened again while the last one is still fading out must not be hidden by that one's timer.
      clearTimeout(Number(modal.dataset.hideTimer || 0));
      delete modal.dataset.hideTimer;
      modal.hidden = false;
      requestAnimationFrame(() => modal.classList.add('show'));
      setTimeout(() => { input.focus(); input.select(); }, 60);
    }).finally(() => {
      // A password never stays in the page after the dialog closes.
      const field = document.getElementById('qpGlobalPromptInput');
      if (secret && field) field.value = '';
    });
  }

  function setButtonLoading(button, isLoading = true, label = 'Loading…') {
    if (!button) return;
    if (isLoading) {
      if (!button.dataset.originalText) button.dataset.originalText = button.textContent || '';
      button.disabled = true;
      button.setAttribute('aria-busy', 'true');
      button.classList.add('is-loading');
      button.textContent = label;
    } else {
      button.disabled = false;
      button.removeAttribute('aria-busy');
      button.classList.remove('is-loading');
      button.textContent = button.dataset.originalText || button.textContent || '';
      delete button.dataset.originalText;
    }
  }

  function normalizeUiLabels(root = document) {
    if (!root?.querySelectorAll) return;
    root.querySelectorAll('.qp-dashboard-nav a[data-create-quiz]').forEach(link => {
      const icon = link.querySelector('span')?.outerHTML || '<span>✦</span>';
      link.innerHTML = `${icon} Create`;
    });
    root.querySelectorAll('.qp-dashboard-nav a[href="/join"]').forEach(link => {
      const icon = link.querySelector('span')?.outerHTML || '<span>⎋</span>';
      link.innerHTML = `${icon} Join Game`;
    });
    root.querySelectorAll('[data-duplicate]').forEach(btn => {
      if (/^copy$/i.test((btn.textContent || '').trim())) btn.textContent = 'Duplicate';
      btn.classList.remove('subtle');
      btn.classList.add('secondary');
    });
    root.querySelectorAll('.qp-btn.gold').forEach(btn => { btn.classList.remove('gold'); btn.classList.add('primary'); });
    root.querySelectorAll('.qp-btn.white').forEach(btn => { btn.classList.remove('white'); btn.classList.add('secondary'); });
  }

  function readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve({ type: file.type, name: file.name, dataUrl: reader.result, size: file.size || 0 });
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  function optimizeImageFileToDataUrl(file, options = {}) {
    const type = String(file?.type || '').toLowerCase();
    if (!type.startsWith('image/') || type.includes('svg') || type.includes('gif')) return readFileAsDataUrl(file);
    const maxWidth = Number(options.maxWidth || 1000);
    const maxHeight = Number(options.maxHeight || 750);
    const quality = Math.min(0.82, Math.max(0.48, Number(options.quality || 0.62)));
    return new Promise((resolve) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        try {
          const scale = Math.min(1, maxWidth / Math.max(1, img.naturalWidth), maxHeight / Math.max(1, img.naturalHeight));
          const width = Math.max(1, Math.round(img.naturalWidth * scale));
          const height = Math.max(1, Math.round(img.naturalHeight * scale));
          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d', { alpha: false });
          ctx.drawImage(img, 0, 0, width, height);
          canvas.toBlob((blob) => {
            URL.revokeObjectURL(url);
            if (!blob) return readFileAsDataUrl(file).then(resolve);
            if (!options.preferOptimized && file.size && blob.size > file.size && file.size < 900000) return readFileAsDataUrl(file).then(resolve);
            const reader = new FileReader();
            reader.onload = () => resolve({
              type: blob.type || 'image/webp',
              name: String(file.name || 'image').replace(/\.[^.]+$/, '') + '.webp',
              dataUrl: reader.result,
              size: blob.size || 0,
              optimized: true,
              originalSize: file.size || 0
            });
            reader.onerror = () => readFileAsDataUrl(file).then(resolve);
            reader.readAsDataURL(blob);
          }, 'image/webp', quality);
        } catch (_) {
          URL.revokeObjectURL(url);
          readFileAsDataUrl(file).then(resolve);
        }
      };
      img.onerror = () => { URL.revokeObjectURL(url); readFileAsDataUrl(file).then(resolve); };
      img.src = url;
    });
  }

  function fileToDataUrl(file, options = {}) {
    return optimizeImageFileToDataUrl(file, options);
  }

  function renderMedia(media, className = '') {
    if (!media || !media.dataUrl) return '';
    const type = media.type || '';
    const safeClass = escape(className);
    const safeUrl = escape(safeMediaUrl(media.dataUrl, type));
    if (!safeUrl) return '';
    if (type.startsWith('image/')) return `<img class="${safeClass}" src="${safeUrl}" alt="Question media">`;
    if (type.startsWith('audio/')) return `<audio class="${safeClass}" src="${safeUrl}" controls></audio>`;
    if (type.startsWith('video/')) return `<video class="${safeClass}" src="${safeUrl}" controls></video>`;
    return '';
  }

  function renderHotspotSurface(media, overlays = '', id = 'hotspotImageSurface') {
    const image = renderMedia(media, '');
    if (!image) return '';
    const idAttribute = id ? ` id="${escape(id)}"` : '';
    return `<div class="qp-hotspot-image-surface"${idAttribute}>${image}${String(overlays || '')}</div>`;
  }

  function preloadMedia(media) {
    try {
      if (!media || !media.dataUrl || !String(media.type || '').startsWith('image/')) return;
      const img = new Image();
      img.decoding = 'async';
      img.src = media.dataUrl;
      if (typeof img.decode === 'function') img.decode().catch(() => {});
    } catch (_) {}
  }

  function debounce(fn, delay = 500) {
    let timer;
    return (...args) => {
      clearTimeout(timer);
      timer = setTimeout(() => fn(...args), delay);
    };
  }

  // Every rolling number used to own its own requestAnimationFrame chain. A
  // scoreboard for a class of forty started forty of them, so each frame ran
  // forty callbacks that each wrote textContent and invalidated layout. They
  // now share one loop, and a run only writes when the rendered value actually
  // changes.
  const numberAnimations = new Set();
  let numberFrame = 0;

  // Both the OS setting and the in-app high-performance device mode skip
  // rolling numbers and jump straight to the final value.
  function prefersReducedMotion() {
    try {
      if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return true;
    } catch (_) {}
    return document.documentElement.dataset.qpPerformance === 'high';
  }

  function numberTick(now) {
    numberFrame = 0;
    for (const run of numberAnimations) {
      if (!run.el.isConnected) { numberAnimations.delete(run); continue; }
      const t = Math.min(1, (now - run.start) / run.ms);
      const eased = 1 - Math.pow(1 - t, 3);
      const value = Math.round(run.from + run.delta * eased);
      if (value !== run.last) {
        run.last = value;
        run.el.textContent = value.toLocaleString();
      }
      if (t >= 1) numberAnimations.delete(run);
    }
    if (numberAnimations.size) numberFrame = requestAnimationFrame(numberTick);
  }

  function animateNumber(el, from, to, ms = 800) {
    if (!el) return;
    for (const run of numberAnimations) if (run.el === el) numberAnimations.delete(run);
    const target = Number(to) || 0;
    const duration = Math.max(1, Number(ms) || 0);
    if (prefersReducedMotion()) { el.textContent = target.toLocaleString(); return; }
    numberAnimations.add({ el, from: Number(from) || 0, delta: target - (Number(from) || 0), ms: duration, start: performance.now(), last: null });
    if (!numberFrame) numberFrame = requestAnimationFrame(numberTick);
  }

  // Live countdowns used to run one setInterval per question on both the host
  // and every student device, each re-querying the document 4x a second and
  // surviving past its own phase. One shared rAF loop drives them all, writes
  // only when the visible second changes, and stops itself once the element
  // leaves the DOM.
  // A long question showed a four-figure second count, which reads as noise:
  // nobody paces themselves against "287". Over two minutes the clock reads in
  // minutes, and only inside the last two minutes does it count seconds, which
  // is the point at which each one starts to matter. The seconds are always two
  // figures, as on any clock: "4:5" read as four and a half minutes, not 4:05.
  const COUNTDOWN_SECONDS_ONLY_AT = 120;

  function countdownLabel(seconds) {
    const total = Math.max(0, Math.round(Number(seconds) || 0));
    if (total <= COUNTDOWN_SECONDS_ONLY_AT) return String(total);
    const minutes = Math.floor(total / 60);
    const rest = total % 60;
    return rest ? `${minutes}:${String(rest).padStart(2, '0')}` : `${minutes} min`;
  }

  const countdownTargets = new Set();
  let countdownFrame = 0;

  function countdownTick() {
    countdownFrame = 0;
    const now = Date.now();
    for (const target of countdownTargets) {
      if (!target.el.isConnected) { countdownTargets.delete(target); continue; }
      const remaining = Math.max(0, target.endsAt - now);
      const seconds = Math.ceil(remaining / 1000);
      if (seconds !== target.seconds) {
        target.seconds = seconds;
        const label = countdownLabel(seconds);
        if (target.value && label !== target.label) {
          target.label = label;
          target.value.textContent = label;
          // A minutes label is wider than a bare number, so the badge is told
          // to set it smaller rather than letting it spill out of the ring.
          target.el.classList.toggle('is-long-label', label.length > 3);
          target.el.classList.toggle('is-wide-label', label.length === 3);
        }
        target.el.classList.toggle('is-urgent', seconds <= 5 && seconds > 0);
      }
      const progress = target.total > 0 ? Math.max(0, Math.min(1, remaining / target.total)) : 0;
      // The ring is painted from a CSS variable so the arc stays on the
      // compositor instead of forcing a layout pass every frame.
      if (Math.abs(progress - target.progress) > 0.002) {
        target.progress = progress;
        target.el.style.setProperty('--qp-countdown-progress', progress.toFixed(4));
      }
      if (remaining <= 0) {
        target.el.classList.remove('is-urgent');
        target.el.classList.add('is-done');
        countdownTargets.delete(target);
        try { target.onEnd?.(); } catch (_) {}
      }
    }
    if (countdownTargets.size) countdownFrame = requestAnimationFrame(countdownTick);
  }

  function startCountdown(root = document, endsAt = 0, options = {}) {
    const el = root?.querySelector?.('[data-qp-countdown]') || (root?.matches?.('[data-qp-countdown]') ? root : null);
    if (!el || !Number.isFinite(Number(endsAt))) return () => {};
    for (const target of countdownTargets) if (target.el === el) countdownTargets.delete(target);
    const total = Math.max(1, Number(options.totalMs) || (Number(endsAt) - Date.now()));
    const target = { el, value: el.querySelector('[data-qp-countdown-value]'), endsAt: Number(endsAt), total, seconds: -1, label: '', progress: -1, onEnd: options.onEnd };
    countdownTargets.add(target);
    if (!countdownFrame) countdownFrame = requestAnimationFrame(countdownTick);
    return () => { countdownTargets.delete(target); };
  }

  function stopAllCountdowns() {
    countdownTargets.clear();
    if (countdownFrame) cancelAnimationFrame(countdownFrame);
    countdownFrame = 0;
  }

  // pathLength="1" turns the arc into plain 0..1 maths, so the dash offset is a
  // single CSS calc against --qp-countdown-progress and never touches layout.
  function countdownHtml(seconds = 0, options = {}) {
    const label = countdownLabel(seconds);
    return `<div class="qp-countdown ${options.className || ''}${label.length > 3 ? ' is-long-label' : label.length === 3 ? ' is-wide-label' : ''}" data-qp-countdown style="--qp-countdown-progress:1" role="timer" aria-label="Time remaining">
      <svg class="qp-countdown-ring" viewBox="0 0 48 48" aria-hidden="true" focusable="false">
        <circle class="qp-countdown-track" cx="24" cy="24" r="21" pathLength="1"></circle>
        <circle class="qp-countdown-arc" cx="24" cy="24" r="21" pathLength="1"></circle>
      </svg>
      <b data-qp-countdown-value>${label}</b>
    </div>`;
  }

  function isSoundEnabled() {
    return storageGet('quizpulseSound') !== 'off';
  }

  function bindPasswordVisibility(root = document) {
    const scope = root?.querySelectorAll ? root : document;
    scope.querySelectorAll('[data-password-toggle]').forEach(button => {
      if (button.dataset.passwordToggleBound === 'true') return;
      const inputId = button.dataset.passwordToggle || button.getAttribute('aria-controls');
      const input = document.getElementById(inputId);
      if (!input) return;
      button.dataset.passwordToggleBound = 'true';

      const sync = () => {
        const visible = input.type === 'text';
        const passwordLabel = button.dataset.passwordLabel || 'password';
        const label = `${visible ? 'Hide' : 'Show'} ${passwordLabel}`;
        button.setAttribute('aria-pressed', String(visible));
        button.setAttribute('aria-label', label);
        button.title = label;
      };

      button.addEventListener('click', () => {
        const selectionStart = input.selectionStart;
        const selectionEnd = input.selectionEnd;
        input.type = input.type === 'password' ? 'text' : 'password';
        sync();
        input.focus({ preventScroll: true });
        if (selectionStart !== null && selectionEnd !== null) {
          try { input.setSelectionRange(selectionStart, selectionEnd); } catch (_) {}
        }
      });
      sync();
    });
  }
  function isMusicEnabled() {
    return storageGet('quizpulseMusic') === 'on';
  }
  function setSoundEnabled(on) {
    storageSet('quizpulseSound', on ? 'on' : 'off');
    updateAudioControls();
  }
  function setMusicEnabled(on) {
    storageSet('quizpulseMusic', on ? 'on' : 'off');
    updateAudioControls();
    if (on) playMusic();
    else pauseMusic();
  }
  function audioControlsHtml() {
    return `<div class="qp-audio-controls" aria-label="Sound controls">
      <button class="qp-audio-toggle" data-audio-toggle="sound" type="button">Sound: On</button>
      <button class="qp-audio-toggle" data-audio-toggle="music" type="button">Music: Off</button>
    </div>`;
  }
  function updateAudioControls() {
    document.querySelectorAll('[data-audio-toggle="sound"]').forEach(btn => {
      const on = isSoundEnabled();
      btn.textContent = `Sound: ${on ? 'On' : 'Off'}`;
      btn.classList.toggle('is-off', !on);
      btn.setAttribute('aria-pressed', String(on));
    });
    document.querySelectorAll('[data-audio-toggle="music"]').forEach(btn => {
      const on = isMusicEnabled();
      btn.textContent = `Music: ${on ? 'On' : 'Off'}`;
      btn.title = `Music source: ${customMusicName()}`;
      btn.classList.toggle('is-off', !on);
      btn.setAttribute('aria-pressed', String(on));
    });
  }
  function bindAudioControls(root = document) {
    root.querySelectorAll('[data-audio-toggle]').forEach(btn => {
      if (btn.dataset.boundAudio === '1') return;
      btn.dataset.boundAudio = '1';
      btn.addEventListener('click', () => {
        if (btn.dataset.audioToggle === 'sound') setSoundEnabled(!isSoundEnabled());
        if (btn.dataset.audioToggle === 'music') setMusicEnabled(!isMusicEnabled());
      });
    });
    updateAudioControls();
  }
  document.addEventListener('DOMContentLoaded', () => { loadSavedServerSoundSources(); bindAudioControls(document); });

  let audioCtx = null;
  let customMusicAudio = null;
  let customMusicObjectUrl = '';
  let customMusicLabel = '';
  let serverMusicUrl = '';
  const serverSoundSources = new Map();
  let pulseMusicTimer = null;
  let audioUnlocked = false;
  let globalSoundSettings = { enabled: true, slots: {} };
  let globalSoundLoadedAt = 0;
  let globalSoundRequest = null;
  const globalSoundBuffers = new Map();
  const globalSoundNames = { start: 'startSound', gameStart: 'startSound', majorityCorrect: 'boardMostCorrect', majorityIncorrect: 'boardMostWrong', final: 'finalMusic', correct: 'lessonCorrect' };

  async function refreshGlobalSounds(force = false) {
    if (!force && globalSoundLoadedAt && Date.now() - globalSoundLoadedAt < 15000) return globalSoundSettings;
    if (globalSoundRequest) return globalSoundRequest;
    globalSoundRequest = (async () => {
      try {
        const response = OFFLINE ? null : await fetch('/api/settings/global-sound', { cache: 'no-store', signal: AbortSignal.timeout(15000) });
        if (response?.ok) {
          globalSoundSettings = (await response.json()).liveAudio || { enabled: true, slots: {} };
          globalSoundLoadedAt = Date.now();
        }
      } catch (_) { /* Sound availability must never block an account action. */ }
      finally { globalSoundRequest = null; }
      return globalSoundSettings;
    })();
    return globalSoundRequest;
  }

  function globalSoundSlot(name) { return globalSoundSettings.slots?.[globalSoundNames[name] || name] || {}; }

  async function loadGlobalSoundBuffer(url) {
    if (!globalSoundBuffers.has(url)) {
      if (globalSoundBuffers.size >= 16) globalSoundBuffers.clear();
      globalSoundBuffers.set(url, (async () => {
        try {
          const response = await fetch(url, { signal: AbortSignal.timeout(20000) });
          if (!response.ok) throw new Error('Audio could not be loaded');
          return await getAudioCtx().decodeAudioData(await response.arrayBuffer());
        } catch (_) { globalSoundBuffers.delete(url); return null; }
      })());
    }
    return globalSoundBuffers.get(url);
  }

  async function playGlobalSound(name, { waitUntilEnded = false } = {}) {
    try {
      await refreshGlobalSounds();
      const slot = globalSoundSlot(name);
      if (!isSoundEnabled() || globalSoundSettings.enabled === false || slot.enabled === false || !slot.url) return false;
      const buffer = await loadGlobalSoundBuffer(slot.url);
      const ctx = getAudioCtx();
      if (buffer && ctx.state !== 'running') {
        await Promise.race([ctx.resume().catch(() => {}), new Promise(resolve => setTimeout(resolve, 500))]);
      }
      if (!buffer || ctx.state !== 'running') return false;
      const source = ctx.createBufferSource();
      const gain = ctx.createGain();
      source.buffer = buffer;
      gain.gain.value = .42;
      source.connect(gain);
      gain.connect(ctx.destination);
      const finished = new Promise(resolve => {
        const timer = setTimeout(() => { try { source.stop(); } catch (_) {} resolve(true); }, waitUntilEnded ? Math.min(buffer.duration * 1000 + 200, 6000) : buffer.duration * 1000 + 200);
        source.onended = () => { clearTimeout(timer); source.disconnect(); gain.disconnect(); resolve(true); };
      });
      source.start();
      return waitUntilEnded ? await finished : true;
    } catch (_) { return false; }
  }

  document.addEventListener('DOMContentLoaded', () => {
    refreshGlobalSounds().then(settings => {
      const name = document.getElementById('authApp') ? 'signIn' : location.pathname === '/shop' ? 'shopPurchase' : '';
      if (name && settings.enabled !== false && settings.slots?.[name]?.enabled !== false && settings.slots?.[name]?.url) loadGlobalSoundBuffer(settings.slots[name].url);
    });
  });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refreshGlobalSounds(true); });
  ['pointerdown', 'keydown'].forEach(type => document.addEventListener(type, () => { unlockAudio(); refreshGlobalSounds(); }, { passive: true }));

  function unlockAudio() {
    try {
      const ctx = getAudioCtx();
      if (ctx && ctx.state !== 'running') ctx.resume().catch(() => {});
    } catch (_) {}
    if (audioUnlocked) return true;
    try {
      const silent = new Audio('data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAESsAACJWAAACABAAZGF0YQAAAAA=');
      silent.volume = 0;
      const promise = silent.play();
      if (promise?.then) promise.then(() => { try { silent.pause(); } catch (_) {} }).catch(() => {});
    } catch (_) {}
    audioUnlocked = true;
    return true;
  }

  function setCustomMusicAudioSource(src, label = 'Custom music', isObjectUrl = false) {
    if (!src) return '';
    try {
      pauseMusic();
      if (customMusicObjectUrl) URL.revokeObjectURL(customMusicObjectUrl);
      customMusicObjectUrl = isObjectUrl ? src : '';
      serverMusicUrl = isObjectUrl ? '' : src;
      customMusicAudio = new Audio(src);
      customMusicAudio.loop = true;
      customMusicAudio.volume = 0.28;
      customMusicAudio.preload = 'auto';
      customMusicLabel = label || 'Custom music';
      if (isMusicEnabled()) playMusic();
      updateAudioControls();
      return customMusicLabel;
    } catch (_) {
      return '';
    }
  }

  function setCustomMusicFile(file) {
    if (!file) return '';
    try {
      const objectUrl = URL.createObjectURL(file);
      return setCustomMusicAudioSource(objectUrl, file.name || 'Custom music', true);
    } catch (_) {
      return '';
    }
  }

  function setServerMusicSource(url, label = 'Server music') {
    return setCustomMusicAudioSource(url, label || 'Server music', false);
  }

  function setServerSoundSource(name, url, label = '') {
    const key = String(name || '').trim();
    if (!key) return '';
    if (!url) {
      serverSoundSources.delete(key);
      storageRemove(`quizpulseSfx:${key}`);
      return '';
    }
    try {
      const audio = new Audio(url);
      audio.volume = 0.42;
      audio.preload = 'auto';
      serverSoundSources.set(key, { url, label: label || key, audio });
      storageSet(`quizpulseSfx:${key}`, JSON.stringify({ url, label: label || key }));
      return label || key;
    } catch (_) {
      return '';
    }
  }

  function loadSavedServerSoundSources() {
    ['gameStart', 'majorityCorrect', 'majorityIncorrect', 'final'].forEach(key => {
      try {
        const saved = JSON.parse(storageGet(`quizpulseSfx:${key}`, 'null') || 'null');
        if (saved?.url) setServerSoundSource(key, saved.url, saved.label || key);
      } catch (_) {}
    });
  }

  function playServerSoundSource(name) {
    const source = serverSoundSources.get(String(name || '').trim());
    if (!source?.url) return false;
    try {
      const audio = source.audio?.cloneNode ? source.audio.cloneNode(true) : new Audio(source.url);
      audio.volume = source.audio?.volume ?? 0.42;
      audio.play().catch(() => {});
      return true;
    } catch (_) {
      return false;
    }
  }

  function customMusicName() {
    return customMusicLabel || 'Built-in pulse loop';
  }

  function stopPulseMusic() {
    clearInterval(pulseMusicTimer);
    pulseMusicTimer = null;
  }

  function startPulseMusic() {
    stopPulseMusic();
    const playPhrase = () => {
      if (!isMusicEnabled() || customMusicAudio) return;
      [392, 494, 587, 494].forEach((f, i) => setTimeout(() => beep(f, 90, 'triangle', .018), i * 190));
    };
    playPhrase();
    pulseMusicTimer = setInterval(playPhrase, 3800);
  }

  function playMusic() {
    unlockAudio();
    if (globalSoundSettings.enabled === false || globalSoundSlot('questionMusic').enabled === false) return Promise.resolve(false);
    const globalMusic = globalSoundSlot('questionMusic');
    if (!customMusicAudio && globalMusic.url) {
      customMusicAudio = new Audio(globalMusic.url);
      customMusicAudio.loop = true;
      customMusicAudio.volume = .28;
      customMusicLabel = globalMusic.label || 'Question music';
    }
    if (!isMusicEnabled()) return Promise.resolve(false);
    if (customMusicAudio) {
      stopPulseMusic();
      try {
        customMusicAudio.currentTime = customMusicAudio.currentTime || 0;
        const playPromise = customMusicAudio.play();
        if (playPromise?.catch) playPromise.catch(() => {});
        return playPromise || Promise.resolve(true);
      } catch (_) { return Promise.resolve(false); }
    }
    startPulseMusic();
    return Promise.resolve(true);
  }

  function pauseMusic() {
    stopPulseMusic();
    if (customMusicAudio) {
      try { customMusicAudio.pause(); } catch (_) {}
    }
  }

  function getAudioCtx() {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    return audioCtx;
  }
  function beep(freq = 660, duration = 120, type = 'sine', volume = .045) {
    try {
      const ctx = getAudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.value = freq;
      gain.gain.value = volume;
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration / 1000);
      osc.stop(ctx.currentTime + duration / 1000);
    } catch (_) {}
  }
  function sound(name, { preview = false } = {}) {
    if (!preview) {
      if (!isSoundEnabled() || globalSoundSettings.enabled === false || globalSoundSlot(name).enabled === false) return;
      if (globalSoundSlot(name).url) { playGlobalSound(name); return; }
      // Saved browser overrides must not outlive an administrator's reset.
      if (!globalSoundLoadedAt && playServerSoundSource(name)) return;
    }
    if (name === 'join') { beep(440, 90); setTimeout(() => beep(660, 90), 80); }
    else if (name === 'start' || name === 'gameStart') { beep(350, 120, 'triangle'); setTimeout(() => beep(700, 180, 'triangle'), 130); }
    else if (name === 'answer') { beep(520, 100); }
    else if (name === 'lessonCorrect') { [659, 784, 988].forEach((f, i) => setTimeout(() => beep(f, 115, 'triangle', .045), i * 82)); }
    else if (name === 'majorityCorrect') { [523, 659, 784].forEach((f, i) => setTimeout(() => beep(f, 120, 'triangle', .05), i * 95)); }
    else if (name === 'majorityIncorrect') { [392, 330, 262].forEach((f, i) => setTimeout(() => beep(f, 140, 'sawtooth', .035), i * 120)); }
    else if (name === 'dashboard') { beep(620, 90); setTimeout(() => beep(780, 120), 110); }
    else if (name === 'final') { [440, 554, 659, 880].forEach((f, i) => setTimeout(() => beep(f, 120, 'triangle'), i * 115)); }
  }



  function percentInRange(value, min, max) {
    const lo = Number(min ?? 0);
    const hi = Number(max ?? 100);
    const val = Number(value ?? lo);
    if (hi === lo) return 0;
    return Math.max(0, Math.min(100, ((val - lo) / (hi - lo)) * 100));
  }

  function renderAnswerStats(summary = {}) {
    const totalPlayers = Number(summary.totalPlayers || 0);
    const totalAnswered = Number(summary.totalAnswered || 0);
    const type = summary.questionType || summary.type || 'mcq';
    if (type === 'wordcloud') {
      const cloud = summary.wordCloud || {};
      const topWord = (cloud.words || [])[0];
      return `<div class="qp-answer-stats-grid is-poll" aria-label="Word cloud statistics">
        <div><b>${totalAnswered}${totalPlayers ? ` / ${totalPlayers}` : ''}</b><span>answered</span></div>
        <div><b>${Number(cloud.distinct || 0)}</b><span>different words</span></div>
        ${topWord ? `<div><b dir="auto">${escape(topWord.text || '')}</b><span>most common</span></div>` : ''}
      </div>`;
    }
    if (type === 'poll') {
      const topVotes = Math.max(0, ...(summary.choices || []).map(choice => Number(choice.count || 0)));
      const noAnswer = Math.max(0, Number(summary.noAnswer ?? (totalPlayers ? totalPlayers - totalAnswered : 0)));
      return `<div class="qp-answer-stats-grid is-poll" aria-label="Poll statistics">
        <div><b>${totalAnswered}${totalPlayers ? ` / ${totalPlayers}` : ''}</b><span>voted</span></div>
        <div><b>${topVotes}</b><span>top choice</span></div>
        ${noAnswer ? `<div><b>${noAnswer}</b><span>no vote</span></div>` : ''}
      </div>`;
    }
    const correct = Number(summary.correctSubmissions ?? 0);
    const noAnswer = Math.max(0, Number(summary.noAnswer ?? (totalPlayers ? totalPlayers - totalAnswered : 0)));
    const incorrect = Number(summary.incorrectSubmissions ?? Math.max(0, totalAnswered - correct));
    const pct = totalAnswered ? Math.round((correct / totalAnswered) * 100) : 0;
    return `<div class="qp-answer-stats-grid" aria-label="Student answer statistics">
      <div><b>${totalAnswered}${totalPlayers ? ` / ${totalPlayers}` : ''}</b><span>answered</span></div>
      <div><b>${correct}</b><span>correct</span></div>
      <div><b>${incorrect}</b><span>incorrect</span></div>
      <div><b>${pct}%</b><span>correct rate</span></div>
      ${noAnswer ? `<div><b>${noAnswer}</b><span>no answer</span></div>` : ''}
    </div>`;
  }

  function renderStatsBarChart(choices = [], totalAnswered = 0) {
    if (!choices.length) return '';
    const total = Math.max(1, Number(totalAnswered || 0), ...choices.map(c => Number(c.count || 0)));
    return `<div class="qp-answer-bar-chart" aria-label="Answer statistics bar chart">
      ${choices.map((choice, i) => {
        const count = Number(choice.count || 0);
        const pct = Math.round((count / total) * 100);
        const shape = answerShape(i);
        return `<div class="qp-answer-bar-row ${choice.correct ? 'is-correct' : ''}">
          <div class="qp-answer-bar-label"><span>${choice.correct ? '✅' : shape.icon}</span><strong>${escape(choice.text || '')}</strong></div>
          <div class="qp-answer-bar-track"><span style="width:${Math.max(3, pct)}%"></span></div>
          <div class="qp-answer-bar-count">${count}</div>
        </div>`;
      }).join('')}
    </div>`;
  }

  function normalizeHotspotArea(area = {}) {
    const n = (value, fallback) => {
      const number = Number(value);
      return Number.isFinite(number) ? number : fallback;
    };
    const x = Math.max(0, Math.min(100, n(area.x, 35)));
    const y = Math.max(0, Math.min(100, n(area.y, 35)));
    const w = Math.max(2, Math.min(100 - x, n(area.w, 30)));
    const h = Math.max(2, Math.min(100 - y, n(area.h, 30)));
    return { x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10, w: Math.round(w * 10) / 10, h: Math.round(h * 10) / 10 };
  }

  function renderCorrectAnswerReveal(summary = {}, options = {}) {
    const type = summary.questionType || summary.type || 'mcq';
    const resultClass = `qp-correct-reveal qp-result-surface qp-result-${String(type).replace(/[^a-z0-9_-]/gi, '')}`;
    const compact = !!options.compact;
    const showChart = !compact && !options.hideChart;
    const totalAnswered = Number(summary.totalAnswered || 0);
    const totalPlayers = Number(summary.totalPlayers || 0);
    const header = options.hideHeader ? '' : `
      <div class="qp-correct-reveal-header">
        <div>
          <span class="qp-pill qp-correct-pill">${type === 'poll' ? 'Class results' : `${escape(typeLabel(type))} result`}</span>
          ${summary.title && !compact ? `<h2>${escape(summary.title)}</h2>` : ''}
        </div>
        <div class="qp-reveal-count">${totalAnswered}${totalPlayers ? ` / ${totalPlayers}` : ''} answered</div>
      </div>`;

    const explanation = String(summary.explanation || '').trim();
    const explanationHtml = explanation && !options.hideExplanation ? `<div class="qp-answer-explanation"><b>Why</b><p>${escape(explanation)}</p></div>` : '';
    const statsHtml = compact ? '' : renderAnswerStats(summary);

    if (type === 'wordcloud') {
      return `<section class="${resultClass}">${header}
        ${statsHtml}
        ${wordCloudStageHtml(summary.wordCloud?.words || [], { className: 'qp-wordcloud-result', emptyText: 'Nobody sent a word' })}
        ${explanationHtml}
      </section>`;
    }

    if (['mcq', 'truefalse', 'multiselect', 'poll'].includes(type)) {
      const choices = summary.choices || [];
      return `<section class="${resultClass} ${compact ? 'compact' : ''}">
        ${header}
        ${statsHtml}
        <div class="qp-game-answers qp-reveal-answers ans-count-${Math.max(1, Math.min(9, choices.length))} ${type === 'truefalse' ? 'two' : ''}">
          ${choices.map((choice, i) => {
            const shape = answerShape(i);
            const color = colors[i % colors.length];
            const answerState = type === 'poll' ? 'is-poll' : (choice.correct ? 'is-correct' : 'is-muted');
            return `<div class="qp-game-answer qp-reveal-answer ${color} ${answerState}">
              <span class="qp-answer-shape">${type === 'poll' ? shape.icon : (choice.correct ? '✅' : shape.icon)}</span>
              <span class="qp-answer-label">${escape(choice.text || '')}</span>
              <span class="qp-reveal-side">
                <span class="qp-count-bubble">${Number(choice.count || 0)}</span>
                ${type !== 'poll' && choice.correct ? '<span class="qp-correct-badge">Correct</span>' : ''}
              </span>
            </div>`;
          }).join('')}
        </div>
        ${showChart ? renderStatsBarChart(choices, totalAnswered) : ''}
        ${explanationHtml}
      </section>`;
    }

    if (type === 'order') {
      const items = summary.orderItems || [];
      const itemCount = Math.max(0, Math.min(6, items.length));
      const correct = Number(summary.correctSubmissions ?? 0);
      const incorrect = Number(summary.incorrectSubmissions ?? Math.max(0, totalAnswered - correct));
      const pct = totalAnswered ? Math.round((correct / totalAnswered) * 100) : 0;
      const orderStats = compact ? '' : `<div class="qp-order-reveal-stats" aria-label="Order question statistics">
        <div><span class="qp-order-stat-icon purple">👥</span><b>${totalAnswered}${totalPlayers ? ` / ${totalPlayers}` : ''}</b><em>answered</em></div>
        <div><span class="qp-order-stat-icon green">✓</span><b>${correct}</b><em>correct</em></div>
        <div><span class="qp-order-stat-icon red">×</span><b>${incorrect}</b><em>incorrect</em></div>
        <div><span class="qp-order-stat-icon blue">◎</span><b>${pct}%</b><em>accuracy</em></div>
      </div>`;
      return `<section class="${resultClass} qp-order-correct-reveal qp-order-flow-rendered ${compact ? 'compact' : ''}" data-order-render="flowchart-v183" data-order-count="${itemCount}">
        ${header}
        <div class="qp-order-flow-card" data-order-count="${itemCount}">
          <div class="qp-order-flow-head">
            <span class="qp-order-flow-pill">✓ Correct order</span>
            ${!options.hideHeader && summary.title ? `<h2>${escape(summary.title)}</h2>` : ''}
          </div>
          <div class="qp-order-flow-list" role="list" aria-label="Correct order steps" data-order-count="${itemCount}">
            ${items.map((item, i) => `<div class="qp-order-flow-step-wrap" role="listitem">
              <div class="qp-order-flow-step">
                <span class="qp-order-flow-number">${i + 1}</span>
                <strong>${escape(item.text || item)}</strong>
              </div>
              ${i < items.length - 1 ? '<div class="qp-order-flow-arrow" aria-hidden="true">↓</div>' : ''}
            </div>`).join('')}
          </div>
          ${orderStats}
        </div>
        ${explanationHtml}
      </section>`;
    }

    if (type === 'type') {
      const accepted = summary.acceptedAnswers || [];
      const primaryAnswer = accepted[0] || summary.correctText || 'Accepted answer';
      return `<section class="${resultClass} ${compact ? 'compact' : ''}">
        ${header}
        ${statsHtml}
        <div class="qp-type-reveal-card">
          <div class="qp-type-input-fake"><span>✓</span><b>${escape(primaryAnswer)}</b></div>
          ${accepted.length > 1 ? `<div class="qp-accepted-chip-row">${accepted.slice(1).map(answer => `<span class="qp-accepted-chip">${escape(answer)}</span>`).join('')}</div>` : ''}
        </div>
        ${showChart ? renderStatsBarChart(summary.choices || [], totalAnswered) : ''}
        ${explanationHtml}
      </section>`;
    }

    if (type === 'slider') {
      const slider = summary.slider || { min: 0, max: 100, correct: 50, fullTolerance: 0, halfTolerance: 10, labelLeft: 'Low', labelRight: 'High' };
      const min = Number(slider.min ?? 0);
      const max = Number(slider.max ?? 100);
      const correct = Number(slider.correct ?? min);
      const full = Number(slider.fullTolerance ?? 0);
      const half = Number(slider.halfTolerance ?? 0);
      const correctPct = percentInRange(correct, min, max);
      const fullLeft = percentInRange(correct - full, min, max);
      const fullRight = percentInRange(correct + full, min, max);
      const halfLeft = percentInRange(correct - half, min, max);
      const halfRight = percentInRange(correct + half, min, max);
      const sliderAnswers = Array.isArray(summary.sliderAnswers) ? summary.sliderAnswers : [];
      const sliderStats = summary.sliderAnswerStats || {};
      const sliderSample = sliderStats.sampled
        ? `${Number(sliderStats.displayedAnswers || sliderAnswers.length)} / ${Number(sliderStats.totalAnswers || sliderAnswers.length)} answers · random 20%`
        : `${Number(sliderStats.totalAnswers || sliderAnswers.length)} answers`;
      return `<section class="${resultClass} ${compact ? 'compact' : ''}">
        ${header}
        ${statsHtml}
        <div class="qp-slider-reveal">
          <div class="qp-slider-reveal-value">✅ ${escape(correct)}</div>
          <div class="qp-slider-reveal-track">
            <span class="qp-slider-half-zone" style="left:${halfLeft}%;width:${Math.max(0, halfRight - halfLeft)}%"></span>
            <span class="qp-slider-full-zone" style="left:${fullLeft}%;width:${Math.max(1.5, fullRight - fullLeft)}%"></span>
            ${sliderAnswers.map((answer, index) => `<span class="qp-slider-student-dot ${answer.correct ? 'correct' : answer.partial ? 'partial' : 'wrong'}" style="left:${percentInRange(answer.value, min, max)}%;--lane:${index % 3}" title="${escape(String(answer.value))}"></span>`).join('')}
            <span class="qp-slider-correct-marker" style="left:${correctPct}%"><b>${escape(correct)}</b></span>
          </div>
          <div class="qp-slider-reveal-labels"><span>${escape(slider.labelLeft || min)}</span><span>${escape(slider.labelRight || max)}</span></div>
          ${sliderAnswers.length ? `<div class="qp-result-sample">${escape(sliderSample)}</div>` : ''}
        </div>
        ${showChart ? renderStatsBarChart(summary.choices || [], totalAnswered) : ''}
        ${explanationHtml}
      </section>`;
    }


    if (type === 'matching') {
      const pairs = summary.matchingPairs || [];
      return `<section class="${resultClass} qp-connect-reveal ${compact ? 'compact' : ''}">
        ${header}
        ${statsHtml}
        <div class="qp-connect-reveal-grid">
          ${pairs.map((pair, index) => `<div class="qp-connect-reveal-row"><span class="qp-connect-reveal-num">${index + 1}</span><b class="qp-connect-reveal-left">${escape(pair.left || '')}</b><span class="qp-connect-reveal-arrow">→</span><strong class="qp-connect-reveal-right">${escape(pair.right || '')}</strong></div>`).join('')}
        </div>
        ${showChart ? renderStatsBarChart(summary.choices || [], totalAnswered) : ''}
        ${explanationHtml}
      </section>`;
    }

    if (type === 'fillblank') {
      const blanks = summary.fillBlanks || [];
      return `<section class="${resultClass} ${compact ? 'compact' : ''}">
        ${header}
        ${statsHtml}
        <div class="qp-fillblank-reveal">
          ${blanks.map(blank => `<div class="qp-fillblank-reveal-row"><b>${escape(blank.label || 'Blank')}</b><strong><span>✓</span>${escape((blank.answers || []).join(' / ') || 'Accepted answer')}</strong></div>`).join('')}
        </div>
        ${showChart ? renderStatsBarChart(summary.choices || [], totalAnswered) : ''}
        ${explanationHtml}
      </section>`;
    }

    if (type === 'hotspot') {
      const area = normalizeHotspotArea(summary.hotspotAnswer || summary.hotspotArea || {});
      const pins = Array.isArray(summary.hotspotPins) ? summary.hotspotPins : [];
      const pinStats = summary.hotspotPinStats || {};
      const hideNames = !!pinStats.hiddenNames;
      const pinSampleNote = pinStats.sampled
        ? `${Number(pinStats.displayedPins || pins.length)} / ${Number(pinStats.totalPins || pins.length)} pins · random 20%`
        : `${Number(pinStats.totalPins || pins.length)} pins`;
      const hotspotStats = `<div class="qp-hotspot-stats-strip"><span class="is-correct"><b>${Number(pinStats.correctPins ?? summary.correctSubmissions ?? 0)}</b> correct</span><span class="is-wrong"><b>${Number(pinStats.wrongPins ?? summary.incorrectSubmissions ?? 0)}</b> wrong</span><span>${escape(pinSampleNote)}</span></div>`;
      return `<section class="${resultClass} qp-hotspot-reveal-card ${compact ? 'compact' : ''} ${hideNames ? 'hide-pin-names' : ''}">
        ${header}
        ${statsHtml}
        ${hotspotStats}
        <div class="qp-hotspot-reveal">
          ${renderHotspotSurface(summary.media, `<span class="qp-hotspot-correct-area" style="left:${area.x}%;top:${area.y}%;width:${area.w}%;height:${area.h}%;"></span>${pins.map((pin, index) => `<span class="qp-hotspot-student-pin ${pin.correct ? 'correct' : 'wrong'}" style="left:${Number(pin.x || 0)}%;top:${Number(pin.y || 0)}%;" title="${pin.correct ? 'Correct sample pin' : 'Wrong sample pin'}"><i>●</i>${hideNames ? '' : `<b>${escape((pin.name || ('Student ' + (index + 1))).slice(0, 16))}</b>`}</span>`).join('')}`, 'hotspotResultSurface') || '<div class="qp-empty">No image saved.</div>'}
        </div>
        ${showChart ? renderStatsBarChart(summary.choices || [], totalAnswered) : ''}
        ${explanationHtml}
      </section>`;
    }

    if (type === 'map') {
      const map = summary.mapAnswer || { x: 50, y: 50, radius: 8 };
      const pins = Array.isArray(summary.mapPins) ? summary.mapPins : [];
      const pinStats = summary.mapPinStats || {};
      const pinSampleNote = pinStats.sampled
        ? `${Number(pinStats.displayedPins || pins.length)} / ${Number(pinStats.totalPins || pins.length)} pins · random 20%`
        : `${Number(pinStats.totalPins || pins.length)} pins`;
      return `<section class="${resultClass} ${compact ? 'compact' : ''}">
        ${header}
        ${statsHtml}
        ${pins.length ? `<div class="qp-hotspot-stats-strip"><span class="is-correct"><b>${Number(pinStats.correctPins ?? summary.correctSubmissions ?? 0)}</b> correct</span><span class="is-wrong"><b>${Number(pinStats.wrongPins ?? summary.incorrectSubmissions ?? 0)}</b> wrong</span><span>${escape(pinSampleNote)}</span></div>` : ''}
        <div class="qp-map-reveal">
          ${renderMedia(summary.media, '') || '<div class="qp-empty">No map image saved.</div>'}
          <span class="qp-map-correct-ring" style="--x:${Number(map.x || 50)}%;--y:${Number(map.y || 50)}%;--r:${Number(map.radius || 8)}%;"></span>
          ${pins.map(pin => `<span class="qp-map-student-pin ${pin.correct ? 'correct' : 'wrong'}" style="left:${Number(pin.x || 0)}%;top:${Number(pin.y || 0)}%;">●</span>`).join('')}
          <span class="qp-map-correct-pin" style="left:${Number(map.x || 50)}%;top:${Number(map.y || 50)}%;">✓</span>
        </div>
        ${showChart ? renderStatsBarChart(summary.choices || [], totalAnswered) : ''}
        ${explanationHtml}
      </section>`;
    }

    return `<section class="qp-correct-reveal">${header}${statsHtml}<div class="qp-empty">Correct answer display is not available for this question type.</div></section>`;
  }


  function createModalHtml() {
    return `<div class="qp-create-modal" id="quizpulseNewModal" hidden role="dialog" aria-modal="true" aria-labelledby="qpNewModalTitle">
      <div class="qp-create-modal-backdrop" data-create-close></div>
      <section class="qp-create-modal-card qp-create-modal-card-clean" role="document">
        <header class="qp-create-modal-head">
          <div>
            <p class="qp-pill">Create</p>
            <h2 id="qpNewModalTitle">Create quiz</h2>
            <p>Choose exactly one starting point. Visibility can be set to Public or Private inside the creator.</p>
          </div>
          <button class="qp-create-close" data-create-close type="button" aria-label="Close create quiz dialog">×</button>
        </header>

        <div class="qp-create-modal-body qp-create-mode-body qp-create-mode-body-clean">
          <a class="qp-create-option qp-mode-card featured" href="/creator" data-create-option="blank" data-space-link>
            <span class="qp-create-option-tag">Recommended</span>
            <span class="qp-create-option-icon">＋</span>
            <strong>Blank Quiz</strong>
            <em>Start from one empty question and add the types you need.</em>
          </a>

          <a class="qp-create-option qp-mode-card" href="/creator?action=import" data-create-option="import-xlsx" data-space-link>
            <span class="qp-create-option-tag soft">Excel</span>
            <span class="qp-create-option-icon">⇪</span>
            <strong>Import from XLSX</strong>
            <em>Upload an Excel .xlsx file and build the quiz from its rows.</em>
          </a>
        </div>

        <footer class="qp-create-modal-foot qp-create-modal-foot-clean">
          <span>Blank and XLSX are the only create modes. No templates, bubble mode, or CSV import.</span>
        </footer>
      </section>
    </div>`;
  }


  function updateCreateModalTeachingSpaceLinks(modal) {
    const space = currentTeachingSpace();
    modal.querySelectorAll('[data-space-link]').forEach(link => {
      link.href = withTeachingSpaceUrl(link.getAttribute('href') || '/creator', 'normal');
    });
    const foot = modal.querySelector('.qp-create-modal-foot span');
    if (foot) {
      foot.textContent = space?.subjectId
        ? `Saving to ${space.courseName || 'College'} / ${space.subjectName || 'Subject'}.`
        : 'Choose a college and subject from the College page before creating teacher quizzes.';
    }
  }

  function setupNewModal(root = document) {
    normalizeUiLabels(root);
    if (!document.getElementById('quizpulseNewModal')) {
      document.body.insertAdjacentHTML('beforeend', createModalHtml());
    }
    const modal = document.getElementById('quizpulseNewModal');
    const open = () => {
      const user = currentStudent();
      const teacherLike = !!teacherSession() || ['teacher','college_manager','admin'].includes(String(user?.role || '').toLowerCase());
      if (teacherLike && !currentTeachingSpace()?.subjectId) {
        location.href = '/subjects';
        return;
      }
      updateCreateModalTeachingSpaceLinks(modal);
      modal.hidden = false;
      document.body.classList.add('qp-create-modal-open');
      setTimeout(() => modal.classList.add('show'), 10);
      const first = modal.querySelector('a,button');
      first && first.focus();
    };
    const close = () => {
      modal.classList.remove('show');
      document.body.classList.remove('qp-create-modal-open');
      setTimeout(() => { modal.hidden = true; }, 140);
    };
    root.querySelectorAll('[data-create-quiz]').forEach(el => {
      if (el.dataset.createBound === '1') return;
      el.dataset.createBound = '1';
      el.addEventListener('click', (event) => {
        event.preventDefault();
        open();
      });
    });
    modal.querySelectorAll('[data-create-close]').forEach(el => {
      if (el.dataset.closeBound === '1') return;
      el.dataset.closeBound = '1';
      el.addEventListener('click', close);
    });
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && !modal.hidden) close();
    });
    return { open, close };
  }


  function accountLabel(user) {
    const role = String(user?.role || '').toLowerCase();
    const display = String(user?.displayName || user?.username || 'Account').trim();
    const username = String(user?.username || '').trim();
    const avatarId = String(user?.avatar || '');
    const premium = /^premium_[a-z0-9_]{2,80}$/i.test(avatarId);
    const icon = premium ? avatarEmoji(avatarId, user?.avatarEmoji) : role === 'admin' ? '🛡️' : role === 'college_manager' ? '🏫' : role === 'teacher' ? '👨‍🏫' : avatarEmoji(avatarId || 'fox', user?.avatarEmoji);
    const roleText = accountTranslations[language()]?.[role] || accountTranslations[language()]?.student || 'Student';
    return { icon, roleText, display, username, avatarId: premium || role === 'student' ? avatarId : '' };
  }

  function syncAccountChipLanguage() {
    const chip = document.getElementById('qpAccountMenuTrigger');
    if (!chip) return;
    const role = String(chip.dataset.accountRole || 'student');
    const roleText = accountTranslations[language()]?.[role] || accountTranslations[language()]?.student;
    chip.setAttribute('aria-label', language() === 'ar' ? `${roleText} - ${accountTranslations.ar.current}` : `Open ${roleText} account menu`);
  }

  function syncHeaderNotificationCount(unread = 0) {
    const badge = document.querySelector('[data-header-unread]');
    if (!badge) return;
    const count = Math.max(0, Number(unread || 0));
    badge.hidden = count < 1;
    badge.textContent = String(Math.min(99, count));
    badge.setAttribute('aria-label', `${count} unread message${count === 1 ? '' : 's'}`);
  }

  function closeAccountMenu({ restoreFocus = false } = {}) {
    const menu = document.getElementById('qpAccountMenu');
    const trigger = document.getElementById('qpAccountMenuTrigger');
    if (!menu || menu.hidden) return;
    menu.hidden = true;
    trigger?.setAttribute('aria-expanded', 'false');
    if (restoreFocus) trigger?.focus();
  }

  async function loadAccountThemeOptions(select, force = false) {
    if (!select || (select.dataset.loaded === '1' && !force)) return;
    select.disabled = true;
    select.innerHTML = '<option value="">Loading...</option>';
    try {
      const payload = await api('/api/themes/options');
      const options = Array.isArray(payload?.options) ? payload.options : [];
      select.innerHTML = options.map(option => `<option value="${escape(option.id)}">${escape(option.name)}</option>`).join('');
      const preference = String(payload?.preference?.themeId || 'workspace-default');
      select.value = options.some(option => option.id === preference) ? preference : 'workspace-default';
      select.dataset.loaded = '1';
    } catch (error) {
      select.innerHTML = '<option value="workspace-default">Workspace Default</option>';
      select.value = 'workspace-default';
      toast(error.message || 'Could not load themes');
    } finally {
      select.disabled = false;
    }
  }

  async function saveAccountThemePreference(select) {
    const themeId = String(select?.value || 'workspace-default');
    select.disabled = true;
    try {
      await api('/api/account/theme-preference', { method: 'PUT', body: JSON.stringify({ themeId }) });
      window.QuizPulseTheme?.clearCache?.();
      await window.QuizPulseTheme?.refresh?.();
      toast('Theme updated');
    } catch (error) {
      await loadAccountThemeOptions(select, true);
      toast(error.message || 'Could not update theme');
    } finally {
      select.disabled = false;
    }
  }

  function bindAccountMenu() {
    if (document.documentElement.dataset.qpAccountMenuBound === '1') return;
    document.documentElement.dataset.qpAccountMenuBound = '1';
    document.addEventListener('click', async event => {
      const trigger = event.target.closest?.('#qpAccountMenuTrigger');
      const menu = document.getElementById('qpAccountMenu');
      if (trigger && menu) {
        const opening = menu.hidden;
        closeAccountMenu();
        menu.hidden = !opening;
        trigger.setAttribute('aria-expanded', String(opening));
        if (opening) {
          loadAccountThemeOptions(menu.querySelector('#qpAccountThemeSelect')).catch(() => {});
          menu.querySelector('a,button,select')?.focus();
        }
        return;
      }
      const action = event.target.closest?.('[data-account-menu-action]');
      if (action) {
        const type = action.dataset.accountMenuAction;
        if (type === 'sound') {
          setSoundEnabled(!isSoundEnabled());
          action.setAttribute('aria-pressed', String(isSoundEnabled()));
          action.querySelector('span:last-child').textContent = isSoundEnabled() ? 'On' : 'Off';
        } else if (type === 'logout') {
          closeAccountMenu();
          try {
            if (teacherSession()) await logoutTeacher();
            else await logoutStudent();
          } finally {
            location.replace('/');
          }
        }
        return;
      }
      if (!event.target.closest?.('#qpAccountMenu')) closeAccountMenu();
    });
    document.addEventListener('change', event => {
      const select = event.target.closest?.('#qpAccountThemeSelect');
      if (select) saveAccountThemePreference(select).catch(() => {});
    });
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape') closeAccountMenu({ restoreFocus: true });
    });
    window.addEventListener('resize', () => closeAccountMenu());
  }

  function renderAccountChip(user) {
    if (document.body?.classList?.contains('qp-creator-body') || document.body?.classList?.contains('qp-practice-choice-body')) {
      document.getElementById('qpHeaderAccountCluster')?.remove();
      return;
    }
    if (!user) return;
    const topActions = document.querySelector('.qp-dashboard-top-actions') || document.querySelector('.qp-topbar') || document.querySelector('header');
    if (!topActions) return;
    const info = accountLabel(user);
    // Their own picture, when they have chosen one over a character.
    const chipFace = avatarFace(user);
    let cluster = document.getElementById('qpHeaderAccountCluster');
    if (!cluster) {
      cluster = document.createElement('div');
      cluster.id = 'qpHeaderAccountCluster';
      cluster.className = 'qp-header-account-cluster';
      topActions.appendChild(cluster);
    }
    // The super admin has no messages, profile or badges, so its chip offers only what applies to it.
    const superAdmin = PLATFORM_ACCOUNT_ROLES.includes(String(user?.role || '').toLowerCase());
    cluster.innerHTML = `
      ${superAdmin ? '' : '<button class="qp-header-notifications" type="button" data-open-header-chat aria-label="Open messages" title="Messages"><span aria-hidden="true">&#x1F514;</span><b data-header-unread hidden>0</b></button>'}
      <button class="qp-account-menu-trigger" id="qpAccountMenuTrigger" type="button" data-account-role="${escape(String(user?.role || 'student').toLowerCase())}" aria-haspopup="menu" aria-expanded="false">
        <span class="qp-account-chip-avatar ${chipFace.motionClass}">${chipFace.picture ? `<img src="${escape(chipFace.picture)}" alt="" />` : info.icon}</span><span class="qp-account-trigger-name">${escape(info.display)}</span><span aria-hidden="true">&#x2304;</span>
      </button>
      <div class="qp-account-menu" id="qpAccountMenu" role="menu" hidden>
        <div class="qp-account-menu-identity"><span class="qp-account-chip-avatar ${avatarMotionClass(info.avatarId)}">${info.icon}</span><span><b>${escape(info.display)}</b>${info.username ? `<small>@${escape(info.username)}</small>` : ''}</span></div>
        ${superAdmin ? '' : `<a href="/profile" role="menuitem"><span aria-hidden="true">&#x263A;</span><span>Profile</span></a>
        <a href="/settings" role="menuitem"><span aria-hidden="true">&#x2699;</span><span>Settings</span></a>`}
        ${String(user?.role || '').toLowerCase() === 'admin' ? '<a href="/settings#themes" role="menuitem"><span aria-hidden="true">&#x25C8;</span><span>Theme Generator</span></a>' : ''}
        ${superAdmin ? '' : '<label class="qp-account-theme-picker"><span aria-hidden="true">&#x25D0;</span><span>Theme</span><select id="qpAccountThemeSelect" aria-label="Choose theme"><option value="">Loading...</option></select></label>'}
        <button type="button" role="menuitem" data-account-menu-action="sound" aria-pressed="${String(isSoundEnabled())}"><span aria-hidden="true">&#x266B;</span><span>Sound</span><span>${isSoundEnabled() ? 'On' : 'Off'}</span></button>
        ${superAdmin ? '' : '<a href="/profile#badges" role="menuitem"><span aria-hidden="true">&#x2726;</span><span>Badges</span></a>'}
        <div class="qp-account-menu-separator" role="separator"></div>
        <button type="button" role="menuitem" class="danger" data-account-menu-action="logout"><span aria-hidden="true">&#x2192;</span><span>Log out</span></button>
      </div>`;
    cluster.querySelector('[data-open-header-chat]')?.addEventListener('click', () => openAdaptiveChat());
    bindAccountMenu();
    syncAccountChipLanguage();
  }

  async function refreshAccountChip() {
    let user = currentStudent();
    if (studentSession()) {
      try { user = await recentStudentProfile() || user; } catch (_) {}
    }
    if (user) {
      renderAccountChip(user);
      syncDashboardSidebar(user);
    }
    return user;
  }

  document.addEventListener('DOMContentLoaded', () => {
    applyPerformanceMode();
    bindPerformanceControls(document);
    normalizeUiLabels(document);
    refreshAccountChip();
    startGiftNotificationRefresh();
    if (document.querySelector('[data-create-quiz]')) setupNewModal(document);
  });

  function startGiftNotificationRefresh() {
    let timer = null;
    let running = false;
    let nextRefreshAt = Date.now() + 800;
    const schedule = () => {
      clearTimeout(timer);
      timer = null;
      if (running || document.hidden || navigator.onLine === false) return;
      timer = setTimeout(refresh, Math.max(0, nextRefreshAt - Date.now()));
    };
    const refresh = async () => {
      timer = null;
      if (running || document.hidden || navigator.onLine === false) return;
      running = true;
      try { await showUnreadShopGift(); }
      finally {
        running = false;
        // Avoid overlapping slow requests and synchronized background polling.
        nextRefreshAt = Date.now() + 25000 + Math.floor(Math.random() * 5000);
        schedule();
      }
    };
    document.addEventListener('visibilitychange', schedule);
    window.addEventListener('online', schedule);
    window.addEventListener('offline', schedule);
    schedule();
  }

  async function showUnreadShopGift() {
    const account = currentStudent();
    if (document.body?.classList.contains('qp-game-body') || !account || String(account.role || '').toLowerCase() !== 'student' || document.getElementById('qpShopGiftNotice')) return;
    try {
      const data = await api('/api/shop/notifications?unread=true');
      if (document.hidden || account.id !== currentStudent()?.id || document.getElementById('qpShopGiftNotice')) return;
      const gift = data?.notifications?.[0];
      if (!gift) return;
      const overlay = document.createElement('div');
      overlay.className = 'qp-shop-gift-notice';
      overlay.id = 'qpShopGiftNotice';
      // A character or a title shows what was given; coins show how many.
      const titleGift = gift.type === 'title_gift';
      const itemGift = titleGift || gift.type === 'character_gift';
      overlay.innerHTML = `<section role="dialog" aria-modal="true" aria-label="Gift received">
        <button type="button" data-shop-gift-close aria-label="Close">&times;</button>
        <div class="qp-shop-gift-spark">&#x2728;</div>
        <div class="qp-shop-gift-coin">${titleGift ? '&#x1F3F7;&#xFE0F;' : itemGift ? escape(gift.itemEmoji || '🎁') : '&#x1FA99;'}</div>
        <strong>${itemGift ? escape(gift.itemName || (titleGift ? 'New title' : 'New character')) : `+${Number(gift.amount || 0).toLocaleString()}`}</strong>
        <p>${escape(gift.message || 'A gift was added to your account.')}<br><small>Contents provided by the administrator.</small></p>
        <a href="/shop">Open shop</a>
      </section>`;
      document.body.appendChild(overlay);
      const markRead = async () => {
        try { await api('/api/shop/notifications/read', { method: 'POST', body: JSON.stringify({ ids: [gift.id] }) }); } catch (_) {}
      };
      const close = async () => {
        overlay.remove();
        await markRead();
      };
      overlay.querySelector('[data-shop-gift-close]')?.addEventListener('click', close);
      overlay.querySelector('a')?.addEventListener('click', async event => {
        event.preventDefault();
        await markRead();
        location.href = '/shop';
      });
      overlay.addEventListener('click', event => { if (event.target === overlay) close(); });
    } catch (_) {}
  }

  function avatarEmoji(id, explicitEmoji = '') {
    const explicit = String(explicitEmoji || '').normalize('NFC').trim();
    if (explicit && !/[\u0000-\u007f]/.test(explicit)) {
      return Array.from(explicit).slice(0, 12).join('');
    }
    return avatarList.find(a => a.id === id)?.emoji || '🙂';
  }
  function typeLabel(type) {
    return questionTypes.find(t => t.id === type)?.label || type;
  }


  const quizBackgroundPresets = [
    { id: 'neo', label: 'Neo Purple', css: 'radial-gradient(circle at 18% 12%, rgba(255,255,255,.22), transparent 26%), radial-gradient(circle at 82% 18%, rgba(45,212,191,.30), transparent 24%), linear-gradient(135deg, #46178f 0%, #6d28d9 48%, #111827 100%)' },
    { id: 'kahoot', label: 'Kahoot Classic', css: 'radial-gradient(circle at 16% 18%, rgba(255,255,255,.25), transparent 23%), radial-gradient(circle at 85% 20%, rgba(250,204,21,.42), transparent 24%), linear-gradient(135deg, #25076b 0%, #46178f 45%, #0f172a 100%)' },
    { id: 'ocean', label: 'Ocean Blue', css: 'radial-gradient(circle at 20% 18%, rgba(255,255,255,.18), transparent 25%), linear-gradient(135deg, #0f4c81 0%, #2563eb 48%, #0f172a 100%)' },
    // Pale: white writing needs a deeper wash over it in the waiting room (quizpulse_game.css, data-quiz-bg-tone).
    { id: 'alkafeel', label: 'Alkafeel Blue', tone: 'pale', css: 'linear-gradient(rgba(255,255,255,.80), rgba(255,255,255,.70)), radial-gradient(circle at 15% 12%, rgba(31,155,209,.22), transparent 28%), linear-gradient(135deg, #ffffff 0%, #e5f7ff 26%, #35a8d6 100%)' },
    { id: 'sunset', label: 'Sunset', css: 'radial-gradient(circle at 25% 20%, rgba(255,255,255,.22), transparent 26%), linear-gradient(135deg, #7c2d12 0%, #e11d48 50%, #581c87 100%)' },
    { id: 'forest', label: 'Forest', css: 'radial-gradient(circle at 20% 16%, rgba(255,255,255,.18), transparent 24%), linear-gradient(135deg, #064e3b 0%, #059669 48%, #0f172a 100%)' },
    { id: 'aurora', label: 'Aurora Stage', css: 'radial-gradient(circle at 50% -18%, rgba(124,58,237,.62), transparent 44%), radial-gradient(circle at 50% 92%, rgba(34,211,238,.34), transparent 26%), radial-gradient(circle at 18% 58%, rgba(168,85,247,.34), transparent 34%), linear-gradient(135deg, #060026 0%, #180048 38%, #071b74 68%, #020617 100%)' },
    { id: 'midnight', label: 'Midnight', css: 'radial-gradient(circle at 70% 16%, rgba(167,139,250,.35), transparent 25%), linear-gradient(135deg, #020617 0%, #1e1b4b 55%, #111827 100%)' },
    // A lecture hall's own background: ink and slate, almost no colour, with one soft light above the stage. It reads as
    // a seminar rather than a game show, and a projector throws little glare from it.
    { id: 'lecture', label: 'Lecture Hall', css: 'radial-gradient(ellipse at 50% -12%, rgba(226,232,240,.20), transparent 42%), linear-gradient(160deg, #111827 0%, #1f2937 45%, #0b1220 100%)' },
    { id: 'graphite', label: 'Graphite', css: 'radial-gradient(circle at 22% 14%, rgba(255,255,255,.12), transparent 26%), linear-gradient(135deg, #1f2124 0%, #3a3f45 52%, #16181b 100%)' },
    { id: 'sand', label: 'Desert Sand', css: 'radial-gradient(circle at 18% 14%, rgba(255,255,255,.22), transparent 26%), linear-gradient(135deg, #7c4a12 0%, #c98b3a 48%, #3b2412 100%)' },
    { id: 'teal', label: 'Deep Teal', css: 'radial-gradient(circle at 78% 14%, rgba(45,212,191,.28), transparent 26%), linear-gradient(135deg, #062a2f 0%, #0f766e 50%, #041c20 100%)' },
    { id: 'rose', label: 'Rose Dusk', css: 'radial-gradient(circle at 20% 16%, rgba(255,255,255,.20), transparent 24%), linear-gradient(135deg, #4a0f3a 0%, #b03a76 52%, #2a0b24 100%)' }
  ];

  function quizBackgroundPresetCss(id = 'neo') {
    return (quizBackgroundPresets.find(p => p.id === id) || quizBackgroundPresets[0]).css;
  }

  function quizBackgroundCss(settings = {}) {
    const theme = settings.theme || {};
    const bgImage = theme.backgroundImage || settings.backgroundImage || null;
    if (bgImage && bgImage.dataUrl) {
      const url = safeCssUrl(bgImage.dataUrl, 'image/');
      if (url) return `linear-gradient(rgba(24, 8, 76, .30), rgba(15, 23, 42, .68)), url("${url}") center / cover fixed no-repeat`;
    }
    return quizBackgroundPresetCss(theme.backgroundPreset || settings.backgroundPreset || 'neo');
  }

  function applyQuizBackground(settings = {}, target = document.body) {
    if (!target) return;
    const theme = settings.theme || {};
    const hasImage = !!((theme.backgroundImage || settings.backgroundImage || {}).dataUrl);
    const preset = theme.backgroundPreset || settings.backgroundPreset || 'neo';
    const css = quizBackgroundCss(settings);
    document.documentElement.style.setProperty('--qp-quiz-bg', css);
    target.classList.add('qp-has-quiz-background');
    target.dataset.quizBgPreset = hasImage ? 'custom' : preset;
    // A picture carries its own dark scrim (quizBackgroundCss), so only a pale preset asks for the deeper wash.
    target.dataset.quizBgTone = hasImage ? 'dark' : (quizBackgroundPresets.find(item => item.id === preset)?.tone || 'dark');
  }

  function quizBackgroundLabel(settings = {}) {
    const theme = settings.theme || {};
    if ((theme.backgroundImage || settings.backgroundImage || {}).dataUrl) return 'Custom picture';
    return (quizBackgroundPresets.find(p => p.id === (theme.backgroundPreset || settings.backgroundPreset || 'neo')) || quizBackgroundPresets[0]).label;
  }

  function backgroundForQuestion(settings = {}, question = {}) {
    const qBg = question?.backgroundImage || question?.theme?.backgroundImage || null;
    if (!qBg || !qBg.dataUrl) return settings || {};
    const theme = { ...((settings || {}).theme || {}), backgroundImage: qBg };
    return { ...(settings || {}), theme };
  }

  function liveTextDirectionClass(text = '') {
    return /[\u0590-\u08FF]/.test(String(text || '')) ? ' is-rtl' : '';
  }

  function liveTextSizeClass(text = '', kind = 'question') {
    const length = String(text || '').trim().length;
    if (kind === 'answer') {
      if (length > 170) return ' is-very-long';
      if (length > 110) return ' is-long';
      if (length >= 70) return ' is-medium';
      return '';
    }
    if (length > 170) return ' is-very-long';
    if (length > 110) return ' is-long';
    if (length >= 70) return ' is-medium';
    if (length < 34) return ' is-short';
    return '';
  }

  function liveQuestionTitleClass(text = '') {
    return `${liveTextSizeClass(text, 'question')}${liveTextDirectionClass(text)}`;
  }

  function liveAnswerTextClass(text = '') {
    return `${liveTextSizeClass(text, 'answer')}${liveTextDirectionClass(text)}`;
  }

  function liveAnswerGridClass(question = {}) {
    const count = Array.isArray(question.choices) ? question.choices.length : 0;
    return `ans-count-${Math.max(1, Math.min(9, count))}`;
  }

  function liveQuestionTypeClass(type = '') {
    return `qp-live-type-${String(type || 'mcq').replace(/[^a-z0-9_-]/gi, '').toLowerCase() || 'mcq'}`;
  }

  function liveQuestionHasMedia(question = {}, options = {}) {
    if (options.hiddenQuestion) return false;
    if (['hotspot', 'map'].includes(String(question.type || ''))) return false;
    return !!renderMedia(question.media, '');
  }

  function renderLiveQuestionCard(question = {}, options = {}) {
    const mode = options.mode || 'host';
    const hiddenQuestion = !!options.hiddenQuestion;
    const title = hiddenQuestion ? (options.hiddenTitle || 'Watch teacher screen') : String(question.title || 'Question');
    const cardCompat = mode === 'host' ? ' qp-simple-question-box' : '';
    const titleCompat = mode === 'host' ? ' qp-big-question' : ' qp-student-question-title';
    const hiddenClass = hiddenQuestion ? ' is-hidden-question' : '';
    const styleClass = usesNewQuestionStyle(question.type) ? ' qp-new-question-style' : '';
    return `<div class="qp-live-question-card ${liveQuestionTypeClass(question.type)}${cardCompat}${hiddenClass}${styleClass}" data-live-mode="${escape(mode)}" data-interaction-mode="${escape(options.interactionMode || (mode === 'student' ? 'classic-member' : 'host'))}">
      <h1 class="qp-live-question-title${titleCompat}${hiddenClass}${liveQuestionTitleClass(title)}" dir="auto" title="${escape(title)}">${escape(title)}</h1>
    </div>`;
  }

  function renderLiveQuestionMedia(question = {}, options = {}) {
    const mode = options.mode || 'host';
    if (options.hiddenQuestion || ['hotspot', 'map'].includes(String(question.type || ''))) return '';
    const mediaHtml = renderMedia(question.media, mode === 'host' ? 'qp-simple-board-media' : '');
    if (!mediaHtml) return '';
    const compat = mode === 'host' ? ' qp-simple-media-area has-media' : ' qp-live-media';
    return `<div class="qp-live-media-stage ${liveQuestionTypeClass(question.type)}${compat}">${mediaHtml}</div>`;
  }

  function renderLiveChoiceCards(question = {}, options = {}) {
    const type = String(question.type || 'mcq');
    const mode = options.mode || 'host';
    const choices = Array.isArray(question.choices) ? question.choices : [];
    if (!choices.length) return '';
    const interactive = mode === 'student';
    const isMulti = type === 'multiselect';
    const tag = interactive ? 'button' : 'div';
    const hostCompat = mode === 'host' ? ' qp-simple-answer-grid' : '';
    const gridClasses = [
      'qp-live-answer-grid',
      'qp-game-answers',
      hostCompat.trim(),
      liveQuestionTypeClass(type),
      liveAnswerGridClass(question),
      type === 'truefalse' ? 'two' : '',
      `qp-live-mode-${mode}`
    ].filter(Boolean).join(' ');
    return `<div class="${gridClasses}">
      ${choices.map((choice, index) => {
        const color = colors[index % colors.length];
        const shape = type === 'poll' ? String(index + 1) : answerShape(index).icon;
        const dataAttr = interactive
          ? (isMulti ? ` data-multi="${escape(choice.id)}"` : ` data-answer="${escape(choice.id)}"`)
          : ' aria-disabled="true"';
        const typeAttr = interactive ? ' type="button"' : '';
        const hostAnswerCompat = mode === 'host' ? ' qp-simple-answer' : '';
        const check = interactive && isMulti ? '<span class="qp-multi-check">&#10003;</span>' : '';
        return `<${tag}${typeAttr} class="qp-live-answer-card qp-game-answer${hostAnswerCompat} ${color}"${dataAttr}>
          <span class="qp-answer-shape">${escape(shape)}</span>
          <span class="qp-answer-label${liveAnswerTextClass(choice.text)}" dir="auto">${escape(choice.text || '')}</span>
          ${check}
        </${tag}>`;
      }).join('')}
    </div>`;
  }

  function renderLiveHostPreview(question = {}) {
    const type = String(question.type || 'mcq');
    if (type === 'wordcloud') {
      return `<div class="qp-live-special-answer qp-wordcloud-live">${wordCloudStageHtml([], { emptyText: 'Waiting for the first words' })}</div>`;
    }
    if (type === 'slider') {
      const min = Number(question.slider?.min ?? 0);
      const max = Number(question.slider?.max ?? 20);
      return `<div class="qp-live-special-answer qp-host-preview qp-host-preview-slider">
        <div class="qp-host-preview-slider-track"><div class="qp-host-preview-slider-thumb"></div></div>
        <div class="qp-host-preview-slider-ends"><span dir="auto">${escape(String(min))}</span><span>Students drag to answer</span><span dir="auto">${escape(String(max))}</span></div>
      </div>`;
    }
    if (type === 'type') {
      if (usesNewQuestionStyle(type)) {
        return '<div class="qp-live-special-answer qp-new-question-answer qp-new-type-answer qp-new-question-preview"><input class="qp-new-answer-control" placeholder="Your answer" disabled aria-label="Student answer preview"></div>';
      }
      return '<div class="qp-live-special-answer qp-answer-wait">Typing...</div>';
    }
    if (type === 'order') {
      const items = Array.isArray(question.orderItems) ? question.orderItems : [];
      return items.length
        ? `<div class="qp-live-special-answer qp-host-preview qp-host-preview-order">${items.map((item, index) => `<div class="qp-host-preview-order-item"><span class="qp-host-preview-order-num">${index + 1}</span><span dir="auto">${escape(item.text || '')}</span></div>`).join('')}</div>`
        : '<div class="qp-live-special-answer qp-answer-wait">Order answer</div>';
    }
    if (type === 'hotspot') {
      return `<div class="qp-live-special-answer qp-host-preview qp-host-preview-imagezone">${question.media ? renderMedia(question.media, 'qp-simple-board-media') : ''}<p class="qp-host-preview-caption">Drop a pin</p></div>`;
    }
    if (type === 'map') {
      return `<div class="qp-live-special-answer qp-host-preview qp-host-preview-imagezone">${question.media ? renderMedia(question.media, 'qp-simple-board-media') : ''}<p class="qp-host-preview-caption">Mark the map</p></div>`;
    }
    if (type === 'matching') {
      const pairs = Array.isArray(question.matchingPairs) ? question.matchingPairs : [];
      const options = Array.isArray(question.matchingOptions) ? question.matchingOptions : [];
      if (usesNewQuestionStyle(type)) {
        return pairs.length
          ? `<div class="qp-live-special-answer qp-new-question-answer qp-new-matching-answer qp-new-question-preview">${pairs.map(pair => `<div class="qp-new-match-row"><span class="qp-new-answer-label" dir="auto">${escape(pair.left || '')}</span><div class="qp-new-answer-control qp-new-select-preview"><span>Choose answer</span><b aria-hidden="true">⌄</b></div></div>`).join('')}</div>`
          : '<div class="qp-live-special-answer qp-answer-wait">Matching pairs</div>';
      }
      return pairs.length
        ? `<div class="qp-live-special-answer qp-host-preview qp-host-preview-matching">
            <div class="qp-host-preview-matching-col">${pairs.map(pair => `<div class="qp-host-preview-matching-item" dir="auto">${escape(pair.left || '')}</div>`).join('')}</div>
            <div class="qp-host-preview-matching-col">${options.map(option => `<div class="qp-host-preview-matching-item" dir="auto">${escape(option.text || '')}</div>`).join('')}</div>
          </div>`
        : '<div class="qp-live-special-answer qp-answer-wait">Matching pairs</div>';
    }
    if (type === 'fillblank') {
      const blanks = Array.isArray(question.fillBlanks) ? question.fillBlanks : [];
      if (usesNewQuestionStyle(type)) {
        return blanks.length
          ? `<div class="qp-live-special-answer qp-new-question-answer qp-new-fillblank-answer qp-new-question-preview"><div class="qp-new-fillblank-fields">${blanks.map((blank, index) => `<label class="qp-new-field-group"><span class="qp-new-answer-label" dir="auto">${escape(blank.label || `Blank ${index + 1}`)}</span><input class="qp-new-answer-control" placeholder="Type answer" disabled></label>`).join('')}</div></div>`
          : '<div class="qp-live-special-answer qp-answer-wait">Fill in the blank</div>';
      }
      return blanks.length
        ? `<div class="qp-live-special-answer qp-host-preview qp-host-preview-fillblank">${blanks.map(blank => `<span class="qp-host-preview-blank-chip" dir="auto">${escape(blank.label || 'Blank')}</span>`).join('')}</div>`
        : '<div class="qp-live-special-answer qp-answer-wait">Fill in the blank</div>';
    }
    return '';
  }

  // A live game takes the whole screen. A browser only grants fullscreen from
  // a user gesture, so the request rides on the taps the student is already
  // making: it is asked for at the moment they enter the game, and asked again
  // on their next tap if that first attempt was refused. Nothing here can
  // throw into the caller -- a refusal just leaves the page as it was.
  let wantGameFullscreen = false;

  function gameFullscreenActive() {
    return !!(document.fullscreenElement || document.webkitFullscreenElement);
  }

  function askForGameFullscreen() {
    if (gameFullscreenActive()) return Promise.resolve(true);
    const root = document.documentElement;
    const request = root.requestFullscreen || root.webkitRequestFullscreen;
    if (!request) return Promise.resolve(false);
    try {
      return Promise.resolve(request.call(root, { navigationUI: 'hide' })).then(() => true, () => false);
    } catch (_) {
      return Promise.resolve(false);
    }
  }

  // Called when the student enters a live game.
  function enterGameFullscreen() {
    wantGameFullscreen = true;
    document.body.classList.add('qp-game-fullscreen');
    return askForGameFullscreen();
  }

  function leaveGameFullscreen() {
    wantGameFullscreen = false;
    document.body.classList.remove('qp-game-fullscreen');
    try {
      if (gameFullscreenActive() && document.exitFullscreen) document.exitFullscreen().catch(() => {});
    } catch (_) {}
  }

  // The retry. Capture phase so it runs even when the tap is handled elsewhere.
  document.addEventListener('pointerdown', () => {
    if (wantGameFullscreen && !gameFullscreenActive()) askForGameFullscreen();
  }, { capture: true, passive: true });

  // Leaving fullscreen by the browser's own gesture is the student's choice.
  document.addEventListener('fullscreenchange', () => {
    document.body.classList.toggle('qp-game-fullscreen', wantGameFullscreen && gameFullscreenActive());
  });

  function renderLiveStudentInput(question = {}, options = {}) {
    const type = String(question.type || 'mcq');
    const teamMode = String(options.interactionMode || '').startsWith('team-');
    const actionLabel = teamMode ? 'Share Suggestion' : 'Lock Answer';
    if (type === 'wordcloud') {
      const max = Math.min(3, Math.max(1, Number(question.wordCloud?.maxAnswers || 1)));
      const length = Math.min(25, Math.max(1, Number(question.wordCloud?.maxLength || 25)));
      const fields = Array.from({ length: max }, (_, index) => `<input class="qp-input qp-wordcloud-field" data-wordcloud-word maxlength="${length}" dir="auto" autocomplete="off" autocapitalize="off" spellcheck="false" enterkeyhint="${index === max - 1 ? 'send' : 'next'}" placeholder="${index === 0 ? 'Type a word' : `Word ${index + 1} (optional)`}" aria-label="Word ${index + 1}">`).join('');
      return `<div class="qp-live-special-answer qp-wordcloud-answer">
        ${fields}
        <small class="qp-wordcloud-hint">${max > 1 ? `Up to ${max} words, ` : ''}${length} characters each</small>
        <button class="qp-btn success qp-big-submit" id="submitWordCloud" type="button" disabled>${teamMode ? 'Share Suggestion' : 'Send'}</button>
      </div>`;
    }
    if (type === 'type') {
      if (usesNewQuestionStyle(type)) {
        return `<div class="qp-live-special-answer qp-new-question-answer qp-new-type-answer">
          <input class="qp-input qp-live-text-input qp-new-answer-control" id="typeAnswer" placeholder="Your answer" autocomplete="off">
          <button class="qp-btn success qp-big-submit qp-new-check-answer" id="submitType" type="button" disabled>Check answer</button>
        </div>`;
      }
      return `<input class="qp-input qp-live-text-input" id="typeAnswer" placeholder="Type your answer">
        <div class="qp-live-answer-actions"><button class="qp-btn success qp-big-submit" id="submitType" type="button">${actionLabel}</button></div>`;
    }
    if (type === 'slider') {
      const slider = question.slider || { min: 0, max: 20, correct: 10, step: 1, labelLeft: 'Low', labelRight: 'High' };
      const start = Math.round((Number(slider.min) + Number(slider.max)) / 2);
      return `<div class="qp-live-special-answer qp-live-slider-input">
        <div class="qp-slider-value" id="sliderValue">${start}</div>
        <div class="qp-slider-sides"><span dir="auto">${escape(slider.labelLeft || slider.min)}</span><span dir="auto">${escape(slider.labelRight || slider.max)}</span></div>
        <input class="qp-slider-answer" id="sliderAnswer" type="range" min="${escape(slider.min)}" max="${escape(slider.max)}" step="${escape(slider.step || 1)}" value="${start}">
        <button class="qp-btn success qp-big-submit" id="submitSlider" type="button">${actionLabel}</button>
      </div>`;
    }
    if (type === 'order') {
      const items = Array.isArray(question.orderItems) ? question.orderItems : [];
      return `<div class="qp-live-special-answer qp-order-play qp-order-clean" id="orderPlay">
          ${items.map(item => `<div class="qp-order-play-item" draggable="true" data-id="${escape(item.id)}"><span class="qp-drag-handle" aria-hidden="true">::</span><span class="qp-order-text" dir="auto">${escape(item.text)}</span></div>`).join('')}
        </div>
        <button class="qp-btn success qp-big-submit" type="button" id="submitOrder">${teamMode ? 'Share Order' : 'Lock Order'}</button>`;
    }
    if (type === 'matching') {
      const pairs = Array.isArray(question.matchingPairs) ? question.matchingPairs : [];
      const options = Array.isArray(question.matchingOptions) ? question.matchingOptions : [];
      if (usesNewQuestionStyle(type)) {
        return `<div class="qp-live-special-answer qp-new-question-answer qp-new-matching-answer" id="connectPlay">
          <div class="qp-new-match-rows">
            ${pairs.map(pair => `<label class="qp-new-match-row"><span class="qp-new-answer-label" dir="auto">${escape(pair.left || '')}</span><span class="qp-new-select-wrap"><select class="qp-new-answer-control qp-new-match-select" data-new-match-select="${escape(pair.id)}" aria-label="Match for ${escape(pair.left || '')}"><option value="">Choose answer</option>${options.map(option => `<option value="${escape(option.id)}" dir="auto">${escape(option.text || '')}</option>`).join('')}</select><span aria-hidden="true">⌄</span></span></label>`).join('')}
          </div>
          <button class="qp-btn success qp-big-submit qp-new-check-answer" type="button" id="submitMatching" disabled>Check answer</button>
        </div>`;
      }
      const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
      return `<div class="qp-live-special-answer qp-matching-play qp-connect-play" id="connectPlay">
        <div class="qp-connect-progress" id="connectProgress">0 / ${pairs.length} matched</div>
        <div class="qp-connect-columns">
          <div class="qp-connect-col"><h3>1-2-3-4</h3>${pairs.map((pair, index) => `<button type="button" class="qp-connect-card left" data-match-left="${escape(pair.id)}" data-match-number="${index + 1}"><span class="qp-connect-badge">${index + 1}</span><span class="qp-connect-card-text" dir="auto">${escape(pair.left || '')}</span><small data-connect-choice="${escape(pair.id)}"></small></button>`).join('')}</div>
          <div class="qp-connect-col"><h3>A-B-C-D</h3>${options.map((option, index) => `<button type="button" class="qp-connect-card right" data-match-right="${escape(option.id)}"><span class="qp-connect-badge qp-connect-letter">${escape(letters[index] || String(index + 1))}</span><span class="qp-connect-card-text" dir="auto">${escape(option.text || '')}</span><small class="qp-connect-picked" data-connect-picked="${escape(option.id)}"></small></button>`).join('')}</div>
        </div>
        <div class="qp-connect-actions">
          <button class="qp-btn" type="button" id="clearMatching">Clear matches</button>
          <button class="qp-btn success qp-big-submit" type="button" id="submitMatching">${teamMode ? 'Share Matches' : 'Lock Matches'}</button>
        </div>
      </div>`;
    }
    if (type === 'fillblank') {
      const blanks = Array.isArray(question.fillBlanks) ? question.fillBlanks : [];
      if (usesNewQuestionStyle(type)) {
        return `<div class="qp-live-special-answer qp-new-question-answer qp-new-fillblank-answer">
          <div class="qp-new-fillblank-fields">${blanks.map((blank, index) => `<label class="qp-new-field-group"><span class="qp-new-answer-label" dir="auto">${escape(blank.label || `Blank ${index + 1}`)}</span><input class="qp-input qp-fillblank-input qp-new-answer-control" data-fillblank="${escape(blank.id)}" placeholder="Type answer" autocomplete="off"></label>`).join('')}</div>
          <button class="qp-btn success qp-big-submit qp-new-check-answer" type="button" id="submitFillBlank" disabled>Check answer</button>
        </div>`;
      }
      return `<div class="qp-live-special-answer qp-fillblank-play">
        ${blanks.map((blank, index) => `<label class="qp-fillblank-play-row"><span dir="auto">${escape(blank.label || `Blank ${index + 1}`)}</span><input class="qp-input qp-fillblank-input" data-fillblank="${escape(blank.id)}" placeholder="Type answer"></label>`).join('')}
        <button class="qp-btn success qp-big-submit" type="button" id="submitFillBlank">${actionLabel}</button>
      </div>`;
    }
    if (type === 'hotspot') {
      return `<div class="qp-live-special-answer qp-hotspot-play" id="hotspotPlay">${renderHotspotSurface(question.media, '<div id="hotspotDot"></div>', 'hotspotImageSurface') || '<div class="qp-empty">No image</div>'}</div><button class="qp-btn success qp-big-submit" type="button" id="submitHotspot" disabled>${teamMode ? 'Share Pin' : 'Lock Pin'}</button>`;
    }
    if (type === 'map') {
      return `<div class="qp-live-special-answer qp-map-play" id="mapPlay">${renderHotspotSurface(question.media, '<div id="mapDot"></div>', 'mapImageSurface') || '<div class="qp-empty">No image</div>'}</div>`;
    }
    return '';
  }

  function renderLiveAnswerArea(question = {}, options = {}) {
    const mode = options.mode || 'host';
    const type = String(question.type || 'mcq');
    if (['mcq', 'truefalse', 'poll', 'multiselect'].includes(type)) {
      const teamMode = String(options.interactionMode || '').startsWith('team-');
      const lock = mode === 'student' && type === 'multiselect'
        ? `<div class="qp-live-answer-actions"><button class="qp-btn success qp-big-submit" type="button" id="submitMulti">${teamMode ? 'Share Selection' : 'Lock'}</button></div>`
        : '';
      return `${renderLiveChoiceCards(question, options)}${lock}`;
    }
    return mode === 'student' ? renderLiveStudentInput(question, options) : renderLiveHostPreview(question);
  }

  function renderLiveQuestionDisplay(question = {}, options = {}) {
    const mode = options.mode || 'host';
    const answerHtml = renderLiveAnswerArea(question, options);
    const typeClass = liveQuestionTypeClass(question.type);
    const styleClass = usesNewQuestionStyle(question.type) ? ' qp-new-question-style' : '';
    const answerWrapped = options.answerAreaId
      ? `<div id="${escape(options.answerAreaId)}" class="qp-live-answer-area ${typeClass}${styleClass}">${answerHtml}</div>`
      : answerHtml;
    return `${renderLiveQuestionCard(question, options)}${renderLiveQuestionMedia(question, options)}${answerWrapped}`;
  }

  // The whole student question screen, top strip and all. Both the hosted room
  // and a scanned lecture QR draw it from here, so a student cannot tell which
  // one they are looking at - and there is one piece of markup to change rather
  // than two that drift.
  function renderLiveStudentQuestionCard(question = {}, options = {}) {
    const q = question || {};
    const hiddenQuestion = q.showQuestionOnStudent === false;
    const teamMode = options.gameMode === 'team';
    const shell = [
      'qp-student-question-card', 'qp-live-display-shell', 'qp-live-display--student',
      liveQuestionHasMedia(q, { mode: 'student' }) ? 'has-media' : 'no-media',
      teamMode ? 'qp-team-question-mode' : '',
      hiddenQuestion ? 'qp-student-hidden-question' : ''
    ].filter(Boolean).join(' ');
    return `
      <section class="${shell}" aria-label="Live question">
        <div class="qp-student-question-top">
          <span class="qp-pill qp-live-count">${Number(options.questionNumber || 1)}<i>/${Number(options.questionCount || 1)}</i></span>
          ${countdownHtml(q.timeLimit)}
          <span class="qp-pill qp-live-multiplier"${q.doublePoints ? '' : ' hidden'}>2X</span>
        </div>
        ${options.beforeAnswers || ''}
        ${renderLiveQuestionDisplay(q, {
          mode: 'student',
          interactionMode: options.interactionMode || 'classic-member',
          hiddenQuestion,
          answerAreaId: options.answerAreaId || 'answerArea'
        })}
        ${options.afterAnswers || ''}
      </section>`;
  }

  // The confirmation phase: what a student sees between locking an answer and
  // whatever comes next. Shared for the same reason - this is the screen the
  // lecture flow was meant to match.
  function renderLiveAnsweredCard(options = {}) {
    const motion = avatarMotionClass(options.avatar);
    const face = avatarEmoji(options.avatar, options.avatarEmoji);
    return `<div class="qp-personal-result qp-student-wait-card qp-student-locked-clean">`
      + `<div class="qp-player-avatar qp-fun-avatar ${motion}">${face}</div>`
      + `${options.title ? `<div class="qp-live-player-title">${titleHtml(options.titleId, options.title)}</div>` : ''}`
      + `<div class="qp-answer-wait" lang="ar" dir="rtl">تمت الإجابة</div>`
      + `<p class="qp-locked-subtitle" id="lockedSubtitle">${options.pending ? 'Sending…' : 'Waiting'}</p>`
      + `<div class="qp-waiting-dots"><span></span><span></span><span></span></div></div>`;
  }

  // Locking an answer looks the same wherever it happens: the chosen card is
  // marked, and every control stops responding.
  function markLiveAnswerLocked(root, button) {
    if (!root) return;
    button?.classList.add('selected');
    root.querySelectorAll('.qp-game-answer, .qp-btn.success').forEach(el => {
      if (el.id !== 'submitMap') el.classList.add('locked');
    });
  }


  /* -- word cloud ------------------------------------------------------------
     One renderer for every screen that draws a word cloud: the host's live board, which grows as answers arrive, and
     the results. Words spiral out from the middle, the most common first and largest; a word keeps its element (and
     its colour) between updates, so the cloud rearranges by gliding rather than redrawing. Text goes in as text, never
     as markup. */
  const WORD_CLOUD_COLORS = 6;
  const wordCloudStashes = new Map();
  let wordCloudStashId = 0;

  function wordCloudColor(key = '') {
    let hash = 0;
    for (const char of String(key)) hash = (hash * 31 + char.codePointAt(0)) >>> 0;
    return hash % WORD_CLOUD_COLORS;
  }

  // Places the words on an Archimedean spiral from the middle, largest first. Two things keep it quick and full:
  //   - candidates are stepped along the spiral by distance, a few pixels at a time, so the gaps far from the middle
  //     are found as well as the near ones, and a candidate is checked only against the words in the grid cells it
  //     touches rather than against every word placed;
  //   - words are measured once. If more than a few do not fit, every size is scaled down and the words placed again,
  //     using the measured sizes scaled the same way, since text grows with its font size.
  function layoutWordCloud(stage) {
    const state = stage._qpWordCloud;
    if (!state) return;
    const began = performance.now();
    const width = stage.clientWidth;
    const height = stage.clientHeight;
    if (!width || !height) return;
    const entries = [...state.elements.values()].sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
    const top = Math.max(1, ...entries.map(entry => entry.count));
    const largest = Math.max(22, Math.min(84, Math.round(height / 4.2), Math.round(width / 9)));
    const smallest = Math.max(14, Math.round(largest / 4.4));
    for (const entry of entries) {
      entry.base = Math.round(smallest + (largest - smallest) * Math.sqrt(entry.count / top));
      entry.element.style.fontSize = `${entry.base}px`;
    }
    // One layout pass for every measurement.
    for (const entry of entries) {
      entry.baseW = entry.element.offsetWidth;
      entry.baseH = entry.element.offsetHeight;
    }
    const pad = 6;
    const aspect = Math.max(1, width / height);
    const CELL = 4;
    const columns = Math.ceil(width / CELL);
    const rows = Math.ceil(height / CELL);
    const stride = columns + 1;
    // Past this radius every point of the spiral is outside the stage, so the search can stop there.
    const reach = Math.SQRT2 * height / 2;
    // The spiral's points (x, y, radius), worked out once for every word and every pass: about six pixels apart
    // whatever the radius, out to where the largest word could still touch the stage.
    const spiral = [];
    for (let angle = 0, radius = 0; radius <= reach + largest * 3; ) {
      spiral.push(width / 2 + radius * Math.cos(angle) * aspect, height / 2 + radius * Math.sin(angle), radius);
      angle += 6 / Math.max(6, radius * aspect);
      radius = 1.6 * angle;
    }
    const place = scale => {
      // For each row of cells, a running count of filled cells from the left: a rectangle is free when every row it
      // covers has the same count at its two edges.
      const filled = new Uint8Array(columns * rows);
      const counts = new Int32Array(stride * rows);
      const cellRange = (x, y, w, h) => [
        Math.max(0, Math.floor((x - pad) / CELL)), Math.max(0, Math.floor((y - 2) / CELL)),
        Math.min(columns, Math.ceil((x + w + pad) / CELL)), Math.min(rows, Math.ceil((y + h + 2) / CELL))
      ];
      const free = (x, y, w, h) => {
        const [x1, y1, x2, y2] = cellRange(x, y, w, h);
        for (let row = y1; row < y2; row += 1) {
          if (counts[row * stride + x2] !== counts[row * stride + x1]) return false;
        }
        return true;
      };
      const spots = new Map();
      let missed = 0;
      // The smallest word that has found no room so far: anything at least as wide and as tall will not fit either.
      let failedW = Infinity;
      let failedH = Infinity;
      // Where along the spiral the last word landed.
      let landed = 0;
      for (const entry of entries) {
        // A word that would be too small to read is left out, like one there is no room for.
        if (entry.base * scale < 11) { missed += 1; continue; }
        const w = Math.max(1, Math.round(entry.baseW * scale));
        const h = Math.max(1, Math.round(entry.baseH * scale));
        if (w >= failedW && h >= failedH) { missed += 1; continue; }
        let spot = null;
        const limit = reach + Math.max(w, h);
        const search = (from, to) => {
          for (let i = from; i < to && spiral[i + 2] <= limit; i += 3) {
            const x = spiral[i] - w / 2;
            const y = spiral[i + 1] - h / 2;
            if (x >= pad && y >= pad && x + w <= width - pad && y + h <= height - pad && free(x, y, w, h)) {
              landed = i;
              return { x, y, w, h };
            }
          }
          return null;
        };
        const start = Math.floor(landed / 6) * 3;
        spot = search(start, spiral.length) || (start > 0 ? search(0, start) : null);
        if (!spot) {
          missed += 1;
          if (w * h < failedW * failedH) { failedW = w; failedH = h; }
          continue;
        }
        const [x1, y1, x2, y2] = cellRange(spot.x + pad, spot.y + 2, spot.w - pad * 2, spot.h - 4);
        for (let row = y1; row < y2; row += 1) {
          filled.fill(1, row * columns + x1, row * columns + x2);
          let running = 0;
          for (let column = 0; column < columns; column += 1) {
            counts[row * stride + column] = running;
            running += filled[row * columns + column];
          }
          counts[row * stride + columns] = running;
        }
        spots.set(entry, spot);
      }
      return { spots, missed };
    };
    // Sized to cover about half the stage from the start, which a cloud can almost always fit, but never so small that
    // the smallest word is unreadable: a crowded cloud keeps its largest words and leaves out the rest.
    const floor = Math.min(1, 12 / smallest);
    const need = entries.reduce((sum, entry) => sum + entry.baseW * entry.baseH, 0);
    let scale = Math.max(floor, need > 0 ? Math.min(1, Math.sqrt((width * height * 0.5) / need)) : 1);
    let result = place(scale);
    for (let pass = 0; pass < 3 && scale > floor && result.missed > Math.max(1, entries.length * 0.05); pass += 1) {
      scale = Math.max(floor, scale * 0.86);
      result = place(scale);
    }
    for (const entry of entries) {
      const spot = result.spots.get(entry);
      // A word the stage has no room for is left out rather than drawn over another.
      entry.element.classList.toggle('is-unplaced', !spot);
      entry.element.style.fontSize = `${Math.round(entry.base * scale * 10) / 10}px`;
      if (!spot) continue;
      entry.element.style.transform = `translate(${Math.round(spot.x)}px, ${Math.round(spot.y)}px)`;
    }
    stage.classList.toggle('has-words', entries.length > 0);
    // How long the last layout took, for measuring.
    state.layoutMs = Math.round(performance.now() - began);
  }

  // words: [{ key, text, count, hidden }]. options.onWord(key) makes the words buttons (the host's side panel);
  // options.showHidden draws hidden words faded and struck through (the host), otherwise they are left out.
  function mountWordCloud(stage, words = [], options = {}) {
    if (!stage) return;
    const state = stage._qpWordCloud || (stage._qpWordCloud = { elements: new Map(), frame: 0, observer: null });
    state.options = options;
    const list = (Array.isArray(words) ? words : []).filter(word => word && word.key && (options.showHidden || !word.hidden));
    const seen = new Set();
    for (const word of list) {
      const key = String(word.key);
      seen.add(key);
      let entry = state.elements.get(key);
      if (!entry) {
        const interactive = typeof options.onWord === 'function';
        const element = document.createElement(interactive ? 'button' : 'span');
        if (interactive) {
          element.type = 'button';
          element.addEventListener('click', () => state.options.onWord?.(key));
        }
        element.className = `qp-wordcloud-word qp-wc-c${wordCloudColor(key)} is-new`;
        element.dir = 'auto';
        element.style.transform = `translate(${Math.round(stage.clientWidth / 2)}px, ${Math.round(stage.clientHeight / 2)}px)`;
        stage.appendChild(element);
        entry = { key, element, count: 0 };
        state.elements.set(key, entry);
        requestAnimationFrame(() => element.classList.remove('is-new'));
      }
      entry.count = Math.max(1, Number(word.count) || 1);
      entry.element.textContent = String(word.text || '');
      entry.element.classList.toggle('is-hidden-word', !!word.hidden);
      entry.element.setAttribute('aria-label', `${String(word.text || '')}, ${entry.count}${word.hidden ? ', hidden' : ''}`);
    }
    for (const [key, entry] of state.elements) {
      if (seen.has(key)) continue;
      entry.element.remove();
      state.elements.delete(key);
    }
    if (!state.observer && typeof ResizeObserver === 'function') {
      state.observer = new ResizeObserver(() => {
        cancelAnimationFrame(state.frame);
        state.frame = requestAnimationFrame(() => layoutWordCloud(stage));
      });
      state.observer.observe(stage);
    }
    // The host is sent the cloud with every answer; one that changes nothing is not laid out again.
    const signature = list.map(word => `${word.key}:${word.count}:${word.hidden ? 1 : 0}`).join('|');
    if (signature === state.signature) return;
    state.signature = signature;
    cancelAnimationFrame(state.frame);
    state.frame = requestAnimationFrame(() => layoutWordCloud(stage));
  }

  function wordCloudStageHtml(words = [], options = {}) {
    const id = String(++wordCloudStashId);
    wordCloudStashes.set(id, Array.isArray(words) ? words : []);
    if (wordCloudStashes.size > 20) wordCloudStashes.delete(wordCloudStashes.keys().next().value);
    return `<div class="qp-wordcloud-stage${options.className ? ` ${escape(options.className)}` : ''}" data-wordcloud-stage data-wordcloud-stash="${id}" role="list" aria-label="Word cloud">
      <div class="qp-wordcloud-empty"><span aria-hidden="true">&#9729;</span><b>${escape(options.emptyText || 'No words yet')}</b></div>
    </div>`;
  }

  // Draws the clouds a piece of HTML from wordCloudStageHtml left behind, once it is in the page.
  function hydrateWordClouds(root = document, options = {}) {
    root.querySelectorAll?.('[data-wordcloud-stash]').forEach(stage => {
      const words = wordCloudStashes.get(stage.dataset.wordcloudStash);
      if (!words) return;
      wordCloudStashes.delete(stage.dataset.wordcloudStash);
      stage.removeAttribute('data-wordcloud-stash');
      mountWordCloud(stage, words, options);
    });
  }

  // The student's side: one to three short answers, sent together.
  function bindWordCloudInput(root, submit, options = {}) {
    const fields = [...(root?.querySelectorAll?.('[data-wordcloud-word]') || [])];
    const button = root?.querySelector?.('#submitWordCloud');
    if (!fields.length || !button) return;
    const words = () => fields.map(field => field.value.trim()).filter(Boolean);
    const locked = () => !!options.isLocked?.();
    const ready = () => { button.disabled = !words().length; };
    const send = () => { if (!locked() && words().length) submit(words(), button); };
    fields.forEach((field, index) => {
      field.addEventListener('input', ready);
      field.addEventListener('keydown', event => {
        if (event.key !== 'Enter') return;
        event.preventDefault();
        if (fields[index + 1] && !fields[index + 1].value.trim()) fields[index + 1].focus();
        else send();
      });
    });
    button.addEventListener('click', send);
    ready();
  }

  function bindClassicLiveAnswerInput(root, submit, options = {}) {
    if (!root || typeof submit !== 'function') return;
    const locked = () => !!options.isLocked?.();
    const one = selector => root.querySelector(selector);
    const all = selector => [...root.querySelectorAll(selector)];
    all('[data-answer]').forEach(button => button.addEventListener('click', () => { if (!locked()) submit(button.dataset.answer, button); }));
    const selected = new Set();
    all('[data-multi]').forEach(button => button.addEventListener('click', () => {
      if (locked()) return;
      button.classList.toggle('selected');
      selected.has(button.dataset.multi) ? selected.delete(button.dataset.multi) : selected.add(button.dataset.multi);
    }));
    one('#submitMulti')?.addEventListener('click', () => submit([...selected]));
    bindWordCloudInput(root, submit, options);
    const typeInput = one('#typeAnswer');
    const typeSubmit = one('#submitType');
    const updateTypeReady = () => { if (typeSubmit?.classList.contains('qp-new-check-answer')) typeSubmit.disabled = !String(typeInput?.value || '').trim(); };
    typeSubmit?.addEventListener('click', () => { if (!typeSubmit.disabled) submit(typeInput?.value || ''); });
    typeInput?.addEventListener('input', updateTypeReady);
    typeInput?.addEventListener('keydown', event => { if (event.key === 'Enter' && !typeSubmit?.disabled) submit(typeInput.value); });
    updateTypeReady();
    const slider = one('#sliderAnswer');
    if (slider) {
      const output = one('#sliderValue');
      if (output) output.textContent = slider.value;
      slider.addEventListener('input', () => { if (output) output.textContent = slider.value; });
      one('#submitSlider')?.addEventListener('click', () => submit(Number(slider.value)));
    }
    const matching = {};
    let selectedLeft = null;
    const newMatchSelects = all('[data-new-match-select]');
    const updateNewMatching = () => {
      newMatchSelects.forEach(select => {
        matching[select.dataset.newMatchSelect] = select.value || '';
      });
      const chosen = new Set(Object.values(matching).filter(Boolean));
      newMatchSelects.forEach(select => {
        [...select.options].forEach(option => {
          option.disabled = !!option.value && option.value !== select.value && chosen.has(option.value);
        });
      });
      const submitMatching = one('#submitMatching');
      if (submitMatching) submitMatching.disabled = !newMatchSelects.length || newMatchSelects.some(select => !select.value);
    };
    newMatchSelects.forEach(select => select.addEventListener('change', updateNewMatching));
    if (newMatchSelects.length) {
      one('#submitMatching')?.addEventListener('click', event => {
        if (!event.currentTarget.disabled) submit({ ...matching });
      });
      updateNewMatching();
    }
    const updateMatching = () => {
      const leftButtons = all('[data-match-left]');
      const progress = one('#connectProgress');
      if (progress) progress.textContent = `${Object.values(matching).filter(Boolean).length} / ${leftButtons.length} matched`;
      leftButtons.forEach(button => {
        const rightId = matching[button.dataset.matchLeft] || '';
        button.classList.toggle('selected', selectedLeft === button.dataset.matchLeft);
        button.classList.toggle('matched', !!rightId);
        const choice = button.querySelector('[data-connect-choice]');
        const right = rightId ? one(`[data-match-right="${CSS.escape(rightId)}"]`) : null;
        if (choice) choice.textContent = right ? `→ ${right.textContent.trim()}` : '';
      });
      all('[data-match-right]').forEach(button => {
        const usedBy = Object.entries(matching).find(([, rightId]) => rightId === button.dataset.matchRight)?.[0] || '';
        const left = usedBy ? one(`[data-match-left="${CSS.escape(usedBy)}"]`) : null;
        button.classList.toggle('matched', !!usedBy);
        const picked = button.querySelector('[data-connect-picked]');
        if (picked) picked.textContent = left ? (left.dataset.matchNumber || '') : '';
      });
    };
    all('[data-match-left]').forEach(button => button.addEventListener('click', () => { if (!locked()) { selectedLeft = selectedLeft === button.dataset.matchLeft ? null : button.dataset.matchLeft; updateMatching(); } }));
    all('[data-match-right]').forEach(button => button.addEventListener('click', () => {
      if (locked()) return;
      if (!selectedLeft) return toast('Choose a left card first.');
      Object.keys(matching).forEach(pairId => { if (matching[pairId] === button.dataset.matchRight) delete matching[pairId]; });
      matching[selectedLeft] = button.dataset.matchRight; selectedLeft = null; updateMatching();
    }));
    one('#clearMatching')?.addEventListener('click', () => { Object.keys(matching).forEach(key => delete matching[key]); selectedLeft = null; updateMatching(); });
    if (!newMatchSelects.length) one('#submitMatching')?.addEventListener('click', () => submit({ ...matching }));
    if (one('[data-match-left]')) updateMatching();
    const fillInputs = all('[data-fillblank]');
    const fillSubmit = one('#submitFillBlank');
    const updateFillReady = () => { if (fillSubmit?.classList.contains('qp-new-check-answer')) fillSubmit.disabled = !fillInputs.length || fillInputs.some(input => !String(input.value || '').trim()); };
    fillInputs.forEach(input => input.addEventListener('input', updateFillReady));
    fillSubmit?.addEventListener('click', () => {
      if (fillSubmit.disabled) return;
      const answer = {}; fillInputs.forEach(input => { answer[input.dataset.fillblank] = input.value; }); submit(answer);
    });
    updateFillReady();
    const orderBox = one('#orderPlay');
    if (orderBox) {
      let dragging = null;
      let selectedOrder = null;
      const orderItems = () => [...orderBox.querySelectorAll('.qp-order-play-item')];
      const clearOrder = () => { orderItems().forEach(item => item.classList.remove('selected-for-move')); selectedOrder = null; };
      orderBox.addEventListener('dragstart', event => { if (!locked()) dragging = event.target.closest('.qp-order-play-item'); });
      orderBox.addEventListener('dragover', event => {
        if (locked()) return;
        event.preventDefault();
        const target = event.target.closest('.qp-order-play-item');
        if (target && dragging && target !== dragging) { const rect = target.getBoundingClientRect(); orderBox.insertBefore(dragging, event.clientY > rect.top + rect.height / 2 ? target.nextSibling : target); }
      });
      orderBox.addEventListener('click', event => {
        if (locked()) return;
        const item = event.target.closest('.qp-order-play-item');
        if (!item) return;
        if (!selectedOrder) { selectedOrder = item; item.classList.add('selected-for-move'); return; }
        if (selectedOrder === item) return clearOrder();
        orderBox.insertBefore(selectedOrder, item); clearOrder();
      });
      one('#moveSelectedBottom')?.addEventListener('click', () => { if (selectedOrder) { orderBox.appendChild(selectedOrder); clearOrder(); } });
      one('#submitOrder')?.addEventListener('click', () => submit(orderItems().map(item => item.dataset.id)));
    }
    let hotspotAnswer = null;
    const hotspot = one('#hotspotImageSurface');
    hotspot?.addEventListener('click', event => {
      if (locked()) return;
      // Measure against the picture itself, never the box around it.
      const picture = hotspot.querySelector('img') || hotspot;
      const rect = picture.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      // A tap beside the picture is not a pin.
      if (event.clientX < rect.left || event.clientX > rect.right
        || event.clientY < rect.top || event.clientY > rect.bottom) return;
      hotspotAnswer = { x: ((event.clientX - rect.left) / rect.width) * 100, y: ((event.clientY - rect.top) / rect.height) * 100 };
      const dot = one('#hotspotDot'); if (dot) { dot.className = 'qp-hotspot-dot'; dot.style.left = `${hotspotAnswer.x}%`; dot.style.top = `${hotspotAnswer.y}%`; }
      const button = one('#submitHotspot'); if (button) button.disabled = false;
    });
    one('#submitHotspot')?.addEventListener('click', () => hotspotAnswer ? submit(hotspotAnswer) : toast('Drop a pin first.'));
    const map = one('#mapImageSurface');
    map?.addEventListener('click', event => {
      if (locked()) return;
      const rect = map.getBoundingClientRect();
      const answer = { x: ((event.clientX - rect.left) / rect.width) * 100, y: ((event.clientY - rect.top) / rect.height) * 100 };
      const dot = one('#mapDot'); if (dot) { dot.className = 'qp-map-dot'; dot.style.left = `${answer.x}%`; dot.style.top = `${answer.y}%`; }
      submit(answer);
    });
  }

  window.QuizPulseBindClassicLiveAnswerInput = bindClassicLiveAnswerInput;


  return { language, setLanguage, avatarFace, mountWordCloud, hydrateWordClouds, bindWordCloudInput, avatarMotionClass, characterHtml, titleHtml, academicTerms, currentPlan, planAllowsFeature, planAllowsQuestionType, showUpgradePrompt, isPersonalAccount, lockIcon: PLAN_LOCK_ICON, ensureCosmeticsRuntime, storageGet, storageSet, storageRemove, storageKeys, performanceModes, normalizePerformanceMode, canManagePerformanceMode, performanceMode, setPerformanceMode, applyPerformanceMode, performanceControlsHtml, bindPerformanceControls, colors, answerShapes, answerShape, avatarList, questionTypes, refreshQuestionStyles, questionStyleFor, usesNewQuestionStyle, api, authApi, currentTeachingSpace, setTeachingSpace, clearTeachingSpace, clearWorkspaceSelectionCache, withTeachingSpaceUrl, teacherPin, setTeacherPin, teacherSession, setTeacherSession, teacherRole, setTeacherRole, logoutTeacher, studentSession, setStudentSession, currentStudent, setCurrentStudent, refreshStudentProfile, recentStudentProfile, noteSignOutReason, takeSignOutReason, logoutStudent, requireTeacherPage, requireCreatorAccountPage, requireAdminPage, requireAcademicManagerPage, requireSuperAdminPage, requireShopEditorPage, requireGroupAdminPage, syncDashboardSidebar, startMessageNotifications, getMessageSocket, openAdaptiveChat, refreshAdaptiveChatLauncher, showMessageNotification, showPost, dismissPost, checkForPost, markPostSeen, messagePushStatus, setMessagePushEnabled, offerMessagePush, escape, safeMediaUrl, safeCssUrl, id, toast, bindPasswordVisibility, setButtonLoading, normalizeUiLabels, fileToDataUrl, renderMedia, renderHotspotSurface, preloadMedia, renderCorrectAnswerReveal, liveTextDirectionClass, liveQuestionTitleClass, liveAnswerTextClass, liveAnswerGridClass, liveQuestionHasMedia, renderLiveQuestionCard, renderLiveQuestionMedia, renderLiveChoiceCards, renderLiveAnswerArea, renderLiveQuestionDisplay, renderLiveStudentQuestionCard, renderLiveAnsweredCard, markLiveAnswerLocked, debounce, animateNumber, startCountdown, stopAllCountdowns, countdownHtml, countdownLabel, enterGameFullscreen, leaveGameFullscreen, sound, playMusic, pauseMusic, unlockAudio, refreshGlobalSounds, playGlobalSound, setCustomMusicFile, setServerMusicSource, setServerSoundSource, customMusicName, avatarEmoji, typeLabel, applyTheme, setTheme: applyTheme, toggleTheme, isSoundEnabled, isMusicEnabled, setSoundEnabled, setMusicEnabled, audioControlsHtml, bindAudioControls, updateAudioControls, setupNewModal, setupCreateModal: setupNewModal, confirmDialog, expectUimsSubjects, showLevelUps, promptDialog, renderAccountChip, refreshAccountChip, quizBackgroundPresets, quizBackgroundPresetCss, quizBackgroundCss, applyQuizBackground, quizBackgroundLabel, backgroundForQuestion };
})();
