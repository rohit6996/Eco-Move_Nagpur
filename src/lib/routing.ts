import { buildNetwork, haversine, type Place, type TransitNetwork } from "./network";
import { walkRoute, clearWalkCache } from "./ors";

// Purge any cached ORS results from a previous session / preference change
clearWalkCache();


export type Preference = "balanced" | "fastest" | "least_walk" | "fewest_transfers" | "low_co2";

/** Tunable model parameters — change here, the algorithm is untouched. */
export const PARAMS = {
  walkSpeedKmh: 4.8,
  busSpeedKmh: 17,
  metroSpeedKmh: 32,
  busWaitMin: 9,
  metroWaitMin: 4,
  transferPenaltyMin: 3,
  maxAccessWalkM: 1500,
  maxTransferWalkM: 700,
  co2PerKm: { walk: 0, bus: 68, metro: 22 }, // grams per passenger-km
};

export const PREFERENCE_WEIGHTS: Record<
  Preference,
  { time: number; walk: number; transfer: number; co2: number; busPenalty: number }
> = {
  // cost = time(min)*w.time + walk(km)*w.walk + transfers*w.transfer + co2(kg)*w.co2
  //        + bus(km)*w.busPenalty   (metro is preferred whenever it is available)
  balanced: { time: 1, walk: 8, transfer: 6, co2: 4, busPenalty: 3.5 },
  fastest: { time: 1, walk: 1, transfer: 1, co2: 0, busPenalty: 1.5 },
  least_walk: { time: 0.4, walk: 60, transfer: 2, co2: 0, busPenalty: 1.5 },
  fewest_transfers: { time: 0.5, walk: 4, transfer: 45, co2: 0, busPenalty: 1.5 },
  low_co2: { time: 0.4, walk: 2, transfer: 3, co2: 60, busPenalty: 4 },
};


export interface LatLng {
  lat: number;
  lon: number;
  name?: string;
}

export interface Leg {
  mode: "walk" | "bus" | "metro";
  /** bus route name / metro line name */
  line?: string;
  from: string;
  to: string;
  distanceM: number;
  timeMin: number;
  co2g: number;
  stops?: string[];
  path: { lat: number; lon: number }[];
  /** Average headway in minutes — only set for bus/metro legs */
  frequencyMin?: number;
}

export interface Journey {
  legs: Leg[];
  totalDistanceM: number;
  totalTimeMin: number;
  walkDistanceM: number;
  transfers: number;
  co2g: number;
  score: number;
}

interface Metrics {
  timeMin: number;
  walkM: number;
  transitM: number;
  busM: number;
  boardings: number;
  co2g: number;
}

interface Edge {
  to: string;
  kind: "walk" | "board" | "alight" | "ride";
  mode?: "bus" | "metro";
  lineId?: string;
  fromPlace?: string;
  toPlace?: string;
  distanceM: number;
  timeMin: number;
  co2g: number;
}

const net: TransitNetwork = buildNetwork();
export const network = net;

const placeNode = (id: string) => `P:${id}`;
const rideNode = (lineId: string, idx: number) => `R:${lineId}:${idx}`;

/** Static graph edges (built once, reused for every query). */
const graph = new Map<string, Edge[]>();
function addEdge(from: string, e: Edge) {
  const arr = graph.get(from);
  if (arr) arr.push(e);
  else graph.set(from, [e]);
}

function walkEdge(from: LatLng, to: LatLng, distanceM?: number) {
  const d = distanceM ?? haversine(from.lat, from.lon, to.lat, to.lon) * 1.25;
  return { d, t: (d / 1000 / PARAMS.walkSpeedKmh) * 60 };
}

