import { useMemo, useState } from 'react';
import { binaryOctets, ipClass, parseIPv4, parsePrefix } from '../engines/ip';
import { makeResult, solveVlsm } from '../engines/subnet';
import { sound } from '../engines/sound';
import { AddressSpaceBar, BitStrip } from './shared';

const ENGINES = [
  { name: 'SubnetEngine', file: 'engines/subnet.ts', text: 'Aritmética uint32, FLSM, solver VLSM voraz y diagnóstico pedagógico: distingue broadcast usado como host, solapamientos, máscaras insuficientes o desperdicio.' },
  { name: 'TopologyGenerator', file: 'engines/topology.ts', text: 'Genera redes reproducibles desde una semilla (Mulberry32). Dos personas con el mismo código de reto obtienen exactamente la misma topología.' },
  { name: 'CiscoCLIEngine', file: 'engines/cli.ts', text: 'Máquina de estados con cuatro modos, abreviaturas por prefijo, marcador «^», ambigüedad, estado de líneas seriales (DCE/clock rate), rutas estáticas y ping.' },
  { name: 'Progreso local', file: 'state/progress.ts', text: 'Retos completados y precisión por nivel, guardados en el navegador. Sin cuentas, sin servidor.' },
];

interface CustomVlsmReq {
  id: string;
  name: string;
  hosts: number;
}

