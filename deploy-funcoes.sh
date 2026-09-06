#!/usr/bin/env bash
# Publica as funcoes de borda do CRM Tecnoar.
#
# Existe porque o pacote da ai-reply (base de conhecimento + prompt + provedores)
# passou do tamanho que a integracao consegue enviar em uma chamada. Aqui o
# codigo vai direto do disco, sem transcricao no meio — o que tambem elimina o
# risco de o que roda em producao divergir do que esta no repositorio.
#
# Uso:
#   export SUPABASE_ACCESS_TOKEN="seu-token"      # supabase.com/dashboard/account/tokens
#   bash deploy-funcoes.sh                        # publica todas
#   bash deploy-funcoes.sh ai-reply ai-simulate   # publica so as indicadas
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

# Sem argumento, publica tudo que existe em supabase/functions.
if [ "$#" -gt 0 ]; then
  FUNCOES=("$@")
else
  FUNCOES=()
  for dir in supabase/functions/*/; do
    nome="$(basename "$dir")"
    # _shared nao e funcao: e codigo compartilhado, vai junto no pacote.
    [ "$nome" = "_shared" ] && continue
    FUNCOES+=("$nome")
  done
fi

echo "Projeto: $PROJETO"
echo "Funcoes: ${FUNCOES[*]}"
echo

for funcao in "${FUNCOES[@]}"; do
  echo "-> $funcao"
  # Os webhooks e a ai-reply sao chamados por servico externo, sem JWT de
  # usuario: a autenticacao deles e por token proprio dentro da funcao.
  case "$funcao" in
    whatsapp-webhook|ai-reply)
      npx --yes supabase@latest functions deploy "$funcao" \
        --project-ref "$PROJETO" --no-verify-jwt
      ;;
    *)
      npx --yes supabase@latest functions deploy "$funcao" \
        --project-ref "$PROJETO"
      ;;
  esac
done

echo
echo "Pronto."
