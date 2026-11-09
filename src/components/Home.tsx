import { accuracy, type ProgressApi } from '../state/progress';

export type View = 'home' | 'level1' | 'level2' | 'level3' | 'engines';

const LEVELS = [
  { n: 1 as const, view: 'level1' as View, title: 'Subnetting clásico', text: 'Aritmética binaria, máscaras y saltos. Completa el plano de subredes de una red de clase A, B o C.' },
  { n: 2 as const, view: 'level2' as View, title: 'VLSM y topología', text: 'Asigna bloques de tamaño variable a una topología generada. Sin solapamientos y sin desperdicio.' },
  { n: 3 as const, view: 'level3' as View, title: 'Consola Cisco IOS', text: 'Configura interfaces con la sintaxis real de IOS y levanta los enlaces seriales entre routers.' },
];

function HeroArt() {
  return (
    <svg viewBox="0 0 520 420" role="img" aria-label="Ilustración de una red de tres routers y una consola">
      <g fill="none" strokeLinecap="round">
        <path d="M120 110 L330 70" stroke="var(--line-strong)" strokeWidth="2" />
        <path d="M120 110 L230 250" stroke="var(--line-strong)" strokeWidth="2" />
        <path d="M330 70 L230 250" stroke="var(--clay)" strokeWidth="2" strokeDasharray="7 7">
          <animate attributeName="stroke-dashoffset" from="0" to="-28" dur="1.6s" repeatCount="indefinite" />
        </path>
        <path d="M330 70 L440 150" stroke="var(--olive)" strokeWidth="2" strokeDasharray="7 7">
          <animate attributeName="stroke-dashoffset" from="0" to="-28" dur="1.6s" repeatCount="indefinite" />
        </path>
      </g>
      {[[120, 110, 'A'], [330, 70, 'B'], [230, 250, 'C']].map(([x, y, l]) => (
        <g key={String(l)} transform={`translate(${Number(x) - 36},${Number(y) - 28})`}>
          <rect width="72" height="56" rx="16" fill="var(--bg-elev)" stroke="var(--line-strong)" strokeWidth="1.5" />
          <g stroke="var(--clay)" strokeWidth="2" strokeLinecap="round" fill="none" transform="translate(36,22)">
            <circle r="8" />
            <path d="M-14 0h6M8 0h6M0 -14v6M0 8v6" />
          </g>
          <text x="36" y="48" textAnchor="middle" fontFamily="var(--mono)" fontSize="11" fill="var(--ink-2)">Router_{String(l)}</text>
        </g>
      ))}
      <g transform="translate(300,230)">
        <rect width="200" height="150" rx="16" fill="#141413" />
        <g fontFamily="var(--mono)" fontSize="10.5">
          <text x="16" y="30" fill="#e8a27c">Router_A#<tspan fill="#faf9f5"> show ip int br</tspan></text>
          <text x="16" y="54" fill="#8a8880">Ethernet0  10.4.0.1   up   up</text>
          <text x="16" y="72" fill="#8a8880">Serial0/0  10.4.8.1   up   up</text>
          <text x="16" y="96" fill="#e8a27c">Router_A#<tspan fill="#faf9f5"> ping 10.4.8.2</tspan></text>
          <text x="16" y="116" fill="#a3b87f">!!!!!  100 percent</text>
          <rect x="16" y="126" width="7" height="13" fill="#e8a27c">
            <animate attributeName="opacity" values="1;0;1" dur="1.1s" repeatCount="indefinite" />
          </rect>
        </g>
      </g>
    </svg>
  );
}

export function Home({ go, api }: { go: (v: View) => void; api: ProgressApi }) {
  const { progress } = api;
  return (
    <>
      <section className="hero">
        <div className="shell inner">
          <div>
            <span className="eyebrow"><span className="dot" />Laboratorio de redes</span>
            <h1>Aprende redes <em>construyéndolas.</em></h1>
            <p className="lede">Del cálculo binario a la consola de un router. Retos generados al vuelo, validación que explica cada error y un emulador de Cisco IOS que se ejecuta por completo en tu navegador.</p>
            <div className="actions">
              <button className="btn primary" onClick={() => go('level1')}>Empezar el Nivel 1</button>
              <button className="btn" onClick={() => go('engines')}>Probar la calculadora</button>
            </div>
          </div>
          <div className="hero-art"><HeroArt /></div>
        </div>
      </section>

      <section className="section">
        <div className="shell">
          <div className="section-head">
            <div>
              <span className="eyebrow">Ruta de aprendizaje</span>
              <h2>Tres niveles, una misma red.</h2>
            </div>
            <p className="muted" style={{ maxWidth: '40ch' }}>Cada nivel reutiliza la topología del anterior: lo que calculas en el Nivel 2 es lo que configuras en el Nivel 3.</p>
          </div>
          <div className="cards">
            {LEVELS.map((l) => {
              const s = progress[l.n];
              const acc = accuracy(s);
              return (
                <button key={l.n} className="card" onClick={() => go(l.view)}>
                  <span className="num">0{l.n}</span>
                  <h3>{l.title}</h3>
                  <p>{l.text}</p>
                  <div className="meter" aria-hidden><i style={{ width: `${Math.min(100, s.completed * 25)}%` }} /></div>
                  <div className="foot">
                    <span>{s.completed} {s.completed === 1 ? 'reto completado' : 'retos completados'}</span>
                    <span className="mono">{acc === null ? '—' : `${acc}% precisión`}</span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </section>

      <section className="section">
        <div className="shell">
          <div className="section-head">
            <div>
              <span className="eyebrow">Diseñado para el criterio</span>
              <h2>Sin trucos de gamificación.</h2>
            </div>
          </div>
          <div className="spec">
            <div className="card"><h3>Errores que se explican</h3><p>No basta con «incorrecto». El motor identifica la causa: usaste el broadcast como host, dos subredes se solapan o la máscara no alcanza para los hosts pedidos.</p></div>
            <div className="card"><h3>Retos reproducibles</h3><p>Cada reto tiene un código de semilla. Compártelo y otra persona verá exactamente la misma topología y los mismos requerimientos.</p></div>
          </div>
        </div>
      </section>
    </>
  );
}
