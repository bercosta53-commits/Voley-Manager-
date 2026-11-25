// Teste da jornada da demonstração, num navegador de verdade (Playwright), contra a base fictícia servida
// por scripts/app-de-teste.mjs. Confere o que o smoke não enxerga, porque Hoje e Conta montam no navegador:
// panorama → lista filtrada, modo apresentação, tese da conta, registro de "abordado", máscara de e-mail,
// e a régua de acabamento (texto ≥ 12 px, sem rolagem horizontal a 360 px, sem erro no console).
//
// Uso: npm run build && npm run jornada   (no CI, o Playwright é instalado sem entrar no package.json)
import { createRequire } from 'node:module';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { baseDeTeste, raiz, subirApp } from './app-de-teste.mjs';

const { chromium } = createRequire(import.meta.url)('playwright');
const SAIDA = path.join(raiz, 'tmp/jornada');
await mkdir(SAIDA, { recursive: true });

const base = await baseDeTeste();
// e-mail em todas as pessoas, para a máscara do modo apresentação ter o que esconder
base.contas = base.contas.map(c => ({ ...c, comite: c.comite.map((p, i) => ({ ...p, email: `pessoa${i}@${c.dominio || 'exemplo.com.br'}` })) }));

// conta da jornada: a de sinal mais forte entre as que têm um único fato, para o "abordado" fechar a caixa dela
const acionaveis = base.sinais.filter(s => !s.exemplo && s.tipo !== 'noticia_setorial');
const porConta = Map.groupBy(acionaveis, s => s.contaId);
const sinalAlvo = acionaveis.filter(s => porConta.get(s.contaId).length === 1).sort((a, b) => b.pontos - a.pontos)[0];
const contaAlvo = base.contas.find(c => c.id === sinalAlvo.contaId);

const app = await subirApp(base);
const navegador = await chromium.launch();
let falhas = 0;
function conferir(ok, descricao, detalhe = '') {
  console.log(`${ok ? 'ok    ' : 'FALHOU'}  ${descricao}${ok || !detalhe ? '' : '  → ' + detalhe}`);
  if (!ok) falhas++;
}
const errosConsole = [];
function vigiar(pagina) {
  pagina.on('pageerror', e => errosConsole.push(`${pagina.url()} · ${e.message}`));
  pagina.on('console', m => {
    // logos vêm de um serviço externo de favicons, inacessível no CI: falha de carga de imagem não é erro do app
    if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errosConsole.push(`${pagina.url()} · ${m.text().slice(0, 160)}`);
  });
}
const menu = pagina => pagina.$$eval('aside nav[aria-label="Seções"] a', as => as.map(a => a.textContent.replace(/\d+$/, '').trim()));

