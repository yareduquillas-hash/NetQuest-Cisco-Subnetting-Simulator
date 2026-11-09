# NETQUEST: ESPECIFICACIÓN TÉCNICA Y ARQUITECTURA DEL SISTEMA

## Plataforma Editorial de Aprendizaje de Redes, Subnetting y Simulación Cisco IOS

---

## 1. RESUMEN EJECUTIVO Y VISIÓN GENERAL

### 1.1. Propósito del Proyecto

**NetQuest** es una plataforma educativa web, analítica e interactiva, diseñada para enseñar con rigor conceptual los fundamentos de redes de computadoras: desde la aritmética binaria y el cálculo de subredes (FLSM/VLSM) hasta la configuración práctica de interfaces de routers mediante una interfaz de línea de comandos (CLI) que emula fielmente el comportamiento de Cisco IOS.

### 1.2. Principios de Diseño y Filosofía

1. **Curva de Aprendizaje Progresiva (Scaffolding):** División del dominio en tres niveles integrados de complejidad cognitiva:
   - **Nivel 1:** Subnetting clásico y saltos de bloque (FLSM).
   - **Nivel 2:** Planificación de direccionamiento heterogéneo y partición del espacio (VLSM).
   - **Nivel 3:** Laboratorio de consola Cisco IOS con validación cruzada y verificación de enlaces.
2. **Estética Editorial de Alta Gama (Inspiración Claude):**
   - Eliminación total de componentes infantiles o de tipo "Duolingo" (sin corazones, sin vidas limitadas, sin rachas de fuego ni tipografías de cómic).
   - Interfaz sobria, madura y académica inspirada en la web oficial de Claude: lienzo marfil cálido (`#faf9f5`), tinta carbón (`#141413`), acento terracota/arcilla (`#d97757`), tonos de oliva apagado (`#788c5d`) y bordes tenues.
   - Tipografía de precisión técnica: `Source Serif 4 Variable` (titulares humanistas), `Inter Variable` (cuerpo editorial claro) y `JetBrains Mono Variable` (representación binaria, direcciones IP y terminal).
3. **Arquitectura 100% Client-Side (Zero-Latency & Offline):**
   - Toda la computación matemática en enteros `uint32`, la generación determinista de topologías procedurales y la máquina de estados finitos del CLI corren directamente en el hilo de ejecución del navegador (TypeScript + React 19 + Vite).
   - Cero dependencias de servidor, cero latencia de red, costo operativo nulo y capacidad completa de ejecución offline.
4. **Diagnóstico Pedagógico de Causa Raíz:**
   - El motor no penaliza con vidas arbitrarias; diagnostica el error conceptual exacto del estudiante:
     - `ERR_BROADCAST_AS_HOST`: Confusión entre broadcast y host útil asignable.
     - `ERR_NETWORK_AS_HOST`: Uso de la dirección de red como host de interfaz.
     - `ERR_INSUFFICIENT_CAPACITY`: Máscara demasiado restrictiva para la demanda de hosts.
     - `ERR_SUBNET_OVERLAP`: Solapamiento de rangos con subredes adyacentes.
     - `ERR_INVALID_JUMP`: Salto de bloque erróneo en el octeto correspondiente.
     - `ERR_WASTEFUL_MASK`: Asignación excesiva que desperdicia espacio en el plan.
5. **Acústica Táctil y Síntesis Procedural (Web Audio API):**
   - Retroalimentación auditiva minimalista sin archivos de audio pesados: micro-pulsos mecánicos para escritura en terminal, tonos de retorno para comandos válidos, ecos de sonar para pings ICMP y acordes armónicos sutiles en resoluciones correctas, con interruptor de silencio persistente.

---

## 2. FLUJO PEDAGÓGICO Y NIVELES DEL SISTEMA

