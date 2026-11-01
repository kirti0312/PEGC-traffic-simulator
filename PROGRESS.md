# PEGC prototype: progress table

Project folder: `/home/claude/pegc` (everything lives here; originals in /mnt/user-data/uploads are read-only copies).
Full original brief: `docs/SPEC.md`. Visual reference: `docs/reference-screenshot.png`.
Latest handover prompt: `HANDOVER_PROMPT.md` (rewrite it at the end of every step).

| # | Step | Status | Verified how |
|---|------|--------|--------------|
| 1 | Engine core: graph, Dijkstra routing, seeded RNG, car-following, `test:engine` | DONE | 18 Node checks pass |
| 2 | Signals + safety layer (min green, yellow, all-red, hold cap, 90 s wait cap, lockout, violation counter) | DONE | 0 violations, 150 runs |
| 3 | Ambulance, strategies A and B, event log, metrics | DONE | A vs B differ on 6/6 seeds |
| 4 | Strategy C (+C1, C2 ablations), decision log, recovery rule | DONE | 44 log lines checked, 0 mismatches |
| 5a | Canvas renderer files written (camera, theme, scene, sprites, renderer, controller) | DONE | runs with no console errors |
| 5b | Install deps, run renderer in browser, screenshot, fix visuals, check smoothness | DONE | Playwright screenshots (3D, 2D, zoomed); 60 fps at speed 1, 4 and 16 with up to 135 vehicles (headless Chromium, software rendering) |
| 6a | CSS tokens + component CSS | DONE (not yet viewed) | file written |
| 6b (NEXT) | React shell: main.jsx, App.jsx, hooks, TopBar, LegendPanel, AnalyticsPanel, ControlBar (include zoom in, zoom out, Fit all, Follow ambulance buttons wired to the controller), DecisionLog, CommandCentre, Configure, Summary card | TODO | render counter, no per-frame renders |
| 7a | Worker client + Compare screen + SVG charts + summary sentence | TODO | UI stays responsive during runs |
| 7b | Stress Test screen, rerouting, before/after, explanation from real log | TODO | |
| 8 | Motion polish, honesty pass, empty/error states, reduced motion, README, `npm run build`, final test report | TODO | build + static serve |

## Engine test results so far (`npm run test:engine`, 18 passed, 0 failed)
- Same seed, identical metrics (A, B, C); different seeds differ.
- 0 overlaps in 45,360 steps (27 runs, up to 168 vehicles); 0 red-line crossings.
- 0 safety violations over A, B, C, C1, C2 x 10 seeds x 3 densities (150 runs).
- A, B, C have identical traffic and signals until the ambulance appears.
- Blocking a road changes the route; impossible case returns no route and status `no-route`.
- Density change mid-run changes spawn rate. One full headless run about 30 ms.

## Honest findings from first comparison (10 seeds, default scenario W0 to E1, means)
| density | strat | amb time s | avg wait s | longest wait s | max queue | recovery s (n done) |
|---|---|---|---|---|---|---|
| medium | A | 111.6 | 14.8 | 25.2 | 10.0 | 19.6 (2/10) |
| medium | B | 80.1 | 14.2 | 25.6 | 9.7 | 59.8 (8/10) |
| medium | C | 69.3 | 13.5 | 29.0 | 10.4 | 9.4 (7/10) |
| high | A | 113.3 | 16.9 | 27.6 | 16.5 | 30.3 (1/10) |
| high | B | 85.4 | 16.4 | 26.6 | 16.4 | 43.5 (1/10) |
| high | C | 72.2 | 16.7 | 35.4 | 17.9 | 125.9 (2/10) |
Caveats to keep visible in the UI: C has a worse longest wait and (at high) worse max queue and recovery than A and B; recovery time is often not reached within the 420 s horizon (show "not reached", never hide); C1 is nearly identical to C because queue-ahead is mostly 0; spread (sd) must be shown.

## Known issues / to-do notes
- `camera.zoomAt` fixed (cursor-anchored, verified by wheel zoom screenshot). Default zoom 1.9; double-click resets.
- `src/main.jsx` is a TEMPORARY harness (canvas only, query params ?run=C&d=high&view=2d&speed=4). Step 6b must replace it with the real React app.
- Not yet verified: blocked-road barrier drawing, 2D tree sprites close-up, ambulance light glow close-up, route 'old' dashed style.
- Renderer 3D trees/lights/signal heads use screen-space lift; check ordering/looks.
- `npm install` has NOT been run yet; no `node_modules`.
- README not written. Limitations text must be in the UI.

