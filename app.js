const textSelect = document.getElementById('textSelect');
const searchInput = document.getElementById('searchInput');
const inputField = document.getElementById('inputField');
const submitBtn = document.getElementById('submitBtn');
const hintBtn = document.getElementById('hintBtn');
const restartBtn = document.getElementById('restartBtn');
const resetStatsBtn = document.getElementById('resetStatsBtn');
const progressText = document.getElementById('progressText');
const progressFill = document.getElementById('progressFill');
const hintDisplay = document.getElementById('hintDisplay');
const compareDisplay = document.getElementById('compareDisplay');
const resultDisplay = document.getElementById('resultDisplay');
const statUsage = document.getElementById('statUsage');
const statChars = document.getElementById('statChars');

let filteredKeys = [];
let currentKey = '';
let sentenceList = [];
let currentIndex = 0;
let tryCount = 0;
let correctCount = 0;
let hintCooldown = false;

const STORAGE_KEYS = {
  usage: 'recitation_usage_count',
  chars: 'recitation_total_input_chars',
  recent: 'recitation_recent_text'
};

function splitTextToSentences(text) {
  if (!text) return [];
  const parts = text
    .split(/[，。！？；：]/g)
    .map(item => item.trim())
    .filter(item => item.length >= 2);
  return parts;
}

function normalizeText(text) {
  return (text || '')
    .replace(/[\s\n\r]/g, '')
    .replace(/[，。！？；：“”‘’、,.!?;:]/g, '')
    .trim();
}

function loadStats() {
  const usage = Number(localStorage.getItem(STORAGE_KEYS.usage) || 0);
  const chars = Number(localStorage.getItem(STORAGE_KEYS.chars) || 0);
  statUsage.textContent = `使用次数: ${usage}`;
  statChars.textContent = `输入字数: ${chars}`;
}

function addUsage() {
  const usage = Number(localStorage.getItem(STORAGE_KEYS.usage) || 0) + 1;
  localStorage.setItem(STORAGE_KEYS.usage, usage);
  loadStats();
}

function addChars(count) {
  const chars = Number(localStorage.getItem(STORAGE_KEYS.chars) || 0) + count;
  localStorage.setItem(STORAGE_KEYS.chars, chars);
  loadStats();
}

function resetStats() {
  localStorage.removeItem(STORAGE_KEYS.usage);
  localStorage.removeItem(STORAGE_KEYS.chars);
  localStorage.removeItem(STORAGE_KEYS.recent);
  loadStats();
  showResult('统计已重置', 'success');
}

function showResult(text, type = '') {
  resultDisplay.innerHTML = text;
  resultDisplay.className = `result-display ${type}`.trim();
}

function renderOptions(keys) {
  textSelect.innerHTML = '';
  keys.forEach(key => {
    const option = document.createElement('option');
    option.value = key;
    option.textContent = key;
    textSelect.appendChild(option);
  });
}

function updateProgress() {
  const total = sentenceList.length || 1;
  const current = Math.min(currentIndex + 1, total);
  const percent = sentenceList.length ? (currentIndex / sentenceList.length) * 100 : 0;
  progressFill.style.width = `${percent}%`;

  if (currentIndex >= sentenceList.length && sentenceList.length > 0) {
    const rate = ((correctCount / sentenceList.length) * 100).toFixed(1);
    progressText.textContent = `全文完成 | 正确率：${rate}% | 正确句数：${correctCount}/${sentenceList.length}`;
  } else {
    progressText.textContent = `第 ${current} 句，请背诵 | 进度：${current}/${sentenceList.length}`;
  }
}

function showCurrentSentence() {
  hintDisplay.textContent = '';
  compareDisplay.innerHTML = '';
  tryCount = 0;
  updateProgress();
  inputField.value = '';
  inputField.focus();

  if (!sentenceList.length) {
    showResult('当前篇目没有可背诵内容', 'error');
    return;
  }

  if (currentIndex >= sentenceList.length) {
    inputField.disabled = true;
    submitBtn.disabled = true;
    hintBtn.disabled = true;
    restartBtn.disabled = false;
    const rate = ((correctCount / sentenceList.length) * 100).toFixed(1);
    showResult(`背诵完成<br>总句数：${sentenceList.length}<br>正确数：${correctCount}<br>正确率：${rate}%`, 'success');
  }
}