| Nivel | Nombre | Enfoque Conceptual | Entrada | Acción del Usuario | Criterio de Validación |
| :---- | :---- | :---- | :---- | :---- | :---- |
| **1** | **Subnetting Clásico (FLSM)** | Aritmética binaria, máscaras fijas y cálculo de saltos. | Red con clase (A, B o C) y prefijo objetivo (ej. `172.16.0.0/16` dividido en `/19`). | Calcular salto de bloque, octeto modificado y completar la matriz de subredes (red, 1ª útil, última útil, broadcast). | Validación matemática exacta de rangos IP y visualizador de 32 bits reactivo. |
| **2** | **VLSM y Topología Gráfica** | Optimización voraz de direcciones en topologías heterogéneas. | Grafo procedimental con routers, enlaces seriales `/30` y LANs con demandas de hosts variables. | Ordenar demandas (descendente), calcular prefijos variables y particionar el espacio en bloques contiguos. | Cero solapamiento, uso eficiente del espacio base y cobertura del 100% de los hosts. |
| **3** | **Cisco IOS CLI Lab** | Configuración real de interfaces de red y verificación de estado. | Topología validada del Nivel 2 con routers en estado inicial (interfaces apagadas, sin IP). | Navegar modos (`enable`, `conf t`, `interface`), configurar IP/máscaras, sincronizar reloj DCE (`clock rate`) y levantar interfaces (`no shut`). | Consistencia total con el plan del Nivel 2, interfaces en estado `up/up` y pings ICMP al 100%. |

---

## 3. ARQUITECTURA GENERAL DEL SISTEMA (CLIENT-SIDE)

