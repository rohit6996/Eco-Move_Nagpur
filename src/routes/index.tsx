import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense, useMemo, useState } from "react";
import PlaceSearch, { type Point } from "@/components/PlaceSearch";
import { Button } from "@/components/ui/button";
import {
  ArrowRight,
  Bus,
  Clock,
  Footprints,
  Leaf,
  MapPin,
  Repeat,
  Route as RouteIcon,
  Sparkles,
  TrainFront,
  Zap,
} from "lucide-react";
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

const PREFS: { id: Preference; label: string; icon: typeof Zap }[] = [
  { id: "balanced", label: "Best overall", icon: Sparkles },
  { id: "fastest", label: "Fastest", icon: Zap },
  { id: "least_walk", label: "Least walking", icon: Footprints },
  { id: "fewest_transfers", label: "Fewest transfers", icon: Repeat },
  { id: "low_co2", label: "Lowest CO₂", icon: Leaf },
];

const fmtDist = (m: number) => (m < 1000 ? `${Math.round(m / 10) * 10} m` : `${(m / 1000).toFixed(1)} km`);
const fmtTime = (min: number) => {
  const t = Math.round(min);
  return t < 60 ? `${t} min` : `${Math.floor(t / 60)} h ${t % 60} min`;
};

function ModeIcon({ mode, className = "size-3.5" }: { mode: string; className?: string }) {
  if (mode === "bus") return <Bus className={className} />;
  if (mode === "metro") return <TrainFront className={className} />;
  return <Footprints className={className} />;
}

