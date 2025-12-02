// assets/js/dashboard.js

// ===== CONFIG =====
const ROBOFLOW_WORKFLOW_URL =
  "https://serverless.roboflow.com/ricky-jvxxd/workflows/custom-workflow-6";
const ROBOFLOW_API_KEY = "LH7a1zJFy9rcoIoMhh0C"; // put your real key here

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
  happy: {
    text: "Keep up the great work! Share your joy with others.",
    youtube: "https://www.youtube.com/embed/WtI9f7A4Iz4", // Happy - Pharrell Williams
    spotify: "https://open.spotify.com/embed/playlist/37i9dQZF1DXdPec7aLTmlC" // Happy Hits
  },
  sad: {
    text: "It's okay to feel sad. Take a short walk or listen to some calming music.",
    youtube: "https://www.youtube.com/embed/ur48jVNNlKk", // Lofi Girl
    spotify: "https://open.spotify.com/embed/playlist/37i9dQZF1DWZqd5JICZI0u" // Peaceful Piano
  },
  angry: {
    text: "Take deep breaths. Try to step away from the situation for a moment.",
    youtube: "https://www.youtube.com/embed/r19_Dq3TOyM", // 5-min Meditation
    spotify: "https://open.spotify.com/embed/playlist/37i9dQZF1DWXe9gFZP0gtP" // Stress Relief
  }
};

// ===== INIT =====
document.addEventListener("DOMContentLoaded", () => {
  setupModalButtons();
  setupCheckinOpenButton();
  setupCheckinButton();
  setupAudioRecording();
  initClock();
  setupEmotionFilterButtons();
  loadUserData();
});

// ===== EMOTION FILTER BUTTONS (All / Happy / Sad / Angry) =====
function setupEmotionFilterButtons() {
  const buttons = document.querySelectorAll(".emotion-toggle-btn");
  if (!buttons.length) return;

  buttons.forEach((btn) => {
    btn.addEventListener("click", () => {
      const emotion = btn.getAttribute("data-emotion"); // all | happy | sad | angry
      setEmotionFilter(emotion);
    });
  });
}

function setEmotionFilter(emotion) {
  // emotion: "all" | "happy" | "sad" | "angry"
  highlightedEmotion = emotion === "all" ? null : emotion; // null = show all
  updateEmotionFilterButtonStyles(emotion);
  applyEmotionHighlight();
}

function updateEmotionFilterButtonStyles(activeEmotion) {
  const buttons = document.querySelectorAll(".emotion-toggle-btn");
  buttons.forEach((btn) => {
    const emo = btn.getAttribute("data-emotion");
    if (emo === activeEmotion) {
      btn.classList.add("bg-orange-500", "text-white");
    } else {
      btn.classList.remove("bg-orange-500", "text-white");
    }
  });
}

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

    const dateStr = dateFormatter.format(now); // YYYY-MM-DD
    const timeStr = timeFormatter.format(now); // HH:MM:SS

    clockEl.textContent = `${dateStr} · ${timeStr} WIB`;
  }

  updateClock();
  setInterval(updateClock, 1000);
}

// ===== HELPER: today as local YYYY-MM-DD =====
function getTodayString() {
  return new Date().toLocaleDateString("en-CA"); // WIB if browser is WIB
}