```
┌────────────────────────────────────────────────────────────────────────┐
│                        CAPA DE PRESENTACIÓN (UI)                       │
│  ┌───────────────────────┐  ┌────────────────────┐  ┌────────────────┐ │
│  │   Tablas de Subred    │  │ Lienzo de Topología│  │ Consola Cisco  │ │
│  │ (Esencial/Detallada)  │  │(Flujo SVG Animado) │  │(Terminal React)│ │
│  └───────────┬───────────┘  └─────────┬──────────┘  └────────┬───────┘ │
│              │                        │                      │         │
│              │      ┌─────────────────┴──────────────────┐   │         │
│              │      │  Barra de Partición de Direcciones │   │         │
│              │      │      (AddressSpaceBar VLSM)        │   │         │
│              │      └─────────────────┬──────────────────┘   │         │
└──────────────┼────────────────────────┼──────────────────────┼─────────┘
               ▼                        ▼                      ▼
┌────────────────────────────────────────────────────────────────────────┐
│                        MOTORES LÓGICOS (TypeScript)                    │
│                                                                        │
│  1. SubnetEngine (ip.ts, subnet.ts)                                    │
│     - Aritmética uint32 de 32 bits, prefijos CIDR y máscaras.          │
│     - Solver voraz descendente de VLSM y cálculo de saltos.            │
│     - Diagnóstico pedagógico de causa raíz (7 códigos de error).       │
│                                                                        │
│  2. TopologyGenerator (topology.ts, rng.ts)                            │
│     - Generación determinista mediante PRNG Mulberry32 y semillas.     │
│     - Calibración por dificultad (EASY, MEDIUM, HARD).                 │
│                                                                        │
│  3. CiscoCLIEngine (cli.ts)                                            │
│     - FSM de 4 modos: USER, PRIVILEGED, CONFIG, CONFIG-IF.             │
│     - Gramática con abreviaturas canónicas, ayuda contextual '?' y Tab.│
│     - Estado de enlace serial DCE/DTE, reloj de sincronización.        │
│     - Enrutamiento estático (ip route), estadísticas y multi-hop ping. │
│                                                                        │
│  4. SoundEngine (sound.ts)                                             │
│     - Síntesis de sonido procedural analógica (Web Audio API).         │
│                                                                        │
│  5. ProgressStore (progress.ts)                                        │
│     - Tasa de precisión analítica (%) y retos completados en storage.  │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 4. MOTOR MATEMÁTICO DE IPv4 (`SubnetEngine` & `ip.ts`)

### 4.1. Fundamento Aritmético (Enteros uint32)

Las operaciones de red se ejecutan directamente sobre números enteros de 32 bits sin signo (`uint32`), evitando manipulaciones de cadenas que introducen sobrecarga o imprecisiones:

* **Conversión IP String a uint32:**
  $$\text{ipInt} = (O_1 \ll 24) + (O_2 \ll 16) + (O_3 \ll 8) + O_4$$
* **Conversión uint32 a IP String:**
  $$\text{ipStr} = [(\text{ipInt} \gg 24) \ \& \ 255] . [(\text{ipInt} \gg 16) \ \& \ 255] . [(\text{ipInt} \gg 8) \ \& \ 255] . (\text{ipInt} \ \& \ 255)$$
* **Máscara de Subred desde Prefijo ($p$):**
  $$\text{maskInt} = p = 0 \ ? \ 0 : (0\text{xFFFFFFFF} \ll (32 - p)) \ \& \ 0\text{xFFFFFFFF}$$
* **Dirección de Red:**
  $$\text{networkInt} = \text{ipInt} \ \& \ \text{maskInt}$$
* **Dirección de Broadcast:**
  $$\text{broadcastInt} = \text{networkInt} \mid (\sim\text{maskInt} \ \& \ 0\text{xFFFFFFFF})$$
* **Primera IP Útil:**
  $$\text{firstUsableInt} = \text{networkInt} + 1 \quad (\text{para } p \le 30)$$
* **Última IP Útil:**
  $$\text{lastUsableInt} = \text{broadcastInt} - 1 \quad (\text{para } p \le 30)$$
* **Tamaño de Bloque (Block Size):**
  $$\text{blockSize} = 2^{(32 - p)}$$

### 4.2. Algoritmo Solver de VLSM (Greedy Descending Allocation)

1. **Entrada:** Dirección de red base $B$ (ej. `192.168.0.0/24`) y colección de requerimientos de hosts $R = [H_1, H_2, \dots, H_m]$.
2. **Ordenamiento Voraz:** Ordenar $R$ de manera estrictamente descendente según la demanda de hosts:
   $$H_1 \ge H_2 \ge \dots \ge H_m$$
3. **Asignación Secuencial Contigua:**
   - Para cada requerimiento $H_i$:
     - Calcular bits de host necesarios $n$: menor entero tal que $2^n - 2 \ge H_i$ (para $H_i = 2$ en enlaces seriales, $n = 2$, resultando en prefijo `/30`).
     - Prefijo resultante: $p_i = 32 - n$.
     - Tamaño de bloque: $S_i = 2^n$.
     - Asignar rango $[\text{cursor}, \text{cursor} + S_i - 1]$.
     - Actualizar: $\text{cursor} \leftarrow \text{cursor} + S_i$.
4. **Verificación de Límite:** Si $\text{cursor} > \text{broadcast}(B)$, el solver concluye indicando insuficiencia de espacio de direccionamiento.

### 4.3. Motor de Diagnóstico Pedagógico de Causa Raíz

En lugar de simples respuestas binarias, el motor evalúa la entrada frente al modelo matemático:
- `ERR_BROADCAST_AS_HOST`: Se detecta que el usuario escribió la dirección de broadcast como host usable.
- `ERR_NETWORK_AS_HOST`: Se detecta el uso de la dirección del bloque de red como host usable.
- `ERR_INSUFFICIENT_CAPACITY`: La máscara introducida no soporta la cantidad de hosts requerida ($2^n - 2 < H$).
- `ERR_SUBNET_OVERLAP`: El bloque calculado solapa con el de otra subred adyacente.
- `ERR_INVALID_JUMP`: El salto no corresponde al incremento en potencias de 2 del octeto correspondiente.
- `ERR_WASTEFUL_MASK`: Se reservaron más bits de los necesarios, desperdiciando espacio del direccionamiento base.
- `ERR_OUT_OF_BASE`: El bloque calculado excede la frontera de la red principal.

---

## 5. MODELO DE DATOS FORMAL (TypeScript)

### 5.1. Primitivas y Direccionamiento (`src/engines/types.ts`)

```typescript
export type IPv4String = string;
export type CIDRPrefix = number;
export type DifficultyLevel = 'EASY' | 'MEDIUM' | 'HARD';

export interface SubnetRequirement {
  id: string;
  name: string;
  kind: 'LAN' | 'WAN';
  hostsRequired: number;
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
```

### 5.2. Topología y Dispositivos

```typescript
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
  routers: RouterDevice[];
  connections: TopologyConnection[];
  requirements: SubnetRequirement[];
}
```

### 5.3. Emulador de Consola Cisco IOS

```typescript
export type CiscoMode =
  | 'USER_EXEC'          // Router>
  | 'PRIVILEGED_EXEC'    // Router#
  | 'GLOBAL_CONFIG'      // Router(config)#
  | 'INTERFACE_CONFIG';  // Router(config-if)#

export interface StaticRoute {
  network: string;
  mask: string;
  prefix: number;
  nextHop: string;
}

