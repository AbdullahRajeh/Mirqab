const DEFAULT_CENTER = [46.6753, 24.7136];
const FALLBACK_IMAGE =
  "https://images.unsplash.com/photo-1515162816999-a0c47dc192f7?auto=format&fit=crop&w=400&q=80";
const DETECTIONS_ENDPOINT = "/api/v1/detections?limit=200&offset=0&sortBy=timestampSec&sortOrder=desc";
const STATS_ENDPOINT = "/api/v1/detections/stats";
const MAP_ENDPOINT = "/api/v1/detections/map";
const SESSION_ENDPOINT = "/auth/session";

const mapElement = document.getElementById("map");
const map = mapElement
  ? new maplibregl.Map({
      container: "map",
      style: "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json",
      center: DEFAULT_CENTER,
      zoom: 11,
      minZoom: 2,
      maxZoom: 18,
      pitch: 45,
      bearing: -15,
      renderWorldCopies: false,
      attributionControl: false,
      antialias: true,
      alpha: true
    })
  : null;

const dashboardPanel = document.getElementById("dashboard-panel");
const openDashBtn = document.getElementById("open-dashboard");
const uploadBtn = document.getElementById("upload-video");
const closeDashBtn = document.getElementById("close-dashboard");
const refreshButtons = [
  document.getElementById("simulate-ai"),
  document.getElementById("clear-pins"),
].filter(Boolean);
const message = document.getElementById("message");

const totalPinsEl = document.getElementById("total-pins");
const worstHoodEl = document.getElementById("worst-hood");
const urgentPinsEl = document.getElementById("urgent-pins");
const inProgressPinsEl = document.getElementById("in-progress-pins");
const fixedPinsEl = document.getElementById("fixed-pins");
const todayPinsEl = document.getElementById("today-pins");
const weekPinsEl = document.getElementById("week-pins");
const avgResponseTimeEl = document.getElementById("avg-response-time");
const pinsBody = document.getElementById("pins-body");

const chartCanvas =
  document.getElementById("defectsChart") || document.getElementById("severityChart");

const state = {
  detections: [],
  mapPoints: [],
  stats: null,
  markers: new Map(),
  chart: null,
  selectedPointId: null,
  pendingFocusId: new URLSearchParams(window.location.search).get("focus"),
};

const mapReady = map
  ? new Promise((resolve) => {
      if (map.loaded()) {
        resolve();
        return;
      }
      map.on("load", () => resolve());
    })
  : Promise.resolve();

boot().catch((error) => {
  console.error(error);
  setMessage("تعذر تشغيل الواجهة المتصلة بالواجهة الخلفية.", true);
});

async function boot() {
  bindUi();
  initSpaceOverlay();
  await mapReady;
  await loadDashboardData({ preserveView: false });
  void checkSession();
}

async function checkSession() {
  try {
    const response = await fetch(SESSION_ENDPOINT, {
      headers: { Accept: "application/json" },
    });
    if (response.ok) {
      const payload = await response.json();
      if (payload.authenticated && uploadBtn) {
        uploadBtn.style.display = "block";
      }
    }
  } catch (e) {
    console.error("Session check failed:", e);
  }
}

function bindUi() {
  if (openDashBtn && dashboardPanel) {
    openDashBtn.addEventListener("click", () => {
      dashboardPanel.classList.add("open");
    });
  }

  if (closeDashBtn && dashboardPanel) {
    closeDashBtn.addEventListener("click", () => {
      dashboardPanel.classList.remove("open");
    });
  }

  for (const button of refreshButtons) {
    button.addEventListener("click", () => {
      void loadDashboardData({ preserveView: true });
    });
  }

  if (uploadBtn) {
    uploadBtn.addEventListener("click", () => {
      window.location.href = "/dashboard";
    });
  }

  window.focusDetection = (pointId) => {
    focusDetection(pointId);
  };
}

