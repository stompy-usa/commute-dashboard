const STORAGE_LATEST = "commute:latest";
const STORAGE_HISTORY = "commute:history";
const LATEST_FRESH_MS = 24 * 60 * 60 * 1000; // 24 hours

const derivePeriod = (slot) => {
  if (!slot || !/^\d{1,2}:\d{2}$/.test(slot)) return "morning";
  return parseInt(slot.split(":")[0], 10) < 12 ? "morning" : "evening";
};

const periodLabel = (p) =>
  p === "evening" ? "Evening commute (office \u2192 home)" : "Morning commute (home \u2192 office)";

const ROUTE_BASE_COLOR = "#22c55e";
const TRAFFIC_OVERLAY_COLORS = {
  1: "#facc15",
  2: "#f59e0b",
  3: "#ef4444",
};
const ROUTE_WEIGHTS = {
  primary: 7,
  alt_1: 5,
  alt_2: 4,
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

const MANEUVER_ICONS = {
  DEPART: "\u{1F3C1}",
  ARRIVE: "\u{1F3C1}",
  ARRIVE_LEFT: "\u{1F3C1}",
  ARRIVE_RIGHT: "\u{1F3C1}",
  STRAIGHT: "\u2B06",
  CONTINUE: "\u2B06",
  FOLLOW: "\u2B06",
  TURN_LEFT: "\u21B0",
  TURN_RIGHT: "\u21B1",
  SHARP_LEFT: "\u21B0",
  SHARP_RIGHT: "\u21B1",
  BEAR_LEFT: "\u2196",
  BEAR_RIGHT: "\u2197",
  KEEP_LEFT: "\u2196",
  KEEP_RIGHT: "\u2197",
  TRY_MAKE_UTURN: "\u21BA",
  MAKE_UTURN: "\u21BA",
  ENTER_MOTORWAY: "\u2934",
  ENTER_FREEWAY: "\u2934",
  ENTER_HIGHWAY: "\u2934",
  MOTORWAY_EXIT_LEFT: "\u2935",
  MOTORWAY_EXIT_RIGHT: "\u2935",
  TAKE_EXIT: "\u2935",
  ROUNDABOUT_CROSS: "\u27F3",
  ROUNDABOUT_RIGHT: "\u27F3",
  ROUNDABOUT_LEFT: "\u27F3",
  ROUNDABOUT_BACK: "\u27F3",
  WAYPOINT_LEFT: "\u2022",
  WAYPOINT_RIGHT: "\u2022",
  WAYPOINT_REACHED: "\u2022",
};

const maneuverIcon = (m) => MANEUVER_ICONS[m] || "\u2022";

const fmt12h = (hhmm) => {
  if (!hhmm || !/^\d{1,2}:\d{2}$/.test(hhmm)) return hhmm || "—";
  const [hStr, mStr] = hhmm.split(":");
  let h = parseInt(hStr, 10);
  const suffix = h >= 12 ? "PM" : "AM";
  h = h % 12 || 12;
  return `${h}:${mStr} ${suffix}`;
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
  card.dataset.label = route.label;
  card.tabIndex = 0;
  card.setAttribute("role", "button");
  const delay = fmtDelay(route.summary?.traffic_delay_s);
  const hasDirections = (route.instructions || []).length > 0;

  card.innerHTML = `
    <div class="label">
      ${route.label.replace("_", " ")}
      ${isRecommended ? '<span class="badge">recommended</span>' : ""}
    </div>
    <div class="eta">${fmt12h(route.summary?.arrival_et)}</div>
    <div class="stats">
      <div><span>total</span>${fmtMinutes(route.summary?.duration_s)}</div>
      <div><span>distance</span>${fmtMiles(route.summary?.distance_m)}</div>
      <div><span>traffic delay</span><span class="${delay.cls}">${delay.text}</span></div>
    </div>
    <div class="card-hint">tap to focus on map</div>
  `;
  const toggle = () => {
    if (mapState.selected === route.label) {
      showAllRoutes();
      document
        .querySelectorAll(".card.selected")
        .forEach((c) => c.classList.remove("selected"));
      closeDirections();
      return;
    }
    focusRoute(route.label);
    document
      .querySelectorAll(".card")
      .forEach((c) => c.classList.toggle("selected", c === card));
    const panel = document.getElementById("directions");
    if (!panel.hidden && hasDirections) renderDirections(route);
  };
  card.addEventListener("click", toggle);
  card.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      toggle();
    }
  });
  return card;
};

