// Walk editor: build a walk on the map, add text and photos to each stop,
// then publish the walk file and photos to the GitHub repository.

const $ = (id) => document.getElementById(id);
const draftKey = "walk-editor:draft";
const ghKey = "walk-editor:github";
const previewKey = "walk-preview";

let walk = blankWalk();
let selected = -1;
let map, markers = [], line, here = null;

function blankWalk() {
  return { id: "", title: "", summary: "", arriveRadiusMetres: 25, stops: [] };
}
function load(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
}
function save(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch { return false; }
}
function say(text, kind = "") {
  const m = $("msg");
  m.textContent = text;
  m.className = kind;
}

let saveTimer;
function saveDraft() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    if (!save(draftKey, walk)) say("This device is out of storage for drafts. Publish soon so your photos aren't lost.", "err");
  }, 300);
}

// ---- Map ----

function pinIcon(i) {
  return L.divIcon({ className: "", html: `<div class="pin${i === selected ? " selected" : ""}">${i + 1}</div>`, iconSize: [30, 30], iconAnchor: [15, 15] });
}

function drawMap() {
  markers.forEach((m) => m.remove());
  markers = walk.stops.map((s, i) => {
    const m = L.marker([s.lat, s.lng], { icon: pinIcon(i), draggable: true, title: s.name }).addTo(map);
    m.on("click", () => select(i, true));
    m.on("dragend", () => {
      const p = m.getLatLng();
      s.lat = +p.lat.toFixed(6);
      s.lng = +p.lng.toFixed(6);
      select(i, false);
      saveDraft();
    });
    return m;
  });
  if (line) line.remove();
  line = L.polyline(walk.stops.map((s) => [s.lat, s.lng]), { color: getComputedStyle(document.documentElement).getPropertyValue("--accent").trim(), weight: 4, dashArray: "6 8" }).addTo(map);
}

function fitWalk() {
  if (walk.stops.length) map.fitBounds(walk.stops.map((s) => [s.lat, s.lng]), { padding: [40, 40], maxZoom: 17 });
}

function addStop(lat, lng) {
  walk.stops.push({ name: `Stop ${walk.stops.length + 1}`, lat: +lat.toFixed(6), lng: +lng.toFixed(6), text: "", photos: [] });
  selected = walk.stops.length - 1;
  render();
  saveDraft();
  const input = document.querySelector(`#stops li:nth-child(${selected + 1}) .stop-head input`);
  if (input) { input.scrollIntoView({ block: "center", behavior: "smooth" }); input.select(); }
}

function select(i, scroll) {
  selected = i;
  render();
  if (scroll) document.querySelector(`#stops li:nth-child(${i + 1})`)?.scrollIntoView({ block: "center", behavior: "smooth" });
}

// ---- Stop list ----

function el(tag, props = {}, ...kids) {
  const e = Object.assign(document.createElement(tag), props);
  e.append(...kids);
  return e;
}

