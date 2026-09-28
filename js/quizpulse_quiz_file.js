// A quiz as an Excel file: the QuizPulse template. The same rows are what a teacher fills in by hand, what Export writes
// from the creator (online, or the offline creator a teacher uses away from the university), and what Import reads back,
// so a quiz exported at home is the same quiz when it is imported on campus.
//
// One question per row: type | question | A | B | C | D | E | F | correct | time | points | explanation | double points.
// Every question type but Pin on Image fits a row; its picture cannot travel in a spreadsheet. Old files, with only A to
// D, the legacy matching layout, no double points column, Arabic headers or no headers at all, still import.
//
// Browser: window.QuizPulseQuizFile. Node (the tests): module.exports.
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.QuizPulseQuizFile = api;
}(typeof self !== 'undefined' ? self : this, () => {
  'use strict';

  const OPTION_KEYS = ['a', 'b', 'c', 'd', 'e', 'f'];
  const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];
  const HEADER = ['type', 'question', 'A', 'B', 'C', 'D', 'E', 'F', 'correct', 'time', 'points', 'explanation', 'double points'];
  const TITLE_LABEL = 'quiz title';
  // Every type a row can carry, in the order the template shows them.
  const TYPES = ['mcq', 'truefalse', 'multiselect', 'poll', 'type', 'fillblank', 'order', 'slider', 'matching', 'wordcloud'];
  const ANSWER_MAX = 200;
  const TITLE_MAX = 2000;

  function text(value) { return String(value ?? '').trim(); }

  function normalizeArabicKey(value) {
    return String(value || '')
      .toLowerCase()
      .replace(/[إأآٱ]/g, 'ا')
      .replace(/ى/g, 'ي')
      .replace(/ة/g, 'ه')
      .replace(/ؤ/g, 'و')
      .replace(/ئ/g, 'ي')
      .replace(/[ـ]/g, '')
      .replace(/[ً-ٰٟ]/g, '')
      .replace(/[^\p{L}\p{N}]+/gu, ' ')
      .trim();
  }

  // A header cell as the key it names, in English or Arabic.
  const HEADER_ALIASES = {
    'نوع': 'type', 'نوع السوال': 'type', 'صيغه السوال': 'type', 'نمط السوال': 'type', 'question type': 'type',
    'question': 'title', 'question text': 'title', 'title': 'title', 'سوال': 'title', 'السوال': 'title', 'نص السوال': 'title', 'العنوان': 'title',
    'option a': 'a', 'answer a': 'a', 'ا': 'a', 'اختيار ا': 'a', 'الخيار ا': 'a', 'الاجابه ا': 'a', 'جواب ا': 'a',
    'option b': 'b', 'answer b': 'b', 'ب': 'b', 'اختيار ب': 'b', 'الخيار ب': 'b', 'الاجابه ب': 'b', 'جواب ب': 'b',
    'option c': 'c', 'answer c': 'c', 'ج': 'c', 'اختيار ج': 'c', 'الخيار ج': 'c', 'الاجابه ج': 'c', 'جواب ج': 'c',
    'option d': 'd', 'answer d': 'd', 'د': 'd', 'اختيار د': 'd', 'الخيار د': 'd', 'الاجابه د': 'd', 'جواب د': 'd',
    'option e': 'e', 'answer e': 'e', 'ه': 'e', 'اختيار ه': 'e', 'الخيار ه': 'e', 'الاجابه ه': 'e', 'جواب ه': 'e',
    'option f': 'f', 'answer f': 'f', 'و': 'f', 'اختيار و': 'f', 'الخيار و': 'f', 'الاجابه و': 'f', 'جواب و': 'f',
    'correct answer': 'correct', 'answer': 'correct', 'الصحيح': 'correct', 'الاجابه الصحيحه': 'correct', 'الجواب الصحيح': 'correct', 'الاختيار الصحيح': 'correct',
    'time limit': 'time', 'seconds': 'time', 'الوقت': 'time', 'الزمن': 'time', 'المده': 'time', 'مده السوال': 'time', 'الثواني': 'time',
    'score': 'points', 'النقاط': 'points', 'الدرجه': 'points', 'درجه': 'points',
    'feedback': 'explanation', 'شرح': 'explanation', 'الشرح': 'explanation', 'تفسير': 'explanation', 'ملاحظه': 'explanation', 'تعليق': 'explanation',
    'double points': 'double', 'double': 'double', '2x': 'double', 'x2': 'double', 'نقاط مضاعفه': 'double', 'مضاعف': 'double', 'مضاعفه': 'double',
    'quiz title': 'quiz title', 'quiz name': 'quiz title', 'عنوان الاختبار': 'quiz title', 'اسم الاختبار': 'quiz title'
  };
  function headerKey(value) {
    const raw = text(value);
    const latin = raw.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    const arabic = normalizeArabicKey(raw);
    return HEADER_ALIASES[latin] || HEADER_ALIASES[arabic] || latin || arabic;
  }

  const TYPE_ALIASES = {
    tf: 'truefalse', truefalse: 'truefalse', 'صحخطا': 'truefalse', 'صحاوخطا': 'truefalse',
    quiz: 'mcq', multiplechoice: 'mcq', singlechoice: 'mcq', mcq: 'mcq', 'اختيار': 'mcq', 'اختيارمنمتعدد': 'mcq',
    multiselect: 'multiselect', multipleanswer: 'multiselect', multipleselect: 'multiselect', 'متعدد': 'multiselect',
    type: 'type', typed: 'type', typeanswer: 'type', 'اكتب': 'type', 'كتابه': 'type',
    fillblank: 'fillblank', fillintheblank: 'fillblank', fillblanks: 'fillblank', 'فراغ': 'fillblank', 'املاالفراغ': 'fillblank',
    order: 'order', ordering: 'order', 'ترتيب': 'order',
    slider: 'slider', 'سلايدر': 'slider',
    matching: 'matching', match: 'matching', pairs: 'matching', connectpairs: 'matching', 'مطابقه': 'matching', 'وصل': 'matching',
    poll: 'poll', survey: 'poll', 'استطلاع': 'poll',
    wordcloud: 'wordcloud', cloud: 'wordcloud', 'سحابهكلمات': 'wordcloud', 'سحابه': 'wordcloud',
    pin: 'hotspot', pinimage: 'hotspot', pinonimage: 'hotspot', hotspot: 'hotspot', imagepin: 'hotspot', 'صوره': 'hotspot'
  };
  function typeKey(value) {
    const latin = String(value || '').toLowerCase().replace(/[\s_/-]+/g, '');
    const arabic = normalizeArabicKey(value).replace(/\s+/g, '');
    return TYPE_ALIASES[latin] || TYPE_ALIASES[arabic] || '';
  }

  // Where each column is: from a header row among the first rows, or the legacy layout of a file without one.
  function layoutOf(rows) {
    const limit = Math.min(rows.length, 12);
    let best = null;
    for (let index = 0; index < limit; index += 1) {
      const keys = (rows[index] || []).map(headerKey);
      const columns = {};
      keys.forEach((key, column) => { if (['type', 'title', ...OPTION_KEYS, 'correct', 'time', 'points', 'explanation', 'double'].includes(key) && columns[key] === undefined) columns[key] = column; });
      const options = OPTION_KEYS.filter(key => columns[key] !== undefined).length;
      const score = (columns.title !== undefined ? 4 : 0) + options + (columns.correct !== undefined ? 2 : 0)
        + (columns.type !== undefined ? 1 : 0) + (columns.time !== undefined ? 1 : 0) + (columns.points !== undefined ? 1 : 0);
      if (columns.title !== undefined && score >= 5 && (!best || score > best.score)) best = { columns, score, headerIndex: index };
    }
    if (best) return { columns: best.columns, start: best.headerIndex + 1, headerIndex: best.headerIndex };
    const first = rows.findIndex(row => (row || []).some(cell => text(cell)));
    const firstRow = rows[first] || [];
    if (typeKey(firstRow[0]) && text(firstRow[1])) {
      return { columns: { type: 0, title: 1, a: 2, b: 3, c: 4, d: 5, correct: 6, time: 7, points: 8, explanation: 9 }, start: first, headerIndex: -1 };
    }
    return { columns: { title: 0, a: 1, b: 2, c: 3, d: 4, correct: 5, time: 6, points: 7, explanation: 8 }, start: Math.max(0, first), headerIndex: -1 };
  }

  // A cell of accepted answers: split on ; or | when it has one (so an answer may hold a comma), else on commas.
  function answerList(value) {
    const raw = text(value);
    if (!raw) return [];
    const separator = /[;|؛]/.test(raw) ? /[;|؛]/ : /[,،]/;
    return raw.split(separator).map(part => part.trim().slice(0, ANSWER_MAX)).filter(Boolean);
  }

  function correctTokens(value) { return text(value).split(/[;|,،\s]+/).map(part => part.trim()).filter(Boolean); }

  // The choice letters as an Arabic teacher writes them: أ ب ج د هـ و for A to F.
  const ARABIC_LETTERS = { 'ا': 'A', 'ب': 'B', 'ج': 'C', 'د': 'D', 'ه': 'E', 'و': 'F' };
  function choiceIsCorrect(correct, choice, index) {
    const letter = LETTERS[index];
    const number = String(index + 1);
    const key = normalizeArabicKey(choice) || text(choice).toLowerCase();
    return correctTokens(correct).some(token => token.toUpperCase() === letter || token === number
      || ARABIC_LETTERS[normalizeArabicKey(token)] === letter
      || (key && (normalizeArabicKey(token) || token.toLowerCase()) === key));
  }

  const ARABIC_DIGITS = /[٠-٩۰-۹]/g;
  function number(value, fallback) {
    const raw = text(value).replace(ARABIC_DIGITS, digit => String(digit.charCodeAt(0) & 0xF));
    if (!raw) return fallback;
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  // The double points cell: yes, 2x, true, 1 or نعم. Anything else, or nothing, is a normal question.
  function isYes(value) { return /^(yes|y|true|1|2x|x2|double|نعم|مضاعف)$/i.test(text(value).replace(ARABIC_DIGITS, digit => String(digit.charCodeAt(0) & 0xF))); }

  // A matching cell: "left = right" (or → / ->).
  const PAIR = /\s*(?:=|→|->|⟶)\s*/;

  function rowToQuestion(row, columns, id) {
    const get = key => (columns[key] === undefined ? '' : text(row[columns[key]]));
    const options = OPTION_KEYS.map(get);
    const filled = options.filter(Boolean);
    const title = get('title').slice(0, TITLE_MAX);
    if (!title && !filled.length) return null;
    const named = typeKey(get('type'));
    if (named === 'hotspot') return { skipped: 'hotspot' };
    const type = named || 'mcq';
    const correct = get('correct');
    const question = { id: id('q'), type, title: title || 'Imported question', explanation: get('explanation'),
      timeLimit: number(get('time'), 20), points: number(get('points'), ['poll', 'wordcloud'].includes(type) ? 0 : 1000) };
    if (!['poll', 'wordcloud'].includes(type) && isYes(get('double'))) question.doublePoints = true;

    if (type === 'truefalse') {
      const trueText = options[0] || 'True';
      const falseText = options[1] || 'False';
      const isFalse = /^(B|FALSE|F|0|NO|خطا|خطأ|غلط)$/i.test(correct) || (!/^(A|TRUE|T|1|YES|صح)$/i.test(correct) && choiceIsCorrect(correct, falseText, 1));
      question.choices = [{ id: id('c'), text: 'True', correct: !isFalse }, { id: id('c'), text: 'False', correct: isFalse }];
    } else if (['mcq', 'multiselect', 'poll'].includes(type)) {
      question.choices = options.map((choice, index) => ({ id: id('c'), text: choice.slice(0, ANSWER_MAX),
        correct: type !== 'poll' && choiceIsCorrect(correct || 'A', choice, index) })).filter(choice => choice.text);
      if (!question.choices.length) question.choices = ['Answer 1', 'Answer 2'].map((choiceText, index) => ({ id: id('c'), text: choiceText, correct: type !== 'poll' && index === 0 }));
      if (type !== 'poll' && !question.choices.some(choice => choice.correct)) question.choices[0].correct = true;
    } else if (type === 'type') {
      question.acceptedAnswers = answerList(correct || options[0]);
    } else if (type === 'fillblank') {
      // One blank per option column, each with its accepted answers; an old file's single blank is in the correct column.
      const blanks = filled.length ? filled : [correct];
      question.fillBlanks = blanks.map((cell, index) => ({ id: id('blank'), label: `Blank ${index + 1}`, answers: answerList(cell) }))
        .filter(blank => blank.answers.length);
      question.acceptedAnswers = question.fillBlanks[0]?.answers || [];
    } else if (type === 'order') {
      question.orderItems = filled.map(item => ({ id: id('item'), text: item.slice(0, ANSWER_MAX) }));
    } else if (type === 'slider') {
      // A the lowest value, B the highest, C the step; D and E how far off still earns full and half points.
      const min = number(options[0], 0);
      const max = number(options[1], Math.max(min + 1, 20));
      question.slider = { min, max, correct: number(correct, Math.round((min + max) / 2)), step: number(options[2], 1),
        fullTolerance: number(options[3], 0), halfTolerance: number(options[4], 4) };
      if (!filled.length) Object.assign(question.slider, { min: 0, max: Math.max(20, question.slider.correct * 2) });
    } else if (type === 'matching') {
      if (filled.some(cell => PAIR.test(cell))) {
        question.matchingPairs = filled.map(cell => cell.split(PAIR)).filter(parts => parts.length >= 2 && text(parts[0]) && text(parts.slice(1).join(' = ')))
          .map(([left, ...right]) => ({ id: id('pair'), rightId: id('right'), left: text(left).slice(0, ANSWER_MAX), right: text(right.join(' = ')).slice(0, ANSWER_MAX) }));
      } else {
        // The old layout: the terms in the question, separated by | or ;, and their matches in A to D.
        const lefts = title.split(/[;|،]/).map(text).filter(Boolean);
        const count = Math.max(lefts.length, filled.length);
        question.matchingPairs = Array.from({ length: count }, (_, index) => ({ id: id('pair'), rightId: id('right'),
          left: lefts[index] || `Term ${index + 1}`, right: filled[index] || `Match ${index + 1}` }));
        question.title = lefts.length > 1 ? 'Match each item' : question.title;
      }
    } else if (type === 'wordcloud') {
      const perStudent = Math.round(number(correct, 1));
      question.wordCloud = { maxAnswers: perStudent >= 1 && perStudent <= 3 ? perStudent : 1 };
      question.points = 0;
    }
    return question;
  }

  // The quiz's title, from a "quiz title" row above the header, and its questions. Pin on Image rows are counted,
  // not imported: their picture cannot come in a spreadsheet.
  function rowsToQuiz(rows, { id = prefix => `${prefix}_${Math.random().toString(36).slice(2, 10)}` } = {}) {
    const clean = (rows || []).map(row => (Array.isArray(row) ? row : []));
    const layout = layoutOf(clean);
    let title = '';
    for (let index = 0; index < Math.max(0, layout.headerIndex); index += 1) {
      if (headerKey(clean[index][0]) === TITLE_LABEL && text(clean[index][1])) title = text(clean[index][1]).slice(0, 200);
    }
    const questions = [];
    let skipped = 0;
    for (const row of clean.slice(layout.start)) {
      if (!row.some(cell => text(cell))) continue;
      const question = rowToQuestion(row, layout.columns, id);
      if (!question) continue;
      if (question.skipped) { skipped += 1; continue; }
      questions.push(question);
    }
    return { title, questions, skipped };
  }

  // One question as a template row, or null for a type a row cannot carry.
  function questionToRow(question) {
    const q = question || {};
    const type = TYPES.includes(q.type) ? q.type : null;
    if (!type) return null;
    const options = ['', '', '', '', '', ''];
    let correct = '';
    const put = values => values.slice(0, 6).forEach((value, index) => { options[index] = value; });
    const choices = Array.isArray(q.choices) ? q.choices : [];
    if (type === 'truefalse') {
      put(['True', 'False']);
      correct = choices.find(choice => String(choice.text).toLowerCase() === 'false')?.correct ? 'False' : 'True';
    } else if (['mcq', 'multiselect', 'poll'].includes(type)) {
      put(choices.map(choice => String(choice.text ?? '')));
      correct = type === 'poll' ? '' : choices.slice(0, 6).map((choice, index) => (choice.correct ? LETTERS[index] : '')).filter(Boolean).join(',');
    } else if (type === 'type') {
      correct = (q.acceptedAnswers || []).map(text).filter(Boolean).join('; ');
    } else if (type === 'fillblank') {
      put((q.fillBlanks || []).map(blank => (blank.answers || []).map(text).filter(Boolean).join('; ')));
    } else if (type === 'order') {
      put((q.orderItems || []).map(item => String(item.text ?? '')));
    } else if (type === 'slider') {
      const slider = q.slider || {};
      put([slider.min ?? 0, slider.max ?? 20, slider.step ?? 1, slider.fullTolerance ?? 0, slider.halfTolerance ?? 4]);
      correct = slider.correct ?? 10;
    } else if (type === 'matching') {
      put((q.matchingPairs || []).map(pair => `${text(pair.left)} = ${text(pair.right)}`));
    } else if (type === 'wordcloud') {
      correct = Number(q.wordCloud?.maxAnswers || 1);
    }
    return [type, String(q.title ?? ''), ...options, correct, Number(q.timeLimit ?? 20), Number(q.points ?? 0), String(q.explanation ?? ''), q.doublePoints ? 'yes' : ''];
  }

  // The template's first sheet for a quiz: its title, the header, one row per question. Questions a row cannot carry
  // (Pin on Image) are counted in skipped.
  function quizToRows(quiz) {
    const list = Array.isArray(quiz?.Q) ? quiz.Q : Array.isArray(quiz?.questions) ? quiz.questions : [];
    const rows = [[TITLE_LABEL, String(quiz?.title || '')], HEADER];
    let skipped = 0;
    for (const question of list) {
      const row = questionToRow(question);
      if (row) rows.push(row); else skipped += 1;
    }
    return { rows, skipped };
  }

  // "Networks Quiz - 2026-09-28.xlsx": the quiz's name and the day, safe as a file name on any computer.
  function fileName(title, date = new Date()) {
    const name = String(title || '').replace(/[\\/:*?"<>|\u0000-\u001F]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80) || 'QuizPulse quiz';
    const pad = value => String(value).padStart(2, '0');
    return `${name} - ${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}.xlsx`;
  }

  // ---- A small .xlsx writer: stored (uncompressed) zip entries, inline strings, numbers as numbers ----------------------
  const CRC_TABLE = (() => {
    const table = new Uint32Array(256);
    for (let n = 0; n < 256; n += 1) {
      let c = n;
      for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
      table[n] = c >>> 0;
    }
    return table;
  })();
  function crc32(bytes) {
    let crc = 0xFFFFFFFF;
    for (let index = 0; index < bytes.length; index += 1) crc = CRC_TABLE[(crc ^ bytes[index]) & 0xFF] ^ (crc >>> 8);
    return (crc ^ 0xFFFFFFFF) >>> 0;
  }
  const utf8 = value => new TextEncoder().encode(value);
  const escapeXml = value => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
    // Characters XML 1.0 cannot hold at all.
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');

  function zip(files, date) {
    const dosTime = (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2);
    const dosDate = ((Math.max(1980, date.getFullYear()) - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
    const locals = [];
    const centrals = [];
    let offset = 0;
    for (const file of files) {
      const name = utf8(file.name);
      const data = file.data;
      const crc = crc32(data);
      const local = new DataView(new ArrayBuffer(30));
      local.setUint32(0, 0x04034B50, true); local.setUint16(4, 20, true); local.setUint16(6, 0x0800, true); local.setUint16(8, 0, true);
      local.setUint16(10, dosTime, true); local.setUint16(12, dosDate, true); local.setUint32(14, crc, true);
      local.setUint32(18, data.length, true); local.setUint32(22, data.length, true); local.setUint16(26, name.length, true); local.setUint16(28, 0, true);
      const central = new DataView(new ArrayBuffer(46));
      central.setUint32(0, 0x02014B50, true); central.setUint16(4, 20, true); central.setUint16(6, 20, true); central.setUint16(8, 0x0800, true);
      central.setUint16(10, 0, true); central.setUint16(12, dosTime, true); central.setUint16(14, dosDate, true); central.setUint32(16, crc, true);
      central.setUint32(20, data.length, true); central.setUint32(24, data.length, true); central.setUint16(28, name.length, true);
      central.setUint32(42, offset, true);
      locals.push(new Uint8Array(local.buffer), name, data);
      centrals.push(new Uint8Array(central.buffer), name);
      offset += 30 + name.length + data.length;
    }
    const centralSize = centrals.reduce((sum, part) => sum + part.length, 0);
    const end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054B50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true);
    end.setUint32(12, centralSize, true); end.setUint32(16, offset, true);
    const parts = [...locals, ...centrals, new Uint8Array(end.buffer)];
    const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
    let at = 0;
    for (const part of parts) { out.set(part, at); at += part.length; }
    return out;
  }

  function columnName(index) {
    let name = '';
    for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26)) name = String.fromCharCode(65 + ((n - 1) % 26)) + name;
    return name;
  }

  // sheets: [{ name, rows: [[cell...]], widths: [chars...], headerRow: index of a row shown bold }]. Numbers stay numbers;
  // everything else is an inline string, so nothing a teacher typed is ever read as a formula.
  function workbook(sheets, { date = new Date() } = {}) {
    const sheetXml = sheet => {
      const cols = (sheet.widths || []).map((width, index) => `<col min="${index + 1}" max="${index + 1}" width="${width}" customWidth="1"/>`).join('');
      const rows = (sheet.rows || []).map((row, rowIndex) => `<row r="${rowIndex + 1}">${row.map((value, column) => {
        if (value === '' || value === null || value === undefined) return '';
        const ref = `${columnName(column)}${rowIndex + 1}`;
        const style = rowIndex === sheet.headerRow ? ' s="1"' : '';
        return typeof value === 'number' && Number.isFinite(value)
          ? `<c r="${ref}"${style}><v>${value}</v></c>`
          : `<c r="${ref}"${style} t="inlineStr"><is><t xml:space="preserve">${escapeXml(value)}</t></is></c>`;
      }).join('')}</row>`).join('');
      return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${cols ? `<cols>${cols}</cols>` : ''}<sheetData>${rows}</sheetData></worksheet>`;
    };
    const names = sheets.map((sheet, index) => escapeXml(String(sheet.name || `Sheet${index + 1}`).replace(/[\\/?*[\]:]/g, ' ').slice(0, 31)));
    const files = [
      { name: '[Content_Types].xml', text: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheets.map((_, index) => `<Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>` },
      { name: '_rels/.rels', text: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>' },
      { name: 'xl/workbook.xml', text: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${names.map((name, index) => `<sheet name="${name}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`).join('')}</sheets></workbook>` },
      { name: 'xl/_rels/workbook.xml.rels', text: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_, index) => `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`).join('')}<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>` },
      { name: 'xl/styles.xml', text: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs></styleSheet>' },
      ...sheets.map((sheet, index) => ({ name: `xl/worksheets/sheet${index + 1}.xml`, text: sheetXml(sheet) }))
    ];
    return zip(files.map(file => ({ name: file.name, data: utf8(file.text) })), date);
  }

  // ---- The template ----------------------------------------------------------------------------------------------------
  const WIDTHS = [14, 44, 22, 22, 22, 22, 22, 22, 22, 8, 8, 40, 14];
  const GUIDE = [
    ['QuizPulse quiz template', ''],
    ['', ''],
    ['How it works', 'One question per row on the first sheet. Keep the header row as it is. Put your quiz title beside "quiz title".'],
    ['Types', TYPES.join(', ') + ' (Pin on Image cannot be made in a spreadsheet: add it after importing.)'],
    ['mcq', 'Choices in A to F. correct: the letter of the right choice, like B.'],
    ['truefalse', 'correct: True or False.'],
    ['multiselect', 'Choices in A to F. correct: every right letter, like A,C.'],
    ['poll', 'Choices in A to F. No correct answer; points 0.'],
    ['type', 'correct: the accepted answers, separated by ; (a comma is fine inside one answer when you use ;).'],
    ['fillblank', 'One blank per column A to F, each with its accepted answers separated by ;.'],
    ['order', 'The items in A to F, in the right order. Students see them shuffled.'],
    ['slider', 'A: lowest value, B: highest, C: step, D: how far off still earns full points, E: half points. correct: the right value.'],
    ['matching', 'Each of A to F is one pair: left = right, like Iraq = Baghdad.'],
    ['wordcloud', 'correct: how many words each student sends, 1 to 3. points 0.'],
    ['time', 'Seconds.'],
    ['points', '1000 is a normal question; 0 for polls and word clouds.'],
    ['double points', 'yes for a question worth double (2X); empty for a normal one.'],
    ['', ''],
    ['طريقة الاستخدام', 'سؤال واحد في كل صف في الورقة الأولى. لا تغيّر صف العناوين. اكتب عنوان الاختبار بجانب "quiz title".']
  ];

  function templateSheets(quiz) {
    const { rows, skipped } = quizToRows(quiz);
    return { sheets: [{ name: 'QuizPulse Template', rows, widths: WIDTHS, headerRow: 1 }, { name: 'How to use', rows: GUIDE, widths: [22, 110], headerRow: 0 }], skipped };
  }

  // The file a teacher downloads: their quiz, or with no quiz the examples below - one of every type.
  function exportQuiz(quiz, { date = new Date() } = {}) {
    const { sheets, skipped } = templateSheets(quiz);
    return { bytes: workbook(sheets, { date }), fileName: fileName(quiz?.title, date), skipped };
  }

  const EXAMPLE_QUIZ = {
    title: 'Example quiz',
    Q: [
      { type: 'mcq', title: 'What is the capital of Iraq?', choices: [['Baghdad', true], ['Basra'], ['Najaf'], ['Mosul']].map(([t, c]) => ({ text: t, correct: !!c })), timeLimit: 20, points: 1000, explanation: 'Baghdad is the capital city.' },
      { type: 'truefalse', title: 'The Earth orbits the Sun.', choices: [{ text: 'True', correct: true }, { text: 'False', correct: false }], timeLimit: 15, points: 1000 },
      { type: 'multiselect', title: 'Select the programming languages.', choices: [['Python', true], ['HTML'], ['Java', true], ['CSS'], ['C++', true]].map(([t, c]) => ({ text: t, correct: !!c })), timeLimit: 25, points: 1000 },
      { type: 'poll', title: 'Which topic do you like most?', choices: ['AI', 'Cybersecurity', 'Web', 'Networks'].map(t => ({ text: t, correct: false })), timeLimit: 20, points: 0 },
      { type: 'type', title: 'Write the abbreviation for Artificial Intelligence.', acceptedAnswers: ['AI', 'A.I.'], timeLimit: 20, points: 1000 },
      { type: 'fillblank', title: 'The capital of Iraq is ___ and of Egypt is ___.', fillBlanks: [{ answers: ['Baghdad', 'بغداد'] }, { answers: ['Cairo', 'القاهرة'] }], timeLimit: 30, points: 1000 },
      { type: 'order', title: 'Put these numbers in ascending order.', orderItems: ['1', '2', '3', '4'].map(t => ({ text: t })), timeLimit: 30, points: 1000, doublePoints: true },
      { type: 'slider', title: 'Choose the value of 5 + 5.', slider: { min: 0, max: 20, step: 1, fullTolerance: 0, halfTolerance: 2, correct: 10 }, timeLimit: 20, points: 1000 },
      { type: 'matching', title: 'Match each country with its capital.', matchingPairs: [['Iraq', 'Baghdad'], ['Turkey', 'Ankara'], ['France', 'Paris'], ['Japan', 'Tokyo']].map(([left, right]) => ({ left, right })), timeLimit: 30, points: 1000 },
      { type: 'wordcloud', title: 'One word for today\'s lecture?', wordCloud: { maxAnswers: 1 }, timeLimit: 30, points: 0 }
    ]
  };

  return { HEADER, TYPES, LETTERS, rowsToQuiz, quizToRows, questionToRow, exportQuiz, fileName, workbook, templateSheets, EXAMPLE_QUIZ, typeKey, headerKey };
}));
