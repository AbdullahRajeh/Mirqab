const FALLBACK_IMAGE =
  "https://images.unsplash.com/photo-1515162816999-a0c47dc192f7?auto=format&fit=crop&w=400&q=80";

const STATS_ENDPOINT = "/api/v1/detections/stats";
const VIDEOS_ENDPOINT = "/api/v1/videos";
const REVIEWS_ENDPOINT = "/api/v1/detections/reviews";
const PIPELINE_UPLOAD = "/api/v1/pipeline/upload";

function pipelineUploadStatusUrl(uploadId) {
  return `/api/v1/pipeline/upload/${encodeURIComponent(uploadId)}`;
}

function detectionReviewUrl(detectionId) {
  return `/api/v1/detections/${encodeURIComponent(detectionId)}/review`;
}

function buildDetectionsUrl() {
  const params = new URLSearchParams();
  params.set("limit", String(state.limit));
  params.set("offset", String(state.offset));
  params.set("sortBy", state.sortBy);
  params.set("sortOrder", state.sortOrder);
  if (state.videoId) {
    params.set("videoId", state.videoId);
  }
  return `/api/v1/detections?${params.toString()}`;
}

function buildStatsUrl() {
  const params = new URLSearchParams();
  if (state.videoId) {
    params.set("videoId", state.videoId);
  }
  const q = params.toString();
  return q ? `${STATS_ENDPOINT}?${q}` : STATS_ENDPOINT;
}

const message = document.getElementById("message");
const totalPinsEl = document.getElementById("total-pins");
const worstHoodEl = document.getElementById("worst-hood");
const avgConfidenceEl = document.getElementById("avg-confidence");
const pinsBody = document.getElementById("pins-body");
const pinsTable = document.getElementById("pins-table");
const chartCanvas = document.getElementById("severityChart");

const videoFilterEl = document.getElementById("video-filter");
const pageSizeEl = document.getElementById("page-size");
const sortByEl = document.getElementById("sort-by");
const sortOrderEl = document.getElementById("sort-order");
const compactToggleEl = document.getElementById("compact-toggle");
const btnRefresh = document.getElementById("btn-refresh");
const pageInfoEl = document.getElementById("page-info");
const btnPrevPage = document.getElementById("btn-prev-page");
const btnNextPage = document.getElementById("btn-next-page");

const uploadInput = document.getElementById("upload-input");
const uploadTrigger = document.getElementById("upload-trigger");
const uploadFilename = document.getElementById("upload-filename");
const uploadProgressWrap = document.getElementById("upload-progress-wrap");
const uploadProgressBar = document.getElementById("upload-progress-bar");
const uploadStatusText = document.getElementById("upload-status-text");

const reviewImage = document.getElementById("review-image");
const reviewEmpty = document.getElementById("review-empty");
const reviewMeta = document.getElementById("review-meta");
const reviewQueueHint = document.getElementById("review-queue-hint");
const btnReviewPrev = document.getElementById("btn-review-prev");
const btnReviewNext = document.getElementById("btn-review-next");
const btnApprove = document.getElementById("btn-approve");
const btnReject = document.getElementById("btn-reject");
const mapLink = document.getElementById("map-link");

const state = {
  detections: [],
  stats: null,
  /** @type {Map<string, 'approved' | 'rejected'>} */
  reviews: new Map(),
  total: 0,
  limit: 200,
  offset: 0,
  videoId: "",
  sortBy: "timestampSec",
  sortOrder: "desc",
  compact: false,
  chart: null,
  activeDetectionId: null,
};

boot().catch((error) => {
  console.error(error);
  setMessage("تعذر تشغيل لوحة التحليلات.", true);
});

async function boot() {
  bindUi();
  readControlsFromDom();
  await loadAll({ resetSelection: true });
}

function readControlsFromDom() {
  if (pageSizeEl instanceof HTMLSelectElement) {
    state.limit = Number.parseInt(pageSizeEl.value, 10) || 200;
  }
  if (sortByEl instanceof HTMLSelectElement) {
    state.sortBy = sortByEl.value;
  }
  if (sortOrderEl instanceof HTMLSelectElement) {
    state.sortOrder = sortOrderEl.value;
  }
  if (videoFilterEl instanceof HTMLSelectElement) {
    state.videoId = videoFilterEl.value.trim();
  }
  if (compactToggleEl instanceof HTMLInputElement) {
    state.compact = compactToggleEl.checked;
  }
}

