/**
 * OpenRouteService (ORS) API client - foot-walking profile, shortest path.
 *
 * Free tier: 2,000 requests/day, 40 requests/minute.
 * Includes rate-limit protection, persistent caching, and silent graceful fallback.
 */

export interface WalkRouteResult {
  /** Actual road distance in metres */
  distanceM: number;
  /** Actual walk duration in minutes */
  timeMin: number;
  /** Ordered polyline coords following real roads */
  path: { lat: number; lon: number }[];
}

const ORS_BASE = "https://api.openrouteservice.org/v2/directions/foot-walking/geojson";

/** In-memory cache: key = "lon1,lat1|lon2,lat2" */
const memoryCache = new Map<string, WalkRouteResult>();

/** Rate limit cooldown timestamp (ms) - stops spamming if 429 received */
let rateLimitCooldownUntil = 0;

function cacheKey(
  from: { lat: number; lon: number },
  to: { lat: number; lon: number },
): string {
  return `${from.lon.toFixed(5)},${from.lat.toFixed(5)}|${to.lon.toFixed(5)},${to.lat.toFixed(5)}`;
}

/** Try to get from localStorage cache if available */
function getPersistentCache(key: string): WalkRouteResult | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(`ors_${key}`);
    if (raw) return JSON.parse(raw);
  } catch {}
  return null;
}

/** Save to localStorage cache */
function setPersistentCache(key: string, result: WalkRouteResult) {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(`ors_${key}`, JSON.stringify(result));
  } catch {}
}

/**
 * Fetch the shortest pedestrian route from ORS (POST /geojson).
 * Returns null if the API is unavailable or quota is exceeded -
 * callers automatically fall back to the straight-line estimate.
 */
export async function walkRoute(
  from: { lat: number; lon: number },
  to: { lat: number; lon: number },
): Promise<WalkRouteResult | null> {
  // Skip trivially short legs (< 30 m) - straight line is fine
  const dx = Math.abs(from.lat - to.lat) + Math.abs(from.lon - to.lon);
  if (dx < 0.0003) return null;

  const key = cacheKey(from, to);
  
  // 1. Check in-memory cache
  const cachedMem = memoryCache.get(key);
  if (cachedMem) return cachedMem;

  // 2. Check localStorage cache
  const cachedLocal = getPersistentCache(key);
  if (cachedLocal) {
    memoryCache.set(key, cachedLocal);
    return cachedLocal;
  }

  // 3. If currently in 429 rate limit cooldown, quietly return null to use fallback
  if (Date.now() < rateLimitCooldownUntil) {
    return null;
  }

  const apiKey =
    (typeof import.meta !== "undefined" && (import.meta as any).env?.["VITE_ORS_API_KEY"]) ||
    (typeof process !== "undefined" && process.env?.["VITE_ORS_API_KEY"]) ||
    undefined;

  if (!apiKey || apiKey === "your_ors_api_key_here") {
    return null;
  }

  const body = {
    coordinates: [
      [from.lon, from.lat],
      [to.lon, to.lat],
    ],
    preference: "shortest",
    geometry_simplify: false,
    instructions: false,
  };

  try {
    const res = await fetch(ORS_BASE, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: apiKey,
      },
      body: JSON.stringify(body),
    });

    if (res.status === 429) {
      // Back off for 45 seconds on rate limit to protect API quota
      rateLimitCooldownUntil = Date.now() + 45000;
      console.info("[ORS] Rate limit hit (40 req/min). Temporarily using local road fallback for next 45s.");
      return null;
    }

    if (!res.ok) {
      return null;
    }

    const data = (await res.json()) as {
      features: Array<{
        geometry: { coordinates: [number, number][] };
        properties: { summary: { distance: number; duration: number } };
      }>;
    };

    const feature = data.features?.[0];
    if (!feature) return null;

    const { distance, duration } = feature.properties.summary;
    const coords = feature.geometry.coordinates; // [lon, lat] pairs

    const result: WalkRouteResult = {
      distanceM: distance,
      timeMin: duration / 60,
      path: coords.map(([lon, lat]) => ({ lat, lon })),
    };

    memoryCache.set(key, result);
    setPersistentCache(key, result);
    return result;
  } catch (err) {
    return null;
  }
}

/**
 * Clears the in-memory route cache.
 */
export function clearWalkCache() {
  memoryCache.clear();
}
