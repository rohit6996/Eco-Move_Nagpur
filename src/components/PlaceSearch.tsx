import { useMemo, useState } from "react";
import { searchPlaces, type SearchablePlace } from "@/lib/routing";
import { Input } from "@/components/ui/input";

export interface Point {
  lat: number;
  lon: number;
  name: string;
}

export default function PlaceSearch({
  label,
  value,
  onChange,
  placeholder,
  dot,
}: {
  label: string;
  value: Point | null;
  onChange: (p: Point | null) => void;
  placeholder: string;
  dot: string;
}) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const results = useMemo<SearchablePlace[]>(() => searchPlaces(q), [q]);

  return (
    <div className="relative">
      <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </label>
      <div className="relative">
        <span
          className="absolute left-3 top-1/2 size-2.5 -translate-y-1/2 rounded-full"
          style={{ background: dot }}
        />
        <Input
          className="pl-8"
          placeholder={placeholder}
          value={value ? value.name : q}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
            if (value) onChange(null);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => window.setTimeout(() => setOpen(false), 150)}
        />
      </div>
      {open && !value && results.length > 0 && (
        <ul className="absolute z-[1000] mt-1 max-h-64 w-full overflow-auto rounded-lg border border-border bg-popover shadow-lg">
          {results.map((r) => (
            <li key={r.id}>
              <button
                type="button"
                className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-secondary"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onChange({ lat: r.lat, lon: r.lon, name: r.name });
                  setQ("");
                  setOpen(false);
                }}
              >
                <span className="truncate">{r.name}</span>
                <span className="shrink-0 text-[10px] uppercase tracking-wide text-muted-foreground">
                  {r.modes.join(" + ")}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
