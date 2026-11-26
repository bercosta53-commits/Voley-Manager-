'use client';

import { useEffect, useSyncExternalStore } from 'react';

/**
 * Modo apresentação: preferência deste navegador, ligada sem novo deploy.
 * Liga com `?apresentacao=1` (ou pelo selo no menu), desliga com `?apresentacao=0` ou pelo mesmo selo.
 * Esconde do menu e da busca o que não entra na demo, mascara e-mails e tira da tela o controle que
 * altera o score. As rotas continuam acessíveis por endereço: é foco de tela, não controle de acesso.
 */
const CHAVE = 'vr:apresentacao';
const EVENTO = 'vr:apresentacao';

/** Clima (dados simulados) e ICP (simulador de regras) ficam fora do roteiro da demo. */
// Fontes é tela de operação (estado dos coletores), não de produto: fica fora da demo, como Clima e ICP
export const SECOES_FORA_DA_APRESENTACAO = ['/clima', '/icp', '/fontes'];

function ler() {
  try {
    return localStorage.getItem(CHAVE) === '1';
  } catch {
    return false;
  }
}

function assinar(avisar: () => void) {
  window.addEventListener('storage', avisar);
  window.addEventListener(EVENTO, avisar);
  return () => {
    window.removeEventListener('storage', avisar);
    window.removeEventListener(EVENTO, avisar);
  };
}

export function definirApresentacao(ligado: boolean) {
  try {
    if (ligado) localStorage.setItem(CHAVE, '1');
    else localStorage.removeItem(CHAVE);
  } catch {
    /* navegador sem armazenamento: o modo não persiste */
  }
  window.dispatchEvent(new Event(EVENTO));
}

/** true com o modo ligado. No servidor e na primeira pintura é sempre false. */
export function useApresentacao() {
  return useSyncExternalStore(assinar, ler, () => false);
}

/** Aplica `?apresentacao=1|0` da URL e tira o parâmetro do endereço. */
export function useParametroApresentacao() {
  useEffect(() => {
    const url = new URL(location.href);
    const valor = url.searchParams.get('apresentacao');
    if (valor === null) return;
    definirApresentacao(valor === '1');
    url.searchParams.delete('apresentacao');
    history.replaceState(history.state, '', url.pathname + url.search + url.hash);
  }, []);
}

/** "helena.duarte@aurora.coop.br" → "he•••@aurora.coop.br": a empresa fica visível, a pessoa não. */
export function mascararEmail(email: string) {
  const [usuario, dominio] = email.split('@');
  if (!dominio) return '•••';
  return `${usuario.slice(0, 2)}•••@${dominio}`;
}
