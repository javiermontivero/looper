# Looper 0.2

Versión 0.2 desplegada con autorización del usuario. Incluye pistas dinámicas de grabación y overdub.

## Instrumento
Catálogo completo de instrumentos publicados por los helpers de smplr 1.1.0: ElectricPiano, DrumMachine, DrumAbuse (máquinas), Mallet, Mellotron, Smolken y Versilian. También 128 programas GM de cada banco FluidR3_GM, MusyngKite y FatBoy, Tabla india, Splendid Grand Piano, batería acústica Hydrogen y los 12 presets FM propios.
El catálogo observado durante esta implementación contiene 862 presets/variantes únicos; el catálogo remoto de Versilian puede variar. No incluye importación de archivos SF2 propios, packs personalizados ni instrumentos sin catálogo automático.

Los metadatos adicionales se consultan al abrir; el catálogo GM y los presets originales siguen disponibles si falla esa consulta. Ajustes → Sonidos y créditos muestra cantidad y fallos por familia, con botón Actualizar catálogo. No se instancia ni descarga audio al enumerar sonidos: solo al seleccionar uno con audio activado. Se serializan las cargas, se aborta la anterior y se libera el sampler anterior; no se acumulan bancos en RAM. No se encolan notas durante la carga.

Instrumentos agrupados por función en la canción, con una lista completa por categoría, sin páginas ni límite de 64/128 opciones. CC13 cambia categoría y CC14 recorre sus instrumentos paso a paso. Al seleccionar un efecto, CC15 cambia su tipo y CC13/14 editan sus dos parámetros. CC7 sigue siendo master. Se preservan los IDs de los 19 sonidos anteriores. Los nombres incluyen banco/origen para diferenciar variantes. Solo se cargan muestras del instrumento elegido; Internet requerido. Créditos por colección en public/sounds.html. Versilian es experimental según upstream.

Batería: 16 muestras acústicas con velocidad, reproducción completa al soltar y exclusión de hi-hat abierto/cerrado. Mapeo GM MIDI 35–59 (las notas sin pieza quedan mudas), duplicado en 60–83 para teclados pequeños. Do/bombo, Re/redoblante, Fa♯/hi-hat cerrado, La♯/abierto. Sin pitch bend ni sustain en batería. Los controles de pista asignados consumen la nota como antes.

Además, 12 presets FM originales de dos operadores (no emulación DX7), 32 voces, velocidad, sustain y pitch bend ±2 semitonos. Teclado USB MIDI y de computadora. Interfaz móvil con dropdown de sonidos y master y hasta siete pistas de audio. CC7 fijo para volumen y aprendizaje MIDI para cambio de preset. Pads con notas fijas 30–45 en canal MIDI 10 (master, siete pistas y ocho espacios de efectos), independientes del identificador del dispositivo seleccionado. Preferencias y asignaciones en localStorage.

