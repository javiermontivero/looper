#!/usr/bin/env bash
# Run on the Lab server as administrator. Never copy the CA private key to clients.
set -euo pipefail
HOST="${1:-lab.home.arpa}"
UPSTREAM_PORT="${2:-80}"
[[ "$EUID" -eq 0 ]] || { echo "Run: sudo bash $0 [hostname] [existing nginx HTTP port]"; exit 1; }
[[ "$HOST" =~ ^[a-zA-Z0-9]([a-zA-Z0-9.-]*[a-zA-Z0-9])?$ && "$HOST" == *.* && "${#HOST}" -le 253 ]] || { echo "Invalid DNS hostname"; exit 1; }
[[ "$UPSTREAM_PORT" =~ ^[0-9]{1,5}$ && "$UPSTREAM_PORT" -ge 1 && "$UPSTREAM_PORT" -le 65535 && "$UPSTREAM_PORT" -ne 443 ]] || { echo "Invalid HTTP upstream port"; exit 1; }
for cmd in nginx openssl systemctl mktemp; do command -v "$cmd" >/dev/null || { echo "Missing prerequisite: $cmd"; exit 1; }; done
nginx -t
CONF=/etc/nginx/conf.d/lab-local-https.conf
TLS=/etc/lab/local-tls
[[ -d /etc/nginx/conf.d ]] || { echo "Expected /etc/nginx/conf.d; adapt the script to this nginx installation."; exit 1; }
[[ ! -e "$CONF" ]] || { echo "$CONF already exists. Review it instead of overwriting."; exit 1; }
# Require the conventional conf.d include, and abort if this hostname already has TLS.
DUMP="$(nginx -T 2>&1)"
grep -Eq 'include[[:space:]]+/etc/nginx/conf.d/\*\.conf;' <<< "$DUMP" || { echo "nginx does not include /etc/nginx/conf.d/*.conf"; exit 1; }
if grep -Eq 'listen[[:space:]]+([^;[:space:]]*:)?443([[:space:];])' <<< "$DUMP"; then
 echo "There is already a listener on port 443. No configuration changed."
 echo "Ask the administrator to add a TLS virtual host for $HOST using the existing HTTPS setup."
 exit 1
fi
umask 077
install -d -m 700 "$TLS"
if [[ ! -e "$TLS/root-ca.key" && ! -e "$TLS/root-ca.crt" ]]; then
 openssl req -x509 -newkey rsa:3072 -sha256 -nodes -days 3650 \
  -keyout "$TLS/root-ca.key" -out "$TLS/root-ca.crt" \
  -subj "/CN=Lab Local Root CA" \
  -addext "basicConstraints=critical,CA:TRUE,pathlen:0" \
  -addext "keyUsage=critical,keyCertSign,cRLSign"
elif [[ ! -f "$TLS/root-ca.key" || ! -f "$TLS/root-ca.crt" ]]; then
 echo "Incomplete existing CA in $TLS. Refusing to overwrite."; exit 1
fi
TMP="$(mktemp -d)"
ADDED=0
DONE=0
cleanup(){
 rm -f "$TMP/request.csr" "$TMP/extensions.cnf" "$TMP/nginx.conf"
 rmdir "$TMP" 2>/dev/null || true
 if [[ "$ADDED" -eq 1 && "$DONE" -eq 0 ]]; then rm -f "$CONF"; fi
}
trap cleanup EXIT
cat > "$TMP/extensions.cnf" <<EOF
basicConstraints=critical,CA:FALSE
keyUsage=critical,digitalSignature,keyEncipherment
extendedKeyUsage=serverAuth
subjectAltName=DNS:$HOST
EOF
openssl req -new -newkey rsa:2048 -nodes -keyout "$TLS/server.key" -out "$TMP/request.csr" -subj "/CN=$HOST"
openssl x509 -req -in "$TMP/request.csr" -CA "$TLS/root-ca.crt" -CAkey "$TLS/root-ca.key" \
 -set_serial "0x$(openssl rand -hex 16)" -out "$TLS/server.crt" -days 365 -sha256 -extfile "$TMP/extensions.cnf"
openssl verify -CAfile "$TLS/root-ca.crt" -verify_hostname "$HOST" "$TLS/server.crt"
cat > "$TMP/nginx.conf" <<EOF
# Lab local HTTPS: proxies to the existing HTTP nginx, including all /project/ routes.
server {
    listen 443 ssl;
    server_name $HOST;
    ssl_certificate $TLS/server.crt;
    ssl_certificate_key $TLS/server.key;
    ssl_protocols TLSv1.2 TLSv1.3;
    client_max_body_size 32m;
    location / {
        proxy_pass http://127.0.0.1:$UPSTREAM_PORT;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
EOF
install -m 644 "$TMP/nginx.conf" "$CONF"
ADDED=1
nginx -t
systemctl reload nginx
DONE=1
# Only the public root certificate is exported.
install -m 644 "$TLS/root-ca.crt" /tmp/lab-local-root-ca.crt
echo
echo "HTTPS ready: https://$HOST/looper/"
echo "Import /tmp/lab-local-root-ca.crt into Firefox's Authorities certificate store on your computer."
echo "Trust this CA for identifying websites. Verify the fingerprint below before importing."
openssl x509 -in "$TLS/root-ca.crt" -noout -fingerprint -sha256
echo "Never distribute $TLS/root-ca.key. Keep it only on the server."
echo "The server certificate expires in 365 days. Renew it before expiry."
