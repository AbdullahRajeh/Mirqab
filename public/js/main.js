const RIYADH_CENTER = [46.6753, 24.7136];
const RETURN_DISTANCE_KM = 120;
const RIYADH_VISIBLE_RADIUS_KM = 40;

function distanceKm(fromLngLat, toLngLat) {
  const toRad = (value) => (value * Math.PI) / 180;
  const earthRadiusKm = 6371;

  const lat1 = toRad(fromLngLat[1]);
  const lat2 = toRad(toLngLat[1]);
  const deltaLat = toRad(toLngLat[1] - fromLngLat[1]);
  const deltaLng = toRad(toLngLat[0] - fromLngLat[0]);

  const a =
    Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLng / 2) * Math.sin(deltaLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return earthRadiusKm * c;
}

const mapElement = document.getElementById('map');
const map = mapElement
  ? new maplibregl.Map({
      container: 'map',
      style: 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json',
      center: RIYADH_CENTER,
      zoom: 10,
      minZoom: 9.5,
      maxZoom: 16,
      pitch: 45,
      bearing: -10,
      renderWorldCopies: false,
      attributionControl: false
    })
  : null;

if (map) {
  map.on('moveend', () => {
    const center = map.getCenter();
    const currentDistanceKm = distanceKm([center.lng, center.lat], RIYADH_CENTER);

    if (currentDistanceKm > RETURN_DISTANCE_KM) {
      map.flyTo({
        center: RIYADH_CENTER,
        zoom: 10,
        pitch: 45,
        bearing: -10,
        speed: 0.5,
        curve: 1.35,
        duration: 2200,
        essential: true
      });
    }
  });
}

const simulateAiBtn = document.getElementById("simulate-ai");
const message = document.getElementById("message");
const STORAGE_KEY = "saudiPotholes";

const dashboardPanel = document.getElementById("dashboard-panel");
const openDashBtn = document.getElementById("open-dashboard");
const closeDashBtn = document.getElementById("close-dashboard");
const totalPinsEl = document.getElementById("total-pins");
const worstHoodEl = document.getElementById("worst-hood");
const urgentPinsEl = document.getElementById("urgent-pins");
  const inProgressPinsEl = document.getElementById("in-progress-pins");
  const fixedPinsEl = document.getElementById("fixed-pins");
  const todayPinsEl = document.getElementById("today-pins");
  const weekPinsEl = document.getElementById("week-pins");
  const avgResponseTimeEl = document.getElementById("avg-response-time");
const pinsBody = document.getElementById("pins-body");
const clearPinsBtn = document.getElementById("clear-pins");
let severityChartInstance = null;

const pins = readPins();
const markersMap = new Map();

if (pinsBody) {
  renderDashboard();
}

if (openDashBtn && dashboardPanel) {
  openDashBtn.addEventListener("click", () => {
    dashboardPanel.classList.add("open");
    renderDashboard();
  });
}

if (closeDashBtn && dashboardPanel) {
  closeDashBtn.addEventListener("click", () => {
    dashboardPanel.classList.remove("open");
  });
}

function createGeoJSONCircle(center, radiusInKm, points = 360) {
  const latitude = center[1];
  const longitude = center[0];
  const distanceX = radiusInKm / (111.32 * Math.cos((latitude * Math.PI) / 180));
  const distanceY = radiusInKm / 111.32;
  const ring = [];

  for (let i = 0; i < points; i++) {
    const theta = (i / points) * 2 * Math.PI;
    const x = distanceX * Math.cos(theta);
    const y = distanceY * Math.sin(theta);
    ring.push([longitude + x, latitude + y]);
  }

  ring.reverse();
  ring.push(ring[0]);
  return ring;
}

const spaceOverlay = document.getElementById('space-overlay');
const spaceCtx = spaceOverlay ? spaceOverlay.getContext('2d') : null;
const riyadhBoundaryCoords = createGeoJSONCircle(RIYADH_CENTER, RIYADH_VISIBLE_RADIUS_KM, 360);

function resizeCanvas() {
  if (!spaceOverlay) return;
  spaceOverlay.width = window.innerWidth;
  spaceOverlay.height = window.innerHeight;
}

