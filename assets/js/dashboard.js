// assets/js/dashboard.js

// ===== CONFIG =====
const ROBOFLOW_API_KEY = "LH7a1zJFy9rcoIoMhh0C";
const ROBOFLOW_MODEL = "facial-emotion-recognition-e8skk";
const ROBOFLOW_VERSION = "2";

const TEXT_API_URL = "https://colab-example-url/text";   // placeholder
const AUDIO_API_URL = "https://colab-example-url/audio"; // placeholder

const CONFIDENCE_THRESHOLD = 0.6; // 60%

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
let recognition = null;     // Web Speech API instance

const EMOTION_RECOMMENDATIONS = {
  happy: "Keep up the great work! Share your joy with others.",
  sad: "It's okay to feel sad. Take a short walk or listen to some calming music.",
  angry: "Take deep breaths. Try to step away from the situation for a moment."
};

// ===== INIT =====
document.addEventListener("DOMContentLoaded", () => {
  setupModalButtons();
  setupCheckinOpenButton();
  setupCheckinButton();
  setupAudioRecording();
  initClock();
  loadUserData();
});

// ===== CLOCK (WIB) =====
function initClock() {
  const clockEl = document.getElementById("clock");
  if (!clockEl) return;

  function updateClock() {
    const now = new Date();

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

// (kept but no longer used – safe)
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

// ===== CHART (3 lines with gradient fill, using face+voice) =====
function updateChart(entries) {
  const canvas = document.getElementById("emotionChart");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");

  if (emotionChart) emotionChart.destroy();

  const COLORS = {
    happy: "rgba(34, 197, 94, 1)",   // green
    sad:   "rgba(59, 130, 246, 1)",  // blue
    angry: "rgba(239, 68, 68, 1)"    // red
  };

  const labels = [];
  const happyData = [];
  const sadData = [];
  const angryData = [];
  const diaryMap = {};

  const sorted = [...entries].sort(
    (a, b) => new Date(a.date) - new Date(b.date)
  );

  sorted.forEach((e) => {
    if (!e.date) return;

    labels.push(e.date);
    diaryMap[e.date] = e.diary || "";

    const face = e.face || {};
    const voice = e.voice || {};

    function avg2(a, b) {
      const nums = [];
      if (typeof a === "number") nums.push(a);
      if (typeof b === "number") nums.push(b);
      if (!nums.length) return 0;
      if (nums.length === 1) return nums[0];
      return (nums[0] + nums[1]) / 2;
    }

    const h = Number((avg2(face.happy, voice.happy) * 100).toFixed(2));
    const s = Number((avg2(face.sad, voice.sad) * 100).toFixed(2));
    const aVal = Number((avg2(face.angry, voice.angry) * 100).toFixed(2));

    happyData.push(h);
    sadData.push(s);
    angryData.push(aVal);
  });

  // create per-line gradients
  function makeGradient(colorRgb) {
    const grad = ctx.createLinearGradient(0, 0, 0, canvas.height);
    grad.addColorStop(0, colorRgb.replace("1)", "0.35)")); // strong top
    grad.addColorStop(1, colorRgb.replace("1)", "0)"));    // fade bottom
    return grad;
  }

  const happyGradient = makeGradient("rgba(34, 197, 94, 1)");
  const sadGradient   = makeGradient("rgba(59, 130, 246, 1)");
  const angryGradient = makeGradient("rgba(239, 68, 68, 1)");

  emotionChart = new Chart(ctx, {
    type: "line",
    data: {
      labels,
      datasets: [
        {
          label: "Happy",
          data: happyData,
          borderColor: COLORS.happy,
          backgroundColor: happyGradient,
          tension: 0.35,
          borderWidth: 3,
          pointRadius: 4,
          pointHoverRadius: 6,
          fill: true
        },
        {
          label: "Sad",
          data: sadData,
          borderColor: COLORS.sad,
          backgroundColor: sadGradient,
          tension: 0.35,
          borderWidth: 3,
          pointRadius: 4,
          pointHoverRadius: 6,
          fill: true
        },
        {
          label: "Angry",
          data: angryData,
          borderColor: COLORS.angry,
          backgroundColor: angryGradient,
          tension: 0.35,
          borderWidth: 3,
          pointRadius: 4,
          pointHoverRadius: 6,
          fill: true
        }
      ]
    },
    options: {
      responsive: true,
      plugins: {
        legend: {
          display: true,
          position: "top"
        },
        tooltip: {
          callbacks: {
            label: (ctx) => {
              const emo = ctx.dataset.label;
              const val = ctx.parsed.y ?? 0;
              const date = ctx.label;
              const diary = diaryMap[date] || "(no diary)";
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
            callback: (v) => `${v}%`
          }
        },
        x: {
          grid: { display: false }
        }
      }
    }
  });
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
      todayEntry.final || "-";
    document.getElementById("todayDiary").textContent = todayEntry.diary || "-";

    const finalEmo = todayEntry.final || "happy";
    document.getElementById("todayRecommendation").textContent =
      EMOTION_RECOMMENDATIONS[finalEmo] || EMOTION_RECOMMENDATIONS.happy;

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

// ===== AUDIO RECORDING + WAVEFORM + SPEECH-TO-TEXT =====
function setupAudioRecording() {
  // Web Speech API
  if ("webkitSpeechRecognition" in window || "SpeechRecognition" in window) {
    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;
    recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";

    recognition.onresult = (event) => {
      let final = "";
      let interim = "";

      for (let i = event.resultIndex; i < event.results.length; ++i) {
        if (event.results[i].isFinal) {
          final += event.results[i][0].transcript;
        } else {
          interim += event.results[i][0].transcript;
        }
      }

      const display = document.getElementById("transcriptDisplay");
      const text = (final + interim).trim();
      if (text) {
        currentTranscript = text;
        display.textContent = currentTranscript;
      }
    };

    recognition.onerror = (event) => {
      console.error("Speech recognition error", event.error);
    };
  } else {
    console.warn("Web Speech API not supported in this browser.");
  }

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

    const audioUrl = URL.createObjectURL(recordedAudioBlob);
    playback.src = audioUrl;
    playback.classList.remove("hidden");

    recordBtn.textContent = "🎙 Start recording";
    recordStatus.textContent = "Recording finished. You can replay or re-record.";

    stopAudioWave();

    try {
      const audioResult = await sendAudioToAPI(recordedAudioBlob);

      // Only use API transcript if Web Speech didn't fill it
      if (audioResult && audioResult.transcript && !currentTranscript) {
        currentTranscript = audioResult.transcript;
        const transcriptDisplay = document.getElementById("transcriptDisplay");
        transcriptDisplay.textContent = currentTranscript;
      } else if (!currentTranscript) {
        currentTranscript = "";
      }

      const rawCandidates = normalizeCandidates(audioResult);
      const reduced = reduceToThreeEmotions(rawCandidates);
      pendingAudioCandidates = reduced;
    } catch (err) {
      console.error("Audio API error:", err);
    }
  };

  mediaRecorder.start();

  if (recognition) {
    try {
      recognition.start();
    } catch (e) {
      console.warn("Recognition already started or error:", e);
    }
  }

  startAudioWave(audioStream);
}

function stopRecording() {
  if (mediaRecorder && mediaRecorder.state === "recording") {
    mediaRecorder.stop();
  }
  if (recognition) {
    try {
      recognition.stop();
    } catch (e) {
      console.warn("Recognition stop error:", e);
    }
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

// ===== GRADIO / ROBOFLOW / COLAB API CALLS =====
function normalizeCandidates(apiResponse) {
  if (!apiResponse) return [];

  // Roboflow-like: { predictions: [ { class: "...", confidence: ... }, ... ] }
  if (Array.isArray(apiResponse.predictions)) {
    return apiResponse.predictions.map((p) => ({
      label: p.class || p.label,
      confidence: Number(p.confidence)
    }));
  }

  // Generic list
  if (Array.isArray(apiResponse)) {
    return apiResponse.map((p) => ({
      label: p.label || p.class || p[0],
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
    scores[bucket] = Math.max(scores[bucket], Number(p.confidence) || 0);
  });

  const result = [
    { label: "happy", confidence: scores.happy },
    { label: "sad", confidence: scores.sad },
    { label: "angry", confidence: scores.angry }
  ];

  return result.sort((a, b) => b.confidence - a.confidence);
}

async function sendFaceToAPI(base64Image) {
  const pureBase64 = base64Image.split(",")[1];

  const url = `https://detect.roboflow.com/${ROBOFLOW_MODEL}/${ROBOFLOW_VERSION}?api_key=${ROBOFLOW_API_KEY}`;

  const res = await fetch(url, {
    method: "POST",
    body: pureBase64,
    headers: {
      "Content-Type": "application/x-www-form-urlencoded"
    }
  });

  if (!res.ok) throw new Error("Roboflow Face API error");
  return res.json();
}

// Dummy Text API (so flow works without Colab)
async function sendTextToAPI(text) {
  console.log("Mocking Text API");
  return {
    predictions: [{ label: "neutral", confidence: 0 }]
  };
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

// Dummy Audio API
async function sendAudioToAPI(audioBlob) {
  console.log("Mocking Audio API");
  return {
    transcript: "This is a simulated transcript.",
    predictions: [{ label: "neutral", confidence: 0 }]
  };
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
      diary: currentTranscript, // voice → text
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

// ===== FINAL SAVE TO BACKEND (NEW JSON SHAPE) =====
function candidatesToDistribution(candidates) {
  const dist = { happy: 0, sad: 0, angry: 0 };
  if (!Array.isArray(candidates)) return dist;

  candidates.forEach((c) => {
    const lbl = (c.label || "").toLowerCase();
    if (lbl === "happy" || lbl === "sad" || lbl === "angry") {
      dist[lbl] = c.confidence || 0;
    }
  });

  return dist;
}

async function finalizeAndSaveEntry(finalEmotionLabel) {
  const ctx = pendingCheckinContext;
  if (!ctx) throw new Error("Missing pending check-in context");

  const faceDist = candidatesToDistribution(ctx.faceCandidates);
  const voiceDist = candidatesToDistribution(ctx.audioCandidates);

  const payload = {
    date: ctx.date,
    diary: ctx.diary,     // transcript used as diary
    face: faceDist,       // { happy, sad, angry }
    voice: voiceDist,     // { happy, sad, angry }
    final: finalEmotionLabel // "happy" | "sad" | "angry"
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

  document.getElementById("checkinModal").classList.add("hidden");
  stopWebcam();
  stopAudioWave();
  capturedImageDataUrl = null;
  recordedAudioBlob = null;
  pendingAudioCandidates = [];
  currentTranscript = "";

  await loadUserData();
}