const renderDirections = (route) => {
  const stepsEl = document.getElementById("dir-steps");
  document.getElementById("dir-route").textContent =
    route.label.replace("_", " ") + " route";
  const s = route.summary || {};
  document.getElementById("dir-sub").textContent =
    `${fmtMinutes(s.duration_s)} · ${fmtMiles(s.distance_m)} · arrive ${fmt12h(s.arrival_et)}`;

  stepsEl.innerHTML = (route.instructions || [])
    .map((step) => {
      const icon = maneuverIcon(step.maneuver);
      const msg = step.message || step.maneuver || "";
      const street = step.street && step.message && !step.message.includes(step.street)
        ? `<div class="step-street">on ${step.street}</div>`
        : "";
      const dist =
        step.offset_m != null ? fmtMiles(step.offset_m) : "";
      return `
        <li>
          <div class="step-icon">${icon}</div>
          <div>
            <div class="step-text">${msg}</div>
            ${street}
          </div>
          <div class="step-dist">${dist}</div>
        </li>
      `;
    })
    .join("");
};

const openDirections = (route) => {
  if (!route) return;
  closeCalendar();
  renderDirections(route);
  document.getElementById("directions").hidden = false;
  document.getElementById("dir-toggle")?.classList.add("open");
};

const closeDirections = () => {
  document.getElementById("directions").hidden = true;
  document.getElementById("dir-toggle")?.classList.remove("open");
};

const findRoute = (label) =>
  mapState.routes.find((r) => r.label === label) || null;

const toggleDirections = () => {
  const panel = document.getElementById("directions");
  if (!panel.hidden) {
    closeDirections();
    return;
  }
  const route =
    findRoute(mapState.selected) ||
    findRoute("primary") ||
    mapState.routes[0];
  if (route && (route.instructions || []).length) openDirections(route);
};

// ============================================================
// Commute calendar
// ============================================================

const calState = { year: null, month: null };

const bucketForRatio = (ratio) => {
  if (ratio < 0.10) return "normal";
  if (ratio < 0.20) return "moderate";
  return "heavy";
};

const colorForBucket = (bucket) => {
  if (bucket === "normal") return "var(--primary)";
  if (bucket === "moderate") return "var(--alt1)";
  if (bucket === "heavy") return "var(--alt2)";
  return null;
};

