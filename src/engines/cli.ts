import type {
  ActiveInterfaceConfig,
  CiscoMode,
  CLICommandFeedback,
  CliErrorType,
  InterfaceTarget,
  InterfaceTargets,
  InterfaceType,
  RouterRuntimeState,
  TopologyGraph,
} from './types';
import { blockSize, intToIPv4, maskToPrefix, networkOf, parseIPv4 } from './ip';

// ════════════════════════════════════════════════════════════════════════════
// Estado del laboratorio
// ════════════════════════════════════════════════════════════════════════════
export interface LabState {
  topology: TopologyGraph;
  targets: InterfaceTargets;
  runtimes: Record<string, RouterRuntimeState>;
}

export type LabEvent =
  | { type: 'COMMAND'; routerId: string }
  | { type: 'ERROR'; routerId: string; kind: CliErrorType }
  | { type: 'IP_ASSIGNED'; routerId: string; ifName: string; ok: boolean }
  | { type: 'IFACE_UP'; routerId: string; ifName: string }
  | { type: 'PING'; routerId: string; ok: boolean };

export interface Diagnostic {
  severity: 'ok' | 'warn' | 'error' | 'info';
  message: string;
}

export interface ExecResult {
  lab: LabState;
  feedback: CLICommandFeedback;
  events: LabEvent[];
  diagnostics: Diagnostic[];
}

export function createLab(topology: TopologyGraph, targets: InterfaceTargets): LabState {
  const runtimes: Record<string, RouterRuntimeState> = {};
  for (const r of topology.routers) {
    const interfaces: Record<string, ActiveInterfaceConfig> = {};
    for (const name of Object.keys(r.interfaces)) interfaces[name] = { isUp: false };
    runtimes[r.id] = {
      deviceId: r.id,
      hostname: r.hostname,
      currentMode: 'USER_EXEC',
      runningConfig: { interfaces },
      commandHistory: [],
    };
  }
  return { topology, targets, runtimes };
}

const SUFFIX: Record<CiscoMode, string> = {
  USER_EXEC: '>',
  PRIVILEGED_EXEC: '#',
  GLOBAL_CONFIG: '(config)#',
  INTERFACE_CONFIG: '(config-if)#',
};
const MODE_LABEL: Record<CiscoMode, string> = {
  USER_EXEC: 'EXEC de usuario (Router>)',
  PRIVILEGED_EXEC: 'EXEC privilegiado (Router#)',
  GLOBAL_CONFIG: 'configuración global (Router(config)#)',
  INTERFACE_CONFIG: 'configuración de interfaz (Router(config-if)#)',
};
export const promptFor = (rt: RouterRuntimeState): string => rt.hostname + SUFFIX[rt.currentMode];

// ── Estado físico / lógico de interfaces ────────────────────────────────────
const routerOf = (lab: LabState, id: string) => lab.topology.routers.find((r) => r.id === id)!;

function peerOf(lab: LabState, routerId: string, ifName: string) {
  for (const c of lab.topology.connections) {
    if (c.fromRouterId === routerId && c.fromInterface === ifName) return { routerId: c.toRouterId, ifName: c.toInterface };
    if (c.toRouterId === routerId && c.toInterface === ifName) return { routerId: c.fromRouterId, ifName: c.fromInterface };
  }
  return null;
}

export function interfaceStatus(lab: LabState, routerId: string, ifName: string): { status: string; protocol: 'up' | 'down' } {
  const cfg = lab.runtimes[routerId].runningConfig.interfaces[ifName];
  if (!cfg.isUp) return { status: 'administratively down', protocol: 'down' };
  const dev = routerOf(lab, routerId).interfaces[ifName];
  if (dev.type === 'ETHERNET') return { status: 'up', protocol: 'up' };
  const peer = peerOf(lab, routerId, ifName);
  if (!peer) return { status: 'down', protocol: 'down' };
  const peerCfg = lab.runtimes[peer.routerId].runningConfig.interfaces[peer.ifName];
  if (!peerCfg.isUp) return { status: 'down', protocol: 'down' };
  const dceCfg = dev.isDCE ? cfg : peerCfg;
  return { status: 'up', protocol: dceCfg.clockRate ? 'up' : 'down' };
}

