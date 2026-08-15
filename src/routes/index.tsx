import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import PlaceSearch, { type Point } from "@/components/PlaceSearch";
import { Button } from "@/components/ui/button";
import {
  ArrowRight,
  Bookmark,
  BookmarkCheck,
  Bus,
  Clock,
  Compass,
  Footprints,
  History,
  Info,
  Leaf,
  Loader2,
  LocateFixed,
  MapPin,
  Menu,
  Navigation2,
  Repeat,
  Route as RouteIcon,
  Smartphone,
  Sparkles,
  Timer,
  TrainFront,
  Trash2,
  X,
  Zap,
} from "lucide-react";
import {
  planJourney,
  enrichWalkLegs,
  networkStats,
  type Journey,
  type Preference,
  PARAMS,
} from "@/lib/routing";
import { findNearby, fmtNearbyDist, type NearbyStop, type NearbyResult } from "@/lib/nearby";

// MapView uses Leaflet which accesses `window` — must be client-only (no SSR)
const MapView = lazy(() =>
  import("@/components/MapView").then((m) => ({ default: m.default }))
);

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Nagpur Connect — Bus + Metro Journey Planner" },
      {
        name: "description",
        content:
          "Plan multimodal journeys across Nagpur with buses, metro and walking connections. Fastest, least-walk, fewest-transfer and low-CO2 routes on an interactive map.",
      },
      { property: "og:title", content: "Nagpur Connect — Bus + Metro Journey Planner" },
      {
        property: "og:description",
        content:
          "Graph-based last-mile public transport routing for Nagpur: walk, bus, metro and transfers in one plan.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Planner,
});

const PREFS: { id: Preference; label: string; icon: typeof Zap }[] = [
  { id: "balanced", label: "Best", icon: Sparkles },
  { id: "fastest", label: "Fastest", icon: Zap },
  { id: "least_walk", label: "Least walk", icon: Footprints },
  { id: "fewest_transfers", label: "Few transfers", icon: Repeat },
  { id: "low_co2", label: "Low CO₂", icon: Leaf },
];

const fmtDist = (m: number) => (m < 1000 ? `${Math.round(m / 10) * 10} m` : `${(m / 1000).toFixed(1)} km`);
const fmtTime = (min: number) => {
  const t = Math.round(min);
  return t < 60 ? `${t} min` : `${Math.floor(t / 60)} h ${t % 60} min`;
};

function ModeIcon({ mode, line, className = "size-3.5" }: { mode: string; line?: string | undefined; className?: string | undefined }) {
  if (mode === "bus") return <Bus className={className} />;
  if (mode === "metro") {
    const isBlue = (line ?? "").toLowerCase().includes("blue");
    const color = isBlue ? "#0088cc" : "#e05500";
    return <TrainFront className={className} style={{ color }} />;
  }
  return <Footprints className={className} />;
}

function ModeDot({ mode, line }: { mode: string; line?: string | undefined }) {
  let color = "bg-walk";
  if (mode === "bus") color = "bg-bus";
  else if (mode === "metro") {
    color = (line ?? "").toLowerCase().includes("blue") ? "bg-[#00aaff]" : "bg-[#ff6a00]";
  }
  return <span className={`size-3 shrink-0 rounded-full ring-4 ring-background ${color}`} />;
}

