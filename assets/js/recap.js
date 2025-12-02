// assets/js/recap.js

document.addEventListener("DOMContentLoaded", () => {
  initClock();
  loadRecap();
});

// ===== CLOCK (same vibe as dashboard) =====
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

    const dateStr = dateFormatter.format(now);
    const timeStr = timeFormatter.format(now);
    clockEl.textContent = `${dateStr} · ${timeStr} WIB`;
  }

  updateClock();
  setInterval(updateClock, 1000);
}

// ===== LOAD USER ENTRIES =====
async function loadRecap() {
  const container = document.getElementById("recapContainer");
  const emptyState = document.getElementById("recapEmptyState");

  try {
    const res = await fetch("backend/get_user_data.php");
    if (res.status === 401) {
      // not logged in → same behavior as dashboard
      window.location.href = "login.html";
      return;
    }

    const data = await res.json();
    const entries = Array.isArray(data.entries) ? data.entries : [];

    // 🔹 show logged-in email in header
    const emailEl = document.getElementById("userEmail");
    if (emailEl && data.email) {
      emailEl.textContent = data.email;
    }

    if (!entries.length) {
      container.innerHTML = "";
      emptyState.classList.remove("hidden");
      return;
    }

    emptyState.classList.add("hidden");

    // newest → oldest
    entries.sort((a, b) => new Date(b.date) - new Date(a.date));

    container.innerHTML = "";
    entries.forEach((entry) => {
      const card = buildRecapCard(entry);
      container.appendChild(card);
    });
  } catch (err) {
    console.error(err);
    container.innerHTML =
      '<p class="text-red-500 text-sm">Failed to load recap. Please refresh.</p>';
  }
}


// ===== BUILD ONE RECAP ROW CARD =====
function buildRecapCard(entry) {
  const wrapper = document.createElement("div");
  wrapper.className =
    "bg-white border border-gray-200 rounded-lg overflow-hidden flex";

  // LEFT: Diary + date
  const left = document.createElement("div");
  left.className = "flex-1 px-4 py-3";

  const diaryLabel = document.createElement("div");
  diaryLabel.className = "text-xs font-semibold text-gray-500 mb-1";
  diaryLabel.textContent = "Diary";

  const diaryText = document.createElement("p");
  diaryText.className = "text-sm text-gray-800 whitespace-pre-line mb-3";
  diaryText.textContent = entry.diary || "(no diary text)";

  const dateLabel = document.createElement("span");
  dateLabel.className = "text-xs font-semibold text-gray-500 mr-1";
  dateLabel.textContent = "Date";

  const dateValue = document.createElement("span");
  dateValue.className = "text-xs text-gray-700";
  dateValue.textContent = formatDate(entry.date);

  const dateRow = document.createElement("div");
  dateRow.appendChild(dateLabel);
  dateRow.appendChild(dateValue);

  left.appendChild(diaryLabel);
  left.appendChild(diaryText);
  left.appendChild(dateRow);

  // RIGHT: Emotion box
  const right = document.createElement("div");
  right.className =
    "w-40 border-l border-gray-200 flex flex-col items-center justify-center px-3 py-2 text-center";

  const emoLabel = document.createElement("div");
  emoLabel.className = "text-xs font-semibold text-gray-500 mb-1";
  emoLabel.textContent = "Emotion that day";

  const emoBadge = document.createElement("div");
  const emotion = (entry.final || "").toLowerCase();

  const { badgeText, badgeClasses } = getEmotionBadgeStyle(emotion);
  emoBadge.className =
    "text-xs font-semibold px-2 py-1 rounded-full border " + badgeClasses;
  emoBadge.textContent = badgeText;

  right.appendChild(emoLabel);
  right.appendChild(emoBadge);

  wrapper.appendChild(left);
  wrapper.appendChild(right);

  return wrapper;
}

// ===== EMOTION COLOR MAPPING =====
function getEmotionBadgeStyle(emotion) {
  switch (emotion) {
    case "happy":
      return {
        badgeText: "Happy",
        badgeClasses: "bg-green-50 text-green-700 border-green-300"
      };
    case "sad":
      return {
        badgeText: "Sad",
        badgeClasses: "bg-blue-50 text-blue-700 border-blue-300"
      };
    case "angry":
    case "mad":
      return {
        badgeText: "Angry",
        badgeClasses: "bg-red-50 text-red-700 border-red-300"
      };
    default:
      return {
        badgeText: emotion ? capitalize(emotion) : "Unknown",
        badgeClasses: "bg-gray-50 text-gray-600 border-gray-300"
      };
  }
}

// ===== UTILITIES =====
function formatDate(dateStr) {
  if (!dateStr) return "-";
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return dateStr; // fallback raw
  return d.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric"
  });
}

function capitalize(s) {
  if (!s) return "";
  return s.charAt(0).toUpperCase() + s.slice(1);
}
