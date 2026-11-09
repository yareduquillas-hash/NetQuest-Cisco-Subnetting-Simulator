import { describe, expect, it } from 'vitest';
import { intToIPv4, maskToPrefix, parseIPv4, parsePrefix, prefixToMask } from './ip';
import { diagnoseField, diagnoseVlsmRow, findOverlaps, hostBitsFor, solveVlsm } from './subnet';
import { generateFlsmChallenge, generateTopology, solveTopology } from './topology';
import { completeLine, createLab, evaluateLab, executeCommand, interfaceStatus, promptFor } from './cli';
import type { DifficultyLevel } from './types';

describe('ip', () => {
  it('convierte ida y vuelta', () => {
    expect(intToIPv4(parseIPv4('172.16.32.5')!)).toBe('172.16.32.5');
    expect(parseIPv4('255.255.255.255')).toBe(4294967295);
  });
  it('rechaza formatos inválidos', () => {
    for (const s of ['1.2.3', '256.1.1.1', '01.2.3.4', 'a.b.c.d']) expect(parseIPv4(s)).toBeNull();
  });
  it('máscaras y prefijos', () => {
    expect(intToIPv4(prefixToMask(19))).toBe('255.255.224.0');
    expect(maskToPrefix(parseIPv4('255.255.255.192')!)).toBe(26);
    expect(maskToPrefix(parseIPv4('255.0.255.0')!)).toBeNull();
    expect(parsePrefix('/24')).toBe(24);
    expect(parsePrefix('255.255.248.0')).toBe(21);
  });
});

describe('subnet', () => {
  it('bits de host', () => {
    expect(hostBitsFor(2)).toBe(2);
    expect(hostBitsFor(30)).toBe(5);
    expect(hostBitsFor(31)).toBe(6);
    expect(hostBitsFor(2000)).toBe(11);
  });
  it('VLSM contiguo y descendente', () => {
    const r = solveVlsm('192.168.1.0', 24, [
      { id: 'a', name: 'A', hostsRequired: 60 },
      { id: 'b', name: 'B', hostsRequired: 120 },
      { id: 'c', name: 'C', hostsRequired: 2 },
    ]);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.subnets.map((s) => `${s.networkAddress}/${s.prefix}`)).toEqual(['192.168.1.0/25', '192.168.1.128/26', '192.168.1.192/30']);
    expect(findOverlaps(r.subnets)).toHaveLength(0);
  });
  it('detecta desbordamiento', () => {
    const r = solveVlsm('192.168.1.0', 24, [
      { id: 'a', name: 'A', hostsRequired: 120 },
      { id: 'b', name: 'B', hostsRequired: 120 },
      { id: 'c', name: 'C', hostsRequired: 120 },
    ]);
    expect(r.ok).toBe(false);
  });
  it('diagnostica causas raíz', () => {
    const ch = generateFlsmChallenge('T', 'EASY');
    const exp = ch.rows[0].expected;
    expect(diagnoseField('last', exp.broadcastAddress, exp).code).toBe('ERR_BROADCAST_AS_HOST');
    expect(diagnoseField('first', exp.networkAddress, exp).code).toBe('ERR_NETWORK_AS_HOST');
    expect(diagnoseField('first', exp.firstUsableIp, exp).ok).toBe(true);
    expect(diagnoseField('first', 'x', exp).code).toBe('ERR_INVALID_FORMAT');
  });
  it('diagnostica filas VLSM', () => {
    const g = generateTopology('V', 'EASY');
    const sol = solveTopology(g);
    const base = { networkInt: parseIPv4(g.baseNetwork)!, prefix: g.basePrefix };
    const req = g.requirements[0];
    const exp = sol.byId[req.id];
    expect(diagnoseVlsmRow(req, `/${exp.prefix}`, exp.networkAddress, exp, [], base).ok).toBe(true);
    expect(diagnoseVlsmRow(req, `/${exp.prefix + 1}`, exp.networkAddress, exp, [], base).code).toBe('ERR_INSUFFICIENT_CAPACITY');
  });
});

describe('topology', () => {
  it('es determinista por semilla', () => {
    expect(generateTopology('NQ-1', 'MEDIUM')).toEqual(generateTopology('NQ-1', 'MEDIUM'));
    expect(generateTopology('NQ-1', 'MEDIUM')).not.toEqual(generateTopology('NQ-2', 'MEDIUM'));
  });
  it('todas las dificultades producen un plan resoluble y sin solapamiento', () => {
    for (const d of ['EASY', 'MEDIUM', 'HARD'] as DifficultyLevel[])
      for (let i = 0; i < 60; i++) {
        const g = generateTopology(`seed-${i}`, d);
        const s = solveTopology(g);
        expect(findOverlaps(s.ordered)).toHaveLength(0);
        for (const r of g.requirements) expect(s.byId[r.id].hostsAvailable).toBeGreaterThanOrEqual(r.hostsRequired);
      }
  });
  it('reto FLSM coherente', () => {
    for (const d of ['EASY', 'MEDIUM', 'HARD'] as DifficultyLevel[])
      for (let i = 0; i < 40; i++) {
        const c = generateFlsmChallenge(`f-${i}`, d);
        expect(c.rows.length).toBeGreaterThanOrEqual(2);
        expect(c.newPrefix % 8).not.toBe(0);
        for (const r of c.rows) expect(r.expected.networkInt % r.expected.blockSize).toBe(0);
      }
  });
});

