# Flight Tracker 3D

A futuristic, minimalistic 3D globe that visualizes live OpenSky flights with smooth interactions and a glassy HUD overlay. Built with vanilla modules (Three.js + GSAP) so it can be opened directly in the browser or served from any static host.

## Getting started

1. Serve the directory over HTTP (required so the OpenSky API fetch works reliably). Any static server works:
   ```bash
   python -m http.server 4173
   # then open http://localhost:4173
   ```
2. The app auto-fetches flight states every 20 seconds and renders them as instanced neon aircraft on the globe.

## Features

- Realistic day/night earth shader with an atmosphere glow and starfield background
- Smooth orbit, zoom, and pan controls with auto-rotate
- Live OpenSky states pulled every 20s, rendered via instanced meshes for 10k+ flights
- Clickable aircraft details with glassmorphism card, UTC clock, altitude + airline filters, and search
- Per-flight history trail plotted as a glowing polyline on the globe

## Notes

- Data comes from the public OpenSky endpoint: `https://opensky-network.org/api/states/all`
- Some attributes (route, aircraft type) are not included in the public feed and are noted as unavailable
