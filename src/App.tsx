import { useEffect, useState } from 'react';
import { randomSeed } from './engines/rng';
import { sound } from './engines/sound';
import { useProgress } from './state/progress';
import { Home, type View } from './components/Home';
import { Level1 } from './components/Level1';
import { Level2, type LabConfig } from './components/Level2';
import { Level3 } from './components/Level3';
import { Engines } from './components/Engines';

const VIEWS: View[] = ['home', 'level1', 'level2', 'level3', 'engines'];
const NAV: { v: View; label: string }[] = [
  { v: 'level1', label: 'Nivel 1' },
  { v: 'level2', label: 'Nivel 2' },
  { v: 'level3', label: 'Nivel 3' },
  { v: 'engines', label: 'Motores' },
];

const fromHash = (): View => {
  const h = location.hash.slice(1) as View;
  return VIEWS.includes(h) ? h : 'home';
};

export default function App() {
  const [view, setView] = useState<View>(fromHash);
  const [theme, setTheme] = useState<'light' | 'dark'>(() => (document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light'));
  const [muted, setMuted] = useState(() => sound.isMuted());
  const [lab, setLab] = useState<LabConfig>(() => ({ seed: randomSeed(), difficulty: 'EASY' }));
  const api = useProgress();

  useEffect(() => {
    const on = () => setView(fromHash());
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    try {
      localStorage.setItem('netquest.theme', theme);
    } catch {
      /* ignorar */
    }
  }, [theme]);

  const toggleSound = () => {
    const next = sound.toggleMute();
    setMuted(next);
    if (!next) sound.playKey();
  };

  const go = (v: View) => {
    location.hash = v === 'home' ? '' : v;
    setView(v);
    window.scrollTo({ top: 0 });
  };

  return (
    <>
      <header className="topbar">
        <div className="shell">
          <button className="brand" onClick={() => go('home')} aria-label="NetQuest — inicio">
            <svg width="26" height="26" viewBox="0 0 32 32" aria-hidden>
              <rect width="32" height="32" rx="8" fill="var(--ink)" />
              <g stroke="var(--clay)" strokeWidth="2.4" strokeLinecap="round"><path d="M16 6v20M7.3 11l17.4 10M7.3 21l17.4-10" /></g>
            </svg>
            NetQuest
          </button>
          <nav className="nav" aria-label="Principal">
            {NAV.map((n) => (
              <button key={n.v} aria-current={view === n.v ? 'page' : undefined} onClick={() => go(n.v)}>{n.label}</button>
            ))}
            <button
              className="icon-btn"
              onClick={toggleSound}
              aria-label={muted ? 'Activar sonido' : 'Silenciar sonido'}
              title={muted ? 'Activar efectos de audio táctiles' : 'Silenciar efectos de audio'}
            >
              {muted ? (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                  <line x1="23" y1="9" x2="17" y2="15" />
                  <line x1="17" y1="9" x2="23" y2="15" />
                </svg>
              ) : (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                  <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07" />
                </svg>
              )}
            </button>
            <button className="icon-btn" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} aria-label="Cambiar tema" title="Cambiar tema">
              {theme === 'dark' ? (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></svg>
              ) : (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" /></svg>
              )}
            </button>
          </nav>
        </div>
      </header>

      <main>
        {view === 'home' && <Home go={go} api={api} />}
        {view === 'level1' && <Level1 api={api} />}
        {view === 'level2' && <Level2 api={api} lab={lab} setLab={setLab} goLevel3={() => go('level3')} />}
        {view === 'level3' && <Level3 api={api} lab={lab} setLab={setLab} />}
        {view === 'engines' && <Engines />}
      </main>

      <footer className="shell footer">
        <span>NetQuest · laboratorio de redes</span>
        <span>Todo se ejecuta en tu navegador. Sin cuentas ni servidor.</span>
      </footer>
    </>
  );
}