function initSpaceOverlay() {
  const overlay = document.getElementById("space-overlay");
  if (!overlay) return;

  const context = overlay.getContext("2d");
  if (!context) return;

  const particles = Array.from({ length: 200 }, () => ({
    x: Math.random(),
    y: Math.random(),
    radius: Math.random() * 1.2 + 0.2,
    opacity: Math.random() * 0.8 + 0.2,
    twinkleSpeed: 0.005 + Math.random() * 0.02,
    phase: Math.random() * Math.PI * 2,
  }));

  const resize = () => {
    overlay.width = window.innerWidth;
    overlay.height = window.innerHeight;
  };

  resize();
  window.addEventListener("resize", resize);

  const animate = (time) => {
    context.clearRect(0, 0, overlay.width, overlay.height);

    for (const particle of particles) {
      const currentOpacity = particle.opacity * (0.6 + 0.4 * Math.sin(time * particle.twinkleSpeed + particle.phase));
      context.fillStyle = `rgba(255, 255, 255, ${currentOpacity})`;
      context.beginPath();
      context.arc(
        particle.x * overlay.width,
        particle.y * overlay.height,
        particle.radius,
        0,
        Math.PI * 2,
      );
      context.fill();
    }
    requestAnimationFrame(animate);
  };
  requestAnimationFrame(animate);
}

async function loadDashboardData({ preserveView }) {
  setMessage("جاري تحميل بيانات الواجهة الخلفية...", false);
  setLoading(true);

  try {
    const [detectionsPayload, statsPayload, mapPayload] = await Promise.all([
      fetchJson(DETECTIONS_ENDPOINT),
      fetchJson(STATS_ENDPOINT),
      fetchJson(MAP_ENDPOINT),
    ]);

    state.detections = normalizeDetections(detectionsPayload.items ?? []);
    state.stats = statsPayload;
    state.mapPoints = normalizeMapPoints(mapPayload);

    renderStats();
    renderTable();
    renderChart();
    await renderMap({ preserveView });
    setupDynamicMask();

    const total = state.stats?.total_detections ?? state.detections.length;
    setMessage(`تم تحميل ${total} اكتشافاً من الواجهة الخلفية.`, false);
  } catch (error) {
    console.error(error);
    setMessage(error.message || "تعذر تحميل بيانات الواجهة الخلفية.", true);
    renderEmptyState();
  } finally {
    setLoading(false);
  }
}

function setupDynamicMask() {
  if (!map || state.mapPoints.length === 0) return;

  const points = state.mapPoints;
  const lats = points.map(p => p.lat);
  const lngs = points.map(p => p.lng);
  
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);
  
  const centerLat = (minLat + maxLat) / 2;
  const centerLng = (minLng + maxLng) / 2;
  const center = [centerLng, centerLat];

  const maxDist = points.reduce((max, p) => {
    const d = getDistance(centerLat, centerLng, p.lat, p.lng);
    return Math.max(max, d);
  }, 0);
  
  const radius = Math.max(8, maxDist + 5);
  const donut = createInvertedCircle(center, radius);

  try {
    if (map.getSource('monitoring-mask')) {
      map.getSource('monitoring-mask').setData(donut);
    } else {
      map.addSource('monitoring-mask', { 'type': 'geojson', 'data': donut });
    }

    if (!map.getLayer('monitoring-mask-fill')) {
      map.addLayer({
        'id': 'monitoring-mask-fill',
        'type': 'fill',
        'source': 'monitoring-mask',
        'paint': { 'fill-color': '#000000', 'fill-opacity': 1 }
      });
    }

    const outline = {
      'type': 'Feature',
      'geometry': { 'type': 'LineString', 'coordinates': donut.geometry.coordinates[1] }
    };

    if (map.getSource('monitoring-outline')) {
      map.getSource('monitoring-outline').setData(outline);
    } else {
      map.addSource('monitoring-outline', { 'type': 'geojson', 'data': outline });
    }

    if (!map.getLayer('monitoring-mask-border')) {
      map.addLayer({
        'id': 'monitoring-mask-border',
        'type': 'line',
        'source': 'monitoring-outline',
        'paint': { 'line-color': '#ffffff', 'line-width': 3, 'line-opacity': 0.8 }
      });
    }

    if (!state.selectedPointId) {
      map.easeTo({ center, zoom: 10, duration: 1000 });
    }
  } catch (e) {
    console.error("Mask setup failed:", e);
  }
}