function reachable(lab: LabState, srcId: string, dest: number, visited = new Set<string>()): boolean {
  if (visited.has(srcId)) return false;
  visited.add(srcId);

  const src = lab.runtimes[srcId]?.runningConfig.interfaces;
  if (!src) return false;

  // 1. La IP pertenece a una interfaz activa del propio router
  for (const [, c] of Object.entries(src)) {
    if (c.ipAddress && parseIPv4(c.ipAddress) === dest && c.isUp) return true;
  }

  // 2. La IP está en una red directamente conectada con protocolo up
  for (const [n, c] of Object.entries(src)) {
    if (!c.ipAddress || !c.subnetMask) continue;
    if (interfaceStatus(lab, srcId, n).protocol !== 'up') continue;
    const p = maskToPrefix(parseIPv4(c.subnetMask)!)!;
    const net = networkOf(parseIPv4(c.ipAddress)!, p);
    if (networkOf(dest, p) === net) {
      for (const [rid, rt] of Object.entries(lab.runtimes)) {
        if (rid === srcId) continue;
        for (const [pn, pc] of Object.entries(rt.runningConfig.interfaces)) {
          if (pc.ipAddress && parseIPv4(pc.ipAddress) === dest && interfaceStatus(lab, rid, pn).protocol === 'up') {
            return true;
          }
        }
      }
    }
  }

  // 3. Consulta de rutas estáticas configuradas
  const rt = lab.runtimes[srcId];
  for (const sr of rt.runningConfig.staticRoutes ?? []) {
    const net = parseIPv4(sr.network);
    if (net !== null && networkOf(dest, sr.prefix) === net) {
      const nhInt = parseIPv4(sr.nextHop);
      if (nhInt !== null) {
        for (const [rid, rState] of Object.entries(lab.runtimes)) {
          if (rid === srcId) continue;
          for (const [pn, pc] of Object.entries(rState.runningConfig.interfaces)) {
            if (pc.ipAddress && parseIPv4(pc.ipAddress) === nhInt && interfaceStatus(lab, rid, pn).protocol === 'up') {
              if (reachable(lab, rid, dest, new Set(visited))) return true;
            }
          }
        }
      }
    }
  }

  // 4. Propagación multi-salto sobre enlaces seriales en UP
  for (const c of lab.topology.connections) {
    let peerId: string | null = null;
    let localIf: string | null = null;
    if (c.fromRouterId === srcId) { peerId = c.toRouterId; localIf = c.fromInterface; }
    else if (c.toRouterId === srcId) { peerId = c.fromRouterId; localIf = c.toInterface; }
    if (peerId && localIf && interfaceStatus(lab, srcId, localIf).protocol === 'up') {
      if (reachable(lab, peerId, dest, new Set(visited))) return true;
    }
  }

  return false;
}

// ── Objetivos del laboratorio (Nivel 3) ─────────────────────────────────────
export interface ObjectiveItem {
  routerId: string;
  ifName: string;
  target: InterfaceTarget;
  ipOk: boolean;
  upOk: boolean;
  clockOk: boolean;
  protocol: 'up' | 'down';
  done: boolean;
}

export function evaluateLab(lab: LabState): { items: ObjectiveItem[]; complete: boolean } {
  const items: ObjectiveItem[] = [];
  for (const r of lab.topology.routers) {
    for (const [ifName, target] of Object.entries(lab.targets[r.id] ?? {})) {
      const cfg = lab.runtimes[r.id].runningConfig.interfaces[ifName];
      const ipOk = cfg.ipAddress === target.ip && cfg.subnetMask === target.mask;
      const upOk = cfg.isUp;
      const clockOk = r.interfaces[ifName].isDCE ? !!cfg.clockRate : true;
      items.push({
        routerId: r.id,
        ifName,
        target,
        ipOk,
        upOk,
        clockOk,
        protocol: interfaceStatus(lab, r.id, ifName).protocol,
        done: ipOk && upOk && clockOk,
      });
    }
  }
  return { items, complete: items.length > 0 && items.every((i) => i.done) };
}

// ════════════════════════════════════════════════════════════════════════════
// Gramática y parser
// ════════════════════════════════════════════════════════════════════════════
type Param = 'ip' | 'mask' | 'iface' | 'number' | 'word' | 'rest';
type HandlerResult = string | { out: string; err?: { type: CliErrorType; message: string } };
type Handler = (c: Ctx, a: Record<string, string>) => HandlerResult;

interface Node {
  kw?: string;
  param?: Param;
  name?: string;
  label?: string;
  help?: string;
  next?: Node[];
  run?: Handler;
}

interface Ctx {
  rt: RouterRuntimeState;
  lab: LabState;
  routerId: string;
  events: LabEvent[];
  diagnostics: Diagnostic[];
}

const kw = (word: string, help: string, next?: Node[], run?: Handler): Node => ({ kw: word, help, next, run });
const par = (param: Param, name: string, label: string, next?: Node[], run?: Handler): Node => ({ param, name, label, next, run });

const CLOCK_RATES = [1200, 2400, 4800, 9600, 19200, 38400, 56000, 64000, 72000, 125000, 128000, 250000, 500000, 800000, 1000000, 1300000, 2000000, 4000000];

// ── Utilidades de salida ────────────────────────────────────────────────────
const labWith = (c: Ctx): LabState => ({ ...c.lab, runtimes: { ...c.lab.runtimes, [c.routerId]: c.rt } });
const ifaceType = (c: Ctx, name: string) => routerOf(c.lab, c.routerId).interfaces[name].type;
const ifaceIsDce = (c: Ctx, name: string) => !!routerOf(c.lab, c.routerId).interfaces[name].isDCE;

function showBrief(c: Ctx): string {
  const lab = labWith(c);
  const pad = (s: string, n: number) => s.padEnd(n);
  const rows = [`${pad('Interface', 22)}${pad('IP-Address', 16)}${pad('OK?', 5)}${pad('Method', 8)}${pad('Status', 24)}Protocol`];
  for (const [name, cfg] of Object.entries(c.rt.runningConfig.interfaces)) {
    const st = interfaceStatus(lab, c.routerId, name);
    rows.push(
      `${pad(name, 22)}${pad(cfg.ipAddress ?? 'unassigned', 16)}${pad('YES', 5)}${pad(cfg.ipAddress ? 'manual' : 'unset', 8)}${pad(st.status, 24)}${st.protocol}`,
    );
  }
  return rows.join('\n');
}