function bindUi() {
  btnRefresh?.addEventListener("click", () => {
    void loadAll({ resetSelection: false });
  });

  videoFilterEl?.addEventListener("change", () => {
    if (videoFilterEl instanceof HTMLSelectElement) {
      state.videoId = videoFilterEl.value.trim();
      state.offset = 0;
      void loadAll({ resetSelection: true });
    }
  });

  pageSizeEl?.addEventListener("change", () => {
    if (pageSizeEl instanceof HTMLSelectElement) {
      state.limit = Number.parseInt(pageSizeEl.value, 10) || 200;
      state.offset = 0;
      void loadAll({ resetSelection: true });
    }
  });

  sortByEl?.addEventListener("change", () => {
    if (sortByEl instanceof HTMLSelectElement) {
      state.sortBy = sortByEl.value;
      state.offset = 0;
      void loadAll({ resetSelection: true });
    }
  });

  sortOrderEl?.addEventListener("change", () => {
    if (sortOrderEl instanceof HTMLSelectElement) {
      state.sortOrder = sortOrderEl.value;
      state.offset = 0;
      void loadAll({ resetSelection: true });
    }
  });

  compactToggleEl?.addEventListener("change", () => {
    if (compactToggleEl instanceof HTMLInputElement) {
      state.compact = compactToggleEl.checked;
      renderTable();
    }
  });

  btnPrevPage?.addEventListener("click", () => {
    state.offset = Math.max(0, state.offset - state.limit);
    void loadAll({ resetSelection: true });
  });

  btnNextPage?.addEventListener("click", () => {
    const next = state.offset + state.limit;
    if (next < state.total) {
      state.offset = next;
      void loadAll({ resetSelection: true });
    }
  });

  uploadTrigger?.addEventListener("click", () => {
    uploadInput?.click();
  });

  uploadInput?.addEventListener("change", () => {
    const input = uploadInput;
    if (!(input instanceof HTMLInputElement) || !input.files?.length) {
      return;
    }
    const [file] = input.files;
    if (uploadFilename) {
      uploadFilename.textContent = file.name;
    }
    const skipFramesEl = document.getElementById("skip-frames-input");
    const skipFrames =
      skipFramesEl instanceof HTMLInputElement
        ? Math.max(1, Math.min(120, Number.parseInt(skipFramesEl.value, 10) || 10))
        : 10;
    void runPipelineUpload(file, skipFrames);
    input.value = "";
  });

  btnReviewPrev?.addEventListener("click", () => {
    navigateQueue(-1);
  });

  btnReviewNext?.addEventListener("click", () => {
    navigateQueue(1);
  });

  btnApprove?.addEventListener("click", () => {
    void submitReview("approved");
  });

  btnReject?.addEventListener("click", () => {
    void submitReview("rejected");
  });

  pinsBody?.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof Element)) {
      return;
    }
    if (target.closest("a")) {
      return;
    }
    const row = target.closest("tr[data-detection-id]");
    if (!(row instanceof HTMLTableRowElement)) {
      return;
    }
    const id = row.dataset.detectionId;
    if (id) {
      selectDetection(id);
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.defaultPrevented) {
      return;
    }
    const tag = event.target instanceof Element ? event.target.tagName : "";
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || tag === "BUTTON") {
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      navigateQueue(1);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      navigateQueue(-1);
    }
  });
}

function getPendingQueue() {
  return state.detections.filter((d) => !state.reviews.has(d.id));
}

function navigateQueue(delta) {
  const pending = getPendingQueue();
  if (pending.length === 0) {
    return;
  }
  let idx = pending.findIndex((d) => d.id === state.activeDetectionId);
  if (idx < 0) {
    idx = delta > 0 ? -1 : 0;
  }
  idx = Math.min(pending.length - 1, Math.max(0, idx + delta));
  selectDetection(pending[idx].id);
}

