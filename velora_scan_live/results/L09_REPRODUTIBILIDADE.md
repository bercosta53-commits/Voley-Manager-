# Velora — L09: repetibilidade dos sinais de conversão (08/11/2026)

## Auditoria executada
- 120 contas no inventário, 119 domínios submetidos ao scanner e 107 sites efetivamente auditados.
- 40 contas com teste CTA por controle (L07–L08); 32 cliques concluídos.
- L09 repetiu os testes em **10 contas duas vezes cada**: 20 cliques concluídos e classificações consistentes entre as repetições.
- Executado no mesmo runner GitHub Actions/Chromium, sem aceitar consentimento nem enviar formulários ou mensagens.
- **0 deficiências funcionais ou ausências de CRM comprovadas.**

## Resultado por conta
| Conta | Conclusão repetida | Evidência |
|---|---|---|
| Fusion | indício comercial | GA4: RD Popup e WhatsApp |
| ASV | indício comercial | Meta Pixel: Contact |
| ARX Cyber | indício comercial | Meta Pixel: Contact |
| Made4it | indício comercial | GA4: contact_link_click |
| Smart Consulting | evento específico sem atribuição confirmada | GA4: Site Smart |
| Cromos IT | somente dataLayer genérico | gtm.linkClick |
| DataLakers | somente chamadas genéricas | GA4: page_view |
| Lume Tecnologia | somente dataLayer genérico | gtm.linkClick |
| Horus Solutions | nenhum evento observado | INCONCLUSIVO |
| Softwaresul | nenhum evento observado | INCONCLUSIVO |

**Interpretação:** em eventos específicos, o navegador observou início de requisições após o clique ausentes no controle; isso não prova entrega, atribuição no CRM/Ads ou causalidade definitiva. O repeat no mesmo ambiente não valida outras regiões ou estados de consentimento. Ausência observada jamais significa falta de ferramenta.

Fontes:
- https://github.com/bercosta53-commits/Voley-Manager-/actions/runs/42487472937
- https://github.com/bercosta53-commits/Voley-Manager-/actions/runs/42487476145

## Modelo de pontuação
- **Fit ABM** e **prioridade de diagnóstico técnico** são dimensões distintas.
- L08 score considera famílias de sinais atenuadas, mas não é índice de fragilidade.
- L09 acrescenta **cobertura observacional**, não uma nota de maturidade: 65 em dois retestes coerentes, 35 se somente clique anterior, 15 se apenas HTML/rede.
- Tags Google Ads não provam campanhas ativas. Scripts de CRM web não provam CRM interno nem integração comercial.
- Próxima validação segura: consentimento, IDs de tags, trigger de CTA, resposta e destino da conversão, UTM e mapeamento no CRM, em ambiente autorizado.

Sem merge ou modificação do Radar em produção.
