(() => {
  const QUESTION_TITLE_MAX = 200;
  const ANSWER_TEXT_MAX = 200;
  const CHOICE_CARD_MAX = 6;
  const ORDER_ITEM_MAX = 6;
  const MATCHING_PAIR_MAX = 6;
  // The offline creator (tools/build-offline-creator.js): this editor with no server behind it, for a teacher away from
  // the university. No sign-in and no subjects - every quiz is General - and Finish downloads the quiz in the QuizPulse
  // template, to import on campus. The draft stays in this browser. Nothing in the address opens a saved quiz.
  const OFFLINE = window.QUIZPULSE_OFFLINE_CREATOR === true;
  const params = new URLSearchParams(OFFLINE ? '' : location.search);
  let quizId = params.get('id');
  const lectureId = String(params.get('lectureId') || '').trim();
  let lectureItemId = String(params.get('lectureItemId') || '').trim();
  const lectureQuestionMode = !!lectureId;
  // Five minutes, matching DEFAULT_LECTURE_TIME_LIMIT on the server.
  const LECTURE_QUESTION_TIME_LIMIT = 300;
  const requestedAction = params.get('action');
  const requestedMode = 'normal';
  const savedTeachingSpace = QuizPulse.currentTeachingSpace ? QuizPulse.currentTeachingSpace() : null;
  const requestedCourseId = String(params.get('courseId') || savedTeachingSpace?.courseId || '').trim();
  const requestedDepartmentId = String(params.get('departmentId') || '').trim();
  const requestedSubjectId = String(params.get('subjectId') || savedTeachingSpace?.subjectId || '').trim();
  let selectedIndex = 0;
  let mediaTargetMode = 'any';
  const state = {
    quiz: {
      title: 'Untitled Quiz',
      description: '',
      status: 'draft',
      quizMode: requestedMode,
      mode: requestedMode,
      visibility: 'public',
      locationType: requestedSubjectId || requestedDepartmentId ? 'course' : 'general',
      courseId: requestedCourseId,
      departmentId: requestedDepartmentId,
      subjectId: requestedSubjectId,
      settings: { showQuestionOnStudent: true, lockRoom: false, theme: { backgroundPreset: 'neo' } },
      Q: [makeQuestion('mcq')]
    },
    dirty: false,
    saving: false,
    rightTab: 'advanced',
    controlMenu: '',
    reorderMode: false,
    advancedScrollTop: 0,
    academic: { loaded: false, canChooseLocation: false, courses: [] }
  };
  state.lectureQuestionWeight = 1;
  state.lectureTitle = '';

  const shell = document.getElementById('creatorShell');
  const questionList = document.getElementById('questionList');
  const questionEditor = document.getElementById('questionEditor');
  const advancedPanel = document.getElementById('advancedPanel');
  const mediaFile = document.getElementById('mediaFile');
  const backgroundFile = document.getElementById('backgroundFile');
  const questionBackgroundFile = document.getElementById('questionBackgroundFile');
  const saveState = document.getElementById('saveState');
  const quizModeBadge = document.getElementById('quizModeBadge');
  const questionPanelTitle = document.getElementById('questionPanelTitle');
  const reorderQuestionsBtn = document.getElementById('reorderQuestionsBtn');
  const reorderDoneBtn = document.getElementById('reorderDoneBtn');
  const questionReorderStatus = document.getElementById('questionReorderStatus');
  const quizLocationPanel = document.getElementById('quizLocationPanel');
  const rightPanelTitle = document.getElementById('rightPanelTitle');
  const rightPanelSubtitle = document.getElementById('rightPanelSubtitle');
  const creatorMobileLayout = window.matchMedia('(max-width: 980px)');
  const creatorPhoneLayout = window.matchMedia('(max-width: 700px)');
  let creatorPreviousMobileView = 'canvas';
  const CREATOR_OVERLAY_STATE_KEY = 'quizpulseCreatorOverlay';
  document.body.dataset.creatorMobileView = 'canvas';

  function activeCreatorOverlayHistory() {
    return String(history.state?.[CREATOR_OVERLAY_STATE_KEY] || '');
  }

  function pushCreatorOverlayHistory(name) {
    if (!creatorPhoneLayout.matches || activeCreatorOverlayHistory() === name) return;
    history.pushState({ ...(history.state || {}), [CREATOR_OVERLAY_STATE_KEY]: name }, '', location.href);
  }

  function choiceCardMax(type = '') {
    return ['mcq', 'multiselect', 'poll'].includes(String(type || '')) ? CHOICE_CARD_MAX : 2;
  }

  // Keep the canvas dominant. Settings open only when a contextual control is used.
  shell?.classList.add('right-collapsed');
  creatorMobileLayout.addEventListener?.('change', event => {
    shell?.classList.toggle('right-collapsed', event.matches);
    if (event.matches) setCreatorMobileView('canvas');
    updateRightPanelScrollHeight();
    syncRightPanelScrollThumb();
  });

  function ensureCreatorQuestionTypes() {
    QuizPulse.questionTypes = Array.isArray(QuizPulse.questionTypes) ? QuizPulse.questionTypes : [];
    // Keep the creator list clean: old/removed modes should not leak back into the UI from cached shared data.
    const removedTypes = new Set(['map', 'template', 'bubble', 'bubble_sheet']);
    QuizPulse.questionTypes = QuizPulse.questionTypes.filter(type => !removedTypes.has(String(type?.id || '').toLowerCase()));
    const required = [
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
    const byId = new Map(QuizPulse.questionTypes.map(t => [String(t.id || ''), t]));
    required.forEach(type => { if (!byId.has(type.id)) QuizPulse.questionTypes.push(type); });
    const order = new Map(required.map((type, index) => [type.id, index]));
    QuizPulse.questionTypes.sort((a, b) => (order.get(a.id) ?? 999) - (order.get(b.id) ?? 999));
    // A Pin on Image question cannot travel in the file the offline creator makes: it is added on campus.
    if (OFFLINE) QuizPulse.questionTypes = QuizPulse.questionTypes.filter(type => type.id !== 'hotspot');
  }
  ensureCreatorQuestionTypes();
  // The organization's plan can arrive after the first draw; the question list and type menu then show its locks.
  document.addEventListener('quizpulse:plan-updated', () => render());

  const rightPanel = document.querySelector('.qp-advanced');

  function updateRightPanelScrollHeight() {
    if (!advancedPanel || !rightPanel || shell?.classList.contains('right-collapsed')) return;
    advancedPanel.style.height = '';
    advancedPanel.style.maxHeight = '';
    advancedPanel.style.overflowY = 'auto';
  }

  function installRightPanelScrollWheel() {
    document.querySelectorAll('.qp-right-scroll-wheel').forEach(element => element.remove());
  }

  function syncRightPanelScrollThumb() {
    const thumb = document.querySelector('.qp-right-scroll-wheel .qp-scroll-track span');
    if (!thumb || !advancedPanel) return;
    const max = Math.max(1, advancedPanel.scrollHeight - advancedPanel.clientHeight);
    const ratio = Math.min(1, Math.max(0, advancedPanel.scrollTop / max));
    const thumbHeight = Math.max(26, Math.floor((advancedPanel.clientHeight / Math.max(advancedPanel.scrollHeight, 1)) * 100));
    thumb.style.height = `${Math.min(72, thumbHeight)}%`;
    thumb.style.top = `${Math.floor(ratio * (100 - Math.min(72, thumbHeight)))}%`;
  }

  function syncCreatorMobileTopOffset() {
    const topbarHeight = document.querySelector('.qp-creator-topbar-v18')?.getBoundingClientRect().height || 0;
    document.body?.style?.setProperty('--qp-creator-mobile-top', `${Math.ceil(topbarHeight)}px`);
  }

  function syncCreatorVisualViewport() {
    const viewportHeight = Math.max(320, Math.round(window.visualViewport?.height || window.innerHeight || 0));
    const keyboardOpen = creatorPhoneLayout.matches && viewportHeight < Math.round((window.innerHeight || viewportHeight) - 120);
    document.body?.style?.setProperty('--qp-creator-viewport-height', `${viewportHeight}px`);
    document.body?.classList.toggle('qp-creator-keyboard-open', keyboardOpen);
  }

  rightPanel?.addEventListener('wheel', event => {
    if (shell?.classList.contains('right-collapsed')) return;
    const scroller = advancedPanel;
    if (!scroller) return;
    event.preventDefault();
    scroller.scrollTop += event.deltaY;
    syncRightPanelScrollThumb();
  }, { passive: false });
  advancedPanel?.addEventListener('scroll', () => {
    state.advancedScrollTop = advancedPanel.scrollTop;
    syncRightPanelScrollThumb();
  });
  creatorPhoneLayout.addEventListener?.('change', event => {
    if (event.matches || !state.reorderMode) return;
    state.reorderMode = false;
    syncQuestionReorderUi();
    renderQuestionList();
  });
  window.addEventListener('resize', () => { updateRightPanelScrollHeight(); syncRightPanelScrollThumb(); syncCreatorMobileTopOffset(); syncCreatorVisualViewport(); });
  window.visualViewport?.addEventListener('resize', syncCreatorVisualViewport, { passive: true });
  window.visualViewport?.addEventListener('scroll', syncCreatorVisualViewport, { passive: true });
  syncCreatorMobileTopOffset();
  syncCreatorVisualViewport();

  function draftKey() {
    if (lectureQuestionMode) return `quizpulseLectureQuestionDraft:${lectureId}:${lectureItemId || 'new'}`;
    return `quizpulseCreatorDraft:${quizId || 'new'}`;
  }
  function saveLocalDraft() {
    try {
      localStorage.setItem(draftKey(), JSON.stringify({ savedAt: Date.now(), quizId, quiz: state.quiz, selectedIndex }));
    } catch (_) {}
  }
  const saveLocalDraftSoon = QuizPulse.debounce(saveLocalDraft, 450);
  function clearLocalDraft() {
    try { localStorage.removeItem(draftKey()); } catch (_) {}
  }
  async function maybeRestoreLocalDraft() {
    try {
      const raw = localStorage.getItem(draftKey());
      if (!raw) return false;
      const draft = JSON.parse(raw);
      if (!draft.quiz) return false;
      const stamp = new Date(draft.savedAt || Date.now()).toLocaleString();
      if (await QuizPulse.confirmDialog({ title: 'Restore saved draft?', message: `A local draft from ${stamp} was found. Restore it instead of the current version?`, confirmText: 'Restore draft' })) {
        state.quiz = normalizeQuizState(draft.quiz);
        selectedIndex = Number(draft.selectedIndex || 0);
        state.dirty = true;
        QuizPulse.toast('Draft restored.');
        return true;
      }
      clearLocalDraft();
    } catch (_) {}
    return false;
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
    return {
      shape: 'rect',
      x: Math.round(x * 10) / 10,
      y: Math.round(y * 10) / 10,
      w: Math.round(w * 10) / 10,
      h: Math.round(h * 10) / 10
    };
  }

  function makeQuestion(type = 'mcq') {
    const q = {
      id: QuizPulse.id('q'),
      type,
      title: '',
      media: null,
      backgroundImage: null,
      timeLimit: lectureQuestionMode ? LECTURE_QUESTION_TIME_LIMIT : 20,
      points: 1000,
      doublePoints: false,
      choices: [],
      orderItems: [],
      matchingPairs: [],
      fillBlanks: [],
      acceptedAnswers: [''],
      mapAnswer: null,
      hotspotAnswer: null,
      slider: { min: 0, max: 20, correct: 10, fullTolerance: 0, halfTolerance: 4, step: 1, labelLeft: 'Low', labelRight: 'High', size: 'medium' },
      teacherNote: '',
      explanation: ''
    };
    applyTypeDefaults(q, type);
    return q;
  }

  function normalizeQuestionTime(value, fallback = 20) {
    const seconds = Math.round(Number(value));
    return Number.isFinite(seconds) ? Math.max(5, Math.min(3599, seconds)) : fallback;
  }

  function questionTimeParts(value) {
    const total = normalizeQuestionTime(value);
    return { minutes: Math.floor(total / 60), seconds: total % 60, total };
  }

  function questionTimeLabel(value) {
    const { minutes, seconds } = questionTimeParts(value);
    if (!minutes) return `${seconds}s`;
    return `${minutes}m ${String(seconds).padStart(2, '0')}s`;
  }

  function applyTypeDefaults(q, type) {
    q.type = type;
    if (type === 'mcq') {
      q.choices = ['Answer 1', 'Answer 2', 'Answer 3', 'Answer 4'].map((text, i) => ({ id: QuizPulse.id('c'), text, correct: i === 0 }));
    } else if (type === 'truefalse') {
      q.choices = [{ id: QuizPulse.id('c'), text: 'True', correct: true }, { id: QuizPulse.id('c'), text: 'False', correct: false }];
    } else if (type === 'multiselect') {
      q.choices = ['Option 1', 'Option 2', 'Option 3', 'Option 4'].map((text, i) => ({ id: QuizPulse.id('c'), text, correct: i < 2 }));
    } else if (type === 'order') {
      q.orderItems = ['First item', 'Second item', 'Third item', 'Fourth item'].map(text => ({ id: QuizPulse.id('item'), text }));
    } else if (type === 'type') {
      q.acceptedAnswers = ['Correct answer'];
    } else if (type === 'map') {
      if (q.media && !String(q.media.type || '').startsWith('image/')) q.media = null;
      q.mapAnswer = { x: 50, y: 50, radius: 8 };
    } else if (type === 'hotspot') {
      if (q.media && !String(q.media.type || '').startsWith('image/')) q.media = null;
      q.hotspotAnswer = { shape: 'rect', x: 35, y: 35, w: 30, h: 30 };
    } else if (type === 'slider') {
      q.slider = q.slider || { min: 0, max: 20, correct: 10, fullTolerance: 0, halfTolerance: 4, step: 1, labelLeft: 'Low', labelRight: 'High', size: 'medium' };
    } else if (type === 'matching') {
      q.matchingPairs = [
        ['CPU', 'Processes instructions'],
        ['RAM', 'Temporary memory'],
        ['SSD', 'Storage device'],
        ['OS', 'Manages hardware and software']
      ].map(([left, right]) => ({ id: QuizPulse.id('pair'), rightId: QuizPulse.id('right'), left, right }));
      q.matchingScoring = q.matchingScoring || 'partial';
    } else if (type === 'fillblank') {
      q.fillBlanks = [{ id: QuizPulse.id('blank'), label: 'Blank 1', answers: ['correct answer'] }];
      q.acceptedAnswers = ['correct answer'];
    } else if (type === 'poll') {
      q.choices = ['Option 1', 'Option 2', 'Option 3', 'Option 4'].map(text => ({ id: QuizPulse.id('c'), text, correct: false }));
      q.points = 0;
    } else if (type === 'wordcloud') {
      q.wordCloud = { maxAnswers: 1 };
      q.points = 0;
      q.doublePoints = false;
    }
  }


  function normalizeQuestion(raw = {}, fallbackType = 'mcq') {
    const allowedTypes = (QuizPulse.questionTypes || []).map(t => t.id);
    const type = allowedTypes.includes(String(raw?.type || '')) ? String(raw.type) : fallbackType;
    const q = makeQuestion(type);
    const source = raw && typeof raw === 'object' ? JSON.parse(JSON.stringify(raw)) : {};
    Object.assign(q, source);
    q.id = String(q.id || QuizPulse.id('q'));
    q.type = type;
    q.title = String(q.title || '');
    q.teacherNote = String(q.teacherNote || '');
    q.explanation = String(q.explanation || '');
    q.timeLimit = normalizeQuestionTime(q.timeLimit);
    q.points = Math.max(0, Number(q.points || 0));
    q.doublePoints = !!q.doublePoints;
    q.media = q.media && typeof q.media === 'object' ? q.media : null;
    q.backgroundImage = q.backgroundImage && typeof q.backgroundImage === 'object' ? q.backgroundImage : null;

    if (['mcq', 'truefalse', 'multiselect', 'poll'].includes(type)) {
      const choices = Array.isArray(source.choices) ? source.choices.filter(c => c && typeof c === 'object').slice(0, choiceCardMax(type)) : [];
      q.choices = choices.map((choice, index) => ({
        id: String(choice.id || QuizPulse.id('c')),
        text: String(choice.text || '').slice(0, ANSWER_TEXT_MAX),
        correct: !!choice.correct
      }));
      if (type === 'truefalse') {
        q.choices = [
          { id: q.choices[0]?.id || QuizPulse.id('c'), text: 'True', correct: !!q.choices.find(c => String(c.text).toLowerCase() === 'true')?.correct || q.choices[0]?.correct !== false },
          { id: q.choices[1]?.id || QuizPulse.id('c'), text: 'False', correct: !!q.choices.find(c => String(c.text).toLowerCase() === 'false')?.correct }
        ];
      }
      if (!q.choices.length) applyTypeDefaults(q, type);
      if (type !== 'poll' && !q.choices.some(c => c.correct) && q.choices[0]) q.choices[0].correct = true;
      if (type === 'poll') q.choices.forEach(c => { c.correct = false; });
    }

    if (type === 'order') {
      const items = Array.isArray(source.orderItems) ? source.orderItems.filter(item => item && typeof item === 'object').slice(0, ORDER_ITEM_MAX) : [];
      q.orderItems = items.map(item => ({ id: String(item.id || QuizPulse.id('item')), text: String(item.text || '') }));
      if (q.orderItems.length < 2) applyTypeDefaults(q, type);
    }

    if (type === 'type') {
      const answers = Array.isArray(source.acceptedAnswers) ? source.acceptedAnswers : [];
      q.acceptedAnswers = answers.map(a => String(a || '').trim()).filter(Boolean);
      if (!q.acceptedAnswers.length) q.acceptedAnswers = ['Correct answer'];
    }

    if (type === 'slider') {
      const slider = source.slider && typeof source.slider === 'object' ? source.slider : {};
      q.slider = {
        min: Number(slider.min ?? 0),
        max: Number(slider.max ?? 20),
        correct: Number(slider.correct ?? 10),
        fullTolerance: Number(slider.fullTolerance ?? 0),
        halfTolerance: Number(slider.halfTolerance ?? 4),
        step: Number(slider.step ?? 1),
        labelLeft: String(slider.labelLeft || 'Low'),
        labelRight: String(slider.labelRight || 'High'),
        size: ['small','medium','large'].includes(String(slider.size || '')) ? String(slider.size) : 'medium'
      };
    }

    if (type === 'map') {
      const mapAnswer = source.mapAnswer && typeof source.mapAnswer === 'object' ? source.mapAnswer : {};
      q.mapAnswer = {
        x: Number(mapAnswer.x ?? 50),
        y: Number(mapAnswer.y ?? 50),
        radius: Number(mapAnswer.radius ?? 8)
      };
      if (q.media && !String(q.media.type || '').startsWith('image/')) q.media = null;
    }

    if (type === 'hotspot') {
      const area = (source.hotspotAnswer && typeof source.hotspotAnswer === 'object') ? source.hotspotAnswer : (source.hotspotArea && typeof source.hotspotArea === 'object' ? source.hotspotArea : {});
      q.hotspotAnswer = normalizeHotspotArea(area);
      if (q.media && !String(q.media.type || '').startsWith('image/')) q.media = null;
    }

    if (type === 'matching') {
      const pairs = Array.isArray(source.matchingPairs) ? source.matchingPairs.filter(pair => pair && typeof pair === 'object').slice(0, MATCHING_PAIR_MAX) : [];
      q.matchingPairs = pairs.map((pair, index) => ({
        id: String(pair.id || QuizPulse.id('pair')),
        rightId: String(pair.rightId || QuizPulse.id('right')),
        left: String(pair.left || `Term ${index + 1}`),
        right: String(pair.right || `Match ${index + 1}`)
      }));
      q.matchingScoring = ['exact','partial'].includes(String(source.matchingScoring || source.scoringMode || '').toLowerCase()) ? String(source.matchingScoring || source.scoringMode).toLowerCase() : 'partial';
      if (q.matchingPairs.length < 2) applyTypeDefaults(q, type);
    }

    if (type === 'wordcloud') {
      // One to three words per student, and never points: the server holds to the same rules.
      const max = Math.round(Number(source.wordCloud?.maxAnswers || 1));
      q.wordCloud = { maxAnswers: Math.min(3, Math.max(1, Number.isFinite(max) ? max : 1)) };
      q.points = 0;
      q.doublePoints = false;
    } else {
      delete q.wordCloud;
    }

    if (type === 'fillblank') {
      const blanks = Array.isArray(source.fillBlanks) ? source.fillBlanks.filter(blank => blank && typeof blank === 'object') : [];
      q.fillBlanks = blanks.map((blank, index) => ({
        id: String(blank.id || QuizPulse.id('blank')),
        label: String(blank.label || `Blank ${index + 1}`),
        answers: (Array.isArray(blank.answers) ? blank.answers : [blank.answer]).map(a => String(a || '').trim()).filter(Boolean)
      }));
      if (!q.fillBlanks.length && Array.isArray(source.acceptedAnswers) && source.acceptedAnswers.length) {
        q.fillBlanks = [{ id: QuizPulse.id('blank'), label: 'Blank 1', answers: source.acceptedAnswers.map(a => String(a || '').trim()).filter(Boolean) }];
      }
      if (!q.fillBlanks.length) applyTypeDefaults(q, type);
    }

    return q;
  }

  function normalizeQuizState(raw) {
    const source = raw && typeof raw === 'object' ? JSON.parse(JSON.stringify(raw)) : {};
    const quiz = {
      title: 'Untitled Quiz',
      description: '',
      status: 'draft',
      quizMode: requestedMode,
      mode: requestedMode,
      visibility: 'public',
      locationType: requestedSubjectId || requestedDepartmentId ? 'course' : 'general',
      courseId: requestedCourseId,
      departmentId: requestedDepartmentId,
      subjectId: requestedSubjectId,
      settings: { showQuestionOnStudent: true, lockRoom: false, theme: { backgroundPreset: 'neo' } },
      ...source
    };
    quiz.visibility = normalizeVisibility(quiz.visibility || quiz.privacy || quiz.settings?.visibility);
    const list = Array.isArray(source.Q) ? source.Q : Array.isArray(source.questions) ? source.questions : [];
    quiz.Q = list.map(q => normalizeQuestion(q)).filter(Boolean);
    quiz.quizMode = 'normal';
    quiz.mode = 'normal';
    if (!quiz.Q.length) quiz.Q = [makeQuestion('mcq')];
    // Server/live games use `questions`; the creator uses `Q`. Mirror them before saving/hosting.
    quiz.questions = quiz.Q;
    quiz.settings = { showQuestionOnStudent: true, lockRoom: false, theme: { backgroundPreset: 'neo' }, ...(quiz.settings || {}) };
    quiz.settings.theme = { backgroundPreset: 'neo', ...(quiz.settings.theme || {}) };
    return quiz;
  }

  function currentQuestion() {
    if (!state.quiz.Q.length) state.quiz.Q.push(makeQuestion('mcq'));
    selectedIndex = Math.max(0, Math.min(selectedIndex, state.quiz.Q.length - 1));
    return state.quiz.Q[selectedIndex];
  }

  function markDirty() {
    state.dirty = true;
    state.quiz.status = state.quiz.status || 'draft';
    updateSaveState('Unsaved');
    saveLocalDraftSoon();
  }

  function updateSaveState(text) {
    if (!saveState) return;
    const value = String(text || 'Saved');
    saveState.classList.remove('qp-save-state-good', 'qp-save-state-dirty', 'qp-save-state-saving', 'qp-save-state-error');
    let icon = '&#x2713;';
    if (/saving/i.test(value)) { saveState.classList.add('qp-save-state-saving'); icon = '&#x2026;'; }
    else if (/unsaved|local/i.test(value)) { saveState.classList.add('qp-save-state-dirty'); icon = '&#x25CF;'; }
    else if (/failed|error/i.test(value)) { saveState.classList.add('qp-save-state-error'); icon = '!'; }
    else saveState.classList.add('qp-save-state-good');
    saveState.innerHTML = `<span aria-hidden="true">${icon}</span><span class="qp-sr-only">${QuizPulse.escape(value)}</span>`;
    saveState.title = value;
    saveState.setAttribute('aria-label', value);
  }

  function quizpulseOpenMenu(menu, anchor) {
    if (!menu || !anchor) return;
    document.querySelectorAll('.qp-quick-add-menu.show, .qp-media-menu.show').forEach(m => {
      if (m !== menu) m.classList.remove('show');
    });
    const rect = anchor.getBoundingClientRect();
    menu.classList.add('show');
    const width = Math.max(menu.offsetWidth || 230, 230);
    const left = Math.min(Math.max(10, rect.left), window.innerWidth - width - 10);
    const top = Math.min(rect.bottom + 8, window.innerHeight - 80);
    menu.style.left = `${left}px`;
    menu.style.top = `${top}px`;
  }

  function renderModeBadge() {
    state.quiz.quizMode = 'normal';
    state.quiz.mode = 'normal';
    if (!quizModeBadge) return;
    if (lectureQuestionMode) {
      quizModeBadge.textContent = 'Lecture question';
      quizModeBadge.style.display = '';
      return;
    }
    quizModeBadge.textContent = '';
    quizModeBadge.style.display = 'none';
  }

  // A quiz is private (its maker's), public (shared with the maker's organization, shown as My organization), group
  // (shared with every organization in its group, src/server/groups.service.js) or everyone (Public: listed in Discover
  // for every organization and personal account). A personal account has no organization and no group.
  const VISIBILITIES = ['private', 'public', 'group', 'everyone'];

  // The group its organization is in, or null. It travels with the account (quizpulse_shared.js).
  function accountGroup() {
    return QuizPulse.currentStudent?.()?.group || null;
  }

  function personalAccount() {
    return QuizPulse.isPersonalAccount?.(QuizPulse.currentStudent?.()) === true;
  }

  function normalizeVisibility(value) {
    const raw = String(value || 'public').toLowerCase();
    return VISIBILITIES.includes(raw) ? raw : 'public';
  }

  function visibilityLabel(visibility = state.quiz.visibility) {
    if (visibility === 'everyone') return 'Public';
    if (visibility === 'group') return 'My group';
    return visibility === 'private' || personalAccount() ? 'Private' : 'My organization';
  }

  function visibilityHelpText() {
    if (state.quiz.visibility === 'everyone') return 'Public quiz: once finished, anyone can find and play it in Discover';
    if (state.quiz.visibility === 'group') {
      const group = accountGroup();
      return `Group quiz: once finished, every organization in ${group?.name || 'your group'} can play it`;
    }
    return `${visibilityLabel()} quiz`;
  }

  function quizVisibilityPickerHtml() {
    const current = state.quiz.visibility === 'public' && personalAccount() ? 'private' : state.quiz.visibility;
    const group = personalAccount() ? null : accountGroup();
    const choices = [
      { value: 'private', label: '🔒 Private' },
      ...(personalAccount() ? [] : [{ value: 'public', label: '🏫 My organization' }]),
      ...(group ? [{ value: 'group', label: '🏛 My group' }] : []),
      { value: 'everyone', label: '🌐 Public' }
    ];
    return `
      <div class="qp-visibility-card" aria-label="Quiz visibility">
        <div class="qp-visibility-copy">
          <b>Visibility</b>
        </div>
        <div class="qp-visibility-switch" role="radiogroup" aria-label="Quiz visibility">
          ${choices.map(choice => `<button class="${current === choice.value ? 'active' : ''}" data-visibility="${choice.value}" type="button" role="radio" aria-checked="${current === choice.value}">${choice.label}</button>`).join('')}
        </div>
        <p class="qp-prop-help qp-visibility-help">${current === 'everyone' ? 'Listed in Discover for everyone once finished.'
          : current === 'group' ? `Shared with every organization in ${QuizPulse.escape(group?.name || 'your group')} once finished.` : ''}</p>
      </div>`;
  }

  function findActiveSubject() {
    const course = (state.academic.courses || []).find(c => String(c.id) === String(state.quiz.courseId));
    const department = (course?.departments || []).find(item => String(item.id) === String(state.quiz.departmentId));
    const subject = (course?.subjects || []).find(sub => String(sub.id) === String(state.quiz.subjectId));
    return { course, department: department || (subject ? (course?.departments || []).find(item => String(item.id) === String(subject.departmentId)) : null), subject };
  }

  async function loadAcademicLocations() {
    if (OFFLINE) {
      state.academic = { loaded: true, canChooseLocation: false, courses: [], subjects: [] };
      return;
    }
    try {
      const data = await QuizPulse.api('/api/academic/workspace');
      const courses = (data.hierarchy || []).map(course => ({
        ...course,
        subjects: (data.subjects || []).filter(subject => String(subject.courseId || '') === String(course.id || ''))
      }));
      state.academic = { loaded: true, canChooseLocation: courses.some(course => (course.departments || []).length), courses, subjects: data.subjects || [] };
      const scopeBadge = document.getElementById('quizScopeBadge');
      if (scopeBadge) scopeBadge.hidden = state.academic.canChooseLocation;
      if (!state.quiz.subjectId && savedTeachingSpace?.subjectId) {
        state.quiz.courseId = savedTeachingSpace.courseId;
        state.quiz.subjectId = savedTeachingSpace.subjectId;
      }
      const { course, department, subject } = findActiveSubject();
      if (course && subject) {
        state.quiz.locationType = 'course';
        state.quiz.courseId = course.id;
        state.quiz.departmentId = subject.departmentId || department?.id || '';
        state.quiz.subjectId = subject.id;
        state.quiz.courseName = course.name || '';
        state.quiz.subjectName = subject.name || '';
        QuizPulse.setTeachingSpace?.({ courseId: course.id, courseName: course.name, subjectId: subject.id, subjectName: subject.name });
      }
    } catch (_) {
      state.academic = { loaded: true, canChooseLocation: false, courses: [] };
      state.quiz.locationType = 'general';
      const scopeBadge = document.getElementById('quizScopeBadge');
      if (scopeBadge) scopeBadge.hidden = false;
    }
  }

  function renderQuizLocationPanel() {
    // v1.17.6: The old top save-location banner was removed from the creator UI.
    // Keep this function as a quiet state-sync point so teacher subject saving still works.
    if (!state.academic.loaded) {
      if (quizLocationPanel) quizLocationPanel.replaceChildren();
      return;
    }
    const { course, department, subject } = findActiveSubject();
    if (course && subject) {
      state.quiz.locationType = 'course';
      state.quiz.courseId = course.id;
      state.quiz.departmentId = subject.departmentId || department?.id || '';
      state.quiz.subjectId = subject.id;
      state.quiz.courseName = course.name || '';
      state.quiz.subjectName = subject.name || '';
    } else if (course && department) {
      state.quiz.locationType = 'department';
      state.quiz.courseId = course.id;
      state.quiz.departmentId = department.id;
      state.quiz.subjectId = '';
      state.quiz.courseName = course.name || '';
      state.quiz.departmentName = department.name || '';
      state.quiz.subjectName = '';
    }
    if (quizLocationPanel) quizLocationPanel.replaceChildren();
  }

  function bindQuizVisibilityControl() {
    document.querySelectorAll('[data-visibility]').forEach(btn => {
      btn.onclick = () => {
        const nextVisibility = normalizeVisibility(btn.dataset.visibility);
        if (state.quiz.visibility === nextVisibility) return;
        state.quiz.visibility = nextVisibility;
        state.quiz.settings = { ...(state.quiz.settings || {}), visibility: state.quiz.visibility };
        markDirty();
        renderModeBadge();
        renderAdvancedPanel();
        QuizPulse.toast(visibilityHelpText());
      };
    });
  }

  function teacherCanUseCourseFolders() {
    return !!(state.academic && state.academic.loaded && state.academic.canChooseLocation);
  }

  function ensureActiveTeachingSpace({ showToast = true } = {}) {
    if (!teacherCanUseCourseFolders()) return true;
    if (state.quiz.locationType === 'general') return true;
    const { course, department, subject } = findActiveSubject();
    if (course && subject) {
      state.quiz.locationType = 'course';
      state.quiz.courseId = course.id;
      state.quiz.departmentId = subject.departmentId || department?.id || '';
      state.quiz.subjectId = subject.id;
      state.quiz.courseName = course.name || '';
      state.quiz.subjectName = subject.name || '';
      return true;
    }
    if (course && department) {
      state.quiz.locationType = 'department';
      state.quiz.courseId = course.id;
      state.quiz.departmentId = department.id;
      state.quiz.subjectId = '';
      state.quiz.courseName = course.name || '';
      state.quiz.departmentName = department.name || '';
      state.quiz.subjectName = '';
      return true;
    }
    if (showToast) QuizPulse.toast('Choose a department or General before saving.');
    updateSaveState('Choose location');
    return false;
  }

  function applySaveLocation(value) {
    if (value === 'general') {
      state.quiz.locationType = 'general';
      state.quiz.courseId = '';
      state.quiz.departmentId = '';
      state.quiz.subjectId = '';
      state.quiz.courseName = '';
      state.quiz.departmentName = '';
      state.quiz.subjectName = '';
      return;
    }
    const [type, courseId, departmentId, subjectId = ''] = String(value || '').split(':');
    const course = (state.academic.courses || []).find(item => String(item.id || '') === courseId);
    const department = (course?.departments || []).find(item => String(item.id || '') === departmentId);
    const subject = (course?.subjects || []).find(item => String(item.id || '') === subjectId && String(item.departmentId || '') === departmentId);
    if (!course || !department || (type === 'subject' && !subject)) return;
    state.quiz.locationType = subject ? 'course' : 'department';
    state.quiz.courseId = course.id;
    state.quiz.departmentId = department.id;
    state.quiz.subjectId = subject?.id || '';
    state.quiz.courseName = course.name || '';
    state.quiz.departmentName = department.name || '';
    state.quiz.subjectName = subject?.name || '';
    if (subject) QuizPulse.setTeachingSpace?.({ courseId: course.id, courseName: course.name, subjectId: subject.id, subjectName: subject.name });
  }

  async function prepareQuizThumbnail(file) {
    const allowedTypes = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);
    if (!file || !allowedTypes.has(String(file.type || '').toLowerCase())) {
      throw new Error('Choose a PNG, JPG, WebP, or GIF image.');
    }
    if (file.size > 8 * 1024 * 1024) {
      throw new Error('Thumbnail images must be 8 MB or smaller.');
    }

    // Animated GIFs become a compact static cover so Library responses stay fast.
    const source = String(file.type || '').toLowerCase() === 'image/gif'
      ? new File([file], String(file.name || 'thumbnail').replace(/\.gif$/i, '.png'), { type: 'image/png' })
      : file;
    const attempts = [
      { maxWidth: 720, maxHeight: 405, quality: 0.58, preferOptimized: true },
      { maxWidth: 480, maxHeight: 270, quality: 0.50, preferOptimized: true },
      { maxWidth: 320, maxHeight: 180, quality: 0.48, preferOptimized: true },
      { maxWidth: 240, maxHeight: 135, quality: 0.48, preferOptimized: true }
    ];
    let thumbnail = null;
    for (const options of attempts) {
      thumbnail = await QuizPulse.fileToDataUrl(source, options);
      if (QuizPulse.safeMediaUrl(thumbnail?.dataUrl || '', 'image/') && String(thumbnail.dataUrl).length <= 58000) break;
    }
    if (!QuizPulse.safeMediaUrl(thumbnail?.dataUrl || '', 'image/') || String(thumbnail.dataUrl).length > 60000) {
      throw new Error('This image could not be optimized. Choose a simpler or smaller image.');
    }
    return String(thumbnail.dataUrl);
  }

  function saveThumbnailPreviewHtml(thumbnail) {
    const safeThumbnail = QuizPulse.safeMediaUrl(thumbnail || '', 'image/');
    if (!safeThumbnail) return '';
    const title = String(document.getElementById('quizTitle')?.value || state.quiz.title || 'Untitled Quiz').trim() || 'Untitled Quiz';
    const questionCount = Math.max(1, (state.quiz.Q || []).length);
    const visibility = visibilityLabel();
    return `<article class="qp-kahoot-quiz-card qp-save-thumbnail-card" aria-label="Quiz card preview for ${QuizPulse.escape(title)}">
      <div class="qp-kahoot-card-brand"><span aria-hidden="true">&#x26A1;</span><span>QuizPulse</span></div>
      <div class="qp-kahoot-card-thumb">
        <img src="${QuizPulse.escape(safeThumbnail)}" alt="${QuizPulse.escape(title)} thumbnail preview">
        <span class="qp-kahoot-question-badge">${questionCount} ${questionCount === 1 ? 'question' : 'questions'}</span>
      </div>
      <div class="qp-kahoot-card-body">
        <div class="qp-kahoot-card-mainline"><h3 dir="auto" title="${QuizPulse.escape(title)}">${QuizPulse.escape(title)}</h3></div>
        <p class="qp-save-thumbnail-owner">Your quiz</p>
        <span class="qp-pill">${visibility}</span>
      </div>
    </article>`;
  }

  function chooseSaveLocation() {
    return new Promise(resolve => {
      document.getElementById('quizSaveLocationDialog')?.remove();
      const dialog = document.createElement('dialog');
      dialog.id = 'quizSaveLocationDialog';
      dialog.className = 'qp-save-location-dialog';
      const canChooseLocation = teacherCanUseCourseFolders();
      const locationGroups = (state.academic.courses || []).map(course => ({
        label: course.name || 'College',
        options: (course.departments || []).flatMap(department => {
          const departmentOption = {
            value: `department:${course.id}:${department.id}`,
            label: `${department.name} · no subject`
          };
          const subjects = (course.subjects || [])
            .filter(subject => String(subject.departmentId || '') === String(department.id || '') && (!subject.system || subject.departmentId))
            .map(subject => ({
              value: `subject:${course.id}:${department.id}:${subject.id}`,
              label: `${department.name} → ${subject.name}${subject.stageName ? ` · ${subject.stageName}` : ''}`
            }));
          return [departmentOption, ...subjects];
        })
      })).filter(group => group.options.length);
      const currentValue = state.quiz.subjectId
        ? `subject:${state.quiz.courseId}:${state.quiz.departmentId}:${state.quiz.subjectId}`
        : (state.quiz.departmentId ? `department:${state.quiz.courseId}:${state.quiz.departmentId}` : 'general');
      let pendingThumbnail = QuizPulse.safeMediaUrl(state.quiz.thumbnail || '', 'image/');
      let pendingDescription = String(state.quiz.description || '').slice(0, 200);
      dialog.innerHTML = `
        <form method="dialog" class="qp-save-location-card">
          <span class="qp-pill">Save quiz</span>
          <h2>${canChooseLocation ? 'Where should this quiz be saved?' : 'Ready to save your quiz?'}</h2>
          <p>${canChooseLocation ? 'Choose a location and add an optional thumbnail.' : 'Add an optional thumbnail before saving.'}</p>
          ${canChooseLocation ? `<label><span>Location</span><select class="qp-input" id="quizSaveLocationSelect">
            <option value="general" ${currentValue === 'general' ? 'selected' : ''}>General quiz · no subject statistics</option>
            ${locationGroups.map(group => `<optgroup label="${QuizPulse.escape(group.label)}">${group.options.map(option => `<option value="${QuizPulse.escape(option.value)}" ${option.value === currentValue ? 'selected' : ''}>${QuizPulse.escape(option.label)}</option>`).join('')}</optgroup>`).join('')}
          </select></label>` : ''}
          ${canChooseLocation && !locationGroups.length ? '<div class="qp-auth-warning soft">No scoped departments are available yet. Save this quiz in General.</div>' : ''}
          <input id="quizThumbnailInput" type="file" accept="image/png,image/jpeg,image/webp,image/gif" hidden>
          <section class="qp-save-description-editor" id="quizDescriptionEditor" hidden>
            <label for="quizDescriptionInput">Description</label>
            <textarea class="qp-input" id="quizDescriptionInput" maxlength="200" rows="4" placeholder="Add a short description" dir="auto">${QuizPulse.escape(pendingDescription)}</textarea>
            <output id="quizDescriptionCount">${pendingDescription.length}/200</output>
          </section>
          <div class="qp-actions qp-save-location-actions">
            <button class="qp-btn" type="button" data-cancel-location>Cancel</button>
            <button class="qp-btn secondary qp-icon-only" type="button" data-pick-thumbnail aria-label="Choose thumbnail" title="Choose thumbnail"><span aria-hidden="true">&#x1F5BC;</span></button>
            <button class="qp-btn secondary qp-icon-only" type="button" data-edit-description aria-label="Edit description" title="Edit description"><span aria-hidden="true">&#x270E;</span></button>
            <button class="qp-btn primary" type="submit">Save here</button>
          </div>
          <section class="qp-save-thumbnail-preview" id="quizThumbnailPreview" aria-label="Thumbnail preview" ${pendingThumbnail ? '' : 'hidden'}>${saveThumbnailPreviewHtml(pendingThumbnail)}</section>
        </form>`;
      document.body.appendChild(dialog);
      let settled = false;
      const finish = value => { if (settled) return; settled = true; try { dialog.close(); } catch (_) {} dialog.remove(); resolve(value); };
      const thumbnailInput = dialog.querySelector('#quizThumbnailInput');
      const thumbnailPreview = dialog.querySelector('#quizThumbnailPreview');
      const thumbnailButton = dialog.querySelector('[data-pick-thumbnail]');
      const descriptionEditor = dialog.querySelector('#quizDescriptionEditor');
      const descriptionInput = dialog.querySelector('#quizDescriptionInput');
      const descriptionCount = dialog.querySelector('#quizDescriptionCount');
      dialog.querySelector('[data-cancel-location]')?.addEventListener('click', () => finish(null));
      dialog.addEventListener('cancel', event => { event.preventDefault(); finish(null); });
      thumbnailButton?.addEventListener('click', () => thumbnailInput?.click());
      dialog.querySelector('[data-edit-description]')?.addEventListener('click', () => {
        descriptionEditor.hidden = !descriptionEditor.hidden;
        if (!descriptionEditor.hidden) descriptionInput.focus();
      });
      descriptionInput?.addEventListener('input', () => {
        pendingDescription = String(descriptionInput.value || '').slice(0, 200);
        descriptionCount.textContent = `${pendingDescription.length}/200`;
      });
      thumbnailInput?.addEventListener('change', async () => {
        const file = thumbnailInput.files?.[0];
        if (!file) return;
        thumbnailButton.disabled = true;
        thumbnailButton.setAttribute('aria-busy', 'true');
        try {
          pendingThumbnail = await prepareQuizThumbnail(file);
          thumbnailPreview.innerHTML = saveThumbnailPreviewHtml(pendingThumbnail);
          thumbnailPreview.hidden = false;
          QuizPulse.toast('Thumbnail ready.');
        } catch (error) {
          QuizPulse.toast(error.message || 'Thumbnail upload failed.');
        } finally {
          thumbnailButton.disabled = false;
          thumbnailButton.removeAttribute('aria-busy');
          thumbnailInput.value = '';
        }
      });
      dialog.querySelector('form')?.addEventListener('submit', event => {
        event.preventDefault();
        finish({
          location: dialog.querySelector('#quizSaveLocationSelect')?.value || 'general',
          thumbnail: pendingThumbnail || '',
          description: pendingDescription
        });
      });
      if (typeof dialog.showModal === 'function') dialog.showModal(); else dialog.setAttribute('open', '');
    });
  }

  async function saveQuiz(silent = true, options = {}) {
    if (lectureQuestionMode) return saveLectureQuestion();
    if (!silent && !options.locationConfirmed) {
      const saveChoice = await chooseSaveLocation();
      if (!saveChoice) return null;
      applySaveLocation(saveChoice.location || 'general');
      state.quiz.thumbnail = String(saveChoice.thumbnail || '');
      state.quiz.description = String(saveChoice.description || '').slice(0, 200);
      options.locationConfirmed = true;
    }
    try {
      state.saving = true;
      updateSaveState('Saving…');
      state.quiz = normalizeQuizState(state.quiz);
      delete state.quiz._access;
      state.quiz.questions = state.quiz.Q;
      state.quiz.quizMode = 'normal';
      state.quiz.mode = 'normal';
      state.quiz.title = (document.getElementById('quizTitle')?.value.trim() || state.quiz.title || 'Untitled Quiz').slice(0, 80);
      state.quiz.visibility = normalizeVisibility(state.quiz.visibility);
      state.quiz.settings = { ...(state.quiz.settings || { showQuestionOnStudent: true, lockRoom: false }), visibility: state.quiz.visibility };
      if (!teacherCanUseCourseFolders()) {
        state.quiz.locationType = 'general';
        state.quiz.courseId = '';
        state.quiz.departmentId = '';
        state.quiz.subjectId = '';
        state.quiz.courseName = '';
        state.quiz.departmentName = '';
        state.quiz.subjectName = '';
      } else if (!ensureActiveTeachingSpace({ showToast: !silent })) {
        state.saving = false;
        renderQuizLocationPanel();
        return null;
      }
      const method = quizId ? 'PUT' : 'POST';
      const url = quizId ? `/api/quizzes/${quizId}` : '/api/quizzes';
      const saved = await QuizPulse.api(url, { method, body: JSON.stringify(state.quiz) });
      state.quiz = saved;
      quizId = saved.id;
      history.replaceState(null, '', `/creator?id=${quizId}`);
      state.dirty = false;
      state.saving = false;
      clearLocalDraft();
      updateSaveState('Saved ✓');
      renderHeaderLinks();
    renderModeBadge();
      return saved;
    } catch (error) {
      console.error(error);
      state.saving = false;
      updateSaveState('Offline - changes saved locally');
      saveLocalDraft();
      QuizPulse.toast(error.message || 'Save failed. Local draft kept.');
      return null;
    }
  }

  // Offline, Finish is the export: the quiz in the template, named after it and the day, to import on campus.
  async function finishOffline() {
    state.quiz = normalizeQuizState(state.quiz);
    const fixes = state.quiz.Q.flatMap((q, i) => getFixs(q).map(w => `Q${i + 1}: ${w}`));
    if (fixes.length) {
      const ok = await QuizPulse.confirmDialog({ title: 'Export quiz with warnings?', message: `Quiz has ${fixes.length} warning(s). ${fixes.slice(0, 5).join(' • ')}`, confirmText: 'Export anyway' });
      if (!ok) return;
    }
    saveLocalDraft();
    exportQuizFile();
  }

  async function finishQuiz() {
    if (OFFLINE) return finishOffline();
    if (lectureQuestionMode) return saveLectureQuestion({ closeAfterSave: true });
    const saved = await saveQuiz(false);
    if (saved) await finishQuizAfterSave();
  }

  async function finishQuizAfterSave() {
    state.quiz = normalizeQuizState(state.quiz);
    const allFixs = state.quiz.Q.flatMap((q, i) => getFixs(q).map(w => `Q${i + 1}: ${w}`));
    if (allFixs.length) {
      const ok = await QuizPulse.confirmDialog({ title: 'Finish quiz with warnings?', message: `Quiz has ${allFixs.length} warning(s). ${allFixs.slice(0, 5).join(' • ')}`, confirmText: 'Finish anyway' });
      if (!ok) return;
    }
    const saved = await QuizPulse.api(`/api/quizzes/${quizId}/finish`, { method: 'POST', body: JSON.stringify({}) });
    state.quiz = saved;
    render();
    QuizPulse.toast('Finished.');
  }

  function validateQuiz(showToast = false) {
    const warnings = getFixs(currentQuestion());
    if (showToast && warnings.length) QuizPulse.toast(warnings[0]);
    return warnings;
  }

  function getFixs(q) {
    const warnings = [];
    if (!q.title.trim()) warnings.push('This question has no question text.');
    if (['mcq', 'truefalse', 'multiselect', 'poll'].includes(q.type)) {
      if (q.type !== 'poll' && !q.choices.some(c => c.correct)) warnings.push('No correct answer selected.');
      if ((q.choices || []).length < 2) warnings.push('At least two options are needed.');
      if ((q.choices || []).some(c => !String(c.text || '').trim())) warnings.push('Some answer boxes are empty.');
    }
    if (q.type === 'order' && q.orderItems.length < 2) warnings.push('Order question needs at least two items.');
    if (q.type === 'type' && !q.acceptedAnswers.some(a => String(a).trim())) warnings.push('Type question needs an accepted answer.');
    if (q.type === 'map' && !(q.media && String(q.media.type || '').startsWith('image/'))) warnings.push('Old map-click question needs an image.');
    if (q.type === 'hotspot' && !(q.media && String(q.media.type || '').startsWith('image/'))) warnings.push('Pin on Image needs an image.');
    if (q.type === 'hotspot' && !q.hotspotAnswer) warnings.push('Draw the correct area on the image.');
    if (q.type === 'matching' && (!Array.isArray(q.matchingPairs) || q.matchingPairs.length < 2)) warnings.push('Matching question needs at least two pairs.');
    if (q.type === 'matching' && (q.matchingPairs || []).some(pair => !String(pair.left || '').trim() || !String(pair.right || '').trim())) warnings.push('Some matching pairs are empty.');
    if (q.type === 'fillblank' && (!Array.isArray(q.fillBlanks) || !(q.fillBlanks || []).some(blank => (blank.answers || []).some(a => String(a || '').trim())))) warnings.push('Fill in the blank needs an accepted answer.');
    return warnings;
  }

  async function load() {
    await QuizPulse.refreshQuestionStyles?.();
    if (lectureQuestionMode) {
      try {
        const payload = await QuizPulse.api(`/api/lectures/${encodeURIComponent(lectureId)}`);
        if (!payload?.permissions?.canManage) throw new Error('You cannot edit this lecture.');
        const lecture = payload.lecture || {};
        const item = lectureItemId ? (lecture.items || []).find(entry => String(entry.id) === lectureItemId) : null;
        if (lectureItemId && (!item || item.type !== 'question')) throw new Error('Lecture question not found.');
        const question = item?.question ? JSON.parse(JSON.stringify(item.question)) : makeQuestion('mcq');
        if (item?.hasMedia) {
          question.media = {
            ...(question.media || {}),
            type: item.mediaMime || question.media?.type || 'image/jpeg',
            name: question.media?.name || 'Question image',
            dataUrl: `/api/lectures/${encodeURIComponent(lectureId)}/items/${encodeURIComponent(item.id)}/media`
          };
        }
        state.lectureTitle = String(lecture.title || 'Lecture');
        state.lectureQuestionWeight = Number(item?.questionWeight || 1);
        state.quiz = normalizeQuizState({
          title: state.lectureTitle,
          status: 'draft',
          settings: { showQuestionOnStudent: true, lockRoom: false, theme: { backgroundPreset: question.theme?.backgroundPreset || 'neo', ...(question.theme || {}) } },
          Q: [question]
        });
        await maybeRestoreLocalDraft();
        render();
        configureLectureQuestionEditor();
        return;
      } catch (error) {
        QuizPulse.toast(error.message || 'Could not open the lecture question.');
        setTimeout(() => location.replace(`/lectures?lectureId=${encodeURIComponent(lectureId)}`), 500);
        return;
      }
    }
    if (quizId) {
      try {
        const loadedQuiz = await QuizPulse.api(`/api/quizzes/${quizId}`);
        if (!loadedQuiz?._access?.canEdit) {
          QuizPulse.toast('Only the quiz owner can edit it. Duplicate the quiz to make your own version.');
          location.replace(`/preview?id=${encodeURIComponent(quizId)}`);
          return;
        }
        state.quiz = normalizeQuizState(loadedQuiz);
        delete state.quiz._access;
      } catch (e) {
        QuizPulse.toast(e.message || 'Could not load quiz');
        location.replace('/library');
        return;
      }
    }
    if (!quizId && (requestedSubjectId || requestedDepartmentId)) {
      state.quiz.locationType = 'course';
      state.quiz.courseId = requestedCourseId;
      state.quiz.departmentId = requestedDepartmentId;
      state.quiz.subjectId = requestedSubjectId;
    }
    state.quiz = normalizeQuizState(state.quiz);
    state.quiz.settings = { showQuestionOnStudent: true, lockRoom: false, theme: { backgroundPreset: 'neo' }, ...(state.quiz.settings || {}) };
    state.quiz.settings.theme = { backgroundPreset: 'neo', ...(state.quiz.settings.theme || {}) };
    await maybeRestoreLocalDraft();
    await loadAcademicLocations();
    if (!quizId && teacherCanUseCourseFolders() && !ensureActiveTeachingSpace({ showToast: false })) {
      location.href = '/subjects';
      return;
    }
    state.quiz.settings = { showQuestionOnStudent: true, lockRoom: false, theme: { backgroundPreset: 'neo' }, ...(state.quiz.settings || {}) };
    state.quiz.settings.theme = { backgroundPreset: 'neo', ...(state.quiz.settings.theme || {}) };
    render();
    if (!quizId && requestedAction === 'import') {
      QuizPulse.toast('Use Import XLSX in the top bar to upload your spreadsheet.');
      const importBtn = document.getElementById('importBtn');
      importBtn?.classList.add('qp-attention-pulse');
      setTimeout(() => importBtn?.classList.remove('qp-attention-pulse'), 3600);
    }
  }

  function render() {
    renderModeBadge();
    try {
      state.quiz = normalizeQuizState(state.quiz);
      selectedIndex = Math.max(0, Math.min(Number(selectedIndex || 0), state.quiz.Q.length - 1));
      const titleInput = document.getElementById('quizTitle');
      titleInput.maxLength = 80;
      titleInput.value = state.quiz.title || '';
      document.getElementById('quizStatus').textContent = state.quiz.status || 'draft';
      renderHeaderLinks();
      renderQuizLocationPanel();
      QuizPulse.applyQuizBackground(QuizPulse.backgroundForQuestion(state.quiz.settings || {}, currentQuestion()));
      renderQuestionList();
      renderQuestionEditor();
      renderAdvancedPanel();
      updateSaveState(state.dirty ? 'Unsaved' : 'Saved ✓');
    } catch (error) {
      console.error('Creator render failed', error);
      state.quiz = normalizeQuizState(state.quiz);
      questionList.innerHTML = `<div class="qp-empty-state qp-empty-side"><b>Questions</b><span>Could not load this draft.</span><button class="qp-btn primary" data-action="addBlank">+ Add question</button></div>`;
      questionEditor.innerHTML = `<div class="qp-empty-state"><div class="qp-empty-emoji">⚡</div><h3>Start with one question</h3><p>The editor was reset to a safe blank question.</p><button class="qp-btn primary" id="recoverAddQuestion">+ Add question</button></div>`;
      advancedPanel.innerHTML = `<section class="qp-prop-card qp-prop-primary"><label class="qp-prop-label">Settings</label><div style="padding:0 14px 14px"><p class="qp-prop-help">Add a question first.</p></div></section>`;
      document.getElementById('recoverAddQuestion')?.addEventListener('click', () => { state.quiz = normalizeQuizState({}); selectedIndex = 0; markDirty(); render(); });
      updateSaveState('Unsaved');
    }
  }

  function renderHeaderLinks() {
    const previewBtn = document.getElementById('previewBtn');
    const hostBtn = document.getElementById('hostBtn');
    // The offline creator has neither: nothing there to preview or host.
    if (!previewBtn || !hostBtn) return;
    if (state.quiz.status === 'finished' && quizId) {
      previewBtn.classList.remove('qp-initially-hidden');
      hostBtn.classList.remove('qp-initially-hidden');
      previewBtn.href = `/preview?id=${quizId}`;
      hostBtn.href = `/host?id=${quizId}`;
    } else {
      previewBtn.classList.add('qp-initially-hidden');
      hostBtn.classList.add('qp-initially-hidden');
    }
  }

  function sidebarTypeLabel(type) {
    const labels = {
      mcq: 'Quiz',
      truefalse: 'True or false',
      multiselect: 'Multi select',
      order: 'Order',
      type: 'Type answer',
      hotspot: 'Pin on image',
      slider: 'Slider',
      matching: 'Match pairs',
      fillblank: 'Fill blank',
      poll: 'Poll',
      wordcloud: 'Word cloud'
    };
    return labels[type] || QuizPulse.typeLabel(type) || 'Question';
  }

  function compactPreviewForType(q) {
    const type = String(q?.type || 'mcq');
    const hasImage = q.media && String(q.media.type || '').startsWith('image/') && q.media.dataUrl;
    if (hasImage) {
      const safeUrl = QuizPulse.safeCssUrl(q.media.dataUrl, 'image/');
      if (safeUrl) return `<div class="qp-compact-preview qp-compact-preview-image" style="--qp-thumb-bg:url('${safeUrl}')"><span>${QuizPulse.escape(sidebarTypeLabel(type))}</span></div>`;
    }
    if (['mcq', 'multiselect', 'poll'].includes(type)) {
      return `<div class="qp-compact-preview qp-compact-preview-list" aria-hidden="true"><i></i><b></b><i></i><b></b><i></i><b></b></div>`;
    }
    if (type === 'truefalse') {
      return `<div class="qp-compact-preview qp-compact-preview-tf" aria-hidden="true"><span class="ok">✓</span><em></em><span class="no">×</span></div>`;
    }
    if (type === 'wordcloud') {
      return `<div class="qp-compact-preview qp-compact-preview-cloud" aria-hidden="true"><b>idea</b><i>word</i><em>cloud</em><i>fun</i></div>`;
    }
    if (type === 'type' || type === 'fillblank') {
      return `<div class="qp-compact-preview qp-compact-preview-type" aria-hidden="true"><span>T</span><i></i></div>`;
    }
    if (type === 'slider') {
      return `<div class="qp-compact-preview qp-compact-preview-slider" aria-hidden="true"><b></b><span></span><i></i><i></i><i></i><i></i><i></i></div>`;
    }
    if (type === 'hotspot' || type === 'map') {
      return `<div class="qp-compact-preview qp-compact-preview-pin" aria-hidden="true"><span>⌖</span></div>`;
    }
    if (type === 'matching') {
      return `<div class="qp-compact-preview qp-compact-preview-match" aria-hidden="true"><span>A</span><b></b><span>1</span><span>B</span><b></b><span>2</span></div>`;
    }
    if (type === 'order') {
      return `<div class="qp-compact-preview qp-compact-preview-order" aria-hidden="true"><span>1</span><b></b><span>2</span><b></b><span>3</span><b></b></div>`;
    }
    const icon = (QuizPulse.questionTypes.find(t => t.id === type) || {}).icon || '▣';
    return `<div class="qp-compact-preview qp-compact-preview-default" aria-hidden="true"><span>${icon}</span></div>`;
  }

  function renderQuestionList() {
    const countBadge = document.getElementById('questionCountBadge');
    const questions = Array.isArray(state.quiz.Q) ? state.quiz.Q : [];
    if (countBadge) countBadge.textContent = `${questions.length} Q`;
    syncQuestionReorderUi();
    if (!questions.length) {
      questionList.classList.remove('qp-dense-list');
      questionList.innerHTML = `<div class="qp-empty-state qp-empty-side"><b>No questions yet</b><span>Press + Add to create your first question.</span><button class="qp-btn primary" data-action="addBlank">+ Add question</button></div>`;
      return;
    }
    if (state.reorderMode) {
      questionList.classList.remove('qp-dense-list');
      questionList.classList.add('qp-reorder-list');
      questionList.innerHTML = questions.map((q, i) => {
        const type = (QuizPulse.questionTypes || []).find(item => item.id === q.type) || {};
        const label = type.label || sidebarTypeLabel(q.type);
        const title = String(q.title || '').trim() || label;
        return `
          <article class="qp-question-reorder-row ${i === selectedIndex ? 'is-selected' : ''}" data-index="${i}">
            <button class="qp-question-drag-handle" type="button" data-reorder-handle aria-label="Drag question ${i + 1}" title="Drag to reorder"><span aria-hidden="true">&#x2637;</span></button>
            <span class="qp-question-reorder-number">${i + 1}</span>
            <span class="qp-question-reorder-type" title="${QuizPulse.escape(label)}" aria-hidden="true">${type.icon || '&#x25A3;'}</span>
            <span class="qp-question-reorder-copy"><b>${QuizPulse.escape(title)}</b><small>${QuizPulse.escape(label)}</small></span>
            <span class="qp-question-reorder-actions">
              <button type="button" data-action="moveQuestion" data-dir="up" data-index="${i}" title="Move up" aria-label="Move question ${i + 1} up" ${i === 0 ? 'disabled' : ''}>&#x2191;</button>
              <button type="button" data-action="moveQuestion" data-dir="down" data-index="${i}" title="Move down" aria-label="Move question ${i + 1} down" ${i === questions.length - 1 ? 'disabled' : ''}>&#x2193;</button>
            </span>
          </article>`;
      }).join('');
      return;
    }
    questionList.classList.remove('qp-reorder-list');
    const denseMode = false;
    questionList.classList.remove('qp-dense-list');
    questionList.innerHTML = questions.map((q, i) => {
      const warnings = getFixs(q);
      const points = Number(q.points || 0) * (q.doublePoints ? 2 : 1);
      const label = sidebarTypeLabel(q.type);
      const typeIcon = ((QuizPulse.questionTypes || []).find(type => type.id === q.type) || {}).icon || '&#x25A3;';
      const warningTitle = warnings.length ? warnings.join('\n') : 'Ready';
      const status = warnings.length
        ? `<span class="qp-compact-state warn" title="${QuizPulse.escape(warningTitle)}" aria-label="Question needs attention">!</span>`
        : `<span class="qp-compact-state ok" title="Ready" aria-label="Question ready">✓</span>`;
      if (denseMode) {
        const titleText = String(q.title || '').trim() || label;
        return `
          <article class="qp-question-thumb qp-compact-thumb qp-dense-thumb ${i === selectedIndex ? 'active' : ''}" data-index="${i}" title="${QuizPulse.escape(titleText)}${warnings.length ? ' - needs attention' : ''}">
            <span class="qp-compact-number">${i + 1}</span>
            <div class="qp-dense-main">
              <b class="qp-compact-title">${QuizPulse.escape(label)}</b>
              <small>${QuizPulse.escape(titleText)}</small>
            </div>
            <div class="qp-dense-meta"><span>☆</span><b>${points}</b>${q.doublePoints ? `<em>2X</em>` : ''}</div>
            ${status}
            <button class="qp-compact-delete" data-action="delete" data-index="${i}" type="button" title="Delete question" aria-label="Delete question ${i + 1}">×</button>
          </article>`;
      }
      return `
        <article class="qp-question-thumb qp-compact-thumb ${i === selectedIndex ? 'active' : ''}" data-index="${i}" title="${QuizPulse.escape(label)}${warnings.length ? ' - needs attention' : ''}">
          <span class="qp-question-card-drag-grip" data-question-drag-handle aria-hidden="true">&#x22EE;&#x22EE;</span>
          <div class="qp-compact-head">
            <span class="qp-compact-number">${i + 1}</span>
            <span class="qp-compact-type-icon" title="${QuizPulse.escape(label)}" aria-label="${QuizPulse.escape(label)}">${typeIcon}</span>
            ${QuizPulse.planAllowsQuestionType?.(q.type) === false ? `<span class="qp-compact-plan-lock" data-plan-locked-question title="Your plan leaves this question type out. It still plays, but it cannot be changed." aria-label="Not in your plan">${QuizPulse.lockIcon}</span>` : ''}
            ${status}
            <details class="qp-question-card-menu">
              <summary class="qp-question-card-menu-trigger" title="Question actions" aria-label="Actions for question ${i + 1}">&#x22EF;</summary>
              <div class="qp-question-card-menu-popover" role="menu">
                <button type="button" role="menuitem" data-action="moveToPosition" data-index="${i}"><span aria-hidden="true">&#x2195;</span>Move to position</button>
                <button type="button" role="menuitem" data-action="duplicate" data-index="${i}"><span aria-hidden="true">&#x2398;</span>Duplicate</button>
                <button class="danger" type="button" role="menuitem" data-action="delete" data-index="${i}"><span aria-hidden="true">&#x2715;</span>Delete</button>
              </div>
            </details>
          </div>
          ${compactPreviewForType(q)}
          <div class="qp-compact-points"><span aria-hidden="true">☆</span><b>${points}</b> pts${q.doublePoints ? `<em>2X</em>` : ''}</div>
        </article>`;
    }).join('');
  }

  function configureLectureQuestionEditor() {
    document.body.classList.add('qp-lecture-question-editor-mode');
    const titleInput = document.getElementById('quizTitle');
    if (titleInput) {
      titleInput.value = state.lectureTitle;
      titleInput.readOnly = true;
      titleInput.setAttribute('aria-label', 'Lecture title');
    }
    const modeBadge = document.getElementById('quizModeBadge');
    if (modeBadge) modeBadge.textContent = 'Lecture question';
    document.getElementById('quizScopeBadge')?.setAttribute('hidden', '');
    document.getElementById('quizStatus')?.setAttribute('hidden', '');
    const finish = document.getElementById('finishBtn');
    if (finish) {
      finish.innerHTML = '<span>Save question</span>';
      finish.setAttribute('aria-label', 'Save question to lecture');
    }
    const titleChip = document.querySelector('.qp-creator-title-chip');
    if (titleChip && !document.getElementById('lectureQuestionWeightControl')) {
      titleChip.insertAdjacentHTML('beforeend', `<label class="qp-lecture-question-weight" id="lectureQuestionWeightControl"><span>Weight</span><input type="number" min="0.1" max="1000" step="0.1" value="${Number(state.lectureQuestionWeight || 1)}" aria-label="Lecture question weight"></label>`);
      document.querySelector('#lectureQuestionWeightControl input')?.addEventListener('input', event => {
        state.lectureQuestionWeight = Math.max(.1, Math.min(1000, Number(event.target.value || 1)));
        markDirty();
      });
    }
    const actions = document.querySelector('.qp-creator-actionbar');
    if (actions && !document.getElementById('closeLectureQuestionEditor')) {
      actions.insertAdjacentHTML('afterbegin', '<button class="qp-btn" id="closeLectureQuestionEditor" type="button">Back</button>');
      document.getElementById('closeLectureQuestionEditor')?.addEventListener('click', closeLectureQuestionEditor);
    }
  }

  function lectureQuestionForSave() {
    const question = JSON.parse(JSON.stringify(currentQuestion()));
    question.theme = { ...((state.quiz.settings || {}).theme || {}) };
    const mediaUrl = String(question.media?.dataUrl || '');
    if (mediaUrl.startsWith(`/api/lectures/${encodeURIComponent(lectureId)}/items/`)) delete question.media.dataUrl;
    return question;
  }

  async function saveLectureQuestion({ closeAfterSave = false } = {}) {
    if (state.saving) return null;
    const warnings = getFixs(currentQuestion());
    if (warnings.length) {
      QuizPulse.toast(warnings[0]);
      return null;
    }
    state.saving = true;
    updateSaveState('Saving...');
    const previousDraftKey = draftKey();
    try {
      const question = lectureQuestionForSave();
      const body = { type: 'question', title: question.title, questionWeight: Number(state.lectureQuestionWeight || 1), question };
      const endpoint = lectureItemId
        ? `/api/lectures/${encodeURIComponent(lectureId)}/items/${encodeURIComponent(lectureItemId)}`
        : `/api/lectures/${encodeURIComponent(lectureId)}/items`;
      const item = await QuizPulse.api(endpoint, { method: lectureItemId ? 'PATCH' : 'POST', body: JSON.stringify(body) });
      lectureItemId = String(item.id || lectureItemId);
      history.replaceState(null, '', `/creator?lectureId=${encodeURIComponent(lectureId)}&lectureItemId=${encodeURIComponent(lectureItemId)}`);
      state.dirty = false;
      state.saving = false;
      try { localStorage.removeItem(previousDraftKey); } catch (_) {}
      clearLocalDraft();
      updateSaveState('Saved');
      const signal = { type: 'quizpulse:lecture-question-saved', lectureId, itemId: lectureItemId, savedAt: Date.now() };
      try { localStorage.setItem(`quizpulseLectureQuestionSaved:${lectureId}`, JSON.stringify(signal)); } catch (_) {}
      try { window.opener?.postMessage(signal, location.origin); } catch (_) {}
      QuizPulse.toast('Question saved to the lecture.');
      if (closeAfterSave) setTimeout(closeLectureQuestionEditor, 180);
      return item;
    } catch (error) {
      state.saving = false;
      updateSaveState('Save failed');
      QuizPulse.toast(error.message || 'Could not save the lecture question.');
      return null;
    }
  }

  function closeLectureQuestionEditor() {
    const destination = `/lectures?lectureId=${encodeURIComponent(lectureId)}`;
    if (window.opener && !window.opener.closed) window.close();
    else location.href = destination;
  }

  function syncQuestionReorderUi() {
    document.body.classList.toggle('qp-question-reorder-mode', !!state.reorderMode);
    if (questionPanelTitle) questionPanelTitle.textContent = state.reorderMode ? 'Reorder' : 'Questions';
    if (reorderQuestionsBtn) reorderQuestionsBtn.disabled = (state.quiz.Q || []).length < 2;
  }

  function announceQuestionMove(question, index) {
    if (!questionReorderStatus) return;
    const title = String(question?.title || '').trim() || `Question ${index + 1}`;
    questionReorderStatus.textContent = `${title} moved to position ${index + 1}.`;
  }

  function showQuestionMoveUndoToast(question, fromIndex, toIndex) {
    const toast = document.getElementById('toast');
    if (!toast) return;
    const undoId = QuizPulse.id('move');
    toast.dataset.undoId = undoId;
    const message = document.createElement('span');
    message.textContent = `Moved to ${toIndex + 1}`;
    const undo = document.createElement('button');
    undo.className = 'qp-toast-undo';
    undo.type = 'button';
    undo.textContent = 'Undo';
    undo.addEventListener('click', () => {
      if (toast.dataset.undoId !== undoId) return;
      const currentIndex = (state.quiz.Q || []).indexOf(question);
      if (currentIndex >= 0) moveQuestionToIndex(currentIndex, fromIndex, { announce: false, undo: false });
      toast.classList.remove('show');
      QuizPulse.toast('Move undone.');
    });
    toast.replaceChildren(message, undo);
    toast.classList.add('show');
    clearTimeout(toast._timer);
    toast._timer = setTimeout(() => {
      if (toast.dataset.undoId === undoId) toast.classList.remove('show');
    }, 5200);
  }

  function moveQuestionToIndex(fromIndex, toIndex, options = {}) {
    const questions = state.quiz.Q || [];
    const from = Number(fromIndex);
    const to = Math.max(0, Math.min(Number(toIndex), questions.length - 1));
    if (!Number.isInteger(from) || from < 0 || from >= questions.length || from === to) return false;
    const selectedQuestion = questions[selectedIndex];
    const [moved] = questions.splice(from, 1);
    questions.splice(to, 0, moved);
    const nextSelectedIndex = questions.indexOf(selectedQuestion);
    selectedIndex = nextSelectedIndex >= 0 ? nextSelectedIndex : to;
    markDirty();
    if (options.render !== false) renderQuestionList();
    if (options.announce !== false) announceQuestionMove(moved, to);
    if (options.undo !== false) showQuestionMoveUndoToast(moved, from, to);
    if (options.reveal) {
      requestAnimationFrame(() => questionList.querySelector(`[data-index="${to}"]`)?.scrollIntoView({ block: 'nearest' }));
    }
    return true;
  }

  function moveQuestionToInsertion(fromIndex, insertionIndex, options = {}) {
    let target = Math.max(0, Math.min(Number(insertionIndex), (state.quiz.Q || []).length));
    if (Number(fromIndex) < target) target -= 1;
    return moveQuestionToIndex(fromIndex, target, options);
  }

  function questionStepState(q) {
    const hasQuestion = !!String(q.title || '').trim();
    const hasMedia = !!q.media;
    let hasAnswers = true;
    let hasCorrect = true;
    if (['mcq', 'truefalse', 'multiselect', 'poll'].includes(q.type)) {
      hasAnswers = (q.choices || []).length >= 2 && !(q.choices || []).some(c => !String(c.text || '').trim());
      hasCorrect = q.type === 'poll' ? true : (q.choices || []).some(c => c.correct);
    } else if (q.type === 'order') {
      hasAnswers = (q.orderItems || []).length >= 2;
      hasCorrect = hasAnswers;
    } else if (q.type === 'type') {
      hasAnswers = (q.acceptedAnswers || []).some(a => String(a || '').trim());
      hasCorrect = hasAnswers;
    } else if (q.type === 'map') {
      hasAnswers = !!q.media;
      hasCorrect = !!q.mapAnswer;
    } else if (q.type === 'hotspot') {
      hasAnswers = !!q.media;
      hasCorrect = !!q.hotspotAnswer;
    } else if (q.type === 'slider') {
      hasAnswers = true;
      hasCorrect = q.slider && Number.isFinite(Number(q.slider.correct));
    } else if (q.type === 'matching') {
      hasAnswers = (q.matchingPairs || []).length >= 2 && !(q.matchingPairs || []).some(pair => !String(pair.left || '').trim() || !String(pair.right || '').trim());
      hasCorrect = hasAnswers;
    } else if (q.type === 'fillblank') {
      hasAnswers = (q.fillBlanks || []).some(blank => (blank.answers || []).some(a => String(a || '').trim()));
      hasCorrect = hasAnswers;
    }
    return { hasQuestion, hasMedia, hasAnswers, hasCorrect, hasSettings: !!q.timeLimit && Number(q.points) >= 0 };
  }

  function renderCreatorFlow(q) {
    const st = questionStepState(q);
    const steps = [
      { label: 'Question', ok: st.hasQuestion },
      ...(OFFLINE ? [] : [{ label: ['map','hotspot'].includes(q.type) ? 'Image' : 'Media', ok: ['map','hotspot'].includes(q.type) ? st.hasMedia : true, soft: !['map','hotspot'].includes(q.type) && !st.hasMedia }]),
      { label: ['type','slider','map','hotspot','order','matching','fillblank'].includes(q.type) ? 'Answer' : 'Answers', ok: st.hasAnswers },
      { label: 'Correct', ok: st.hasCorrect },
      { label: 'Time/pts', ok: st.hasSettings }
    ];
    return `<div class="qp-creator-flow" aria-label="Creator flow">
      ${steps.map((step, i) => `<span class="${step.ok ? 'done' : step.soft ? 'optional' : 'todo'}"><b>${i + 1}</b> ${step.label}</span>`).join('<i></i>')}
    </div>`;
  }

  function renderControlPopover(q) {
    if (state.controlMenu === 'type') {
      return `<div class="qp-creator-control-popover qp-control-type-menu" role="menu" aria-label="Question types">
        <div class="qp-control-popover-title">Question type</div>
        <div class="qp-control-option-grid">
          ${(QuizPulse.questionTypes || []).map(type => {
            // A type the organization's plan leaves out keeps its place with a lock, and asks for an upgrade.
            const locked = QuizPulse.planAllowsQuestionType?.(type.id) === false;
            return `<button class="qp-control-option ${q.type === type.id ? 'active' : ''}${locked ? ' is-plan-locked' : ''}" type="button" ${locked ? `data-plan-locked-type="${type.id}"` : `data-set-question-type="${type.id}"`} role="menuitem"><span aria-hidden="true">${type.icon}</span><b>${QuizPulse.escape(type.label)}</b>${locked ? `<i class="qp-plan-lock" aria-hidden="true">${QuizPulse.lockIcon}</i>` : ''}</button>`;
          }).join('')}
        </div>
      </div>`;
    }
    if (state.controlMenu === 'time') {
      const customTime = questionTimeParts(q.timeLimit);
      return `<div class="qp-creator-control-popover" role="menu" aria-label="Time limit">
        <div class="qp-control-popover-title">Time limit</div>
        <div class="qp-control-choice-row">
          ${[5,10,20,30,45,60,90,120].map(value => `<button class="${Number(q.timeLimit) === value ? 'active' : ''}" type="button" data-set-time="${value}" role="menuitem">${value}s</button>`).join('')}
        </div>
        <div class="qp-custom-time" aria-label="Custom question time">
          <div class="qp-custom-time-fields">
            <label><span>MIN</span><input id="creatorCustomMinutes" type="number" min="0" max="59" step="1" inputmode="numeric" value="${customTime.minutes}" aria-label="Custom minutes"></label>
            <span class="qp-custom-time-separator" aria-hidden="true">:</span>
            <label><span>SEC</span><input id="creatorCustomSeconds" type="number" min="0" max="59" step="1" inputmode="numeric" value="${customTime.seconds}" aria-label="Custom seconds"></label>
          </div>
          <output id="creatorCustomTimePreview" aria-live="polite">${questionTimeLabel(customTime.total)}</output>
          <button type="button" data-apply-custom-time>Set custom time</button>
        </div>
        <small class="qp-custom-time-note">Custom time can be from 5 seconds to 59 minutes 59 seconds.</small>
        <button class="qp-control-apply-all" type="button" data-apply-control="time">Apply ${questionTimeLabel(q.timeLimit)} to all questions</button>
      </div>`;
    }
    if (state.controlMenu === 'points') {
      return `<div class="qp-creator-control-popover" role="menu" aria-label="Points">
        <div class="qp-control-popover-title"><span aria-hidden="true">&#x1F3C5;</span> Points</div>
        <div class="qp-control-choice-row qp-points-choice-row">
          ${[1000,2000,4000].map(value => `<button class="${Number(q.points) === value ? 'active' : ''}" type="button" data-set-points="${value}" role="menuitem"><b>${value}</b>${value === 4000 ? '<small title="Questions above 2000 points do not count in statistics">&#x26A0; Not ranked</small>' : ''}</button>`).join('')}
        </div>
        <div class="qp-custom-points-row">
          <label for="creatorCustomPoints">Custom</label>
          <input id="creatorCustomPoints" type="number" min="0" max="100000" step="10" value="${Number(q.points || 0)}" inputmode="numeric" aria-label="Custom points">
          <button type="button" data-apply-custom-points>Set</button>
        </div>
        <button class="qp-control-apply-all" type="button" data-apply-control="points">Apply ${Number(q.points || 0)} points to all questions</button>
      </div>`;
    }
    return '';
  }

  function renderQuestionControlStrip(q) {
    const type = (QuizPulse.questionTypes || []).find(item => item.id === q.type) || {};
    const warnings = getFixs(q);
    const mediaControl = ['map', 'hotspot'].includes(q.type)
      ? 'data-creator-control="media"'
      : 'class="addMediaBtn"';
    return `<div class="qp-creator-controls-wrap">
      <nav class="qp-creator-control-strip" aria-label="Question controls">
        <button class="${state.controlMenu === 'type' ? 'active' : ''}" type="button" data-creator-control="type" title="Question type" aria-expanded="${state.controlMenu === 'type'}"><span aria-hidden="true">${QuizPulse.escape(type.icon || '▣')}</span><b>${QuizPulse.escape(type.label || sidebarTypeLabel(q.type))}</b></button>
        <button class="${state.controlMenu === 'time' ? 'active' : ''}" type="button" data-creator-control="time" title="Time limit" aria-expanded="${state.controlMenu === 'time'}"><span aria-hidden="true">⏱</span><b>${questionTimeLabel(q.timeLimit)}</b></button>
        ${q.type === 'wordcloud' ? `<span class="qp-creator-control-note" title="A word cloud gives no points"><span aria-hidden="true">&#x1F3C5;</span><b>No points</b></span>` : `<button class="${state.controlMenu === 'points' ? 'active' : ''}" type="button" data-creator-control="points" title="Points" aria-expanded="${state.controlMenu === 'points'}"><span aria-hidden="true">&#x1F3C5;</span><b>${Number(q.points || 0)}</b></button>
        <button class="qp-creator-control-double ${q.doublePoints ? 'active' : ''}" type="button" data-creator-control="double" title="Double points" aria-label="Double points" aria-pressed="${q.doublePoints ? 'true' : 'false'}"><b>2X</b></button>`}
        ${OFFLINE ? '' : `<button type="button" ${mediaControl} title="${q.media ? 'Replace media' : 'Add media'}"><span aria-hidden="true">🖼️</span><b>Media</b></button>`}
        <button class="qp-creator-control-status ${warnings.length ? 'warn' : 'ready'}" type="button" data-creator-control="validate" title="${QuizPulse.escape(warnings.length ? warnings[0] : 'Question ready')}" aria-label="${QuizPulse.escape(warnings.length ? `${warnings.length} issue${warnings.length === 1 ? '' : 's'}` : 'Question ready')}"><span aria-hidden="true">${warnings.length ? '!' : '✓'}</span></button>
        <button class="qp-creator-control-more" type="button" data-creator-control="more" title="More settings" aria-label="More settings"><span aria-hidden="true">🎛️</span></button>
      </nav>
      ${renderControlPopover(q)}
    </div>`;
  }

  function renderQuestionEditor() {
    if (!Array.isArray(state.quiz.Q) || !state.quiz.Q.length) {
      questionEditor.innerHTML = `<div class="qp-empty-state"><div class="qp-empty-emoji">📝</div><h3>No question yet</h3><p>Click add to start.</p><button class="qp-btn primary" id="emptyAddQuestion">+ Add question</button></div>`;
      document.getElementById('emptyAddQuestion')?.addEventListener('click', () => addQuestion('mcq'));
      return;
    }
    const q = currentQuestion();
    const warnings = getFixs(q);
    const mediaHtml = q.media ? QuizPulse.renderMedia(q.media, q.media.type.startsWith('video/') ? 'qp-video-preview' : q.media.type.startsWith('audio/') ? 'qp-audio-preview' : 'qp-media-preview') : '';
    // Offline, no picture, sound or video: the file the quiz leaves in cannot hold one.
    const mediaMenuHtml = OFFLINE ? '' : `<div class="qp-media-menu" id="mediaMenu">
      <button class="qp-menu-item" data-media="image">🖼️ Image</button>
      <button class="qp-menu-item" data-media="audio">🔊 Audio</button>
      <button class="qp-menu-item" data-media="video">🎬 Video</button>
      ${q.media ? '<button class="qp-menu-item" data-media="remove">🗑️ Remove</button>' : ''}
    </div>`;
    const normalMediaBox = ['map','hotspot'].includes(q.type) ? `
      <div class="qp-editor-note">
        Upload the image in the answer area below.
      </div>` : q.media ? `
      <section class="qp-editor-section qp-media-section">
        <div class="qp-media-box" id="mediaBox">
          ${mediaHtml}
          ${mediaMenuHtml}
        </div>
      </section>` : mediaMenuHtml;
    questionEditor.innerHTML = `
      ${renderCreatorFlow(q)}
      ${renderQuestionControlStrip(q)}
      <section class="qp-editor-section qp-question-block ${String(q.title || '').trim() ? '' : 'needs-attention'}">
        <textarea class="qp-input qp-question-title" id="qTitle" maxlength="${QUESTION_TITLE_MAX}" placeholder="Start typing your question">${QuizPulse.escape(String(q.title || '').slice(0, QUESTION_TITLE_MAX))}</textarea>
        <div class="qp-formatbar" aria-hidden="true"><span>B</span><span><i>I</i></span><span><u>U</u></span><span>• List</span><span>x₂</span><span>x²</span><b>${String(q.title || '').slice(0, QUESTION_TITLE_MAX).length}/${QUESTION_TITLE_MAX}</b></div>
      </section>
      ${normalMediaBox}
      <section class="qp-editor-section qp-answer-editor-section ${warnings.some(warning => !/question text/i.test(warning)) ? 'needs-attention' : ''}">
        ${renderTypeSpecificEditor(q)}
      </section>
    `;
    syncCreatorAddLimits(questionEditor);
    attachEditorEvents();
    autoResizeAnswerTextareas(questionEditor);
  }

  function syncCreatorAddLimits(root = document) {
    const q = currentQuestion();
    const disable = (selector, value) => {
      root.querySelectorAll(selector).forEach(button => {
        button.disabled = !!value;
        button.setAttribute('aria-disabled', String(!!value));
      });
    };
    disable('[data-action="addChoice"]', ['mcq', 'multiselect', 'poll'].includes(q.type) && (q.choices || []).length >= choiceCardMax(q.type));
    disable('[data-action="addOrderItem"]', q.type === 'order' && (q.orderItems || []).length >= ORDER_ITEM_MAX);
    disable('[data-action="addMatchingPair"]', q.type === 'matching' && (q.matchingPairs || []).length >= MATCHING_PAIR_MAX);
  }

  function renderTypeSpecificEditor(q) {
    if (['mcq', 'truefalse', 'multiselect'].includes(q.type)) return renderChoiceEditor(q);
    if (q.type === 'poll') return renderPollEditor(q);
    if (q.type === 'wordcloud') return renderWordCloudEditor(q);
    if (q.type === 'order') return renderOrderEditor(q);
    if (q.type === 'type') return renderTypeAnswerEditor(q);
    if (q.type === 'map') return renderMapEditor(q);
    if (q.type === 'hotspot') return renderHotspotEditor(q);
    if (q.type === 'slider') return renderSliderEditor(q);
    if (q.type === 'matching') return renderMatchingEditor(q);
    if (q.type === 'fillblank') return renderFillBlankEditor(q);
    return '';
  }

  function renderChoiceEditor(q) {
    const shapes = ['▲', '◆', '●', '■', '⬟', '✦'];
    if (q.type === 'truefalse') {
      const trueChoice = (q.choices || []).find(c => String(c.text).toLowerCase() === 'true') || q.choices?.[0] || { id: QuizPulse.id('c'), text: 'True', correct: true };
      const falseChoice = (q.choices || []).find(c => String(c.text).toLowerCase() === 'false') || q.choices?.[1] || { id: QuizPulse.id('c'), text: 'False', correct: false };
      q.choices = [trueChoice, falseChoice];
      return `<div class="qp-tf-grid qp-answer-grid-v18">
        ${[trueChoice, falseChoice].map((choice, i) => `
        <button class="qp-tf-card ${String(choice.text).toLowerCase()} qp-answer-tile-v18" data-action="toggleCorrect" data-choice="${QuizPulse.escape(choice.id)}">
            <span class="qp-answer-shape">${i === 0 ? '✓' : '×'}</span>
            <span>${QuizPulse.escape(choice.text)}</span>
            <span class="qp-correct-box qp-correct-toggle ${choice.correct ? 'checked' : ''}"><i>${choice.correct ? '✓' : ''}</i><em>${choice.correct ? 'Correct' : 'Mark'}</em></span>
          </button>`).join('')}
      </div>`;
    }
    return `<div class="qp-answer-editor-wrap">
      <div class="qp-answer-grid qp-answer-grid-v18 ${q.type === 'mcq' ? 'qp-answer-grid-mcq' : ''}">
        ${(q.choices || []).map((choice, i) => `
          <div class="qp-answer-card qp-answer-tile-v18 qp-icon-correct-card ${choice.correct ? 'is-correct' : ''} ${QuizPulse.colors[i % QuizPulse.colors.length]}">
              <div class="qp-answer-color-rail"><button class="qp-answer-shape qp-answer-shape-toggle ${choice.correct ? 'checked' : ''}" type="button" data-action="toggleCorrect" data-choice="${QuizPulse.escape(choice.id)}" aria-pressed="${choice.correct ? 'true' : 'false'}" aria-label="${choice.correct ? `Answer ${i + 1} is correct` : `Mark answer ${i + 1} as correct`}" title="${choice.correct ? 'Correct answer' : 'Mark as correct'}">${choice.correct ? '✓' : shapes[i % shapes.length]}</button></div>
              <textarea class="qp-answer-input qp-answer-textarea" data-action="choiceText" data-choice="${QuizPulse.escape(choice.id)}" maxlength="${ANSWER_TEXT_MAX}" rows="2" wrap="soft" spellcheck="true" placeholder="Add answer ${i + 1}${i > 1 ? ' (optional)' : ''}">${QuizPulse.escape(String(choice.text || '').slice(0, ANSWER_TEXT_MAX))}</textarea>
              ${(q.choices || []).length > 2 ? `<button class="qp-answer-remove" data-action="removeChoice" data-choice="${QuizPulse.escape(choice.id)}" title="Remove answer">×</button>` : ''}
          </div>`).join('')}
      </div>
      <button class="qp-add-answer-btn" data-action="addChoice" type="button">＋ Add more answers</button>
    </div>`;
  }

  function renderOrderEditor(q) {
    return `<div class="qp-order-editor">
      <div class="qp-actions" style="justify-content:space-between"><b>Order</b><button class="qp-btn small" data-action="addOrderItem">+ Item</button></div>
      ${(q.orderItems || []).map((item, i) => `
        <div class="qp-order-row">
          <div class="qp-qnum">${i + 1}</div>
          <input class="qp-input" data-action="orderText" data-item="${QuizPulse.escape(item.id)}" value="${QuizPulse.escape(item.text)}" />
          <div class="qp-actions">
            <button class="qp-btn small" data-action="moveOrder" data-dir="up" data-index="${i}">↑</button>
            <button class="qp-btn small" data-action="moveOrder" data-dir="down" data-index="${i}">↓</button>
          </div>
        </div>`).join('')}
    </div>`;
  }

  function renderTypeAnswerEditor(q) {
    if (QuizPulse.usesNewQuestionStyle?.('type')) {
      const answers = Array.isArray(q.acceptedAnswers) && q.acceptedAnswers.length ? q.acceptedAnswers : [''];
      return `<div class="qp-type-editor qp-new-creator-answer-editor">
        <div class="qp-new-creator-editor-head"><b>Type answer</b><button class="qp-btn small" data-action="addAcceptedAnswer" type="button">+ Alternative</button></div>
        <div class="qp-new-accepted-list">${answers.map((answer, index) => `<label class="qp-new-accepted-row"><span>${index === 0 ? 'Accepted answer' : `Alternative ${index}`}</span><span class="qp-new-creator-input-row"><input class="qp-input" data-action="acceptedAnswer" data-index="${index}" value="${QuizPulse.escape(answer || '')}" placeholder="${index === 0 ? 'Correct answer' : 'Alternative answer'}" />${answers.length > 1 ? `<button class="qp-btn small danger" data-action="removeAcceptedAnswer" data-index="${index}" type="button" aria-label="Remove answer">×</button>` : ''}</span></label>`).join('')}</div>
      </div>`;
    }
    return `<div class="qp-type-editor">
      <b>Accepted</b>
      <p class="qp-muted">Comma separated</p>
      <input class="qp-input" id="acceptedAnswers" value="${QuizPulse.escape((q.acceptedAnswers || []).join(', '))}" />
    </div>`;
  }

  function renderPollEditor(q) {
    const shapes = ['▲', '◆', '●', '■', '⬟', '✦'];
    return `<div class="qp-type-editor qp-poll-editor">
      <div class="qp-section-title">Poll options <span>Click an icon to highlight an option</span></div>
      <div class="qp-answer-editor-wrap">
        <div class="qp-answer-grid qp-answer-grid-v18">
          ${(q.choices || []).map((choice, i) => `
            <div class="qp-answer-card qp-answer-tile-v18 qp-icon-correct-card ${choice.correct ? 'is-correct' : ''} ${QuizPulse.colors[i % QuizPulse.colors.length]}">
              <div class="qp-answer-color-rail"><button class="qp-answer-shape qp-answer-shape-toggle ${choice.correct ? 'checked' : ''}" type="button" data-action="toggleCorrect" data-choice="${QuizPulse.escape(choice.id)}" aria-pressed="${choice.correct ? 'true' : 'false'}" aria-label="${choice.correct ? `Poll option ${i + 1} is highlighted` : `Highlight poll option ${i + 1}`}" title="${choice.correct ? 'Highlighted option' : 'Highlight option'}">${choice.correct ? '✓' : shapes[i % shapes.length]}</button></div>
              <textarea class="qp-answer-input qp-answer-textarea" data-action="choiceText" data-choice="${QuizPulse.escape(choice.id)}" maxlength="${ANSWER_TEXT_MAX}" rows="2" wrap="soft" spellcheck="true" placeholder="Option ${i + 1}">${QuizPulse.escape(String(choice.text || '').slice(0, ANSWER_TEXT_MAX))}</textarea>
              ${(q.choices || []).length > 2 ? `<button class="qp-answer-remove" data-action="removeChoice" data-choice="${QuizPulse.escape(choice.id)}" title="Remove option">×</button>` : ''}
            </div>`).join('')}
        </div>
        <button class="qp-add-answer-btn" data-action="addChoice" type="button">＋ Add more options</button>
      </div>
    </div>`;
  }

  function renderWordCloudEditor(q) {
    const max = Number(q.wordCloud?.maxAnswers || 1);
    const boxes = Array.from({ length: max }, (_, i) => `<span class="qp-wordcloud-preview-input">${i === 0 ? 'Type a word' : `Word ${i + 1}`}</span>`).join('');
    return `<div class="qp-type-editor qp-wordcloud-editor">
      <div class="qp-section-title">Word cloud <span>Students type short answers; the most common ones grow bigger on the big screen</span></div>
      <div class="qp-wordcloud-setting" role="radiogroup" aria-label="Answers per student">
        <b>Answers per student</b>
        <div class="qp-wordcloud-choices">
          ${[1, 2, 3].map(value => `<label class="${max === value ? 'active' : ''}"><input type="radio" name="wordCloudMax" data-action="wordCloudMax" value="${value}" ${max === value ? 'checked' : ''}> ${value}</label>`).join('')}
        </div>
      </div>
      <div class="qp-wordcloud-preview" aria-hidden="true">
        <small>What a student sees</small>
        ${boxes}
        <small>Up to 25 characters each</small>
      </div>
      <ul class="qp-wordcloud-notes">
        <li>No points: a word cloud is for taking part.</li>
        <li>The big screen shows words, never names. During the game, click a word to see who wrote it or to hide it.</li>
        <li>Rude words in Arabic and English are refused before they reach the screen.</li>
      </ul>
    </div>`;
  }

  function renderMatchingEditor(q) {
    q.matchingPairs = Array.isArray(q.matchingPairs) ? q.matchingPairs : [];
    const scoring = String(q.matchingScoring || 'partial').toLowerCase() === 'exact' ? 'exact' : 'partial';
    const newStyle = QuizPulse.usesNewQuestionStyle?.('matching');
    return `<div class="qp-matching-editor qp-connect-editor${newStyle ? ' qp-new-creator-answer-editor qp-new-matching-editor' : ''}">
      <div class="qp-connect-editor-head">
        <div>
          <b>Matching / Connect Pairs</b>
          ${newStyle ? '' : '<p class="qp-muted">Students tap one card from the left and one card from the right to connect them. The right side is shuffled automatically.</p>'}
        </div>
        <button class="qp-btn small" data-action="addMatchingPair">+ Pair</button>
      </div>
      <div class="qp-connect-scoring">
        <span>Scoring</span>
        <label class="${scoring === 'partial' ? 'active' : ''}"><input type="radio" name="matchingScoring" data-action="matchingScoring" value="partial" ${scoring === 'partial' ? 'checked' : ''}> Partial points</label>
        <label class="${scoring === 'exact' ? 'active' : ''}"><input type="radio" name="matchingScoring" data-action="matchingScoring" value="exact" ${scoring === 'exact' ? 'checked' : ''}> All-or-nothing</label>
      </div>
      <div class="qp-connect-table" role="table" aria-label="Matching pairs editor">
        <div class="qp-connect-table-head" role="row"><span>#</span><span>Left card / Term</span><span></span><span>Right card / Correct match</span><span></span></div>
        ${(q.matchingPairs || []).map((pair, i) => `
          <div class="qp-match-row qp-connect-editor-row" role="row">
            <div class="qp-qnum">${i + 1}</div>
            <input class="qp-input" data-action="matchingLeft" data-pair="${QuizPulse.escape(pair.id)}" value="${QuizPulse.escape(pair.left || '')}" placeholder="Left item" />
            <span class="qp-match-arrow">→</span>
            <input class="qp-input" data-action="matchingRight" data-pair="${QuizPulse.escape(pair.id)}" value="${QuizPulse.escape(pair.right || '')}" placeholder="Right match" />
            <button class="qp-btn small danger" data-action="removeMatchingPair" data-pair="${QuizPulse.escape(pair.id)}" ${(q.matchingPairs || []).length <= 2 ? 'disabled' : ''}>×</button>
          </div>`).join('')}
      </div>
      ${newStyle ? '' : '<div class="qp-connect-preview-note">Student view: left cards stay fixed; right cards are shuffled and connected by tapping.</div>'}
    </div>`;
  }

  function renderFillBlankEditor(q) {
    const newStyle = QuizPulse.usesNewQuestionStyle?.('fillblank');
    return `<div class="qp-fillblank-editor${newStyle ? ' qp-new-creator-answer-editor qp-new-fillblank-editor' : ''}">
      <div class="qp-actions" style="justify-content:space-between"><b>Fill in the blank</b><button class="qp-btn small" data-action="addFillBlank">+ Blank</button></div>
      ${newStyle ? '' : '<p class="qp-muted">Use ____ in the question text, then add accepted answer(s) for each blank. Separate alternatives with commas.</p>'}
      ${(q.fillBlanks || []).map((blank, i) => `
        <div class="qp-fillblank-row">
          <div class="qp-qnum">${i + 1}</div>
          <input class="qp-input" data-action="fillBlankLabel" data-blank="${QuizPulse.escape(blank.id)}" value="${QuizPulse.escape(blank.label || `Blank ${i + 1}`)}" placeholder="Blank label" />
          <input class="qp-input" data-action="fillBlankAnswers" data-blank="${QuizPulse.escape(blank.id)}" value="${QuizPulse.escape((blank.answers || []).join(', '))}" placeholder="Accepted answer(s)" />
          <button class="qp-btn small danger" data-action="removeFillBlank" data-blank="${QuizPulse.escape(blank.id)}" ${(q.fillBlanks || []).length <= 1 ? 'disabled' : ''}>×</button>
        </div>`).join('')}
    </div>`;
  }

  function renderSliderEditor(q) {
    const s = q.slider || { min: 0, max: 20, correct: 10, fullTolerance: 0, halfTolerance: 4, step: 1, labelLeft: 'Low', labelRight: 'High', size: 'medium' };
    const min = Number(s.min ?? 0);
    const max = Number(s.max ?? 20);
    const low = Math.min(min, max);
    const high = Math.max(min, max);
    const step = Math.max(0.01, Number(s.step || 1));
    const correct = Math.min(high, Math.max(low, Number(s.correct ?? 10)));
    return `<div class="qp-slider-editor">
      <b>Slider</b>
      <p class="qp-muted"></p>
      <div class="qp-slider-visual ${QuizPulse.escape(s.size || 'medium')}">
        <div class="qp-slider-center-value" id="sliderPreviewValue">${correct}</div>
        <input class="qp-slider-preview" id="sliderCorrectRange" type="range" min="${low}" max="${high}" step="${step}" value="${correct}">
        <div class="qp-slider-sides"><span>${QuizPulse.escape(s.labelLeft || 'Low')}</span><span>${QuizPulse.escape(s.labelRight || 'High')}</span></div>
      </div>
      <div class="qp-grid qp-slider-settings-grid">
        <label>Min <input class="qp-input" type="number" data-slider="min" value="${min}"></label>
        <label>Max <input class="qp-input" type="number" data-slider="max" value="${max}"></label>
        <label>Correct <input class="qp-input" type="number" data-slider="correct" id="sliderCorrectInput" min="${low}" max="${high}" step="${step}" value="${correct}"></label>
        <label>Step <input class="qp-input" type="number" data-slider="step" value="${step}"></label>
        <label>Full ± <input class="qp-input" type="number" data-slider="fullTolerance" value="${Number(s.fullTolerance || 0)}"></label>
        <label>Partial ± <input class="qp-input" type="number" data-slider="halfTolerance" value="${Number(s.halfTolerance || 0)}"></label>
        <label>Left <input class="qp-input" data-slider="labelLeft" value="${QuizPulse.escape(s.labelLeft || 'Low')}"></label>
        <label>Right <input class="qp-input" data-slider="labelRight" value="${QuizPulse.escape(s.labelRight || 'High')}"></label>
        <label class="qp-slider-size-field">Size <select class="qp-select" data-slider="size">
          ${['small','medium','large'].map(v => `<option value="${v}" ${(s.size || 'medium') === v ? 'selected' : ''}>${v[0].toUpperCase() + v.slice(1)}</option>`).join('')}
        </select></label>
      </div>
    </div>`;
  }

  function renderMapEditor(q) {
    const hasMapImage = q.media && q.media.type && q.media.type.startsWith('image/');
    const mediaUrl = hasMapImage ? QuizPulse.safeMediaUrl(q.media.dataUrl, 'image/') : '';
    const media = mediaUrl ? `<img class="qp-media-preview" src="${QuizPulse.escape(mediaUrl)}" alt="Map question image">` : '<div class="qp-muted">Upload image.</div>';
    const target = q.mapAnswer && hasMapImage ? `<div class="qp-map-target" style="left:${q.mapAnswer.x}%; top:${q.mapAnswer.y}%"></div>` : '';
    return `<div class="qp-map-editor">
      <b>Map answer</b>
      <p class="qp-muted">This question uses one image only: the map image below. The normal Add picture/audio/video area is disabled for map Q.</p>
      <div class="qp-map-toolbar">
        <button class="qp-btn primary" id="uploadMapImage">${hasMapImage ? 'Replace' : '+ Image'}</button>
        <button class="qp-btn" id="removeMapImage" ${hasMapImage ? '' : 'disabled'}>Remove</button>
      </div>
      <div class="qp-map-canvas" id="mapCanvas">${media}${target}</div>
      <label class="qp-label">Radius</label>
      <input class="qp-input" type="number" id="mapRadius" value="${q.mapAnswer?.radius || 8}" />
    </div>`;
  }

  function renderHotspotEditor(q) {
    const hasImage = q.media && q.media.type && q.media.type.startsWith('image/');
    const mediaUrl = hasImage ? QuizPulse.safeMediaUrl(q.media.dataUrl, 'image/') : '';
    const area = normalizeHotspotArea(q.hotspotAnswer || {});
    const zone = hasImage && q.hotspotAnswer ? `<div class="qp-hotspot-editor-zone" style="left:${area.x}%;top:${area.y}%;width:${area.w}%;height:${area.h}%;"></div>` : '';
    const surface = mediaUrl
      ? QuizPulse.renderHotspotSurface(q.media, zone, 'hotspotImageSurface')
      : '<div class="qp-hotspot-empty"><b>No image uploaded</b><span>Click the empty box or Upload image, then draw the correct area directly on the picture.</span></div>';
    return `<div class="qp-hotspot-editor">
      <input type="file" id="hotspotImageInput" class="qp-hidden-file" accept="image/*" />
      <div class="qp-actions" style="justify-content:space-between;align-items:flex-start;gap:14px">
        <div><b>Pin on Image</b><p class="qp-muted">1) Upload a picture. 2) Drag on the picture to draw the correct area. 3) Students drop one pin.</p></div>
        <div class="qp-actions">
          <button class="qp-btn primary" id="uploadHotspotImage" type="button">${hasImage ? 'Replace image' : 'Upload image'}</button>
          <button class="qp-btn soft-primary" id="browseHotspotImage" type="button">Browse</button>
          <button class="qp-btn" id="removeHotspotImage" type="button" ${hasImage ? '' : 'disabled'}>Remove</button>
        </div>
      </div>
      <div class="qp-hotspot-canvas" id="hotspotCanvas">${surface}</div>
      <div class="qp-hotspot-info">
        <span>${hasImage ? `Correct area: ${area.w}% × ${area.h}%` : 'Upload an image before drawing the correct area.'}</span>
        <button class="qp-btn small" type="button" id="resetHotspotArea" ${hasImage ? '' : 'disabled'}>Reset area</button>
      </div>
    </div>`;
  }

  // The three extra ways into a room, as the quiz's starting position (settings.joinOptions). The host setup page opens
  // with them on and applies them through the room's own PIN and link handlers, as if the teacher had switched them.
  function quizJoinOptions() {
    const saved = state.quiz.settings?.joinOptions || {};
    return { pin: saved.pin === true, staticQr: saved.staticQr === true, link: saved.link === true || saved.staticQr === true };
  }

  function quizJoinOptionsHtml() {
    const options = quizJoinOptions();
    const row = (key, title) => `<label class="qp-check-row"><input type="checkbox" data-quiz-join-option="${key}" ${options[key] ? 'checked' : ''}> <span>${title}</span></label>`;
    return `<div class="qp-quiz-join-options" data-quiz-join-options>
              ${row('pin', 'Room PIN')}
              ${row('staticQr', 'QR that stays the same')}
              ${row('link', 'Link to share')}
            </div>`;
  }

  function bindQuizJoinOptions(root = document) {
    root.querySelectorAll('[data-quiz-join-option]').forEach(input => input.addEventListener('change', () => {
      const next = { ...quizJoinOptions(), [input.dataset.quizJoinOption]: input.checked };
      // A QR that stays the same is the shared link drawn as a code, so it needs the link and takes it with it.
      if (input.dataset.quizJoinOption === 'staticQr' && input.checked) next.link = true;
      if (input.dataset.quizJoinOption === 'link' && !input.checked) next.staticQr = false;
      state.quiz.settings = state.quiz.settings || {};
      state.quiz.settings.joinOptions = next;
      root.querySelectorAll('[data-quiz-join-option]').forEach(box => { box.checked = next[box.dataset.quizJoinOption] === true; });
      markDirty();
    }));
  }

  function renderAdvancedPanel() {
    const q = currentQuestion();
    state.rightTab = 'advanced';
    if (rightPanelTitle) rightPanelTitle.textContent = 'More';
    if (rightPanelSubtitle) rightPanelSubtitle.textContent = '';
    const settings = state.quiz.settings = state.quiz.settings || {};
    settings.theme = { backgroundPreset: 'neo', ...(settings.theme || {}) };
    const currentPreset = settings.theme.backgroundPreset || 'neo';
    const hasCustomBg = !!settings.theme.backgroundImage;
    // Offline, only what the file carries: backgrounds, pictures, room settings, notes and concepts are set on campus.
    advancedPanel.innerHTML = OFFLINE ? `
        <section class="qp-prop-card">
          <label class="qp-prop-label">Helper</label>
          <div style="padding: 0 14px 14px">
            <div class="qp-actions" style="gap:8px; flex-wrap:wrap">
              <button class="qp-btn" id="checkBtn">Check quiz</button>
            </div>
            <label class="qp-label" style="margin-top:12px">Explanation</label>
            <textarea class="qp-textarea" id="answerExplanation" rows="3" placeholder="Optional...">${QuizPulse.escape(q.explanation || '')}</textarea>
          </div>
        </section>` : `
        <section class="qp-prop-card qp-theme-gallery-card">
          <label class="qp-prop-label">Quiz background</label>
          <div class="qp-bg-mini-preview" style="--qp-mini-bg:${QuizPulse.quizBackgroundCss(settings)}">
            <span>${QuizPulse.escape(QuizPulse.quizBackgroundLabel(settings))}</span>
          </div>
          <div class="qp-bg-preset-grid qp-theme-gallery-grid">
            ${QuizPulse.quizBackgroundPresets.map(preset => `
              <button class="qp-bg-preset ${currentPreset === preset.id && !hasCustomBg ? 'active' : ''}" data-bg-preset="${preset.id}" type="button" style="--preset-bg:${preset.css}">
                <span>${QuizPulse.escape(preset.label)}</span>
              </button>`).join('')}
          </div>
          <div class="qp-bg-actions">
            <button class="qp-btn primary" id="uploadBackgroundBtn" type="button">+ Background</button>
            <button class="qp-btn" id="removeBackgroundBtn" type="button" ${hasCustomBg ? '' : 'disabled'}>Remove</button>
          </div>
        </section>

        <section class="qp-prop-card qp-prop-primary">
          <label class="qp-prop-label">Media</label>
          <p class="qp-prop-help"></p>
          <div style="padding: 0 14px 14px">
            <button class="qp-btn" id="removeMediaBtn" ${q.media ? '' : 'disabled'}>Remove</button>
          </div>
        </section>

        <section class="qp-prop-card">
          <label class="qp-prop-label">Live</label>
          <div style="padding: 0 14px 14px">
            <label class="qp-check-row"><input type="checkbox" id="showQuestionOnStudent" ${state.quiz.settings?.showQuestionOnStudent !== false ? 'checked' : ''}> <span>Show question</span></label>
            <p class="qp-prop-help" style="margin:10px 0 12px"></p>
            <span class="qp-pill">Simple scoring is always on</span>
            <p class="qp-prop-help" style="margin:10px 0 0"></p>
          </div>
        </section>

        <section class="qp-prop-card qp-join-defaults-card" aria-labelledby="quizJoinDefaultsTitle">
          <label class="qp-prop-label" id="quizJoinDefaultsTitle">Ways in</label>
          <div style="padding: 0 14px 14px">
            <p class="qp-prop-help" style="margin:0 0 10px">Every room of this quiz opens with these on. You can still change them on the setup page.</p>
            ${quizJoinOptionsHtml()}
            <p class="qp-prop-help" style="margin:10px 0 0">A PIN is six digits, new for each room. Whichever way students use, the room's access settings still decide who may play.</p>
          </div>
        </section>

        <section class="qp-prop-card qp-question-bg-card">
          <label class="qp-prop-label">Background</label>
          <div style="padding: 0 14px 14px">
            <label class="qp-check-row"><input type="checkbox" id="questionBackgroundEnabled" ${q.backgroundImage ? 'checked' : ''}> <span>Custom background</span></label>
            <div class="qp-bg-mini-preview ${q.backgroundImage ? '' : 'is-empty'}" style="--qp-mini-bg:${q.backgroundImage ? QuizPulse.quizBackgroundCss({ theme: { backgroundImage: q.backgroundImage } }) : QuizPulse.quizBackgroundCss(state.quiz.settings || {})}">
              <span>${q.backgroundImage ? QuizPulse.escape(q.backgroundImage.name || 'Question picture') : 'Quiz background'}</span>
            </div>
            <div class="qp-bg-actions">
              <button class="qp-btn primary" id="uploadQuestionBackgroundBtn" type="button" ${q.backgroundImage ? '' : 'disabled'}>${q.backgroundImage ? 'Replace' : '+ Image'}</button>
              <button class="qp-btn" id="removeQuestionBackgroundBtn" type="button" ${q.backgroundImage ? '' : 'disabled'}>Remove</button>
            </div>
            <p class="qp-prop-help"></p>
          </div>
        </section>

        <section class="qp-prop-card qp-visibility-settings-card">
          ${quizVisibilityPickerHtml()}
        </section>

        <section class="qp-prop-card">
          <label class="qp-prop-label">Helper</label>
          <div style="padding: 0 14px 14px">
            <p class="qp-prop-help" style="margin:0 0 12px"></p>
            <div class="qp-actions" style="gap:8px; flex-wrap:wrap">
              <button class="qp-btn" id="checkBtn">Check quiz</button>
            </div>
            <label class="qp-label" style="margin-top:12px">Explanation</label>
            <textarea class="qp-textarea" id="answerExplanation" rows="3" placeholder="Optional...">${QuizPulse.escape(q.explanation || '')}</textarea>
            <label class="qp-label" for="learningConcept">Learning concept</label>
            <input class="qp-input" id="learningConcept" maxlength="100" placeholder="e.g. Cell division" value="${QuizPulse.escape(q.learningConcept || '')}">
            <small>Groups questions in Mastery Practice. Optional.</small>
            <label class="qp-label">Note</label>
            <textarea class="qp-textarea" id="teacherNote" rows="4" placeholder="Private...">${QuizPulse.escape(q.teacherNote || '')}</textarea>
            <div class="qp-shortcuts"><b>Shortcuts:</b><br>Ctrl+S save · Ctrl+D duplicate · Ctrl+Enter add MCQ · Delete remove selected question</div>
          </div>
        </section>`;
    attachAdvancedEvents();
    updateRightPanelScrollHeight();
    installRightPanelScrollWheel();
    syncRightPanelScrollThumb();
  }

  async function setHotspotImageFromFile(file) {
    if (!file) return;
    if (!String(file.type || '').startsWith('image/')) {
      QuizPulse.toast('Pin on Image only accepts pictures.');
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      QuizPulse.toast('Please choose an image smaller than 8 MB.');
      return;
    }
    const q = currentQuestion();
    q.type = 'hotspot';
    q.media = await QuizPulse.fileToDataUrl(file);
    q.hotspotAnswer = normalizeHotspotArea(q.hotspotAnswer || { shape: 'rect', x: 35, y: 35, w: 30, h: 30 });
    markDirty();
    render();
    QuizPulse.toast('Image uploaded. Now drag on the picture to draw the correct area.');
  }

  function openHotspotImagePicker() {
    mediaTargetMode = 'hotspotimage';
    if (mediaFile) {
      mediaFile.accept = 'image/*';
      mediaFile.value = '';
      mediaFile.click();
    }
  }

  function setCurrentQuestionType(type, options = {}) {
    state.rightTab = 'advanced';
    state.controlMenu = '';
    const wanted = String(type || '').trim();
    if (!(QuizPulse.questionTypes || []).some(t => t.id === wanted)) return;
    if (QuizPulse.planAllowsQuestionType?.(wanted) === false) {
      QuizPulse.showUpgradePrompt?.({ questionType: wanted });
      return;
    }
    const q = currentQuestion();
    const previous = q.type;
    applyTypeDefaults(q, wanted);
    markDirty();
    render();
    if (wanted === 'hotspot' && previous !== 'hotspot' && !options.silent) {
      QuizPulse.toast('Pin on Image selected. Use Upload image in the Answers area.');
      setTimeout(() => {
        const uploadBtn = document.getElementById('uploadHotspotImage');
        uploadBtn?.classList.add('qp-attention-pulse');
        uploadBtn?.focus();
        uploadBtn?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        setTimeout(() => uploadBtn?.classList.remove('qp-attention-pulse'), 2600);
      }, 60);
    }
  }

  function autoResizeAnswerTextareas(root = document) {
    const resizeOne = (el) => {
      if (!el) return;
      el.style.height = 'auto';
      const minHeight = 74;
      const maxHeight = 168;
      const nextHeight = Math.max(minHeight, Math.min(el.scrollHeight, maxHeight));
      el.style.height = `${nextHeight}px`;
      el.style.overflowY = el.scrollHeight > maxHeight ? 'auto' : 'hidden';
      el.closest('.qp-answer-card')?.classList.toggle('has-long-text', el.scrollHeight > minHeight + 8);
    };
    root.querySelectorAll('.qp-answer-textarea').forEach((el) => {
      resizeOne(el);
      requestAnimationFrame(() => resizeOne(el));
    });
  }

  function syncSliderRangeControls(q = currentQuestion()) {
    const slider = q.slider || {};
    const min = Number.isFinite(Number(slider.min)) ? Number(slider.min) : 0;
    const max = Number.isFinite(Number(slider.max)) ? Number(slider.max) : 20;
    const low = Math.min(min, max);
    const high = Math.max(min, max);
    const step = Math.max(0.01, Number(slider.step || 1));
    const fallback = Math.round((low + high) / 2);
    const correct = Math.min(high, Math.max(low, Number.isFinite(Number(slider.correct)) ? Number(slider.correct) : fallback));
    q.slider = { ...slider, correct, step };

    const previewRange = document.getElementById('sliderCorrectRange');
    const correctInput = document.getElementById('sliderCorrectInput');
    const previewValue = document.getElementById('sliderPreviewValue');
    if (previewRange) {
      previewRange.min = String(low);
      previewRange.max = String(high);
      previewRange.step = String(step);
      previewRange.value = String(correct);
    }
    if (correctInput) {
      correctInput.min = String(low);
      correctInput.max = String(high);
      correctInput.step = String(step);
      correctInput.value = String(correct);
    }
    if (previewValue) previewValue.textContent = correct;
  }

  function attachEditorEvents() {
    document.getElementById('qTitle').addEventListener('input', e => {
      const value = String(e.target.value || '').slice(0, QUESTION_TITLE_MAX);
      if (e.target.value !== value) e.target.value = value;
      currentQuestion().title = value;
      const counter = document.querySelector('.qp-formatbar b');
      if (counter) counter.textContent = `${value.length}/${QUESTION_TITLE_MAX}`;
      markDirty();
      renderQuestionList();
    });
    questionEditor.querySelectorAll('[data-creator-control]').forEach(button => button.addEventListener('click', event => {
      const control = event.currentTarget.dataset.creatorControl;
      if (control === 'validate') return validateQuiz(true);
      if (['type', 'time', 'points'].includes(control)) {
        state.controlMenu = state.controlMenu === control ? '' : control;
        renderQuestionEditor();
        return;
      }
      if (control === 'double') {
        currentQuestion().doublePoints = !currentQuestion().doublePoints;
        markDirty();
        renderQuestionEditor();
        renderQuestionList();
        return;
      }
      if (control === 'media') {
        const q = currentQuestion();
        if (q.type === 'hotspot') return document.getElementById('uploadHotspotImage')?.click();
        if (q.type === 'map') return document.getElementById('uploadMapImage')?.click();
      }
      if (control === 'more') {
        state.controlMenu = '';
        openCreatorSettingsDrawer();
      }
    }));
    questionEditor.querySelectorAll('[data-set-question-type]').forEach(button => button.addEventListener('click', event => {
      state.controlMenu = '';
      setCurrentQuestionType(event.currentTarget.dataset.setQuestionType);
    }));
    questionEditor.querySelectorAll('[data-plan-locked-type]').forEach(button => button.addEventListener('click', event => {
      QuizPulse.showUpgradePrompt?.({ questionType: event.currentTarget.dataset.planLockedType });
    }));
    questionEditor.querySelectorAll('[data-set-time]').forEach(button => button.addEventListener('click', event => {
      currentQuestion().timeLimit = normalizeQuestionTime(event.currentTarget.dataset.setTime);
      markDirty();
      renderQuestionEditor();
      renderQuestionList();
    }));
    const customMinutesInput = document.getElementById('creatorCustomMinutes');
    const customSecondsInput = document.getElementById('creatorCustomSeconds');
    const customTimePreview = document.getElementById('creatorCustomTimePreview');
    const readCustomTime = () => {
      const minutes = Math.max(0, Math.min(59, Math.floor(Number(customMinutesInput?.value || 0))));
      const seconds = Math.max(0, Math.min(59, Math.floor(Number(customSecondsInput?.value || 0))));
      return normalizeQuestionTime((minutes * 60) + seconds);
    };
    const previewCustomTime = () => {
      if (customTimePreview) customTimePreview.textContent = questionTimeLabel(readCustomTime());
    };
    const applyCustomTime = () => {
      currentQuestion().timeLimit = readCustomTime();
      markDirty();
      renderQuestionEditor();
      renderQuestionList();
    };
    customMinutesInput?.addEventListener('input', previewCustomTime);
    customSecondsInput?.addEventListener('input', previewCustomTime);
    [customMinutesInput, customSecondsInput].forEach(input => input?.addEventListener('keydown', event => {
      if (event.key === 'Enter') { event.preventDefault(); applyCustomTime(); }
    }));
    document.querySelector('[data-apply-custom-time]')?.addEventListener('click', applyCustomTime);
    questionEditor.querySelectorAll('[data-set-points]').forEach(button => button.addEventListener('click', event => {
      currentQuestion().points = Math.max(0, Number(event.currentTarget.dataset.setPoints || 0));
      markDirty();
      renderQuestionEditor();
      renderQuestionList();
    }));
    questionEditor.querySelectorAll('[data-apply-control]').forEach(button => button.addEventListener('click', event => {
      const control = event.currentTarget.dataset.applyControl;
      const value = control === 'time' ? normalizeQuestionTime(currentQuestion().timeLimit) : Math.max(0, Number(currentQuestion().points || 0));
      // A word cloud keeps no points whatever the rest of the quiz is given.
      state.quiz.Q.forEach(question => {
        if (control !== 'time' && question.type === 'wordcloud') return;
        question[control === 'time' ? 'timeLimit' : 'points'] = value;
      });
      markDirty();
      renderQuestionEditor();
      renderQuestionList();
      QuizPulse.toast(`${control === 'time' ? questionTimeLabel(value) : `${value} points`} applied to all questions.`);
    }));
    const customPointsInput = document.getElementById('creatorCustomPoints');
    const applyCustomPoints = () => {
      if (!customPointsInput) return;
      const value = Math.max(0, Math.min(100000, Number(customPointsInput.value || 0)));
      currentQuestion().points = value;
      markDirty();
      renderQuestionEditor();
      renderQuestionList();
    };
    document.querySelector('[data-apply-custom-points]')?.addEventListener('click', applyCustomPoints);
    customPointsInput?.addEventListener('keydown', event => {
      if (event.key === 'Enter') { event.preventDefault(); applyCustomPoints(); }
    });
    document.querySelector('.addMediaBtn')?.addEventListener('click', e => {
      e.stopPropagation();
      quizpulseOpenMenu(document.getElementById('mediaMenu'), e.currentTarget);
    });
    document.getElementById('mediaMenu')?.addEventListener('click', e => {
      const btn = e.target.closest('[data-media]');
      if (!btn) return;
      const type = btn.dataset.media;
      if (type === 'remove') { currentQuestion().media = null; markDirty(); render(); return; }
      mediaTargetMode = type;
      mediaFile.accept = type === 'image' ? 'image/*' : type === 'audio' ? 'audio/*' : 'video/*';
      mediaFile.click();
    });
    questionEditor.querySelectorAll('[data-action="toggleCorrect"]').forEach(btn => btn.addEventListener('click', e => {
      const q = currentQuestion();
      const id = e.currentTarget.dataset.choice;
      if (q.type !== 'multiselect') q.choices.forEach(c => c.correct = c.id === id);
      else q.choices.forEach(c => { if (c.id === id) c.correct = !c.correct; });
      markDirty(); renderQuestionEditor(); renderQuestionList();
    }));
    questionEditor.querySelectorAll('[data-action="choiceText"]').forEach(input => input.addEventListener('input', e => {
      const choice = currentQuestion().choices.find(c => c.id === e.target.dataset.choice);
      const value = String(e.target.value || '').slice(0, ANSWER_TEXT_MAX);
      if (e.target.value !== value) e.target.value = value;
      if (choice) choice.text = value;
      autoResizeAnswerTextareas(questionEditor);
      markDirty(); renderQuestionList();
    }));
    questionEditor.querySelectorAll('[data-action="addChoice"]').forEach(btn => btn.addEventListener('click', () => {
      const q = currentQuestion();
      q.choices = Array.isArray(q.choices) ? q.choices : [];
      if (q.choices.length >= choiceCardMax(q.type)) return;
      const number = q.choices.length + 1;
      q.choices.push({ id: QuizPulse.id('c'), text: q.type === 'poll' ? `Option ${number}` : `Answer ${number}`, correct: false });
      markDirty(); renderQuestionEditor(); renderQuestionList();
    }));
    questionEditor.querySelectorAll('[data-action="removeChoice"]').forEach(btn => btn.addEventListener('click', e => {
      const q = currentQuestion();
      if (!Array.isArray(q.choices) || q.choices.length <= 2) return;
      const removedId = e.currentTarget.dataset.choice;
      const wasCorrect = q.choices.find(c => c.id === removedId)?.correct;
      q.choices = q.choices.filter(c => c.id !== removedId);
      if (wasCorrect && q.type !== 'poll' && q.choices[0] && !q.choices.some(c => c.correct)) q.choices[0].correct = true;
      markDirty(); renderQuestionEditor(); renderQuestionList();
    }));
    questionEditor.querySelectorAll('[data-action="matchingLeft"], [data-action="matchingRight"]').forEach(input => input.addEventListener('input', e => {
      const pair = (currentQuestion().matchingPairs || []).find(p => p.id === e.target.dataset.pair);
      if (pair) pair[e.target.dataset.action === 'matchingLeft' ? 'left' : 'right'] = e.target.value;
      markDirty(); renderQuestionList();
    }));
    questionEditor.querySelectorAll('[data-action="wordCloudMax"]').forEach(input => input.addEventListener('change', e => {
      const value = Math.min(3, Math.max(1, Math.round(Number(e.target.value) || 1)));
      currentQuestion().wordCloud = { maxAnswers: value };
      markDirty(); renderQuestionEditor(); renderQuestionList();
    }));
    questionEditor.querySelectorAll('[data-action="matchingScoring"]').forEach(input => input.addEventListener('change', e => {
      currentQuestion().matchingScoring = e.target.value === 'exact' ? 'exact' : 'partial';
      markDirty(); renderQuestionEditor(); renderQuestionList();
    }));
    questionEditor.querySelectorAll('[data-action="addMatchingPair"]').forEach(btn => btn.addEventListener('click', () => {
      currentQuestion().matchingPairs = currentQuestion().matchingPairs || [];
      if (currentQuestion().matchingPairs.length >= MATCHING_PAIR_MAX) return;
      currentQuestion().matchingPairs.push({ id: QuizPulse.id('pair'), rightId: QuizPulse.id('right'), left: 'New term', right: 'New match' });
      markDirty(); renderQuestionEditor(); renderQuestionList();
    }));
    questionEditor.querySelectorAll('[data-action="removeMatchingPair"]').forEach(btn => btn.addEventListener('click', e => {
      const q = currentQuestion();
      if ((q.matchingPairs || []).length <= 2) return;
      q.matchingPairs = q.matchingPairs.filter(pair => pair.id !== e.currentTarget.dataset.pair);
      markDirty(); renderQuestionEditor(); renderQuestionList();
    }));
    questionEditor.querySelectorAll('[data-action="fillBlankLabel"], [data-action="fillBlankAnswers"]').forEach(input => input.addEventListener('input', e => {
      const blank = (currentQuestion().fillBlanks || []).find(b => b.id === e.target.dataset.blank);
      if (blank && e.target.dataset.action === 'fillBlankLabel') blank.label = e.target.value;
      if (blank && e.target.dataset.action === 'fillBlankAnswers') blank.answers = e.target.value.split(',').map(x => x.trim()).filter(Boolean);
      markDirty(); renderQuestionList();
    }));
    questionEditor.querySelectorAll('[data-action="addFillBlank"]').forEach(btn => btn.addEventListener('click', () => {
      currentQuestion().fillBlanks = currentQuestion().fillBlanks || [];
      currentQuestion().fillBlanks.push({ id: QuizPulse.id('blank'), label: `Blank ${currentQuestion().fillBlanks.length + 1}`, answers: ['answer'] });
      markDirty(); renderQuestionEditor(); renderQuestionList();
    }));
    questionEditor.querySelectorAll('[data-action="removeFillBlank"]').forEach(btn => btn.addEventListener('click', e => {
      const q = currentQuestion();
      if ((q.fillBlanks || []).length <= 1) return;
      q.fillBlanks = q.fillBlanks.filter(blank => blank.id !== e.currentTarget.dataset.blank);
      markDirty(); renderQuestionEditor(); renderQuestionList();
    }));
    const accepted = document.getElementById('acceptedAnswers');
    if (accepted) accepted.addEventListener('input', e => { currentQuestion().acceptedAnswers = e.target.value.split(',').map(x => x.trim()); markDirty(); });
    questionEditor.querySelectorAll('[data-action="acceptedAnswer"]').forEach(input => input.addEventListener('input', e => {
      const answers = currentQuestion().acceptedAnswers = Array.isArray(currentQuestion().acceptedAnswers) ? currentQuestion().acceptedAnswers : [''];
      answers[Number(e.target.dataset.index)] = e.target.value;
      markDirty(); renderQuestionList();
    }));
    questionEditor.querySelectorAll('[data-action="addAcceptedAnswer"]').forEach(button => button.addEventListener('click', () => {
      const answers = currentQuestion().acceptedAnswers = Array.isArray(currentQuestion().acceptedAnswers) ? currentQuestion().acceptedAnswers : [''];
      answers.push('');
      markDirty(); renderQuestionEditor(); renderQuestionList();
    }));
    questionEditor.querySelectorAll('[data-action="removeAcceptedAnswer"]').forEach(button => button.addEventListener('click', e => {
      const answers = currentQuestion().acceptedAnswers = Array.isArray(currentQuestion().acceptedAnswers) ? currentQuestion().acceptedAnswers : [''];
      if (answers.length <= 1) return;
      answers.splice(Number(e.currentTarget.dataset.index), 1);
      markDirty(); renderQuestionEditor(); renderQuestionList();
    }));
    const handleSliderSetting = e => {
      const q = currentQuestion();
      q.slider = q.slider || {};
      const key = e.target.dataset.slider;
      q.slider[key] = ['labelLeft', 'labelRight', 'size'].includes(key) ? e.target.value : Number(e.target.value);
      syncSliderRangeControls(q);
      markDirty();
    };
    questionEditor.querySelectorAll('[data-slider]').forEach(input => {
      input.addEventListener('input', handleSliderSetting);
      input.addEventListener('change', handleSliderSetting);
    });
    const sliderRange = document.getElementById('sliderCorrectRange');
    if (sliderRange) sliderRange.addEventListener('input', e => {
      const q = currentQuestion();
      q.slider = q.slider || {};
      q.slider.correct = Number(e.target.value);
      document.getElementById('sliderCorrectInput').value = e.target.value;
      document.getElementById('sliderPreviewValue').textContent = e.target.value;
      markDirty();
    });
    questionEditor.querySelectorAll('[data-action="orderText"]').forEach(input => input.addEventListener('input', e => {
      const item = currentQuestion().orderItems.find(i => i.id === e.target.dataset.item);
      if (item) item.text = e.target.value;
      markDirty(); renderQuestionList();
    }));
    questionEditor.querySelectorAll('[data-action="addOrderItem"]').forEach(btn => btn.addEventListener('click', () => {
      const q = currentQuestion();
      q.orderItems = Array.isArray(q.orderItems) ? q.orderItems : [];
      if (q.orderItems.length >= ORDER_ITEM_MAX) return;
      q.orderItems.push({ id: QuizPulse.id('item'), text: 'New item' });
      markDirty();
      renderQuestionEditor();
    }));
    questionEditor.querySelectorAll('[data-action="moveOrder"]').forEach(btn => btn.addEventListener('click', e => {
      const arr = currentQuestion().orderItems; const i = Number(e.currentTarget.dataset.index); const dir = e.currentTarget.dataset.dir === 'up' ? -1 : 1; const j = i + dir;
      if (j < 0 || j >= arr.length) return;
      [arr[i], arr[j]] = [arr[j], arr[i]]; markDirty(); renderQuestionEditor();
    }));
    document.getElementById('uploadMapImage')?.addEventListener('click', () => {
      mediaTargetMode = 'mapimage';
      mediaFile.accept = 'image/*';
      mediaFile.click();
    });
    document.getElementById('removeMapImage')?.addEventListener('click', () => {
      currentQuestion().media = null;
      markDirty();
      render();
    });
    const mapCanvas = document.getElementById('mapCanvas');
    if (mapCanvas) mapCanvas.addEventListener('click', e => {
      const rect = mapCanvas.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * 100;
      const y = ((e.clientY - rect.top) / rect.height) * 100;
      currentQuestion().mapAnswer = { ...(currentQuestion().mapAnswer || {}), x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10, radius: Number(document.getElementById('mapRadius')?.value || 8) };
      markDirty(); renderQuestionEditor();
    });
    const mapRadius = document.getElementById('mapRadius');
    if (mapRadius) mapRadius.addEventListener('input', e => { currentQuestion().mapAnswer = { ...(currentQuestion().mapAnswer || { x: 50, y: 50 }), radius: Number(e.target.value) }; markDirty(); });
    document.getElementById('uploadHotspotImage')?.addEventListener('click', openHotspotImagePicker);
    document.getElementById('browseHotspotImage')?.addEventListener('click', openHotspotImagePicker);
    document.getElementById('hotspotImageInput')?.addEventListener('change', async e => {
      const file = e.target.files && e.target.files[0];
      await setHotspotImageFromFile(file);
      e.target.value = '';
    });
    document.getElementById('removeHotspotImage')?.addEventListener('click', () => {
      currentQuestion().media = null;
      markDirty();
      render();
    });
    document.getElementById('resetHotspotArea')?.addEventListener('click', () => {
      currentQuestion().hotspotAnswer = { shape: 'rect', x: 35, y: 35, w: 30, h: 30 };
      markDirty();
      renderQuestionEditor();
    });
    const hotspotCanvas = document.getElementById('hotspotCanvas');
    if (hotspotCanvas) {
      hotspotCanvas.addEventListener('click', event => {
        if (currentQuestion().media) return;
        event.preventDefault();
        openHotspotImagePicker();
      });
      hotspotCanvas.addEventListener('dragover', event => {
        event.preventDefault();
        hotspotCanvas.classList.add('drag-over');
      });
      hotspotCanvas.addEventListener('dragleave', () => hotspotCanvas.classList.remove('drag-over'));
      hotspotCanvas.addEventListener('drop', async event => {
        event.preventDefault();
        hotspotCanvas.classList.remove('drag-over');
        const file = event.dataTransfer?.files?.[0];
        await setHotspotImageFromFile(file);
      });
      let startPoint = null;
      const hotspotSurface = document.getElementById('hotspotImageSurface');
      const pointFromEvent = (event) => {
        const touch = event.touches && event.touches[0] ? event.touches[0] : event;
        const rect = hotspotSurface?.getBoundingClientRect() || hotspotCanvas.getBoundingClientRect();
        return {
          x: Math.max(0, Math.min(100, ((touch.clientX - rect.left) / Math.max(1, rect.width)) * 100)),
          y: Math.max(0, Math.min(100, ((touch.clientY - rect.top) / Math.max(1, rect.height)) * 100))
        };
      };
      const drawTo = (point, commit) => {
        if (!startPoint) return;
        const x = Math.min(startPoint.x, point.x);
        const y = Math.min(startPoint.y, point.y);
        const w = Math.max(2, Math.abs(point.x - startPoint.x));
        const h = Math.max(2, Math.abs(point.y - startPoint.y));
        currentQuestion().hotspotAnswer = normalizeHotspotArea({ x, y, w, h });
        if (commit) { markDirty(); renderQuestionEditor(); }
        else {
          const zone = hotspotSurface?.querySelector('.qp-hotspot-editor-zone') || (() => { const el = document.createElement('div'); el.className = 'qp-hotspot-editor-zone'; (hotspotSurface || hotspotCanvas).appendChild(el); return el; })();
          const area = currentQuestion().hotspotAnswer;
          zone.style.left = `${area.x}%`; zone.style.top = `${area.y}%`; zone.style.width = `${area.w}%`; zone.style.height = `${area.h}%`;
        }
      };
      hotspotSurface?.addEventListener('pointerdown', event => { if (!currentQuestion().media) return; startPoint = pointFromEvent(event); hotspotSurface.setPointerCapture?.(event.pointerId); event.preventDefault(); });
      hotspotSurface?.addEventListener('pointermove', event => { if (!startPoint) return; drawTo(pointFromEvent(event), false); event.preventDefault(); });
      hotspotSurface?.addEventListener('pointerup', event => { if (!startPoint) return; drawTo(pointFromEvent(event), true); startPoint = null; event.preventDefault(); });
    }
  }

  function attachAdvancedEvents() {
    bindQuizVisibilityControl();
    document.getElementById('removeMediaBtn')?.addEventListener('click', () => { currentQuestion().media = null; markDirty(); render(); });
    document.getElementById('checkBtn')?.addEventListener('click', () => validateQuiz(true));
    document.getElementById('answerExplanation')?.addEventListener('input', e => { currentQuestion().explanation = e.target.value; markDirty(); });
    document.getElementById('learningConcept')?.addEventListener('input', e => { currentQuestion().learningConcept = e.target.value; markDirty(); });
    document.getElementById('teacherNote')?.addEventListener('input', e => { currentQuestion().teacherNote = e.target.value; markDirty(); });
    document.getElementById('showQuestionOnStudent')?.addEventListener('change', e => { state.quiz.settings = state.quiz.settings || {}; state.quiz.settings.showQuestionOnStudent = e.target.checked; markDirty(); });
    bindQuizJoinOptions(advancedPanel || document);
    document.getElementById('questionBackgroundEnabled')?.addEventListener('change', e => {
      if (e.target.checked) {
        questionBackgroundFile?.click();
      } else {
        currentQuestion().backgroundImage = null;
        markDirty();
        render();
      }
    });
    document.getElementById('uploadQuestionBackgroundBtn')?.addEventListener('click', () => questionBackgroundFile?.click());
    document.getElementById('removeQuestionBackgroundBtn')?.addEventListener('click', () => { currentQuestion().backgroundImage = null; markDirty(); render(); });
    advancedPanel.querySelectorAll('[data-bg-preset]')?.forEach(btn => btn.addEventListener('click', () => {
      state.quiz.settings = state.quiz.settings || {};
      state.quiz.settings.theme = { ...(state.quiz.settings.theme || {}), backgroundPreset: btn.dataset.bgPreset };
      delete state.quiz.settings.theme.backgroundImage;
      markDirty();
      renderAdvancedPanel();
      QuizPulse.applyQuizBackground(QuizPulse.backgroundForQuestion(state.quiz.settings, currentQuestion()));
    }));
    document.getElementById('uploadBackgroundBtn')?.addEventListener('click', () => backgroundFile?.click());
    document.getElementById('removeBackgroundBtn')?.addEventListener('click', () => {
      state.quiz.settings = state.quiz.settings || {};
      state.quiz.settings.theme = { backgroundPreset: 'neo', ...(state.quiz.settings.theme || {}) };
      delete state.quiz.settings.theme.backgroundImage;
      markDirty();
      renderAdvancedPanel();
      QuizPulse.applyQuizBackground(QuizPulse.backgroundForQuestion(state.quiz.settings, currentQuestion()));
    });
  }

  function duplicateQuestionAt(i) {
    const copy = JSON.parse(JSON.stringify(state.quiz.Q[i]));
    copy.id = QuizPulse.id('q');
    copy.title = `${copy.title || 'Question'} Copy`;
    if (copy.choices) copy.choices.forEach(c => c.id = QuizPulse.id('c'));
    if (copy.orderItems) copy.orderItems.forEach(item => item.id = QuizPulse.id('item'));
    if (copy.matchingPairs) copy.matchingPairs.forEach(pair => { pair.id = QuizPulse.id('pair'); pair.rightId = QuizPulse.id('right'); });
    if (copy.fillBlanks) copy.fillBlanks.forEach(blank => { blank.id = QuizPulse.id('blank'); });
    state.quiz.Q.splice(i + 1, 0, copy);
    selectedIndex = i + 1;
    markDirty();
    render();
  }
  function deleteQuestionAt(i) {
    if (state.quiz.Q.length <= 1) return QuizPulse.toast('Quiz needs at least one question');
    state.quiz.Q.splice(i, 1);
    selectedIndex = Math.max(0, Math.min(i, state.quiz.Q.length - 1));
    markDirty();
    render();
  }
  function addQuestion(type = 'mcq') {
    state.quiz.Q.push(makeQuestion(type));
    selectedIndex = state.quiz.Q.length - 1;
    markDirty();
    render();
    if (type === 'hotspot') {
      setTimeout(() => {
        const uploadBtn = document.getElementById('uploadHotspotImage');
        uploadBtn?.classList.add('qp-attention-pulse');
        uploadBtn?.focus();
        uploadBtn?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        setTimeout(() => uploadBtn?.classList.remove('qp-attention-pulse'), 2600);
      }, 60);
    }
  }


  function cloneQuestion(q) {
    const copy = JSON.parse(JSON.stringify(q));
    copy.id = QuizPulse.id('q');
    copy.choices = (copy.choices || []).map(c => ({ ...c, id: QuizPulse.id('c') }));
    copy.orderItems = (copy.orderItems || []).map(item => ({ ...item, id: QuizPulse.id('item') }));
    return copy;
  }

  function readUInt16(bytes, offset) {
    return bytes[offset] | (bytes[offset + 1] << 8);
  }

  function readUInt32(bytes, offset) {
    return (bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16) | (bytes[offset + 3] << 24)) >>> 0;
  }

  function decodeUtf8(bytes) {
    return new TextDecoder('utf-8').decode(bytes);
  }

  async function inflateRawDeflate(bytes) {
    if (typeof DecompressionStream !== 'function') {
      throw new Error('This browser cannot read XLSX files offline. Please use a recent Chrome or Edge browser.');
    }
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }

  async function readZipEntries(file) {
    const bytes = new Uint8Array(await file.arrayBuffer());
    let eocd = -1;
    for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 70000); i--) {
      if (readUInt32(bytes, i) === 0x06054b50) { eocd = i; break; }
    }
    if (eocd < 0) throw new Error('This is not a valid XLSX file.');
    const entryCount = readUInt16(bytes, eocd + 10);
    let cdOffset = readUInt32(bytes, eocd + 16);
    const entries = new Map();
    for (let i = 0; i < entryCount; i++) {
      if (readUInt32(bytes, cdOffset) !== 0x02014b50) break;
      const method = readUInt16(bytes, cdOffset + 10);
      const compressedSize = readUInt32(bytes, cdOffset + 20);
      const nameLen = readUInt16(bytes, cdOffset + 28);
      const extraLen = readUInt16(bytes, cdOffset + 30);
      const commentLen = readUInt16(bytes, cdOffset + 32);
      const localOffset = readUInt32(bytes, cdOffset + 42);
      const name = decodeUtf8(bytes.slice(cdOffset + 46, cdOffset + 46 + nameLen)).replace(/^\/+/, '');
      if (readUInt32(bytes, localOffset) !== 0x04034b50) {
        cdOffset += 46 + nameLen + extraLen + commentLen;
        continue;
      }
      const localNameLen = readUInt16(bytes, localOffset + 26);
      const localExtraLen = readUInt16(bytes, localOffset + 28);
      const dataStart = localOffset + 30 + localNameLen + localExtraLen;
      const compressed = bytes.slice(dataStart, dataStart + compressedSize);
      let content;
      if (method === 0) content = compressed;
      else if (method === 8) content = await inflateRawDeflate(compressed);
      else throw new Error(`Unsupported XLSX compression method: ${method}`);
      entries.set(name, content);
      cdOffset += 46 + nameLen + extraLen + commentLen;
    }
    return entries;
  }

  function zipXml(entries, path) {
    const bytes = entries.get(path.replace(/^\/+/, ''));
    if (!bytes) return null;
    return new DOMParser().parseFromString(decodeUtf8(bytes), 'application/xml');
  }

  function xmlNodes(node, localName) {
    if (!node) return [];
    const found = new Set();
    const out = [];
    const add = item => { if (item && !found.has(item)) { found.add(item); out.push(item); } };
    try { Array.from(node.getElementsByTagName(localName) || []).forEach(add); } catch (_) {}
    try { Array.from(node.getElementsByTagNameNS('*', localName) || []).forEach(add); } catch (_) {}
    return out;
  }

  function xmlAttribute(node, localName) {
    if (!node) return '';
    return node.getAttribute(localName) || node.getAttribute(`r:${localName}`) || node.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', localName) || '';
  }

  function relTargetToPath(target) {
    const clean = String(target || '').replace(/^\/+/, '');
    return clean.startsWith('xl/') ? clean : `xl/${clean}`;
  }

  function textFromXmlNode(node) {
    if (!node) return '';
    return xmlNodes(node, 't').map(t => t.textContent || '').join('');
  }

  function cellColumnIndex(ref, fallback) {
    const letters = String(ref || '').match(/^[A-Z]+/i)?.[0] || '';
    if (!letters) return fallback;
    let n = 0;
    for (const ch of letters.toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64);
    return n - 1;
  }

  function firstDirectChildText(node, tagName) {
    if (!node) return '';
    for (const child of Array.from(node.children || [])) {
      if (child.localName === tagName || child.tagName === tagName) return child.textContent || '';
    }
    return '';
  }

  async function readXlsxRows(file) {
    if (!/\.xlsx$/i.test(file.name || '')) throw new Error('Please choose an .xlsx file.');
    const entries = await readZipEntries(file);
    const workbook = zipXml(entries, 'xl/workbook.xml');
    if (!workbook) throw new Error('Could not find workbook.xml inside the XLSX file.');

    const shared = [];
    const sharedDoc = zipXml(entries, 'xl/sharedStrings.xml');
    if (sharedDoc) {
      xmlNodes(sharedDoc, 'si').forEach(si => shared.push(textFromXmlNode(si)));
    }

    const rels = {};
    const relsDoc = zipXml(entries, 'xl/_rels/workbook.xml.rels');
    if (relsDoc) {
      xmlNodes(relsDoc, 'Relationship').forEach(rel => {
        rels[rel.getAttribute('Id')] = rel.getAttribute('Target');
      });
    }

    const parseSheetRows = (sheet) => {
      const rows = [];
      xmlNodes(sheet, 'row').forEach(rowNode => {
        const row = [];
        xmlNodes(rowNode, 'c').forEach((cellNode, fallbackIndex) => {
          const col = cellColumnIndex(cellNode.getAttribute('r'), fallbackIndex);
          const type = cellNode.getAttribute('t') || '';
          let value = '';
          if (type === 'inlineStr') value = textFromXmlNode(cellNode);
          else {
            value = firstDirectChildText(cellNode, 'v');
            if (type === 's') value = shared[Number(value)] || '';
            if (type === 'b') value = value === '1' ? 'TRUE' : 'FALSE';
          }
          row[col] = String(value || '').trim();
        });
        if (row.some(value => String(value || '').trim())) rows.push(row);
      });
      return rows;
    };

    const sheetNodes = xmlNodes(workbook, 'sheet');
    const candidatePaths = sheetNodes.map((sheetNode, index) => {
      const relId = xmlAttribute(sheetNode, 'id');
      return relTargetToPath(rels[relId] || `worksheets/sheet${index + 1}.xml`);
    });
    if (!candidatePaths.length) candidatePaths.push('xl/worksheets/sheet1.xml');

    let bestRows = [];
    for (const path of candidatePaths) {
      const sheet = zipXml(entries, path);
      if (!sheet) continue;
      const rows = parseSheetRows(sheet);
      if (rows.length > bestRows.length) bestRows = rows;
      if (rows.length >= 2) return rows;
    }
    if (bestRows.length) return bestRows;
    throw new Error('Could not find a worksheet with questions in the XLSX file.');
  }

  function replaceStarterWithImport(imported) {
    const safeImported = imported.map(q => normalizeQuestion(q)).filter(Boolean);
    const starter = state.quiz.Q.length === 1 && state.quiz.Q[0]?.type === 'mcq' && !String(state.quiz.Q[0]?.title || '').trim();
    if (starter) {
      state.quiz.Q = safeImported;
      selectedIndex = 0;
    } else {
      state.quiz.Q.push(...safeImported);
      selectedIndex = Math.max(0, state.quiz.Q.length - safeImported.length);
    }
  }

  // A quiz file in the QuizPulse template (quizpulse_quiz_file.js): one a teacher filled in, or one Export wrote - at home
  // with the offline creator, or here. Its questions join this quiz, and its title names an untitled quiz.
  async function importQuestionsFromXlsx(file) {
    const rows = await readXlsxRows(file);
    const { title, questions, skipped } = window.QuizPulseQuizFile.rowsToQuiz(rows, { id: prefix => QuizPulse.id(prefix) });
    if (!questions.length) throw new Error('No questions were found in the file. Put one question per row, or use the QuizPulse template.');
    replaceStarterWithImport(questions);
    const titleInput = document.getElementById('quizTitle');
    if (title && (!String(state.quiz.title || '').trim() || state.quiz.title === 'Untitled Quiz')) {
      state.quiz.title = title;
      if (titleInput) titleInput.value = title;
    }
    markDirty();
    render();
    QuizPulse.toast(`Imported ${questions.length} question${questions.length === 1 ? '' : 's'}${skipped ? `. ${skipped} Pin on Image question${skipped === 1 ? ' was' : 's were'} left out: add ${skipped === 1 ? 'it' : 'them'} here` : ''}.`);
  }

  // This quiz as a file in the QuizPulse template, named after it and the day, to import elsewhere: a quiz made at home in
  // the offline creator is brought in on campus this way. A spreadsheet holds no pictures and no Pin on Image question.
  function exportQuizFile() {
    const titleInput = document.getElementById('quizTitle');
    if (titleInput) state.quiz.title = titleInput.value.trim() || state.quiz.title;
    const { bytes, fileName, skipped } = window.QuizPulseQuizFile.exportQuiz(state.quiz);
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    setTimeout(() => { URL.revokeObjectURL(link.href); link.remove(); }, 1000);
    const pictures = (state.quiz.Q || []).some(q => q.type !== 'hotspot' && (q.media || q.backgroundImage));
    QuizPulse.toast(`Exported ${fileName}${skipped ? `. ${skipped} Pin on Image question${skipped === 1 ? ' is' : 's are'} not in the file` : ''}${pictures ? '. Pictures are not in the file' : ''}.`);
    return fileName;
  }


  questionList.addEventListener('click', async e => {
    if (performance.now() < suppressQuestionClickUntil) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    const btn = e.target.closest('[data-action]');
    const thumb = e.target.closest('.qp-question-thumb');
    const questionMenu = e.target.closest('.qp-question-card-menu');
    if (questionMenu && !btn) {
      questionList.querySelectorAll('.qp-question-card-menu[open]').forEach(menu => {
        if (menu !== questionMenu) menu.removeAttribute('open');
      });
      return;
    }
    if (btn) {
      if (btn.dataset.action === 'addBlank') { addQuestion('mcq'); return; }
      const i = Number(btn.dataset.index);
      btn.closest('.qp-question-card-menu')?.removeAttribute('open');
      if (btn.dataset.action === 'select') { selectedIndex = i; render(); }
      if (btn.dataset.action === 'moveQuestion') {
        const dir = btn.dataset.dir === 'up' ? -1 : 1;
        const nextIndex = i + dir;
        if (moveQuestionToIndex(i, nextIndex)) {
          requestAnimationFrame(() => questionList.querySelector(`.qp-question-reorder-row[data-index="${nextIndex}"] [data-reorder-handle]`)?.focus({ preventScroll: true }));
        }
      }
      if (btn.dataset.action === 'moveToPosition') {
        const count = (state.quiz.Q || []).length;
        const prompt = QuizPulse.promptDialog({
          title: 'Move question',
          message: `Choose a position from 1 to ${count}.`,
          defaultValue: String(i + 1),
          confirmText: 'Move',
          maxLength: String(count).length
        });
        const positionInput = document.getElementById('qpGlobalPromptInput');
        if (positionInput) {
          positionInput.type = 'number';
          positionInput.inputMode = 'numeric';
          positionInput.min = '1';
          positionInput.max = String(count);
          positionInput.step = '1';
        }
        const rawPosition = await prompt;
        if (positionInput) {
          positionInput.type = 'text';
          positionInput.removeAttribute('inputmode');
          positionInput.removeAttribute('min');
          positionInput.removeAttribute('max');
          positionInput.removeAttribute('step');
        }
        if (rawPosition === null) return;
        const position = Number(rawPosition);
        if (!Number.isInteger(position) || position < 1 || position > count) {
          QuizPulse.toast(`Enter a position from 1 to ${count}.`);
          return;
        }
        if (!moveQuestionToIndex(i, position - 1, { reveal: true })) QuizPulse.toast(`Question is already at position ${position}.`);
        return;
      }
      if (btn.dataset.action === 'duplicate') duplicateQuestionAt(i);
      if (btn.dataset.action === 'delete') deleteQuestionAt(i);
    } else if (thumb) { selectedIndex = Number(thumb.dataset.index); render(); }
  });

  let activeDropPosition = null;
  let latestDragPoint = null;
  let questionListAutoScrollFrame = 0;
  let questionListAutoScrollSpeed = 0;
  let questionListAutoScrollUpdate = null;
  let questionListWheelOverrideUntil = 0;
  let suppressQuestionClickUntil = 0;
  let desktopQuestionDrag = null;
  let pointerReorder = null;

  document.addEventListener('pointerdown', event => {
    if (event.target.closest('.qp-question-card-menu')) return;
    questionList.querySelectorAll('.qp-question-card-menu[open]').forEach(menu => menu.removeAttribute('open'));
  });

  function clearQuestionDropIndicator() {
    questionList.querySelectorAll('.drop-target, .drop-before, .drop-after').forEach(element => {
      element.classList.remove('drop-target', 'drop-before', 'drop-after');
    });
    activeDropPosition = null;
  }

  function questionDropPositionAt(clientX, clientY) {
    const element = document.elementFromPoint(clientX, clientY);
    const row = element?.closest?.('.qp-question-thumb, .qp-question-reorder-row');
    if (!row || !questionList.contains(row)) return null;
    const rect = row.getBoundingClientRect();
    return { index: Number(row.dataset.index), after: clientY > rect.top + (rect.height / 2), row };
  }

  function updateQuestionDropIndicator(clientX, clientY) {
    const position = questionDropPositionAt(clientX, clientY);
    clearQuestionDropIndicator();
    if (!position || !Number.isInteger(position.index)) return null;
    position.row.classList.add('drop-target', position.after ? 'drop-after' : 'drop-before');
    activeDropPosition = { index: position.index, after: position.after };
    return activeDropPosition;
  }

  function stopQuestionListAutoScroll() {
    if (questionListAutoScrollFrame) cancelAnimationFrame(questionListAutoScrollFrame);
    questionListAutoScrollFrame = 0;
    questionListAutoScrollSpeed = 0;
    questionListAutoScrollUpdate = null;
  }

  function questionListAutoScrollTick() {
    questionListAutoScrollFrame = 0;
    if (!questionListAutoScrollSpeed) return;
    const before = questionList.scrollTop;
    questionList.scrollTop += questionListAutoScrollSpeed;
    if (questionList.scrollTop === before) {
      stopQuestionListAutoScroll();
      return;
    }
    questionListAutoScrollUpdate?.();
    questionListAutoScrollFrame = requestAnimationFrame(questionListAutoScrollTick);
  }

  function updateQuestionListAutoScroll(clientY, onUpdate) {
    if (performance.now() < questionListWheelOverrideUntil) {
      stopQuestionListAutoScroll();
      return;
    }
    const rect = questionList.getBoundingClientRect();
    const edge = Math.min(88, Math.max(48, rect.height * .18));
    let speed = 0;
    if (clientY < rect.top + edge) speed = -Math.ceil(24 * Math.min(1, (rect.top + edge - clientY) / edge));
    else if (clientY > rect.bottom - edge) speed = Math.ceil(24 * Math.min(1, (clientY - (rect.bottom - edge)) / edge));
    questionListAutoScrollSpeed = speed;
    questionListAutoScrollUpdate = onUpdate;
    if (!speed) {
      if (questionListAutoScrollFrame) cancelAnimationFrame(questionListAutoScrollFrame);
      questionListAutoScrollFrame = 0;
      return;
    }
    if (!questionListAutoScrollFrame) questionListAutoScrollFrame = requestAnimationFrame(questionListAutoScrollTick);
  }

  function finishQuestionDrop(fromIndex) {
    const position = activeDropPosition;
    stopQuestionListAutoScroll();
    clearQuestionDropIndicator();
    if (!position) return false;
    const insertion = position.index + (position.after ? 1 : 0);
    return moveQuestionToInsertion(fromIndex, insertion);
  }

  function positionDesktopQuestionGhost(drag) {
    if (!drag?.ghost) return;
    const left = Math.max(8, Math.min(window.innerWidth - drag.width - 8, drag.x - drag.offsetX));
    const top = Math.max(8, Math.min(window.innerHeight - drag.height - 8, drag.y - drag.offsetY));
    drag.ghost.style.transform = `translate3d(${Math.round(left)}px, ${Math.round(top)}px, 0)`;
  }

  questionList.addEventListener('pointerdown', event => {
    if (state.reorderMode || creatorPhoneLayout.matches || event.pointerType !== 'mouse' || event.button !== 0) return;
    const thumb = event.target.closest('.qp-question-thumb');
    if (!thumb || event.target.closest('button, a, input, textarea, select, summary, details, [contenteditable="true"]')) return;
    const thumbRect = thumb.getBoundingClientRect();
    desktopQuestionDrag = {
      pointerId: event.pointerId,
      fromIndex: Number(thumb.dataset.index),
      row: thumb,
      startX: event.clientX,
      startY: event.clientY,
      x: event.clientX,
      y: event.clientY,
      offsetX: event.clientX - thumbRect.left,
      offsetY: event.clientY - thumbRect.top,
      width: thumbRect.width,
      height: thumbRect.height,
      active: false,
      ghost: null
    };
    thumb.setPointerCapture?.(event.pointerId);
  });

  questionList.addEventListener('pointermove', event => {
    if (!desktopQuestionDrag || desktopQuestionDrag.pointerId !== event.pointerId) return;
    desktopQuestionDrag.x = event.clientX;
    desktopQuestionDrag.y = event.clientY;
    latestDragPoint = { x: event.clientX, y: event.clientY };
    if (!desktopQuestionDrag.active
      && Math.hypot(event.clientX - desktopQuestionDrag.startX, event.clientY - desktopQuestionDrag.startY) >= 5) {
      desktopQuestionDrag.active = true;
      desktopQuestionDrag.row.classList.add('dragging');
      document.body.classList.add('qp-question-pointer-dragging');
      desktopQuestionDrag.ghost = desktopQuestionDrag.row.cloneNode(true);
      desktopQuestionDrag.ghost.classList.remove('dragging', 'drop-target', 'drop-before', 'drop-after');
      desktopQuestionDrag.ghost.classList.add('qp-question-drag-ghost');
      desktopQuestionDrag.ghost.style.width = `${Math.round(desktopQuestionDrag.width)}px`;
      desktopQuestionDrag.ghost.setAttribute('aria-hidden', 'true');
      document.body.appendChild(desktopQuestionDrag.ghost);
    }
    if (!desktopQuestionDrag.active) return;
    positionDesktopQuestionGhost(desktopQuestionDrag);
    updateQuestionDropIndicator(event.clientX, event.clientY);
    updateQuestionListAutoScroll(event.clientY, () => {
      if (latestDragPoint) updateQuestionDropIndicator(latestDragPoint.x, latestDragPoint.y);
    });
    event.preventDefault();
  });

  function endDesktopQuestionDrag(event, shouldDrop) {
    if (!desktopQuestionDrag || desktopQuestionDrag.pointerId !== event.pointerId) return;
    const current = desktopQuestionDrag;
    desktopQuestionDrag = null;
    current.row.releasePointerCapture?.(event.pointerId);
    current.row.classList.remove('dragging');
    current.ghost?.remove();
    document.body.classList.remove('qp-question-pointer-dragging');
    if (shouldDrop && current.active) finishQuestionDrop(current.fromIndex);
    else {
      stopQuestionListAutoScroll();
      clearQuestionDropIndicator();
    }
    if (current.active) suppressQuestionClickUntil = performance.now() + 320;
    latestDragPoint = null;
  }

  questionList.addEventListener('pointerup', event => endDesktopQuestionDrag(event, true));
  questionList.addEventListener('pointercancel', event => endDesktopQuestionDrag(event, false));

  document.addEventListener('wheel', event => {
    if (!desktopQuestionDrag?.active || event.deltaY === 0) return;
    const pointer = latestDragPoint || { x: desktopQuestionDrag.x, y: desktopQuestionDrag.y };

    let delta = event.deltaY;
    if (event.deltaMode === 1) delta *= 28;
    else if (event.deltaMode === 2) delta *= questionList.clientHeight;

    const before = questionList.scrollTop;
    questionListWheelOverrideUntil = performance.now() + 180;
    stopQuestionListAutoScroll();
    questionList.scrollTop += delta;
    event.preventDefault();
    if (questionList.scrollTop === before) return;
    latestDragPoint = pointer;
    updateQuestionDropIndicator(pointer.x, pointer.y);
  }, { capture: true, passive: false });

  questionList.addEventListener('pointerdown', event => {
    const handle = event.target.closest('[data-reorder-handle]');
    if (!state.reorderMode || !handle || event.button !== 0) return;
    const row = handle.closest('.qp-question-reorder-row');
    if (!row) return;
    pointerReorder = {
      pointerId: event.pointerId,
      fromIndex: Number(row.dataset.index),
      handle,
      startX: event.clientX,
      startY: event.clientY,
      x: event.clientX,
      y: event.clientY,
      active: false
    };
    handle.setPointerCapture?.(event.pointerId);
    event.preventDefault();
  });

  questionList.addEventListener('pointermove', event => {
    if (!pointerReorder || pointerReorder.pointerId !== event.pointerId) return;
    pointerReorder.x = event.clientX;
    pointerReorder.y = event.clientY;
    if (!pointerReorder.active && Math.hypot(event.clientX - pointerReorder.startX, event.clientY - pointerReorder.startY) >= 5) {
      pointerReorder.active = true;
      document.body.classList.add('qp-question-pointer-dragging');
      pointerReorder.handle.closest('.qp-question-reorder-row')?.classList.add('dragging');
    }
    if (!pointerReorder.active) return;
    updateQuestionDropIndicator(event.clientX, event.clientY);
    updateQuestionListAutoScroll(event.clientY, () => {
      if (pointerReorder) updateQuestionDropIndicator(pointerReorder.x, pointerReorder.y);
    });
    event.preventDefault();
  });

  function endPointerQuestionReorder(event, shouldDrop) {
    if (!pointerReorder || pointerReorder.pointerId !== event.pointerId) return;
    const current = pointerReorder;
    pointerReorder = null;
    current.handle.releasePointerCapture?.(event.pointerId);
    current.handle.closest('.qp-question-reorder-row')?.classList.remove('dragging');
    document.body.classList.remove('qp-question-pointer-dragging');
    if (shouldDrop && current.active) finishQuestionDrop(current.fromIndex);
    else {
      stopQuestionListAutoScroll();
      clearQuestionDropIndicator();
    }
  }

  questionList.addEventListener('pointerup', event => endPointerQuestionReorder(event, true));
  questionList.addEventListener('pointercancel', event => endPointerQuestionReorder(event, false));

  const sideAddQuestionBtn = document.getElementById('sideAddQuestionBtn');
  sideAddQuestionBtn?.addEventListener('click', () => addQuestion('mcq'));

  function openQuestionReorderMode(options = {}) {
    if ((state.quiz.Q || []).length < 2) return QuizPulse.toast('Add another question before reordering.');
    closeCreatorSettingsDrawer();
    setCreatorMobileView('questions');
    state.reorderMode = true;
    if (!options.fromHistory) pushCreatorOverlayHistory('reorder');
    renderQuestionList();
    requestAnimationFrame(() => questionList.querySelector('[data-reorder-handle]')?.focus({ preventScroll: true }));
  }

  function closeQuestionReorderMode(options = {}) {
    if (state.reorderMode && creatorPhoneLayout.matches && !options.fromHistory && activeCreatorOverlayHistory() === 'reorder') {
      history.back();
      return;
    }
    stopQuestionListAutoScroll();
    clearQuestionDropIndicator();
    pointerReorder = null;
    state.reorderMode = false;
    renderQuestionList();
    requestAnimationFrame(() => reorderQuestionsBtn?.focus({ preventScroll: true }));
  }

  reorderQuestionsBtn?.addEventListener('click', openQuestionReorderMode);
  reorderDoneBtn?.addEventListener('click', closeQuestionReorderMode);

  function setCreatorMobileView(view = 'canvas') {
    const next = ['questions', 'canvas'].includes(view) ? view : 'canvas';
    if (creatorPhoneLayout.matches && document.body.dataset.creatorMobileView === 'advanced' && activeCreatorOverlayHistory() === 'advanced') history.back();
    creatorPreviousMobileView = next;
    if (next !== 'questions' && state.reorderMode) state.reorderMode = false;
    syncQuestionReorderUi();
    document.body.dataset.creatorMobileView = next;
    document.querySelectorAll('.qp-creator-mobile-modes [data-creator-mobile-view]').forEach(button => {
      const active = button.dataset.creatorMobileView === next;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', String(active));
    });
    if (!creatorPhoneLayout.matches) return;
    shell.classList.toggle('left-collapsed', next !== 'questions');
    shell.classList.add('right-collapsed');
    document.getElementById('creatorDrawerBackdrop')?.classList.remove('show');
  }

  function openCreatorSettingsDrawer(options = {}) {
    state.rightTab = 'advanced';
    shell.classList.remove('right-collapsed');
    if (creatorPhoneLayout.matches) {
      const currentView = document.body.dataset.creatorMobileView;
      if (['questions', 'canvas'].includes(currentView)) creatorPreviousMobileView = currentView;
      if (state.reorderMode) closeQuestionReorderMode();
      document.body.dataset.creatorMobileView = 'advanced';
      if (!options.fromHistory) pushCreatorOverlayHistory('advanced');
      document.querySelectorAll('.qp-creator-mobile-modes [data-creator-mobile-view]').forEach(button => {
        button.classList.remove('active');
        button.setAttribute('aria-pressed', 'false');
      });
    }
    renderAdvancedPanel();
    updateRightPanelScrollHeight();
    syncRightPanelScrollThumb();
    requestAnimationFrame(() => {
      advancedPanel.scrollTop = Math.max(0, Number(state.advancedScrollTop || 0));
      document.getElementById('collapseRight')?.focus({ preventScroll: true });
    });
  }

  function closeCreatorSettingsDrawer(options = {}) {
    if (creatorPhoneLayout.matches && document.body.dataset.creatorMobileView === 'advanced' && !options.fromHistory && activeCreatorOverlayHistory() === 'advanced') {
      history.back();
      return;
    }
    if (advancedPanel) state.advancedScrollTop = advancedPanel.scrollTop;
    shell.classList.add('right-collapsed');
    if (creatorPhoneLayout.matches && document.body.dataset.creatorMobileView === 'advanced') setCreatorMobileView(creatorPreviousMobileView);
  }

  const creatorMenuButton = document.getElementById('globalMenuBtn');
  const creatorNavBackdrop = document.getElementById('creatorNavBackdrop');
  const setCreatorNavOpen = open => {
    const shouldOpen = Boolean(open && window.matchMedia('(max-width: 1180px)').matches);
    document.body.classList.toggle('qp-creator-nav-open', shouldOpen);
    creatorMenuButton?.setAttribute('aria-expanded', shouldOpen ? 'true' : 'false');
  };
  creatorMenuButton?.setAttribute('aria-controls', 'creatorAppSidebar');
  creatorMenuButton?.setAttribute('aria-expanded', 'false');
  creatorMenuButton?.addEventListener('click', () => setCreatorNavOpen(!document.body.classList.contains('qp-creator-nav-open')));
  creatorNavBackdrop?.addEventListener('click', () => setCreatorNavOpen(false));
  document.querySelector('.qp-creator-app-sidebar .qp-dashboard-nav')?.addEventListener('click', event => {
    if (event.target.closest('a')) setCreatorNavOpen(false);
  });
  window.addEventListener('resize', () => setCreatorNavOpen(false));
  document.getElementById('collapseLeft').addEventListener('click', () => shell.classList.add('left-collapsed'));
  document.getElementById('openLeft').addEventListener('click', () => shell.classList.remove('left-collapsed'));
  document.getElementById('collapseRight').addEventListener('click', closeCreatorSettingsDrawer);
  document.getElementById('creatorDrawerBackdrop')?.addEventListener('click', closeCreatorSettingsDrawer);
  const creatorToolsMenu = document.querySelector('.qp-tools-menu');
  const closeCreatorToolsMenu = ({ restoreFocus = false } = {}) => {
    if (!creatorToolsMenu?.open) return false;
    creatorToolsMenu.open = false;
    if (restoreFocus) creatorToolsMenu.querySelector('summary')?.focus();
    return true;
  };
  creatorToolsMenu?.querySelector('.qp-tools-menu-close')?.addEventListener('click', event => {
    event.preventDefault();
    event.stopPropagation();
    closeCreatorToolsMenu({ restoreFocus: true });
  });
  creatorToolsMenu?.querySelector('.qp-tools-menu-panel')?.addEventListener('click', event => {
    if (event.target.closest('a')) closeCreatorToolsMenu();
  });
  document.querySelectorAll('.qp-creator-mobile-modes [data-creator-mobile-view]').forEach(button => button.addEventListener('click', () => {
    setCreatorMobileView(button.dataset.creatorMobileView);
  }));
  document.addEventListener('keydown', event => {
    if (event.key !== 'Escape') return;
    if (closeCreatorToolsMenu({ restoreFocus: true })) return;
    const openQuestionMenus = questionList.querySelectorAll('.qp-question-card-menu[open]');
    if (openQuestionMenus.length) {
      openQuestionMenus.forEach(menu => menu.removeAttribute('open'));
      return;
    }
    if (state.reorderMode) closeQuestionReorderMode();
    else if (creatorMobileLayout.matches && !shell.classList.contains('right-collapsed')) closeCreatorSettingsDrawer();
  });
  window.addEventListener('popstate', () => {
    const overlay = activeCreatorOverlayHistory();
    if (state.reorderMode && overlay !== 'reorder') closeQuestionReorderMode({ fromHistory: true });
    if (document.body.dataset.creatorMobileView === 'advanced' && overlay !== 'advanced') closeCreatorSettingsDrawer({ fromHistory: true });
  });
  document.getElementById('importBtn').addEventListener('click', () => {
    closeCreatorToolsMenu();
    document.getElementById('importFile').click();
  });
  document.getElementById('exportQuizBtn')?.addEventListener('click', () => {
    closeCreatorToolsMenu();
    exportQuizFile();
  });
  document.getElementById('importFile').addEventListener('change', async e => {
    const file = e.target.files[0]; if (!file) return;
    try { await importQuestionsFromXlsx(file); }
    catch (err) { QuizPulse.toast(err.message || 'Import failed'); }
    e.target.value = '';
  });
  async function openQuizVersions() {
    if (!quizId || lectureQuestionMode) { QuizPulse.toast('Save a quiz first to review its versions.'); return; }
    const trigger = document.getElementById('quizVersionsBtn');
    closeCreatorToolsMenu();
    const dialog = document.createElement('dialog');
    dialog.className = 'qp-versions-dialog';
    dialog.setAttribute('aria-labelledby', 'quizVersionsTitle');
    dialog.innerHTML = `<header><h2 id="quizVersionsTitle">Saved versions</h2><button class="qp-btn small" type="button" data-close>Close</button></header>
      <p>Review previously saved quiz content. Your current edits stay in the editor.</p>
      <p role="status" aria-live="polite">Loading versions…</p>
      <label>Version<select class="qp-select" aria-label="Saved version" disabled></select></label>
      <button class="qp-btn small" type="button" data-older hidden>Load older versions</button>
      <button class="qp-btn small" type="button" data-retry hidden>Retry</button>
      <section aria-label="Version content"></section>`;
    document.body.append(dialog);
    const status = dialog.querySelector('[role="status"]');
    const select = dialog.querySelector('select');
    const content = dialog.querySelector('section');
    const older = dialog.querySelector('[data-older]');
    const retry = dialog.querySelector('[data-retry]');
    let cursor = null, request = 0, retryAction = null;
    const endpoint = `/api/quizzes/${encodeURIComponent(quizId)}/versions`;
    const failed = (error, action) => {
      status.textContent = error.message || 'Unable to load saved versions.';
      retryAction = action; retry.hidden = false;
    };
    const showVersion = async () => {
      const token = ++request;
      status.textContent = 'Loading version…'; content.replaceChildren(); retry.hidden = true;
      try {
        const result = await QuizPulse.api(`${endpoint}/${encodeURIComponent(select.value)}`);
        if (!dialog.open || token !== request) return;
        const title = document.createElement('h3'); title.textContent = result.quiz.title || 'Untitled Quiz';
        const list = document.createElement('ol');
        for (const question of result.quiz.questions || []) {
          const item = document.createElement('li');
          item.textContent = `${question.title || 'Untitled question'} (${QuizPulse.typeLabel(question.type)})`;
          list.append(item);
        }
        content.replaceChildren(title, list);
        status.textContent = `Version ${result.version.number} · ${list.children.length} ${list.children.length === 1 ? 'question' : 'questions'} · read only`;
      } catch (error) { if (dialog.open && token === request) failed(error, showVersion); }
    };
    const load = async () => {
      older.disabled = true; retry.hidden = true;
      try {
        const result = await QuizPulse.api(`${endpoint}?limit=25${cursor ? `&before=${cursor}` : ''}`);
        if (!dialog.open) return;
        for (const version of result.versions) {
          const option = document.createElement('option'); option.value = version.id;
          option.textContent = `Version ${version.number} · ${new Date(version.createdAt).toLocaleString()}`;
          select.append(option);
        }
        cursor = result.nextBefore; older.hidden = !cursor; select.disabled = !select.options.length;
        if (!select.options.length) status.textContent = 'No saved versions yet. History begins with your next save or Classic session.';
        else await showVersion();
      } catch (error) { if (dialog.open) failed(error, load); }
      finally { older.disabled = false; }
    };
    dialog.querySelector('[data-close]').addEventListener('click', () => dialog.close());
    // The creator's document shortcuts must not edit the quiz from this review.
    dialog.addEventListener('keydown', event => event.stopPropagation());
    dialog.addEventListener('close', () => {
      ++request; dialog.remove();
      const returnTo = trigger?.closest('details')?.querySelector('summary');
      returnTo?.focus();
      requestAnimationFrame(() => { if (document.activeElement === document.body) returnTo?.focus(); });
    }, { once: true });
    select.addEventListener('change', showVersion);
    older.addEventListener('click', load);
    retry.addEventListener('click', () => { retry.hidden = true; retryAction?.(); });
    dialog.showModal();
    await load();
  }
  document.getElementById('quizVersionsBtn')?.addEventListener('click', openQuizVersions);
  const saveBtn = document.getElementById('saveBtn');
  if (saveBtn) saveBtn.addEventListener('click', () => saveQuiz(false));
  document.getElementById('finishBtn').addEventListener('click', finishQuiz);
  document.getElementById('quizTitle').addEventListener('input', e => { state.quiz.title = e.target.value; markDirty(); });

  mediaFile.addEventListener('change', async e => {
    const file = e.target.files[0]; if (!file) return;
    const q = currentQuestion();
    try {
      if (mediaTargetMode === 'hotspotimage' || q.type === 'hotspot') {
        await setHotspotImageFromFile(file);
        return;
      }
      if (file.size > 8 * 1024 * 1024) return QuizPulse.toast('Please choose a file smaller than 8 MB');
      if ((mediaTargetMode === 'mapimage' || q.type === 'map') && !file.type.startsWith('image/')) {
        return QuizPulse.toast('This question type only accepts pictures.');
      }
      const media = await QuizPulse.fileToDataUrl(file);
      q.media = media;
      markDirty(); render();
    } finally {
      mediaTargetMode = 'any';
      mediaFile.accept = 'image/*,audio/*,video/*';
      mediaFile.value = '';
    }
  });

  backgroundFile?.addEventListener('change', async e => {
    const file = e.target.files[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) { backgroundFile.value = ''; return QuizPulse.toast('Please choose an image file.'); }
    if (file.size > 4 * 1024 * 1024) { backgroundFile.value = ''; return QuizPulse.toast('Please choose a background smaller than 4 MB.'); }
    const bg = await QuizPulse.fileToDataUrl(file);
    state.quiz.settings = state.quiz.settings || {};
    state.quiz.settings.theme = { backgroundPreset: 'neo', ...(state.quiz.settings.theme || {}), backgroundImage: bg };
    backgroundFile.value = '';
    markDirty();
    renderAdvancedPanel();
    QuizPulse.applyQuizBackground(QuizPulse.backgroundForQuestion(state.quiz.settings, currentQuestion()));
  });

  questionBackgroundFile?.addEventListener('change', async e => {
    const file = e.target.files[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) { questionBackgroundFile.value = ''; return QuizPulse.toast('Please choose an image file.'); }
    if (file.size > 4 * 1024 * 1024) { questionBackgroundFile.value = ''; return QuizPulse.toast('Please choose a question background smaller than 4 MB.'); }
    const bg = await QuizPulse.fileToDataUrl(file);
    currentQuestion().backgroundImage = bg;
    questionBackgroundFile.value = '';
    markDirty();
    render();
    QuizPulse.toast('Background saved for this question.');
  });

  document.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); saveQuiz(false); }
    if (lectureQuestionMode) return;
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'd') { e.preventDefault(); duplicateQuestionAt(selectedIndex); }
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); addQuestion('mcq'); }
    if (e.key === 'Delete' && !['INPUT','TEXTAREA','SELECT'].includes(document.activeElement?.tagName || '')) { e.preventDefault(); deleteQuestionAt(selectedIndex); }
  });

  window.addEventListener('beforeunload', e => {
    if (state.dirty) { saveLocalDraft(); e.preventDefault(); e.returnValue = ''; }
  });

  document.addEventListener('click', e => {
    if (creatorToolsMenu?.open && !creatorToolsMenu.contains(e.target)) closeCreatorToolsMenu();
    if (state.controlMenu && !e.target.closest('.qp-creator-controls-wrap')) {
      state.controlMenu = '';
      document.querySelector('.qp-creator-control-popover')?.remove();
      questionEditor.querySelectorAll('[data-creator-control]').forEach(button => {
        button.classList.remove('active');
        if (button.hasAttribute('aria-expanded')) button.setAttribute('aria-expanded', 'false');
      });
    }
    if (!e.target.closest('.addMediaBtn') && !e.target.closest('#mediaMenu')) document.getElementById('mediaMenu')?.classList.remove('show');
  });

  // What the offline creator leaves out and says instead: no menu of the server's pages, no practice or hosting, no saved
  // versions; Finish exports; a line under the bar says how the quiz reaches the university.
  // The words the offline creator has of its own, in the language the teacher picks in More (the page has no dashboard
  // to pick it on). A first visit starts in the browser's language.
  const OFFLINE_TEXT = {
    en: { finish: 'Finish & export', finishShort: 'Export', finishLabel: 'Finish and export the quiz', title: 'QuizPulse offline quiz maker',
      other: 'ar', otherName: 'العربية', otherLabel: 'تغيير اللغة إلى العربية' },
    ar: { finish: 'إنهاء وتصدير', finishShort: 'تصدير', finishLabel: 'إنهاء وتصدير الاختبار', title: 'QuizPulse - صانع الاختبارات دون اتصال',
      other: 'en', otherName: 'English', otherLabel: 'Switch language to English' }
  };

  function renderOfflineText() {
    const text = OFFLINE_TEXT[QuizPulse.language?.() === 'ar' ? 'ar' : 'en'];
    const finish = document.getElementById('finishBtn');
    finish?.setAttribute('aria-label', text.finishLabel);
    const full = finish?.querySelector('.qp-finish-label-full');
    const compact = finish?.querySelector('.qp-finish-label-compact');
    if (full) full.textContent = text.finish;
    if (compact) compact.textContent = text.finishShort;
    document.title = text.title;
    const choice = document.querySelector('.qp-offline-language');
    if (!choice) return;
    choice.textContent = text.otherName;
    choice.lang = text.other;
    choice.dataset.language = text.other;
    choice.setAttribute('aria-label', text.otherLabel);
    choice.title = text.otherLabel;
  }

  function applyOfflineCreator() {
    document.body.classList.add('qp-offline-creator');
    // No app menu here, so no room kept for it.
    document.body.classList.remove('qp-creator-with-app-nav');
    for (const id of ['previewBtn', 'hostBtn', 'quizVersionsBtn', 'creatorAppSidebar', 'creatorNavBackdrop', 'globalMenuBtn', 'quizScopeBadge']) document.getElementById(id)?.remove();
    // Exit creator: there is no signed-in site to go back to (the build points its links nowhere).
    document.querySelectorAll('.qp-tools-menu-panel a[href$="dashboard"], .qp-tools-menu-panel a[href="#"]').forEach(link => link.remove());
    document.querySelectorAll('a.qp-brand, a.qp-dashboard-logo').forEach(link => link.removeAttribute('href'));
    const choice = document.createElement('button');
    choice.type = 'button';
    choice.className = 'qp-btn small qp-offline-language';
    choice.addEventListener('click', () => QuizPulse.setLanguage(choice.dataset.language));
    document.querySelector('.qp-tools-menu-head')?.after(choice);
    if (!QuizPulse.storageGet('quizpulseLanguage', '') && /^ar\b/i.test(navigator.language || '')) QuizPulse.setLanguage('ar');
    renderOfflineText();
    document.addEventListener('quizpulse:language-changed', renderOfflineText);
  }
  if (OFFLINE) applyOfflineCreator();

  load();
})();