function showRun(c: Ctx): string {
  const out = ['Building configuration...', '', 'Current configuration:', '!', `hostname ${c.rt.hostname}`, '!'];
  if (c.rt.runningConfig.bannerMotd) {
    out.push(`banner motd #${c.rt.runningConfig.bannerMotd}#`, '!');
  }
  for (const [name, cfg] of Object.entries(c.rt.runningConfig.interfaces)) {
    out.push(`interface ${name}`);
    if (cfg.description) out.push(` description ${cfg.description}`);
    out.push(cfg.ipAddress ? ` ip address ${cfg.ipAddress} ${cfg.subnetMask}` : ' no ip address');
    if (cfg.clockRate) out.push(` clock rate ${cfg.clockRate}`);
    out.push(cfg.isUp ? ' no shutdown' : ' shutdown');
    out.push('!');
  }
  for (const sr of c.rt.runningConfig.staticRoutes ?? []) {
    out.push(`ip route ${sr.network} ${sr.mask} ${sr.nextHop}`);
  }
  if ((c.rt.runningConfig.staticRoutes ?? []).length > 0) out.push('!');
  out.push('end');
  return out.join('\n');
}

function showRoute(c: Ctx): string {
  const lab = labWith(c);
  const out = ['Codes: C - connected, S - static', ''];
  let any = false;
  for (const [name, cfg] of Object.entries(c.rt.runningConfig.interfaces)) {
    if (!cfg.ipAddress || interfaceStatus(lab, c.routerId, name).protocol !== 'up') continue;
    const p = maskToPrefix(parseIPv4(cfg.subnetMask!)!)!;
    out.push(`C    ${intToIPv4(networkOf(parseIPv4(cfg.ipAddress)!, p))}/${p} is directly connected, ${name}`);
    any = true;
  }
  for (const sr of c.rt.runningConfig.staticRoutes ?? []) {
    out.push(`S    ${sr.network}/${sr.prefix} [1/0] via ${sr.nextHop}`);
    any = true;
  }
  if (!any) out.push('(sin rutas: ninguna interfaz con IP está en estado up/up)');
  return out.join('\n');
}

function formatSingleInterface(lab: LabState, routerId: string, name: string, cfg: ActiveInterfaceConfig, isDCE: boolean, type: InterfaceType): string {
  const st = interfaceStatus(lab, routerId, name);
  const ipText = cfg.ipAddress && cfg.subnetMask
    ? `  Internet address is ${cfg.ipAddress}/${maskToPrefix(parseIPv4(cfg.subnetMask)!)!}`
    : '  Internet protocol processing disabled';
  const hw = type === 'ETHERNET' ? 'FastEthernet' : 'Serial';
  const encap = type === 'ETHERNET' ? 'ARPA' : 'HDLC';
  const bw = type === 'ETHERNET' ? '100000 Kbit/sec' : cfg.clockRate ? `${Math.round(cfg.clockRate / 1000)} Kbit/sec` : '1544 Kbit/sec';
  const dly = type === 'ETHERNET' ? '100 usec' : '20000 usec';
  const clockText = type === 'SERIAL' && isDCE ? `  DCE cable, clockrate ${cfg.clockRate ?? 64000}\n` : '';

  return `${name} is ${st.status}, line protocol is ${st.protocol}
  Hardware is ${hw}
${ipText}
  MTU 1500 bytes, BW ${bw}, DLY ${dly},
     reliability 255/255, txload 1/255, rxload 1/255
  Encapsulation ${encap}, loopback not set
  Keepalive set (10 sec)
${clockText}  Last clearing of "show interface" counters never
  5 minute input rate 0 bits/sec, 0 packets/sec
  5 minute output rate 0 bits/sec, 0 packets/sec
     182 packets input, 15420 bytes, 0 no buffer
     182 packets output, 15420 bytes, 0 underruns`;
}

function hShowIntAll(c: Ctx): string {
  const lab = labWith(c);
  const r = routerOf(lab, c.routerId);
  const blocks: string[] = [];
  for (const [name, cfg] of Object.entries(c.rt.runningConfig.interfaces)) {
    const dev = r.interfaces[name];
    blocks.push(formatSingleInterface(lab, c.routerId, name, cfg, !!dev.isDCE, dev.type));
  }
  return blocks.join('\n\n');
}

function hShowIntDetailed(c: Ctx, a: Record<string, string>): string {
  const lab = labWith(c);
  const r = routerOf(lab, c.routerId);
  const name = a.iface;
  const cfg = c.rt.runningConfig.interfaces[name];
  if (!cfg) return '% Invalid interface name';
  const dev = r.interfaces[name];
  return formatSingleInterface(lab, c.routerId, name, cfg, !!dev.isDCE, dev.type);
}

