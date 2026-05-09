const FALLBACK_IMAGE =
  "https://images.unsplash.com/photo-1515162816999-a0c47dc192f7?auto=format&fit=crop&w=400&q=80";

const STATS_ENDPOINT = "/api/v1/detections/stats";
const VIDEOS_ENDPOINT = "/api/v1/videos";
const REVIEWS_ENDPOINT = "/api/v1/detections/reviews";
const SESSION_ENDPOINT = "/auth/session";

const NEIGHBORHOOD_CACHE_KEY = "mirqab.neighborhoods.v1";
const UNKNOWN_NEIGHBORHOOD = "حي غير معروف";

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

// Selectors
const messageEl = document.getElementById("message");
const totalPinsEl = document.getElementById("total-pins");
const totalHoodsEl = document.getElementById("total-hoods");
const worstHoodEl = document.getElementById("worst-hood");
const avgConfidenceEl = document.getElementById("avg-confidence");
const maxConfidenceEl = document.getElementById("max-confidence");
const minConfidenceEl = document.getElementById("min-confidence");
const mapPointsEl = document.getElementById("map-points");
const totalVideosEl = document.getElementById("total-videos");
const totalFramesEl = document.getElementById("total-frames");
const highConfidenceCountEl = document.getElementById("high-confidence-count");
const pendingCountEl = document.getElementById("pending-count");
const approvedCountEl = document.getElementById("approved-count");
const rejectedCountEl = document.getElementById("rejected-count");
const hoodListEl = document.getElementById("hood-list");
const sourceListEl = document.getElementById("source-list");
const statsScopeEl = document.getElementById("stats-scope");
const hotspotSummaryEl = document.getElementById("hotspot-summary");
const pinsBody = document.getElementById("pins-body");
const pinsTable = document.getElementById("pins-table");

const videoFilterEl = document.getElementById("video-filter");
const pageSizeEl = document.getElementById("page-size");
const btnRefresh = document.getElementById("btn-refresh");
const pageInfoEl = document.getElementById("page-info");
const btnPrevPage = document.getElementById("btn-prev-page");
const btnNextPage = document.getElementById("btn-next-page");
const streamNoteEl = document.getElementById("stream-note");

const reviewImage = document.getElementById("review-image");
const reviewImageTrigger = document.getElementById("review-image-trigger");
const reviewEmpty = document.getElementById("review-empty");
const reviewMeta = document.getElementById("review-meta");
const btnReviewPrev = document.getElementById("btn-review-prev");
const btnReviewNext = document.getElementById("btn-review-next");
const btnApprove = document.getElementById("btn-approve");
const btnReject = document.getElementById("btn-reject");
const reviewControls = btnApprove?.closest(".monitor-controls") ?? null;
const reviewGuestNote = document.getElementById("review-guest-note");

const imageViewer = document.getElementById("image-viewer");
const imageViewerBackdrop = document.getElementById("image-viewer-backdrop");
const imageViewerImage = document.getElementById("image-viewer-image");
const imageViewerStage = document.getElementById("image-viewer-stage");
const imageViewerZoomValue = document.getElementById("image-viewer-zoom-value");
const imageViewerZoomIn = document.getElementById("image-viewer-zoom-in");
const imageViewerZoomOut = document.getElementById("image-viewer-zoom-out");
const imageViewerClose = document.getElementById("image-viewer-close");
const sortHeaderButtons = Array.from(document.querySelectorAll(".sort-header"));
const SERVER_SORT_COLUMNS = new Set(["videoId", "timestampSec", "frameId", "confidence", "detectionId"]);

const state = {
  detections: [],
  stats: null,
  /** @type {Map<string, 'approved' | 'rejected'>} */
  reviews: new Map(),
  isAdmin: false,
  neighborhoodCache: loadNeighborhoodCache(),
  total: 0,
  limit: 200,
  offset: 0,
  videoId: "",
  sortBy: "timestampSec",
  sortOrder: "desc",
  listSortBy: "",
  listSortOrder: "",
  activeDetectionId: null,
  imageViewerZoom: 1,
  charts: {
    timeConf: null,
    hoodDensity: null,
    source: null,
    review: null,
    confidenceDist: null,
    sourceDensity: null
  }
};

boot().catch((error) => {
  console.error(error);
  setMessage("تعذر تشغيل لوحة التحليلات.", true);
});

async function boot() {
  bindUi();
  readControlsFromDom();
  await loadSession();
  await loadAll({ resetSelection: true });
}

async function loadSession() {
  try {
    const payload = await fetchJson(SESSION_ENDPOINT);
    state.isAdmin = Boolean(payload.authenticated);
  } catch {
    state.isAdmin = false;
  }
  applyReviewPermissions();
}