function selectDetection(id) {
  state.activeDetectionId = id;
  renderTable();
  renderReviewPanel();
}

async function loadAll({ resetSelection }) {
  setMessage("جاري تحميل البيانات...", false);
  setLoading(true);
  try {
    const [reviewsPayload, videosPayload, statsPayload, detectionsPayload] = await Promise.all([
      fetchJson(REVIEWS_ENDPOINT),
      fetchJson(VIDEOS_ENDPOINT),
      fetchJson(buildStatsUrl()),
      fetchJson(buildDetectionsUrl()),
    ]);

    mergeReviews(reviewsPayload.items ?? []);
    fillVideoFilter(videosPayload.items ?? []);
    state.stats = statsPayload;
    state.detections = normalizeDetections(detectionsPayload.items ?? []);
    state.total = Number(detectionsPayload.total ?? 0);

    renderStats();
    renderChart();
    renderPagination();
    renderTable();

    if (resetSelection) {
      const pending = getPendingQueue();
      state.activeDetectionId = pending[0]?.id ?? state.detections[0]?.id ?? null;
    } else if (state.activeDetectionId && !state.detections.some((d) => d.id === state.activeDetectionId)) {
      const pending = getPendingQueue();
      state.activeDetectionId = pending[0]?.id ?? state.detections[0]?.id ?? null;
    }

    renderReviewPanel();
    setMessage(`تم تحميل ${state.total} اكتشافاً (معروض ${state.detections.length} في هذه الصفحة).`, false);
  } catch (error) {
    console.error(error);
    setMessage(error instanceof Error ? error.message : "تعذر تحميل البيانات.", true);
    renderEmptyState();
  } finally {
    setLoading(false);
  }
}

function mergeReviews(items) {
  state.reviews.clear();
  for (const row of items) {
    const id = row.detection_id;
    const decision = row.decision;
    if (id && (decision === "approved" || decision === "rejected")) {
      state.reviews.set(id, decision);
    }
  }
}

function fillVideoFilter(items) {
  if (!(videoFilterEl instanceof HTMLSelectElement)) {
    return;
  }
  const current = state.videoId;
  const options = ['<option value="">الكل</option>'];
  for (const v of items) {
    const vid = escapeHtml(String(v.video_id ?? ""));
    const selected = v.video_id === current ? " selected" : "";
    options.push(`<option value="${vid}"${selected}>${vid}</option>`);
  }
  videoFilterEl.innerHTML = options.join("");
  if (current) {
    videoFilterEl.value = current;
  }
}

const STATUS_LABELS = {
  queued: "في الانتظار...",
  inference: "تحليل الفيديو...",
  gps: "استخراج إحداثيات GPS...",
  complete: "اكتملت المعالجة",
  failed: "فشلت المعالجة",
};

function xhrUpload(url, formData, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url);
    xhr.upload.addEventListener("progress", (e) => {
      if (e.lengthComputable) onProgress(e.loaded / e.total);
    });
    xhr.addEventListener("load", () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try { resolve(JSON.parse(xhr.responseText)); }
        catch { reject(new Error("Invalid JSON response")); }
      } else {
        let msg = `Upload failed (${xhr.status})`;
        try { msg = JSON.parse(xhr.responseText).message ?? msg; } catch {}
        reject(new Error(msg));
      }
    });
    xhr.addEventListener("error", () => reject(new Error("Network error during upload")));
    xhr.send(formData);
  });
}

