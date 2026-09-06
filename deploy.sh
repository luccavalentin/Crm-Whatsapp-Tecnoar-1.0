#!/usr/bin/env bash
# Sobe o Tecnoar Atendimento na VPS.
# Uso: ./deploy.sh [usuario@host]
set -euo pipefail

TARGET="${1:-root@85.209.93.22}"
REMOTE_DIR="/opt/tecnoar-crm"
KEY="$(cd "$(dirname "$0")" && pwd)/deploy_key"
SSH_OPTS=(-i "$KEY" -o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new)

echo "→ Enviando arquivos para $TARGET:$REMOTE_DIR"
ssh "${SSH_OPTS[@]}" "$TARGET" "mkdir -p $REMOTE_DIR"

tar --exclude=node_modules --exclude=dist --exclude=.git --exclude=.claude \
    --exclude='*.log' -czf - \
    src public index.html package.json package-lock.json vite.config.ts \
    tsconfig.json Dockerfile Caddyfile docker-compose.yml .dockerignore sw.template.js \
  | ssh "${SSH_OPTS[@]}" "$TARGET" "tar -xzf - -C $REMOTE_DIR"

echo "→ Enviando variáveis de ambiente"
scp "${SSH_OPTS[@]}" .env.production "$TARGET:$REMOTE_DIR/.env"

echo "→ Construindo e subindo o container"
ssh "${SSH_OPTS[@]}" "$TARGET" "cd $REMOTE_DIR && docker compose up -d --build"

echo "→ Status"
ssh "${SSH_OPTS[@]}" "$TARGET" "cd $REMOTE_DIR && docker compose ps"

echo
echo "Pronto. Acesse: https://\$(ssh "${SSH_OPTS[@]}" $TARGET 'grep SITE_DOMAIN $REMOTE_DIR/.env | cut -d= -f2')"
