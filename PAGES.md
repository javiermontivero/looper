# Publicación en GitHub Pages

Lab es el entorno de pruebas. GitHub Pages publica únicamente los archivos de
`public/`, con HTTPS, sin ejecutar Node, Docker ni nginx. El audio y MIDI se
procesan en el navegador; smplr y las muestras se descargan de los proveedores
actuales. Las rutas de módulos, estilos y AudioWorklet son relativas y funcionan
bajo `/looper/`.

URL esperada tras el primer despliegue:
https://javiermontivero.github.io/looper/

## Activación inicial

1. Subir el commit que contiene `.github/workflows/pages.yml`.
2. En GitHub, verificar que la rama predeterminada contiene ese archivo. La rama
   de trabajo actual es `feature/audio-looper`; si se utiliza otra rama
   predeterminada, integrar el cambio allí antes de continuar.
3. En Settings → Pages → Build and deployment → Source, elegir **GitHub Actions**.
4. En Actions → **Publish GitHub Pages** → Run workflow, seleccionar la rama con
   la versión aprobada y ejecutar.
5. Esperar a que `validate` y `deploy` terminen correctamente. La URL publicada
   aparece en el entorno `github-pages` y en Settings → Pages.

Si el repositorio es privado, Pages requiere un plan de GitHub que lo admita.
No es necesario agregar un token personal ni una clave SSH a Actions: el
workflow usa los permisos temporales de GitHub.

## Versiones siguientes

Probar en Lab y subir el código. Crear una Release en GitHub con un tag que
apunte al commit aprobado y pulsar **Publish release**. El workflow despliega
ese tag, no los cambios posteriores de la rama.

Los pushes comunes, los tags sin Release, los borradores y las prereleases no
publican el sitio. También se puede ejecutar manualmente desde Actions.

Si el entorno `github-pages` tiene restricciones de ramas/tags, autorizar la
rama utilizada para ejecuciones manuales y los tags de versiones (por ejemplo
`v*`). No eliminar otras protecciones del repositorio.

Antes de cada despliegue se ejecutan `node --test` con Node 22 y
`python3 tests/validate_static.py`. Si falla una comprobación, el job de
despliegue no se ejecuta y la publicación anterior permanece disponible.

## Comprobación desde el teléfono

Abrir el sitio por HTTPS, activar audio, conceder permiso MIDI, cargar un preset
y probar una nota. Grabar y cerrar una pista para comprobar AudioWorklet,
probar el metrónomo y el control MIDI asignado. Los permisos y las preferencias
del sitio del Lab no se transfieren al nuevo dominio. Los loops siguen siendo
temporales y se pierden al cerrar o recargar.

Pages no ejecuta `server.mjs`: no ofrece su endpoint `/health` ni sus cabeceras
HTTP personalizadas. Este despliegue no agrega funcionamiento sin conexión.