function hShowVer(c: Ctx): string {
  const ifCount = Object.keys(c.rt.runningConfig.interfaces).length;
  return `Cisco IOS Software, C2900 Software (C2900-UNIVERSALK9-M), Version 15.4(3)M2, RELEASE SOFTWARE (fc1)
Technical Support: http://www.cisco.com/techsupport
Copyright (c) 1986-2026 by Cisco Systems, Inc.

ROM: System Bootstrap, Version 15.0(1r)M16, RELEASE SOFTWARE (fc1)

${c.rt.hostname} uptime is 2 hours, 45 minutes
System returned to ROM by power-on
System image file is "flash0:c2900-universalk9-mz.SPA.154-3.M2.bin"

Cisco 2911 (revision 1.0) with 514048K/10240K bytes of memory.
Processor board ID FHK1612F0LM
${ifCount} FastEthernet/Serial interfaces
255K bytes of non-volatile configuration memory.
249856K bytes of ATA System CompactFlash (Read/Write)`;
}

const hWriteMem: Handler = () => 'Building configuration...\n[OK]';
const hCopyRunStart: Handler = () => 'Destination filename [startup-config]?[OK]\nBuilding configuration...\n[OK]';

const hIpRoute: Handler = (c, a) => {
  const netInt = parseIPv4(a.net);
  const maskInt = parseIPv4(a.mask);
  const nextHopInt = parseIPv4(a.nextHop);
  if (netInt === null) return { out: '% Invalid IP address', err: { type: 'PARAMETER_MISMATCH', message: 'Dirección de red destino inválida.' } };
  const p = maskInt !== null ? maskToPrefix(maskInt) : null;
  if (p === null) return { out: '% Invalid subnet mask', err: { type: 'PARAMETER_MISMATCH', message: 'Máscara de subred destino inválida.' } };
  if (nextHopInt === null) return { out: '% Invalid next-hop IP', err: { type: 'PARAMETER_MISMATCH', message: 'Dirección IP del siguiente salto inválida.' } };

  c.rt.runningConfig.staticRoutes = c.rt.runningConfig.staticRoutes ?? [];
  const existingIdx = c.rt.runningConfig.staticRoutes.findIndex(
    (r) => r.network === a.net && r.mask === a.mask && r.nextHop === a.nextHop
  );
  if (existingIdx === -1) {
    c.rt.runningConfig.staticRoutes.push({
      network: intToIPv4(networkOf(netInt, p)),
      mask: a.mask,
      prefix: p,
      nextHop: a.nextHop,
    });
  }
  c.diagnostics.push({
    severity: 'ok',
    message: `${c.rt.hostname}: Ruta estática añadida hacia ${a.net}/${p} vía ${a.nextHop}.`,
  });
  return '';
};

const hNoIpRoute: Handler = (c, a) => {
  if (!c.rt.runningConfig.staticRoutes) return '';
  c.rt.runningConfig.staticRoutes = c.rt.runningConfig.staticRoutes.filter(
    (r) => !(r.network === a.net && r.nextHop === a.nextHop)
  );
  return '';
};

const hBannerMotd: Handler = (c, a) => {
  const raw = a.text.trim();
  const cleaned = raw.startsWith('#') && raw.endsWith('#') && raw.length >= 2 ? raw.slice(1, -1) : raw;
  c.rt.runningConfig.bannerMotd = cleaned;
  return '';
};

const hBandwidth: Handler = () => '';

// ── Handlers ────────────────────────────────────────────────────────────────
const hEnable: Handler = (c) => ((c.rt.currentMode = 'PRIVILEGED_EXEC'), '');
const hDisable: Handler = (c) => ((c.rt.currentMode = 'USER_EXEC'), '');
const hConfT: Handler = (c) => {
  c.rt.currentMode = 'GLOBAL_CONFIG';
  return 'Enter configuration commands, one per line.  End with CNTL/Z.';
};
const hExit: Handler = (c) => {
  const m = c.rt.currentMode;
  if (m === 'INTERFACE_CONFIG') (c.rt.currentMode = 'GLOBAL_CONFIG'), (c.rt.activeInterface = undefined);
  else if (m === 'GLOBAL_CONFIG') c.rt.currentMode = 'PRIVILEGED_EXEC';
  else if (m === 'PRIVILEGED_EXEC') c.rt.currentMode = 'USER_EXEC';
  return '';
};
const hEnd: Handler = (c) => ((c.rt.currentMode = 'PRIVILEGED_EXEC'), (c.rt.activeInterface = undefined), '');
const hInterface: Handler = (c, a) => {
  c.rt.currentMode = 'INTERFACE_CONFIG';
  c.rt.activeInterface = a.iface;
  return '';
};
const hHostname: Handler = (c, a) => {
  if (!/^[A-Za-z][A-Za-z0-9_-]{0,62}$/.test(a.name))
    return { out: '% Invalid hostname', err: { type: 'PARAMETER_MISMATCH', message: 'Un hostname debe empezar por letra y usar solo letras, números, - o _.' } };
  c.rt.hostname = a.name;
  return '';
};

