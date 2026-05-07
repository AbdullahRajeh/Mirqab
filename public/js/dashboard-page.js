const FALLBACK_IMAGE =
  "https://images.unsplash.com/photo-1515162816999-a0c47dc192f7?auto=format&fit=crop&w=400&q=80";

const STATS_ENDPOINT = "/api/v1/detections/stats";
const VIDEOS_ENDPOINT = "/api/v1/videos";
const REVIEWS_ENDPOINT = "/api/v1/detections/reviews";
const PIPELINE_UPLOAD = "/api/v1/pipeline/upload";

function pipelineUploadStatusUrl(id) { return `/api/v1/pipeline/upload/${encodeURIComponent(id)}`; }
function detectionReviewUrl(id) { return `/api/v1/detections/${encodeURIComponent(id)}/review`; }

function buildDetectionsUrl() {
  const p = new URLSearchParams();
  p.set("limit", String(state.limit));
  p.set("offset", String(state.offset));
  p.set("sortBy", state.sortBy);
  p.set("sortOrder", state.sortOrder);
  if (state.videoId) p.set("videoId", state.videoId);
  return `/api/v1/detections?${p.toString()}`;
}

function buildStatsUrl() {
  const p = new URLSearchParams();
  if (state.videoId) p.set("videoId", state.videoId);
  const q = p.toString();
  return q ? `${STATS_ENDPOINT}?${q}` : STATS_ENDPOINT;
}

// ── Element refs ──
const message       = document.getElementById("message");
const totalPinsEl   = document.getElementById("total-pins");
const deletedCountEl= document.getElementById("deleted-count");
const worstHoodEl   = document.getElementById("worst-hood");
const avgConfEl     = document.getElementById("avg-confidence");
const pinsBody      = document.getElementById("pins-body");
const pinsTable     = document.getElementById("pins-table");
const chartCanvas   = document.getElementById("severityChart");

const videoFilterEl  = document.getElementById("video-filter");
const pageSizeEl     = document.getElementById("page-size");
const sortByEl       = document.getElementById("sort-by");
const sortOrderEl    = document.getElementById("sort-order");
const compactToggle  = document.getElementById("compact-toggle");
const btnRefresh     = document.getElementById("btn-refresh");
const pageInfoEl     = document.getElementById("page-info");
const btnPrevPage    = document.getElementById("btn-prev-page");
const btnNextPage    = document.getElementById("btn-next-page");

const uploadInput       = document.getElementById("upload-input");
const uploadTrigger     = document.getElementById("upload-trigger");
const uploadFilename    = document.getElementById("upload-filename");
const uploadDropzone    = document.getElementById("upload-dropzone");
const dropzoneIdle      = document.getElementById("dropzone-idle");
const uploadProgressWrap= document.getElementById("upload-progress-wrap");
const uploadProgressBar = document.getElementById("upload-progress-bar");
const uploadStatusText  = document.getElementById("upload-status-text");

const reviewImage        = document.getElementById("review-image");
const reviewImageTrigger = document.getElementById("review-image-trigger");
const reviewEmpty        = document.getElementById("review-empty");
const reviewMeta         = document.getElementById("review-meta");
const reviewQueueHint    = document.getElementById("review-queue-hint");
const btnReviewPrev      = document.getElementById("btn-review-prev");
const btnReviewNext      = document.getElementById("btn-review-next");
const btnDelete          = document.getElementById("btn-delete");
const btnRestore         = document.getElementById("btn-restore");
const mapLink            = document.getElementById("map-link");

const imageViewer       = document.getElementById("image-viewer");
const imageViewerBackdrop= document.getElementById("image-viewer-backdrop");
const imageViewerImage  = document.getElementById("image-viewer-image");
const imageViewerStage  = document.getElementById("image-viewer-stage");
const imageViewerZoomVal= document.getElementById("image-viewer-zoom-value");
const imageViewerZoomIn = document.getElementById("image-viewer-zoom-in");
const imageViewerZoomOut= document.getElementById("image-viewer-zoom-out");
const imageViewerClose  = document.getElementById("image-viewer-close");

