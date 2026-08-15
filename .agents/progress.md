# Nagpur Connect — Codebase Structure & Progress Documentation

> **Notice for Future AI Agents**: This document consolidates the complete state, architectural design, data structures, routing algorithms, component tree, server configuration, and parameters of the **Nagpur Connect** multimodal journey planning platform. Reading this file provides a comprehensive understanding of the entire project without needing to scan every individual source file.

---

## 1. Project Overview & Objective

**Nagpur Connect** is a full-stack, multimodal last-mile public transit journey planner for Nagpur, Maharashtra, India. It combines local bus networks, metro rail lines, and walking connections into seamless itineraries.

### Key Features
- **Multimodal Routing Engine**: Graph-based Dijkstra algorithm navigating across bus routes, metro lines, and walking transfers.
- **Preference Tuning**: 5 optimization modes (`balanced`, `fastest`, `least_walk`, `fewest_transfers`, `low_co2`).
- **Interactive Map Visualization**: React-Leaflet base map rendering transit network polylines, bus stops, metro stations, active route legs, and interactive map-pin dropping (`origin` & `destination`).
- **Real Road Path Enrichment**: Integrates OpenRouteService (ORS) `foot-walking` API to convert straight-line walking legs into actual pedestrian road paths with in-memory caching and automatic fallback.
- **Environmental Metrics**: Calculates estimated transit CO₂ emissions (grams) and CO₂ savings compared to private car transit.
- **SSR-Safe Architecture**: Built on TanStack Start + Nitro server handler, with browser-only guards for Leaflet DOM dependencies.

---

## 2. Directory Structure & File Map

```
nagpur-connect-routes/
├── .agents/
│   └── progress.md               # [THIS FILE] Consolidated codebase documentation for AI agents
├── public/
│   ├── favicon.ico
│   └── robots.txt
├── src/
│   ├── components/
│   │   ├── ui/                   # Shadcn UI / Radix UI primitive components (46 components)
│   │   │   ├── button.tsx, input.tsx, card.tsx, dialog.tsx, sidebar.tsx, etc.
│   │   ├── MapView.tsx           # React-Leaflet interactive map (polylines, markers, pin picking)
│   │   └── PlaceSearch.tsx       # Place search autocomplete input + map-pin picking integration
│   ├── data/
│   │   └── network.json          # Raw transit dataset (bus routes with stops, metro lines with stations)
│   ├── hooks/
│   │   └── use-mobile.tsx        # Responsive screen breakpoint hook
│   ├── lib/
│   │   ├── error-capture.ts      # Server error capture wrapper for h3 / Nitro SSR error recovery
│   │   ├── error-page.ts         # Static HTML template generator for 500 error fallback
│   │   ├── lovable-error-reporting.ts # Client error reporting hook for dev telemetry
│   │   ├── network.ts            # Network graph builder (stop clustering within 120m into Places)
│   │   ├── ors.ts                # OpenRouteService pedestrian routing API client & cache
│   │   ├── routing.ts            # Core Dijkstra router, preference weighting, & itinerary enricher
│   │   └── utils.ts              # Tailwind `cn()` utility (clsx + tailwind-merge)
│   ├── routes/
│   │   ├── README.md             # TanStack Start routing conventions documentation
│   │   ├── __root.tsx            # Root route shell, HTML head tags, QueryClient provider & 404/Error boundaries
│   │   └── index.tsx             # Main application page (Journey planner sidebar + map layout)
│   ├── routeTree.gen.ts          # Auto-generated TanStack Router route tree
│   ├── router.tsx                # TanStack Router instance creation with React Query context
│   ├── server.ts                 # Nitro / TanStack Start custom server entry with SSR error handling
│   ├── start.ts                  # TanStack Start middleware (CSRF + error handling)
│   └── styles.css                # Global CSS styles with Tailwind CSS directives & color variables
├── .env                          # Environment variables (VITE_ORS_API_KEY)
├── .env.example                  # Environment template
├── AGENTS.md                     # Agent instructions file
├── components.json               # Shadcn UI configuration
├── eslint.config.js              # ESLint configuration
├── package.json                  # NPM package manifest & dependencies
├── README.md                     # Project README
├── tsconfig.json                 # TypeScript compiler configuration
└── vite.config.ts                # Vite configuration with Lovable TanStack plugin
```

---

## 3. Technology Stack & Dependencies

