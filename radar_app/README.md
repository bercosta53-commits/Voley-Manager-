# Velora Radar (app)

Interface diária do radar de sinais. Next.js (App Router), Tailwind, componentes no padrão shadcn/ui, motion e lucide-react.

## Rodar

```sh
npm install
npm run dados -- caminho/da/planilha.xlsx   # base real em data/contas.local.json (fica fora do Git)
npm run build && npm start                  # http://localhost:3000
```

Sem a base real, o app usa `data/contas.exemplo.json` (empresas fictícias).

## Onde está cada coisa

| Caminho | O quê |
| --- | --- |
| `app/velora-radar-tokens.css` | tokens de design (única fonte de cores, raios, sombras, glass e movimento) |
| `app/globals.css` | tema do shadcn/ui mapeado para os tokens |
| `components/hoje/` | tela Hoje: cartão de sinal, score com tendência, abordar, estados, navegação |
| `components/ui/` | botão, atalho de teclado, esqueleto, dica, painel flutuante (modal / bottom sheet) |
| `scripts/gerar_dados.py` | lê a planilha (só contas com CNPJ e site) e monta contas, séries de score e sinais de exemplo |

## Revisar os estados da tela

`/?estado=carregando`, `/?estado=vazio`, `/?estado=erro`, `/?estado=sem-permissao`.

## Atalhos (tela Hoje)

`j`/`k` navegam · `a` abordar · `u` útil · `r` ruído · `s` adiar 3 dias · `e` arquivar. No celular: deslize para a direita
marca útil, para a esquerda arquiva; toque abre o detalhe.

O que a pessoa faz com cada sinal fica, por enquanto, no navegador. Ligar no banco do radar (útil/ruído viram feedback
e alimentam a precisão) é o próximo passo.
