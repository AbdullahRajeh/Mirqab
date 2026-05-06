const DEFAULT_CENTER = [46.6753, 24.7136];
const FALLBACK_IMAGE =
  "https://images.unsplash.com/photo-1515162816999-a0c47dc192f7?auto=format&fit=crop&w=400&q=80";
const DETECTIONS_ENDPOINT = "/api/v1/detections?limit=200&offset=0&sortBy=timestampSec&sortOrder=desc";
const STATS_ENDPOINT = "/api/v1/detections/stats";
const MAP_ENDPOINT = "/api/v1/detections/map";
const SESSION_ENDPOINT = "/auth/session";
const LOGOUT_ENDPOINT = "/auth/logout";
const NEIGHBORHOOD_CACHE_KEY = "mirqab.neighborhoods.v1";
const UNKNOWN_NEIGHBORHOOD = "حي غير معروف";

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
const authActionBtn = document.getElementById("auth-action-btn");
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
  popup: null,
  popupExpanded: false,
  popupPointId: null,
  chart: null,
  selectedPointId: null,
  pendingFocusId: new URLSearchParams(window.location.search).get("focus"),
  neighborhoodCache: loadNeighborhoodCache(),
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
    
    if (authActionBtn) {
      authActionBtn.hidden = false;
    }

    if (response.ok) {
      const payload = await response.json();
      if (payload.authenticated) {
        if (uploadBtn) uploadBtn.style.display = "block";
        if (authActionBtn) {
          authActionBtn.textContent = "إنهاء الجلسة";
          authActionBtn.dataset.mode = "logout";
        }
      } else {
        if (authActionBtn) {
          authActionBtn.textContent = "العودة للرئيسية";
          authActionBtn.dataset.mode = "back";
        }
      }
    } else {
      if (authActionBtn) {
        authActionBtn.textContent = "العودة للرئيسية";
        authActionBtn.dataset.mode = "back";
      }
    }
  } catch (e) {
    console.error("Session check failed:", e);
    if (authActionBtn) {
      authActionBtn.hidden = false;
      authActionBtn.textContent = "العودة للرئيسية";
      authActionBtn.dataset.mode = "back";
    }
  }
}

function bindUi() {
  if (openDashBtn) {
    openDashBtn.addEventListener("click", () => {
      window.location.href = "/dashboard";
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
      window.location.href = "/upload";
    });
  }

  if (authActionBtn) {
    authActionBtn.addEventListener("click", () => {
      if (authActionBtn.dataset.mode === "logout") {
        void handleLogout();
      } else {
        window.location.href = "/";
      }
    });
  }

  window.focusDetection = (pointId) => {
    focusDetection(pointId);
  };
}

async function handleLogout() {
  if (authActionBtn instanceof HTMLButtonElement) {
    authActionBtn.disabled = true;
  }

  try {
    await fetch(LOGOUT_ENDPOINT, {
      method: "POST",
      headers: { Accept: "application/json" },
      credentials: "same-origin",
    });
  } finally {
    window.location.assign("/login");
  }
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
    focusPendingDetection();
    void enrichNeighborhoodNames();
    setupDynamicMask();

    setMessage("", false);
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
    decision: item.review_status,
    neighborhood: getCachedNeighborhood(Number(item.gps?.latitude), Number(item.gps?.longitude)),
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
      decision: point.review_status,
      neighborhood: getCachedNeighborhood(Number(point.gps?.latitude), Number(point.gps?.longitude)),
    })),
  );
}

