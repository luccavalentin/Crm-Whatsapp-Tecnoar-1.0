#!/usr/bin/env bash
# Sobe o CRM WhatsApp Tecnoar na VPS, em container próprio.
#
# ESTE SCRIPT TOCA EM UM ÚNICO LUGAR: /opt/crm-whats-tecnoar.
#
# A mesma VPS hospeda outros sistemas em produção — tecnoar-crm,
# checklist-tecnoar e a stack da Evolution API, que é quem mantém a conexão do
# WhatsApp. A versão anterior deste script também enviava e reiniciava a
# Evolution; um `docker compose up -d` ali recria os containers e derruba a
# sessão do WhatsApp no meio de um atendimento. Nunca mais.
#
# A rede "borda" é compartilhada com esses sistemas. Aqui ela é apenas
# verificada: se não existir, o deploy PARA em vez de criar — rede faltando
# significa que o Traefik não está no ar, e subir sem ele deixaria o site
# inacessível sem ninguém perceber.
#
# Uso: ./deploy.sh [usuario@host]
set -euo pipefail

ALVO="${1:-root@179.199.140.86}"
CHAVE="${CHAVE_SSH:-$HOME/.ssh/tecnoar_vps}"
APP="/opt/crm-whats-tecnoar"
RAIZ="$(cd "$(dirname "$0")" && pwd)"
SSH=(ssh -i "$CHAVE" -o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new "$ALVO")

cd "$RAIZ"
[ -f .env.production ] || { echo "!! .env.production não encontrado."; exit 1; }

DOMINIO="$(grep -E '^SITE_DOMAIN=' .env.production | cut -d= -f2-)"
[ -n "$DOMINIO" ] || { echo "!! SITE_DOMAIN vazio em .env.production."; exit 1; }

echo "==> Alvo: $ALVO"
echo "==> Pasta: $APP  (nenhuma outra é tocada)"
echo "==> Domínio: $DOMINIO"

echo "==> Conferindo o terreno"
"${SSH[@]}" "
  set -e
  docker network inspect borda >/dev/null 2>&1 || {
    echo '!! A rede borda não existe. O Traefik não está no ar — deploy abortado.'
    exit 1
  }
  # Nome já em uso por OUTRO projeto seria adoção de container alheio.
  dono=\$(docker inspect crm-whats-tecnoar \
    --format '{{index .Config.Labels \"com.docker.compose.project\"}}' 2>/dev/null || true)
  if [ -n \"\$dono\" ] && [ \"\$dono\" != 'crm-whats-tecnoar' ]; then
    echo \"!! O container crm-whats-tecnoar pertence ao projeto '\$dono'. Abortado.\"
    exit 1
  fi
  mkdir -p $APP
"

echo "==> Enviando código"
tar --exclude=node_modules --exclude=dist --exclude=.git \
    --exclude='*.log' -czf - \
    src public index.html package.json package-lock.json vite.config.ts \
    tsconfig.json Dockerfile Caddyfile docker-compose.yml .dockerignore sw.template.js \
  | "${SSH[@]}" "tar -xzf - -C $APP"

scp -i "$CHAVE" -q .env.production "$ALVO:$APP/.env"

echo "==> Construindo e subindo"
"${SSH[@]}" "
  set -e
  chmod 600 $APP/.env
  cd $APP
  docker compose up -d --build
  docker image prune -f >/dev/null
"

echo "==> Estado do servidor"
"${SSH[@]}" "docker ps --format 'table {{.Names}}\t{{.Status}}'"

echo
echo "==> Conferindo a resposta pública (o certificado pode levar ~30s na 1ª vez)"
for tentativa in 1 2 3 4 5 6; do
  codigo="$(curl -sS -o /dev/null -m 15 -w '%{http_code}' "https://$DOMINIO/" 2>/dev/null || echo 000)"
  echo "   tentativa $tentativa: HTTP $codigo"
  [ "$codigo" = "200" ] && { echo "==> No ar: https://$DOMINIO"; exit 0; }
  sleep 10
done

echo "!! O site ainda não respondeu 200. Veja: ssh $ALVO 'docker logs crm-whats-tecnoar --tail 50'"
exit 1