try {
  const pagina = await navegador.newPage({ viewport: { width: 1440, height: 900 } });
  vigiar(pagina);

  // 1. Panorama: abre a demo e cada número leva à lista que ele conta
  await pagina.goto(app.url('/radar?apresentacao=1'), { waitUntil: 'networkidle' });
  conferir(await pagina.getByRole('heading', { name: 'Panorama da base' }).isVisible(), 'panorama visível no Radar');
  conferir(!pagina.url().includes('apresentacao='), 'parâmetro do modo apresentação sai da URL');
  const secoes = await menu(pagina);
  conferir(!secoes.includes('Clima') && !secoes.includes('ICP'), 'modo apresentação tira Clima e ICP do menu', secoes.join(', '));
  const cartao = pagina.locator('section:has(#panorama-base) a', { hasText: 'Em oportunidade' });
  const emOportunidade = Number((await cartao.locator('.vr-data').first().innerText()).replace(/\D/g, ''));
  const esperado = base.contas.filter(c => c.score >= 55).length;
  conferir(emOportunidade === esperado, `"Em oportunidade" conta ${esperado} contas com VSCS ≥ 55`, `mostrou ${emOportunidade}`);
  await cartao.click();
  await pagina.waitForURL(/\/contas\?f=/);
  const resumo = await pagina.locator('main p').first().innerText();
  conferir(resumo.startsWith(`${esperado} de ${base.contas.length}`), 'o clique abre Contas com as mesmas contas', resumo);
  await pagina.screenshot({ path: path.join(SAIDA, '1-contas-filtradas.png') });

  // 2. Tese da conta: as seis perguntas, cabendo na primeira tela
  await pagina.goto(app.url(`/contas/${contaAlvo.id}`), { waitUntil: 'networkidle' });
  await pagina.locator('#tese-da-conta').waitFor();
  const linhas = await pagina.$$eval('#tese-da-conta + dl > div', ds => ds.map(d => [d.querySelector('dt').textContent, d.querySelector('dd').textContent]));
  const perguntas = linhas.map(([p]) => p);
  conferir(linhas.length === 6, 'tese com as seis perguntas', perguntas.join(' | '));
  const resposta = p => linhas.find(([q]) => q.startsWith(p))?.[1] ?? '';
  conferir(resposta('Por que agora').includes(sinalAlvo.porQueAgora), '"Por que agora" mostra o fato mais forte', resposta('Por que agora').slice(0, 80));
  if (sinalAlvo.abordar?.nome) conferir(resposta('Com quem falar').includes(sinalAlvo.abordar.nome), '"Com quem falar" mostra a pessoa citada no fato');
  const fimTese = await pagina.locator('#tese-da-conta').evaluate(el => el.closest('section').getBoundingClientRect().bottom);
  conferir(fimTese <= 900, 'tese cabe sem rolar a 1440×900', `termina em ${Math.round(fimTese)} px`);
  await pagina.screenshot({ path: path.join(SAIDA, '2-tese.png') });

  // 3. Registro: marcar como abordado fecha a caixa da conta e muda a próxima ação
  await pagina.getByRole('button', { name: 'Marcar como abordado' }).click();
  await pagina.getByText('marcado como abordado').waitFor();
  await pagina.reload({ waitUntil: 'networkidle' });
  await pagina.locator('#tese-da-conta').waitFor();
  const acao = await pagina.$$eval('#tese-da-conta + dl > div', ds => ds.find(d => d.querySelector('dt').textContent === 'Próxima ação')?.querySelector('dd').textContent ?? '');
  conferir(acao.startsWith('Acompanhar a abordagem'), 'depois de abordar, a próxima ação é acompanhar (persiste ao recarregar)', acao.slice(0, 60));

  // 4. Decisores no modo apresentação: nenhum e-mail exposto
  await pagina.goto(app.url('/decisores'), { waitUntil: 'networkidle' });
  conferir((await pagina.$$('a[href^="mailto:"]')).length === 0, 'modo apresentação: nenhum link de e-mail em Decisores');
  conferir(!(await pagina.locator('main').innerText()).includes('@'), 'modo apresentação: nenhum endereço de e-mail visível');

  // 5. Desligar o modo pelo selo devolve o menu completo
  await pagina.getByRole('button', { name: /Modo apresentação/ }).first().click();
  conferir((await menu(pagina)).includes('Clima'), 'o selo desliga o modo apresentação');

  // 6. Régua de acabamento nas telas da demo, a 1440 e a 360 px
  const rotas = ['/', '/radar', '/contas', `/contas/${contaAlvo.id}`, '/decisores', '/fontes', '/metricas'];
  for (const largura of [1440, 360]) {
    const p = await navegador.newPage({ viewport: { width: largura, height: 800 } });
    vigiar(p);
    for (const rota of rotas) {
      await p.goto(app.url(rota), { waitUntil: 'networkidle' });
      await p.waitForTimeout(300);
      const r = await p.evaluate(() => {
        const visivel = e => e.offsetParent !== null || getComputedStyle(e).position === 'fixed';
        const pequenos = [...document.querySelectorAll('body *')].filter(
          e => visivel(e) && !e.closest('svg, kbd, [data-logo]') && [...e.childNodes].some(n => n.nodeType === 3 && n.textContent.trim()) && parseFloat(getComputedStyle(e).fontSize) < 12,
        );
        return { pequenos: pequenos.slice(0, 3).map(e => e.textContent.trim().slice(0, 24)), rolagem: document.documentElement.scrollWidth > innerWidth, h1: document.querySelectorAll('h1').length, titulo: document.title };
      });
      const problemas = [r.pequenos.length && `texto < 12 px: ${r.pequenos.join(', ')}`, r.rolagem && 'rolagem horizontal', r.h1 !== 1 && `${r.h1} h1`, !r.titulo.includes('Velora Radar') && `título "${r.titulo}"`].filter(Boolean);
      conferir(!problemas.length, `acabamento ${largura}px ${rota}`, problemas.join('; '));
    }
    await p.close();
  }

  conferir(errosConsole.length === 0, 'nenhum erro no console do navegador', errosConsole.slice(0, 3).join(' || '));
} catch (e) {
  falhas++;
  console.error('FALHOU  a jornada parou:', e.message);
} finally {
  await navegador.close();
  app.parar();
}

console.log(falhas ? `\n${falhas} verificação(ões) falharam. Capturas em tmp/jornada/.` : '\nJornada completa. Capturas em tmp/jornada/.');
if (falhas) console.error(app.log.slice(-3000));
process.exit(falhas ? 1 : 0);