const state = {
  detections: [],
  stats: null,
  /** @type {Map<string, 'approved'|'rejected'>} */
  reviews: new Map(),
  total: 0, limit: 200, offset: 0,
  videoId: "", sortBy: "timestampSec", sortOrder: "desc",
  compact: false, chart: null,
  activeDetectionId: null, imageViewerZoom: 1,
};

boot().catch((err) => { console.error(err); setMessage("تعذر تشغيل لوحة الإدارة.", true); });

async function boot() {
  bindUi();
  readControlsFromDom();
  await loadAll({ resetSelection: true });
}

function readControlsFromDom() {
  if (pageSizeEl instanceof HTMLSelectElement)  state.limit    = parseInt(pageSizeEl.value, 10) || 200;
  if (sortByEl instanceof HTMLSelectElement)    state.sortBy   = sortByEl.value;
  if (sortOrderEl instanceof HTMLSelectElement) state.sortOrder= sortOrderEl.value;
  if (videoFilterEl instanceof HTMLSelectElement) state.videoId = videoFilterEl.value.trim();
  if (compactToggle instanceof HTMLInputElement)  state.compact  = compactToggle.checked;
}

function bindUi() {
  btnRefresh?.addEventListener("click", () => void loadAll({ resetSelection: false }));

  videoFilterEl?.addEventListener("change", () => {
    state.videoId = videoFilterEl instanceof HTMLSelectElement ? videoFilterEl.value.trim() : "";
    state.offset = 0;
    void loadAll({ resetSelection: true });
  });
  pageSizeEl?.addEventListener("change", () => {
    state.limit = pageSizeEl instanceof HTMLSelectElement ? parseInt(pageSizeEl.value, 10) || 200 : 200;
    state.offset = 0;
    void loadAll({ resetSelection: true });
  });
  sortByEl?.addEventListener("change", () => {
    state.sortBy = sortByEl instanceof HTMLSelectElement ? sortByEl.value : "timestampSec";
    state.offset = 0;
    void loadAll({ resetSelection: true });
  });
  sortOrderEl?.addEventListener("change", () => {
    state.sortOrder = sortOrderEl instanceof HTMLSelectElement ? sortOrderEl.value : "desc";
    state.offset = 0;
    void loadAll({ resetSelection: true });
  });
  compactToggle?.addEventListener("change", () => {
    state.compact = compactToggle instanceof HTMLInputElement ? compactToggle.checked : false;
    renderTable();
  });

  btnPrevPage?.addEventListener("click", () => {
    state.offset = Math.max(0, state.offset - state.limit);
    void loadAll({ resetSelection: true });
  });
  btnNextPage?.addEventListener("click", () => {
    if (state.offset + state.limit < state.total) {
      state.offset += state.limit;
      void loadAll({ resetSelection: true });
    }
  });

  // Upload — button + drag-drop
  uploadTrigger?.addEventListener("click", () => uploadInput?.click());
  uploadInput?.addEventListener("change", () => {
    const f = uploadInput instanceof HTMLInputElement ? uploadInput.files?.[0] : null;
    if (f) { triggerUpload(f); uploadInput.value = ""; }
  });

  if (uploadDropzone instanceof HTMLElement) {
    uploadDropzone.addEventListener("dragover", (e) => {
      e.preventDefault();
      uploadDropzone.classList.add("dropzone--active");
    });
    uploadDropzone.addEventListener("dragleave", (e) => {
      if (!uploadDropzone.contains(/** @type {Node} */(e.relatedTarget)))
        uploadDropzone.classList.remove("dropzone--active");
    });
    uploadDropzone.addEventListener("drop", (e) => {
      e.preventDefault();
      uploadDropzone.classList.remove("dropzone--active");
      const f = e.dataTransfer?.files?.[0];
      if (!f) return;
      if (!/\.(mp4|mov|avi|mkv|webm)$/i.test(f.name)) {
        setMessage("يرجى اختيار ملف فيديو صالح (MP4, MOV, AVI, MKV, WEBM).", true);
        return;
      }
      triggerUpload(f);
    });
  }

  // Review panel
  btnReviewPrev?.addEventListener("click", () => navigateQueue(-1));
  btnReviewNext?.addEventListener("click", () => navigateQueue(1));
  btnDelete?.addEventListener("click",  () => void submitReview("rejected"));
  btnRestore?.addEventListener("click", () => void submitReview("approved"));

  // Image viewer
  reviewImageTrigger?.addEventListener("click", openImageViewer);
  imageViewerBackdrop?.addEventListener("click", closeImageViewer);
  imageViewerClose?.addEventListener("click", closeImageViewer);
  imageViewerZoomIn?.addEventListener("click",  () => setZoom(state.imageViewerZoom + 0.25));
  imageViewerZoomOut?.addEventListener("click", () => setZoom(state.imageViewerZoom - 0.25));
  imageViewerStage?.addEventListener("wheel", (e) => {
    if (!(imageViewer?.hidden ?? true)) { e.preventDefault(); setZoom(state.imageViewerZoom + (e.deltaY < 0 ? 0.2 : -0.2)); }
  }, { passive: false });

  // Column header click-to-sort
  pinsTable?.addEventListener("click", (e) => {
    const th = e.target instanceof Element ? e.target.closest("th[data-sort]") : null;
    if (!(th instanceof HTMLElement)) return;
    const col = th.dataset.sort;
    if (!col) return;
    if (state.sortBy === col) {
      state.sortOrder = state.sortOrder === "desc" ? "asc" : "desc";
    } else {
      state.sortBy = col;
      state.sortOrder = "desc";
    }
    if (sortByEl instanceof HTMLSelectElement) sortByEl.value = state.sortBy;
    if (sortOrderEl instanceof HTMLSelectElement) sortOrderEl.value = state.sortOrder;
    state.offset = 0;
    updateSortHeaders();
    void loadAll({ resetSelection: true });
  });

  // Table — inline delete/restore + row selection
  pinsBody?.addEventListener("click", (e) => {
    const t = e.target;
    if (!(t instanceof Element)) return;
    const btn = t.closest("[data-action][data-id]");
    if (btn instanceof HTMLElement) {
      e.stopPropagation();
      const { id, action } = btn.dataset;
      if (id && action === "delete")   void submitReview("rejected", id);
      if (id && action === "restore")  void submitReview("approved", id);
      return;
    }
    if (t.closest("a")) return;
    const row = t.closest("tr[data-detection-id]");
    if (row instanceof HTMLTableRowElement && row.dataset.detectionId)
      selectDetection(row.dataset.detectionId);
  });

  // Keyboard shortcuts
  document.addEventListener("keydown", (e) => {
    if (e.defaultPrevented) return;
    const tag = e.target instanceof Element ? e.target.tagName : "";
    if (["INPUT","TEXTAREA","SELECT","BUTTON"].includes(tag)) return;
    if (e.key === "ArrowDown")  { e.preventDefault(); navigateQueue(1); }
    else if (e.key === "ArrowUp") { e.preventDefault(); navigateQueue(-1); }
    else if ((e.key === "Delete" || e.key === "Backspace") && state.activeDetectionId) {
      if (state.reviews.get(state.activeDetectionId) !== "rejected") {
        e.preventDefault();
        void submitReview("rejected");
      }
    } else if (e.key === "Escape" && !(imageViewer?.hidden ?? true)) {
      e.preventDefault(); closeImageViewer();
    }
  });
}

