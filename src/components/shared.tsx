import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import type { DifficultyLevel, TopologyGraph } from '../engines/types';
import { binaryOctets } from '../engines/ip';
import { DIFFICULTY } from '../engines/topology';
import { randomSeed } from '../engines/rng';
import { sound } from '../engines/sound';

// ── Bits de una dirección, coloreados por rol ───────────────────────────────
export function BitStrip({ ip, basePrefix, newPrefix }: { ip: number; basePrefix: number; newPrefix?: number }) {
  const octets = binaryOctets(ip);
  const np = newPrefix ?? basePrefix;
  return (
    <>
      <div className="bits" role="img" aria-label="Representación binaria de 32 bits">
        {octets.map((o, oi) => (
          <div className="octet" key={oi}>
            {o.split('').map((b, bi) => {
              const pos = oi * 8 + bi;
              const cls = pos < basePrefix ? 'net' : pos < np ? 'sub' : 'host';
              return (
                <span key={bi} className={`bit ${cls}`}>
                  {b}
                </span>
              );
            })}
          </div>
        ))}
      </div>
      <div className="legend">
        <span><i style={{ background: 'var(--ink)' }} />Red ({basePrefix} bits)</span>
        {newPrefix !== undefined && newPrefix > basePrefix && (
          <span><i style={{ background: 'var(--clay)' }} />Subred prestados ({newPrefix - basePrefix})</span>
        )}
        <span><i style={{ border: '1px solid var(--ink-3)' }} />Host ({32 - np})</span>
      </div>
    </>
  );
}

// ── Selector de semilla + dificultad ────────────────────────────────────────
export function ChallengeBar(props: {
  seed: string;
  difficulty: DifficultyLevel;
  onSeed: (s: string) => void;
  onDifficulty: (d: DifficultyLevel) => void;
}) {
  const [draft, setDraft] = useState(props.seed);
  useEffect(() => setDraft(props.seed), [props.seed]);
  const commit = () => {
    const s = draft.trim().toUpperCase();
    if (s && s !== props.seed) props.onSeed(s);
    else setDraft(props.seed);
  };
  return (
    <div className="toolbar">
      <div className="seg" role="group" aria-label="Dificultad">
        {(Object.keys(DIFFICULTY) as DifficultyLevel[]).map((d) => (
          <button key={d} aria-pressed={props.difficulty === d} onClick={() => props.onDifficulty(d)}>
            {DIFFICULTY[d].label}
          </button>
        ))}
      </div>
      <input
        className="seed-input"
        aria-label="Semilla del reto"
        value={draft}
        spellCheck={false}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
      />
      <button className="btn sm" onClick={() => props.onSeed(randomSeed())}>Nuevo reto</button>
    </div>
  );
}

