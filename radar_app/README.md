# Velora Radar (app)

Interface diária do radar de sinais. Next.js (App Router), Tailwind, componentes no padrão shadcn/ui, motion e lucide-react.

Telas: Hoje, Conta, Contas, Fontes, Métricas, e busca/comando com ⌘K.

## Rodar

```sh
npm install
npm run dados -- caminho/da/planilha.xlsx   # base real em data/contas.local.json (fica fora do Git)
npm run build && npm start                  # http://localhost:3000
```

Sem a base real, o app usa `data/contas.exemplo.json` (empresas fictícias).

## Atualizar os sinais

Na ordem, sobre `data/contas.local.json`:

```sh
python3 scripts/coletar_noticias.py          # Google Notícias: manchete crua entra com peso 0 até ser classificada
python3 scripts/coletar_vagas.py             # vagas de marketing/vendas: 1 sinal por conta com a contagem; liderança à parte
python3 scripts/classificar_sinais.py        # manchete -> sinal curto ("Expansão para o Paraná"); homônimo é descartado
python3 scripts/coletar_noticias.py --so-ambiguas   # refaz a busca das contas com homônimo, usando site e comitê
python3 scripts/classificar_sinais.py        # classifica o que a busca refeita trouxe
python3 scripts/remover_duplicatas.py        # várias matérias do mesmo fato viram um sinal só
python3 scripts/calcular_score.py            # score, tendência e composição de cada conta
```

O classificador usa a API da Anthropic (`ANTHROPIC_API_KEY`). Sem chave, `--exportar arquivo.json` grava o que
falta classificar e `--respostas arquivo.json` aplica as respostas prontas pelo mesmo caminho. Notícia sem fato
acionável (`noticia_setorial`) não entra na caixa de Hoje nem no score: fica só na linha do tempo da conta.

## Onde está cada coisa

| Caminho | O quê |
| --- | --- |
| `app/velora-radar-tokens.css` | tokens de design (única fonte de cores, raios, sombras, glass e movimento) |
| `app/globals.css` | tema do shadcn/ui mapeado para os tokens |
| `app/api/estados/` | endpoint que lê/grava as ações (útil, ruído, abordado…) no banco do radar |
| `components/casca/` | navegação comum às telas (topo, inferior no celular) e a busca ⌘K |
| `components/hoje/` | tela Hoje: cartão de sinal, score com tendência, abordar, estados |
| `components/conta/` | tela da conta: score com decomposição, próxima ação, linha do tempo, comitê |
| `components/contas/` | tabela de contas: filtros, filtros salvos, ordenação |
| `components/fontes/` | um cartão por conector: o que busca, status, última coleta, custo |
| `components/metricas/` | precisão, latência, volume por fonte, conversão em abordagem |
| `components/ui/` | botão, atalho de teclado, esqueleto, dica, painel flutuante (modal / bottom sheet) |
| `lib/banco.ts` | leitura/escrita em `radar_abm/dados/radar.db` (server-only) |
| `scripts/gerar_dados.py` | lê a planilha (só contas com CNPJ e site) e monta contas, séries de score e sinais de exemplo |
| `scripts/exportar_estatico.sh` | gera `out/` estático (só a base fictícia) para uma prévia sem servidor |

## Revisar os estados da tela

`/?estado=carregando`, `/?estado=vazio`, `/?estado=erro`, `/?estado=sem-permissao` (também em `/contas`, `/fontes`, `/metricas` e na tela de uma conta).

## Atalhos (tela Hoje)

`j`/`k` navegam · `a` abordar · `u` útil · `r` ruído · `s` adiar 3 dias · `e` arquivar · `o` abre a conta do sinal em foco · `?` abre a lista de atalhos na tela.
No celular: deslize para a direita marca útil, para a esquerda arquiva; toque abre o detalhe.

## Onde fica o que a pessoa marca

Rodando com `next start`/`next dev` ao lado do `radar_abm` (mesmo checkout, com `radar_abm/dados/radar.db`
existindo), útil/ruído/abordado/adiado/arquivado vão para o banco: uma tabela própria (`app_estados`) guarda o
estado de cada sinal, e útil/ruído também vira uma linha em `feedback` — a mesma tabela que `manager.py feedback`
grava — para `manager.py metricas` enxergar as duas fontes juntas. Sem o banco por perto (prévia estática, ou
antes de os coletores rodarem), a tela guarda tudo só no navegador, como antes.

## Prévia estática (sem servidor)

```sh
npm run exportar   # gera radar_app/out/, só com a base fictícia, sem banco e sem os endpoints de gravação
```

A exportação estática do Next.js não roda endpoints dinâmicos nem tem acesso ao banco; o script tira
`app/api/` e `data/contas.local.json` do caminho antes do build e devolve os dois depois.

Os caminhos dos arquivos (CSS, scripts) ficam relativos, para funcionar em qualquer endereço onde a pasta
for publicada — inclusive como página do claude.ai, cujo endereço real não é previsível de antemão. Os
links entre telas (`/contas`, `/fontes`...) continuam absolutos a partir da raiz, então clicar neles fora
de um deploy na raiz do domínio recarrega a página inteira em vez de navegar só pelo JavaScript — funciona,
mas com uma piscada a mais.
