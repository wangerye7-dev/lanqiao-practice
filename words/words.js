'use strict';
const $ = id => document.getElementById(id);
const KEY = 'lanqiao-python-words-v1';
const esc = text => String(text).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const shuffled = items => { const copy = [...items]; for (let i = copy.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [copy[i], copy[j]] = [copy[j], copy[i]]; } return copy; };
let data, byId, state = {format:KEY, version:1, known:[], review:[], lastQuiz:null};
let category = 'first', mode = 'learn', current = null, flash = null, quiz = null;
let worker, ready = false, busy = false, runId = 0, bootTimer, deadline, runTimer;
const drafts = new Map();

function toast(message) {
  $('toast').textContent = message; $('toast').hidden = false;
  clearTimeout(toast.timer); toast.timer = setTimeout(() => { $('toast').hidden = true; }, 3800);
}
function storageWarning(message) { $('storage-warning').textContent = message; $('storage-warning').hidden = false; }
function normalize(record) {
  if (!record || record.format !== KEY || record.version !== 1 || !Array.isArray(record.known) || !Array.isArray(record.review)) throw Error('不是本页的词语记录文件');
  if ([...record.known, ...record.review].some(id => typeof id !== 'string' || !byId.has(id))) throw Error('记录包含无法识别的词语');
  const review = [...new Set(record.review)], known = [...new Set(record.known)].filter(id => !review.includes(id));
  let lastQuiz = null;
  if (record.lastQuiz && Number.isInteger(record.lastQuiz.correct) && Number.isInteger(record.lastQuiz.total) && record.lastQuiz.total > 0 && record.lastQuiz.total <= 8 && record.lastQuiz.correct >= 0 && record.lastQuiz.correct <= record.lastQuiz.total) lastQuiz = {correct:record.lastQuiz.correct, total:record.lastQuiz.total};
  return {format:KEY, version:1, known, review, lastQuiz};
}
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(state)); }
  catch { storageWarning('当前浏览器不能保存记录。请用页尾“导出词语记录”备份，关闭页面前不要清理数据。'); }
  updateStats();
}
function updateStats() {
  $('known-count').textContent = state.known.length;
  $('review-count').textContent = state.review.length;
  const basics = data.cards.filter(c => c.first && state.known.includes(c.id)).length;
  $('progress-message').textContent = basics < 10 ? `入门 10 词 · 已记住 ${basics} 个` : '入门 10 词已记住，继续动手练';
}
function setStatus(id, status) {
  state.known = state.known.filter(x => x !== id); state.review = state.review.filter(x => x !== id);
  if (status === 'known') state.known.push(id);
  if (status === 'review') state.review.push(id);
  save();
}
function filtered() {
  const query = $('search').value.trim().toLowerCase();
  return data.cards.filter(c => (category === 'all' || (category === 'first' ? c.first : c.category === category)) && (!$('review-only').checked || state.review.includes(c.id)) && (!query || `${c.term} ${c.meaning} ${c.explanation} ${c.kind}`.toLowerCase().includes(query)));
}
function scopeName() { return category === 'all' ? '全部词语' : category === 'first' ? '入门先学 10 词' : data.categories.find(c => c.id === category).name; }
function renderFilters() {
  const groups = [{id:'first', name:'入门先学 10 词'}, {id:'all', name:'全部'}, ...data.categories];
  $('categories').innerHTML = groups.map(c => `<button data-category="${c.id}" class="${category === c.id ? 'active' : ''}" aria-pressed="${category === c.id}">${esc(c.name)}</button>`).join('');
  $('match-count').textContent = `当前范围 ${filtered().length} 项`;
}
function emptyHTML() {
  return `<div class="empty"><h3>${$('review-only').checked && !state.review.length ? '还没有待复习的词' : '这个范围里没有匹配的词'}</h3><p>可以换一个分类、清空搜索，或先学几个入门词。</p><button data-action="clear-filters">查看全部词语</button></div>`;
}
function stashDraft() {
  if (current && $('editor')) drafts.set(current.id, {code:$('editor').value, input:$('stdin').value});
}
function renderList() {
  const items = filtered();
  $('word-list').innerHTML = items.map(c => `<button class="word-button ${current?.id === c.id ? 'active' : ''}" data-word="${c.id}" ${current?.id === c.id ? 'aria-current="true"' : ''}><strong>${esc(c.term)}</strong><small>${esc(c.meaning)}</small><span class="word-state" aria-label="${state.known.includes(c.id) ? '已记住' : state.review.includes(c.id) ? '待复习' : '未标记'}">${state.known.includes(c.id) ? '✓' : state.review.includes(c.id) ? '↻' : ''}</span></button>`).join('');
}
function showWord(id, focus = false) {
  stashDraft(); cancelRun(); current = byId.get(id);
  if (!current) { $('detail').innerHTML = emptyHTML(); return; }
  const c = current, draft = drafts.get(c.id) || {code:c.code, input:c.input};
  history.replaceState(null, '', `#${encodeURIComponent(c.id)}`);
  $('detail').innerHTML = `<div class="detail-head"><div><span class="kind">${esc(c.kind)}</span><h2>${esc(c.term)}</h2><p class="detail-meaning">${esc(c.meaning)}</p></div><span class="muted">${c.first ? '入门必会' : esc(data.categories.find(x => x.id === c.category).name)}</span></div>
    <p class="detail-explanation">${esc(c.explanation)}</p><div class="learn-actions"><button id="mark-known" aria-pressed="${state.known.includes(c.id)}">✓ ${state.known.includes(c.id) ? '已记住' : '我记住了'}</button><button id="mark-review" aria-pressed="${state.review.includes(c.id)}">↻ ${state.review.includes(c.id) ? '已加入复习' : '加入待复习'}</button></div>
    <div class="example-title"><h3>${c.error ? '看一看报错，再试着修好它' : '改一行，运行看看'}</h3><button class="text-button small" id="restore-example">恢复例子</button></div>
    <label class="sr-only" for="editor">可编辑的 Python 代码</label><textarea id="editor" class="code-editor" rows="${Math.min(9, Math.max(4, c.code.split('\n').length + 1))}" spellcheck="false" autocorrect="off" autocapitalize="off" autocomplete="off" wrap="off"></textarea>
    <label class="stdin-label" for="stdin">输入数据 <span>每个 input() 读取一行；不需要时留空</span></label><textarea id="stdin" rows="1" spellcheck="false" placeholder="需要输入时，在这里填写"></textarea>
    <div class="run-bar"><button id="run-code" class="primary">▷ 运行代码</button><button id="stop-code" hidden>停止</button><span id="runtime-status" class="runtime-status" role="status">${ready ? 'Python 已就绪' : '首次运行时准备 Python；查词与小测无需等待。'}</span></div>
    <div id="run-output" class="output" hidden aria-live="polite"><strong id="output-title"></strong><pre id="output-text"></pre></div>
    <details class="expectation"><summary>查看原例子的${c.error ? '报错名称' : '预期结果'}</summary><pre>${esc(c.error || c.output || '（没有输出）')}</pre></details>
    <p class="tip"><strong>易错提醒</strong>${esc(c.tip)}</p>${c.lesson ? `<a class="lesson-link" href="../#${c.lesson}">去练题室动手写 · ${c.lesson} →</a>` : ''}`;
  $('editor').value = draft.code; $('stdin').value = draft.input;
  $('editor').addEventListener('keydown', event => { if (event.key === 'Tab') { event.preventDefault(); const e = event.target; e.setRangeText('    ', e.selectionStart, e.selectionEnd, 'end'); } });
  $('mark-known').onclick = () => { stashDraft(); setStatus(c.id, state.known.includes(c.id) ? null : 'known'); refreshLearnStatus(); };
  $('mark-review').onclick = () => { stashDraft(); setStatus(c.id, state.review.includes(c.id) ? null : 'review'); refreshLearnStatus(); };
  $('restore-example').onclick = () => { $('editor').value = c.code; $('stdin').value = c.input; drafts.delete(c.id); $('run-output').hidden = true; };
  $('run-code').onclick = runCode; $('stop-code').onclick = () => { cancelRun(true); output('已停止', '代码仍在，可以检查循环条件后再试。'); };
  renderList();
  if (focus) { $('detail').focus({preventScroll:true}); if (innerWidth <= 620) $('detail').scrollIntoView({behavior:'smooth', block:'start'}); }
}
function refreshLearnStatus() {
  renderFilters(); renderList();
  const known = state.known.includes(current.id), review = state.review.includes(current.id);
  $('mark-known').textContent = known ? '✓ 已记住' : '✓ 我记住了'; $('mark-known').setAttribute('aria-pressed', known);
  $('mark-review').textContent = review ? '↻ 已加入复习' : '↻ 加入待复习'; $('mark-review').setAttribute('aria-pressed', review);
  // A removed review card stays visible until navigation, so its code is not lost.
}
function renderLearn() {
  const items = filtered(); stashDraft();
  if (!items.length) { cancelRun(); current = null; $('word-list').innerHTML = ''; $('detail').innerHTML = emptyHTML(); return; }
  showWord(items.some(c => c.id === current?.id) ? current.id : items[0].id);
}
function setMode(next) {
  stashDraft(); cancelRun(); mode = next;
  document.querySelectorAll('[data-mode]').forEach(b => { const active = b.dataset.mode === mode; b.classList.toggle('active', active); b.setAttribute('aria-pressed', active); });
  for (const name of ['learn','flash','quiz']) $(`${name}-panel`).hidden = name !== mode;
  if (mode === 'learn') renderLearn();
  if (mode === 'flash') { flash = {items:shuffled(filtered()), index:0, revealed:false, known:0}; renderFlash(); }
  if (mode === 'quiz') { quiz = null; renderQuizIntro(); }
}
function filtersChanged() { renderFilters(); setMode(mode); }

