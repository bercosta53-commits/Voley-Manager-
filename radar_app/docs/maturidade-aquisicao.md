# Velora Radar — Matriz de maturidade de aquisição (v1)

Atualizado em 08/11/2026. Fonte: 200 registros técnicos L08–L12.

## Intenção de negócio

O foco comercial da Velora são organizações com alguma infraestrutura de aquisição, mas sem comprovação de uma operação integrada e escalável.

- **L1 — Presença inicial:** indícios isolados de medição, mídia, CRM web ou captação. Não representa ausência comprovada de tecnologia.
- **L2 — Aquisição emergente (foco):** evidências técnicas em pelo menos duas famílias complementares (ex.: tracking + mídia, tracking + captura, mídia + captura ou mídia + CRM web). O próximo diagnóstico valida eventos, handoff de leads e campanhas.
- **L3 — Operação estruturada (foco):** tracking + mídia + tecnologia comercial/automação no front-end + captação no DOM, observados no crawl. O próximo diagnóstico valida a atribuição de ponta a ponta e a conexão com receita.
- **L4 — Integrada por dados:** integração CRM/marketing/comercial demonstrada por evidências operacionais internas; não verificável por navegação pública.
- **L5 — Otimização contínua:** atribuição robusta, experimentos, incrementabilidade e otimização recorrente demonstradas; não verificável por navegação pública.
- **0 — Evidência insuficiente:** site não auditado ou sem famílias tecnológicas positivas observadas. Não é automaticamente L1.

## Instrumentos de leitura

**Eixo X — Instrumentação observável:** tags GTM/GA4 confirmadas em rede, com peso adicional caso evento de CTA seja observado.

**Eixo Y — Ativação observável:** plataformas de mídia em rede, captação no DOM (formulários/WhatsApp) e scripts de CRM ou automação web carregados.

**Mapa de calor:** intensidade de capacidades observadas (0–100), não maturidade de operação. Dimensão não auditada é nula, nunca zero comprovado.

**Cobertura web:** adequada se duas ou mais páginas válidas e pelo menos duas detecções técnicas em rede; parcial se há página válida e evidência; insuficiente se não há material para classificação. Isso é qualidade da cobertura *deste scanner*, não auditoria certificada de CRM/ads.

**Prioridade de foco ABM:** combina nível L2/L3, tier ICP, famílias positivas, cobertura de dados e sinal histórico de prioridade. A nota não mede fragilidade, CAC, eficiência ou receita potencial.

## Resultado atual

- 200 contas inventariadas: 120 L08–L11 e +80 L12 (55 Tier A, 25 Tier B).
- 173 sites com visita técnica válida (107 anteriores e 66 do L12).
- L1: 42; L2: 78; L3: 37; sem evidência: 43.
- 115 contas L2+L3 no foco Velora (+43 na expansão L12).
- Os 80 novos cadastros são **candidatos em pesquisa**, não liberados para outreach sem validar ICP, faturamento e decisores.
- Do lote L12: 2 bloqueios DNS/endereço não público, 7 robots indisponíveis e 5 sem páginas válidas. Isso **não constitui ausência de tag**.
- Resultados técnicos L12: [GitHub Actions 42503399885](https://github.com/bercosta53-commits/Voley-Manager-/actions/runs/42503399885).
- A base de origem foi a planilha Velora 350 candidatas — aba `Mestre · Empresas 05-11`. Inventário Clay/BuiltWith permanece separado dos sinais web atuais. L4 e L5 não são atribuídos sem acesso interno.

## Segurança interpretativa

- Não observado **não significa ausente**.
- Uma tag Google Ads **não comprova campanha ativa ou gasto**.
- Um script RD/HubSpot/Ploomes **não comprova uso de CRM interno nem passagem de leads**.
- Não há prova pública, isoladamente, de integração ou deficiência.
- Resposta HTTP em conversão comprova resposta do endpoint, não persistência e atribuição no CRM.

## Fluxo recomendado

1. Selecionar contas L2/L3 com cobertura adequada.
2. Cruzar com ICP Velora e sinais empresariais independentes, como contratação de liderança de Growth, expansão, mudanças comerciais e timing.
3. Levantar hipóteses de atribuição, lifecycle e operação. Não afirmar problemas sem acesso.
4. Validar com acesso autorizado a GTM Preview, GA4 DebugView, pipeline/UTM no CRM, eventos e campanhas.
5. Só então criar score de maturidade comprovada e recomendar projeto de transformação.

A aba antiga de inventário tecnológico permanece acessível em `/aquisicao/stack`. Dados versionados em `radar_app/data/aquisicao.json`; modelo implementado em `radar_app/lib/aquisicao-maturidade.ts`. A nova página não altera o VSCS ou notas comerciais existentes.