(function buildGraph() {
  // board / alight / ride edges
  for (const line of net.lines.values()) {
    const wait = line.mode === "bus" ? PARAMS.busWaitMin : PARAMS.metroWaitMin;
    const speed = line.mode === "bus" ? PARAMS.busSpeedKmh : PARAMS.metroSpeedKmh;
    const co2 = PARAMS.co2PerKm[line.mode];
    line.placeIds.forEach((pid, i) => {
      addEdge(placeNode(pid), {
        to: rideNode(line.id, i),
        kind: "board",
        lineId: line.id,
        distanceM: 0,
        timeMin: wait,
        co2g: 0,
      });
      addEdge(rideNode(line.id, i), {
        to: placeNode(pid),
        kind: "alight",
        lineId: line.id,
        distanceM: 0,
        timeMin: 0,
        co2g: 0,
      });
      for (const j of [i - 1, i + 1]) {
        if (j < 0 || j >= line.placeIds.length) continue;
        const a = line.points[i]!;
        const b = line.points[j]!;
        const d = haversine(a.lat, a.lon, b.lat, b.lon) * 1.2;
        addEdge(rideNode(line.id, i), {
          to: rideNode(line.id, j),
          kind: "ride",
          mode: line.mode,
          lineId: line.id,
          fromPlace: line.placeIds[i]!,
          toPlace: line.placeIds[j]!,
          distanceM: d,
          timeMin: (d / 1000 / speed) * 60 + 0.4,
          co2g: (d / 1000) * co2,
        });
      }
    });
  }

  // walking transfer edges between nearby places
  const list = net.placeList;
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      const A = list[i]!;
      const B = list[j]!;
      const d = haversine(A.lat, A.lon, B.lat, B.lon);
      if (d > PARAMS.maxTransferWalkM) continue;
      const { d: wd, t } = walkEdge(A, B, d * 1.25);
      addEdge(placeNode(A.id), {
        to: placeNode(B.id),
        kind: "walk",
        fromPlace: A.id,
        toPlace: B.id,
        distanceM: wd,
        timeMin: t,
        co2g: 0,
      });
      addEdge(placeNode(B.id), {
        to: placeNode(A.id),
        kind: "walk",
        fromPlace: B.id,
        toPlace: A.id,
        distanceM: wd,
        timeMin: t,
        co2g: 0,
      });
    }
  }
})();

export function nearestPlaces(point: LatLng, radiusM = PARAMS.maxAccessWalkM, limit = 8) {
  return net.placeList
    .map((p) => ({ place: p, d: haversine(point.lat, point.lon, p.lat, p.lon) }))
    .filter((x) => x.d <= radiusM)
    .sort((a, b) => a.d - b.d)
    .slice(0, limit);
}

function cost(m: Metrics, pref: Preference) {
  const w = PREFERENCE_WEIGHTS[pref];
  const transfers = Math.max(0, m.boardings - 1);
  return (
    m.timeMin * w.time +
    (m.walkM / 1000) * w.walk +
    transfers * w.transfer +
    (m.co2g / 1000) * w.co2 +
    (m.busM / 1000) * w.busPenalty
  );
}

interface Trace {
  prev?: string;
  edge?: Edge;
  m: Metrics;
}