function renderStats() {
  const stats = state.stats;
  if (!stats) { renderEmptyState(); return; }
  const topNeighborhood = getTopNeighborhood();
  const topVideo = [...(stats.per_video ?? [])].sort((a, b) => b.detection_count - a.detection_count)[0];
  setText(totalPinsEl, String(stats.total_detections ?? 0));
  setText(urgentPinsEl, String(stats.unique_videos ?? 0));
  setText(inProgressPinsEl, String(stats.unique_frames ?? 0));
  setText(fixedPinsEl, formatPercent(stats.average_confidence));
  setText(todayPinsEl, formatPercent(stats.min_confidence));
  setText(weekPinsEl, formatPercent(stats.max_confidence));
  setText(avgResponseTimeEl, String(state.mapPoints.length));
  setText(worstHoodEl, topNeighborhood || (topVideo ? formatVideoId(topVideo.video_id) : "-"));
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
      <td class="pin-row__hood">${escapeHtml(d.neighborhood || UNKNOWN_NEIGHBORHOOD)}</td>
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
  const data = buildDetectionsGeoJson();
  if (map.getSource("detection-pins")) {
    map.getSource("detection-pins").setData(data);
  } else {
    map.addSource("detection-pins", { type: "geojson", data });
    map.addLayer({
      id: "detection-pin-halo",
      type: "circle",
      source: "detection-pins",
      paint: {
        "circle-radius": [
          "interpolate",
          ["linear"],
          ["zoom"],
          8,
          ["interpolate", ["linear"], ["get", "detectionCount"], 1, 7, 8, 11],
          14,
          ["interpolate", ["linear"], ["get", "detectionCount"], 1, 12, 8, 18],
          18,
          ["interpolate", ["linear"], ["get", "detectionCount"], 1, 18, 8, 26],
        ],
        "circle-color": "#ffffff",
        "circle-opacity": 0.16,
        "circle-stroke-color": "#ffffff",
        "circle-stroke-opacity": 0.24,
        "circle-stroke-width": 1,
      },
    });
    map.addLayer({
      id: "detection-pins",
      type: "circle",
      source: "detection-pins",
      paint: {
        "circle-radius": [
          "interpolate",
          ["linear"],
          ["zoom"],
          8,
          ["interpolate", ["linear"], ["get", "detectionCount"], 1, 3.5, 8, 5.5],
          14,
          ["interpolate", ["linear"], ["get", "detectionCount"], 1, 5.5, 8, 8],
          18,
          ["interpolate", ["linear"], ["get", "detectionCount"], 1, 8, 8, 11],
        ],
        "circle-color": "#ffffff",
        "circle-opacity": 0.96,
        "circle-stroke-color": "#050505",
        "circle-stroke-width": [
          "interpolate",
          ["linear"],
          ["zoom"],
          8,
          1.2,
          18,
          2.2,
        ],
      },
    });
    map.addLayer({
      id: "detection-pin-counts",
      type: "symbol",
      source: "detection-pins",
      layout: {
        "text-field": ["get", "countLabel"],
        "text-size": ["interpolate", ["linear"], ["zoom"], 11, 8, 14, 10, 18, 12],
        "text-allow-overlap": false,
        "text-ignore-placement": false,
        "text-anchor": "center",
        "text-offset": [0, -1.05],
      },
      paint: {
        "text-color": "#050505",
        "text-halo-color": "#ffffff",
        "text-halo-width": 1,
        "text-opacity": ["interpolate", ["linear"], ["zoom"], 10, 0, 12, 1],
      },
    });
    bindMapPinInteractions();
  }
  if (state.mapPoints.length === 0) return;
  if (!preserveView) fitMapToData();
}

function buildDetectionsGeoJson() {
  return {
    type: "FeatureCollection",
    features: state.mapPoints
      .filter((point) => Number.isFinite(point.lng) && Number.isFinite(point.lat))
      .map((point) => ({
        type: "Feature",
        id: point.id,
        geometry: { type: "Point", coordinates: [point.lng, point.lat] },
        properties: {
          id: point.id,
          countLabel: String(Math.min(point.detectionCount, 99)),
          detectionCount: point.detectionCount,
        },
      })),
  };
}