function readControlsFromDom() {
  if (videoFilterEl instanceof HTMLSelectElement) {
    state.videoId = videoFilterEl.value.trim();
  }
  if (pageSizeEl instanceof HTMLSelectElement) {
    state.limit = Number.parseInt(pageSizeEl.value, 10) || 200;
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

  for (const button of sortHeaderButtons) {
    button.addEventListener("click", () => {
      const sortBy = button.dataset.sort;
      if (!isSortableColumn(sortBy)) {
        return;
      }
      if (SERVER_SORT_COLUMNS.has(sortBy)) {
        if (state.sortBy === sortBy) {
          state.sortOrder = state.sortOrder === "desc" ? "asc" : "desc";
        } else {
          state.sortBy = sortBy;
          state.sortOrder = "desc";
        }
        state.listSortBy = "";
        state.listSortOrder = "";
        state.offset = 0;
        renderSortHeaders();
        void loadAll({ resetSelection: true });
        return;
      }
      if (state.listSortBy !== sortBy) {
        state.listSortBy = sortBy;
        state.listSortOrder = "asc";
      } else if (state.listSortOrder === "asc") {
        state.listSortOrder = "desc";
      } else {
        state.listSortBy = "";
        state.listSortOrder = "";
      }
      renderTable();
      renderSortHeaders();
    });
  }

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

  reviewImageTrigger?.addEventListener("click", () => {
    openImageViewer();
  });

  imageViewerBackdrop?.addEventListener("click", closeImageViewer);
  imageViewerClose?.addEventListener("click", closeImageViewer);
  imageViewerZoomIn?.addEventListener("click", () => {
    setImageViewerZoom(state.imageViewerZoom + 0.25);
  });
  imageViewerZoomOut?.addEventListener("click", () => {
    setImageViewerZoom(state.imageViewerZoom - 0.25);
  });
  imageViewerStage?.addEventListener(
    "wheel",
    (event) => {
      if (!(imageViewer?.hidden ?? true)) {
        event.preventDefault();
        const delta = event.deltaY < 0 ? 0.2 : -0.2;
        setImageViewerZoom(state.imageViewerZoom + delta);
      }
    },
    { passive: false },
  );

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
    const action = target.closest("[data-action][data-id]");
    if (action instanceof HTMLElement) {
      const id = action.dataset.id;
      if (id && action.dataset.action === "delete") {
        void submitReview("rejected", id);
      } else if (id && action.dataset.action === "restore") {
        void submitReview("approved", id);
      }
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
    } else if ((event.key === "Delete" || event.key === "Backspace") && state.activeDetectionId) {
      if (state.reviews.get(state.activeDetectionId) !== "rejected") {
        event.preventDefault();
        void submitReview("rejected");
      }
    } else if (event.key === "Escape" && !(imageViewer?.hidden ?? true)) {
      event.preventDefault();
      closeImageViewer();
    }
  });
}

function getActiveQueue() {
  return state.detections.filter((d) => state.reviews.get(d.id) !== "rejected");
}

function navigateQueue(delta) {
  const queue = getActiveQueue();
  if (queue.length === 0) {
    return;
  }
  let idx = queue.findIndex((d) => d.id === state.activeDetectionId);
  if (idx < 0) {
    idx = delta > 0 ? -1 : 0;
  }
  idx = Math.min(queue.length - 1, Math.max(0, idx + delta));
  selectDetection(queue[idx].id);
}

function selectDetection(id) {
  state.activeDetectionId = id;
  renderTable();
  renderReviewPanel();
}

async function loadAll({ resetSelection }) {
  setMessage("جاري تحديث البيانات...", false);
  setLoading(true);
  try {
    const [reviewsPayload, videosPayload, statsPayload, detectionsPayload] = await Promise.all([
      state.isAdmin ? fetchJson(REVIEWS_ENDPOINT) : Promise.resolve({ items: [] }),
      fetchJson(VIDEOS_ENDPOINT),
      fetchJson(buildStatsUrl()),
      fetchJson(buildDetectionsUrl()),
    ]);

    state.detections = normalizeDetections(detectionsPayload.items ?? []);
    mergeReviews(reviewsPayload.items ?? [], state.detections);
    fillVideoFilter(videosPayload.items ?? []);
    state.stats = statsPayload;
    state.total = Number(detectionsPayload.total ?? 0);

    renderStats();
    renderPagination();
    renderTable();
    renderSortHeaders();
    renderCharts();

    if (resetSelection) {
      const queue = getActiveQueue();
      state.activeDetectionId = queue[0]?.id ?? state.detections[0]?.id ?? null;
    } else if (state.activeDetectionId && !state.detections.some((d) => d.id === state.activeDetectionId)) {
      const queue = getActiveQueue();
      state.activeDetectionId = queue[0]?.id ?? state.detections[0]?.id ?? null;
    }

    renderReviewPanel();
    setMessage(
      state.isAdmin
        ? `تم استرجاع ${state.total} بلاغ.`
        : `وضع العرض فقط: تم استرجاع ${state.total} بلاغ.`,
      false,
    );
    
    // Start neighborhood enrichment
    void enrichNeighborhoodNames();
  } catch (error) {
    console.error(error);
    setMessage(error instanceof Error ? error.message : "تعذر تحميل البيانات.", true);
  } finally {
    setLoading(false);
  }
}

