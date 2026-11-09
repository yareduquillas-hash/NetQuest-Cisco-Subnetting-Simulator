import type {
  DifficultyLevel,
  InterfaceTargets,
  RouterDevice,
  SubnetRequirement,
  SubnetResult,
  TopologyConnection,
  TopologyGraph,
} from './types';
import { Rng } from './rng';
import { flsmCount, flsmSubnetAt, hostBitsFor, solveVlsm } from './subnet';
import { intToIPv4, parseIPv4 } from './ip';

interface DifficultyConfig {
  routers: [number, number];
  shape: 'line' | 'ring';
  lans: [number, number];
  pool: number[];
  jitter: boolean;
  basePrefix: number;
  base: (r: Rng) => string;
  label: string;
}

export const DIFFICULTY: Record<DifficultyLevel, DifficultyConfig> = {
  EASY: {
    label: 'Fácil',
    routers: [2, 2],
    shape: 'line',
    lans: [1, 2],
    pool: [10, 20, 30, 50, 60, 100, 120],
    jitter: false,
    basePrefix: 24,
    base: (r) => `192.168.${r.int(0, 255)}.0`,
  },
  MEDIUM: {
    label: 'Medio',
    routers: [3, 3],
    shape: 'line',
    lans: [2, 3],
    pool: [4, 15, 60, 100, 250, 500],
    jitter: true,
    basePrefix: 20,
    base: (r) => `172.${r.int(16, 31)}.${r.int(0, 15) * 16}.0`,
  },
  HARD: {
    label: 'Difícil',
    routers: [3, 4],
    shape: 'ring',
    lans: [2, 4],
    pool: [10, 25, 60, 100, 300, 1000, 2000, 4000],
    jitter: true,
    basePrefix: 16,
    base: (r) => `10.${r.int(0, 255)}.0.0`,
  },
};

const LETTERS = ['A', 'B', 'C', 'D'];

function layout(n: number, shape: 'line' | 'ring'): { x: number; y: number }[] {
  if (shape === 'line') {
    if (n === 2) return [{ x: 0.3, y: 0.5 }, { x: 0.7, y: 0.5 }];
    return [{ x: 0.18, y: 0.5 }, { x: 0.5, y: 0.5 }, { x: 0.82, y: 0.5 }];
  }
  if (n === 3) return [{ x: 0.5, y: 0.22 }, { x: 0.25, y: 0.74 }, { x: 0.75, y: 0.74 }];
  return [{ x: 0.3, y: 0.26 }, { x: 0.7, y: 0.26 }, { x: 0.7, y: 0.76 }, { x: 0.3, y: 0.76 }];
}

const blocksTotal = (reqs: SubnetRequirement[]) => reqs.reduce((s, r) => s + 2 ** hostBitsFor(r.hostsRequired), 0);

export function generateTopology(seed: string, difficulty: DifficultyLevel): TopologyGraph {
  const rng = new Rng(`${seed}|${difficulty}|topology`);
  const cfg = DIFFICULTY[difficulty];
  const n = rng.int(cfg.routers[0], cfg.routers[1]);
  const pos = layout(n, cfg.shape);

  const routers: RouterDevice[] = [];
  const requirements: SubnetRequirement[] = [];

  for (let i = 0; i < n; i++) {
    const L = LETTERS[i];
    const id = `router_${L.toLowerCase()}`;
    const interfaces: RouterDevice['interfaces'] = {};
    const lanCount = rng.int(cfg.lans[0], cfg.lans[1]);
    for (let k = 0; k < lanCount; k++) {
      const name = `Ethernet${k}`;
      let hosts = rng.pick(cfg.pool);
      if (cfg.jitter) hosts = Math.max(2, Math.round(hosts * (0.55 + rng.float() * 0.8)));
      const reqId = `LAN_${L}${k + 1}`;
      interfaces[name] = { id: `${id}:${name}`, name, type: 'ETHERNET', assignedSubnetId: reqId };
      requirements.push({
        id: reqId,
        name: `LAN ${L}${k + 1}`,
        kind: 'LAN',
        hostsRequired: hosts,
        endpoints: [{ deviceId: id, interfaceName: name }],
      });
    }
    routers.push({ id, hostname: `Router_${L}`, position: pos[i], interfaces });
  }

  const pairs: [number, number][] = [];
  for (let i = 0; i < n - 1; i++) pairs.push([i, i + 1]);
  if (cfg.shape === 'ring' && n >= 3) pairs.push([n - 1, 0]);

  const connections: TopologyConnection[] = [];
  const serialIdx: Record<string, number> = {};
  for (const [a, b] of pairs) {
    const ra = routers[a];
    const rb = routers[b];
    const ia = `Serial0/${(serialIdx[ra.id] = (serialIdx[ra.id] ?? -1) + 1)}`;
    const ib = `Serial0/${(serialIdx[rb.id] = (serialIdx[rb.id] ?? -1) + 1)}`;
    const reqId = `WAN_${LETTERS[a]}${LETTERS[b]}`;
    ra.interfaces[ia] = { id: `${ra.id}:${ia}`, name: ia, type: 'SERIAL', isDCE: true, assignedSubnetId: reqId };
    rb.interfaces[ib] = { id: `${rb.id}:${ib}`, name: ib, type: 'SERIAL', isDCE: false, assignedSubnetId: reqId };
    connections.push({
      id: reqId,
      fromRouterId: ra.id,
      fromInterface: ia,
      toRouterId: rb.id,
      toInterface: ib,
      connectionType: 'WAN_SERIAL',
      subnetId: reqId,
    });
    requirements.push({
      id: reqId,
      name: `Enlace serial ${LETTERS[a]}–${LETTERS[b]}`,
      kind: 'WAN',
      hostsRequired: 2,
      endpoints: [
        { deviceId: ra.id, interfaceName: ia },
        { deviceId: rb.id, interfaceName: ib },
      ],
    });
  }

  // El plan debe caber en la red base: reducimos la LAN más grande hasta que quepa.
  const capacity = 2 ** (32 - cfg.basePrefix);
  while (blocksTotal(requirements) > capacity) {
    const big = requirements.filter((r) => r.kind === 'LAN').sort((x, y) => y.hostsRequired - x.hostsRequired)[0];
    big.hostsRequired = Math.max(2, Math.floor(big.hostsRequired / 2));
  }

  return {
    seed,
    difficulty,
    baseNetwork: cfg.base(rng),
    basePrefix: cfg.basePrefix,
    shape: cfg.shape,
    routers,
    connections,
    requirements: rng.shuffle(requirements),
  };
}