function bindMapPinInteractions() {
  map.on("mouseenter", "detection-pins", (event) => {
    map.getCanvas().style.cursor = "pointer";
    const feature = event.features?.[0];
    const point = feature ? state.mapPoints.find((item) => item.id === feature.properties?.id) : null;
    if (!point) return;
    if (state.popupExpanded && state.popupPointId === point.id) return;
    showPointPopup(point);
  });

  map.on("mouseleave", "detection-pins", () => {
    map.getCanvas().style.cursor = "";
    if (state.popupExpanded) return;
    state.popup?.remove();
  });

  map.on("click", "detection-pins", (event) => {
    const feature = event.features?.[0];
    const pointId = feature?.properties?.id;
    if (pointId) focusDetection(pointId);
  });
}

function showPointPopup(point, expanded = false) {
  state.popup?.remove();
  state.popupExpanded = expanded;
  state.popupPointId = point.id;
  state.popup = new maplibregl.Popup({
    offset: 20,
    closeButton: false,
    className: expanded ? "pin-popup-shell pin-popup-shell--expanded" : "pin-popup-shell",
    maxWidth: expanded ? "420px" : "280px",
  })
    .setLngLat([point.lng, point.lat])
    .setHTML(getPopupHtml(point, expanded))
    .addTo(map);
  state.popup.on("close", () => {
    state.popupExpanded = false;
    state.popupPointId = null;
  });
}

function fitMapToData() {
  if (!map || state.mapPoints.length === 0) return;
  const bounds = new maplibregl.LngLatBounds();
  for (const p of state.mapPoints) bounds.extend([p.lng, p.lat]);
  map.fitBounds(bounds, { padding: 100, maxZoom: 14 });
}

function focusDetection(id) {
  const p = state.mapPoints.find(i => i.id === id);
  if (!p) return;
  showPointPopup(p, true);
  map.flyTo({ center: [p.lng, p.lat], zoom: 15.5, pitch: 58, duration: 1400 });
}

function focusPendingDetection() {
  if (!state.pendingFocusId) return;
  const pointId = state.pendingFocusId;
  state.pendingFocusId = null;
  window.setTimeout(() => {
    focusDetection(pointId);
  }, 250);
}

function getPopupHtml(p, expanded = false) {
  const severity = getSeverityLabel(p.confidencePct);
  
  if (expanded) {
    return `
      <div class="pin-popup-elegant pin-popup-elegant--expanded" dir="rtl">
        <img src="${p.imageUrl}" class="popup-img popup-img--expanded" alt="" onerror="this.src='${FALLBACK_IMAGE}'">
        <div class="popup-info popup-info--expanded">
          <div>
            <strong class="popup-hood">${escapeHtml(p.neighborhood || UNKNOWN_NEIGHBORHOOD)}</strong>
            <div class="popup-id">${formatVideoId(p.videoId)} / FRAME_${p.frameId}</div>
          </div>
          <div class="popup-confidence">
            <div class="popup-confidence__head">
              <span>مستوى الثقة</span>
              <strong>${p.confidencePct}%</strong>
            </div>
            <div class="popup-confidence__bar"><span style="width:${p.confidencePct}%;"></span></div>
          </div>
          <div class="popup-details">
            <span>الأولوية</span>
            <strong>${severity}</strong>
            <span>الاكتشافات</span>
            <strong>${p.detectionCount}</strong>
            <span>التوقيت</span>
            <strong>${formatSeconds(p.timestampSec)}</strong>
            <span>الإحداثيات</span>
            <strong dir="ltr">${p.lat.toFixed(5)}, ${p.lng.toFixed(5)}</strong>
          </div>
        </div>
      </div>
    `;
  }

  return `
    <div class="pin-popup-elegant" dir="rtl">
      <img src="${p.imageUrl}" class="popup-img" alt="" onerror="this.src='${FALLBACK_IMAGE}'">
      <div class="popup-info">
        <strong class="popup-hood">${escapeHtml(p.neighborhood || UNKNOWN_NEIGHBORHOOD)}</strong>
        <div class="popup-stats">
          <span>${p.confidencePct}% ثقة</span>
          <span class="popup-sep">/</span>
          <span>${severity}</span>
          <span class="popup-sep">/</span>
          <span>${p.detectionCount} اكتشاف</span>
          <span class="popup-sep">/</span>
          <span>${formatSeconds(p.timestampSec)}</span>
        </div>
      </div>
    </div>
  `;
}

