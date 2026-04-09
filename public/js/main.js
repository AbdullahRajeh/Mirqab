const riyadhBounds = [
  [46.45, 24.35],
  [47.15, 25.05]
];

const map = new maplibregl.Map({
  container: 'map',
  style: 'https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json',        
  center: [46.8, 24.7],
  zoom: 10,
  minZoom: 6,
  maxZoom: 16,
  pitch: 45,
  bearing: -10,
  attributionControl: false
});

map.on('moveend', () => {
  const center = map.getCenter();
  if (
    center.lng < 46.2 || center.lng > 47.4 ||
    center.lat < 24.1 || center.lat > 25.3
  ) {
    map.flyTo({
      center: [46.8, 24.7],
      zoom: 10,
      pitch: 0,
      bearing: 0,
      speed: 1.2,
      essential: true
    });
  }
});

const simulateAiBtn = document.getElementById("simulate-ai");
const message = document.getElementById("message");
const STORAGE_KEY = "saudiPotholes";

const dashboardPanel = document.getElementById("dashboard-panel");
const openDashBtn = document.getElementById("open-dashboard");
const closeDashBtn = document.getElementById("close-dashboard");
const totalPinsEl = document.getElementById("total-pins");
const worstHoodEl = document.getElementById("worst-hood");
const avgConfidenceEl = document.getElementById("avg-confidence");
const todayPinsEl = document.getElementById("today-pins");
const weekPinsEl = document.getElementById("week-pins");
const verifiedRateEl = document.getElementById("verified-rate");
const oldestPinAgeEl = document.getElementById("oldest-pin-age");
const newestPinTimeEl = document.getElementById("newest-pin-time");
const avgAgeEl = document.getElementById("avg-age");
const lowSeverityCountEl = document.getElementById("low-severity-count");
const midSeverityCountEl = document.getElementById("mid-severity-count");
const highSeverityCountEl = document.getElementById("high-severity-count");
const pinsBody = document.getElementById("pins-body");
const clearPinsBtn = document.getElementById("clear-pins");
let severityChartInstance = null;

const pins = readPins();
const markersMap = new Map();

if (openDashBtn) {
  openDashBtn.addEventListener("click", () => {
    dashboardPanel.classList.add("open");
    renderDashboard();
  });
}

if (closeDashBtn) {
  closeDashBtn.addEventListener("click", () => {
    dashboardPanel.classList.remove("open");
  });
}

function createGeoJSONCircle(center, radiusInKm, points = 64) {
  const coords = { latitude: center[1], longitude: center[0] };
  const distanceX = radiusInKm / (111.32 * Math.cos((coords.latitude * Math.PI) / 180));
  const distanceY = radiusInKm / 111.32;
  const ret = [];
  for (let i = 0; i < points; i++) {
    const theta = (i / points) * (2 * Math.PI);
    const x = distanceX * Math.cos(theta);
    const y = distanceY * Math.sin(theta);
    ret.push([coords.longitude + x, coords.latitude + y]);
  }
  ret.push(ret[0]);
  return ret.reverse();
}

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
          [ [-180, -90], [180, -90], [180, 90], [-180, 90], [-180, -90] ],      
          createGeoJSONCircle([46.8, 24.7], 50)
        ]
      }
    }
  });

  map.addLayer({
    id: 'mask-fill',
    type: 'fill',
    source: 'riyadh-mask',
    paint: {
      'fill-color': '#1B0C0C',
      'fill-opacity': 0.85
    }
  });

  map.addLayer({
    id: 'mask-outline',
    type: 'line',
    source: 'riyadh-mask',
    paint: {
      'line-color': '#FFDE42',
      'line-width': 1.5,
      'line-opacity': 0.2
    }
  });

  pins.forEach((pin) => {
    drawPin(pin, false);
  });

  if (pins.length > 0) {
    setMessage(`تم تحميل ${pins.length} اكتشافات محفوظة.`);  
  }
});

function setMessage(text, isError = false) {
  if (!message) return;
  message.textContent = text;
  message.classList.toggle("error", isError);
}

function readPins() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(pin => pin && typeof pin === "object" && Number.isFinite(pin.lat) && Number.isFinite(pin.lng));
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

  map.flyTo({
    zoom: Math.max(map.getZoom() - 3, 10),
    pitch: 0,
    duration: 2000,
    essential: true
  });
};

