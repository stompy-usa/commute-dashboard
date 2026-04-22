const DATA_URL = "data/latest.json";
const INDEX_URL = "data/index.json";

const MORNING_SLOTS = [
  "05:45", "05:50", "05:55",
  "06:00", "06:05", "06:10", "06:15", "06:20", "06:25", "06:30",
];
const EVENING_SLOTS = [
  "15:15", "15:20", "15:25", "15:30", "15:35",
  "15:40", "15:45", "15:50", "15:55", "16:00",
];

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

const MORNING_TARGET_MIN = 6 * 60 + 30; // 6:30 ET
const EVENING_TARGET_MIN = 16 * 60;      // 16:00 ET

let indexCachePromise = null;
const snapshotCache = new Map();
const monthDataCache = new Map();
const calState = { year: null, month: null };

const slotToMinutes = (slot) => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(slot || "");
  if (!m) return null;
  return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
};

const fetchIndexCached = () => {
  if (!indexCachePromise) {
    indexCachePromise = fetch(INDEX_URL, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : []))
      .catch(() => []);
  }
  return indexCachePromise;
};

const fetchSnapshotByPath = (path) => {
  if (!snapshotCache.has(path)) {
    snapshotCache.set(
      path,
      fetch(`data/${path}`, { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null)
    );
  }
  return snapshotCache.get(path);
};

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

const loadMonthData = async (year, month) => {
  const key = `${year}-${String(month).padStart(2, "0")}`;
  if (monthDataCache.has(key)) return monthDataCache.get(key);

  const index = await fetchIndexCached();
  if (!Array.isArray(index)) {
    monthDataCache.set(key, new Map());
    return monthDataCache.get(key);
  }

  const monthPrefix = `data/${year}/${String(month).padStart(2, "0")}/`;
  const hhmmEntries = [];
  const manualEntries = [];
  for (const e of index) {
    if (!e?.path?.startsWith(monthPrefix)) continue;
    const dateMatch = /data\/(\d{4})\/(\d{2})\/(\d{2})\//.exec(e.path);
    if (!dateMatch) continue;
    const dateKey = `${dateMatch[1]}-${dateMatch[2]}-${dateMatch[3]}`;
    if (/^\d{1,2}:\d{2}$/.test(e.et_slot || "")) {
      const mins = slotToMinutes(e.et_slot);
      if (mins == null) continue;
      const period = mins < 720 ? "morning" : "evening";
      hhmmEntries.push({ path: e.path, mins, dateKey, period, slot: e.et_slot });
    } else if (e.et_slot === "manual") {
      manualEntries.push({ path: e.path, dateKey });
    }
  }

  const picks = new Map();
  for (const e of hhmmEntries) {
    const target =
      e.period === "morning" ? MORNING_TARGET_MIN : EVENING_TARGET_MIN;
    const pickKey = `${e.dateKey}|${e.period}`;
    const prev = picks.get(pickKey);
    if (!prev || Math.abs(e.mins - target) < Math.abs(prev.mins - target)) {
      picks.set(pickKey, e);
    }
  }

  const buildResult = (e, snap, overridePeriod) => {
    const primary = (snap.routes || []).find((r) => r.label === "primary");
    const s = primary?.summary;
    if (!s?.duration_s) return null;
    const ratio = (s.traffic_delay_s || 0) / s.duration_s;
    return {
      dateKey: e.dateKey,
      period: overridePeriod || e.period,
      bucket: bucketForRatio(ratio),
      ratio,
      duration_s: s.duration_s,
      traffic_delay_s: s.traffic_delay_s || 0,
      arrival_et: s.arrival_et,
      slot: e.slot || "manual",
    };
  };

  const [hhmmResults, manualResults] = await Promise.all([
    Promise.all(
      [...picks.values()].map(async (e) => {
        const snap = await fetchSnapshotByPath(e.path);
        return snap ? buildResult(e, snap) : null;
      })
    ),
    Promise.all(
      manualEntries.map(async (e) => {
        const snap = await fetchSnapshotByPath(e.path);
        if (!snap) return null;
        const period = snap.period === "evening" ? "evening" : "morning";
        return buildResult(e, snap, period);
      })
    ),
  ]);

  const dataMap = new Map();
  // Manual first so real HHMM entries overwrite them where both exist.
  for (const r of [...manualResults, ...hhmmResults]) {
    if (!r) continue;
    const existing = dataMap.get(r.dateKey) || {};
    if (!existing[r.period] || existing[r.period].slot === "manual") {
      existing[r.period] = r;
    }
    dataMap.set(r.dateKey, existing);
  }
  monthDataCache.set(key, dataMap);
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
  el.textContent = "No snapshot yet. The first run happens at 5:45am ET.";
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

const todayETPath = () => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const pick = (t) => parts.find((p) => p.type === t).value;
  return `${pick("year")}/${pick("month")}/${pick("day")}`;
};

const loadTodaySnapshots = async (period) => {
  let index;
  try {
    const r = await fetch(INDEX_URL, { cache: "no-store" });
    if (!r.ok) return [];
    index = await r.json();
  } catch {
    return [];
  }
  if (!Array.isArray(index)) return [];

  const slots = period === "evening" ? EVENING_SLOTS : MORNING_SLOTS;
  const prefix = todayETPath() + "/";
  const matches = index.filter(
    (e) => e?.path?.startsWith(prefix) && slots.includes(e.et_slot)
  );

  const snaps = await Promise.all(
    matches.map(async (e) => {
      try {
        const r = await fetch(`data/${e.path}`, { cache: "no-store" });
        if (!r.ok) return null;
        const data = await r.json();
        return {
          et_slot: e.et_slot,
          captured_at: e.captured_at,
          routes: data.routes || [],
        };
      } catch {
        return null;
      }
    })
  );
  return snaps
    .filter(Boolean)
    .sort((a, b) => a.et_slot.localeCompare(b.et_slot));
};

const fastestRoute = (routes) =>
  routes
    .slice()
    .sort(
      (a, b) =>
        (a.summary?.duration_s ?? Infinity) -
        (b.summary?.duration_s ?? Infinity)
    )[0];

const renderSummary = (snaps, period) => {
  const el = document.getElementById("summary");
  const trendTitle = period === "evening" ? "Evening trend" : "Morning trend";
  const totalSlots = (period === "evening" ? EVENING_SLOTS : MORNING_SLOTS).length;
  if (!snaps.length) {
    el.hidden = true;
    el.innerHTML = "";
    return;
  }
  el.hidden = false;

  const rows = snaps.map((s) => {
    const best = fastestRoute(s.routes);
    return {
      slot: s.et_slot,
      label: best?.label ?? "",
      dur: best?.summary?.duration_s ?? null,
      delay: best?.summary?.traffic_delay_s ?? null,
      arrival: best?.summary?.arrival_et ?? null,
    };
  });

  let trendHtml = "";
  if (rows.length >= 2 && rows[0].dur != null && rows.at(-1).dur != null) {
    const delta = Math.round((rows.at(-1).dur - rows[0].dur) / 60);
    if (delta >= 3)
      trendHtml = `<span class="trend up">&uarr; +${delta} min since ${fmt12h(rows[0].slot)}</span>`;
    else if (delta <= -3)
      trendHtml = `<span class="trend down">&darr; ${delta} min since ${fmt12h(rows[0].slot)}</span>`;
    else
      trendHtml = `<span class="trend">flat (&plusmn;${Math.abs(delta)} min)</span>`;
  } else {
    trendHtml = `<span class="trend">${rows.length} of ${totalSlots} slots so far</span>`;
  }

  const worst = rows.reduce(
    (a, b) => ((b.delay ?? -1) > (a?.delay ?? -1) ? b : a),
    null
  );
  const worstMin =
    worst?.delay != null ? Math.round(worst.delay / 60) : 0;
  let alertHtml = "";
  if (worstMin >= 10)
    alertHtml = `<div class="summary-alert heavy">Heavy delay at ${fmt12h(worst.slot)}: +${worstMin} min on fastest route</div>`;
  else if (worstMin >= 3)
    alertHtml = `<div class="summary-alert mod">Moderate delay at ${fmt12h(worst.slot)}: +${worstMin} min on fastest route</div>`;

  const latestSlot = rows.at(-1).slot;
  const tableRows = rows
    .map((r) => {
      const cls = r.slot === latestSlot ? "latest" : "";
      const delay = fmtDelay(r.delay);
      return `
        <tr class="${cls}">
          <td>${fmt12h(r.slot)}</td>
          <td>${r.label.replace("_", " ") || "—"}</td>
          <td>${fmtMinutes(r.dur)}</td>
          <td class="${delay.cls}">${delay.text}</td>
          <td>${fmt12h(r.arrival)}</td>
        </tr>
      `;
    })
    .join("");

  el.innerHTML = `
    <div class="summary-title"><span>${trendTitle}</span>${trendHtml}</div>
    ${alertHtml}
    <table class="summary-table">
      <thead><tr><th>Slot</th><th>Fastest</th><th>Total</th><th>Traffic</th><th>ETA</th></tr></thead>
      <tbody>${tableRows}</tbody>
    </table>
  `;
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

  initMap(routes, period);

  if (routes.some((r) => r.label === "primary")) {
    focusRoute("primary");
    document
      .querySelector('.card[data-label="primary"]')
      ?.classList.add("selected");
  }

  drawInPolylines();
  cameraAnimated = true;

  const todaySnaps = await loadTodaySnapshots(period);
  renderSummary(todaySnaps, period);
};

load();