function ModeDot({ mode }: { mode: string }) {
  const color = mode === "bus" ? "bg-bus" : mode === "metro" ? "bg-metro" : "bg-walk";
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
  const hasMetro = journey.legs.some((l) => l.mode === "metro");
  return (
    <button
      onClick={onClick}
      className={`group w-full rounded-2xl border p-3.5 text-left transition-all ${
        active
          ? "border-primary/60 bg-card shadow-md ring-2 ring-primary/15"
          : "border-border bg-card/70 hover:border-primary/30 hover:bg-card hover:shadow-sm"
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-2 text-sm font-semibold">
          {index === 0 ? (
            <span className="rounded-full bg-primary px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary-foreground">
              Recommended
            </span>
          ) : (
            <span className="text-muted-foreground">Option {index + 1}</span>
          )}
          {hasMetro && (
            <span className="flex items-center gap-1 rounded-full bg-metro/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-metro">
              <TrainFront className="size-3" /> Metro
            </span>
          )}
        </span>
        <span className="text-base font-bold tabular-nums text-primary">
          {fmtTime(journey.totalTimeMin)}
        </span>
      </div>

      <div className="mt-2.5 flex flex-wrap items-center gap-1">
        {journey.legs.map((l, i) => (
          <span key={i} className="flex items-center gap-1">
            {i > 0 && <ArrowRight className="size-3 text-muted-foreground/60" />}
            <span
              className={`flex items-center gap-1 rounded-lg px-1.5 py-0.5 text-[11px] font-medium ${
                l.mode === "bus"
                  ? "bg-bus/15 text-bus"
                  : l.mode === "metro"
                    ? "bg-metro/20 text-metro"
                    : "bg-muted text-muted-foreground"
              }`}
            >
              <ModeIcon mode={l.mode} className="size-3" />
              {l.mode === "walk" ? fmtDist(l.distanceM) : l.line}
            </span>
          </span>
        ))}
      </div>

      <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
        <span className="flex items-center gap-1">
          <RouteIcon className="size-3" /> {fmtDist(journey.totalDistanceM)}
        </span>
        <span className="flex items-center gap-1">
          <Footprints className="size-3" /> {fmtDist(journey.walkDistanceM)}
        </span>
        <span className="flex items-center gap-1">
          <Repeat className="size-3" /> {journey.transfers}
        </span>
        <span className="flex items-center gap-1">
          <Leaf className="size-3" /> {Math.round(journey.co2g)} g
        </span>
      </div>
    </button>
  );
}

function Itinerary({ journey, origin, destination }: { journey: Journey; origin: string; destination: string }) {
  return (
    <ol className="space-y-0">
      <li className="flex gap-3">
        <div className="flex flex-col items-center">
          <span className="size-3 rounded-full bg-foreground ring-4 ring-background" />
          <span className="w-px flex-1 bg-border" />
        </div>
        <div className="pb-4 text-sm font-semibold">{origin}</div>
      </li>
      {journey.legs.map((leg, i) => (
        <li key={i} className="flex gap-3">
          <div className="flex flex-col items-center">
            <ModeDot mode={leg.mode} />
            <span
              className={`w-px flex-1 ${leg.mode === "walk" ? "border-l border-dashed border-border" : "bg-border"}`}
            />
          </div>
          <div className="w-full pb-4">
            {leg.mode === "walk" ? (
              <p className="text-sm">
                <span className="inline-flex items-center gap-1.5 font-medium">
                  <Footprints className="size-3.5 text-walk" /> Walk {fmtDist(leg.distanceM)}
                </span>{" "}
                <span className="text-muted-foreground">
                  ({Math.max(1, Math.round(leg.timeMin))} min) to {leg.to}
                </span>
              </p>
            ) : (
              <div
                className={`rounded-xl border p-2.5 ${
                  leg.mode === "metro" ? "border-metro/30 bg-metro/5" : "border-bus/30 bg-bus/5"
                }`}
              >
                <p className="flex items-center gap-1.5 text-sm font-semibold">
                  <ModeIcon
                    mode={leg.mode}
                    className={`size-4 ${leg.mode === "bus" ? "text-bus" : "text-metro"}`}
                  />
                  <span className={leg.mode === "bus" ? "text-bus" : "text-metro"}>{leg.line}</span>
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Board at <span className="font-medium text-foreground">{leg.from}</span> · Get down
                  at <span className="font-medium text-foreground">{leg.to}</span>
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {(leg.stops?.length ?? 1) - 1} stops · {fmtDist(leg.distanceM)} ·{" "}
                  {Math.round(leg.timeMin)} min
                </p>
                {leg.stops && leg.stops.length > 2 && (
                  <details className="mt-1.5">
                    <summary className="cursor-pointer text-xs font-medium text-primary">
                      Show intermediate stops
                    </summary>
                    <ul className="mt-1 space-y-0.5 border-l border-border pl-3 text-xs text-muted-foreground">
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
        <span className="size-3 rounded-full bg-destructive ring-4 ring-background" />
        <div className="text-sm font-semibold">{destination}</div>
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

  const swap = () => {
    setOrigin(destination);
    setDestination(origin);
  };

  return (
    <main className="flex h-screen flex-col bg-background lg:flex-row">
      <aside className="flex w-full shrink-0 flex-col border-b border-border bg-sidebar lg:h-screen lg:w-[430px] lg:border-b-0 lg:border-r">
        <header className="border-b border-border bg-gradient-to-br from-primary/10 via-sidebar to-metro/10 px-5 py-4">
          <div className="flex items-center gap-2.5">
            <span className="flex size-9 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
              <RouteIcon className="size-5" />
            </span>
            <div>
              <h1 className="text-lg font-bold tracking-tight">Nagpur Connect</h1>
              <p className="text-xs text-muted-foreground">Last-mile multimodal planner</p>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap gap-1.5 text-[11px]">
            <span className="flex items-center gap-1 rounded-full bg-bus/15 px-2 py-0.5 font-medium text-bus">
              <Bus className="size-3" /> {networkStats.busRoutes} routes
            </span>
            <span className="flex items-center gap-1 rounded-full bg-metro/20 px-2 py-0.5 font-medium text-metro">
              <TrainFront className="size-3" /> {networkStats.metroLines} metro lines
            </span>
            <span className="flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5 font-medium text-muted-foreground">
              <MapPin className="size-3" /> {networkStats.places} stops
            </span>
          </div>
        </header>

        <div className="space-y-3 border-b border-border px-5 py-4">
          <div className="relative space-y-2.5">
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
            <button
              onClick={swap}
              title="Swap source and destination"
              className="absolute -right-1 top-1/2 hidden size-7 -translate-y-1/2 items-center justify-center rounded-full border border-border bg-card text-muted-foreground shadow-sm transition-colors hover:text-primary sm:flex"
            >
              <Repeat className="size-3.5" />
            </button>
          </div>

          <div className="flex flex-wrap gap-1.5">
            {PREFS.map((p) => {
              const Icon = p.icon;
              return (
                <button
                  key={p.id}
                  onClick={() => setPref(p.id)}
                  className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-all ${
                    pref === p.id
                      ? "border-primary bg-primary text-primary-foreground shadow-sm"
                      : "border-border bg-card text-muted-foreground hover:border-primary/40 hover:text-foreground"
                  }`}
                >
                  <Icon className="size-3.5" />
                  {p.label}
                </button>
              );
            })}
          </div>

          <div className="flex gap-2">
            <Button className="flex-1 shadow-sm" onClick={plan} disabled={!origin || !destination}>
              <RouteIcon className="size-4" /> Plan journey
            </Button>
            <Button
              variant={picking ? "default" : "outline"}
              onClick={() => setPicking(picking ? null : "origin")}
              title="Pick points on the map"
            >
              <MapPin className="size-4" />
              {picking ? `Click map for ${picking}` : "Pin on map"}
            </Button>
          </div>
          {picking && (
            <div className="flex gap-3 rounded-lg bg-secondary px-3 py-2 text-xs">
              <button className="font-medium text-primary underline" onClick={() => setPicking("origin")}>
                set source
              </button>
              <button
                className="font-medium text-primary underline"
                onClick={() => setPicking("destination")}
              >
                set destination
              </button>
              <button className="ml-auto text-muted-foreground" onClick={() => setPicking(null)}>
                cancel
              </button>
            </div>
          )}
          <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
            <input
              type="checkbox"
              className="accent-[var(--primary)]"
              checked={showNetwork}
              onChange={(e) => setShowNetwork(e.target.checked)}
            />
            Show full transport network
          </label>
        </div>

        <div className="min-h-0 flex-1 overflow-auto px-5 py-4">
          {!result && (
            <div className="rounded-2xl border border-dashed border-border bg-card/50 p-5 text-center">
              <RouteIcon className="mx-auto size-6 text-muted-foreground" />
              <p className="mt-2 text-sm font-medium">Plan your first trip</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Pick a source and destination for a walk + bus + metro itinerary. Metro is preferred
                whenever it's available. Walking access radius is {PARAMS.maxAccessWalkM} m.
              </p>
            </div>
          )}
          {result?.error && (
            <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
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
