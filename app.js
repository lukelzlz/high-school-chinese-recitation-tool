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
const contextDisplay = document.getElementById('contextDisplay');
const resultDisplay = document.getElementById('resultDisplay');
const statUsage = document.getElementById('statUsage');
const statChars = document.getElementById('statChars');
const selectSentencesBtn = document.getElementById('selectSentencesBtn');
const sentencePickerModal = document.getElementById('sentencePickerModal');
const sentencePickerContent = document.getElementById('sentencePickerContent');

let filteredKeys = [];
let currentKey = '';
let sentenceList = [];
let currentIndex = 0;
let tryCount = 0;
let correctCount = 0; // 第一次尝试就答对的句子数
let hintCooldown = false;
let selectedIndices = null; // null = 全文模式，数组 = 选中的句子索引

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
      html += '<div class="stats-row stats-header"><span class="stats-rank">#</span><span class="stats-name">篇目</span><span class="stats-count">次数</span><span class="stats-rate">平均一次通过率</span></div>';
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
  const total = Object.keys(TEXTS_LIBRARY).length;
  statUsage.textContent = `使用次数: ${usage}`;
  statChars.textContent = `输入字数: ${chars}`;
  document.getElementById('statTotal').textContent = `篇目: ${total}`;
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

function getPracticeList() {
  if (selectedIndices !== null) {
    return selectedIndices.map(i => sentenceList[i]);
  }
  return sentenceList;
}

function updateProgress() {
  const practiceList = getPracticeList();
  const total = practiceList.length || 1;
  const current = Math.min(currentIndex + 1, total);
  const percent = practiceList.length ? (currentIndex / practiceList.length) * 100 : 0;
  progressFill.style.width = `${percent}%`;

  if (currentIndex >= practiceList.length && practiceList.length > 0) {
    const rate = ((correctCount / practiceList.length) * 100).toFixed(1);
    if (selectedIndices !== null) {
      progressText.textContent = `练习完成（已选 ${practiceList.length} 句）| 一次通过率：${rate}% | 一次通过：${correctCount}/${practiceList.length}`;
    } else {
      progressText.textContent = `全文完成 | 一次通过率：${rate}% | 一次通过：${correctCount}/${practiceList.length}`;
    }
  } else {
    if (selectedIndices !== null) {
      progressText.textContent = `第 ${current} 句（已选 ${practiceList.length} 句）| 进度：${current}/${practiceList.length}`;
    } else {
      progressText.textContent = `第 ${current} 句，请背诵 | 进度：${current}/${practiceList.length}`;
    }
  }
}

function showContext() {
  if (selectedIndices === null || !sentenceList.length) {
    contextDisplay.innerHTML = '';
    return;
  }

  const practiceList = getPracticeList();
  if (currentIndex >= practiceList.length) {
    contextDisplay.innerHTML = '';
    return;
  }

  const currentOriginalIndex = selectedIndices[currentIndex];
  const doneSet = new Set(selectedIndices.slice(0, currentIndex)); // 已真正背完的句子
  const selectedSet = new Set(selectedIndices);
  let html = '';

  sentenceList.forEach((sentence, i) => {
    if (i === currentOriginalIndex) {
      html += `<span class="ctx-current">（第 ${i + 1} 句 · 当前）</span>`;
    } else if (doneSet.has(i)) {
      // 已背完的选中句子：显示原文
      html += `<span class="ctx-done">${sentence}</span>`;
    } else if (!selectedSet.has(i)) {
      // 未选中的句子：灰显
      html += `<span class="ctx-skipped">${sentence}</span>`;
    }
    // 选中但未背到的句子：不显示（需要用户背诵）
  });

  contextDisplay.innerHTML = html;
}

function showCurrentSentence() {
  hintDisplay.textContent = '';
  compareDisplay.innerHTML = '';
  tryCount = 0;
  updateProgress();
  showContext();
  inputField.value = '';
  inputField.focus();

  if (!sentenceList.length) {
    showResult('当前篇目没有可背诵内容', 'error');
    return;
  }

  const practiceList = getPracticeList();
  if (currentIndex >= practiceList.length) {
    inputField.disabled = true;
    submitBtn.disabled = true;
    hintBtn.disabled = true;
    restartBtn.disabled = false;
    selectSentencesBtn.disabled = true;
    const rate = ((correctCount / practiceList.length) * 100).toFixed(1);
    if (selectedIndices !== null) {
      showResult(`练习完成（已选 ${practiceList.length} 句）<br>一次通过：${correctCount}<br>一次通过率：${rate}%`, 'success');
    } else {
      showResult(`背诵完成<br>总句数：${practiceList.length}<br>一次通过：${correctCount}<br>一次通过率：${rate}%`, 'success');
    }

    // 上报背诵结果到云端
    reportStats(currentKey, correctCount, practiceList.length);
  }
}

function selectText(key) {
  currentKey = key;
  currentIndex = 0;
  tryCount = 0;
  correctCount = 0;
  selectedIndices = null;
  sentenceList = splitTextToSentences(TEXTS_LIBRARY[key] || '');
  localStorage.setItem(STORAGE_KEYS.recent, key);
  inputField.disabled = false;
  submitBtn.disabled = false;
  hintBtn.disabled = false;
  restartBtn.disabled = true;
  selectSentencesBtn.disabled = false;
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
  const practiceList = getPracticeList();
  if (!practiceList.length || currentIndex >= practiceList.length) return;

  const userText = inputField.value.trim();
  addChars(userText.length);
  tryCount += 1;

  const correctText = practiceList[currentIndex];
  const userClean = normalizeText(userText);
  const correctClean = normalizeText(correctText);

  if (userClean === correctClean) {
    if (tryCount === 1) correctCount += 1;
    currentIndex += 1;
    showResult(`正确，进入下一句（本句尝试 ${tryCount} 次）`, 'success');
    showCurrentSentence();
  } else {
    showResult(`不对，再试一次（第 ${tryCount} 次）`, 'error');
    showCompare(userText, correctText);
  }
}

