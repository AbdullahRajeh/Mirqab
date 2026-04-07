const STORAGE_KEY = "saudiPins";
const riyadhBounds = L.latLngBounds(
  [24.35, 46.45],
  [25.05, 47.15]
);

const totalPinsEl = document.getElementById("total-pins");
const latestPinEl = document.getElementById("latest-pin");
const centerPointEl = document.getElementById("center-point");
const pinsBody = document.getElementById("pins-body");
const clearPinsBtn = document.getElementById("clear-pins");

const map = L.map("dashboard-map", {
  zoomControl: true,
  maxBounds: riyadhBounds,
  maxBoundsViscosity: 1,
  minZoom: 6,
  maxZoom: 15,
}).fitBounds(riyadhBounds, { padding: [8, 8] });

L.tileLayer("https://{s}.basemaps.cartocdn.com/rastertiles/voyager_nolabels/{z}/{x}/{y}{r}.png", {
  maxZoom: 15,
  noWrap: true,
  bounds: riyadhBounds,
  subdomains: "abcd",
  attribution:
    '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
}).addTo(map);

L.tileLayer("https://{s}.basemaps.cartocdn.com/rastertiles/voyager_only_labels/{z}/{x}/{y}{r}.png", {
  maxZoom: 15,
  noWrap: true,
  bounds: riyadhBounds,
  subdomains: "abcd",
  opacity: 0.9,
}).addTo(map);

const markersLayer = L.layerGroup().addTo(map);

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

    return parsed.filter((pin) => Number.isFinite(pin.lat) && Number.isFinite(pin.lng));
  } catch {
    return [];
  }
}

function formatDate(value) {
  if (!value) {
    return "-";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "-";
  }

  return date.toLocaleString();
}

function render() {
  const pins = readPins();

  totalPinsEl.textContent = String(pins.length);
  pinsBody.innerHTML = "";
  markersLayer.clearLayers();

  if (pins.length === 0) {
    latestPinEl.textContent = "No pins yet";
    centerPointEl.textContent = "-";
    const row = document.createElement("tr");
    row.innerHTML = '<td colspan="4">No pins saved yet.</td>';
    pinsBody.appendChild(row);
    map.fitBounds(riyadhBounds, { padding: [8, 8] });
    return;
  }

  let sumLat = 0;
  let sumLng = 0;

  pins.forEach((pin) => {
    sumLat += pin.lat;
    sumLng += pin.lng;

    const marker = L.marker([pin.lat, pin.lng]).addTo(markersLayer);
    marker.bindPopup(
      `Pin #${pin.id}<br>Latitude: ${pin.lat.toFixed(6)}<br>Longitude: ${pin.lng.toFixed(6)}`
    );

    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${pin.id}</td>
      <td>${pin.lat.toFixed(6)}</td>
      <td>${pin.lng.toFixed(6)}</td>
      <td>${formatDate(pin.createdAt)}</td>
    `;
    pinsBody.appendChild(row);
  });

  const latest = pins[pins.length - 1];
  latestPinEl.textContent = `${latest.lat.toFixed(4)}, ${latest.lng.toFixed(4)}`;

  const centerLat = sumLat / pins.length;
  const centerLng = sumLng / pins.length;
  centerPointEl.textContent = `${centerLat.toFixed(4)}, ${centerLng.toFixed(4)}`;

  const groupBounds = markersLayer.getBounds();
  if (groupBounds.isValid()) {
    map.fitBounds(groupBounds.pad(0.25), { maxZoom: 11 });
  }
}

clearPinsBtn.addEventListener("click", () => {
  localStorage.removeItem(STORAGE_KEY);
  render();
});

window.addEventListener("storage", (event) => {
  if (event.key === STORAGE_KEY) {
    render();
  }
});

setInterval(render, 2500);
render();