## Grabación
- Arranca con master y una pista de audio; + Agregar pista añade hasta siete pistas de audio. Cada pista puede mezclar sonidos mediante overdub. Nueva sesión vuelve a una pista y libera sus buffers.
- Guía fija de 4 compases de 4 tiempos: 16 beats según BPM (8 s a 120 BPM). No depende de la primera toma. Los ciclos se cuantizan independientemente a 1, 2, 4, 8… compases. La pantalla muestra segundos y avance en compases durante la toma.
- Primera toma (sin ningún loop grabado): cuenta previa de 2 compases de 4 tiempos al BPM seleccionado (4 s a 120 BPM), con clic automático, números grandes por pulso, compás 1/2 o 2/2 y aviso ¡REC! al comenzar. No se captura audio durante la cuenta. Pulsar otra vez cancela; pausar, borrar o reiniciar también cancela. Después se restaura el estado elegido del metrónomo. El BPM queda bloqueado durante la cuenta; Cerrar detiene la captura inmediatamente (mínimo 0,25 s), y completa el ciclo con silencio virtual.
- Tomas posteriores y overdubs: si el ciclo está avanzado, quedan en ESPERA hasta el próximo inicio del ciclo completo, definido por la pista más larga. Pulsar otra vez mientras espera cancela. Pausar o borrar también cancela la espera.
- Una pista vacía graba continuamente hacia el final, sin volver a escribir el comienzo ni cerrarse al pasar la duración anterior. Cerrar detiene al instante; el ciclo se redondea hacia arriba a una potencia de dos compases. Máximo 60 s de audio original por pista.
- Transporte compartido por todas las pistas y el metrónomo. Cada posición se deriva de ese transporte: no hay contadores de reproducción independientes. El ciclo global es el mayor ciclo finalizado; grabar una toma más larga sigue anexando audio, sin sobrescribirlo. Al cerrarla, el origen de la vuelta mayor se alinea con su inicio, conservando la fase de las pistas cortas.
- Flechas ‹ / ›: ciclos de 1 a 128 compases (potencias de dos). Recorte reversible desde el comienzo: conserva el audio oculto. Ampliar revela audio conservado y agrega silencio virtual después, sin duplicar ni estirar audio ni asignar otro buffer.
- Un cambio de duración entra en el próximo inicio compartido del ciclo anterior y nuevo; se muestra 8 → 16 mientras espera. Volver a la duración actual cancela el cambio. Pausar congela la espera. No se cambia duración durante grabación/espera, ni se inicia grabación durante un cambio pendiente.
- Overdub modifica solamente la ventana elegida y conserva el audio oculto posterior. Mantiene el límite de memoria actual: ciclos mayores a 60 s de audio original deben acortarse antes de overdub. La UI deshabilita Overdub en ese caso; MIDI puede seguir encendiendo/apagando la pista.
- BPM 40–240: cambiarlo acelera/frena el audio y cambia su tono. La guía también sigue ese BPM. Bloqueado durante toma o espera; no afecta las notas en vivo.
- Metrónomo Clic: un pulso por beat calculado por muestras. No entra en la grabación. Pausar/Silenciar todo lo apaga.
- Pads en modo PAD, canal MIDI 10: nota 30 selecciona master; pulsar otra vez pausa/reanuda el transporte (no graba ni borra). Notas 31–37 seleccionan pistas 2–8; solo se crea la pista solicitada. Notas 38–45 seleccionan espacios 1–8 de la cadena actual, incluso vacíos. No disparan audio ni grabación. Se priorizan sobre aprendizaje MIDI. Las notas del teclado en canal 1 quedan libres.
- Selección de pista: tocar un pad diferente primero selecciona (y crea solo esa pista si falta), sin iniciar audio, cambiar reproducción ni armar borrado. Se debe soltar antes de la siguiente pulsación. También se selecciona tocando el círculo, agregando una pista o usando sus botones de pantalla. El master empieza seleccionado. Tocar un pad de pista mientras se edita un efecto vuelve a instrumentos, sin disparar la pista.
- Botón MIDI de pista ya seleccionada: vacía graba/arma, en espera cancela, grabando cierra, con audio alterna reproducción/silencio. Mantener 1 s borra. Requiere botón momentáneo (Note On con velocity positiva al pulsar; Note Off o Note On con velocity 0 al soltar). El overdub se inicia desde la pantalla.
- Silenciar una pista conserva su fase. Pausar congela el reloj y cierra la toma activa inmediatamente. Esc o perder foco también pausa.
- Persistencia automática local en IndexedDB, al cerrar cada toma y modificar la sesión. Esperar «Guardado local» antes de recargar. Toma/overdub en curso aún no respaldados. Sin exportación, undo de overdub ni estiramiento de tiempo. La duración del ciclo y los efectos admiten edición reversible.

## Motor
AudioWorklet procesa captura y reproducción en un único reloj de muestras. Captura solo el bus seco de la fuente de audio, antes del control de picos/volumen; el audio de los loops nunca realimenta la grabación. El sintetizador sigue conectado al monitor en vivo. Unos 11,5 MB por pista utilizada a 48 kHz / 60 s, asignados al prepararla y liberados al borrarla; agregar una pista vacía no reserva audio. No se mezclan pistas vacías, y las completamente silenciadas omiten interpolación de audio conservando su reloj. No se ha medido una mejora de latencia en el teléfono. Saturación del acumulador acotada y curva de protección de picos sin look-ahead a la salida; las entradas/salidas del loop tienen microfundidos para evitar clics.

