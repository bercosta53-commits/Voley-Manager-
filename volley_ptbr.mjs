// Canonical Brazilian-volleyball language layer.
// The engine may keep internal taxonomies; every user-facing label should pass through here.
export const PHASE_LABEL = {
  SIDEOUT_ATTACK: 'Virada de bola',
  TRANSITION_ATTACK: 'Contra-ataque',
  FREEBALL_ATTACK: 'Bola de graça',
  SCRAMBLE_ATTACK: 'Bola quebrada'
};
export const ORIGIN_LABEL = {
  FRONT_LEFT: 'Ponta',
  FRONT_MIDDLE: 'Meio',
  FRONT_RIGHT: 'Saída',
  BACK_LEFT: 'Fundo da ponta',
  BACK_MIDDLE: 'Dos três',
  BACK_RIGHT: 'Fundo da saída'
};
export const SET_TYPE_LABEL = {
  QUICK: '1º tempo',
  HIGH: 'Bola alta',
  SHOOT: 'Bola acelerada',
  PIPE: 'Dos três',
  SECOND_BALL: 'De segunda',
  TIP: 'Largada',
  OUT_OF_SYSTEM: 'Bola quebrada'
};
export const DIRECTION_LABEL = {
  LINE: 'Paralela',
  CROSS: 'Diagonal',
  CROSS_SHARP: 'Diagonal curta',
  SEAM: 'Costura',
  DEEP: 'Fundo'
};
export const FINISH_LABEL = {
  BLOCK_OUT: 'Explorou o bloqueio',
  OUTSIDE_HAND: 'Mão de fora',
  BLOCK_DEFLECTION: 'Desvio no bloqueio',
  RECYCLE: 'Rejogou no bloqueio',
  TIP: 'Largada'
};
export const INFRACTION_LABEL = {
  doubleContact: 'DOIS TOQUES',
  carry: 'CONDUÇÃO',
  fourTouches: 'QUATRO TOQUES',
  netTouch: 'REDE',
  underNet: 'INVASÃO',
  overNet: 'INVASÃO',
  antenna: 'ANTENA',
  serviceFootFault: 'PISOU NA LINHA',
  backRowAttack: 'LINHA DOS 3 M'
};
export const PASS_LABEL = {
  0: 'ERRO RECEPÇÃO',
  1: 'Passe estourado',
  2: 'Passe quebrado',
  3: 'Passe positivo',
  4: 'Passe na mão'
};
export const PASS_GRADE_LABEL = {
  ERROR: 'ERRO RECEPÇÃO',
  BURST: 'Passe estourado',
  BROKEN: 'Passe quebrado',
  OFF_NET: 'Tirou da rede',
  POSITIVE: 'Passe positivo',
  ON_HAND: 'Passe na mão'
};
export const ENGINE_TERMS = {
  sideout: 'Virada de bola',
  break: 'Conversão com saque',
  serviceRun: 'Passagem no saque'
};

export function passLabel(q) {
  if (q && typeof q === 'object') return PASS_GRADE_LABEL[q.passGrade] || PASS_LABEL[q.quality] || 'Passe quebrado';
  if (typeof q === 'string') return PASS_GRADE_LABEL[q] || 'Passe quebrado';
  return PASS_LABEL[q] || 'Passe quebrado';
}
export function phaseLabel(k) {
  return PHASE_LABEL[k] || '';
}
export function originLabel(k) {
  return ORIGIN_LABEL[k] || '';
}
export function setTypeLabel(k) {
  return SET_TYPE_LABEL[k] || '';
}
export function directionLabel(k) {
  return DIRECTION_LABEL[k] || '';
}
export function finishLabel(k) {
  return FINISH_LABEL[k] || '';
}
export function infractionLabel(k) {
  return INFRACTION_LABEL[k] || String(k || 'INFRAÇÃO').toUpperCase();
}

