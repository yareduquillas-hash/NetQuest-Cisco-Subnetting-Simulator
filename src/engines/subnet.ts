import type { SubnetResult } from './types';
import {
  blockSize,
  broadcastOf,
  intToIPv4,
  networkOf,
  parseIPv4,
  parsePrefix,
  prefixToMask,
  wildcardOf,
} from './ip';

// ── Cálculo base ────────────────────────────────────────────────────────────
/** Menor n (≥2) tal que 2^n − 2 ≥ hosts. */
export function hostBitsFor(hosts: number): number {
  let n = 2;
  while (2 ** n - 2 < hosts) n++;
  return n;
}

export function hostsAvailableForPrefix(p: number): number {
  if (p >= 32) return 1;
  if (p === 31) return 2;
  return 2 ** (32 - p) - 2;
}

export function makeResult(
  id: string,
  name: string,
  hostsRequired: number,
  networkInt: number,
  prefix: number,
): SubnetResult {
  const bc = networkInt + blockSize(prefix) - 1;
  const p2p = prefix >= 31;
  return {
    id,
    name,
    hostsRequired,
    hostsAvailable: hostsAvailableForPrefix(prefix),
    prefix,
    netmask: intToIPv4(prefixToMask(prefix)),
    wildcardMask: wildcardOf(prefix),
    networkAddress: intToIPv4(networkInt),
    firstUsableIp: intToIPv4(p2p ? networkInt : networkInt + 1),
    lastUsableIp: intToIPv4(p2p ? bc : bc - 1),
    broadcastAddress: intToIPv4(bc),
    blockSize: blockSize(prefix),
    networkInt,
    broadcastInt: bc,
  };
}

// ── FLSM ────────────────────────────────────────────────────────────────────
export const flsmCount = (basePrefix: number, newPrefix: number): number => 2 ** (newPrefix - basePrefix);

export function flsmSubnetAt(baseNetworkInt: number, basePrefix: number, newPrefix: number, index: number): SubnetResult {
  const base = networkOf(baseNetworkInt, basePrefix);
  return makeResult(`S${index}`, `Subred ${index + 1}`, 0, base + index * blockSize(newPrefix), newPrefix);
}

// ── VLSM (asignación voraz descendente) ─────────────────────────────────────
export type VlsmSolution = { ok: true; subnets: SubnetResult[] } | { ok: false; error: string };

export function solveVlsm(
  baseNetwork: string,
  basePrefix: number,
  reqs: { id: string; name: string; hostsRequired: number }[],
): VlsmSolution {
  const base = parseIPv4(baseNetwork);
  if (base === null) return { ok: false, error: 'Dirección base inválida.' };
  const baseNet = networkOf(base, basePrefix);
  const baseBc = baseNet + blockSize(basePrefix) - 1;
  const sorted = [...reqs].sort((a, b) => b.hostsRequired - a.hostsRequired || a.id.localeCompare(b.id));
  let cur = baseNet;
  const subnets: SubnetResult[] = [];
  for (const r of sorted) {
    const n = hostBitsFor(r.hostsRequired);
    const size = 2 ** n;
    if (cur + size - 1 > baseBc) return { ok: false, error: 'Espacio de direcciones insuficiente para los requerimientos.' };
    subnets.push(makeResult(r.id, r.name, r.hostsRequired, cur, 32 - n));
    cur += size;
  }
  return { ok: true, subnets };
}

export function findOverlaps(blocks: { id: string; networkInt: number; broadcastInt: number }[]): [string, string][] {
  const out: [string, string][] = [];
  for (let i = 0; i < blocks.length; i++)
    for (let j = i + 1; j < blocks.length; j++)
      if (blocks[i].networkInt <= blocks[j].broadcastInt && blocks[j].networkInt <= blocks[i].broadcastInt)
        out.push([blocks[i].id, blocks[j].id]);
  return out;
}

// ── Diagnóstico pedagógico ──────────────────────────────────────────────────
export type ErrCode =
  | 'ERR_INVALID_FORMAT'
  | 'ERR_BROADCAST_AS_HOST'
  | 'ERR_NETWORK_AS_HOST'
  | 'ERR_INSUFFICIENT_CAPACITY'
  | 'ERR_SUBNET_OVERLAP'
  | 'ERR_INVALID_JUMP'
  | 'ERR_WASTEFUL_MASK'
  | 'ERR_OUT_OF_BASE'
  | 'ERR_NOT_CONTIGUOUS'
  | 'ERR_MISMATCH';

