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


## Atualização v3 — Profundidade comercial do CRM (08/11/2026)

**Premissa:** uma implantação comprovada de Salesforce ou HubSpot Sales Hub pode representar capacidade comercial muito mais robusta do que a identificação de um script RD Station Marketing. A força da plataforma deve influenciar a hipótese de maturidade, mas a marca isolada não comprova uso, integração com receita ou execução.

### Sinal de plataforma x prova operacional

| Evidência | Salesforce | HubSpot | RD Station |
|---|---:|---:|---:|
| **Somente script web carregado** | 52 | 46 | 18 |
| **Uso comercial validado, edição não informada** | 91 | 84 | 47 (RD Vendas/CRM) |
| **Enterprise/Professional validado** | Até 98 (Sales Cloud Enterprise) | Até 94 (Sales Hub Professional/Enterprise) | 47 (RD Vendas/CRM) |

Valores são **pesos analíticos calibráveis para potencial do stack**, não notas oficiais das empresas ou uma avaliação universal da capacidade das plataformas. RD Marketing tem funcionalidades sofisticadas de automação e RD Vendas tem CRM e integrações; não caracterizar a marca inteira como CRM fraco.

Requisitos para o status **CRM operacional validado**:
- fornecedor e edição (se conhecida);
- sistema ativo e em uso no pipeline comercial;
- revisor, data e fonte HTTPS verificável da constatação.

A simples detecção de script **não** preenche esses requisitos. Inventários históricos Clay/BuiltWith servem para prospecção de confirmação, mas valem **zero** no indicador positivo até outra evidência.

### Efeito no Radar

- A dimensão antes chamada 'Orquestração' passa a medir **potencial de sofisticação do CRM/automação**, com escala diferenciada por fornecedor e força da evidência.
- A atratividade Velora incorpora até **26 pontos adicionais** conforme a profundidade do CRM. Exemplo: HubSpot web ~12 pontos; RD Marketing web ~5; Salesforce enterprise realmente validado até ~25.
- Uso enterprise validado pode mudar L2 para L3 quando já existir mensuração e canal de captação observados. **Não promove a L4** por si só, pois integração de atribuição e receita permanece exigência independente.
- O Atlas apresenta filtro para sinais Salesforce/HubSpot, RD Station web e CRM comercial validado, incluindo fonte de evidência e diferença no dossiê.
- A base atual detectou **10 scripts HubSpot e 44 RD Station**, nenhum Salesforce carregado; **não há implantação comercial validada nesses 200 registros**. Isso não significa Salesforce ausente das empresas.

### Fontes de referência de funcionalidades

- Salesforce Sales Cloud / Pipeline e Forecast: https://www.salesforce.com/br/products/sales-cloud/features/
- HubSpot Sales Hub catálogo: https://legal.hubspot.com/hubspot-product-and-services-catalog/products
- HubSpot tracking code: https://knowledge.hubspot.com/reports/install-the-hubspot-tracking-code
- RD Marketing x RD Vendas: https://www.rdstation.com/novos-nomes-produtos/

Regra versionada em `radar_app/lib/crm-profundidade.ts`. Testes em `radar_app/scripts/check_crm_depth_v3.mjs`.
