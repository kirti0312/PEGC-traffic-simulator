# PEGC: Predictive Emergency Green Corridor

A traffic simulation platform that tests signal-control strategies for reducing ambulance and fire-engine delay **without causing excessive congestion elsewhere**.

[Problem](#1-the-problem) · [Solution](#2-the-proposed-solution) · [Strategies](#3-strategies-compared) · [How PEGC decides](#4-how-pegc-decides) · [Architecture](#6-system-architecture) · [Demo](#8-the-browser-demo) · [Setup](#9-setup-and-usage) · [Experiments](#10-experiments-and-metrics) · [Results](#11-results) · [Future work](#13-future-work)

> The repository includes a browser demo with its own mini traffic simulator. Its numbers come from that simulator and are **not** SUMO results.

---

## 1. The problem

An ambulance that meets a red light or a queue loses time that can matter for a patient. Cities answer with emergency priority, but crude priority has a hidden cost: forcing green for the ambulance can leave cross streets jammed, and the jam can outlast the emergency.

The task is to build a simulation that tests signal strategies to reduce emergency-vehicle delay **without** causing excessive congestion elsewhere. The two goals pull against each other, so PEGC is built to **measure the trade-off**, not assume it away.

## 2. The proposed solution

PEGC runs one traffic scenario under several signal strategies and compares the results using the same road network, demand, ambulance route and random seed.

At its core is a controller (Strategy C) that:

1. **Predicts** (machine learning) when the ambulance will reach each junction on its route, allowing for queues ahead.
2. **Pre-clears** the path by starting each signal change early enough to cover yellow, all-red and the queue in the ambulance's lane.
3. **Optimises** (cost-based optimisation) each decision by weighing ambulance delay against cross-street waiting, downstream spillback and starvation of any approach.
4. **Recovers** normal traffic after the ambulance passes.
5. **Stays safe**, because every command passes through a separate safety layer that no strategy can override.

Every decision is written to a plain-language log built from real values, so the controller can explain itself.

**Where AI is used.** PEGC combines a learned arrival-time predictor (machine learning) with cost-based optimisation that chooses the signal action (classical AI planning, not machine learning). The safety layer and the recovery rule are fixed rules, because safety guarantees should never depend on a learned model. The project does **not** use reinforcement learning or deep learning: optimisation was chosen because it is safer, easier to explain and more reliable within the project timeline, and reinforcement learning is listed under future work. The browser demo uses a rule-based estimate and does not include the trained model.

## 3. Strategies compared

| ID | Strategy | Purpose |
|---|---|---|
| A | Fixed-time signals | Baseline: ordinary operation, ignores the ambulance |
| B | Basic emergency priority | Forces the ambulance's direction green when it is near, ignoring cross traffic |
| C | Full PEGC | Predictive, queue-aware corridor with recovery |
| C1 | PEGC without queue awareness | Ablation: tests whether queue awareness helps |
| C2 | PEGC without recovery | Ablation: tests whether recovery helps |

The ablations show *which part* of PEGC creates any benefit, not only whether the whole system performs well.

## 4. How PEGC decides

For each junction ahead of the ambulance:

1. **Predict arrival time (machine learning).** A trained model estimates when the ambulance will reach each upcoming junction from its distance, speed and the queue ahead in its lane. The model is specified below.
2. **Compute lead time.** The remaining minimum green, plus yellow, plus all-red, plus the time needed to discharge the queued vehicles in the ambulance's lane.
3. **Compare actions.** Hold the current phase, switch now, or switch at the prepared moment.
4. **Score each action** on four things: ambulance delay, cross-street waiting, risk of downstream spillback, and the longest wait on any single approach. Ambulance delay carries the most weight but never enough to ignore the others. The weights are set in the controller configuration and tuned on separate seeds.
5. **Filter by safety.** Any action that breaks a safety rule is delayed or rejected, however good its score.
6. **Choose the best remaining action** and log the inputs, the choice and the reason.
7. **Prepare the next junction** on the route in the same cycle.

**Recovery.** After the ambulance clears a junction, the hold is released and the approach with the largest queue and waiting time is served first, until queues return near their pre-ambulance level.

**Which steps are AI.** Step 1 is machine learning. Steps 2 to 6 are optimisation and fixed rules, not machine learning, and the recovery stage is a fixed rule.

**Arrival-time predictor (machine learning).** A small supervised model, trained on simulated ambulance runs, predicts arrival time. It is evaluated on traffic it has never seen, split by seed or scenario and not by random rows.

| Item | Value |
|---|---|
| Prediction target | Time for the ambulance to reach the stop line of each upcoming junction |
| Features | Distance, current speed, queue ahead, signal state, traffic density |
| Algorithm | TBD |
| Training data | TBD |
| Evaluation split | Held-out seeds |
| Mean absolute error | TBD |
| Baseline compared against | Distance divided by speed (error: TBD) |

The predictor is judged by two checks: it must beat the simple distance-and-speed baseline on unseen data, and its predictions must change signal decisions. Both results are reported in [Results](#11-results).

## 5. Safety rules

Enforced by a separate layer that every strategy passes through:

| Rule | Value |
|---|---|
| Minimum green | 7 s |
| Yellow | 3 s |
| All-red | 2 s |
| Maximum emergency hold per junction | 25 s |
| Maximum wait for any approach | 90 s (overrides emergency requests) |
| Anti-flapping lockout | 10 s |

Conflicting movements are never green together. After each run an audit counts conflicting greens and clearance violations. The required result is **zero**. Audit results are reported in [Results](#11-results).

## 6. System architecture

```
Frontend (React)  <-->  Backend (FastAPI, REST + WebSocket)
                              |
        +---------------------+---------------------+
   Simulation engine     Controller layer       Metrics engine
   (SUMO via TraCI)      (A, B, C, ablations)   (event log -> KPIs)
                              |
                         Safety layer
                (min green, clearance, caps, conflicts)
```

**Main loop, every simulated second:**

1. The simulator advances and returns a state snapshot (positions, queues, signal phases, free space downstream).
2. The predictor updates the ambulance's arrival times.
3. The selected controller proposes signal commands.
4. The safety layer approves, delays or rejects each command.
5. Approved commands are applied; events and decisions are logged.
6. The state is streamed to the dashboard.

**Technology**

| Layer | Technology |
|---|---|
| Traffic simulation | SUMO, controlled from Python through TraCI |
| Controllers and prediction | Python, scikit-learn |
| Backend | FastAPI with WebSocket |
| Frontend | React with a canvas map |
| Data and analysis | pandas, matplotlib, CSV or SQLite |

## 7. Project status

- [x] Six-junction road network
- [x] Seeded traffic generation
- [x] Strategy A (fixed-time)
- [x] Strategy B (basic priority)
- [x] Strategy C (PEGC)
- [x] Ablations C1 and C2
- [x] Safety layer and audit
- [ ] Arrival-time predictor
- [x] Metrics engine
- [ ] FastAPI backend
- [ ] SUMO pipeline
- [x] React dashboard
- [x] Blocked-road rerouting
- [x] Browser mini-simulator demo

## 8. The browser demo

The repository includes a front-end prototype with its own **mini traffic simulator written in JavaScript**. It shows moving vehicles, queues, signals, the ambulance, a decision log and a strategy comparison, all computed from the demo's own simulation runs.

- It is clearly labelled in the interface: **"Browser mini-simulator: not SUMO results."**
- Its numbers describe the mini-simulator only and must not be quoted as SUMO results.
- Its arrival-time estimate is rule-based. The machine learning model belongs to the full pipeline, not the demo.
- In the full build, SUMO replaces the mini-simulator engine behind the same screens.

**Screens:** Command Centre, Configure Scenario, Watch Simulation, Compare Strategies, and Stress Test and Explain.

## 9. Setup and usage

**Requirements:** Node.js 18 or later.

```
git clone <repo-url>
cd pegc
npm install
npm run dev
```

Open the address that Vite prints. Other commands:

```
npm run test:engine   # simulation-engine checks, run in Node
npm run build         # production build
npm run preview       # serve the production build
```

**Run one scenario:** open the Configure screen, choose a scenario and launch it.
**Compare strategies:** the Compare screen runs A, B and C (and optionally the ablations) on the same scenario and consecutive seeds in a background worker.

**Repository structure**

```
pegc/
  src/
    engine/    network and routing, vehicles, signals, safety layer, strategies,
               seeded random numbers, scenario runner, stress tests, worker, tests
    render/    canvas renderer, camera, scene, sprites, controller
    ui/        React screens and panels
    styles/    design tokens and component styles
  docs/        specification and visual reference
  index.html, vite.config.js, package.json
```

## 10. Experiments and metrics

The simulation engine and the strategy comparison are in `src/engine`. The Compare and Stress Test screens run their experiments through it.

**Fairness rule.** Every strategy runs on the same road network, traffic demand, ambulance route, road blockage and random seed. Traffic is allowed to build up before the ambulance enters, so it is measured in a busy network.

**Metrics** (all computed from saved event logs, never typed in):

| Metric | Meaning |
|---|---|
| Ambulance travel time | Time from its start to its destination |
| Ambulance stops | How often the ambulance was halted |
| Average wait, other vehicles | Mean waiting time across ordinary vehicles |
| Longest single wait | Longest continuous wait at any approach (detects starvation) |
| Maximum queue | Largest queue seen on any lane |
| Throughput | Vehicles completing trips per hour |
| Recovery time | Time after the ambulance's last junction until queues stay near their pre-ambulance level for a sustained period |
| Safety violations | Conflicting greens plus skipped clearances (target: 0) |

Improvement is reported as the percentage change against fixed-time signals. A worse result is shown as worse.

**Protocol**

1. Run a small pilot to confirm everything works.
2. Tune controller weights on a set of tuning seeds only.
3. Freeze all settings.
4. Run every combination of traffic level (low, medium, high), ambulance route and strategy on separate test seeds. Tuning seeds and test seeds are listed in the experiment configuration.
5. Report averages and variation, and show where PEGC does not win.

**Hypothesis, stated before testing.** PEGC reduces ambulance travel time compared with fixed-time control, keeps most of basic priority's ambulance gain, and holds ordinary-vehicle delay well below basic priority's. The exact threshold is set after pilot runs, and the outcome is reported whether or not it is met.

## 11. Results

Scenario: TBD. Source: TBD.

| Metric | A Fixed-time | B Basic priority | C PEGC |
|---|---|---|---|
| Ambulance travel time (s) | TBD | TBD | TBD |
| Ambulance stops | TBD | TBD | TBD |
| Average wait, other vehicles (s) | TBD | TBD | TBD |
| Longest single wait (s) | TBD | TBD | TBD |
| Maximum queue (vehicles) | TBD | TBD | TBD |
| Throughput (veh/h) | TBD | TBD | TBD |
| Recovery time (s) | TBD | TBD | TBD |
| Safety violations | TBD | TBD | TBD |

- **Predictor result:** TBD.
- **Ablation result:** TBD.
- **Trade-off curve:** TBD.
- **Summary of findings:** TBD, to be written from the measured numbers, including any metric where PEGC does not win.

## 12. Stress testing

The dashboard lets a user raise traffic density, block a road on the ambulance's route, or both, then rerun all strategies. The system recomputes the route, reports how decisions and metrics changed, and states plainly if no route exists.

## 13. Future work

- Several emergency vehicles with competing routes
- A real road layout imported from OpenStreetMap, calibrated against observed traffic counts
- A stronger predictor and simulation look-ahead for decisions
- Reinforcement learning as an additional strategy compared against A, B and C
- Sensitivity analysis on how drivers yield to sirens
- Exportable experiment reports

## 14. Licence and acknowledgements

Licence: see the `LICENSE` file.

Built with [SUMO](https://eclipse.dev/sumo/), React, FastAPI and scikit-learn.