function comparePlan(c: Ctx, ifName: string, ip: number, mask: number): boolean {
  const target = c.lab.targets[c.routerId]?.[ifName];
  if (!target) {
    c.diagnostics.push({ severity: 'info', message: `${ifName} no forma parte del plan IP de este reto.` });
    return true;
  }
  const p = maskToPrefix(mask)!;
  if (intToIPv4(ip) === target.ip && intToIPv4(mask) === target.mask) {
    c.diagnostics.push({ severity: 'ok', message: `${c.rt.hostname} ${ifName}: ${target.ip}/${target.prefix} coincide con el plan (${target.role}).` });
    return true;
  }
  if (p !== target.prefix)
    c.diagnostics.push({ severity: 'warn', message: `${ifName}: la máscara /${p} no coincide con la del plan (/${target.prefix}). Revisa el prefijo que calculaste en el Nivel 2.` });
  else if (networkOf(ip, p) === parseIPv4(target.networkAddress))
    c.diagnostics.push({ severity: 'warn', message: `${ifName}: la IP está en la subred correcta (${target.networkAddress}/${target.prefix}) pero el plan asigna otra: ${target.role}.` });
  else
    c.diagnostics.push({ severity: 'warn', message: `${ifName}: la IP queda fuera de su subred planificada (${target.networkAddress}/${target.prefix}).` });
  return false;
}

const hIpAddress: Handler = (c, a) => {
  const ifName = c.rt.activeInterface!;
  const ip = parseIPv4(a.ip)!;
  const mask = parseIPv4(a.mask)!;
  const p = maskToPrefix(mask)!;
  const net = networkOf(ip, p);
  if (p <= 30 && (ip === net || ip === net + blockSize(p) - 1))
    return { out: `Bad mask /${p} for address ${a.ip}`, err: { type: 'PARAMETER_MISMATCH', message: `${a.ip} es la dirección de ${ip === net ? 'red' : 'broadcast'} de esa subred y no puede asignarse a una interfaz.` } };
  for (const [n, cfg] of Object.entries(c.rt.runningConfig.interfaces)) {
    if (n === ifName || !cfg.ipAddress) continue;
    const op = maskToPrefix(parseIPv4(cfg.subnetMask!)!)!;
    const on = networkOf(parseIPv4(cfg.ipAddress)!, op);
    const oEnd = on + blockSize(op) - 1;
    if (net <= oEnd && on <= net + blockSize(p) - 1)
      return { out: `% ${intToIPv4(net)} overlaps with ${n}`, err: { type: 'PARAMETER_MISMATCH', message: `La subred se solapa con ${n}: un router no admite redes superpuestas en interfaces distintas.` } };
  }
  const cfg = c.rt.runningConfig.interfaces[ifName];
  cfg.ipAddress = a.ip;
  cfg.subnetMask = a.mask;
  const ok = comparePlan(c, ifName, ip, mask);
  c.events.push({ type: 'IP_ASSIGNED', routerId: c.routerId, ifName, ok });
  return '';
};
const hNoIpAddress: Handler = (c) => {
  const cfg = c.rt.runningConfig.interfaces[c.rt.activeInterface!];
  cfg.ipAddress = undefined;
  cfg.subnetMask = undefined;
  return '';
};
const hNoShut: Handler = (c) => {
  const ifName = c.rt.activeInterface!;
  const cfg = c.rt.runningConfig.interfaces[ifName];
  cfg.isUp = true;
  c.events.push({ type: 'IFACE_UP', routerId: c.routerId, ifName });
  if (!cfg.ipAddress) c.diagnostics.push({ severity: 'warn', message: `${ifName} se levantó sin dirección IP.` });
  if (ifaceType(c, ifName) === 'SERIAL' && ifaceIsDce(c, ifName) && !cfg.clockRate)
    c.diagnostics.push({ severity: 'warn', message: `${ifName} es DCE y no tiene clock rate: el protocolo de línea seguirá en down.` });
  const lines = [`%LINK-5-CHANGED: Interface ${ifName}, changed state to up`];
  if (interfaceStatus(labWith(c), c.routerId, ifName).protocol === 'up')
    lines.push(`%LINEPROTO-5-UPDOWN: Line protocol on Interface ${ifName}, changed state to up`);
  return lines.join('\n');
};
const hShut: Handler = (c) => {
  const ifName = c.rt.activeInterface!;
  c.rt.runningConfig.interfaces[ifName].isUp = false;
  return `%LINK-5-CHANGED: Interface ${ifName}, changed state to administratively down`;
};
const hClock: Handler = (c, a) => {
  const ifName = c.rt.activeInterface!;
  if (ifaceType(c, ifName) !== 'SERIAL')
    return { out: '% Invalid input detected', err: { type: 'CONTEXT', message: 'clock rate solo existe en interfaces seriales.' } };
  if (!ifaceIsDce(c, ifName))
    return { out: '%Error: This command applies only to DCE interfaces', err: { type: 'PARAMETER_MISMATCH', message: `${ifName} es el extremo DTE; el clock rate se configura en el lado DCE del enlace.` } };
  const v = Number(a.bps);
  if (!CLOCK_RATES.includes(v))
    return { out: '% Invalid input detected', err: { type: 'PARAMETER_MISMATCH', message: `Velocidad no soportada. Valores válidos: ${CLOCK_RATES.slice(0, 10).join(', ')}…` } };
  c.rt.runningConfig.interfaces[ifName].clockRate = v;
  return '';
};
const hDescription: Handler = (c, a) => ((c.rt.runningConfig.interfaces[c.rt.activeInterface!].description = a.text), '');
const hShowBrief: Handler = (c) => showBrief(c);
const hShowRun: Handler = (c) => showRun(c);
const hShowRoute: Handler = (c) => showRoute(c);
const hPing: Handler = (c, a) => {
  const dest = parseIPv4(a.ip)!;
  const ok = reachable(labWith(c), c.routerId, dest);
  c.events.push({ type: 'PING', routerId: c.routerId, ok });
  const head = ['Type escape sequence to abort.', `Sending 5, 100-byte ICMP Echos to ${a.ip}, timeout is 2 seconds:`];
  return ok
    ? [...head, '!!!!!', 'Success rate is 100 percent (5/5), round-trip min/avg/max = 8/12/20 ms'].join('\n')
    : [...head, '.....', 'Success rate is 0 percent (0/5)'].join('\n');
};