/** Dijkstra over the multimodal graph with a pluggable cost function. */
function search(origin: LatLng, destination: LatLng, pref: Preference, banLine?: string) {
  const ORIGIN = "ORIGIN";
  const DEST = "DEST";
  const extra = new Map<string, Edge[]>();
  const addExtra = (from: string, e: Edge) => {
    const a = extra.get(from);
    if (a) a.push(e);
    else extra.set(from, [e]);
  };

  for (const { place, d } of nearestPlaces(origin)) {
    const { d: wd, t } = walkEdge(origin, place, d * 1.25);
    addExtra(ORIGIN, {
      to: placeNode(place.id),
      kind: "walk",
      toPlace: place.id,
      distanceM: wd,
      timeMin: t,
      co2g: 0,
    });
  }
  const destAccess = new Map<string, Edge>();
  for (const { place, d } of nearestPlaces(destination)) {
    const { d: wd, t } = walkEdge(place, destination, d * 1.25);
    destAccess.set(placeNode(place.id), {
      to: DEST,
      kind: "walk",
      fromPlace: place.id,
      distanceM: wd,
      timeMin: t,
      co2g: 0,
    });
  }
  // direct walk fallback
  {
    const { d, t } = walkEdge(origin, destination);
    if (d <= 2500) addExtra(ORIGIN, { to: DEST, kind: "walk", distanceM: d, timeMin: t, co2g: 0 });
  }

  const edgesOf = (n: string): Edge[] => {
    const out = [...(graph.get(n) ?? []), ...(extra.get(n) ?? [])];
    const da = destAccess.get(n);
    if (da) out.push(da);
    return banLine ? out.filter((e) => e.lineId !== banLine) : out;
  };

  const best = new Map<string, number>([[ORIGIN, 0]]);
  const trace = new Map<string, Trace>([
    [ORIGIN, { m: { timeMin: 0, walkM: 0, transitM: 0, busM: 0, boardings: 0, co2g: 0 } }],
  ]);
  const queue: { n: string; c: number }[] = [{ n: ORIGIN, c: 0 }];
  const done = new Set<string>();

  while (queue.length) {
    let bi = 0;
    for (let i = 1; i < queue.length; i++) if (queue[i]!.c < queue[bi]!.c) bi = i;
    const { n, c } = queue.splice(bi, 1)[0]!;
    if (done.has(n)) continue;
    done.add(n);
    if (n === DEST) break;
    const cur = trace.get(n)!;
    for (const e of edgesOf(n)) {
      if (done.has(e.to)) continue;
      // Add transfer penalty only for real transfers (second+ boarding), not the first one
      const transferPenalty = e.kind === "board" && cur.m.boardings > 0 ? PARAMS.transferPenaltyMin : 0;
      const m: Metrics = {
        timeMin: cur.m.timeMin + e.timeMin + transferPenalty,
        walkM: cur.m.walkM + (e.kind === "walk" ? e.distanceM : 0),
        transitM: cur.m.transitM + (e.kind === "ride" ? e.distanceM : 0),
        busM: cur.m.busM + (e.kind === "ride" && e.mode === "bus" ? e.distanceM : 0),
        boardings: cur.m.boardings + (e.kind === "board" ? 1 : 0),
        co2g: cur.m.co2g + e.co2g,
      };
      if (m.walkM > 4000) continue;
      const nc = cost(m, pref);
      if (nc < (best.get(e.to) ?? Infinity)) {
        best.set(e.to, nc);
        trace.set(e.to, { prev: n, edge: e, m });
        queue.push({ n: e.to, c: nc });
      }
    }
    void c;
  }

  if (!trace.has(DEST) || !done.has(DEST)) return null;

  // rebuild edge chain
  const chain: { node: string; edge: Edge }[] = [];
  let cursor = DEST;
  while (cursor !== ORIGIN) {
    const t = trace.get(cursor)!;
    if (!t.edge || !t.prev) break;
    chain.unshift({ node: cursor, edge: t.edge });
    cursor = t.prev;
  }
  return { chain, metrics: trace.get(DEST)!.m, score: best.get(DEST)! };
}

function label(placeId: string | undefined, fallback: string) {
  if (!placeId) return fallback;
  return net.places.get(placeId)?.name ?? fallback;
}

function pt(p: Place) {
  return { lat: p.lat, lon: p.lon };
}

