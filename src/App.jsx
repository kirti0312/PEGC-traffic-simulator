import { useCallback, useEffect, useRef, useState } from 'react';
import { ctrl } from './ui/ctrl.js';
import { useSnapshot, useRenderCount } from './ui/hooks.js';
import { defaultScenario } from './engine/config.js';
import { TopBar } from './ui/TopBar.jsx';
import { LegendPanel } from './ui/LegendPanel.jsx';
import { AnalyticsPanel } from './ui/AnalyticsPanel.jsx';
import { ControlBar } from './ui/ControlBar.jsx';
import { DecisionLog } from './ui/DecisionLog.jsx';
import { SummaryCard } from './ui/SummaryCard.jsx';
import { CommandCentre } from './ui/CommandCentre.jsx';
import { ConfigureScreen } from './ui/ConfigureScreen.jsx';
import { CompareScreen } from './ui/CompareScreen.jsx';
import { StressScreen } from './ui/StressScreen.jsx';
import { Minimap } from './ui/Minimap.jsx';
import { WelcomeCard, welcomeSeen, rememberWelcome } from './ui/WelcomeCard.jsx';

export default function App() {
  useRenderCount('App');
  const snap = useSnapshot();
  const [screen, setScreen] = useState('command');
  const [scenario, setScenario] = useState(defaultScenario);
  const [summaryOff, setSummaryOff] = useState(false);
  const canvasRef = useRef(null);
  const [legendOpen, setLegendOpen] = useState(false);
  const [analyticsOpen, setAnalyticsOpen] = useState(true);
  const [logOpen, setLogOpen] = useState(true);
  const [welcomeOpen, setWelcomeOpen] = useState(() => !welcomeSeen());
  const closeWelcome = useCallback(() => { rememberWelcome(); setWelcomeOpen(false); }, []);
  const openWelcome = useCallback(() => setWelcomeOpen(true), []);
  const [vw, setVw] = useState(() => window.innerWidth);
  useEffect(() => {
    const f = () => setVw(window.innerWidth);
    window.addEventListener('resize', f);
    return () => window.removeEventListener('resize', f);
  }, []);

  useEffect(() => {
    ctrl.attach(canvasRef.current);
    return () => ctrl.detach();
  }, []);

  // The map is always centred in the space that panels leave free, so roads are never hidden.
  useEffect(() => {
    const dock = Math.min(Math.round(vw * 0.62), 820);
    let ins = { left: 0, right: 0, top: 52, bottom: 76 };
    if (screen === 'command') ins = { left: 400, right: 0, top: 52, bottom: 76 };
    else if (screen === 'configure') ins = { left: 380, right: 0, top: 52, bottom: 20 };
    else if (screen === 'watch') ins = { left: legendOpen ? 216 : 0, right: analyticsOpen ? 308 : 12, top: 52, bottom: 76 + (logOpen ? 156 : 46) };
    else ins = { left: 0, right: dock, top: 52, bottom: 20 };
    ctrl.setInsets(ins);
  }, [screen, legendOpen, analyticsOpen, logOpen, vw]);
  useEffect(() => {
    ctrl.setPreset(screen === 'command' ? 'close' : screen === 'configure' || screen === 'stress' ? 'full' : 'fit');
  }, [screen]);

  useEffect(() => {
    if (!snap.finished) setSummaryOff(false);
  }, [snap.finished]);

  const launch = useCallback(() => {
    ctrl.loadRun(scenario);
    setSummaryOff(false);
    setScreen('watch');
  }, [scenario]);

  const nav = useCallback((id) => {
    if (id === 'command' && ctrl.mode === 'run') ctrl.startAmbient(scenario.density, 11);
    if (id === 'watch' && ctrl.mode !== 'run') ctrl.loadRun(scenario);
    setScreen(id);
  }, [scenario]);

  const changeStrategy = useCallback((s) => {
    const next = { ...scenario, strategy: s };
    setScenario(next);
    ctrl.loadRun(next);
    setSummaryOff(false);
  }, [scenario]);

  useEffect(() => {
    const onKey = (e) => {
      const t = e.target && e.target.tagName;
      const typing = t === 'INPUT' || t === 'SELECT' || t === 'TEXTAREA';
      if (!typing && !e.ctrlKey && !e.metaKey) {
        const step = e.shiftKey ? 220 : 90;
        const k = e.key.toLowerCase();
        if (k === 'arrowleft' || k === 'a') { e.preventDefault(); ctrl.panBy(step, 0); }
        else if (k === 'arrowright' || k === 'd') { e.preventDefault(); ctrl.panBy(-step, 0); }
        else if (k === 'arrowup' || k === 'w') { e.preventDefault(); ctrl.panBy(0, step); }
        else if (k === 'arrowdown' || k === 's') { e.preventDefault(); ctrl.panBy(0, -step); }
        else if (k === '+' || k === '=') ctrl.zoomIn();
        else if (k === '-' || k === '_') ctrl.zoomOut();
        else if (k === '0') ctrl.fitAll();
        else if (k === 'c') ctrl.centerAmbulance();
      }
      if (e.code === 'Space' && t !== 'INPUT' && t !== 'SELECT' && t !== 'BUTTON' && t !== 'TEXTAREA' && ctrl.mode === 'run') {
        e.preventDefault();
        ctrl.toggle();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const overScene = screen === 'command' || screen === 'watch' || screen === 'configure';
  return (
    <div className="app">
      <canvas ref={canvasRef} className="scene" aria-label="City traffic simulation view" />
      <TopBar screen={screen} onNav={nav} snap={snap} scenario={scenario} onHelp={openWelcome} />
      {screen === 'command' && <CommandCentre snap={snap} onLaunch={launch} onNav={nav} />}
      {screen === 'configure' && <ConfigureScreen scenario={scenario} setScenario={setScenario} onLaunch={launch} />}
      {screen === 'watch' && (
        <>
          <LegendPanel signals={snap.signals} open={legendOpen} onToggle={() => setLegendOpen((v) => !v)} />
          <AnalyticsPanel snap={snap} open={analyticsOpen} onToggle={() => setAnalyticsOpen((v) => !v)} />
          <DecisionLog total={snap.logTotal} strategy={snap.strategy} open={logOpen} onToggle={() => setLogOpen((v) => !v)} />
          {snap.finished && snap.mode === 'run' && !summaryOff && (
            <SummaryCard snap={snap} scenario={scenario} onCompare={() => setScreen('compare')} onClose={() => setSummaryOff(true)} />
          )}
        </>
      )}
      {screen === 'compare' && <CompareScreen scenario={scenario} />}
      {screen === 'stress' && <StressScreen scenario={scenario} />}
      {screen === 'watch' && <Minimap style={{ right: analyticsOpen ? 308 : 20, top: 56 }} />}
      {(screen === 'compare' || screen === 'stress') && <Minimap style={{ left: 12, top: 56 }} />}
      {(screen === 'command' || screen === 'watch') && <ControlBar snap={snap} scenario={scenario} onStrategy={changeStrategy} onLaunch={launch} />}
      {!overScene && null}
      {welcomeOpen && <WelcomeCard onClose={closeWelcome} />}
    </div>
  );
}