describe('cisco cli', () => {
  const g = generateTopology('CLI', 'EASY');
  const sol = solveTopology(g);
  const run = (lab: ReturnType<typeof createLab>, id: string, cmds: string[]) => {
    let l = lab;
    const outs: ReturnType<typeof executeCommand>[] = [];
    for (const c of cmds) {
      const r = executeCommand(l, id, c);
      l = r.lab;
      outs.push(r);
    }
    return { lab: l, outs };
  };

  it('navega modos con abreviaturas', () => {
    const { lab } = run(createLab(g, sol.targets), 'router_a', ['en', 'conf t', 'int e0']);
    expect(promptFor(lab.runtimes.router_a)).toBe('Router_A(config-if)#');
    expect(lab.runtimes.router_a.activeInterface).toBe('Ethernet0');
  });
  it('errores de sintaxis, contexto, ambigüedad e incompleto', () => {
    const l0 = createLab(g, sol.targets);
    expect(executeCommand(l0, 'router_a', 'e').feedback.errorDetail?.type).toBe('AMBIGUOUS');
    expect(executeCommand(l0, 'router_a', 'foo').feedback.errorDetail?.type).toBe('SYNTAX');
    const { outs } = run(l0, 'router_a', ['en', 'ip address 1.1.1.1 255.255.255.0', 'conf t', 'interface']);
    expect(outs[1].feedback.errorDetail?.type).toBe('CONTEXT');
    expect(outs[3].feedback.errorDetail?.type).toBe('INCOMPLETE');
    expect(outs[1].feedback.output).toContain("% Invalid input detected at '^' marker.");
  });
  it('rechaza dirección de red y detecta solapamiento', () => {
    const { outs } = run(createLab(g, sol.targets), 'router_a', ['en', 'conf t', 'int e0', 'ip add 192.168.1.0 255.255.255.0']);
    expect(outs[3].feedback.output).toContain('Bad mask');
  });
  it('configurar todo el plan completa el laboratorio y levanta los seriales', () => {
    let lab = createLab(g, sol.targets);
    for (const r of g.routers) {
      const cmds = ['en', 'conf t'];
      for (const [ifn, t] of Object.entries(sol.targets[r.id])) {
        cmds.push(`interface ${ifn}`, `ip address ${t.ip} ${t.mask}`);
        if (r.interfaces[ifn].isDCE) cmds.push('clock rate 64000');
        cmds.push('no shutdown', 'exit');
      }
      const res = run(lab, r.id, cmds);
      lab = res.lab;
      expect(res.outs.every((o) => o.feedback.success)).toBe(true);
    }
    expect(evaluateLab(lab).complete).toBe(true);
    const c = g.connections[0];
    expect(interfaceStatus(lab, c.fromRouterId, c.fromInterface).protocol).toBe('up');
    const peerIp = sol.targets[c.toRouterId][c.toInterface].ip;
    const ping = run(lab, c.fromRouterId, ['en', `ping ${peerIp}`]).outs[1];
    expect(ping.feedback.output).toContain('100 percent');
  });
  it('sin clock rate el protocolo serial queda down', () => {
    const c = g.connections[0];
    let lab = createLab(g, sol.targets);
    lab = run(lab, c.fromRouterId, ['en', 'conf t', `int ${c.fromInterface}`, 'no shut']).lab;
    lab = run(lab, c.toRouterId, ['en', 'conf t', `int ${c.toInterface}`, 'no shut']).lab;
    expect(interfaceStatus(lab, c.fromRouterId, c.fromInterface).protocol).toBe('down');
  });
  it('autocompleta', () => {
    const lab = createLab(g, sol.targets);
    expect(completeLine(lab, 'router_a', 'ena').value).toBe('enable ');
  });
  it('soporta write memory y copy run start', () => {
    const lab = createLab(g, sol.targets);
    const { outs: o1 } = run(lab, 'router_a', ['en', 'wr']);
    expect(o1[1].feedback.output).toContain('[OK]');
    const { outs: o2 } = run(lab, 'router_a', ['en', 'copy run start']);
    expect(o2[1].feedback.output).toContain('[OK]');
    const { outs: o3 } = run(lab, 'router_a', ['en', 'conf t', 'do wr']);
    expect(o3[2].feedback.output).toContain('[OK]');
  });
  it('soporta show version y show interfaces', () => {
    const lab = createLab(g, sol.targets);
    const { outs } = run(lab, 'router_a', ['en', 'sh ver', 'sh int', 'sh int e0']);
    expect(outs[1].feedback.output).toContain('Cisco IOS Software');
    expect(outs[1].feedback.output).toContain('uptime is 2 hours, 45 minutes');
    expect(outs[2].feedback.output).toContain('Ethernet0 is');
    expect(outs[3].feedback.output).toContain('Hardware is FastEthernet');
  });
  it('configura y visualiza rutas estáticas con ip route y no ip route', () => {
    let { lab, outs } = run(createLab(g, sol.targets), 'router_a', [
      'en',
      'conf t',
      'ip route 10.0.0.0 255.255.255.0 192.168.1.2',
      'end',
      'sh ip route',
    ]);
    expect(outs[4].feedback.output).toContain('S    10.0.0.0/24 [1/0] via 192.168.1.2');
    const sr = lab.runtimes.router_a.runningConfig.staticRoutes;
    expect(sr?.length).toBe(1);
    expect(sr?.[0].network).toBe('10.0.0.0');

    const res2 = run(lab, 'router_a', ['conf t', 'no ip route 10.0.0.0 255.255.255.0 192.168.1.2', 'end', 'sh ip route']);
    expect(res2.lab.runtimes.router_a.runningConfig.staticRoutes?.length).toBe(0);
  });
});
