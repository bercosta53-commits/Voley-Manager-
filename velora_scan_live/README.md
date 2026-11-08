# Velora — piloto técnico de aquisição

Scanner externo de HTML/DOM e requisições do Chromium (Playwright); não lê texto publicitário como evidência de tecnologia, não submete formulários nem clica WhatsApp. Respeita robots.txt; não guarda parâmetros de requisições.

Estados: NETWORK_2XX_3XX (requisição de tag observada com sucesso), HTML_REFERENCED (assinatura no DOM/código), NETWORK_REQUEST_ONLY (requisição iniciada), NOT_OBSERVED_IN_TEST (inconclusivo, não significa ausência), NOT_TESTED (site não auditado). Detecções históricas BuiltWith devem ficar separadas.

Execução: pip install -r velora_scan_live/requirements.txt; python -m playwright install chromium; python velora_scan_live/scan.py --csv velora_scan_live/data/pilot.csv --limit 10

Uma detecção web de HubSpot/RD/Pipedrive/Bitrix não confirma o CRM interno nem a integração do pipeline. Consentimento pode impedir carregamento de tags. O scanner não oferece conclusão sobre desempenho das campanhas.