function renderFlash() {
  const panel = $('flash-panel');
  if (!flash.items.length) { panel.innerHTML = emptyHTML(); return; }
  if (flash.index >= flash.items.length) {
    panel.innerHTML = `<div class="session-panel"><div class="quiz-intro"><p class="eyebrow">这一轮完成了</p><h2>再用一道题，检验理解</h2><p>本轮翻过 ${flash.items.length} 张卡，你标记记住了 ${flash.known} 张。记不牢的词已放入待复习。</p><div class="session-actions"><button class="primary" data-action="go-quiz">去自测</button><button data-action="restart-flash">再翻一轮</button></div></div></div>`; return;
  }
  const c = flash.items[flash.index];
  panel.innerHTML = `<div class="session-panel"><div class="session-top"><h2>先想一想，它是什么意思？</h2><span>第 ${flash.index + 1} / ${flash.items.length} 张</span></div><button class="flash-card" id="flip-card" aria-expanded="${flash.revealed}"><span class="kind">${esc(c.kind)}</span><span class="flash-word">${esc(c.term)}</span><span class="flash-hint">${flash.revealed ? '再点一次，收起答案' : '点卡片或按空格，翻开答案'}</span>${flash.revealed ? `<span class="flash-answer"><strong>${esc(c.meaning)}</strong><pre>${esc(c.code)}</pre></span>` : ''}</button><div class="session-actions"><button id="flash-review" ${flash.revealed ? '' : 'disabled'}>还不熟，再复习</button><button class="primary" id="flash-known" ${flash.revealed ? '' : 'disabled'}>记住了，下一张</button><button id="flash-skip">先跳过</button></div><p class="session-info">先翻开答案，再如实标记。不会的词可以反复练。</p></div>`;
  $('flip-card').onclick = () => { flash.revealed = !flash.revealed; renderFlash(); $('flip-card').focus({preventScroll:true}); };
  $('flash-known').onclick = () => advanceFlash('known'); $('flash-review').onclick = () => advanceFlash('review'); $('flash-skip').onclick = () => advanceFlash(null);
}
function advanceFlash(status) {
  if (status && !flash.revealed) return;
  if (status) { setStatus(flash.items[flash.index].id, status); if (status === 'known') flash.known++; }
  flash.index++; flash.revealed = false; renderFilters(); renderFlash(); $('flip-card')?.focus({preventScroll:true});
}
function renderQuizIntro() {
  const items = filtered();
  if (!items.length) { $('quiz-panel').innerHTML = emptyHTML(); return; }
  const count = Math.min(8, items.length);
  $('quiz-panel').innerHTML = `<div class="session-panel"><div class="quiz-intro"><p class="eyebrow">先理解，再检查</p><h2>来一轮 ${count} 题小测</h2><p>范围：${esc(scopeName())}${$('review-only').checked ? ' · 待复习词' : ''}。题目结合词义辨认与代码理解，每题作答后立即给出解释，答错的词自动加入待复习。</p><p class="muted">不计时，可以慢慢想。改变上方筛选会重新开始一轮。</p>${state.lastQuiz ? `<p class="muted">上次完成：${state.lastQuiz.correct} / ${state.lastQuiz.total} 题正确</p>` : ''}<button id="start-quiz" class="primary">开始自测 →</button></div></div>`;
  $('start-quiz').onclick = startQuiz;
}
function wordQuestion(c) {
  const sameGroup = data.cards.filter(x => x.category === c.category && x.id !== c.id && x.meaning !== c.meaning);
  const otherGroup = data.cards.filter(x => x.category !== c.category && x.meaning !== c.meaning);
  const distractors = [...new Set([...shuffled(sameGroup), ...shuffled(otherGroup)].map(x => x.meaning))].slice(0,3);
  return {word:c.id, question:`${c.term} 在本词条里的意思是？`, code:'', options:[c.meaning,...distractors], answer:0, explanation:c.explanation};
}
function startQuiz() {
  const items = shuffled(filtered()).slice(0,8);
  if (!items.length) { renderQuizIntro(); return; }
  const questions = items.map((c, index) => {
    const custom = data.quizzes.find(q => q.word === c.id);
    const q = {...(custom && index % 2 === 0 ? custom : wordQuestion(c))};
    const correct = q.options[q.answer]; q.options = shuffled(q.options); q.answer = q.options.indexOf(correct); return q;
  });
  quiz = {questions, index:0, correct:0, selected:null, wrong:[]}; renderQuestion();
}
function renderQuestion() {
  const q = quiz.questions[quiz.index];
  $('quiz-panel').innerHTML = `<div class="session-panel"><div class="session-top"><h2>闯关自测</h2><span>第 ${quiz.index + 1} / ${quiz.questions.length} 题 · 已答对 ${quiz.correct} 题</span></div><progress class="quiz-progress" max="${quiz.questions.length}" value="${quiz.index}" aria-label="本轮答题进度"></progress><h3 class="question-heading" tabindex="-1" id="question-heading">${esc(q.question)}</h3>${q.code ? `<pre class="quiz-code">${esc(q.code)}</pre>` : ''}<div class="quiz-options">${q.options.map((option,i) => `<button class="quiz-option" data-answer="${i}"><span class="option-letter">${'ABCD'[i]}</span><span>${esc(option)}</span></button>`).join('')}</div><div id="answer-feedback" class="answer-feedback" role="status" hidden></div><div class="quiz-next"><button class="text-button" data-action="restart-quiz">重新开始</button><button class="primary" id="next-question" disabled>${quiz.index === quiz.questions.length - 1 ? '查看本轮结果 →' : '下一题 →'}</button></div></div>`;
  $('next-question').onclick = () => { if (quiz.selected === null) return; quiz.index++; quiz.selected = null; quiz.index < quiz.questions.length ? renderQuestion() : finishQuiz(); };
  $('question-heading').focus({preventScroll:true});
}
function answerQuestion(index) {
  if (!quiz || quiz.selected !== null) return;
  const q = quiz.questions[quiz.index]; if (!Number.isInteger(index) || index < 0 || index >= q.options.length) return;
  quiz.selected = index; const correct = index === q.answer;
  if (correct) { quiz.correct++; state.review = state.review.filter(id => id !== q.word); save(); }
  else { quiz.wrong.push(q.word); setStatus(q.word, 'review'); }
  document.querySelectorAll('[data-answer]').forEach(b => { b.disabled = true; const n = Number(b.dataset.answer); if (n === q.answer) b.classList.add('correct'); if (n === index && !correct) b.classList.add('wrong'); });
  const feedback = $('answer-feedback'); feedback.hidden = false; feedback.classList.toggle('wrong', !correct);
  feedback.innerHTML = `<strong>${correct ? '答对了' : `这题再看一下 · 正确答案 ${'ABCD'[q.answer]}`}</strong><p>${esc(q.explanation)}</p>${correct ? '' : '<p class="muted">这个词已加入待复习，答对相关题目后会移出。</p>'}`;
  $('next-question').disabled = false; renderFilters();
}
function finishQuiz() {
  state.lastQuiz = {correct:quiz.correct, total:quiz.questions.length}; save();
  $('quiz-panel').innerHTML = `<div class="session-panel"><div class="quiz-intro"><p class="eyebrow">本轮完成</p><div class="big-number">${quiz.correct}<span class="muted"> / ${quiz.questions.length}</span></div><h2>${quiz.wrong.length ? '把这几个词，再用一遍' : '这一轮，都理解了'}</h2><p>${quiz.wrong.length ? '下面的词已加入待复习。看懂解释后，再改一行代码试试。' : '可以换一组词继续学，也可以回到练题室，把它们写进程序里。'}</p></div>${quiz.wrong.length ? `<ul class="wrong-list">${quiz.wrong.map(id => `<li><span><code>${esc(byId.get(id).term)}</code> · ${esc(byId.get(id).meaning)}</span><button class="text-button" data-study="${id}">去复习 →</button></li>`).join('')}</ul>` : ''}<div class="session-actions"><button class="primary" data-action="restart-quiz">再测一轮</button>${quiz.wrong.length ? '<button data-action="review-mistakes">复习错词</button>' : '<a class="back-link" href="../">去练题室 →</a>'}</div></div>`;
}

