// Self-guided walks: loads a route file, shows its stops on a map and
// guides the walker from one stop to the next using the phone's GPS.

const params = new URLSearchParams(location.search);
const preview = params.has("preview");
let routeId = params.get("route");
let fixesKey, progressKey;

const $ = (id) => document.getElementById(id);
let route, map, line, youMarker, youCircle;
let markers = [];
let current = 0;
let here = null;
let arrivedAt = -1;

function load(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
}
function save(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
}

// Distance in metres and compass bearing between two points.
function distance(a, b) {
  const R = 6371000, toRad = (d) => d * Math.PI / 180;
  const dLat = toRad(b.lat - a.lat), dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
function bearing(a, b) {
  const toRad = (d) => d * Math.PI / 180;
  const y = Math.sin(toRad(b.lng - a.lng)) * Math.cos(toRad(b.lat));
  const x = Math.cos(toRad(a.lat)) * Math.sin(toRad(b.lat)) -
    Math.sin(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.cos(toRad(b.lng - a.lng));
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
}
const compass = (deg) => ["north", "north-east", "east", "south-east", "south", "south-west", "west", "north-west"][Math.round(deg / 45) % 8];
const formatDistance = (m) => m < 1000 ? `${Math.round(m / 5) * 5} m` : `${(m / 1000).toFixed(1)} km`;

function routeLength() {
  let total = 0;
  for (let i = 1; i < route.stops.length; i++) total += distance(route.stops[i - 1], route.stops[i]);
  return total;
}

function pinIcon(i) {
  const cls = i === current ? "pin current" : i < current ? "pin done" : "pin";
  return L.divIcon({ className: "", html: `<div class="${cls}">${i + 1}</div>`, iconSize: [36, 36], iconAnchor: [18, 18] });
}

function drawStops() {
  markers.forEach((m) => m.remove());
  markers = route.stops.map((s, i) =>
    L.marker([s.lat, s.lng], { icon: pinIcon(i), title: s.name, zIndexOffset: i === current ? 1000 : 0 })
      .addTo(map).on("click", () => show(i)));
  if (line) line.remove();
  line = L.polyline(route.stops.map((s) => [s.lat, s.lng]), { color: getComputedStyle(document.documentElement).getPropertyValue("--accent").trim(), weight: 4, dashArray: "6 8", opacity: .8 }).addTo(map);
}

function show(i) {
  current = Math.max(0, Math.min(i, route.stops.length - 1));
  save(progressKey, current);
  const s = route.stops[current];
  $("stopCount").textContent = `Stop ${current + 1} of ${route.stops.length}`;
  $("stopName").textContent = s.name;
  $("stopText").textContent = s.text || "";
  const photos = $("photos");
  photos.replaceChildren(...(s.photos || []).map((p) => {
    const img = document.createElement("img");
    img.src = typeof p === "string" ? p : p.src || p.data;
    img.alt = (typeof p === "object" && p.caption) || s.name;
    img.loading = "lazy";
    return img;
  }));
  photos.hidden = !photos.children.length;
  $("prev").disabled = current === 0;
  $("next").textContent = current === route.stops.length - 1 ? "Finish walk" : "Next stop";
  const dest = `${s.lat},${s.lng}`;
  $("walkLink").href = `https://www.google.com/maps/dir/?api=1&destination=${dest}&travelmode=walking`;
  $("transitLink").href = `https://www.google.com/maps/dir/?api=1&destination=${dest}&travelmode=transit`;
  arrivedAt = -1;
  drawStops();
  updateGuide();
}

function updateGuide() {
  const s = route.stops[current];
  const guide = $("guide");
  if (!here) return;
  const d = distance(here, s);
  const b = bearing(here, s);
  const arrived = d <= (route.arriveRadiusMetres || 25);
  guide.classList.toggle("arrived", arrived);
  $("arrow").textContent = arrived ? "✓" : "↑";
  $("arrow").style.transform = arrived ? "none" : `rotate(${b}deg)`;
  $("guideText").innerHTML = arrived
    ? `You've arrived<small>Read about this stop, then tap ${current === route.stops.length - 1 ? "Finish walk" : "Next stop"}.</small>`
    : `${formatDistance(d)} to go<small>Head ${compass(b)}. GPS accurate to about ${Math.round(here.accuracy)} m.</small>`;
  if (arrived && arrivedAt !== current) {
    arrivedAt = current;
    if (navigator.vibrate) navigator.vibrate([150, 80, 150]);
  }
}

function startGps() {
  if (!navigator.geolocation) {
    $("guideText").innerHTML = "This phone can't share its location<small>You can still follow the pins on the map.</small>";
    return;
  }
  let first = true;
  navigator.geolocation.watchPosition((pos) => {
    here = { lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy };
    const ll = [here.lat, here.lng];
    if (!youMarker) {
      youCircle = L.circle(ll, { radius: here.accuracy, color: "#2b6fd6", weight: 1, fillOpacity: .12 }).addTo(map);
      youMarker = L.circleMarker(ll, { radius: 8, color: "#fff", weight: 3, fillColor: "#2b6fd6", fillOpacity: 1 }).addTo(map);
    } else {
      youMarker.setLatLng(ll);
      youCircle.setLatLng(ll).setRadius(here.accuracy);
    }
    if (first) {
      first = false;
      map.fitBounds(L.latLngBounds([...route.stops.map((s) => [s.lat, s.lng]), ll]), { padding: [30, 30], maxZoom: 17 });
    }
    updateGuide();
  }, (err) => {
    $("guideText").innerHTML = err.code === 1
      ? "Location is turned off for this page<small>Turn it on in your browser's site settings to get guidance.</small>"
      : "Can't find your location yet<small>Try stepping outside or waiting a moment.</small>";
  }, { enableHighAccuracy: true, maximumAge: 3000, timeout: 20000 });
}

function applyFixes() {
  const fixes = load(fixesKey, {});
  route.stops.forEach((s, i) => { if (fixes[i]) Object.assign(s, fixes[i]); });
}

async function listWalks() {
  try {
    const res = await fetch("routes/index.json", { cache: "no-cache" });
    if (res.ok) return (await res.json()).walks || [];
  } catch {}
  return [];
}

// With several walks and none chosen, show the list instead of a map.
function showWalkList(walks) {
  $("routeTitle").textContent = "Choose a walk";
  $("map").hidden = true;
  $("nav").hidden = true;
  const sheet = $("sheet");
  sheet.replaceChildren(...walks.map((w) => {
    const a = document.createElement("a");
    a.className = "walk-card";
    a.href = `?route=${encodeURIComponent(w.id)}`;
    const h = document.createElement("strong");
    h.textContent = w.title;
    const p = document.createElement("span");
    p.textContent = [w.summary, w.stops && `${w.stops} stops`].filter(Boolean).join(" · ");
    a.append(h, p);
    return a;
  }));
}

async function init() {
  if (preview) {
    route = load("walk-preview", null);
    if (!route) { $("routeTitle").textContent = "Nothing to preview"; return; }
    routeId = "preview";
  } else {
    if (!routeId) {
      const walks = await listWalks();
      if (walks.length > 1) return showWalkList(walks);
      routeId = walks[0]?.id || "uckfield-lunch";
    }
    try {
      const res = await fetch(`routes/${encodeURIComponent(routeId)}.json`, { cache: "no-cache" });
      if (!res.ok) throw new Error(res.status);
      route = await res.json();
    } catch {
      $("routeTitle").textContent = "Walk not found";
      $("guideText").textContent = `There is no walk called "${routeId}".`;
      return;
    }
  }
  fixesKey = "walk-fixes:" + routeId;
  progressKey = "walk-progress:" + routeId;
  applyFixes();
  document.title = route.title;
  $("routeTitle").textContent = route.title;
  if (preview) $("routeTitle").textContent = "Preview: " + route.title;
  $("routeMeta").textContent = `${route.stops.length} stops · ${formatDistance(routeLength())}`;

  map = L.map("map", { zoomControl: true });
  L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19, attribution: "© OpenStreetMap contributors"
  }).addTo(map);
  map.fitBounds(route.stops.map((s) => [s.lat, s.lng]), { padding: [30, 30], maxZoom: 17 });

  $("prev").onclick = () => show(current - 1);
  $("next").onclick = () => {
    if (current === route.stops.length - 1) {
      $("guideText").innerHTML = "Walk complete<small>Thanks for walking. Tap a pin to revisit any stop.</small>";
      save(progressKey, 0);
      return;
    }
    show(current + 1);
  };
  $("fixPin").onclick = () => {
    if (!here) { $("status").textContent = "Waiting for your location before the pin can move."; return; }
    const fixes = load(fixesKey, {});
    fixes[current] = { lat: +here.lat.toFixed(6), lng: +here.lng.toFixed(6) };
    save(fixesKey, fixes);
    Object.assign(route.stops[current], fixes[current]);
    $("status").textContent = `Moved "${route.stops[current].name}" to where you are (GPS accurate to about ${Math.round(here.accuracy)} m).`;
    show(current);
  };
  $("copyRoute").onclick = async () => {
    const text = JSON.stringify(route, null, 2);
    const out = $("routeOut");
    try {
      await navigator.clipboard.writeText(text);
      $("status").textContent = "Route data copied. Paste it into the chat with Claude to save your fixes for everyone.";
    } catch {
      out.hidden = false; out.value = text; out.select();
      $("status").textContent = "Copy the text in the box and paste it into the chat with Claude.";
    }
  };
  $("resetPins").onclick = () => {
    save(fixesKey, {});
    location.reload();
  };

  show(load(progressKey, 0));
  startGps();
}

init();