function toJourney(
  res: NonNullable<ReturnType<typeof search>>,
  origin: LatLng,
  destination: LatLng,
): Journey {
  const legs: Leg[] = [];
  const originName = origin.name ?? "Source";
  const destName = destination.name ?? "Destination";

  let i = 0;
  const chain = res.chain;
  while (i < chain.length) {
    const e = chain[i]!.edge;
    if (e.kind === "walk") {
      const fromP = e.fromPlace ? net.places.get(e.fromPlace) : undefined;
      const toP = e.toPlace ? net.places.get(e.toPlace) : undefined;
      legs.push({
        mode: "walk",
        from: fromP?.name ?? originName,
        to: toP?.name ?? destName,
        distanceM: e.distanceM,
        timeMin: e.timeMin,
        co2g: 0,
        path: [fromP ? pt(fromP) : origin, toP ? pt(toP) : destination],
      });
      i++;
      continue;
    }
    if (e.kind === "board") {
      const lineId = e.lineId!;
      const line = net.lines.get(lineId)!;
      let j = i + 1;
      const stops: string[] = [];
      let dist = 0;
      let time = e.timeMin;
      let co2 = 0;
      const path: { lat: number; lon: number }[] = [];
      let boardPlace = "";
      let lastPlace = "";
      while (j < chain.length && chain[j]!.edge.kind === "ride") {
        const r = chain[j]!.edge;
        if (!boardPlace) {
          boardPlace = label(r.fromPlace, line.name);
          stops.push(boardPlace);
          const p = net.places.get(r.fromPlace!);
          if (p) path.push(pt(p));
        }
        dist += r.distanceM;
        time += r.timeMin;
        co2 += r.co2g;
        lastPlace = label(r.toPlace, line.name);
        stops.push(lastPlace);
        const p2 = net.places.get(r.toPlace!);
        if (p2) path.push(pt(p2));
        j++;
      }
      if (j < chain.length && chain[j]!.edge.kind === "alight") j++;
      if (dist > 0) {
        legs.push({
          mode: line.mode,
          line: line.name,
          from: boardPlace,
          to: lastPlace,
          distanceM: dist,
          timeMin: time,
          co2g: co2,
          stops,
          path,
          frequencyMin: line.frequencyMin,
        });
      }
      i = j;
      continue;
    }
    i++;
  }

  // merge consecutive walk legs
  const merged: Leg[] = [];
  for (const leg of legs) {
    const prev = merged[merged.length - 1];
    if (prev && prev.mode === "walk" && leg.mode === "walk") {
      prev.to = leg.to;
      prev.distanceM += leg.distanceM;
      prev.timeMin += leg.timeMin;
      prev.path = [...prev.path, ...leg.path.slice(1)];
    } else merged.push({ ...leg });
  }
  // drop negligible walking legs (origin/destination already at the stop)
  for (let k = merged.length - 1; k >= 0; k--) {
    if (merged[k]!.mode === "walk" && merged[k]!.distanceM < 30) merged.splice(k, 1);
  }
  const transitLegs = merged.filter((l) => l.mode !== "walk");
  return {
    legs: merged,
    totalDistanceM: merged.reduce((s, l) => s + l.distanceM, 0),
    totalTimeMin: merged.reduce((s, l) => s + l.timeMin, 0),
    walkDistanceM: merged.filter((l) => l.mode === "walk").reduce((s, l) => s + l.distanceM, 0),
    transfers: Math.max(0, transitLegs.length - 1),
    co2g: merged.reduce((s, l) => s + l.co2g, 0),
    score: res.score,
  };
}

/** Plans a journey and returns alternatives (best first). */
export function planJourney(
  origin: LatLng,
  destination: LatLng,
  preference: Preference = "balanced",
): { journeys: Journey[]; error?: string } {
  const primary = search(origin, destination, preference);
  if (!primary) {
    return {
      journeys: [],
      error:
        "No public-transport connection found in the current dataset between these points. Try locations closer to a known bus stop or metro station.",
    };
  }
  const best = toJourney(primary, origin, destination);
  const journeys = [best];

  // alternatives: ban each used line once, plus other preferences
  const usedLines = best.legs.filter((l) => l.mode !== "walk" && l.line != null).map((l) => l.line as string);
  const seen = new Set([signature(best)]);
  const candidates: (Journey | null)[] = [];
  for (const line of net.lines.values()) {
    if (!usedLines.includes(line.name)) continue;
    const alt = search(origin, destination, preference, line.id);
    candidates.push(alt ? toJourney(alt, origin, destination) : null);
  }
  for (const p of ["fastest", "least_walk", "fewest_transfers"] as Preference[]) {
    if (p === preference) continue;
    const alt = search(origin, destination, p);
    candidates.push(alt ? toJourney(alt, origin, destination) : null);
  }
  for (const c of candidates) {
    if (!c) continue;
    const sig = signature(c);
    if (seen.has(sig)) continue;
    seen.add(sig);
    journeys.push(c);
  }
  return { journeys: journeys.slice(0, 4) };
}

