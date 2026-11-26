/**
 * Envio de e-mail do resumo diário (P2-12) pela API HTTP da Resend (plano gratuito: 3.000/mês, 100/dia).
 * Sem SDK: um fetch. A chave fica como segredo do Worker (RESEND_API_KEY), nunca no repositório.
 * Outro provedor com API HTTP parecida troca só esta função. Testes em scripts/tests/resumo.test.mjs.
 */

const EMAIL = /^[^\s@<>,;]+@[^\s@<>,;]+\.[^\s@<>,;]+$/;

/** "a@x.com, b@y.com" → lista válida; endereço malformado é descartado (e contado), nunca enviado. */
export function destinatarios(lista: string | undefined): { validos: string[]; descartados: number } {
  const itens = (lista ?? '').split(/[,;\s]+/).map(s => s.trim()).filter(Boolean);
  const validos = [...new Set(itens.filter(e => EMAIL.test(e)))];
  return { validos, descartados: itens.length - validos.length };
}

export interface ConfigResumo {
  ligado: boolean;
  para: string[];
  de: string;
  chave: string;
}

/** O que falta para enviar; vazio = pronto. Nunca devolve valores, só nomes. */
export function faltando(c: ConfigResumo): string[] {
  const f: string[] = [];
  if (!c.ligado) f.push('RESUMO_DIARIO=1');
  if (!c.para.length) f.push('RESUMO_PARA');
  if (!c.de) f.push('RESUMO_DE');
  if (!c.chave) f.push('RESEND_API_KEY');
  return f;
}

export async function enviarEmail(
  c: ConfigResumo,
  msg: { assunto: string; html: string; texto: string },
  fetchFn: typeof fetch = fetch,
): Promise<{ ok: true; id?: string } | { ok: false; status: number }> {
  const r = await fetchFn('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${c.chave}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: c.de, to: c.para, subject: msg.assunto, html: msg.html, text: msg.texto }),
  });
  if (!r.ok) return { ok: false, status: r.status };
  const corpo = (await r.json().catch(() => ({}))) as { id?: string };
  return { ok: true, id: corpo.id };
}