function mergeReviews(reviewItems, detections) {
  state.reviews.clear();
  // 1. Fill from reviews endpoint (authoritative)
  for (const row of reviewItems) {
    const id = row.detection_id;
    const decision = row.decision;
    if (id && (decision === "approved" || decision === "rejected")) {
      state.reviews.set(id, decision);
    }
  }
  // 2. Fill from detections list (backup/redundancy)
  for (const d of detections) {
    if (d.id && d.reviewStatus && !state.reviews.has(d.id)) {
      state.reviews.set(d.id, d.reviewStatus);
    }
  }
}

function fillVideoFilter(items) {
  if (!(videoFilterEl instanceof HTMLSelectElement)) {
    return;
  }
  const current = state.videoId;
  const options = ['<option value="">كل المصادر</option>'];
  for (const v of items) {
    const vid = escapeHtml(String(v.video_id ?? ""));
    const selected = v.video_id === current ? " selected" : "";
    options.push(`<option value="${vid}"${selected}>${vid}</option>`);
  }
  videoFilterEl.innerHTML = options.join("");
}

async function submitReview(decision, overrideId) {
  const id = overrideId ?? state.activeDetectionId;
  if (!state.isAdmin) {
    setMessage("يلزم تسجيل دخول المشرف لحذف أو استعادة البلاغات.", true);
    return;
  }
  if (!id) {
    return;
  }

  // If the decision is already the same, no need to re-submit
  if (state.reviews.get(id) === decision) {
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

    if (decision === "rejected" && id === state.activeDetectionId) {
      const deletedIndex = state.detections.findIndex((d) => d.id === id);
      const queue = getActiveQueue();
      const next = state.detections
        .slice(Math.max(0, deletedIndex + 1))
        .find((d) => queue.some((item) => item.id === d.id));
      state.activeDetectionId = next?.id ?? queue[0]?.id ?? id;
    } else {
      state.activeDetectionId = id;
    }

    renderStats();
    renderTable();
    renderReviewPanel();
    renderCharts();
    setMessage(decision === "approved" ? "تمت استعادة البلاغ." : "تم حذف البلاغ كإيجابي كاذب.", false);
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
    headers: { Accept: "application/json", ...init?.headers },
  });

  if (response.status === 401) throw new Error("يلزم تسجيل دخول المشرف.");
  if (!response.ok) throw new Error(`Request failed with status ${response.status}`);
  return response.json();
}

function normalizeDetections(items) {
  return items.map((item) => ({
    id: item.detection_id,
    pointId: `${item.video_id}:${item.frame_id}`,
    videoId: item.video_id,
    frameId: item.frame_id,
    timestampSec: Number(item.video_timestamp_sec),
    confidencePct: Math.round(Number(item.confidence ?? 0) * 100),
    lat: Number(item.gps?.latitude),
    lng: Number(item.gps?.longitude),
    imageUrl: item.image_url,
    reviewStatus: item.review_status,
    neighborhood: getCachedNeighborhood(Number(item.gps?.latitude), Number(item.gps?.longitude)),
  }));
}

// Neighborhood Logic
function loadNeighborhoodCache() {
  try { return JSON.parse(localStorage.getItem(NEIGHBORHOOD_CACHE_KEY) || "{}"); } catch { return {}; }
}

function saveNeighborhoodCache() {
  try { localStorage.setItem(NEIGHBORHOOD_CACHE_KEY, JSON.stringify(state.neighborhoodCache)); } catch {}
}

function coordinateKey(lat, lng) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return "";
  return `${lat.toFixed(5)},${lng.toFixed(5)}`;
}

function getCachedNeighborhood(lat, lng) {
  const key = coordinateKey(lat, lng);
  return key ? state.neighborhoodCache[key] || "" : "";
}

async function enrichNeighborhoodNames() {
  const uniquePoints = [];
  const seen = new Set();
  for (const d of state.detections) {
    const key = coordinateKey(d.lat, d.lng);
    if (!key || seen.has(key) || state.neighborhoodCache[key]) continue;
    seen.add(key);
    uniquePoints.push({ key, lat: d.lat, lng: d.lng });
  }
  for (const p of uniquePoints) {
    const neighborhood = await reverseGeocodeNeighborhood(p.lat, p.lng);
    state.neighborhoodCache[p.key] = neighborhood;
    saveNeighborhoodCache();
    applyNeighborhood(p.key, neighborhood);
    renderStats();
    renderTable();
    renderCharts();
    await new Promise(r => setTimeout(r, 1100));
  }
}

async function reverseGeocodeNeighborhood(lat, lng) {
  try {
    const params = new URLSearchParams({ format: "jsonv2", lat: String(lat), lon: String(lng), zoom: "14", addressdetails: "1", "accept-language": "ar" });
    const response = await fetch(`https://nominatim.openstreetmap.org/reverse?${params.toString()}`);
    if (!response.ok) return UNKNOWN_NEIGHBORHOOD;
    const payload = await response.json();
    const address = payload.address || {};
    return address.neighbourhood || address.suburb || address.quarter || address.city_district || address.district || address.village || address.town || address.city || address.county || UNKNOWN_NEIGHBORHOOD;
  } catch { return UNKNOWN_NEIGHBORHOOD; }
}

