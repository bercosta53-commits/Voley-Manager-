# Velora Radar (app)

Interface do radar de inteligência comercial da Velora: quais empresas estão em momento de compra, por quê,
com quem falar e qual a próxima ação. Next.js 16 (App Router) publicado como Cloudflare Worker via OpenNext,
lendo um snapshot no Supabase.

## Arquitetura em produção

```
 pesquisa diária (ChatGPT, 00h30) ──grava──▶ Supabase · radar_snapshots (id = 'current')
                                                         │
 navegador ──▶ Cloudflare Access ──▶ Worker velora-radar ┤ lê o snapshot a cada requisição (lib/dados.ts)
                (login)              (cloudflare-worker.mjs verifica o JWT do Access de novo)
```

- **Acesso:** o Cloudflare Access faz o login. O Worker (`cloudflare-worker.mjs`) confere o JWT de novo em
  toda requisição (emissor, audiência, RS256, validade). Sem JWT válido, responde 401 ou 403.
- **Dados:** `lib/dados.ts` lê `radar_snapshots.id = 'current'` com a chave secreta, só no servidor. Na leitura,
  descarta sinais de exemplo, sinais sem conta e sinais com data ilegível, e conta o que tirou. Nada é gravado
  de volta. Não existe fallback para dados fictícios.
- **Carga:** a pesquisa diária grava o snapshot inteiro. O app avisa no topo de todas as telas quando a base
  passa de 36 h (âmbar) ou de 72 h (vermelho); veja `lib/frescor.ts`.
- **Ações do time** (abordado, adiado, útil/ruído, relevância): o registro compartilhado (`lib/banco.ts`, tabela
  `radar_acoes`) está pronto, mas **desligado**. Desligado, as marcações ficam no navegador de cada pessoa. Para
  ligar, nesta ordem:
  1. a inteligência confirma que os IDs de conta e sinal são estáveis entre cargas;
  2. aplicar `db/001_radar_acoes.sql` no Supabase;
  3. definir `RADAR_ACOES=1` no Worker.

  O autor de cada marcação é o e-mail do Access; veja `docs/contrato-radar-acoes.md`.

Variáveis do Worker (runtime, nunca de build; nunca com prefixo `NEXT_PUBLIC_`): `SUPABASE_URL`,
`SUPABASE_SECRET_KEY`, `CF_ACCESS_TEAM_DOMAIN`, `CF_ACCESS_AUD` e, quando o registro compartilhado for ligado,
`RADAR_ACOES=1`. `RADAR_AUTOR_TESTE` existe só para os testes (`smoke` e `jornada`). O repositório é público: nunca versione a
base real, contatos ou credenciais.

## Rodar e testar

```sh
npm ci
npm run lint                # typecheck
npm test                    # testes unitários de lib/ (node:test)
npm run build:cloudflare    # build do Worker com OpenNext (também gera .next)
npm run smoke               # rotas e /api/saude contra um Supabase simulado com a base fictícia
npm run jornada             # a jornada da demo num navegador (precisa do Playwright instalado)
```

`smoke` e `jornada` sobem o app contra um Supabase simulado (`scripts/app-de-teste.mjs`) que serve a base
**fictícia** do repositório (`data/contas.exemplo.json`). Isso só roda no CI e na máquina local.

O CI (`.github/workflows/radar-app-ci.yml`) roda tudo isso em cada PR e push para `migration/cloudflare-supabase`,
mais os testes do VSCS em Python e a medição do tamanho do Worker (limite de 3 MiB comprimido no plano gratuito).

## Deploy e rollback

- A Cloudflare gera a versão a partir de `migration/cloudflare-supabase` com `bash scripts/build-cloudflare.sh`,
  que instala as dependências pelo lockfile, e `npx --no-install wrangler versions upload`, que envia a versão
  **sem promover**.
- Teste a versão nova antes de promover.
- Rollback: promover a versão anterior no painel da Cloudflare (Workers → velora-radar → Deployments) ou reverter
  o merge.

## Operação

| O quê | Onde |
| --- | --- |
| Saúde da base: status, idade, contagens, descartes, custo da leitura | `/api/saude` (protegido pelo Access; 503 com o motivo quando a base não pode ser lida) |
| Logs | Observabilidade do Worker; eventos JSON `radar.base.lida` e `radar.base.erro` |
| Checagem antes de uma apresentação | `/api/saude` com `status: ok` e `frescor: ok` |
| Modo apresentação | `?apresentacao=1` em qualquer tela (desliga pelo selo ou com `?apresentacao=0`): tira Clima, ICP e Fontes do menu (e a contagem de fontes do rodapé), mascara e-mails e esconde a nota de relevância |

### Medir o peso de cada tela (P0-8 / P1-12)

`node scripts/medir-rotas.mjs` (depois de `npm run build`) mostra o tamanho do HTML com o payload que vai ao
navegador e o tempo de resposta de cada tela, com a base fictícia de 350 contas. Com o snapshot real exportado
(`node scripts/medir-rotas.mjs /tmp/snapshot.json`), mede a base de verdade. O snapshot real nunca vai para o
repositório: guarde fora dele e apague depois. O tempo é do `next start` local, bom para comparar telas e versões;
a CPU do Worker se confirma no painel da Cloudflare.

### Resumo diário por e-mail (desligado)

Todo dia às 7h (Cron Trigger `0 10 * * *` no `wrangler.jsonc`, 10h UTC), o Worker monta um resumo com as contas que
tiveram fato novo desde a véspera da carga (com fonte e próxima ação), as que viraram Conta Qualificada e, com o
registro compartilhado ligado, as quentes ainda sem ação do time. Só empresas e fatos, nenhum nome ou e-mail de
pessoa. Se a base estiver atrasada, o resumo diz isso primeiro.