if (spaceOverlay) {
  window.addEventListener('resize', resizeCanvas);
  resizeCanvas();
}

const _particles = Array.from({ length: 400 }, () => {
  let pLng, pLat, dist;
  do {
    pLng = RIYADH_CENTER[0] + (Math.random() - 0.5) * 8;
    pLat = RIYADH_CENTER[1] + (Math.random() - 0.5) * 8;
    dist = distanceKm([pLng, pLat], RIYADH_CENTER);
  } while (dist < RIYADH_VISIBLE_RADIUS_KM - 2);

  return {
    lng: pLng,
    lat: pLat,
    dlng: (Math.random() - 0.5) * 0.001,
    dlat: (Math.random() - 0.5) * 0.001,
    radius: Math.random() * 1.5 + 0.6
  };
});

function animateSpace() {
  if (!spaceCtx || !map) return requestAnimationFrame(animateSpace);

  const w = spaceOverlay.width;
  const h = spaceOverlay.height;

  spaceCtx.clearRect(0, 0, w, h);

  const projectedNodes = [];

  for (let p of _particles) {
    p.lng += p.dlng;
    p.lat += p.dlat;
    
    if (Math.abs(p.lng - RIYADH_CENTER[0]) > 4) p.dlng *= -1;
    if (Math.abs(p.lat - RIYADH_CENTER[1]) > 4) p.dlat *= -1;

    // Bounce particles off the Riyadh perimeter instead of floating over/under it
    const centerDist = distanceKm([p.lng, p.lat], RIYADH_CENTER);
    if (centerDist < RIYADH_VISIBLE_RADIUS_KM) {
      p.lng -= p.dlng * 2;
      p.lat -= p.dlat * 2;
      p.dlng *= -1;
      p.dlat *= -1;
    }

    const proj = map.project([p.lng, p.lat]);
    if (proj.x > -200 && proj.x < w + 200 && proj.y > -200 && proj.y < h + 200) {
      projectedNodes.push({ x: proj.x, y: proj.y, radius: p.radius });
    }
  }

  spaceCtx.lineWidth = 1;
  for (let i = 0; i < projectedNodes.length; i++) {
    for (let j = i + 1; j < projectedNodes.length; j++) {
      const dx = projectedNodes[i].x - projectedNodes[j].x;
      const dy = projectedNodes[i].y - projectedNodes[j].y;
      const distSq = dx * dx + dy * dy;

      if (distSq < 14400) {
        const dist = Math.sqrt(distSq);
        spaceCtx.beginPath();
        spaceCtx.moveTo(projectedNodes[i].x, projectedNodes[i].y);
        spaceCtx.lineTo(projectedNodes[j].x, projectedNodes[j].y);
        spaceCtx.strokeStyle = `rgba(255, 255, 255, ${0.35 * (1 - dist / 120)})`;
        spaceCtx.stroke();
      }
    }
  }

  spaceCtx.fillStyle = 'rgba(255, 255, 255, 0.8)';
  for (let p of projectedNodes) {
    spaceCtx.beginPath();
    spaceCtx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
    spaceCtx.fill();
  }

  requestAnimationFrame(animateSpace);
}

if (spaceOverlay) {
  requestAnimationFrame(animateSpace);
}

if (map) {
map.on('load', () => {
  maplibregl.setRTLTextPlugin(
    'https://unpkg.com/@mapbox/mapbox-gl-rtl-text@0.2.3/mapbox-gl-rtl-text.min.js',
    null,
    true
  );

  map.getStyle().layers.forEach((layer) => {
    if (layer.type === 'symbol' && layer.layout && layer.layout['text-field']) {
      map.setLayoutProperty(layer.id, 'text-field', [
        'coalesce',
        ['get', 'name:ar'],
        ['get', 'name_ar'],
        ['get', 'name']
      ]);
    }
  });

  map.addSource('riyadh-mask', {
    type: 'geojson',
    data: {
      type: 'Feature',
      geometry: {
        type: 'Polygon',
        coordinates: [
          [[-180, -90], [180, -90], [180, 90], [-180, 90], [-180, -90]],
          createGeoJSONCircle(RIYADH_CENTER, RIYADH_VISIBLE_RADIUS_KM, 360)
        ]
      }
    }
  });

  map.addLayer({
    id: 'riyadh-mask-fill',
    type: 'fill',
    source: 'riyadh-mask',
    paint: {
      'fill-color': '#050505',
      'fill-opacity': 0.95
    }
  });

  pins.forEach((pin) => {
    drawPin(pin, false);
  });

  if (pins.length > 0) {
    setMessage(`تم تحميل ${pins.length} اكتشافات محفوظة.`);  
  }
});
}

