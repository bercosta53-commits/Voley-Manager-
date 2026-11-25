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
| Modo apresentação | `?apresentacao=1` em qualquer tela (desliga pelo selo ou com `?apresentacao=0`): tira Clima e ICP do menu, mascara e-mails e esconde a nota de relevância |

## Onde está cada coisa

| Caminho | O quê |
| --- | --- |
| `app/` | rotas (Hoje, Radar, Contas, Conta, Decisores, Fontes, Métricas, ICP, Clima, Aquisição) e `api/saude`, `api/estados` |
| `app/velora-radar-tokens.css` | tokens de design (cores, tipografia, raios, sombras, movimento) |
| `components/casca/` | menu lateral, navegação do celular, busca ⌘K, aviso de base desatualizada |
| `components/hoje/` | tela Hoje: caixa de sinais, cartão de sinal, abordar, estados de tela |
| `components/conta/` | tela da conta: tese da conta, próxima ação com rascunho, linha do tempo, comitê, cadastro |
| `components/radar/` | panorama da base, radar de proximidade, movimentos da semana |
| `components/ui/` | peças comuns: botão, evidência, selo do VSCS, painel flutuante, modo apresentação |
| `lib/dados.ts` | leitura e validação do snapshot (server-only) |
| `lib/frescor.ts`, `lib/panorama.ts`, `lib/tese.ts` | regras puras, com testes em `scripts/tests/*.test.mjs` |
| `lib/avaliacao.ts` | faixas do VSCS e matriz ICP × VSCS usadas na tela |
| `db/` | migrações propostas para o Supabase (aplicar só depois do alinhamento com a carga diária) |
| `docs/` | contrato de dados (`contrato-radar-acoes.md`) e histórico da migração para a Cloudflare |
| `scripts/*.py`, `scripts/gerar_dados.py` | coletores e classificadores da fase anterior (planilha e base local). A carga de produção hoje é a pesquisa diária gravando direto no Supabase |

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
