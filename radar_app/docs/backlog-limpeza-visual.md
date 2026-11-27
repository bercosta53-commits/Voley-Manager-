# Backlog de limpeza visual · apresentação interna de 27/11/2026

Auditoria de 26/11: as 12 telas no desktop (1440 px) e no celular (390 px), com a base real, já com os PRs #60, #61 e #62 aplicados. As capturas ficam fora do repositório.

**Objetivo:** menos volume, mais respiro, informação organizada e leitura visual, para a pessoa entender cada tela em 5 segundos.

## Regras que valem para todas as telas

1. **Zero e vazio não ganham destaque.** Cartão com 0, coluna toda "—", "nunca rodou" e "0 de 10" saem da área principal. Quando importam, viram uma linha discreta ou ficam recolhidos. A tela mostra o que o Radar sabe.
2. **Um número principal por bloco.** O resto é apoio, menor e em tom mais claro.
3. **Lista longa tem fim.** Mostra até 25 a 50 itens com "ver mais", ou agrupa. Nenhuma página passa de 3 a 4 telas de rolagem.
4. **Texto não se repete.** O título do fato não aparece de novo logo abaixo, e a mesma explicação não aparece em dois blocos da mesma tela.
5. **Filtros visíveis: até 4.** Os demais ficam em "Mais filtros".
6. **Explicação de método fica recolhida** ("Como ler", "Como é calculado"). Aberta só quando a pessoa pede.
7. **Medidas de alerta (laranja e vermelho) só para o que pede ação.** Falta de cadastro não é alerta.

## P0 · para amanhã (alto impacto, baixo esforço)

| # | Tela | Problema | O que fazer | Esforço |
|---|---|---|---|---|
| 1 | Todas (menu) | O rodapé do menu mostra ponto vermelho e "0 de 10 fontes ativas" | Deixar só "Dados de 26/11 às 14h55". O estado das fontes fica na tela Fontes | P |
| 2 | Hoje, Contas | O título do fato se repete na linha de baixo (sinal = porQueAgora) | Esconder a segunda linha quando for igual ou começar igual à primeira | P |
| 3 | Briefing | "O que aconteceu" repete o título como subtítulo | Mesma regra do item 2 | P |
| 4 | Conta | A Narrativa e a Linha do tempo listam os mesmos fatos | A Narrativa substitui a lista de fatos; a Linha do tempo fica só com as ações do time, recolhida quando vazia | P |
| 5 | Conta | O bloco "Rascunho guardado" repete o "Próxima ação: Monitorar" da tese | Esconder o bloco de rascunho quando a ação é Monitorar ou Ignorar | P |
| 6 | Conta | O bloco "Andamento da conta" só explica um recurso desligado | Esconder quando o registro compartilhado está desligado | P |
| 7 | Conta | Dados cadastrais com linhas "—" (razão social, CNPJ, status) | Mostrar só os campos preenchidos | P |
| 8 | Decisores | 1.334 linhas numa página só (quase 70 mil px) | Paginar em 50 por página, ou agrupar por conta com o comitê recolhido | M |
| 9 | Decisores | A coluna "Nível" vem toda com "—" | Remover a coluna enquanto não houver dado | P |
| 10 | Contas | 348 linhas numa página só (cerca de 21 mil px) | Mostrar 50 por vez, com "ver mais" | P |
| 11 | Contas | Os indicadores do topo destacam falta: "3% CNPJ confirmado" e "nenhuma pede abordagem hoje" em laranja | Trocar por indicadores do que se sabe: contas com fato em 30 dias, A/B com movimento e decisores mapeados. A falta vai para Fontes | P |
| 12 | Contas | A coluna de status repete "Monitoramento / Monitorar" em quase todas as linhas | Um chip só, e apenas quando foge do padrão (Atenção ou acima) | P |
| 13 | Radar | "Como ler a prioridade" abre aberto, com 5 regras; o selo "Modelo experimental" aparece duas vezes | Recolher por padrão e deixar um selo só | P |
| 14 | Radar | O funil abre com cartões de 0 (A1, candidatas, A2, B1) e o rótulo "SEM MÉTRICA" vaza do cartão | Esconder estágios com 0, juntar "incompletas" numa linha, corrigir o corte do texto | P |
| 15 | Radar | A coluna "Proximidade do sweet spot" ocupa 3 linhas de texto por conta | Trocar por um indicador visual ("3/5 critérios") com o detalhe no tooltip | M |
| 16 | Radar | Três camadas de filtros: 5 atalhos, 10 seletores e 3 abas | Deixar visíveis os atalhos e 3 seletores; o resto vai para "Mais filtros" | M |
| 17 | Fontes | 10 cartões "Precisa de atenção", "nunca rodou" e "0 reais" | Dois grupos: "Trazendo fatos", com destaque, e "Em configuração", recolhido numa tabela compacta | M |
| 18 | Métricas | "0 empresas em oportunidade" e textos sobre registro desligado | Esconder os indicadores sem dado; manter os 15 fatos da semana e o tempo do fato ao aviso | P |
| 19 | Métricas | As listas "De onde vêm os sinais" e "Quanto demora" têm mais de 60 fontes cada | Mostrar as 10 maiores e "outras (n)". Juntar variações do mesmo veículo (por exemplo "LinkedIn - empresa" e "LinkedIn — empresa") | P |
| 20 | Métricas | O exemplo do score repete o título do fato ("X assume Head Comercial · X assume Head Comercial") | Regra do item 2 | P |
| 21 | ICP | O mapa de regiões vira uma coluna de quadradinhos com muito espaço vazio | Grade de UFs compacta em linhas, ou barras por UF ordenadas | M |
| 22 | ICP | Gatilhos com 0 em destaque ("0% do escopo") e um histograma com uma barra só (0, 0, 71, 0, 0, 0) | Esconder os gatilhos com 0 numa linha "sem evidência ainda"; trocar o histograma por uma frase ("71 contas com 2 gatilhos") | P |

