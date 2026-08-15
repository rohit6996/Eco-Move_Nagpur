/**
 * OpenRouteService (ORS) API client — foot-walking profile, shortest path.
 *
 * Uses the POST /geojson endpoint for reliability and full geometry fidelity.
 * Docs: https://openrouteservice.org/dev/#/api-docs/v2/directions/{profile}/post
 * Free tier: 2,000 requests/day · 40 requests/minute
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
const cache = new Map<string, WalkRouteResult>();

function cacheKey(
  from: { lat: number; lon: number },
  to: { lat: number; lon: number },
): string {
  return `${from.lon.toFixed(5)},${from.lat.toFixed(5)}|${to.lon.toFixed(5)},${to.lat.toFixed(5)}`;
}

/**
 * Fetch the shortest pedestrian route from ORS (POST /geojson).
 * Returns null if the API is unavailable or quota is exceeded —
 * callers should fall back to the straight-line estimate in that case.
 */
export async function walkRoute(
  from: { lat: number; lon: number },
  to: { lat: number; lon: number },
): Promise<WalkRouteResult | null> {
  // Skip trivially short legs (< 30 m) — straight line is fine
  const dx = Math.abs(from.lat - to.lat) + Math.abs(from.lon - to.lon);
  if (dx < 0.0003) return null;

  const key = cacheKey(from, to);
  const cached = cache.get(key);
  if (cached) return cached;

  const apiKey = import.meta.env["VITE_ORS_API_KEY"] as string | undefined;
  if (!apiKey || apiKey === "your_ors_api_key_here") {
    console.warn("[ORS] No API key set in VITE_ORS_API_KEY — using straight-line walk estimate.");
    return null;
  }

  const body = {
    coordinates: [
      [from.lon, from.lat],
      [to.lon, to.lat],
    ],
    // "shortest" minimises total distance (not ORS's "recommended" heuristic)
    preference: "shortest",
    // Keep full geometry — don't simplify so the map path is accurate
    geometry_simplify: false,
    // Include distance + duration in the summary
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

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.warn(`[ORS] Request failed (${res.status}): ${text.slice(0, 200)}`);
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

    cache.set(key, result);
    return result;
  } catch (err) {
    console.warn("[ORS] Network error — falling back to straight-line:", err);
    return null;
  }
}

/**
 * Clears the in-memory route cache.
 * Useful in development / testing.
 */
export function clearWalkCache() {
  cache.clear();
}