function onHint() {
  const practiceList = getPracticeList();
  if (hintCooldown || !practiceList.length || currentIndex >= practiceList.length) return;
  hintCooldown = true;
  hintBtn.disabled = true;
  hintBtn.textContent = '提示中...';

  const text = practiceList[currentIndex];
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

// === 句子选择弹窗 ===
function showSentencePicker() {
  if (!sentenceList.length) return;

  // 确定当前选中的索引集合
  let checkedSet = new Set();
  if (selectedIndices !== null) {
    checkedSet = new Set(selectedIndices);
  } else {
    // 全文模式：全部勾选
    sentenceList.forEach((_, i) => checkedSet.add(i));
  }

  let html = '';
  sentenceList.forEach((sentence, index) => {
    const isChecked = checkedSet.has(index);
    const isCurrent = selectedIndices !== null && selectedIndices[currentIndex] === index;
    html += `<label class="sentence-item${isCurrent ? ' active' : ''}" data-index="${index}">`;
    html += `<input type="checkbox" ${isChecked ? 'checked' : ''}>`;
    html += `<span class="sentence-number">${index + 1}</span>`;
    html += `<span class="sentence-text">${sentence}</span>`;
    html += '</label>';
  });

  sentencePickerContent.innerHTML = html;
  updatePickerStartBtn(checkedSet.size);
  sentencePickerModal.classList.add('active');

  // 复选框事件
  sentencePickerContent.querySelectorAll('.sentence-item input[type="checkbox"]').forEach(cb => {
    cb.addEventListener('change', () => {
      updatePickerStartBtn(sentencePickerContent.querySelectorAll('input[type="checkbox"]:checked').length);
    });
  });

  // 设置"从第N句开始"输入框范围
  const fromInput = document.getElementById('pickerFromInput');
  fromInput.max = sentenceList.length;
  fromInput.value = '1';
}

function updatePickerStartBtn(count) {
  const btn = document.getElementById('pickerStartBtn');
  btn.textContent = `开始练习（已选 ${count} 句）`;
}

function closeSentencePicker() {
  sentencePickerModal.classList.remove('active');
}

function startSelectedPractice() {
  const checkboxes = sentencePickerContent.querySelectorAll('input[type="checkbox"]:checked');
  const indices = Array.from(checkboxes).map(cb => parseInt(cb.closest('.sentence-item').dataset.index));

  if (!indices.length) {
    showResult('请至少选择一句', 'error');
    return;
  }

  // 如果选了全部句子，使用全文模式
  if (indices.length === sentenceList.length) {
    selectedIndices = null;
  } else {
    selectedIndices = indices;
  }

  currentIndex = 0;
  tryCount = 0;
  correctCount = 0;
  inputField.disabled = false;
  submitBtn.disabled = false;
  hintBtn.disabled = false;
  restartBtn.disabled = true;
  selectSentencesBtn.disabled = false;

  closeSentencePicker();
  const practiceList = getPracticeList();
  if (selectedIndices !== null) {
    showResult(`已选择 ${practiceList.length} 句，开始练习`);
  }
  showCurrentSentence();
  addUsage();
}

function pickerSelectAll() {
  sentencePickerContent.querySelectorAll('input[type="checkbox"]').forEach(cb => cb.checked = true);
  updatePickerStartBtn(sentenceList.length);
}

function pickerDeselectAll() {
  sentencePickerContent.querySelectorAll('input[type="checkbox"]').forEach(cb => cb.checked = false);
  updatePickerStartBtn(0);
}

function pickerFromN() {
  const input = document.getElementById('pickerFromInput');
  const n = parseInt(input.value) || 1;
  const clamped = Math.max(1, Math.min(n, sentenceList.length));
  sentencePickerContent.querySelectorAll('.sentence-item').forEach(item => {
    const idx = parseInt(item.dataset.index);
    item.querySelector('input[type="checkbox"]').checked = idx >= clamped - 1;
  });
  updatePickerStartBtn(sentencePickerContent.querySelectorAll('input[type="checkbox"]:checked').length);
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
  selectSentencesBtn.addEventListener('click', showSentencePicker);

  // 句子选择弹窗事件
  document.getElementById('pickerSelectAll').addEventListener('click', pickerSelectAll);
  document.getElementById('pickerDeselectAll').addEventListener('click', pickerDeselectAll);
  document.getElementById('pickerFromBtn').addEventListener('click', pickerFromN);
  document.getElementById('pickerStartBtn').addEventListener('click', startSelectedPractice);

  const closeSentencePickerBtn = document.getElementById('closeSentencePicker');
  if (closeSentencePickerBtn) {
    closeSentencePickerBtn.addEventListener('click', closeSentencePicker);
  }
  sentencePickerModal.addEventListener('click', (e) => {
    if (e.target === sentencePickerModal) closeSentencePicker();
  });

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
    if (e.ctrlKey && e.key === 'h') { e.preventDefault(); onHint(); }
    if (e.ctrlKey && e.key === 'r') { e.preventDefault(); onRestart(); }
  });
}

window.addEventListener('DOMContentLoaded', init);
