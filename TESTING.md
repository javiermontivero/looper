# Regresiones de producto

## Una corrida

Requisitos de desarrollo: Node 22+, dependencias y Chromium de Playwright:

```sh
npm ci
npx playwright install --with-deps chromium
npm test
```

Las pruebas se ejecutan bajo demanda desde el checkout de desarrollo, normalmente
al terminar una feature o un arreglo. No corren por push, pull request, release,
publicación de Pages, build ni arranque de Lab. No hay workflow de regresión,
servicio de tests, imagen de Playwright ni VM dedicada.

Playwright abre Chromium y el servidor local de prueba durante la corrida y los
cierra al terminar. Son procesos de la ejecución local, no servicios permanentes.

Para trabajar con el agente en Lab, Node, las dependencias y Chromium deben estar
disponibles en el sandbox de comandos. Si faltan, el administrador debe preparar
ese entorno; no se reemplaza por una VM, contenedor de tests o job de Actions.
La instalación de requisitos se hace una vez en el entorno de desarrollo con
acceso a red; las corridas usan los recursos locales.

No hace falta conectar un teclado ni tener salida de audio en el servidor.

La suite ejecuta escenarios de audio en serie para evitar competencia de foco,
CPU y salida de audio entre navegadores. Los efectos también se repiten a 44.1 kHz.
La suite completa incluye una reproducción continua de 1000 vueltas (unos 17 minutos) y
una grabación real de 60 segundos. No se adelanta el reloj del audio para hacerlas pasar.
La corrida completa medida en Lab tardó 25,8 minutos (sin instalar dependencias).
Para iteración rápida, explícitamente incompleta: `npm test -- --grep-invert @soak`.
Para investigar: `npm run test:ui`. Reporte posterior: `npm run test:report`.
Una prueba aislada: `npm test -- --grep P36`.
Sin reintentos automáticos: un fallo no se oculta repitiendo hasta obtener verde.

## Qué es real y qué se sustituye

El navegador abre el HTML publicado, importa sus módulos y maneja la interfaz.
Se ejecutan las versiones reales y fijadas de Tone y smplr, AudioContext,
AudioWorklet, Worker de persistencia e IndexedDB. No se importa LoopCore,
EffectChain, InstrumentSource ni otras clases de producto dentro de los tests.
No se inspeccionan arrays de nodos, métodos llamados ni mensajes entre componentes.

Las únicas fronteras simuladas son:
- Hardware MIDI: un dispositivo Web MIDI virtual envía paquetes como un teclado.
- Proveedores externos: catálogos mínimos y WAV deterministas, con fallos y demoras
  controlados; las librerías no se reemplazan. Recursos desconocidos fallan para
  evitar dependencias accidentales de Internet.
- Frecuencia de dispositivo: AudioContext nativo a 48 kHz o 44.1 kHz.
- Cuota: una inyección de fallo en la API de escritura del Worker lanza
  QuotaExceededError y aborta la transacción nativa al guardar audio. La aplicación,
  el Worker, IndexedDB y su rollback son reales. No se reemplaza SessionStore ni
  se mantiene una base de datos en memoria; no se mide el límite físico de disco.

Un AudioWorklet de observación toma una derivación de la salida final, sin cambiar
su destino. Comprueba silencio, energía, panorama, afinación, colas y pulsos.
No mide latencia física USB → parlante. Las muestras de prueba no pretenden
verificar la calidad artística ni la disponibilidad actual de los bancos remotos.

Las sesiones históricas son documentos versión 1 escritos en IndexedDB antes de
abrir la aplicación: prueban compatibilidad, recorte oculto y cambio de dispositivo.
El resto de sesiones se crea grabando desde la UI y MIDI. No se fabrican objetos
internos del motor. La restauración se verifica reproduciendo el audio y leyendo
controles visibles, no comparando el almacenamiento con su propia implementación.

## Mapa de cobertura migrada

Los identificadores Pxx permanecen en los títulos para localizar regresiones.
Hay casos parametrizados por familia, efecto, cancelación y BPM.

| Área anterior | Comportamientos de producto que la reemplazan |
| --- | --- |
| core / servidor / validación estática | P01, P08–10, P39–43, P55: tocar, soltar, velocity, sustain por canal, bend, pánico, teclado PC, fallos de arranque, publicación bajo subruta y UI móvil |
| catalog / sound-browser | P03, P11, P13–16, P59: todos los bancos y familias, IDs únicos en selectores, roles recordados, más de 128 opciones, CC relativos/extremos/reversa, carga bajo demanda y errores de proveedor |
| instruments | P08–16, P44, P55: reproducción por cada motor real, intensidad, colas de percusión, hi-hat, sustain, polifonía y descarte de cargas/notas atrasadas |
| midi-buttons / UI | P02–07, P18, P40, P43, P51–53, P56, P61: selección antes de acción, pads dispersos, siete pistas, aprender/liberar/hold/rebote, CC bajo, dispositivo/canal, desconexión, borrado, master y efectos |
| looper / wrapper / count-in-worklet | P17–26, P32, P34–35, P38, P45–51, P54, P57–58, P60: cuenta previa, guía de 4 compases, cierre inmediato/mínimo, cuantización, espera/cancelación, overdub seco, mute/fase, pausa, recorte reversible, extensión, cambio de BPM, 7 salidas, 60 s, 128 compases y sincronización prolongada |
| effects / comparación con motor anterior | P27–32: salida audible de los ocho efectos, volumen/pan, parámetros, orden no conmutativo, quitar efectos, cadenas independientes y captura seca |
| session / session-worker | P07, P21, P26, P31, P33–38: audio/configuración al recargar, pistas dispersas/mute/selección, datos ocultos tras overdub, resampling, cuota con conservación de guardado previo, documento incompatible y cambios durante guardado |
| audio-engine / latency | P01, P10, P32, P39, P41, P44, P55: salida acotada, motor real, recuperación de carga, cambio de fuente, monitor/clic fuera de captura, métricas acotadas y reinicio |

Se conserva cobertura de contratos de producto, no porcentajes de líneas de los
fakes anteriores. Aserciones sobre asignación de buffers, nombres de métodos,
cantidad de nodos o forma de mensajes se retiraron: eran decisiones internas,
no comportamientos prometidos al usuario. Sus consecuencias observables
(límites, aislamiento, conservación de audio, cancelación y recuperación) se
comprueban de extremo a extremo.

## Resultados y límites

Playwright escribe `playwright-report/` y `test-results/`, incluido un resumen JSON.
En fallos conserva captura y traza. Los reportes quedan en el entorno donde se
ejecutó la suite y se consultan con `npm run test:report`.
La corrida larga desactiva las capturas continuas de la traza para no guardar
miles de imágenes del círculo; conserva la captura al fallar.

El proyecto soak depende de las otras regresiones: las 1000 vueltas solo se
inician si las demás pasan. La corrida prolongada usa BPM de referencia 137 y
reproducción a 240 BPM, para incluir posiciones fraccionarias además del tiempo.

Chromium es el navegador de regresión porque el producto se usa con Chrome/Android
y MIDI USB. El viewport móvil prueba layout, no emula el hardware Android.
Antes de una publicación importante sigue haciendo falta probar en el MiniControl
y el teléfono: permisos HTTPS/USB, detección, release/hold reales, escucha y latencia,
cambios de app/pantalla bloqueada y disponibilidad/calidad real de samples.
No se afirma cobertura automatizada de Firefox, USB físico ni drivers.

No se añaden código ni archivos de test a `public/`. Pages sigue publicando
solamente esa carpeta; Playwright y los fixtures son dependencias de desarrollo.