function runtimeStatus(message) { if ($('runtime-status')) $('runtime-status').textContent = message; }
function output(title, text, error = false) {
  if (!$('run-output')) return;
  $('run-output').hidden = false; $('run-output').classList.toggle('error', error); $('output-title').textContent = title; $('output-text').textContent = text;
}
function busyButtons(value) { busy = value; if ($('run-code')) { $('run-code').disabled = value; $('run-code').textContent = value ? '正在运行…' : '▷ 运行代码'; $('stop-code').hidden = !value; } }
function clearTimers() { clearTimeout(bootTimer); clearTimeout(deadline); clearTimeout(runTimer); }
function cancelRun(force = false) {
  if (busy || force) { runId++; clearTimers(); worker?.terminate(); worker = null; ready = false; busyButtons(false); runtimeStatus('已停止。再次点击“运行代码”可重新启动。'); }
}
function runCode() {
  if (busy || !current) return;
  stashDraft(); const id = ++runId, wordId = current.id, payload = {id,mode:'run',code:$('editor').value,input:$('stdin').value};
  busyButtons(true); $('run-output').hidden = true;
  const fail = message => { if (id !== runId) return; cancelRun(true); output('暂时无法运行', message, true); runtimeStatus('点击“运行代码”可重试。查词、翻卡与自测仍可使用。'); };
  const send = () => { if (id !== runId || current?.id !== wordId) return; runtimeStatus('Python 正在运行…'); worker.postMessage(payload); runTimer = setTimeout(() => fail('运行超过 10 秒，已停止。请检查循环能否结束，或减少计算量。'), 10000); };
  if (ready && worker) { worker.onmessage = handle; worker.onerror = () => fail('Python 运行环境出错，请重新运行。'); send(); return; }
  runtimeStatus('首次准备 Python，可能需要下载约 5 MB 运行文件…');
  try { worker = new Worker('../runner.js'); } catch { fail('浏览器未能启动运行环境，请换用手机自带浏览器后重试。'); return; }
  const activeWorker = worker;
  const keepWaiting = () => { clearTimeout(bootTimer); bootTimer = setTimeout(() => fail('运行文件下载较慢或网络中断，请稍后重试。'), 90000); };
  keepWaiting(); deadline = setTimeout(() => fail('Python 准备时间过长，请检查网络后重试。'), 240000);
  worker.onmessage = handle; worker.onerror = () => { if (worker === activeWorker) fail('Python 运行环境出错，请重新运行。'); };
  function handle({data:message}) {
    if (id !== runId || current?.id !== wordId) return;
    if (message.type === 'boot-progress') { runtimeStatus(message.message); clearTimeout(bootTimer); bootTimer = setTimeout(() => fail('下载中断，请稍后重试。'), 90000); }
    if (message.type === 'boot-error') fail('运行文件加载失败。请稍后重试，或换一个网络再试。');
    if (message.type === 'ready') { clearTimeout(bootTimer); clearTimeout(deadline); ready = true; send(); }
    if (message.type === 'result' && message.id === id) {
      clearTimeout(runTimer); busyButtons(false); runtimeStatus('Python 已就绪');
      const r = message.result;
      if (r.ok) output('本次运行结果', r.output || '（程序执行完成，没有输出。可以用 print 显示结果。）');
      else output(`${r.error || '运行出错'}${r.line ? ` · 第 ${r.line} 行` : ''}`, `${r.output || ''}${r.message || ''}${current.error === r.error ? '\n\n这是本词条演示的报错。按下方提醒改一改，再运行。' : ''}`, true);
    }
  }
}
function exportProgress() {
  const blob = new Blob([JSON.stringify({...state, exportedAt:new Date().toISOString()}, null, 2)], {type:'application/json'});
  const url = URL.createObjectURL(blob), a = document.createElement('a'); a.href = url; a.download = 'Python常用词_学习记录.json'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 2000);
}
async function importProgress(file) {
  try {
    if (!file || file.size > 100000) throw Error('文件为空或过大');
    const incoming = normalize(JSON.parse(await file.text()));
    state.review = [...new Set([...state.review, ...incoming.review])];
    state.known = [...new Set([...state.known, ...incoming.known])].filter(id => !state.review.includes(id));
    state.lastQuiz = incoming.lastQuiz || state.lastQuiz; save(); filtersChanged(); toast('记录已合并；待复习标记优先保留。');
  } catch (e) { toast(`没有导入：${e instanceof SyntaxError ? '文件不是有效的 JSON' : e.message}。请选择本页导出的词语记录。`); }
  finally { $('import-file').value = ''; }
}
function bind() {
  document.addEventListener('click', event => {
    const b = event.target.closest('button'); if (!b) return;
    if (b.dataset.mode) setMode(b.dataset.mode);
    if (b.dataset.category) { category = b.dataset.category; filtersChanged(); }
    if (b.dataset.word) showWord(b.dataset.word, true);
    if (b.dataset.answer !== undefined) answerQuestion(Number(b.dataset.answer));
    if (b.dataset.study) { category = 'all'; $('search').value = ''; $('review-only').checked = false; renderFilters(); setMode('learn'); showWord(b.dataset.study,true); }
    if (b.dataset.action === 'clear-filters') { category = 'all'; $('search').value = ''; $('review-only').checked = false; filtersChanged(); }
    if (b.dataset.action === 'restart-flash') setMode('flash');
    if (b.dataset.action === 'go-quiz') setMode('quiz');
    if (b.dataset.action === 'restart-quiz') { quiz = null; renderQuizIntro(); }
    if (b.dataset.action === 'review-mistakes') { category = 'all'; $('search').value = ''; $('review-only').checked = true; renderFilters(); setMode('learn'); }
  });
  $('search').oninput = () => { if ($('search').value.trim()) category = 'all'; filtersChanged(); };
  $('review-only').onchange = () => { if ($('review-only').checked) category = 'all'; filtersChanged(); };
  $('export-progress').onclick = exportProgress; $('import-progress').onclick = () => $('import-file').click();
  $('import-file').onchange = () => { if ($('import-file').files[0]) importProgress($('import-file').files[0]); };
  window.addEventListener('pagehide', () => { clearTimers(); worker?.terminate(); worker = null; ready = false; busyButtons(false); });
  window.addEventListener('pageshow', e => { if (e.persisted) runtimeStatus('点击“运行代码”即可启动 Python。'); });
  window.addEventListener('hashchange', () => { let id; try { id = decodeURIComponent(location.hash.slice(1)); } catch { return; } if (byId.has(id)) { category = 'all'; $('search').value = ''; $('review-only').checked = false; renderFilters(); setMode('learn'); showWord(id); } });
}
async function init() {
  try {
    const response = await fetch('words.json?v=20261102-1'); if (!response.ok) throw Error('词库加载失败');
    data = await response.json(); byId = new Map(data.cards.map(c => [c.id,c]));
    try { const raw = localStorage.getItem(KEY); if (raw) state = normalize(JSON.parse(raw)); }
    catch { storageWarning('暂时无法读取原有词语记录。本次仍可学习，完成后请导出记录备份。'); }
    let id; try { id = decodeURIComponent(location.hash.slice(1)); } catch { id = ''; }
    if (byId.has(id)) { current = byId.get(id); category = current.first ? 'first' : current.category; }
    $('total-count').textContent = data.cards.length; updateStats(); renderFilters(); bind(); setMode('learn');
  } catch { $('load-error').hidden = false; $('match-count').textContent = '词库未加载'; }
}
init();
