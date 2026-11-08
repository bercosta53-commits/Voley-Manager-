# Velora Radar — L11 (08/11/2026)

## Execução
- Coorte 1: https://github.com/bercosta53-commits/Voley-Manager-/actions/runs/42497294280
- Coorte 2: https://github.com/bercosta53-commits/Voley-Manager-/actions/runs/42497298859
- 19 domínios, 13 cliques testados, 6 inconclusivos; 0 falhas comprovadas.
- 59 empresas distintas já passaram por teste de CTA na amostra acumulada (40 dos L07/L08 + 19 L11).

## Achados com resposta HTTP
- **Pellissari**: Meta Pixel `Lead`, HTTP 200, após clique (ausente no controle).
- **Symmetry Tecnologia**: GA4 `contato-botao-whatsapp`, HTTP 204, após clique (ausente no controle).
- Symmetry também exibiu comandos de consentimento `denied` no dataLayer; isso não prova erro de implementação nem irregularidade.

## Revisão conservadora
- **Tech6**: LinkedIn `collect` sem tipo verificável e Meta `PageView` são eventos genéricos; não constituem conversão confirmada do WhatsApp. A etiqueta original `NETWORK_ESPECIFICA_SEM_ATRIBUICAO` foi corrigida na consolidação L11.
- **Envolti** e **Broadtec**: apenas `gtm.linkClick` no dataLayer; sem comprovação de entrega de conversão.
- Em cinco contas não se observou evento na janela do teste: **inconclusivo**.
- Seis testes não chegaram a completar o clique; **não considerar ausências**.

## Aplicação ABM
Prioridade L08 = prioridade para diagnóstico, nunca índice de deficiência técnica. Não fazer score de fragilidade sem validação autorizada de eventos, campanhas e CRM.

**Sem alterações em produção.** Scanner e evidências permanecem na branch de pesquisa.