function selectText(key) {
  currentKey = key;
  currentIndex = 0;
  tryCount = 0;
  correctCount = 0;
  sentenceList = splitTextToSentences(TEXTS_LIBRARY[key] || '');
  localStorage.setItem(STORAGE_KEYS.recent, key);
  inputField.disabled = false;
  submitBtn.disabled = false;
  hintBtn.disabled = false;
  restartBtn.disabled = true;
  showResult(`已加载：${key}`);
  showCurrentSentence();
  addUsage();
}

function showCompare(user, correct) {
  let html = '正确句子：';
  for (let i = 0; i < correct.length; i++) {
    if (i < user.length && user[i] === correct[i]) {
      html += correct[i];
    } else {
      html += `<span class="error">${correct[i]}</span>`;
    }
  }
  compareDisplay.innerHTML = html;
}

function onSubmit() {
  if (!sentenceList.length || currentIndex >= sentenceList.length) return;

  const userText = inputField.value.trim();
  addChars(userText.length);
  tryCount += 1;

  const correctText = sentenceList[currentIndex];
  const userClean = normalizeText(userText);
  const correctClean = normalizeText(correctText);

  if (userClean === correctClean) {
    correctCount += 1;
    currentIndex += 1;
    showResult(`正确，进入下一句（本句尝试 ${tryCount} 次）`, 'success');
    showCurrentSentence();
  } else {
    showResult(`不对，再试一次（第 ${tryCount} 次）`, 'error');
    showCompare(userText, correctText);
  }
}

function onHint() {
  if (hintCooldown || !sentenceList.length || currentIndex >= sentenceList.length) return;
  hintCooldown = true;
  hintBtn.disabled = true;
  hintBtn.textContent = '提示中...';

  const text = sentenceList[currentIndex];
  const count = Math.min(4, text.length);
  const positions = [];
  const pool = Array.from({ length: text.length }, (_, i) => i);

  for (let i = 0; i < count; i++) {
    const index = Math.floor(Math.random() * pool.length);
    positions.push(pool[index]);
    pool.splice(index, 1);
  }

  hintDisplay.textContent = text
    .split('')
    .map((char, index) => (positions.includes(index) ? char : '□'))
    .join('');

  setTimeout(() => {
    hintCooldown = false;
    hintBtn.disabled = false;
    hintBtn.textContent = '提示';
  }, 1500);
}

function onRestart() {
  if (!currentKey) return;
  selectText(currentKey);
}

function onSearch() {
  const keyword = searchInput.value.trim();
  const allKeys = Object.keys(TEXTS_LIBRARY);
  filteredKeys = keyword
    ? allKeys.filter(key => key.includes(keyword))
    : allKeys;

  renderOptions(filteredKeys);
  if (filteredKeys.length) {
    selectText(filteredKeys[0]);
  } else {
    textSelect.innerHTML = '<option value="">没有匹配篇目</option>';
    sentenceList = [];
    currentKey = '';
    updateProgress();
    showResult('没有找到匹配篇目', 'error');
  }
}

function init() {
  loadStats();
  filteredKeys = Object.keys(TEXTS_LIBRARY);
  renderOptions(filteredKeys);

  const recent = localStorage.getItem(STORAGE_KEYS.recent);
  const initial = recent && TEXTS_LIBRARY[recent] ? recent : filteredKeys[0];
  if (initial) {
    textSelect.value = initial;
    selectText(initial);
  }

  textSelect.addEventListener('change', e => selectText(e.target.value));
  searchInput.addEventListener('input', onSearch);
  submitBtn.addEventListener('click', onSubmit);
  hintBtn.addEventListener('click', onHint);
  restartBtn.addEventListener('click', onRestart);
  resetStatsBtn.addEventListener('click', resetStats);
  inputField.addEventListener('keydown', e => {
    if (e.key === 'Enter') onSubmit();
  });
}

window.addEventListener('DOMContentLoaded', init);