async function runPipelineUpload(file, skipFrames = 10) {
  if (uploadProgressWrap) {
    uploadProgressWrap.hidden = false;
  }
  setUploadProgress(0, "جاري رفع الفيديو...");
  try {
    const formData = new FormData();
    formData.append("video", file);
    formData.append("skipFrames", String(skipFrames));
    // XHR so we get real upload progress events
    const created = await xhrUpload(PIPELINE_UPLOAD, formData, (ratio) => {
      setUploadProgress(Math.round(ratio * 25), `جاري رفع الفيديو... ${Math.round(ratio * 100)}%`);
    });
    const uploadId = created.uploadId;
    setUploadProgress(created.progress ?? 0, STATUS_LABELS[created.status] ?? created.status);
    await pollPipelineUntilDone(uploadId);
    setMessage(`اكتملت المعالجة (${file.name}). جارٍ تحديث البيانات...`, false);
    await loadAll({ resetSelection: true });
  } catch (error) {
    console.error(error);
    setMessage(error instanceof Error ? error.message : "تعذر إكمال معالجة الفيديو.", true);
  } finally {
    if (uploadProgressWrap) {
      uploadProgressWrap.hidden = true;
    }
    setUploadProgress(0, "");
  }
}

function setUploadProgress(pct, label) {
  if (uploadProgressBar instanceof HTMLElement) {
    uploadProgressBar.style.width = `${Math.min(100, Math.max(0, pct))}%`;
  }
  if (uploadStatusText) {
    uploadStatusText.textContent = label;
  }
}

function sleep(ms) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

async function pollPipelineUntilDone(uploadId) {
  // Pipeline can take several minutes; poll every 3 seconds for up to 30 min
  for (let tick = 0; tick < 600; tick += 1) {
    const status = await fetchJson(pipelineUploadStatusUrl(uploadId));
    const label = STATUS_LABELS[status.status] ?? status.status;
    setUploadProgress(status.progress ?? 0, `${label} — ${status.progress ?? 0}%`);
    if (status.status === "complete") {
      return;
    }
    if (status.status === "failed") {
      throw new Error(status.error ?? "فشلت المعالجة.");
    }
    await sleep(3000);
  }
  throw new Error("انتهت مهلة انتظار المعالجة.");
}

async function submitReview(decision) {
  const id = state.activeDetectionId;
  if (!id || state.reviews.has(id)) {
    return;
  }
  setLoading(true);
  try {
    await fetchJson(detectionReviewUrl(id), {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ decision }),
    });
    state.reviews.set(id, decision);
    const pending = getPendingQueue();
    state.activeDetectionId = pending[0]?.id ?? null;
    renderTable();
    renderReviewPanel();
    setMessage(decision === "approved" ? "تمت الموافقة على الاكتشاف." : "تم رفض الاكتشاف.", false);
  } catch (error) {
    console.error(error);
    setMessage(error instanceof Error ? error.message : "تعذر حفظ المراجعة.", true);
  } finally {
    setLoading(false);
  }
}

async function fetchJson(url, init) {
  const response = await fetch(url, {
    credentials: "same-origin",
    ...init,
    headers: {
      Accept: "application/json",
      ...init?.headers,
    },
  });

  if (response.status === 401) {
    throw new Error("يلزم تسجيل دخول المشرف. انتقل إلى صفحة /login ثم أعد المحاولة.");
  }

  if (!response.ok) {
    let details = response.statusText;
    try {
      const payload = await response.json();
      details = payload.message || payload.code || details;
    } catch {
      // ignore
    }
    throw new Error(details || `Request failed with status ${response.status}`);
  }

  return response.json();
}

function normalizeDetections(items) {
  return items.map((item) => ({
    id: item.detection_id,
    pointId: `${item.video_id}:${item.frame_id}`,
    videoId: item.video_id,
    frameId: item.frame_id,
    timestampSec: Number(item.video_timestamp_sec),
    confidencePct: toPercent(item.confidence),
    lat: Number(item.gps?.latitude),
    lng: Number(item.gps?.longitude),
    imageUrl: item.image_url,
  }));
}

function renderStats() {
  const stats = state.stats;
  if (!stats) {
    renderEmptyState();
    return;
  }

  const topVideo = [...(stats.per_video ?? [])].sort(
    (left, right) => right.detection_count - left.detection_count,
  )[0];

  setText(totalPinsEl, String(stats.total_detections ?? 0));
  setText(avgConfidenceEl, formatPercent(stats.average_confidence));
  setText(worstHoodEl, topVideo ? formatVideoId(topVideo.video_id) : "-");
}