export function Engines() {
  const [activeTab, setActiveTab] = useState<'flsm' | 'vlsm'>('flsm');

  // Estado pestaña FLSM
  const [ip, setIp] = useState('172.16.45.130');
  const [pfx, setPfx] = useState('/19');
  const calc = useMemo(() => {
    const v = parseIPv4(ip);
    const p = parsePrefix(pfx);
    if (v === null || p === null) return null;
    const net = Math.floor(v / 2 ** (32 - p)) * 2 ** (32 - p);
    return { v, p, r: makeResult('calc', 'calc', 0, net, p) };
  }, [ip, pfx]);

  // Estado pestaña VLSM
  const [vlsmBaseNet, setVlsmBaseNet] = useState('192.168.10.0');
  const [vlsmBasePrefix, setVlsmBasePrefix] = useState('/24');
  const [vlsmReqs, setVlsmReqs] = useState<CustomVlsmReq[]>([
    { id: 'req_1', name: 'LAN Gerencia', hosts: 55 },
    { id: 'req_2', name: 'LAN Desarrollo', hosts: 28 },
    { id: 'req_3', name: 'LAN Servidores', hosts: 14 },
    { id: 'req_4', name: 'WAN Serial R1-R2', hosts: 2 },
  ]);

  const pVlsm = parsePrefix(vlsmBasePrefix);
  const vlsmSolution = useMemo(() => {
    if (pVlsm === null || parseIPv4(vlsmBaseNet) === null) return null;
    return solveVlsm(
      vlsmBaseNet,
      pVlsm,
      vlsmReqs.map((r) => ({ id: r.id, name: r.name, hostsRequired: r.hosts })),
    );
  }, [vlsmBaseNet, pVlsm, vlsmReqs]);

  const addVlsmReq = () => {
    sound.playKey();
    const nextIdx = vlsmReqs.length + 1;
    setVlsmReqs((prev) => [
      ...prev,
      { id: `req_${Date.now()}`, name: `LAN Segmento ${nextIdx}`, hosts: 10 },
    ]);
  };

  const removeVlsmReq = (id: string) => {
    sound.playKey();
    setVlsmReqs((prev) => prev.filter((r) => r.id !== id));
  };

  const updateVlsmReq = (id: string, patch: Partial<CustomVlsmReq>) => {
    setVlsmReqs((prev) =>
      prev.map((r) => (r.id === id ? { ...r, ...patch } : r)),
    );
  };

  return (
    <div className="shell page">
      <div className="page-head">
        <div>
          <span className="eyebrow"><span className="dot" />Motores</span>
          <h1>Bajo el capó</h1>
          <p className="lede">Toda la lógica de enrutamiento y subnetting corre en tu navegador sin dependencias ni latencia.</p>
        </div>
      </div>

      <div className="tabs" role="tablist" aria-label="Herramientas" style={{ marginBottom: 20 }}>
        <button
          role="tab"
          className="tab"
          aria-selected={activeTab === 'flsm'}
          onClick={() => {
            sound.playKey();
            setActiveTab('flsm');
          }}
        >
          Calculadora de subred IPv4 (FLSM)
        </button>
        <button
          role="tab"
          className="tab"
          aria-selected={activeTab === 'vlsm'}
          onClick={() => {
            sound.playKey();
            setActiveTab('vlsm');
          }}
        >
          Optimizador VLSM Voraz
        </button>
      </div>

      {activeTab === 'flsm' ? (
        <section className="panel" style={{ marginBottom: 24 }}>
          <div className="calc-row">
            <label><span className="field-label">Dirección IPv4</span><input className="cell" value={ip} onChange={(e) => setIp(e.target.value)} spellCheck={false} /></label>
            <label><span className="field-label">Prefijo o máscara</span><input className="cell narrow" value={pfx} onChange={(e) => setPfx(e.target.value)} spellCheck={false} /></label>
            {calc && <span className="chip clay">Clase {ipClass(calc.v)}</span>}
          </div>
          {calc ? (
            <>
              <BitStrip ip={calc.v} basePrefix={calc.p} />
              <div className="kv" style={{ marginTop: 18 }}>
                {([
                  ['Máscara', calc.r.netmask],
                  ['Wildcard', calc.r.wildcardMask],
                  ['Dirección de red', calc.r.networkAddress],
                  ['Primera útil', calc.r.firstUsableIp],
                  ['Última útil', calc.r.lastUsableIp],
                  ['Broadcast', calc.r.broadcastAddress],
                  ['Hosts útiles', calc.r.hostsAvailable.toLocaleString('es')],
                  ['Tamaño de bloque', calc.r.blockSize.toLocaleString('es')],
                  ['Binario', binaryOctets(calc.v).join('.')],
                ] as const).map(([k, v]) => (
                  <div key={k}><div className="k">{k}</div><div className="v">{v}</div></div>
                ))}
              </div>
            </>
          ) : (
            <p className="empty">Introduce una IPv4 válida (por ejemplo 10.0.0.1) y un prefijo (/24 o 255.255.255.0).</p>
          )}
        </section>
      ) : (
        <section className="panel" style={{ marginBottom: 24 }}>
          <div className="calc-row">
            <label>
              <span className="field-label">Red base</span>
              <input
                className="cell"
                value={vlsmBaseNet}
                onChange={(e) => setVlsmBaseNet(e.target.value)}
                placeholder="192.168.1.0"
                spellCheck={false}
              />
            </label>
            <label>
              <span className="field-label">Prefijo base</span>
              <input
                className="cell narrow"
                value={vlsmBasePrefix}
                onChange={(e) => setVlsmBasePrefix(e.target.value)}
                placeholder="/24"
                spellCheck={false}
              />
            </label>
            <button type="button" className="btn sm" onClick={addVlsmReq}>
              + Añadir requerimiento
            </button>
          </div>

          <div style={{ marginBottom: 18 }}>
            <div className="panel-head">
              <h4>Requerimientos de hosts</h4>
            </div>
            <div className="scroll-x">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Nombre del segmento</th>
                    <th>Hosts requeridos</th>
                    <th>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {vlsmReqs.map((r) => (
                    <tr key={r.id}>
                      <td>
                        <input
                          className="cell"
                          value={r.name}
                          onChange={(e) => updateVlsmReq(r.id, { name: e.target.value })}
                          spellCheck={false}
                        />
                      </td>
                      <td>
                        <input
                          className="cell narrow"
                          type="number"
                          min="1"
                          max="100000"
                          value={r.hosts}
                          onChange={(e) => updateVlsmReq(r.id, { hosts: Math.max(1, Number(e.target.value) || 1) })}
                        />
                      </td>
                      <td>
                        <button
                          type="button"
                          className="btn sm"
                          onClick={() => removeVlsmReq(r.id)}
                          title="Eliminar segmento"
                          disabled={vlsmReqs.length <= 1}
                        >
                          Eliminar
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {vlsmSolution && vlsmSolution.ok && pVlsm !== null ? (
            <>
              <AddressSpaceBar
                baseNetwork={vlsmBaseNet}
                basePrefix={pVlsm}
                items={vlsmSolution.subnets.map((s) => ({
                  id: s.id,
                  name: s.name,
                  hostsRequired: s.hostsRequired,
                  prefix: s.prefix,
                  networkAddress: s.networkAddress,
                  blockSize: s.blockSize,
                }))}
              />

              <div style={{ marginTop: 20 }}>
                <div className="panel-head">
                  <h4>Plan de direccionamiento calculado (Algoritmo voraz)</h4>
                </div>
                <div className="scroll-x">
                  <table className="tbl">
                    <thead>
                      <tr>
                        <th>Segmento</th>
                        <th>Hosts req.</th>
                        <th>Hosts útiles</th>
                        <th>Prefijo</th>
                        <th>Máscara</th>
                        <th>Dirección de red</th>
                        <th>Rango útil</th>
                        <th>Broadcast</th>
                      </tr>
                    </thead>
                    <tbody>
                      {vlsmSolution.subnets.map((s) => (
                        <tr key={s.id}>
                          <td className="name">{s.name}</td>
                          <td className="mono tnum">{s.hostsRequired}</td>
                          <td className="mono tnum">{s.hostsAvailable.toLocaleString('es')}</td>
                          <td className="mono">/{s.prefix}</td>
                          <td className="mono muted" style={{ fontSize: 12 }}>{s.netmask}</td>
                          <td className="mono" style={{ fontWeight: 500 }}>{s.networkAddress}</td>
                          <td className="mono muted" style={{ fontSize: 12 }}>{s.firstUsableIp} - {s.lastUsableIp}</td>
                          <td className="mono muted" style={{ fontSize: 12 }}>{s.broadcastAddress}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          ) : vlsmSolution && !vlsmSolution.ok ? (
            <div className="note error" style={{ marginTop: 16 }}>
              <div className="note-body">
                <b>Error de dimensionamiento</b>
                <p>{vlsmSolution.error}</p>
              </div>
            </div>
          ) : (
            <p className="empty">Introduce una dirección de red y prefijo base válidos.</p>
          )}
        </section>
      )}

      <div className="spec">
        {ENGINES.map((e) => (
          <div className="card" key={e.name}>
            <h3>{e.name}</h3>
            <p>{e.text}</p>
            <div><span className="code">{e.file}</span></div>
          </div>
        ))}
      </div>
    </div>
  );
}
