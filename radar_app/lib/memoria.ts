/**
 * P0-8: guarda o resultado de uma leitura cara na memória da instância do Worker por um tempo. Acessos seguintes
 * na mesma instância reaproveitam a base já baixada e interpretada, em vez de gastar CPU a cada requisição (a base
 * real passou de 2,8 MB). Leituras simultâneas com a memória vazia compartilham a mesma busca. Falha nunca fica
 * guardada: a próxima requisição tenta de novo. Testes em scripts/tests/memoria.test.mjs.
 *
 * O valor guardado é compartilhado entre requisições: quem usa não pode alterá-lo. Com `congelar`, ele é
 * congelado em profundidade (os testes ligam isso para pegar qualquer alteração por engano).
 */
export function memoComValidade<T>(
  ler: () => Promise<T>,
  validadeMs: number,
  { agora = () => Date.now(), congelar = false }: { agora?: () => number; congelar?: boolean } = {},
): (() => Promise<T>) & { limpar: () => void } {
  let guardado: { valor: T; ate: number } | null = null;
  let emCurso: Promise<T> | null = null;
  const fn = async () => {
    if (guardado && agora() < guardado.ate) return guardado.valor;
    if (emCurso) return emCurso;
    emCurso = (async () => {
      try {
        const valor = await ler();
        if (congelar) congelarFundo(valor);
        guardado = { valor, ate: agora() + validadeMs };
        return valor;
      } finally {
        emCurso = null;
      }
    })();
    return emCurso;
  };
  return Object.assign(fn, { limpar: () => ((guardado = null), (emCurso = null)) });
}

function congelarFundo(x: unknown) {
  if (x && typeof x === 'object' && !Object.isFrozen(x)) {
    Object.freeze(x);
    for (const v of Object.values(x)) congelarFundo(v);
  }
}