function renderPagination() {
  if (!pageInfoEl) {
    return;
  }
  const from = state.total === 0 ? 0 : state.offset + 1;
  const to = Math.min(state.offset + state.detections.length, state.total);
  pageInfoEl.textContent = `${from}–${to} من ${state.total}`;
  if (btnPrevPage instanceof HTMLButtonElement) {
    btnPrevPage.disabled = state.offset <= 0;
  }
  if (btnNextPage instanceof HTMLButtonElement) {
    btnNextPage.disabled = state.offset + state.limit >= state.total;
  }
}

function renderTable() {
  if (!pinsBody) {
    return;
  }

  pinsTable?.classList.toggle("is-compact", state.compact);

  if (state.detections.length === 0) {
    pinsBody.innerHTML =
      '<tr><td colspan="7" style="text-align:center; color: var(--text-muted); padding: 2rem 0;">لا توجد اكتشافات لعرضها.</td></tr>';
    return;
  }

  pinsBody.innerHTML = state.detections
    .map((detection) => {
      const decision = state.reviews.get(detection.id);
      const badge = decision
        ? decision === "approved"
          ? '<span class="review-badge review-badge--approved">موافق</span>'
          : '<span class="review-badge review-badge--rejected">مرفوض</span>'
        : '<span class="review-badge review-badge--pending">معلّق</span>';
      const rowClasses = [];
      if (detection.id === state.activeDetectionId) {
        rowClasses.push("pin-row--selected");
      }
      const rowClassAttr = rowClasses.length > 0 ? ` class="${rowClasses.join(" ")}"` : "";
      const mapHref = `/?focus=${encodeURIComponent(detection.pointId)}`;
      return `
        <tr${rowClassAttr} data-detection-id="${escapeHtml(detection.id)}">
          <td><img src="${escapeHtml(detection.imageUrl)}" class="pin-row__img" alt="" onerror="this.onerror=null;this.src='${FALLBACK_IMAGE}'"></td>
          <td class="pin-row__hood">${escapeHtml(formatVideoId(detection.videoId))}</td>
          <td>${escapeHtml(String(detection.frameId))}</td>
          <td>${escapeHtml(formatSeconds(detection.timestampSec))}</td>
          <td>
            <div class="pin-row__confidence">
              <div class="pin-row__bar">
                <div class="pin-row__bar-fill" style="width:${detection.confidencePct}%;"></div>
              </div>
              <span class="pin-row__value">${detection.confidencePct}%</span>
            </div>
          </td>
          <td>${badge}</td>
          <td>
            <a class="pin-row__view-btn pin-row__select-btn" href="${mapHref}">خريطة</a>
          </td>
        </tr>
      `;
    })
    .join("");
}

function renderReviewPanel() {
  const pending = getPendingQueue();
  if (reviewQueueHint) {
    reviewQueueHint.textContent =
      pending.length > 0 ? `${pending.length} بانتظار المراجعة في هذه الصفحة` : "لا توجد عناصر معلّقة في هذه الصفحة";
  }

  const detection = state.detections.find((d) => d.id === state.activeDetectionId) ?? null;
  if (!detection) {
    if (reviewImage instanceof HTMLImageElement) {
      reviewImage.hidden = true;
      reviewImage.removeAttribute("src");
    }
    if (reviewEmpty) {
      reviewEmpty.hidden = false;
    }
    if (reviewMeta) {
      reviewMeta.innerHTML = "";
    }
    if (mapLink instanceof HTMLAnchorElement) {
      mapLink.hidden = true;
    }
    if (btnApprove instanceof HTMLButtonElement) {
      btnApprove.disabled = true;
    }
    if (btnReject instanceof HTMLButtonElement) {
      btnReject.disabled = true;
    }
    return;
  }

  if (reviewEmpty) {
    reviewEmpty.hidden = true;
  }
  if (reviewImage instanceof HTMLImageElement) {
    reviewImage.hidden = false;
    reviewImage.src = detection.imageUrl;
    reviewImage.alt = `إطار ${detection.frameId}`;
    reviewImage.onerror = () => {
      reviewImage.onerror = null;
      reviewImage.src = FALLBACK_IMAGE;
    };
  }

  const reviewed = state.reviews.has(detection.id);
  if (btnApprove instanceof HTMLButtonElement) {
    btnApprove.disabled = reviewed;
  }
  if (btnReject instanceof HTMLButtonElement) {
    btnReject.disabled = reviewed;
  }

  if (reviewMeta) {
    const decision = state.reviews.get(detection.id);
    reviewMeta.innerHTML = `
      <dt>الفيديو</dt><dd>${escapeHtml(formatVideoId(detection.videoId))}</dd>
      <dt>الإطار</dt><dd>${escapeHtml(String(detection.frameId))}</dd>
      <dt>الوقت</dt><dd>${escapeHtml(formatSeconds(detection.timestampSec))}</dd>
      <dt>الثقة</dt><dd>${detection.confidencePct}%</dd>
      <dt>الإحداثيات</dt><dd>${escapeHtml(`${detection.lat.toFixed(5)}, ${detection.lng.toFixed(5)}`)}</dd>
      <dt>المراجعة</dt><dd>${decision ? (decision === "approved" ? "موافق" : "مرفوض") : "معلّق"}</dd>
    `;
  }

  if (mapLink instanceof HTMLAnchorElement) {
    mapLink.hidden = false;
    mapLink.href = `/?focus=${encodeURIComponent(detection.pointId)}`;
  }
}