export interface ActiveInterfaceConfig {
  ipAddress?: IPv4String;
  subnetMask?: IPv4String;
  isUp: boolean;
  clockRate?: number;
  description?: string;
}

export interface RouterRuntimeState {
  deviceId: string;
  hostname: string;
  currentMode: CiscoMode;
  activeInterface?: string;
  runningConfig: {
    hostname: string;
    bannerMotd?: string;
    interfaces: Record<string, ActiveInterfaceConfig>;
    staticRoutes?: StaticRoute[];
  };
  commandHistory: string[];
}
```

---

## 6. GENERACIÓN PROCEDURAL DE TOPOLOGÍAS (`TopologyGenerator`)

El generador procedural garantiza reproducibilidad determinista infinita basada en semillas alfanuméricas (`seed`):

### 6.1. Calibración por Nivel de Dificultad

* **Fácil (EASY):**
  - Red base de Clase C (`192.168.X.0/24`).
  - 2 Routers interconectados mediante 1 enlace serial `/30`.
  - 1 a 2 LANs por router con demandas típicas (10 a 120 hosts).
  - Variación de saltos confinada al cuarto octeto.
* **Medio (MEDIUM):**
  - Red base de Clase B (`172.16-31.X.0/20`).
  - 3 Routers en topología lineal (A — B — C) con 2 enlaces seriales `/30`.
  - Demandas heterogéneas (4 a 500 hosts) que cruzan fronteras de octetos.
* **Difícil (HARD):**
  - Red base de Clase A (`10.X.0.0/16`).
  - 3 a 4 Routers en topología de anillo redundante (A — B — C — D — A).
  - Múltiples interfaces WAN y demandas de alta escala (10 a 4000 hosts).

### 6.2. Semillas Deterministas (PRNG Mulberry32)

Se emplea el algoritmo Mulberry32 de 32 bits. Dada una semilla como `NQ-7K2M9`, cualquier usuario en cualquier navegador generará exactamente la misma topología de red, direcciones base y distribución de requerimientos.

---

## 7. EMULADOR DE LÍNEA DE COMANDOS CISCO IOS (`CiscoCLIEngine`)

### 7.1. Gramática y Abreviaturas Canónicas

El analizador sintáctico realiza matching de prefijo canónico sobre tokens reconocidos:
* `en` / `ena` $\rightarrow$ `enable`
* `conf t` $\rightarrow$ `configure terminal`
* `int e0` $\rightarrow$ `interface Ethernet0`
* `int s0/0` $\rightarrow$ `interface Serial0/0`
* `sh ip int br` $\rightarrow$ `show ip interface brief`
* `sh run` $\rightarrow$ `show running-config`
* `sh ip route` $\rightarrow$ `show ip route` (marcado con códigos `C` connected y `S` static)
* `sh ver` $\rightarrow$ `show version` (especificaciones completas de memoria y uptime)
* `sh int` / `sh int [nombre]` $\rightarrow$ `show interfaces` (estadísticas completas MTU, BW, DLY)
* `wr` / `write memory` / `copy run start` $\rightarrow$ Almacenamiento simulado en NVRAM con `[OK]`
* `do [comando]` $\rightarrow$ Ejecución de comandos del modo privilegiado desde modos de configuración
* Marcador de error exacto con puntero `^`:
  ```
  Router(config)#ip address 192.168.1.1
                            ^
  % Incomplete command.
  ```

### 7.2. Fisiología de Enlaces y Reloj DCE

En enlaces seriales punto a punto:
- La interfaz del extremo DCE requiere obligatoriamente configurar la frecuencia de reloj mediante `clock rate [velocidad]` (ej. `clock rate 64000`).
- Si el extremo DTE intenta ejecutar `clock rate`, el comando es rechazado con `%Error: This command applies only to DCE interfaces`.
- El protocolo de línea (`line protocol`) solo alcanza el estado `up` cuando:
  1. Ambos extremos del enlace serial han ejecutado `no shutdown`.
  2. El extremo DCE tiene una tasa de reloj válida configurada.

### 7.3. Enrutamiento Estático y Ping Multi-Hop

El motor emula el envío de paquetes ICMP Echo Request (`ping [IP]`):
- Si el destino está en una subred directamente conectada con interfaz `up/up`, la respuesta es inmediata `!!!!!` (100% éxito).
- Si el destino se encuentra a múltiples saltos (ej. Router A intentando alcanzar Router C a través de Router B), el motor evalúa la alcanzabilidad recursiva validando que todos los enlaces intermedios estén activos o que existan rutas estáticas (`ip route`) configuradas.

---

## 8. MÉTRICAS ANALÍTICAS DE APRENDIZAJE Y PERSISTENCIA

En sustitución de las dinámicas arcade (vidas y corazones):
* **Precisión Analítica (%):** Proporción entre validaciones correctas e intentos realizados, calculada independientemente por nivel.
* **Desafíos Completados:** Contador persistente en `localStorage` de retos resueltos satisfactoriamente.
* **Retroalimentación Diagnóstica Inmediata:** Explicaciones pedagógicas detalladas que guían al usuario hacia el razonamiento conceptual sin frustraciones artificiales.
* **Seguridad y Privacidad:** Persistencia 100% local sin envío de datos de usuario ni rastreo externo.

---

## 9. ESTRUCTURA DE ARCHIVOS Y MÓDULOS DE CÓDIGO

```
netquest-app/
├── src/
│   ├── engines/                # Lógica pura desacoplada de React
│   │   ├── types.ts            # Interfaces TypeScript de dominios y estados
│   │   ├── ip.ts               # Aritmética uint32, conversiones, prefijos CIDR
│   │   ├── subnet.ts           # Algoritmos FLSM, solver VLSM y diagnósticos
│   │   ├── rng.ts              # PRNG Mulberry32 y generación de semillas
│   │   ├── topology.ts         # Generador procedimental de grafos de red
│   │   ├── cli.ts              # Emulador FSM Cisco IOS, rutas y ping multi-hop
│   │   ├── sound.ts            # Síntesis procedural Web Audio API (tactile audio)
│   │   └── engines.test.ts     # 20 pruebas unitarias con Vitest
│   ├── state/
│   │   └── progress.ts         # Store reactivo con persistencia en localStorage
│   ├── components/             # Capa de presentación (React 19)
│   │   ├── shared.tsx          # BitStrip, ChallengeBar, AddressSpaceBar, Terminal, NoteFeed
│   │   ├── Home.tsx            # Portada editorial con topología animada SVG
│   │   ├── Level1.tsx          # Nivel 1: Subnetting clásico FLSM
│   │   ├── Level2.tsx          # Nivel 2: Asignación VLSM y topología
│   │   ├── Level3.tsx          # Nivel 3: Laboratorio Cisco IOS CLI
│   │   └── Engines.tsx         # Calculadora interactiva FLSM y optimizador VLSM
│   ├── App.tsx                 # Barra superior, navegación hash, conmutador de tema y audio
│   ├── main.tsx                # Entrada de la aplicación React
│   └── styles.css              # Sistema de diseño editorial inspirado en Claude
├── Iniciar_NetQuest.bat         # Lanzador automático en Windows
├── README.md                   # Documentación técnica del repositorio
└── vite.config.ts              # Configuración de compilación Vite
```

---

## 10. MANUAL DE COMANDOS CISCO IOS SOPORTADOS

| Modo | Comando Canónico | Abreviaturas | Descripción |
| :--- | :--- | :--- | :--- |
| **User Exec** (`Router>`) | `enable` | `en`, `ena` | Pasa al modo privilegiado |
| | `show ip interface brief` | `sh ip int br` | Muestra resumen de interfaces y su estado |
| | `show ip route` | `sh ip ro` | Muestra rutas directamente conectadas (`C`) y estáticas (`S`) |
| | `show version` | `sh ver` | Muestra información de software, hardware y memoria |
| | `show interfaces [iface]` | `sh int [if]` | Muestra estadísticas completas (MTU, BW, DLY, encapsulación) |
| | `ping <ip>` | `ping <ip>` | Envía eco ICMP con verificación multi-salto |
| **Privileged Exec** (`Router#`) | `configure terminal` | `conf t` | Pasa al modo de configuración global |
| | `show running-config` | `sh run` | Muestra la configuración activa del router |
| | `write memory` / `copy run start` | `wr`, `copy run start` | Guarda la configuración en memoria NVRAM (`[OK]`) |
| | `disable` | `dis` | Vuelve al modo User Exec |
| | `exit` | `ex` | Vuelve al modo User Exec |
| **Global Config** (`Router(config)#`) | `interface <tipo><num>` | `int e0`, `int s0/0` | Pasa al modo de configuración de la interfaz |
| | `hostname <nombre>` | `host <nombre>` | Cambia el nombre del router en el prompt |
| | `ip route <net> <mask> <next-hop>` | `ip ro ...` | Define una ruta estática |
| | `no ip route <net> <mask> <next-hop>` | `no ip ro ...` | Elimina una ruta estática |
| | `banner motd <#texto#>` | `banner motd ...`| Define el mensaje del día |
| | `do <comando>` | `do wr`, `do sh run`| Ejecuta comandos de modo privilegiado desde config |
| | `exit` / `end` | `ex`, `end` | Vuelve al modo privilegiado |
| **Interface Config** (`Router(config-if)#`) | `ip address <ip> <mask>` | `ip add ...` | Asigna dirección IP y máscara de subred |
| | `no ip address` | `no ip add` | Elimina la dirección IP de la interfaz |
| | `no shutdown` | `no shut` | Levanta administrativamente la interfaz |
| | `shutdown` | `shut` | Apaga administrativamente la interfaz |
| | `clock rate <bps>` | `clock rate 64000` | Sincroniza reloj en interfaces seriales DCE |
| | `description <texto>` | `desc ...` | Asigna descripción informativa a la interfaz |
| | `exit` | `ex` | Retorna a configuración global |

