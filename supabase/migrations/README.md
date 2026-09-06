# Migrations

Aqui mora a estrutura do banco: tabelas, políticas de RLS, funções e índices.

## Situação atual

O Supabase **tem** histórico de migrations deste projeto — 33 aplicadas entre
23/08 e 26/08, mais as duas de 05/09. O que faltava era esse histórico existir
**também no repositório**: o SQL das 33 primeiras só existe dentro do projeto
Supabase, e `src/types/database.ts` prometia espelhar arquivos que não estavam
em lugar nenhum aqui.

As duas últimas já nascem versionadas dos dois lados:

```
20260905224934_teto_de_gasto_ia.sql            aplicada
20260905225132_fecha_funcoes_para_anonimo.sql  aplicada
```

## Passo que falta: trazer as 33 anteriores

Rode uma vez, na sua máquina:

```bash
export SUPABASE_ACCESS_TOKEN="seu-token"
bash capturar-schema.sh
```

Isso baixa o SQL do que já está aplicado. Depois de baixar, confira que os
arquivos gerados não colidem com os dois de 05/09 acima — eles já constam como
aplicados no servidor e não devem rodar de novo.

## Daqui para frente

Toda mudança de estrutura vira um arquivo aqui, com data e hora no nome, e vai
para o repositório junto com o código que depende dela. Sem exceção — é o que
mantém o que roda em produção igual ao que está escrito no projeto.

Para aplicar:

```bash
npx supabase db push --project-ref lpexjkjjzwufebgoiqdu
```

## Convenções

- Um assunto por arquivo. `teto_de_gasto_ia`, não `ajustes_diversos`.
- Sempre `IF NOT EXISTS` / `IF EXISTS`: a mesma migration pode ser aplicada
  mais de uma vez em ambientes diferentes.
- Comentário no topo dizendo **por que** a mudança existe. O que ela faz já
  está no SQL.
- Coluna nova em tabela que já tem dados: ou aceita nulo, ou tem `DEFAULT`.
  Sem isso o `push` falha com a tabela cheia.
- **Função nova em `public` nasce aberta para o `anon`.** O Supabase concede
  `EXECUTE` a ele por padrão. Toda função nova precisa de `revoke execute ...
  from anon` explícito — ainda mais se for `SECURITY DEFINER`, que roda por
  cima do RLS. Depois de aplicar, rode o linter de segurança do Supabase e
  confira que não sobrou nenhum aviso novo.
- Mudou tabela? Atualize `src/types/database.ts` no mesmo commit.