const readHistory = () => {
  try {
    const raw = localStorage.getItem(STORAGE_HISTORY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
};

const writeHistoryTile = (dateKey, period, tile) => {
  try {
    const history = readHistory();
    history[dateKey] = history[dateKey] || {};
    history[dateKey][period] = tile;
    localStorage.setItem(STORAGE_HISTORY, JSON.stringify(history));
  } catch {
    /* localStorage may be disabled (private mode); fail silently */
  }
};

const loadMonthData = (year, month) => {
  const monthKey = `${year}-${String(month).padStart(2, "0")}-`;
  const history = readHistory();
  const dataMap = new Map();
  for (const [dateKey, periods] of Object.entries(history)) {
    if (dateKey.startsWith(monthKey) && periods && typeof periods === "object") {
      dataMap.set(dateKey, periods);
    }
  }
  return dataMap;
};

const todayETYMD = () => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const pick = (t) => parseInt(parts.find((p) => p.type === t).value, 10);
  return { year: pick("year"), month: pick("month"), day: pick("day") };
};

const renderCalendar = async () => {
  const { year, month } = calState;
  const title = document.getElementById("cal-title");
  const body = document.getElementById("cal-body");
  const nextBtn = document.getElementById("cal-next");
  if (!title || !body) return;

  title.textContent = new Date(year, month - 1, 1).toLocaleString("en-US", {
    month: "long",
    year: "numeric",
  });

  const today = todayETYMD();
  if (nextBtn) {
    nextBtn.disabled =
      year > today.year || (year === today.year && month >= today.month);
  }

  body.innerHTML =
    '<div style="grid-column: 1 / -1; color: var(--muted); font-size: 12px; padding: 12px 0; text-align: center;">Loading…</div>';

  const dataMap = await loadMonthData(year, month);
  if (calState.year !== year || calState.month !== month) return;

  body.innerHTML = "";
  const frag = document.createDocumentFragment();
  const daysInMonth = new Date(year, month, 0).getDate();

  let firstWeekdayIdx = null;
  let firstDay = null;
  for (let d = 1; d <= daysInMonth; d++) {
    const js = new Date(year, month - 1, d).getDay();
    if (js >= 1 && js <= 5) {
      firstWeekdayIdx = js - 1;
      firstDay = d;
      break;
    }
  }
  if (firstWeekdayIdx === null) return;

  for (let i = 0; i < firstWeekdayIdx; i++) {
    const empty = document.createElement("div");
    empty.className = "cal-tile empty";
    frag.appendChild(empty);
  }

  const fmtPct = (r) => `${Math.round(r * 100)}%`;
  for (let d = firstDay; d <= daysInMonth; d++) {
    const js = new Date(year, month - 1, d).getDay();
    if (js < 1 || js > 5) continue;
    const dateKey = `${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    const info = dataMap.get(dateKey) || {};

    const tile = document.createElement("div");
    tile.className = "cal-tile";
    tile.dataset.date = dateKey;

    const morningColor = info.morning ? colorForBucket(info.morning.bucket) : null;
    const eveningColor = info.evening ? colorForBucket(info.evening.bucket) : null;
    if (morningColor) tile.style.setProperty("--morning", morningColor);
    if (eveningColor) tile.style.setProperty("--evening", eveningColor);

    if (year === today.year && month === today.month && d === today.day) {
      tile.classList.add("today");
    }

    const num = document.createElement("span");
    num.className = "cal-tile-num";
    num.textContent = String(d);
    tile.appendChild(num);

    const am = info.morning
      ? `AM ${info.morning.bucket} (${fmtPct(info.morning.ratio)}, arr ${info.morning.arrival_et || "?"})`
      : "AM no data";
    const pm = info.evening
      ? `PM ${info.evening.bucket} (${fmtPct(info.evening.ratio)}, arr ${info.evening.arrival_et || "?"})`
      : "PM no data";
    tile.title = `${dateKey} — ${am}; ${pm}`;

    frag.appendChild(tile);
  }

  body.appendChild(frag);
};

const openCalendar = () => {
  closeDirections();
  if (calState.year === null) {
    const t = todayETYMD();
    calState.year = t.year;
    calState.month = t.month;
  }
  document.getElementById("calendar").hidden = false;
  document.getElementById("cal-toggle")?.classList.add("open");
  renderCalendar();
};

const closeCalendar = () => {
  const el = document.getElementById("calendar");
  if (el) el.hidden = true;
  document.getElementById("cal-toggle")?.classList.remove("open");
};

const toggleCalendar = () => {
  const panel = document.getElementById("calendar");
  if (!panel) return;
  if (!panel.hidden) {
    closeCalendar();
    return;
  }
  openCalendar();
};

const shiftMonth = (delta) => {
  if (calState.year === null) return;
  let y = calState.year;
  let m = calState.month + delta;
  while (m < 1) { m += 12; y -= 1; }
  while (m > 12) { m -= 12; y += 1; }
  calState.year = y;
  calState.month = m;
  renderCalendar();
};

// ============================================================
// Weather chip (Open-Meteo)
// ============================================================

const WEATHER_EMOJI = new Map([
  [0, ["☀️", "Clear"]],
  [1, ["🌤️", "Mostly clear"]],
  [2, ["⛅", "Partly cloudy"]],
  [3, ["☁️", "Overcast"]],
  [45, ["🌫️", "Fog"]],
  [48, ["🌫️", "Freezing fog"]],
  [51, ["🌦️", "Light drizzle"]],
  [53, ["🌦️", "Drizzle"]],
  [55, ["🌦️", "Heavy drizzle"]],
  [56, ["🌧️", "Freezing drizzle"]],
  [57, ["🌧️", "Freezing drizzle"]],
  [61, ["🌧️", "Light rain"]],
  [63, ["🌧️", "Rain"]],
  [65, ["🌧️", "Heavy rain"]],
  [66, ["🌧️", "Freezing rain"]],
  [67, ["🌧️", "Freezing rain"]],
  [71, ["❄️", "Light snow"]],
  [73, ["❄️", "Snow"]],
  [75, ["❄️", "Heavy snow"]],
  [77, ["❄️", "Snow grains"]],
  [80, ["🌧️", "Rain showers"]],
  [81, ["🌧️", "Rain showers"]],
  [82, ["🌧️", "Violent showers"]],
  [85, ["❄️", "Snow showers"]],
  [86, ["❄️", "Snow showers"]],
  [95, ["⛈️", "Thunderstorm"]],
  [96, ["⛈️", "Thunderstorm w/ hail"]],
  [99, ["⛈️", "Thunderstorm w/ hail"]],
]);

const weatherLookup = (code) => WEATHER_EMOJI.get(code) || ["🌡️", "Unknown"];

const loadWeather = async (lat, lng) => {
  try {
    const url =
      `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}` +
      `&current=temperature_2m,weather_code,apparent_temperature,wind_speed_10m` +
      `&temperature_unit=fahrenheit&wind_speed_unit=mph`;
    const r = await fetch(url);
    if (!r.ok) return;
    const data = await r.json();
    const c = data?.current;
    if (!c) return;
    const [emoji, label] = weatherLookup(c.weather_code);
    const t = Math.round(c.temperature_2m);
    const feels = Math.round(c.apparent_temperature);
    const wind = Math.round(c.wind_speed_10m);
    const chip = document.getElementById("weather");
    if (!chip) return;
    document.getElementById("wx-icon").textContent = emoji;
    document.getElementById("wx-temp").textContent = `${t}°`;
    chip.title = `${label} · ${t}°F (feels ${feels}°F) · wind ${wind} mph`;
    chip.hidden = false;
  } catch {
    /* silent */
  }
};

document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("dir-close")?.addEventListener("click", closeDirections);
  document.getElementById("dir-toggle")?.addEventListener("click", toggleDirections);
  document.getElementById("cal-toggle")?.addEventListener("click", toggleCalendar);
  document.getElementById("cal-close")?.addEventListener("click", closeCalendar);
  document.getElementById("cal-prev")?.addEventListener("click", () => shiftMonth(-1));
  document.getElementById("cal-next")?.addEventListener("click", () => shiftMonth(1));
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      closeDirections();
      closeCalendar();
    }
  });
});

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
  el.textContent = "No snapshot yet. Tap the refresh button to fetch the current commute.";
  cards.appendChild(el);
};

const mapState = {
  map: null,
  polylines: new Map(),
  routes: [],
  selected: null,
};

let cameraAnimated = false;

const prefersReducedMotion = () =>
  !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

const fitToBounds = (bounds) => {
  const { map } = mapState;
  if (!map) return;
  const opts = { padding: [24, 24] };
  if (cameraAnimated && !prefersReducedMotion()) {
    map.flyToBounds(bounds, { ...opts, duration: 0.6 });
  } else {
    map.fitBounds(bounds, opts);
  }
};

const startIcon = () =>
  L.divIcon({
    className: "endpoint-marker start-marker",
    html: '<div class="endpoint-dot"></div>',
    iconSize: [18, 18],
    iconAnchor: [9, 9],
  });

const finishIcon = () =>
  L.divIcon({
    className: "endpoint-marker finish-marker",
    html: "\u{1F3C1}",
    iconSize: [28, 28],
    iconAnchor: [4, 26],
  });

const initMap = (routes, period) => {
  const map = L.map("map", { attributionControl: false });
  L.control
    .attribution({ prefix: false })
    .addAttribution(
      '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'
    )
    .addTo(map);
  L.tileLayer(
    "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
    {
      maxZoom: 19,
      subdomains: "abcd",
    }
  ).addTo(map);

  routes.forEach((route) => {
    if (!route.polyline?.length) return;
    const weight = ROUTE_WEIGHTS[route.label] ?? 4;
    const baseLine = L.polyline(route.polyline, {
      color: ROUTE_BASE_COLOR,
      weight,
      opacity: 0.9,
    }).addTo(map);

    const overlayLines = [];
    for (const section of route.traffic_sections || []) {
      const start = section.start_idx;
      const end = section.end_idx;
      if (
        typeof start !== "number" ||
        typeof end !== "number" ||
        start >= end ||
        start < 0 ||
        end >= route.polyline.length
      ) {
        continue;
      }
      const overlayColor = TRAFFIC_OVERLAY_COLORS[section.magnitude];
      if (!overlayColor) continue;
      const segment = route.polyline.slice(start, end + 1);
      if (segment.length < 2) continue;
      const overlay = L.polyline(segment, {
        color: overlayColor,
        weight: weight + 1,
        opacity: 0.95,
      }).addTo(map);
      overlayLines.push(overlay);
    }

    mapState.polylines.set(route.label, {
      base: baseLine,
      overlays: overlayLines,
    });
  });

  if (routes[0]?.polyline?.length) {
    const first = routes[0].polyline[0];
    const last = routes[0].polyline[routes[0].polyline.length - 1];
    const startLabel = period === "evening" ? "office (start)" : "home (start)";
    const finishLabel = period === "evening" ? "home (finish)" : "office (finish)";
    L.marker(first, { icon: startIcon() }).addTo(map).bindTooltip(startLabel);
    L.marker(last, { icon: finishIcon() }).addTo(map).bindTooltip(finishLabel);
  }

  mapState.map = map;
  mapState.routes = routes;
  showAllRoutes();
};

const invalidateSoon = () => {
  if (!mapState.map) return;
  requestAnimationFrame(() => mapState.map.invalidateSize());
};

const layersFor = (entry) =>
  entry ? [entry.base, ...(entry.overlays || [])].filter(Boolean) : [];

const addRouteLayers = (map, entry) => {
  layersFor(entry).forEach((layer) => {
    if (!map.hasLayer(layer)) layer.addTo(map);
  });
};

const removeRouteLayers = (map, entry) => {
  layersFor(entry).forEach((layer) => {
    if (map.hasLayer(layer)) layer.remove();
  });
};

const showAllRoutes = () => {
  const { map, routes, polylines } = mapState;
  if (!map) return;
  const allPoints = [];
  routes.forEach((route) => {
    addRouteLayers(map, polylines.get(route.label));
    if (route.polyline?.length) allPoints.push(...route.polyline);
  });
  mapState.selected = null;
  if (allPoints.length) {
    fitToBounds(L.latLngBounds(allPoints));
  } else {
    map.setView([39.5, -98.35], 4);
  }
};

const focusRoute = (label) => {
  const { map, routes, polylines } = mapState;
  if (!map) return;
  let target = null;
  routes.forEach((route) => {
    const entry = polylines.get(route.label);
    if (!entry) return;
    if (route.label === label) {
      addRouteLayers(map, entry);
      target = route.polyline;
    } else {
      removeRouteLayers(map, entry);
    }
  });
  mapState.selected = label;
  if (target?.length) {
    fitToBounds(L.latLngBounds(target));
  }
};

const drawInPolylines = () => {
  if (prefersReducedMotion()) return;
  const entries = Array.from(mapState.polylines.values());
  if (!entries.length) return;

  entries.forEach((entry) => {
    const el = entry.base.getElement();
    if (el) {
      const len = el.getTotalLength();
      if (Number.isFinite(len) && len > 0) {
        el.style.strokeDasharray = String(len);
        el.style.strokeDashoffset = String(len);
      }
    }
    (entry.overlays || []).forEach((overlay) => {
      const ov = overlay.getElement();
      if (ov) ov.style.opacity = "0";
    });
  });

  requestAnimationFrame(() => {
    entries.forEach((entry, idx) => {
      const delay = idx * 150;
      const el = entry.base.getElement();
      if (el) {
        el.style.transition = `stroke-dashoffset 1.2s ease-out ${delay}ms`;
        el.style.strokeDashoffset = "0";
      }
      (entry.overlays || []).forEach((overlay) => {
        const ov = overlay.getElement();
        if (ov) {
          ov.style.transition = `opacity 0.5s ease-out ${1000 + delay}ms`;
          ov.style.opacity = "1";
        }
      });
    });
  });

  const cleanupMs = 1200 + (entries.length - 1) * 150 + 600;
  setTimeout(() => {
    entries.forEach((entry) => {
      const el = entry.base.getElement();
      if (el) {
        el.style.transition = "";
        el.style.strokeDasharray = "";
        el.style.strokeDashoffset = "";
      }
      (entry.overlays || []).forEach((overlay) => {
        const ov = overlay.getElement();
        if (ov) {
          ov.style.transition = "";
          ov.style.opacity = "";
        }
      });
    });
  }, cleanupMs);
};

const teardownMap = () => {
  if (mapState.map) {
    mapState.map.remove();
  }
  mapState.map = null;
  mapState.polylines = new Map();
  mapState.routes = [];
  mapState.selected = null;
  cameraAnimated = false;
};

const updateHistoryFromSnapshot = (snapshot) => {
  const primary =
    (snapshot.routes || []).find((r) => r.label === "primary") ||
    (snapshot.routes || [])[0];
  const s = primary?.summary;
  if (!s?.duration_s) return;
  const ratio = (s.traffic_delay_s || 0) / s.duration_s;
  const t = todayETYMD();
  const dateKey = `${t.year}-${String(t.month).padStart(2, "0")}-${String(t.day).padStart(2, "0")}`;
  writeHistoryTile(dateKey, snapshot.period, {
    bucket: bucketForRatio(ratio),
    ratio,
    duration_s: s.duration_s,
    traffic_delay_s: s.traffic_delay_s || 0,
    arrival_et: s.arrival_et,
    capturedAt: snapshot.captured_at,
  });
};

const renderSnapshot = (snapshot) => {
  const period = snapshot.period || derivePeriod(snapshot.et_slot);

  document.getElementById("updated").textContent =
    `updated ${fmtTimestamp(snapshot.captured_at)}`;
  document.getElementById("period").textContent = periodLabel(period);
  document.getElementById("slot").textContent = snapshot.et_slot
    ? `slot ${fmt12h(snapshot.et_slot)} ET`
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

  teardownMap();
  initMap(routes, period);

  if (routes.some((r) => r.label === "primary")) {
    focusRoute("primary");
    document
      .querySelector('.card[data-label="primary"]')
      ?.classList.add("selected");
  }

  drawInPolylines();
  cameraAnimated = true;

  const originRoute =
    routes.find((r) => r.label === "primary") || routes[0];
  const origin = originRoute?.polyline?.[0];
  if (origin) loadWeather(origin[0], origin[1]);
};

const readLatestSnapshot = () => {
  try {
    const raw = localStorage.getItem(STORAGE_LATEST);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.captured_at) return null;
    const age = Date.now() - new Date(parsed.captured_at).getTime();
    if (Number.isNaN(age) || age > LATEST_FRESH_MS) return null;
    return parsed;
  } catch {
    return null;
  }
};

const writeLatestSnapshot = (snapshot) => {
  try {
    localStorage.setItem(STORAGE_LATEST, JSON.stringify(snapshot));
  } catch {
    /* localStorage may be disabled (private mode); fail silently */
  }
};

let refreshInFlight = false;

const refresh = async () => {
  if (refreshInFlight) return;
  refreshInFlight = true;
  const btn = document.getElementById("refresh-toggle");
  if (btn) {
    btn.disabled = true;
    btn.classList.add("loading");
  }
  try {
    const snapshot = await fetchSnapshot();
    writeLatestSnapshot(snapshot);
    updateHistoryFromSnapshot(snapshot);
    renderSnapshot(snapshot);
  } catch (err) {
    renderError(`Could not refresh: ${err.message}`);
  } finally {
    refreshInFlight = false;
    if (btn) {
      btn.disabled = false;
      btn.classList.remove("loading");
    }
  }
};

const bootstrap = () => {
  const cached = readLatestSnapshot();
  if (cached) {
    renderSnapshot(cached);
  } else {
    renderEmpty();
  }
};

document.getElementById("refresh-toggle")?.addEventListener("click", refresh);

bootstrap();
