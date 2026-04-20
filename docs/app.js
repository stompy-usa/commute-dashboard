const DATA_URL = "data/latest.json";

const ROUTE_COLORS = {
  primary: "#22c55e",
  alt_1: "#f59e0b",
  alt_2: "#ef4444",
};

const fmtMinutes = (seconds) => {
  if (seconds == null) return "—";
  const m = Math.round(seconds / 60);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
};

const fmtMiles = (meters) => {
  if (meters == null) return "—";
  return `${(meters / 1609.34).toFixed(1)} mi`;
};

const fmtDelay = (seconds) => {
  if (seconds == null) return { text: "—", cls: "" };
  const m = Math.round(seconds / 60);
  const text = m <= 0 ? "none" : `+${m} min`;
  const cls = m >= 10 ? "delay-heavy" : m >= 3 ? "delay-mod" : "";
  return { text, cls };
};

const fmtTimestamp = (iso) => {
  if (!iso) return "unknown";
  try {
    const d = new Date(iso);
    return d.toLocaleString(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return iso;
  }
};

const pickRecommended = (routes) => {
  if (!routes.length) return null;
  let best = routes[0];
  for (const r of routes) {
    const aDur = r.summary?.duration_s ?? Infinity;
    const bDur = best.summary?.duration_s ?? Infinity;
    if (aDur < bDur) best = r;
  }
  return best.label;
};

const buildCard = (route, isRecommended) => {
  const card = document.createElement("div");
  card.className = `card ${route.label}${isRecommended ? " recommended" : ""}`;
  const delay = fmtDelay(route.summary?.traffic_delay_s);

  card.innerHTML = `
    <div class="label">
      ${route.label.replace("_", " ")}
      ${isRecommended ? '<span class="badge">recommended</span>' : ""}
    </div>
    <div class="eta">${route.summary?.arrival_et || "—"}</div>
    <div class="stats">
      <div><span>total</span>${fmtMinutes(route.summary?.duration_s)}</div>
      <div><span>distance</span>${fmtMiles(route.summary?.distance_m)}</div>
      <div><span>traffic delay</span><span class="${delay.cls}">${delay.text}</span></div>
    </div>
  `;
  return card;
};

const renderError = (msg) => {
  const cards = document.getElementById("cards");
  cards.innerHTML = "";
  const el = document.createElement("div");
  el.className = "error";
  el.textContent = msg;
  cards.appendChild(el);
};

const renderEmpty = () => {
  const cards = document.getElementById("cards");
  cards.innerHTML = "";
  const el = document.createElement("div");
  el.className = "empty";
  el.textContent = "No snapshot yet. The first run happens at 5:45am ET.";
  cards.appendChild(el);
};

const renderMap = (routes) => {
  const map = L.map("map");
  L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: "&copy; OpenStreetMap contributors",
  }).addTo(map);

  const allPoints = [];
  routes.forEach((route) => {
    if (!route.polyline?.length) return;
    const color = ROUTE_COLORS[route.label] || "#888";
    const isPrimary = route.label === "primary";
    L.polyline(route.polyline, {
      color,
      weight: isPrimary ? 6 : 4,
      opacity: isPrimary ? 0.95 : 0.75,
    }).addTo(map);
    allPoints.push(...route.polyline);
  });

  if (routes[0]?.polyline?.length) {
    const first = routes[0].polyline[0];
    const last = routes[0].polyline[routes[0].polyline.length - 1];
    L.marker(first).addTo(map).bindTooltip("home");
    L.marker(last).addTo(map).bindTooltip("office");
  }

  if (allPoints.length) {
    map.fitBounds(L.latLngBounds(allPoints), { padding: [24, 24] });
  } else {
    map.setView([39.5, -98.35], 4);
  }
};

const load = async () => {
  let snapshot;
  try {
    const resp = await fetch(DATA_URL, { cache: "no-store" });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    snapshot = await resp.json();
  } catch (err) {
    renderError(`Could not load ${DATA_URL}: ${err.message}`);
    return;
  }

  document.getElementById("updated").textContent =
    `updated ${fmtTimestamp(snapshot.captured_at)}`;
  document.getElementById("slot").textContent = snapshot.et_slot
    ? `slot ${snapshot.et_slot} ET`
    : "";

  const routes = snapshot.routes || [];
  const cards = document.getElementById("cards");
  cards.innerHTML = "";

  if (!routes.length) {
    renderEmpty();
    return;
  }

  const recommended = pickRecommended(routes);
  routes.forEach((route) => {
    cards.appendChild(buildCard(route, route.label === recommended));
  });

  renderMap(routes);
};

load();
