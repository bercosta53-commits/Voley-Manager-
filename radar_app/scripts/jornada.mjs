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
// Conta Qualificada (D12): o motor grava o campo; aqui a conta da jornada vem qualificada e outra fica pendente
contaAlvo.qualificada = { status: 'sim', desde: '2026-11-20', motivo: 'VSCS e tier dentro da regra CQ-1', regra_versao: 'cq-1' };
base.contas.find(c => c.id !== contaAlvo.id).qualificada = { status: 'desconhecido', pendencias: ['decisor não identificado'] };

// registro compartilhado ligado (radar_acoes em memória no Supabase simulado), com um autor de teste
const AUTOR = 'demo@velora.teste';
const app = await subirApp(base, { env: { RADAR_ACOES: '1', RADAR_AUTOR_TESTE: AUTOR } });
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
  const linhas = await pagina.$$eval('section:has(#tese-da-conta) dl > div', ds => ds.map(d => [d.querySelector('dt').textContent, d.querySelector('dd').textContent]));
  const perguntas = linhas.map(([p]) => p);
  conferir(linhas.length === 6, 'tese com as seis perguntas', perguntas.join(' | '));
  const resposta = p => linhas.find(([q]) => q.startsWith(p))?.[1] ?? '';
  conferir(resposta('Por que agora').includes(sinalAlvo.porQueAgora), '"Por que agora" mostra o fato mais forte', resposta('Por que agora').slice(0, 80));
  if (sinalAlvo.abordar?.nome) conferir(resposta('Com quem falar').includes(sinalAlvo.abordar.nome), '"Com quem falar" mostra a pessoa citada no fato');
  const cabecalhoTese = await pagina.locator('section:has(#tese-da-conta) > div').first().innerText();
  conferir(cabecalhoTese.includes('Qualificada'), 'tese mostra o selo de Conta Qualificada', cabecalhoTese);
  conferir(resposta('Por que a').includes('Conta qualificada desde 20 nov'), 'tese diz desde quando e por quê', resposta('Por que a').slice(0, 120));
  const fimTese = await pagina.locator('#tese-da-conta').evaluate(el => el.closest('section').getBoundingClientRect().bottom);
  conferir(fimTese <= 900, 'tese cabe sem rolar a 1440×900', `termina em ${Math.round(fimTese)} px`);
  // a tela não pode se contradizer: rascunho de mensagem aberto só quando a tese também pede contato
  const temRascunho = (await pagina.locator('#proxima-acao textarea').count()) > 0;
  const tesePedeContato = resposta('Próxima ação').includes('Abrir o rascunho da abordagem');
  conferir(temRascunho === tesePedeContato, 'tese e rascunho concordam sobre abordar agora', `rascunho ${temRascunho}, tese ${tesePedeContato}`);
  // e o caso que já se contradisse: conta sem acaoRecomendada em que a matriz ICP × VSCS não pede contato
  const contaMatriz = base.contas.find(c => !c.acaoRecomendada && c.tier === 'C' && c.score < 70 && porConta.get(c.id)?.length);
  if (contaMatriz) {
    const pm = await navegador.newPage({ viewport: { width: 1440, height: 900 } });
    vigiar(pm);
    await pm.goto(app.url(`/contas/${contaMatriz.id}`), { waitUntil: 'networkidle' });
    await pm.locator('#tese-da-conta').waitFor();
    const rascunhoAberto = (await pm.locator('#proxima-acao textarea').count()) > 0;
    conferir(!rascunhoAberto, 'sem pedido de contato pela matriz, o rascunho fica guardado', contaMatriz.id);
    await pm.close();
  }
  await pagina.screenshot({ path: path.join(SAIDA, '2-tese.png') });

  // 3. Registro: marcar como abordado fecha a caixa da conta e muda a próxima ação
  await pagina.getByRole('button', { name: 'Marcar como abordado' }).click();
  await pagina.getByText('marcado como abordado').waitFor();
  await pagina.reload({ waitUntil: 'networkidle' });
  await pagina.locator('#tese-da-conta').waitFor();
  const acao = await pagina.$$eval('section:has(#tese-da-conta) dl > div', ds => ds.find(d => d.querySelector('dt').textContent === 'Próxima ação')?.querySelector('dd').textContent ?? '');
  conferir(acao.startsWith('Acompanhar a abordagem'), 'depois de abordar, a próxima ação é acompanhar (persiste ao recarregar)', acao.slice(0, 60));

  // 3b. Registro compartilhado: a linha foi gravada com autor, e outro navegador (sem nada local) vê a ação
  const gravada = app.acoes.find(l => l.sinal_id === sinalAlvo.id && l.tipo === 'abordado');
  conferir(gravada?.autor_email === AUTOR && gravada?.conta_id === contaAlvo.id, 'abordado gravado em radar_acoes com autor e conta', JSON.stringify(gravada ?? null));
  const outro = await navegador.newPage({ viewport: { width: 1440, height: 900 } }); // contexto novo: localStorage vazio
  vigiar(outro);
  await outro.goto(app.url(`/contas/${contaAlvo.id}`), { waitUntil: 'networkidle' });
  await outro.locator('#tese-da-conta').waitFor();
  const acaoOutro = await outro.$$eval('section:has(#tese-da-conta) dl > div', ds => ds.find(d => d.querySelector('dt').textContent === 'Próxima ação')?.querySelector('dd').textContent ?? '');
  conferir(acaoOutro.startsWith('Acompanhar a abordagem'), 'outro navegador vê a abordagem feita no primeiro', acaoOutro.slice(0, 60));
  await outro.close();

  // 3d. Andamento da conta: "Reunião" muda a próxima ação, aparece para o time e pode ser desfeito
  const proximaAcao = pg => pg.$$eval('section:has(#tese-da-conta) dl > div', ds => ds.find(d => d.querySelector('dt').textContent === 'Próxima ação')?.querySelector('dd').textContent ?? '');
  await pagina.getByRole('group', { name: 'Andamento da conta' }).getByRole('button', { name: 'Reunião' }).click();
  await pagina.waitForTimeout(500);
  await pagina.reload({ waitUntil: 'networkidle' });
  await pagina.locator('#tese-da-conta').waitFor();
  conferir((await proximaAcao(pagina)).startsWith('Preparar a reunião'), 'andamento "Reunião" muda a próxima ação (persiste ao recarregar)', (await proximaAcao(pagina)).slice(0, 50));
  conferir(app.acoes.some(l => l.conta_id === contaAlvo.id && l.tipo === 'status' && l.status === 'reuniao' && l.autor_email === AUTOR), 'andamento gravado em radar_acoes com autor');
  const blocoSugerido = (await pagina.locator('#proxima-acao').innerText()).trim();
  conferir(blocoSugerido === '', 'com andamento, a próxima ação aparece só na tese (sem bloco repetido)', blocoSugerido.replace(/\s+/g, ' ').slice(0, 80));
  const terceiro = await navegador.newPage({ viewport: { width: 1440, height: 900 } });
  vigiar(terceiro);
  await terceiro.goto(app.url(`/contas/${contaAlvo.id}`), { waitUntil: 'networkidle' });
  await terceiro.locator('#andamento-conta').waitFor();
  const textoAndamento = await terceiro.locator('section:has(#andamento-conta)').innerText();
  conferir(textoAndamento.includes(`Reunião · por ${AUTOR}`), 'outro navegador vê o andamento com autor', textoAndamento.replace(/\s+/g, ' ').slice(0, 90));
  await terceiro.getByRole('group', { name: 'Andamento da conta' }).getByRole('button', { name: 'Reunião' }).click();
  await terceiro.waitForTimeout(500);
  await terceiro.reload({ waitUntil: 'networkidle' });
  await terceiro.locator('#tese-da-conta').waitFor();
  conferir((await proximaAcao(terceiro)).startsWith('Acompanhar a abordagem'), 'clicar de novo desfaz o andamento (sem apagar o registro)', (await proximaAcao(terceiro)).slice(0, 50));
  conferir(app.acoes.some(l => l.tipo === 'status' && l.desfaz_id), 'o desfazer ficou registrado como linha nova');
  await terceiro.close();

  // 3c. A API recusa o que não é válido
  const post = corpo => fetch(app.url('/api/estados'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) }).then(r => r.status);
  conferir((await post({ sinalId: sinalAlvo.id, estado: { acao: 'apagar' } })) === 400, 'API recusa ação desconhecida');
  conferir((await post({ sinalId: 'sinal-que-nao-existe', estado: { acao: 'abordado' } })) === 400, 'API recusa sinal fora da base');
  conferir((await post({ sinalId: sinalAlvo.id, estado: { acao: 'adiado' } })) === 400, 'API recusa adiar sem data');

  // 3f. Visão da liderança (Métricas): lê os cliques do time; a conta abordada sai da lista "sem ação"
  await pagina.goto(app.url('/metricas'), { waitUntil: 'networkidle' });
  await pagina.locator('#visao-lideranca').waitFor();
  const visao = await pagina.locator('section:has(#visao-lideranca)').innerText();
  conferir(visao.includes('Já trabalhadas pelo time') && !visao.includes('depende do registro compartilhado'), 'visão da liderança lê as ações do time');
  const semAcao = await pagina.locator('section:has(#visao-lideranca) ul').first().innerText().catch(() => '');
  conferir(!semAcao.includes(contaAlvo.nome), 'conta já abordada não aparece em "sem nenhuma ação"', semAcao.replace(/\s+/g, ' ').slice(0, 100));

  // 3e. Aba Qualificadas em Contas: aparece porque a base traz o campo, e lista só a conta qualificada
  await pagina.goto(app.url('/contas'), { waitUntil: 'networkidle' });
  await pagina.getByRole('tab', { name: 'Qualificadas', exact: true }).click();
  await pagina.waitForTimeout(300);
  const resumoQ = await pagina.locator('main p').first().innerText();
  conferir(resumoQ.startsWith(`1 de ${base.contas.length}`), 'aba Qualificadas lista só a conta qualificada', resumoQ);

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