function renderChart() {
  if (!chartCanvas) {
    return;
  }

  const ChartCtor = globalThis.Chart;
  if (typeof ChartCtor === "undefined") {
    return;
  }

  const perVideo = [...(state.stats?.per_video ?? [])]
    .sort((left, right) => right.detection_count - left.detection_count)
    .slice(0, 6);

  const labels = perVideo.length > 0 ? perVideo.map((item) => formatVideoId(item.video_id)) : ["No Data"];
  const values = perVideo.length > 0 ? perVideo.map((item) => item.detection_count) : [0];

  if (state.chart) {
    state.chart.data.labels = labels;
    state.chart.data.datasets[0].data = values;
    state.chart.update();
    return;
  }

  state.chart = new ChartCtor(chartCanvas, {
    type: "bar",
    data: {
      labels,
      datasets: [
        {
          label: "الاكتشافات حسب الفيديو",
          data: values,
          backgroundColor: "#ffffff",
          borderRadius: 999,
          maxBarThickness: 34,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
      },
      scales: {
        x: {
          ticks: { color: "#a8a8a8", font: { family: "Cairo", size: 11 } },
          grid: { display: false },
        },
        y: {
          beginAtZero: true,
          ticks: { color: "#a8a8a8", precision: 0 },
          grid: { color: "rgba(255,255,255,0.08)" },
        },
      },
    },
  });
}

function renderEmptyState() {
  setText(totalPinsEl, "0");
  setText(avgConfidenceEl, "0%");
  setText(worstHoodEl, "-");
  if (pinsBody) {
    pinsBody.innerHTML =
      '<tr><td colspan="7" style="text-align:center; color: var(--text-muted); padding: 2rem 0;">لا توجد بيانات متاحة.</td></tr>';
  }
  if (pageInfoEl) {
    pageInfoEl.textContent = "";
  }
}

function setLoading(isLoading) {
  if (btnRefresh instanceof HTMLButtonElement) {
    btnRefresh.disabled = isLoading;
  }
}

function setText(element, value) {
  if (element) {
    element.textContent = value;
  }
}

function setMessage(text, isError) {
  if (!message) {
    return;
  }
  message.textContent = text;
  message.classList.toggle("error", Boolean(isError));
}

function toPercent(value) {
  return Math.round(Number(value ?? 0) * 100);
}

function formatPercent(value) {
  if (value === null || value === undefined) {
    return "0%";
  }
  return `${toPercent(value)}%`;
}

function formatVideoId(videoId) {
  return String(videoId).replace(/_/g, " ").toUpperCase();
}

function formatSeconds(value) {
  const totalSeconds = Number(value ?? 0);
  if (!Number.isFinite(totalSeconds)) {
    return "-";
  }
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.round(totalSeconds % 60)
    .toString()
    .padStart(2, "0");
  return `${minutes}:${seconds}`;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