function getSeverityLabel(confidencePct) {
  if (confidencePct >= 80) return "أولوية عالية";
  if (confidencePct >= 50) return "أولوية متوسطة";
  return "أولوية منخفضة";
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

function loadNeighborhoodCache() {
  try {
    return JSON.parse(localStorage.getItem(NEIGHBORHOOD_CACHE_KEY) || "{}");
  } catch {
    return {};
  }
}

function saveNeighborhoodCache() {
  try {
    localStorage.setItem(NEIGHBORHOOD_CACHE_KEY, JSON.stringify(state.neighborhoodCache));
  } catch {
    // Cache is an enhancement only.
  }
}

function coordinateKey(lat, lng) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return "";
  }
  return `${lat.toFixed(5)},${lng.toFixed(5)}`;
}

function getCachedNeighborhood(lat, lng) {
  const key = coordinateKey(lat, lng);
  return key ? state.neighborhoodCache[key] || "" : "";
}

async function enrichNeighborhoodNames() {
  const uniquePoints = [];
  const seen = new Set();

  for (const point of state.mapPoints) {
    const key = coordinateKey(point.lat, point.lng);
    if (!key || seen.has(key) || state.neighborhoodCache[key]) {
      continue;
    }
    seen.add(key);
    uniquePoints.push({ key, lat: point.lat, lng: point.lng });
  }

  for (const point of uniquePoints) {
    const neighborhood = await reverseGeocodeNeighborhood(point.lat, point.lng);
    state.neighborhoodCache[point.key] = neighborhood;
    saveNeighborhoodCache();
    applyNeighborhood(point.key, neighborhood);
    renderStats();
    renderTable();
    updateMarkerPopup(point.key);
    await sleep(1100);
  }
}

async function reverseGeocodeNeighborhood(lat, lng) {
  try {
    const params = new URLSearchParams({
      format: "jsonv2",
      lat: String(lat),
      lon: String(lng),
      zoom: "14",
      addressdetails: "1",
      "accept-language": "ar",
    });
    const response = await fetch(`https://nominatim.openstreetmap.org/reverse?${params.toString()}`, {
      headers: { Accept: "application/json" },
    });
    if (!response.ok) {
      return UNKNOWN_NEIGHBORHOOD;
    }
    const payload = await response.json();
    const address = payload.address || {};
    return (
      address.neighbourhood ||
      address.suburb ||
      address.quarter ||
      address.city_district ||
      address.district ||
      address.village ||
      address.town ||
      address.city ||
      address.county ||
      UNKNOWN_NEIGHBORHOOD
    );
  } catch {
    return UNKNOWN_NEIGHBORHOOD;
  }
}

function applyNeighborhood(key, neighborhood) {
  for (const point of state.mapPoints) {
    if (coordinateKey(point.lat, point.lng) === key) {
      point.neighborhood = neighborhood;
    }
  }
  for (const detection of state.detections) {
    if (coordinateKey(detection.lat, detection.lng) === key) {
      detection.neighborhood = neighborhood;
    }
  }
}

function updateMarkerPopup(key) {
  const point = state.mapPoints.find((item) => coordinateKey(item.lat, item.lng) === key);
  if (!point) {
    return;
  }
  if (state.popup?.isOpen()) {
    state.popup.setHTML(getPopupHtml(point, state.popupExpanded));
  }
}

function getTopNeighborhood() {
  const counts = new Map();
  for (const point of state.mapPoints) {
    const name = point.neighborhood;
    if (!name || name === UNKNOWN_NEIGHBORHOOD) {
      continue;
    }
    counts.set(name, (counts.get(name) || 0) + Number(point.detectionCount || 1));
  }

  let top = "";
  let topCount = 0;
  for (const [name, count] of counts.entries()) {
    if (count > topCount) {
      top = name;
      topCount = count;
    }
  }
  return top;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function sleep(ms) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}
