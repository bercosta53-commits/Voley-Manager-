# Velora Radar · Foco e backlog

**Atualizado em 26/11/2026.** A produção segue na VSCS 3.2; a 3.3-DC está em teste.

## Foco atual

A força do Radar agora é **extrair informação do ambiente, tratá-la e gerar inteligência analítica**. A ativação comercial (cadência, e-mails, estágio de compra) fica para outro momento.

| Etapa | O que significa | Pergunta que responde |
|---|---|---|
| Extrair | Coletar fatos de fontes públicas: notícias, vagas, eventos, registros societários, sites das empresas | O que aconteceu, onde e quando? |
| Tratar | Classificar, datar, deduplicar, ligar à conta certa, avaliar a fonte e agrupar em acontecimentos e movimentos | Esse fato é real, é novo, é desta empresa e quanto vale? |
| Gerar inteligência | Ler padrões por conta, setor e mercado | O que está mudando, em quem e por quê? |

## Backlog (decisões de 26/11)

| # | Etapa | Item | Situação |
|---|---|---|---|
| 1 | Extrair | **Cobertura:** separar "sem fato" de "não varrido" (`payload.varreduras`, `docs/varreduras.md`). O painel em Fontes destaca as contas com informação; o que falta ler fica recolhido | Feito (PR #60) |
| 2 | Tratar | **Especialização vertical** das contas sem código | Com o ChatGPT (responsável: Velora) |
| 3 | Tratar | **Corroboração:** só buscar segunda fonte quando a primeira for fraca | Decidido: fonte forte basta, para não gastar tokens à toa |
| 4 | Tratar | **Datas incertas:** confirmar a data dos sinais com data estimada | Feito: 2 correções e 6 confirmações, em relatório privado |
| 5 | Tratar | **Contrato do classificador:** pedir os campos `missao` e `varreduras` e aplicar as regras de 26/11 na origem | Com o ChatGPT |
| 6 | Inteligência | **Movimentos do mercado:** por família ou ramo de TI e por vertical; tema acima da média, sequências e fatos citados | Feito (PR #62) |
| 7 | Inteligência | **Narrativa da conta:** movimentos com período, força e o que é novo desde a última leitura | Feito (PR #61) |

## Estacionado (fora do backlog por ora)

São itens de ativação. Voltam quando o foco mudar.

- Escala de estágio de compra (fase 2).
- E-mail diário: destinatários e serviço.
- Caso "prova" para a demo.
- Revisão manual de contas que mudam muito de posição na 3.3.
- Estrato extra na rotulagem cega.
- PR de anonimização de exemplos (a branch `chore/anonimizar-exemplos` fica pronta, sem PR).

## Já decidido (VSCS 3.3, em teste)

Veja `docs/vscs-3-3-dc.md`, seções 3.7 a 3.11:
- relacionamento;
- missão da liderança;
- classificador de texto.
