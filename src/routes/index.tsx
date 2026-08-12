import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense, useMemo, useState } from "react";
import PlaceSearch, { type Point } from "@/components/PlaceSearch";
import { Button } from "@/components/ui/button";
import {
  planJourney,
  networkStats,
  type Journey,
  type Preference,
  PARAMS,
} from "@/lib/routing";

const MapView = lazy(() => import("@/components/MapView"));

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

const PREFS: { id: Preference; label: string }[] = [
  { id: "balanced", label: "Best overall" },
  { id: "fastest", label: "Fastest" },
  { id: "least_walk", label: "Least walking" },
  { id: "fewest_transfers", label: "Fewest transfers" },
  { id: "low_co2", label: "Lowest CO₂" },
];

const fmtDist = (m: number) => (m < 1000 ? `${Math.round(m / 10) * 10} m` : `${(m / 1000).toFixed(1)} km`);
const fmtTime = (min: number) => {
  const t = Math.round(min);
  return t < 60 ? `${t} min` : `${Math.floor(t / 60)} h ${t % 60} min`;
};

function ModeDot({ mode }: { mode: string }) {
  const color = mode === "bus" ? "bg-bus" : mode === "metro" ? "bg-metro" : "bg-walk";
  return <span className={`size-3 shrink-0 rounded-full ${color}`} />;
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
  return (
    <button
      onClick={onClick}
      className={`w-full rounded-xl border p-3 text-left transition-colors ${
        active ? "border-primary bg-secondary" : "border-border bg-card hover:bg-secondary/60"
      }`}
    >
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold">
          {index === 0 ? "Recommended" : `Option ${index + 1}`}
        </span>
        <span className="text-sm font-semibold text-primary">{fmtTime(journey.totalTimeMin)}</span>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {journey.legs.map((l, i) => (
          <span key={i} className="flex items-center gap-1">
            {i > 0 && <span className="text-muted-foreground">›</span>}
            <span
              className={`rounded-md px-1.5 py-0.5 text-[11px] font-medium ${
                l.mode === "bus"
                  ? "bg-bus/15 text-bus"
                  : l.mode === "metro"
                    ? "bg-metro/20 text-metro"
                    : "bg-muted text-muted-foreground"
              }`}
            >
              {l.mode === "walk" ? `Walk ${fmtDist(l.distanceM)}` : l.line}
            </span>
          </span>
        ))}
      </div>
      <div className="mt-2 text-xs text-muted-foreground">
        {fmtDist(journey.totalDistanceM)} · walk {fmtDist(journey.walkDistanceM)} ·{" "}
        {journey.transfers} transfer{journey.transfers === 1 ? "" : "s"} ·{" "}
        {Math.round(journey.co2g)} g CO₂
      </div>
    </button>
  );
}

function Itinerary({ journey, origin, destination }: { journey: Journey; origin: string; destination: string }) {
  return (
    <ol className="space-y-0">
      <li className="flex gap-3">
        <div className="flex flex-col items-center">
          <span className="size-3 rounded-full bg-foreground" />
          <span className="w-px flex-1 bg-border" />
        </div>
        <div className="pb-4 text-sm font-medium">{origin}</div>
      </li>
      {journey.legs.map((leg, i) => (
        <li key={i} className="flex gap-3">
          <div className="flex flex-col items-center">
            <ModeDot mode={leg.mode} />
            <span
              className={`w-px flex-1 ${leg.mode === "walk" ? "border-l border-dashed border-border" : "bg-border"}`}
            />
          </div>
          <div className="pb-4">
            {leg.mode === "walk" ? (
              <p className="text-sm">
                <span className="font-medium">Walk {fmtDist(leg.distanceM)}</span>{" "}
                <span className="text-muted-foreground">
                  ({Math.max(1, Math.round(leg.timeMin))} min) to {leg.to}
                </span>
              </p>
            ) : (
              <div>
                <p className="text-sm font-medium">
                  {leg.mode === "bus" ? "Bus" : "Metro"}{" "}
                  <span className={leg.mode === "bus" ? "text-bus" : "text-metro"}>{leg.line}</span>
                </p>
                <p className="text-xs text-muted-foreground">
                  Board at {leg.from} · Get down at {leg.to}
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {(leg.stops?.length ?? 1) - 1} stops · {fmtDist(leg.distanceM)} ·{" "}
                  {Math.round(leg.timeMin)} min
                </p>
                {leg.stops && leg.stops.length > 2 && (
                  <details className="mt-1">
                    <summary className="cursor-pointer text-xs text-primary">
                      Show intermediate stops
                    </summary>
                    <ul className="mt-1 space-y-0.5 text-xs text-muted-foreground">
                      {leg.stops.slice(1, -1).map((s, k) => (
                        <li key={k}>{s}</li>
                      ))}
                    </ul>
                  </details>
                )}
              </div>
            )}
          </div>
        </li>
      ))}
      <li className="flex gap-3">
        <span className="size-3 rounded-full bg-destructive" />
        <div className="text-sm font-medium">{destination}</div>
      </li>
    </ol>
  );
}