function signature(j: Journey) {
  return j.legs.map((l) => `${l.mode}:${l.line ?? ""}:${l.from}>${l.to}`).join("|");
}

export interface SearchablePlace {
  id: string;
  name: string;
  lat: number;
  lon: number;
  modes: string[];
  routes: number;
}

export const searchablePlaces: SearchablePlace[] = net.placeList
  .map((p) => ({
    id: p.id,
    name: p.name,
    lat: p.lat,
    lon: p.lon,
    modes: [...p.modes],
    routes: p.routes.size,
  }))
  .sort((a, b) => a.name.localeCompare(b.name));

export function searchPlaces(q: string, limit = 8) {
  const s = q.toLowerCase().trim();
  if (!s) return [];
  return searchablePlaces
    .filter((p) => p.name.toLowerCase().includes(s))
    .sort((a, b) => {
      const ai = a.name.toLowerCase().startsWith(s) ? 0 : 1;
      const bi = b.name.toLowerCase().startsWith(s) ? 0 : 1;
      return ai - bi || a.name.length - b.name.length;
    })
    .slice(0, limit);
}

export const networkStats = {
  busRoutes: [...net.lines.values()].filter((l) => l.mode === "bus").length,
  metroLines: [...net.lines.values()].filter((l) => l.mode === "metro").length,
  places: net.placeList.length,
};

export const allLines = [...net.lines.values()].map((l) => ({
  id: l.id,
  name: l.name,
  mode: l.mode,
  points: l.points,
}));

/** All unique bus-stop places (for the optional overlay layer). */
export const busStops = searchablePlaces.filter((p) => p.modes.includes("bus"));

/** All unique metro-station places (for the optional overlay layer). */
export const metroStations = searchablePlaces.filter((p) => p.modes.includes("metro"));

/**
 * Takes a completed Journey (with straight-line walk legs) and enriches each
 * walk leg by calling the ORS foot-walking API to get the real road path.
 *
 * - Replaces `distanceM`, `timeMin`, and `path` on walk legs with ORS values.
 * - Falls back silently to the original haversine estimate on any API error.
 * - Transit legs are returned unchanged.
 * - All walk legs are fetched in parallel for speed.
 */
export async function enrichWalkLegs(
  journey: Journey,
  origin: LatLng,
  destination: LatLng,
): Promise<Journey> {
  const enriched = await Promise.all(
    journey.legs.map(async (leg): Promise<Leg> => {
      if (leg.mode !== "walk") return leg;

      // Determine real start/end coordinates for this walk leg
      const from =
        leg.path.length > 0
          ? leg.path[0]!
          : { lat: origin.lat, lon: origin.lon };
      const to =
        leg.path.length > 1
          ? leg.path[leg.path.length - 1]!
          : { lat: destination.lat, lon: destination.lon };

      const ors = await walkRoute(from, to);
      if (!ors) return leg; // fallback: keep original straight-line leg

      return {
        ...leg,
        distanceM: ors.distanceM,
        timeMin: ors.timeMin,
        path: ors.path,
      };
    }),
  );

  // Recompute journey-level totals from enriched legs
  return {
    ...journey,
    legs: enriched,
    totalDistanceM: enriched.reduce((s, l) => s + l.distanceM, 0),
    totalTimeMin: enriched.reduce((s, l) => s + l.timeMin, 0),
    walkDistanceM: enriched
      .filter((l) => l.mode === "walk")
      .reduce((s, l) => s + l.distanceM, 0),
  };
}