// ── Notas de análisis ───────────────────────────────────────────────────────
export interface Note {
  tone: 'ok' | 'error' | 'warn' | 'info';
  title: string;
  text: string;
}
export function NoteFeed({ notes, empty }: { notes: Note[]; empty: string }) {
  if (!notes.length) return <p className="empty">{empty}</p>;
  return (
    <div className="feed">
      {notes.map((n, i) => (
        <div key={i} className={`note ${n.tone}`}>
          <div className="note-body">
            <b>{n.title}</b>
            <p>{n.text}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Lienzo de topología ─────────────────────────────────────────────────────
const W = 880;
const H = 440;

export interface TopologyCanvasProps {
  graph: TopologyGraph;
  subnetLabels?: Record<string, string>;
  wanState?: Record<string, 'up' | 'partial' | 'down'>;
  lanState?: Record<string, 'up' | 'down'>;
  activeRouterId?: string;
  onSelectRouter?: (id: string) => void;
}

export function TopologyCanvas({ graph, subnetLabels = {}, wanState = {}, lanState = {}, activeRouterId, onSelectRouter }: TopologyCanvasProps) {
  const pos = (id: string) => {
    const r = graph.routers.find((x) => x.id === id)!;
    return { x: r.position.x * W, y: r.position.y * H };
  };
  const cx = graph.routers.reduce((s, r) => s + r.position.x, 0) / graph.routers.length;
  const cy = graph.routers.reduce((s, r) => s + r.position.y, 0) / graph.routers.length;

  return (
    <div className="topo-wrap">
      <svg className="topo" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Topología de red">
        {graph.connections.map((c) => {
          const a = pos(c.fromRouterId);
          const b = pos(c.toRouterId);
          const mx = (a.x + b.x) / 2;
          const my = (a.y + b.y) / 2;
          const st = wanState[c.id] ?? 'down';
          const lbl = subnetLabels[c.id];
          return (
            <g key={c.id}>
              <line className={`link ${st}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} />
              <text className="tag" x={a.x + (b.x - a.x) * 0.22} y={a.y + (b.y - a.y) * 0.22 - 8} textAnchor="middle">{c.fromInterface.replace('Serial', 'S')}</text>
              <text className="tag" x={a.x + (b.x - a.x) * 0.78} y={a.y + (b.y - a.y) * 0.78 - 8} textAnchor="middle">{c.toInterface.replace('Serial', 'S')}</text>
              <text className="tag" x={mx} y={my + 22} textAnchor="middle">{c.id.replace('WAN_', 'WAN ')}</text>
              {lbl && <text className="tag solved" x={mx} y={my + 36} textAnchor="middle">{lbl}</text>}
            </g>
          );
        })}

        {graph.routers.map((r, ri) => {
          const p = pos(r.id);
          const lans = graph.requirements.filter((q) => q.kind === 'LAN' && q.endpoints[0].deviceId === r.id).sort((x, y) => x.id.localeCompare(y.id));
          const dx = r.position.x - cx;
          const dy = r.position.y - cy;
          const base = Math.hypot(dx, dy) > 0.05 ? Math.atan2(dy, dx) : ri % 2 === 0 ? -Math.PI / 2 : Math.PI / 2;
          return (
            <g key={r.id}>
              {lans.map((q, k) => {
                const ang = base + (k - (lans.length - 1) / 2) * 0.62;
                const lx = Math.min(W - 70, Math.max(70, p.x + Math.cos(ang) * 128));
                const ly = Math.min(H - 30, Math.max(30, p.y + Math.sin(ang) * 112));
                const st = lanState[q.id] ?? 'down';
                const lbl = subnetLabels[q.id];
                return (
                  <g key={q.id}>
                    <line className={`stub ${st}`} x1={p.x} y1={p.y} x2={lx} y2={ly} />
                    <g className={`lan ${st}`} transform={`translate(${lx - 56},${ly - 20})`}>
                      <rect width="112" height="40" rx="10" />
                      <text className="tag" x="56" y="16" textAnchor="middle" style={{ fill: 'var(--ink)', fontWeight: 600 }}>{q.name}</text>
                      <text className="tag" x="56" y="30" textAnchor="middle">{lbl ?? `${q.hostsRequired} hosts`}</text>
                    </g>
                  </g>
                );
              })}
              <g
                className={`node ${activeRouterId === r.id ? 'active' : ''}`}
                transform={`translate(${p.x - 40},${p.y - 30})`}
                onClick={() => onSelectRouter?.(r.id)}
                tabIndex={onSelectRouter ? 0 : -1}
                onKeyDown={(e) => e.key === 'Enter' && onSelectRouter?.(r.id)}
                role={onSelectRouter ? 'button' : undefined}
                aria-label={r.hostname}
              >
                <rect width="80" height="60" rx="16" />
                <g stroke="var(--clay)" strokeWidth="2" strokeLinecap="round" fill="none" transform="translate(40,24)">
                  <circle r="9" />
                  <path d="M-15 0h6M9 0h6M0 -15v6M0 9v6" />
                </g>
                <text className="host" x="40" y="52" textAnchor="middle">{r.hostname}</text>
              </g>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

// ── Terminal ────────────────────────────────────────────────────────────────
// ── Barra de Partición del Espacio de Direccionamiento (VLSM) ───────────────
export interface PartitionItem {
  id: string;
  name: string;
  hostsRequired?: number;
  prefix: number;
  networkAddress: string;
  blockSize: number;
}

const PARTITION_COLORS = [
  '#d97757', // Clay
  '#788c5d', // Olive
  '#6a9bcc', // Sky
  '#b7791f', // Amber
  '#9c6bb2', // Violet
  '#b53333', // Danger/Rust
  '#4a7a5d', // Forest
  '#c15f3c', // Terracotta
];

export function AddressSpaceBar(props: {
  baseNetwork: string;
  basePrefix: number;
  items: PartitionItem[];
}) {
  const totalBaseSize = 2 ** (32 - props.basePrefix);
  const totalAllocated = props.items.reduce((sum, item) => sum + item.blockSize, 0);
  const freeIps = Math.max(0, totalBaseSize - totalAllocated);
  const usedPercent = Math.min(100, (totalAllocated / totalBaseSize) * 100);

  return (
    <div className="partition-box">
      <div className="partition-header">
        <span>Partición del Espacio · {props.baseNetwork}/{props.basePrefix}</span>
        <span>
          Asignado: {totalAllocated.toLocaleString('es')} / {totalBaseSize.toLocaleString('es')} IPs ({usedPercent.toFixed(1)}%)
        </span>
      </div>

      <div className="partition-bar" role="img" aria-label="Partición visual del espacio de direcciones">
        {props.items.map((item, idx) => {
          const pct = (item.blockSize / totalBaseSize) * 100;
          const bg = PARTITION_COLORS[idx % PARTITION_COLORS.length];
          const label = pct >= 10 ? `${item.name} (/${item.prefix})` : pct >= 4 ? `/${item.prefix}` : '';
          return (
            <div
              key={item.id || idx}
              className="partition-seg"
              style={{
                width: `${pct}%`,
                background: bg,
              }}
              title={`${item.name}: ${item.networkAddress}/${item.prefix} · Bloque: ${item.blockSize} IPs (${item.hostsRequired ?? 0} hosts req.)`}
            >
              {label}
            </div>
          );
        })}
        {freeIps > 0 && (
          <div
            className="partition-seg free"
            style={{ width: `${(freeIps / totalBaseSize) * 100}%` }}
            title={`Espacio disponible: ${freeIps.toLocaleString('es')} direcciones`}
          >
            {(freeIps / totalBaseSize) * 100 >= 12 ? `Libre: ${freeIps.toLocaleString('es')} IPs` : ''}
          </div>
        )}
      </div>

      <div className="partition-legend">
        {props.items.map((item, idx) => (
          <span key={item.id || idx} className="partition-legend-item">
            <span
              className="partition-legend-color"
              style={{ background: PARTITION_COLORS[idx % PARTITION_COLORS.length] }}
            />
            <span>
              {item.name}: /{item.prefix} ({item.blockSize} IPs)
            </span>
          </span>
        ))}
        {freeIps > 0 && (
          <span className="partition-legend-item">
            <span
              className="partition-legend-color"
              style={{ background: 'var(--line-strong)', border: '1px dashed var(--ink-3)' }}
            />
            <span className="muted">
              Disponible ({freeIps.toLocaleString('es')} IPs · {((freeIps / totalBaseSize) * 100).toFixed(1)}%)
            </span>
          </span>
        )}
      </div>
    </div>
  );
}

// ── Terminal ────────────────────────────────────────────────────────────────
export interface TermLine {
  kind: 'cmd' | 'out';
  text: string;
  prompt?: string;
  tone?: 'err' | 'ok' | 'dim' | 'warn';
}

const DEFAULT_CHIPS = ['en', 'conf t', 'sh ip int br', 'sh run', 'sh ip route', 'sh ver', 'wr'];

export function Terminal(props: {
  title: string;
  prompt: string;
  lines: TermLine[];
  onSubmit: (line: string) => void;
  onComplete: (line: string) => string;
  chips?: string[];
}) {
  const [value, setValue] = useState('');
  const [hist, setHist] = useState<string[]>([]);
  const [hi, setHi] = useState(-1);
  const body = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const chips = props.chips ?? DEFAULT_CHIPS;

  useEffect(() => {
    body.current?.scrollTo({ top: body.current.scrollHeight });
  }, [props.lines]);

  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      const v = value;
      sound.playEnter();
      if (v.trim()) setHist((h) => [...h, v]);
      setHi(-1);
      setValue('');
      props.onSubmit(v);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (!hist.length) return;
      const n = hi < 0 ? hist.length - 1 : Math.max(0, hi - 1);
      setHi(n);
      setValue(hist[n]);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (hi < 0) return;
      const n = hi + 1;
      if (n >= hist.length) (setHi(-1), setValue(''));
      else (setHi(n), setValue(hist[n]));
    } else if (e.key === 'Tab') {
      e.preventDefault();
      setValue(props.onComplete(value));
    } else if (e.key === '?') {
      e.preventDefault();
      sound.playKey();
      const v = value + '?';
      setValue('');
      props.onSubmit(v);
    } else {
      sound.playKey();
    }
  };

  const handleChip = (cmd: string) => {
    sound.playEnter();
    setHist((h) => [...h, cmd]);
    props.onSubmit(cmd);
    input.current?.focus();
  };

  return (
    <div className="term">
      <div className="term-bar">
        <span>{props.title}</span>
        <span className="live">consola · vty 0</span>
      </div>
      <div className="term-body" ref={body} onClick={() => input.current?.focus()}>
        {props.lines.map((l, i) =>
          l.kind === 'cmd' ? (
            <pre key={i}>
              <span className="t-prompt">{l.prompt}</span>
              <span className="t-cmd">{l.text}</span>
            </pre>
          ) : (
            <pre key={i} className={l.tone ? `t-${l.tone}` : undefined}>{l.text}</pre>
          ),
        )}
        <div className="term-input">
          <span className="t-prompt">{props.prompt}</span>
          <input
            ref={input}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={onKey}
            spellCheck={false}
            autoCapitalize="off"
            autoComplete="off"
            aria-label="Línea de comandos"
          />
        </div>
      </div>
      <div className="cmd-chips">
        {chips.map((c) => (
          <button
            key={c}
            type="button"
            className="cmd-chip"
            onClick={() => handleChip(c)}
            title={`Ejecutar «${c}»`}
          >
            {c}
          </button>
        ))}
      </div>
      <div className="term-foot">
        <span><kbd>Tab</kbd> completar</span>
        <span><kbd>?</kbd> ayuda</span>
        <span><kbd>↑</kbd><kbd>↓</kbd> historial</span>
      </div>
    </div>
  );
}