export interface TopologySolution {
  ordered: SubnetResult[];
  byId: Record<string, SubnetResult>;
  targets: InterfaceTargets;
}

export function solveTopology(g: TopologyGraph): TopologySolution {
  const sol = solveVlsm(g.baseNetwork, g.basePrefix, g.requirements);
  if (!sol.ok) throw new Error(sol.error);
  const byId: Record<string, SubnetResult> = {};
  sol.subnets.forEach((s) => (byId[s.id] = s));
  const targets: InterfaceTargets = {};
  const put = (dev: string, ifn: string, ip: number, s: SubnetResult, role: string) => {
    (targets[dev] ??= {})[ifn] = {
      ip: intToIPv4(ip),
      mask: s.netmask,
      prefix: s.prefix,
      networkAddress: s.networkAddress,
      subnetId: s.id,
      role,
    };
  };
  for (const req of g.requirements) {
    const s = byId[req.id];
    const first = parseIPv4(s.firstUsableIp)!;
    const last = parseIPv4(s.lastUsableIp)!;
    if (req.kind === 'LAN') {
      put(req.endpoints[0].deviceId, req.endpoints[0].interfaceName, first, s, 'Gateway · primera IP útil');
    } else {
      put(req.endpoints[0].deviceId, req.endpoints[0].interfaceName, first, s, 'DCE · primera IP útil');
      put(req.endpoints[1].deviceId, req.endpoints[1].interfaceName, last, s, 'DTE · última IP útil');
    }
  }
  return { ordered: sol.subnets, byId, targets };
}

// ── Nivel 1: subnetting clásico ─────────────────────────────────────────────
export interface FlsmChallenge {
  seed: string;
  difficulty: DifficultyLevel;
  baseNetwork: string;
  baseNetworkInt: number;
  basePrefix: number;
  newPrefix: number;
  classLetter: 'A' | 'B' | 'C';
  subnetCount: number;
  hostsPerSubnet: number;
  jumpOctet: number;
  jump: number;
  rows: { index: number; expected: SubnetResult }[];
}

export function generateFlsmChallenge(seed: string, difficulty: DifficultyLevel): FlsmChallenge {
  const rng = new Rng(`${seed}|${difficulty}|flsm`);
  let baseNetwork: string;
  let basePrefix: number;
  let classLetter: 'A' | 'B' | 'C';
  let newPrefix: number;
  if (difficulty === 'EASY') {
    classLetter = 'C';
    basePrefix = 24;
    baseNetwork = `192.168.${rng.int(0, 255)}.0`;
    newPrefix = rng.int(26, 28);
  } else if (difficulty === 'MEDIUM') {
    classLetter = 'B';
    basePrefix = 16;
    baseNetwork = `172.${rng.int(16, 31)}.0.0`;
    newPrefix = rng.pick([19, 20, 21, 22, 23]);
  } else {
    classLetter = 'A';
    basePrefix = 8;
    baseNetwork = '10.0.0.0';
    newPrefix = rng.pick([10, 11, 12, 13, 14, 15, 17, 18, 19, 20, 21, 22]);
  }
  const baseInt = parseIPv4(baseNetwork)!;
  const count = flsmCount(basePrefix, newPrefix);
  const set = new Set<number>([0, count - 1]);
  while (set.size < Math.min(count, 6)) set.add(rng.int(1, count - 2));
  const indices = [...set].sort((a, b) => a - b);
  const jumpOctet = Math.floor((newPrefix - 1) / 8) + 1;
  return {
    seed,
    difficulty,
    baseNetwork,
    baseNetworkInt: baseInt,
    basePrefix,
    newPrefix,
    classLetter,
    subnetCount: count,
    hostsPerSubnet: 2 ** (32 - newPrefix) - 2,
    jumpOctet,
    jump: 2 ** (8 * jumpOctet - newPrefix),
    rows: indices.map((index) => ({ index, expected: flsmSubnetAt(baseInt, basePrefix, newPrefix, index) })),
  };
}
