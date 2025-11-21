// assets/js/dashboard.js

// ===== CONFIG =====
const FACE_API_URL = "https://colab-example-url/predict"; // placeholder
const TEXT_API_URL = "https://colab-example-url/predict"; // placeholder
const CONFIDENCE_THRESHOLD = 0.7; // 70%

let webcamStream = null;
let capturedImageDataUrl = null;
let emotionChart = null;
let userEntries = [];
let pendingCheckinContext = null;

// ===== INIT =====
document.addEventListener("DOMContentLoaded", () => {
  initWebcam();
  setupModalButtons();
  setupCheckinButton();
  loadUserData();
});

// ===== HELPER: today as local YYYY-MM-DD =====
function getTodayString() {
  // en-CA uses YYYY-MM-DD format
  return new Date().toLocaleDateString("en-CA");
}

// ===== WEBCAM =====
async function initWebcam() {
  try {
    webcamStream = await navigator.mediaDevices.getUserMedia({ video: true });
    const video = document.getElementById("webcam");
    video.srcObject = webcamStream;
  } catch (err) {
    console.error("Error accessing webcam:", err);
    const statusEl = document.getElementById("checkinStatus");
    if (statusEl) {
      statusEl.textContent =
        "Could not access webcam. Please check your browser permissions.";
    }
  }

  const captureBtn = document.getElementById("captureBtn");
  captureBtn.addEventListener("click", captureFrame);
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

  const dataUrl = canvas.toDataURL("image/jpeg");
  capturedImageDataUrl = dataUrl;

  const preview = document.getElementById("capturePreview");
  preview.src = dataUrl;
  preview.classList.remove("hidden");
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
    if (!data.success) {
      throw new Error(data.message || "Failed to load user data");
    }

    document.getElementById("userEmail").textContent = data.email;
    userEntries = Array.isArray(data.entries) ? data.entries : [];

    updateStreakAndRecap(data.streak, data.recap);
    updateChart(userEntries);
    updateCheckinPanel(userEntries);
  } catch (err) {
    console.error(err);
    const statusEl = document.getElementById("checkinStatus");
    if (statusEl) {
      statusEl.textContent = "Failed to load dashboard data.";
    }
  }
}