---

## 11. SÍNTESIS ACÚSTICA TÁCTIL PROCEDURAL (`sound.ts`)

En lugar de utilizar clips pregrabados (archivos MP3/WAV pesados):
- Se emplea la **Web Audio API** nativa del navegador.
- Osciladores sintéticos procedurales:
  - *Pulsación de tecla:* Onda triangular a 1400 Hz decayendo a 800 Hz en 8 ms (simulación táctil).
  - *Comando Enter:* Onda senoidal de 950 Hz a 620 Hz en 22 ms.
  - *Ping exitoso:* Tono armónico ascendente de 880 Hz a 1320 Hz en 80 ms.
  - *Ping fallido:* Onda de sierra descendente de 220 Hz a 110 Hz en 80 ms.
  - *Éxito analítico:* Acorde armónico pentatónico de 4 notas (C5, E5, G5, C6).
  - *Aviso de sintaxis:* Doble pulso grave a 180 Hz / 140 Hz.
- Activación bajo demanda que respeta las políticas de autoplay de los navegadores y conmutador de silencio persistente en `localStorage`.

---

## 12. SUITE DE PRUEBAS UNITARIAS AUTOMATIZADAS (Vitest)

El archivo [`src/engines/engines.test.ts`](file:///C:/Users/admin/Desktop/Folders/Aplicacion%20de%20Redes/netquest-app/src/engines/engines.test.ts) valida 20 especificaciones críticas con 100% de cobertura funcional:
1. Conversión bidireccional IPv4 y formato canónico.
2. Derivación de máscaras, wildcards y prefijos CIDR.
3. Bits de host requeridos según demanda heterogénea.
4. Generación de subredes FLSM uniformes.
5. Ordenamiento voraz descendente de requerimientos en VLSM.
6. Detección matemática de solapamientos entre bloques IP.
7. Diagnóstico pedagógico de direcciones de red y broadcast usadas como host.
8. Diagnóstico de capacidad insuficiente y salto erróneo.
9. Determinismo del PRNG Mulberry32 y semillas alfanuméricas.
10. Generación de topologías válidas en dificultades Fácil, Media y Difícil.
11. Solución de topologías y mapeo exacto a interfaces de routers.
12. Generación del desafío FLSM para el Nivel 1.
13. Navegación entre los cuatro modos de consola con abreviaturas.
14. Errores de sintaxis, contexto, ambigüedad e incompleto con marcador `^`.
15. Rechazo de dirección de red y solapamiento en asignación de IP.
16. Configuración integral del laboratorio y activación de protocolo serial.
17. Bloqueo de protocolo serial sin tasa de reloj configurada en DCE.
18. Autocompletado de comandos con la tecla Tabulador.
19. Persistencia de configuración en NVRAM con `wr` y `copy run start`.
20. Configuración, consulta y eliminación de rutas estáticas (`ip route`, `sh ip route`).