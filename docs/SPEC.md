ROLE
You are a senior front-end engineer and traffic-simulation developer. Build the complete front-end prototype of the project below from scratch, using React for the interface and a plain-JavaScript traffic simulator drawn on a Canvas. A UI screenshot is attached as the visual design reference. Match its layout, colours and mood closely. Do not invent a different design style.

PROJECT
PEGC (Predictive Emergency Green Corridor) is a traffic simulation that tests signal strategies to reduce ambulance and fire-engine delay without causing excessive congestion elsewhere. The same traffic scenario is run under three strategies, and the results are compared using measured data. The final project will use SUMO, a FastAPI backend and a trained arrival-time predictor. THIS task is only the browser prototype with its own mini traffic simulator.

HONESTY RULES (mandatory)
- Show a permanent, visible label: "Browser mini-simulator: not SUMO results".
- Never hard-code or invent result numbers. Every metric, chart and comparison value must be computed from real simulation runs.
- Do NOT claim machine learning is implemented. The ambulance arrival-time estimate is rule-based (distance, speed and queue ahead). Label it "rule-based estimate".
- If a strategy performs worse on a metric, show it as worse. Never hide negative results.
- Include a short "Limitations" note in the UI: simulated six-junction grid, simplified driver behaviour, no real-world validation.

