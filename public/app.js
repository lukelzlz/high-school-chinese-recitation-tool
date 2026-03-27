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
const toggleHandwritingBtn = document.getElementById('toggleHandwritingBtn');
const handwritingSection = document.getElementById('handwritingSection');
const handwritingCanvas = document.getElementById('handwritingCanvas');
const undoStrokeBtn = document.getElementById('undoStrokeBtn');
const clearCanvasBtn = document.getElementById('clearCanvasBtn');
const recognizeBtn = document.getElementById('recognizeBtn');
const handwritingStatus = document.getElementById('handwritingStatus');
const voiceInputBtn = document.getElementById('voiceInputBtn');
const voiceStatus = document.getElementById('voiceStatus');
const voiceStatusText = document.getElementById('voiceStatusText');

let filteredKeys = [];
let currentKey = '';
let sentenceList = [];
let currentIndex = 0;
let tryCount = 0;
let correctCount = 0; // 第一次尝试就答对的句子数
let hintCooldown = false;
let selectedIndices = null; // null = 全文模式，数组 = 选中的句子索引
let handwritingMode = false;
let isDrawing = false;
let strokes = [];         // [{x, y, t}, ...] 每个元素是一个笔画
let currentStroke = [];
let currentStrokeStartTime = 0;
let isRecognizing = false;
let browserRecognizer = null; // 浏览器 Handwriting Recognition API
let isRecording = false;
let mediaRecorder = null;
let audioChunks = [];

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

// === 手写输入相关 ===

function getCanvasCoords(e) {
  const rect = handwritingCanvas.getBoundingClientRect();
  const scaleX = handwritingCanvas.width / rect.width;
  const scaleY = handwritingCanvas.height / rect.height;
  let clientX, clientY;
  if (e.touches && e.touches.length > 0) {
    clientX = e.touches[0].clientX;
    clientY = e.touches[0].clientY;
  } else {
    clientX = e.clientX;
    clientY = e.clientY;
  }
  return {
    x: (clientX - rect.left) * scaleX,
    y: (clientY - rect.top) * scaleY,
  };
}

function getCanvasCoordsWithTime(e) {
  const { x, y } = getCanvasCoords(e);
  return { x, y, t: Date.now() - currentStrokeStartTime };
}

function redrawCanvas() {
  const ctx = handwritingCanvas.getContext('2d');
  ctx.clearRect(0, 0, handwritingCanvas.width, handwritingCanvas.height);
  ctx.strokeStyle = '#333';
  ctx.lineWidth = 4;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const stroke of strokes) {
    if (stroke.length < 2) continue;
    ctx.beginPath();
    ctx.moveTo(stroke[0].x, stroke[0].y);
    for (let i = 1; i < stroke.length; i++) {
      ctx.lineTo(stroke[i].x, stroke[i].y);
    }
    ctx.stroke();
  }
  if (currentStroke.length >= 2) {
    ctx.beginPath();
    ctx.moveTo(currentStroke[0].x, currentStroke[0].y);
    for (let i = 1; i < currentStroke.length; i++) {
      ctx.lineTo(currentStroke[i].x, currentStroke[i].y);
    }
    ctx.stroke();
  }
}

function startDrawing(e) {
  if (isRecognizing) return;
  e.preventDefault();
  isDrawing = true;
  currentStrokeStartTime = Date.now();
  const { x, y } = getCanvasCoords(e);
  currentStroke = [{ x, y, t: 0 }];
}

function draw(e) {
  if (!isDrawing || isRecognizing) return;
  e.preventDefault();
  currentStroke.push(getCanvasCoordsWithTime(e));
  redrawCanvas();
}

function stopDrawing(e) {
  if (!isDrawing) return;
  e.preventDefault();
  isDrawing = false;
  if (currentStroke.length > 0) {
    strokes.push([...currentStroke]);
    currentStroke = [];
  }
}

function undoStroke() {
  if (strokes.length > 0) {
    strokes.pop();
    redrawCanvas();
  }
}