function applyNeighborhood(key, neighborhood) {
  for (const d of state.detections) { if (coordinateKey(d.lat, d.lng) === key) d.neighborhood = neighborhood; }
}

function renderStats() {
  const stats = state.stats;
  if (!stats) return;

  const hoodCounts = new Map();
  for (const d of state.detections) {
    const name = d.neighborhood || UNKNOWN_NEIGHBORHOOD;
    hoodCounts.set(name, (hoodCounts.get(name) || 0) + 1);
  }

  let worstHood = "-";
  let maxCount = 0;
  for (const [name, count] of hoodCounts.entries()) {
    if (name !== UNKNOWN_NEIGHBORHOOD && count > maxCount) {
      worstHood = name;
      maxCount = count;
    }
  }

  setText(totalPinsEl, String(stats.total_detections ?? 0));
  setText(mapPointsEl, String(new Set(state.detections.map((d) => d.pointId)).size));
  setText(totalVideosEl, String(stats.unique_videos ?? 0));
  setText(totalFramesEl, String(stats.unique_frames ?? 0));
  setText(totalHoodsEl, String(hoodCounts.size));
  setText(worstHoodEl, worstHood);
  setText(avgConfidenceEl, `${Math.round((stats.average_confidence ?? 0) * 100)}%`);
  setText(maxConfidenceEl, `${Math.round((stats.max_confidence ?? 0) * 100)}%`);
  setText(minConfidenceEl, `${Math.round((stats.min_confidence ?? 0) * 100)}%`);
  setText(highConfidenceCountEl, String(state.detections.filter((d) => d.confidencePct >= 80).length));
  const reviewCounts = getReviewCounts();
  setText(pendingCountEl, String(reviewCounts.pending));
  setText(approvedCountEl, String(reviewCounts.approved));
  setText(rejectedCountEl, String(reviewCounts.rejected));
  setText(statsScopeEl, state.videoId ? formatVideoId(state.videoId) : "كل المصادر");

  if (hoodListEl) {
    if (hoodCounts.size === 0) {
      hoodListEl.innerHTML = '<div class="hood-empty">جاري معالجة الإحداثيات...</div>';
    } else {
      const sortedHoods = [...hoodCounts.entries()].sort((a, b) => b[1] - a[1]);
      const maxHoodCount = Math.max(...sortedHoods.map(([, count]) => count), 1);
      hoodListEl.innerHTML = sortedHoods.slice(0, 6).map(([name, count]) => `
        <div class="hood-card">
          <div class="hood-card__top">
            <span class="hood-name">${escapeHtml(name)}</span>
            <span class="hood-count mono">${count}</span>
          </div>
          <div class="hood-bar"><span style="width:${Math.round((count / maxHoodCount) * 100)}%"></span></div>
          <div class="hood-meta">
            <span>${formatShare(count, state.detections.length)} من البلاغات</span>
            <span>${count === maxHoodCount ? "الأعلى كثافة" : "ضمن النطاق"}</span>
          </div>
        </div>
      `).join("");
    }
  }

  renderHotspotSummary([...hoodCounts.entries()].sort((a, b) => b[1] - a[1]));

  renderSourceStats(stats.per_video ?? []);
}

function renderHotspotSummary(sortedHoods) {
  if (!hotspotSummaryEl) return;
  const [topName, topCount] = sortedHoods.find(([name]) => name !== UNKNOWN_NEIGHBORHOOD) ?? sortedHoods[0] ?? [];
  if (!topName) {
    hotspotSummaryEl.innerHTML = '<span class="muted">لا توجد مواقع ضمن النطاق الحالي.</span>';
    return;
  }
  const total = state.detections.length || 1;
  const sourceCount = state.stats?.unique_videos ?? 0;
  hotspotSummaryEl.innerHTML = `
    <div class="hotspot-summary-main">
      <span class="hotspot-summary-name">${escapeHtml(topName)}</span>
      <span class="hotspot-summary-count mono">${Number(topCount ?? 0)}</span>
    </div>
    <div class="hotspot-summary-meta">
      يمثل ${formatShare(Number(topCount ?? 0), total)} من بلاغات النطاق الحالي عبر ${sourceCount} مصدر.
    </div>
  `;
}

function renderSourceStats(items) {
  if (!sourceListEl) return;
  if (items.length === 0) {
    sourceListEl.innerHTML = '<div class="hood-card"><span class="hood-name">لا توجد مصادر</span><span class="hood-count mono">0</span></div>';
    return;
  }
  const sortedItems = [...items]
    .sort((a, b) => Number(b.detection_count ?? 0) - Number(a.detection_count ?? 0))
    .slice(0, 6);
  const maxCount = Math.max(...sortedItems.map((item) => Number(item.detection_count ?? 0)), 1);
  sourceListEl.innerHTML = sortedItems
    .map((item) => {
      const count = Number(item.detection_count ?? 0);
      return `
      <div class="source-stat-card">
        <div class="source-stat-top">
          <span class="source-stat-name">${escapeHtml(formatVideoId(item.video_id))}</span>
          <span class="source-stat-count mono">${count}</span>
        </div>
        <div class="source-stat-bar"><span style="width:${Math.round((count / maxCount) * 100)}%"></span></div>
        <div class="source-stat-meta">
          <span>${Number(item.frame_count ?? 0)} إطار</span>
          <span>${formatPercent(item.average_confidence)} ثقة</span>
          <span>${formatSeconds(item.first_detection_sec)}-${formatSeconds(item.last_detection_sec)}</span>
        </div>
      </div>
    `;
    })
    .join("");
}