function render() {
  $("title").value = walk.title;
  $("summary").value = walk.summary;
  const list = $("stops");
  list.replaceChildren();
  if (!walk.stops.length) {
    list.append(el("li", { className: "empty", textContent: "No stops yet. Tap the map where the walk starts." }));
  }
  walk.stops.forEach((s, i) => {
    const name = el("input", { type: "text", value: s.name, ariaLabel: `Stop ${i + 1} name` });
    name.oninput = () => { s.name = name.value; saveDraft(); };
    const text = el("textarea", { value: s.text, placeholder: "What's here, its history, what to look out for, where to go next" });
    text.oninput = () => { s.text = text.value; saveDraft(); };
    text.onfocus = name.onfocus = () => { if (selected !== i) { selected = i; drawMap(); list.querySelectorAll(".stop").forEach((li, k) => li.classList.toggle("selected", k === i)); } };

    const thumbs = el("div", { className: "thumbs" });
    s.photos.forEach((p, k) => {
      const cap = el("input", { type: "text", value: p.caption || "", placeholder: "Caption" });
      cap.oninput = () => { p.caption = cap.value; saveDraft(); };
      const del = el("button", { className: "small", textContent: "✕", ariaLabel: "Remove photo" });
      del.onclick = () => { s.photos.splice(k, 1); render(); saveDraft(); };
      thumbs.append(el("div", { className: "thumb" }, el("img", { src: p.data || p.src, alt: p.caption || s.name }), del, cap));
    });

    const file = el("input", { type: "file", accept: "image/*", multiple: true, hidden: true });
    file.onchange = async () => {
      say("Shrinking photos…");
      for (const f of file.files) {
        try { s.photos.push({ data: await shrink(f), caption: "" }); }
        catch { say(`Couldn't read ${f.name}. Try a JPEG or PNG.`, "err"); }
      }
      render(); saveDraft(); say("Photos added.", "ok");
    };
    const addPhoto = el("button", { className: "small", textContent: "Add photos" });
    addPhoto.onclick = () => file.click();
    const up = el("button", { className: "small", textContent: "↑", ariaLabel: "Move up", disabled: i === 0 });
    up.onclick = () => move(i, -1);
    const down = el("button", { className: "small", textContent: "↓", ariaLabel: "Move down", disabled: i === walk.stops.length - 1 });
    down.onclick = () => move(i, 1);
    const hereBtn = el("button", { className: "small", textContent: "Move to where I am" });
    hereBtn.onclick = () => {
      if (!here) return say("Still waiting for your location.", "err");
      s.lat = +here.lat.toFixed(6); s.lng = +here.lng.toFixed(6);
      render(); saveDraft(); say(`Moved stop ${i + 1} to your location.`, "ok");
    };
    const del = el("button", { className: "small danger", textContent: "Delete" });
    del.onclick = () => { walk.stops.splice(i, 1); selected = -1; render(); saveDraft(); };

    list.append(el("li", { className: "stop" + (i === selected ? " selected" : "") },
      el("div", { className: "stop-head" }, el("span", { className: "num", textContent: i + 1 }), name),
      text, thumbs,
      el("div", { className: "row" }, addPhoto, file, up, down, hereBtn, del),
      el("div", { className: "coords", textContent: `${s.lat.toFixed(5)}, ${s.lng.toFixed(5)}` })));
  });
  drawMap();
}

function move(i, d) {
  const [s] = walk.stops.splice(i, 1);
  walk.stops.splice(i + d, 0, s);
  selected = i + d;
  render(); saveDraft();
}

// Resize a photo to at most 1200px on its longest side and save as JPEG.
function shrink(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, 1200 / Math.max(img.width, img.height));
      const c = document.createElement("canvas");
      c.width = Math.round(img.width * scale);
      c.height = Math.round(img.height * scale);
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(img.src);
      resolve(c.toDataURL("image/jpeg", 0.8));
    };
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}

// ---- Loading walks ----

async function listWalks() {
  try {
    const res = await fetch("routes/index.json", { cache: "no-cache" });
    if (res.ok) return (await res.json()).walks;
  } catch {}
  return [];
}

async function openWalk(id) {
  if (!id) { walk = blankWalk(); selected = -1; render(); saveDraft(); return; }
  try {
    const res = await fetch(`routes/${encodeURIComponent(id)}.json`, { cache: "no-cache" });
    walk = await res.json();
    walk.id = id;
    walk.stops.forEach((s) => { s.photos = (s.photos || []).map((p) => typeof p === "string" ? { src: p, caption: "" } : p); });
    selected = -1;
    render(); fitWalk(); saveDraft();
    say(`Editing "${walk.title}".`);
  } catch {
    say("Couldn't open that walk.", "err");
  }
}

// ---- Publishing to GitHub ----