## Camera controls (added after step 5b, verified with screenshots)
Controller methods ready for the control bar in step 6b: `zoomIn()`, `zoomOut()`, `fitAll()` (whole grid), `resetView()` (default close view), `setFollow(bool)` (smooth follow-ambulance camera, zoom 3.0; dragging the map leaves follow mode, wheel zoom keeps it). Snapshot field `follow` tells the UI whether follow is on. Verified: follow keeps the ambulance centred, fit-all shows the full grid with start/end markers, 58.7 fps while following, dragging turns follow off, no errors. Keep the full 6-junction grid (decided with the user); do not shrink the network.

## Step 6b result (done)
Files: `src/main.jsx` (no StrictMode on purpose), `src/App.jsx` (screen state, shared scenario object, launch/nav logic), `src/ui/`: `ctrl.js` (singleton controller, `window.__ctrl` in dev), `hooks.js` (`useSnapshot`, `useRenderCount` writes `window.__renders`), `Num.jsx` (count-up writes DOM directly, no React renders), `Charts.jsx` (`LineChart` only so far), `places.js` (NET, labels, NAV), `TopBar`, `LegendPanel`, `AnalyticsPanel`, `ControlBar`, `DecisionLog`, `SummaryCard`, `CommandCentre`, `ConfigureScreen`, `StubScreen`.
Behaviour: Command Centre shows ambient (no ambulance) traffic; Launch/Watch loads `ctrl.loadRun(scenario)`; strategy change in the control bar reloads the run; density change mid-run is allowed and flagged ("not comparable"); Configure previews route/blocked roads live on the map and shows the no-route message; summary card appears when a run finishes; Space toggles play.
Visual changes made in 6b: roads drawn wider, lane offset 3.9 (drawing only), default zoom 2.4 (3D) / 1.5 (2D), top bar hides the long subtitle below 1560 px and the scenario badge below 1320 px.
JSX note: never write `\uXXXX` escapes in JSX text (they print literally); use real characters.
Remaining UI work: Compare (7a) and Stress (7b) replace `StubScreen`; extend `Charts.jsx` with grouped bars, bars and scatter; add a worker client (`new Worker(new URL('../engine/worker.js', import.meta.url), {type:'module'})`).

## Visual-match pass (after 6b, done)
User complained the look did not match `docs/reference-screenshot.png`. Changes: camera now front-facing oblique (theta 0.07, tilt 0.6) instead of a 26 degree rotation; default view centres on a junction (`cam.home`, J01 + 40 m) at zoom 4.4 (3D) / 2.2 (2D), max zoom 9, follow zoom 5.4; junctions drawn with concave corner fillets (`fillets()` in scene.js), light-grey kerb outline, bigger yellow-green island with white ring, thicker long median bars; trees reduced to a few per road; cars dark charcoal and slightly larger; legend collapsed by default.
Still NOT the same as the reference (be honest about it): no true perspective (roads do not converge; canvas 2D affine only), no 3D buildings, one lane per direction, signal heads smaller than the reference. A true-perspective renderer would need per-sprite local transforms (large rewrite): offer it as optional, do not start it unasked.

## Camera presets (after visual-match pass, done)
`cam.setPreset('close'|'wide'|'fit')` / `ctrl.setPreset(name)`: Command Centre uses 'close' (one junction, like the reference), Watch uses 'wide' (zoom 1.55 3D / 1.0 2D: four to six junctions visible), Configure uses 'fit'. App.jsx sets the preset on every screen change. Reason: the close-up hid the multi-junction grid the user needs to check the ambulance crossing several junctions.

## Navigation UX fix (after camera presets, done)
User reported zoom too fast, could not move around when zoomed, not smooth. Fixes: wheel zoom is proportional to the wheel delta (capped per event, factor exp(-delta*0.0016)) and eased toward `cam.targetZoom` by `cam.animate(dt)` keeping the cursor point fixed; buttons zoom x1.4; drag pans (left button) and leaves follow mode; keyboard: arrows/WASD pan (Shift = bigger), + and - zoom, 0 = fit all, Space = play/pause, double-click resets view; pan is clamped to the network plus 120 m so the map cannot be lost; vehicles, props and glows outside the screen are culled. Measured in headless Chromium: 3 mouse-wheel notches = x1.33 zoom animated over about 0.5 s; 60 fps at fit-all and at zoom 3.8.