function renderCharts() {
  if (!globalThis.Chart) return;
  const stats = state.stats;
  if (!stats) return;

  // 1. Time-Confidence Scatter Plot — color by confidence band
  const scatterData = state.detections.map(d => ({ x: d.timestampSec, y: d.confidencePct }));
  const scatterColors = scatterData.map(p =>
    p.y >= 80 ? CHART_PALETTE.high
    : p.y >= 50 ? CHART_PALETTE.mid
    : CHART_PALETTE.low
  );
  const ctxTime = document.getElementById('timeConfidenceChart')?.getContext('2d');
  if (ctxTime) {
    if (state.charts.timeConf) state.charts.timeConf.destroy();
    state.charts.timeConf = new Chart(ctxTime, {
      type: 'scatter',
      data: {
        datasets: [{
          label: 'Confidence/Time',
          data: scatterData,
          backgroundColor: scatterColors,
          borderColor: 'rgba(0,0,0,0.4)',
          borderWidth: 0.5,
          pointRadius: 4,
          hoverRadius: 7
        }]
      },
      options: {
        ...chartOptions,
        scales: {
          x: { type: 'linear', position: 'bottom', ticks: { color: '#666', font: { family: 'JetBrains Mono' } }, grid: { color: 'rgba(255,255,255,0.03)' } },
          y: { min: 0, max: 100, ticks: { color: '#666', font: { family: 'JetBrains Mono' } }, grid: { color: 'rgba(255,255,255,0.03)' } }
        }
      }
    });
  }

  // 2. Neighborhood density ranking
  const hoodCounts = new Map();
  for (const d of state.detections) {
    const name = d.neighborhood || UNKNOWN_NEIGHBORHOOD;
    hoodCounts.set(name, (hoodCounts.get(name) || 0) + 1);
  }
  const hoodItems = [...hoodCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 7);
  const ctxHoodDensity = document.getElementById('hoodDensityChart')?.getContext('2d');
  if (ctxHoodDensity) {
    if (state.charts.hoodDensity) state.charts.hoodDensity.destroy();
    state.charts.hoodDensity = new Chart(ctxHoodDensity, {
      type: 'bar',
      data: {
        labels: hoodItems.map(([name]) => name),
        datasets: [{
          data: hoodItems.map(([, count]) => count),
          backgroundColor: makeBarGradient(ctxHoodDensity, CHART_PALETTE.accent, 'h'),
          borderRadius: 2,
          borderWidth: 0,
          maxBarThickness: 18
        }]
      },
      options: {
        ...chartOptions,
        indexAxis: 'y',
        scales: compactCartesianScales()
      }
    });
  }

  // 3. Source Quality (Polar Area)
  const topSources = [...(stats.per_video ?? [])].sort((a, b) => b.detection_count - a.detection_count).slice(0, 5);
  const polarLabels = topSources.map(v => v.video_id.replace(/_/g, " ").toUpperCase());
  const polarData = topSources.map(v => Math.round((v.average_confidence ?? 0) * 100));

  const ctxSource = document.getElementById('sourceQualityChart')?.getContext('2d');
  if (ctxSource) {
    if (state.charts.source) state.charts.source.destroy();
    state.charts.source = new Chart(ctxSource, {
      type: 'polarArea',
      data: {
        labels: polarLabels,
        datasets: [{
          data: polarData,
          backgroundColor: CHART_PALETTE.series.map(c => c + 'cc'),
          borderColor: '#000',
          borderWidth: 1.5
        }]
      },
      options: {
        ...chartOptions,
        plugins: { legend: { display: false } },
        scales: {
          r: {
            grid: { color: 'rgba(255,255,255,0.06)' },
            angleLines: { color: 'rgba(255,255,255,0.06)' },
            ticks: { display: false, backdropColor: 'transparent' },
            pointLabels: { display: false }
          }
        }
      }
    });
  }

  // 4. Review Status (Doughnut)
  const { approved, rejected, pending } = getReviewCounts();

  const ctxReview = document.getElementById('reviewStatusChart')?.getContext('2d');
  if (ctxReview) {
    if (state.charts.review) state.charts.review.destroy();
    state.charts.review = new Chart(ctxReview, {
      type: 'doughnut',
      data: {
        labels: ['معتمد', 'مستبعد', 'معلق'],
        datasets: [{
          data: [approved, rejected, pending],
          backgroundColor: [CHART_PALETTE.success, CHART_PALETTE.danger, 'rgba(255,255,255,0.18)'],
          borderColor: '#000',
          borderWidth: 2,
          hoverOffset: 6
        }]
      },
      options: {
        ...chartOptions,
        cutout: '72%',
        plugins: {
          legend: {
            display: true,
            position: 'right',
            labels: { color: '#9ca3af', font: { family: 'Cairo', size: 11 }, boxWidth: 10, boxHeight: 10, padding: 10 }
          }
        }
      }
    });
  }

  // 5. Confidence buckets
  const buckets = [0, 0, 0, 0, 0];
  for (const d of state.detections) {
    buckets[Math.min(4, Math.floor(d.confidencePct / 20.1))] += 1;
  }
  const bucketColors = [CHART_PALETTE.low, '#fb923c', CHART_PALETTE.warn, '#a3e635', CHART_PALETTE.success];
  const ctxConfidence = document.getElementById('confidenceDistChart')?.getContext('2d');
  if (ctxConfidence) {
    if (state.charts.confidenceDist) state.charts.confidenceDist.destroy();
    state.charts.confidenceDist = new Chart(ctxConfidence, {
      type: 'bar',
      data: {
        labels: ['0-20', '21-40', '41-60', '61-80', '81-100'],
        datasets: [{
          data: buckets,
          backgroundColor: bucketColors,
          borderRadius: 2,
          borderWidth: 0,
          maxBarThickness: 28
        }]
      },
      options: {
        ...chartOptions,
        scales: compactCartesianScales()
      }
    });
  }

  // 6. Source density
  const densitySources = [...(stats.per_video ?? [])].sort((a, b) => b.detection_count - a.detection_count).slice(0, 6);
  const ctxDensity = document.getElementById('sourceDensityChart')?.getContext('2d');
  if (ctxDensity) {
    if (state.charts.sourceDensity) state.charts.sourceDensity.destroy();
    state.charts.sourceDensity = new Chart(ctxDensity, {
      type: 'bar',
      data: {
        labels: densitySources.map((v) => formatVideoId(v.video_id)),
        datasets: [{
          data: densitySources.map((v) => v.detection_count),
          backgroundColor: makeBarGradient(ctxDensity, CHART_PALETTE.accent2, 'h'),
          borderRadius: 2,
          borderWidth: 0,
          maxBarThickness: 18
        }]
      },
      options: {
        ...chartOptions,
        indexAxis: 'y',
        scales: compactCartesianScales()
      }
    });
  }
}

