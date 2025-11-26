// assets/js/dashboard.js

// ===== CONFIG =====
const FACE_API_URL = "https://colab-example-url/face";   // placeholder
const TEXT_API_URL = "https://colab-example-url/text";   // placeholder
const AUDIO_API_URL = "https://colab-example-url/audio"; // placeholder

const CONFIDENCE_THRESHOLD = 0.7; // 70%

let webcamStream = null;
let capturedImageDataUrl = null;
let emotionChart = null;
let highlightedEmotion = null;
let legendClickFlag = false;
let userEntries = [];
let pendingCheckinContext = null;

// Audio recording
let audioStream = null;
let mediaRecorder = null;
let audioChunks = [];
let recordedAudioBlob = null;
let audioWaveAnimationId = null;
let audioContext = null;
let analyserNode = null;
let pendingAudioCandidates = [];
let currentTranscript = ""; // auto diary text from voice

// ===== INIT =====
document.addEventListener("DOMContentLoaded", () => {
  setupModalButtons();
  setupCheckinOpenButton();
  setupCheckinButton();
  setupAudioRecording();
  initClock();       
  loadUserData();
});

function initClock() {
  const clockEl = document.getElementById("clock");
  if (!clockEl) return;

  function updateClock() {
    const now = new Date();

    // Force Asia/Jakarta (WIB) regardless of user OS timezone
    const dateFormatter = new Intl.DateTimeFormat("en-CA", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      timeZone: "Asia/Jakarta"
    });

    const timeFormatter = new Intl.DateTimeFormat("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
      timeZone: "Asia/Jakarta"
    });

    const dateStr = dateFormatter.format(now);   // YYYY-MM-DD
    const timeStr = timeFormatter.format(now);   // HH:MM:SS

    clockEl.textContent = `${dateStr} · ${timeStr} WIB`;
  }

  updateClock();
  setInterval(updateClock, 1000);
}

// ===== HELPER: today as local YYYY-MM-DD =====
function getTodayString() {
  return new Date().toLocaleDateString("en-CA"); // will be WIB if browser is WIB
}

// ===== LOAD USER DATA =====
async function loadUserData() {
  try {
    const res = await fetch("backend/get_user_data.php");
    if (res.status === 401) {
      window.location.href = "login.html";
      return;
    }
    const data = await res.json();
    if (!data.success) throw new Error(data.message || "Failed to load user data");

    document.getElementById("userEmail").textContent = data.email;
    userEntries = Array.isArray(data.entries) ? data.entries : [];

    updateStreakAndRecap(data.streak, data.recap);
    updateChart(userEntries);
    updateCheckinPanel(userEntries);
  } catch (err) {
    console.error(err);
    const statusEl = document.getElementById("checkinStatus");
    if (statusEl) statusEl.textContent = "Failed to load dashboard data.";
  }
}