// ── Árbol de comandos por modo ──────────────────────────────────────────────
const showIpBrief = kw('interface', 'Estado de interfaces', [kw('brief', 'Resumen', undefined, hShowBrief)]);
const showInterfaces = kw('interfaces', 'Estadísticas de interfaces', [par('iface', 'iface', 'tipo número', undefined, hShowIntDetailed)], hShowIntAll);
const showVersion = kw('version', 'Versión del sistema', undefined, hShowVer);

const showUser = kw('show', 'Muestra información del sistema', [
  kw('ip', 'Información IP', [showIpBrief, kw('route', 'Tabla de enrutamiento', undefined, hShowRoute)]),
  showInterfaces,
  showVersion,
]);
const showPriv = kw('show', 'Muestra información del sistema', [
  kw('ip', 'Información IP', [showIpBrief, kw('route', 'Tabla de enrutamiento', undefined, hShowRoute)]),
  kw('running-config', 'Configuración activa', undefined, hShowRun),
  showInterfaces,
  showVersion,
]);
const pingNode = kw('ping', 'Envía eco ICMP', [par('ip', 'ip', 'A.B.C.D', undefined, hPing)]);
const writeNode = kw('write', 'Guarda en NVRAM', [kw('memory', 'Guarda en memoria', undefined, hWriteMem)], hWriteMem);
const copyNode = kw('copy', 'Copia configuración', [
  kw('running-config', 'Configuración activa', [
    kw('startup-config', 'Configuración de inicio', undefined, hCopyRunStart),
  ]),
]);

const ipRouteNode = kw('route', 'Configura ruta estática', [
  par('ip', 'net', 'A.B.C.D', [
    par('mask', 'mask', 'A.B.C.D', [
      par('ip', 'nextHop', 'A.B.C.D', undefined, hIpRoute),
    ]),
  ]),
]);
const noIpRouteNode = kw('route', 'Elimina ruta estática', [
  par('ip', 'net', 'A.B.C.D', [
    par('mask', 'mask', 'A.B.C.D', [
      par('ip', 'nextHop', 'A.B.C.D', undefined, hNoIpRoute),
    ]),
  ]),
]);

const bannerNode = kw('banner', 'Mensaje de entrada', [
  kw('motd', 'Mensaje del día', [par('rest', 'text', 'LINE', undefined, hBannerMotd)]),
]);

const GRAMMAR: Record<CiscoMode, Node[]> = {
  USER_EXEC: [
    kw('enable', 'Entra al modo privilegiado', undefined, hEnable),
    showUser,
    pingNode,
    kw('exit', 'Cierra la sesión', undefined, hExit),
  ],
  PRIVILEGED_EXEC: [
    kw('configure', 'Entra a configuración', [kw('terminal', 'Configurar desde la terminal', undefined, hConfT)]),
    showPriv,
    pingNode,
    writeNode,
    copyNode,
    kw('disable', 'Vuelve al modo de usuario', undefined, hDisable),
    kw('exit', 'Vuelve al modo de usuario', undefined, hExit),
  ],
  GLOBAL_CONFIG: [
    kw('interface', 'Selecciona una interfaz', [par('iface', 'iface', 'tipo número', undefined, hInterface)]),
    kw('hostname', 'Cambia el nombre del equipo', [par('word', 'name', 'WORD', undefined, hHostname)]),
    kw('ip', 'Configuración IP global', [ipRouteNode]),
    kw('no', 'Niega un comando', [kw('ip', 'Comandos IP', [noIpRouteNode])]),
    bannerNode,
    kw('do', 'Ejecuta un comando EXEC', [showPriv, pingNode, writeNode]),
    kw('exit', 'Sale del modo', undefined, hExit),
    kw('end', 'Vuelve al modo privilegiado', undefined, hEnd),
  ],
  INTERFACE_CONFIG: [
    kw('ip', 'Configuración IP', [kw('address', 'Asigna dirección IP', [par('ip', 'ip', 'A.B.C.D', [par('mask', 'mask', 'A.B.C.D', undefined, hIpAddress)])])]),
    kw('no', 'Niega un comando', [
      kw('shutdown', 'Habilita la interfaz', undefined, hNoShut),
      kw('ip', 'Configuración IP', [kw('address', 'Elimina la dirección IP', undefined, hNoIpAddress)]),
    ]),
    kw('shutdown', 'Deshabilita la interfaz', undefined, hShut),
    kw('clock', 'Configura el reloj', [kw('rate', 'Velocidad del reloj DCE', [par('number', 'bps', '<bps>', undefined, hClock)])]),
    kw('bandwidth', 'Ancho de banda métrico', [par('number', 'kbps', '<kbps>', undefined, hBandwidth)]),
    kw('description', 'Descripción de la interfaz', [par('rest', 'text', 'LINE', undefined, hDescription)]),
    kw('interface', 'Selecciona otra interfaz', [par('iface', 'iface', 'tipo número', undefined, hInterface)]),
    kw('do', 'Ejecuta un comando EXEC', [showPriv, pingNode, writeNode]),
    kw('exit', 'Vuelve a configuración global', undefined, hExit),
    kw('end', 'Vuelve al modo privilegiado', undefined, hEnd),
  ],
};

