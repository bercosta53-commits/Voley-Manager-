function celula(valor: string | number | undefined): string {
  const s = String(valor ?? '');
  return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** ; como separador e BOM UTF-8 — é o que o Excel em pt-BR espera (vírgula já é separador decimal). */
export function baixarCsv(nomeArquivo: string, colunas: string[], linhas: (string | number | undefined)[][]) {
  const conteudo = [colunas, ...linhas].map(l => l.map(celula).join(';')).join('\r\n');
  const blob = new Blob(['﻿' + conteudo], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nomeArquivo;
  a.click();
  URL.revokeObjectURL(url);
}
