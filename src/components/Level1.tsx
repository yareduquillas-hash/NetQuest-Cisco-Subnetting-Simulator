import { useEffect, useMemo, useState } from 'react';
import type { DifficultyLevel } from '../engines/types';
import { diagnoseField, type Diagnosis, type SubnetField } from '../engines/subnet';
import { generateFlsmChallenge } from '../engines/topology';
import { parsePrefix } from '../engines/ip';
import { randomSeed } from '../engines/rng';
import type { ProgressApi } from '../state/progress';
import { BitStrip, ChallengeBar, NoteFeed, type Note } from './shared';

const OK: Diagnosis = { ok: true, message: 'Correcto.' };
const miss = (message: string): Diagnosis => ({ ok: false, code: 'ERR_MISMATCH', message });
const FIELDS: { f: SubnetField; label: string }[] = [
  { f: 'network', label: 'Red' },
  { f: 'first', label: '1ª útil' },
  { f: 'last', label: 'Última útil' },
  { f: 'broadcast', label: 'Broadcast' },
];

export function Level1({ api }: { api: ProgressApi }) {
  const [seed, setSeed] = useState(randomSeed);
  const [difficulty, setDifficulty] = useState<DifficultyLevel>('EASY');
  const ch = useMemo(() => generateFlsmChallenge(seed, difficulty), [seed, difficulty]);
  const [ans, setAns] = useState<Record<string, string>>({});
  const [res, setRes] = useState<Record<string, Diagnosis>>({});
  const [hints, setHints] = useState<Note[]>([]);
  const [done, setDone] = useState(false);

  useEffect(() => {
    setAns({});
    setRes({});
    setHints([]);
    setDone(false);
  }, [ch]);

  const keys = useMemo(
    () => ['mask', 'jump', 'count', 'hosts', ...ch.rows.flatMap((r) => FIELDS.map((f) => `${r.index}:${f.f}`))],
    [ch],
  );
  const bits = ch.newPrefix - ch.basePrefix;
  const hostBits = 32 - ch.newPrefix;

  const verify = () => {
    const out: Record<string, Diagnosis> = {};
    const val = (k: string) => (ans[k] ?? '').trim();
    if (val('mask')) {
      const p = parsePrefix(val('mask'));
      out.mask =
        p === null
          ? { ok: false, code: 'ERR_INVALID_FORMAT', message: 'Escribe la máscara como /N o en decimal (255.255.x.x).' }
          : p === ch.newPrefix
            ? OK
            : p === ch.basePrefix
              ? miss('Esa es la máscara original: aún no tomaste bits prestados.')
              : miss(`No coincide. Necesitas ${ch.subnetCount} subredes: cuenta cuántos bits prestados hacen falta.`);
    }
    if (val('jump')) out.jump = Number(val('jump')) === ch.jump ? OK : miss(`El salto es la diferencia entre redes consecutivas en el octeto ${ch.jumpOctet}: 2 elevado a los bits de host que le quedan a ese octeto.`);
    if (val('count')) out.count = Number(val('count')) === ch.subnetCount ? OK : miss('El número de subredes es 2 elevado a los bits prestados.');
    if (val('hosts')) {
      const n = Number(val('hosts'));
      out.hosts = n === ch.hostsPerSubnet ? OK : n === ch.hostsPerSubnet + 2 ? miss('Recuerda restar la dirección de red y la de broadcast.') : miss('Hosts útiles = 2^(bits de host) − 2.');
    }
    for (const r of ch.rows)
      for (const { f } of FIELDS) {
        const k = `${r.index}:${f}`;
        if (val(k)) out[k] = diagnoseField(f, val(k), r.expected);
      }
    setRes(out);
    const entries = Object.values(out);
    api.recordChecks(1, entries.length, entries.filter((d) => d.ok).length);
    if (!done && keys.every((k) => out[k]?.ok)) {
      setDone(true);
      api.recordCompletion(1);
    }
  };

  const label = (k: string) => {
    if (k === 'mask') return 'Máscara';
    if (k === 'jump') return 'Salto';
    if (k === 'count') return 'Nº de subredes';
    if (k === 'hosts') return 'Hosts por subred';
    const [i, f] = k.split(':');
    return `Subred #${Number(i) + 1} · ${FIELDS.find((x) => x.f === f)!.label}`;
  };

  const hint = () => {
    const k = keys.find((x) => !res[x]?.ok);
    if (!k) return;
    let text = '';
    if (k === 'mask') text = `Tomaste ${bits} bits prestados de /${ch.basePrefix}; la máscara resultante tiene ${ch.newPrefix} unos consecutivos.`;
    else if (k === 'jump') text = `Mira el octeto ${ch.jumpOctet}: le quedan ${8 * ch.jumpOctet - ch.newPrefix} bits de host. El salto es 2 elevado a ese número.`;
    else if (k === 'count') text = `Se prestaron ${bits} bits: aplica 2^${bits}.`;
    else if (k === 'hosts') text = `Quedan ${hostBits} bits de host: calcula 2^${hostBits} − 2.`;
    else {
      const [i, f] = k.split(':');
      const size = 2 ** hostBits;
      text =
        f === 'network'
          ? `La red n.º ${Number(i) + 1} = red base + ${i} × ${size} direcciones (el índice cuenta desde 0).`
          : f === 'first'
            ? 'La primera útil es la dirección de red + 1.'
            : f === 'last'
              ? 'La última útil es el broadcast − 1.'
              : 'El broadcast es la última dirección del bloque: la red siguiente − 1.';
    }
    setHints((h) => [{ tone: 'info', title: label(k), text }, ...h]);
  };

  const reveal = () => {
    const a: Record<string, string> = {
      mask: `/${ch.newPrefix}`,
      jump: String(ch.jump),
      count: String(ch.subnetCount),
      hosts: String(ch.hostsPerSubnet),
    };
    for (const r of ch.rows) {
      a[`${r.index}:network`] = r.expected.networkAddress;
      a[`${r.index}:first`] = r.expected.firstUsableIp;
      a[`${r.index}:last`] = r.expected.lastUsableIp;
      a[`${r.index}:broadcast`] = r.expected.broadcastAddress;
    }
    setAns(a);
    setRes({});
  };

  const cls = (k: string) => `cell${res[k] ? (res[k].ok ? ' ok' : ' err') : ''}`;
  const set = (k: string, v: string) => {
    setAns((a) => ({ ...a, [k]: v }));
    setRes((r) => {
      if (!(k in r)) return r;
      const n = { ...r };
      delete n[k];
      return n;
    });
  };

  const notes: Note[] = [
    ...hints,
    ...keys.filter((k) => res[k] && !res[k].ok).map<Note>((k) => ({ tone: 'error', title: label(k), text: res[k].message })),
  ];
  const okCount = keys.filter((k) => res[k]?.ok).length;

  return (
    <div className="shell page">
      <div className="page-head">
        <div>
          <span className="eyebrow"><span className="dot" />Nivel 01 · FLSM</span>
          <h1>Subnetting clásico</h1>
          <p className="lede">Divide una red con clase en subredes de igual tamaño y completa su plano de direcciones.</p>
        </div>
        <ChallengeBar seed={seed} difficulty={difficulty} onSeed={setSeed} onDifficulty={setDifficulty} />
      </div>

      <div className="workbench">
        <div className="stack">
          <section className="panel">
            <div className="brief">
              <div><div className="lbl">Red base</div><div className="big">{ch.baseNetwork}/{ch.basePrefix}</div></div>
              <div><div className="lbl">Clase</div><div className="big">{ch.classLetter}</div></div>
              <div><div className="lbl">Dividir en</div><div className="big" style={{ color: 'var(--clay-ink)' }}>/{ch.newPrefix}</div></div>
            </div>
            <BitStrip ip={ch.baseNetworkInt} basePrefix={ch.basePrefix} newPrefix={ch.newPrefix} />
          </section>

          <section className="panel">
            <div className="panel-head"><h3>Parámetros de la división</h3></div>
            <div className="globals">
              {([['mask', 'Máscara', '/N o decimal'], ['jump', `Salto (octeto ${ch.jumpOctet})`, 'número'], ['count', 'Nº de subredes', 'número'], ['hosts', 'Hosts por subred', 'número']] as const).map(([k, l, ph]) => (
                <label key={k}>
                  <span className="field-label">{l}</span>
                  <input className={cls(k)} value={ans[k] ?? ''} placeholder={ph} spellCheck={false} onChange={(e) => set(k, e.target.value)} />
                </label>
              ))}
            </div>
          </section>

          <section className="panel">
            <div className="panel-head">
              <h3>Tabla de subredes</h3>
              <span className="chip">{ch.subnetCount.toLocaleString('es')} subredes en total</span>
            </div>
            <div className="scroll-x">
              <table className="tbl">
                <thead>
                  <tr><th>#</th>{FIELDS.map((f) => <th key={f.f}>{f.label}</th>)}</tr>
                </thead>
                <tbody>
                  {ch.rows.map((r) => (
                    <tr key={r.index}>
                      <td className="idx">{r.index + 1}{r.index === 0 ? ' · primera' : r.index === ch.subnetCount - 1 ? ' · última' : ''}</td>
                      {FIELDS.map(({ f }) => {
                        const k = `${r.index}:${f}`;
                        return (
                          <td key={f}>
                            <input className={cls(k)} aria-label={label(k)} value={ans[k] ?? ''} spellCheck={false} placeholder="0.0.0.0" onChange={(e) => set(k, e.target.value)} />
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>

        <aside className="side">
          <div className="panel">
            <div className="stat-row">
              <div className="stat"><div className="v tnum">{okCount}/{keys.length}</div><div className="k">Correctas</div></div>
              <div className="stat"><div className="v tnum">{bits}</div><div className="k">Bits prestados</div></div>
              <div className="stat"><div className="v tnum">{hostBits}</div><div className="k">Bits de host</div></div>
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 16, flexWrap: 'wrap' }}>
              <button className="btn primary" onClick={verify}>Verificar</button>
              <button className="btn" onClick={hint}>Pista</button>
              <button className="btn" onClick={reveal}>Mostrar solución</button>
            </div>
          </div>
          {done && (
            <div className="banner"><strong>Reto completado.</strong><button className="btn sm" onClick={() => setSeed(randomSeed())}>Siguiente</button></div>
          )}
          <div className="panel">
            <div className="panel-head"><h3>Análisis</h3></div>
            <NoteFeed notes={notes} empty="Completa los campos y pulsa Verificar. Aquí verás el motivo concreto de cada error." />
          </div>
        </aside>
      </div>
    </div>
  );
}
