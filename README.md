# Looper 0.1
Sintetizador web de presets, administrado por Lab. JavaScript ES modules sin dependencias de terceros, Web Audio nativo y Web MIDI. Audio procesado localmente en el navegador; Node solo sirve archivos.

## Primera versión
12 presets FM originales de dos operadores (no emulación DX7), 32 voces como máximo, velocidad, pedal sustain, pitch bend ±2 semitonos, teclado virtual/táctil/computadora, octavas y aprendizaje MIDI de volumen y cambio de preset. Preferencias en localStorage. Una entrada MIDI activa a la vez, con reconexión y silenciamiento de seguridad al perder foco o desconectar. Esc silencia las notas. No requiere APIs externas.

## Pendiente
5 pistas de audio, overdub y mute que conserve la posición del ciclo. No hay grabación implementada en esta versión. Generación/edición de sonidos fuera del alcance inicial.

## Despliegue
Lab project_up construye una imagen Node 22 Alpine, ejecuta node --test y sirve en 8080. Compose publica 127.0.0.1:18865 y nginx.yaml publica /looper/. Contenedor sin privilegios, filesystem read-only, sin secretos.
Endpoint /health. Recursos con rutas relativas. Configuración HTTPS: ver HTTPS.md. No se debe editar nginx global con herramientas del workspace.
MIDI necesita HTTPS confiable o localhost y permiso del navegador. Audio requiere interacción del usuario. Firefox es objetivo; prueba física con MIDIPLUS pendiente.