export interface Diagnosis {
  ok: boolean;
  code?: ErrCode;
  message: string;
}
const OK: Diagnosis = { ok: true, message: 'Correcto.' };
const bad = (code: ErrCode, message: string): Diagnosis => ({ ok: false, code, message });

export type SubnetField = 'network' | 'first' | 'last' | 'broadcast';

export function diagnoseField(field: SubnetField, raw: string, exp: SubnetResult): Diagnosis {
  const v = parseIPv4(raw);
  if (v === null) return bad('ERR_INVALID_FORMAT', 'Formato inválido: usa cuatro octetos decimales, por ejemplo 172.16.32.0.');
  const first = parseIPv4(exp.firstUsableIp)!;
  const last = parseIPv4(exp.lastUsableIp)!;
  const want = { network: exp.networkInt, first, last, broadcast: exp.broadcastInt }[field];
  if (v === want) return OK;

  if (field === 'first' && v === exp.networkInt)
    return bad('ERR_NETWORK_AS_HOST', 'Esa es la dirección de red: identifica la subred y no puede asignarse a un host.');
  if (field === 'last' && v === exp.broadcastInt)
    return bad('ERR_BROADCAST_AS_HOST', 'Esa es la dirección de broadcast: está reservada y no es un host útil.');
  if (field === 'broadcast' && v === last)
    return bad('ERR_MISMATCH', 'Esa es la última IP útil; el broadcast es la dirección siguiente.');
  if (field === 'network' && v % exp.blockSize !== 0)
    return bad('ERR_INVALID_JUMP', `Una dirección de red debe ser múltiplo del salto (${exp.blockSize}) en su octeto. Revisa el cálculo del salto.`);
  if (v < exp.networkInt || v > exp.broadcastInt)
    return bad('ERR_INVALID_JUMP', `Esa dirección cae en otra subred. Recuerda que cada subred avanza de ${exp.blockSize} en ${exp.blockSize}.`);
  return bad('ERR_MISMATCH', 'No coincide con el valor esperado para esta subred.');
}

export function diagnoseVlsmRow(
  req: { id: string; hostsRequired: number },
  rawPrefix: string,
  rawNetwork: string,
  exp: SubnetResult,
  others: { id: string; name: string; networkInt: number; broadcastInt: number }[],
  base: { networkInt: number; prefix: number },
): Diagnosis {
  const p = parsePrefix(rawPrefix);
  if (p === null) return bad('ERR_INVALID_FORMAT', 'Prefijo inválido: escribe por ejemplo /24 o 255.255.255.0.');
  if (hostsAvailableForPrefix(p) < req.hostsRequired)
    return bad('ERR_INSUFFICIENT_CAPACITY', `/${p} solo ofrece ${hostsAvailableForPrefix(p)} hosts útiles y necesitas ${req.hostsRequired}.`);
  const net = parseIPv4(rawNetwork);
  if (net === null) return bad('ERR_INVALID_FORMAT', 'Dirección de red inválida.');
  if (net % blockSize(p) !== 0)
    return bad('ERR_INVALID_JUMP', `Con /${p} el bloque es de ${blockSize(p)} direcciones: la red debe ser múltiplo de ${blockSize(p)}.`);
  const bc = net + blockSize(p) - 1;
  const baseEnd = base.networkInt + blockSize(base.prefix) - 1;
  if (net < base.networkInt || bc > baseEnd) return bad('ERR_OUT_OF_BASE', 'El bloque queda fuera de la red base asignada.');
  const clash = others.find((o) => o.id !== req.id && net <= o.broadcastInt && o.networkInt <= bc);
  if (clash) return bad('ERR_SUBNET_OVERLAP', `Se solapa con «${clash.name}». Dos subredes no pueden compartir direcciones.`);
  if (p < exp.prefix)
    return bad('ERR_WASTEFUL_MASK', `/${p} reserva ${blockSize(p)} direcciones y bastan ${exp.blockSize}: estás desperdiciando espacio.`);
  if (p > exp.prefix) return bad('ERR_INSUFFICIENT_CAPACITY', 'La máscara es demasiado estrecha para el crecimiento previsto del plan.');
  if (net !== exp.networkInt)
    return bad('ERR_NOT_CONTIGUOUS', 'Prefijo correcto, pero la posición no es la óptima: en VLSM se asigna de mayor a menor y cada bloque va pegado al anterior.');
  return OK;
}

export { broadcastOf };
