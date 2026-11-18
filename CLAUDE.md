# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Cubezen: a static "cozy blocky lofi" background page for studying (3D voxel valley or neon city street, generative piano, rain/fire ambience, pomodoro, tasks). Deployed by GitHub Pages straight from `main` (repo root) at https://jgalilea.github.io/cubezen/ — pushing to `main` is deploying. Check a deploy with `gh api repos/{owner}/{repo}/pages/builds/latest`.

**Legal constraint:** everything must stay original. Never use Minecraft music, textures, logo or mobs; in the city, no real brands, logos, shop names or characters (names in `NAMES` in `city/signs.js` are invented, the glyph script is made up), and keep the "Original music & art. Not affiliated with Mojang or Microsoft." notice. Don't embed hidden/audio-only YouTube players (violates YouTube API policies).

## Running

No build step, no package manager, no tests, no linter. The world uses ES modules, so it must be served:

```sh
python3 -m http.server 8931
```

Port 8765 belongs to another of the user's projects — don't use or kill it.

Preview overrides via URL: `?scene=valley|city`, `?time=day|sunset|night|clock|cycle`, `?t=0.72` (0 = midnight, 0.5 = noon), `?season=spring|summer|autumn|winter`, `?fire=0..1`, `?rain=0..1`, `?critter=rabbit|birds|ducks|deer|fox|owl|hedgehog&advance=N` (spawn a visitor and fast-forward N seconds), `?shot` (sets `preserveDrawingBuffer` so the canvas can be read with `toDataURL` for headless screenshots).

## Architecture

Two independent halves talk through globals, so the UI still works if the 3D module fails to load:

- **3D world** (`js/world/*.js`, ES modules, Three.js 0.160 via import map from jsdelivr in `index.html`). `main.js` is the entry point and exposes `window.Scene` (`setRain`, `setFire`, `setTimeMode`, `setSeason`, `setScene`, `state`). `app.js` falls back to a stub `Scene` if it's missing.
- **Classic scripts** (`defer`, load order matters): `composer.js` → `globalThis.Composer`, `audio.js` → `window.Ambience`, `app.js` (UI wiring, localStorage keys `cubezen.prefs`, `cubezen.stats`, `cubezen.world` (time, season, scene), `cubezen.tasks`, `cubezen.layout`, `cubezen.timer` (running timer as its end time), `cubezen.pomo` (timer settings), `cubezen.sleep` (sleep timer end)).
- **PWA**: `manifest.webmanifest` + `sw.js` (registered from `app.js` on https/localhost). Own files are network-first with a cache fallback, the Three.js CDN files cache-first. When adding a file the page loads (script, font, icon) or changing the Three.js version, add it to `SHELL`/`CDN` in `sw.js` and bump `VERSION`.

World pipeline:
- `main.js` is a scene-agnostic engine (renderer, sky, sun/moon/stars, hemi + shadowed sun light, rain, seasonal particles, the grade, the loop). The scene itself is a module loaded with dynamic `import()` from `SCENES`: `valley/index.js` (and `city/`). The contract (`keys`, `camera`, `area`, `fog`, `shadow`, `particles()`, `applySeason`, `applyTime`, `update`, `preview`, `dispose`) is documented at the top of `main.js`; everything a scene creates goes under its `root` group, which `disposeTree()` frees on a switch. Shared helpers live in `common.js`.
- Valley: `valley/build.js` `generateWorld()` fills a voxel grid (block ids in `B`) and exports shared layout (`ground()`, `riverX(z)`, `farm`, `dock`, `camp`, `mine`, `fences`, `bushes`) that `props.js` and `critters.js` use to place things. `buildFar()` continues `naturalHeight()` and the river past the map edge, so terrain changes show up in the background too. Changing terrain/river/cabin positions means checking those consumers and the scene's `camera` in `valley/index.js`.
- `valley/textures.js` paints a procedural 8×4 atlas of 16px tiles (indices in `T`) and repaints it per season from `SEASONS` palettes; new block faces need a tile index here plus mapping in `build.js`.
- City: `city/build.js` `generateCity()` fills its own grid (ids = `T` tile + 1) with the street (road |x|≤5, pavements to |x|=9, buildings from |x|=10, the street runs towards -z from the fixed camera `CAM`), a cross street (`CROSS`), the railway bridge (`BRIDGE`) and towers past `END_Z`; it also collects `signs` (painted into one atlas by `signs.js`, one merged quad mesh with per-sign vertex colours for flicker) and light sources. `props.js` must run before `buildCityMeshes()` because its lamps and lanterns add to `city.lights`, which are baked per vertex into a `neon` attribute added as emissive in the shader. The mesher skips faces turned away from the camera (but keeps tops, which cast the shadows) and ground nobody can see, so moving the camera far means revisiting that. The wet street: the ground doesn't write depth and a mirrored copy (y→2G−y) of the emissive geometry is drawn additively under it, masked by puddle noise at the eye ray's hit point; glows created with `reflect` get a mirrored sprite.
- Meshes are built from the grid with face culling and baked ambient occlusion; plants/crops are separate cross-quad meshes rebuilt on season change. Props and critters are hand-built Three.js meshes with per-season visibility.
- `main.js` drives lighting by interpolating the scene's keyframes (`keys`, sampled by `sampleKeys`) over the day, renders at half resolution (`PIXEL=0.5`) with pixelated upscaling, caps at 30 fps and redraws the shadow map only when the light direction has turned by more than 0.003 rad (`refreshShadows`) or the season changes, so anything that moves won't update its shadow. On slow machines `watchSpeed` steps quality down (1024 hard shadows, then 0.8× render scale; `Scene.state.quality`); never with `?shot`. The loop stops entirely while `document.hidden` (restarted on `visibilitychange`). Fire visuals follow the fire volume slider (`state.fire`, smoothed `fireLevel`).

Audio pipeline:
- `composer.js` is pure JS (no audio): `Composer.compose()` returns `{name, length, events}` for one piece (mode, progression, motif, sections).
- `audio.js` synthesises piano/pad/sub to perform those events (the `sub` events are a soft sustained low note under each chord, added without consuming random numbers; the music bus has a +3 dB low shelf at 150 Hz), plus noise-based rain and fire, through a reverb and a soft limiter. The AudioContext is suspended whenever nothing is audible (music paused, rain and fire at 0) and resumed by any sound (`rest()`). Pause works by gating `musicOut` and stopping all sources registered for the current session; gains start at 0 to avoid a noise burst on init.

## Conventions

- Commits end with the Co-Authored-By / Claude-Session trailer lines; the user is fine with pushing improvements to `main`.
- Keep the README's structure and URL-parameter sections in sync when adding files or parameters.