// ===== STREAK & RECAP UI =====
function updateStreakAndRecap(streak, recapArray) {
  document.getElementById("streakValue").textContent = streak || 0;

  const recapList = document.getElementById("recapList");
  recapList.innerHTML = "";

  if (Array.isArray(recapArray) && recapArray.length) {
    recapArray.forEach((msg) => {
      const li = document.createElement("li");
      li.textContent = msg;
      recapList.appendChild(li);
    });
  } else {
    const li = document.createElement("li");
    li.textContent = "No recap yet. Keep checking in!";
    recapList.appendChild(li);
  }
}
function applyHighlightStyles() {
  if (!emotionChart) return;

  emotionChart.data.datasets.forEach((ds) => {
    const isHighlighted = !highlightedEmotion || ds.label === highlightedEmotion;

    ds.borderWidth = isHighlighted ? 3 : 1;
    ds.borderColor = isHighlighted
      ? ds.borderColor.replace(/0\.?\d*\)$/, "1)")
      : ds.borderColor.replace("1)", "0.18)");
    ds.pointRadius = isHighlighted ? 3 : 1.5;
    ds.pointBackgroundColor = isHighlighted
      ? ds.pointBackgroundColor
      : ds.pointBackgroundColor.replace("1)", "0.3)");
  });
}
// ===== CHART =====
// ===== CHART (SIMPLE BAR, ONE BAR PER DAY BY FINAL EMOTION) =====
function updateChart(entries) {
  const ctx = document.getElementById("emotionChart").getContext("2d");

  // Map date -> candidates { happy: x, sad: y, angry: z }
  // And date -> diary/transcript
  const dateMap = {};   // { "2025-11-12": { happy: 76.23, sad: 12.01, angry: 11.76 }, ... }
  const diaryMap = {};  // { "2025-11-12": "Had a productive day..." }

  entries.forEach((e) => {
    if (!e.date || !e.emotion || !Array.isArray(e.emotion.candidates)) return;

    const row = { happy: 0, sad: 0, angry: 0 };
    e.emotion.candidates.forEach((c) => {
      const label = (c.label || "").toLowerCase();
      if (label === "happy" || label === "sad" || label === "angry") {
        const v = Number(c.confidence) || 0;
        row[label] = Number((v * 100).toFixed(2)); // 0–100 with 2 decimals
      }
    });

    dateMap[e.date] = row;
    diaryMap[e.date] = e.diary || ""; // save transcript/diary for tooltip
  });

  const dates = Object.keys(dateMap).sort();
  const EMOTIONS = ["happy", "sad", "angry"];

  const baseColors = {
    happy: "rgba(34, 197, 94, 1)",   // green
    sad:   "rgba(59, 130, 246, 1)",  // blue
    angry: "rgba(239, 68, 68, 1)"    // red
  };

  const datasets = EMOTIONS.map((emotion) => ({
    label: emotion,
    data: dates.map((d) => (dateMap[d] ? dateMap[d][emotion] : 0)),
    fill: false,
    borderColor: baseColors[emotion],
    borderWidth: 2,
    tension: 0.25,
    pointRadius: 3,
    pointHoverRadius: 4,
    pointBackgroundColor: baseColors[emotion]
  }));

  if (emotionChart) emotionChart.destroy();

  emotionChart = new Chart(ctx, {
    type: "line",
    data: {
      labels: dates,
      datasets
    },
    options: {
      responsive: true,
      plugins: {
        legend: {
          display: true,
          labels: { usePointStyle: true },
          onClick: (e, legendItem, legend) => {
            legendClickFlag = true;

            const clickedEmotion = legendItem.text; // "happy" / "sad" / "angry"
            if (highlightedEmotion === clickedEmotion) {
              highlightedEmotion = null;
            } else {
              highlightedEmotion = clickedEmotion;
            }

            applyHighlightStyles();
            emotionChart.update();
          }
        },
        tooltip: {
          callbacks: {
            label: function (context) {
              const emo = context.dataset.label;
              const val = context.parsed.y;
              const date = context.label;
              const diary = diaryMap[date] || "(no diary recorded)";

              // multiple lines in tooltip
              return [
                `${emo}: ${val.toFixed(2)}%`,
                `Diary: ${diary}`
              ];
            }
          }
        }
      },
      scales: {
        y: {
          beginAtZero: true,
          suggestedMax: 100,
          ticks: {
            callback: (value) => `${value}%`
          }
        },
        x: {
          grid: { display: false }
        }
      }
    }
  });

  applyHighlightStyles();
}


// ===== CHECK-IN PANEL =====
function updateCheckinPanel(entries) {
  const todayStr = getTodayString();
  let todayEntry = null;

  entries.forEach((entry) => {
    if (entry.date === todayStr) todayEntry = entry;
  });

  const alreadyEl = document.getElementById("alreadyCheckedIn");
  const ctaText = document.getElementById("checkinStatus");
  const openBtn = document.getElementById("checkInOpenBtn");

  if (todayEntry) {
    alreadyEl.classList.remove("hidden");
    document.getElementById("todayFinalEmotion").textContent =
      todayEntry.emotion && todayEntry.emotion.final ? todayEntry.emotion.final : "-";
    document.getElementById("todayDiary").textContent = todayEntry.diary || "-";

    ctaText.textContent = "You have already checked in today.";
    openBtn.disabled = true;
    openBtn.classList.add("opacity-60", "cursor-not-allowed");
  } else {
    alreadyEl.classList.add("hidden");
    ctaText.textContent = "You haven't checked in yet today.";
    openBtn.disabled = false;
    openBtn.classList.remove("opacity-60", "cursor-not-allowed");
  }
}