// ── Upload ──

function triggerUpload(file) {
  if (uploadFilename) uploadFilename.textContent = file.name;
  const skipEl = document.getElementById("skip-frames-input");
  const skip = skipEl instanceof HTMLInputElement
    ? Math.max(1, Math.min(120, parseInt(skipEl.value, 10) || 10)) : 10;
  void runPipelineUpload(file, skip);
}

function setDropzoneUploading(on) {
  if (dropzoneIdle instanceof HTMLElement) dropzoneIdle.hidden = on;
  if (uploadProgressWrap instanceof HTMLElement) uploadProgressWrap.hidden = !on;
  if (uploadDropzone instanceof HTMLElement) uploadDropzone.classList.toggle("dropzone--uploading", on);
}

const STATUS_LABELS = {
  queued: "في الانتظار...", inference: "تحليل الفيديو...",
  gps: "استخراج إحداثيات GPS...", complete: "اكتملت المعالجة", failed: "فشلت المعالجة",
};

function xhrUpload(url, formData, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url);
    xhr.upload.addEventListener("progress", (e) => { if (e.lengthComputable) onProgress(e.loaded / e.total); });
    xhr.addEventListener("load", () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try { resolve(JSON.parse(xhr.responseText)); } catch { reject(new Error("Invalid JSON response")); }
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
  setDropzoneUploading(true);
  setUploadProgress(0, "جاري رفع الفيديو...");
  try {
    const fd = new FormData();
    fd.append("video", file);
    fd.append("skipFrames", String(skipFrames));
    const created = await xhrUpload(PIPELINE_UPLOAD, fd, (r) =>
      setUploadProgress(Math.round(r * 25), `جاري رفع الفيديو... ${Math.round(r * 100)}%`));
    setUploadProgress(created.progress ?? 0, STATUS_LABELS[created.status] ?? created.status);
    await pollPipelineUntilDone(created.uploadId);
    setMessage(`اكتملت المعالجة (${file.name}). جارٍ تحديث البيانات...`, false);
    await loadAll({ resetSelection: true });
  } catch (err) {
    console.error(err);
    setMessage(err instanceof Error ? err.message : "تعذر إكمال معالجة الفيديو.", true);
  } finally {
    setDropzoneUploading(false);
    setUploadProgress(0, "");
    if (uploadFilename) uploadFilename.textContent = "MP4 · MOV · AVI · MKV · WEBM حتى 4GB";
  }
}

