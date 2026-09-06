-- Remove os dois índices que a migration do teto de gasto criou sem conferir
-- o que já existia.
--
--   ai_runs_empresa_recente_idx  == ai_runs_company_idx       (company_id, created_at desc)
--   ai_runs_conversa_recente_idx == ai_runs_conversation_idx  (conversation_id, created_at desc)
--
-- Índice duplicado não é só desperdício de disco: toda inserção em ai_runs
-- passou a manter duas árvores idênticas em vez de uma, e ai_runs é a tabela
-- que mais cresce no sistema — uma linha por resposta da IA.
--
-- Ficam os originais, cujos nomes já eram usados pelo resto do schema.

drop index if exists public.ai_runs_empresa_recente_idx;
drop index if exists public.ai_runs_conversa_recente_idx;
