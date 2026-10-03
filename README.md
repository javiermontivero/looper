# Looper 0.2

Versión 0.2 desplegada con autorización del usuario. Incluye pistas dinámicas de grabación y overdub.

## Instrumento
Siete instrumentos smplr 1.1.0: piano acústico, Wurlitzer, bajo acústico, guitarra nylon, cuerdas, marimba y batería acústica Hydrogen. Se descarga solo el instrumento elegido, con indicador de carga; cambiarlo libera el anterior y conserva los loops de audio. Requiere Internet para descargar la biblioteca y las muestras desde jsDelivr, smpldsnds.github.io y gleitz.github.io. Créditos y licencias en public/sounds.html. Las notas tocadas durante la carga se descartan. Hasta 24 notas sostenidas de samples; pitch bend aplicado a notas nuevas (no a notas ya sonando).

Batería: 16 muestras acústicas con velocidad, reproducción completa al soltar y exclusión de hi-hat abierto/cerrado. Mapeo GM MIDI 35–59 (las notas sin pieza quedan mudas), duplicado en 60–83 para teclados pequeños. Do/bombo, Re/redoblante, Fa♯/hi-hat cerrado, La♯/abierto. Sin pitch bend ni sustain en batería. Los controles de pista asignados consumen la nota como antes.

Además, 12 presets FM originales de dos operadores (no emulación DX7), 32 voces, velocidad, sustain y pitch bend ±2 semitonos. Teclado USB MIDI y de computadora. Interfaz móvil con dropdown de sonidos y entre 1 y 16 pistas. Aprendizaje MIDI de volumen, cambio de preset y encendido/apagado de cada pista. Preferencias y asignaciones en localStorage.

## Grabación
- Arranca con una pista; + Agregar pista añade hasta 16. Cada pista puede mezclar sonidos mediante overdub. Nueva sesión vuelve a una pista y libera sus buffers.
- Guía fija de 8 compases de 4 tiempos: 32 beats según BPM (16 s a 120 BPM). No depende de la primera toma, no rellena ni cuantiza su duración. La pantalla muestra segundos y avance en compases durante la toma.
- Primera toma: empieza al instante; Cerrar termina inmediatamente y reproduce su duración real (mínimo 0,25 s).
- Tomas posteriores y overdubs: si el ciclo está avanzado, quedan en ESPERA hasta el próximo inicio del ciclo completo, definido por la pista más larga. Pulsar otra vez mientras espera cancela. Pausar o borrar también cancela la espera.
- Una pista vacía graba continuamente hacia el final, sin volver a escribir el comienzo ni cerrarse al pasar la duración anterior. Cerrar detiene al instante, sin relleno. Máximo 60 s de audio original por pista.
- El ciclo global toma la longitud de la pista más larga, incluyendo una toma nueva mientras crece. Al borrar la más larga se recalcula. Las pistas cortas repiten su propio audio continuamente. No se fuerza que sus duraciones sean múltiplos ni se reajusta su fase al crecer otra.
- Se retiró ×2: ahora se extiende grabando una toma más larga.
- Overdub mezcla sobre el audio existente conservando su duración, hasta Cerrar. Solo una toma activa; cerrar antes de armar otra pista.
- BPM 40–240: cambiarlo acelera/frena el audio y cambia su tono. La guía también sigue ese BPM. Bloqueado durante toma o espera; no afecta las notas en vivo.
- Metrónomo Clic: un pulso por beat calculado por muestras. No entra en la grabación. Pausar/Silenciar todo lo apaga.
- Botón MIDI asignado: vacía graba/arma, en espera cancela, grabando cierra, con audio alterna reproducción/silencio. Mantener 1 s borra. Requiere botón momentáneo (CC positivo al pulsar, 0 al soltar, o Note On/Off). El overdub se inicia desde la pantalla.
- Silenciar una pista conserva su fase. Pausar congela el reloj y cierra la toma activa inmediatamente. Esc o perder foco también pausa.
- Audio en memoria: se pierde al recargar/cerrar. Sin persistencia, exportación, edición, undo ni estiramiento de tiempo.

## Motor
AudioWorklet procesa captura y reproducción en un único reloj de muestras. Captura solo el bus del sintetizador, antes de compresión/volumen; el audio de los loops nunca realimenta la grabación. El sintetizador sigue conectado al monitor en vivo. Unos 11,5 MB por pista utilizada a 48 kHz / 60 s, asignados al prepararla y liberados al borrarla; agregar una pista vacía no reserva audio. No se mezclan pistas vacías, y las completamente silenciadas omiten interpolación de audio conservando su reloj. No se ha medido una mejora de latencia en el teléfono. Saturación del acumulador acotada y compresor compartido a la salida; las entradas/salidas del loop tienen microfundidos para evitar clics.

JavaScript ES modules y Web Audio; smplr 1.1.0 se importa dinámicamente desde CDN para los instrumentos muestreados. Node sirve archivos; síntesis y grabación suceden en el celular/PC. HTTPS confiable requerido para AudioWorklet y MIDI. No se usa micrófono.

## Pruebas antes de publicar
`node --test`: incluye regresiones de MIDI, síntesis, servidor y reloj de muestras del looper.
`python3 tests/validate_static.py`: comprobaciones offline de módulos publicados y controles.

La construcción ejecuta las pruebas Node antes de desplegar, incluyendo carga y cambio de instrumentos, sustain, límites de voces y recuperación de errores. El sandbox de workspace sigue sin Node; la imagen Docker sí lo incluye. Las pruebas automáticas no reemplazan la prueba real de AudioWorklet/MIDI en Android + Chrome por HTTPS.

## Despliegue
Lab project_up construye Node 22 Alpine, ejecuta la suite y arranca Compose en 127.0.0.1:18865, publicado en /looper/. Cambios guardados en Git; producción utiliza la imagen construida, no un bind mount. Endpoint /health. HTTPS: ver HTTPS.md.