function Planner() {
  const [origin, setOrigin] = useState<Point | null>(null);
  const [destination, setDestination] = useState<Point | null>(null);
  const [pref, setPref] = useState<Preference>("balanced");
  const [picking, setPicking] = useState<"origin" | "destination" | null>(null);
  const [showNetwork, setShowNetwork] = useState(true);
  const [selected, setSelected] = useState(0);
  const [result, setResult] = useState<{ journeys: Journey[]; error?: string } | null>(null);

  const plan = () => {
    if (!origin || !destination) return;
    setSelected(0);
    setResult(planJourney(origin, destination, pref));
  };

  const journey = useMemo(() => result?.journeys[selected] ?? null, [result, selected]);

  const handleMapClick = (p: { lat: number; lon: number }) => {
    if (!picking) return;
    const point = { ...p, name: `Pin ${p.lat.toFixed(4)}, ${p.lon.toFixed(4)}` };
    if (picking === "origin") setOrigin(point);
    else setDestination(point);
    setPicking(null);
  };

  return (
    <main className="flex h-screen flex-col bg-background lg:flex-row">
      <aside className="flex w-full shrink-0 flex-col border-b border-border bg-sidebar lg:h-screen lg:w-[420px] lg:border-b-0 lg:border-r">
        <header className="border-b border-border px-5 py-4">
          <h1 className="text-lg font-semibold tracking-tight">Nagpur Connect</h1>
          <p className="text-xs text-muted-foreground">
            Multimodal last-mile planner · {networkStats.busRoutes} bus routes ·{" "}
            {networkStats.metroLines} metro lines · {networkStats.places} stops
          </p>
        </header>

        <div className="space-y-3 border-b border-border px-5 py-4">
          <PlaceSearch
            label="Source"
            value={origin}
            onChange={setOrigin}
            placeholder="Search a stop, station or drop a pin"
            dot="var(--foreground)"
          />
          <PlaceSearch
            label="Destination"
            value={destination}
            onChange={setDestination}
            placeholder="Search a stop, station or drop a pin"
            dot="var(--destructive)"
          />

          <div className="flex flex-wrap gap-1.5">
            {PREFS.map((p) => (
              <button
                key={p.id}
                onClick={() => setPref(p.id)}
                className={`rounded-full border px-2.5 py-1 text-xs transition-colors ${
                  pref === p.id
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-card text-muted-foreground hover:bg-secondary"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>

          <div className="flex gap-2">
            <Button className="flex-1" onClick={plan} disabled={!origin || !destination}>
              Plan journey
            </Button>
            <Button
              variant="outline"
              onClick={() => setPicking(picking ? null : "origin")}
              title="Pick points on the map"
            >
              {picking ? `Click map for ${picking}` : "Pin on map"}
            </Button>
          </div>
          {picking && (
            <div className="flex gap-2 text-xs">
              <button className="text-primary underline" onClick={() => setPicking("origin")}>
                set source
              </button>
              <button className="text-primary underline" onClick={() => setPicking("destination")}>
                set destination
              </button>
              <button className="text-muted-foreground" onClick={() => setPicking(null)}>
                cancel
              </button>
            </div>
          )}
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={showNetwork}
              onChange={(e) => setShowNetwork(e.target.checked)}
            />
            Show full transport network
          </label>
        </div>

        <div className="min-h-0 flex-1 overflow-auto px-5 py-4">
          {!result && (
            <p className="text-sm text-muted-foreground">
              Enter a source and destination to get a walk + bus + metro itinerary. Walking access
              radius is {PARAMS.maxAccessWalkM} m.
            </p>
          )}
          {result?.error && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
              {result.error}
            </div>
          )}
          {result && result.journeys.length > 0 && (
            <div className="space-y-4">
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
                <section className="rounded-xl border border-border bg-card p-4">
                  <div className="mb-3 grid grid-cols-2 gap-3 text-xs">
                    <Stat label="Total time" value={fmtTime(journey.totalTimeMin)} />
                    <Stat label="Total distance" value={fmtDist(journey.totalDistanceM)} />
                    <Stat label="Walking" value={fmtDist(journey.walkDistanceM)} />
                    <Stat label="Transfers" value={String(journey.transfers)} />
                    <Stat label="CO₂ (transit)" value={`${Math.round(journey.co2g)} g`} />
                    <Stat
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
      </aside>

      <div className="h-[55vh] min-h-0 flex-1 lg:h-screen">
        <Suspense
          fallback={<div className="flex h-full items-center justify-center text-sm text-muted-foreground">Loading map…</div>}
        >
          <MapView
            journey={journey}
            origin={origin}
            destination={destination}
            showNetwork={showNetwork}
            onMapClick={handleMapClick}
          />
        </Suspense>
      </div>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-secondary px-3 py-2">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="text-sm font-semibold">{value}</div>
    </div>
  );
}
