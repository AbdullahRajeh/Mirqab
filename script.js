const riyadhBounds = [
  [46.45, 24.35], // [lng, lat] southwest
  [47.15, 25.05]  // [lng, lat] northeast
];

const map = new maplibregl.Map({
  container: 'map',
  style: 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json',
  center: [46.8, 24.7], // Centered exactly on Riyadh midpoint
  zoom: 10,
  minZoom: 6,
  maxZoom: 16,
  pitch: 45, // Adds a sleek 3D perspective
  bearing: -10 // Slight rotation for a more dynamic look
});

// Soft "rubber-band" spring effect when scrolling far outside Riyadh
map.on('moveend', () => {
  const center = map.getCenter();
  // Allow a small buffer outside the strict bounds before gently centering back
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

map.addControl(new maplibregl.NavigationControl(), 'bottom-right');

const form = document.getElementById("coords-form");
const latitudeInput = document.getElementById("lat");
const longitudeInput = document.getElementById("lng");
const message = document.getElementById("message");
const STORAGE_KEY = "saudiPins";
const pins = readPins();

const markersMap = new Map();

const dashboardPanel = document.getElementById("dashboard-panel");
const openDashBtn = document.getElementById("open-dashboard");
const closeDashBtn = document.getElementById("close-dashboard");
const totalPinsEl = document.getElementById("total-pins");
const latestPinEl = document.getElementById("latest-pin");
const centerPointEl = document.getElementById("center-point");
const pinsBody = document.getElementById("pins-body");
const clearPinsBtn = document.getElementById("clear-pins");

openDashBtn.addEventListener("click", () => {
  dashboardPanel.classList.add("open");
  renderDashboard();
});

closeDashBtn.addEventListener("click", () => {
  dashboardPanel.classList.remove("open");
});

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
  return ret.reverse(); // Clockwise for the inner hole
}

map.on('load', () => {
  // Create a full-world polygon with a circular hole cut out for Riyadh bounds
  map.addSource('riyadh-mask', {
    type: 'geojson',
    data: {
      type: 'Feature',
      geometry: {
        type: 'Polygon',
        coordinates: [
          // Outer ring (entire world) - Counter-clockwise
          [ [-180, -90], [180, -90], [180, 90], [-180, 90], [-180, -90] ],
          // Inner ring (Circular hole) - Clockwise
          createGeoJSONCircle([46.8, 24.7], 50) // 50km radius center of Riyadh
        ]
      }
    }
  });

  // Add the solid dark overlay (completely hides outside)
  map.addLayer({
    id: 'mask-fill',
    type: 'fill',
    source: 'riyadh-mask',
    paint: {
      'fill-color': '#05080f',
      'fill-opacity': 0.85 // Clean, elegant dim without intense black
    }
  });

  // Add a very thin, clean outline instead of a blurry fade
  map.addLayer({
    id: 'mask-outline',
    type: 'line',
    source: 'riyadh-mask',
    paint: {
      'line-color': '#00ffcc',
      'line-width': 1.5,
      'line-opacity': 0.2
    }
  });

  pins.forEach((pin) => {
    drawPin(pin, false);
  });

  if (pins.length > 0) {
    setMessage(`Loaded ${pins.length} saved pin${pins.length === 1 ? "" : "s"}.`);
  }
});

function setMessage(text, isError = false) {
  message.textContent = text;
  message.classList.toggle("error", isError);
}

function parseCoordinate(value) {
  if (value === "") {
    return Number.NaN;
  }
  return Number(value);
}

function readPins() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.filter((pin) => {
      if (!pin || typeof pin !== "object") {
        return false;
      }
      return Number.isFinite(pin.lat) && Number.isFinite(pin.lng);
    });
  } catch {
    return [];
  }
}

function savePins() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(pins));
  if (dashboardPanel.classList.contains("open")) {
    renderDashboard();
  }
}

function drawPin(pin, openPopup) {
  const el = document.createElement('div');
  el.className = 'fancy-marker';

  const popup = new maplibregl.Popup({ offset: 10, closeButton: false })
    .setHTML(
      `<div style="text-align:center;">
        <strong style="color:var(--accent-deep); font-size:1.1em;">Pin #${pin.id}</strong><br>
        <span style="color:#64748b; font-size:0.9em;">${pin.lat.toFixed(5)}, ${pin.lng.toFixed(5)}</span>
      </div>`
    );

  const marker = new maplibregl.Marker({
    element: el,
    pitchAlignment: 'map',    // Makes the marker stick flat to the map surface
    rotationAlignment: 'map' // Prevents it from floating or sliding during rotation
  })
    .setLngLat([pin.lng, pin.lat])
    .setPopup(popup)
    .addTo(map);

  markersMap.set(pin.id, marker);

  if (openPopup) {
    marker.togglePopup();
  }
}

function formatDate(value) {
  if (!value) return "-";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "-" : date.toLocaleString();
}

function renderDashboard() {
  totalPinsEl.textContent = String(pins.length);
  pinsBody.innerHTML = "";

  if (pins.length === 0) {
    latestPinEl.textContent = "No pins yet";
    centerPointEl.textContent = "-";
    pinsBody.innerHTML = '<tr><td colspan="3" style="text-align:center; color: var(--muted); padding: 2rem 0;">No pins saved yet.</td></tr>';
    return;
  }

  let sumLat = 0;
  let sumLng = 0;

  pins.forEach((pin) => {
    sumLat += pin.lat;
    sumLng += pin.lng;

    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${pin.id}</td>
      <td>${pin.lat.toFixed(4)}, ${pin.lng.toFixed(4)}</td>
      <td style="font-size: 0.75rem; color: var(--muted);">${formatDate(pin.createdAt)}</td>
    `;
    pinsBody.appendChild(row);
  });

  const latest = pins[pins.length - 1];
  latestPinEl.textContent = `${latest.lat.toFixed(4)}, ${latest.lng.toFixed(4)}`;

  const centerLat = sumLat / pins.length;
  const centerLng = sumLng / pins.length;
  centerPointEl.textContent = `${centerLat.toFixed(4)}, ${centerLng.toFixed(4)}`;
}

clearPinsBtn.addEventListener("click", () => {
  // Clear map markers
  markersMap.forEach(marker => marker.remove());
  markersMap.clear();
  
  // Clear data
  pins.length = 0;
  localStorage.removeItem(STORAGE_KEY);
  
  setMessage("All pins cleared.", false);
  renderDashboard();
});

form.addEventListener("submit", (event) => {
  event.preventDefault();

  const lat = parseCoordinate(latitudeInput.value.trim());
  const lng = parseCoordinate(longitudeInput.value.trim());

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    setMessage("Please enter numeric latitude and longitude values.", true);
    return;
  }

  if (lat < 24.35 || lat > 25.05 || lng < 46.45 || lng > 47.15) {
    setMessage("Please enter coordinates inside Riyadh bounds.", true);
    return;
  }

  const newPin = {
    id: pins.length + 1,
    lat,
    lng,
    createdAt: new Date().toISOString(),
  };

  pins.push(newPin);
  savePins();
  drawPin(newPin, true);

  map.flyTo({
    center: [lng, lat],
    zoom: 12,
    pitch: 0, // removed dramatic 3D pitch for elegance
    bearing: 0,
    duration: 800, // fast, snappy transition
    essential: true // this animation is considered essential with respect to prefers-reduced-motion
  });

  setMessage(`Pin added successfully. Total pins: ${pins.length}.`);
}); 