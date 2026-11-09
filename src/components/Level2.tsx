import { useEffect, useMemo, useState } from 'react';
import type { DifficultyLevel } from '../engines/types';
import { diagnoseVlsmRow, makeResult, type Diagnosis } from '../engines/subnet';
import { generateTopology, solveTopology } from '../engines/topology';
import { blockSize, parseIPv4, parsePrefix } from '../engines/ip';
import { randomSeed } from '../engines/rng';
import { sound } from '../engines/sound';
import type { ProgressApi } from '../state/progress';
import { AddressSpaceBar, ChallengeBar, NoteFeed, TopologyCanvas, type Note } from './shared';

export interface LabConfig {
  seed: string;
  difficulty: DifficultyLevel;
}

type Row = { prefix: string; network: string };

export function Level2({ api, lab, setLab, goLevel3 }: { api: ProgressApi; lab: LabConfig; setLab: (l: LabConfig) => void; goLevel3: () => void }) {
  const graph = useMemo(() => generateTopology(lab.seed, lab.difficulty), [lab]);
  const sol = useMemo(() => solveTopology(graph), [graph]);
  const [ans, setAns] = useState<Record<string, Row>>({});
  const [res, setRes] = useState<Record<string, Diagnosis>>({});
  const [hints, setHints] = useState<Note[]>([]);
  const [done, setDone] = useState(false);
  const [viewMode, setViewMode] = useState<'essential' | 'detailed'>('essential');

  useEffect(() => {
    setAns({});
    setRes({});
    setHints([]);
    setDone(false);
  }, [graph]);

  const base = { networkInt: parseIPv4(graph.baseNetwork)!, prefix: graph.basePrefix };
  const reqs = graph.requirements;
  const get = (id: string): Row => ans[id] ?? { prefix: '', network: '' };

  const verify = () => {
    const others: { id: string; name: string; networkInt: number; broadcastInt: number }[] = [];
    for (const r of reqs) {
      const p = parsePrefix(get(r.id).prefix);
      const n = parseIPv4(get(r.id).network);
      if (p !== null && n !== null) others.push({ id: r.id, name: r.name, networkInt: n, broadcastInt: n + blockSize(p) - 1 });
    }
    const out: Record<string, Diagnosis> = {};
    for (const r of reqs) {
      const row = get(r.id);
      if (!row.prefix.trim() && !row.network.trim()) continue;
      if (!row.prefix.trim()) out[r.id] = { ok: false, code: 'ERR_INVALID_FORMAT', message: 'Falta el prefijo de esta subred.' };
      else if (!row.network.trim()) out[r.id] = { ok: false, code: 'ERR_INVALID_FORMAT', message: 'Falta la dirección de red.' };
      else out[r.id] = diagnoseVlsmRow(r, row.prefix, row.network, sol.byId[r.id], others, base);
    }
    setRes(out);
    const list = Object.values(out);
    api.recordChecks(2, list.length, list.filter((d) => d.ok).length);
    const allOk = reqs.every((r) => out[r.id]?.ok);
    if (allOk) {
      sound.playSuccess();
      if (!done) {
        setDone(true);
        api.recordCompletion(2);
      }
    } else {
      sound.playError();
    }
  };

  const hint = () => {
    sound.playKey();
    const order = [...reqs].sort((a, b) => b.hostsRequired - a.hostsRequired || a.id.localeCompare(b.id));
    const next = order.find((r) => !res[r.id]?.ok);
    if (!next) return;
    const idx = order.indexOf(next);
    const text =
      idx === 0
        ? `Empieza por la mayor demanda: «${next.name}» (${next.hostsRequired} hosts). Su bloque arranca en la dirección base ${graph.baseNetwork}.`
        : `Siguiente en el orden descendente: «${next.name}» (${next.hostsRequired} hosts). Su bloque comienza justo donde termina el de «${order[idx - 1].name}».`;
    setHints((h) => [{ tone: 'info', title: `Orden ${idx + 1} de ${order.length}`, text }, ...h]);
  };

  const reveal = () => {
    sound.playEnter();
    const a: Record<string, Row> = {};
    for (const r of reqs) a[r.id] = { prefix: `/${sol.byId[r.id].prefix}`, network: sol.byId[r.id].networkAddress };
    setAns(a);
    setRes({});
  };

  const set = (id: string, patch: Partial<Row>) => {
    setAns((a) => ({ ...a, [id]: { ...get(id), ...patch } }));
    setRes((r) => {
      if (!(id in r)) return r;
      const n = { ...r };
      delete n[id];
      return n;
    });
  };

  const labels: Record<string, string> = {};
  for (const r of reqs) if (res[r.id]?.ok) labels[r.id] = `${sol.byId[r.id].networkAddress}/${sol.byId[r.id].prefix}`;

  const notes: Note[] = [
    ...hints,
    ...reqs.filter((r) => res[r.id] && !res[r.id].ok).map<Note>((r) => ({ tone: 'error', title: r.name, text: res[r.id].message })),
  ];
  const okCount = reqs.filter((r) => res[r.id]?.ok).length;
  const total = reqs.reduce((s, r) => s + sol.byId[r.id].blockSize, 0);

  const partitionItems = sol.ordered.map((s) => ({
    id: s.id,
    name: s.name,
    hostsRequired: s.hostsRequired,
    prefix: s.prefix,
    networkAddress: s.networkAddress,
    blockSize: s.blockSize,
  }));

  return (
    <div className="shell page">
      <div className="page-head">
        <div>
          <span className="eyebrow"><span className="dot" />Nivel 02 · VLSM</span>
          <h1>Plan de direccionamiento</h1>
          <p className="lede">Asigna a cada segmento el prefijo justo y un bloque contiguo dentro de la red base. Ordena de mayor a menor demanda.</p>
        </div>
        <ChallengeBar seed={lab.seed} difficulty={lab.difficulty} onSeed={(seed) => setLab({ ...lab, seed })} onDifficulty={(difficulty) => setLab({ ...lab, difficulty })} />
      </div>

      <div className="workbench">
        <div className="stack">
          <section className="panel">
            <div className="brief" style={{ marginBottom: 18 }}>
              <div><div className="lbl">Red base</div><div className="big">{graph.baseNetwork}/{graph.basePrefix}</div></div>
              <div><div className="lbl">Routers</div><div className="big">{graph.routers.length}</div></div>
              <div><div className="lbl">Segmentos</div><div className="big">{reqs.length}</div></div>
            </div>
            <TopologyCanvas graph={graph} subnetLabels={labels} />
            <AddressSpaceBar
              baseNetwork={graph.baseNetwork}
              basePrefix={graph.basePrefix}
              items={partitionItems}
            />
          </section>

          <section className="panel">
            <div className="panel-head" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
              <div>
                <h3>Asignación de subredes</h3>
                <span className="chip">espacio necesario: {total.toLocaleString('es')} de {(2 ** (32 - graph.basePrefix)).toLocaleString('es')}</span>
              </div>
              <div className="view-toggle" role="group" aria-label="Columnas de la tabla">
                <button
                  type="button"
                  className={viewMode === 'essential' ? 'active' : ''}
                  onClick={() => setViewMode('essential')}
                >
                  Esencial
                </button>
                <button
                  type="button"
                  className={viewMode === 'detailed' ? 'active' : ''}
                  onClick={() => setViewMode('detailed')}
                >
                  Detallada
                </button>
              </div>
            </div>
            <div className="scroll-x">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Segmento</th>
                    <th>Hosts</th>
                    <th>Prefijo</th>
                    <th>Dirección de red</th>
                    {viewMode === 'detailed' && (
                      <>
                        <th>1ª Útil</th>
                        <th>Última Útil</th>
                        <th>Broadcast</th>
                        <th>Máscara</th>
                      </>
                    )}
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {reqs.map((r) => {
                    const d = res[r.id];
                    const c = `cell${d ? (d.ok ? ' ok' : ' err') : ''}`;
                    const pNum = parsePrefix(get(r.id).prefix);
                    const nNum = parseIPv4(get(r.id).network);
                    const calcRow =
                      pNum !== null && nNum !== null
                        ? makeResult(r.id, r.name, r.hostsRequired, nNum, pNum)
                        : (res[r.id]?.ok ? sol.byId[r.id] : null);

                    return (
                      <tr key={r.id}>
                        <td><div className="name">{r.name}</div><div className="muted mono" style={{ fontSize: 11.5 }}>{r.kind === 'WAN' ? 'serial punto a punto' : `${graph.routers.find((x) => x.id === r.endpoints[0].deviceId)!.hostname} · ${r.endpoints[0].interfaceName}`}</div></td>
                        <td className="mono tnum">{r.hostsRequired}</td>
                        <td><input className={`${c} narrow`} aria-label={`Prefijo de ${r.name}`} value={get(r.id).prefix} placeholder="/24" spellCheck={false} onChange={(e) => set(r.id, { prefix: e.target.value })} /></td>
                        <td><input className={c} aria-label={`Red de ${r.name}`} value={get(r.id).network} placeholder="0.0.0.0" spellCheck={false} onChange={(e) => set(r.id, { network: e.target.value })} /></td>
                        {viewMode === 'detailed' && (
                          <>
                            <td className="mono muted" style={{ fontSize: 12 }}>{calcRow?.firstUsableIp ?? '—'}</td>
                            <td className="mono muted" style={{ fontSize: 12 }}>{calcRow?.lastUsableIp ?? '—'}</td>
                            <td className="mono muted" style={{ fontSize: 12 }}>{calcRow?.broadcastAddress ?? '—'}</td>
                            <td className="mono muted" style={{ fontSize: 12 }}>{calcRow?.netmask ?? '—'}</td>
                          </>
                        )}
                        <td>{d && <span className={`chip ${d.ok ? 'olive' : 'danger'}`}>{d.ok ? 'ok' : 'revisar'}</span>}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        </div>

        <aside className="side">
          <div className="panel">
            <div className="stat-row">
              <div className="stat"><div className="v tnum">{okCount}/{reqs.length}</div><div className="k">Correctas</div></div>
              <div className="stat"><div className="v tnum">{reqs.filter((r) => r.kind === 'LAN').length}</div><div className="k">LAN</div></div>
              <div className="stat"><div className="v tnum">{reqs.filter((r) => r.kind === 'WAN').length}</div><div className="k">WAN /30</div></div>
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 16, flexWrap: 'wrap' }}>
              <button className="btn primary" onClick={verify}>Verificar</button>
              <button className="btn" onClick={hint}>Pista</button>
              <button className="btn" onClick={reveal}>Mostrar solución</button>
            </div>
          </div>
          {done && (
            <div className="banner">
              <strong>Plan IP validado.</strong>
              <button className="btn clay sm" onClick={goLevel3}>Configurar routers →</button>
            </div>
          )}
          <div className="panel">
            <div className="panel-head"><h3>Análisis</h3></div>
            <NoteFeed notes={notes} empty="Verifica tu plan para ver solapamientos, máscaras insuficientes o desperdicio de direcciones." />
          </div>
          <button className="btn" onClick={() => setLab({ ...lab, seed: randomSeed() })}>Nueva topología</button>
        </aside>
      </div>
    </div>
  );
}
