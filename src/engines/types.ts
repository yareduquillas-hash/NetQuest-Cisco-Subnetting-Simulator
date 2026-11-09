export type IPv4String = string;
export type CIDRPrefix = number;
export type DifficultyLevel = 'EASY' | 'MEDIUM' | 'HARD';

// ── Direccionamiento ────────────────────────────────────────────────────────
export interface SubnetRequirement {
  id: string;
  name: string;
  kind: 'LAN' | 'WAN';
  hostsRequired: number;
  /** Interfaces que consumen esta subred (1 para LAN, 2 para WAN). */
  endpoints: { deviceId: string; interfaceName: string }[];
}

export interface SubnetResult {
  id: string;
  name: string;
  hostsRequired: number;
  hostsAvailable: number;
  prefix: CIDRPrefix;
  netmask: IPv4String;
  wildcardMask: IPv4String;
  networkAddress: IPv4String;
  firstUsableIp: IPv4String;
  lastUsableIp: IPv4String;
  broadcastAddress: IPv4String;
  blockSize: number;
  networkInt: number;
  broadcastInt: number;
}

// ── Topología ───────────────────────────────────────────────────────────────
export type InterfaceType = 'ETHERNET' | 'SERIAL';

export interface NetworkInterface {
  id: string;
  name: string;
  type: InterfaceType;
  isDCE?: boolean;
  assignedSubnetId?: string;
}

export interface RouterDevice {
  id: string;
  hostname: string;
  /** Coordenadas normalizadas (0..1) para el lienzo. */
  position: { x: number; y: number };
  interfaces: Record<string, NetworkInterface>;
}

export interface TopologyConnection {
  id: string;
  fromRouterId: string;
  fromInterface: string;
  toRouterId: string;
  toInterface: string;
  connectionType: 'WAN_SERIAL';
  subnetId: string;
}

export interface TopologyGraph {
  seed: string;
  difficulty: DifficultyLevel;
  baseNetwork: IPv4String;
  basePrefix: CIDRPrefix;
  shape: 'line' | 'ring';
  routers: RouterDevice[];
  connections: TopologyConnection[];
  requirements: SubnetRequirement[];
}

export interface InterfaceTarget {
  ip: IPv4String;
  mask: IPv4String;
  prefix: CIDRPrefix;
  networkAddress: IPv4String;
  subnetId: string;
  role: string;
}
export type InterfaceTargets = Record<string, Record<string, InterfaceTarget>>;

// ── Consola Cisco ───────────────────────────────────────────────────────────
export type CiscoMode = 'USER_EXEC' | 'PRIVILEGED_EXEC' | 'GLOBAL_CONFIG' | 'INTERFACE_CONFIG';

export interface ActiveInterfaceConfig {
  ipAddress?: IPv4String;
  subnetMask?: IPv4String;
  isUp: boolean;
  clockRate?: number;
  description?: string;
}

export interface StaticRoute {
  network: IPv4String;
  mask: IPv4String;
  prefix: CIDRPrefix;
  nextHop: IPv4String;
}

export interface RouterRuntimeState {
  deviceId: string;
  hostname: string;
  currentMode: CiscoMode;
  activeInterface?: string;
  runningConfig: {
    bannerMotd?: string;
    interfaces: Record<string, ActiveInterfaceConfig>;
    staticRoutes?: StaticRoute[];
  };
  commandHistory: string[];
}

export type CliErrorType = 'SYNTAX' | 'CONTEXT' | 'PARAMETER_MISMATCH' | 'AMBIGUOUS' | 'INCOMPLETE';

export interface CLICommandFeedback {
  success: boolean;
  output: string;
  errorDetail?: { type: CliErrorType; message: string; pointerIndex?: number };
}