## P1 · logo depois da apresentação

| # | Tela | Problema | O que fazer | Esforço |
|---|---|---|---|---|
| 23 | Hoje (celular) | 159 sinais seguidos (14 mil px); os filtros ocupam 3 linhas | Agrupar por dia ("Hoje", "Esta semana", "Antes") com 20 por grupo; filtros numa folha única "Filtrar (n)" | M |
| 24 | Hoje | O gráfico "Score em 90 dias" do detalhe fica quase vazio, com 1 ou 2 pontos | Com menos de 3 pontos, trocar por uma linha de texto ("+29 em 17 nov") | P |
| 25 | Hoje | "Por que X está com 36" repete o título e o texto do cartão acima | Deixar só as barras de contribuição | P |
| 26 | Contas | O painel de análise do topo tem 5 mini-gráficos densos (tier, momento, funcionários, ramos, região) | Ficar com 2: tier e ramos. O resto vai para "Expandir análise" | P |
| 27 | Aquisição | Os estágios L4 e L5 aparecem como cartões "0 verificadas"; "CRM comercial verificado 0" | Juntar L4 e L5 numa linha "nível avançado: nenhuma verificada ainda" | P |
| 28 | Aquisição | Códigos internos (VEL-0101) na shortlist; o botão Exportar quebra sozinho para outra linha | Tirar o código da linha principal; colocar o Exportar na mesma linha dos filtros | P |
| 29 | Clima | Faixa laranja de aviso no topo; tabela de contribuição com 13 colunas | O aviso vira nota de rodapé; a tabela abre recolhida, com só o "S" e o setorial visíveis | P |
| 30 | ICP | Matriz "Quais gatilhos andam juntos" quase toda com 0 | Mostrar só os pares com contas | P |
| 31 | Conta | A tese tem 6 linhas de texto longo | "Por que agora" com no máximo 2 linhas e "ver mais" | P |

## P2 · deixar a ferramenta mais visual

| # | Tela | Ideia |
|---|---|---|
| 32 | Hoje | Faixa de resumo visual: fatos novos por tema hoje e nesta semana (mini-barras) |
| 33 | Contas | Visão alternativa em cartões ou em mapa (ramo × momento), além da tabela |
| 34 | Movimentos | Pequenos múltiplos por grupo (fatos por mês) no lugar da grade quando houver mais de 6 grupos |
| 35 | Decisores | Visão por conta: comitê como 3 lugares (assina, decide, sente a dor), preenchidos ou vazios |
| 36 | Todas | Revisão de tipografia: no máximo 3 tamanhos por tela e números sempre com a mesma fonte (`vr-data`) |

## Ordem sugerida para hoje

1. **Itens de 1 a 7, 9, 12, 13, 20:** remoções e esconderijos, poucos minutos cada.
2. **Itens 10, 14, 18, 19, 22:** volume e zeros.
3. **Itens 8, 11, 15, 16, 17, 21:** reorganização.
4. **Fechamento:** nova rodada de capturas nas 12 telas, comparando antes e depois.