function JourneyCard({
  journey,
  active,
  onClick,
  index,
}: {
  journey: Journey;
  active: boolean;
  onClick: () => void;
  index: number;
}) {
  const [openFreq, setOpenFreq] = useState<number | null>(null);

  return (
    <div
      onClick={onClick}
      className={`cursor-pointer rounded-2xl border p-4 transition-all ${
        active
          ? "border-primary bg-primary/5 shadow-md ring-1 ring-primary/30"
          : "border-border bg-card hover:border-primary/40 hover:shadow-sm"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Option {index + 1}
          </span>
          <div className="mt-0.5 flex items-baseline gap-2">
            <span className="text-2xl font-bold tracking-tight text-foreground">
              {fmtTime(journey.totalTimeMin)}
            </span>
            <span className="text-xs text-muted-foreground">{fmtDist(journey.totalDistanceM)}</span>
          </div>
        </div>
        <div className="flex flex-col items-end gap-1">
          {journey.transfers === 0 ? (
            <span className="rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-xs font-medium text-emerald-700 dark:text-emerald-400">
              Direct
            </span>
          ) : (
            <span className="rounded-full bg-secondary px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
              {journey.transfers} transfer{journey.transfers > 1 ? "s" : ""}
            </span>
          )}
          <span className="text-[11px] text-muted-foreground">
            walk {fmtDist(journey.walkDistanceM)}
          </span>
        </div>
      </div>

      {/* Legs summary bar */}
      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        {journey.legs.map((leg, i) => {
          const isTransit = leg.mode === "bus" || leg.mode === "metro";
          const hasFreq = isTransit && (leg.frequencyMin ?? 0) > 0;
          const isOpen = openFreq === i;
          const isMetro = leg.mode === "metro";
          const isBlueMetro = isMetro && (leg.line ?? "").toLowerCase().includes("blue");
          const isOrangeMetro = isMetro && !isBlueMetro;

          return (
            <div key={i} className="relative flex items-center gap-1.5">
              {i > 0 && <ArrowRight className="size-3 text-muted-foreground" />}
              <span
                onClick={(e) => {
                  if (hasFreq) {
                    e.stopPropagation();
                    setOpenFreq((cur) => (cur === i ? null : i));
                  }
                }}
                className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium transition-colors ${
                  isBlueMetro
                    ? "border border-[#00aaff]/30 bg-[#00aaff]/15 text-[#0088cc] hover:bg-[#00aaff]/25"
                    : isOrangeMetro
                      ? "border border-[#ff6a00]/30 bg-[#ff6a00]/15 text-[#e05500] hover:bg-[#ff6a00]/25"
                      : leg.mode === "bus"
                        ? "border border-bus/30 bg-bus/15 text-bus hover:bg-bus/25"
                        : "bg-secondary text-muted-foreground"
                } ${hasFreq ? "cursor-pointer select-none" : ""}`}
                title={hasFreq ? "Click to view departure frequency" : undefined}
              >
                <ModeIcon mode={leg.mode} line={leg.line} />
                <span className="max-w-[110px] truncate">{leg.line ?? `${Math.round(leg.timeMin)}m`}</span>
                {hasFreq && (
                  <Timer className={`size-2.5 opacity-70 transition-transform ${isOpen ? "rotate-180" : ""}`} />
                )}
              </span>

              {/* Click-to-reveal Frequency Popover */}
              {isOpen && hasFreq && (
                <div
                  onClick={(e) => e.stopPropagation()}
                  className="absolute bottom-full left-1/2 z-50 mb-1.5 -translate-x-1/2 whitespace-nowrap rounded-lg border border-border bg-popover px-2.5 py-1.5 text-[11px] font-medium text-popover-foreground shadow-lg animate-in fade-in zoom-in-95"
                >
                  <div className="flex items-center gap-1 text-primary">
                    <Timer className="size-3" />
                    <span>Every ~{leg.frequencyMin} min</span>
                  </div>
                  <div className="text-[10px] text-muted-foreground">avg frequency</div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Itinerary({
  journey,
  origin,
  destination,
}: {
  journey: Journey;
  origin: string;
  destination: string;
}) {
  const [openStopsIndex, setOpenStopsIndex] = useState<number | null>(null);

  const getTheme = (leg: Journey["legs"][number]) => {
    if (leg.mode === "metro") {
      const isBlue = (leg.line ?? "").toLowerCase().includes("blue");
      if (isBlue) {
        return {
          dotBg: "bg-[#00aaff]",
          lineBg: "bg-[#00aaff]",
          borderColor: "#00aaff50",
          bgColor: "#00aaff0c",
          textColor: "#0088cc",
          Icon: TrainFront,
        };
      }
      return {
        dotBg: "bg-[#ff6a00]",
        lineBg: "bg-[#ff6a00]",
        borderColor: "#ff6a0050",
        bgColor: "#ff6a000c",
        textColor: "#e05500",
        Icon: TrainFront,
      };
    }
    if (leg.mode === "bus") {
      return {
        dotBg: "bg-[#0d9488]",
        lineBg: "bg-[#0d9488]",
        borderColor: "#0d948850",
        bgColor: "#0d94880c",
        textColor: "#0d9488",
        Icon: Bus,
      };
    }
    return {
      dotBg: "bg-[#64748b]",
      lineBg: "border-l-2 border-dashed border-slate-300 dark:border-slate-600",
      borderColor: "transparent",
      bgColor: "transparent",
      textColor: "#64748b",
      Icon: Footprints,
    };
  };

  return (
    <div className="relative pt-1">
      {/* ── 1. Origin Node ── */}
      <div className="relative pb-4 pl-7">
        {/* Continuous Connecting Line to Next Item */}
        <div className="absolute bottom-[-4px] left-[10px] top-3 w-0.5 border-l-2 border-dashed border-slate-300 dark:border-slate-600" />
        {/* Origin Dot */}
        <span className="absolute left-[5px] top-1 z-10 size-3 rounded-full bg-[#0f172a] ring-4 ring-background dark:bg-white" />
        <div className="text-xs font-bold text-foreground leading-tight">{origin}</div>
      </div>

      {/* ── 2. Journey Legs ── */}
      {journey.legs.map((leg, i) => {
        const theme = getTheme(leg);
        const Icon = theme.Icon;

        if (leg.mode === "walk") {
          return (
            <div key={i} className="relative pb-4 pl-7">
              {/* Continuous Dashed Line */}
              <div className="absolute bottom-[-4px] left-[10px] top-2 w-0.5 border-l-2 border-dashed border-slate-300 dark:border-slate-600" />
              {/* Walk Dot */}
              <span className="absolute left-[6px] top-1.5 z-10 size-2.5 rounded-full bg-[#64748b] ring-2 ring-background" />

              {/* Walk Text Row (Matching Image 2) */}
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Footprints className="size-3.5 shrink-0 text-slate-500" />
                <span className="font-bold text-foreground">Walk {fmtDist(leg.distanceM)}</span>
                <span>({Math.round(leg.timeMin)} min)</span>
                <span className="truncate">to {leg.to}</span>
              </div>
            </div>
          );
        }

        // Bus / Metro Transit Leg Card
        return (
          <div key={i} className="relative pb-4 pl-7">
            {/* Solid Colored Spine Line */}
            <div
              className={`absolute bottom-[-4px] left-[10px] top-2.5 w-0.5 ${theme.lineBg}`}
            />
            {/* Transit Step Colored Dot */}
            <span
              className={`absolute left-[4px] top-2 z-10 size-3.5 rounded-full ring-4 ring-background ${theme.dotBg}`}
            />

            {/* Transit Step Card (Matching Image 2) */}
            <div
              className="rounded-2xl border p-3.5 shadow-sm transition hover:shadow-md"
              style={{
                borderColor: theme.borderColor,
                backgroundColor: theme.bgColor,
              }}
            >
              {/* Row 1: Line Name & Icon (left) + Frequency (right) */}
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5">
                  <Icon className="size-4" style={{ color: theme.textColor }} />
                  <span className="text-xs font-bold" style={{ color: theme.textColor }}>
                    {leg.line ?? leg.mode}
                  </span>
                </div>
                {leg.frequencyMin && (
                  <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                    <Timer className="size-3" />
                    <span>every {leg.frequencyMin} min</span>
                  </span>
                )}
              </div>

              {/* Row 2: Board at ... Get down at ... */}
              <p className="mt-2 text-xs text-foreground leading-relaxed">
                <span className="text-muted-foreground">Board at </span>
                <span className="font-bold">{leg.from}</span>
                <span className="text-muted-foreground"> · Get down at </span>
                <span className="font-bold">{leg.to}</span>
              </p>

              {/* Row 3: Stops count · Distance · Time */}
              <div className="mt-1 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                {leg.stops && leg.stops.length > 1 && (
                  <>
                    <span>{leg.stops.length - 1} stops</span>
                    <span>·</span>
                  </>
                )}
                <span>{fmtDist(leg.distanceM)}</span>
                <span>·</span>
                <span>{Math.round(leg.timeMin)} min</span>
              </div>

              {/* Row 4: Intermediate Stops Collapsible */}
              {leg.stops && leg.stops.length > 2 && (
                <div className="mt-2 border-t border-border/40 pt-1.5">
                  <button
                    type="button"
                    onClick={() => setOpenStopsIndex((prev) => (prev === i ? null : i))}
                    className="flex items-center gap-1 text-[11px] font-bold transition hover:underline"
                    style={{ color: theme.textColor }}
                  >
                    <span className="text-[9px]">{openStopsIndex === i ? "▼" : "▶"}</span>
                    <span>{openStopsIndex === i ? "Hide intermediate stops" : "Show intermediate stops"}</span>
                  </button>

                  {openStopsIndex === i && (
                    <ul className="mt-1.5 space-y-0.5 border-l-2 pl-2.5 text-[11px] text-muted-foreground animate-in fade-in duration-200"
                      style={{ borderColor: theme.borderColor }}
                    >
                      {leg.stops.slice(1, -1).map((s, idx) => (
                        <li key={idx} className="py-0.5">• {s}</li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>
          </div>
        );
      })}

      {/* ── 3. Destination Node ── */}
      <div className="relative pl-7">
        {/* Destination Red Dot */}
        <span className="absolute left-[4px] top-0.5 z-10 size-3.5 rounded-full bg-[#dc2626] ring-4 ring-background" />
        <div className="text-xs font-bold text-foreground leading-tight">{destination}</div>
      </div>
    </div>
  );
}

// ─── Google Maps Saved Places & Popular Routes ──────────────────────────────

interface SavedPlaceItem {
  id: string;
  name: string;
  category: string;
  desc: string;
  lat: number;
  lon: number;
  iconText: string;
  iconBg: string;
}

const POPULAR_SAVED_PLACES: SavedPlaceItem[] = [
  {
    id: "sitabuldi",
    name: "Sitabuldi Interchange",
    category: "Metro & Bus Terminal",
    desc: "Central interchange connecting Blue & Orange lines",
    lat: 21.1414,
    lon: 79.0825,
    iconText: "ST",
    iconBg: "bg-blue-600",
  },
  {
    id: "airport",
    name: "Dr. Babasaheb Ambedkar Airport",
    category: "Airport & Metro Station",
    desc: "Nagpur International Airport on Wardha Road",
    lat: 21.0864,
    lon: 79.0638,
    iconText: "AIR",
    iconBg: "bg-amber-600",
  },
  {
    id: "railway-station",
    name: "Nagpur Railway Station",
    category: "Main Railway Junction",
    desc: "Central railway hub with metro access",
    lat: 21.1528,
    lon: 79.0886,
    iconText: "NGP",
    iconBg: "bg-emerald-600",
  },
  {
    id: "futala",
    name: "Futala Lake Waterfront",
    category: "Lake & Recreation",
    desc: "Iconic recreational promenade in West Nagpur",
    lat: 21.1542,
    lon: 79.0435,
    iconText: "FUT",
    iconBg: "bg-cyan-600",
  },
  {
    id: "dharampeth",
    name: "Dharampeth Market",
    category: "Shopping & Dining",
    desc: "Major commercial hub with transit access",
    lat: 21.1418,
    lon: 79.0601,
    iconText: "DHP",
    iconBg: "bg-purple-600",
  },
  {
    id: "dream-valley",
    name: "Dream Valley Resort",
    category: "Hingna Destination",
    desc: "Popular destination spot in Hingna, Digdoh",
    lat: 21.1006,
    lon: 78.9903,
    iconText: "DVR",
    iconBg: "bg-teal-600",
  },
  {
    id: "indira-maidan",
    name: "Indira Maidan",
    category: "Public Sports Ground",
    desc: "Cultural & sports ground in East Nagpur",
    lat: 21.1480,
    lon: 79.1250,
    iconText: "IND",
    iconBg: "bg-rose-600",
  },
];

interface PopularRoutePreset {
  id: string;
  title: string;
  badge: string;
  from: { name: string; lat: number; lon: number };
  to: { name: string; lat: number; lon: number };
}

const POPULAR_ROUTE_PRESETS: PopularRoutePreset[] = [
  {
    id: "sitabuldi-airport",
    title: "Sitabuldi ⇄ Airport",
    badge: "Metro (Orange Line)",
    from: { name: "Sitabuldi (Interchange)", lat: 21.1414, lon: 79.0825 },
    to: { name: "Airport", lat: 21.0864, lon: 79.0638 },
  },
  {
    id: "pardi-jaitala",
    title: "Pardi ⇄ Jaitala",
    badge: "Bus Route 72B",
    from: { name: "Pardi", lat: 21.1497, lon: 79.1578 },
    to: { name: "Jaitala", lat: 21.1012, lon: 79.0256 },
  },
  {
    id: "dharampeth-prajapati",
    title: "Dharampeth ⇄ Prajapati Nagar",
    badge: "Metro (Blue Line)",
    from: { name: "Dharampeth College", lat: 21.1395, lon: 79.0558 },
    to: { name: "Prajapati Nagar", lat: 21.1503, lon: 79.1490 },
  },
];

interface SavedJourneyItem {
  id: string;
  savedAt: number;
  origin: Point;
  destination: Point;
  preference: Preference;
  totalTimeMin: number;
  totalDistanceM: number;
  transfers: number;
  walkDistanceM: number;
  co2g: number;
  legs: { mode: string; line?: string | undefined; timeMin: number }[];
}

// ─────────────────────────────────────────────────────────────────────────────

function Planner() {
  const [origin, setOrigin] = useState<Point | null>(null);
  const [destination, setDestination] = useState<Point | null>(null);
  const [pref, setPref] = useState<Preference>("balanced");
  const [picking, setPicking] = useState<"origin" | "destination" | null>(null);
  const [showNetwork, setShowNetwork] = useState(true);
  const [showBusStops, setShowBusStops] = useState(false);
  const [showMetroStations, setShowMetroStations] = useState(false);
  const [selected, setSelected] = useState(0);
  const [result, setResult] = useState<{ journeys: Journey[]; error?: string } | null>(null);
  const [enriching, setEnriching] = useState(false);
  const [locating, setLocating] = useState(false);
  const [locError, setLocError] = useState<string | null>(null);

  // Saved Custom Journeys list
  const [savedJourneys, setSavedJourneys] = useState<SavedJourneyItem[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      const raw = localStorage.getItem("nagpur_connect_saved_journeys");
      return raw ? (JSON.parse(raw) as SavedJourneyItem[]) : [];
    } catch {
      return [];
    }
  });

  const saveJourneysList = (items: SavedJourneyItem[]) => {
    setSavedJourneys(items);
    try {
      localStorage.setItem("nagpur_connect_saved_journeys", JSON.stringify(items));
    } catch {
      // ignore
    }
  };

  // Google Maps Style Navigation Rail state
  const [cardOpen, setCardOpen] = useState(true);
  const [activeRailItem, setActiveRailItem] = useState<"nearby" | "directions" | "saved" | "recents" | "stats">("directions");

  // Nearby Transit state
  const [nearbyRadiusM, setNearbyRadiusM] = useState(2500);
  const [nearbyAnchor, setNearbyAnchor] = useState<{ lat: number; lon: number; name: string } | null>(null);
  const [nearbyLocating, setNearbyLocating] = useState(false);
  const [nearbyLocError, setNearbyLocError] = useState<string | null>(null);

  const nearbyResults = useMemo<NearbyResult>(
    () => (nearbyAnchor ? findNearby(nearbyAnchor, nearbyRadiusM) : { busStops: [], metroStations: [] }),
    [nearbyAnchor, nearbyRadiusM],
  );
  const nearbyMarkers = useMemo(
    () => [...nearbyResults.busStops, ...nearbyResults.metroStations],
    [nearbyResults],
  );

  // Guard: Leaflet requires the browser DOM — never render the map during SSR
  const [isMounted, setIsMounted] = useState(false);
  useEffect(() => setIsMounted(true), []);

  const useCurrentLocation = (target: "origin" | "destination" = "origin") => {
    if (!navigator.geolocation) {
      setLocError("Geolocation is not supported by your browser.");
      return;
    }
    setLocating(true);
    setLocError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const point: Point = {
          lat: pos.coords.latitude,
          lon: pos.coords.longitude,
          name: "Your location",
        };
        if (target === "origin") {
          setOrigin(point);
        } else {
          setDestination(point);
        }
        setPicking(null);
        setLocating(false);
      },
      (err) => {
        setLocating(false);
        if (err.code === err.PERMISSION_DENIED) {
          setLocError("Location access denied. Please allow it in your browser settings.");
        } else if (err.code === err.POSITION_UNAVAILABLE) {
          setLocError("Location unavailable. Try again or search manually.");
        } else {
          setLocError("Could not get your location. Please try again.");
        }
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  };

  /** Plan a journey with Dijkstra + ORS walk path enrichment */
  const plan = async (overrideOrigin?: Point, overrideDestination?: Point) => {
    const o = overrideOrigin ?? origin;
    const d = overrideDestination ?? destination;
    if (!o || !d) return;
    setSelected(0);
    setEnriching(false);

    // Step 1: run synchronous Dijkstra — instant results
    const raw = planJourney(o, d, pref);
    setResult(raw);

    if (!raw.journeys.length) return;

    // Step 2: enrich walk legs with real ORS road paths
    setEnriching(true);
    try {
      const enriched = await Promise.all(
        raw.journeys.map((j) => enrichWalkLegs(j, o, d)),
      );
      setResult({ ...raw, journeys: enriched });
    } finally {
      setEnriching(false);
    }
  };

  /** Triggered by "Navigate / Go" in Nearby panel */
  const handleNavigateToNearby = (stop: NearbyStop) => {
    if (!nearbyAnchor) return;
    const newOrigin: Point = { lat: nearbyAnchor.lat, lon: nearbyAnchor.lon, name: nearbyAnchor.name };
    const newDest: Point = { lat: stop.lat, lon: stop.lon, name: stop.name };
    setOrigin(newOrigin);
    setDestination(newDest);
    setActiveRailItem("directions");
    setCardOpen(true);
    setResult(null);
    plan(newOrigin, newDest);
  };

  /** Handle selecting a saved landmark */
  const handleSelectSavedPlace = (place: SavedPlaceItem, mode: "nearby" | "origin" | "destination") => {
    const point: Point = { lat: place.lat, lon: place.lon, name: place.name };
    if (mode === "nearby") {
      setNearbyAnchor(point);
      setActiveRailItem("nearby");
      setCardOpen(true);
    } else if (mode === "origin") {
      setOrigin(point);
      setActiveRailItem("directions");
      setCardOpen(true);
    } else {
      setDestination(point);
      setActiveRailItem("directions");
      setCardOpen(true);
    }
  };

  /** Handle selecting a preset commuter route */
  const handleSelectRoutePreset = (preset: PopularRoutePreset) => {
    setOrigin(preset.from);
    setDestination(preset.to);
    setActiveRailItem("directions");
    setCardOpen(true);
    setResult(null);
    plan(preset.from, preset.to);
  };

  /** Acquire GPS for the nearby anchor */
  const useLocationForNearby = () => {
    if (!navigator.geolocation) {
      setNearbyLocError("Geolocation not supported by your browser.");
      return;
    }
    setNearbyLocating(true);
    setNearbyLocError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setNearbyAnchor({ lat: pos.coords.latitude, lon: pos.coords.longitude, name: "Your location" });
        setNearbyLocating(false);
      },
      () => {
        setNearbyLocating(false);
        setNearbyLocError("Could not get your location. Try tapping the map instead.");
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  };

  const journey = useMemo(() => result?.journeys[selected] ?? null, [result, selected]);

  const isCurrentJourneySaved = useMemo(() => {
    if (!origin || !destination || !journey) return false;
    return savedJourneys.some(
      (s) =>
        s.origin.name === origin.name &&
        s.destination.name === destination.name &&
        Math.abs(s.totalTimeMin - journey.totalTimeMin) < 0.1,
    );
  }, [savedJourneys, origin, destination, journey]);

  const toggleSaveCurrentJourney = () => {
    if (!origin || !destination || !journey) return;
    if (isCurrentJourneySaved) {
      const filtered = savedJourneys.filter(
        (s) =>
          !(
            s.origin.name === origin.name &&
            s.destination.name === destination.name &&
            Math.abs(s.totalTimeMin - journey.totalTimeMin) < 0.1
          ),
      );
      saveJourneysList(filtered);
    } else {
      const newItem: SavedJourneyItem = {
        id: `saved_${Date.now()}`,
        savedAt: Date.now(),
        origin,
        destination,
        preference: pref,
        totalTimeMin: journey.totalTimeMin,
        totalDistanceM: journey.totalDistanceM,
        transfers: journey.transfers,
        walkDistanceM: journey.walkDistanceM,
        co2g: journey.co2g,
        legs: journey.legs.map((l) => ({
          mode: l.mode,
          line: l.line,
          timeMin: l.timeMin,
        })),
      };
      saveJourneysList([newItem, ...savedJourneys]);
    }
  };

  const removeSavedJourney = (id: string) => {
    saveJourneysList(savedJourneys.filter((s) => s.id !== id));
  };

  const handleSelectSavedJourney = (item: SavedJourneyItem) => {
    setOrigin(item.origin);
    setDestination(item.destination);
    setPref(item.preference);
    setActiveRailItem("directions");
    setCardOpen(true);
    setResult(null);
    void plan(item.origin, item.destination);
  };

  const handleMapClick = (p: { lat: number; lon: number }) => {
    // In nearby mode, map click updates search anchor
    if (cardOpen && activeRailItem === "nearby") {
      setNearbyAnchor({ ...p, name: `${p.lat.toFixed(4)}, ${p.lon.toFixed(4)}` });
      return;
    }
    if (!picking) return;
    const point = { ...p, name: `Pin ${p.lat.toFixed(4)}, ${p.lon.toFixed(4)}` };
    if (picking === "origin") setOrigin(point);
    else setDestination(point);
    setPicking(null);
  };

  const swap = () => {
    setOrigin(destination);
    setDestination(origin);
  };

  // Press Escape to cancel map-pin picking mode
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPicking(null);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const handleRailClick = (item: "nearby" | "directions" | "saved" | "recents" | "stats") => {
    if (activeRailItem === item && cardOpen) {
      // Toggle card if clicking active
      setCardOpen(false);
    } else {
      setActiveRailItem(item);
      setCardOpen(true);
    }
  };

  return (
    <main className="relative flex h-screen w-screen overflow-hidden bg-background">
      {/* ── 1. GOOGLE MAPS VERTICAL ICON RAIL (FAR LEFT) ── */}
      <aside className="z-[1002] flex h-screen w-18 shrink-0 flex-col items-center border-r border-border bg-white py-3 shadow-md dark:bg-card">
        {/* Top Hamburger Menu Button */}
        <button
          onClick={() => setCardOpen((prev) => !prev)}
          className={`flex size-11 items-center justify-center rounded-2xl transition hover:bg-secondary active:scale-95 ${
            cardOpen ? "text-primary" : "text-foreground"
          }`}
          title={cardOpen ? "Collapse card" : "Open card"}
        >
          <Menu className="size-5" />
        </button>

        {/* Vertical Feature Buttons */}
        <div className="mt-4 flex flex-col items-center gap-4">
          {/* Directions Button */}
          <button
            onClick={() => handleRailClick("directions")}
            className={`group flex flex-col items-center gap-1 text-[10px] font-medium transition ${
              activeRailItem === "directions" && cardOpen
                ? "text-primary"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <div
              className={`flex size-10 items-center justify-center rounded-2xl transition ${
                activeRailItem === "directions" && cardOpen
                  ? "bg-primary text-primary-foreground shadow-md ring-2 ring-primary/30"
                  : "bg-secondary/60 group-hover:bg-secondary group-hover:shadow-sm"
              }`}
            >
              <RouteIcon className="size-5" />
            </div>
            <span>Routes</span>
          </button>

          {/* Nearby Transit Button (Google Maps 'Ask Maps' / Transit style) */}
          <button
            onClick={() => handleRailClick("nearby")}
            className={`group flex flex-col items-center gap-1 text-[10px] font-medium transition ${
              activeRailItem === "nearby" && cardOpen
                ? "text-primary"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <div
              className={`flex size-10 items-center justify-center rounded-2xl transition ${
                activeRailItem === "nearby" && cardOpen
                  ? "bg-primary text-primary-foreground shadow-md ring-2 ring-primary/30"
                  : "bg-secondary/60 group-hover:bg-secondary group-hover:shadow-sm"
              }`}
            >
              <Compass className="size-5" />
            </div>
            <span>Nearby</span>
          </button>

          {/* Saved Places Button */}
          <button
            onClick={() => handleRailClick("saved")}
            className={`group flex flex-col items-center gap-1 text-[10px] font-medium transition ${
              activeRailItem === "saved" && cardOpen
                ? "text-primary"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <div
              className={`flex size-10 items-center justify-center rounded-2xl transition ${
                activeRailItem === "saved" && cardOpen
                  ? "bg-primary text-primary-foreground shadow-md ring-2 ring-primary/30"
                  : "bg-secondary/60 group-hover:bg-secondary group-hover:shadow-sm"
              }`}
            >
              <Bookmark className="size-5" />
            </div>
            <span>Saved</span>
          </button>

          {/* Recents Button */}
          <button
            onClick={() => handleRailClick("recents")}
            className={`group flex flex-col items-center gap-1 text-[10px] font-medium transition ${
              activeRailItem === "recents" && cardOpen
                ? "text-primary"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <div
              className={`flex size-10 items-center justify-center rounded-2xl transition ${
                activeRailItem === "recents" && cardOpen
                  ? "bg-primary text-primary-foreground shadow-md ring-2 ring-primary/30"
                  : "bg-secondary/60 group-hover:bg-secondary group-hover:shadow-sm"
              }`}
            >
              <History className="size-5" />
            </div>
            <span>Recents</span>
          </button>

          {/* Transit Stats Button */}
          <button
            onClick={() => handleRailClick("stats")}
            className={`group flex flex-col items-center gap-1 text-[10px] font-medium transition ${
              activeRailItem === "stats" && cardOpen
                ? "text-primary"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <div
              className={`flex size-10 items-center justify-center rounded-2xl transition ${
                activeRailItem === "stats" && cardOpen
                  ? "bg-primary text-primary-foreground shadow-md ring-2 ring-primary/30"
                  : "bg-secondary/60 group-hover:bg-secondary group-hover:shadow-sm"
              }`}
            >
              <Sparkles className="size-5" />
            </div>
            <span>Network</span>
          </button>
        </div>

        {/* Divider */}
        <div className="my-3 w-8 border-t border-border" />

        {/* Quick Shortcut Thumbnail Chips (Nagpur Landmarks) */}
        <div className="flex flex-1 flex-col items-center gap-3 overflow-y-auto py-1">
          {POPULAR_SAVED_PLACES.slice(0, 3).map((place) => (
            <button
              key={place.id}
              onClick={() => handleSelectSavedPlace(place, "nearby")}
              className="group flex flex-col items-center gap-1"
              title={`Explore ${place.name}`}
            >
              <div
                className={`flex size-9 items-center justify-center rounded-xl text-[10px] font-bold text-white shadow-sm transition group-hover:scale-105 ${place.iconBg}`}
              >
                {place.iconText}
              </div>
              <span className="max-w-[54px] truncate text-[9px] font-medium text-muted-foreground group-hover:text-foreground">
                {place.name.split(" ")[0]}
              </span>
            </button>
          ))}
        </div>

        {/* Bottom App Badge */}
        <div className="flex flex-col items-center text-[9px] text-muted-foreground">
          <Smartphone className="size-3.5" />
          <span className="mt-0.5">Nagpur</span>
        </div>
      </aside>

      {/* ── 2. GOOGLE MAPS FLOATING / DOCKED WHITE CARD ── */}
      {cardOpen && (
        <section className="absolute left-20 top-3 z-[1001] flex h-[calc(100vh-24px)] w-[390px] flex-col overflow-hidden rounded-3xl border border-border/60 bg-white/95 shadow-2xl backdrop-blur-md transition-all duration-300 dark:bg-card/95 sm:w-[420px]">
          {/* Top Mode Bar */}
          <header className="flex items-center justify-between border-b border-border bg-gradient-to-r from-primary/5 via-card to-card px-4 py-3">
            <div className="flex items-center gap-2">
              <span className="flex size-7 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
                {activeRailItem === "nearby" ? (
                  <Compass className="size-4" />
                ) : activeRailItem === "saved" ? (
                  <Bookmark className="size-4" />
                ) : activeRailItem === "recents" ? (
                  <History className="size-4" />
                ) : activeRailItem === "stats" ? (
                  <Sparkles className="size-4" />
                ) : (
                  <RouteIcon className="size-4" />
                )}
              </span>
              <div>
                <h1 className="text-sm font-bold tracking-tight text-foreground">
                  {activeRailItem === "nearby"
                    ? "Nearby Transit"
                    : activeRailItem === "saved"
                      ? "Saved Places"
                      : activeRailItem === "recents"
                        ? "Commuter Routes"
                        : activeRailItem === "stats"
                          ? "Nagpur Network"
                          : "Route Planner"}
                </h1>
                <p className="text-[10px] text-muted-foreground">
                  {activeRailItem === "nearby"
                    ? "Bus stops & Metro within coverage radius"
                    : activeRailItem === "saved"
                      ? "Popular destinations in Nagpur"
                      : activeRailItem === "recents"
                        ? "Instant 1-click commuter trips"
                        : activeRailItem === "stats"
                          ? "Metro & Bus multimodal stats"
                          : "Multimodal Bus + Metro itinerary"}
                </p>
              </div>
            </div>
            <button
              onClick={() => setCardOpen(false)}
              className="rounded-xl p-1.5 text-muted-foreground transition hover:bg-secondary hover:text-foreground"
              title="Close card"
            >
              <X className="size-4" />
            </button>
          </header>

          {/* Card Body by Selected Feature */}
          <div className="flex-1 overflow-y-auto p-4">
            {/* ── FEATURE 1: NEARBY TRANSIT ── */}
            {activeRailItem === "nearby" && (
              <div className="space-y-3.5">
                {/* Radius Filter Pills */}
                <div className="flex items-center justify-between rounded-2xl border border-border bg-secondary/30 p-2">
                  <span className="text-[11px] font-semibold text-muted-foreground">Search Radius:</span>
                  <div className="flex gap-1.5">
                    {[1000, 2500, 5000].map((r) => (
                      <button
                        key={r}
                        onClick={() => setNearbyRadiusM(r)}
                        className={`rounded-xl px-2.5 py-1 text-xs font-bold transition ${
                          nearbyRadiusM === r
                            ? "bg-primary text-primary-foreground shadow-sm"
                            : "bg-white text-muted-foreground hover:bg-secondary dark:bg-card"
                        }`}
                      >
                        {r >= 1000 ? `${r / 1000} km` : `${r} m`}
                      </button>
                    ))}
                  </div>
                </div>

                {/* If No Anchor: GPS & Map Tap */}
                {!nearbyAnchor && (
                  <div className="space-y-2.5">
                    <button
                      onClick={useLocationForNearby}
                      disabled={nearbyLocating}
                      className="flex w-full items-center justify-center gap-2.5 rounded-2xl border border-primary/30 bg-primary/5 px-4 py-3 text-sm font-semibold text-primary transition hover:bg-primary/10 disabled:opacity-60"
                    >
                      {nearbyLocating ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <LocateFixed className="size-4" />
                      )}
                      {nearbyLocating ? "Getting current location…" : "Use my current location"}
                    </button>

                    {nearbyLocError && (
                      <p className="rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
                        {nearbyLocError}
                      </p>
                    )}

                    <div className="flex items-center gap-2">
                      <span className="h-px flex-1 bg-border" />
                      <span className="text-[10px] uppercase tracking-wider text-muted-foreground">or tap map</span>
                      <span className="h-px flex-1 bg-border" />
                    </div>

                    <div className="flex items-start gap-2.5 rounded-2xl border border-border bg-secondary/30 p-3.5 text-xs text-muted-foreground">
                      <MapPin className="mt-0.5 size-4 shrink-0 text-[#7c3aed]" />
                      <div>
                        <p className="font-semibold text-foreground">Click anywhere on the map</p>
                        <p className="mt-0.5 text-[11px]">
                          A purple anchor and {nearbyRadiusM >= 1000 ? `${nearbyRadiusM / 1000} km` : `${nearbyRadiusM} m`} search radius circle will be drawn around your point!
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {/* If Anchor is Set: Results */}
                {nearbyAnchor && (
                  <div className="space-y-3">
                    {/* Selected Location Badge */}
                    <div className="flex items-center justify-between rounded-2xl border border-[#7c3aed]/30 bg-[#7c3aed]/10 px-3.5 py-2.5">
                      <div className="flex min-w-0 items-center gap-2 text-xs font-semibold text-[#7c3aed]">
                        <MapPin className="size-4 shrink-0" />
                        <span className="truncate">{nearbyAnchor.name}</span>
                        <span className="rounded-md bg-[#7c3aed]/20 px-1.5 py-0.5 text-[10px]">
                          {nearbyRadiusM >= 1000 ? `${nearbyRadiusM / 1000} km` : `${nearbyRadiusM} m`} radius
                        </span>
                      </div>
                      <button
                        onClick={() => {
                          setNearbyAnchor(null);
                          setNearbyLocError(null);
                        }}
                        title="Change location"
                        className="ml-2 shrink-0 rounded-md p-1 text-[#7c3aed] transition hover:bg-[#7c3aed]/20"
                      >
                        <X className="size-3.5" />
                      </button>
                    </div>

                    {/* Empty State */}
                    {nearbyResults.busStops.length === 0 && nearbyResults.metroStations.length === 0 && (
                      <div className="rounded-2xl border border-dashed border-border p-6 text-center">
                        <Navigation2 className="mx-auto size-6 text-muted-foreground/50" />
                        <p className="mt-2 text-sm font-medium text-muted-foreground">No stops found in this radius</p>
                        <p className="mt-1 text-xs text-muted-foreground">Try expanding to 5 km or tapping another location</p>
                      </div>
                    )}

                    {/* Nearest Bus Stops */}
                    {nearbyResults.busStops.length > 0 && (
                      <section>
                        <div className="mb-2 flex items-center justify-between text-[11px] font-bold uppercase tracking-wider text-bus">
                          <span className="flex items-center gap-1.5">
                            <Bus className="size-3.5" /> Bus Stops ({nearbyResults.busStops.length})
                          </span>
                          <span className="text-[10px] text-muted-foreground lowercase">sorted by distance</span>
                        </div>
                        <div className="space-y-1.5">
                          {nearbyResults.busStops.map((s) => (
                            <div
                              key={s.id}
                              className="flex items-center justify-between rounded-2xl border border-bus/20 bg-bus/5 p-3 transition hover:border-bus/40 hover:bg-bus/10"
                            >
                              <div className="min-w-0 flex-1">
                                <p className="truncate text-xs font-semibold text-foreground">{s.name}</p>
                                <p className="mt-1 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                                  <Footprints className="size-3 shrink-0" />
                                  <span className="font-medium text-foreground">{fmtNearbyDist(s.distM)}</span>
                                  <span>•</span>
                                  <span>{s.walkMin} min walk</span>
                                </p>
                              </div>
                              <button
                                onClick={() => handleNavigateToNearby(s)}
                                className="ml-2 flex shrink-0 items-center gap-1 rounded-xl bg-bus px-3 py-1.5 text-xs font-bold text-white shadow-sm transition hover:bg-bus/90 active:scale-95"
                                title="Navigate from Selected Location to this Bus Stop"
                              >
                                <ArrowRight className="size-3" /> Go
                              </button>
                            </div>
                          ))}
                        </div>
                      </section>
                    )}

                    {/* Nearest Metro Stations */}
                    {nearbyResults.metroStations.length > 0 && (
                      <section>
                        <div className="mb-2 flex items-center justify-between text-[11px] font-bold uppercase tracking-wider text-metro">
                          <span className="flex items-center gap-1.5">
                            <TrainFront className="size-3.5" /> Metro Stations ({nearbyResults.metroStations.length})
                          </span>
                          <span className="text-[10px] text-muted-foreground lowercase">sorted by distance</span>
                        </div>
                        <div className="space-y-1.5">
                          {nearbyResults.metroStations.map((s) => (
                            <div
                              key={s.id}
                              className="flex items-center justify-between rounded-2xl border border-metro/20 bg-metro/5 p-3 transition hover:border-metro/40 hover:bg-metro/10"
                            >
                              <div className="min-w-0 flex-1">
                                <p className="truncate text-xs font-semibold text-foreground">{s.name}</p>
                                <div className="mt-1 flex items-center gap-1.5">
                                  {s.lineName && (
                                    <span
                                      className="rounded px-1.5 py-0.5 text-[9px] font-bold uppercase"
                                      style={{
                                        backgroundColor: s.lineName.includes("Blue") ? "#00aaff20" : "#ff6a0020",
                                        color: s.lineName.includes("Blue") ? "#0088cc" : "#e05500",
                                      }}
                                    >
                                      {s.lineName}
                                    </span>
                                  )}
                                  <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
                                    <Footprints className="size-3 shrink-0" />
                                    <span className="font-medium text-foreground">{fmtNearbyDist(s.distM)}</span>
                                    <span>•</span>
                                    <span>{s.walkMin} min walk</span>
                                  </p>
                                </div>
                              </div>
                              <button
                                onClick={() => handleNavigateToNearby(s)}
                                className="ml-2 flex shrink-0 items-center gap-1 rounded-xl bg-metro px-3 py-1.5 text-xs font-bold text-white shadow-sm transition hover:bg-metro/90 active:scale-95"
                                title="Navigate from Selected Location to this Metro Station"
                              >
                                <ArrowRight className="size-3" /> Go
                              </button>
                            </div>
                          ))}
                        </div>
                      </section>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* ── FEATURE 2: ROUTE PLANNER / DIRECTIONS ── */}
            {activeRailItem === "directions" && (
              <div className="space-y-4">
                {/* Search Inputs (Google Maps 2-Row Connected Search Style) */}
                <div className="relative rounded-2xl border border-border/80 bg-secondary/20 p-3 shadow-inner">
                  {/* Connected Dots Decorator */}
                  <div className="pointer-events-none absolute left-6 top-8 flex flex-col items-center">
                    <span className="size-2.5 rounded-full border-2 border-primary bg-white" />
                    <span className="my-1 h-8 w-0.5 bg-border" />
                    <span className="size-2.5 rounded-full bg-destructive" />
                  </div>

                  <div className="space-y-2.5 pl-7">
                    <PlaceSearch
                      label="Source"
                      placeholder="Choose starting point or GPS"
                      value={origin}
                      onChange={setOrigin}
                      dot="bg-primary"
                      isPickingMap={picking === "origin"}
                      onFocus={() => setPicking("origin")}
                      onLocate={() => useCurrentLocation("origin")}
                      locating={locating}
                    />

                    <PlaceSearch
                      label="Destination"
                      placeholder="Choose destination or tap map"
                      value={destination}
                      onChange={setDestination}
                      dot="bg-destructive"
                      isPickingMap={picking === "destination"}
                      onFocus={() => setPicking("destination")}
                      onLocate={() => useCurrentLocation("destination")}
                      locating={locating}
                    />
                  </div>

                  {/* Swap Button */}
                  <button
                    type="button"
                    onClick={swap}
                    title="Swap origin and destination"
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 rounded-xl border border-border bg-white p-2 text-muted-foreground shadow-sm transition hover:bg-secondary hover:text-foreground active:scale-95 dark:bg-card"
                  >
                    <Repeat className="size-4 rotate-90" />
                  </button>
                </div>

                {locError && (
                  <p className="rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
                    {locError}
                  </p>
                )}

                {/* Preference Mode Pills (Google Maps Transport Modes Style) */}
                <div className="flex flex-wrap gap-1.5">
                  {PREFS.map((p) => {
                    const Icon = p.icon;
                    const active = pref === p.id;
                    return (
                      <button
                        key={p.id}
                        onClick={() => {
                          setPref(p.id);
                          if (origin && destination) void plan();
                        }}
                        className={`flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-semibold transition-all ${
                          active
                            ? "border-primary bg-primary text-primary-foreground shadow-sm"
                            : "border-border bg-white text-muted-foreground hover:border-primary/40 hover:text-foreground dark:bg-card"
                        }`}
                      >
                        <Icon className="size-3.5" />
                        {p.label}
                      </button>
                    );
                  })}
                </div>

                {/* Plan Button & Save Route Button */}
                <div className="flex flex-col gap-2">
                  <Button
                    className="w-full rounded-2xl shadow-md"
                    onClick={() => void plan()}
                    disabled={!origin || !destination}
                  >
                    <RouteIcon className="size-4" /> Plan journey
                  </Button>

                  {/* ── Save Journey to Favorites Button ── */}
                  <button
                    type="button"
                    onClick={toggleSaveCurrentJourney}
                    disabled={!journey}
                    className={`flex w-full items-center justify-center gap-2 rounded-2xl border px-3.5 py-2.5 text-xs font-bold transition-all shadow-sm active:scale-95 ${
                      !journey
                        ? "cursor-not-allowed border-border/60 bg-secondary/30 text-muted-foreground opacity-50"
                        : isCurrentJourneySaved
                          ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-700 hover:bg-emerald-500/20 dark:text-emerald-400"
                          : "border-primary/40 bg-primary/5 text-primary hover:border-primary hover:bg-primary/10"
                    }`}
                    title={
                      !journey
                        ? "Plan a journey first to save it"
                        : isCurrentJourneySaved
                          ? "Click to remove this route from Favorites"
                          : "Save this route to Favorites in the Saved tab"
                    }
                  >
                    {isCurrentJourneySaved ? (
                      <>
                        <BookmarkCheck className="size-4 text-emerald-600 dark:text-emerald-400" />
                        <span>Saved to Favorites ⭐ (Click to remove)</span>
                      </>
                    ) : (
                      <>
                        <Bookmark className="size-4" />
                        <span>Save route to Favorites</span>
                      </>
                    )}
                  </button>
                </div>

                {enriching && (
                  <p className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
                    <Loader2 className="size-3 animate-spin text-primary" />
                    Enriching walking legs with ORS road routes…
                  </p>
                )}

                {picking && (
                  <p className="text-center text-xs text-muted-foreground">
                    <MapPin className="mr-1 inline-block size-3 animate-pulse text-primary" />
                    Click anywhere on the map to drop the{" "}
                    <span className="font-semibold text-foreground">{picking}</span> pin.
                    Press <kbd className="rounded border border-border bg-secondary px-1 font-mono text-[10px]">Esc</kbd> to cancel.
                  </p>
                )}

                {/* Layer Toggles */}
                <div className="flex items-center justify-between rounded-2xl border border-border/60 bg-secondary/30 px-3 py-2 text-xs">
                  <span className="font-semibold text-muted-foreground">Layers:</span>
                  <div className="flex gap-1.5">
                    <button
                      onClick={() => setShowBusStops((v) => !v)}
                      className={`flex items-center gap-1 rounded-lg border px-2 py-1 text-[11px] font-semibold transition ${
                        showBusStops
                          ? "border-bus bg-bus text-white shadow-sm"
                          : "border-border bg-white text-muted-foreground hover:text-bus dark:bg-card"
                      }`}
                    >
                      <Bus className="size-3" /> Bus Stops
                    </button>
                    <button
                      onClick={() => setShowMetroStations((v) => !v)}
                      className={`flex items-center gap-1 rounded-lg border px-2 py-1 text-[11px] font-semibold transition ${
                        showMetroStations
                          ? "border-metro bg-metro text-white shadow-sm"
                          : "border-border bg-white text-muted-foreground hover:text-metro dark:bg-card"
                      }`}
                    >
                      <TrainFront className="size-3" /> Metro
                    </button>
                  </div>
                </div>

                {/* Results Section */}
                <div className="space-y-3 pt-2">
                  {!result && (
                    <div className="rounded-2xl border border-dashed border-border bg-secondary/20 p-5 text-center">
                      <RouteIcon className="mx-auto size-6 text-muted-foreground/60" />
                      <p className="mt-2 text-sm font-semibold">Ready to route</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Select a source and destination to find the fastest combination of walk, bus, and metro!
                      </p>
                    </div>
                  )}

                  {result?.error && (
                    <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-3.5 text-xs text-destructive">
                      {result.error}
                    </div>
                  )}

                  {result && result.journeys.length > 0 && (
                    <div className="space-y-3">
                      <div className="space-y-2">
                        {result.journeys.map((j, i) => (
                          <JourneyCard
                            key={i}
                            journey={j}
                            index={i}
                            active={i === selected}
                            onClick={() => setSelected(i)}
                          />
                        ))}
                      </div>

                      {journey && (
                        <section className="rounded-2xl border border-border bg-card p-4 shadow-sm">
                          <div className="mb-4 grid grid-cols-2 gap-2">
                            <Stat icon={Clock} label="Total time" value={fmtTime(journey.totalTimeMin)} />
                            <Stat icon={RouteIcon} label="Distance" value={fmtDist(journey.totalDistanceM)} />
                            <Stat icon={Footprints} label="Walking" value={fmtDist(journey.walkDistanceM)} />
                            <Stat icon={Repeat} label="Transfers" value={String(journey.transfers)} />
                            <Stat icon={Leaf} label="CO₂ (transit)" value={`${Math.round(journey.co2g)} g`} />
                            <Stat
                              icon={Sparkles}
                              label="CO₂ saved vs car"
                              value={`${Math.max(0, Math.round((journey.totalDistanceM / 1000) * 170 - journey.co2g))} g`}
                            />
                          </div>
                          <Itinerary
                            journey={journey}
                            origin={origin?.name ?? "Source"}
                            destination={destination?.name ?? "Destination"}
                          />
                        </section>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ── FEATURE 3: SAVED PLACES & ROUTES ── */}
            {activeRailItem === "saved" && (
              <div className="space-y-4">
                {/* ── Section A: User Saved Custom Routes ── */}
                <section className="space-y-2.5">
                  <div className="flex items-center justify-between">
                    <h2 className="flex items-center gap-1.5 text-xs font-bold text-foreground">
                      <Bookmark className="size-3.5 text-primary" />
                      <span>Your Saved Routes ({savedJourneys.length})</span>
                    </h2>
                    {savedJourneys.length > 0 && (
                      <span className="text-[10px] text-muted-foreground">Saved in browser</span>
                    )}
                  </div>

                  {savedJourneys.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-border bg-secondary/20 p-4 text-center">
                      <Bookmark className="mx-auto size-5 text-muted-foreground/60" />
                      <p className="mt-1.5 text-xs font-semibold text-foreground">No saved routes yet</p>
                      <p className="mt-0.5 text-[11px] text-muted-foreground">
                        Plan any journey in Directions and tap &quot;Save route to Favorites&quot; to access it anytime here!
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-2.5">
                      {savedJourneys.map((saved) => (
                        <div
                          key={saved.id}
                          className="rounded-2xl border border-border bg-white p-3.5 shadow-sm transition hover:border-primary/40 hover:shadow-md dark:bg-card"
                        >
                          {/* Route Origin -> Destination Header */}
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-1.5 text-xs font-bold text-foreground">
                                <span className="truncate">{saved.origin.name}</span>
                                <ArrowRight className="size-3 shrink-0 text-muted-foreground" />
                                <span className="truncate">{saved.destination.name}</span>
                              </div>
                              <div className="mt-1 flex items-baseline gap-2 text-xs">
                                <span className="text-sm font-bold text-primary">
                                  {fmtTime(saved.totalTimeMin)}
                                </span>
                                <span className="text-muted-foreground">{fmtDist(saved.totalDistanceM)}</span>
                                <span className="text-[10px] text-muted-foreground">
                                  • {saved.transfers === 0 ? "Direct" : `${saved.transfers} transfer${saved.transfers > 1 ? "s" : ""}`}
                                </span>
                              </div>
                            </div>
                            <button
                              onClick={() => removeSavedJourney(saved.id)}
                              title="Delete saved route"
                              className="rounded-lg p-1 text-muted-foreground transition hover:bg-destructive/10 hover:text-destructive active:scale-90"
                            >
                              <Trash2 className="size-3.5" />
                            </button>
                          </div>

                          {/* Legs Chips Summary */}
                          <div className="mt-2.5 flex flex-wrap items-center gap-1">
                            {saved.legs.map((leg, li) => {
                              const isBlue = (leg.line ?? "").toLowerCase().includes("blue");
                              const isOrange = leg.mode === "metro" && !isBlue;
                              return (
                                <span
                                  key={li}
                                  className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-semibold ${
                                    isBlue
                                      ? "border border-[#00aaff]/30 bg-[#00aaff]/15 text-[#0088cc]"
                                      : isOrange
                                        ? "border border-[#ff6a00]/30 bg-[#ff6a00]/15 text-[#e05500]"
                                        : leg.mode === "bus"
                                          ? "border border-bus/30 bg-bus/15 text-bus"
                                          : "bg-secondary text-muted-foreground"
                                  }`}
                                >
                                  <ModeIcon mode={leg.mode} line={leg.line} className="size-2.5" />
                                  <span className="max-w-[80px] truncate">{leg.line ?? `${Math.round(leg.timeMin)}m`}</span>
                                </span>
                              );
                            })}
                          </div>

                          {/* Action Button */}
                          <div className="mt-3 flex justify-end border-t border-border/50 pt-2">
                            <button
                              onClick={() => handleSelectSavedJourney(saved)}
                              className="flex items-center gap-1 rounded-xl bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground shadow-sm transition hover:bg-primary/90 active:scale-95"
                            >
                              <RouteIcon className="size-3" /> Load & Plan Route
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </section>

                {/* ── Section B: Popular Nagpur Landmarks ── */}
                <section className="space-y-2.5 border-t border-border pt-2">
                  <h2 className="text-xs font-bold text-foreground">
                    📍 Popular Nagpur Destinations
                  </h2>
                  <p className="text-[11px] text-muted-foreground">
                    Key multimodal transit interchanges and tourist spots:
                  </p>
                  <div className="space-y-2">
                    {POPULAR_SAVED_PLACES.map((place) => (
                      <div
                        key={place.id}
                        className="rounded-2xl border border-border bg-white p-3 shadow-sm transition hover:border-primary/40 dark:bg-secondary/30"
                      >
                        <div className="flex items-start gap-3">
                          <div
                            className={`flex size-9 shrink-0 items-center justify-center rounded-xl font-bold text-white shadow-sm text-xs ${place.iconBg}`}
                          >
                            {place.iconText}
                          </div>
                          <div className="min-w-0 flex-1">
                            <h3 className="text-xs font-bold text-foreground">{place.name}</h3>
                            <p className="text-[10px] font-semibold text-primary">{place.category}</p>
                            <p className="mt-0.5 text-[11px] text-muted-foreground truncate">{place.desc}</p>
                          </div>
                        </div>
                        <div className="mt-2.5 flex items-center gap-1.5 border-t border-border/50 pt-2">
                          <button
                            onClick={() => handleSelectSavedPlace(place, "nearby")}
                            className="flex items-center gap-1 rounded-xl bg-primary/10 px-2.5 py-1 text-[11px] font-bold text-primary transition hover:bg-primary/20"
                          >
                            <Compass className="size-3" /> Nearby
                          </button>
                          <button
                            onClick={() => handleSelectSavedPlace(place, "origin")}
                            className="rounded-xl bg-secondary/80 px-2.5 py-1 text-[11px] font-semibold text-foreground transition hover:bg-secondary"
                          >
                            Set Origin
                          </button>
                          <button
                            onClick={() => handleSelectSavedPlace(place, "destination")}
                            className="rounded-xl bg-secondary/80 px-2.5 py-1 text-[11px] font-semibold text-foreground transition hover:bg-secondary"
                          >
                            Set Dest
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              </div>
            )}

            {/* ── FEATURE 4: RECENTS & POPULAR ROUTES ── */}
            {activeRailItem === "recents" && (
              <div className="space-y-2.5">
                <p className="text-xs text-muted-foreground">
                  Frequent commuter routes across Nagpur. Click to plan instantly:
                </p>
                {POPULAR_ROUTE_PRESETS.map((preset) => (
                  <div
                    key={preset.id}
                    className="flex items-center justify-between rounded-2xl border border-border bg-white p-3.5 shadow-sm transition hover:border-primary/40 dark:bg-secondary/30"
                  >
                    <div>
                      <h3 className="text-xs font-bold text-foreground">{preset.title}</h3>
                      <span className="mt-1 inline-block rounded-md bg-primary/15 px-2 py-0.5 text-[10px] font-bold text-primary">
                        {preset.badge}
                      </span>
                    </div>
                    <button
                      onClick={() => handleSelectRoutePreset(preset)}
                      className="flex items-center gap-1 rounded-xl bg-primary px-3.5 py-2 text-xs font-bold text-primary-foreground shadow-sm transition hover:bg-primary/90 active:scale-95"
                    >
                      <RouteIcon className="size-3.5" /> Plan
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* ── FEATURE 5: NETWORK STATS ── */}
            {activeRailItem === "stats" && (
              <div className="space-y-3.5 text-xs">
                <div className="rounded-2xl border border-primary/20 bg-primary/5 p-4">
                  <h3 className="font-bold text-primary">Nagpur Multimodal Network</h3>
                  <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
                    Connecting Nagpur Metro Rail & Aapli Bus with ORS pedestrian shortest-path walking routes.
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-2.5">
                  <div className="rounded-2xl border border-border bg-secondary/30 p-3">
                    <p className="text-[10px] font-bold text-muted-foreground uppercase">Metro Lines</p>
                    <p className="mt-1 text-base font-bold text-metro">{networkStats.metroLines} Lines</p>
                    <p className="text-[10px] text-muted-foreground">Orange & Blue corridors</p>
                  </div>
                  <div className="rounded-2xl border border-border bg-secondary/30 p-3">
                    <p className="text-[10px] font-bold text-muted-foreground uppercase">Bus Routes</p>
                    <p className="mt-1 text-base font-bold text-bus">{networkStats.busRoutes} Routes</p>
                    <p className="text-[10px] text-muted-foreground">Aapli Bus network</p>
                  </div>
                </div>
                <div className="rounded-2xl border border-border bg-card p-3.5 shadow-sm">
                  <h4 className="font-bold text-foreground">Metro Line Brand Palette</h4>
                  <div className="mt-2.5 space-y-2 text-[11px]">
                    <div className="flex items-center justify-between">
                      <span className="flex items-center gap-2 font-semibold">
                        <span className="size-2.5 rounded-full bg-[#ff6a00]" />
                        Orange Line
                      </span>
                      <span className="text-muted-foreground">Automotive Sq ⇄ Khapri</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="flex items-center gap-2 font-semibold">
                        <span className="size-2.5 rounded-full bg-[#00aaff]" />
                        Blue Line
                      </span>
                      <span className="text-muted-foreground">Prajapati Nagar ⇄ Lokmanya Nagar</span>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </section>
      )}

      {/* ── 3. INTERACTIVE MAP VIEW ── */}
      <div className="relative h-screen flex-1">
        {isMounted ? (
          <Suspense
            fallback={
              <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                Loading Google Maps…
              </div>
            }
          >
            <MapView
              journey={journey}
              origin={origin}
              destination={destination}
              showNetwork={showNetwork}
              showBusStops={showBusStops}
              showMetroStations={showMetroStations}
              picking={picking}
              onMapClick={handleMapClick}
              isCurrentLocation={origin?.name === "Your location"}
              nearbyMode={cardOpen && activeRailItem === "nearby"}
              nearbyAnchor={nearbyAnchor}
              nearbyRadiusM={nearbyRadiusM}
              nearbyMarkers={nearbyMarkers}
            />
          </Suspense>
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            Loading Google Maps…
          </div>
        )}
      </div>
    </main>
  );
}

function Stat({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string;
  icon: typeof Clock;
}) {
  return (
    <div className="rounded-xl border border-border/60 bg-secondary/60 px-3 py-2">
      <div className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-muted-foreground">
        <Icon className="size-3" /> {label}
      </div>
      <div className="mt-0.5 text-sm font-bold tabular-nums">{value}</div>
    </div>
  );
}
