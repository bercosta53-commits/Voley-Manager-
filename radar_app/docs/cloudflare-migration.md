# Migração isolada Cloudflare + Supabase (pré-produção)

**Não promover a versão nem adicionar a chave de produção antes de validar o acesso.** O repositório é público; nunca versionar a base real ou credenciais.

- Worker: velora-radar; diretório: radar_app; branch: migration/cloudflare-supabase.
- Build temporário: bash scripts/build-cloudflare.sh
- Upload sem promoção: npx --no-install wrangler versions upload
- Previews desativados. Manter Cloudflare Access ligado, com política de e-mails autorizados.
- Antes de produção: gerar e commitar lockfile com versões compatíveis, testar build, tamanho e CPU no Workers Free.
- Secrets/variáveis de runtime do Worker, não de build: SUPABASE_URL, SUPABASE_SECRET_KEY (nova chave sb_secret_), CF_ACCESS_TEAM_DOMAIN (https://...cloudflareaccess.com), CF_ACCESS_AUD (Audience da aplicação). Nunca usar NEXT_PUBLIC_ para segredos.
- Worker rejeita requisição sem JWT válido e configuração de Access. Não habilitar acesso público alternativo.
- Recuperar contas.local.json original e conservar cópia privada antes de importar. Executar node scripts/importar_snapshot_supabase.mjs /caminho/contas.local.json em ambiente seguro; comparar contagens e amostras. Não usar dados de exemplo.
- Snapshot é etapa de compatibilidade que mantém todos os campos originais. Próxima etapa: normalizar e paginar contas, contatos, sinais e histórico; validar persistência de estados comerciais. No estágio atual os estados permanecem locais no navegador como na produção anterior sem SQLite.
- Testes obrigatórios: login e bloqueio anônimo (incluindo URLs alternativas), contas/decisores/sinais, filtros, scores, navegação por ID e ações comerciais; conferir custo e limites. Só então promover, mantendo Vercel intacto.

## Primeiro build integrado

Com a branch de produção do Worker apontada para `migration/cloudflare-supabase`, o próximo push deve iniciar o build automaticamente. Conferir no histórico a branch e o SHA do commit; não repetir o build da branch antiga. Manter o comando `wrangler versions upload` e não promover o upload antes dos testes de autenticação e recuperação dos dados. A Vercel continua na branch original.
