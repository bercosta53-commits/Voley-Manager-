# Velora Radar · Foco e backlog

**Atualizado em 26/11/2026.** A produção segue na VSCS 3.2; a 3.3-DC está em teste.

## Foco atual

A força do Radar agora é **extrair informação do ambiente, tratá-la e gerar inteligência analítica**. A ativação comercial (cadência, e-mails, estágio de compra) fica para outro momento.

| Etapa | O que significa | Pergunta que responde |
|---|---|---|
| Extrair | Coletar fatos de fontes públicas: notícias, vagas, eventos, registros societários, sites das empresas | O que aconteceu, onde e quando? |
| Tratar | Classificar, datar, deduplicar, ligar à conta certa, avaliar a fonte e agrupar em acontecimentos e movimentos | Esse fato é real, é novo, é desta empresa e quanto vale? |
| Gerar inteligência | Ler padrões por conta, setor e mercado | O que está mudando, em quem e por quê? |

## Backlog proposto (extrair → tratar → inteligência)

A ordem segue um diagnóstico da base real, feito fora do repositório.

| # | Etapa | Item | Por quê |
|---|---|---|---|
| 1 | Extrair | **Cobertura:** separar "sem fato" de "não varrido". Registrar a última varredura de cada conta e fonte, e fazer varredura dirigida nas contas A/B sem nenhum sinal | Hoje uma conta sem sinal pode ser só uma conta que ninguém olhou |
| 2 | Tratar | **Especialização vertical** das contas sem código | Sem ela, a conta não se liga ao Clima nem entra na leitura por setor |
| 3 | Tratar | **Corroboração:** buscar segunda fonte para os sinais que pontuam e têm uma fonte só | A fonte única limita a força e a confiança do fato |
| 4 | Tratar | **Datas incertas:** confirmar a data dos sinais com data estimada | A data decide a janela e o decaimento |
| 5 | Tratar | **Contrato do classificador:** pedir o campo `missao` e aplicar as regras de 26/11 na origem | O fato já chega classificado, sem depender da inferência |
| 6 | Inteligência | **Leitura por vertical e mercado:** movimentos por vertical e mês, sequências típicas (vaga → nomeação → expansão), o que está mudando e em quem | Transforma fatos de conta em leitura de mercado, sempre com os fatos citados |
| 7 | Inteligência | **Narrativa da conta:** linha do tempo dos movimentos com fonte, força e o que mudou desde a última leitura | Mostra o porquê de cada conta, não só o score |

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