function setUploadProgress(pct, label) {
  if (uploadProgressBar instanceof HTMLElement) uploadProgressBar.style.width = `${Math.min(100, Math.max(0, pct))}%`;
  if (uploadStatusText) uploadStatusText.textContent = label;
}

const sleep = (ms) => new Promise((r) => window.setTimeout(r, ms));

async function pollPipelineUntilDone(uploadId) {
  for (let i = 0; i < 600; i++) {
    const s = await fetchJson(pipelineUploadStatusUrl(uploadId));
    setUploadProgress(s.progress ?? 0, `${STATUS_LABELS[s.status] ?? s.status} — ${s.progress ?? 0}%`);
    if (s.status === "complete") return;
    if (s.status === "failed") throw new Error(s.error ?? "فشلت المعالجة.");
    await sleep(3000);
  }
  throw new Error("انتهت مهلة انتظار المعالجة.");
}

// ── Review ──
// rejected = deleted by admin  |  approved = restored  |  null = default accepted

/**
 * @param {'approved'|'rejected'} decision
 * @param {string} [overrideId]
 */
async function submitReview(decision, overrideId) {
  const id = overrideId ?? state.activeDetectionId;
  if (!id || state.reviews.get(id) === decision) return;

  setLoading(true);
  try {
    await fetchJson(detectionReviewUrl(id), {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ decision }),
    });
    state.reviews.set(id, decision);

    // After deleting, advance to next non-deleted frame
    if (decision === "rejected" && id === state.activeDetectionId) {
      const queue = getActiveQueue();
      const idx = state.detections.findIndex((d) => d.id === id);
      const next = state.detections.slice(idx + 1).find((d) => queue.some((q) => q.id === d.id));
      state.activeDetectionId = next?.id ?? queue[0]?.id ?? null;
    }

    updateDeletedCount();
    renderTable();
    renderReviewPanel();
    setMessage(decision === "rejected" ? "🗑 تم حذف الإطار." : "↩ تمت استعادة الإطار.", false);
  } catch (err) {
    console.error(err);
    setMessage(err instanceof Error ? err.message : "تعذر حفظ القرار.", true);
  } finally {
    setLoading(false);
  }
}

