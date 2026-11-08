# L10 · Consentimento observado e respostas HTTP no CTA WhatsApp

Data: 08/11/2026. Execução GitHub Actions: https://github.com/bercosta53-commits/Voley-Manager-/actions/runs/42489378538

- 10 de 10 testes controle/clique concluídos, no navegador Chromium.
- 2 eventos comerciais observados com resposta HTTP 200: ASV (Meta Contact), ARX Cyber (Meta Contact).
- 1 requisição de evento comercial iniciada, sem resposta HTTP capturada: Fusion (GA4 RD Popup e WhatsApp).
- 2 eventos comerciais apenas no dataLayer: Softwaresul (RD Popup e WhatsApp), Made4it (contact_link_click).
- 4 apenas sinais genéricos: Cromos IT, DataLakers, Lume, Smart Consulting.
- 1 sem evento observado no teste: Horus (inconclusivo).
- Cromos e Fusion expuseram comandos de consentimento com analytics_storage e ad_storage em denied, sem interação com o banner.
- Horus e Fusion tiveram banner conhecido visível; "não observado" em outros domínios não significa inexistência de CMP.
- 0 falhas funcionais, de campanha, CRM ou integração comprovadas.

Os dados são observações de HTML/DOM e requisições públicas. Não alteramos consentimento, não enviamos mensagens ou formulários. A resposta HTTP comprova que o endpoint respondeu, não que o evento tenha sido atribuído na plataforma ou convertido em oportunidade comercial. Requisições que não responderam podem ser resultado de bloqueio, fechamento da página ou timing.

Uso no Radar: carregar por account_id como evidência de primeira camada, **nunca** como índice de fragilidade comprovada; requer validação autorizada via GTM Preview, GA4 DebugView e CRM.

Scanner: https://github.com/bercosta53-commits/Voley-Manager-/blob/research/velora-live-tags-pilot/velora_scan_live/scan_events_consent.py

O Radar em produção permanece inalterado.