const slug = (t) => t.toLowerCase().normalize("NFKD").replace(/[^\w\s-]/g, "").trim().replace(/[\s_]+/g, "-").replace(/-+/g, "-").slice(0, 50) || "walk";
const b64 = (text) => btoa(String.fromCharCode(...new TextEncoder().encode(text)));

function github() {
  const cfg = load(ghKey, {});
  if (!cfg.repo || !cfg.token) return null;
  const api = async (method, path, body) => {
    const res = await fetch(`https://api.github.com/repos/${cfg.repo}/contents/${path}`, {
      method,
      headers: { Authorization: `Bearer ${cfg.token}`, Accept: "application/vnd.github+json" },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (method === "GET" && res.status === 404) return null;
    if (!res.ok) {
      const why = res.status === 401 ? "the access key was refused" : res.status === 403 || res.status === 404 ? "the key can't write to that repository" : `GitHub said ${res.status}`;
      throw new Error(why);
    }
    return res.json();
  };
  return {
    get: (path) => api("GET", path + "?ref=main"),
    put: async (path, content, message) => {
      const existing = await api("GET", path + "?ref=main");
      return api("PUT", path, { message, content, branch: "main", sha: existing?.sha });
    },
  };
}

async function publish() {
  const gh = github();
  if (!gh) { $("ghBox").open = true; $("ghBox").scrollIntoView({ behavior: "smooth" }); return say("Add your repository and access key first.", "err"); }
  if (!walk.title.trim()) { $("title").focus(); return say("Give the walk a title first.", "err"); }
  if (walk.stops.length < 2) return say("A walk needs at least two stops.", "err");

  const btn = $("publish");
  btn.disabled = true;
  try {
    if (!walk.id) {
      walk.id = slug(walk.title);
      for (let n = 2; await gh.get(`routes/${walk.id}.json`); n++) walk.id = `${slug(walk.title)}-${n}`;
    }
    const newPhotos = walk.stops.flatMap((s) => s.photos.filter((p) => p.data));
    let done = 0;
    for (const [i, s] of walk.stops.entries()) {
      for (const p of s.photos) {
        if (!p.data) continue;
        say(`Uploading photo ${++done} of ${newPhotos.length}…`);
        const path = `photos/${walk.id}-${i + 1}-${Date.now().toString(36)}.jpg`;
        await gh.put(path, p.data.split(",")[1], `Add photo for ${s.name}`);
        p.src = path;
        delete p.data;
        saveDraft();
      }
    }
    say("Saving the walk…");
    const out = { ...walk, stops: walk.stops.map((s) => ({ ...s, photos: s.photos.map((p) => p.caption ? { src: p.src, caption: p.caption } : p.src) })) };
    await gh.put(`routes/${walk.id}.json`, b64(JSON.stringify(out, null, 2) + "\n"), `Update walk: ${walk.title}`);

    say("Updating the list of walks…");
    const idx = await gh.get("routes/index.json");
    const list = idx ? JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(idx.content.replace(/\n/g, "")), (c) => c.charCodeAt(0)))) : { walks: [] };
    const entry = { id: walk.id, title: walk.title, summary: walk.summary, stops: walk.stops.length };
    const at = list.walks.findIndex((w) => w.id === walk.id);
    if (at >= 0) list.walks[at] = entry; else list.walks.push(entry);
    await gh.put("routes/index.json", b64(JSON.stringify(list, null, 2) + "\n"), `List walk: ${walk.title}`);

    saveDraft();
    const url = new URL(`./?route=${walk.id}`, location.href).href;
    say(`Published. It will be live in a minute or two at ${url}`, "ok");
    refreshPicker(walk.id);
  } catch (e) {
    say(`Publishing stopped because ${e.message}. Nothing is lost; try again.`, "err");
  } finally {
    btn.disabled = false;
  }
}