// ── Data loading ──

async function loadAll({ resetSelection }) {
  setMessage("جاري تحميل البيانات...", false);
  setLoading(true);
  try {
    const [rev, vid, stats, det] = await Promise.all([
      fetchJson(REVIEWS_ENDPOINT),
      fetchJson(VIDEOS_ENDPOINT),
      fetchJson(buildStatsUrl()),
      fetchJson(buildDetectionsUrl()),
    ]);

    mergeReviews(rev.items ?? []);
    fillVideoFilter(vid.items ?? []);
    state.stats = stats;
    state.detections = normalizeDetections(det.items ?? []);
    state.total = Number(det.total ?? 0);

    renderStats();
    renderChart();
    renderPagination();
    renderTable();
    updateSortHeaders();

    if (resetSelection) {
      const q = getActiveQueue();
      state.activeDetectionId = q[0]?.id ?? state.detections[0]?.id ?? null;
    } else if (state.activeDetectionId && !state.detections.some((d) => d.id === state.activeDetectionId)) {
      const q = getActiveQueue();
      state.activeDetectionId = q[0]?.id ?? state.detections[0]?.id ?? null;
    }

    renderReviewPanel();
    setMessage(`تم تحميل ${state.total} اكتشافاً (معروض ${state.detections.length} في هذه الصفحة).`, false);
  } catch (err) {
    console.error(err);
    setMessage(err instanceof Error ? err.message : "تعذر تحميل البيانات.", true);
    renderEmptyState();
  } finally {
    setLoading(false);
  }
}

function mergeReviews(items) {
  state.reviews.clear();
  for (const r of items) {
    if (r.detection_id && (r.decision === "approved" || r.decision === "rejected"))
      state.reviews.set(r.detection_id, r.decision);
  }
}

function fillVideoFilter(items) {
  if (!(videoFilterEl instanceof HTMLSelectElement)) return;
  const cur = state.videoId;
  videoFilterEl.innerHTML = ['<option value="">كل الفيديوهات</option>',
    ...items.map((v) => {
      const vid = escapeHtml(String(v.video_id ?? ""));
      return `<option value="${vid}"${v.video_id === cur ? " selected" : ""}>${vid}</option>`;
    })
  ].join("");
  if (cur) videoFilterEl.value = cur;
}

// ── Render helpers ──

/** Frames not deleted — the admin navigates through these. */
function getActiveQueue() {
  return state.detections.filter((d) => state.reviews.get(d.id) !== "rejected");
}

function navigateQueue(delta) {
  const q = getActiveQueue();
  if (!q.length) return;
  let idx = q.findIndex((d) => d.id === state.activeDetectionId);
  if (idx < 0) idx = delta > 0 ? -1 : 0;
  selectDetection(q[Math.min(q.length - 1, Math.max(0, idx + delta))].id);
}

function selectDetection(id) {
  state.activeDetectionId = id;
  renderTable();
  renderReviewPanel();
  pinsBody?.querySelector(`tr[data-detection-id="${CSS.escape(id)}"]`)
    ?.scrollIntoView({ block: "nearest", behavior: "smooth" });
}

function updateDeletedCount() {
  if (!deletedCountEl) return;
  let n = 0;
  for (const v of state.reviews.values()) if (v === "rejected") n++;
  setText(deletedCountEl, String(n));
}