function firstName(p) {
  return p?.name?.split(' ')[0] || 'Atleta';
}
function lastAttack(e) {
  return [...(e.steps || [])].reverse().find(s => s.type === 'attack');
}
function lastSet(e) {
  return [...(e.steps || [])].reverse().find(s => s.type === 'set');
}
function stepBy(e, type) {
  return [...(e.steps || [])].reverse().find(s => s.type === type);
}
function playerFrom(lookup, id) {
  try {
    return lookup(id);
  } catch {
    return null;
  }
}
function attackResource(a) {
  if (!a) return '';
  if (a.finish && FINISH_LABEL[a.finish]) return FINISH_LABEL[a.finish];
  if (a.setType === 'SECOND_BALL') return SET_TYPE_LABEL.SECOND_BALL;
  if (a.setType === 'QUICK') return SET_TYPE_LABEL.QUICK;
  // "Dos três" is already the origin; do not repeat it as a resource.
  if (a.setType === 'OUT_OF_SYSTEM') return SET_TYPE_LABEL.OUT_OF_SYSTEM;
  return DIRECTION_LABEL[a.direction] || DIRECTION_LABEL[a.zoneCode] || '';
}
function attackLine(a, lookup, result) {
  const p = playerFrom(lookup, a.player),
    name = firstName(p),
    origin = ORIGIN_LABEL[a.origin] || '',
    resource = attackResource(a);
  if (a.setType === 'SECOND_BALL') {
    const secondBall = SET_TYPE_LABEL.SECOND_BALL;
    return `${name} · ${secondBall}${resource && resource !== secondBall ? ' · ' + resource : ''} — ${result}`;
  }
  return [name, origin, resource].filter(Boolean).join(' · ') + ` — ${result}`;
}

export function feedLine(e, lookup) {
  if (!e) return '';
  const inf = e.infraction || stepBy(e, 'infraction'),
    a = lastAttack(e);
  if (inf) {
    const type = inf.infractionType || inf.typeKey,
      p = playerFrom(lookup, inf.player),
      name = firstName(p),
      label = infractionLabel(type),
      action =
        inf.action === 'BLOCK'
          ? 'Bloqueio'
          : inf.action === 'ATTACK'
            ? originLabel(inf.origin) || 'Ataque'
            : inf.action === 'SET'
              ? 'Levantamento'
              : '';
    if (type === 'serviceFootFault') return `INFRAÇÃO SAQUE · ${name} — ${label}`;
    if (type === 'antenna') {
      const ap = playerFrom(lookup, a?.player || inf.player),
        origin = originLabel(a?.origin || inf.origin);
      return `ERRO ATAQUE · ${firstName(ap)}${origin ? ' · ' + origin : ''} — ANTENA`;
    }
    if (type === 'fourTouches') return 'INFRAÇÃO · QUATRO TOQUES';
    if (type === 'backRowAttack')
      return `INFRAÇÃO · ${name}${inf.origin ? ' · ' + originLabel(inf.origin) : ''} — ${label}`;
    return `INFRAÇÃO · ${name}${action ? ' · ' + action : ''} — ${label}`;
  }
  const serveErr = stepBy(e, 'serveError');
  if (serveErr) {
    const p = playerFrom(lookup, serveErr.player);
    return `ERRO SAQUE · ${firstName(p)} — ${serveErr.detail === 'NET' ? 'REDE' : 'FORA'}`;
  }
  const defErr = stepBy(e, 'defenseError');
  if (defErr) {
    const p = playerFrom(lookup, defErr.player);
    return `ERRO DEFESA · ${firstName(p)} — NÃO CONTROLOU`;
  }
  if (e.reason === 'Ace') {
    const rec = stepBy(e, 'receive');
    if (rec) {
      const rp = playerFrom(lookup, rec.player);
      return `ERRO RECEPÇÃO · ${firstName(rp)} — ACE`;
    }
    const ace = stepBy(e, 'ace'),
      p = playerFrom(lookup, ace?.player);
    return `ACE · ${firstName(p)}`;
  }
  if (e.reason === 'Bloqueio ponto') {
    const blocker = playerFrom(lookup, e.actor),
      attacker = playerFrom(lookup, a?.player),
      origin = originLabel(a?.origin),
      kind = a?.nblock === 1 ? 'Bloqueio simples' : 'Toco';
    if (a && attacker)
      return `${firstName(blocker)} · ${kind} em ${firstName(attacker)}${origin ? ' · ' + origin : ''} — PONTO`;
    return `${firstName(blocker)} · ${kind} — PONTO`;
  }
  if (a) {
    if (a.outcome === 'kill' || a.outcome === 'faultWin' || a.outcome === 'defenseError')
      return attackLine(a, lookup, 'PONTO');
    if (a.outcome === 'blocked') return attackLine(a, lookup, 'BLOQUEADO');
    if (a.outcome === 'error') {
      const p = playerFrom(lookup, a.player),
        name = firstName(p),
        origin = ORIGIN_LABEL[a.origin] || '',
        detail =
          { OUT: 'FORA', NET: 'REDE', ANTENNA: 'ANTENA', BACK_ROW_ATTACK: 'LINHA DOS 3 M' }[a.errorDetail] || 'FORA';
      return `ERRO ATAQUE · ${name}${origin ? ' · ' + origin : ''} — ${detail}`;
    }
  }
  if (e.reason === 'Erro de levantamento') {
    const set = lastSet(e),
      p = playerFrom(lookup, set?.player);
    return `ERRO LEVANTAMENTO · ${firstName(p)}`;
  }
  return e.reason || 'Rally';
}