const CHART_PALETTE = {
  accent: '#7dd3fc',     // cyan
  accent2: '#a78bfa',    // violet
  success: '#34d399',    // green
  warn: '#fbbf24',       // amber
  danger: '#ff453a',     // red
  high: '#34d399',
  mid: '#7dd3fc',
  low: '#f87171',
  series: ['#7dd3fc', '#a78bfa', '#fbbf24', '#34d399', '#fb7185', '#60a5fa']
};

function makeBarGradient(ctx, color, axis = 'h') {
  if (!ctx) return color;
  const canvas = ctx.canvas;
  const g = axis === 'h'
    ? ctx.createLinearGradient(0, 0, canvas.width || 200, 0)
    : ctx.createLinearGradient(0, 0, 0, canvas.height || 200);
  g.addColorStop(0, color + '40');
  g.addColorStop(1, color);
  return g;
}

const chartOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: { legend: { display: false } },
  animation: { duration: 0 }
};

function renderPagination() {
  if (!pageInfoEl) return;
  const from = state.total === 0 ? 0 : state.offset + 1;
  const to = Math.min(state.offset + state.detections.length, state.total);
  pageInfoEl.textContent = `${from}-${to} // ${state.total}`;
  if (streamNoteEl) {
    streamNoteEl.textContent = `يعرض السجل ${state.detections.length} من أصل ${state.total} بلاغ ضمن النطاق المحدد.`;
  }
  if (btnPrevPage instanceof HTMLButtonElement) btnPrevPage.disabled = state.offset <= 0;
  if (btnNextPage instanceof HTMLButtonElement) btnNextPage.disabled = state.offset + state.limit >= state.total;
}

function renderSortHeaders() {
  for (const button of sortHeaderButtons) {
    const sortKey = button.dataset.sort;
    const isServerActive = sortKey === state.sortBy && SERVER_SORT_COLUMNS.has(sortKey);
    const isListActive = sortKey === state.listSortBy;
    const isActive = isServerActive || isListActive;
    button.classList.toggle("is-active", isActive);
    button.dataset.direction = isActive
      ? ((isServerActive ? state.sortOrder : state.listSortOrder) === "asc" ? "↑" : "↓")
      : "";
    button.title = SERVER_SORT_COLUMNS.has(sortKey)
      ? "ترتيب من الخادم لكل النتائج"
      : "ترتيب القائمة الحالية";
  }
}

