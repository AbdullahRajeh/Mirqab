/**
 * MIRQAB / UPLOAD_LOGIC_V2
 * Integrated System Health & Multi-step UI
 */

const PIPELINE_UPLOAD = "/api/v1/pipeline/upload";
const DETECTIONS_ENDPOINT = "/api/v1/detections";
const HEALTH_ENDPOINT = "/health";

function pipelineStatusUrl(uploadId) {
  return `/api/v1/pipeline/upload/${encodeURIComponent(uploadId)}`;
}

const state = {
  currentStep: 1,
  uploadId: null,
  runName: null,
  detections: [],
  isSystemReady: false,
};

// Elements
const step1 = document.getElementById("step-1");
const step2 = document.getElementById("step-2");
const step3 = document.getElementById("step-3");
const stepDots = [
  document.getElementById("step-dot-1"),
  document.getElementById("step-dot-2"),
  document.getElementById("id-dot-3"),
];

const fileInput = document.getElementById("file-input");
const dropZone = document.getElementById("drop-zone");
const selectBtn = document.getElementById("select-btn");
const skipFramesInput = document.getElementById("skip-frames");

const progressFill = document.getElementById("progress-fill");
const progressPct = document.getElementById("progress-pct");
const progressStatus = document.getElementById("progress-status");

const detectionCount = document.getElementById("detection-count");
const framesGrid = document.getElementById("frames-grid");
const restartBtn = document.getElementById("restart-btn");
const viewDashboardBtn = document.getElementById("view-dashboard-btn");

const messageEl = document.getElementById("message");

// Init
async function boot() {
  bindUi();
  await checkSystemHealth();
}

async function checkSystemHealth() {
  try {
    const res = await fetch(HEALTH_ENDPOINT);
    const data = await res.json();

    state.isSystemReady = res.ok && data.status === "ok";
  } catch {
    state.isSystemReady = false;
  }
}

function bindUi() {
  selectBtn?.addEventListener("click", () => fileInput?.click());

  fileInput?.addEventListener("change", (e) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  });

  dropZone?.addEventListener("dragover", (e) => {
    e.preventDefault();
    dropZone.classList.add("drag-over");
  });

  dropZone?.addEventListener("dragleave", () => {
    dropZone.classList.remove("drag-over");
  });

  dropZone?.addEventListener("drop", (e) => {
    e.preventDefault();
    dropZone.classList.remove("drag-over");
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  });

  restartBtn?.addEventListener("click", () => window.location.reload());
  viewDashboardBtn?.addEventListener("click", () => window.location.href = "/map");
}

async function handleFile(file) {
  if (!state.isSystemReady) {
    showNotifier("لا يمكن الرفع حالياً: نظام المعالجة غير متاح.", true);
    return;
  }
  
  if (!file.type.startsWith("video/") && !file.name.toLowerCase().endsWith(".mov")) {
    showNotifier("الرجاء اختيار ملف فيديو صالح", true);
    return;
  }

  goToStep(2);
  
  const skipFrames = parseInt(skipFramesInput.value) || 30;
  
  try {
    const formData = new FormData();
    formData.append("video", file);
    formData.append("skipFrames", skipFrames.toString());

    updateProgress(0, "جاري رفع الملف...");
    const uploadRes = await xhrUpload(PIPELINE_UPLOAD, formData, (ratio) => {
      updateProgress(ratio * 25, `جاري الرفع... ${Math.round(ratio * 100)}%`);
    });

    state.uploadId = uploadRes.uploadId;
    state.runName = uploadRes.runName;

    await pollStatus(state.uploadId);
    await fetchResults(state.runName);

    goToStep(3);
  } catch (error) {
    console.error(error);
    showNotifier(error.message || "حدث خطأ أثناء المعالجة", true);
    setTimeout(() => goToStep(1), 3000);
  }
}

function goToStep(num) {
  state.currentStep = num;
  [step1, step2, step3].forEach((s, i) => {
    if (s) s.classList.toggle("active", i + 1 === num);
  });
  stepDots.forEach((d, i) => {
    if (d) d.classList.toggle("active", i + 1 === num);
  });
}

function updateProgress(pct, status) {
  if (progressFill) progressFill.style.width = `${pct}%`;
  if (progressPct) progressPct.textContent = `${Math.round(pct)}%`;
  if (progressStatus) progressStatus.textContent = status;
}

function xhrUpload(url, formData, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url);
    xhr.upload.addEventListener("progress", (e) => {
      if (e.lengthComputable) onProgress(e.loaded / e.total);
    });
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(JSON.parse(xhr.responseText));
      } else {
        let msg = "فشل الرفع";
        try { msg = JSON.parse(xhr.responseText).message || msg; } catch {}
        reject(new Error(msg));
      }
    };
    xhr.onerror = () => reject(new Error("خطأ في الشبكة"));
    xhr.send(formData);
  });
}

async function pollStatus(id) {
  const POLLING_INTERVAL = 3000;
  while (true) {
    const res = await fetch(pipelineStatusUrl(id));
    if (!res.ok) throw new Error("فشل في جلب حالة المعالجة");
    const data = await res.json();
    
    let progress = Math.max(25, data.progress || 0);
    updateProgress(progress, getStatusLabel(data.status));

    if (data.status === "complete") {
      if (data.warning) {
        showNotifier(data.warning, false);
      }
      break;
    }
    if (data.status === "failed") throw new Error(data.error || "فشلت المعالجة");
    
    await new Promise(r => setTimeout(r, POLLING_INTERVAL));
  }
}

function getStatusLabel(status) {
  switch (status) {
    case "queued": return "في قائمة الانتظار...";
    case "inference": return "جاري تشغيل تحليل الذكاء الاصطناعي...";
    case "gps": return "جاري استخراج إحداثيات GPS...";
    case "complete": return "اكتملت المعالجة";
    case "failed": return "فشلت المعالجة";
    default: return "جاري العمل...";
  }
}

async function fetchResults(videoId) {
  const url = `${DETECTIONS_ENDPOINT}?videoId=${encodeURIComponent(videoId)}&limit=12`;
  const res = await fetch(url);
  if (!res.ok) return;
  const data = await res.json();
  state.detections = data.items || [];
  renderResults();
}

function renderResults() {
  if (detectionCount) detectionCount.textContent = state.detections.length;
  if (!framesGrid) return;

  if (state.detections.length === 0) {
    framesGrid.innerHTML = '<p style="grid-column: 1/-1; text-align: center; color: #666; padding: 3rem;">لم يتم العثور على عيوب في هذا الفيديو.</p>';
    return;
  }

  framesGrid.innerHTML = state.detections.map(d => `
    <div class="frame-card">
      <div class="frame-img-wrap">
        <img src="${d.image_url}" alt="Detection Frame">
      </div>
      <div class="frame-info">
        <span class="frame-label">إطار رقم</span>
        <span class="frame-value">${d.frame_id}</span>
      </div>
      <div class="frame-info">
        <span class="frame-label">نسبة الثقة</span>
        <span class="frame-value">${Math.round(d.confidence * 100)}%</span>
      </div>
    </div>
  `).join("");
}

function showNotifier(text, isError) {
  if (!messageEl) return;
  messageEl.textContent = text;
  messageEl.className = `system-message visible ${isError ? 'error' : ''}`;
  setTimeout(() => messageEl.classList.remove("visible"), 8000);
}

boot();