export function notableFeedLine(e, lookup) {
  const spec = e?.spectacularEvents || [],
    d = e?.sameRallyDigs;
  if ((e?.streaks?.consecutiveAces || 0) >= 3) return `${e.streaks.consecutiveAces} ACES SEGUIDOS!`;
  if ((e?.streaks?.consecutiveBlocks || 0) >= 3) return `${e.streaks.consecutiveBlocks} BLOQUEIOS SEGUIDOS!`;
  if ((d?.count || 0) >= 4) return `${d.count} DEFESAS · ${firstName(playerFrom(lookup, d.playerId))}`;
  if (spec.includes('EXTERNAL_ANTENNA_SAVE')) return 'BUSCOU POR FORA DA ANTENA!';
  if (spec.includes('DIG_FOOT')) return 'SALVOU COM O PÉ!';
  if (spec.includes('OUTSIDE_COURT_SAVE')) return 'BUSCOU FORA DA QUADRA!';
  if (spec.includes('CHASE_SAVE')) return 'FOI BUSCAR!';
  if (spec.includes('DIG_DIVING')) return 'QUE PEIXINHO!';
  if (spec.includes('DIG_ONE_HAND')) return 'DEFESA DE UMA MÃO!';
  if (spec.includes('DIG_REFLEX')) return 'QUE DEFESA!';
  if (spec.includes('IMPOSSIBLE_BLOCK_OUT')) return 'ACHOU O ÂNGULO NO TRIPLO!';
  if (spec.includes('TRIPLE_BLOCK_KILL')) return 'CONTRA O TRIPLO!';
  if (spec.includes('SINGLE_BLOCK_KILL')) return 'SOZINHO NO BLOQUEIO!';
  if (spec.includes('SECOND_BALL_SURPRISE'))
    return `${firstName(playerFrom(lookup, e.actor)).toUpperCase()} DE SEGUNDA!`;
  if (spec.includes('EXTREME_TIP')) return 'LARGADA NA HORA CERTA!';
  const r = (e?.steps || []).find(s => s.type === 'attack' && s.finish === 'RECYCLE');
  if (r) {
    const p = playerFrom(lookup, r.player),
      origin = originLabel(r.origin);
    return `${firstName(p)}${origin ? ' · ' + origin : ''} · Rejogou no bloqueio`;
  }
  const rec = (e?.steps || []).find(s => s.type === 'receive' && !s.error && ['BROKEN', 'BURST'].includes(s.passGrade));
  if (rec) {
    const p = playerFrom(lookup, rec.player);
    return `${passLabel(rec).toUpperCase()} · ${firstName(p)}`;
  }
  return '';
}

export function phaseCue(e) {
  const a = lastAttack(e);
  if (!a) return '';
  return PHASE_LABEL[a.phase] || '';
}

export function decisiveCue(e) {
  if (!e?.context) return '';
  if (e.context.matchPointBefore) return 'MATCH POINT';
  if (e.context.setPointBefore) return 'SET POINT';
  return '';
}

export function attackDescription(a) {
  if (!a) return '';
  return [ORIGIN_LABEL[a.origin], SET_TYPE_LABEL[a.setType], FINISH_LABEL[a.finish], DIRECTION_LABEL[a.direction]]
    .filter(Boolean)
    .join(' · ');
}