// ===== MODAL: OPEN/CLOSE & WEBCAM INIT =====
function setupCheckinOpenButton() {
  const openBtn = document.getElementById("checkInOpenBtn");
  const modal = document.getElementById("checkinModal");
  const closeBtn = document.getElementById("closeCheckinModalBtn");

  openBtn.addEventListener("click", async () => {
    modal.classList.remove("hidden");
    resetCheckinModalState();
    await initWebcam();
  });

  closeBtn.addEventListener("click", () => {
    modal.classList.add("hidden");
    stopWebcam();
    stopAudioWave();
  });
}

function resetCheckinModalState() {
  capturedImageDataUrl = null;
  recordedAudioBlob = null;
  pendingAudioCandidates = [];
  currentTranscript = "";

  const preview = document.getElementById("capturePreview");
  preview.classList.add("hidden");
  preview.src = "";

  const playback = document.getElementById("audioPlayback");
  playback.classList.add("hidden");
  playback.src = "";

  const recordStatus = document.getElementById("recordStatus");
  recordStatus.textContent = "Tap the mic to record your voice diary.";

  const transcriptDisplay = document.getElementById("transcriptDisplay");
  transcriptDisplay.textContent = "Your transcript will appear here after recording.";
}

async function initWebcam() {
  if (webcamStream) return;

  try {
    webcamStream = await navigator.mediaDevices.getUserMedia({ video: true });
    const video = document.getElementById("webcam");
    video.srcObject = webcamStream;
  } catch (err) {
    console.error("Error accessing webcam:", err);
    alert("Could not access webcam. Please check browser permissions.");
  }

  const captureBtn = document.getElementById("captureBtn");
  captureBtn.addEventListener("click", captureFrame);
}

function stopWebcam() {
  if (webcamStream) {
    webcamStream.getTracks().forEach((t) => t.stop());
    webcamStream = null;
  }
}

function captureFrame() {
  const video = document.getElementById("webcam");
  if (!video || !video.videoWidth || !video.videoHeight) {
    alert("Webcam is not ready yet.");
    return;
  }

  const canvas = document.createElement("canvas");
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

  capturedImageDataUrl = canvas.toDataURL("image/jpeg");

  const preview = document.getElementById("capturePreview");
  preview.src = capturedImageDataUrl;
  preview.classList.remove("hidden");
}

// ===== AUDIO RECORDING + WAVEFORM =====
function setupAudioRecording() {
  const recordBtn = document.getElementById("recordBtn");
  recordBtn.addEventListener("click", async () => {
    if (!mediaRecorder || mediaRecorder.state === "inactive") {
      await startRecording();
    } else if (mediaRecorder.state === "recording") {
      stopRecording();
    }
  });
}

async function startRecording() {
  try {
    audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch (err) {
    console.error("Error accessing microphone:", err);
    alert("Could not access microphone. Please check browser permissions.");
    return;
  }

  audioChunks = [];
  mediaRecorder = new MediaRecorder(audioStream);
  const recordBtn = document.getElementById("recordBtn");
  const recordStatus = document.getElementById("recordStatus");
  const playback = document.getElementById("audioPlayback");

  recordBtn.textContent = "⏹ Stop recording";
  recordStatus.textContent = "Recording... speak now.";
  playback.classList.add("hidden");

  mediaRecorder.ondataavailable = (e) => {
    if (e.data.size > 0) audioChunks.push(e.data);
  };

  mediaRecorder.onstop = async () => {
    recordedAudioBlob = new Blob(audioChunks, { type: "audio/webm" });

    if (audioStream) {
      audioStream.getTracks().forEach((t) => t.stop());
      audioStream = null;
    }

    // playback
    const audioUrl = URL.createObjectURL(recordedAudioBlob);
    playback.src = audioUrl;
    playback.classList.remove("hidden");

    recordBtn.textContent = "🎙 Start recording";
    recordStatus.textContent = "Recording finished. You can replay or re-record.";

    stopAudioWave();

    // send to audio API: get transcript + audio-based emotion
    try {
      const audioResult = await sendAudioToAPI(recordedAudioBlob);

      // transcript
      if (audioResult && audioResult.transcript) {
        currentTranscript = audioResult.transcript;
        const transcriptDisplay = document.getElementById("transcriptDisplay");
        transcriptDisplay.textContent = currentTranscript;
      } else {
        currentTranscript = "";
      }

      // emotion candidates from audio
      const rawCandidates = normalizeCandidates(audioResult);
      const reduced = reduceToThreeEmotions(rawCandidates);
      pendingAudioCandidates = reduced;
    } catch (err) {
      console.error("Audio API error:", err);
    }
  };

  mediaRecorder.start();

  startAudioWave(audioStream);
}

function stopRecording() {
  if (mediaRecorder && mediaRecorder.state === "recording") {
    mediaRecorder.stop();
  }
}

function startAudioWave(stream) {
  const canvas = document.getElementById("audioWaveCanvas");
  const ctx = canvas.getContext("2d");

  audioContext = new (window.AudioContext || window.webkitAudioContext)();
  const source = audioContext.createMediaStreamSource(stream);
  analyserNode = audioContext.createAnalyser();
  analyserNode.fftSize = 2048;
  source.connect(analyserNode);

  const bufferLength = analyserNode.fftSize;
  const dataArray = new Uint8Array(bufferLength);

  function draw() {
    audioWaveAnimationId = requestAnimationFrame(draw);
    analyserNode.getByteTimeDomainData(dataArray);

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "rgba(0, 0, 0, 0.02)";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.lineWidth = 2;
    ctx.strokeStyle = "rgba(249, 115, 22, 1)";
    ctx.beginPath();

    const sliceWidth = canvas.width / bufferLength;
    let x = 0;

    for (let i = 0; i < bufferLength; i++) {
      const v = dataArray[i] / 128.0;
      const y = (v * canvas.height) / 2;

      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);

      x += sliceWidth;
    }

    ctx.lineTo(canvas.width, canvas.height / 2);
    ctx.stroke();
  }

  draw();
}