function clearCanvas() {
  strokes = [];
  currentStroke = [];
  isDrawing = false;
  redrawCanvas();
  handwritingStatus.textContent = '';
}

function toggleHandwriting() {
  handwritingMode = !handwritingMode;
  if (handwritingMode) {
    handwritingSection.style.display = 'block';
    handwritingSection.classList.add('active');
    toggleHandwritingBtn.textContent = '键盘模式';
    toggleHandwritingBtn.classList.remove('btn-secondary');
    toggleHandwritingBtn.classList.add('btn-primary');
  } else {
    handwritingSection.style.display = 'none';
    handwritingSection.classList.remove('active');
    toggleHandwritingBtn.textContent = '手写模式';
    toggleHandwritingBtn.classList.remove('btn-primary');
    toggleHandwritingBtn.classList.add('btn-secondary');
    clearCanvas();
    inputField.focus();
  }
}

async function recognizeWithBrowserAPI() {
  if (!('createHandwritingRecognizer' in navigator)) return null;

  try {
    if (!browserRecognizer) {
      browserRecognizer = await navigator.createHandwritingRecognizer({ languages: ['zh'] });
    }
    const drawing = browserRecognizer.startDrawing({ recognitionType: 'text' });
    for (const stroke of strokes) {
      const hwStroke = new HandwritingStroke();
      for (const point of stroke) {
        hwStroke.addPoint({ x: point.x, y: point.y, t: point.t });
      }
      drawing.addStroke(hwStroke);
    }
    const [prediction] = await drawing.getPrediction();
    return prediction?.text?.trim() || null;
  } catch (e) {
    console.warn('浏览器手写识别失败，将使用服务器识别:', e.message);
    return null;
  }
}

async function recognizeWithServer() {
  const dataUrl = handwritingCanvas.toDataURL('image/png');
  const response = await fetch('/api/recognize', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ image: dataUrl }),
  });
  if (!response.ok) throw new Error('识别服务暂不可用');
  const data = await response.json();
  if (data.error) throw new Error(data.error);
  return data.text?.trim() || '';
}

async function recognizeHandwriting() {
  if (isRecognizing) return;
  if (strokes.length === 0) {
    handwritingStatus.textContent = '请先在画布上书写文字';
    return;
  }

  isRecognizing = true;
  recognizeBtn.disabled = true;
  recognizeBtn.textContent = '识别中...';
  handwritingSection.classList.add('recognizing');

  const hasBrowserAPI = 'createHandwritingRecognizer' in navigator;
  handwritingStatus.textContent = hasBrowserAPI ? '正在识别...' : '正在使用服务器识别...';

  try {
    let text = await recognizeWithBrowserAPI();
    if (!text) {
      handwritingStatus.textContent = '正在使用服务器识别...';
      text = await recognizeWithServer();
    }

    if (text) {
      inputField.value += text;
      clearCanvas();
      handwritingStatus.textContent = '识别结果已添加到输入框';
      setTimeout(() => {
        if (handwritingStatus.textContent === '识别结果已添加到输入框') {
          handwritingStatus.textContent = '';
        }
      }, 2000);
    } else {
      handwritingStatus.textContent = '未能识别文字，请重试';
    }
  } catch (err) {
    if (err.message.includes('Failed to fetch') || err.message.includes('NetworkError')) {
      handwritingStatus.textContent = '网络不可用，请使用支持手写识别的浏览器（Chrome/Edge）';
    } else {
      handwritingStatus.textContent = '识别出错: ' + (err.message || '未知错误');
    }
    handwritingStatus.style.color = '#e74c3c';
    setTimeout(() => { handwritingStatus.style.color = '#999'; }, 3000);
  } finally {
    isRecognizing = false;
    recognizeBtn.disabled = false;
    recognizeBtn.textContent = '识别';
    handwritingSection.classList.remove('recognizing');
  }
}

// === 语音输入相关 ===

function updateVoiceStatus(text, show) {
  voiceStatusText.textContent = text;
  voiceStatus.style.display = show ? 'flex' : 'none';
}