// ── Tokenizado y resolución ─────────────────────────────────────────────────
interface Tok {
  text: string;
  start: number;
}
function tokenize(line: string): Tok[] {
  const out: Tok[] = [];
  const re = /\S+/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(line))) out.push({ text: m[0], start: m.index });
  return out;
}

export function normalizeIface(tok: string, nextTok?: string): { name: string; consumed: number } | null {
  const m = /^([a-z]+)(\d+(?:\/\d+)*)?$/i.exec(tok);
  if (!m) return null;
  const kind = m[1].toLowerCase();
  let digits = m[2];
  let consumed = 1;
  if (!digits && nextTok && /^\d+(\/\d+)*$/.test(nextTok)) {
    digits = nextTok;
    consumed = 2;
  }
  if (!digits) return null;
  if ('ethernet'.startsWith(kind)) return { name: `Ethernet${digits}`, consumed };
  if ('serial'.startsWith(kind)) return { name: `Serial${digits}`, consumed };
  return null;
}

type Resolved =
  | { kind: 'ok'; node: Node; args: Record<string, string>; next: Node[] }
  | { kind: 'incomplete'; next: Node[] }
  | { kind: 'invalid'; tokenIndex: number }
  | { kind: 'ambiguous'; tokenIndex: number };

function resolve(grammar: Node[], toks: Tok[], ifaces: string[]): Resolved {
  let nodes = grammar;
  let cur: Node | undefined;
  const args: Record<string, string> = {};
  for (let i = 0; i < toks.length; i++) {
    const t = toks[i].text;
    const low = t.toLowerCase();
    const kws = nodes.filter((n) => n.kw);
    const exact = kws.find((n) => n.kw === low);
    const pref = kws.filter((n) => n.kw!.startsWith(low));
    const pn = nodes.find((n) => n.param);
    let chosen: Node | undefined;
    if (exact) chosen = exact;
    else if (pref.length === 1) chosen = pref[0];
    else if (pref.length > 1) return { kind: 'ambiguous', tokenIndex: i };
    else if (pn) {
      switch (pn.param) {
        case 'ip':
          if (parseIPv4(t) === null) return { kind: 'invalid', tokenIndex: i };
          args[pn.name!] = t;
          break;
        case 'mask': {
          const v = parseIPv4(t);
          if (v === null || maskToPrefix(v) === null) return { kind: 'invalid', tokenIndex: i };
          args[pn.name!] = t;
          break;
        }
        case 'number':
          if (!/^\d+$/.test(t)) return { kind: 'invalid', tokenIndex: i };
          args[pn.name!] = t;
          break;
        case 'iface': {
          const n = normalizeIface(t, toks[i + 1]?.text);
          if (!n || !ifaces.includes(n.name)) return { kind: 'invalid', tokenIndex: i };
          args[pn.name!] = n.name;
          i += n.consumed - 1;
          break;
        }
        case 'rest':
          args[pn.name!] = toks.slice(i).map((x) => x.text).join(' ');
          i = toks.length;
          break;
        default:
          args[pn.name!] = t;
      }
      chosen = pn;
    } else return { kind: 'invalid', tokenIndex: i };
    cur = chosen;
    nodes = chosen.next ?? [];
  }
  if (!cur) return { kind: 'incomplete', next: grammar };
  if (cur.run) return { kind: 'ok', node: cur, args, next: nodes };
  return { kind: 'incomplete', next: nodes };
}