function renderStats() {
  const s = state.stats;
  if (!s) { renderEmptyState(); return; }
  const top = [...(s.per_video ?? [])].sort((a, b) => b.detection_count - a.detection_count)[0];
  setText(totalPinsEl, String(s.total_detections ?? 0));
  setText(avgConfEl,   formatPercent(s.average_confidence));
  setText(worstHoodEl, top ? formatVideoId(top.video_id) : "-");
  updateDeletedCount();
}

function renderPagination() {
  if (!pageInfoEl) return;
  const from = state.total === 0 ? 0 : state.offset + 1;
  const to   = Math.min(state.offset + state.detections.length, state.total);
  pageInfoEl.textContent = `${from}–${to} من ${state.total}`;
  if (btnPrevPage instanceof HTMLButtonElement) btnPrevPage.disabled = state.offset <= 0;
  if (btnNextPage instanceof HTMLButtonElement) btnNextPage.disabled = state.offset + state.limit >= state.total;
}

function updateSortHeaders() {
  if (!pinsTable) return;
  pinsTable.querySelectorAll("th[data-sort]").forEach((th) => {
    th.classList.remove("sort-asc", "sort-desc");
    if (th instanceof HTMLElement && th.dataset.sort === state.sortBy) {
      th.classList.add(state.sortOrder === "asc" ? "sort-asc" : "sort-desc");
    }
  });
}

function renderTable() {
  if (!pinsBody) return;
  pinsTable?.classList.toggle("is-compact", state.compact);

  if (!state.detections.length) {
    pinsBody.innerHTML = `<tr><td colspan="7" style="text-align:center;color:var(--muted);padding:2.5rem 0;">لا توجد اكتشافات لعرضها.</td></tr>`;
    return;
  }

  pinsBody.innerHTML = state.detections.map((d) => {
    const isDeleted = state.reviews.get(d.id) === "rejected";
    const isActive  = d.id === state.activeDetectionId;
    const mapHref   = `/?focus=${encodeURIComponent(d.pointId)}`;

    const statusCell = isDeleted
      ? `<span class="status-badge status-badge--deleted">محذوف</span>`
      : ``;

    const actionCell = isDeleted
      ? `<div class="row-actions"><button class="btn-row-restore" data-action="restore" data-id="${escapeHtml(d.id)}" title="استعادة">↩</button><a class="btn-map-tiny" href="${mapHref}">↗</a></div>`
      : `<div class="row-actions"><button class="btn-row-delete" data-action="delete" data-id="${escapeHtml(d.id)}" title="حذف">🗑</button><a class="btn-map-tiny" href="${mapHref}">↗</a></div>`;

    const cls = [isActive ? "pin-row--selected" : "", isDeleted ? "pin-row--deleted" : ""].filter(Boolean).join(" ");

    return `<tr${cls ? ` class="${cls}"` : ""} data-detection-id="${escapeHtml(d.id)}">
      <td><img src="${escapeHtml(d.imageUrl)}" class="pin-row__img" alt="" loading="lazy" onerror="this.onerror=null;this.src='${FALLBACK_IMAGE}'"></td>
      <td class="pin-row__hood">${escapeHtml(formatVideoId(d.videoId))}</td>
      <td>${escapeHtml(String(d.frameId))}</td>
      <td>${escapeHtml(formatSeconds(d.timestampSec))}</td>
      <td><div class="pin-row__confidence"><div class="pin-row__bar"><div class="pin-row__bar-fill" style="width:${d.confidencePct}%"></div></div><span class="pin-row__value">${d.confidencePct}%</span></div></td>
      <td>${statusCell}</td>
      <td>${actionCell}</td>
    </tr>`;
  }).join("");
}