- **Prévia:** `/api/resumo` no navegador (`?formato=texto` para a versão em texto); diz o que falta configurar.
- **Para ligar**, no Worker: `RESUMO_DIARIO=1`, `RESUMO_PARA` (e-mails separados por vírgula), `RESUMO_DE`
  (ex.: `Radar Velora <radar@seu-dominio>`, com o domínio verificado na Resend), `RADAR_URL` (link do app no e-mail)
  e o segredo `RESEND_API_KEY` (`wrangler secret put RESEND_API_KEY`). A Resend tem plano gratuito de 3.000 e-mails
  por mês e 100 por dia. Outro provedor com API HTTP troca só `lib/email.ts`.
- **Para desligar:** tire `RESUMO_DIARIO`. Sem ele, o agendamento não faz nada (nem lê a base).
- O envio só acontece pelo agendamento: a rota recusa `POST` de fora (token aleatório de uso único no isolate).

## Onde está cada coisa

| Caminho | O quê |
| --- | --- |
| `app/` | rotas: Hoje (`(inicio)`), Radar = Prioridade de contas (`radar/`), Radar de proximidade (`radar/proximidade`), Contas (`contas/(lista)`), Conta (`contas/[id]`, com o 404 decidido no `layout.tsx`), Decisores, Fontes, Métricas, ICP, Clima, Aquisição; e `api/saude`, `api/estados`, `api/resumo`. Cada seção tem o seu `loading.tsx` (não há loading na raiz) |
| `app/velora-radar-tokens.css` | tokens de design (cores, tipografia, raios, sombras, movimento) |
| `components/casca/` | menu lateral, navegação do celular, busca ⌘K, aviso de base desatualizada, esqueleto de carregamento |
| `components/hoje/` | tela Hoje: caixa de sinais, cartão de sinal, abordar, estados de tela |
| `components/conta/` | tela da conta: tese da conta, rascunho da abordagem, andamento, linha do tempo, comitê, cadastro |
| `components/prioridade/` | Prioridade de contas (experimental): metodologia, faixa "do ambiente ao sweet spot", lista, painel com losango, comparação, Setor × Prioridade, cruzar duas dimensões |
| `components/radar/` | panorama da base, radar de proximidade, movimentos da semana |
| `components/metricas/` | visão da liderança, "Como o score é calculado" (metodologia e histórico do modelo) |
| `components/ui/` | peças comuns: botão, evidência, selo do VSCS, painel flutuante, modo apresentação |
| `lib/dados.ts` | leitura e validação do snapshot (server-only); completa estágio e ação pela matriz quando a carga não traz |
| `lib/casca-dados.ts` | S-1: índice leve da casca (`paraCasca`) e `aliviarBase`: cada tela manda ao navegador só o que usa |
| `lib/prioridade-config.ts` | módulo único da Prioridade integrada: pesos, limites, sweet spot (A1 e A2), mapeamentos e validades (decisões D1, D2, D5, D7) |
| `lib/prioridade.ts`, `lib/prioridade-filtros.ts`, `lib/prioridade-visoes.ts`, `lib/prioridade-transporte.ts`, `lib/prioridade-linhas.ts` | motor de classes, busca e filtros, agrupar e cruzar, transporte compacto (puros) e montagem das linhas no servidor |
| `lib/frescor.ts`, `lib/panorama.ts`, `lib/tese.ts`, `lib/cobertura.ts`, `lib/lideranca.ts`, `lib/resumo.ts`, `lib/papeis.ts`, `lib/filtros.ts` | regras puras, com testes em `scripts/tests/*.test.mjs` |
| `lib/avaliacao.ts` | faixas do VSCS e matriz ICP × VSCS usadas na tela (o score exibido é sempre o do motor, P1-8) |
| `lib/email.ts`, `app/api/resumo` | resumo diário das 7h (desligado até configurar; ver acima) |
| `scripts/score_v2.py` | motor do VSCS 3.0 (a proposta 3.1, em que liderança e contratação de head amadurecem, está no PR #44 e entra depois do alinhamento com a inteligência) |
| `scripts/tests/` | testes de lib (`*.test.mjs`, com `resolver.mjs`) e do motor (`test_*.py`) |
| `scripts/smoke.mjs`, `scripts/jornada.mjs`, `scripts/medir-rotas.mjs` | teste de fumaça, jornada da demo no navegador e medição de peso por tela |
| `db/` | migrações propostas para o Supabase (aplicar só depois do alinhamento com a carga diária) |
| `docs/` | contrato de dados (`contrato-radar-acoes.md`, PR #14), maturidade de aquisição e histórico da migração para a Cloudflare |
| `scripts/gerar_dados.py` e demais `scripts/*.py` | coletores e classificadores da fase anterior (planilha e base local). A carga de produção hoje é a pesquisa diária gravando direto no Supabase |

## Contrato com a carga diária

A carga diária e o app só se falam pelo snapshot. O que o app espera (`atualizadoEm` com hora real, IDs estáveis
entre cargas, todo sinal com `fonte`, `url` e `data`, nenhum `exemplo: true`) está em
`docs/contrato-radar-acoes.md`. Mudanças de esquema ou de scoring são alinhadas antes de implementar.

## Atalhos (tela Hoje)

`j`/`k` navegam · `a` abordar · `u` útil · `r` ruído · `s` adiar 3 dias · `e` arquivar · `o` abre a conta do
sinal em foco · `?` mostra os atalhos. No celular: deslizar para a direita marca útil e para a esquerda arquiva;
tocar abre o detalhe.

Para revisar os estados de tela: `?estado=carregando`, `?estado=vazio` e `?estado=erro`, em Hoje, Contas, Fontes,
Métricas e na tela de uma conta.
