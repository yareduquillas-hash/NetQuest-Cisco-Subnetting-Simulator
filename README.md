# NetQuest — Laboratorio Editorial de Redes, Subnetting y Simulación Cisco IOS

> Plataforma educativa web, analítica e interactiva con diseño editorial de alta gama inspirado en Claude, ejecución 100% client-side (sin backend, latencia cero, offline) y diagnóstico pedagógico de causa raíz.

---

## 🌟 Características Principales

* **Estética Editorial de Alta Gama (Inspiración Claude):**
  - Paleta cromática madura: marfil cálido (`#faf9f5`), tinta carbón (`#141413`), acentos en arcilla/terracota (`#d97757`) y oliva (`#788c5d`).
  - Tipografía variable de precisión: *Source Serif 4* (titulares), *Inter* (cuerpo de lectura) y *JetBrains Mono* (binario, IPs y consola).
  - Cero distracciones infantiles (sin vidas, sin corazones, sin rachas ni sonidos arcade).
* **Nivel 1 · Subnetting Clásico (FLSM):**
  - Matriz de cálculo para redes con clase (A, B y C).
  - Tira de 32 bits reactiva con segmentación por color (red, subred prestada, host).
  - Detección inmediata de saltos de bloque y octeto modificado.
* **Nivel 2 · Plan de Direccionamiento (VLSM):**
  - Algoritmo de asignación voraz descendente (*greedy descending*).
  - **Barra de Partición del Espacio (`AddressSpaceBar`):** Mapeo visual y proporcional de cada subred en la red base, con visualizador de espacio libre e información contextual.
  - **Selector de vista en tabla:** Alterna entre vista *Esencial* (prefijo y red) y vista *Detallada* (primera IP útil, última IP útil, broadcast y máscara decimal).
* **Nivel 3 · Laboratorio de Consola Cisco IOS:**
  - Máquina de Estados Finitos (FSM) con 4 modos jerárquicos: `User Exec` (`>`), `Privileged Exec` (`#`), `Global Config` (`(config)#`) e `Interface Config` (`(config-if)#`).
  - Matching de prefijos canónicos (`en`, `conf t`, `sh ip int br`, `sh run`, `sh ip route`, `wr`, etc.).
  - Ayuda contextual `?`, autocompletado con `Tab` y puntero de error de sintaxis `^`.
  - Simulación física de enlaces: interfaz serial DCE con `clock rate`, DTE, y `line protocol` condicionado a sincronización de reloj y `no shutdown`.
  - Enrutamiento estático mediante `ip route [red] [máscara] [next-hop]` y tabla de rutas con códigos `C` (conectada) y `S` (estática).
  - Chips de comando rápido integrados en terminal para acceso inmediato a inspección.
  - Botón de **Comprobación de Conectividad Global** con pruebas automáticas ICMP (ping multi-salto recursivo).
  - **Pistas de IP bajo demanda** para consultar la IP/máscara objetivo de cada interfaz si el alumno se bloquea.
* **Sección de Motores Interactiva:**
  - Pestaña 1: Calculadora de subred IPv4 (FLSM) con desglose binario de 32 bits y métricas de red.
  - Pestaña 2: Optimizador VLSM dinámico con creación, edición y eliminación de requerimientos en tiempo real.
* **Síntesis Acústica Táctil Procedural (Web Audio API):**
  - Sonido procedural analógico sintetizado en tiempo real (sin archivos de audio externos, latencia nula).
  - Clics táctiles de consola, ecos de eco ICMP, acordes armónicos sutiles en resoluciones correctas e interruptor de silencio persistente en la cabecera.
* **100% Client-Side y Determinista:**
  - Generador procedural de redes con PRNG Mulberry32 y códigos de semilla (`seed`). Mismo código produce exactamente la misma red.
  - Métricas de precisión analítica (%) y retos resueltos persistidos en `localStorage`.

---

## 🚀 Inicio Rápido

### Opción 1: Lanzador de un Clic (Windows)
Haz doble clic en el archivo ubicado en la carpeta principal:
```bat
Iniciar_NetQuest.bat
```
El script iniciará el servidor de desarrollo Vite y abrirá automáticamente `http://localhost:5173` en tu navegador predeterminado.

