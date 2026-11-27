# Velora Radar — Calibração de maturidade de aquisição v3

Data: 27/11/2026 (v3, régua de 4 níveis observáveis). Versão anterior: v2, 08/11/2026. Escopo: 200 empresas de TI, 173 sites efetivamente inspecionados.

## O que mudou na v3 (decisão de 27/11/2026)

Na v2, L4 e L5 só abriam com evidência interna (CRM ligado à receita, atribuição, governança), que o site público nunca mostra. Resultado: **0 contas em L4 e L5**, dois níveis vazios na régua. A v3 recalibra a régua para o que é observável:

- **L4 passa a ser "Multicanal completa"**: o antigo critério de "potencial L4" (GA4 + GTM, duas ou mais mídias, CRM/automação web e canal de captação). São **20 contas**, que antes ficavam em L3.
- **L5 sai da régua.** A integração com receita vira um **selo à parte** (`integracaoValidada`), só com `evidenciaOperacional` verificada (fonte, revisor, data); a otimização (experimentação, incrementabilidade, previsão) é o selo `otimizacaoValidada`. Uma conta com integração validada fica em L4 e recebe o selo.
- **Sweet spot da Velora continua L2 + L3**: passa de 117 para **97** contas. O L4 já tem operação madura, com menos espaço para a Velora.
- **Nota da Oportunidade digital na prioridade integrada**: L1 → 2 · L2 → 4 · L3 → 4 · **L4 → 3** (antes L4 → 2 e L5 → 1, níveis que nunca ocorriam). O L4 atinge o mínimo de A2 (3), mas fica abaixo do sweet spot. No snapshot atual, 1 conta ligada à auditoria passa de 4 para 3, e nenhuma classe A/B muda.
- **Atratividade Velora**: o componente de zona já valia 14 (L2), 12 (L3) e 6 (L4); as 20 contas L4 passam a usar o 6.

## Três dimensões independentes — evitar misturar notas

1. **Maturidade estimada (L0–L4).** Captura somente capacidades com evidência positiva. L0 = sem dados suficientes, nunca "maturidade zero".
2. **Qualidade da evidência (0–100).** Leitura observacional combinando páginas válidas, diversidade de famílias de tecnologia e evento de CTA auditado. É cobertura técnica do scanner, não grau de certeza estatística.
3. **Atratividade Velora (0–100).** Fit Tier, amplitude de sinais, qualidade da evidência e prioridade de investigação; reduz a nota provisória quando o ICP/faturamento está explicitamente não validado. Não é score de falha nem probabilidade de fechamento.

## Quatro níveis observáveis e dois selos

| Nível | Definição operacional | Critério público / gate |
|---|---|---|
| **L1 — Presença inicial** | Evidência positiva em apenas uma família (mensuração, mídia, CRM web ou captação). | Site válido; uma família observada. Isso não prova ausência das demais. |
| **L2 — Aquisição emergente** | Capacidades positivas em duas ou mais famílias, sem evidências suficientes para classificar L3. | Site válido, pelo menos duas famílias web. |
| **L3 — Operação estruturada** | Operação multicanal observável, ainda sem o stack completo. | Quatro famílias; **ou** mensuração+mídia multicanal+captação; **ou** mensuração+mídia+CRM web com evento comercial identificado; **ou** mídia multicanal+CRM web+captação; **ou** CRM verificado forte+mensuração+captação. Não exige que o script do CRM apareça no front-end. |
| **L4 — Multicanal completa** | Stack completo observável: GTM e GA4, duas ou mais mídias em rede, CRM/automação web (ou CRM verificado forte) e captação visível. | Critério público. **Não comprova integração com receita.** |
| Selo **integração validada** | CRM/pipeline ligado à receita, atribuição de origem e governança comercial. | Requer **evidência operacional**, fonte verificável, data e revisor. Leva a conta a L4. |
| Selo **otimização validada** | Integração validada + experimentação, incrementabilidade e previsão. | Exige o selo anterior e evidências internas verificadas. |

Nenhuma das 200 contas tem os selos ainda; isso não conclui que a integração não exista.

## Leitura do L4

- A existência de evento comercial específico após CTA aumenta o interesse na investigação (1 das 20); resposta de endpoint não certifica CRM integrado.
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

Na v2 eram **20 candidatas a potencial L4** (ainda em L3). Na v3 elas formam o L4:

| Classe | v2 | v3 |
|---|---:|---:|
| L0 — Insuficiente | 43 | 43 |
| L1 | 40 | 40 |
| L2 | 61 | 61 |
| L3 | 56 | 36 |
| L4 — Multicanal completa | 0 | 20 |
| L5 | 0 | — (selo à parte) |
| **Sweet spot L2+L3** | **117** | **97** |

A mudança em L3 resolve um viés: empresas B2B podem ter aquisição multicanal e CRM server-side invisível. A mudança é baseada em **evidências positivas**, não em suposta ausência de sistemas.

## Aplicação no fluxo ABM

- Público central: L2 e L3, priorizado por Atratividade Velora e qualidade da evidência.
- L4: investigar integração CRM/pipeline/receita para distinguir integração real de stack fragmentado; menos espaço para a Velora.
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