function renderTable() {
  if (!pinsBody) return;
  if (state.detections.length === 0) {
    pinsBody.innerHTML = '<tr><td colspan="9" style="text-align:center; padding:1rem; color:var(--muted); font-style:italic;">لا توجد بيانات متاحة</td></tr>';
    return;
  }

  pinsBody.innerHTML = getVisibleDetections()
    .map((d) => {
      const decision = state.reviews.get(d.id);
      const badge = decision
        ? decision === "approved"
          ? '<span class="status-badge status-badge--approved">مستعاد</span>'
          : '<span class="status-badge status-badge--deleted">محذوف</span>'
        : '<span style="color:var(--muted); opacity:0.3;">قيد المراجعة</span>';
      
      const actionCell = decision === "rejected"
        ? `<button type="button" class="row-action row-action--restore" data-action="restore" data-id="${escapeHtml(d.id)}">استعادة</button>`
        : `<button type="button" class="row-action row-action--delete" data-action="delete" data-id="${escapeHtml(d.id)}">حذف</button>`;
      const rowClasses = [
        d.id === state.activeDetectionId ? "pin-row--selected" : "",
        decision === "rejected" ? "pin-row--deleted" : "",
      ].filter(Boolean).join(" ");
      const rowClass = rowClasses ? ` class="${rowClasses}"` : "";
      
      return `
        <tr${rowClass} data-detection-id="${escapeHtml(d.id)}">
          <td><img src="${escapeHtml(d.imageUrl)}" class="pin-row__img" alt="" onerror="this.src='${FALLBACK_IMAGE}'"></td>
          <td class="pin-row__hood">${escapeHtml(d.neighborhood || "...") }</td>
          <td>${escapeHtml(d.videoId.replace(/_/g, " ").toUpperCase())}</td>
          <td class="mono" style="font-size:0.75rem; opacity:0.72;">${escapeHtml(String(d.frameId))}</td>
          <td class="mono" style="font-size:0.8rem; opacity:0.6;">${formatSeconds(d.timestampSec)}</td>
          <td>
            <div class="confidence-bar"><div class="confidence-fill" style="width:${d.confidencePct}%"></div></div>
            <span class="mono" style="font-size:0.68rem; opacity:0.62;">${d.confidencePct}%</span>
          </td>
          <td class="mono" style="font-size:0.68rem; opacity:0.55;">${formatCoordinates(d.lat, d.lng)}</td>
          <td>${badge}</td>
          <td>${actionCell}</td>
        </tr>
      `;
    })
    .join("");
}

function renderReviewPanel() {
  const d = state.detections.find((item) => item.id === state.activeDetectionId) ?? null;
  const activeDecision = d ? state.reviews.get(d.id) : undefined;
  if (!d) {
    if (reviewImageTrigger) reviewImageTrigger.hidden = true;
    if (reviewEmpty) reviewEmpty.hidden = false;
    if (reviewMeta) reviewMeta.innerHTML = "";
    if (btnApprove) btnApprove.disabled = true;
    if (btnReject) btnReject.disabled = true;
    return;
  }

  if (reviewEmpty) reviewEmpty.hidden = true;
  if (reviewImageTrigger) reviewImageTrigger.hidden = false;
  if (reviewImage) reviewImage.src = d.imageUrl;

  if (btnApprove) {
    btnApprove.disabled = !state.isAdmin;
    btnApprove.hidden = activeDecision !== "rejected";
    btnApprove.classList.toggle("is-active", activeDecision === "approved");
  }
  if (btnReject) {
    btnReject.disabled = !state.isAdmin;
    btnReject.hidden = activeDecision === "rejected";
    btnReject.classList.toggle("is-active", activeDecision === "rejected");
  }

  if (reviewMeta) {
    const decision = state.reviews.get(d.id);
    const status = decision ? (decision === "approved" ? "مستعاد" : "محذوف كإيجابي كاذب") : "قيد المراجعة";
    const mapUrl = `/map?focus=${encodeURIComponent(d.pointId)}`;
    const rows = [
      { label: "معرف البلاغ", value: d.id, wide: false },
      { label: "الحي", value: d.neighborhood || "جاري التحديد..." },
      { label: "المصدر", value: d.videoId.replace(/_/g, " ").toUpperCase() },
      { label: "الإطار", value: `FRAME_${d.frameId}` },
      { label: "الوقت", value: formatSeconds(d.timestampSec) },
      { label: "الثقة", value: `${d.confidencePct}%` },
      { label: "الإحداثيات", value: formatCoordinates(d.lat, d.lng) },
      { label: "الحالة", value: status },
    ];
    reviewMeta.innerHTML = [
      ...rows.map(r => `<div class="detail-item-small${r.wide ? " is-wide" : ""}"><span>${r.label}</span><span>${escapeHtml(r.value)}</span></div>`),
      `<div class="detail-item-small is-wide"><span>الخريطة</span><span><a class="detail-link" href="${mapUrl}">فتح الدبوس على الخريطة</a></span></div>`,
    ].join("");
  }
}