function stopAudioWave() {
  if (audioWaveAnimationId) {
    cancelAnimationFrame(audioWaveAnimationId);
    audioWaveAnimationId = null;
  }
  if (audioContext) {
    audioContext.close();
    audioContext = null;
  }
}

// ===== GRADIO / COLAB API CALLS =====
function normalizeCandidates(apiResponse) {
  if (!apiResponse) return [];

  if (Array.isArray(apiResponse.predictions)) {
    return apiResponse.predictions.map((p) => ({
      label: p.label,
      confidence: Number(p.confidence)
    }));
  }

  if (Array.isArray(apiResponse)) {
    return apiResponse.map((p) => ({
      label: p.label || p[0],
      confidence: Number(p.confidence || p[1])
    }));
  }

  return [];
}

const EMOTION_BUCKET_MAP = {
  happy: "happy",
  joy: "happy",
  excited: "happy",
  surprise: "happy",
  neutral: "happy",
  calm: "happy",

  sad: "sad",
  depressed: "sad",
  bored: "sad",
  tired: "sad",
  lonely: "sad",
  fear: "sad",

  angry: "angry",
  annoyed: "angry",
  frustrated: "angry",
  disgust: "angry",
  contempt: "angry"
};

function reduceToThreeEmotions(predictions) {
  const scores = { happy: 0, sad: 0, angry: 0 };

  predictions.forEach((p) => {
    const raw = (p.label || "").toLowerCase();
    const bucket = EMOTION_BUCKET_MAP[raw];
    if (!bucket) return;
    scores[bucket] += Number(p.confidence) || 0;
  });

  const total = scores.happy + scores.sad + scores.angry;
  if (total > 0) {
    scores.happy /= total;
    scores.sad /= total;
    scores.angry /= total;
  }

  const result = [
    { label: "happy", confidence: scores.happy },
    { label: "sad", confidence: scores.sad },
    { label: "angry", confidence: scores.angry }
  ];

  return result.sort((a, b) => b.confidence - a.confidence);
}

async function sendFaceToAPI(base64Image) {
  const body = { source: "face", image_base64: base64Image };

  const res = await fetch(FACE_API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });

  if (!res.ok) throw new Error("Face API error");
  return res.json();
}

async function sendTextToAPI(text) {
  const body = { source: "text", text };

  const res = await fetch(TEXT_API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });

  if (!res.ok) throw new Error("Text API error");
  return res.json();
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

async function sendAudioToAPI(audioBlob) {
  if (!audioBlob) return null;

  const audioBase64 = await blobToDataUrl(audioBlob);

  const body = {
    source: "audio",
    audio_base64: audioBase64
  };

  const res = await fetch(AUDIO_API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });

  if (!res.ok) throw new Error("Audio API error");
  return res.json(); // expect { transcript, predictions: [...] }
}

// ===== CHECK-IN SUBMISSION =====
function setupCheckinButton() {
  const btn = document.getElementById("submitCheckinBtn");
  btn.addEventListener("click", handleCheckinSubmit);
}