JavaScript ES modules, Tone.js 15.1.22 para mezcla/efectos y Web Audio; smplr 1.1.0 se importa dinámicamente desde CDN para los instrumentos muestreados. Node sirve archivos; síntesis y grabación suceden en el celular/PC. HTTPS confiable requerido para AudioWorklet y MIDI. No se usa micrófono.

## Pruebas antes de publicar
Una sola suite de producto: `npm test`, con Playwright/Chromium, MIDI virtual y
Web Audio, Tone, smplr, AudioWorklet e IndexedDB reales. Incluye regresión prolongada
de 1000 vueltas. Preparación, comandos rápidos, reportes, cobertura y límites:
[TESTING.md](TESTING.md). Lab ejecuta la suite como servicio regression y conserva sus reportes; Pages
espera que apruebe antes de publicar.

## Despliegue
GitHub Pages para las versiones publicadas: ver [PAGES.md](PAGES.md). El workflow publica tras una Release estable o una ejecución manual, siempre después de pasar las pruebas.

Lab project_up verifica el arranque en Playwright, construye el runtime Node 22 Alpine
y lanza la regresión completa como servicio separado y arranca Compose en 127.0.0.1:18865, publicado en /looper/. Cambios guardados en Git; producción utiliza la imagen construida, no un bind mount. Endpoint /health. HTTPS: ver HTTPS.md.

## Diagnóstico de latencia
AudioContext solicita interactive. Las notas se disparan inmediatamente con nodos nativos de Web Audio: DSP/reproducción en el hilo de audio, eventos MIDI y creación de voces en el principal. No hay espera entre notas ni descarga por pulsación. El looper usa AudioWorklet.
Se reemplazó DynamicsCompressorNode (look-ahead de aproximadamente 6 ms) por una curva estática sin oversampling, transparente hasta amplitud 0,8 y con saturación suave encima. No elimina los buffers de salida del navegador/Android.
Ajustes → Rendimiento permite comparar el instrumento con un clic directo por MIDI y con un botón táctil (pointerdown, no espera a soltar). El clic va solo al monitor y no se graba. El modo de prueba no persiste al recargar.
Mide las últimas 128 entregas MIDI y preparaciones de notas (mediana/p95/máximo), bloqueos del hilo principal y latencias base/salida informadas. Estadísticas solo se ordenan/renderizan al pedir Actualizar. No mide el tiempo físico del USB, ataque acústico, tecla→parlante ni garantiza que Android informe toda la demora.

## Respuesta de intensidad
Notas MIDI positivas usan la curva 36 + 91 × ((v−1)/126)^0,65, aplicada una sola vez por motor. Levanta los toques suaves sin aumentar el máximo 127; velocity 0 sigue siendo Note Off. También cambia la selección de capas de samples en instrumentos que las tienen. Afecta notas nuevas y su captura, no modifica loops ya grabados. No agrega buffers ni espera. El clic de diagnóstico conserva su intensidad fija.

## Pots y volumen del MiniControl
Canal MIDI 1, modo CC absoluto: CC13 elige la categoría y CC14 el instrumento dentro
de la categoría. Al seleccionar un efecto, CC15 cambia el tipo y CC13/14 sus parámetros. CC7 controla el volumen master (instrumento, loops y clic).
Los roles mezclan todos los sonidos disponibles: base rítmica, bajos,
acompañamiento, fondos, melodías y acentos/texturas. Un sonido puede figurar
en varios roles sin duplicar sus muestras. Los bancos se distinguen en el nombre, no definen los roles.

Cada categoría recuerda su último instrumento. Las seis categorías conservan su orden y el catálogo de cada una es una única lista. Se restauran selecciones antiguas de las páginas. El selector visual responde al pot
inmediatamente; la carga se solicita tras 250 ms sin cambiar la selección.
La app interpreta los CC absolutos como navegación relativa: cada subida avanza una opción y cada bajada retrocede una. El primer mensaje de cada perilla/dispositivo establece la referencia. Repetir 0 sigue retrocediendo y repetir 127 sigue avanzando; otros valores repetidos se ignoran. Cada lista se detiene en sus extremos. Las referencias se reinician al actualizar o reconectar dispositivos. CC7 conserva el volumen absoluto.
Solo se carga el instrumento elegido, conservando los loops.
Los controles fijos tienen prioridad sobre el aprendizaje y las asignaciones
antiguas; las asignaciones antiguas de volumen se ignoran. El slider de pantalla
y CC7 siguen sincronizados. Los controles anterior/siguiente aprendidos recorren
la categoría actual. Perder foco, desconectar o silenciar cancela un cambio pendiente.

