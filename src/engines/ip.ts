import type { IPv4String } from './types';

/** Parsea IPv4 estricto (4 octetos decimales sin ceros a la izquierda). Devuelve uint32 o null. */
export function parseIPv4(raw: string): number | null {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(raw.trim());
  if (!m) return null;
  let v = 0;
  for (let i = 1; i <= 4; i++) {
    const s = m[i];
    if (s.length > 1 && s[0] === '0') return null;
    const o = Number(s);
    if (o > 255) return null;
    v = v * 256 + o;
  }
  return v;
}

export function intToIPv4(n: number): IPv4String {
  return [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join('.');
}

export function prefixToMask(p: number): number {
  return p <= 0 ? 0 : (0xffffffff << (32 - p)) >>> 0;
}

/** Devuelve el prefijo si la máscara es contigua (1s seguidos de 0s); si no, null. */
export function maskToPrefix(maskInt: number): number | null {
  for (let p = 0; p <= 32; p++) if (prefixToMask(p) === maskInt) return p;
  return null;
}

/** Acepta "21", "/21" o "255.255.248.0". */
export function parsePrefix(raw: string): number | null {
  const s = raw.trim();
  const m = /^\/?(\d{1,2})$/.exec(s);
  if (m) {
    const p = Number(m[1]);
    return p >= 0 && p <= 32 ? p : null;
  }
  const mask = parseIPv4(s);
  return mask === null ? null : maskToPrefix(mask);
}

export const blockSize = (p: number): number => 2 ** (32 - p);
export const networkOf = (ip: number, p: number): number => (ip & prefixToMask(p)) >>> 0;
export const broadcastOf = (ip: number, p: number): number => networkOf(ip, p) + blockSize(p) - 1;
export const wildcardOf = (p: number): IPv4String => intToIPv4((~prefixToMask(p)) >>> 0);

export function ipClass(ip: number): 'A' | 'B' | 'C' | 'D' | 'E' {
  const o = ip >>> 24;
  if (o < 128) return 'A';
  if (o < 192) return 'B';
  if (o < 224) return 'C';
  if (o < 240) return 'D';
  return 'E';
}

export function binaryOctets(ip: number): string[] {
  return [24, 16, 8, 0].map((s) => ((ip >>> s) & 255).toString(2).padStart(8, '0'));
}
