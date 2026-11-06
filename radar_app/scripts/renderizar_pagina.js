// Helper interno do coletor de vagas (coletar_vagas.py): renderiza uma página que só mostra vaga depois
// de rodar o JS (Gupy e outros ATS de SPA) e imprime o HTML já renderizado no stdout. Não lê vaga nenhuma
// sozinho — só devolve o HTML pra o classificador em Python reaproveitar a mesma lógica da página estática.
//
// uso: node scripts/renderizar_pagina.js <url>
// saída: HTML no stdout (exit 0) ou nada no stdout (exit 1) se não conseguiu carregar.

const { chromium } = require('playwright');

async function main() {
  const url = process.argv[2];
  if (!url) {
    process.exit(1);
  }
  let browser;
  try {
    browser = await chromium.launch();
    const page = await browser.newPage({
      userAgent: 'Mozilla/5.0 (compatible; VeloraRadar/1.0; coletor de vagas; uso interno)',
    });
    await page.goto(url, { waitUntil: 'networkidle', timeout: 15000 });
    const html = await page.content();
    process.stdout.write(html);
  } catch {
    process.exit(1);
  } finally {
    if (browser) await browser.close();
  }
}

main();
