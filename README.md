# Looper 0.2

Versión 0.2 desplegada con autorización del usuario. Incluye cinco pistas de grabación y overdub.

## Instrumento
12 presets FM originales de dos operadores (no emulación DX7), 32 voces, velocidad, sustain y pitch bend ±2 semitonos. Teclado USB MIDI, táctil y de computadora. Aprendizaje MIDI de volumen, cambio de preset y encendido/apagado de cada pista. Preferencias y asignaciones en localStorage.

## Grabación
- Cinco pistas de audio mono. Cada una puede mezclar sonidos distintos mediante overdub.
- La primera grabación define una duración libre entre 0,25 y 60 segundos; pulsar Cerrar comienza el loop. Al llegar a 60 segundos se cierra automáticamente.
- Las otras pistas comparten duración y posición. Una pista vacía graba exactamente una vuelta desde la posición actual y después reproduce. También puede cerrarse antes; los sectores no grabados quedan en silencio.
- Overdub suma audio hasta volver a pulsar Cerrar. No hay editor, cuantización, undo ni estiramiento de tiempo.
- Apagar silencia la reproducción con una rampa corta; el reloj sigue. Encender retoma en la posición actual. La entrada en vivo sigue audible.
- Una captura activa a la vez. Cambiar la pista que graba cierra la anterior.
- Pausar detiene el reloj y cierra la captura activa; Reanudar continúa desde esa posición.
- Esc, Silenciar todas las notas y pérdida de foco pausan los loops y detienen las notas vivas. Mantener la app en primer plano durante la interpretación.
- Borrar una pista conserva las otras. Borrar la última deja duración libre nuevamente. Nueva sesión borra todo previa confirmación.
- Audio temporal en memoria: se pierde al recargar, cerrar o si el sistema descarta la pestaña. No hay persistencia ni exportación todavía. beforeunload pide aviso cuando el navegador lo permite.

## Motor
AudioWorklet procesa captura y reproducción en un único reloj de muestras. Captura solo el bus del sintetizador, antes de compresión/volumen; el audio de los loops nunca realimenta la grabación. El sintetizador sigue conectado al monitor en vivo. Hasta unos 58 MB de buffers mono a 48 kHz / 60 s / 5 pistas, reservados por pista al usarse. Saturación del acumulador acotada y compresor compartido a la salida; las entradas/salidas del loop tienen microfundidos para evitar clics.

JavaScript ES modules y Web Audio sin dependencias de terceros. Node sirve archivos; síntesis y grabación suceden en el celular/PC. HTTPS confiable requerido para AudioWorklet y MIDI. No se usa micrófono.

## Pruebas antes de publicar
`node --test`: incluye regresiones de MIDI, síntesis, servidor y reloj de muestras del looper.
`python3 tests/validate_static.py`: comprobaciones offline de módulos publicados y controles.

Las 17 pruebas Node pasaron durante la construcción de la imagen desplegada. El sandbox de workspace sigue sin Node; la imagen Docker sí lo incluye. Las pruebas automáticas no reemplazan la prueba real de AudioWorklet/MIDI en Android + Chrome por HTTPS.

## Despliegue
Lab project_up construye Node 22 Alpine, ejecuta la suite y arranca Compose en 127.0.0.1:18865, publicado en /looper/. Cambios guardados en Git; producción utiliza la imagen anterior y no un bind mount. Endpoint /health. HTTPS: ver HTTPS.md.
