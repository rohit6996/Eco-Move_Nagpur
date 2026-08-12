import {
  MapContainer,
  TileLayer,
  Polyline,
  CircleMarker,
  Tooltip,
  useMap,
  useMapEvents,
} from "react-leaflet";
import { useEffect } from "react";
import "leaflet/dist/leaflet.css";
import type { Journey } from "@/lib/routing";
import { allLines } from "@/lib/routing";

const MODE_COLOR: Record<string, string> = {
  walk: "#64748b",
  bus: "#0d9488",
  metro: "#e07a1f",
};

function Fit({ journey }: { journey: Journey | null }) {
  const map = useMap();
  useEffect(() => {
    if (!journey) return;
    const pts = journey.legs.flatMap((l) => l.path.map((p) => [p.lat, p.lon] as [number, number]));
    if (pts.length > 1) map.fitBounds(pts, { padding: [40, 40] });
  }, [journey, map]);
  return null;
}

function ClickHandler({
  onClick,
}: {
  onClick?: ((p: { lat: number; lon: number }) => void) | undefined;
}) {
  useMapEvents({
    click(e) {
      onClick?.({ lat: e.latlng.lat, lon: e.latlng.lng });
    },
  });
  return null;
}

export default function MapView({
  journey,
  origin,
  destination,
  showNetwork,
  onMapClick,
}: {
  journey: Journey | null;
  origin?: { lat: number; lon: number } | null;
  destination?: { lat: number; lon: number } | null;
  showNetwork: boolean;
  onMapClick?: ((p: { lat: number; lon: number }) => void) | undefined;
}) {
  return (
    <MapContainer
      center={[21.1458, 79.0882]}
      zoom={12}
      className="h-full w-full"
      scrollWheelZoom
      style={{ background: "#eef2f4" }}
    >
      <TileLayer
        attribution="&copy; OpenStreetMap contributors"
        url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
      />
      {showNetwork &&
        allLines.map((l) => (
          <Polyline
            key={l.id}
            positions={l.points.map((p) => [p.lat, p.lon] as [number, number])}
            pathOptions={{
              color: l.mode === "metro" ? MODE_COLOR['metro'] : MODE_COLOR['bus'],
              weight: l.mode === "metro" ? 3 : 1.5,
              opacity: 0.25,
            }}
          />
        ))}

      {journey?.legs.map((leg, i) => (
        <Polyline
          key={i}
          positions={leg.path.map((p) => [p.lat, p.lon] as [number, number])}
          pathOptions={{
            color: MODE_COLOR[leg.mode],
            weight: leg.mode === "walk" ? 4 : 6,
            dashArray: leg.mode === "walk" ? "2 8" : undefined,
            opacity: 0.95,
          }}
        />
      ))}

      {journey?.legs
        .filter((l) => l.mode !== "walk")
        .flatMap((leg, li) =>
          leg.path.map((p, pi) => (
            <CircleMarker
              key={`${li}-${pi}`}
              center={[p.lat, p.lon]}
              radius={pi === 0 || pi === leg.path.length - 1 ? 6 : 3}
              pathOptions={{
                color: MODE_COLOR[leg.mode]!,
                fillColor: "#ffffff",
                fillOpacity: 1,
                weight: 2,
              }}
            >
              <Tooltip>{leg.stops?.[pi] ?? leg.line}</Tooltip>
            </CircleMarker>
          )),
        )}

      {origin && (
        <CircleMarker
          center={[origin.lat, origin.lon]}
          radius={8}
          pathOptions={{ color: "#0f172a", fillColor: "#0f172a", fillOpacity: 1, weight: 2 }}
        >
          <Tooltip>Source</Tooltip>
        </CircleMarker>
      )}
      {destination && (
        <CircleMarker
          center={[destination.lat, destination.lon]}
          radius={8}
          pathOptions={{ color: "#dc2626", fillColor: "#dc2626", fillOpacity: 1, weight: 2 }}
        >
          <Tooltip>Destination</Tooltip>
        </CircleMarker>
      )}
      <ClickHandler onClick={onMapClick} />
      <Fit journey={journey} />
    </MapContainer>
  );
}
