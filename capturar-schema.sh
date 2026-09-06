#!/usr/bin/env bash
# Traz para o repositorio a estrutura que hoje so existe dentro do Supabase.
#
# Rode UMA VEZ, antes de escrever qualquer migration nova. O arquivo gerado e o
# retrato inicial do banco: tabelas, RLS, funcoes e indices como estao agora.
#
# Uso:
#   export SUPABASE_ACCESS_TOKEN="seu-token"   # supabase.com/dashboard/account/tokens
#   bash capturar-schema.sh
set -euo pipefail

PROJETO="lpexjkjjzwufebgoiqdu"

if [ -z "${SUPABASE_ACCESS_TOKEN:-}" ]; then
  echo "Falta o token de acesso."
  echo
  echo "  1. Gere em: https://supabase.com/dashboard/account/tokens"
  echo "  2. export SUPABASE_ACCESS_TOKEN=\"o-token\""
  echo "  3. rode este script de novo"
  exit 1
fi

echo "Projeto: $PROJETO"
echo "Lendo a estrutura atual..."
echo

npx --yes supabase@latest link --project-ref "$PROJETO"
npx --yes supabase@latest db pull retrato_inicial

echo
echo "Pronto. Agora renomeie o arquivo gerado em supabase/migrations/ para que"
echo "ele venha ANTES das migrations escritas a mao. Por exemplo:"
echo
echo "  mv supabase/migrations/*_retrato_inicial.sql \\"
echo "     supabase/migrations/20260101000000_retrato_inicial.sql"
echo
echo "Motivo: o Supabase aplica os arquivos em ordem alfabetica, e a estrutura"
echo "precisa existir antes de as migrations seguintes alterarem ela."
