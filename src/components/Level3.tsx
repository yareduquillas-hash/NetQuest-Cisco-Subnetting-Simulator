import { useMemo, useRef, useState } from 'react';
import { completeLine, createLab, evaluateLab, executeCommand, interfaceStatus, promptFor, type LabState } from '../engines/cli';
import { generateTopology, solveTopology } from '../engines/topology';
import { randomSeed } from '../engines/rng';
import { sound } from '../engines/sound';
import type { ProgressApi } from '../state/progress';
import type { LabConfig } from './Level2';
import { ChallengeBar, NoteFeed, TopologyCanvas, Terminal, type Note, type TermLine } from './shared';

export function Level3({ api, lab, setLab }: { api: ProgressApi; lab: LabConfig; setLab: (l: LabConfig) => void }) {
  // Se remonta al cambiar la semilla/dificultad para reiniciar el estado de los routers.
  return <Lab key={`${lab.seed}|${lab.difficulty}`} api={api} lab={lab} setLab={setLab} />;
}

function Lab({ api, lab: cfg, setLab }: { api: ProgressApi; lab: LabConfig; setLab: (l: LabConfig) => void }) {
  const graph = useMemo(() => generateTopology(cfg.seed, cfg.difficulty), [cfg]);
  const sol = useMemo(() => solveTopology(graph), [graph]);
  const [lab, setLabState] = useState<LabState>(() => createLab(graph, sol.targets));
  const [active, setActive] = useState(graph.routers[0].id);
  const [logs, setLogs] = useState<Record<string, TermLine[]>>(() =>
    Object.fromEntries(
      graph.routers.map((r) => [
        r.id,
        [
          { kind: 'out', text: `${r.hostname} — interfaces apagadas y sin direccionamiento.`, tone: 'dim' },
          { kind: 'out', text: 'Escribe «enable» para comenzar. Usa «?» para ver los comandos disponibles.', tone: 'dim' },
        ] as TermLine[],
      ]),
    ),
  );
  const [notes, setNotes] = useState<Note[]>([]);
  const [stats, setStats] = useState({ commands: 0, errors: 0 });
  const [done, setDone] = useState(false);
  const [showHints, setShowHints] = useState(false);
  const doneRef = useRef(false);

  const append = (id: string, lines: TermLine[]) => setLogs((l) => ({ ...l, [id]: [...l[id], ...lines] }));

  const submit = (line: string) => {
    const rt = lab.runtimes[active];
    const prompt = promptFor(rt);
    const r = executeCommand(lab, active, line);
    const out: TermLine[] = [{ kind: 'cmd', prompt, text: line }];
    if (r.feedback.output) out.push({ kind: 'out', text: r.feedback.output, tone: r.feedback.success ? (line.trim().endsWith('?') ? 'dim' : undefined) : 'err' });
    append(active, out);
    setLabState(r.lab);

    let ipChecks = 0;
    let ipOk = 0;
    let cmds = 0;
    let errs = 0;
    for (const e of r.events) {
      if (e.type === 'COMMAND') cmds++;
      if (e.type === 'ERROR') {
        errs++;
        sound.playError();
      }
      if (e.type === 'PING') {
        sound.playPing(e.ok);
      }
      if (e.type === 'IP_ASSIGNED') {
        ipChecks++;
        if (e.ok) ipOk++;
      }
    }
    if (ipChecks) api.recordChecks(3, ipChecks, ipOk);
    setStats((s) => ({ commands: s.commands + cmds, errors: s.errors + errs }));
    const hostname = r.lab.runtimes[active].hostname;
    if (r.diagnostics.length)
      setNotes((n) => [...r.diagnostics.map<Note>((d) => ({ tone: d.severity, title: hostname, text: d.message })).reverse(), ...n].slice(0, 40));

    if (!doneRef.current && evaluateLab(r.lab).complete) {
      doneRef.current = true;
      setDone(true);
      api.recordCompletion(3);
      sound.playSuccess();
      setNotes((n) => [{ tone: 'ok', title: 'Laboratorio', text: 'La configuración coincide al 100 % con el plan IP.' }, ...n]);
    }
  };

  const testGlobalConnectivity = () => {
    const results: Note[] = [];
    let allOk = true;

    for (const c of graph.connections) {
      const fromR = graph.routers.find((r) => r.id === c.fromRouterId)!;
      const toR = graph.routers.find((r) => r.id === c.toRouterId)!;
      const targetPeer = sol.targets[c.toRouterId]?.[c.toInterface];

      if (targetPeer) {
        const res = executeCommand(lab, c.fromRouterId, `ping ${targetPeer.ip}`);
        const ok = res.feedback.output.includes('100 percent');
        if (ok) {
          results.push({
            tone: 'ok',
            title: `${fromR.hostname} ➔ ${toR.hostname}`,
            text: `Ping exitoso a ${c.toInterface} (${targetPeer.ip}). Enlace WAN operativo.`
          });
        } else {
          allOk = false;
          results.push({
            tone: 'error',
            title: `${fromR.hostname} ➔ ${toR.hostname}`,
            text: `Fallo de ping hacia ${c.toInterface} (${targetPeer.ip}). Revisa IP, clock rate o no shutdown.`
          });
        }
      }
    }

    if (allOk && results.length > 0) {
      sound.playSuccess();
      results.unshift({
        tone: 'ok',
        title: 'Verificación global',
        text: '¡Conectividad punto a punto 100% exitosa en todos los enlaces de la topología!'
      });
    } else {
      sound.playPing(false);
    }

    setNotes((prev) => [...results, ...prev].slice(0, 40));
  };

  const complete = (line: string) => {
    const r = completeLine(lab, active, line);
    if (r.options.length) {
      append(active, [
        { kind: 'cmd', prompt: promptFor(lab.runtimes[active]), text: line },
        { kind: 'out', text: r.options.join('  '), tone: 'dim' },
      ]);
    }
    return r.value;
  };

  const ev = useMemo(() => evaluateLab(lab), [lab]);
  const wanState: Record<string, 'up' | 'partial' | 'down'> = {};
  for (const c of graph.connections) {
    const a = interfaceStatus(lab, c.fromRouterId, c.fromInterface).protocol === 'up';
    const b = interfaceStatus(lab, c.toRouterId, c.toInterface).protocol === 'up';
    const anyUp = lab.runtimes[c.fromRouterId].runningConfig.interfaces[c.fromInterface].isUp || lab.runtimes[c.toRouterId].runningConfig.interfaces[c.toInterface].isUp;
    wanState[c.id] = a && b ? 'up' : anyUp ? 'partial' : 'down';
  }
  const lanState: Record<string, 'up' | 'down'> = {};
  for (const q of graph.requirements.filter((x) => x.kind === 'LAN'))
    lanState[q.id] = lab.runtimes[q.endpoints[0].deviceId].runningConfig.interfaces[q.endpoints[0].interfaceName].isUp ? 'up' : 'down';
  const labels: Record<string, string> = {};
  for (const r of graph.requirements) labels[r.id] = `${sol.byId[r.id].networkAddress}/${sol.byId[r.id].prefix}`;

  const rt = lab.runtimes[active];
  const doneBy = (id: string) => ev.items.filter((i) => i.routerId === id).every((i) => i.done);
  const doneCount = ev.items.filter((i) => i.done).length;

  return (
    <div className="shell page">
      <div className="page-head">
        <div>
          <span className="eyebrow"><span className="dot" />Nivel 03 · Cisco IOS</span>
          <h1>Laboratorio de consola</h1>
          <p className="lede">Configura cada router con la sintaxis real de IOS: asigna las direcciones del plan, define el reloj de los enlaces DCE y levanta las interfaces.</p>
        </div>
        <ChallengeBar seed={cfg.seed} difficulty={cfg.difficulty} onSeed={(seed) => setLab({ ...cfg, seed })} onDifficulty={(difficulty) => setLab({ ...cfg, difficulty })} />
      </div>

      <div className="workbench">
        <div className="stack">
          <section className="panel">
            <TopologyCanvas graph={graph} subnetLabels={labels} wanState={wanState} lanState={lanState} activeRouterId={active} onSelectRouter={setActive} />
          </section>

          <section>
            <div className="tabs" role="tablist" aria-label="Routers">
              {graph.routers.map((r) => (
                <button key={r.id} role="tab" className="tab" aria-selected={active === r.id} onClick={() => setActive(r.id)}>
                  <span className={`pip ${doneBy(r.id) ? 'on' : ''}`} />
                  {r.hostname}
                </button>
              ))}
            </div>
            <Terminal title={`${rt.hostname} — consola`} prompt={promptFor(rt)} lines={logs[active]} onSubmit={submit} onComplete={complete} />
          </section>
        </div>

        <aside className="side">
          <div className="panel">
            <div className="stat-row">
              <div className="stat"><div className="v tnum">{doneCount}/{ev.items.length}</div><div className="k">Interfaces</div></div>
              <div className="stat"><div className="v tnum">{stats.commands}</div><div className="k">Comandos</div></div>
              <div className="stat"><div className="v tnum">{stats.errors}</div><div className="k">Errores</div></div>
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 16, flexWrap: 'wrap' }}>
              <button className="btn primary" onClick={testGlobalConnectivity} title="Envía paquetes ICMP entre todos los routers para verificar el enrutamiento">
                Comprobar red
              </button>
              <button className="btn" onClick={() => setShowHints((h) => !h)}>
                {showHints ? 'Ocultar pistas IP' : 'Pistas de IP'}
              </button>
            </div>
          </div>
          {done && (
            <div className="banner">
              <strong>Red operativa.</strong>
              <button className="btn sm" onClick={() => setLab({ ...cfg, seed: randomSeed() })}>Nuevo laboratorio</button>
            </div>
          )}
          <div className="panel">
            <div className="panel-head"><h3>Plan IP · {rt.hostname}</h3></div>
            {ev.items.filter((i) => i.routerId === active).map((i) => (
              <div className="check" key={i.ifName}>
                <span className={`tick ${i.done ? 'on' : ''}`} />
                <div style={{ flex: 1 }}>
                  <div className="mono">{i.ifName}</div>
                  <div className="muted" style={{ fontSize: 12.5 }}>{i.target.networkAddress}/{i.target.prefix} · {i.target.role}</div>
                  {showHints && (
                    <div className="mono" style={{ fontSize: 11.5, color: 'var(--clay-ink)', marginTop: 3 }}>
                      IP: {i.target.ip} {i.target.mask}
                      {graph.routers.find((r) => r.id === active)?.interfaces[i.ifName]?.isDCE && ' (DCE clock 64000)'}
                    </div>
                  )}
                </div>
                <span className={`chip ${i.protocol === 'up' ? 'olive' : ''}`}>{i.protocol === 'up' ? 'up' : i.upOk ? 'línea down' : 'apagada'}</span>
              </div>
            ))}
            <p className="muted" style={{ fontSize: 12.5, marginTop: 12 }}>La dirección exacta sigue la convención indicada: calcúlala a partir de la subred.</p>
          </div>
          <div className="panel">
            <div className="panel-head"><h3>Análisis</h3></div>
            <NoteFeed notes={notes} empty="El laboratorio contrasta cada configuración con el plan y te explica las discrepancias." />
          </div>
        </aside>
      </div>
    </div>
  );
}