DESIGN REFERENCE AND COLOURS (attached screenshot)
Follow the screenshot's layout, palette and atmosphere. Before coding, sample the actual colours from the screenshot and define them once as CSS variables. If you cannot sample them, use these approximations and adjust by eye:
- App background and ground: very dark charcoal, matte (about #14181d to #1b1f24)
- Road surface: dark grey (about #2b3036), kerbs and pavements slightly lighter (about #3a4048)
- Lane lines and crosswalks: soft off-white (about #e6eaee), at reduced opacity
- Median strips and road highlights: muted yellow-green (about #c9dc4a)
- Signal heads: red (#ff4d4d), amber (#ffc233), green (#3be37a), glowing slightly
- Trees: muted green (about #5d8a3c) with darker trunks
- Accent for active controls and key data: muted teal (about #1fb5a5); secondary accent muted purple (about #6a3fd0), used sparingly
- Ambulance: white body with alternating blue and red light glow
- UI panels: translucent dark glass over the scene (about #0f1318 at 80 to 90% opacity), thin subtle borders, small rounded corners, small text
Keep everything muted and low-contrast like the reference. Bright colours appear only on signals, the ambulance, the route line and key numbers.

Layout to match:
- A compact top bar (project name, scenario and status, strategy badge, the prototype label, five-screen navigation)
- A collapsible LEFT legend panel (signal colours, ambulance, queued vehicles, route, blocked road)
- A RIGHT analytics panel with live metrics and mini charts
- A BOTTOM floating control bar (play/pause, restart, speed, traffic density, strategy selector, 2D/3D view toggle, seed indicator)
- A realistic smart-city environment: wide junctions with lane lines, crosswalks, kerbs, yellow median strips, a small roundel or signal island if it suits, low-poly trees, street lights, bus shelters, signal poles with glowing heads, cars with headlights and brake lights
- Camera: the reference uses a tilted view. In Canvas 2D, approximate it with a fixed oblique projection, with a "2D" toggle for pure top-down. If the oblique view cannot be made to look good, use a polished top-down view and say so.
- Use the project's own name and wording. Do not copy any branding, names or text visible in the screenshot.

MOTION AND "ALIVE" FEEL (important)
The prototype must look like a living city, not a static diagram:
- Vehicle motion is smooth: render at display frame rate by interpolating between simulation steps. Vehicles accelerate, brake, creep forward in queues and have a visible brake-light glow when slowing.
- Headlight beams or soft glow in front of vehicles. A short fading light trail behind the ambulance.
- The ambulance has alternating blue and red flashing lights that cast a glow on the road, and its route is a glowing line with an animated, flowing dash pattern.
- Signals fade between states and pulse gently. Show a small countdown or state indicator near each junction's active phase.
- Subtle ambient life: a gentle sway on trees, soft pulsing on the status indicator, a calm idle animation on the Command Centre.
- Numbers in the analytics panel animate when they change (count up or down smoothly). Charts draw in with a short animation and update live.
- Screen changes use short, smooth transitions. Panels slide or fade in.
- Respect prefers-reduced-motion: switch off decorative motion (trails, sway, panel animations) but keep vehicles moving.

SCREENS (five, navigated from the top bar)
1. Command Centre: the city overview with live ordinary traffic, simulation status, key metrics, a prominent "Launch simulation" button, and navigation to the other screens.
2. Configure Scenario: ambulance origin and destination, traffic density (low, medium, high), random seed, blocked road selection, strategy to watch. Settings live in one scenario object reused by every strategy.
3. Watch Simulation: the main live view with the full control bar, live analytics panel and decision log.
4. Compare Strategies: A, B and C side by side with tables and charts.
5. Stress Test and Explain: apply harder conditions (high traffic, a blocked road on the current route, or both), rerun all strategies, and explain what changed.

TECHNICAL ARCHITECTURE
- Stack: React 18 with Vite. Dependencies allowed: react, react-dom, vite and @vitejs/plugin-react only. No UI kit, no chart library, no Tailwind, no state library. Write plain CSS with CSS variables (one file for tokens, component styles alongside).
- Project structure:
  src/engine/   pure JavaScript, no React, no DOM: network, routing, vehicles, signals, safety layer, strategies, metrics, seeded RNG, scenario runner
  src/render/   canvas renderer: static scene drawing, vehicle sprites, effects, camera projection
  src/ui/       React components: TopBar, LegendPanel, AnalyticsPanel, ControlBar, DecisionLog, ConfigureScreen, CompareScreen, StressScreen, CommandCentre, Charts
  src/App.jsx, src/main.jsx, src/styles/
- The simulation engine and canvas must NOT run through React state. Mount one <canvas> with a ref. Run the simulation and drawing in a requestAnimationFrame loop owned by a plain JavaScript controller object. React must never call setState per frame.
- React reads a lightweight snapshot (metrics, signal states for the legend, the log length, run status) from the controller at about 4 to 5 times per second, through a throttled subscription or useSyncExternalStore. Memoise components, and keep the decision log virtualised or capped at the latest entries.
- Static scene (ground, roads, markings, medians, kerbs, trees, shelters, light poles) is drawn once to an offscreen canvas and redrawn only when the view changes. Each frame draws only dynamic items (vehicles, signals, effects). Pre-render vehicle and tree sprites where possible. Target a smooth frame rate with 100 to 150 vehicles.
- Headless comparison runs must not freeze the interface. Run them in a Web Worker, or in chunks yielding to the browser, and show a progress indicator. The engine must work identically in the main thread, a worker, and Node.
- Everything must build with `npm install` and `npm run dev`, and produce static files with `npm run build`. The built result must also work when served as static files. Provide a `npm run test:engine` script that runs engine checks in Node without the browser.

SIMULATION ENGINE
Network
- Six signalised junctions in a 2-row by 3-column grid, joined by two-way roads with boundary entry and exit points on every outer side. Use graph structures (nodes, directed edges with length and axis).
- Shortest-path routing (BFS or Dijkstra) that respects blocked roads. If no route exists, say so clearly in the UI. Never invent a route.

Vehicles
- Fixed timestep (about 0.25 s of simulated time per step), independent of the display frame rate. Speed control changes steps per frame only. Rendering interpolates between steps.
- Car-following: vehicles accelerate toward a target speed, brake smoothly, keep a minimum gap, stop at red and yellow stop lines, and never overlap or pass through each other.
- Spillback: a vehicle does not enter the next road segment if its entrance is blocked.
- Queues form naturally behind red signals and are counted per approach.
- Ordinary vehicles spawn at entry points using a seeded random generator at rates set by traffic density, with random destinations.
- The ambulance is a special vehicle with a higher top speed, its own route, flashing lights and a glowing route line. It enters after a warm-up period so it is measured in a busy network.

Signals
- Each junction runs an explicit state machine: green for one axis, then yellow, then all-red, then green for the other axis.
- Safety rules enforced by a separate safety layer that every strategy must pass through:
  - minimum green 7 s, yellow 3 s, all-red 2 s
  - conflicting directions are never green together
  - maximum emergency hold 25 s per junction
  - no approach waits longer than 90 s (this overrides emergency requests)
  - a short lockout against rapid flip-flopping
- Count and display safety violations (target is 0), checked every step.

Randomness and fairness
- Seeded pseudo-random generator so the same seed gives identical traffic.
- All strategies run on the same network, demand, ambulance route, blockages and seed. Random numbers must be consumed identically regardless of strategy.

STRATEGIES (same interface, selectable)
- A, Fixed-time: preset cycle, ignores the ambulance.
- B, Basic ambulance priority: when the ambulance is within a set distance of a junction, request the ambulance's axis immediately, ignoring cross traffic and queues. Safety clearance still applies.
- C, PEGC (predictive, queue-aware):
  1. Estimate the ambulance's arrival time at each upcoming junction from distance, speed and the queue ahead in its lane (rule-based).
  2. Compute lead time: remaining minimum green plus yellow plus all-red plus the time to discharge the queue in the ambulance's lane.
  3. Consider hold, switch now, or switch at the prepared time. Compare the ambulance delay saved against the cross-street cost (cars interrupted, longest wait, risk of downstream spillback).
  4. Pass the chosen action through the safety layer.
  5. Prepare the next junctions on the route in sequence.
  6. Recovery: after the ambulance passes a junction, release the hold and serve the approach with the largest queue and waiting time first, until queues return near their pre-ambulance level.
- Optional if time allows: C1 (PEGC without queue awareness) and C2 (PEGC without recovery) as ablations.

DECISION LOG
Each important controller action writes a plain-language line generated from real values: the junction, ambulance ETA, queue size ahead, action chosen, the reason, and whether the safety layer delayed it. Also log recovery actions and safety interventions. Never hard-code messages as if they were events. Show a scrolling, timestamped log in the Watch screen, with new entries animating in.

METRICS (all computed from the run's event records)
- Ambulance travel time, live ETA, number of stops
- Average waiting time of ordinary vehicles
- Longest single wait at any approach
- Maximum queue length
- Throughput (vehicles completed per hour of simulated time)
- Recovery time: time after the ambulance's last junction until total queued vehicles stay near their pre-ambulance average for a sustained period (state the rule in the UI and use it identically for every strategy)
- Safety violations
- Improvement percentage versus Strategy A for metrics where lower is better. Show negative values as negative.

COMPARISON AND CHARTS
- The Compare screen runs A, B and C headlessly on the same scenario and several consecutive seeds, then shows mean values (and spread if feasible) in a table.
- Charts drawn with SVG or Canvas in React components, no library: grouped bars for ambulance travel time and average waiting time, bars for maximum queue and recovery time, and a trade-off scatter of ambulance travel time against ordinary-vehicle waiting time. In the Watch screen, show a small live queue-length-over-time line chart. Charts animate in and use the muted palette with teal as the highlight for Strategy C.
- Generate a neutral, plain-language summary sentence from the measured numbers.

STRESS TEST
Provide buttons for high traffic, blocking a road on the ambulance's current route, and both. After applying the change, recompute the route, rerun all strategies and show before and after values, the old and new routes (route redrawn on the map), and a short explanation of what changed using real logged decisions. If no route exists, say so plainly.

SIMULATION SUMMARY
When a run ends, show a summary card with the calculated metrics, the safety-violation count, the scenario settings and the seed.

IMPLEMENTATION STAGES (build in this order, testing each before moving on; each stage must leave a working project)
1. Engine in Node: graph, routing, seeded RNG, vehicles with car-following, plus a `test:engine` script. Acceptance: no overlaps, and the same seed reproduces identical results.
2. Signals and safety layer. Acceptance: zero conflicting greens over a long run.
3. Ambulance, strategies A and B, event logging and metrics. Acceptance: A and B replay the same scenario with different outcomes.
4. Strategy C and the decision log. Acceptance: C's decisions change when queues change, and every log line matches real values.
5. Canvas renderer: static scene matching the reference, vehicle sprites, signals, ambulance effects, route animation, interpolation, 2D toggle. Acceptance: it looks like the reference at a glance and moves smoothly.
6. React shell: top bar, legend, analytics panel, control bar, five-screen navigation, scenario configuration, throttled snapshot subscription. Acceptance: no per-frame React renders.
7. Compare and Stress Test with worker-based runs, tables, charts, summary sentence, rerouting. Acceptance: the interface stays responsive during runs.
8. Motion and polish pass, then the honesty pass: labels, limitations note, empty and error states, reduced-motion support, performance check.

TESTING REQUIREMENTS (state the results at the end)
- Same seed gives identical metrics on repeated runs.
- No vehicle overlaps another, and none crosses a red stop line.
- Safety violations equal 0 for all strategies across at least 10 seeds and 3 densities.
- A, B and C use identical traffic until the ambulance appears.
- Blocking a road changes the route, and an impossible case shows a clear message.
- Pause, restart, speed and density controls work mid-run.
- Every number on screen can be traced to a run, and no result value is typed in by hand.
- React does not re-render per frame (verify with the profiler or a render counter), and the simulation stays smooth at the highest speed setting.
- `npm run build` succeeds and the static output runs.

DELIVERABLE AND WORKING STYLE
- Deliver the full project (every file with its path), plus a README explaining setup, controls, parameters, how metrics are defined and the known limitations. Put all tunable parameters in one config file.
- If output length is a problem, build stage by stage and give a complete working project at each stage. Do not start the visual layer before the engine passes its checks.
- Ask a question only if something truly blocks progress. Otherwise state your assumption in one line and continue.
- Do not claim anything is verified unless you ran the check. If you could not test something, say so.
- Keep the final answer concise: what was built, what was tested, what is missing.