// ════════════════════════════════════════════════════════════════════════════
// Ejecución
// ════════════════════════════════════════════════════════════════════════════
function helpFor(rt: RouterRuntimeState, ifaces: string[], line: string): string {
  const body = line.trim().slice(0, -1);
  const endsSpace = /\s$/.test(body) || body === '';
  const toks = tokenize(body);
  const partial = endsSpace ? '' : toks[toks.length - 1].text.toLowerCase();
  const head = endsSpace ? toks : toks.slice(0, -1);
  const r = resolve(GRAMMAR[rt.currentMode], head, ifaces);
  if (r.kind === 'invalid' || r.kind === 'ambiguous') return '% Unrecognized command';
  const lines: string[] = [];
  const cands = r.next.filter((n) => n.kw && n.kw.startsWith(partial));
  if (!endsSpace) return cands.length ? cands.map((n) => n.kw).join('  ') : '% Unrecognized command';
  for (const n of cands) lines.push(`  ${n.kw!.padEnd(16)}${n.help ?? ''}`);
  for (const n of r.next.filter((x) => x.param)) lines.push(`  ${(n.label ?? '').padEnd(16)}${n.name === 'ip' ? 'Dirección IPv4' : n.name === 'mask' ? 'Máscara de subred' : ''}`);
  if (r.kind === 'ok') lines.push('  <cr>');
  return lines.join('\n');
}

export function executeCommand(lab: LabState, routerId: string, rawLine: string): ExecResult {
  const events: LabEvent[] = [];
  const diagnostics: Diagnostic[] = [];
  const line = rawLine.replace(/\t/g, ' ');
  const trimmed = line.trim();
  if (!trimmed) return { lab, feedback: { success: true, output: '' }, events, diagnostics };

  const rt: RouterRuntimeState = structuredClone(lab.runtimes[routerId]);
  rt.commandHistory.push(trimmed);
  events.push({ type: 'COMMAND', routerId });
  const ifaces = Object.keys(rt.runningConfig.interfaces);
  const prompt = promptFor(rt);
  const commit = (feedback: CLICommandFeedback): ExecResult => ({
    lab: { ...lab, runtimes: { ...lab.runtimes, [routerId]: rt } },
    feedback,
    events,
    diagnostics,
  });
  const fail = (type: CliErrorType, output: string, message: string, pointerIndex?: number) => {
    events.push({ type: 'ERROR', routerId, kind: type });
    diagnostics.push({ severity: 'error', message });
    return commit({ success: false, output, errorDetail: { type, message, pointerIndex } });
  };

  if (trimmed.endsWith('?')) return commit({ success: true, output: helpFor(rt, ifaces, line) });

  const toks = tokenize(line);
  const res = resolve(GRAMMAR[rt.currentMode], toks, ifaces);

  if (res.kind === 'ok') {
    const ctx: Ctx = { rt, lab, routerId, events, diagnostics };
    const r = res.node.run!(ctx, res.args);
    if (typeof r === 'string') return commit({ success: true, output: r });
    if (r.err) {
      events.push({ type: 'ERROR', routerId, kind: r.err.type });
      diagnostics.push({ severity: 'error', message: r.err.message });
      return commit({ success: false, output: r.out, errorDetail: r.err });
    }
    return commit({ success: true, output: r.out });
  }

  if (res.kind === 'incomplete') return fail('INCOMPLETE', '% Incomplete command.', 'Al comando le faltan argumentos. Usa «?» para ver qué sigue.');

  const tok = toks[res.tokenIndex];
  if (res.kind === 'ambiguous') {
    const frag = toks.slice(0, res.tokenIndex + 1).map((t) => t.text).join(' ');
    return fail('AMBIGUOUS', `% Ambiguous command:  "${frag}"`, `«${tok.text}» coincide con más de un comando; escribe más letras.`);
  }

  const col = prompt.length + tok.start;
  const output = `${' '.repeat(col)}^\n% Invalid input detected at '^' marker.`;
  for (const m of Object.keys(GRAMMAR) as CiscoMode[]) {
    if (m === rt.currentMode) continue;
    if (resolve(GRAMMAR[m], toks, ifaces).kind === 'ok')
      return fail('CONTEXT', output, `El comando es válido, pero pertenece al modo ${MODE_LABEL[m]}. Estás en ${MODE_LABEL[rt.currentMode]}.`, col);
  }
  return fail('SYNTAX', output, `Sintaxis inválida en «${tok.text}».`, col);
}

// ── Autocompletado ──────────────────────────────────────────────────────────
export function completeLine(lab: LabState, routerId: string, line: string): { value: string; options: string[] } {
  const rt = lab.runtimes[routerId];
  const ifaces = Object.keys(rt.runningConfig.interfaces);
  const endsSpace = /\s$/.test(line) || line === '';
  const toks = tokenize(line);
  const partial = endsSpace ? '' : toks[toks.length - 1].text;
  const head = endsSpace ? toks : toks.slice(0, -1);
  const r = resolve(GRAMMAR[rt.currentMode], head, ifaces);
  if (r.kind === 'invalid' || r.kind === 'ambiguous') return { value: line, options: [] };
  const cands = r.next.filter((n) => n.kw && n.kw.startsWith(partial.toLowerCase())).map((n) => n.kw!);
  const prefix = head.map((t) => t.text).join(' ');
  const join = (w: string) => (prefix ? `${prefix} ${w}` : w);
  if (cands.length === 1) return { value: join(cands[0]) + ' ', options: [] };
  if (cands.length > 1) {
    let common = cands[0];
    for (const c of cands) while (!c.startsWith(common)) common = common.slice(0, -1);
    return { value: join(common), options: cands };
  }
  return { value: line, options: [] };
}
