# Velora Radar — Calibração de maturidade de aquisição v2

Data: 08/11/2026. Escopo: 200 empresas de TI, 173 sites efetivamente inspecionados.

## Três dimensões independentes — evitar misturar notas

1. **Maturidade estimada (L0–L5).** Captura somente capacidades com evidência positiva. L0 = sem dados suficientes, nunca "maturidade zero".
2. **Qualidade da evidência (0–100).** Leitura observacional combinando páginas válidas, diversidade de famílias de tecnologia e evento de CTA auditado. É cobertura técnica do scanner, não grau de certeza estatística.
3. **Atratividade Velora (0–100).** Fit Tier, amplitude de sinais, qualidade da evidência e prioridade de investigação; reduz a nota provisória quando o ICP/faturamento está explicitamente não validado. Não é score de falha nem probabilidade de fechamento.

## Cinco níveis — definições e confirmação

| Nível | Definição operacional | Critério público / gate |
|---|---|---|
| **L1 — Presença inicial** | Evidência positiva em apenas uma família (mensuração, mídia, CRM web ou captação). | Site válido; uma família observada. Isso não prova ausência das demais. |
| **L2 — Aquisição emergente** | Capacidades positivas em duas ou mais famílias, sem evidências suficientes para classificar L3. | Site válido, pelo menos duas famílias web. |
| **L3 — Aquisição estruturada** | Operação multicanal observável, ainda sem demonstração da integração Marketing–Vendas–Receita. | Quatro famílias; **ou** mensuração+mídia multicanal+captação; **ou** mensuração+mídia+CRM web com evento comercial identificado; **ou** mídia multicanal+CRM web+captação. Não exige que o script do CRM apareça no front-end. |
| **L4 — Integrada por dados** | CRM/pipeline ligado à receita, atribuição de origem e governança comercial. | Requer **evidência operacional**, fonte verificável, data e revisor. O stack público sozinho não qualifica. |
| **L5 — Otimização contínua** | L4 + experimentação documentada, incrementabilidade e previsão/otimização de receita. | Exige **todos os requisitos L4**, mais evidências internas verificadas. |

A regra de L4/L5 agora **não contém limite fixo em L3**: a promoção está habilitada na estrutura `evidenciaOperacional` com trilha de fonte, revisor e data. Nenhuma das 200 contas possui essa validação ainda, portanto os dois níveis permanecem com **zero comprovadas**, sem concluir que elas não existam.

## Hipótese separada: potencial L4

**Potencial L4 = L3 com GTM e GA4 carregados, no mínimo duas plataformas de mídia em rede, ao menos um script web de CRM/automação em rede e um ponto de captação visível.**

- Contar como **candidata à verificação**, nunca como L4 certificada.
- A existência de evento comercial específico após CTA aumenta interesse na investigação; resposta de endpoint não certifica CRM integrado.
- Os sinais de histórico Clay/BuiltWith **não** entram na classificação positiva até serem observados no navegador.
- Não inferir campanha ativa apenas por pixel/Ads e não inferir CRM operacional só por script web.

## Comparação da amostra e efeito da calibração

| Classe | v1 | v2 | Diferença |
|---|---:|---:|---:|
| L0 — Insuficiente | 43 | 43 | 0 |
| L1 | 42 | 40 | −2 |
| L2 | 78 | 61 | −17 |
| L3 | 37 | 56 | +19 |
| L4 validado | 0 | 0 | 0 |
| L5 validado | 0 | 0 | 0 |
| **Foco L2+L3** | **115** | **117** | **+2** |

**20 candidatas a potencial L4** (ainda L3). **1** delas combina o stack exigido com evento comercial específico no consolidado.

A mudança em L3 resolve um viés: empresas B2B podem ter aquisição multicanal e CRM server-side invisível. A mudança é baseada em **evidências positivas**, não em suposta ausência de sistemas.

## Aplicação no fluxo ABM

- Público central: L2 e L3, priorizado por Atratividade Velora e qualidade da evidência.
- Candidatas L4: investigar integração CRM/pipeline/receita para distinguir integração real de stack fragmentado.
- L1/inconclusivas: primeiro confirmar ICP e operação; não descartar automaticamente.
- Manter os 80 cadastros L12 como **pesquisa, sem cadência comercial automática**, até validar ICP, faturamento, responsável econômico e deduplicação.
- Dados históricos e scores comerciais originais são preservados.

## Limites metodológicos

Amostra web pública, páginas selecionadas, estados de consentimento e eventos nem sempre testados. Estes níveis são um **modelo heurístico exploratório** e devem ser calibrados contra auditorias completas, com casos de referência validados, antes de decisões de alto impacto. Não apresentam probabilidade estatística de maturidade nem comprovam falha comercial.

Código auditável: `radar_app/lib/aquisicao-maturidade.ts`. Validação de regressões: `radar_app/scripts/check_maturity_v2.mjs`. Dados: `radar_app/data/aquisicao.json`.