// ===== LOAD USER DATA =====
// ===== LOAD USER DATA =====
async function loadUserData() {
  try {
    // FETCH FROM BACKEND (Real auth mode)
    console.log("Fetching data from backend/get_user_data.php...");
    const res = await fetch("backend/get_user_data.php");

    if (res.status === 401) {
      // Not logged in -> redirect
      window.location.href = "login.html";
      return;
    }

    if (!res.ok) throw new Error("Could not load user data");

    const data = await res.json();
    if (!data.success) throw new Error(data.message || "Unknown error");

    // data: { success, email, entries, streak, recap }
    document.getElementById("userEmail").textContent = data.email;
    userEntries = data.entries || [];

    const todayStr = getTodayString();
    const hasTodayEntry = userEntries.some((e) => e.date === todayStr);

    // Use backend streak/recap if available, or fallback/display
    // The backend calculates streak based on entries, so we can trust it.
    updateStreakAndRecap(data.streak, data.recap, hasTodayEntry);
    updateChart(userEntries);
    updateCheckinPanel(userEntries);

  } catch (err) {
    console.error(err);
    const statusEl = document.getElementById("checkinStatus");
    if (statusEl) statusEl.textContent = "Failed to load user data.";

    // If strictly required, maybe redirect to login? 
    // For now, let's just show error or redirect if it was a fetch error
    // window.location.href = "login.html";
  }
}


