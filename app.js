const textSelect = document.getElementById('textSelect');
const searchInput = document.getElementById('searchInput');
const inputField = document.getElementById('inputField');
const submitBtn = document.getElementById('submitBtn');
const hintBtn = document.getElementById('hintBtn');
const restartBtn = document.getElementById('restartBtn');
const resetStatsBtn = document.getElementById('resetStatsBtn');
const statsBtn = document.getElementById('statsBtn');
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

// === 统计上报相关 ===
function simpleHash(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash).toString(36);
}

function getBrowserFingerprint() {
  const raw = (navigator.userAgent || '') + '|' + screen.width + '|' + screen.height;
  return 'u_' + simpleHash(raw);
}

function reportStats(textKey, correctCnt, totalCnt) {
  try {
    const uid = getBrowserFingerprint();
    fetch('/api/stats', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text_key: textKey,
        correct_count: correctCnt,
        total_count: totalCnt,
        user_id: uid,
      }),
    }).catch(() => {}); // 静默失败
  } catch (e) {
    // 静默失败，不影响用户体验
  }
}

async function fetchGlobalStats() {
  try {
    const res = await fetch('/api/stats');
    if (!res.ok) throw new Error('fetch failed');
    return await res.json();
  } catch (e) {
    return null;
  }
}

function showStatsModal() {
  const modal = document.getElementById('statsModal');
  const content = document.getElementById('statsContent');
  content.innerHTML = '<p style="text-align:center;color:#999;">加载中...</p>';
  modal.classList.add('active');

  fetchGlobalStats().then(data => {
    if (!data) {
      content.innerHTML = '<p style="text-align:center;color:#e74c3c;">加载失败，请稍后重试</p>';
      return;
    }
    let html = `
      <div class="stats-summary">
        <div class="stats-item"><span class="stats-number">${data.total_times}</span><span class="stats-label">总背诵次数</span></div>
        <div class="stats-item"><span class="stats-number">${data.total_users}</span><span class="stats-label">参与用户数</span></div>
      </div>
    `;
    if (data.top_texts && data.top_texts.length > 0) {
      html += '<h3 style="margin:16px 0 10px;font-size:16px;">🔥 最热门篇目 Top10</h3>';
      html += '<div class="stats-table">';
      html += '<div class="stats-row stats-header"><span class="stats-rank">#</span><span class="stats-name">篇目</span><span class="stats-count">次数</span><span class="stats-rate">平均正确率</span></div>';
      data.top_texts.forEach((item, i) => {
        const rate = item.avg_rate != null ? item.avg_rate.toFixed(1) + '%' : '-';
        html += `<div class="stats-row"><span class="stats-rank">${i + 1}</span><span class="stats-name">${item.text_key}</span><span class="stats-count">${item.times}</span><span class="stats-rate">${rate}</span></div>`;
      });
      html += '</div>';
    } else {
      html += '<p style="text-align:center;color:#999;margin-top:20px;">暂无统计数据</p>';
    }
    content.innerHTML = html;
  });
}

function closeStatsModal() {
  document.getElementById('statsModal').classList.remove('active');
}

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
    
    // 上报背诵结果到云端
    reportStats(currentKey, correctCount, sentenceList.length);
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
  statsBtn.addEventListener('click', showStatsModal);

  // 关闭统计弹窗
  const closeStatsModal = document.getElementById('closeStatsModal');
  const statsModal = document.getElementById('statsModal');
  if (closeStatsModal) {
    closeStatsModal.addEventListener('click', () => {
      statsModal.classList.remove('active');
    });
  }
  if (statsModal) {
    statsModal.addEventListener('click', (e) => {
      if (e.target === statsModal) {
        statsModal.classList.remove('active');
      }
    });
  }
  inputField.addEventListener('keydown', e => {
    if (e.key === 'Enter') onSubmit();
  });
}

window.addEventListener('DOMContentLoaded', init);