## Layout, zoom limits and city backdrop (done, user feedback)
User feedback: zoomed-out view left empty space and the grid became very small; panels hid the roads; charts/tables must be balanced and must not hide the grid.
Changes: (1) minimum zoom is now 1 = whole grid fits the free area (was 0.6). Verified zoom never goes below 1 and never decreases while zooming in. (2) `drawDecorWorld` + `drawBuildings` in `src/render/scene.js`: dimmed decorative city (extra roads, blocks, low buildings, parks) around the simulated grid, no traffic, not part of any result; `GRID` constants set its extent. (3) Panels are docked: right analytics column (288 px, full height), wide decision-log strip bottom-left, legend collapsed top-left, control bar bottom. App.jsx computes camera `insets` from the screen and from which panels are open (`legendOpen/analyticsOpen/logOpen` state lives in App), and `Camera.setInsets` keeps the same world point centred, so the map is always centred in the space the panels leave free. (4) New `.dock` CSS class (right column, width min(62%, 820px)) for Compare and Stress Test: the map stays visible on the left in 'fit' preset. STEP 7a/7b MUST build their content inside `.dock` (see `StubScreen.jsx`) and arrange it as a balanced layout: summary sentence and strategy cards on top, table in the middle, a 2x2 grid of charts below; never cover the map. Buildings are drawn in screen space with `cam.project`; `mix()` in theme.js returns hex.

## Fit framing (done, user feedback: six junctions must fill the view)
`worldBounds()` now returns `{full, cluster}`. `cluster` = the six junctions plus a small margin (62 m sideways, 78 m up/down); `full` = everything including the long entry/exit roads. Camera presets: 'close' (one junction), 'fit' (cluster, zoom 1; used by Watch and Compare and by the Fit all button, `0` key), 'full' (used by Configure and Stress Test so origin/destination markers on the entry roads are visible). Minimum zoom is 1 of the current framing. Verified in screenshots at 1366x768 and 1920x1080: all six junctions J00..J12 fill the free map area in Watch, Compare and Configure.

## Minimap and wheel modes (navigation fix)
- Overview minimap (`src/ui/Minimap.jsx`, drawn by `Renderer.drawMinimap()` each frame): roads plus the visible-area rectangle. Click or drag it to move the view (`ctrl.panToWorld`, `ctrl.minimapToWorld`).
- Control bar "Wheel: Zoom | Move". Zoom (default): wheel zooms. Move: wheel and touchpad scroll pan the map. Ctrl+wheel or pinch always zooms.
- Sideways scroll and Shift+wheel always pan. Drag and arrow keys still pan.
- Controller: `setWheelMode`, `attachMinimap`, `panToWorld`, `minimapToWorld`. Snapshot has `wheelMode`.
- Playwright check: minimap click/drag moves the view with zoom unchanged; sideways, Shift and Move-mode wheel pan; no errors.
- Placement: Watch top-right (shifts left when Analytics is open); Compare/Stress top-left.

## Google-Maps-style navigation (camera + canvas only)
- Camera: `flyTo(x,y,zoom,dur,track)` eased glide (cancelled by any input; `track` follows a moving target), drag-release inertia (`vx,vy`, decays), `clusterCentre()`.
- Renderer: flick velocity on pointer release; double-click zooms in on the cursor (was: reset).
- Controller: `fitAll()`/`resetView()` now glide to the six-junction overview; new `centerAmbulance()`.
- UI: "Overview" and "Center ambulance" buttons, key `C`; `0` = overview, `+`/`-` zoom.
- Browser test: wheel zoom is cursor-focused (point under cursor moved 0 m), +/- buttons, drag, flick glide, overview animated, double-click zoom, sim time advances while navigating, ambulance centred (0 m paused). 18/18 engine tests, build OK, no console errors.

## Photo-style wheel (default changed)
- Default wheel mode is now **Move**: wheel/trackpad scroll pans up/down/left/right. Ctrl+wheel or trackpad pinch zooms (smooth, cursor-focused). Drag pans freely. The Wheel Zoom/Move switch remains (choose Zoom to make the plain wheel zoom).
- Files: src/render/controller.js, src/render/renderer.js (default `wheelMode = 'move'`), src/ui/ControlBar.jsx (labels/tooltips).
- Browser test: scroll up/down/left/right/diagonal pan with zoom unchanged; drag in 4 directions; Ctrl+wheel in/out zooms with 0 m cursor drift; sim time advances; page not zoomed; no errors.