// ===== STREAK & RECAP UI =====
function updateStreakAndRecap(streak, recapArray, hasTodayEntry) {
  const streakEl = document.getElementById("streakValue");

  // show whatever frontend passes
  streakEl.textContent = typeof streak === "number" ? streak : 0;

  streakEl.classList.remove("text-orange-500", "text-gray-400");

  if (hasTodayEntry) {
    streakEl.classList.add("text-orange-500"); // checked in today
  } else {
    streakEl.classList.add("text-gray-400");   // not yet → gray
  }

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

// ===== HELPER: compute streak up to yesterday from entries =====
function computeStreakUntilYesterday(entries) {
  if (!Array.isArray(entries) || !entries.length) return 0;

  // Build a set of date strings like "2025-11-29"
  const dateSet = new Set(
    entries
      .filter((e) => e.date)
      .map((e) => e.date)
  );

  // Start from "yesterday" relative to today (browser timezone)
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  // Format helper → "YYYY-MM-DD"
  const toYMD = (d) => d.toISOString().slice(0, 10);

  let streak = 0;
  let cursor = new Date(yesterday);

  while (true) {
    const cursorStr = toYMD(cursor);
    if (!dateSet.has(cursorStr)) break; // gap → stop streak

    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }

  return streak;
}

// (kept but not currently used – safe)
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
  // ===== NEW: If only 1 entry → show “insufficient data” =====
  const chartContainer = document.getElementById("chartContainer");
  const noDataBox = document.getElementById("noDataBox");

  if (entries.length <= 1) {
    if (chartContainer) chartContainer.classList.add("hidden");
    if (noDataBox) {
      noDataBox.classList.remove("hidden");

      const first = entries[0];
      if (first) {
        document.getElementById("noDataEmotion").textContent = first.final || "-";
        document.getElementById("noDataDiary").textContent = first.diary || "-";
        document.getElementById("noDataDate").textContent = first.date || "-";
      }
    }
    return; // stop here, don’t load the chart
  }

  // If data > 1, show chart normally
  if (chartContainer) chartContainer.classList.remove("hidden");
  if (noDataBox) noDataBox.classList.add("hidden");

  const ctx = canvas.getContext("2d");

  if (emotionChart) emotionChart.destroy();

  const COLORS = {
    happy: "rgba(34, 197, 94, 1)",   // green
    sad: "rgba(59, 130, 246, 1)",  // blue
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

  // create per-line gradients (strong + dim)
  function makeGradient(colorRgb, alphaTop) {
    const grad = ctx.createLinearGradient(0, 0, 0, canvas.height);
    grad.addColorStop(0, colorRgb.replace("1)", `${alphaTop})`));
    grad.addColorStop(1, colorRgb.replace("1)", "0)"));
    return grad;
  }

  const happyGradient = makeGradient(COLORS.happy, 0.35);
  const happyDimGradient = makeGradient(COLORS.happy, 0.10);
  const sadGradient = makeGradient(COLORS.sad, 0.35);
  const sadDimGradient = makeGradient(COLORS.sad, 0.10);
  const angryGradient = makeGradient(COLORS.angry, 0.35);
  const angryDimGradient = makeGradient(COLORS.angry, 0.10);

  emotionChart = new Chart(ctx, {
    type: "line",
    data: {
      labels,
      datasets: [
        {
          label: "Happy",
          emotionKey: "happy",         // ⬅️ custom
          baseColor: COLORS.happy,     // ⬅️ custom
          baseGradient: happyGradient, // ⬅️ custom
          dimGradient: happyDimGradient,
          data: happyData,
          borderColor: COLORS.happy,
          backgroundColor: happyGradient,
          tension: 0.35,
          borderWidth: 3,
          pointRadius: 4,
          pointHoverRadius: 4, // same as pointRadius → no hover "jump"
          fill: true
        },
        {
          label: "Sad",
          emotionKey: "sad",
          baseColor: COLORS.sad,
          baseGradient: sadGradient,
          dimGradient: sadDimGradient,
          data: sadData,
          borderColor: COLORS.sad,
          backgroundColor: sadGradient,
          tension: 0.35,
          borderWidth: 3,
          pointRadius: 4,
          pointHoverRadius: 4,
          fill: true
        },
        {
          label: "Angry",
          emotionKey: "angry",
          baseColor: COLORS.angry,
          baseGradient: angryGradient,
          dimGradient: angryDimGradient,
          data: angryData,
          borderColor: COLORS.angry,
          backgroundColor: angryGradient,
          tension: 0.35,
          borderWidth: 3,
          pointRadius: 4,
          pointHoverRadius: 4,
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
          // tooltip still works, but no hover-thick-line effect
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

  // Apply current filter (e.g. when data reloads after save)
  applyEmotionHighlight();
}

// Highlight selected emotion + dim others
function applyEmotionHighlight() {
  if (!emotionChart) return;

  const selected = highlightedEmotion; // null | "happy" | "sad" | "angry"

  emotionChart.data.datasets.forEach((ds) => {
    const key = ds.emotionKey; // "happy" | "sad" | "angry"
    const isActive = !selected || selected === key;

    // Full vs dim color
    const fullColor = ds.baseColor;
    const dimColor = fullColor.replace("1)", "0.25)");

    ds.borderColor = isActive ? fullColor : dimColor;
    ds.backgroundColor = isActive ? ds.baseGradient : ds.dimGradient;

    // Thickness + point size
    ds.borderWidth = isActive ? 3 : 1.5;
    ds.pointRadius = isActive ? 4 : 2;
    ds.pointHoverRadius = ds.pointRadius; // no hover jump
  });

  emotionChart.update();
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
    const recData = EMOTION_RECOMMENDATIONS[finalEmo] || EMOTION_RECOMMENDATIONS.happy;

    // Text recommendation
    document.getElementById("todayRecommendation").textContent = recData.text;

    // Multimedia
    const ytFrame = document.getElementById("recYoutube");
    const spFrame = document.getElementById("recSpotify");
    const mediaContainer = document.getElementById("recMediaContainer");

    if (mediaContainer) {
      mediaContainer.classList.remove("hidden");
      if (ytFrame) ytFrame.src = recData.youtube;
      if (spFrame) spFrame.src = recData.spotify;
    }

    ctaText.textContent = "You have already checked in today.";
    openBtn.disabled = true;
    openBtn.classList.add("opacity-60", "cursor-not-allowed");
  } else {
    alreadyEl.classList.add("hidden");

    // Hide media container if not checked in
    const mediaContainer = document.getElementById("recMediaContainer");
    if (mediaContainer) mediaContainer.classList.add("hidden");

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
  transcriptDisplay.value = "";
  currentTranscript = "";

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
        display.value = currentTranscript; // textarea
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
        transcriptDisplay.value = currentTranscript; // textarea
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

// ===== GRADIO / WORKFLOW / COLAB API CALLS =====

// Generic normalizer for text/audio APIs (NOT for new face workflow)
function normalizeCandidates(apiResponse) {
  if (!apiResponse) return [];

  // { predictions: [...] }
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
  surprised: "happy",
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

// ======================================================
// REDUCE candidates → 3 EMOTIONS (0–1)
// (used for text/audio)
// ======================================================
function reduceToThreeEmotions(candidates) {
  if (!Array.isArray(candidates) || !candidates.length) return [];

  const sums = { happy: 0, sad: 0, angry: 0 };

  for (const c of candidates) {
    const rawLabel = (c.label || c.class || c.emotion || "").toLowerCase();
    const bucket = EMOTION_BUCKET_MAP[rawLabel];
    if (!bucket) continue;

    const conf = typeof c.confidence === "number" ? c.confidence : 0;
    if (conf <= 0) continue;

    sums[bucket] += conf;
  }

  const total = sums.happy + sums.sad + sums.angry;
  if (total <= 0) return [];

  const result = [
    { label: "happy", confidence: sums.happy / total },
    { label: "sad", confidence: sums.sad / total },
    { label: "angry", confidence: sums.angry / total }
  ];

  // sort desc so [0] is always strongest
  result.forEach((r) => (r.confidence = Number(r.confidence.toFixed(6))));
  result.sort((a, b) => b.confidence - a.confidence);
  return result;
}


// ============================
// FACE EMOTION API (Roboflow)
// ============================
async function sendFaceToAPI(imageUrl) {
  const response = await fetch(ROBOFLOW_WORKFLOW_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      api_key: ROBOFLOW_API_KEY,
      inputs: {
        image: { type: "url", value: imageUrl }
      }
    })
  });

  if (!response.ok) {
    console.error("Face API error:", response.status, response.statusText);
    throw new Error("Face API request failed");
  }

  const json = await response.json();
  // We keep the full raw JSON; mapping function will handle the shape
  return json;
}

// =========================================
// MAP ROBOFLOW WORKFLOW → 3 EMOTION BUCKETS
// =========================================
function mapFaceWorkflowToThree(raw) {
  let detections = [];

  // New workflow shape
  if (raw && raw.outputs && Array.isArray(raw.outputs) && raw.outputs[0]?.predictions) {
    const p = raw.outputs[0].predictions;
    if (Array.isArray(p.predictions)) {
      detections = p.predictions;
    }
  }

  // Fallback (old shape)
  if (!detections.length && Array.isArray(raw) && raw[0]?.predictions) {
    const p = raw[0].predictions;
    if (Array.isArray(p.predictions)) {
      detections = p.predictions;
    } else if (Array.isArray(p)) {
      detections = p;
    }
  }

  if (!detections.length) {
    console.warn("No detections found in face workflow response:", raw);
    return [];
  }

  // Sum all 4 raw classes
  const sums = { happy: 0, sad: 0, angry: 0, surprised: 0 };

  for (const det of detections) {
    const label = det.class;
    const conf = typeof det.confidence === "number" ? det.confidence : 0;
    if (conf <= 0) continue;
    if (label in sums) sums[label] += conf;
  }

  const total4 = sums.happy + sums.sad + sums.angry + sums.surprised;
  if (total4 <= 0) {
    console.warn("All face emotion sums are zero:", sums);
    return [];
  }

  // Normalize 4-class distribution
  let happyP = sums.happy / total4;
  let sadP = sums.sad / total4;
  let angryP = sums.angry / total4;
  let surprisedP = sums.surprised / total4;

  // Merge surprised → happy & sad
  happyP += surprisedP * 0.7;
  sadP += surprisedP * 0.3;
  surprisedP = 0;

  // Renormalize to 3 classes so they sum to 1
  const total3 = happyP + sadP + angryP;
  if (total3 <= 0) {
    return [];
  }
  happyP /= total3;
  sadP /= total3;
  angryP /= total3;

  const result = [
    { label: "happy", confidence: Number(happyP.toFixed(6)) },
    { label: "sad", confidence: Number(sadP.toFixed(6)) },
    { label: "angry", confidence: Number(angryP.toFixed(6)) }
  ];

  // Sort so [0] is always the strongest
  result.sort((a, b) => b.confidence - a.confidence);
  return result;
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

const HUME_API_KEY = "AdJpLjRXp0u40HA7hpksDAMCpSKiGkXVIokSuMGShGeU2tDT";

// Real Audio API using Hume AI WebSocket
async function sendAudioToAPI(audioBlob) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(`wss://api.hume.ai/v0/stream/models?api_key=${HUME_API_KEY}`);
    let result = null;

    socket.onopen = async () => {
      console.log("Hume AI WebSocket connected");

      // Convert Blob to Base64
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64data = reader.result.split(",")[1];

        // Send configuration and data
        const message = {
          models: {
            prosody: {}
          },
          data: base64data
        };

        socket.send(JSON.stringify(message));
      };
      reader.readAsDataURL(audioBlob);
    };

    socket.onmessage = (event) => {
      try {
        const response = JSON.parse(event.data);

        // Check for prosody predictions
        if (response.prosody && response.prosody.predictions && response.prosody.predictions.length > 0) {
          // Hume returns a list of emotions. We need to map them to our format.
          // Taking the first prediction (since we sent one file)
          const emotions = response.prosody.predictions[0].emotions;

          // Map to our format: { label: "happy", confidence: 0.9 }
          const candidates = emotions.map(e => ({
            label: e.name,
            confidence: e.score
          }));

          // Sort by confidence
          candidates.sort((a, b) => b.confidence - a.confidence);

          result = {
            transcript: "Voice analysis complete", // Hume prosody doesn't always return transcript, use placeholder or implement ASR if needed
            predictions: candidates
          };

          // We got what we needed, close the socket
          socket.close();
        }
      } catch (err) {
        console.error("Error parsing Hume response:", err);
      }
    };

    socket.onclose = () => {
      console.log("Hume AI WebSocket closed");
      if (result) {
        resolve(result);
      } else {
        // If closed without result, maybe it was just a keepalive or error
        // But if we sent data and got nothing, it's an error.
        // For now, if we didn't get a result, return empty/neutral to avoid breaking app
        console.warn("Hume AI closed without returning predictions.");
        resolve({
          transcript: "Analysis failed",
          predictions: [{ label: "neutral", confidence: 0 }]
        });
      }
    };

    socket.onerror = (error) => {
      console.error("Hume AI WebSocket error:", error);
      reject(error);
    };
  });
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
  const transcriptEl = document.getElementById("transcriptDisplay");
  currentTranscript = (transcriptEl?.value || "").trim();

  if (!recordedAudioBlob || !currentTranscript) {
    alert("Please record your voice diary (we need audio & transcript).");
    return;
  }

  btn.disabled = true;

  try {
    // New face workflow + text pipeline
    const [faceRes, textRes] = await Promise.all([
      sendFaceToAPI(capturedImageDataUrl),
      sendTextToAPI(currentTranscript)
    ]);

    const faceCandidates = mapFaceWorkflowToThree(faceRes);
    const textRaw = normalizeCandidates(textRes);
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
    const lbl = (c.label || c.emotion || "").toLowerCase();
    if (lbl === "happy" || lbl === "sad" || lbl === "angry") {
      dist[lbl] += c.confidence || 0; // use += just in case
    }
  });

  // Optional safety re-normalization to 0–1
  const total = dist.happy + dist.sad + dist.angry;
  if (total > 0) {
    dist.happy /= total;
    dist.sad /= total;
    dist.angry /= total;
  }

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
    face: faceDist,       // { happy, sad, angry } 0–1
    voice: voiceDist,     // { happy, sad, angry } 0–1
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