function setMessage(text, isError = false) {
  if (!message) return;
  message.textContent = text;
  message.classList.toggle("error", isError);
}

function readPins() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    let parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    
    return parsed.map(pin => {
      if (pin && typeof pin === "object") {
        pin.lat = parseFloat(pin.lat);
        pin.lng = parseFloat(pin.lng);
      }
      return pin;
    }).filter(pin => pin && typeof pin === "object" && Number.isFinite(pin.lat) && Number.isFinite(pin.lng));
  } catch {
    return [];
  }
}

function savePins() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(pins));
  if (dashboardPanel && dashboardPanel.classList.contains("open")) {
    renderDashboard();
  }
}

function parsePinTime(pin) {
  if (!pin || !pin.createdAt) return null;
  const parsed = new Date(pin.createdAt);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatRelativeTime(date) {
  if (!date) return '-';
  const diffMs = Date.now() - date.getTime();
  const diffMinutes = Math.max(1, Math.round(diffMs / 60000));
  if (diffMinutes < 60) return `${diffMinutes} دقيقة`;
  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours} ساعة`;
  const diffDays = Math.round(diffHours / 24);
  return `${diffDays} يوم`;
}

function formatAbsoluteTime(date) {
  if (!date) return '-';
  return new Intl.DateTimeFormat('ar-SA', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit'
  }).format(date);
}



window.deletePin = function(id) {
  if (window.event) window.event.stopPropagation();
  if (window.stopAndDismiss) window.stopAndDismiss(null, true);
  
  const index = pins.findIndex(p => p.id === id);
  if (index !== -1) pins.splice(index, 1);
  
  const marker = markersMap.get(id);
  if (marker) {
    if (marker.customPopup) marker.customPopup.remove();
    marker.remove();
    markersMap.delete(id);
  }
  
  if (window.dashboardPanel && window.dashboardPanel.classList.contains("open")) {
    window.renderDashboard();
  }
  savePins();
  setMessage('تم حذف المؤشر بنجاح.', false);

  if (map) {
    map.flyTo({
      zoom: Math.max(map.getZoom() - 3, 10),
      pitch: 0,
      duration: 2000,
      essential: true
    });
  }
};

window.verifyPin = function(id) {
  const pin = pins.find(p => p.id === id);
  if (!pin) return;

  pin.verified = !pin.verified;
  const marker = markersMap.get(id);
  if (marker) {
    marker.getElement().style.backgroundColor = pin.verified ? '#ffffff' : '#d9d9d9';
    if (marker.customPopup && map) {
      marker.customPopup.setHTML(getPopupHTML(pin, true)).setLngLat([pin.lng, pin.lat]).addTo(map);
    }
  }

  savePins();
  setMessage(pin.verified ? 'تم اعتماد الاكتشاف بنجاح.' : 'تم إلغاء الاعتماد.', false);
};

function getPopupHTML(pin, isExpanded) {
  const defaultImg = 'https://images.unsplash.com/photo-1515162816999-a0c47dc192f7?auto=format&fit=crop&w=400&q=80';
  const conf = pin.confidence || 85;
  const hood = pin.neighborhood || "حي غير معروف";
  const verifiedBadge = pin.verified ? '<span class="pin-popup__verified" title="معتمد">&#10004;</span>' : '';

  let html = `
    <div class="pin-popup ${isExpanded ? 'pin-popup--expanded' : ''}" dir="rtl">
      <div class="pin-popup__head">
        <span class="pin-popup__confidence">${conf}% ثقة</span>
        <strong class="pin-popup__title">عيب #${pin.id} ${verifiedBadge}</strong>
      </div>
      <img src="${pin.imageUrl || defaultImg}" class="pin-popup__image ${isExpanded ? 'is-expanded' : ''}" alt="Road defect">
      <div class="pin-popup__meta">
        <p><span>الحي:</span> ${hood}</p>
        <p><span>الإحداثيات:</span> ${pin.lat.toFixed(4)}, ${pin.lng.toFixed(4)}</p>
      </div>
  `;
  
  if (isExpanded) {
    html += `
      <div class="pin-popup__actions">
        <button onclick="window.verifyPin(${pin.id})" class="pin-popup__btn pin-popup__btn--verify ${pin.verified ? 'is-verified' : ''}">
          ${pin.verified ? '✓ معتمد' : 'تأكيد الاكتشاف'}
        </button>
        <button onclick="window.deletePin(${pin.id})" class="pin-popup__btn pin-popup__btn--delete">
          إلغاء (خطأ)
        </button>
      </div>
    `;
  }
  
  html += `</div>`;
  return html;
}

function drawPin(pin, openPopup) {
  if (!map) return;

  const el = document.createElement('div');
  el.className = 'fancy-marker';
  el.style.backgroundColor = pin.verified ? '#ffffff' : '#d9d9d9';

  const popup = new maplibregl.Popup({
    offset: 10,
    closeButton: false,
    className: 'pin-popup-shell',
    maxWidth: 'none'
  })
    .setHTML(getPopupHTML(pin, false));

  const marker = new maplibregl.Marker({ element: el })
    .setLngLat([pin.lng, pin.lat])
    .addTo(map);

  marker.customPopup = popup;
  marker.isPinned = false;

  el.addEventListener('mouseenter', () => {
    if (window.stopAndDismiss) window.stopAndDismiss(pin.id, false);
    if (!marker.isPinned) {
      marker.customPopup.setHTML(getPopupHTML(pin, false)).setLngLat([pin.lng, pin.lat]).addTo(map);
    }
  });

  el.addEventListener('mouseleave', () => {
    if (!marker.isPinned) {
      marker.customPopup.remove();
    }
  });

  el.addEventListener('click', (e) => {
    e.stopPropagation();
    window.flyToPin(pin.id);
  });

  if (!window.mapClickBound) {
    map.on('click', () => {
      if (window.stopAndDismiss) window.stopAndDismiss();
    });
    window.mapClickBound = true;
  }

  markersMap.set(pin.id, marker);

  if (openPopup) {
    marker.isPinned = true;
    marker.customPopup.setHTML(getPopupHTML(pin, true)).setLngLat([pin.lng, pin.lat]).addTo(map);
  }
}


function renderDashboard() {
  if (totalPinsEl) totalPinsEl.textContent = String(pins.length);

  if (pinsBody) pinsBody.innerHTML = '';

  if (pins.length === 0) {
    if (worstHoodEl) worstHoodEl.textContent = '-';
    if (urgentPinsEl) urgentPinsEl.textContent = '0';
      if (inProgressPinsEl) inProgressPinsEl.textContent = '0';
      if (fixedPinsEl) fixedPinsEl.textContent = '0';
      if (todayPinsEl) todayPinsEl.textContent = '0';
      if (weekPinsEl) weekPinsEl.textContent = '0';
      if (avgResponseTimeEl) avgResponseTimeEl.textContent = '-';
    if (pinsBody) pinsBody.innerHTML = "<tr><td colspan=\"4\" style=\"text-align:center; color: var(--text-muted); padding: 2rem 0;\">لا توجد اكتشافات بعد.</td></tr>";
    renderChart({});
    return;
  }

  let urgentCount = 0;
    let pendingCount = 0;
  const hoodCounts = {};
  const now = Date.now();
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const startOfWeek = new Date(now - (7 * 24 * 60 * 60 * 1000));
  let todayCount = 0;
  let weekCount = 0;
  let verifiedCount = 0;
  let totalAgeMs = 0;
  let ageCount = 0;
  let oldestPin = null;
  let newestPin = null;
  

  pins.forEach(p => {
    const conf = p.confidence || 85;
    const hood = p.neighborhood || "حي غير معروف";
    if (conf >= 90) urgentCount++;
    hoodCounts[hood] = (hoodCounts[hood] || 0) + 1;

    const createdAt = parsePinTime(p);
    if (createdAt) {
      if (!oldestPin || createdAt < oldestPin) oldestPin = createdAt;
      if (!newestPin || createdAt > newestPin) newestPin = createdAt;
      totalAgeMs += (now - createdAt.getTime());
      ageCount += 1;
      if (createdAt >= startOfToday) todayCount += 1;
      if (createdAt >= startOfWeek) weekCount += 1;
    }

    if (p.verified) verifiedCount += 1;

    if (!p.verified) pendingCount++;
  });

  const fixedCount = Math.floor(pins.length * 0.15) || 0; // Mock 15% fixed rate
    
    if (urgentPinsEl) urgentPinsEl.textContent = String(urgentCount);
    if (inProgressPinsEl) inProgressPinsEl.textContent = String(pins.length - fixedCount);
    if (fixedPinsEl) fixedPinsEl.textContent = String(fixedCount);
    if (todayPinsEl) todayPinsEl.textContent = String(todayCount);
    if (weekPinsEl) weekPinsEl.textContent = String(weekCount);
    if (avgResponseTimeEl) avgResponseTimeEl.textContent = ageCount ? 
      Math.max(12, Math.round((totalAgeMs / ageCount) / 3600000)) + " ساعة" : "48 ساعة";

  let maxCount = 0;
  let worstHood = '-';
  for (const [hood, count] of Object.entries(hoodCounts)) {
    if (count > maxCount) {
      maxCount = count;
      worstHood = hood;
    }
  }
  if (worstHoodEl) worstHoodEl.textContent = worstHood;

  const reversedPins = [...pins].sort((a, b) => {
    const aTime = parsePinTime(a)?.getTime() || 0;
    const bTime = parsePinTime(b)?.getTime() || 0;
    return bTime - aTime;
  });

  reversedPins.forEach((pin) => {
    const row = document.createElement('tr');
    const defaultImg = 'https://images.unsplash.com/photo-1515162816999-a0c47dc192f7?auto=format&fit=crop&w=100&q=80';
    const conf = pin.confidence || 85;
    const hood = pin.neighborhood || "حي غير معروف";

    row.innerHTML = `
      <td><img src="${pin.imageUrl || defaultImg}" class="pin-row__img" alt="صورة العيب"></td>
      <td class="pin-row__hood">${hood}</td>
      <td>
        <div class="pin-row__confidence">
          <div class="pin-row__bar">
            <div class="pin-row__bar-fill" style="width:${conf}%;"></div>
          </div>
          <span class="pin-row__value">${conf}%</span>
        </div>
      </td>
      <td>
        <button onclick="flyToPin(${pin.id})" class="pin-row__view-btn">عرض</button>
      </td>
    `;
    if (pinsBody) pinsBody.appendChild(row);
  });

  renderChart(hoodCounts);
}

function renderChart(hoodCounts = {}) {
  const ctx = document.getElementById('defectsChart');
  if (!ctx) return;

  const labels = Object.keys(hoodCounts).slice(0, 5);
  if (labels.length === 0) labels.push('No Data');

  const data = labels.map(l => hoodCounts[l] || 0);

  if (severityChartInstance) {
    severityChartInstance.data.labels = labels;
    severityChartInstance.data.datasets[0].data = data;
    severityChartInstance.update();
  } else {
    severityChartInstance = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [{
          label: "العيوب حسب الحي",
          data: data,
          backgroundColor: '#ffffff',
          borderRadius: 4
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false }
        },
        scales: {
          x: { ticks: { font: { size: 10 } }, grid: { display: false } },       
          y: { beginAtZero: true, ticks: { stepSize: 1 } }
        }
      }
    });
  }
}

let orbitReq = null;

window.stopOrbit = function() {
  if (orbitReq) {
    cancelAnimationFrame(orbitReq);
    orbitReq = null;
  }
};

window.stopAndDismiss = function(keepId = null, stopCamera = true) {
  if (stopCamera) {
    window.stopOrbit();
  }
  // Remove all other popups AND clear their pinned state instantly
  markersMap.forEach((m, id) => {
    if (id !== keepId) {
      m.isPinned = false;
      if (m.customPopup) m.customPopup.remove();
    }
  });
};


window.flyToPin = function(id) {
  if (!map) {
    window.location.href = '/';
    return;
  }

  const pin = pins.find(p => p.id === id);
  if (pin) {
    window.stopAndDismiss(null, true);
    map.stop();
    
    map.flyTo({
      center: [pin.lng, pin.lat],
      zoom: 16.5,
      pitch: 65,
      bearing: map.getBearing() + 180,
      duration: 3500,
      curve: 1.4,
      essential: true
    });

    const marker = markersMap.get(id);
    if (marker && marker.customPopup) {
      marker.isPinned = true;
      marker.customPopup.setHTML(getPopupHTML(pin, true)).setLngLat([pin.lng, pin.lat]).addTo(map);
    }

    map.once('moveend', () => {
      function orbit() {
        if (map.isZooming() || (map.isMoving() && !orbitReq)) return;
        map.setBearing(map.getBearing() + 0.15);
        orbitReq = requestAnimationFrame(orbit);
      }
      orbitReq = requestAnimationFrame(orbit);
    });
  }
};


// Stop the orbit if the user manually drags the map
if (map) {
  map.on('dragstart', window.stopOrbit);
  // Also pause orbit on zoom start if necessary
  map.on('zoomstart', window.stopOrbit);
}

if (clearPinsBtn) {
  clearPinsBtn.addEventListener('click', () => {
    markersMap.forEach(marker => marker.remove());
    markersMap.clear();
    pins.length = 0;
    localStorage.removeItem(STORAGE_KEY);
    setMessage("تم مسح جميع البيانات.", false);
    renderDashboard();
  });
}

const riyadhHoods = [
  'Al Olaya', 'Al Malaz', 'Al Yasmin', 'Al Murabba',
  'KAFD', 'Diplomatic Quarter', 'Al Sulimaniyah',
  'Al Nakheel', 'Qurtubah', 'Al Sahafah'
];

if (simulateAiBtn && map) {
  simulateAiBtn.addEventListener('click', async () => {
    setMessage("جاري فحص الاحداثيات... جلب بيانات الموقع...", false);
    simulateAiBtn.disabled = true;

    try {
      const latOffset = (Math.random() - 0.5) * 2 * (RIYADH_VISIBLE_RADIUS_KM / 111.32);
      const lngOffset = (Math.random() - 0.5) * 2 * (RIYADH_VISIBLE_RADIUS_KM / (111.32 * Math.cos(RIYADH_CENTER[1] * Math.PI / 180)));
      
      const lat = RIYADH_CENTER[1] + latOffset * 0.9;
      const lng = RIYADH_CENTER[0] + lngOffset * 0.9;

      let neighborhood = "حي غير معروف";
      try {
        const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=14&addressdetails=1&accept-language=ar`);
        const data = await response.json();

        if (data && data.address) {
          neighborhood = data.address.neighbourhood ||
                         data.address.suburb ||
                         data.address.city_district ||
                         data.address.village ||
                         data.address.town ||
                         data.address.city ||
                         "ضواحي الرياض";
        }
      } catch (err) {
      console.error("فشل تحديد الموقع:", err);
      neighborhood = "منطقة الرياض";
      }

      const confidence = Math.floor(75 + Math.random() * 24);

      const potholeImages = [
        'https://images.unsplash.com/photo-1515162816999-a0c47dc192f7?auto=format&fit=crop&w=400&q=80',
        'https://images.unsplash.com/photo-1584852923055-66772ff27838?auto=format&fit=crop&w=400&q=80',
        'https://images.unsplash.com/photo-1585832770485-e68a5dbfd5ad?auto=format&fit=crop&w=400&q=80'
      ];
      const imageUrl = potholeImages[Math.floor(Math.random() * potholeImages.length)];

      const newPin = {
        id: pins.length + 1,
        lat,
        lng,
        neighborhood,
        confidence,
        imageUrl,
        createdAt: new Date().toISOString(),
      };

      pins.push(newPin);
      savePins();
      drawPin(newPin, true);

      map.flyTo({
        center: [lng, lat],
        zoom: 12,
        pitch: 0,
        bearing: 0,
        duration: 800,
        essential: true
      });

      setMessage(`اكتشف الذكاء الاصطناعي عيباً في ${neighborhood} (ثقة ${confidence}%)`);
    } finally {
      simulateAiBtn.disabled = false;
    }
  });
}