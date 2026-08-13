# Nagpur Commute Navigator

I am developing a Last-Mile Public Connectivity Platform for Nagpur City. The platform should work conceptually like Google Maps, but its primary purpose is public-transport routing using buses, metro, and walking connections.

I will provide a dataset containing:

Bus routes

Bus stops belonging to each bus route

Metro stations

Metro routes

Bus/metro route relationships where available

The dataset is incomplete and will be expanded continuously. Therefore, design the system so that adding new bus routes, stops, and metro stations later does not require major changes to the routing algorithm.

Main User Flow

The user enters:

Source

Destination

The system should then calculate and display the best public-transport journey.

For example:

Source → Destination

Walk 100 m → Bus Stop A
Take Bus 123 → Metro Station X
Walk/transfer → Metro Station X
Take Metro → Metro Station Y
Take Bus 456 → Bus Stop C
Walk 50 m → Destination

The system should generate this route automatically from the available dataset.

Routing Requirements

Build a multimodal transportation network containing:

Walking paths

Bus stops

Bus routes

Metro stations

Metro routes

Transfer connections between bus and metro

Walking connections between the source/destination and nearby transport stops

The system should:

Find the nearest bus/metro stop to the source.

Find the nearest bus/metro stop to the destination.

Determine which bus routes serve each stop.

Determine possible bus-to-bus transfers.

Determine possible bus-to-metro transfers.

Determine possible metro-to-bus transfers.

Include walking segments where necessary.

Generate multiple possible public-transport routes.

Select the most suitable route using routing algorithms such as Dijkstra or A*.

Avoid impossible transfers.

Handle cases where no public transport route is available.

Route Optimization

The system should support different routing preferences:

Fastest route

Shortest walking distance

Fewest transfers

Lowest estimated CO₂ emissions

Balanced/overall best route

The architecture should allow these criteria to be changed without rewriting the entire routing system.

Example Output

For a user searching:

Source: Location A
Destination: Location B

The system could return:

Recommended Route

Walk 120 m
↓
Bus Stop A

Bus 123
↓
Get down at Metro Station X

Walk 150 m
↓
Metro Station X

Metro Aqua Line
↓
Metro Station Y

Bus 205
↓
Bus Stop C

Walk 80 m
↓
Destination


And show:

Total distance

Estimated travel time

Walking distance

Number of transfers

Bus numbers

Metro line

Boarding stop

Exit/get-down stop

Estimated CO₂ emissions

Route on an interactive map

Dataset Constraint

Do not assume that the dataset contains every Nagpur bus route.

The current dataset represents only the routes and stops I have been able to collect.

The system must therefore be designed as an incrementally expandable transportation network.

For example:

Current Dataset
    ↓
Bus Route 1
Bus Route 2
Bus Route 3
Metro Route 1
    ↓
Routing Engine


Later:

Updated Dataset
    ↓
Bus Route 1
Bus Route 2
Bus Route 3
Bus Route 4
Bus Route 5
Metro Route 1
Metro Route 2
    ↓
Same Routing Engine


Adding data should automatically make more routes available to users.

Important Requirement

Do not build a simple route finder that only searches for a direct bus between two stops.

Build a multimodal graph-based routing system capable of finding journeys involving:

Walking → Bus → Walking → Metro → Walking → Bus → Walking

or any other valid combination supported by the available data.

The final system should behave like a Google Maps-style public transportation planner for Nagpur, with the current dataset acting as the initial transport network and allowing additional routes/stops to be added later.

Focus first on making the routing logic and dataset integration reliable. The visual interface can then display the calculated journey in a simple, clean, map-based format.

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/094f00f1-9561-4afa-a5a0-e22acc010d05).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