// ===== STREAK & RECAP UI =====
function updateStreakAndRecap(streak, recapArray) {
  const streakEl = document.getElementById("streakValue");
  streakEl.textContent = streak || 0;

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

// ===== CHART =====
function updateChart(entries) {
  const ctx = document.getElementById("emotionChart").getContext("2d");

  // Build sorted date list and final emotion map
  const map = {};
  entries.forEach((e) => {
    if (!e.date || !e.emotion || !e.emotion.final) return;
    map[e.date] = e.emotion.final;
  });

  const dates = Object.keys(map).sort(); // ascending
  const EMOTIONS = ["happy", "sad", "angry", "calm", "neutral"];

  const datasets = EMOTIONS.map((label, idx) => {
    const dataPoints = dates.map((d) => {
      const val = map[d];
      return val && val.toLowerCase() === label ? 1 : 0;
    });
    const colors = [
      "rgba(34, 197, 94, 0.8)",   // happy - green
      "rgba(239, 68, 68, 0.8)",   // sad - red
      "rgba(234, 179, 8, 0.8)",   // angry - yellow
      "rgba(59, 130, 246, 0.8)",  // calm - blue
      "rgba(148, 163, 184, 0.8)"  // neutral - gray
    ];

    return {
      label: label,
      data: dataPoints,
      fill: false,
      borderColor: colors[idx],
      tension: 0.2
    };
  });

  if (emotionChart) {
    emotionChart.destroy();
  }

  emotionChart = new Chart(ctx, {
    type: "line",
    data: {
      labels: dates,
      datasets: datasets
    },
    options: {
      responsive: true,
      plugins: {
        legend: {
          display: true
        }
      },
      scales: {
        y: {
          beginAtZero: true,
          suggestedMax: 1
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
    if (entry.date === todayStr) {
      todayEntry = entry;
    }
  });

  const alreadyEl = document.getElementById("alreadyCheckedIn");
  const formWrapper = document.getElementById("checkinFormWrapper");

  if (todayEntry) {
    alreadyEl.classList.remove("hidden");
    formWrapper.classList.add("hidden");

    document.getElementById("todayFinalEmotion").textContent =
      todayEntry.emotion && todayEntry.emotion.final
        ? todayEntry.emotion.final
        : "-";

    document.getElementById("todayDiary").textContent =
      todayEntry.diary || "-";
  } else {
    alreadyEl.classList.add("hidden");
    formWrapper.classList.remove("hidden");
  }
}

// ===== CHECK-IN SUBMISSION =====
function setupCheckinButton() {
  const btn = document.getElementById("submitCheckinBtn");
  btn.addEventListener("click", handleCheckinSubmit);
}

async function handleCheckinSubmit() {
  const statusEl = document.getElementById("checkinStatus");
  const diaryText = document.getElementById("diaryText").value.trim();
  const btn = document.getElementById("submitCheckinBtn");

  if (!capturedImageDataUrl) {
    alert("Please capture your face before submitting.");
    return;
  }
  if (!diaryText) {
    alert("Please write your diary for today.");
    return;
  }

  btn.disabled = true;
  statusEl.textContent = "Analyzing your emotions...";

  try {
    // 1) Call Gradio/Colab APIs for face + text in parallel
    const [faceRes, textRes] = await Promise.all([
      sendFaceToAPI(capturedImageDataUrl),
      sendTextToAPI(diaryText)
    ]);

    const faceCandidates = normalizeCandidates(faceRes);
    const textCandidates = normalizeCandidates(textRes);

    if (!faceCandidates.length && !textCandidates.length) {
      throw new Error("No emotion predictions returned.");
    }

    const faceTop = faceCandidates[0] || null;
    const textTop = textCandidates[0] || null;

    // Choose main candidate list: the one with higher top confidence
    let mainCandidates = textCandidates;
    if (faceTop && textTop) {
      if (faceTop.confidence > textTop.confidence) {
        mainCandidates = faceCandidates;
      }
    } else if (faceTop && !textTop) {
      mainCandidates = faceCandidates;
    } // else if only text, we already set mainCandidates = textCandidates

    const top = mainCandidates[0];

    // Save context for modal
    pendingCheckinContext = {
      date: getTodayString(),
      diary: diaryText,
      faceCandidates,
      textCandidates,
      mainCandidates
    };

    if (top && top.confidence < CONFIDENCE_THRESHOLD) {
      // Ask user to confirm via modal
      openEmotionModal(top.label);
    } else {
      // Confidence is high enough, accept top emotion
      const finalEmotionLabel = top ? top.label : "neutral";
      await finalizeAndSaveEntry(finalEmotionLabel);
    }
  } catch (err) {
    console.error(err);
    statusEl.textContent = "Error analyzing emotions. Please try again.";
  } finally {
    btn.disabled = false;
  }
}

// ===== GRADIO / COLAB API CALLS =====
/**
 * Example payload for image-based Gradio endpoint.
 * Adjust this to match your actual Colab/Gradio interface.
 *
 * Example body:
 * {
 *   "source": "face",
 *   "image_base64": "data:image/jpeg;base64,...."
 * }
 *
 * Example response:
 * {
 *   "predictions": [
 *     { "label": "happy", "confidence": 0.82 },
 *     { "label": "calm",  "confidence": 0.74 },
 *     { "label": "sad",   "confidence": 0.10 }
 *   ]
 * }
 */
async function sendFaceToAPI(base64Image) {
  const body = {
    source: "face",
    image_base64: base64Image
  };

  const res = await fetch(FACE_API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });

  if (!res.ok) {
    throw new Error("Face API error");
  }
  return res.json();
}

/**
 * Example payload for text-based Gradio endpoint.
 *
 * Example body:
 * {
 *   "source": "text",
 *   "text": "Today I feel..."
 * }
 */
async function sendTextToAPI(text) {
  const body = {
    source: "text",
    text: text
  };

  const res = await fetch(TEXT_API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });

  if (!res.ok) {
    throw new Error("Text API error");
  }
  return res.json();
}

/**
 * Normalise different response formats into:
 * [{ label: string, confidence: number }, ...]
 */
function normalizeCandidates(apiResponse) {
  if (!apiResponse) return [];

  // If your Gradio returns { predictions: [ {label, confidence}, ... ] }
  if (Array.isArray(apiResponse.predictions)) {
    return apiResponse.predictions.map((p) => ({
      label: p.label,
      confidence: Number(p.confidence)
    }));
  }

  // If it returns an array directly
  if (Array.isArray(apiResponse)) {
    return apiResponse.map((p) => ({
      label: p.label || p[0],
      confidence: Number(p.confidence || p[1])
    }));
  }

  return [];
}

// ===== MODAL LOGIC =====
function setupModalButtons() {
  const yesBtn = document.getElementById("emotionYesBtn");
  const noBtn = document.getElementById("emotionNoBtn");

  yesBtn.addEventListener("click", async () => {
    if (!pendingCheckinContext) return;
    const top = pendingCheckinContext.mainCandidates[0];
    const finalLabel = top ? top.label : "neutral";
    await finalizeAndSaveEntry(finalLabel);
    closeEmotionModal();
  });

  noBtn.addEventListener("click", async () => {
    if (!pendingCheckinContext) return;
    const candidates = pendingCheckinContext.mainCandidates;
    const second = candidates[1] || candidates[0];
    const finalLabel = second ? second.label : "neutral";
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
  const statusEl = document.getElementById("checkinStatus");
  statusEl.textContent = "Saving your check-in...";

  const ctx = pendingCheckinContext;
  if (!ctx) {
    throw new Error("Missing pending check-in context");
  }

  const faceTop = ctx.faceCandidates[0] || null;
  const textTop = ctx.textCandidates[0] || null;

  const emotionObject = {
    face: faceTop || { label: "unknown", confidence: 0 },
    text: textTop || { label: "unknown", confidence: 0 },
    final: finalEmotionLabel,
    candidates: ctx.mainCandidates
  };

  const payload = {
    date: ctx.date,
    diary: ctx.diary,
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

  statusEl.textContent = "Check-in saved!";
  // Refresh dashboard UI (streak, recap, chart, panel)
  await loadUserData();
}