async function handleCheckinSubmit() {
  const btn = document.getElementById("submitCheckinBtn");

  if (!capturedImageDataUrl) {
    alert("Please capture your face before submitting.");
    return;
  }

  if (!recordedAudioBlob || !currentTranscript) {
    alert("Please record your voice diary (we need audio & transcript).");
    return;
  }

  btn.disabled = true;

  try {
    const [faceRes, textRes] = await Promise.all([
      sendFaceToAPI(capturedImageDataUrl),
      sendTextToAPI(currentTranscript)
    ]);

    const faceRaw = normalizeCandidates(faceRes);
    const textRaw = normalizeCandidates(textRes);

    const faceCandidates = reduceToThreeEmotions(faceRaw);
    const textCandidates = reduceToThreeEmotions(textRaw);
    const audioCandidates = pendingAudioCandidates || [];

    const modalities = [
      { type: "face", list: faceCandidates },
      { type: "text", list: textCandidates },
      { type: "audio", list: audioCandidates }
    ].filter((m) => m.list && m.list.length);

    if (!modalities.length) throw new Error("No emotion predictions returned.");

    let main = modalities[0];
    modalities.forEach((m) => {
      if (m.list[0].confidence > main.list[0].confidence) main = m;
    });

    const mainCandidates = main.list;
    const top = mainCandidates[0];

    pendingCheckinContext = {
      date: getTodayString(),
      diary: currentTranscript,      // voice → text
      faceCandidates,
      textCandidates,
      audioCandidates,
      mainCandidates
    };

    if (top && top.confidence < CONFIDENCE_THRESHOLD) {
      openEmotionModal(top.label);
    } else {
      const finalEmotionLabel = top ? top.label : "happy";
      await finalizeAndSaveEntry(finalEmotionLabel);
    }
  } catch (err) {
    console.error(err);
    alert("Error analyzing emotions. Please try again.");
  } finally {
    btn.disabled = false;
  }
}

// ===== EMOTION CONFIRMATION MODAL =====
function setupModalButtons() {
  const yesBtn = document.getElementById("emotionYesBtn");
  const noBtn = document.getElementById("emotionNoBtn");

  yesBtn.addEventListener("click", async () => {
    if (!pendingCheckinContext) return;
    const top = pendingCheckinContext.mainCandidates[0];
    const finalLabel = top ? top.label : "happy";
    await finalizeAndSaveEntry(finalLabel);
    closeEmotionModal();
  });

  noBtn.addEventListener("click", async () => {
    if (!pendingCheckinContext) return;
    const candidates = pendingCheckinContext.mainCandidates;
    const second = candidates[1] || candidates[0];
    const finalLabel = second ? second.label : "happy";
    await finalizeAndSaveEntry(finalLabel);
    closeEmotionModal();
  });
}

function openEmotionModal(label) {
  document.getElementById("modalEmotionLabel").textContent = label;
  document.getElementById("emotionModal").classList.remove("hidden");
}

function closeEmotionModal() {
  document.getElementById("emotionModal").classList.add("hidden");
}

// ===== FINAL SAVE TO BACKEND =====
async function finalizeAndSaveEntry(finalEmotionLabel) {
  const ctx = pendingCheckinContext;
  if (!ctx) throw new Error("Missing pending check-in context");

  const faceTop = ctx.faceCandidates[0] || { label: "unknown", confidence: 0 };
  const textTop = ctx.textCandidates[0] || { label: "unknown", confidence: 0 };
  const audioTop = ctx.audioCandidates[0] || { label: "unknown", confidence: 0 };

  const emotionObject = {
    face: faceTop,
    text: textTop,   // emotion from transcript
    voice: audioTop, // emotion from raw audio
    final: finalEmotionLabel,
    candidates: ctx.mainCandidates
  };

  const payload = {
    date: ctx.date,
    diary: ctx.diary,   // transcript used as diary
    emotion: emotionObject
  };

  const res = await fetch("backend/save_entry.php", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  const data = await res.json();
  if (!data.success) {
    throw new Error(data.message || "Failed to save entry");
  }

  // Close modal + reset state
  document.getElementById("checkinModal").classList.add("hidden");
  stopWebcam();
  stopAudioWave();
  capturedImageDataUrl = null;
  recordedAudioBlob = null;
  pendingAudioCandidates = [];
  currentTranscript = "";

  await loadUserData();
}
