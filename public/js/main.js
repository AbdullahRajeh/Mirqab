const DEFAULT_CENTER = [46.6753, 24.7136];
const FALLBACK_IMAGE =
  "https://images.unsplash.com/photo-1515162816999-a0c47dc192f7?auto=format&fit=crop&w=400&q=80";
const DETECTIONS_ENDPOINT = "/api/v1/detections?limit=200&offset=0&sortBy=timestampSec&sortOrder=desc";
const STATS_ENDPOINT = "/api/v1/detections/stats";
const MAP_ENDPOINT = "/api/v1/detections/map";

const mapElement = document.getElementById("map");
const map = mapElement
  ? new maplibregl.Map({
      container: "map",
      style: "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json",
      center: DEFAULT_CENTER,
      zoom: 9,
      minZoom: 4,
      maxZoom: 18,
      pitch: 38,
      bearing: -12,
      renderWorldCopies: false,
      attributionControl: false,
    })
  : null;

const dashboardPanel = document.getElementById("dashboard-panel");
const openDashBtn = document.getElementById("open-dashboard");
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
const avgConfidenceEl = document.getElementById("avg-confidence");
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

  window.focusDetection = (pointId) => {
    focusDetection(pointId);
  };
}

function initSpaceOverlay() {
  const overlay = document.getElementById("space-overlay");
  if (!overlay) {
    return;
  }

  const context = overlay.getContext("2d");
  if (!context) {
    return;
  }

  const particles = Array.from({ length: 120 }, () => ({
    x: Math.random(),
    y: Math.random(),
    radius: Math.random() * 1.4 + 0.4,
    velocityX: (Math.random() - 0.5) * 0.0004,
    velocityY: (Math.random() - 0.5) * 0.0004,
  }));

  const resize = () => {
    overlay.width = window.innerWidth;
    overlay.height = window.innerHeight;
  };

  resize();
  window.addEventListener("resize", resize);

  const animate = () => {
    context.clearRect(0, 0, overlay.width, overlay.height);
    context.fillStyle = "rgba(255,255,255,0.75)";

    for (const particle of particles) {
      particle.x += particle.velocityX;
      particle.y += particle.velocityY;

      if (particle.x < 0 || particle.x > 1) {
        particle.velocityX *= -1;
      }
      if (particle.y < 0 || particle.y > 1) {
        particle.velocityY *= -1;
      }

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
    state.mapPoints = normalizeMapPoints(mapPayload.videos ?? []);

    renderStats();
    renderTable();
    renderChart();
    await renderMap({ preserveView });

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

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    let details = response.statusText;
    try {
      const payload = await response.json();
      details = payload.message || payload.code || details;
    } catch {
      // Ignore JSON parsing failures for non-JSON error bodies.
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

function normalizeMapPoints(videos) {
  return videos.flatMap((video) =>
    (video.points ?? []).map((point) => ({
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
  if (!stats) {
    renderEmptyState();
    return;
  }

  const topVideo = [...(stats.per_video ?? [])].sort(
    (left, right) => right.detection_count - left.detection_count,
  )[0];

  setText(totalPinsEl, String(stats.total_detections ?? 0));
  setText(urgentPinsEl, String(stats.unique_videos ?? 0));
  setText(inProgressPinsEl, String(stats.unique_frames ?? 0));
  setText(fixedPinsEl, formatPercent(stats.average_confidence));
  setText(todayPinsEl, formatPercent(stats.min_confidence));
  setText(weekPinsEl, formatPercent(stats.max_confidence));
  setText(avgResponseTimeEl, String(state.mapPoints.length));
  setText(avgConfidenceEl, formatPercent(stats.average_confidence));
  setText(worstHoodEl, topVideo ? formatVideoId(topVideo.video_id) : "-");
}

function renderTable() {
  if (!pinsBody) {
    return;
  }

  if (state.detections.length === 0) {
    pinsBody.innerHTML =
      '<tr><td colspan="4" style="text-align:center; color: var(--text-muted); padding: 2rem 0;">لا توجد اكتشافات لعرضها.</td></tr>';
    return;
  }

  pinsBody.innerHTML = state.detections
    .map(
      (detection) => `
        <tr>
          <td><img src="${detection.imageUrl}" class="pin-row__img" alt="صورة العيب" onerror="this.onerror=null;this.src='${FALLBACK_IMAGE}'"></td>
          <td class="pin-row__hood">${formatVideoId(detection.videoId)}</td>
          <td>
            <div class="pin-row__confidence">
              <div class="pin-row__bar">
                <div class="pin-row__bar-fill" style="width:${detection.confidencePct}%;"></div>
              </div>
              <span class="pin-row__value">${detection.confidencePct}%</span>
            </div>
          </td>
          <td>
            <button onclick="window.focusDetection('${detection.pointId}')" class="pin-row__view-btn">عرض</button>
          </td>
        </tr>
      `,
    )
    .join("");
}

function renderChart() {
  if (!chartCanvas) {
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

  state.chart = new Chart(chartCanvas, {
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

async function renderMap({ preserveView }) {
  if (!map) {
    return;
  }

  await mapReady;

  state.markers.forEach((marker) => marker.remove());
  state.markers.clear();

  if (state.mapPoints.length === 0) {
    map.flyTo({
      center: DEFAULT_CENTER,
      zoom: 9,
      pitch: 38,
      bearing: -12,
      essential: true,
    });
    return;
  }

  for (const point of state.mapPoints) {
    const markerElement = document.createElement("div");
    markerElement.className = "fancy-marker";
    markerElement.style.width = `${14 + Math.min(point.detectionCount, 6) * 4}px`;
    markerElement.style.height = markerElement.style.width;
    markerElement.style.background = point.confidencePct >= 70 ? "#fb7185" : "#f5f5f5";

    const popup = new maplibregl.Popup({
      offset: 14,
      closeButton: false,
      className: "pin-popup-shell",
      maxWidth: "none",
    }).setHTML(getPopupHtml(point));

    const marker = new maplibregl.Marker({ element: markerElement })
      .setLngLat([point.lng, point.lat])
      .addTo(map);

    markerElement.addEventListener("mouseenter", () => {
      if (state.selectedPointId !== point.id) {
        popup.setLngLat([point.lng, point.lat]).addTo(map);
      }
    });

    markerElement.addEventListener("mouseleave", () => {
      if (state.selectedPointId !== point.id) {
        popup.remove();
      }
    });

    markerElement.addEventListener("click", (event) => {
      event.stopPropagation();
      focusDetection(point.id);
    });

    marker.popup = popup;
    state.markers.set(point.id, marker);
  }

  if (!window.__mapClickBound) {
    map.on("click", () => dismissSelection());
    window.__mapClickBound = true;
  }

  if (!preserveView) {
    fitMapToData();
  }

  if (state.pendingFocusId) {
    focusDetection(state.pendingFocusId);
    state.pendingFocusId = null;
  }
}

function fitMapToData() {
  if (!map || state.mapPoints.length === 0) {
    return;
  }

  if (state.mapPoints.length === 1) {
    const [point] = state.mapPoints;
    map.flyTo({
      center: [point.lng, point.lat],
      zoom: 13.5,
      pitch: 46,
      bearing: -10,
      essential: true,
    });
    return;
  }

  const bounds = new maplibregl.LngLatBounds();
  for (const point of state.mapPoints) {
    bounds.extend([point.lng, point.lat]);
  }

  map.fitBounds(bounds, {
    padding: { top: 120, right: 120, bottom: 120, left: 120 },
    maxZoom: 14,
    duration: 1200,
    essential: true,
  });
}

function focusDetection(pointId) {
  const point = state.mapPoints.find((item) => item.id === pointId);
  if (!point) {
    return;
  }

  if (!map) {
    window.location.href = `/?focus=${encodeURIComponent(pointId)}`;
    return;
  }

  dismissSelection();
  state.selectedPointId = pointId;

  const marker = state.markers.get(pointId);
  if (marker?.popup) {
    marker.popup.setHTML(getPopupHtml(point, true)).setLngLat([point.lng, point.lat]).addTo(map);
  }

  map.flyTo({
    center: [point.lng, point.lat],
    zoom: 15.5,
    pitch: 58,
    bearing: map.getBearing() + 25,
    duration: 1400,
    essential: true,
  });
}

function dismissSelection() {
  if (!map) {
    return;
  }

  for (const marker of state.markers.values()) {
    marker.popup?.remove();
  }

  state.selectedPointId = null;
}

function getPopupHtml(point, expanded = false) {
  return `
    <div class="pin-popup ${expanded ? "pin-popup--expanded" : ""}" dir="rtl">
      <div class="pin-popup__head">
        <span class="pin-popup__confidence">${point.confidencePct}% ثقة</span>
        <strong class="pin-popup__title">${formatVideoId(point.videoId)}</strong>
      </div>
      <img src="${point.imageUrl}" class="pin-popup__image ${expanded ? "is-expanded" : ""}" alt="Road defect" onerror="this.onerror=null;this.src='${FALLBACK_IMAGE}'">
      <div class="pin-popup__meta">
        <p><span>الإطار</span> ${point.frameId}</p>
        <p><span>الوقت</span> ${formatSeconds(point.timestampSec)}</p>
        <p><span>الاكتشافات</span> ${point.detectionCount}</p>
        <p><span>الإحداثيات</span> ${point.lat.toFixed(4)}, ${point.lng.toFixed(4)}</p>
      </div>
    </div>
  `;
}

function renderEmptyState() {
  setText(totalPinsEl, "0");
  setText(urgentPinsEl, "0");
  setText(inProgressPinsEl, "0");
  setText(fixedPinsEl, "0%");
  setText(todayPinsEl, "0%");
  setText(weekPinsEl, "0%");
  setText(avgResponseTimeEl, "0");
  setText(avgConfidenceEl, "0%");
  setText(worstHoodEl, "-");
  if (pinsBody) {
    pinsBody.innerHTML =
      '<tr><td colspan="4" style="text-align:center; color: var(--text-muted); padding: 2rem 0;">لا توجد بيانات متاحة.</td></tr>';
  }
}

function setLoading(isLoading) {
  for (const button of refreshButtons) {
    button.disabled = isLoading;
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