## Step 7a: Compare screen (done)
- `src/ui/compareStore.js`: runs `runComparison` in the Web Worker (main-thread fallback), keeps the last result across screen switches.
- `src/ui/compareLogic.js`: metric list, formatting, improvement vs A, and the neutral summary sentence built only from the aggregates.
- `src/ui/CompareScreen.jsx` (in `.dock`): traffic / seeds (5, 10, 20) / ablations toggle / Re-run; summary; strategy cards; table (mean ± sd, improvement vs A, worse shown as worse, "reached in n of N" for recovery and ambulance time); 2x2 charts (ambulance time bars with sd, avg and longest wait, max queue and recovery, trade-off scatter) via `BarChart` and `TradeoffChart` in `Charts.jsx`.
- Honesty rule added: improvement % is NOT computed when the means come from different subsets of runs (e.g. recovery reached in 1 of 10 for A vs 7 of 10 for C); the table says "not compared with A".
- Browser check: results match an independent headless `runComparison` (medium, seeds 7-16: A 113.3 s, B 76.0 s, C 67.3 s); worker used; ablation columns; high traffic; no console errors. C is worse than A on longest wait (28.4 vs 24.7 s) and says so.

## Step 7b: Stress Test screen (done)
- `src/engine/stress.js` (pure): `stressScenario`, `routeFor`, `routeLength`, `junctionsOn`, `routeSegments`, `pickRouteRoad`. Engine tests 25/25 (7 new: pick road, reroute avoids blocked road, detour not shorter, ambulance finishes, traffic stress only changes density, no-route when W0|J00 closed, no-route run does not crash and reports no ambulance result).
- `src/ui/stressStore.js`: runs before/after A/B/C comparisons in the worker (main-thread fallback); keeps choices and last result.
- `src/ui/StressScreen.jsx`: High traffic / Block a road / Both; road chips (route roads outlined, one pre-picked); Run; "What changed" text built from real numbers; before -> after table (worse shown as worse, partial-run metrics not compared); before/after bar charts; real decision-log lines from Strategy C; no-route message (no after results invented); map overlay (old dashed, new solid, blocked hatched), cleared when leaving.
- Browser check: numbers equal an independent headless runComparison. Medium, W0->E1, seeds 7-16: block J01|J02: A 113.3->125.2 s, B 76.0->77.0, C 67.3->69.3. Both stresses: A 149.8, B 87.6, C 75.8 s; PEGC average wait 13.3->37.8 s and longest wait 28.4->104.8 s (worse than A's 27.8 / 51.9) - shown as worse.
- Honest note: for W0->E1 the reroute has the SAME length (equal-length alternatives exist on the grid); the screen says so.
- Fixed: `.btn.primary:hover` lost its gradient (dark text on dark).

## Custom traffic rate (done, after 7b)
- Scenario now has `rate` (veh/h per entry point) used only when `density === 'custom'`; presets low/medium/high unchanged. `CONFIG.rateMin/rateMax` = 100/900. `entryRate(scenario)` (clamps; invalid values fall back to medium), `trafficLabel`, `trafficShort`, `DENSITY_CHOICES` in `src/engine/config.js`; `sim._spawn` reads the rate only through `entryRate`.
- UI: shared `src/ui/TrafficPicker.jsx` (presets + Custom slider/number box, shows rate x entries = total) on Configure and Compare; Watch control bar has a "custom" button plus a small number box (mid-run change is flagged as not comparable); top bar, summary card, Compare sentence and Stress text show "custom 700 veh/h per entry". Stress "High traffic" is warned as a no-op when the baseline is already >= the high preset.
- Fairness: every strategy gets the same scenario object (same rate and seeds). Tests: custom rate equal to a preset reproduces that preset exactly; entered vehicles 150<450<800 (180<539<892); A/B/C identical traffic before the ambulance; A/B/C identical total demand (entered + still waiting) over seeds 9-11. NOTE: `entered` alone can differ between strategies at very high rates because cars still queued at an entry road at the end of the horizon are not counted as entered; that is a congestion effect, not different demand.
- Compare numbers at custom 700, seeds 7-16 equal an independent headless run (A 162.7 s, B 86.3, C 74.9; PEGC average car wait is 9.7% worse than A there and is shown as worse).
- Engine tests: 33/33.

## Control bar fixes (this session)
- Bar fits at >= 1366 px wide (custom mode too): wheel Zoom/Move is one toggle button "Wheel: Zoom|Move"; hint and seed text hidden under 1700 px; labels hidden under 1800 px; "Follow/Center ambulance" shorten under 1500 px.