- **Framework**: [TanStack Start](https://tanstack.com/router) (`@tanstack/react-start` v1.168, `@tanstack/react-router` v1.170)
- **Bundler & Server**: [Vite](https://vitejs.dev/) v8.2 + [Nitro](https://nitro.unjs.io/) v3.0 (server entry redirected to `src/server.ts`)
- **UI & Components**: [React 19](https://react.dev/), [Tailwind CSS](https://tailwindcss.com/) v4.2, [Lucide React](https://lucide.dev/) icons, Radix UI primitives, [Shadcn UI](https://ui.shadcn.com/)
- **Mapping**: [Leaflet](https://leafletjs.com/) v1.9 + [React-Leaflet](https://react-leaflet.js.org/) v5.0 with CartoDB Voyager raster tiles
- **State & Data Fetching**: [TanStack React Query](https://tanstack.com/query) v5.101
- **Pedestrian Routing API**: [OpenRouteService (ORS)](https://openrouteservice.org/) `foot-walking` API
- **Language & Runtime**: TypeScript 5.8, Node.js / Bun compatible

---

## 4. Data Models & Transit Dataset Schema

### Raw Data (`src/data/network.json`)
The dataset defines public transport lines and stops in Nagpur:
```typescript
export interface RawStop {
  name: string;
  lat: number;
  lon: number;
}

export interface RawBusRoute {
  route: string;       // e.g. "Route 10: Sitabuldi to Hingna"
  stops: RawStop[];
}

export interface RawMetroLine {
  line: string;        // e.g. "Aqua" or "Orange"
  stations: RawStop[];
}

export interface RawNetwork {
  bus: RawBusRoute[];
  metro: RawMetroLine[];
}
```

### Derived Multimodal Graph (`src/lib/network.ts`)
Stops within **120 meters** (`CLUSTER_M = 120`) that share similar names or exact coordinates are merged into a single physical **`Place`**:
```typescript
export interface Place {
  id: string;          // e.g. "p0", "p1"
  name: string;        // Station or stop cluster display name
  lat: number;
  lon: number;
  modes: Set<"walk" | "bus" | "metro">;
  routes: Set<string>; // Served route IDs
}

export interface RouteLine {
  id: string;          // e.g. "bus:0" or "metro:1"
  mode: "bus" | "metro";
  name: string;        // e.g. "Orange Line", "Route 22"
  placeIds: string[];  // Ordered array of served Place IDs
  points: RawStop[];   // Shape polyline coordinates
}
```

---

## 5. Core Routing Logic & Parameters

### Tunable Routing Parameters (`src/lib/routing.ts` -> `PARAMS`)
```typescript
export const PARAMS = {
  walkSpeedKmh: 4.8,            // Average walking speed (km/h)
  busSpeedKmh: 17,              // Average bus speed in city transit (km/h)
  metroSpeedKmh: 32,            // Average metro train speed (km/h)
  busWaitMin: 9,                // Average bus wait time at boarding (min)
  metroWaitMin: 4,              // Average metro wait time at boarding (min)
  transferPenaltyMin: 3,        // Penalty added for non-initial transfers (min)
  maxAccessWalkM: 1500,         // Maximum walking distance from origin/dest to transit stop (m)
  maxTransferWalkM: 700,        // Maximum walking distance between transfer stops (m)
  co2PerKm: { walk: 0, bus: 68, metro: 22 }, // Grams of CO2 per passenger-km
};
```

### Preference Weights (`PREFERENCE_WEIGHTS`)
Custom cost function formula evaluated during Dijkstra graph search:
$$\text{Cost} = t \cdot w_{\text{time}} + d_{\text{walk\_km}} \cdot w_{\text{walk}} + n_{\text{transfers}} \cdot w_{\text{transfer}} + c_{\text{co2\_kg}} \cdot w_{\text{co2}} + d_{\text{bus\_km}} \cdot w_{\text{busPenalty}}$$

| Preference | `time` | `walk` | `transfer` | `co2` | `busPenalty` | Notes |
| :--- | :---: | :---: | :---: | :---: | :---: | :--- |
| **`balanced`** | 1 | 8 | 6 | 4 | 3.5 | Best overall trade-off (Metro preferred over Bus) |
| **`fastest`** | 1 | 1 | 1 | 0 | 1.5 | Minimizes strict travel duration |
| **`least_walk`** | 0.4 | 60 | 2 | 0 | 1.5 | Heavily penalizes walking distance |
| **`fewest_transfers`** | 0.5 | 4 | 45 | 0 | 1.5 | Penalizes line switches |
| **`low_co2`** | 0.4 | 2 | 3 | 60 | 4 | Maximizes eco-friendly modes (Metro & Walk) |

### Graph Construction & Search Algorithm
1. **Node Representation**:
   - `P:{placeId}`: Physical transit stop or interchange.
   - `R:{lineId}:{index}`: Virtual in-transit state on a specific line at stop index.
2. **Edge Types**:
   - `board`: `P:{placeId}` $\rightarrow$ `R:{lineId}:{i}` (Cost: mode wait time, 0 km, 0 CO₂).
   - `alight`: `R:{lineId}:{i}` $\rightarrow$ `P:{placeId}` (Cost: 0 min).
   - `ride`: `R:{lineId}:{i}` $\rightarrow$ `R:{lineId}:{i±1}` (Cost: transit travel time, haversine distance, mode CO₂).
   - `walk`: `P:{placeA}` $\leftrightarrow$ `P:{placeB}` (Transfer walk edge between stops within 700m).
3. **Dijkstra Priority Queue**:
   - Dynamically injects `ORIGIN` and `DEST` nodes connecting to nearby stops within `maxAccessWalkM` (1500m).
   - Evaluates paths using `cost(Metrics, Preference)`.
   - Prunes paths where total walking distance exceeds 4,000m.
4. **Alternative Itineraries**:
   - Returns up to 4 distinct routes by banning primary lines used in the top journey and searching under alternate preferences.
5. **ORS Road Path Enrichment (`enrichWalkLegs`)**:
   - Executes non-blocking parallel calls to OpenRouteService `foot-walking` API for walk legs.
   - Replaces straight-line approximations with real street polyline geometry, distance, and duration.
   - Seamless fallback to straight-line estimation if API key is missing or quota is exceeded.

---

## 6. Main UI Components & Interactivity

### 1. `src/routes/index.tsx` (Planner Page)
- **Layout**: Split desktop view (`lg:flex-row`). Left sidebar (430px) for search controls, preference selector, journey cards, and detailed step-by-step itinerary breakdown. Right main panel for full-height Leaflet map.
- **State Management**:
  - `origin`, `destination`: Selected source and destination points (`{ lat, lon, name }`).
  - `pref`: Active preference filter.
  - `picking`: Map-pin selection mode (`"origin" | "destination" | null`).
  - `result`: Calculated journeys and error messages.
  - `showNetwork`, `showBusStops`, `showMetroStations`: Map overlay visibility toggles.
  - `isMounted`: SSR safety flag ensuring Leaflet is mounted client-side only.

### 2. `src/components/MapView.tsx` (Map View)
- **Client-only component** loaded via `React.lazy()` inside `Suspense`.
- **Layers**:
  - TileLayer: CartoDB Voyager (`https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png`).
  - Network Overlay: Faint polylines showing all metro (orange, weight 3) and bus routes (teal, weight 1.5).
  - Stop Overlays: Interactive `CircleMarker` dots for bus stops and metro stations with hover tooltips.
  - Active Journey Polylines: Color-coded active legs (Walk: dashed gray `#64748b`, Bus: teal `#0d9488`, Metro: orange `#e07a1f`).
  - Origin / Destination Pins: Black circle marker for Source, Red circle marker for Destination.
  - Map Click Listener (`ClickHandler`): Captures clicks when in picking mode and returns `{ lat, lon }`.
  - Auto Fit Bounds (`Fit`): Smoothly fits map camera view to the bounds of the active journey.

### 3. `src/components/PlaceSearch.tsx` (Autocomplete & Map Pin Helper)
- Integrated search input filtering `searchablePlaces` with instant substring match and mode badges.
- Visual indicator when map-pin dropping mode is activated (pulsing `MapPin` icon + ring highlight).
- Keyboard shortcuts: `Escape` key cancels active map pin selection mode.

---

## 7. SSR & Server Architecture

### 1. `src/server.ts`
- Custom Nitro server entry point (`export default { fetch }`).
- Wraps `@tanstack/react-start/server-entry`.
- Handles h3 error swallowing by catching unhandled 500 JSON responses (`isH3SwallowedErrorBody`) and rendering a clean HTML error page via `renderErrorPage()`.

### 2. `src/start.ts`
- Configures TanStack Start middlewares:
  - `errorMiddleware`: Catches server-side execution exceptions and returns 500 Response.
  - `csrfMiddleware`: Protects server functions against CSRF attacks.

### 3. `src/routes/__root.tsx`
- Root layout shell managing HTML `<head>`, meta tags, and global CSS stylesheets.
- Wraps application in `QueryClientProvider`.
- Provides custom `NotFoundComponent` (404) and `ErrorComponent` boundaries with telemetry reporting via `reportLovableError`.

---

## 8. Key API & Environment Variables

| Variable | Required | Description | Fallback Behavior |
| :--- | :---: | :--- | :--- |
| `VITE_ORS_API_KEY` | Optional | OpenRouteService API key for pedestrian road routing | Uses straight-line haversine distance & walk speed estimates if omitted |

---

## 9. Development Workflow & Commands

- **Start Development Server**: `npm run dev` (Runs Vite dev server with Nitro HMR on port 3000/8080)
- **Build Production Bundle**: `npm run build`
- **Lint Codebase**: `npm run lint`
- **Format Codebase**: `npm run format`

---

## 10. Summary for Next AI Agent

When taking over or modifying this codebase:
1. **To modify transit network data**: Edit `src/data/network.json`. The graph builder (`src/lib/network.ts`) automatically clusters stops and regenerates the graph at startup without manual graph configuration.
2. **To adjust routing parameters**: Edit `PARAMS` or `PREFERENCE_WEIGHTS` in `src/lib/routing.ts`.
3. **To tweak map styling or layers**: Edit `src/components/MapView.tsx`. Ensure all Leaflet components remain client-side only (guarded by `typeof window !== "undefined"` or `isMounted`).
4. **To extend UI components**: Use existing Radix UI / Shadcn primitives in `src/components/ui/` or add new components following Tailwind v4 styling conventions.
