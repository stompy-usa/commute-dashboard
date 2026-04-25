// Client-side TomTom routing call.
//
// Replace TOMTOM_KEY with the restricted key you generated in the TomTom
// developer portal. The key MUST have referrer restrictions configured
// for `https://stompy-usa.github.io/*` and any localhost origins you
// use for development -- without those restrictions, anyone reading
// the page source can scrape the key and use it freely.
const TOMTOM_KEY = "g1H0D3vbNjCv6k7rhQAvVyWNIFczQXFc";

const HOME_COORDS = [39.9356, -75.14538];
const OFFICE_COORDS = [40.00863, -75.2139];

const ALLOWED_MAGNITUDES = new Set([1, 2, 3]);

const currentPeriodET = () => {
  const hour = parseInt(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York",
      hour: "2-digit",
      hour12: false,
    }).format(new Date()),
    10
  );
  return hour < 12 ? "morning" : "evening";
};

const currentSlotET = () => {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date());
  const hh = parts.find((p) => p.type === "hour").value;
  const mm = parts.find((p) => p.type === "minute").value;
  return `${hh}:${mm}`;
};

const isoToET = (iso) => {
  if (!iso) return "";
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).formatToParts(new Date(iso));
    const hh = parts.find((p) => p.type === "hour").value;
    const mm = parts.find((p) => p.type === "minute").value;
    return `${hh}:${mm}`;
  } catch {
    return "";
  }
};

const labelForIndex = (idx) => (idx === 0 ? "primary" : `alt_${idx}`);

const extractRoute = (raw, idx) => {
  const leg = (raw.legs || [])[0] || {};
  const points = leg.points || [];
  const polyline = points.map((p) => [p.latitude, p.longitude]);

  const summary = raw.summary || {};
  const lengthInMeters = summary.lengthInMeters ?? 0;
  const travelTimeInSeconds = summary.travelTimeInSeconds ?? 0;
  const trafficDelayInSeconds = summary.trafficDelayInSeconds ?? 0;
  const arrivalTime = summary.arrivalTime || "";

  const instructions = (raw.guidance?.instructions || []).map((ins) => ({
    message: ins.message || "",
    street: ins.street || ins.roadNumbers?.[0] || "",
    maneuver: ins.maneuver || "",
    offset_m: ins.routeOffsetInMeters ?? 0,
    time_s: ins.travelTimeInSeconds ?? 0,
  }));

  const traffic_sections = (raw.sections || [])
    .filter((s) => s.sectionType === "TRAFFIC" && ALLOWED_MAGNITUDES.has(s.magnitudeOfDelay))
    .map((s) => ({
      start_idx: s.startPointIndex ?? 0,
      end_idx: s.endPointIndex ?? 0,
      magnitude: s.magnitudeOfDelay,
      delay_s: s.delayInSeconds ?? 0,
      category: s.effectiveSpeedInKmh != null ? "speed" : "",
    }));

  return {
    label: labelForIndex(idx),
    summary: {
      distance_m: lengthInMeters,
      duration_s: travelTimeInSeconds,
      traffic_delay_s: trafficDelayInSeconds,
      arrival_et: isoToET(arrivalTime),
    },
    polyline,
    instructions,
    traffic_sections,
  };
};

const buildSnapshot = (raw, period) => ({
  captured_at: new Date().toISOString().replace(/\.\d{3}Z$/, "Z"),
  et_slot: currentSlotET(),
  period,
  routes: (raw.routes || []).map((route, idx) => extractRoute(route, idx)),
});

const fetchSnapshot = async () => {
  if (!TOMTOM_KEY || TOMTOM_KEY === "REPLACE_WITH_YOUR_RESTRICTED_KEY") {
    throw new Error("TomTom key not configured. Edit docs/tomtom.js.");
  }
  const period = currentPeriodET();
  const [origin, destination] = period === "evening"
    ? [OFFICE_COORDS, HOME_COORDS]
    : [HOME_COORDS, OFFICE_COORDS];
  const locations = `${origin[0]},${origin[1]}:${destination[0]},${destination[1]}`;
  const params = new URLSearchParams({
    key: TOMTOM_KEY,
    traffic: "true",
    maxAlternatives: "2",
    alternativeType: "anyRoute",
    routeRepresentation: "polyline",
    instructionsType: "text",
    sectionType: "traffic",
    travelMode: "car",
    routeType: "fastest",
    departAt: "now",
  });
  const url = `https://api.tomtom.com/routing/1/calculateRoute/${locations}/json?${params}`;
  const resp = await fetch(url);
  if (!resp.ok) {
    throw new Error(`TomTom returned ${resp.status}`);
  }
  const raw = await resp.json();
  return buildSnapshot(raw, period);
};
