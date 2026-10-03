# HTTPS local para MIDI
El administrador debe ejecutar el script en el servidor. El MCP del Lab administra proyectos, no el nginx global ni la confianza del navegador.

1. Descargar y revisar: `curl -f http://lab.home.arpa/looper/setup-https.sh -o setup-https.sh`.
2. Ejecutar: `sudo bash setup-https.sh lab.home.arpa`. Requiere nginx, OpenSSL, systemd, nginx HTTP en puerto 80 y el include convencional de conf.d. No instala paquetes ni reemplaza configuraciones existentes. Si hay otro listener nginx en 443, se detiene para integrarlo manualmente. El puerto 443 debe estar disponible y accesible desde la computadora.
3. Copiar SOLO el certificado público `/tmp/lab-local-root-ca.crt` a la computadora, por ejemplo con SCP. Comparar su huella SHA-256 con la mostrada por el script.
4. Firefox: Ajustes → Privacidad y seguridad → Certificados → Ver certificados → Autoridades → Importar. Importar el certificado público y confiar en esa autoridad para identificar sitios web.
5. Abrir https://lab.home.arpa/looper/ y activar audio + MIDI. La resolución DNS de lab.home.arpa debe apuntar al servidor.

La clave privada de la autoridad permanece en /etc/lab/local-tls/root-ca.key con permisos restringidos. Nunca copiarla al navegador ni incluirla en Git. Confiar en esta autoridad permite que los certificados que firme sean aceptados en ese navegador: mantener la clave protegida. Certificado de servidor válido por 365 días; CA válida por 10 años. La renovación no está automatizada en esta versión. No se configura redirección HTTP ni HSTS para evitar afectar otras apps.

El script comprueba nginx antes de recargarlo y retira su nuevo archivo si falla. No cambia el nginx HTTP existente. Revisar el script antes de ejecutarlo con sudo.

## Celular
Android + Chrome soporta Web MIDI; Firefox para Android no. Para usar la CA local en Android, importar el certificado público como certificado de autoridad desde Seguridad / Cifrado y credenciales (el nombre cambia según el fabricante). Es una instalación de confianza que debe realizar el dueño del teléfono. El navegador debe abrir HTTPS sin advertencias. El teclado USB requiere un adaptador/cable con datos y soporte USB host del teléfono; puede requerir un hub alimentado.
Safari en iPhone no ofrece Web MIDI: el teclado táctil funciona, pero MIDI USB requeriría otra solución. Esta primera versión no incluye un puente ni una app nativa.