function renderReviewPanel() {
  const deleted = [...state.reviews.values()].filter((v) => v === "rejected").length;

  if (reviewQueueHint) {
    reviewQueueHint.textContent = deleted > 0 ? `${deleted} محذوف` : "";
    reviewQueueHint.style.display = deleted > 0 ? "" : "none";
  }

  const d = state.detections.find((x) => x.id === state.activeDetectionId) ?? null;

  if (!d) {
    if (reviewImageTrigger instanceof HTMLButtonElement) reviewImageTrigger.hidden = true;
    if (reviewImage instanceof HTMLImageElement) reviewImage.removeAttribute("src");
    if (reviewEmpty) reviewEmpty.hidden = false;
    if (reviewMeta) reviewMeta.innerHTML = "";
    if (mapLink instanceof HTMLAnchorElement) mapLink.hidden = true;
    if (btnDelete  instanceof HTMLButtonElement) { btnDelete.disabled = true; btnDelete.hidden = false; }
    if (btnRestore instanceof HTMLButtonElement) btnRestore.hidden = true;
    return;
  }

  if (reviewEmpty) reviewEmpty.hidden = true;
  if (reviewImageTrigger instanceof HTMLButtonElement) reviewImageTrigger.hidden = false;

  if (reviewImage instanceof HTMLImageElement) {
    reviewImage.src = d.imageUrl;
    reviewImage.alt = `إطار ${d.frameId}`;
    reviewImage.onerror = () => { reviewImage.onerror = null; reviewImage.src = FALLBACK_IMAGE; };
  }

  const isDeleted = state.reviews.get(d.id) === "rejected";
  if (btnDelete  instanceof HTMLButtonElement) { btnDelete.hidden  =  isDeleted; btnDelete.disabled = false; }
  if (btnRestore instanceof HTMLButtonElement)   btnRestore.hidden = !isDeleted;

  if (reviewMeta) {
    reviewMeta.innerHTML = `
      <dt>الفيديو</dt><dd>${escapeHtml(formatVideoId(d.videoId))}</dd>
      <dt>الإطار</dt><dd>${escapeHtml(String(d.frameId))}</dd>
      <dt>الوقت</dt><dd>${escapeHtml(formatSeconds(d.timestampSec))}</dd>
      <dt>الثقة</dt><dd>${d.confidencePct}%</dd>
      <dt>الإحداثيات</dt><dd>${escapeHtml(`${d.lat.toFixed(5)}, ${d.lng.toFixed(5)}`)}</dd>
      <dt>الحالة</dt><dd>${isDeleted ? "محذوف" : "مقبول"}</dd>`;
  }

  if (mapLink instanceof HTMLAnchorElement) {
    mapLink.hidden = false;
    mapLink.href = `/?focus=${encodeURIComponent(d.pointId)}`;
  }
}

// ── Image viewer ──

function openImageViewer() {
  const d = state.detections.find((x) => x.id === state.activeDetectionId);
  if (!d || !(imageViewer instanceof HTMLElement) || !(imageViewerImage instanceof HTMLImageElement)) return;
  imageViewer.hidden = false;
  document.body.classList.add("dashboard-image-viewer-open");
  imageViewerImage.src = d.imageUrl;
  imageViewerImage.alt = `إطار ${d.frameId}`;
  imageViewerImage.onerror = () => { imageViewerImage.onerror = null; imageViewerImage.src = FALLBACK_IMAGE; };
  setZoom(1);
  if (imageViewerClose instanceof HTMLButtonElement) imageViewerClose.focus();
}

function closeImageViewer() {
  if (!(imageViewer instanceof HTMLElement)) return;
  imageViewer.hidden = true;
  document.body.classList.remove("dashboard-image-viewer-open");
  if (imageViewerImage instanceof HTMLImageElement) imageViewerImage.removeAttribute("src");
  if (imageViewerStage instanceof HTMLElement) { imageViewerStage.scrollTop = 0; imageViewerStage.scrollLeft = 0; }
}