Las cajas DrumMachine/DrumAbuse mapean los grupos publicados a notas MIDI, conservando bombo 36/60, snare 38/62 y hi-hat cuando esos grupos existen. El resto se distribuye entre 36–59 y 84–127; 60–83 refleja 36–59. Tabla usa 60–88. Los pads reservados 30–45 controlan master, pistas y efectos en canal 10.

## Cadenas y persistencia local
Master (pad 1) y siete pistas (pads 2–8). Cada uno dispone de ocho espacios de efectos vacíos por defecto. Pads 9–16 seleccionan el espacio; CC15 elige tipo, CC13/14 ajustan parámetros de a un punto. Seleccionar una pista vuelve al modo instrumentos. La UI permite reordenar con Antes/Después; elegir Vacío elimina ese efecto.

Efectos implementados con componentes Tone.js sobre el mismo AudioContext de smplr, conservando los algoritmos y parámetros originales: volumen/pan, paso bajo, paso alto, EQ graves/agudos, delay, reverb, tremolo y distorsión. Volumen es opcional, 70% equivale a ganancia 1 y 100% a 100/70. CC7 conserva el control de salida general.
Cada pista del worklet tiene salida propia, después su cadena, después master y finalmente protección de picos/volumen de salida. El monitor en vivo pasa por la cadena de la pista seleccionada; con master seleccionado va directo a la cadena master. La captura es seca: nunca incluye retornos de pistas ni efectos. Reordenar/cambiar efectos no altera el audio grabado; elimina las colas internas de los efectos reemplazados.
Instancias vacías sin DSP de efectos; parámetros reutilizan nodos y se suavizan donde corresponde. Los cambios de cadena se aplican tras 100 ms para reducir reconstrucciones al girar. Muchas reverbs simultáneas pueden exigir más CPU en móviles.

Guardado: IndexedDB en Worker separado; localStorage solo preferencias heredadas. Audio Float32 por pista, duración original y recorte reversible, mute, BPM de referencia/actual, posición compartida, selección, instrumento y cadenas. Un cierre dispara una copia por bloques de hasta 4096 muestras por quantum; se cancela si el audio cambia durante la copia. El Worker escribe audio y metadatos en una transacción: cuota/error conserva el guardado previo. Cambios de ajustes no reescriben audio.
Al abrir se recuperan ajustes y se muestra la sesión; Activar habilita audio y recupera buffers pausados. Se remuestrea al recuperar si el dispositivo usa otra frecuencia. Nueva sesión reemplaza explícitamente el guardado al completarse; los efectos vuelven a vacíos.
Esperar Guardado local antes de recargar. No se depende de beforeunload para escribir; se avisa si quedan cambios pendientes. Un cierre durante grabación o guardado puede perder lo posterior al último guardado completo. El navegador puede borrar almacenamiento por cuota/limpieza; no es backup externo. Cada origen mantiene su sesión (HTTP Lab, HTTPS Lab y Pages son independientes). Los samples originales siguen requiriendo Internet si no están en caché.
Tarjetas compactas con círculo basado en el reloj compartido, guía de cuatro compases y dos compases de cuenta previa. Acortar/alargar en ⋯.

## Validación de esta versión
Pruebas de ruteo independiente, límite de siete pistas, edición MIDI/contextual y reordenamiento, audio de efectos reales y recuperación frente a cambios durante el guardado, transacciones/quota con conservación de datos, restauración con cambio de frecuencia y conservación de audio oculto. Verificación en navegador del guardado real de parámetros y orden tras recarga. La escucha y recuperación de audio con teclado físico se validan en Android/Chrome por HTTPS.

## Refactor Tone.js
Arquitectura, contrato de fuentes, límites y pruebas de equivalencia de audio: [AUDIO.md](AUDIO.md). Tone se descarga al activar audio; si falla, se puede reintentar. smplr, el sintetizador FM y el reloj del AudioWorklet conservan su comportamiento. No se añadió captura de micrófono ni cambió el formato de las sesiones.
