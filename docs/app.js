const DATA_URL = "data/latest.json";
const INDEX_URL = "data/index.json";

const SCHEDULED_SLOTS = ["05:45", "06:00", "06:15", "06:30"];

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
  const delay = fmtDelay(route.summary?.traffic_delay_s);

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
  L.tileLayer(
    "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
    {
      maxZoom: 19,
      subdomains: "abcd",
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
    }
  ).addTo(map);

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

const loadTodaySnapshots = async () => {
  let index;
  try {
    const r = await fetch(INDEX_URL, { cache: "no-store" });
    if (!r.ok) return [];
    index = await r.json();
  } catch {
    return [];
  }
  if (!Array.isArray(index)) return [];

  const prefix = todayETPath() + "/";
  const matches = index.filter(
    (e) =>
      e?.path?.startsWith(prefix) &&
      SCHEDULED_SLOTS.includes(e.et_slot)
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

const renderSummary = (snaps) => {
  const el = document.getElementById("summary");
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
    trendHtml = `<span class="trend">${rows.length} of 4 slots so far</span>`;
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
    <div class="summary-title"><span>Morning trend</span>${trendHtml}</div>
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

  const todaySnaps = await loadTodaySnapshots();
  renderSummary(todaySnaps);
};

load();