function createInvertedCircle(center, radiusInKm, points = 128) {
  const [lng, lat] = center;
  const hole = [];
  const dX = radiusInKm / (111.32 * Math.cos(lat * Math.PI / 180));
  const dY = radiusInKm / 110.574;

  for (let i = 0; i <= points; i++) {
    const t = (i / points) * (2 * Math.PI);
    hole.push([lng + dX * Math.cos(t), lat + dY * Math.sin(t)]);
  }

  const world = [[-180, -90], [180, -90], [180, 90], [-180, 90], [-180, -90]];
  return { 'type': 'Feature', 'geometry': { 'type': 'Polygon', 'coordinates': [world, hole] } };
}

function getDistance(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLon/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

async function fetchJson(url) {
  const response = await fetch(url, { headers: { Accept: "application/json" } });
  if (response.status === 401) throw new Error("يلزم تسجيل دخول المشرف.");
  if (!response.ok) throw new Error("فشل تحميل البيانات.");
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

function normalizeMapPoints(payload) {
  const videos = payload.videos || [];
  return videos.flatMap((video) =>
    (video.points || []).map((point) => ({
      id: `${video.video_id}:${point.frame_id}`,
      videoId: video.video_id,
      frameId: point.frame_id,
      timestampSec: Number(point.video_timestamp_sec),
      lat: Number(point.gps?.latitude),
      lng: Number(point.gps?.longitude),
      detectionCount: Number(point.detection_count ?? 0),
      confidencePct: toPercent(point.max_confidence),
      imageUrl: point.image_url,
    })),
  );
}

function renderStats() {
  const stats = state.stats;
  if (!stats) { renderEmptyState(); return; }
  const topVideo = [...(stats.per_video ?? [])].sort((a, b) => b.detection_count - a.detection_count)[0];
  setText(totalPinsEl, String(stats.total_detections ?? 0));
  setText(urgentPinsEl, String(stats.unique_videos ?? 0));
  setText(inProgressPinsEl, String(stats.unique_frames ?? 0));
  setText(fixedPinsEl, formatPercent(stats.average_confidence));
  setText(todayPinsEl, formatPercent(stats.min_confidence));
  setText(weekPinsEl, formatPercent(stats.max_confidence));
  setText(avgResponseTimeEl, String(state.mapPoints.length));
  setText(worstHoodEl, topVideo ? formatVideoId(topVideo.video_id) : "-");
}

function renderTable() {
  if (!pinsBody) return;
  if (state.detections.length === 0) {
    pinsBody.innerHTML = '<tr><td colspan="4" style="text-align:center;">لا توجد اكتشافات لعرضها.</td></tr>';
    return;
  }
  pinsBody.innerHTML = state.detections.map((d) => `
    <tr>
      <td><img src="${d.imageUrl}" class="pin-row__img" onerror="this.src='${FALLBACK_IMAGE}'"></td>
      <td class="pin-row__hood">${formatVideoId(d.videoId)}</td>
      <td>
        <div class="pin-row__confidence">
          <div class="pin-row__bar"><div class="pin-row__bar-fill" style="width:${d.confidencePct}%;"></div></div>
          <span class="pin-row__value">${d.confidencePct}%</span>
        </div>
      </td>
      <td><button onclick="window.focusDetection('${d.pointId}')" class="pin-row__view-btn">عرض</button></td>
    </tr>
  `).join("");
}

function renderChart() {
  if (!chartCanvas) return;
  const perVideo = [...(state.stats?.per_video ?? [])].sort((a, b) => b.detection_count - a.detection_count).slice(0, 6);
  const labels = perVideo.map(i => formatVideoId(i.video_id));
  const values = perVideo.map(i => i.detection_count);
  if (state.chart) {
    state.chart.data.labels = labels;
    state.chart.data.datasets[0].data = values;
    state.chart.update();
    return;
  }
  state.chart = new Chart(chartCanvas, {
    type: "bar",
    data: { labels, datasets: [{ label: "Detections", data: values, backgroundColor: "#ffffff" }] },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }
  });
}

async function renderMap({ preserveView }) {
  if (!map) return;
  await mapReady;
  state.markers.forEach(m => m.remove());
  state.markers.clear();
  if (state.mapPoints.length === 0) return;
  for (const point of state.mapPoints) {
    const el = document.createElement("div");
    el.className = "fancy-marker";
    el.style.width = el.style.height = `${14 + Math.min(point.detectionCount, 6) * 4}px`;
    el.style.background = point.confidencePct >= 70 ? "#fb7185" : "#f5f5f5";
    const popup = new maplibregl.Popup({ offset: 14, closeButton: false, className: "pin-popup-shell" }).setHTML(getPopupHtml(point));
    const marker = new maplibregl.Marker({ element: el }).setLngLat([point.lng, point.lat]).addTo(map);
    el.addEventListener("mouseenter", () => popup.setLngLat([point.lng, point.lat]).addTo(map));
    el.addEventListener("mouseleave", () => popup.remove());
    el.addEventListener("click", (e) => { e.stopPropagation(); focusDetection(point.id); });
    marker.popup = popup;
    state.markers.set(point.id, marker);
  }
  if (state.pendingFocusId) {
    const focusId = state.pendingFocusId;
    state.pendingFocusId = null;
    if (focusDetection(focusId)) return;
  }

  if (!preserveView) fitMapToData();
}

function fitMapToData() {
  if (!map || state.mapPoints.length === 0) return;
  const bounds = new maplibregl.LngLatBounds();
  for (const p of state.mapPoints) bounds.extend([p.lng, p.lat]);
  map.fitBounds(bounds, { padding: 100, maxZoom: 14 });
}

function focusDetection(id) {
  const p = state.mapPoints.find(i => i.id === id);
  if (!p) return false;
  const m = state.markers.get(id);
  if (m?.popup) m.popup.setHTML(getPopupHtml(p, true)).setLngLat([p.lng, p.lat]).addTo(map);
  map.flyTo({ center: [p.lng, p.lat], zoom: 15.5, pitch: 58, duration: 1400 });
  return true;
}

function getPopupHtml(p, expanded = false) {
  return `
    <div class="pin-popup ${expanded ? "pin-popup--expanded" : ""}" dir="rtl">
      <div class="pin-popup__head">
        <span class="pin-popup__confidence">${p.confidencePct}% ثقة</span>
        <strong>${formatVideoId(p.videoId)}</strong>
      </div>
      <img src="${p.imageUrl}" class="pin-popup__image ${expanded ? "is-expanded" : ""}" onerror="this.src='${FALLBACK_IMAGE}'">
      <div class="pin-popup__meta">
        <p><span>الإطار</span> ${p.frameId}</p>
        <p><span>الوقت</span> ${formatSeconds(p.timestampSec)}</p>
        <p><span>الاكتشافات</span> ${p.detectionCount}</p>
      </div>
    </div>
  `;
}

function renderEmptyState() {
  [totalPinsEl, urgentPinsEl, inProgressPinsEl, fixedPinsEl, todayPinsEl, weekPinsEl, avgResponseTimeEl].forEach(el => setText(el, "0"));
  if (pinsBody) pinsBody.innerHTML = '<tr><td colspan="4" style="text-align:center;">لا توجد بيانات.</td></tr>';
}

function setLoading(isLoading) { refreshButtons.forEach(b => b.disabled = isLoading); }
function setText(el, val) { if (el) el.textContent = val; }
function setMessage(txt, isErr) { if (message) { message.textContent = txt; message.classList.toggle("error", !!isErr); } }
function toPercent(v) { return Math.round(Number(v ?? 0) * 100); }
function formatPercent(v) { return `${toPercent(v)}%`; }
function formatVideoId(id) { return String(id).replace(/_/g, " ").toUpperCase(); }
function formatSeconds(v) {
  const s = Number(v ?? 0);
  if (!Number.isFinite(s)) return "-";
  return `${Math.floor(s/60)}:${Math.round(s%60).toString().padStart(2, "0")}`;
}