async function refreshPicker(current) {
  const pick = $("walkPick");
  const walks = await listWalks();
  if (current && !walks.some((w) => w.id === current)) walks.push({ id: current, title: walk.title });
  pick.replaceChildren(el("option", { value: "", textContent: "New walk" }), ...walks.map((w) => el("option", { value: w.id, textContent: w.title })));
  pick.value = current || "";
}

// ---- Place search ----

async function findPlace(q) {
  const m = q.match(/(-?\d{1,2}\.\d+)\s*,\s*(-?\d{1,3}\.\d+)/);
  if (m) return [+m[1], +m[2]];
  const b = map.getBounds();
  const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=gb&viewbox=${b.getWest()},${b.getNorth()},${b.getEast()},${b.getSouth()}&q=${encodeURIComponent(q)}`);
  const hits = await res.json();
  return hits.length ? [+hits[0].lat, +hits[0].lon] : null;
}

// ---- Start up ----

function init() {
  map = L.map("map");
  L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "© OpenStreetMap contributors" }).addTo(map);
  map.setView([50.9705, 0.095], 15);
  map.on("click", (e) => addStop(e.latlng.lat, e.latlng.lng));

  const draft = load(draftKey, null);
  if (draft) walk = draft;
  render();
  fitWalk();
  refreshPicker(walk.id);

  $("title").oninput = () => { walk.title = $("title").value; saveDraft(); };
  $("summary").oninput = () => { walk.summary = $("summary").value; saveDraft(); };
  $("walkPick").onchange = () => openWalk($("walkPick").value);
  $("addHere").onclick = () => here ? addStop(here.lat, here.lng) : say("Still waiting for your location.", "err");
  $("searchBtn").onclick = () => { $("searchRow").hidden = !$("searchRow").hidden; $("searchBox").focus(); };
  const go = async () => {
    try {
      const hit = await findPlace($("searchBox").value);
      if (!hit) return say("Couldn't find that place. Try coordinates instead.", "err");
      map.setView(hit, 17);
      say("Tap the map to drop a stop there.");
    } catch { say("Place search isn't available right now. Try coordinates instead.", "err"); }
  };
  $("searchGo").onclick = go;
  $("searchBox").onkeydown = (e) => { if (e.key === "Enter") go(); };

  const cfg = load(ghKey, {});
  $("ghRepo").value = cfg.repo || "davebulwer-web/self-guided-walks";
  $("ghToken").value = cfg.token || "";
  $("ghSave").onclick = () => {
    save(ghKey, { repo: $("ghRepo").value.trim(), token: $("ghToken").value.trim() });
    say("Settings saved on this device.", "ok");
  };
  $("ghForget").onclick = () => { save(ghKey, { repo: $("ghRepo").value.trim() }); $("ghToken").value = ""; say("Access key removed from this device.", "ok"); };

  $("publish").onclick = publish;
  $("preview").onclick = () => {
    if (!walk.stops.length) return say("Add some stops first.", "err");
    if (!save(previewKey, { ...walk, title: walk.title || "Untitled walk" })) return say("Not enough storage on this device to preview. Try fewer photos.", "err");
    window.open("./?preview=1", "_blank");
  };
  $("copyJson").onclick = async () => {
    const text = JSON.stringify({ ...walk, stops: walk.stops.map((s) => ({ ...s, photos: s.photos.filter((p) => p.src) })) }, null, 2);
    try { await navigator.clipboard.writeText(text); say("Walk data copied (new photos aren't included until published).", "ok"); }
    catch { $("jsonOut").hidden = false; $("jsonOut").value = text; $("jsonOut").select(); }
  };
  $("clearDraft").onclick = () => { walk = blankWalk(); selected = -1; render(); saveDraft(); $("walkPick").value = ""; say("Started a new walk."); };

  if (navigator.geolocation) {
    navigator.geolocation.watchPosition((p) => { here = { lat: p.coords.latitude, lng: p.coords.longitude }; }, () => {}, { enableHighAccuracy: true, maximumAge: 5000 });
  }
}

init();