window.verifyPin = function(id) {
  const pin = pins.find(p => p.id === id);
  if (!pin) return;

  pin.verified = !pin.verified;
  const marker = markersMap.get(id);
  if (marker) {
    marker.getElement().style.backgroundColor = pin.verified ? '#4ade80' : '#FFDE42';
    if (marker.customPopup) {
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
  const verifiedBadge = pin.verified ? '<span style="color:#FFDE42; margin-left:6px; font-size:1rem;" title="معتمد">&#10004;</span>' : '';
  
  let html = `
    <div style="min-width: 240px; width: ; box-sizing:border-box; overflow:hidden; padding: 4px; transition: all 0.3s ease;">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 8px; flex-direction: row-reverse; gap: 8px; flex-wrap: nowrap;">
        <strong style="color:var(--text-main); font-size:1.1em; display:flex; align-items:center; gap:4px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">عيب #${pin.id} ${verifiedBadge}</strong>
        <span style="font-size:0.75rem; padding: 2px 6px; border-radius: 4px; background: #1B0C0C; border: 1px solid #4C5C2D; color: #FFDE42; font-weight: bold; white-space:nowrap; flex-shrink:0;">${conf}% ثقة</span>
      </div>
      <img src="${pin.imageUrl || defaultImg}" style="width: 100%; height: ${isExpanded ? '180px' : '120px'}; object-fit: cover; border-radius: 8px; margin-bottom: 8px; transition: height 0.3s ease;" alt="Road defect">
      <div style="color:var(--text-muted); font-size:0.8em; margin-bottom: ${isExpanded ? '12px' : '4px'}; line-height: 1.4; text-align: right;">
        <strong style="color: var(--text-main);">الحي:</strong> ${hood}<br>
        <strong style="color: var(--text-main);">الإحداثيات:</strong>  ${pin.lat.toFixed(4)}, ${pin.lng.toFixed(4)}
      </div>
  `;
  
  if (isExpanded) {
    html += `
      <div style="display: flex; gap: 8px; margin-top: 8px; flex-direction: row-reverse; gap: 8px; flex-wrap: nowrap;">
        <button onclick="window.verifyPin(${pin.id})" onmouseover="this.style.filter='brightness(1.2)'" onmouseout="this.style.filter='none'" style="flex:1; background:${pin.verified ? '#313E17' : '#4C5C2D'}; color:#FFF; border: 1px solid #FFDE42; padding: 8px 12px; border-radius: 6px; cursor: pointer; font-weight: bold; white-space:nowrap; flex-shrink:0; transition: all 0.2s ease;">
          ${pin.verified ? '✓ معتمد' : 'تأكيد الاكتشاف'}
        </button>
        <button onclick="window.deletePin(${pin.id})" onmouseover="this.style.background='rgba(239, 68, 68, 0.2)'" onmouseout="this.style.background='rgba(239, 68, 68, 0.1)'" style="flex:1; background:rgba(239, 68, 68, 0.1); border: 1px solid rgba(239, 68, 68, 0.4); color:#ef4444; padding: 8px 12px; border-radius: 6px; cursor: pointer; font-weight: bold; white-space:nowrap; flex-shrink:0; transition: all 0.2s ease;">
          إلغاء (خطأ)
        </button>
      </div>
    `;
  }
  
  html += `</div>`;
  return html;
}

function drawPin(pin, openPopup) {
  const el = document.createElement('div');
  el.className = 'fancy-marker';
  el.style.backgroundColor = pin.verified ? '#4ade80' : '#FFDE42';

  const popup = new maplibregl.Popup({ offset: 10, closeButton: false })
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
    if (avgConfidenceEl) avgConfidenceEl.textContent = '0%';
    if (todayPinsEl) todayPinsEl.textContent = '0';
    if (weekPinsEl) weekPinsEl.textContent = '0';
    if (verifiedRateEl) verifiedRateEl.textContent = '0%';
    if (oldestPinAgeEl) oldestPinAgeEl.textContent = '-';
    if (newestPinTimeEl) newestPinTimeEl.textContent = '-';
    if (avgAgeEl) avgAgeEl.textContent = '-';
    if (lowSeverityCountEl) lowSeverityCountEl.textContent = '0';
    if (midSeverityCountEl) midSeverityCountEl.textContent = '0';
    if (highSeverityCountEl) highSeverityCountEl.textContent = '0';
    if (pinsBody) pinsBody.innerHTML = "<tr><td colspan=\"4\" style=\"text-align:center; color: var(--text-muted); padding: 2rem 0;\">لا توجد اكتشافات بعد.</td></tr>";
    renderChart({});
    return;
  }

  let totalConfidence = 0;
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
  const severityCounts = { low: 0, mid: 0, high: 0 };

  pins.forEach(p => {
    const conf = p.confidence || 85;
    const hood = p.neighborhood || "حي غير معروف";
    totalConfidence += conf;
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

    if (conf < 80) severityCounts.low += 1;
    else if (conf < 90) severityCounts.mid += 1;
    else severityCounts.high += 1;
  });

  const avgConf = Math.round(totalConfidence / pins.length);
  if (avgConfidenceEl) avgConfidenceEl.textContent = avgConf + '%';
  if (todayPinsEl) todayPinsEl.textContent = String(todayCount);
  if (weekPinsEl) weekPinsEl.textContent = String(weekCount);
  if (verifiedRateEl) verifiedRateEl.textContent = `${Math.round((verifiedCount / pins.length) * 100)}%`;
  if (oldestPinAgeEl) oldestPinAgeEl.textContent = oldestPin ? formatRelativeTime(oldestPin) : '-';
  if (newestPinTimeEl) newestPinTimeEl.textContent = newestPin ? formatAbsoluteTime(newestPin) : '-';
  if (avgAgeEl) avgAgeEl.textContent = ageCount ? formatRelativeTime(new Date(now - (totalAgeMs / ageCount))) : '-';
  if (lowSeverityCountEl) lowSeverityCountEl.textContent = String(severityCounts.low);
  if (midSeverityCountEl) midSeverityCountEl.textContent = String(severityCounts.mid);
  if (highSeverityCountEl) highSeverityCountEl.textContent = String(severityCounts.high);

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
      <td><img src="${pin.imageUrl || defaultImg}" style="width:40px; height:40px; border-radius:4px; object-fit:cover;"></td>
      <td style="font-weight:600; font-size:0.8rem;">${hood}</td>
      <td>
        <div style="background:#e2e8f0; border-radius:4px; height:6px; width:100%; margin-top:3px;">
          <div style="background:#FFDE42; height:100%; border-radius:4px; width:${conf}%;"></div>
        </div>
        <span style="font-size:0.7rem; color:var(--text-muted);">${conf}%</span>
      </td>
      <td>
        <button onclick="flyToPin(${pin.id})" style="background:#313E17; color:#fff; border:none; cursor:pointer; padding: 4px 8px; border-radius:4px; font-size:0.7rem;">عرض</button>
      </td>
    `;
    if (pinsBody) pinsBody.appendChild(row);
  });

  renderChart(hoodCounts);
}

function renderChart(hoodCounts = {}) {
  const ctx = document.getElementById('severityChart');
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
          backgroundColor: '#FFDE42',
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
map.on('dragstart', window.stopOrbit);
// Also pause orbit on zoom start if necessary
map.on('zoomstart', window.stopOrbit);

if (clearPinsBtn) {
  clearPinsBtn.addEventListener('click', () => {
    markersMap.forEach(marker => marker.remove());
    markersMap.clear();
    pins.length = 0;
    localStorage.removeItem(STORAGE_KEY);
    setMessage("ØªÙ… Ù…Ø³Ø Ø¬Ù…ÙŠØ¹ Ø§Ù„Ø¨ÙŠØ§Ù†Ø§Øª.", false);
    renderDashboard();
  });
}

const riyadhHoods = [
  'Al Olaya', 'Al Malaz', 'Al Yasmin', 'Al Murabba',
  'KAFD', 'Diplomatic Quarter', 'Al Sulimaniyah',
  'Al Nakheel', 'Qurtubah', 'Al Sahafah'
];

if (simulateAiBtn) {
  simulateAiBtn.addEventListener('click', async () => {
    setMessage("Ø¬Ø§Ø±ÙŠ ÙØØµ Ø§Ù„Ø¥ØØ¯Ø§Ø«ÙŠØ§Øª... Ø¬Ù„Ø¨ Ø¨ÙŠØ§Ù†Ø§Øª Ø§Ù„Ù Ù…ÙˆÙ‚Ø¹...", false);
    simulateAiBtn.disabled = true;

    try {
      const lat = 24.35 + Math.random() * (25.05 - 24.35);
      const lng = 46.45 + Math.random() * (47.15 - 46.45);

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
                         "Ø¶ÙˆØ§ØÙŠ Ø§Ù„Ø±ÙŠØ§Ø¶";
        }
      } catch (err) {
        console.error("ÙØ´Ù„ ØªØØ¯ÙŠØ¯ Ø§Ù„Ù…ÙˆÙ‚Ø¹:", err);
        neighborhood = "Ù…Ù†Ø·Ù‚Ø© Ø§Ù„Ø±ÙŠØ§Ø¶";
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

      setMessage(`Ø§ÙƒØªØ´Ù Ø§Ù„Ø°ÙƒØ§Ø¡ Ø§Ù„Ø§ØµØ·Ù†Ø§Ø¹ÙŠ عيبØ§Ù‹ ÙÙŠ ${neighborhood} (Ø«Ù‚Ø© ${confideence}%)`);
    } finally {
      simulateAiBtn.disabled = false;
    }
  });
}