### Opción 2: Terminal
```bash
# 1. Navegar al directorio de la aplicación
cd netquest-app

# 2. Instalar dependencias (si no se han instalado)
npm install

# 3. Iniciar el servidor local de desarrollo
npm run dev

# 4. Compilar para producción
npm run build

# 5. Ejecutar la suite de pruebas unitarias
npx vitest run
```

---

## 📁 Estructura del Proyecto

```
netquest-app/
├── public/                     # Recursos estáticos
├── src/
│   ├── engines/                # Motores matemáticos, generadores y CLI
│   │   ├── types.ts            # Definiciones de tipos y dominio TypeScript
│   │   ├── ip.ts               # Aritmética uint32 de 32 bits para IPv4
│   │   ├── subnet.ts           # FLSM, VLSM voraz y diagnósticos de causa raíz
│   │   ├── rng.ts              # PRNG Mulberry32 determinista
│   │   ├── topology.ts         # Generador procedimental de grafos de red
│   │   ├── cli.ts              # Emulador FSM Cisco IOS, rutas y ping recursivo
│   │   ├── sound.ts            # Síntesis acústica procedural (Web Audio API)
│   │   └── engines.test.ts     # Suite de 20 pruebas unitarias con Vitest
│   ├── state/
│   │   └── progress.ts         # Almacenamiento local de precisión y retos
│   ├── components/             # Componentes visuales y páginas
│   │   ├── shared.tsx          # BitStrip, ChallengeBar, AddressSpaceBar, Terminal, NoteFeed
│   │   ├── Home.tsx            # Página de bienvenida con gráfico interactivo SVG
│   │   ├── Level1.tsx          # Nivel 1: Subnetting clásico FLSM
│   │   ├── Level2.tsx          # Nivel 2: Asignación VLSM y topología
│   │   ├── Level3.tsx          # Nivel 3: Laboratorio Cisco IOS
│   │   └── Engines.tsx         # Calculadora FLSM y optimizador interactivo VLSM
│   ├── App.tsx                 # Enrutamiento hash, selector de tema y audio toggle
│   ├── main.tsx                # Punto de entrada de React 19
│   └── styles.css              # Sistema de diseño editorial inspirado en Claude
├── index.html                  # Plantilla HTML5
├── package.json                # Dependencias y scripts
├── tsconfig.json               # Configuración TypeScript estricta
└── vite.config.ts              # Configuración Vite
```

---

## 💻 Manual de Comandos Cisco IOS Soportados

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

## 🔬 Diagnóstico Pedagógico de Causa Raíz

Cuando un estudiante comete un error, el motor matemático identifica el fundamento pedagógico exacto:
- `ERR_BROADCAST_AS_HOST`: Se intentó asignar o usar la dirección de broadcast como host usable.
- `ERR_NETWORK_AS_HOST`: Se intentó asignar o usar la dirección de red como host usable.
- `ERR_INSUFFICIENT_CAPACITY`: La máscara elegida no proporciona suficientes bits de host para la demanda ($2^n - 2 < H$).
- `ERR_SUBNET_OVERLAP`: El bloque asignado se solapa con otra subred previamente calculada.
- `ERR_INVALID_JUMP`: El cálculo del salto no coincide con las potencias de 2 del octeto correspondiente.
- `ERR_WASTEFUL_MASK`: Se asignaron más bits de los necesarios, desperdiciando espacio del plan de direccionamiento.
- `ERR_OUT_OF_BASE`: El bloque se desborda fuera de la frontera de la red principal asignada.

---

## 🧪 Pruebas Unitarias Automatizadas

El proyecto incluye 20 pruebas unitarias con Vitest que cubren:
- Operaciones binarias y aritméticas uint32.
- Solver VLSM voraz descendente y detección de solapamientos.
- Generador de topologías y cálculo de soluciones por dificultad.
- Navegación de estados FSM del CLI Cisco IOS.
- Rechazo de direcciones de red/broadcast y ambigüedad de comandos.
- Persistencia con `wr` y `copy run start`.
- Configuración y eliminación de rutas estáticas (`ip route` / `no ip route`).
- Inspección con `show version` y `show interfaces`.
- Alcanzabilidad multi-salto y pruebas de `ping`.

Ejecución de pruebas:
```bash
npx vitest run
```
Salida esperada:
```
 ✓ src/engines/engines.test.ts (20 tests) 321ms
 Test Files  1 passed (1)
      Tests  20 passed (20)
```
