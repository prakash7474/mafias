# MAFIAS — Cinematic Graveyard Phase 1

Dark gothic cemetery scene inspired by the supplied reference: leaning tombstones, bare trees, a cold moon, ground fog, red smoke, flying bat silhouettes, a distorted portal, and optional sound.

## Run
Install Node.js 20+ then:
```bash
npm install
npm run dev
```
Open the local URL Vite prints (usually http://localhost:5173).

Build:
```bash
npm run build
npm run preview
```

## Sound resources
Add your own original or properly licensed sound files:
- `public/audio/dark-drone.mp3` — quiet loopable atmospheric wind/drone.
- `public/audio/graveyard-whoosh.mp3` — short wind/bat-wing transition sound.

Sound is off by default and starts only after the visitor presses the sound button. The experience works without audio files. Do not use copyrighted tracks without permission.

## Visual resources
The tombstones, crosses, trees, bats, portal, particles, and smoke are generated procedurally in code. No external model or smoke texture is required. Moon and fog are created with Three.js lighting/materials/fog. The fonts are loaded from Google Fonts (Cinzel and Manrope); provide local licensed font files if you need offline operation.

## Performance
- Canvas DPR is capped at 1.45.
- Smoke and sparkles are reduced on narrow screens.
- Smoke uses low-cost transparent sprites, not volumetric simulation.
- If needed, reduce bat count, smoke count, and Sparkles count in `src/scene/GraveyardScene.jsx`.
- This project has not been production-build-tested in this environment; run `npm install` and `npm run build` locally.