function applyReviewPermissions() {
  const disabled = !state.isAdmin;
  if (reviewControls instanceof HTMLElement) {
    reviewControls.hidden = disabled;
  }
  if (reviewGuestNote instanceof HTMLElement) {
    reviewGuestNote.hidden = !disabled;
  }
  if (btnApprove) {
    btnApprove.disabled = disabled;
    btnApprove.title = disabled ? "يلزم تسجيل دخول المشرف للاعتماد" : "";
  }
  if (btnReject) {
    btnReject.disabled = disabled;
    btnReject.title = disabled ? "يلزم تسجيل دخول المشرف للاستبعاد" : "";
  }
}

function openImageViewer() {
  const d = state.detections.find((item) => item.id === state.activeDetectionId) ?? null;
  if (!d || !imageViewer || !imageViewerImage) return;
  imageViewer.hidden = false;
  imageViewerImage.src = d.imageUrl;
  setImageViewerZoom(1);
}

function closeImageViewer() { if (imageViewer) imageViewer.hidden = true; }

function setImageViewerZoom(value) {
  const nextZoom = Math.max(1, Math.min(4, Math.round(value * 100) / 100));
  state.imageViewerZoom = nextZoom;
  if (imageViewerImage) imageViewerImage.style.width = `${nextZoom * 100}%`;
  if (imageViewerZoomValue) imageViewerZoomValue.textContent = `${Math.round(nextZoom * 100)}%`;
}

function getReviewCounts() {
  let approved = 0;
  let rejected = 0;
  for (const decision of state.reviews.values()) {
    if (decision === 'approved') approved += 1;
    else if (decision === 'rejected') rejected += 1;
  }
  return {
    approved,
    rejected,
    pending: Math.max(0, state.total - approved - rejected),
  };
}

function compactCartesianScales() {
  return {
    x: {
      beginAtZero: true,
      ticks: { color: '#666', font: { family: 'Cairo', size: 9 }, precision: 0 },
      grid: { color: 'rgba(255,255,255,0.035)' },
    },
    y: {
      beginAtZero: true,
      ticks: { color: '#666', font: { family: 'Cairo', size: 9 }, precision: 0 },
      grid: { color: 'rgba(255,255,255,0.035)' },
    },
  };
}

function formatCoordinates(lat, lng) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return "-";
  return `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
}

function formatVideoId(id) {
  return String(id ?? "").replace(/_/g, " ").toUpperCase();
}

function isSortableColumn(value) {
  return (
    value === "neighborhood" ||
    value === "videoId" ||
    value === "timestampSec" ||
    value === "frameId" ||
    value === "confidence" ||
    value === "detectionId" ||
    value === "coordinates" ||
    value === "status"
  );
}

function getVisibleDetections() {
  const sortBy = state.listSortBy;
  if (!sortBy) {
    return state.detections;
  }
  return [...state.detections].sort((left, right) => {
    let result = 0;
    if (sortBy === "neighborhood") {
      result = String(left.neighborhood || UNKNOWN_NEIGHBORHOOD).localeCompare(
        String(right.neighborhood || UNKNOWN_NEIGHBORHOOD),
        "ar",
      );
    } else if (sortBy === "videoId") {
      result = String(left.videoId).localeCompare(String(right.videoId));
    } else if (sortBy === "frameId") {
      result = Number(left.frameId) - Number(right.frameId);
    } else if (sortBy === "timestampSec") {
      result = Number(left.timestampSec) - Number(right.timestampSec);
    } else if (sortBy === "confidence") {
      result = Number(left.confidencePct) - Number(right.confidencePct);
    } else if (sortBy === "detectionId") {
      result = String(left.id).localeCompare(String(right.id));
    } else if (sortBy === "coordinates") {
      result = formatCoordinates(left.lat, left.lng).localeCompare(formatCoordinates(right.lat, right.lng));
    } else if (sortBy === "status") {
      result = getReviewStatusLabel(left.id).localeCompare(getReviewStatusLabel(right.id), "ar");
    }
    return state.listSortOrder === "asc" ? result : -result;
  });
}

function getReviewStatusLabel(detectionId) {
  const decision = state.reviews.get(detectionId);
  if (decision === "approved") return "تم الاعتماد";
  if (decision === "rejected") return "مستبعد";
  return "قيد المراجعة";
}

function formatPercent(value) {
  const number = Number(value ?? 0);
  if (!Number.isFinite(number)) return "0%";
  return `${Math.round(number * 100)}%`;
}

function formatShare(count, total) {
  if (!total) return "0%";
  return `${Math.round((Number(count) / Number(total)) * 100)}%`;
}

function setLoading(isLoading) { if (btnRefresh) btnRefresh.disabled = isLoading; }
function setText(el, val) { if (el) el.textContent = val; }
function setMessage(txt, err) { if (messageEl) { messageEl.textContent = txt; messageEl.style.color = err ? "var(--danger)" : "var(--muted)"; } }
function formatSeconds(v) { const s = Number(v ?? 0); if (!Number.isFinite(s)) return "-"; return `${Math.floor(s/60)}:${Math.round(s%60).toString().padStart(2, "0")}`; }
function escapeHtml(v) { return String(v).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;"); }