async function toggleVoiceInput() {
  if (isRecording) {
    stopRecording();
  } else {
    await startRecording();
  }
}

async function startRecording() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
      ? 'audio/webm;codecs=opus'
      : MediaRecorder.isTypeSupported('audio/webm')
        ? 'audio/webm'
        : '';
    mediaRecorder = mimeType
      ? new MediaRecorder(stream, { mimeType })
      : new MediaRecorder(stream);
    audioChunks = [];

    mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) audioChunks.push(e.data);
    };

    mediaRecorder.onstop = () => {
      stream.getTracks().forEach(t => t.stop());
      transcribeAudio();
    };

    mediaRecorder.start();
    isRecording = true;
    voiceInputBtn.textContent = '⏹ 停止录音';
    voiceInputBtn.classList.remove('btn-secondary');
    voiceInputBtn.classList.add('btn-danger');
    updateVoiceStatus('录音中... 点击停止按钮结束', true);
  } catch (err) {
    if (err.name === 'NotAllowedError') {
      showResult('麦克风权限被拒绝，请在浏览器设置中允许', 'error');
    } else if (err.name === 'NotFoundError') {
      showResult('未检测到麦克风设备', 'error');
    } else {
      showResult('无法启动录音: ' + err.message, 'error');
    }
  }
}

function stopRecording() {
  if (mediaRecorder && mediaRecorder.state === 'recording') {
    mediaRecorder.stop();
  }
  isRecording = false;
  voiceInputBtn.textContent = '🎤 语音输入';
  voiceInputBtn.classList.remove('btn-danger');
  voiceInputBtn.classList.add('btn-secondary');
}

async function transcribeAudio() {
  if (audioChunks.length === 0) {
    updateVoiceStatus('', false);
    return;
  }

  const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
  updateVoiceStatus('正在识别语音...', true);
  voiceInputBtn.disabled = true;

  try {
    const response = await fetch('/api/transcribe', {
      method: 'POST',
      body: audioBlob,
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      throw new Error(errData.error || '语音识别服务暂不可用');
    }

    const data = await response.json();
    const text = (data.text || '').trim();

    if (text) {
      inputField.value += text;
      updateVoiceStatus('识别结果已添加到输入框', true);
      setTimeout(() => updateVoiceStatus('', false), 2000);
    } else {
      updateVoiceStatus('未能识别语音，请重试', true);
      setTimeout(() => updateVoiceStatus('', false), 3000);
    }
  } catch (err) {
    if (err.message.includes('Failed to fetch') || err.message.includes('NetworkError')) {
      showResult('网络不可用，语音识别需要网络连接', 'error');
    } else {
      showResult('语音识别出错: ' + err.message, 'error');
    }
    updateVoiceStatus('', false);
  } finally {
    audioChunks = [];
    voiceInputBtn.disabled = false;
  }
}

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
    toggleHandwritingBtn.disabled = true;
    voiceInputBtn.disabled = true;
    if (handwritingMode) toggleHandwriting();
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
  toggleHandwritingBtn.disabled = false;
  voiceInputBtn.disabled = false;
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

  // 手写输入事件
  toggleHandwritingBtn.addEventListener('click', toggleHandwriting);
  voiceInputBtn.addEventListener('click', toggleVoiceInput);
  handwritingCanvas.addEventListener('mousedown', startDrawing);
  handwritingCanvas.addEventListener('mousemove', draw);
  handwritingCanvas.addEventListener('mouseup', stopDrawing);
  handwritingCanvas.addEventListener('mouseleave', stopDrawing);
  handwritingCanvas.addEventListener('touchstart', startDrawing, { passive: false });
  handwritingCanvas.addEventListener('touchmove', draw, { passive: false });
  handwritingCanvas.addEventListener('touchend', stopDrawing, { passive: false });
  handwritingCanvas.addEventListener('touchcancel', stopDrawing, { passive: false });
  undoStrokeBtn.addEventListener('click', undoStroke);
  clearCanvasBtn.addEventListener('click', clearCanvas);
  recognizeBtn.addEventListener('click', recognizeHandwriting);

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