function setZoom(value) {
  const z = Math.max(1, Math.min(4, Math.round(value * 100) / 100));
  state.imageViewerZoom = z;
  if (imageViewerImage instanceof HTMLImageElement) imageViewerImage.style.width = `${z * 100}%`;
  if (imageViewerZoomVal)  imageViewerZoomVal.textContent = `${Math.round(z * 100)}%`;
  if (imageViewerZoomIn  instanceof HTMLButtonElement) imageViewerZoomIn.disabled  = z >= 4;
  if (imageViewerZoomOut instanceof HTMLButtonElement) imageViewerZoomOut.disabled = z <= 1;
}

// ── Chart ──

function renderChart() {
  if (!chartCanvas || typeof globalThis.Chart === "undefined") return;
  const C = globalThis.Chart;
  const rows = [...(state.stats?.per_video ?? [])].sort((a, b) => b.detection_count - a.detection_count).slice(0, 6);
  const labels = rows.length ? rows.map((r) => formatVideoId(r.video_id)) : ["No Data"];
  const values = rows.length ? rows.map((r) => r.detection_count) : [0];

  if (state.chart) {
    state.chart.data.labels = labels;
    state.chart.data.datasets[0].data = values;
    state.chart.update();
    return;
  }
  state.chart = new C(chartCanvas, {
    type: "bar",
    data: { labels, datasets: [{ label: "الاكتشافات", data: values, backgroundColor: "rgba(255,255,255,0.85)", borderRadius: 3, maxBarThickness: 28 }] },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { ticks: { color: "#a8a8a8", font: { family: "Cairo", size: 10 } }, grid: { display: false } },
        y: { beginAtZero: true, ticks: { color: "#a8a8a8", precision: 0, font: { size: 10 } }, grid: { color: "rgba(255,255,255,0.06)" } },
      },
    },
  });
}

// ── Utilities ──

function renderEmptyState() {
  setText(totalPinsEl, "0"); setText(avgConfEl, "0%"); setText(worstHoodEl, "-"); setText(deletedCountEl, "0");
  if (pinsBody)  pinsBody.innerHTML  = `<tr><td colspan="7" style="text-align:center;color:var(--muted);padding:2.5rem 0;">لا توجد بيانات متاحة.</td></tr>`;
  if (pageInfoEl) pageInfoEl.textContent = "";
}

function setLoading(on) { if (btnRefresh instanceof HTMLButtonElement) btnRefresh.disabled = on; }
function setText(el, v) { if (el) el.textContent = v; }
function setMessage(txt, isError) {
  if (!message) return;
  message.textContent = txt;
  message.classList.toggle("error", Boolean(isError));
}

async function fetchJson(url, init) {
  const res = await fetch(url, { credentials: "same-origin", ...init, headers: { Accept: "application/json", ...init?.headers } });
  if (res.status === 401) throw new Error("يلزم تسجيل دخول المشرف. انتقل إلى صفحة /login ثم أعد المحاولة.");
  if (!res.ok) {
    let msg = res.statusText;
    try { const p = await res.json(); msg = p.message || p.code || msg; } catch {}
    throw new Error(msg || `Request failed: ${res.status}`);
  }
  return res.json();
}

function normalizeDetections(items) {
  return items.map((i) => ({
    id: i.detection_id,
    pointId: `${i.video_id}:${i.frame_id}`,
    videoId: i.video_id, frameId: i.frame_id,
    timestampSec: Number(i.video_timestamp_sec),
    confidencePct: Math.round(Number(i.confidence ?? 0) * 100),
    lat: Number(i.gps?.latitude), lng: Number(i.gps?.longitude),
    imageUrl: i.image_url,
  }));
}

function formatPercent(v)   { return v == null ? "0%" : `${Math.round(Number(v) * 100)}%`; }
function formatVideoId(id)  { return String(id).replace(/_/g, " ").toUpperCase(); }
function formatSeconds(v)   {
  const s = Number(v ?? 0);
  return Number.isFinite(s) ? `${Math.floor(s / 60)}:${Math.round(s % 60).toString().padStart(2, "0")}` : "-";
}
function escapeHtml(v) {
  return String(v).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;");
}
