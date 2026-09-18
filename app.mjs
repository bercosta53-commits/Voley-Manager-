import {
  clubs,
  players,
  lineup,
  defaultTactics,
  createMatch,
  rally,
  finish,
  stats,
  pct,
  POS,
  substitute,
  takeTimeout,
  coaches,
  coachDecision,
  heightFor,
  athleteLabel,
  matchTactics,
  focusLoad,
  focusTalk,
  matchContext,
  arenaFor,
  ensureServeIdentity,
  serveStyleLabel,
  playerLiveState,
  playerStateSnapshot,
  playerStateTimeline,
  roleLabel,
  activeSix,
  selectiveServers,
  teamStyle,
  crowdProfile,
  benchmarkTactics,
  canonicalAthleteMeta,
  applySpecialPlayerProfile,
  TRIBUTE_PLAYER_ID
} from './engine.mjs';
import { phase, matchStories, highlights, form, playerStory, rivalry, matchContextText } from './narrative.mjs';
import { leagueStats, lanes, advice, setterMetrics } from './intelligence.mjs';
import { feedLine, notableFeedLine, phaseCue, originLabel, infractionLabel, passLabel } from './volley_ptbr.mjs';
let benchTab = 'analyst',
  benchPage = 0,
  benchStamp = '';
const benchReviews = new WeakMap();
const clamp = (n, a, b) => Math.max(a, Math.min(b, n)),
  $ = s => document.querySelector(s),
  money = v => 'R$ ' + Math.round(v).toLocaleString('pt-BR'),
  names = { LEV: 'Levantador', PON: 'Ponteiro', CEN: 'Central', OPO: 'Oposto', LIB: 'Líbero' },
  attrs = {
    attack: 'Ataque',
    serve: 'Saque',
    receive: 'Recepção',
    block: 'Bloqueio',
    set: 'Levantamento',
    defense: 'Defesa',
    stamina: 'Resistência',
    mental: 'Pressão',
    consistency: 'Consistência'
  },
  key = 'volley-manager-brasil-liga8-v2';
const fixtures = [
  [
    [0, 7],
    [6, 1],
    [2, 5],
    [4, 3]
  ],
  [
    [6, 0],
    [7, 5],
    [4, 1],
    [2, 3]
  ],
  [
    [0, 5],
    [4, 6],
    [7, 3],
    [2, 1]
  ],
  [
    [4, 0],
    [5, 3],
    [2, 6],
    [7, 1]
  ],
  [
    [0, 3],
    [2, 4],
    [5, 1],
    [7, 6]
  ],
  [
    [2, 0],
    [3, 1],
    [7, 4],
    [5, 6]
  ],
  [
    [0, 1],
    [7, 2],
    [3, 6],
    [5, 4]
  ],
  [
    [7, 0],
    [1, 6],
    [5, 2],
    [3, 4]
  ],
  [
    [0, 6],
    [5, 7],
    [1, 4],
    [3, 2]
  ],
  [
    [5, 0],
    [6, 4],
    [3, 7],
    [1, 2]
  ],
  [
    [0, 4],
    [3, 5],
    [6, 2],
    [1, 7]
  ],
  [
    [3, 0],
    [4, 2],
    [1, 5],
    [6, 7]
  ],
  [
    [0, 2],
    [1, 3],
    [4, 7],
    [6, 5]
  ],
  [
    [1, 0],
    [2, 7],
    [6, 3],
    [4, 5]
  ]
];
function syncCanonicalRoster(v) {
  if (!v || typeof v !== 'object') return fresh();
  if (!Array.isArray(v.all) || v.all.length < 56) {
    console.warn('Save sem elenco válido; mantendo uma carreira limpa em vez de interromper o boot.');
    return fresh();
  }
  try {
    for (let p of v.all) {
      if (!p || typeof p !== 'object') continue;
      let meta = canonicalAthleteMeta(p.id);
      if (meta) Object.assign(p, meta);
      if (Number(p.id) === TRIBUTE_PLAYER_ID) applySpecialPlayerProfile(p, { preserveDynamic: true });
    }
    v.results = Array.isArray(v.results) ? v.results : [];
    v.observed = Array.isArray(v.observed) ? v.observed : [];
    v.scout = v.scout && typeof v.scout === 'object' ? v.scout : {};
    v.development = v.development && typeof v.development === 'object' ? v.development : {};
    v.developmentLog = Array.isArray(v.developmentLog) ? v.developmentLog : [];
    v.contracts = v.contracts && typeof v.contracts === 'object' ? v.contracts : {};
    v.market = v.market && typeof v.market === 'object' ? v.market : {};
    v.lines = v.lines && typeof v.lines === 'object' ? v.lines : {};
    v.tactics = v.tactics && typeof v.tactics === 'object' ? v.tactics : {};

    for (let c of clubs) {
      let line = v.lines[c.id];
      let valid = Array.isArray(line) && line.length === 7;
      if (!valid) v.lines[c.id] = lineup(v.all, c.id);
      if (!v.tactics[c.id]) v.tactics[c.id] = defaultTactics(c.id);
    }

    let line = [...(v.lines[0] || lineup(v.all, 0))];
    if (line.includes(TRIBUTE_PLAYER_ID) && line[1] !== TRIBUTE_PLAYER_ID) {
      let other = line.indexOf(TRIBUTE_PLAYER_ID);
      [line[1], line[other]] = [line[other], line[1]];
    } else line[1] = TRIBUTE_PLAYER_ID;

    let used = new Set();
    for (let i = 0; i < POS.length; i++) {
      let pid = line[i];
      let valid = v.all.find(p => p && p.id === pid && p.club === 0 && p.pos === POS[i] && !used.has(pid));
      if (!valid) {
        let replacement =
          i === 1
            ? v.all.find(p => p && p.id === TRIBUTE_PLAYER_ID)
            : v.all.find(p => p && p.club === 0 && p.pos === POS[i] && !used.has(p.id) && p.id !== TRIBUTE_PLAYER_ID);
        if (!replacement) replacement = v.all.find(p => p && p.club === 0 && p.pos === POS[i] && !used.has(p.id));
        if (replacement) line[i] = replacement.id;
      }
      used.add(line[i]);
    }
    v.lines[0] = line;
    return v;
  } catch (err) {
    console.error('Falha ao migrar elenco V16; iniciando sem bloquear a interface.', err);
    return fresh();
  }
}
function syncCanonicalActiveMatch(m) {
  if (!m || typeof m !== 'object' || !Array.isArray(m.teams)) return m || null;
  try {
    for (let side of m.teams) {
      if (!Array.isArray(side)) continue;
      for (let p of side) {
        if (!p || typeof p !== 'object') continue;
        let meta = canonicalAthleteMeta(p.id);
        if (meta) Object.assign(p, meta);
        if (Number(p.id) === TRIBUTE_PLAYER_ID) applySpecialPlayerProfile(p, { preserveDynamic: true });
      }
    }
    m.events = Array.isArray(m.events) ? m.events : [];
    m.decisions = Array.isArray(m.decisions) ? m.decisions : [];
    return m;
  } catch (err) {
    console.error('Partida ativa antiga incompatível; ela será ignorada sem bloquear o jogo.', err);
    return null;
  }
}

const AI_DEVELOPMENT_FOCUS = {
  0: ['tactical', 'receive'],
  1: ['block', 'attack'],
  2: ['serve', 'attack'],
  3: ['defense', 'receive'],
  4: ['receive', 'defense'],
  5: ['block', 'serve'],
  6: ['tactical', 'receive'],
  7: ['attack', 'serve']
};
function devRand(id, salt = 0) {
  let x = Math.sin((id + 17) * 12.9898 + (salt + 3) * 78.233) * 43758.5453;
  return x - Math.floor(x);
}
function developmentGapFor(p) {
  if (Number(p.id) === TRIBUTE_PLAYER_ID) return 1.0;
  let r = devRand(p.id, 71);
  if (p.age <= 20) return 7 + r * 7;
  if (p.age <= 22) return 5 + r * 6;
  if (p.age <= 25) return 3 + r * 5;
  if (p.age <= 28) return 1.8 + r * 3.6;
  if (p.age <= 31) return 0.8 + r * 2.3;
  return r * 1.25;
}
function ensureDevelopmentState(v = state) {
  v.development = v.development && typeof v.development === 'object' ? v.development : {};
  v.developmentLog = Array.isArray(v.developmentLog) ? v.developmentLog : [];
  for (let p of v.all || []) {
    let rec = v.development[p.id];
    if (!rec || typeof rec !== 'object') {
      let base = overall(p),
        gap = developmentGapFor(p);
      rec = {
        playerId: p.id,
        baselineOvr: base,
        ceiling: Math.min(97, base + gap),
        adaptation: 0.88 + devRand(p.id, 93) * 0.24,
        rounds: 0,
        appearances: 0,
        starts: 0,
        touches: 0,
        gains: {},
        trainingGains: {},
        matchGains: {},
        recent: [],
        lastGain: {},
        createdRound: Number(v.round || 0)
      };
      v.development[p.id] = rec;
    } else {
      rec.gains = rec.gains && typeof rec.gains === 'object' ? rec.gains : {};
      rec.trainingGains = rec.trainingGains && typeof rec.trainingGains === 'object' ? rec.trainingGains : {};
      rec.matchGains = rec.matchGains && typeof rec.matchGains === 'object' ? rec.matchGains : {};
      rec.recent = Array.isArray(rec.recent) ? rec.recent : [];
      rec.lastGain = rec.lastGain && typeof rec.lastGain === 'object' ? rec.lastGain : {};
      rec.adaptation = Number.isFinite(rec.adaptation) ? rec.adaptation : 0.88 + devRand(p.id, 93) * 0.24;
      rec.ceiling = Number.isFinite(rec.ceiling) ? rec.ceiling : Math.min(97, overall(p) + developmentGapFor(p));
      rec.baselineOvr = Number.isFinite(rec.baselineOvr) ? rec.baselineOvr : overall(p);
    }
  }
  return v.development;
}
function developmentRecord(p) {
  ensureDevelopmentState(state);
  return state.development[p.id];
}
function developmentRoom(p) {
  let r = developmentRecord(p);
  return Math.max(0, r.ceiling - overall(p));
}
function developmentPotentialFactor(p) {
  let room = developmentRoom(p);
  if (room >= 7) return 1.22;
  if (room >= 4) return 1.03;
  if (room >= 2) return 0.82;
  if (room >= 0.7) return 0.56;
  return 0.26;
}
function developmentAgeFactor(p) {
  if (p.age <= 20) return 1.34;
  if (p.age <= 22) return 1.2;
  if (p.age <= 25) return 1.02;
  if (p.age <= 28) return 0.78;
  if (p.age <= 31) return 0.52;
  if (p.age <= 34) return 0.3;
  return 0.16;
}
function trackDevelopmentGain(p, key, delta, source = 'match') {
  if (!delta || delta <= 0) return;
  let r = developmentRecord(p);
  r.gains[key] = (r.gains[key] || 0) + delta;
  let bucket = source === 'training' ? r.trainingGains : r.matchGains;
  bucket[key] = (bucket[key] || 0) + delta;
}
function developmentRoleMap(p) {
  if (p.pos === 'LEV') return { set: 0.36, defense: 0.15, serve: 0.1, mental: 0.22, consistency: 0.17 };
  if (p.pos === 'LIB') return { receive: 0.31, defense: 0.31, mental: 0.2, consistency: 0.18 };
  if (p.pos === 'CEN') return { attack: 0.2, block: 0.3, serve: 0.1, defense: 0.08, mental: 0.17, consistency: 0.15 };
  if (p.pos === 'OPO')
    return { attack: 0.29, serve: 0.17, block: 0.16, defense: 0.07, mental: 0.16, consistency: 0.15 };
  return { attack: 0.21, receive: 0.2, serve: 0.11, block: 0.08, defense: 0.13, mental: 0.14, consistency: 0.13 };
}
function matchParticipation(m, p) {
  if (!m || !Array.isArray(m.events) || !m.events.length) return { exposure: 0.08, touches: 0, starter: false };
  let side = m.home === p.club ? 0 : m.away === p.club ? 1 : null;
  if (side === null) return { exposure: 0.08, touches: 0, starter: false };
  let starter = (m.teams?.[side] || []).some(x => x.id === p.id);
  let touches = 0,
    sets = new Set();
  for (let e of m.events)
    for (let s of e.steps || [])
      if (Number(s.player) === p.id) {
        touches++;
        sets.add(e.set);
      }
  let subbed = (m.decisions || []).some(d => d.type === 'sub' && (Number(d.in) === p.id || Number(d.out) === p.id));
  let exposure = starter ? 0.84 : subbed ? 0.42 : touches ? 0.3 : 0.07;
  exposure += Math.min(0.16, touches / 70);
  if (sets.size >= 3) exposure += 0.04;
  return { exposure: clamp(exposure, 0.05, 1), touches, starter };
}
function applyRoundDevelopment(roundMatches, round) {
  ensureDevelopmentState(state);
  let report = [];
  for (let p of state.all) {
    let m = roundMatches.find(x => x.home === p.club || x.away === p.club),
      part = matchParticipation(m, p),
      r = developmentRecord(p);
    let age = developmentAgeFactor(p),
      potential = developmentPotentialFactor(p),
      context = clamp(
        0.72 + (p.morale - 55) * 0.004 + (p.chemistry - 55) * 0.003 + (p.consistency - 55) * 0.0025,
        0.72,
        1.12
      );
    let decisive = m?.setScores?.length === 5 ? 1.1 : 1,
      base = 0.19 * age * potential * r.adaptation * context * (0.28 + part.exposure * 0.72) * decisive;
    let weights = developmentRoleMap(p),
      last = {},
      total = 0;
    for (let [key, share] of Object.entries(weights)) {
      let current = Number(p[key] || 0),
        diminishing = clamp((99 - current) / 29, 0.16, 1),
        gain = base * share * diminishing * trainingNoise(p.id, round, 181 + Object.keys(attrs).indexOf(key));
      if (key === 'mental' && m?.setScores?.length === 5) gain *= 1.18;
      if (gain < 0.004) continue;
      let next = clamp(current + gain, 15, 97);
      if (key === 'block') next = Math.min(next, physicalBlockCap(p));
      let actual = next - current;
      if (actual <= 0) continue;
      p[key] = next;
      last[key] = actual;
      total += actual;
      trackDevelopmentGain(p, key, actual, 'match');
    }
    r.rounds++;
    if (part.exposure >= 0.28) r.appearances++;
    if (part.starter) r.starts++;
    r.touches += part.touches;
    r.lastGain = last;
    r.recent.push({ round, total, exposure: part.exposure, touches: part.touches });
    r.recent = r.recent.slice(-5);
    report.push({ id: p.id, total, exposure: part.exposure, room: developmentRoom(p) });
  }
  state.developmentLog.push({ round, type: 'match', top: report.sort((a, b) => b.total - a.total).slice(0, 8) });
  state.developmentLog = state.developmentLog.slice(-40);
  return report;
}
function applyAiBackgroundTraining(round) {
  ensureDevelopmentState(state);
  for (let c of clubs) {
    if (c.id === state.club) continue;
    let [primary, secondary] = AI_DEVELOPMENT_FOCUS[c.id] || ['fundamentals', 'tactical'],
      roster = state.all.filter(p => p.club === c.id);
    if (!roster.length) continue;
    let teamQuality = clamp(
      0.74 +
        meanRoster(roster, 'morale') * 0.0014 +
        meanRoster(roster, 'chemistry') * 0.0015 +
        meanRoster(roster, 'mental') * 0.0012,
      0.78,
      1.02
    );
    for (let p of roster) {
      applyTrainingFocus(p, primary, 0.58, teamQuality, 231 + c.id * 7);
      applyTrainingFocus(p, secondary, 0.31, teamQuality, 247 + c.id * 7);
      p.chemistry = clamp(p.chemistry + 0.08 * teamQuality * trainingNoise(p.id, round, 271), 40, 99);
    }
  }
}
function developmentTotalGain(p, rounds = 99) {
  let r = developmentRecord(p),
    recent = r.recent.slice(-rounds);
  return recent.reduce((n, x) => n + Number(x.total || 0), 0);
}
function developmentExposure(p) {
  let r = developmentRecord(p);
  return r.rounds ? r.appearances / r.rounds : 0;
}
function developmentPotentialLabel(p) {
  let room = developmentRoom(p);
  if (p.age <= 22 && room >= 7) return 'Potencial muito alto';
  if (p.age <= 24 && room >= 5) return 'Potencial alto';
  if (room >= 3.2) return 'Boa margem de evolução';
  if (room >= 1.5) return 'Ainda pode evoluir';
  if (room >= 0.55) return 'Próximo do teto atual';
  return 'Consolidado';
}
function developmentTrend(p) {
  let r = developmentRecord(p),
    gain = r.recent.slice(-3).reduce((n, x) => n + Number(x.total || 0), 0),
    exposure = developmentExposure(p);
  if (gain >= 0.34) return { label: 'Evolução forte', tone: 'up' };
  if (gain >= 0.16) return { label: 'Em evolução', tone: 'up' };
  if (p.age <= 23 && r.rounds >= 2 && exposure < 0.42) return { label: 'Precisa de minutos', tone: 'warn' };
  if (gain >= 0.045) return { label: 'Evolução leve', tone: 'steady' };
  return { label: 'Estável', tone: 'steady' };
}
function prospectHype(p) {
  let r = developmentRecord(p);
  if (p.age > 22 || r.ceiling < 89.5) return '';
  if (p.pos === 'LIB') return '“novo Escadinha”';
  if (p.pos === 'LEV') return '“novo Bernard”';
  if (p.pos === 'OPO') return '“novo Marcelo Negrão”';
  if (p.pos === 'PON') return p.receive >= p.attack - 4 ? '“novo Maurício”' : '“novo Giba”';
  return 'prospecto de seleção';
}
function developmentMainGains(p) {
  let r = developmentRecord(p),
    entries = Object.entries(r.gains)
      .filter(([k]) => attrs[k])
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3);
  return entries.length
    ? entries.map(([k, v]) => `${attrs[k]} +${v.toFixed(1).replace('.', ',')}`).join(' · ')
    : 'Ainda sem mudança relevante';
}
function developmentReason(p) {
  let r = developmentRecord(p),
    trend = developmentTrend(p),
    parts = [];
  if (p.age <= 22) parts.push('idade favorece aprendizado');
  else if (p.age >= 31) parts.push('curva mais estável');
  if (developmentExposure(p) >= 0.7) parts.push('boa exposição em jogo');
  else if (r.rounds >= 2 && developmentExposure(p) < 0.42) parts.push('poucos minutos');
  if (p.morale >= 82) parts.push('moral ajuda');
  if (p.chemistry >= 84) parts.push('entrosamento ajuda');
  if (developmentRoom(p) < 1.5) parts.push('pouca margem restante');
  return parts.length ? parts.join(' · ') : trend.label.toLowerCase();
}
function developmentPlayerPanel(p) {
  let r = developmentRecord(p),
    trend = developmentTrend(p),
    hype = prospectHype(p),
    gain = developmentMainGains(p);
  return `<section class="development-player"><div class="panelhead"><div><small>DESENVOLVIMENTO</small><h3>${trend.label}</h3></div><span class="dev-tone ${trend.tone}">${developmentPotentialLabel(p)}</span></div><div class="development-kpis"><span><small>APARIÇÕES</small><b>${r.appearances}</b></span><span><small>TITULAR</small><b>${r.starts}</b></span><span><small>EXPOSIÇÃO</small><b>${Math.round(developmentExposure(p) * 100)}%</b></span></div><p><b>O que está puxando:</b> ${developmentReason(p)}.</p><p><b>Ganhos acumulados:</b> ${gain}.</p>${hype ? `<div class="prospect-hype"><small>EXPECTATIVA EXTERNA</small><strong>${hype}</strong><p>É um rótulo de hype, não uma garantia de teto ou carreira.</p></div>` : ''}</section>`;
}
function developmentRosterPanel() {
  if (state.club === null) return '';
  ensureDevelopmentState(state);
  let roster = state.all.filter(p => p.club === state.club),
    rising = [...roster].sort((a, b) => developmentTotalGain(b, 3) - developmentTotalGain(a, 3))[0],
    prospects = roster.filter(p => p.age <= 23).sort((a, b) => developmentRoom(b) - developmentRoom(a)),
    needs = prospects.filter(p => developmentRecord(p).rounds >= 2 && developmentExposure(p) < 0.42)[0],
    hype = prospects.find(p => prospectHype(p));
  return `<section class="panel development-roster"><div class="panelhead"><div><small>DESENVOLVIMENTO DO ELENCO</small><h2>Quem está avançando</h2></div><div class="split">${button('Mercado', 'market')}${button('Relatório completo', 'development-report')}</div></div><div class="development-roster-grid">${rising ? `<article><small>EM EVOLUÇÃO</small><strong>${rising.name}</strong><p>${developmentTrend(rising).label} · ${developmentMainGains(rising)}</p></article>` : ''}${needs ? `<article><small>PRECISA DE JOGO</small><strong>${needs.name}</strong><p>${needs.age} anos · ${Math.round(developmentExposure(needs) * 100)}% de exposição nas rodadas.</p></article>` : ''}${hype ? `<article><small>PROSPECTO</small><strong>${hype.name}</strong><p>${prospectHype(hype)} · ${developmentPotentialLabel(hype)}.</p></article>` : ''}</div><p class="formhint">Potencial é qualitativo e oculto: treino, idade, minutos, moral, entrosamento e contexto determinam a velocidade. Não existe “OVR futuro” revelado.</p></section>`;
}
function developmentReport() {
  ensureDevelopmentState(state);
  let roster = state.all
    .filter(p => p.club === state.club)
    .sort((a, b) => developmentTotalGain(b) - developmentTotalGain(a) || a.age - b.age);
  return `<div class="development-report"><div class="development-report-head"><p>O relatório não mostra teto exato. Ele descreve tendência, margem de evolução e o que está influenciando cada atleta.</p></div>${roster
    .map(p => {
      let r = developmentRecord(p),
        trend = developmentTrend(p),
        hype = prospectHype(p);
      return `<article><div><small>${p.pos} · ${p.age} ANOS</small><strong>${p.name}</strong><span>${trend.label} · ${developmentPotentialLabel(p)}</span></div><div><b>${Math.round(developmentExposure(p) * 100)}%</b><small>exposição</small></div><p>${developmentReason(p)}${hype ? ` · ${hype}` : ''}</p><em>${developmentMainGains(p)}</em></article>`;
    })
    .join('')}</div>`;
}

const FREE_AGENT_CATALOG = [
  [
    1001,
    'Gustavo Henrique',
    'Gustavo Henrique Lacerda',
    'LEV',
    26,
    187,
    'Organizador',
    58,
    77,
    72,
    60,
    88,
    82,
    84,
    85,
    81,
    72,
    96,
    58,
    18500,
    'hibrido',
    'Curitiba',
    'PR'
  ],
  [
    1002,
    'Pedro Augusto',
    'Pedro Augusto Nogueira',
    'LEV',
    21,
    190,
    'Distribuidor',
    55,
    74,
    68,
    63,
    82,
    78,
    80,
    76,
    74,
    78,
    97,
    60,
    13500,
    'flutuante',
    'Belo Horizonte',
    'MG'
  ],
  [
    1003,
    'Lucas Rafael',
    'Lucas Rafael Silveira',
    'PON',
    25,
    196,
    'Ponteiro completo',
    84,
    82,
    80,
    69,
    47,
    76,
    84,
    82,
    80,
    75,
    97,
    57,
    20500,
    'viagem',
    'Florianópolis',
    'SC'
  ],
  [
    1004,
    'João Victor',
    'João Victor de Almeida',
    'PON',
    22,
    193,
    'Ponteiro passador',
    77,
    76,
    85,
    64,
    44,
    82,
    82,
    78,
    82,
    80,
    97,
    59,
    15500,
    'hibrido',
    'Campinas',
    'SP'
  ],
  [
    1005,
    'Rafael Henrique',
    'Rafael Henrique Costa',
    'PON',
    29,
    198,
    'Ponteiro atacante',
    88,
    86,
    73,
    70,
    42,
    72,
    80,
    86,
    83,
    71,
    96,
    56,
    23500,
    'viagem',
    'Rio de Janeiro',
    'RJ'
  ],
  [
    1006,
    'Felipe Augusto',
    'Felipe Augusto Meireles',
    'PON',
    20,
    194,
    'Ponteiro físico',
    81,
    80,
    72,
    72,
    39,
    70,
    86,
    76,
    69,
    83,
    98,
    61,
    12500,
    'viagem',
    'Goiânia',
    'GO'
  ],
  [
    1007,
    'Bruno Henrique',
    'Bruno Henrique Valente',
    'CEN',
    27,
    207,
    'Central bloqueador',
    81,
    73,
    43,
    89,
    45,
    60,
    83,
    84,
    82,
    74,
    97,
    57,
    20500,
    'hibrido',
    'São Paulo',
    'SP'
  ],
  [
    1008,
    'Gabriel Augusto',
    'Gabriel Augusto Ferraz',
    'CEN',
    23,
    210,
    'Central de velocidade',
    84,
    75,
    41,
    86,
    49,
    61,
    85,
    78,
    76,
    79,
    97,
    59,
    16500,
    'hibrido',
    'Porto Alegre',
    'RS'
  ],
  [
    1009,
    'Eduardo Henrique',
    'Eduardo Henrique Paiva',
    'CEN',
    31,
    205,
    'Central experiente',
    79,
    70,
    46,
    88,
    51,
    63,
    79,
    90,
    88,
    72,
    95,
    64,
    21500,
    'flutuante',
    'Recife',
    'PE'
  ],
  [
    1010,
    'Matheus Felipe',
    'Matheus Felipe Azevedo',
    'CEN',
    20,
    212,
    'Central de teto alto',
    76,
    72,
    39,
    91,
    43,
    56,
    86,
    74,
    68,
    81,
    98,
    60,
    13000,
    'hibrido',
    'Brasília',
    'DF'
  ],
  [
    1011,
    'Caio Henrique',
    'Caio Henrique Martins',
    'OPO',
    25,
    201,
    'Oposto de potência',
    90,
    86,
    54,
    75,
    41,
    65,
    86,
    85,
    80,
    75,
    97,
    57,
    24000,
    'viagem',
    'Ribeirão Preto',
    'SP'
  ],
  [
    1012,
    'Leonardo Augusto',
    'Leonardo Augusto Farias',
    'OPO',
    22,
    199,
    'Oposto móvel',
    85,
    82,
    57,
    71,
    45,
    70,
    85,
    79,
    74,
    79,
    98,
    59,
    17500,
    'viagem',
    'Fortaleza',
    'CE'
  ],
  [
    1013,
    'André Luiz',
    'André Luiz Carvalho',
    'OPO',
    30,
    202,
    'Oposto experiente',
    87,
    83,
    55,
    76,
    43,
    67,
    80,
    88,
    86,
    72,
    96,
    62,
    22500,
    'viagem',
    'Niterói',
    'RJ'
  ],
  [
    1014,
    'Vinícius Gabriel',
    'Vinícius Gabriel Moraes',
    'LIB',
    24,
    181,
    'Líbero passador',
    35,
    58,
    90,
    28,
    54,
    91,
    86,
    84,
    87,
    78,
    98,
    61,
    18500,
    'flutuante',
    'Maringá',
    'PR'
  ],
  [
    1015,
    'Daniel Henrique',
    'Daniel Henrique Siqueira',
    'LIB',
    21,
    179,
    'Líbero defensor',
    34,
    55,
    84,
    25,
    50,
    93,
    88,
    77,
    80,
    82,
    98,
    60,
    14500,
    'flutuante',
    'Juiz de Fora',
    'MG'
  ],
  [
    1016,
    'Arthur Miguel',
    'Arthur Miguel Tavares',
    'LIB',
    28,
    183,
    'Líbero estável',
    36,
    57,
    88,
    27,
    53,
    89,
    82,
    89,
    90,
    74,
    97,
    63,
    20000,
    'flutuante',
    'Salvador',
    'BA'
  ]
];
function makeFreeAgent(row) {
  let [
    id,
    name,
    fullName,
    pos,
    age,
    height_cm,
    archetype,
    attack,
    serve,
    receive,
    block,
    set,
    defense,
    stamina,
    mental,
    consistency,
    morale,
    condition,
    chemistry,
    salary,
    serveStyle,
    originCity,
    originState
  ] = row;
  return {
    id,
    club: -1,
    name,
    fullName,
    originCity,
    originState,
    pos,
    archetypeKey: 'market_' + pos.toLowerCase(),
    archetype,
    age,
    attack,
    serve,
    receive,
    block,
    set,
    defense,
    stamina,
    mental,
    consistency,
    morale,
    condition,
    chemistry,
    salary,
    height_cm,
    serveStyle,
    freeAgent: true
  };
}
function initialContractYears(p) {
  if (p.tribute) return 2;
  return 1 + ((Number(p.id) * 7 + Number(p.club || 0) * 3) % 3);
}
function clubPayroll(id) {
  return state.all.filter(p => p.club === id).reduce((n, p) => n + Number(p.salary || 0), 0);
}
function clubRoster(id) {
  return state.all.filter(p => p.club === id);
}
function ensureMarketState(v = state) {
  v.contracts = v.contracts && typeof v.contracts === 'object' ? v.contracts : {};
  v.market = v.market && typeof v.market === 'object' ? v.market : {};
  v.market.maxRoster = Number(v.market.maxRoster) || 16;
  v.market.signings = Array.isArray(v.market.signings) ? v.market.signings : [];
  v.market.wageLimits = v.market.wageLimits && typeof v.market.wageLimits === 'object' ? v.market.wageLimits : {};
  for (let row of FREE_AGENT_CATALOG) {
    let id = row[0];
    if (!v.all.some(p => Number(p.id) === id)) v.all.push(makeFreeAgent(row));
  }
  for (let p of v.all)
    if (p.club >= 0 && !v.contracts[p.id])
      v.contracts[p.id] = {
        playerId: p.id,
        years: initialContractYears(p),
        salary: Number(p.salary || 0),
        signedRound: 0,
        renewed: false
      };
  for (let c of clubs)
    if (!Number.isFinite(v.market.wageLimits[c.id])) {
      let payroll = v.all.filter(p => p.club === c.id).reduce((n, p) => n + Number(p.salary || 0), 0);
      v.market.wageLimits[c.id] = Math.round((payroll * 1.18 + 8000) / 500) * 500;
    }
  return v.market;
}
function clubWageLimit(id) {
  ensureMarketState(state);
  return Number(state.market.wageLimits[id] || 0);
}
function wageHeadroom(id) {
  return clubWageLimit(id) - clubPayroll(id);
}
function contractFor(p) {
  ensureMarketState(state);
  return state.contracts[p.id] || null;
}
function contractAsk(p, years = 2, renewal = false) {
  let base = Number(p.salary || 12000),
    age = Number(p.age || 26),
    growth = 0;
  if (renewal && state.development?.[p.id]) growth = Math.min(0.14, developmentTotalGain(p, 8) * 0.035);
  let marketAdj = overall(p) >= 86 ? 0.13 : overall(p) >= 81 ? 0.07 : overall(p) <= 72 ? -0.04 : 0,
    ageAdj = age <= 23 ? 0.035 : age >= 32 ? -0.035 : 0,
    termAdj = years === 1 ? 0.08 : years === 3 ? -0.045 : 0;
  return Math.round((base * (1 + growth + marketAdj + ageAdj + termAdj)) / 500) * 500;
}
function marketPotentialRead(p) {
  if (p.age <= 21 && overall(p) <= 80) return 'margem alta';
  if (p.age <= 24) return 'margem boa';
  if (p.age <= 28) return 'pronto para produzir';
  return 'experiência imediata';
}
function positionalDepth(pos) {
  return clubRoster(state.club)
    .filter(p => p.pos === pos)
    .sort((a, b) => overall(b) - overall(a));
}
function marketRoleRead(p) {
  let depth = positionalDepth(p.pos),
    best = depth[0] ? overall(depth[0]) : 0,
    avg = depth.length ? depth.reduce((n, x) => n + overall(x), 0) / depth.length : 0,
    o = overall(p);
  if (!depth.length) return 'lacuna clara no elenco';
  if (o >= best + 2) return 'nível para disputar a posição imediatamente';
  if (o >= avg) return 'entra na rotação e pressiona os titulares';
  return p.age <= 23 ? 'aposta de desenvolvimento' : 'profundidade de elenco';
}
function marketNeedRows() {
  let target = { LEV: 2, PON: 4, CEN: 4, OPO: 2, LIB: 2 },
    order = { alta: 0, média: 1, baixa: 2 };
  return Object.entries(target)
    .map(([pos, ideal]) => {
      let depth = positionalDepth(pos),
        count = depth.length,
        avg = count ? Math.round(depth.reduce((n, p) => n + overall(p), 0) / count) : 0,
        urgency = count < ideal ? 'alta' : avg < 75 ? 'média' : 'baixa';
      return { pos, count, ideal, avg, urgency };
    })
    .sort((a, b) => order[a.urgency] - order[b.urgency] || a.avg - b.avg);
}
function marketNegotiationDialog(id, renewal = false) {
  let p = player(id);
  if (!p) return;
  let title = renewal ? `Renovar com ${p.name}` : `Negociar com ${p.name}`,
    body = `<div class="market-negotiation"><div class="market-negotiation-player">${playerIdentity(p, { compact: true })}<div><span>OVR ${overall(p)}</span><span>${p.age} anos · ${heightLabel(p)}</span><span>${money(p.salary)}/mês como referência</span></div></div><p>${renewal ? 'O atleta avalia estabilidade, valorização recente e duração do novo vínculo.' : 'Sem taxa de transferência. O custo é salarial e a duração muda o valor mensal pedido.'}</p><div class="market-offers">${[
      1, 2, 3
    ]
      .map(y => {
        let ask = contractAsk(p, y, renewal),
          newPayroll = clubPayroll(state.club) - (renewal ? Number(p.salary || 0) : 0) + ask,
          ok = newPayroll <= clubWageLimit(state.club);
        return `<button data-action="${renewal ? 'contract-renew' : 'market-sign'}:${p.id}:${y}" ${ok ? '' : 'disabled'}><small>${y} TEMPORADA${y > 1 ? 'S' : ''}</small><strong>${money(ask)}/mês</strong><span>${ok ? 'Dentro do limite salarial' : 'Excede o limite salarial'}</span></button>`;
      })
      .join(
        ''
      )}</div><small class="market-help">${renewal ? 'A renovação substitui o salário atual.' : 'O elenco pode ter no máximo ' + state.market.maxRoster + ' atletas nesta etapa do mercado.'}</small></div>`;
  openDialog(title, body);
  bind();
}
function signFreeAgent(id, years) {
  ensureMarketState(state);
  let p = player(id);
  if (!p || p.club !== -1) {
    notify('Esse atleta não está mais livre no mercado.');
    return;
  }
  if (clubRoster(state.club).length >= state.market.maxRoster) {
    notify('Elenco cheio. O limite atual é de ' + state.market.maxRoster + ' atletas.');
    return;
  }
  let salary = contractAsk(p, years, false),
    after = clubPayroll(state.club) + salary;
  if (after > clubWageLimit(state.club)) {
    notify('A proposta ultrapassa o limite salarial do clube.');
    return;
  }
  p.club = state.club;
  p.salary = salary;
  p.chemistry = clamp(p.chemistry || 58, 50, 70);
  p.morale = clamp(p.morale || 72, 65, 88);
  p.condition = Math.max(94, p.condition || 96);
  p.freeAgent = false;
  state.contracts[p.id] = { playerId: p.id, years, salary, signedRound: state.round, renewed: false, newSigning: true };
  state.market.signings.push({ playerId: p.id, club: state.club, round: state.round, years, salary });
  ensureDevelopmentState(state);
  let d = $('#detail');
  if (d?.open) d.close();
  commit('critical');
  view = 'market';
  render();
  notify(`${p.name} assinou por ${years} temporada${years > 1 ? 's' : ''}. Ele já está disponível no plantel.`);
}
function renewContract(id, years) {
  ensureMarketState(state);
  let p = player(id);
  if (!p || p.club !== state.club) return;
  let salary = contractAsk(p, years, true),
    after = clubPayroll(state.club) - Number(p.salary || 0) + salary;
  if (after > clubWageLimit(state.club)) {
    notify('A renovação ultrapassa o limite salarial do clube.');
    return;
  }
  p.salary = salary;
  state.contracts[p.id] = { playerId: p.id, years, salary, signedRound: state.round, renewed: true };
  p.morale = clamp((p.morale || 70) + 2, 1, 100);
  let d = $('#detail');
  if (d?.open) d.close();
  commit('critical');
  render();
  notify(`Vínculo de ${p.name} renovado por ${years} temporada${years > 1 ? 's' : ''}.`);
}
function expiringContracts() {
  return clubRoster(state.club)
    .filter(p => (contractFor(p)?.years || 1) <= 1)
    .sort((a, b) => overall(b) - overall(a));
}
function marketPage() {
  ensureMarketState(state);
  let payroll = clubPayroll(state.club),
    limit = clubWageLimit(state.club),
    roster = clubRoster(state.club),
    free = state.all.filter(p => p.club === -1 && p.freeAgent),
    needs = marketNeedRows(),
    expiring = expiringContracts();
  return `${heading('Mercado & contratos', 'Monte o elenco sem perder o controle da folha.', 'Agentes livres podem chegar imediatamente. Renovações protegem o planejamento da carreira.')}<section class="market-finance panel"><div class="market-finance-grid"><article><small>FOLHA ATUAL</small><strong>${money(payroll)}</strong><span>por mês</span></article><article><small>LIMITE DA DIRETORIA</small><strong>${money(limit)}</strong><span>por mês</span></article><article><small>ESPAÇO SALARIAL</small><strong class="${wageHeadroom(state.club) < 12000 ? 'warn' : ''}">${money(Math.max(0, wageHeadroom(state.club)))}</strong><span>disponível</span></article><article><small>ELENCO</small><strong>${roster.length}/${state.market.maxRoster}</strong><span>atletas</span></article></div></section><section class="panel market-needs"><div class="panelhead"><div><small>LEITURA DO ELENCO</small><h2>Onde há espaço</h2></div></div><div class="market-needs-grid">${needs.map(n => `<article class="urgency-${n.urgency}"><small>${names[n.pos].toUpperCase()}</small><strong>${n.count}/${n.ideal}</strong><span>OVR médio ${n.avg || '—'} · necessidade ${n.urgency}</span></article>`).join('')}</div></section><section class="panel"><div class="panelhead"><div><small>AGENTES LIVRES</small><h2>Mercado disponível</h2></div><span class="pill">${free.length} NOMES</span></div><div class="market-list">${free.map(p => `<article class="market-player"><div>${playerIdentity(p, { compact: true, subtitle: `${p.age} anos · ${heightLabel(p)} · OVR ${overall(p)}` })}<p>${marketRoleRead(p)} · ${marketPotentialRead(p)}</p></div><div class="market-player-money"><small>PEDIDA BASE</small><strong>${money(p.salary)}</strong><span>por mês</span>${button('Negociar', `market-negotiate:${p.id}`, 'primary')}</div></article>`).join('') || '<div class="empty">Não há agentes livres disponíveis.</div>'}</div></section><section class="panel"><div class="panelhead"><div><small>CONTRATOS</small><h2>Vínculos que pedem decisão</h2></div><span class="pill">${expiring.length} EXPIRANDO</span></div>${
    expiring.length
      ? `<div class="contract-list">${expiring
          .map(p => {
            let c = contractFor(p);
            return `<article><div>${playerIdentity(p, { compact: true, subtitle: `${p.age} anos · OVR ${overall(p)}` })}<p>${developmentTrend(p).label} · ${developmentPotentialLabel(p)}</p></div><div><small>ATUAL</small><strong>${money(p.salary)}/mês</strong><span>${c?.renewed ? 'renovado' : 'fim da temporada'}</span>${c?.renewed ? '' : button('Renovar', `renew-negotiate:${p.id}`)}</div></article>`;
          })
          .join('')}</div>`
      : '<p class="formhint">Nenhum vínculo exige decisão imediata.</p>'
  }</section>`;
}
function contractPlayerPanel(p) {
  if (p.club !== state.club) return '';
  let c = contractFor(p);
  if (!c) return '';
  return `<section class="contract-player-panel"><div><small>CONTRATO</small><strong>${money(p.salary)}/mês</strong><span>${c.years} temporada${c.years > 1 ? 's' : ''} de horizonte${c.renewed ? ' · renovado' : ''}</span></div>${c.years <= 1 && !c.renewed ? button('Negociar renovação', `renew-negotiate:${p.id}`) : ''}</section>`;
}

const TRAINING_FOCI = {
  attack: { label: 'Ataque', desc: 'Definição, escolhas ofensivas e soluções de ataque.' },
  defense: { label: 'Defesa', desc: 'Leitura de ataque, controle da primeira defesa e continuidade.' },
  volume: { label: 'Volume de jogo', desc: 'Repetição de situações, estabilidade e conexão coletiva.' },
  tactical: { label: 'Tático', desc: 'Leitura do sistema, decisões e coordenação entre setores.' },
  serve: { label: 'Saque', desc: 'Qualidade, pressão e execução do saque.' },
  block: { label: 'Bloqueio', desc: 'Tempo, leitura e coordenação de rede.' },
  receive: { label: 'Recepção', desc: 'Controle do saque e qualidade da primeira bola.' },
  fundamentals: { label: 'Fundamentos', desc: 'Sessão técnica ampla, respeitando a função de cada atleta.' }
};
const MATCH_PREP = {
  serve: { label: 'Saque no adversário', desc: 'Estuda passadores e organiza alvos para pressionar a recepção rival.' },
  tactical: { label: 'Plano tático', desc: 'Estuda padrões do adversário e melhora a leitura coletiva do confronto.' },
  attack: { label: 'Ataque × bloqueio', desc: 'Estuda a rede rival e prepara soluções para atacar melhor o bloqueio.' }
};
let state = fresh(),
  view = 'home',
  match = null,
  timer = null,
  greatMomentResumeTimer = null,
  momentOverlayTimer = null,
  filterPos = '',
  search = '',
  scoutClub = '',
  onlyObserved = false,
  reportId = null,
  dataMode = 'season',
  postGameTab = 'summary',
  rankingScope = 'teams',
  rankingTeamSource = 'performance',
  rankingPlayerSource = 'performance',
  rankingTeamMetric = 'standing',
  rankingPlayerMetric = 'ratingAvg',
  rankingPlayerPos = 'ALL',
  toastTimer,
  simulating = false,
  matchSpeed = 1,
  gymAudio = null,
  gymSound = false;
globalThis.__VMB_TACTICAL_BENCHMARK__ = (options = {}) => benchmarkTactics(options);
globalThis.__VMB_STORAGE_SNAPSHOT__ = () => {
  let s = persistenceSnapshot(),
    parts = {
      career: JSON.stringify(s.career).length,
      active: JSON.stringify(s.active).length,
      summaries: JSON.stringify(s.summaries).length,
      details: JSON.stringify(s.details).length
    };
  return {
    ...parts,
    total: Object.values(parts).reduce((a, b) => a + b, 0),
    matches: s.summaries.length,
    detailsKept: s.details.length
  };
};
function fresh() {
  let all = players(),
    v = {
      version: 1,
      storageSchema: 4,
      club: null,
      all,
      lines: Object.fromEntries(clubs.map(c => [c.id, lineup(all, c.id)])),
      tactics: Object.fromEntries(clubs.map(c => [c.id, defaultTactics(c.id)])),
      round: 0,
      results: [],
      observed: [],
      scout: {},
      trained: false,
      weekPlan: { primary: 'attack', secondary: 'tactical', prep: 'tactical' },
      trainingLog: [],
      lastTraining: null,
      development: {},
      developmentLog: [],
      contracts: {},
      market: {},
      last: null
    };
  return syncCanonicalRoster(v);
}

// Persistência v4: a carreira, a partida ativa, os resumos e os detalhes recentes vivem em stores separados.
// Somente as últimas 3 partidas do clube do usuário preservam rally por rally. IA x IA nunca é persistida com eventos completos.
const SAVE_DB = 'volley-manager-brasil-persistence-v4',
  SAVE_DB_VERSION = 1,
  STORE_CAREER = 'CareerStore',
  STORE_ACTIVE = 'ActiveMatchStore',
  STORE_SUMMARY = 'MatchSummaryStore',
  STORE_DETAIL = 'RecentMatchDetailStore',
  STORE_BACKUP = 'BackupStore',
  SAVE_ID = 'main',
  BACKUP_ID = 'before-restart',
  CHECKPOINT_KEY = key + '-checkpoint-v4',
  COMPRESSED_KEY = key + '-portable-v4',
  RECENT_DETAIL_LIMIT = 3;
const LEGACY_DB = 'volley-manager-brasil-persistence-v3',
  LEGACY_STORE = 'saveSlots',
  LEGACY_COMPRESSED = key + '-compressed-v3';
let saveTimer = null,
  saveQueue = Promise.resolve(),
  saveStatus = 'saved',
  saveErrorNotified = false,
  loadedFromLegacy = false,
  storageBackend = 'unknown',
  lastActiveSavedRally = -999,
  lastActiveSavedAt = 0;
function matchStoreId(m) {
  return `r${m.round ?? -1}-h${m.home}-a${m.away}`;
}
function cloneJson(v) {
  return v == null ? v : JSON.parse(JSON.stringify(v));
}
function cloneMatchForDetail(m) {
  return m == null ? m : JSON.parse(JSON.stringify(m, (k, v) => (k === 'optionValues' ? undefined : v)));
}
function openSaveDb() {
  return new Promise((resolve, reject) => {
    if (!('indexedDB' in globalThis)) {
      reject(Error('IndexedDB indisponível'));
      return;
    }
    let req = indexedDB.open(SAVE_DB, SAVE_DB_VERSION);
    req.onupgradeneeded = () => {
      let db = req.result;
      for (let s of [STORE_CAREER, STORE_ACTIVE, STORE_SUMMARY, STORE_DETAIL, STORE_BACKUP])
        if (!db.objectStoreNames.contains(s)) db.createObjectStore(s, { keyPath: 'id' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || Error('Falha ao abrir o banco de saves'));
    req.onblocked = () => reject(Error('Banco de saves bloqueado'));
  });
}
function legacyOpenDb() {
  return new Promise((resolve, reject) => {
    if (!('indexedDB' in globalThis)) {
      reject(Error('IndexedDB indisponível'));
      return;
    }
    let req = indexedDB.open(LEGACY_DB, 1);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || Error('Falha ao abrir save antigo'));
    req.onblocked = () => reject(Error('Save antigo bloqueado'));
  });
}
async function legacyDbRead() {
  let db;
  try {
    db = await legacyOpenDb();
    if (!db.objectStoreNames.contains(LEGACY_STORE)) return null;
    return await new Promise((resolve, reject) => {
      let tx = db.transaction(LEGACY_STORE, 'readonly'),
        req = tx.objectStore(LEGACY_STORE).get(SAVE_ID);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  } finally {
    db?.close();
  }
}
function txGet(store, id = null) {
  return openSaveDb()
    .then(
      db =>
        new Promise((resolve, reject) => {
          let tx = db.transaction(store, 'readonly'),
            os = tx.objectStore(store),
            req = id === null ? os.getAll() : os.get(id);
          req.onsuccess = () => resolve({ db, value: req.result || null });
          req.onerror = () => {
            db.close();
            reject(req.error);
          };
        })
    )
    .then(({ db, value }) => {
      db.close();
      return value;
    });
}
async function dbRead(id = BACKUP_ID) {
  let rec = await txGet(STORE_BACKUP, id);
  return rec ? { id: rec.id, state: rec.state } : null;
}
async function dbWrite(value, id = BACKUP_ID) {
  let db = await openSaveDb();
  try {
    await new Promise((resolve, reject) => {
      let tx = db.transaction(STORE_BACKUP, 'readwrite');
      tx.objectStore(STORE_BACKUP).put({ id, updatedAt: Date.now(), state: cloneJson(value) });
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}
function bytesToStorage(bytes) {
  let out = '',
    chunk = 12000;
  for (let i = 0; i < bytes.length; i += chunk * 2) {
    let end = Math.min(bytes.length, i + chunk * 2),
      codes = new Array(Math.ceil((end - i) / 2));
    for (let j = i, k = 0; j < end; j += 2, k++) codes[k] = bytes[j] | ((j + 1 < end ? bytes[j + 1] : 0) << 8);
    out += String.fromCharCode(...codes);
  }
  return bytes.length + ':' + out;
}
function storageToBytes(value) {
  let cut = value.indexOf(':'),
    len = Number(value.slice(0, cut)),
    body = value.slice(cut + 1);
  if (!Number.isInteger(len) || len < 0) throw Error('Save comprimido inválido');
  let bytes = new Uint8Array(len);
  for (let i = 0, j = 0; i < body.length && j < len; i++) {
    let code = body.charCodeAt(i);
    bytes[j++] = code & 255;
    if (j < len) bytes[j++] = code >>> 8;
  }
  return bytes;
}
async function compressState(value) {
  if (!('CompressionStream' in globalThis)) return null;
  let json = JSON.stringify(value),
    stream = new Blob([json]).stream().pipeThrough(new CompressionStream('gzip')),
    bytes = new Uint8Array(await new Response(stream).arrayBuffer());
  return bytesToStorage(bytes);
}
async function decompressState(value) {
  if (!('DecompressionStream' in globalThis)) throw Error('Descompressão indisponível');
  let bytes = storageToBytes(value),
    stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
  return JSON.parse(await new Response(stream).text());
}
function matchStats(m, side) {
  return m?.aggregate?.[side] || stats(m?.events || [], side);
}
function mergeStatTree(target, source) {
  if (!source) return target;
  for (let [k, v] of Object.entries(source)) {
    if (typeof v === 'number') {
      target[k] = (Number(target[k]) || 0) + v;
    } else if (Array.isArray(v)) {
      target[k] ??= [];
      for (let i = 0; i < v.length; i++) {
        target[k][i] ??= {};
        mergeStatTree(target[k][i], v[i]);
      }
    } else if (v && typeof v === 'object') {
      target[k] ??= {};
      mergeStatTree(target[k], v);
    }
  }
  return target;
}
function seasonStats(id = state.club) {
  let out = stats([], 0);
  for (let m of state.results) {
    let side = m.home === id ? 0 : m.away === id ? 1 : null;
    if (side === null) continue;
    mergeStatTree(out, matchStats(m, side));
  }
  return out;
}
function leagueAggregateStats() {
  let out = stats([], 0);
  for (let m of state.results) for (let side of [0, 1]) mergeStatTree(out, matchStats(m, side));
  if (match && !match.done) for (let side of [0, 1]) mergeStatTree(out, stats(match.events, side));
  return out;
}
function playerMatchMeta(m) {
  let by = {};
  for (let e of m.events || [])
    for (let s of e.steps || []) {
      let id = Number(s.player);
      if (!Number.isInteger(id)) continue;
      let x = (by[id] ??= { sets: [], serves: 0 });
      if (!x.sets.includes(e.set)) x.sets.push(e.set);
      if (s.type === 'serve') x.serves++;
      by[id] = x;
    }
  return by;
}
function compactMatchSummary(m) {
  if (!m) return null;
  if (m.summaryOnly && m.aggregate) return m;
  let ratings = ratingRows(m),
    mvp = null;
  try {
    let hit = matchMvp(m);
    if (hit?.p) mvp = { id: hit.p.id, side: hit.side, impact: hit.impact, x: hit.x };
  } catch {}
  let setStories = [];
  try {
    setStories = m.setScores.map((_, i) => setStorySpine(m, i + 1)).filter(Boolean);
  } catch {}
  return {
    summaryOnly: true,
    id: matchStoreId(m),
    round: m.round,
    home: m.home,
    away: m.away,
    done: true,
    recorded: true,
    seed: m.seed,
    sets: [...m.sets],
    setScores: cloneJson(m.setScores),
    aggregate: [stats(m.events || [], 0), stats(m.events || [], 1)],
    ratings: cloneJson(ratings),
    mvp: cloneJson(mvp),
    decisions: cloneJson(
      (m.decisions || []).filter(d => ['tactic', 'talk', 'postTalk', 'adviceResponse'].includes(d.type))
    ),
    finalTalk: cloneJson(m.finalTalk || null),
    competitiveState: cloneJson(m.competitiveState || null),
    dayForm: cloneJson(m.dayForm || null),
    classification: matchClassification(m),
    headline: matchHeadline(m),
    setStories: cloneJson(setStories),
    playerMeta: playerMatchMeta(m),
    setterRows: cloneJson(setterMetrics([m]) || []),
    events: []
  };
}
function pruneRecentDetails() {
  let own = state.results.map((m, i) => ({ m, i })).filter(x => x.m.home === state.club || x.m.away === state.club),
    detailed = own.filter(x => Array.isArray(x.m.events) && x.m.events.length);
  while (detailed.length > RECENT_DETAIL_LIMIT) {
    let x = detailed.shift();
    state.results[x.i] = compactMatchSummary(x.m);
  }
}
function compactHistoricalResults() {
  if (state.club === null) return;
  state.results = state.results.map(m => (m.home === state.club || m.away === state.club ? m : compactMatchSummary(m)));
  pruneRecentDetails();
}
function careerState() {
  let c = cloneJson(state);
  delete c.results;
  delete c.last;
  delete c.active;
  c.storageSchema = 4;
  return c;
}
function persistenceSnapshot() {
  pruneRecentDetails();
  let summaries = state.results.map(m => compactMatchSummary(m)),
    details = state.results
      .filter(m => (m.home === state.club || m.away === state.club) && Array.isArray(m.events) && m.events.length)
      .slice(-RECENT_DETAIL_LIMIT)
      .map(m => ({ id: matchStoreId(m), match: cloneMatchForDetail(m) }));
  return {
    format: 'vmb-save-v4',
    schemaVersion: 4,
    career: careerState(),
    active: match && !match.done ? cloneJson(match) : null,
    summaries,
    details
  };
}
async function persistIndexed(snapshot) {
  let db = await openSaveDb();
  try {
    await new Promise((resolve, reject) => {
      let tx = db.transaction([STORE_CAREER, STORE_ACTIVE, STORE_SUMMARY, STORE_DETAIL], 'readwrite'),
        career = tx.objectStore(STORE_CAREER),
        active = tx.objectStore(STORE_ACTIVE),
        summaries = tx.objectStore(STORE_SUMMARY),
        details = tx.objectStore(STORE_DETAIL);
      career.put({ id: SAVE_ID, updatedAt: Date.now(), state: snapshot.career });
      active.clear();
      if (snapshot.active) active.put({ id: SAVE_ID, updatedAt: Date.now(), match: snapshot.active });
      summaries.clear();
      for (let m of snapshot.summaries) summaries.put({ id: m.id || matchStoreId(m), round: m.round, match: m });
      details.clear();
      for (let d of snapshot.details) details.put({ id: d.id, round: d.match.round, match: d.match });
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error || Error('Falha ao salvar'));
      tx.onabort = () => reject(tx.error || Error('Save abortado'));
    });
  } finally {
    db.close();
  }
}
async function persistPortable(snapshot) {
  let packed = await compressState(snapshot);
  if (!packed) localStorage.setItem(COMPRESSED_KEY, JSON.stringify(snapshot));
  else localStorage.setItem(COMPRESSED_KEY, packed);
}
async function persistWrite() {
  let snap = persistenceSnapshot();
  if (storageBackend !== 'compressed-local') {
    try {
      await persistIndexed(snap);
      storageBackend = 'indexeddb';
      return;
    } catch (err) {
      console.warn('IndexedDB indisponível; usando save portátil local.', err);
      storageBackend = 'compressed-local';
    }
  }
  await persistPortable(snap);
}
function checkpoint() {
  try {
    localStorage.setItem(
      CHECKPOINT_KEY,
      JSON.stringify({
        round: state.round,
        club: state.club,
        active: !!(match && !match.done),
        events: match && !match.done ? match.events.length : 0,
        updatedAt: Date.now()
      })
    );
  } catch {}
}
function saveLabel() {
  return saveStatus === 'saving' ? 'SALVANDO…' : saveStatus === 'error' ? 'ERRO AO SALVAR' : 'SALVO';
}
function updateSaveIndicator() {
  let el = $('#save-indicator');
  if (el) {
    el.textContent = saveLabel();
    el.classList.toggle('orange', saveStatus === 'error');
  }
}
function notify(msg) {
  $('.toast')?.remove();
  let e = document.createElement('div');
  e.className = 'toast';
  e.role = 'status';
  e.textContent = msg;
  document.body.append(e);
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => e.remove(), 3800);
}
function queueSave(delay = null, reason = 'critical') {
  checkpoint();
  saveStatus = 'saving';
  updateSaveIndicator();
  clearTimeout(saveTimer);
  let wait = delay ?? (storageBackend === 'compressed-local' ? 900 : reason === 'rally' ? 250 : 0);
  saveTimer = setTimeout(() => {
    saveTimer = null;
    saveQueue = saveQueue
      .catch(() => {})
      .then(() => persistWrite())
      .then(() => {
        saveStatus = 'saved';
        saveErrorNotified = false;
        updateSaveIndicator();
        checkpoint();
        lastActiveSavedRally = match && !match.done ? match.events.length : lastActiveSavedRally;
        lastActiveSavedAt = Date.now();
        loadedFromLegacy = false;
      })
      .catch(err => {
        console.error('Falha de persistência', err);
        saveStatus = 'error';
        updateSaveIndicator();
        if (!saveErrorNotified) {
          saveErrorNotified = true;
          notify('Falha no salvamento automático. Salve uma cópia para não perder progresso.');
        }
      });
  }, wait);
  return true;
}
function save() {
  return queueSave(0, 'critical');
}
function commit(reason = 'critical') {
  if (reason === 'rally' && match && !match.done) {
    let dueRallies = match.events.length - lastActiveSavedRally >= 5,
      dueTime = Date.now() - lastActiveSavedAt >= 10000;
    if (!dueRallies && !dueTime) {
      checkpoint();
      return false;
    }
  }
  return queueSave(reason === 'rally' ? 250 : 0, reason);
}
async function readV4() {
  try {
    let career = await txGet(STORE_CAREER, SAVE_ID);
    if (!career?.state) return null;
    let summaries = await txGet(STORE_SUMMARY),
      details = await txGet(STORE_DETAIL),
      active = await txGet(STORE_ACTIVE, SAVE_ID),
      detailMap = new Map((details || []).map(x => [x.id, x.match])),
      results = (summaries || [])
        .sort((a, b) => a.match.round - b.match.round || a.match.home - b.match.home)
        .map(x => detailMap.get(x.id) || x.match),
      value = { ...career.state, results };
    value.last = value.results.filter(m => m.home === value.club || m.away === value.club).at(-1) || null;
    return { value, active: active?.match || null, source: 'v4' };
  } catch (err) {
    console.warn('Falha ao ler persistência v4.', err);
    return null;
  }
}
async function readPortable() {
  try {
    let raw = localStorage.getItem(COMPRESSED_KEY);
    if (!raw) return null;
    let pkg = raw.startsWith('{') ? JSON.parse(raw) : await decompressState(raw);
    if (pkg?.format !== 'vmb-save-v4') return null;
    let detailMap = new Map((pkg.details || []).map(x => [x.id, x.match])),
      results = (pkg.summaries || []).map(m => detailMap.get(m.id || matchStoreId(m)) || m),
      value = { ...pkg.career, results };
    value.last = value.results.filter(m => m.home === value.club || m.away === value.club).at(-1) || null;
    return { value, active: pkg.active || null, source: 'portable' };
  } catch (err) {
    console.warn('Falha ao ler save portátil.', err);
    return null;
  }
}
async function readLegacy() {
  try {
    let rec = await legacyDbRead();
    if (rec?.state && validateSave(rec.state))
      return { value: rec.state, active: rec.state.active || null, source: 'legacy-v3' };
  } catch {}
  try {
    let raw = localStorage.getItem(LEGACY_COMPRESSED);
    if (raw) {
      let v = await decompressState(raw);
      if (validateSave(v)) return { value: v, active: v.active || null, source: 'legacy-compressed' };
    }
  } catch {}
  try {
    let raw = localStorage.getItem(key);
    if (raw) {
      let v = JSON.parse(raw);
      if (validateSave(v)) return { value: v, active: v.active || null, source: 'legacy-local' };
    }
  } catch {}
  return null;
}
async function loadPersistentState() {
  let v4 = await readV4();
  if (v4) {
    storageBackend = 'indexeddb';
    return v4;
  }
  let portable = await readPortable();
  if (portable) {
    storageBackend = 'compressed-local';
    return portable;
  }
  let legacy = await readLegacy();
  if (legacy) {
    storageBackend = 'indexeddb';
    loadedFromLegacy = true;
    return legacy;
  }
  return { value: null, active: null, source: null, error: false };
}
let persisted = { value: null, active: null, source: null, error: false },
  loadError = false;
try {
  persisted = await loadPersistentState();
  loadError = !!persisted?.error;
} catch (err) {
  console.error('Falha ao carregar persistência; iniciando jogo limpo.', err);
  persisted = { value: null, active: null, source: null, error: true };
  loadError = true;
}
try {
  if (persisted.value) {
    state = syncCanonicalRoster(persisted.value);
    state.storageSchema = 4;
    state.results = Array.isArray(state.results) ? state.results : [];
    state.last = state.results.filter(m => m && (m.home === state.club || m.away === state.club)).at(-1) || null;
  } else {
    state = syncCanonicalRoster(state);
  }
  migrateHeights(state);
  ensureAiTeamStyles(state);
  ensureTrainingState(state);
  ensureMarketState(state);
  ensureDevelopmentState(state);
  match = syncCanonicalActiveMatch(persisted.active || null);
  if (match && !match.done) view = 'match';
  compactHistoricalResults();
  if (loadedFromLegacy) queueSave(0, 'critical');
} catch (err) {
  console.error('Falha na migração do save; recuperando interface.', err);
  loadError = true;
  state = fresh();
  match = null;
  view = 'home';
  try {
    migrateHeights(state);
    ensureAiTeamStyles(state);
    ensureTrainingState(state);
  } catch {}
}
addEventListener('pagehide', () => {
  checkpoint();
  clearTimeout(saveTimer);
  saveQueue = saveQueue
    .catch(() => {})
    .then(() => persistWrite())
    .catch(() => {});
});
document.addEventListener(
  'pointerdown',
  () => {
    navigator.storage?.persist?.().catch(() => {});
  },
  { once: true }
);
function ensureTrainingState(v) {
  v.weekPlan ??= { primary: 'attack', secondary: 'tactical', prep: 'tactical' };
  if (!TRAINING_FOCI[v.weekPlan.primary]) v.weekPlan.primary = 'attack';
  if (!TRAINING_FOCI[v.weekPlan.secondary]) v.weekPlan.secondary = 'tactical';
  if (!MATCH_PREP[v.weekPlan.prep]) v.weekPlan.prep = 'tactical';
  v.trainingLog = Array.isArray(v.trainingLog) ? v.trainingLog : [];
  v.lastTraining ??= null;
  if (typeof v.trained !== 'boolean') v.trained = false;
}
function meanRoster(roster, key) {
  return roster.length ? roster.reduce((n, p) => n + (Number(p[key]) || 0), 0) / roster.length : 0;
}
function trainingNoise(id, round, salt = 0) {
  let x = Math.sin((id + 1) * 12.9898 + (round + 1) * 78.233 + salt * 37.719) * 43758.5453;
  return 0.84 + (x - Math.floor(x)) * 0.32;
}
function trainingRoleFit(p, focus) {
  if (focus === 'attack')
    return p.pos === 'LIB'
      ? 0.04
      : p.pos === 'LEV'
        ? p.archetypeKey === 'lev_atacante' || p.archetypeKey === 'lev_pontuador'
          ? 0.72
          : 0.32
        : p.pos === 'CEN'
          ? 0.9
          : 1;
  if (focus === 'defense')
    return p.pos === 'LIB' ? 1 : p.pos === 'PON' ? 0.94 : p.pos === 'LEV' ? 0.78 : p.pos === 'CEN' ? 0.58 : 0.55;
  if (focus === 'serve') return p.pos === 'LIB' ? 0.18 : 1;
  if (focus === 'block')
    return p.pos === 'LIB' ? 0.03 : p.pos === 'CEN' ? 1 : p.pos === 'OPO' ? 0.92 : p.pos === 'PON' ? 0.82 : 0.68;
  if (focus === 'receive')
    return p.pos === 'LIB' ? 1 : p.pos === 'PON' ? 0.96 : p.pos === 'LEV' ? 0.46 : p.pos === 'OPO' ? 0.34 : 0.16;
  return 1;
}
function trainingAttrs(focus, p) {
  if (focus === 'attack') return { attack: 1 };
  if (focus === 'defense') return { defense: 1, receive: 0.16 };
  if (focus === 'volume') return { stamina: 0.62, consistency: 0.46, defense: 0.14 };
  if (focus === 'tactical') return { mental: 0.48, consistency: 0.42, set: p.pos === 'LEV' ? 0.22 : 0.06 };
  if (focus === 'serve') return { serve: 1 };
  if (focus === 'block') return { block: 1 };
  if (focus === 'receive') return { receive: 1, defense: 0.14 };
  if (p.pos === 'LEV') return { set: 0.42, serve: 0.16, defense: 0.16, mental: 0.16, consistency: 0.1 };
  if (p.pos === 'LIB') return { receive: 0.38, defense: 0.38, mental: 0.12, consistency: 0.12 };
  if (p.pos === 'CEN') return { attack: 0.28, block: 0.38, serve: 0.12, defense: 0.08, mental: 0.14 };
  if (p.pos === 'OPO') return { attack: 0.38, serve: 0.22, block: 0.2, defense: 0.08, consistency: 0.12 };
  return { attack: 0.27, receive: 0.27, serve: 0.15, block: 0.12, defense: 0.12, consistency: 0.07 };
}
function trainingReadiness(p, teamQuality) {
  let condition = clamp(0.45 + (p.condition - 55) * 0.011, 0.45, 1.04),
    morale = clamp(0.72 + (p.morale - 55) * 0.008, 0.68, 1.08),
    chem = clamp(0.78 + (p.chemistry - 55) * 0.006, 0.74, 1.06),
    cons = clamp(0.82 + (p.consistency - 55) * 0.0045, 0.78, 1.05),
    age = p.age <= 22 ? 1.08 : p.age <= 27 ? 1.02 : p.age <= 31 ? 0.96 : p.age <= 34 ? 0.88 : 0.8;
  return teamQuality * condition * morale * chem * cons * age;
}
function physicalBlockCap(p) {
  return clamp(
    60 +
      ((p.height_cm || heightFor(p)) - 180) * 1.3 +
      (p.pos === 'CEN' ? 5 : 0) +
      (p.archetypeKey === 'cen_leitura' ? 6 : 0),
    58,
    97
  );
}
function applyTrainingFocus(p, focus, weight, teamQuality, salt) {
  let fit = trainingRoleFit(p, focus),
    ready = trainingReadiness(p, teamQuality),
    attrsMap = trainingAttrs(focus, p),
    potential = developmentPotentialFactor(p),
    gains = {};
  for (let [k, share] of Object.entries(attrsMap)) {
    let current = p[k],
      diminishing = clamp((102 - current) / 34, 0.16, 1),
      gain =
        0.7 *
        weight *
        share *
        fit *
        ready *
        diminishing *
        potential *
        trainingNoise(p.id, state.round, salt + Object.keys(attrs).indexOf(k) + 1);
    if (gain < 0.025) continue;
    p[k] = clamp(current + gain, 15, 97);
    if (k === 'block') p[k] = Math.min(p[k], physicalBlockCap(p));
    let actual = p[k] - current;
    gains[k] = (gains[k] || 0) + actual;
    trackDevelopmentGain(p, k, actual, 'training');
  }
  return gains;
}
function mergeGains(a, b) {
  for (let [k, v] of Object.entries(b)) a[k] = (a[k] || 0) + v;
  return a;
}
function opponentPrepInsight(prep) {
  let pair = next();
  if (!pair) return 'Sem adversário definido para esta rodada.';
  let opp = pair.find(id => id !== state.club),
    oppLine = state.lines[opp].map(player),
    ours = state.lines[state.club].map(player);
  if (prep === 'serve') {
    let candidates = oppLine.filter(p => ['PON', 'LIB'].includes(p.pos)),
      target = [...candidates].sort((a, b) => a.receive + a.consistency * 0.25 - (b.receive + b.consistency * 0.25))[0];
    return target
      ? `${clubMainName(opp)}: ${target.name} aparece como o passador mais atacável da formação (${roleLabel(target)} · recepção ${Math.round(target.receive)}). A preparação melhora a leitura de alvo; o risco do saque continua sendo sua decisão.`
      : 'A sessão trabalha direção e pressão do saque a partir da recepção adversária.';
  }
  if (prep === 'attack') {
    let blockers = oppLine.filter(p => p.pos !== 'LIB'),
      best = [...blockers].sort(
        (a, b) => b.block + (b.height_cm || heightFor(b)) * 0.18 - (a.block + (a.height_cm || heightFor(a)) * 0.18)
      )[0],
      ourWeapons = ours.filter(p => ['PON', 'CEN', 'OPO'].includes(p.pos)).sort((a, b) => b.attack - a.attack),
      weapon = ourWeapons[0];
    return `${clubMainName(opp)} tem ${best?.name || 'um bloqueador'} como principal referência de rede. A sessão prepara variação de direção, exploração das mãos e bola de segurança; ${weapon?.name || 'o melhor atacante'} é a principal referência ofensiva da nossa formação.`;
  }
  let danger = oppLine
    .filter(p => ['PON', 'CEN', 'OPO'].includes(p.pos))
    .sort((a, b) => b.attack + b.serve * 0.25 + b.block * 0.2 - (a.attack + a.serve * 0.25 + a.block * 0.2))[0];
  return `${clubMainName(opp)}: o plano parte de ${danger?.name || 'sua principal referência'} (${danger ? roleLabel(danger) : 'ataque'}) e organiza saque, bloqueio e cobertura como uma única leitura. O ganho é de preparação e decisão, não um bônus técnico fixo.`;
}
function currentTraining() {
  return state.trained && state.lastTraining?.round === state.round ? state.lastTraining : null;
}
function applyWeeklyTraining() {
  ensureTrainingState(state);
  if (state.trained || !next() || (match && !match.done)) return false;
  let { primary, secondary, prep } = state.weekPlan;
  if (primary === secondary) {
    notify('Escolha focos diferentes para o treino prioritário e secundário.');
    return false;
  }
  let roster = state.all.filter(p => p.club === state.club),
    avgCondition = meanRoster(roster, 'condition'),
    avgMorale = meanRoster(roster, 'morale'),
    avgChem = meanRoster(roster, 'chemistry'),
    teamQuality = clamp(0.55 + avgCondition * 0.0015 + avgMorale * 0.0015 + avgChem * 0.0015, 0.73, 1.01),
    total = {};
  for (let p of roster) {
    mergeGains(total, applyTrainingFocus(p, primary, 1, teamQuality, 11));
    mergeGains(total, applyTrainingFocus(p, secondary, 0.52, teamQuality, 23));
    let cohesion =
        0.12 +
        (primary === 'tactical' || primary === 'volume' ? 0.5 : 0) +
        (secondary === 'tactical' || secondary === 'volume' ? 0.24 : 0),
      chemGain = cohesion * teamQuality * trainingNoise(p.id, state.round, 41),
      moraleMove = (teamQuality - 0.82) * 0.65 * trainingNoise(p.id, state.round, 43),
      conditionCost = 0.45 + (primary === 'volume' ? 0.45 : 0) + (secondary === 'volume' ? 0.2 : 0);
    p.chemistry = clamp(p.chemistry + chemGain, 40, 99);
    p.morale = clamp(p.morale + moraleMove, 35, 99);
    p.condition = clamp(p.condition - conditionCost, 1, 100);
  }
  let prepStrength = clamp(
      0.5 +
        meanRoster(roster, 'mental') * 0.0024 +
        meanRoster(roster, 'chemistry') * 0.0022 +
        meanRoster(roster, 'morale') * 0.0014,
      0.72,
      1.12
    ),
    keyGains = Object.entries(total)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([k, v]) => `${attrs[k]} +${(v / roster.length).toFixed(1).replace('.', ',')}`)
      .join(' · '),
    quality =
      teamQuality >= 0.94 ? 'muito boa' : teamQuality >= 0.86 ? 'boa' : teamQuality >= 0.79 ? 'regular' : 'limitada',
    record = {
      round: state.round,
      primary,
      secondary,
      prep,
      teamQuality,
      prepStrength,
      insight: opponentPrepInsight(prep),
      keyGains,
      quality,
      condition: Math.round(avgCondition),
      morale: Math.round(avgMorale),
      chemistry: Math.round(avgChem)
    };
  state.trained = true;
  state.lastTraining = record;
  state.trainingLog.push(record);
  state.trainingLog = state.trainingLog.slice(-24);
  commit();
  render();
  notify(`Semana preparada: sessão ${quality}.`);
  return true;
}
function aiPreparationProfile(aiId, opponentId) {
  let opp = state.tactics[opponentId] || defaultTactics(opponentId),
    style = teamStyle(opponentId).tactics;
  if (['aggressive', 'selective'].includes(opp.serve || style.serve))
    return { key: 'receive', label: 'passe sob pressão' };
  if ((opp.distribution || style.distribution) !== 'balanced')
    return { key: 'block', label: 'leitura de distribuição' };
  if ((opp.block || style.block) !== 'read') return { key: 'attack', label: 'ataque contra bloqueio' };
  return { key: 'tactical', label: 'plano tático' };
}
function applyAiMatchPreparation(all, pair) {
  if (!Array.isArray(pair) || state.club === null) return null;
  const aiId = pair.find(id => id !== state.club),
    opponentId = state.club;
  if (aiId === undefined) return null;
  const roster = all.filter(p => p.club === aiId),
    persistent = state.all.filter(p => p.club === aiId),
    avgMental = meanRoster(persistent, 'mental'),
    avgChem = meanRoster(persistent, 'chemistry'),
    avgMorale = meanRoster(persistent, 'morale'),
    strength = clamp(0.72 + avgMental * 0.0015 + avgChem * 0.0013 + avgMorale * 0.0011, 0.78, 1.01),
    starters = new Set(state.lines[aiId] || []),
    profile = aiPreparationProfile(aiId, opponentId);
  for (let p of roster) {
    let active = starters.has(p.id) ? 1 : 0.4,
      ready = trainingReadiness(p, clamp(0.74 + avgChem * 0.0016 + avgMorale * 0.0012, 0.78, 1.01)),
      bonus = strength * ready * active * trainingNoise(p.id, state.round, 113);
    if (profile.key === 'receive') {
      p.receive = clamp(p.receive + bonus * 0.72, 15, 99);
      p.mental = clamp(p.mental + bonus * 0.3, 15, 99);
      p.consistency = clamp(p.consistency + bonus * 0.2, 15, 99);
    } else if (profile.key === 'block') {
      if (p.pos !== 'LIB') p.block = Math.min(physicalBlockCap(p), clamp(p.block + bonus * 0.58, 15, 99));
      p.defense = clamp(p.defense + bonus * 0.32, 15, 99);
      p.mental = clamp(p.mental + bonus * 0.24, 15, 99);
    } else if (profile.key === 'attack') {
      if (p.pos !== 'LIB') p.attack = clamp(p.attack + bonus * 0.62, 15, 99);
      if (p.pos === 'LEV') p.set = clamp(p.set + bonus * 0.3, 15, 99);
      p.consistency = clamp(p.consistency + bonus * 0.24, 15, 99);
    } else {
      p.mental = clamp(p.mental + bonus * 0.5, 15, 99);
      p.consistency = clamp(p.consistency + bonus * 0.42, 15, 99);
      p.chemistry = clamp(p.chemistry + bonus * 0.28, 1, 100);
      p.defense = clamp(p.defense + bonus * 0.18, 15, 99);
    }
  }
  return { club: aiId, key: profile.key, label: profile.label, strength: Number(strength.toFixed(2)) };
}
function preparedRosterForMatch() {
  let all = state.all.map(p => ({ ...p })),
    rec = currentTraining(),
    starters = new Set(state.lines[state.club] || []);
  for (let p of all) {
    let form = recentPlayerForm(p);
    if (form.n >= 3) {
      let pulse = clamp((form.avg - 6.75) * 1.45, -1.25, 1.25);
      p.mental = clamp(p.mental + pulse, 15, 99);
      p.consistency = clamp(p.consistency + pulse * 0.65, 15, 99);
    }
    if (!rec || p.club !== state.club) continue;
    let active = starters.has(p.id) ? 1 : 0.45,
      individual = trainingReadiness(p, rec.teamQuality),
      bonus = rec.prepStrength * individual * active * trainingNoise(p.id, state.round, 71);
    if (rec.prep === 'serve') {
      p.serve = clamp(p.serve + bonus * 1.05, 15, 99);
      p.mental = clamp(p.mental + bonus * 0.3, 15, 99);
    } else if (rec.prep === 'attack') {
      if (p.pos !== 'LIB') p.attack = clamp(p.attack + bonus * 0.9, 15, 99);
      p.consistency = clamp(p.consistency + bonus * 0.32, 15, 99);
    } else {
      p.mental = clamp(p.mental + bonus * 0.72, 15, 99);
      p.consistency = clamp(p.consistency + bonus * 0.62, 15, 99);
      p.chemistry = clamp(p.chemistry + bonus * 0.45, 1, 100);
    }
  }
  let aiPrep = applyAiMatchPreparation(all, next());
  return Object.assign(all, { aiPreparation: aiPrep });
}
function trainingOptions(selected) {
  return Object.entries(TRAINING_FOCI)
    .map(([k, v]) => `<option value="${k}" ${k === selected ? 'selected' : ''}>${v.label}</option>`)
    .join('');
}
function prepOptions(selected) {
  return Object.entries(MATCH_PREP)
    .map(([k, v]) => `<option value="${k}" ${k === selected ? 'selected' : ''}>${v.label}</option>`)
    .join('');
}
function weeklyTrainingPanel(n) {
  ensureTrainingState(state);
  let locked = state.trained || (!!match && !match.done) || !n,
    plan = state.weekPlan,
    rec = currentTraining(),
    same = plan.primary === plan.secondary;
  return `<div class="panel weekly-training"><div class="panelhead"><div><h2>Preparação da semana</h2><small>PRIORIDADE · SECUNDÁRIO · JOGO</small></div>${rec ? '<span class="pill">CONCLUÍDA</span>' : '<span class="pill">1 PLANO / RODADA</span>'}</div><p class="training-intro">O foco direciona a sessão, mas não entrega pontos de atributo automaticamente. Condição, moral, entrosamento, consistência, idade e resposta individual modulam o resultado.</p><div class="training-grid"><label><span>1 · Treino prioritário</span><select data-week-plan="primary" ${locked ? 'disabled' : ''}>${trainingOptions(plan.primary)}</select><small>${TRAINING_FOCI[plan.primary].desc}</small></label><label><span>2 · Treino secundário</span><select data-week-plan="secondary" ${locked ? 'disabled' : ''}>${trainingOptions(plan.secondary)}</select><small>${TRAINING_FOCI[plan.secondary].desc}</small></label><label class="match-prep"><span>3 · Preparação para o jogo</span><select data-week-plan="prep" ${locked ? 'disabled' : ''}>${prepOptions(plan.prep)}</select><small>${MATCH_PREP[plan.prep].desc}</small></label></div>${rec ? `<div class="training-result"><b>Sessão ${rec.quality}</b><span>${TRAINING_FOCI[rec.primary].label} + ${TRAINING_FOCI[rec.secondary].label}</span><small>${rec.keyGains || 'Evolução distribuída entre técnica e conexão coletiva.'}</small><p>${rec.insight}</p></div>` : `<div class="training-foot"><small>${same ? 'Escolha focos diferentes. O secundário deve complementar a prioridade.' : 'Sem controle de carga: a sessão usa desgaste leve e resposta variável do elenco.'}</small>${button('Confirmar preparação da semana', 'week-train', 'primary', locked || same)}</div>`}</div>`;
}
function matchPrepBlock() {
  let rec = currentTraining();
  return rec
    ? `<div class="prep-week-note"><small>PREPARAÇÃO DA SEMANA · ${MATCH_PREP[rec.prep].label.toUpperCase()}</small><p>${rec.insight}</p><span>Resposta da sessão: ${rec.quality}. O efeito no jogo é leve e depende do estado real dos atletas.</span></div>`
    : '';
}

function player(id) {
  return state.all.find(p => p.id === Number(id));
}
function club(id) {
  return id === null || id === undefined ? null : clubs.find(c => c.id === Number(id));
}
function clubMainNameRef(c) {
  if (!c) return '';
  let name = c.name.replace(/\s+(Atlético|Vôlei)$/i, '').trim();
  if (/^Porto Alegre/i.test(name)) return 'Porto Alegre';
  if (/^Belo Horizonte/i.test(name)) return 'Belo Horizonte';
  if (/^Joinville/i.test(name)) return 'Joinville';
  return name.split(/\s+/).slice(0, 2).join(' ');
}
function clubMainName(id) {
  return id && typeof id === 'object' && id.name !== undefined ? clubMainNameRef(id) : clubMainNameRef(club(id));
}
function heightLabel(p) {
  return ((p.height_cm || heightFor(p)) / 100).toFixed(2).replace('.', ',') + ' m';
}
function playerInitials(name) {
  let b = (name || '').split(/\s+/).filter(Boolean);
  return (b[0]?.[0] || 'A') + (b[1]?.[0] || b[0]?.[1] || '');
}
function playerMetaInline(p, includeServe = true) {
  return `${p.pos} · ${roleLabel(p)} · ${heightLabel(p)}${includeServe ? ` · Saque ${serveStyleLabel(p)}` : ''}`;
}
function playerIdentity(p, { clickable = false, compact = false, includeServe = true, subtitle = '' } = {}) {
  if (!p) return '';
  let tag = clickable ? 'button' : 'div',
    attrs = clickable
      ? ` class="player-identity ${compact ? 'compact' : ''}" data-player="${p.id}"`
      : ` class="player-identity ${compact ? 'compact' : ''}"`;
  let sub = subtitle || playerMetaInline(p, includeServe);
  return `<${tag}${attrs}><span class="player-avatar pos-${p.pos.toLowerCase()}">${playerInitials(p.name)}</span><span class="player-identity-copy"><strong>${p.name}${p.tribute ? '<em class="identity-tribute">Homenagem</em>' : ''}</strong><small>${sub}</small></span></${tag}>`;
}
function my() {
  return club(state.club);
}
function next() {
  return state.club !== null && state.round < fixtures.length
    ? fixtures[state.round].find(pair => pair.includes(state.club))
    : null;
}
function activeMatch() {
  return match || state.last;
}
function totalEvents(id = state.club) {
  return state.results
    .filter(m => m.home === id || m.away === id)
    .flatMap(m =>
      (m.events || []).map(e => {
        if (m.home === id) return e;
        return {
          ...e,
          winner: 1 - e.winner,
          serving: 1 - e.serving,
          errorTeam: e.errorTeam === null || e.errorTeam === undefined ? e.errorTeam : 1 - e.errorTeam,
          rotation: [e.rotation[1], e.rotation[0]],
          infraction: e.infraction ? { ...e.infraction, team: 1 - e.infraction.team } : e.infraction,
          steps: (e.steps || []).map(s => ({ ...s, team: 1 - s.team }))
        };
      })
    );
}

function standingsFromResults(results) {
  return clubs
    .map(c => {
      let games = results.filter(m => m.home === c.id || m.away === c.id),
        row = { ...c, games: games.length, wins: 0, points: 0, sf: 0, sa: 0, pf: 0, pa: 0 };
      for (let m of games) {
        let side = m.home === c.id ? 0 : 1,
          a = m.sets[side],
          b = m.sets[1 - side];
        row.wins += a > b ? 1 : 0;
        row.points += a > b ? (b === 2 ? 2 : 3) : a === 2 ? 1 : 0;
        row.sf += a;
        row.sa += b;
        for (let score of m.setScores || []) {
          row.pf += Number(score[side] || 0);
          row.pa += Number(score[1 - side] || 0);
        }
      }
      return row;
    })
    .sort(
      (a, b) =>
        b.points - a.points ||
        b.wins - a.wins ||
        b.sf / Math.max(b.sa, 0.01) - a.sf / Math.max(a.sa, 0.01) ||
        b.pf / Math.max(b.pa, 0.01) - a.pf / Math.max(a.pa, 0.01) ||
        a.id - b.id
    );
}
function resultsThroughRound(round) {
  return state.results.filter(m => Number.isInteger(m.round) && m.round <= round);
}
function clubResults(id, limit = 999, results = state.results) {
  return results.filter(m => m.home === id || m.away === id).slice(-limit);
}
function clubWon(m, id) {
  let side = m.home === id ? 0 : 1;
  return m.sets[side] === 3;
}
function clubFormString(id, limit = 5, results = state.results) {
  let games = clubResults(id, limit, results);
  return games.map(m => (clubWon(m, id) ? 'V' : 'D')).join('') || '—';
}
function clubStreak(id, results = state.results) {
  let games = clubResults(id, 999, results);
  if (!games.length) return { type: 'none', n: 0 };
  let win = clubWon(games.at(-1), id),
    n = 0;
  for (let i = games.length - 1; i >= 0 && clubWon(games[i], id) === win; i--) n++;
  return { type: win ? 'win' : 'loss', n };
}
function strengthRankMap() {
  let rows = clubs
    .map(c => {
      let roster = state.all.filter(p => p.club === c.id),
        value = roster.length ? roster.reduce((n, p) => n + overall(p), 0) / roster.length : 0;
      return { id: c.id, value };
    })
    .sort((a, b) => b.value - a.value);
  return Object.fromEntries(rows.map((x, i) => [x.id, i + 1]));
}
function standingRankMap(results = state.results) {
  let rows = standingsFromResults(results);
  return Object.fromEntries(rows.map((x, i) => [x.id, i + 1]));
}
function previousStandingRank(id) {
  if (state.round <= 1) return null;
  let prev = standingsFromResults(resultsThroughRound(state.round - 2));
  let idx = prev.findIndex(x => x.id === id);
  return idx < 0 ? null : idx + 1;
}
function currentStandingRank(id) {
  let idx = standings().findIndex(x => x.id === id);
  return idx < 0 ? null : idx + 1;
}
function positionDelta(id) {
  let prev = previousStandingRank(id),
    now = currentStandingRank(id);
  return prev && now ? prev - now : 0;
}
function seasonTeamStories() {
  if (!state.results.length) return [];
  let table = standings(),
    strength = strengthRankMap(),
    rank = standingRankMap(),
    stories = [];
  let leader = table[0],
    second = table[1],
    gap = (leader?.points || 0) - (second?.points || 0);
  if (leader)
    stories.push({
      kind: 'LIDERANÇA',
      club: leader.id,
      title: `${leader.name} lidera a competição`,
      detail:
        gap === 0
          ? 'A liderança está empatada em pontos.'
          : `A vantagem é de ${gap} ponto${gap === 1 ? '' : 's'} para o segundo colocado.`
    });
  let streaks = clubs.map(c => ({ club: c.id, ...clubStreak(c.id) }));
  let hot = streaks.filter(x => x.type === 'win').sort((a, b) => b.n - a.n)[0];
  if (hot?.n >= 2)
    stories.push({
      kind: 'EM ALTA',
      club: hot.club,
      title: `${club(hot.club).name} ganhou ${hot.n} seguidas`,
      detail: `Forma recente: ${clubFormString(hot.club, 5)}. A sequência já está moldando o momento competitivo.`
    });
  let cold = streaks.filter(x => x.type === 'loss').sort((a, b) => b.n - a.n)[0];
  if (cold?.n >= 2)
    stories.push({
      kind: 'PRESSÃO',
      club: cold.club,
      title: `${club(cold.club).name} perdeu ${cold.n} seguidas`,
      detail: `Forma recente: ${clubFormString(cold.club, 5)}. A confiança começa a virar tema para a próxima rodada.`
    });
  let surprises = clubs
    .map(c => ({
      club: c.id,
      delta: (strength[c.id] || 0) - (rank[c.id] || 0),
      rank: rank[c.id],
      strength: strength[c.id]
    }))
    .sort((a, b) => b.delta - a.delta);
  let surprise = surprises[0];
  if (surprise?.delta >= 2)
    stories.push({
      kind: 'SURPRESA',
      club: surprise.club,
      title: `${club(surprise.club).name} está acima da força do elenco`,
      detail: `${surprise.rank}º na tabela com elenco projetado em ${surprise.strength}º por força posicional.`
    });
  let under = [...surprises].sort((a, b) => a.delta - b.delta)[0];
  if (under?.delta <= -2)
    stories.push({
      kind: 'ABAIXO DO ESPERADO',
      club: under.club,
      title: `${club(under.club).name} ainda não transformou elenco em resultado`,
      detail: `${under.rank}º na tabela apesar de força projetada em ${under.strength}º.`
    });
  return stories.slice(0, 5);
}
function roundTopScorer(round) {
  let games = state.results.filter(m => m.round === round),
    best = null;
  for (let m of games)
    for (let side of [0, 1]) {
      let s = matchStats(m, side);
      for (let [id, p] of Object.entries(s.players || {})) {
        let points = (p.kills || 0) + (p.aces || 0) + (p.blocks || 0);
        if (!best || points > best.points) best = { id: Number(id), points, club: [m.home, m.away][side], match: m };
      }
    }
  return best;
}
function roundBiggestMover(round) {
  if (round <= 0) return null;
  let before = standingsFromResults(resultsThroughRound(round - 1)),
    after = standingsFromResults(resultsThroughRound(round)),
    beforeMap = Object.fromEntries(before.map((x, i) => [x.id, i + 1])),
    afterMap = Object.fromEntries(after.map((x, i) => [x.id, i + 1]));
  return clubs
    .map(c => ({
      club: c.id,
      from: beforeMap[c.id],
      to: afterMap[c.id],
      delta: (beforeMap[c.id] || 0) - (afterMap[c.id] || 0)
    }))
    .sort((a, b) => b.delta - a.delta)[0];
}
function roundRecapPanel(round = state.round - 1, full = false) {
  if (round < 0) return '';
  let games = state.results.filter(m => m.round === round);
  if (!games.length) return '';
  let mover = roundBiggestMover(round),
    top = roundTopScorer(round),
    myGame = games.find(m => m.home === state.club || m.away === state.club),
    mySide = myGame ? (myGame.home === state.club ? 0 : 1) : 0,
    myWon = myGame ? myGame.sets[mySide] === 3 : false,
    table = standingsFromResults(resultsThroughRound(round)),
    rank = table.findIndex(x => x.id === state.club) + 1;
  let gamesHtml = games
    .map(
      m =>
        `<div class="season-round-result ${m.home === state.club || m.away === state.club ? 'mine' : ''}"><span>${club(m.home).short}</span><strong>${m.sets[0]} × ${m.sets[1]}</strong><span>${club(m.away).short}</span></div>`
    )
    .join('');
  return `<section class="panel season-round-recap"><div class="panelhead"><div><small>RODADA ${round + 1} · O QUE MUDOU</small><h2>${myGame ? (myWon ? 'Vitória e campeonato em movimento' : 'Derrota com consequência na tabela') : 'A rodada mexeu na liga'}</h2></div><span class="pill">${rank}º LUGAR</span></div><div class="season-recap-grid"><article><small>NOSSO MOMENTO</small><strong>${clubFormString(state.club, 5, resultsThroughRound(round))}</strong><p>${myGame ? `${club(myGame.home).short} ${myGame.sets.join(' × ')} ${club(myGame.away).short}.` : ''} ${positionDelta(state.club) > 0 ? 'Subimos ' + positionDelta(state.club) + ' posição(ões).' : positionDelta(state.club) < 0 ? 'Caímos ' + Math.abs(positionDelta(state.club)) + ' posição(ões).' : 'Posição mantida.'}</p></article>${mover && mover.delta > 0 ? `<article><small>MAIOR MOVIMENTO</small><strong>${club(mover.club).short} ↑${mover.delta}</strong><p>Saiu de ${mover.from}º para ${mover.to}º nesta rodada.</p></article>` : ''}${top ? `<article><small>PONTUADOR DA RODADA</small><strong>${player(top.id)?.name || 'Atleta'}</strong><p>${top.points} pontos por ${club(top.club).short}. Métrica de produção, sem usar a nota do levantador.</p></article>` : ''}</div>${full ? `<div class="season-round-results">${gamesHtml}</div>` : ''}</section>`;
}
function seasonPulsePanel() {
  if (!state.results.length)
    return `<section class="panel season-pulse"><div class="panelhead"><div><small>TEMPORADA</small><h2>O campeonato começa a ganhar memória</h2></div></div><p>Depois da primeira rodada, esta área passa a mostrar liderança, sequências, surpresas e pressão.</p></section>`;
  let table = standings(),
    me = table.find(x => x.id === state.club),
    rank = table.findIndex(x => x.id === state.club) + 1,
    streak = clubStreak(state.club),
    delta = positionDelta(state.club),
    stories = seasonTeamStories(),
    lead = stories[0];
  return `<section class="panel season-pulse"><div class="panelhead"><div><small>PULSO DA TEMPORADA</small><h2>${rank === 1 ? 'Estamos na liderança' : `Estamos em ${rank}º`}</h2></div>${button('Ver temporada', 'league')}</div><div class="season-pulse-metrics"><span><small>FORMA</small><b>${clubFormString(state.club, 5)}</b></span><span><small>SEQUÊNCIA</small><b>${streak.n ? `${streak.type === 'win' ? 'V' : 'D'}${streak.n}` : '—'}</b></span><span><small>MOVIMENTO</small><b>${delta > 0 ? '↑ ' + delta : delta < 0 ? '↓ ' + Math.abs(delta) : '—'}</b></span><span><small>PONTOS</small><b>${me?.points || 0}</b></span></div>${lead ? `<div class="season-pulse-story"><small>${lead.kind}</small><strong>${lead.title}</strong><p>${lead.detail}</p></div>` : ''}${state.round ? button('O que mudou na última rodada', 'round-recap') : ''}</section>`;
}
function seasonDashboard() {
  if (!state.results.length) return '';
  let table = standings(),
    stories = seasonTeamStories(),
    strength = strengthRankMap(),
    rank = standingRankMap();
  let clubCards = clubs
    .map(c => {
      let row = table.find(x => x.id === c.id),
        streak = clubStreak(c.id),
        delta = positionDelta(c.id),
        gap = (strength[c.id] || 0) - (rank[c.id] || 0);
      return `<article class="season-club-card ${c.id === state.club ? 'mine' : ''}"><div><small>${c.short} · ${row ? rank[c.id] + 'º' : '—'}</small><strong>${c.name}</strong><span>${clubFormString(c.id, 5)}</span></div><div><b>${row?.points || 0} pts</b><small>${delta > 0 ? '↑ ' + delta : delta < 0 ? '↓ ' + Math.abs(delta) : 'posição estável'} · ${streak.n ? `${streak.type === 'win' ? 'V' : 'D'}${streak.n}` : 'sem sequência'}</small><em>${gap >= 2 ? 'acima do elenco' : gap <= -2 ? 'abaixo do elenco' : 'dentro do esperado'}</em></div></article>`;
    })
    .join('');
  return `<section class="season-dashboard"><div class="panel season-head"><div class="panelhead"><div><small>PANORAMA DA TEMPORADA</small><h2>O campeonato tem trajetória</h2></div><span class="tag">${state.round}/${fixtures.length} RODADAS</span></div><div class="season-story-grid">${stories.map(s => `<article><small>${s.kind}</small><strong>${s.title}</strong><p>${s.detail}</p></article>`).join('')}</div></div><div class="panel"><div class="panelhead"><div><small>FORMA E EXPECTATIVA</small><h2>Os oito clubes agora</h2></div></div><div class="season-club-grid">${clubCards}</div></div></section>`;
}

function standings() {
  return clubs
    .map(c => {
      let games = state.results.filter(m => m.home === c.id || m.away === c.id),
        row = { ...c, games: games.length, wins: 0, points: 0, sf: 0, sa: 0, pf: 0, pa: 0 };
      for (let m of games) {
        let side = m.home === c.id ? 0 : 1,
          a = m.sets[side],
          b = m.sets[1 - side];
        row.wins += a > b ? 1 : 0;
        row.points += a > b ? (b === 2 ? 2 : 3) : a === 2 ? 1 : 0;
        row.sf += a;
        row.sa += b;
        for (let score of m.setScores || []) {
          row.pf += Number(score[side] || 0);
          row.pa += Number(score[1 - side] || 0);
        }
      }
      return row;
    })
    .sort(
      (a, b) =>
        b.points - a.points ||
        b.wins - a.wins ||
        b.sf / Math.max(b.sa, 0.01) - a.sf / Math.max(a.sa, 0.01) ||
        b.pf / Math.max(b.pa, 0.01) - a.pf / Math.max(a.pa, 0.01) ||
        a.id - b.id
    );
}
function crest(c) {
  return `<div class="crest" style="color:${c.color}">${c.short}</div>`;
}
function metric(label, n, detail) {
  return `<div class="metric"><label>${label}</label><div class="number">${n}</div><small>${detail}</small></div>`;
}
function button(text, action, cls = '', disabled = false) {
  return `<button class="${cls}" data-action="${action}" ${disabled ? 'disabled' : ''}>${text}</button>`;
}
function table(headers, rows) {
  return `<div class="tablewrap"><table><thead><tr>${headers.map(x => `<th>${x}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table></div>`;
}
function heading(kicker, title, desc, extra = '') {
  return `<div class="heading"><div><div class="eyebrow">${kicker}</div><h1>${title}</h1><p>${desc}</p></div>${extra}</div>`;
}
function nav() {
  return [
    ['home', '◈', 'Início'],
    ['squad', '◉', 'Plantel & plano'],
    ['market', '↔', 'Mercado'],
    ['match', '▷', 'Partida'],
    ['data', '▥', 'Análises'],
    ['ranking', '≋', 'Ranking'],
    ['scout', '⌕', 'Observação'],
    ['league', '▤', 'Temporada'],
    ['about', '⊞', 'Sobre o jogo']
  ]
    .map(
      ([v, i, label]) =>
        `<button class="${view === v ? 'active' : ''}" data-view="${v}" ${match && !match.done && v === 'squad' ? 'disabled' : ''}><span>${i}</span>${label}</button>`
    )
    .join('');
}
function mobileBottomNav() {
  if (!my()) return '';
  let live = view === 'match' && match && !match.done;
  if (live)
    return `<nav class="mobile-bottom-nav match-mobile-nav" aria-label="Ações rápidas da partida"><button class="active" data-action="mobile-court"><span>◉</span><b>Partida</b></button><button data-action="mobile-coach:tactics"><span>⌁</span><b>Tática</b></button><button data-action="mobile-coach:analyst"><span>◇</span><b>Auxiliar</b></button><button data-action="sub"><span>⇄</span><b>Banco</b></button><button data-action="mobile-more"><span>•••</span><b>Mais</b></button></nav>`;
  return `<nav class="mobile-bottom-nav" aria-label="Navegação principal"><button class="${view === 'home' ? 'active' : ''}" data-view="home"><span>⌂</span><b>Início</b></button><button class="${view === 'match' ? 'active' : ''}" data-view="match"><span>▷</span><b>Partida</b></button><button class="${view === 'squad' ? 'active' : ''}" data-view="squad"><span>◉</span><b>Plantel</b></button><button class="${view === 'ranking' ? 'active' : ''}" data-view="ranking"><span>≋</span><b>Ranking</b></button><button data-action="mobile-more"><span>•••</span><b>Jogo</b></button></nav>`;
}
function mainContent(c) {
  return `${!c ? choose() : ({ home: home, squad: squad, market: marketPage, match: matchPage, data: data, ranking: ranking, scout: scout, league: league, about: about }[view] || home)()}<footer>Seu progresso é salvo automaticamente neste navegador. Você pode salvar uma cópia do jogo para usar em outro aparelho e começar uma nova temporada quando quiser.</footer>`;
}
function render() {
  let motion = captureCourt();
  let c = my();
  $('#app').innerHTML =
    `<div class="shell ${view === 'match' && activeMatch() ? 'game-mode' : ''}"><aside class="sidebar"><div class="brand">VOLLEY<br> MANAGER <b>BR</b><small>BRASIL · TEMPORADA TESTE</small></div><nav class="nav" aria-label="Navegação do jogo">${c ? nav() : ''}</nav><div class="sidebottom"><b>LIGA TESTE · 8 CLUBES</b><br>${state.all.filter(p => p.club >= 0).length} atletas inscritos<br>Partidas, temporada e mercado</div></aside><div class="content"><header class="topbar"><div class="clubmini"><div class="badge">${c ? c.short : 'VM'}</div><div><strong>${c ? c.name : 'Seu próximo desafio começa aqui'}</strong><small>${c ? c.city : 'Volley Manager Brasil · jogo em desenvolvimento'}</small></div></div><div class="topright">${c ? `<small class="muted">Temporada<br>Rodada ${Math.min(state.round + 1, fixtures.length)} de ${fixtures.length}</small>` : ''}<div class="tools">${c ? `<span class="pill" id="save-indicator">${saveLabel()}</span>` + button('Meu jogo', 'mobile-more') : button('Carregar jogo', 'import')}<input id="import" type="file" accept="application/json" hidden></div></div></header><main class="main">${mainContent(c)}</main></div></div>${c ? mobileBottomNav() : ''}<dialog id="detail"></dialog>`;
  bind();
  syncMatchOverlay();
  animateCourt(motion);
}
// Durante o autoplay da partida, evita reconstruir sidebar/topbar/nav a cada rally: só o conteúdo de .main muda.
function renderMatchTick() {
  if (view !== 'match' || !activeMatch()) {
    render();
    return;
  }
  let main = document.querySelector('.main');
  if (!main) {
    render();
    return;
  }
  let motion = captureCourt();
  main.innerHTML = mainContent(my());
  bind();
  syncMatchOverlay();
  animateCourt(motion);
}
function clubStyleProfile(id) {
  const t = teamStyle(id).tactics;
  if (t.pace === 'fast' && t.serve === 'aggressive')
    return {
      label: 'ALTA VARIÂNCIA',
      detail: 'Busca quebrar o jogo cedo; exige passe e leitura para sustentar o ritmo.'
    };
  if (t.pace === 'fast')
    return {
      label: 'EXECUÇÃO EXIGENTE',
      detail: 'Acelera quando o passe chega na mão; sofre mais se a recepção oscilar.'
    };
  if (t.serve === 'aggressive')
    return { label: 'AGRESSIVO', detail: 'Aceita mais erro para aumentar pressão no saque.' };
  if (t.pace === 'control') return { label: 'CONTROLE', detail: 'Mais estável em rallies longos e reconstrução.' };
  return { label: 'EQUILIBRADO', detail: 'Identidade adaptável, sem depender de uma única condição.' };
}
function choose() {
  return `${heading('Nova temporada', 'Escolha o seu clube.', 'Oito equipes com estilos diferentes. A identidade muda o jeito de vencer e também o nível de variância da campanha.')}<div class="clubgrid">${clubs
    .map(c => {
      let profile = clubStyleProfile(c.id),
        style = teamStyle(c.id);
      return `<article class="choose">${crest(c)}<div class="eyebrow">${c.identity}</div><h2>${c.name}</h2><p>${c.city}</p><p>${c.description}</p><div class="statusline">Estilo <b>${style.label}</b></div><div class="statusline">Perfil <b>${profile.label}</b></div><small class="club-style-note">${profile.detail}</small><div class="statusline">Folha mensal <b>${money(state.all.filter(p => p.club === c.id).reduce((s, p) => s + p.salary, 0))}</b></div><div class="statusline">Elenco <b>14 atletas</b></div><button class="primary full" data-club="${c.id}">Escolher ${c.short}</button></article>`;
    })
    .join(
      ''
    )}</div><div class="note"><h3>Como funciona</h3><p>Você escolhe um clube, monta a formação, define o plano de jogo e disputa 14 rodadas. Estilos agressivos podem ter teto maior em condições certas, mas também oscilam mais quando a primeira bola não entra.</p></div>`;
}
function home() {
  let c = my(),
    n = next(),
    s = seasonStats(),
    tableNow = standings(),
    row = tableNow.find(x => x.id === c.id),
    rank = state.round ? tableNow.findIndex(x => x.id === c.id) + 1 : null,
    roster = state.all.filter(p => p.club === c.id),
    mean = k => Math.round(roster.reduce((v, p) => v + p[k], 0) / roster.length),
    own = state.results.filter(m => m.home === c.id || m.away === c.id),
    recent = own.slice(-5),
    recentWins = recent.filter(m => m.sets[m.home === c.id ? 0 : 1] === 3).length,
    opp = n ? club(n[0] === c.id ? n[1] : n[0]) : null,
    venue = n ? (n[0] === c.id ? 'Em casa' : 'Fora de casa') : '',
    last = own.at(-1),
    lastSide = last ? (last.home === c.id ? 0 : 1) : 0,
    lastWon = last ? last.sets[lastSide] === 3 : false,
    insight = s.rallies
      ? s.positive / Math.max(1, s.receptions) < 0.42
        ? 'A recepção ainda limita algumas construções. Vale revisar quem segura o passe antes da próxima partida.'
        : s.breaks / Math.max(1, s.served) < 0.34
          ? 'O time está pontuando pouco no saque. O plano seletivo pode criar pressão sem aumentar demais os erros.'
          : 'A estrutura está equilibrada. O próximo ganho pode vir de explorar melhor os matchups durante o set.'
      : 'A primeira leitura da temporada começa no primeiro saque.';
  return `${heading('Início', 'Seu clube em um olhar.', 'Próxima partida, momento da equipe e a decisão mais importante agora.', `<span class="tag">${state.round === fixtures.length ? 'TEMPORADA ENCERRADA' : 'RODADA ' + Math.min(state.round + 1, fixtures.length)}</span>`)}<section class="home-mobile-hero panel">${n ? `<div class="home-hero-top"><div><small>${venue.toUpperCase()} · RODADA ${state.round + 1}</small><h2>${opp.name}</h2><span>${opp.identity}</span></div>${crest(opp)}</div><div class="home-hero-actions">${button('Ajustar time', 'squad', '', !!match && !match.done)}${button(match && !match.done ? 'Retomar partida' : 'Jogar partida', 'match', 'primary')}</div>` : `<div class="home-season-end"><small>TEMPORADA ENCERRADA</small><h2>${tableNow[0].name}</h2><p>Campeão com ${tableNow[0].points} pontos.</p>${button('Ver classificação final', 'league', 'primary')}</div>`}</section><div class="home-glance">${metric('Posição', rank ? rank + 'º' : '—', `${row.points} pts · ${row.wins} vitórias`)}${metric('Últimos jogos', recent.length ? `${recentWins}/${recent.length}` : '—', recent.length ? 'vitórias nos últimos ' + recent.length : 'estreia pela frente')}${metric('Condição', mean('condition') + '%', `moral ${mean('morale')}%`)}</div>${seasonPulsePanel()}<section class="panel home-insight"><div><small>LEITURA DO MOMENTO</small><h2>${last ? (lastWon ? 'O time vem de vitória' : 'Há uma resposta a construir') : 'A temporada começa aqui'}</h2><p>${insight}</p></div><div class="home-insight-actions">${button('Ver plantel', 'squad')}${button('Abrir ranking', 'ranking')}</div></section><div class="home-secondary-grid"><section>${weeklyTrainingPanel(n)}</section><section><div class="panel home-standing"><div class="panelhead"><div><small>LIGA</small><h2>Classificação</h2></div>${button('Ver tudo', 'league', 'btnsmall')}</div>${leagueTable(true)}</div></section></div>`;
}

function selectField(label, id, value, options) {
  return `<label class="field">${label}<select data-tactic="${id}">${options.map(([k, v]) => `<option value="${k}" ${value === k ? 'selected' : ''}>${v}</option>`).join('')}</select></label>`;
}
function tacticValueText(key, value) {
  const maps = {
    serve: { safe: 'Conservador', balanced: 'Equilibrado', selective: 'Seletivo', aggressive: 'Agressivo' },
    distribution: {
      balanced: 'Distribuição equilibrada',
      middle: 'Mais centrais',
      opposite: 'Mais saída',
      wings: 'Mais ponteiros'
    },
    pace: { balanced: 'Ritmo equilibrado', fast: 'Ritmo acelerado', control: 'Controle' },
    defense: {
      standard: 'Defesa padrão',
      diagonal: 'Fechar diagonal',
      parallel: 'Fechar paralela',
      deep: 'Proteger fundo',
      advance: 'Adiantar defesa'
    },
    block: {
      read: 'Bloqueio por leitura',
      opposite: 'Fechar a saída',
      middle: 'Fechar o meio',
      wings: 'Fechar a entrada'
    },
    target: { weak: 'Recebedor vulnerável', mixed: 'Variar os alvos', libero: 'Líbero' },
    protect: { none: 'Sem proteção', libero: 'Cobertura ampliada do líbero' }
  };
  if (String(value).startsWith('player:')) {
    let p = player(Number(String(value).split(':')[1]));
    return p ? p.name : maps[key]?.[value] || value;
  }
  return maps[key]?.[value] || value;
}
function tacticalPlanSummary(t) {
  return `<div class="tactic-summary"><article><small>COM SAQUE</small><strong>${tacticValueText('serve', t.serve)}</strong><span>Alvo: ${tacticValueText('target', t.target)}</span></article><article><small>VIRADA DE BOLA</small><strong>${tacticValueText('distribution', t.distribution)}</strong><span>${tacticValueText('pace', t.pace)} · ${tacticValueText('protect', t.protect || 'none')}</span></article><article><small>SEM BOLA</small><strong>${tacticValueText('block', t.block)}</strong><span>${tacticValueText('defense', t.defense || 'standard')}</span></article></div>`;
}
function tacticalForm(t) {
  return `${tacticalPlanSummary(t)}<div class="tactic-groups"><section class="tactic-group"><div><small>COM SAQUE</small><h3>Pressionar a primeira bola</h3><p>Escolha o risco e onde concentrar a pressão.</p></div>${selectField(
    'Risco no saque',
    'serve',
    t.serve,
    [
      ['safe', 'Conservador'],
      ['balanced', 'Equilibrado'],
      ['selective', 'Seletivo · melhores sacadores'],
      ['aggressive', 'Agressivo']
    ]
  )}${t.serve === 'selective' ? selectiveServeNote() : ''}${selectField('Alvo do saque', 'target', t.target, [['weak', 'Recebedor mais vulnerável'], ['mixed', 'Variar os alvos'], ['libero', 'Líbero'], ...targetOptions()])}</section><section class="tactic-group"><div><small>VIRADA DE BOLA</small><h3>Organizar a primeira construção</h3><p>Passe, distribuição e velocidade do ataque trabalham juntos.</p></div>${selectField('Proteção da recepção', 'protect', t.protect || 'none', [['none', 'Sem proteção'], ['libero', 'Ampliar cobertura do líbero'], ...ownReceiverOptions()])}${selectField(
    'Distribuição ofensiva',
    'distribution',
    t.distribution,
    [
      ['balanced', 'Equilibrada'],
      ['middle', 'Priorizar centrais'],
      ['opposite', 'Priorizar oposto'],
      ['wings', 'Priorizar ponteiros']
    ]
  )}${selectField('Ritmo ofensivo', 'pace', t.pace, [
    ['balanced', 'Equilibrado'],
    ['fast', 'Acelerado'],
    ['control', 'Controle']
  ])}</section><section class="tactic-group"><div><small>SEM BOLA</small><h3>Organizar bloqueio e defesa</h3><p>Defina onde a rede fecha e qual espaço a defesa protege.</p></div>${selectField('Plano de bloqueio', 'block', t.block, [['read', 'Leitura'], ['opposite', 'Priorizar oposto'], ['middle', 'Priorizar centrais'], ['wings', 'Priorizar entrada'], ...opponentAttackOptions()])}${selectField(
    'Cobertura defensiva',
    'defense',
    t.defense || 'standard',
    [
      ['standard', 'Padrão'],
      ['diagonal', 'Fechar diagonal'],
      ['parallel', 'Fechar paralela'],
      ['deep', 'Proteger fundo'],
      ['advance', 'Adiantar defesa']
    ]
  )}</section></div>`;
}
function selectiveServeNote() {
  let roster =
      match && !match.done ? match.teams[match.home === state.club ? 0 : 1] : state.lines[state.club].map(player),
    chosen = selectiveServers(roster).map(p => p.name.split(' ')[0]);
  return `<small class="serve-selective-note"><b>Seletivo:</b> ${chosen.join(' e ')} forçam o saque; os demais permanecem no Equilibrado.</small>`;
}
function squad() {
  let ids = state.lines[state.club],
    t = state.tactics[state.club],
    history = totalEvents(),
    slot = i => {
      let p = player(ids[i]);
      return `<article class="formation-slot"><div class="formation-slot-top"><span class="slot-number">${i + 1}</span><span class="slot-pos">${names[POS[i]]}</span></div><strong class="formation-player">${p.name}</strong>${p.tribute ? '<span class="player-tag tribute-tag">Homenagem</span>' : ''}<div class="formation-profile">${roleLabel(p)}</div><div class="formation-meta">${heightLabel(p)} · ${serveStyleLabel(p)}</div><div class="formation-card-foot"><span class="formation-ovr">OVR ${overall(p)}</span><button class="formation-change" data-action="formation-pick:${i}">Trocar</button></div></article>`;
    },
    lib = player(ids[6]);
  return `${heading('Plantel & plano', 'Sua formação em quadra.', 'Veja quem começa jogando e ajuste cada posição sem carregar a tela de informação.')}<div class="grid tactic-layout"><section><div class="panel formation-panel"><div class="panelhead"><div><small>FORMAÇÃO INICIAL</small><h2>Sistema 5–1</h2></div><span class="tag">7 ATLETAS</span></div><div class="formation-kicker"><span>Rede e fundo</span><small>Toque em Trocar para ajustar</small></div><div class="formation-court"><div class="formation-zone-label">REDE · 4 / 3 / 2</div><div class="formation-grid">${[3, 2, 1].map(slot).join('')}</div><div class="formation-divider"><span>FUNDO · 5 / 6 / 1</span></div><div class="formation-grid">${[4, 5, 0].map(slot).join('')}</div></div><div class="libero-inline"><div class="libero-label">LÍBERO</div><div class="libero-card"><strong>${lib.name}</strong><span>${roleLabel(lib)} · ${heightLabel(lib)} · ${serveStyleLabel(lib)}</span></div><div class="libero-ovr">OVR ${overall(lib)}</div><button class="formation-change libero-change" data-action="formation-pick:6">Trocar</button></div>${lineMetrics(ids)}${formationIdentityPanel(ids)}<p class="formhint">Na quadra ficam apenas número, nome, função, altura, saque e OVR. Os demais dados entram quando você abre o atleta ou analisa a partida.</p></div>${setterStructurePanel(history, 0, { compact: true, title: 'Como esta equipe muda no 5–1' })}</section><section><div class="panel tactic-plan-panel">${button('Voltar à pré-partida', 'match', 'primary full')}<div class="panelhead" style="margin-top:20px"><div><small>PLANO ATUAL</small><h2>Plano de jogo</h2></div></div>${tacticalForm(t)}</div></section></div>${developmentRosterPanel()}<div class="panel"><div class="panelhead"><h2>Seus 14 atletas</h2><small>ELENCO COMPLETO</small></div>${table(
    [
      'Atleta',
      'Posição',
      'Perfil',
      'Altura',
      'Tipo de saque',
      'Idade',
      'Ataque',
      'Saque',
      'Recepção',
      'Bloqueio',
      'Levant.',
      'Condição',
      'Salário/mês'
    ],
    state.all
      .filter(p => p.club === state.club)
      .map(
        p =>
          `<tr><td>${playerIdentity(p, { clickable: true, includeServe: false, subtitle: `${ids.includes(p.id) ? 'Titular' : 'Reserva'} · ${p.pos} · ${heightLabel(p)}` })}<small>${playerStory(p, state.results).label}</small></td><td><span class="role-pill role-${p.pos.toLowerCase()}">${p.pos}</span><small style="display:block;margin-top:4px">${names[p.pos]}</small></td><td><b>${roleLabel(p)}</b></td><td>${heightLabel(p)}</td><td><b>${serveStyleLabel(p)}</b></td><td>${p.age}</td><td>${p.attack}</td><td>${p.serve}</td><td>${p.receive}</td><td>${p.block}</td><td>${p.set}</td><td class="${p.condition < 75 ? 'orange' : 'lime'}">${Math.round(p.condition)}%</td><td>${money(p.salary)}</td></tr>`
      )
  )}</div>`;
}

function formationPicker(slot) {
  let ids = state.lines[state.club],
    pos = POS[slot],
    current = player(ids[slot]),
    candidates = state.all.filter(p => p.club === state.club && p.pos === pos).sort((a, b) => overall(b) - overall(a));
  let body = `<div class="formation-sheet-intro"><span class="pill">${slot === 6 ? 'LÍBERO' : names[pos]}</span><p>Atual: <strong>${current.name}</strong>. Escolha quem assume esta posição.</p></div><div class="formation-options">${candidates.map(p => `<button class="formation-option ${p.id === current.id ? 'current' : ''}" data-action="formation-set:${slot}:${p.id}"><span class="formation-option-main"><b>${p.name}</b><small>${roleLabel(p)} · ${heightLabel(p)} · ${serveStyleLabel(p)}</small></span><span class="formation-option-stats"><b>OVR ${overall(p)}</b><small>Físico ${Math.round(p.condition)}%</small></span></button>`).join('')}</div>`;
  openDialog(slot === 6 ? 'Escolher líbero' : 'Escolher ' + names[pos], body);
  bind();
}

function firstNameOf(id) {
  return (player(id)?.name || '').split(' ')[0] || 'Atleta';
}
function momentLines(e) {
  if (!e || !['STRONG', 'GREAT'].includes(e.momentLevel)) return [];
  const lines = [];
  if ((e.streaks?.consecutiveAces || 0) >= 3) lines.push(`${e.streaks.consecutiveAces} ACES SEGUIDOS!`);
  else if ((e.streaks?.consecutiveBlocks || 0) >= 3) lines.push(`${e.streaks.consecutiveBlocks} BLOQUEIOS SEGUIDOS!`);
  else if ((e.sameRallyDigs?.count || 0) >= 4)
    lines.push(`${e.sameRallyDigs.count} DEFESAS DE ${firstNameOf(e.sameRallyDigs.playerId).toUpperCase()}!`);
  else if (e.spectacularEvents?.includes('EXTERNAL_ANTENNA_SAVE')) lines.push('BUSCOU POR FORA DA ANTENA!');
  else if (e.spectacularEvents?.includes('DIG_FOOT')) lines.push('SALVOU COM O PÉ!');
  else if (e.spectacularEvents?.includes('OUTSIDE_COURT_SAVE')) lines.push('BUSCOU FORA DA QUADRA!');
  else if (e.spectacularEvents?.includes('CHASE_SAVE')) lines.push('FOI BUSCAR!');
  else if (e.spectacularEvents?.includes('DIG_DIVING')) lines.push('QUE PEIXINHO!');
  else if (e.spectacularEvents?.includes('DIG_ONE_HAND')) lines.push('DEFESA DE UMA MÃO!');
  else if (e.spectacularEvents?.includes('DIG_REFLEX')) lines.push('QUE DEFESA!');
  else if (e.spectacularEvents?.includes('TRIPLE_BLOCK_KILL')) lines.push('CONTRA O TRIPLO!');
  else if (e.spectacularEvents?.includes('SINGLE_BLOCK_KILL')) lines.push('SOZINHO NO BLOQUEIO!');
  else if (e.spectacularEvents?.includes('SECOND_BALL_SURPRISE'))
    lines.push(`${firstNameOf(e.actor).toUpperCase()} DE SEGUNDA!`);
  else if (e.rallyDuration >= 35) lines.push('QUE RALLY!');
  else if (e.featuredMomentReason === 'set-closing') lines.push('FECHAMENTO DO SET!');
  else if (e.featuredMoment) lines.push('MOMENTO DO SET!');
  else lines.push(e.greatMoment ? 'GRANDE MOMENTO' : 'DESTAQUE');
  if ((e.sameRallyDigs?.count || 0) >= 3 && !lines[0].includes('DEFESAS'))
    lines.push(`${e.sameRallyDigs.count} DEFESAS DE ${firstNameOf(e.sameRallyDigs.playerId).toUpperCase()}`);
  const finish = feedLine(e, player).replace(/ — PONTO$/, '');
  if (finish && !lines.includes(finish.toUpperCase())) lines.push(finish.toUpperCase());
  return lines.slice(0, 3);
}
function greatMomentOverlay(m) {
  if (m?.momentOverlayIndex == null || Date.now() >= (m.momentOverlayUntil || 0)) return '';
  let e = m.events.find(x => x.index === m.momentOverlayIndex);
  if (!e || !['STRONG', 'GREAT'].includes(e.momentLevel)) return '';
  let lines = momentLines(e);
  return `<section class="moment-overlay ${e.greatMoment ? 'great' : 'strong'}" aria-live="polite"><small>${e.greatMoment ? 'GRANDE MOMENTO' : 'DESTAQUE'} · IMPACTO ${e.momentImpact}</small>${lines.map((x, i) => (i === 0 ? `<strong>${x}</strong>` : `<span style="--moment-delay:${Math.min(0.72, 0.28 * i)}s">${x}</span>`)).join('')}<b>${e.score.join('–')}</b></section>`;
}
function momentHoldDuration(e) {
  let lines = momentLines(e).length;
  if (e.greatMoment) {
    let base = e.momentImpact >= 95 ? 7600 : 6500;
    return Math.min(9000, base + Math.max(0, lines - 1) * 500);
  }
  return Math.min(4000, 2600 + Math.max(0, lines - 1) * 320);
}
function scheduleMomentOverlay(e) {
  if (!match || !e || !['STRONG', 'GREAT'].includes(e.momentLevel)) return 0;
  clearTimeout(momentOverlayTimer);
  let hold = momentHoldDuration(e);
  match.momentOverlayIndex = e.index;
  match.momentOverlayUntil = Date.now() + hold;
  momentOverlayTimer = setTimeout(() => {
    if (match?.momentOverlayIndex === e.index) {
      delete match.momentOverlayIndex;
      delete match.momentOverlayUntil;
      render();
    }
  }, hold);
  return hold;
}
function momentSentence(e) {
  let bits = [];
  if (e.rallyDuration >= 25) bits.push(`rally de ${Math.round(e.rallyDuration)} segundos`);
  if ((e.sameRallyDigs?.count || 0) >= 3)
    bits.push(`${e.sameRallyDigs.count} defesas de ${firstNameOf(e.sameRallyDigs.playerId)}`);
  if (e.spectacularEvents?.includes('DIG_FOOT')) bits.push('uma defesa com o pé');
  if (e.spectacularEvents?.includes('EXTERNAL_ANTENNA_SAVE')) bits.push('uma bola recuperada por fora da antena');
  if (e.spectacularEvents?.includes('OUTSIDE_COURT_SAVE')) bits.push('um salvamento fora da quadra');
  if (e.spectacularEvents?.includes('DIG_DIVING')) bits.push('um peixinho');
  if (e.spectacularEvents?.includes('DIG_ONE_HAND')) bits.push('uma defesa de uma mão');
  if (e.spectacularEvents?.includes('TRIPLE_BLOCK_KILL')) bits.push('um ponto contra bloqueio triplo');
  if ((e.streaks?.consecutiveAces || 0) >= 3) bits.push(`${e.streaks.consecutiveAces}º ace consecutivo`);
  if ((e.streaks?.consecutiveBlocks || 0) >= 3) bits.push(`${e.streaks.consecutiveBlocks}º bloqueio consecutivo`);
  return bits.slice(0, 3).join(', ') || feedLine(e, player);
}
function setMomentMemory(m, set) {
  let events = m.events.filter(e => e.set === set),
    ranked = [...events].filter(e => e.momentImpact >= 55).sort((a, b) => b.momentImpact - a.momentImpact),
    best = ranked[0];
  if (!best) return '';
  let blocks = [
    `<article><small>RALLY DO SET</small><p>No ${best.scoreBefore.join('–')}, ${momentSentence(best)}. ${club([m.home, m.away][best.winner]).short} ficou com o ponto.</p></article>`
  ];
  let changer = ranked.find(e => {
    let after = events.filter(x => x.index > e.index).slice(0, 5);
    return after.length >= 4 && after.filter(x => x.winner === e.winner).length >= 4;
  });
  if (changer) {
    let after = events.filter(x => x.index > changer.index).slice(0, 5),
      won = after.filter(x => x.winner === changer.winner).length;
    blocks.push(
      `<article><small>MOMENTO QUE MUDOU O SET</small><p>Depois do ${changer.score.join('–')}, ${club([m.home, m.away][changer.winner]).name} ganhou ${won} dos ${after.length} pontos seguintes. O recorte mostra a sequência posterior, sem atribuir causalidade automática.</p></article>`
    );
  }
  let streak = [...events].sort((a, b) => (b.streakImpact || 0) - (a.streakImpact || 0))[0];
  if ((streak?.streakImpact || 0) >= 55) {
    let txt =
      (streak.streaks?.consecutiveAces || 0) >= 3
        ? `${firstNameOf(streak.actor)} fez ${streak.streaks.consecutiveAces} aces seguidos.`
        : (streak.streaks?.consecutiveBlocks || 0) >= 3
          ? `${firstNameOf(streak.actor)} chegou a ${streak.streaks.consecutiveBlocks} bloqueios seguidos.`
          : (streak.sameRallyDigs?.count || 0) >= 4
            ? `${firstNameOf(streak.sameRallyDigs.playerId)} fez ${streak.sameRallyDigs.count} defesas no mesmo rally.`
            : `${firstNameOf(streak.actor)} entrou em uma sequência ofensiva fora do padrão.`;
    blocks.push(`<article><small>SEQUÊNCIA DO SET</small><p>${txt}</p></article>`);
  }
  return `<div class="moment-memory">${blocks.join('')}</div>`;
}
function matchMomentMemory(m) {
  let gm = m.events.filter(e => e.greatMoment),
    best = [...m.events].sort((a, b) => (b.momentImpact || 0) - (a.momentImpact || 0))[0],
    long = [...m.events].sort((a, b) => (b.rallyDuration || 0) - (a.rallyDuration || 0))[0],
    digs = [...m.events].sort((a, b) => (b.sameRallyDigs?.count || 0) - (a.sameRallyDigs?.count || 0))[0],
    aces = Math.max(0, ...m.events.map(e => e.streaks?.consecutiveAces || 0)),
    blocks = Math.max(0, ...m.events.map(e => e.streaks?.consecutiveBlocks || 0));
  return `<div class="moment-match-memory"><h3>Memória da partida</h3><p>${gm.length} Grande${gm.length === 1 ? ' Momento' : 's Momentos'} reconhecido${gm.length === 1 ? '' : 's'}.</p><div class="metrics">${metric('Maior rally', long ? Math.round(long.rallyDuration) + 's' : '—', 'duração estimada')}${metric('Maior impacto', best?.momentImpact || 0, best ? best.score.join('–') : '')}${metric('Aces seguidos', aces, 'maior sequência')}${metric('Bloqueios seguidos', blocks, 'maior sequência')}${metric('Defesas no rally', digs?.sameRallyDigs?.count || 0, digs?.sameRallyDigs?.playerId != null ? firstNameOf(digs.sameRallyDigs.playerId) : '')}</div>${
    gm.length
      ? storyCards(
          gm
            .slice()
            .sort((a, b) => b.momentImpact - a.momentImpact)
            .slice(0, 3)
            .sort((a, b) => a.index - b.index)
            .map(e => ({
              importance: 6,
              set: e.set,
              score: e.score,
              title: momentLines(e)[0] || 'Grande Momento',
              body: momentSentence(e)
            }))
        )
      : ''
  }</div>`;
}

function statePill(st) {
  return st ? `<span class="live-state state-${st.key.toLowerCase().replaceAll('_', '-')}">${st.label}</span>` : '';
}
function matchPlayerPool(m, side) {
  let clubId = [m.home, m.away][side],
    pool = [...m.teams[side], ...Object.values(m.bench || {}).filter(p => p?.club === clubId)];
  return [...new Map(pool.map(p => [p.id, p])).values()];
}
function playerSetStats(m, set, side, id) {
  let ev = m.events.filter(e => e.set === set),
    ss = stats(ev, side).players[id] || {
      attacks: 0,
      kills: 0,
      errors: 0,
      blocked: 0,
      aces: 0,
      blocks: 0,
      receptions: 0,
      positive: 0,
      defenses: 0,
      serveErrors: 0,
      infractions: 0
    };
  let steps = ev.flatMap(e => e.steps || []).filter(x => x.player === id),
    sets = steps.filter(x => x.type === 'set'),
    setPrecision = sets.length
      ? sets.reduce((n, x) => n + (Number.isFinite(x.precision) ? x.precision : 0), 0) / sets.length
      : 0,
    pressureGood = ev
      .filter(e => (e.context?.pressure || 0) >= 0.72)
      .flatMap(e => e.steps || [])
      .filter(
        x =>
          x.player === id &&
          (x.type === 'ace' ||
            x.type === 'block' ||
            (x.type === 'attack' && ['kill', 'faultWin', 'defenseError'].includes(x.outcome)))
      ).length,
    great = ev.filter(e => e.greatMoment && (e.actor === id || e.sameRallyDigs?.playerId === id)).length,
    oos = steps.filter(x => x.type === 'attack' && x.quality <= 2).length;
  return {
    ...ss,
    pressureGood,
    great,
    oos,
    setCount: sets.length,
    setPrecision,
    points: ss.kills + ss.aces + ss.blocks,
    actions:
      ss.attacks +
      ss.receptions +
      ss.defenses +
      ss.aces +
      ss.blocks +
      ss.serveErrors +
      ss.infractions +
      sets.length * 0.15
  };
}
function setImpact(m, set, side, p) {
  let x = playerSetStats(m, set, side, p.id),
    role =
      p.pos === 'LIB'
        ? x.defenses * 0.48 + x.positive * 0.34
        : p.pos === 'LEV'
          ? Math.max(0, x.setPrecision - 68) * 0.14 +
            x.setCount * 0.018 +
            x.pressureGood * 0.55 +
            x.blocks * 1.2 +
            x.aces * 1.15
          : x.kills * 0.92 + x.blocks * 1.35 + x.aces * 1.25 + x.defenses * 0.18 + x.positive * 0.18;
  let negative =
    x.errors * 1.15 + x.blocked * 0.72 + x.serveErrors * 0.9 + (x.receptions - x.positive) * 0.16 + x.infractions * 0.9;
  return role - negative + x.pressureGood * 0.42 + x.great * 1.7;
}
function setDecider(m, set) {
  let ev = m.events.filter(e => e.set === set),
    final = m.setScores[set - 1] || ev.at(-1)?.score;
  if (!final) return null;
  let winner = final[0] > final[1] ? 0 : 1,
    rows = matchPlayerPool(m, winner)
      .map(p => ({ p, side: winner, x: playerSetStats(m, set, winner, p.id), impact: setImpact(m, set, winner, p) }))
      .filter(r => r.x.actions >= 3)
      .sort((a, b) => b.impact - a.impact);
  return rows[0] || null;
}
function setLaggard(m, set) {
  let ev = m.events.filter(e => e.set === set),
    final = m.setScores[set - 1] || ev.at(-1)?.score;
  if (!final) return null;
  let loser = final[0] > final[1] ? 1 : 0,
    rows = matchPlayerPool(m, loser)
      .map(p => {
        let x = playerSetStats(m, set, loser, p.id),
          attackRate = x.attacks ? x.kills / x.attacks : 1,
          receiveRate = x.receptions ? x.positive / x.receptions : 1,
          expectedRec = clamp(0.38 + (p.receive - 60) * 0.006, 0.28, 0.78),
          badScore =
            (x.attacks >= 5 ? Math.max(0, 0.38 - attackRate) * 8 + x.blocked * 0.45 + x.errors * 0.6 : 0) +
            (x.receptions >= 6 ? Math.max(0, expectedRec - receiveRate) * 7 : 0) +
            x.serveErrors * 0.55 +
            x.infractions * 0.7,
          attackingRole = ['PON', 'OPO', 'CEN'].includes(p.pos),
          strongContribution =
            attackingRole &&
            ((x.points || 0) >= 8 ||
              ((x.points || 0) >= 6 && x.attacks >= 6 && attackRate >= 0.45) ||
              (x.attacks >= 7 && attackRate >= 0.52)),
          attackProblems = x.attacks >= 5 && attackRate < 0.34,
          attackWaste = x.attacks >= 5 && (x.blocked + x.errors) / x.attacks >= 0.25,
          passProblems = x.receptions >= 6 && receiveRate < expectedRec - 0.14,
          disciplineProblems = x.serveErrors >= 2 || x.infractions >= 2,
          redFlags = [attackProblems, attackWaste, passProblems, disciplineProblems].filter(Boolean).length;
        return { p, side: loser, x, badScore, attackRate, receiveRate, expectedRec, strongContribution, redFlags };
      })
      .filter(r => r.x.actions >= 5 && !r.strongContribution)
      .sort((a, b) => b.badScore - a.badScore);
  return rows.find(r => r.badScore >= 2.25 && r.redFlags >= 1) || rows.find(r => r.badScore >= 1.25) || null;
}
function setHeadline(m, set, winner, meta) {
  let team = club([m.home, m.away][winner]).short,
    cp = meta.controlPoint,
    leaderAtControl = cp ? Math.max(...cp.score) : null;
  if (meta.aceRun >= 3) return `${meta.aceRun} ACES MUDAM A PARCIAL`;
  if (meta.lateBlocks >= 3) return `${team} FECHA A REDE E DECIDE O SET`;
  if (meta.maxDeficit >= 4) return `${team} BUSCA ${meta.maxDeficit} PONTOS E VIRA`;
  if (meta.bestMoment?.momentImpact >= 88 && meta.avgChaos > 0.48 && meta.finalGap <= 3)
    return 'SET CAÓTICO TERMINA NOS DETALHES';
  if (meta.finalGap <= 2) return `${team} ESCAPA NO FECHAMENTO`;
  if (meta.neverTrailed && meta.largestLead >= 5 && leaderAtControl !== null && leaderAtControl <= 10)
    return `${team} ABRE CEDO E CONTROLA O SET`;
  if (cp && leaderAtControl <= 16 && meta.largestLead >= 5) return `${team} ABRE VANTAGEM NO MEIO E PASSA A CONTROLAR`;
  if (cp && leaderAtControl >= 17 && meta.finalGap >= 5) return `${team} DESLANCHA NA RETA FINAL`;
  if (meta.largestLead >= 5) return `${team} CONSTRÓI VANTAGEM E FECHA COM CONTROLE`;
  return `${team} ABRE NO MOMENTO CERTO E FECHA O SET`;
}
function setStorySpine(m, set) {
  let ev = m.events.filter(e => e.set === set);
  if (!ev.length) return null;
  let final = m.setScores[set - 1] || ev.at(-1).score,
    winner = final[0] > final[1] ? 0 : 1,
    loser = 1 - winner,
    diffs = ev.map(e => e.score[winner] - e.score[loser]),
    maxDeficit = Math.max(0, ...diffs.map(x => -x)),
    largestLead = Math.max(0, ...diffs),
    neverTrailed = Math.min(...diffs) >= 0,
    opening = ev.find(e => Math.max(...e.score) >= 8) || ev[Math.min(7, ev.length - 1)],
    openingLead = opening.score[winner] - opening.score[loser],
    ties = ev.filter(e => e.score[0] === e.score[1] && Math.max(...e.score) >= 8),
    tie = ties.at(-1) || null,
    firstLead = maxDeficit
      ? ev.find(e => e.score[winner] > e.score[loser] && e.scoreBefore[winner] <= e.scoreBefore[loser])
      : null,
    controlPoint = ev.find((e, i) => {
      let d = e.score[winner] - e.score[loser];
      if (d < 3) return false;
      let rest = ev.slice(i).map(x => x.score[winner] - x.score[loser]);
      return Math.min(...rest) >= 2;
    }),
    bestMoment = [...ev].sort((a, b) => (b.momentImpact || 0) - (a.momentImpact || 0))[0],
    decider = setDecider(m, set),
    laggard = setLaggard(m, set),
    late = ev.filter(e => Math.max(...e.scoreBefore) >= 20),
    lateBlocks = late.flatMap(e => e.steps || []).filter(s => s.team === winner && s.type === 'block').length,
    aceRun = Math.max(0, ...ev.map(e => e.streaks?.consecutiveAces || 0)),
    avgChaos = ev.reduce((n, e) => n + (e.context?.rallyChaos || 0), 0) / ev.length,
    finalGap = Math.abs(final[0] - final[1]),
    sw = stats(ev, winner),
    sl = stats(ev, loser),
    quick = ev
      .flatMap(e => e.steps || [])
      .filter(s => s.team === winner && s.type === 'attack' && s.setType === 'QUICK' && s.outcome !== 'cancelled'),
    quickKills = quick.filter(s => ['kill', 'faultWin', 'defenseError'].includes(s.outcome)).length,
    lateRec = late.flatMap(e => e.steps || []).filter(s => s.team === winner && s.type === 'receive'),
    earlyRec = ev
      .filter(e => Math.max(...e.scoreBefore) < 18)
      .flatMap(e => e.steps || [])
      .filter(s => s.team === winner && s.type === 'receive'),
    pos = a => (a.length ? a.filter(s => s.quality >= 3).length / a.length : 0),
    rate = (a, b) => (b ? a / b : 0);
  let meta = {
    maxDeficit,
    largestLead,
    neverTrailed,
    bestMoment,
    lateBlocks,
    aceRun,
    avgChaos,
    finalGap,
    decider,
    controlPoint
  };
  let headline = setHeadline(m, set, winner, meta),
    summary = [],
    winnerName = club([m.home, m.away][winner]).name,
    loserName = club([m.home, m.away][loser]).name;
  if (maxDeficit >= 3)
    summary.push(
      `${loserName} comandou parte do set e chegou a abrir ${maxDeficit}, mas ${winnerName} buscou a reação${tie ? ` e deixou tudo igual em ${tie.score.join('–')}` : ''}${firstLead ? ` antes de passar à frente em ${firstLead.score.join('–')}` : ''}.`
    );
  else if (controlPoint) {
    let lead = controlPoint.score[winner] - controlPoint.score[loser],
      leader = Math.max(...controlPoint.score),
      phase = leader <= 10 ? 'cedo' : leader <= 16 ? 'na metade do set' : 'na reta final',
      ease =
        finalGap >= 7
          ? ' e transformou o fim da parcial em um trecho de domínio'
          : finalGap >= 5
            ? ' e passou a jogar com margem confortável'
            : ' e sustentou a diferença até o fechamento';
    summary.push(`${winnerName} abriu ${lead} pontos em ${controlPoint.score.join('–')} ${phase}${ease}.`);
  } else if (neverTrailed)
    summary.push(
      `${winnerName} permaneceu à frente durante quase toda a parcial, chegou a abrir ${largestLead} ponto${largestLead === 1 ? '' : 's'} e administrou a vantagem.`
    );
  else
    summary.push(
      `O set permaneceu aberto até o fim. ${winnerName} encontrou a vantagem decisiva apenas no fechamento e não permitiu nova igualdade.`
    );
  let signals = [];
  const add = (score, text, kind) => signals.push({ score, text, kind });
  let attackEff = rate(sw.kills - sw.errors - sw.blocked, sw.attacks),
    oppAttackEff = rate(sl.kills - sl.errors - sl.blocked, sl.attacks),
    sideout = rate(sw.sideout, sw.received),
    oppSideout = rate(sl.sideout, sl.received),
    breakRate = rate(sw.breaks, sw.served),
    oppBreak = rate(sl.breaks, sl.served),
    passSwing = lateRec.length >= 3 && earlyRec.length >= 3 ? pos(lateRec) - pos(earlyRec) : 0;
  if (lateBlocks >= 2) add(9, `${lateBlocks} bloqueios depois do 20º ponto`, 'block');
  if (aceRun >= 2) add(9, `${aceRun} aces consecutivos`, 'serve');
  if ((sw.aces || 0) - (sl.aces || 0) >= 3) add(8, `${sw.aces} aces contra ${sl.aces}`, 'serve');
  if ((sw.blocks || 0) - (sl.blocks || 0) >= 3) add(8, `${sw.blocks} bloqueios-ponto contra ${sl.blocks}`, 'block');
  if ((sl.errorPoints || 0) - (sw.errorPoints || 0) >= 4)
    add(7, `${sl.errorPoints - sw.errorPoints} erros que deram ponto a menos`, 'errors');
  if (sw.attacks >= 12 && sl.attacks >= 12 && attackEff - oppAttackEff >= 0.1)
    add(
      7,
      `Eficiência de ataque ${signedPct(sw.kills - sw.errors - sw.blocked, sw.attacks)} vs ${signedPct(sl.kills - sl.errors - sl.blocked, sl.attacks)}`,
      'attack'
    );
  if (sw.received >= 8 && sl.received >= 8 && sideout - oppSideout >= 0.11)
    add(7, `Virada de bola ${pct(sw.sideout, sw.received)} vs ${pct(sl.sideout, sl.received)}`, 'sideout');
  if (sw.served >= 8 && sl.served >= 8 && breakRate - oppBreak >= 0.1)
    add(6, `Conversão com saque ${pct(sw.breaks, sw.served)} vs ${pct(sl.breaks, sl.served)}`, 'break');
  if (Math.abs(passSwing) >= 0.15)
    add(
      6,
      `Passe positivo ${Math.round(pos(earlyRec) * 100)}% → ${Math.round(pos(lateRec) * 100)}% no trecho final`,
      'pass'
    );
  if (quick.length >= 6 && quickKills / quick.length >= 0.65)
    add(5, `Primeiro tempo ${quickKills}/${quick.length}`, 'middle');
  signals.sort((a, b) => b.score - a.score);
  let chosen = [];
  for (const sig of signals) {
    if (chosen.length >= 3) break;
    if (sig.kind === 'middle' && chosen.some(x => x.kind === 'middle')) continue;
    chosen.push(sig);
  }
  let weights = chosen.map(x => x.text);
  if (!weights.length) weights.push(`Virada de bola: ${pct(sw.sideout, sw.received)}`);
  if (weights.length) summary.push(`Pesaram ${weights.slice(0, 2).join(' e ')}.`);
  else if (bestMoment?.momentImpact >= 70)
    summary.push(
      `O trecho de maior impacto veio no ${bestMoment.scoreBefore.join('–')}, com ${momentSentence(bestMoment)}.`
    );
  else summary.push(setNarrativeText(m, set, winner));
  let moment =
    bestMoment?.momentImpact >= 70
      ? `${bestMoment.scoreBefore.join('–')} · ${Math.round(bestMoment.rallyDuration || 0)}s · ${momentSentence(bestMoment)}`
      : '';
  let comparison = '';
  if (set > 1) {
    let prev = m.events.filter(e => e.set === set - 1),
      prevS = stats(prev, winner),
      curS = stats(ev, winner),
      pr = prev.flatMap(e => e.steps || []).filter(s => s.team === winner && s.type === 'receive'),
      cr = ev.flatMap(e => e.steps || []).filter(s => s.team === winner && s.type === 'receive'),
      prevAtt = prev
        .flatMap(e => e.steps || [])
        .filter(s => s.team === winner && s.type === 'attack' && s.outcome !== 'cancelled'),
      curAtt = ev
        .flatMap(e => e.steps || [])
        .filter(s => s.team === winner && s.type === 'attack' && s.outcome !== 'cancelled'),
      middleShare = a => (a.length ? a.filter(s => player(s.player)?.pos === 'CEN').length / a.length : 0),
      opts = [];
    const push = (score, text) => opts.push({ score, text });
    if (pr.length >= 5 && cr.length >= 5) {
      let a = pos(pr),
        b = pos(cr),
        d = Math.abs(b - a);
      if (d >= 0.12) push(d / 0.12, `O que mudou: passe positivo ${Math.round(a * 100)}% → ${Math.round(b * 100)}%.`);
    }
    let pa = rate(prevS.kills - prevS.errors - prevS.blocked, prevS.attacks),
      ca = rate(curS.kills - curS.errors - curS.blocked, curS.attacks);
    if (prevS.attacks >= 10 && curS.attacks >= 10 && Math.abs(ca - pa) >= 0.1)
      push(
        Math.abs(ca - pa) / 0.1,
        `O que mudou: eficiência de ataque ${signedPct(prevS.kills - prevS.errors - prevS.blocked, prevS.attacks)} → ${signedPct(curS.kills - curS.errors - curS.blocked, curS.attacks)}.`
      );
    let pso = rate(prevS.sideout, prevS.received),
      cso = rate(curS.sideout, curS.received);
    if (prevS.received >= 7 && curS.received >= 7 && Math.abs(cso - pso) >= 0.12)
      push(
        Math.abs(cso - pso) / 0.12,
        `O que mudou: virada de bola ${pct(prevS.sideout, prevS.received)} → ${pct(curS.sideout, curS.received)}.`
      );
    let errDelta = (curS.errorPoints || 0) - (prevS.errorPoints || 0);
    if (Math.abs(errDelta) >= 3)
      push(Math.abs(errDelta) / 3, `O que mudou: erros que deram ponto ${prevS.errorPoints} → ${curS.errorPoints}.`);
    let pm = middleShare(prevAtt),
      cm = middleShare(curAtt);
    if (prevAtt.length >= 10 && curAtt.length >= 10 && Math.abs(cm - pm) >= 0.14)
      push(
        Math.abs(cm - pm) / 0.14,
        `O que mudou: participação dos centrais ${Math.round(pm * 100)}% → ${Math.round(cm * 100)}% das bolas de ataque.`
      );
    opts.sort((a, b) => b.score - a.score);
    comparison = opts[0]?.text || '';
  }
  return {
    set,
    final,
    winner,
    loser,
    headline,
    summary: summary.slice(0, 2),
    decider,
    laggard,
    weights: weights.slice(0, 3),
    moment,
    comparison,
    maxDeficit,
    largestLead,
    bestMoment,
    controlPoint
  };
}
function playerImpactReason(row, negative = false) {
  if (!row) return '';
  let p = row.p,
    x = row.x || {},
    neg = (x.errors || 0) + (x.blocked || 0);
  if (negative) {
    if ((x.attacks || 0) >= 5 && neg / Math.max(1, x.attacks) >= 0.24)
      return `${neg} ataques terminaram em erro ou bloqueio em ${x.attacks} tentativas.`;
    if ((x.receptions || 0) >= 6 && (x.positive || 0) / Math.max(1, x.receptions) < 0.35)
      return `Só ${pct(x.positive || 0, x.receptions)} das ${x.receptions} recepções foram positivas.`;
    if ((x.serveErrors || 0) >= 2) return `${x.serveErrors} erros de saque pesaram na parcial.`;
    return 'Teve impacto abaixo do que a função pedia neste recorte.';
  }
  if ((x.pressureGood || 0) >= 2)
    return `${x.pressureGood} ações positivas vieram sob pressão, no trecho que decidiu a parcial.`;
  if (p.pos === 'CEN' && (x.blocks || 0) >= 2) return `${x.blocks} bloqueios-ponto mudaram a relação na rede.`;
  if (p.pos === 'LIB' && (x.defenses || 0) >= 5) return `${x.defenses} defesas sustentaram a transição do time.`;
  if (p.pos === 'LEV' && (x.setCount || 0) >= 8)
    return `A distribuição teve ${Math.round(x.setPrecision || 0)}% de precisão em ${x.setCount} levantamentos.`;
  if ((x.attacks || 0) >= 5)
    return `${x.kills || 0}/${x.attacks} no ataque${x.points ? ` e ${x.points} pontos diretos` : ''}.`;
  if ((x.aces || 0) > 0)
    return `${x.aces} ace${x.aces === 1 ? '' : 's'} criou${x.aces === 1 ? '' : 'ram'} vantagem no saque.`;
  return 'Somou ações positivas nos momentos de maior peso.';
}
function setPlayerCard(title, row, negative = false) {
  if (!row) return '';
  let p = row.p,
    x = row.x,
    lines = [];
  if (p.pos === 'LEV') {
    if (x.setCount >= 5) lines.push(`${x.setCount} levantamentos`, `${Math.round(x.setPrecision)}% precisão`);
    if (Number.isFinite(x.blockAdv) && x.setCount >= 10)
      lines.push(`${Math.round(x.blockAdv * 100)}% contra 0–1 bloqueador`);
    if (x.blocks) lines.push(`${x.blocks} bloqueio${x.blocks === 1 ? '' : 's'}`);
    if ((x.aces || 0) > 0) lines.push(`${x.aces} ace${x.aces === 1 ? '' : 's'}`);
    if ((x.attacks || 0) >= 3) lines.push(`${x.kills}/${x.attacks} ataque`);
  } else {
    if (p.pos === 'LIB' && x.defenses) lines.push(`${x.defenses} defesas`);
    if (x.points) lines.push(`${x.points} pts`);
    if (x.attacks) lines.push(`${x.kills}/${x.attacks} ataque`);
    if (x.receptions >= 4) lines.push(`${pct(x.positive, x.receptions)} passe +`);
    if (x.blocks) lines.push(`${x.blocks} bloqueio${x.blocks === 1 ? '' : 's'}`);
  }
  if (negative && x.blocked) lines.push(`${x.blocked} bloqueios sofridos`);
  let context =
    negative && x.oos >= Math.max(3, Math.ceil((x.attacks || 0) * 0.45))
      ? `<small>Contexto: ${x.oos} ataques vieram com bola quebrada / fora do sistema.</small>`
      : '';
  return `<article class="set-player ${negative ? 'negative' : ''}"><small>${title}</small>${playerIdentity(p, { compact: true })}<span>${lines.slice(0, 3).join(' · ') || 'Impacto distribuído em sua função'}</span><em class="impact-reason">${playerImpactReason(row, negative)}</em>${context}</article>`;
}
function setBreakPanel(m, set, side) {
  let sp = setStorySpine(m, set);
  if (!sp) return '<p>Sem dados para reconstruir o set.</p>';
  let winner = sp.winner ?? (sp.final[0] > sp.final[1] ? 0 : 1),
    winnerClub = club([m.home, m.away][winner]),
    stateReads = playerStateSnapshot(m, side, m.events.findLastIndex(e => e.set === set) + 1),
    stateNote = stateReads.sort((a, b) => (b.state?.priority || 0) - (a.state?.priority || 0))[0],
    assistant = stateNote
      ? `<div class="set-assistant"><div><small>AUXILIAR</small><strong>${stateNote.player.name}: ${stateNote.state.label}</strong></div><p>${stateNote.state.evidence}</p></div>`
      : '';
  let deep =
    sp.weights?.length || sp.moment || sp.comparison
      ? `<details class="set-more"><summary>Entender melhor este set</summary>${sp.weights?.length ? `<div class="set-weight"><small>O QUE PESOU</small>${sp.weights.map(x => `<span>${x}</span>`).join('')}</div>` : ''}${sp.moment ? `<div class="set-moment"><small>MOMENTO DO SET</small><p>${sp.moment}</p></div>` : ''}${sp.comparison ? `<p class="set-compare">${sp.comparison}</p>` : ''}</details>`
      : '';
  return `<section class="set-story-board" style="--set-winner:${winnerClub.color}"><div class="set-break-hero"><div class="set-break-kicker"><span>FIM DO ${set}º SET</span><b>${winnerClub.short} venceu a parcial</b></div><div class="set-break-score"><strong>${sp.final[0]}</strong><i>–</i><strong>${sp.final[1]}</strong></div><div class="set-break-teams"><span>${club(m.home).short}</span><small>SETS ${m.sets[0]}–${m.sets[1]}</small><span>${club(m.away).short}</span></div></div><div class="set-break-story"><small>LEITURA DO SET</small><h2>${sp.headline}</h2><p class="set-tv-summary">${sp.summary[0] || ''}</p></div><div class="set-people">${setPlayerCard('FEZ A DIFERENÇA', sp.decider)}${setPlayerCard('FICOU DEVENDO', sp.laggard, true)}</div>${assistant}${deep}<div class="set-actions">${button('AJUSTAR TIME', 'set-adjust')}${button('PRÓXIMO SET', 'set-next', 'primary')}</div></section>`;
}
function matchPlayerImpact(m, side, p) {
  let x = stats(m.events, side).players[p.id] || {},
    r = ratingRows(m).find(a => a.id === p.id),
    steps = m.events.flatMap(e => e.steps || []).filter(s => s.player === p.id),
    sets = steps.filter(s => s.type === 'set'),
    pressure = m.events
      .filter(e => (e.context?.pressure || 0) >= 0.72)
      .flatMap(e => e.steps || [])
      .filter(
        s =>
          s.player === p.id &&
          (s.type === 'ace' ||
            s.type === 'block' ||
            (s.type === 'attack' && ['kill', 'faultWin', 'defenseError'].includes(s.outcome)))
      ).length,
    great = m.events.filter(e => e.greatMoment && (e.actor === p.id || e.sameRallyDigs?.playerId === p.id)).length,
    points = (x.kills || 0) + (x.aces || 0) + (x.blocks || 0),
    attacks = x.attacks || 0,
    eff = attacks ? ((x.kills || 0) - (x.errors || 0) - (x.blocked || 0)) / attacks : 0,
    rec = x.receptions || 0,
    pass = rec ? (x.positive || 0) / rec : 0,
    score = (r?.grade || 6) * 1.18 + pressure * 0.42 + great * 1.25;
  if (['PON', 'OPO', 'CEN'].includes(p.pos)) score += Math.min(2.4, points * 0.055) + Math.max(-0.5, eff - 0.28) * 1.6;
  if (p.pos === 'LEV' && sets.length >= 20) {
    let precision = sets.reduce((n, s) => n + (Number.isFinite(s.precision) ? s.precision : 0), 0) / sets.length,
      adv = sets.filter(s => Number.isInteger(s.nblock) && s.nblock <= 1).length / sets.length,
      oos = sets.filter(s => s.quality <= 2 || s.transition),
      oosPrecision = oos.length
        ? oos.reduce((n, s) => n + (Number.isFinite(s.precision) ? s.precision : 0), 0) / oos.length
        : precision;
    score +=
      clamp((precision - 70) / 12, -0.4, 1.25) +
      clamp((adv - 0.42) / 0.24, -0.3, 0.9) +
      clamp((oosPrecision - 60) / 20, -0.25, 0.65);
  }
  if (p.pos === 'LIB') score += Math.min(1.4, (x.defenses || 0) * 0.045) + clamp((pass - 0.5) * 2, -0.4, 0.7);
  return score;
}
function matchMvp(m) {
  if ((!m.events || !m.events.length) && m.mvp) {
    return { p: player(m.mvp.id), side: m.mvp.side, impact: m.mvp.impact || 0, x: m.mvp.x || {} };
  }
  let winner = m.sets[0] === 3 ? 0 : 1,
    tieBreak = Math.min(...m.sets) === 2,
    sides = tieBreak ? [0, 1] : [winner];
  return sides
    .flatMap(side =>
      matchPlayerPool(m, side).map(p => {
        let raw = stats(m.events, side).players[p.id] || {},
          steps = m.events.flatMap(e => e.steps || []).filter(s => s.player === p.id),
          sets = steps.filter(s => s.type === 'set'),
          setCount = sets.length,
          setPrecision = setCount
            ? sets.reduce((n, s) => n + (Number.isFinite(s.precision) ? s.precision : 0), 0) / setCount
            : 0,
          blockAdv = setCount ? sets.filter(s => Number.isInteger(s.nblock) && s.nblock <= 1).length / setCount : 0,
          oosSets = sets.filter(s => s.quality <= 2 || s.transition),
          oosPrecision = oosSets.length
            ? oosSets.reduce((n, s) => n + (Number.isFinite(s.precision) ? s.precision : 0), 0) / oosSets.length
            : 0,
          decision = setCount
            ? sets.reduce(
                (n, s) =>
                  n +
                  ((Number.isFinite(s.expected) ? s.expected : 0) -
                    (Number.isFinite(s.bestExpected) ? s.bestExpected : 0)),
                0
              ) / setCount
            : 0,
          x = {
            ...raw,
            points: (raw.kills || 0) + (raw.aces || 0) + (raw.blocks || 0),
            setCount,
            setPrecision,
            blockAdv,
            oosCount: oosSets.length,
            oosPrecision,
            decision
          };
        return { p, side, impact: matchPlayerImpact(m, side, p), x };
      })
    )
    .sort((a, b) => b.impact - a.impact)[0];
}
function matchLaggard(m) {
  let winner = m.sets[0] === 3 ? 0 : 1,
    side = 1 - winner,
    rows = matchPlayerPool(m, side)
      .map(p => {
        let x = stats(m.events, side).players[p.id] || {},
          att = x.attacks || 0,
          rec = x.receptions || 0,
          killRate = att ? (x.kills || 0) / att : 1,
          posRate = rec ? (x.positive || 0) / rec : 1,
          expectedRec = clamp(0.38 + (p.receive - 60) * 0.006, 0.28, 0.78),
          points = (x.kills || 0) + (x.aces || 0) + (x.blocks || 0),
          bad =
            (att >= 12 ? Math.max(0, 0.36 - killRate) * 10 + (x.blocked || 0) * 0.32 + (x.errors || 0) * 0.42 : 0) +
            (rec >= 14 ? Math.max(0, expectedRec - posRate) * 8 : 0) +
            (x.serveErrors || 0) * 0.3 +
            (x.infractions || 0) * 0.45,
          steps = m.events.flatMap(e => e.steps || []).filter(s => s.player === p.id),
          oos = steps.filter(s => s.type === 'attack' && s.quality <= 2).length,
          attackingRole = ['PON', 'OPO', 'CEN'].includes(p.pos),
          strongContribution =
            attackingRole &&
            (points >= 20 || (points >= 15 && att >= 12 && killRate >= 0.44) || (att >= 20 && killRate >= 0.5)),
          attackProblems = att >= 12 && killRate < 0.34,
          attackWaste = att >= 12 && ((x.blocked || 0) + (x.errors || 0)) / att >= 0.24,
          passProblems = rec >= 14 && posRate < expectedRec - 0.14,
          disciplineProblems = (x.serveErrors || 0) >= 3 || (x.infractions || 0) >= 2,
          redFlags = [attackProblems, attackWaste, passProblems, disciplineProblems].filter(Boolean).length;
        return { p, side, x: { ...x, points, oos }, badScore: bad, strongContribution, redFlags, killRate, posRate };
      })
      .filter(r => !r.strongContribution)
      .sort((a, b) => b.badScore - a.badScore);
  return rows.find(r => r.badScore >= 3 && r.redFlags >= 1) || rows.find(r => r.badScore >= 1.8) || null;
}
function matchClassification(m) {
  let win = m.sets[0] === 3 ? 0 : 1,
    sets = m.setScores.map(s => (s[win] > s[1 - win] ? 1 : 0));
  if (sets.length === 5 && sets[0] === 0 && sets[1] === 0) return 'VIRADA';
  if (sets.length === 3) return 'DOMÍNIO';
  if (sets.length === 5) return 'BATALHA';
  if (sets[0] === 0) return 'SAIU ATRÁS';
  return 'VITÓRIA';
}
function matchHeadline(m) {
  let win = m.sets[0] === 3 ? 0 : 1,
    c = clubMainName([m.home, m.away][win]).toUpperCase(),
    seq = m.setScores.map(s => s[win] > s[1 - win]);
  if (seq.length === 5 && !seq[0] && !seq[1]) return `${c} SAI DE 0–2 E VENCE NO TIE-BREAK`;
  if (seq.length === 3) return `${c} CONTROLA A PARTIDA E FECHA EM 3–0`;
  if (seq.length === 5 && seq[0] === false) return `${c} SAI ATRÁS, REAGE E VENCE NO TIE-BREAK`;
  if (seq[0] === false) return `${c} SAI ATRÁS, AJUSTA O JOGO E VENCE`;
  if (seq.length === 5) return `${c} RESISTE E VENCE NO TIE-BREAK`;
  return `${c} SEGURA A PRESSÃO E FECHA O JOGO`;
}
function mvpRoleLine(m, row) {
  let p = row.p,
    x = row.x;
  if (p.pos === 'LIB')
    return `${x.defenses || 0} defesas · ${x.receptions ? pct(x.positive, x.receptions) + ' passe positivo' : 'recepção sem volume suficiente'}`;
  if (p.pos === 'LEV')
    return `${x.setCount || 0} levantamentos · ${Math.round(x.setPrecision || 0)}% precisão${x.setCount >= 10 ? ` · ${Math.round((x.blockAdv || 0) * 100)}% contra 0–1 bloqueador` : ''}`;
  return `${x.points || 0} pts${x.attacks ? ` · ${pct(x.kills, x.attacks)} ataque` : ''}${x.blocks >= 2 ? ` · ${x.blocks} bloqueios` : ''}`;
}

function finalTalkCategory(m, side) {
  let won = m.sets[side] === 3,
    seq = m.setScores.map(s => s[side] > s[1 - side]);
  if (won && m.sets[1 - side] === 2 && !seq[0] && !seq[1]) return 'win_comeback';
  if (won && m.sets[1 - side] === 0) return 'win_easy';
  if (won) return 'win_close';
  if (m.sets[side] === 0) return 'loss_sweep';
  if (m.sets[side] === 2) return 'loss_dramatic';
  return 'loss_close';
}
const FINAL_TALKS = {
  win_easy: [
    ['praise', 'Excelente atuação. Aproveitem a vitória.'],
    ['demand', 'Foi bom, mas ainda temos coisas para corrigir.'],
    ['alert', 'Não deixem esse resultado nos acomodar.'],
    ['collective', 'O mérito foi de quem executou o plano.'],
    ['standard', 'Era isso que eu esperava de vocês.']
  ],
  win_close: [
    ['collective', 'Foi no detalhe. Vocês ficaram juntos até o fim.'],
    ['demand', 'Ganhamos, mas demos espaço demais.'],
    ['growth', 'É assim que um time cresce.'],
    ['control', 'Quero mais controle na próxima.'],
    ['memory', 'Guardem a sensação de fechar um jogo assim.']
  ],
  win_comeback: [
    ['identity', 'Isso diz muito sobre quem vocês são.'],
    ['demand', 'Nunca mais podemos precisar chegar a 0–2 para reagir.'],
    ['memory', 'Guardem esta partida. Vocês não desistiram.'],
    ['collective', 'A entrada do banco mudou o jogo. Vitória de todos.'],
    ['analysis', 'Comemorem, mas entendam por que começamos tão mal.']
  ],
  loss_sweep: [
    ['hard', 'Isso foi inaceitável.'],
    ['protect', 'Esqueçam o placar. Vamos reconstruir.'],
    ['challenge', 'Quero uma resposta no próximo treino.'],
    ['technical', 'Hoje faltou execução, não capacidade.'],
    ['shared', 'Assumo minha parte. Precisamos corrigir juntos.']
  ],
  loss_close: [
    ['confidence', 'Faltou uma bola. Estamos perto.'],
    ['closing', 'Jogamos bem, mas precisamos fechar partidas.'],
    ['hard', 'Não aceitem perder jogos que estavam nas nossas mãos.'],
    ['process', 'O processo foi bom. O resultado virá.'],
    ['analysis', 'Revejam os últimos pontos. É ali que precisamos crescer.']
  ],
  loss_dramatic: [
    ['use', 'Vai doer. Usem isso.'],
    ['confidence', 'Vocês fizeram uma grande partida. Levantem a cabeça.'],
    ['hard', 'Estávamos com o jogo nas mãos.'],
    ['identity', 'O resultado foi cruel, mas o time mostrou quem é.'],
    ['together', 'Amanhã analisamos. Hoje fiquem juntos.']
  ]
};
function finalTalkLabel(cat) {
  return (
    {
      win_easy: 'Vitória com controle',
      win_close: 'Vitória equilibrada',
      win_comeback: 'Virada após 0–2',
      loss_sweep: 'Derrota dura',
      loss_close: 'Derrota equilibrada',
      loss_dramatic: 'Derrota dramática'
    }[cat] || 'Pós-jogo'
  );
}
function finalTalkFit(cat, key, team) {
  let avgMental = team.reduce((n, p) => n + p.mental, 0) / team.length,
    avgMorale = team.reduce((n, p) => n + p.morale, 0) / team.length,
    young = team.filter(p => p.age <= 23).length,
    base =
      {
        win_easy: { praise: 2, demand: 1, alert: 2, collective: 2, standard: 1 },
        win_close: { collective: 2, demand: 1, growth: 2, control: 1, memory: 2 },
        win_comeback: { identity: 3, demand: 0, memory: 3, collective: 2, analysis: 1 },
        loss_sweep: { hard: 0, protect: 2, challenge: 2, technical: 2, shared: 2 },
        loss_close: { confidence: 2, closing: 2, hard: 0, process: 2, analysis: 2 },
        loss_dramatic: { use: 2, confidence: 3, hard: 0, identity: 3, together: 3 }
      }[cat]?.[key] ?? 1;
  if (avgMental >= 80 && ['demand', 'hard', 'challenge', 'use', 'closing'].includes(key)) base += 1;
  if (avgMorale < 65 && ['protect', 'confidence', 'together', 'shared', 'process'].includes(key)) base += 1;
  if (young >= 4 && ['hard', 'demand'].includes(key)) base -= 1;
  if (avgMorale >= 88 && ['praise', 'confidence', 'protect'].includes(key)) base -= 1;
  return clamp(base, -1, 4);
}
function finalTalkPanel(m) {
  let side = m.home === state.club ? 0 : 1,
    cat = finalTalkCategory(m, side),
    choices = FINAL_TALKS[cat];
  return `<section class="final-talk"><small>VESTIÁRIO · ${finalTalkLabel(cat).toUpperCase()}</small><h2>Última palavra antes de sair</h2><p>A fala mexe no moral e no entrosamento. O mesmo tom não funciona para todo elenco.</p><div class="final-talk-options">${choices.map(([key, text], i) => `<button data-action="final-talk-choice:${i}"><strong>${text}</strong></button>`).join('')}</div></section>`;
}
function finalTalkDialog(m) {
  let d = openDialog('Palestra final', finalTalkPanel(m));
  d.className = 'final-talk-dialog';
  bind();
}
function applyFinalTalk(index) {
  if (!match?.done || match.finalTalk) return;
  let side = match.home === state.club ? 0 : 1,
    cat = finalTalkCategory(match, side),
    choice = FINAL_TALKS[cat]?.[index];
  if (!choice) return;
  let [key, text] = choice,
    team = state.all.filter(p => p.club === state.club),
    fit = finalTalkFit(cat, key, team),
    moraleBase = fit >= 4 ? 5 : fit === 3 ? 3 : fit === 2 ? 2 : fit === 1 ? 0 : fit === 0 ? -2 : -4,
    chemBase = fit >= 3 ? 2 : fit === 2 ? 1 : fit <= 0 ? -1 : 0;
  let reactions = [];
  for (let p of team) {
    let beforeMorale = p.morale,
      beforeChem = p.chemistry,
      personal = 0;
    if (['hard', 'demand', 'challenge', 'use'].includes(key)) personal = p.mental >= 80 ? 1 : p.mental < 65 ? -1 : 0;
    if (['confidence', 'protect', 'together', 'shared', 'praise'].includes(key) && p.morale < 70) personal += 1;
    p.morale = clamp(p.morale + moraleBase + personal, 35, 99);
    p.chemistry = clamp(
      p.chemistry + chemBase + (key === 'collective' || key === 'together' || key === 'shared' ? 1 : 0),
      35,
      99
    );
    reactions.push({ id: p.id, morale: p.morale - beforeMorale, chemistry: p.chemistry - beforeChem });
  }
  match.finalTalk = { category: cat, key, text, fit, morale: moraleBase, chemistry: chemBase, reactions };
  match.coachTalkHistory ??= [];
  match.coachTalkHistory.push({ kind: 'postgame', tone: key, category: cat, reactions });
  state.last = match;
  commit();
  let d = $('#detail');
  if (d?.open) d.close();
  render();
  notify(
    fit >= 3
      ? 'A fala caiu bem no vestiário.'
      : fit <= 0
        ? 'A reação do grupo foi fria.'
        : 'O grupo absorveu a mensagem.'
  );
}
function postGameSignal(m) {
  let mvp = matchMvp(m),
    sets = m.setScores.map(s => s.join('–')).join(' · ');
  return `<div class="final-signal"><small>FIM DE JOGO</small><div class="final-signal-class">${matchClassification(m)}</div><h3>${matchHeadline(m)}</h3><span class="final-signal-sets">${sets}</span><div class="final-signal-player"><b>Jogador da partida</b>${playerIdentity(mvp.p, { compact: true })}<small>${mvpRoleLine(m, mvp)}</small></div></div>`;
}
function postGameCover(m) {
  let mvp = matchMvp(m),
    sets = m.setScores.map(s => s.join('–')).join(' · '),
    talkDone = !!m.finalTalk;
  return `<section class="postgame-cover" role="dialog" aria-modal="true" aria-label="Fim de jogo"><small>FIM DE JOGO</small><div class="postgame-score"><span>${club(m.home).short} ${m.sets[0]}</span><i>×</i><span>${m.sets[1]} ${club(m.away).short}</span></div><div class="postgame-sets">${sets}</div><div class="postgame-class">${matchClassification(m)}</div><h2>${matchHeadline(m)}</h2><div class="postgame-mvp"><small>JOGADOR DA PARTIDA</small><strong>${athleteLabel(mvp.p)}</strong><span>${mvpRoleLine(m, mvp)}</span></div><div class="postgame-actions">${button('ANALISAR PARTIDA', 'report', talkDone ? 'primary' : '')}${talkDone ? button('ENCERRAR PARTIDA', 'end-match', 'primary') : button('PALESTRA FINAL', 'final-talk', 'primary')}</div></section>`;
}
function stateStoryHighlights(m, side) {
  let timeline = playerStateTimeline(m, side),
    priority = [
      'TURNING_EVERYTHING',
      'UNDER_PRESSURE',
      'DOMINATING_NET',
      'SERVE_CLICKED',
      'DISAPPEARED',
      'NERVOUS',
      'CLOSING_BACKCOURT'
    ],
    chosen = [];
  for (let key of priority) {
    let x = timeline.filter(t => t.key === key).at(-1);
    if (x && !chosen.some(y => y.playerId === x.playerId)) chosen.push(x);
    if (chosen.length >= 3) break;
  }
  return chosen;
}
function stateStoryPhrase(st) {
  return (
    {
      TURNING_EVERYTHING: 'passou a virar praticamente tudo',
      UNDER_PRESSURE: 'ficou sob pressão',
      DOMINATING_NET: 'passou a dominar a rede',
      SERVE_CLICKED: 'encaixou uma passagem forte no saque',
      DISAPPEARED: 'sumiu do jogo',
      NERVOUS: 'demonstrou nervosismo',
      CLOSING_BACKCOURT: 'fechou o fundo',
      PLAYING_FREE: 'passou a jogar solto',
      ENTERED_GAME: 'cresceu dentro do jogo',
      FELT_GAME: 'sentiu o jogo',
      TIRING: 'começou a sentir o desgaste'
    }[st.key] || st.label.toLowerCase()
  );
}
function postGameAnalysis(m) {
  let win = m.sets[0] === 3 ? 0 : 1,
    loss = 1 - win,
    winSets = m.setScores.map((s, i) => ({ i: i + 1, won: s[win] > s[loss] })),
    lostSets = winSets.filter(x => !x.won).map(x => x.i),
    wonSets = winSets.filter(x => x.won).map(x => x.i),
    setGroup = (sets, side) =>
      stats(
        m.events.filter(e => sets.includes(e.set)),
        side
      ),
    conclusions = [];
  if (lostSets.length && wonSets.length) {
    let a = setGroup(lostSets, win),
      b = setGroup(wonSets, win),
      rate = (x, y) => (y ? x / y : 0),
      candidates = [];
    const add = (score, title, metric, body) => candidates.push({ score, title, metric, body });
    let pa = rate(a.positive, a.receptions),
      pb = rate(b.positive, b.receptions);
    if (a.receptions >= 8 && b.receptions >= 8 && Math.abs(pb - pa) >= 0.1)
      add(
        Math.abs(pb - pa) / 0.1,
        'A primeira bola mudou',
        `Sets perdidos · ${pct(a.positive, a.receptions)} → vencidos · ${pct(b.positive, b.receptions)}`,
        'A qualidade da recepção mudou o leque de opções da construção e a frequência de bolas fora do sistema.'
      );
    let ae = rate(a.kills - a.errors - a.blocked, a.attacks),
      be = rate(b.kills - b.errors - b.blocked, b.attacks);
    if (a.attacks >= 15 && b.attacks >= 15 && Math.abs(be - ae) >= 0.09)
      add(
        Math.abs(be - ae) / 0.09,
        'O ataque ganhou eficiência',
        `${signedPct(a.kills - a.errors - a.blocked, a.attacks)} → ${signedPct(b.kills - b.errors - b.blocked, b.attacks)}`,
        'A equipe passou a transformar mais ataques em vantagem sem devolver tantos pontos em erro ou bloqueio sofrido.'
      );
    let aso = rate(a.sideout, a.received),
      bso = rate(b.sideout, b.received);
    if (a.received >= 8 && b.received >= 8 && Math.abs(bso - aso) >= 0.1)
      add(
        Math.abs(bso - aso) / 0.1,
        'A virada de bola mudou o controle',
        `${pct(a.sideout, a.received)} → ${pct(b.sideout, b.received)}`,
        'A diferença de side-out ajuda a explicar por que a equipe passou a jogar mais tempo com o placar sob controle.'
      );
    let abr = rate(a.breaks, a.served),
      bbr = rate(b.breaks, b.served);
    if (a.served >= 8 && b.served >= 8 && Math.abs(bbr - abr) >= 0.1)
      add(
        Math.abs(bbr - abr) / 0.1,
        'A pressão no saque cresceu',
        `${pct(a.breaks, a.served)} → ${pct(b.breaks, b.served)}`,
        'A equipe converteu mais pontos enquanto sacava, reduzindo a necessidade de depender apenas da virada de bola.'
      );
    let ed = (a.errorPoints || 0) - (b.errorPoints || 0);
    if (Math.abs(ed) >= 4)
      add(
        Math.abs(ed) / 4,
        'Os pontos de graça mudaram',
        `${a.errorPoints} → ${b.errorPoints} erros que deram ponto`,
        'A diferença de erros teve peso concreto nos sets que mudaram a direção da partida.'
      );
    let middleShare = sets => {
        let at = m.events
          .filter(e => sets.includes(e.set))
          .flatMap(e => e.steps || [])
          .filter(s => s.team === win && s.type === 'attack' && s.outcome !== 'cancelled');
        return [at.filter(s => player(s.player)?.pos === 'CEN').length, at.length];
      },
      [ma, mt] = middleShare(lostSets),
      [mb, mbt] = middleShare(wonSets);
    if (mbt >= 12 && mt >= 12 && Math.abs(mb / mbt - ma / mt) >= 0.14)
      add(
        Math.abs(mb / mbt - ma / mt) / 0.14,
        'A distribuição mudou de desenho',
        `${Math.round((ma / mt) * 100)}% → ${Math.round((mb / mbt) * 100)}% das bolas com os centrais`,
        'A participação do meio mudou de forma relevante, mas é tratada como uma das peças da construção, não como explicação automática da virada.'
      );
    candidates.sort((x, y) => y.score - x.score);
    conclusions.push(...candidates.slice(0, 2).map(({ score, ...x }) => x));
  }
  let mvp = matchMvp(m);
  if (mvp?.p.pos === 'LEV' && mvp.x.setCount >= 20 && conclusions.length < 4)
    conclusions.push({
      title: `${mvp.p.name} organizou o jogo`,
      metric: `${mvp.x.setCount} levantamentos · ${Math.round(mvp.x.setPrecision)}% precisão · ${Math.round(mvp.x.blockAdv * 100)}% contra 0–1 bloqueador`,
      body: 'O impacto do levantador é medido pela qualidade e pela escolha da distribuição, inclusive fora do sistema. Por isso ele pode ser decisivo mesmo sem aparecer entre os maiores pontuadores.'
    });
  let states = stateStoryHighlights(m, win);
  for (let st of states) {
    if (conclusions.length >= 4) break;
    conclusions.push({
      title: `${player(st.playerId).name}: ${st.label.replace(/^[^A-ZÀ-Ú]+/, '')}`,
      metric: `Set ${st.set} · ${(st.matchScore || m.events[Math.max(0, (st.index || 1) - 1)]?.score || [0, 0]).join('–')}`,
      body: st.evidence
    });
  }
  if (conclusions.length < 3) {
    let s = stats(m.events, win),
      worst = s.rotations
        .map((r, i) => ({ i, rate: r.received ? r.sideout / r.received : 1, n: r.received }))
        .filter(x => x.n >= 4)
        .sort((a, b) => a.rate - b.rate)[0];
    if (worst)
      conclusions.push({
        title: `R${worst.i + 1} foi a rotação mais difícil`,
        metric: `Virada de bola ${Math.round(worst.rate * 100)}% · n=${worst.n}`,
        body: 'A rotação concentrou mais dificuldade de virada. Vale revisar quem estava na rede e como o passe se comportou.'
      });
  }
  return conclusions.slice(0, 4);
}
function postGameSummary(m) {
  let win = m.sets[0] === 3 ? 0 : 1,
    loss = 1 - win,
    mvp = matchMvp(m),
    lag = matchLaggard(m),
    best = [...m.events].sort((a, b) => (b.momentImpact || 0) - (a.momentImpact || 0))[0],
    streak = [...m.events].sort((a, b) => (b.streakImpact || 0) - (a.streakImpact || 0))[0],
    spines = m.setScores.map((_, i) => setStorySpine(m, i + 1)),
    winner = clubMainName([m.home, m.away][win]),
    loser = clubMainName([m.home, m.away][loss]),
    seq = m.setScores.map(s => s[win] > s[loss]),
    states = stateStoryHighlights(m, win),
    turnSet =
      spines.find(s => s && s.winner === win && s.maxDeficit >= 3) ||
      spines.filter(s => s && s.winner === win).at(-1) ||
      spines.at(-1),
    lead = '';
  if (seq.length === 5 && !seq[0] && !seq[1])
    lead = `${winner} saiu de 0–2, prolongou a partida e completou a virada no tie-break.`;
  else if (seq[0] === false)
    lead = `${winner} saiu atrás ao perder o primeiro set, reorganizou o jogo e construiu a vitória por ${m.sets[win]}–${m.sets[loss]}.`;
  else if (seq.length === 5)
    lead = `${winner} largou melhor, viu ${loser} crescer durante a partida e precisou do tie-break para confirmar a vitória.`;
  else
    lead = `${winner} venceu por ${m.sets[win]}–${m.sets[loss]} e foi mais consistente nos momentos que definiram a partida.`;
  let middle = '';
  if (turnSet) {
    let turning =
      turnSet.maxDeficit >= 3
        ? `${winner} precisou reagir no ${turnSet.set}º set e encontrou ali uma mudança importante no jogo.`
        : `O ${turnSet.set}º set consolidou o melhor momento de ${winner}.`;
    let weight = turnSet.weights?.length
      ? ` ${turnSet.weights.slice(0, 2).join(' e ')} ajudaram a explicar o trecho.`
      : '';
    middle = turning + weight;
  }
  let stateText = '';
  if (states.length) {
    let st = states[0],
      pn = player(st.playerId)?.name?.split(' ')[0] || '';
    stateText = `${pn} ${stateStoryPhrase(st)} no set ${st.set}, e esse estado apareceu na sequência que a partida construiu. ${st.evidence}`;
  }
  let setRecaps = `<details class="post-deep"><summary>Ver a história set a set</summary><div class="post-set-recaps"><small>COMO FOI SET A SET</small>${spines
    .filter(Boolean)
    .map(
      sp =>
        `<article><b>${sp.set}º set · ${club(m.home).short} ${sp.final[0]}–${sp.final[1]} ${club(m.away).short}</b><strong>${sp.headline}</strong><p>${sp.summary[0] || ''}</p></article>`
    )
    .join('')}</div></details>`;
  let mvpWhy = '';
  if (mvp?.p.pos === 'LEV')
    mvpWhy = `${mvp.p.name} foi escolhido MVP pelo impacto na organização: ${mvp.x.setCount} levantamentos, ${Math.round(mvp.x.setPrecision)}% de precisão média e ${Math.round(mvp.x.blockAdv * 100)}% das escolhas deixando o ataque contra zero ou um bloqueador${mvp.x.oosCount >= 5 ? `, além de ${Math.round(mvp.x.oosPrecision)}% de precisão em ${mvp.x.oosCount} bolas fora do sistema` : ''}.`;
  else if (mvp?.p.pos === 'LIB')
    mvpWhy = `${mvp.p.name} foi escolhido MVP pelo impacto defensivo e na primeira bola: ${mvp.x.defenses || 0} defesas${mvp.x.receptions ? ` e ${pct(mvp.x.positive, mvp.x.receptions)} de passe positivo` : ''}.`;
  else if (mvp)
    mvpWhy = `${mvp.p.name} foi escolhido MVP pela combinação de produção e impacto: ${mvp.x.points || 0} pontos${mvp.x.attacks ? `, ${pct(mvp.x.kills, mvp.x.attacks)} no ataque` : ''}${mvp.x.blocks ? ` e ${mvp.x.blocks} bloqueio${mvp.x.blocks === 1 ? '' : 's'}` : ''}.`;
  return `<div class="post-summary"><div class="post-summary-kicker"><small>RESUMO</small><span>${matchClassification(m)}</span></div><h2>${matchHeadline(m)}</h2><p class="lead">${lead}</p>${middle ? `<p>${middle}</p>` : ''}${stateText ? `<p>${stateText}</p>` : ''}${setRecaps}<div class="set-people">${setPlayerCard('MVP', { p: mvp.p, x: mvp.x })}${lag ? setPlayerCard('FICOU DEVENDO', lag, true) : ''}</div>${mvpWhy ? `<div class="mvp-why"><small>POR QUE FOI MVP</small><p>${mvpWhy}</p></div>` : ''}${best?.momentImpact >= 70 ? `<div class="set-moment"><small>MOMENTO DA PARTIDA</small><p>Set ${best.set} · ${best.scoreBefore.join('–')} · ${momentSentence(best)}</p></div>` : ''}${(streak?.streakImpact || 0) >= 55 ? `<div class="set-moment"><small>SEQUÊNCIA DA PARTIDA</small><p>${momentSentence(streak)}</p></div>` : ''}</div>`;
}
function postGameData(m) {
  let a = matchStats(m, 0),
    b = matchStats(m, 1),
    rows = [
      ['ATAQUE', pct(a.kills, a.attacks), pct(b.kills, b.attacks), 'Conversão dos ataques em ponto'],
      ['VIRADA DE BOLA', pct(a.sideout, a.received), pct(b.sideout, b.received), 'Pontos vencidos recebendo'],
      ['CONVERSÃO COM SAQUE', pct(a.breaks, a.served), pct(b.breaks, b.served), 'Pontos vencidos sacando'],
      ['PASSE POSITIVO', pct(a.positive, a.receptions), pct(b.positive, b.receptions), 'Qualidade da primeira bola'],
      ['BLOQUEIOS', a.blocks, b.blocks, 'Pontos diretos no bloqueio'],
      ['ACES', a.aces, b.aces, 'Pontos diretos no saque'],
      ['ERROS', a.errorPoints, b.errorPoints, 'Pontos cedidos ao adversário']
    ];
  let cards = rows
    .map(
      r =>
        `<article class="post-data-card"><small>${r[0]}</small><div><strong>${r[1]}</strong><span>${club(m.home).short}</span><i>×</i><span>${club(m.away).short}</span><strong>${r[2]}</strong></div><p>${r[3]}</p></article>`
    )
    .join('');
  return `<div class="post-data"><div class="post-data-mobile">${cards}</div><div class="post-data-table">${table(
    ['INDICADOR', club(m.home).short, club(m.away).short],
    rows.map(r => `<tr><td>${r[0]}</td><td>${r[1]}</td><td>${r[2]}</td></tr>`)
  )}</div></div>`;
}
function postGameHero(m) {
  let win = m.sets[0] === 3 ? 0 : 1,
    mvp = matchMvp(m),
    winner = club([m.home, m.away][win]),
    sets = m.setScores.map((s, i) => `<span><b>${i + 1}º</b>${s[0]}–${s[1]}</span>`).join(''),
    grade = ratingRows(m).find(r => r.id === mvp.p.id)?.grade;
  return `<section class="postgame-report-hero" style="--winner:${winner.color}"><div class="postgame-report-kicker"><span>FIM DE JOGO</span><b>${matchClassification(m)}</b></div><div class="postgame-report-score"><div><small>${club(m.home).short}</small><strong>${m.sets[0]}</strong></div><i>×</i><div><strong>${m.sets[1]}</strong><small>${club(m.away).short}</small></div></div><div class="postgame-report-sets">${sets}</div><h2>${matchHeadline(m)}</h2><div class="postgame-report-mvp"><div><small>MVP</small><strong>${mvp.p.name}</strong><span>${mvpRoleLine(m, mvp)}</span></div><b>★ ${grade ? grade.toFixed(1) : '—'}</b></div></section>`;
}
function postGamePanel(m) {
  let analysis = postGameAnalysis(m),
    body =
      postGameTab === 'summary'
        ? postGameSummary(m)
        : postGameTab === 'analysis'
          ? `<div class="post-analysis"><div class="post-section-head"><small>LEITURA DA COMISSÃO</small><h2>Por que o jogo tomou esse caminho?</h2><p>As leituras abaixo priorizam diferenças que realmente apareceram na partida.</p></div>${analysis.map((x, i) => `<article><span>${String(i + 1).padStart(2, '0')}</span><div><b>${x.title}</b><strong>${x.metric}</strong><p>${x.body}</p></div></article>`).join('')}</div>`
          : postGameData(m);
  return `<section class="postgame-sheet">${postGameHero(m)}<nav class="post-tabs">${[
    ['summary', 'Resumo'],
    ['analysis', 'Análise'],
    ['data', 'Números']
  ]
    .map(([id, l]) => `<button data-action="post-tab:${id}" aria-pressed="${postGameTab === id}">${l}</button>`)
    .join(
      ''
    )}</nav><div class="postgame-tab-body">${body}</div><div class="postgame-sticky">${m.finalTalk ? button('Encerrar partida', 'end-match', 'primary') : button('Palestra final', 'final-talk', 'primary')}</div></section>`;
}

function bestReserveFor(m, side, p, mode = 'stable') {
  let ids = new Set(m.teams[side].map(x => x.id)),
    pool = state.all.filter(q => q.club === [m.home, m.away][side] && q.pos === p.pos && !ids.has(q.id));
  if (!pool.length) return null;
  let score = q =>
    mode === 'block'
      ? q.block * 1.2 + (q.height_cm || heightFor(q)) * 0.18 - q.attack * 0.08
      : mode === 'attack'
        ? q.attack * 0.55 + q.consistency * 0.25 + q.mental * 0.15 + q.condition * 0.1
        : mode === 'receive'
          ? q.receive * 0.55 + q.defense * 0.2 + q.consistency * 0.2 + q.condition * 0.1
          : q.consistency * 0.5 + q.mental * 0.35 + q.receive * 0.35 + q.condition * 0.12;
  return pool.sort((a, b) => score(b) - score(a))[0] || null;
}
function physicalSubCue(m, side, reads) {
  let hit = reads.find(x => ['NERVOUS', 'UNDER_PRESSURE', 'TIRING', 'FELT_GAME'].includes(x.state?.key));
  if (!hit) return '';
  let reserve = bestReserveFor(m, side, hit.player, 'stable');
  if (!reserve) return '';
  let kind = hit.state.key === 'TIRING' ? 'SUBSTITUIÇÃO FÍSICA' : 'SUBSTITUIÇÃO EMOCIONAL';
  return `<div class="state-assistant substitution"><small>${kind}</small><h3>${hit.player.name.split(' ')[0]} está ${hit.state.label.replace(/^[^ ]+ /, '').toLowerCase()}</h3><p>${hit.state.evidence} ${reserve.name} oferece uma alternativa mais estável para este momento.</p><div class="split">${button(reserve.name.split(' ')[0] + ' por ' + hit.player.name.split(' ')[0], `court-sub:${hit.player.id}`, 'primary')}${button('Manter em quadra', 'overlay-close')}</div></div>`;
}
function technicalSubCue(m, side) {
  let set = m.setScores.length + 1,
    s = stats(
      m.events.filter(e => e.set === set),
      side
    ),
    rows = m.teams[side]
      .slice(0, 6)
      .map(p => {
        let x = s.players[p.id] || {},
          att = x.attacks || 0,
          rec = x.receptions || 0,
          eff = att ? ((x.kills || 0) - (x.errors || 0) - (x.blocked || 0)) / att : 1,
          pass = rec ? (x.positive || 0) / rec : 1,
          mode = att >= 6 && eff < 0.12 ? 'attack' : rec >= 6 && pass < 0.25 ? 'receive' : null,
          bad = mode === 'attack' ? 0.12 - eff : mode === 'receive' ? 0.25 - pass : 0;
        return { p, x, mode, bad };
      })
      .filter(x => x.mode)
      .sort((a, b) => b.bad - a.bad),
    hit = rows[0];
  if (!hit) return '';
  let reserve = bestReserveFor(m, side, hit.p, hit.mode);
  if (!reserve) return '';
  let gain = hit.mode === 'attack' ? reserve.attack - hit.p.attack : reserve.receive - hit.p.receive;
  if (gain < 3 && reserve.condition < hit.p.condition + 4) return '';
  return `<div class="state-assistant substitution"><small>SUBSTITUIÇÃO TÉCNICA</small><h3>${hit.mode === 'attack' ? 'O ataque perdeu eficiência' : 'A recepção está cedendo'}</h3><p>${hit.p.name}: ${hit.mode === 'attack' ? `${hit.x.kills || 0}/${hit.x.attacks || 0} no ataque, com ${(hit.x.errors || 0) + (hit.x.blocked || 0)} bolas negativas` : `${hit.x.positive || 0}/${hit.x.receptions || 0} passes positivos`}. ${reserve.name} oferece ${gain >= 0 ? '+' + gain + ' no fundamento' : 'mais estabilidade física'}.</p><div class="split">${button(reserve.name.split(' ')[0] + ' por ' + hit.p.name.split(' ')[0], `court-sub:${hit.p.id}`, 'primary')}${button('Manter formação', 'overlay-close')}</div></div>`;
}
function tacticalSubCue(m, side) {
  let recent = m.events.filter(e => e.set === m.setScores.length + 1).slice(-8),
    oppAtt = recent
      .flatMap(e => e.steps || [])
      .filter(s => s.team === 1 - side && s.type === 'attack' && s.outcome !== 'cancelled'),
    groups = ['PON', 'OPO', 'CEN']
      .map(pos => {
        let ids = m.teams[1 - side].filter(p => p.pos === pos).map(p => p.id),
          a = oppAtt.filter(s => ids.includes(s.player));
        return { pos, a, k: a.filter(s => ['kill', 'faultWin', 'defenseError'].includes(s.outcome)).length };
      })
      .filter(x => x.a.length >= 4 && x.k / x.a.length >= 0.6)
      .sort((a, b) => b.k / b.a.length - a.k / a.a.length),
    threat = groups[0];
  if (!threat) return '';
  let front = m.teams[side]
      .slice(0, 6)
      .filter((p, i) => (i + m.rotation[side]) % 6 >= 1 && (i + m.rotation[side]) % 6 <= 3),
    candidate = front
      .map(p => ({ p, r: bestReserveFor(m, side, p, 'block') }))
      .filter(
        x =>
          x.r &&
          (x.r.height_cm || heightFor(x.r)) - (x.p.height_cm || heightFor(x.p)) >= 8 &&
          x.r.block >= x.p.block + 4
      )
      .sort((a, b) => b.r.block - b.p.block - (a.r.block - a.p.block))[0];
  if (!candidate) return '';
  let dh = (candidate.r.height_cm || heightFor(candidate.r)) - (candidate.p.height_cm || heightFor(candidate.p));
  return `<div class="state-assistant tactical"><small>SUBSTITUIÇÃO TÁTICA</small><h3>${threat.pos === 'OPO' ? 'A saída rival está pesando' : threat.pos === 'CEN' ? 'O meio rival está encontrando espaço' : 'Os ponteiros rivais estão virando'}</h3><p>${threat.k}/${threat.a.length} ataques convertidos na janela recente. ${candidate.r.name} acrescenta ${dh} cm e +${candidate.r.block - candidate.p.block} de bloqueio nesta troca.</p><div class="split">${button(candidate.r.name.split(' ')[0] + ' por ' + candidate.p.name.split(' ')[0], `court-sub:${candidate.p.id}`, 'primary')}${button('Manter formação', 'overlay-close')}</div></div>`;
}
function opponentReactionCue(m, side) {
  let opp = 1 - side,
    last = (m.decisions || []).filter(d => d.side === opp && d.automatic && m.events.length - d.rally <= 5).at(-1);
  if (!last) return '';
  if (last.reason === 'opponent-pattern') {
    let labels = { middle: 'o meio', opposite: 'a saída', wings: 'as pontas' },
      share = Math.round((last.evidence?.share || 0) * 100);
    return `<div class="state-assistant rival"><small>REAÇÃO DO RIVAL</small><h3>O bloqueio leu nossa distribuição</h3><p>Eles passaram a fechar ${labels[last.to] || last.to} depois de esse setor concentrar ${share}% da amostra recente.</p><small>Se continuarmos repetindo, a vantagem tática tende a cair. Variar agora pode reabrir a rede.</small></div>`;
  }
  if (last.reason === 'opponent-direction') {
    let labels = { diagonal: 'a diagonal', parallel: 'a paralela', deep: 'o fundo', advance: 'a bola curta' },
      share = Math.round((last.evidence?.share || 0) * 100);
    return `<div class="state-assistant rival"><small>REAÇÃO DO RIVAL</small><h3>A defesa deslocou o posicionamento</h3><p>Eles passaram a proteger ${labels[last.to] || last.to} após reconhecer ${share}% das bolas recentes nessa direção.</p><small>A direção ficou legível. Mudar a solução de ataque volta a testar a defesa.</small></div>`;
  }
  if (!['player-state-sub', 'player-state-protect'].includes(last.reason)) return '';
  let target = null;
  if (last.reason === 'player-state-sub') {
    target = m.teams[opp].find(p => p.id === last.in);
    if (!target) return '';
  } else {
    let id = Number(String(last.to || '').split(':')[1]);
    target = m.teams[opp].find(p => p.id === id);
    if (!target) return '';
  }
  let alternatives = m.teams[opp]
      .filter(p => ['PON', 'LIB'].includes(p.pos) && p.id !== target.id)
      .sort((a, b) => a.receive - b.receive),
    alt = alternatives[0];
  return `<div class="state-assistant rival"><small>REAÇÃO DO RIVAL</small><h3>${last.reason === 'player-state-sub' ? 'Eles mexeram no passe' : 'Eles protegeram a recepção'}</h3><p>${target.name} ${last.reason === 'player-state-sub' ? 'entrou para dar mais estabilidade' : 'passou a receber cobertura depois de sofrer pressão'}.</p>${alt ? `<div class="split">${button('Mudar alvo para ' + alt.name.split(' ')[0], `state-target:${alt.id}`, 'primary')}${button('Continuar em ' + target.name.split(' ')[0], `state-target:${target.id}`)}</div>` : ''}</div>`;
}
function assistantPlanBucket(m, side) {
  m.assistantPlans ??= {};
  let bucket = m.assistantPlans[side];
  if (bucket?.key) {
    bucket = { [bucket.key]: bucket };
    m.assistantPlans[side] = bucket;
  }
  if (!bucket || Array.isArray(bucket)) {
    bucket = {};
    m.assistantPlans[side] = bucket;
  }
  return bucket;
}
function startAssistantPlan(m, side, item, reason = 'assistant') {
  if (!['distribution', 'block', 'target'].includes(item.key)) return null;
  let set = m.setScores.length + 1,
    target = set === 5 ? 10 : 16,
    bucket = assistantPlanBucket(m, side),
    plan = {
      key: item.key,
      value: item.value,
      label: item.title || 'Ajuste tático',
      detail: item.detail || 'Hipótese aceita pela comissão.',
      set,
      startRally: m.events.length,
      minRallies: item.key === 'target' ? 8 : 8,
      minLeaderScore: item.key === 'target' ? 0 : target,
      settleRallies: 2,
      reason
    };
  bucket[item.key] = plan;
  return plan;
}
function clearAssistantPlan(m, side, key) {
  let bucket = assistantPlanBucket(m, side);
  if (bucket[key]) delete bucket[key];
}
function assistantPlanStates(m, side) {
  let set = m.setScores.length + 1,
    leader = Math.max(...m.score),
    bucket = assistantPlanBucket(m, side);
  return Object.values(bucket)
    .filter(p => p && p.set === set)
    .map(p => {
      let elapsed = Math.max(0, m.events.length - p.startRally),
        holding = elapsed < p.minRallies || leader < p.minLeaderScore,
        settling = !holding && elapsed < p.minRallies + (p.settleRallies || 0);
      return { ...p, elapsed, leader, holding, settling };
    });
}
function activeAssistantPlan(m, side) {
  return assistantPlanStates(m, side).find(p => p.holding || p.settling) || null;
}
function assistantPlanCard(m, side) {
  let plan = activeAssistantPlan(m, side);
  if (!plan) return '';
  let score = m.score.join('–'),
    phase = plan.holding ? 'PLANO EM OBSERVAÇÃO' : 'PLANO EM AVALIAÇÃO',
    sample = Math.min(plan.elapsed, plan.minRallies),
    tail = plan.holding
      ? `Amostra: ${sample}/${plan.minRallies} rallies · placar ${score}${plan.minLeaderScore && plan.leader < plan.minLeaderScore ? ` · sustentar ao menos até a faixa dos ${plan.minLeaderScore} pontos` : ''}.`
      : `Amostra mínima concluída. A comissão agora procura sinais de resposta adversária.`;
  let note =
    plan.key === 'block'
      ? 'O bloqueio precisa de repetição para revelar se o matchup mudou.'
      : plan.key === 'target'
        ? 'Observe se o passador melhora, recebe menos bolas ou passa a ser protegido.'
        : 'A distribuição precisa de volume suficiente para mostrar eficiência e resposta do bloqueio.';
  return `<div class="state-assistant plan-observation"><small>${phase}</small><h3>${plan.label}</h3><p>${plan.detail}</p><small>${tail}</small><p class="muted">${note}</p></div>`;
}
function tacticalCausalityCue(m, side) {
  let attacks = m.events
      .slice(-18)
      .flatMap(e => e.steps || [])
      .filter(s => s.type === 'attack'),
    ours = attacks.filter(s => s.team === side).slice(-8),
    theirs = attacks.filter(s => s.team === 1 - side).slice(-8);
  if (ours.length < 4 && theirs.length < 4) return '';
  let edge = ours.length ? ours.reduce((n, s) => n + Number(s.tacticalEdge || 0), 0) / ours.length : 0,
    blockRead = theirs.length ? theirs.filter(s => s.blockMatched).length / theirs.length : 0,
    defRead = theirs.length ? theirs.filter(s => s.defenseCovered).length / theirs.length : 0,
    attackText =
      edge >= 1.2
        ? 'A distribuição está criando vantagem contra o bloqueio.'
        : edge <= -1.2
          ? 'Nossa distribuição está entrando no foco do bloqueio rival.'
          : 'A distribuição ainda está neutra contra a leitura rival.',
    blockText =
      blockRead >= 0.48
        ? 'O bloqueio está chegando no setor certo com frequência.'
        : blockRead <= 0.22
          ? 'O ataque rival está escapando do nosso foco de bloqueio.'
          : 'O bloqueio alterna boas e más leituras.',
    defText =
      defRead >= 0.42
        ? 'A defesa está protegendo bem a direção mais atacada.'
        : defRead <= 0.18
          ? 'A cobertura defensiva está deixando muito espaço livre.'
          : 'A defesa ainda não encontrou um padrão claro.';
  return `<div class="tactical-causality"><small>CAUSALIDADE TÁTICA · ÚLTIMAS BOLAS</small><p>${attackText}</p><div><span>Distribuição <b>${edge >= 0 ? '+' : ''}${edge.toFixed(1)}</b></span><span>Bloqueio <b>${Math.round(blockRead * 100)}%</b></span><span>Defesa <b>${Math.round(defRead * 100)}%</b></span></div><em>${blockText} ${defText}</em></div>`;
}

function crowdPulseLevel(m) {
  let c = matchContext(m);
  return c.crowd === 'PEGANDO FOGO' ? 5 : c.crowd === 'PRESSIONANDO' ? 4 : c.crowd === 'ACORDANDO' ? 2 : 1;
}
function crowdPulse(m) {
  let level = crowdPulseLevel(m);
  return `<div class="crowd-pulse" aria-label="Energia observável da torcida: ${level} de 5"><small>TORCIDA</small><span>${Array.from({ length: 5 }, (_, i) => `<i class="${i < level ? 'on' : ''}"></i>`).join('')}</span></div>`;
}
function currentSetRun(m, side) {
  let set = m.setScores.length + 1,
    ev = m.events.filter(e => e.set === set),
    run = 0;
  for (let i = ev.length - 1; i >= 0 && ev[i].winner === side; i--) run++;
  return run;
}
function teamObservation(m, side) {
  let set = m.setScores.length + 1,
    ev = m.events.filter(e => e.set === set),
    recent = ev.slice(-8);
  if (recent.length < 5) return null;
  let own = stats(ev, side),
    opp = stats(ev, 1 - side),
    scoreGap = m.score[1 - side] - m.score[side],
    state = m.competitiveState?.[side] || {},
    avgConf = m.teams[side].reduce((n, p) => n + Number(p.confidence ?? p.morale ?? 75), 0) / 7,
    negSteps = recent
      .flatMap(e => e.steps || [])
      .filter(
        s =>
          s.team === side &&
          (s.type === 'serveError' ||
            (s.type === 'attack' && ['error', 'blocked'].includes(s.outcome)) ||
            (s.type === 'receive' && s.quality <= 1) ||
            s.type === 'defenseError' ||
            s.type === 'infraction')
      ),
    negPlayers = new Set(negSteps.map(s => s.player)).size,
    ourRun = currentSetRun(m, side),
    oppRun = currentSetRun(m, 1 - side),
    day = Number.isFinite(m.dayForm?.[side])
      ? m.dayForm[side]
      : Number.isFinite(m.matchForm?.[side])
        ? m.matchForm[side] * 0.3
        : 0;
  if (focusLoad(m, side))
    return {
      priority: 97,
      kicker: 'LEITURA DO AUXILIAR · ANÍMICO',
      title: 'A confiança virou relaxamento',
      detail:
        'A equipe construiu vantagem, mas a atenção caiu. É uma leitura de comportamento, não uma queda técnica permanente.'
    };
  if (oppRun >= 4 && avgConf < 72)
    return {
      priority: 92,
      kicker: 'LEITURA DO AUXILIAR · ANÍMICO',
      title: 'O grupo sentiu a sequência',
      detail: `Foram ${oppRun} pontos seguidos do rival e a confiança média em quadra caiu. Vale estabilizar a primeira bola antes de mudar tudo.`
    };
  if ((state.pressure || 0) >= 18 && matchContext(m).act === 'closing' && negSteps.length >= 3)
    return {
      priority: 89,
      kicker: 'LEITURA DO AUXILIAR · ANÍMICO',
      title: 'A pressão está aparecendo na execução',
      detail: `Nos últimos oito rallies houve ${negSteps.length} ações negativas distribuídas por ${negPlayers} atleta(s). A comissão lê tensão, não falta de qualidade.`
    };
  let recA = own.receptions ? own.positive / own.receptions : null,
    recB = opp.receptions ? opp.positive / opp.receptions : null,
    effA = own.attacks ? (own.kills - own.errors - own.blocked) / own.attacks : null,
    effB = opp.attacks ? (opp.kills - opp.errors - opp.blocked) / opp.attacks : null;
  if (scoreGap >= 3 && own.receptions >= 8 && opp.receptions >= 8 && recB - recA >= 0.13)
    return {
      priority: 87,
      kicker: 'LEITURA DO AUXILIAR · POR QUE ESTAMOS ATRÁS',
      title: 'A primeira bola está pesando no placar',
      detail: `Passe positivo: ${Math.round(recA * 100)}% contra ${Math.round(recB * 100)}%. O problema principal está antes do ataque.`
    };
  if (scoreGap >= 3 && own.attacks >= 10 && opp.attacks >= 10 && effB - effA >= 0.12)
    return {
      priority: 86,
      kicker: 'LEITURA DO AUXILIAR · POR QUE ESTAMOS ATRÁS',
      title: 'Estamos perdendo eficiência no ataque',
      detail: `Eficiência ofensiva: ${Math.round(effA * 100)}% contra ${Math.round(effB * 100)}%. A diferença está em erro, bloqueio sofrido e conversão.`
    };
  if (scoreGap >= 3 && (own.errorPoints || 0) - (opp.errorPoints || 0) >= 3)
    return {
      priority: 85,
      kicker: 'LEITURA DO AUXILIAR · POR QUE ESTAMOS ATRÁS',
      title: 'Estamos cedendo pontos de graça',
      detail: `${own.errorPoints} erros deram ponto contra ${opp.errorPoints} do rival neste set. Antes de trocar o plano, precisamos limpar a execução.`
    };
  if (day <= -1.15 && negSteps.length >= 4 && negPlayers >= 3)
    return {
      priority: 83,
      kicker: 'LEITURA DO AUXILIAR · ANÍMICO',
      title: 'Hoje a execução coletiva está abaixo do normal',
      detail: `A comissão vê erros recentes espalhados por ${negPlayers} jogadores. Não há um único culpado nem uma única correção tática.`
    };
  if (day >= 1.15 && ourRun >= 3 && avgConf >= 80)
    return {
      priority: 73,
      kicker: 'LEITURA DO AUXILIAR · ANÍMICO',
      title: 'O time está jogando solto',
      detail:
        'A execução está fluida e a confiança apareceu em mais de um jogador. O risco agora é acelerar decisões sem necessidade.'
    };
  return null;
}
function crowdObservation(m, side) {
  let c = matchContext(m),
    level = crowdPulseLevel(m),
    homeRun = currentSetRun(m, 0),
    awayRun = currentSetRun(m, 1),
    homeLead = m.score[0] - m.score[1];
  if (m.events.length < 5) return null;
  if (side === 0) {
    if (level >= 5 && homeRun >= 3)
      return {
        priority: 82,
        kicker: 'LEITURA DO AUXILIAR · AMBIENTE',
        title: 'A torcida entrou no jogo',
        detail:
          'O ginásio respondeu à sequência e o ruído está no pico. É um bom momento para sustentar pressão, não para forçar tudo.'
      };
    if (level >= 4 && homeLead < 0 && matchContext(m).act === 'closing' && awayRun >= 2)
      return {
        priority: 84,
        kicker: 'LEITURA DO AUXILIAR · AMBIENTE',
        title: 'O ginásio está tenso',
        detail:
          'A arquibancada continua alta, mas o barulho virou cobrança. A comissão percebe pressão sobre o time da casa.'
      };
    if (level === 1 && homeLead <= -4)
      return {
        priority: 76,
        kicker: 'LEITURA DO AUXILIAR · AMBIENTE',
        title: 'A torcida esfriou',
        detail: 'A sequência rival tirou energia do ginásio. Uma ação grande pode reacender o ambiente.'
      };
  } else {
    if (level >= 5 && homeRun >= 3)
      return {
        priority: 84,
        kicker: 'LEITURA DO AUXILIAR · AMBIENTE',
        title: 'Precisamos tirar o ginásio do jogo',
        detail: 'A torcida da casa entrou na sequência. Um side-out limpo ou um tempo pode quebrar o ambiente.'
      };
    if (level === 1 && homeLead <= -4)
      return {
        priority: 78,
        kicker: 'LEITURA DO AUXILIAR · AMBIENTE',
        title: 'Conseguimos esfriar a torcida rival',
        detail: 'O ginásio perdeu energia com nossa vantagem. É hora de manter a execução e evitar devolver o ambiente.'
      };
  }
  return null;
}
function assistantObservationCard(o) {
  return o
    ? `<div class="state-assistant observation team-observation"><small>${o.kicker}</small><h3>${o.title}</h3><p>${o.detail}</p><small>Observação da comissão com base no que aparece em quadra.</small></div>`
    : '';
}
function stateAssistantCue(m, side) {
  let planCard = assistantPlanCard(m, side),
    reads = playerStateSnapshot(m, side).sort((a, b) => (b.state?.priority || 0) - (a.state?.priority || 0)),
    x = reads[0],
    reaction = opponentReactionCue(m, side),
    sub = !planCard ? physicalSubCue(m, side, reads) || technicalSubCue(m, side) || tacticalSubCue(m, side) : '',
    cue = '',
    causal = tacticalCausalityCue(m, side),
    teamObs = teamObservation(m, side),
    crowdObs = crowdObservation(m, side),
    env = [teamObs, crowdObs].filter(Boolean).sort((a, b) => b.priority - a.priority)[0],
    playerPriority = x?.state?.priority || 0;
  if (!planCard && !sub && env && env.priority >= Math.max(76, playerPriority - 2)) cue = assistantObservationCard(env);
  else if (x && !planCard && !sub) {
    cue = `<div class="state-assistant observation"><small>LEITURA DO AUXILIAR · JOGADOR</small>${playerIdentity(x.player, { compact: true })}<h3>${x.state.label}</h3><p>${x.state.evidence}</p><small>Leitura de momento. A ação fica a critério da comissão.</small></div>`;
  }
  return causal + reaction + planCard + sub + cue;
}

function matchPage() {
  let m = activeMatch(),
    n = next();
  if (!n && !m)
    return (
      heading('Central da partida', 'Escolha seu clube para jogar.', 'Inicie sua carreira na seleção de clubes.') +
      button('Voltar', 'home')
    );
  if (m?.summaryOnly && !n)
    return `${heading('Temporada concluída', 'Última partida arquivada.', 'O rally a rally foi compactado; o relatório da partida permanece disponível.')}<div class="panel">${compactHistoryReport(m)}</div>`;
  if (!m || (m.done && m !== match && state.last && n))
    return `${heading('Pré-partida', 'Tudo pronto para o primeiro saque.', 'Leia o adversário, confirme o plano e entre em quadra.')}<div class="prematch-page">${preMatchInfo(n)}<div class="pregame-actions">${button('Ajustar time', 'squad')}${button('Iniciar jogo', 'start', 'primary', !n)}${state.last ? button('Última partida', 'last', 'pregame-last') : ''}</div></div>`;
  let side = m.home === state.club ? 0 : 1,
    items = advice(m, side, m.setScores.length + 1, state.all);
  return `<div class="match-stage ${!m.done && Math.min(...m.score) >= (m.setScores.length === 4 ? 13 : 23) ? 'critical-stage' : ''} ${m.done ? 'is-final' : ''}">${m.done ? postGameCover(m) : ''}<div class="match-bar"><div class="bar-score">${teamIdentity(m, 0)}<div class="score-center"><span class="score-phase">${m.done ? 'FINAL' : 'SET ' + (m.setScores.length + 1)}</span><strong>${[0, 1].map(side => '<span data-score-side="' + side + '">' + (m.done ? m.sets[side] : m.score[side]) + '</span>').join(' <i>–</i> ')}</strong><div class="set-scoreline"><span>${m.sets[0]}</span><small>SETS</small><span>${m.sets[1]}</span></div>${!m.done ? crowdPulse(m) : ''}</div>${teamIdentity(m, 1)}</div>${arenaDisplay(m)}${m.done ? postGameSignal(m) : ''}<div class="bar-controls">${m.done ? button('Analisar partida', 'report', 'primary') + button('Encerrar partida', 'end-match') : m.breakKind === 'opening' ? button('Iniciar jogo', 'play', 'primary') + button('Tática', 'coach-pause') : button(matchContext(m).act === 'closing' ? 'Próximo rally' : timer ? 'Pausar' : 'Continuar', 'play', 'primary') + button('Próximo', 'rally') + button('1×', 'speed:1', matchSpeed === 1 ? 'active' : '') + button('2×', 'speed:2', matchSpeed === 2 ? 'active' : '') + button('Segmento', 'segments') + button('Tempo (' + (2 - (m.timeouts?.[side] || 0)) + ')', 'timeout', '', (m.timeouts?.[side] || 0) >= 2) + button('Tática', 'coach-pause') + button('Substituição', 'sub')}${button('Estatísticas', 'live-data')}${button(gymSound ? 'Som ligado' : 'Som desligado', 'sound')}</div><small>${m.done ? 'Partida encerrada' : timer ? 'EM JOGO' : 'PAUSADA'} ${m.done ? '' : '· Saque: ' + athleteLabel(activeSix(m, m.server).find(e => e.position === 0)?.player || m.teams[m.server][(6 - m.rotation[m.server]) % 6])}</small></div>${greatMomentOverlay(m)}${lastPoint(m)}${onCourt(m)}<div class="match-bottom">${liveStory(m)}<div class="recent-points">${m.events
    .slice(-5)
    .reverse()
    .map(e => {
      let notable = notableFeedLine(e, player);
      return `<span class="feed-line ${e.infraction ? 'feed-infraction' : ''}" title="Ponto de ${club([m.home, m.away][e.winner]).name}"><b>${e.score.join('–')}</b><em>${feedLine(e, player)}</em>${notable ? `<small class="feed-subline">${notable}</small>` : ''}</span>`;
    })
    .join(
      ''
    )}</div>${!m.done ? stateAssistantCue(m, side) || (items.length ? `<div class="assistant-cue"><small>AUXILIAR · ${items[0]?.kind || 'LEITURA'}</small><p>${items[0]?.title || 'Leitura em andamento'}${items[0] ? ': ' + items[0].detail : ''}</p>${button('Ver análise', 'coach-pause')}</div>` : '') : ''}</div></div>`;
}

function compareStats(m) {
  let a = matchStats(m, 0),
    b = matchStats(m, 1);
  return table(
    ['Indicador', club(m.home).short, club(m.away).short],
    [
      [
        'Virada de bola',
        benchmarkPct(a.sideout, a.received, 'sideout'),
        benchmarkPct(b.sideout, b.received, 'sideout')
      ],
      ['Conversão com saque', benchmarkPct(a.breaks, a.served, 'break'), benchmarkPct(b.breaks, b.served, 'break')],
      ['Aces', a.aces, b.aces],
      ['Erros de saque', a.serveErrors, b.serveErrors],
      ['Bloqueios ponto', a.blocks, b.blocks],
      [
        'Recepção positiva',
        benchmarkPct(a.positive, a.receptions, 'receive'),
        benchmarkPct(b.positive, b.receptions, 'receive')
      ],
      ['Erros que deram ponto', a.errorPoints, b.errorPoints],
      [
        'Ataque eficiente',
        benchmarkPct(a.kills - a.errors - a.blocked, a.attacks, 'efficiency'),
        benchmarkPct(b.kills - b.errors - b.blocked, b.attacks, 'efficiency')
      ]
    ].map(row => `<tr>${row.map(x => `<td>${x}</td>`).join('')}</tr>`)
  );
}
function dataContext() {
  let m = state.last,
    side = m?.home === state.club ? 0 : 1,
    events = dataMode === 'last' && m ? m.events || [] : totalEvents(),
    teamSide = dataMode === 'last' && m ? side : 0,
    setsPlayed =
      dataMode === 'last' && m
        ? m.setScores.length
        : state.results
            .filter(m => m.home === state.club || m.away === state.club)
            .reduce((n, m) => n + m.setScores.length, 0),
    s = dataMode === 'last' && m ? matchStats(m, side) : seasonStats(state.club);
  return { m, side, events, teamSide, setsPlayed, s };
}
function legacyData() {
  let { m, events, teamSide, setsPlayed, s } = dataContext(),
    attack = benchmarkPct(s.kills - s.errors - s.blocked, s.attacks, 'efficiency'),
    sideout = benchmarkPct(s.sideout, s.received, 'sideout'),
    brk = benchmarkPct(s.breaks, s.served, 'break'),
    receive = benchmarkPct(s.positive, s.receptions, 'receive'),
    reading = !events.length
      ? ''
      : s.receptions && s.positive / Math.max(1, s.receptions) < 0.42
        ? 'A primeira bola está limitando o desenho ofensivo. Vale comparar os passadores e o comportamento com o levantador no fundo.'
        : s.served && s.breaks / Math.max(1, s.served) < 0.33
          ? 'O time está dependendo demais da virada de bola. O saque ainda gera pouca ruptura.'
          : s.attacks && (s.kills - s.errors - s.blocked) / Math.max(1, s.attacks) < 0.22
            ? 'O volume ofensivo existe, mas a eficiência está devolvendo muitas bolas em erro ou bloqueio.'
            : 'O perfil está relativamente equilibrado. O próximo ganho tende a vir de rotações específicas e decisões situacionais.';
  return `${heading('Análises', 'Entenda o que o seu time está produzindo.', 'Primeiro a leitura. Depois, abra apenas os detalhes que ajudam a decidir.', button('Abrir ranking', 'ranking'))}<div class="data-mode-switch"><button data-data="season" class="${dataMode === 'season' ? 'active' : ''}">Temporada</button><button data-data="last" class="${dataMode === 'last' ? 'active' : ''}" ${!m ? 'disabled' : ''}>Última partida</button></div>${!events.length ? '<div class="panel empty"><h2>A leitura começa no primeiro saque.</h2><p>Depois da primeira partida, esta tela passa a mostrar identidade, eficiência e tendências do seu time.</p>' + button('Ir para a partida', 'match', 'primary') + '</div>' : `<section class="data-hero"><small>${dataMode === 'season' ? 'TEMPORADA' : 'ÚLTIMA PARTIDA'}</small><h2>${reading}</h2><div class="data-hero-kpis"><article><span>Ataque</span><strong>${attack}</strong><small>eficiência</small></article><article><span>Virada</span><strong>${sideout}</strong><small>side-out</small></article><article><span>Sacando</span><strong>${brk}</strong><small>break point</small></article><article><span>Recepção</span><strong>${receive}</strong><small>positiva</small></article></div></section>${dataMode === 'season' ? teamIdentityPanel() : ''}${setterStructurePanel(events, teamSide, { title: 'Onde o 5–1 ganha ou perde força' })}<div class="data-reading-note"><b>Próxima leitura</b><p>Abra as análises avançadas somente quando esta visão indicar uma diferença que precisa ser localizada.</p></div>`}`;
}
function advancedDataBasics() {
  let { events, teamSide, setsPlayed, s } = dataContext();
  if (!events.length) return '';
  return `<div class="advanced-stack"><div class="metrics">${metric('Aces por set', (s.aces / Math.max(1, setsPlayed)).toFixed(2), setsPlayed + ' sets')}${metric('Bloqueios por set', (s.blocks / Math.max(1, setsPlayed)).toFixed(2), 'Bloqueios ponto')}${metric('Erros por set', (s.errorPoints / Math.max(1, setsPlayed)).toFixed(2), 'Fundamento identificado')}</div><details class="subanalysis"><summary>R1–R6 · diagnóstico fino</summary><p class="muted">Abra somente quando a leitura levantador na rede × no fundo indicar uma diferença que precisa ser localizada.</p><div class="grid"><div class="panel"><div class="panelhead"><h2>Virada de bola por rotação</h2><small>AMOSTRA: ${s.rallies} PONTOS</small></div><div class="rotchart">${s.rotations.map(rr => `<div class="rotcol">${pct(rr.sideout, rr.received)}<i style="height:${rr.received ? (rr.sideout / rr.received) * 110 : 0}px"></i></div>`).join('')}</div><div class="rotlabels">${s.rotations.map((_, i) => `<span>R${i + 1}</span>`).join('')}</div></div><div class="panel"><h2>Leitura das rotações</h2>${table(
    ['Rot.', 'Pontos', 'Virada de bola', 'Conv. saque', 'Eficiência', 'Recepção +', 'Erros', 'Bloq.', 'Aces', 'Saldo'],
    s.rotations.map(
      (rr, i) =>
        `<tr><td>R${i + 1}</td><td>${rr.n}</td><td>${pct(rr.sideout, rr.received)}</td><td>${pct(rr.breaks, rr.served)}</td><td>${signedPct(rr.kills - rr.errors - rr.blocked, rr.attacks)}</td><td>${pct(rr.positive, rr.receptions)}</td><td>${rr.errorPoints}</td><td>${rr.blocks}</td><td>${rr.aces}</td><td class="${rr.points * 2 >= rr.n ? 'lime' : 'orange'}">${rr.points * 2 - rr.n > 0 ? '+' : ''}${rr.points * 2 - rr.n}</td></tr>`
    )
  )}</div></div></details><div class="panel"><div class="panelhead"><h2>Produção por atleta</h2><span class="pill">FUNÇÃO + PRODUÇÃO</span></div>${table(
    ['Atleta', 'Perfil', 'Pontos/set', 'Ataque%', 'Ataques', 'Eficiência', 'Recepção +', 'Aces', 'Bloq. ponto'],
    Object.entries(s.players).map(
      ([id, p]) =>
        `<tr><td><button class="btnsmall" data-player="${id}">${athleteLabel(player(id))}</button><small>${names[player(id).pos]}</small></td><td>${roleLabel(player(id))}</td><td>${((p.kills + p.aces + p.blocks) / Math.max(1, setsPlayed)).toFixed(2)}</td><td>${pct(p.kills, p.attacks)}</td><td>${p.attacks}</td><td class="lime">${signedPct(p.kills - p.errors - p.blocked, p.attacks)}</td><td>${pct(p.positive, p.receptions)} <small>n=${p.receptions}</small></td><td>${p.aces}</td><td>${p.blocks}</td></tr>`
    )
  )}</div></div>`;
}

function scout() {
  let list = state.all.filter(
    p =>
      p.club !== state.club &&
      (!filterPos || p.pos === filterPos) &&
      (!scoutClub || p.club === Number(scoutClub)) &&
      (!onlyObserved || state.observed.includes(p.id)) &&
      p.name.toLowerCase().includes(search.toLowerCase())
  );
  return `${heading('Central de scouting', 'Talento não é um número único.', 'Cruze desempenho, salário e informação incompleta antes de tirar conclusões.')}${scoutDiscovery()}<div class="filters"><input id="search" placeholder="Buscar atleta" aria-label="Buscar atleta"><select id="position" aria-label="Filtrar posição"><option value="">Todas as posições</option>${Object.entries(
    names
  )
    .map(([p, n]) => `<option value="${p}" ${filterPos === p ? 'selected' : ''}>${n}</option>`)
    .join(
      ''
    )}</select><select id="scoutclub" aria-label="Filtrar clube"><option value="">Todos os clubes</option>${clubs
    .filter(c => c.id !== state.club)
    .map(c => `<option value="${c.id}" ${scoutClub === String(c.id) ? 'selected' : ''}>${c.short}</option>`)
    .join(
      ''
    )}</select><button data-action="watchlist" class="${onlyObserved ? 'active' : ''}">Em observação (${state.observed.length})</button></div><div class="panel"><div class="panelhead"><h2>${list.length} atletas encontrados</h2><small>BASE EXPERIMENTAL</small></div>${table(
    [
      'Atleta',
      'Pos.',
      'Idade',
      'Overall estimado',
      'Ataque estimado',
      'Recepção estimada',
      'Eficiência',
      'Ataques (n)',
      'Salário/mês',
      'Observação'
    ],
    list.map(p => {
      let ss = seasonStats(p.club).players[p.id],
        k = state.scout[p.id] || 0;
      return `<tr><td><button data-player="${p.id}" class="btnsmall">${athleteLabel(p)}</button><small>${club(p.club).short}</small></td><td>${p.pos}</td><td>${p.age}</td><td>${estimate({ ...p, overall: overall(p) }, 'overall', k)}</td><td>${estimate(p, 'attack', k)}</td><td>${estimate(p, 'receive', k)}</td><td>${ss ? pct(ss.kills - ss.errors - ss.blocked, ss.attacks) : '—'}</td><td>${ss?.attacks || 0}</td><td>${money(p.salary)}</td><td><button class="btnsmall ${state.observed.includes(p.id) ? 'active' : ''}" data-watch="${p.id}">${state.observed.includes(p.id) ? 'Observando' : 'Observar +'}</button><small>${k} rodadas · ${Math.min(90, 40 + k * 8)}% confiança</small></td></tr>`;
    })
  )}${!list.length ? '<div class="empty">Nenhum atleta com esses filtros.</div>' : ''}</div><div class="note"><h3>A informação melhora com o acompanhamento</h3><p>Marque atletas para observação. A cada rodada concluída, a faixa de atributos fica mais estreita, mas continua sendo uma estimativa. Contratações, potencial oculto, V+ e ajustes entre divisões entram nas próximas etapas.</p></div>`;
}
function estimate(p, k, n) {
  let spread = Math.max(3, 12 - n * 2),
    bias = ((p.id * 7 + k.length * 3) % 9) - 4,
    center = p[k] + bias;
  return `${Math.max(1, center - spread)}–${Math.min(100, center + spread)}`;
}
function leagueTable(compact = false) {
  return table(
    compact
      ? ['#', 'Clube', 'J', 'Pts']
      : ['#', 'Clube', 'J', 'V', 'D', 'Pts', 'Sets +', 'Sets −', 'Pontos +', 'Pontos −'],
    standings().map(
      (r, i) =>
        `<tr class="${r.id === state.club ? 'mine' : ''}"><td class="${i === 0 ? 'lime' : ''}">${i + 1}</td><td><strong>${compact ? r.short : r.name}</strong></td><td>${r.games}</td>${compact ? '' : `<td>${r.wins}</td><td>${r.games - r.wins}</td>`}<td class="lime"><b>${r.points}</b></td>${compact ? '' : `<td>${r.sf}</td><td>${r.sa}</td><td>${r.pf}</td><td>${r.pa}</td>`}</tr>`
    )
  );
}
function league() {
  return `${heading('Temporada', 'O campeonato muda a cada rodada.', 'Tabela, forma, sequências, expectativas e histórias da liga.')}${seasonDashboard()}${developmentRosterPanel()}${state.round ? roundRecapPanel(state.round - 1, true) : ''}${seasonMemory()}<div class="panel"><div class="panelhead"><div><small>CLASSIFICAÇÃO</small><h2>Copa Laboratório</h2></div><span class="pill">14 RODADAS</span></div>${leagueTable()}<p class="formhint">3–0 ou 3–1: 3 pontos ao vencedor. 3–2: 2 ao vencedor e 1 ao perdedor. Desempate: vitórias, razão de sets e razão de pontos.</p></div><details class="season-calendar"><summary><span><b>Calendário completo</b><small>Resultados e próximas rodadas</small></span><strong>ABRIR</strong></summary><div class="grid">${fixtures
    .map(
      (pairs, i) =>
        `<div class="panel"><div class="panelhead"><h2>Rodada ${i + 1}</h2><span class="pill">${i < state.round ? 'CONCLUÍDA' : i === state.round ? 'PRÓXIMA' : 'PROGRAMADA'}</span></div>${pairs
          .map(([h, a]) => {
            let result = state.results.find(m => m.round === i && m.home === h && m.away === a);
            return `<div class="split spaced" style="padding:13px 0;border-bottom:1px solid var(--line);font-size:14px"><span>${club(h).short}</span><strong class="${result ? 'lime' : 'muted'}">${result ? result.sets.join(' × ') : '×'}</strong><span>${club(a).short}</span></div>`;
          })
          .join('')}</div>`
    )
    .join('')}</div></details>`;
}
function about() {
  return `${heading('Sobre o jogo', 'O que já está jogável e para onde o projeto está indo.', 'Uma base de teste para evoluir até um manager de vôlei cada vez mais profundo.')}<div class="grid"><div class="panel"><h2>O que já está jogável</h2><p>8 clubes e 112 atletas fictícios. Escalação 5–1, tática ajustável durante a partida, rotação do saque, desgaste, moral, entrosamento, 14 rodadas, observação de atletas e análise dos eventos.</p><h2>Como a partida funciona</h2><p>Saque → qualidade da recepção → escolha do atacante → ataque, bloqueio ou defesa → transição. Os sets vão a 25, o quinto a 15, sempre com dois pontos de diferença. Vence quem ganha três sets.</p><h2>Limites desta etapa</h2><p>Modelo probabilístico ainda sem calibração com dados reais. Substituições e pedidos de tempo usam regras simplificadas. Regras detalhadas de líbero, lesões, IA adaptativa, contratos e finanças operacionais ainda não estão implementadas. Treinadores fictícios têm perfis de intervenção. Notícias e destaques usam os eventos salvos. Não há simulação espacial da bola.</p></div><div class="panel"><h2>Diagnóstico da liga</h2><p>Simule 1.000 partidas independentes e examine a distribuição de resultados. O teste não altera sua campanha.</p>${button('Simular 1.000 partidas', 'lab', 'primary')}<div id="labresult" class="note"><p>Esses números servem como leitura interna da liga e não como validação esportiva definitiva.</p></div><hr style="border:0;border-top:1px solid var(--line);margin:24px 0"><h2>Seu jogo</h2><p>O progresso é salvo automaticamente em quatro camadas: carreira, partida ativa, resumos da temporada e detalhes das 3 partidas mais recentes. Se quiser levar a temporada para outro aparelho, salve uma cópia do jogo.</p><div class="storage-architecture"><span><b>CareerStore</b>carreira e elenco</span><span><b>ActiveMatch</b>partida atual</span><span><b>Summaries</b>temporada compacta</span><span><b>Recent Detail</b>3 jogos completos</span></div><div class="split">${button('Salvar uma cópia', 'export')}${button('Iniciar novo jogo', 'reset')}</div></div></div><div class="panel"><h2>Próximos passos do projeto</h2>${table(
    ['Etapa', 'Entrega', 'Estado'],
    [
      ['Protótipo', 'Partida + dados + decisões táticas', 'Jogável'],
      ['V17', 'Temporada viva: forma, trajetórias, histórias e memória', 'Jogável'],
      ['V17.1', 'Desenvolvimento, minutos e potencial oculto', 'Jogável'],
      ['V17.2', 'Mercado, contratos e montagem do elenco', 'Jogável']
    ].map(r => `<tr>${r.map(v => `<td>${v}</td>`).join('')}</tr>`)
  )}</div>`;
}
function showPlayer(id) {
  let p = player(id),
    own = p.club === state.club,
    k = state.scout[id] || 0;
  reportId = id;
  let d = $('#detail');
  d.innerHTML = `<div class="panelhead"><div><div class="eyebrow">${club(p.club).name}</div><h2 style="margin:0">${athleteLabel(p)}</h2></div><button id="close" aria-label="Fechar perfil">✕</button></div><p>${names[p.pos]} · ${heightLabel(p)} · Saque ${serveStyleLabel(p)} · ${p.age} anos</p><p class="muted">${p.fullName && p.fullName !== p.name ? p.fullName + ' · ' : ''}${p.originCity || '—'} / ${p.originState || '—'} · ${money(p.salary)}/mês</p>${playerNarrative(p)}${playerDossier(p)}${own ? developmentPlayerPanel(p) + contractPlayerPanel(p) : ''}<div class="attributes">${Object.entries(
    attrs
  )
    .map(
      ([key, label]) =>
        `<div class="attr"><div class="split spaced"><span>${label}</span><strong class="lime">${own ? p[key] : estimate(p, key, k)}</strong></div>${own ? `<div class="bar"><i style="width:${p[key]}%"></i></div>` : ''}</div>`
    )
    .join(
      ''
    )}</div><div class="note"><p>${own ? `Moral ${Math.round(p.morale)}% · Condição ${Math.round(p.condition)}% · Entrosamento ${Math.round(p.chemistry)}%.` : `${k} rodada(s) de observação. Intervalos são estimativas com margem de erro, não atributos exatos.`}</p></div>`;
  d.showModal();
  $('#close').onclick = () => d.close();
}

function recentClubResults(id, limit = 5) {
  return state.results.filter(m => m.home === id || m.away === id).slice(-limit);
}
function clubResult(m, id) {
  let side = m.home === id ? 0 : m.away === id ? 1 : -1;
  if (side < 0) return null;
  return {
    won: m.sets?.[side] === 3,
    setDiff: (m.sets?.[side] || 0) - (m.sets?.[1 - side] || 0),
    pointDiff: (m.setScores || []).reduce((n, s) => n + (s[side] - s[1 - side]), 0)
  };
}
function lineupStrength(id) {
  let ids = state.lines?.[id] || [],
    ps = ids.map(player).filter(Boolean);
  return ps.length ? ps.reduce((n, p) => n + overall(p), 0) / ps.length : 0;
}
function competitiveStateForClub(id, opponentId) {
  let roster = state.all.filter(p => p.club === id),
    avg = k => roster.reduce((n, p) => n + Number(p[k] || 0), 0) / Math.max(1, roster.length),
    recent = recentClubResults(id, 5),
    streak = 0;
  if (recent.length) {
    let last = clubResult(recent.at(-1), id),
      sign = last?.won ? 1 : -1;
    for (let i = recent.length - 1; i >= 0; i--) {
      let r = clubResult(recent[i], id);
      if (!r || (r.won ? 1 : -1) !== sign) break;
      streak += sign;
    }
  }
  let avgMorale = avg('morale'),
    baseConcentration = avg('mental') * 0.55 + avg('consistency') * 0.45,
    strengthGap = lineupStrength(id) - lineupStrength(opponentId),
    confidenceShift = streak > 0 ? Math.min(6, streak * 1.45) : streak < 0 ? -Math.min(8, Math.abs(streak) * 1.8) : 0,
    confidence = clamp(avgMorale + confidenceShift, 40, 96),
    pressure = clamp(
      streak < 0 ? Math.abs(streak) * 8 + Math.max(0, 68 - avgMorale) * 0.55 : Math.max(0, 60 - avgMorale) * 0.25,
      0,
      34
    ),
    complacency = streak >= 3 ? clamp((streak - 2) * 7 + Math.max(0, strengthGap) * 1.35, 0, 30) : 0,
    alert = streak < 0 ? Math.min(3.5, Math.abs(streak) * 1.0) : 0,
    concentration = clamp(baseConcentration - complacency * 0.4 - pressure * 0.1 + alert, 48, 96);
  return {
    confidence,
    concentration,
    pressure,
    complacency,
    streak,
    recentWins: recent.filter(m => clubResult(m, id)?.won).length,
    recentGames: recent.length
  };
}
function applyCompetitiveStateToMatch(m, pair) {
  if (!m || !Array.isArray(pair)) return m;
  let states = [competitiveStateForClub(m.home, m.away), competitiveStateForClub(m.away, m.home)];
  m.competitiveState = states;
  for (let side = 0; side < 2; side++) {
    let roster = m.teams[side],
      avgMorale = roster.reduce((n, p) => n + Number(p.morale || 75), 0) / Math.max(1, roster.length),
      shift = (states[side].confidence - avgMorale) * 0.55;
    roster.forEach(p => (p.confidence = clamp(Number(p.confidence ?? p.morale ?? 75) + shift, 35, 99)));
  }
  return m;
}
function start() {
  if (!my()) {
    view = 'home';
    render();
    notify('Escolha seu clube para iniciar.');
    return;
  }
  if (match && !match.done) {
    view = 'match';
    render();
    return;
  }
  let pair = next();
  if (!pair) {
    notify('Não há partida pendente.');
    return;
  }
  if (!validLine(state.lines[state.club], state.club)) {
    notify('Selecione seis titulares por função e um líbero.');
    return;
  }
  normalizeNextPlan();
  let matchRoster = preparedRosterForMatch(),
    aiPreparation = matchRoster.aiPreparation || null;
  match = createMatch(matchRoster, ...pair, state.lines, state.tactics, Math.floor(Math.random() * 4294967295));
  applyCompetitiveStateToMatch(match, pair);
  match.weekTraining = currentTraining() ? { ...currentTraining() } : null;
  match.aiPreparation = aiPreparation;
  match.aiSide = match.home === state.club ? 1 : 0;
  match.initialPlan = match.tactics.map(t => ({ ...t }));
  match.coaching = true;
  match.breakKind = 'opening';
  view = 'match';
  commit();
  render();
}
function restartCurrentMatch() {
  if (!match || match.done) {
    notify('Não há uma partida em andamento para reiniciar.');
    return;
  }
  if (
    !confirm(
      'Reiniciar esta partida? O placar, os rallies, tempos, substituições e ajustes feitos durante o jogo serão descartados. A rodada não avança.'
    )
  )
    return;
  stop();
  const pair = [match.home, match.away],
    seed = match.seed,
    initialPlans = (match.initialPlan || match.initialTactics || match.tactics).map(t => ({ ...t }));
  state.tactics[pair[0]] = { ...state.tactics[pair[0]], ...initialPlans[0] };
  state.tactics[pair[1]] = { ...state.tactics[pair[1]], ...initialPlans[1] };
  normalizeNextPlan();
  let matchRoster = preparedRosterForMatch(),
    aiPreparation = matchRoster.aiPreparation || null;
  match = createMatch(matchRoster, ...pair, state.lines, state.tactics, seed);
  applyCompetitiveStateToMatch(match, pair);
  match.weekTraining = currentTraining() ? { ...currentTraining() } : null;
  match.aiPreparation = aiPreparation;
  match.aiSide = match.home === state.club ? 1 : 0;
  match.initialPlan = initialPlans.map(t => ({ ...t }));
  match.coaching = true;
  match.breakKind = 'opening';
  benchTab = 'analyst';
  benchPage = 0;
  postGameTab = 'summary';
  view = 'match';
  commit('critical');
  render();
  notify('Partida reiniciada do 0–0. Escalação, plano pré-jogo e mesma semente de simulação foram preservados.');
}
function complete() {
  if (!match?.done || match.recorded) return;
  match.recorded = true;
  let round = state.round;
  match.round = round;
  let aiFull = [],
    otherPairs = fixtures[round].filter(pair => !pair.includes(state.club));
  for (let j = 0; j < otherPairs.length; j++) {
    let pair = otherPairs[j],
      ai = createMatch(state.all, ...pair, state.lines, state.tactics, (match.seed + 6713 * (j + 1)) >>> 0);
    applyCompetitiveStateToMatch(ai, pair);
    ai = finish(ai, state.all);
    ai.round = round;
    aiFull.push(ai);
  }
  let roundMatches = [match, ...aiFull];
  for (let m of roundMatches) {
    let winner = m.sets[0] > m.sets[1] ? 0 : 1;
    m.teams.forEach((team, side) =>
      [...team, ...Object.values(m.bench || {}).filter(p => p.club === [m.home, m.away][side])].forEach(p => {
        let pp = player(p.id);
        pp.condition = Math.min(100, p.condition + 7);
        pp.morale = Math.max(35, Math.min(99, pp.morale + (side === winner ? 3 : -3)));
        pp.chemistry = Math.min(99, pp.chemistry + 1);
      })
    );
  }
  let used = new Set(roundMatches.flatMap(m => [...m.teams.flat(), ...Object.values(m.bench || {})].map(p => p.id)));
  state.all.filter(p => !used.has(p.id)).forEach(p => (p.condition = Math.min(100, p.condition + 8)));
  applyRoundDevelopment(roundMatches, round);
  applyAiBackgroundTraining(round);
  state.results.push(match, ...aiFull.map(compactMatchSummary));
  pruneRecentDetails();
  state.observed.forEach(id => (state.scout[id] = (state.scout[id] || 0) + 1));
  state.round++;
  state.trained = false;
  state.last = match;
  stop();
  commit('critical');
}
function stop() {
  clearInterval(timer);
  timer = null;
  clearTimeout(greatMomentResumeTimer);
  greatMomentResumeTimer = null;
}
function one() {
  if (!match || match.done || match.breakKind || needsTalk(match)) return;
  let activeMoment =
    match.momentOverlayIndex != null && Date.now() < (match.momentOverlayUntil || 0)
      ? match.events.find(e => e.index === match.momentOverlayIndex)
      : null;
  if (activeMoment?.greatMoment && !simulating) return;
  let before = match.setScores.length,
    wasAuto = !!timer;
  coachDecision(match, state.all, match.home === state.club ? 1 : 0);
  rally(match);
  let latest = match.events.at(-1),
    momentHold = !simulating ? scheduleMomentOverlay(latest) : 0;
  if (!simulating) playGymEvent(match);
  if (match.done) {
    postGameTab = 'summary';
    complete();
  } else if (match.setScores.length > before) {
    match.breakKind = 'set';
    match.coaching = true;
    benchTab = 'setstory';
    benchPage = 0;
    stop();
    notify('Fim do set. Entenda o que aconteceu e ajuste antes do próximo saque.');
  } else if (latest?.greatMoment && wasAuto && !simulating) {
    stop();
    match.greatMomentHold = latest.index;
    let hold = momentHold || momentHoldDuration(latest);
    greatMomentResumeTimer = setTimeout(() => {
      if (match && !match.done && !match.breakKind && match.greatMomentHold === latest.index) {
        delete match.greatMomentHold;
        greatMomentResumeTimer = null;
        timer = setInterval(() => {
          one();
          renderMatchTick();
        }, 1800 / matchSpeed);
        render();
      }
    }, hold + 220);
  } else if (checkInterval(match)) {
    stop();
    match.coaching = true;
    match.breakKind = 'technical';
    notify('Intervalo técnico. Confira o diagnóstico do set.');
  } else if (matchContext(match).act === 'closing') {
    stop();
    if (matchContext(match).level === 'Crítica' && match.closingAlertSet !== match.setScores.length + 1) {
      match.closingAlertSet = match.setScores.length + 1;
      match.coaching = true;
      match.breakKind = 'highlight';
      notify('Ponto decisivo. Revise o plano e avance rally a rally.');
    }
  } else if (matchContext(match).act === 'adjust' && timer && !simulating) {
    let story = matchStories(match, state.all).find(s => s.index === match.events.length && s.importance >= 4);
    if (story) notify('Leitura do auxiliar: ' + story.title + '.');
  }
  commit(match?.done || match?.breakKind ? 'critical' : 'rally');
}
function portableSave() {
  return persistenceSnapshot();
}
function download(obj, name) {
  let u = URL.createObjectURL(new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' })),
    a = document.createElement('a');
  a.href = u;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(u), 1000);
}
function bind() {
  document.querySelectorAll('[data-view]').forEach(
    e =>
      (e.onclick = () => {
        if (simulating) return;
        stop();
        if (match?.done) match = null;
        view = e.dataset.view;
        render();
      })
  );
  document.querySelectorAll('[data-club]').forEach(
    e =>
      (e.onclick = () => {
        state.club = Number(e.dataset.club);
        ensureMarketState(state);
        commit();
        render();
      })
  );
  document.querySelectorAll('[data-action]').forEach(
    e =>
      (e.onclick = () => {
        try {
          action(e.dataset.action);
        } catch (err) {
          console.error('Falha no botão', e.dataset.action, err);
          notify('Esse comando encontrou um erro. O restante do jogo continua disponível.');
        }
      })
  );
  document.querySelectorAll('[data-player]').forEach(e => (e.onclick = () => showPlayer(Number(e.dataset.player))));
  document.querySelectorAll('[data-watch]').forEach(
    e =>
      (e.onclick = () => {
        let id = Number(e.dataset.watch);
        state.observed = state.observed.includes(id) ? state.observed.filter(x => x !== id) : [...state.observed, id];
        commit();
        render();
      })
  );
  document.querySelectorAll('[data-data]').forEach(
    e =>
      (e.onclick = () => {
        dataMode = e.dataset.data;
        render();
      })
  );
  document.querySelectorAll('[data-ranking-scope]').forEach(
    e =>
      (e.onclick = () => {
        rankingScope = e.dataset.rankingScope;
        render();
      })
  );
  document.querySelectorAll('[data-ranking-team-source]').forEach(
    e =>
      (e.onclick = () => {
        rankingTeamSource = e.dataset.rankingTeamSource;
        render();
      })
  );
  document.querySelectorAll('[data-ranking-player-source]').forEach(
    e =>
      (e.onclick = () => {
        rankingPlayerSource = e.dataset.rankingPlayerSource;
        render();
      })
  );
  document.querySelectorAll('[data-ranking-team-metric]').forEach(
    e =>
      (e.onclick = () => {
        rankingTeamMetric = e.dataset.rankingTeamMetric;
        render();
      })
  );
  document.querySelectorAll('[data-ranking-player-metric]').forEach(
    e =>
      (e.onclick = () => {
        rankingPlayerMetric = e.dataset.rankingPlayerMetric;
        render();
      })
  );
  if ($('#ranking-position'))
    $('#ranking-position').onchange = e => {
      rankingPlayerPos = e.target.value;
      render();
    };
  document.querySelectorAll('[data-slot]').forEach(
    e =>
      (e.onchange = () => {
        let ids = state.lines[state.club],
          slot = Number(e.dataset.slot),
          id = Number(e.value),
          old = ids[slot],
          other = ids.indexOf(id);
        if (other !== -1) ids[other] = old;
        ids[slot] = id;
        commit();
        render();
        notify('Escalação atualizada.');
      })
  );
  document.querySelectorAll('[data-tactic]').forEach(
    e =>
      (e.onchange = () => {
        let k = e.dataset.tactic;
        state.tactics[state.club][k] = e.value;
        if (match && !match.done) {
          let side = match.home === state.club ? 0 : 1;
          match.decisions ??= [];
          match.decisions.push({
            type: 'tactic',
            set: match.setScores.length + 1,
            rally: match.events.length,
            side,
            key: k,
            from: match.tactics[side][k] || 'none',
            to: e.value
          });
          match.tactics[side][k] = e.value;
          if (['distribution', 'block', 'defense'].includes(k)) clearAssistantPlan(match, side, k);
        }
        commit();
        notify('Tática atualizada.');
      })
  );
  document.querySelectorAll('[data-week-plan]').forEach(
    e =>
      (e.onchange = () => {
        ensureTrainingState(state);
        state.weekPlan[e.dataset.weekPlan] = e.value;
        commit();
        render();
      })
  );
  if ($('#search')) {
    $('#search').value = search;
    $('#search').oninput = e => {
      let pos = e.target.selectionStart;
      search = e.target.value;
      render();
      $('#search').focus();
      $('#search').setSelectionRange(pos, pos);
    };
    $('#position').onchange = e => {
      filterPos = e.target.value;
      render();
    };
    $('#scoutclub').onchange = e => {
      scoutClub = e.target.value;
      render();
    };
  }
  $('#import').onchange = importGame;
}
function validateSave(v) {
  if (
    v?.version !== 1 ||
    !Array.isArray(v.all) ||
    v.all.length !== clubs.length * 14 ||
    !Number.isInteger(v.round) ||
    v.round < 0 ||
    v.round > fixtures.length ||
    !((v.club === null && v.round === 0) || clubs.some(c => c.id === v.club)) ||
    !Array.isArray(v.results) ||
    v.results.length !== v.round * fixtures[0].length ||
    !Array.isArray(v.observed) ||
    !v.scout
  )
    return false;
  let ids = new Set();
  for (let p of v.all) {
    if (
      !Number.isInteger(p.id) ||
      p.id < 0 ||
      p.id >= clubs.length * 14 ||
      ids.has(p.id) ||
      !clubs.some(c => c.id === p.club) ||
      !Object.keys(names).includes(p.pos) ||
      typeof p.name !== 'string' ||
      !/^[\p{L} .'-]{1,70}$/u.test(p.name)
    )
      return false;
    ids.add(p.id);
    for (let k of [...Object.keys(attrs), 'condition', 'morale', 'chemistry'])
      if (!Number.isFinite(p[k]) || p[k] < 0 || p[k] > 100) return false;
    if (!Number.isFinite(p.salary) || p.salary < 0 || !Number.isFinite(p.age)) return false;
  }
  for (let p of v.all)
    if (p.height_cm !== undefined && (!Number.isInteger(p.height_cm) || p.height_cm < 170 || p.height_cm > 220))
      return false;
  for (let t of [...Object.values(v.tactics || {}), ...(v.active?.tactics || [])])
    if (t.protect !== undefined && !['none', 'libero'].includes(t.protect) && !/^player:\d+$/.test(t.protect))
      return false;
  for (let c of clubs) {
    let l = v.lines?.[c.id],
      t = v.tactics?.[c.id];
    if (
      !Array.isArray(l) ||
      l.length !== 7 ||
      new Set(l).size !== 7 ||
      l.some((id, i) => !v.all.some(p => p.id === id && p.club === c.id && p.pos === POS[i]))
    )
      return false;
    for (let [k, opts] of Object.entries({
      serve: ['safe', 'balanced', 'selective', 'aggressive'],
      distribution: ['balanced', 'middle', 'opposite', 'wings'],
      target: ['weak', 'mixed', 'libero'],
      block: ['read', 'opposite', 'middle', 'wings'],
      pace: ['balanced', 'fast', 'control']
    }))
      if (!opts.includes(t?.[k]) && !(['target', 'block'].includes(k) && /^player:\d+$/.test(t?.[k]))) return false;
  }
  for (let m of v.results) {
    if (
      !m.done ||
      !clubs.some(c => c.id === m.home) ||
      !clubs.some(c => c.id === m.away) ||
      !Array.isArray(m.events) ||
      m.events.length > 10000 ||
      !Array.isArray(m.sets) ||
      Math.max(...m.sets) !== 3
    )
      return false;
    if (
      !Array.isArray(m.setScores) ||
      m.setScores.length > 5 ||
      m.setScores.some(
        s => !Array.isArray(s) || s.length !== 2 || s.some(n => !Number.isInteger(n) || n < 0 || n > 10000)
      ) ||
      !Array.isArray(m.teams) ||
      m.teams.length !== 2 ||
      m.teams.some(
        t =>
          !Array.isArray(t) ||
          t.length !== 7 ||
          t.some(
            p =>
              !ids.has(p.id) ||
              !Number.isFinite(p.condition) ||
              typeof p.name !== 'string' ||
              !/^[\p{L} .'-]{1,70}$/u.test(p.name)
          )
      )
    )
      return false;
    for (let e of m.events) {
      if (
        !ids.has(e.actor) ||
        ![
          'Erro de saque',
          'Infração de saque',
          'Ace',
          'Ataque para fora',
          'Bloqueio ponto',
          'Ponto de ataque',
          'Infração',
          'Erro de defesa'
        ].includes(e.reason) ||
        !Number.isInteger(e.set) ||
        !Array.isArray(e.score) ||
        e.score.length !== 2 ||
        e.score.some(n => !Number.isInteger(n) || n < 0 || n > 10000) ||
        !Array.isArray(e.rotation) ||
        e.rotation.length !== 2 ||
        e.rotation.some(n => !Number.isInteger(n) || n < 0 || n > 5)
      )
        return false;
      if (
        ![0, 1].includes(e.winner) ||
        ![0, 1].includes(e.serving) ||
        !Array.isArray(e.steps) ||
        e.steps.some(s => !ids.has(s.player) || ![0, 1].includes(s.team))
      )
        return false;
    }
  }
  for (let r = 0; r < v.round; r++) {
    let games = v.results.filter(m => m.round === r);
    if (
      games.length !== fixtures[r].length ||
      fixtures[r].some(([h, a]) => games.filter(m => m.home === h && m.away === a).length !== 1)
    )
      return false;
  }
  if (v.active && !validActive(v.active, v)) return false;
  return true;
}
const escapeHtml = s =>
  String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const UNTRUSTED_TEXT_KEYS = new Set([
  'name',
  'fullName',
  'originCity',
  'originState',
  'archetype',
  'legacyTitle',
  'legacyNote'
]);
function sanitizeImportedText(node) {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) {
    for (const item of node) sanitizeImportedText(item);
    return;
  }
  for (const key of Object.keys(node)) {
    const value = node[key];
    if (UNTRUSTED_TEXT_KEYS.has(key) && typeof value === 'string') node[key] = escapeHtml(value);
    else if (value && typeof value === 'object') sanitizeImportedText(value);
  }
}
async function importGame(e) {
  let f = e.target.files[0];
  if (!f) return;
  if (f.size > 25000000) {
    notify('Arquivo muito grande. Limite: 25 MB.');
    return;
  }
  try {
    let v = JSON.parse(await f.text()),
      active = null;
    if (v?.format === 'vmb-save-v4' && v.career && Array.isArray(v.summaries)) {
      sanitizeImportedText(v);
      let dm = new Map((v.details || []).map(x => [x.id, x.match]));
      state = { ...v.career, results: v.summaries.map(m => dm.get(m.id || matchStoreId(m)) || m) };
      active = v.active || null;
    } else {
      if (!validateSave(v)) throw Error();
      state = v;
      active = v.active || null;
      loadedFromLegacy = true;
    }
    if (!confirm('Substituir o progresso deste navegador pelo jogo importado?')) return;
    stop();
    state = syncCanonicalRoster(state);
    active = syncCanonicalActiveMatch(active);
    migrateHeights(state);
    ensureAiTeamStyles(state);
    ensureTrainingState(state);
    ensureMarketState(state);
    ensureDevelopmentState(state);
    state.storageSchema = 4;
    pruneRecentDetails();
    state.last = state.results.filter(m => m.home === state.club || m.away === state.club).at(-1) || null;
    match = active;
    view = match ? 'match' : 'home';
    commit('critical');
    render();
    notify('Jogo carregado.');
  } catch (err) {
    console.error(err);
    notify('Arquivo inválido ou incompatível com este protótipo.');
  }
}
function action(a) {
  if (simulating) return;
  if (a.startsWith('formation-pick:')) {
    formationPicker(Number(a.slice(15)));
    return;
  }
  if (a.startsWith('formation-set:')) {
    let [, slotRaw, idRaw] = a.split(':'),
      slot = Number(slotRaw),
      id = Number(idRaw),
      ids = state.lines[state.club],
      old = ids[slot],
      other = ids.indexOf(id);
    if (other !== -1) ids[other] = old;
    ids[slot] = id;
    let d = $('#detail');
    if (d?.open) d.close();
    commit();
    render();
    notify('Formação atualizada.');
    return;
  }
  if (a === 'mobile-court') {
    return;
  }
  if (a === 'market') {
    stop();
    if (match?.done) match = null;
    view = 'market';
    render();
    return;
  }
  if (a === 'mobile-more') {
    stop();
    let live = match && !match.done,
      liveRestart = live ? button('Reiniciar partida', 'restart-match', 'restart-match-button') : '',
      liveTools = live
        ? button('Dados ao vivo', 'live-data') + button(gymSound ? 'Desligar som' : 'Ativar som', 'sound')
        : '';
    let body =
      '<div class="mobile-more-grid">' +
      liveTools +
      button('Mercado', 'market') +
      button('Análises', 'data') +
      button('Observação', 'scout') +
      button('Temporada', 'league') +
      button('Sobre o jogo', 'about') +
      '</div><div class="mobile-more-secondary friendly-actions"><span class="pill">' +
      saveLabel() +
      '</span><p class="menu-help">Seu progresso já fica salvo automaticamente neste aparelho.</p>' +
      liveRestart +
      button('Salvar uma cópia', 'export') +
      button('Carregar jogo', 'import') +
      button('Iniciar novo jogo', 'reset') +
      '</div>';
    openDialog('Meu jogo', body);
    bind();
    return;
  }
  if (a === 'mobile-coach:tactics' || a === 'mobile-coach:analyst') {
    if (!match || match.done) return;
    stop();
    benchReview(match);
    benchTab = a.endsWith('tactics') ? 'tactics' : 'analyst';
    benchPage = 0;
    match.coaching = true;
    commit();
    render();
    return;
  }
  if (a.startsWith('post-tab:')) {
    postGameTab = a.slice(9);
    reportDialog(match?.done ? match : state.last || match);
    return;
  }
  if (a === 'final-talk') {
    if (match?.done && !match.finalTalk) finalTalkDialog(match);
    return;
  }
  if (a.startsWith('final-talk-choice:')) {
    applyFinalTalk(Number(a.slice(18)));
    return;
  }
  if (a === 'end-match') {
    if (match?.done && !match.finalTalk) {
      finalTalkDialog(match);
      notify('Escolha a mensagem final antes de sair do vestiário.');
      return;
    }
    stop();
    match = null;
    view = 'home';
    commit();
    render();
    notify(
      next()
        ? 'Rodada concluída. A temporada mudou — veja o pulso antes do próximo jogo.'
        : 'Temporada encerrada. Confira a classificação e a memória da campanha.'
    );
    return;
  }
  if (a === 'set-adjust') {
    benchTab = 'tactics';
    benchPage = 0;
    render();
    return;
  }
  if (a === 'set-next') {
    benchTab = needsTalk(match) ? 'talk' : 'analyst';
    benchPage = 0;
    render();
    return;
  }
  if (a.startsWith('state-protect:')) {
    let id = Number(a.slice(14)),
      side = match.home === state.club ? 0 : 1,
      from = match.tactics[side].protect,
      to = 'player:' + id;
    match.tactics[side].protect = to;
    match.decisions.push({
      type: 'tactic',
      side,
      key: 'protect',
      from,
      to,
      set: match.setScores.length + 1,
      rally: match.events.length,
      reason: 'assistant-player-state'
    });
    commit();
    render();
    notify('Recepção ajustada para proteger o passador.');
    return;
  }
  if (a === 'state-middle') {
    let side = match.home === state.club ? 0 : 1,
      from = match.tactics[side].distribution,
      set = match.setScores.length + 1,
      item = {
        key: 'distribution',
        value: 'middle',
        title: 'Voltar a usar o meio',
        detail:
          'Distribuição ajustada para priorizar os centrais. Vamos sustentar a hipótese antes de pedir uma nova mudança de distribuição.'
      };
    match.tactics[side].distribution = 'middle';
    startAssistantPlan(match, side, item, 'assistant-player-state');
    match.decisions.push({
      type: 'tactic',
      side,
      key: 'distribution',
      from,
      to: 'middle',
      set,
      rally: match.events.length,
      reason: 'assistant-player-state'
    });
    commit();
    render();
    return;
  }
  if (a.startsWith('state-target:')) {
    let id = Number(a.slice(13)),
      side = match.home === state.club ? 0 : 1,
      from = match.tactics[side].target,
      to = 'player:' + id;
    match.tactics[side].target = to;
    clearAssistantPlan(match, side, 'target');
    match.decisions.push({
      type: 'tactic',
      side,
      key: 'target',
      from,
      to,
      set: match.setScores.length + 1,
      rally: match.events.length,
      reason: 'assistant-opponent-reaction'
    });
    commit();
    render();
    notify('Alvo do saque atualizado após a reação adversária.');
    return;
  }
  if (a.startsWith('bench-tab:')) {
    if (!match || match.done) return;
    benchReview(match);
    benchTab = a.slice(10);
    benchPage = 0;
    render();
    return;
  }
  if (a.startsWith('bench-page:')) {
    if (!match || match.done) return;
    benchReview(match);
    benchPage = Number(a.slice(11));
    render();
    return;
  }
  if (a.startsWith('bench-accept:')) {
    respondAdvice(Number(a.slice(13)), true);
    return;
  }
  if (a.startsWith('bench-decline:')) {
    respondAdvice(Number(a.slice(14)), false);
    return;
  }
  if (a === 'restart-match') {
    restartCurrentMatch();
    return;
  }
  if (a === 'restart-test') {
    restartTest();
    return;
  }
  if (a === 'export-backup') {
    dbRead(BACKUP_ID)
      .then(backup => {
        if (backup?.state) download(backup.state, 'volley-manager-antes-do-reinicio.json');
        else notify('Nenhum reinício registrado neste navegador.');
      })
      .catch(() => notify('Não foi possível ler o backup anterior.'));
    return;
  }
  if (a.startsWith('court-sub:')) {
    subDialog(Number(a.slice(10)));
    return;
  }
  if (a.startsWith('court-action:')) {
    courtActions(Number(a.slice(13)));
    return;
  }
  if (a.startsWith('court-tactic:')) {
    let [, key, value] = a.split(':');
    let side = match.home === state.club ? 0 : 1;
    let from = match.tactics[side][key];
    match.tactics[side][key] = value;
    if (['distribution', 'block'].includes(key)) clearAssistantPlan(match, side, key);
    match.decisions.push({
      type: 'tactic',
      side,
      key,
      from,
      to: value,
      set: match.setScores.length + 1,
      rally: match.events.length
    });
    commit();
    render();
    return;
  }
  if (a === 'sound') {
    toggleGymSound();
    return;
  }
  if (a.startsWith('speed:')) {
    matchSpeed = Number(a.slice(6)) === 2 ? 2 : 1;
    if (timer) {
      stop();
      timer = setInterval(() => {
        one();
        renderMatchTick();
      }, 1800 / matchSpeed);
    }
    render();
    return;
  }
  if (a === 'segments') {
    stop();
    render();
    openDialog(
      'Avançar segmento',
      matchContext(match).act === 'closing'
        ? '<p>Fechamento: acompanhe cada ponto.</p>' + button('Próximo rally', 'rally')
        : button('3 pontos', 'three') + button('5 pontos', 'five') + button('Até o fechamento', 'set')
    );
    bind();
    return;
  }
  if (a === 'overlay-close') {
    match.coaching = false;
    commit();
    render();
    return;
  }
  if (a.startsWith('talk:')) {
    giveTalk(a.slice(5));
    return;
  }
  if (a === 'initial-plan') {
    applyInitialPlan();
    return;
  }
  if (['rally', 'play', 'three', 'five', 'set', 'finish'].includes(a) && needsTalk(match)) {
    match.coaching = true;
    render();
    notify(
      match?.breakKind === 'opening'
        ? 'Escolha a fala pré-jogo antes de iniciar.'
        : 'Escolha a palestra antes do próximo saque.'
    );
    return;
  }
  if (a.startsWith('advice:')) {
    applyAdvice(Number(a.slice(7)));
    return;
  }
  if (a.startsWith('set-report:')) {
    stop();
    let m = activeMatch();
    if (!m) return;
    if (!m.done) m.coaching = true;
    render();
    openDialog('Análise do set', setAnalysis(m, Number(a.slice(11))));
    return;
  }
  if (a.startsWith('history:')) {
    let m = state.results[Number(a.slice(8))];
    if (m) {
      stop();
      render();
      reportDialog(m);
    }
    return;
  }
  if (a === 'memory') {
    stop();
    render();
    openDialog('Memória da campanha', seasonMemory(true));
    bindDialogHistory();
    return;
  }
  if (a === 'round-recap') {
    stop();
    render();
    openDialog('A rodada mudou a temporada', roundRecapPanel(state.round - 1, true));
    bind();
    return;
  }
  if (a === 'development-report') {
    stop();
    openDialog('Desenvolvimento do elenco', developmentReport());
    bind();
    return;
  }
  if (a.startsWith('market-negotiate:')) {
    stop();
    marketNegotiationDialog(Number(a.split(':')[1]), false);
    return;
  }
  if (a.startsWith('renew-negotiate:')) {
    stop();
    marketNegotiationDialog(Number(a.split(':')[1]), true);
    return;
  }
  if (a.startsWith('market-sign:')) {
    let [, id, years] = a.split(':');
    signFreeAgent(Number(id), Number(years));
    return;
  }
  if (a.startsWith('contract-renew:')) {
    let [, id, years] = a.split(':');
    renewContract(Number(id), Number(years));
    return;
  }
  if (['home', 'squad', 'match', 'data', 'ranking', 'scout', 'league', 'about'].includes(a)) {
    stop();
    if (match?.done) match = null;
    view = a;
    render();
    return;
  }
  if (a === 'start') {
    start();
    return;
  }
  if (a === 'coach-pause') {
    stop();
    match.coaching = true;
    commit();
    render();
    return;
  }
  if (a === 'rally') {
    resumeMatch();
    one();
    render();
  }
  if (a === 'play') {
    if (!match || match.done) return;
    if (matchContext(match).act === 'closing') {
      resumeMatch();
      one();
      render();
      return;
    }
    if (timer) {
      stop();
      match.coaching = true;
      commit();
    } else {
      resumeMatch();
      timer = setInterval(() => {
        one();
        renderMatchTick();
      }, 1800 / matchSpeed);
    }
    render();
  }
  if (a === 'finish') simulate('match');
  if (a === 'three') simulate('three');
  if (a === 'five') simulate('five');
  if (a === 'set') simulate('set');
  if (a === 'sub') subDialog();
  if (a === 'timeout') timeoutDialog();
  if (a === 'report') {
    stop();
    postGameTab = 'summary';
    reportDialog(match?.done ? match : state.last || match);
    return;
  }
  if (a === 'live-data') {
    stop();
    render();
    openDialog(
      'Dados ao vivo',
      compareStats(match) +
        settingContext(match) +
        setAnalysis(
          match,
          match.breakKind === 'set' || match.done ? match.setScores.length : match.setScores.length + 1
        ) +
        liveRatings(match)
    );
  }
  if (a === 'advance') {
    stop();
    if (match && !match.done) {
      notify('Conclua a partida antes de avançar.');
      return;
    }
    match = null;
    view = 'home';
    commit();
    render();
    notify(next() ? 'Próxima rodada disponível.' : 'Competição encerrada. Confira a classificação.');
  }
  if (a === 'last') {
    match = state.last;
    render();
  }
  if (a === 'rest' || a === 'train') {
    if (state.trained || !next() || (match && !match.done)) return;
    state.all
      .filter(p => p.club === state.club)
      .forEach(p => {
        p.condition = Math.min(100, Math.max(1, p.condition + (a === 'rest' ? 8 : -3)));
        if (a === 'train') p.chemistry = Math.min(99, p.chemistry + 4);
      });
    state.trained = true;
    commit();
    render();
    notify(a === 'rest' ? 'Elenco recuperado para a rodada.' : 'Treino concluído. Entrosamento melhorou.');
  }
  if (a === 'week-train') {
    applyWeeklyTraining();
    return;
  }
  if (a === 'watchlist') {
    onlyObserved = !onlyObserved;
    render();
  }
  if (a === 'export') {
    save();
    download(portableSave(), 'volley-manager-jogo-v4.json');
    notify('Cópia do jogo salva com o progresso atual.');
  }
  if (a === 'events') {
    let ev = dataMode === 'last' ? state.last?.events || [] : totalEvents();
    download(ev, 'volley-manager-eventos.json');
  }
  if (a === 'import') $('#import').click();
  if (a === 'reset') {
    if (confirm('Iniciar um novo jogo? Se quiser manter a temporada atual, salve uma cópia antes.')) {
      stop();
      state = fresh();
      match = null;
      view = 'home';
      commit();
      render();
      notify('Novo jogo iniciado.');
    }
  }
  if (a === 'lab') runLab();
}
function runLab() {
  let b = document.querySelector('[data-action="lab"]');
  b.disabled = true;
  b.textContent = 'Simulando…';
  setTimeout(() => {
    try {
      let all = players(),
        lines = Object.fromEntries(clubs.map(c => [c.id, lineup(all, c.id)])),
        tactics = Object.fromEntries(clubs.map(c => [c.id, defaultTactics()])),
        dist = [0, 0, 0],
        homeWins = 0,
        count = 0,
        pairs = fixtures.slice(0, 7).flat();
      for (let i = 0; i < 1000; i++) {
        let [h, a] = pairs[i % pairs.length],
          m = finish(createMatch(all, h, a, lines, tactics, 8000 + i * 7919), all);
        dist[Math.min(...m.sets)]++;
        homeWins += m.sets[0] === 3 ? 1 : 0;
        count += m.events.length;
      }
      $('#labresult').innerHTML =
        `<h3>1.000 partidas concluídas</h3><p>3–0: ${dist[0]} · 3–1: ${dist[1]} · 3–2: ${dist[2]}<br>Mandantes: ${pct(homeWins, 1000)} de vitórias<br>Média de rallies: ${Math.round(count / 1000)}<br>A amostra percorre os 28 confrontos diferentes da liga.</p>`;
    } catch (e) {
      console.error(e);
      $('#labresult').textContent = 'A simulação encontrou um erro de consistência.';
    }
    b.disabled = false;
    b.textContent = 'Simular 1.000 partidas';
  }, 30);
}
render();
if (loadError)
  notify('O jogo abriu em modo seguro porque o save anterior não pôde ser lido. Você pode importar uma cópia.');

function overall(p) {
  let keys = {
    LEV: ['set', 'defense', 'serve'],
    PON: ['attack', 'receive', 'serve'],
    CEN: ['attack', 'block'],
    OPO: ['attack', 'serve', 'block'],
    LIB: ['receive', 'defense']
  }[p.pos];
  return Math.round(keys.reduce((a, k) => a + p[k], 0) / keys.length);
}
function validLine(ids, id) {
  return (
    Array.isArray(ids) &&
    ids.length === 7 &&
    new Set(ids).size === 7 &&
    ids.every((pid, i) => state.all.some(p => p.id === pid && p.club === id && p.pos === POS[i]))
  );
}
function signedPct(a, b) {
  if (!b) return '—';
  let n = Math.round((a / b) * 100);
  return (n > 0 ? '+' : '') + n + '%';
}
function setterIsFront(e, side) {
  return [1, 2, 3].includes(e.rotation?.[side] ?? 0);
}
function setterStructure(events, side) {
  let split = { front: [], back: [] };
  for (let e of events) split[setterIsFront(e, side) ? 'front' : 'back'].push(e);
  let read = ev => {
    let own = stats(ev, side),
      opp = stats(ev, 1 - side),
      middle = ev
        .flatMap(e => e.steps || [])
        .filter(
          s => s.team === side && s.type === 'attack' && s.outcome !== 'cancelled' && player(s.player)?.pos === 'CEN'
        ).length;
    return {
      rallies: ev.length,
      attacks: own.attacks,
      kills: own.kills,
      errors: own.errors,
      blocked: own.blocked,
      attackConv: own.attacks ? own.kills / own.attacks : null,
      attackEff: own.attacks ? (own.kills - own.errors - own.blocked) / own.attacks : null,
      blocks: own.blocks,
      oppAttacks: opp.attacks,
      blockRate: opp.attacks ? own.blocks / opp.attacks : null,
      middleShare: own.attacks ? middle / own.attacks : null,
      sideout: own.received ? own.sideout / own.received : null
    };
  };
  return { front: read(split.front), back: read(split.back) };
}
function leagueSetterStructure() {
  let sums = {
    front: { attacks: 0, kills: 0, errors: 0, blocked: 0, blocks: 0, oppAttacks: 0, rallies: 0 },
    back: { attacks: 0, kills: 0, errors: 0, blocked: 0, blocks: 0, oppAttacks: 0, rallies: 0 }
  };
  for (let m of leagueMatches())
    for (let side of [0, 1])
      for (let key of ['front', 'back']) {
        let ev = m.events.filter(e => (setterIsFront(e, side) ? 'front' : 'back') === key),
          o = stats(ev, side),
          opp = stats(ev, 1 - side),
          x = sums[key];
        x.attacks += o.attacks;
        x.kills += o.kills;
        x.errors += o.errors;
        x.blocked += o.blocked;
        x.blocks += o.blocks;
        x.oppAttacks += opp.attacks;
        x.rallies += ev.length;
      }
  for (let key of ['front', 'back']) {
    let x = sums[key];
    x.attackConv = x.attacks ? x.kills / x.attacks : null;
    x.attackEff = x.attacks ? (x.kills - x.errors - x.blocked) / x.attacks : null;
    x.blockRate = x.oppAttacks ? x.blocks / x.oppAttacks : null;
  }
  return sums;
}
function structureDelta(a, b) {
  if (a === null || b === null) return null;
  return Math.round((a - b) * 100);
}
function setterStructureRead(split) {
  let f = split.front,
    b = split.back;
  if (f.attacks < 12 || b.attacks < 12)
    return 'A amostra ainda é pequena. O corte começa a ganhar valor quando as duas situações acumulam volume de ataque.';
  let da = structureDelta(b.attackEff, f.attackEff),
    db = structureDelta(b.blockRate, f.blockRate),
    parts = [];
  if (Math.abs(da) >= 4)
    parts.push(
      `na amostra, o ataque rende ${Math.abs(da)} p.p. ${da > 0 ? 'mais' : 'menos'} com o levantador no fundo`
    );
  else parts.push('a eficiência ofensiva muda pouco entre levantador na rede e no fundo');
  if (Math.abs(db) >= 2)
    parts.push(
      `o bloqueio produz ${Math.abs(db)} p.p. ${db > 0 ? 'mais' : 'menos'} pontos por ataque rival com o levantador no fundo`
    );
  else parts.push('o rendimento do bloqueio permanece próximo nas duas estruturas');
  return parts.join('. ').replace(/^./, c => c.toUpperCase()) + '.';
}
function structureCard(title, subtitle, x, league, emphasis = false) {
  let attack = x.attacks ? pct(x.kills, x.attacks) : '—',
    eff = x.attacks ? signedPct(x.kills - x.errors - x.blocked, x.attacks) : '—',
    block = x.oppAttacks ? pct(x.blocks, x.oppAttacks) : '—';
  return `<article class="structure-card ${emphasis ? 'strong' : ''}"><small>${title}</small><h3>${subtitle}</h3><div class="structure-stat"><span>Ataque</span><b>${attack}</b><small>${x.attacks} ataques${league?.attackConv != null ? ' · liga ' + pct(league.kills, league.attacks) : ''}</small></div><div class="structure-stat"><span>Eficiência</span><b>${eff}</b><small>Pontos − erros − bloqueados</small></div><div class="structure-stat"><span>Bloqueio</span><b>${block}</b><small>${x.blocks} pontos / ${x.oppAttacks} ataques rivais${league?.blockRate != null ? ' · liga ' + pct(league.blocks, league.oppAttacks) : ''}</small></div></article>`;
}
function setterStructurePanel(events, side, { compact = false, title = 'Estrutura do 5–1' } = {}) {
  let split = setterStructure(events, side),
    lg = leagueSetterStructure(),
    enough = split.front.attacks + split.back.attacks > 0,
    backBetter = (split.back.attackEff ?? -9) > (split.front.attackEff ?? -9);
  return `<section class="panel structure-panel ${compact ? 'compact' : ''}"><div class="panelhead"><div><small>LEVANTADOR NA REDE × NO FUNDO</small><h2>${title}</h2></div><span class="pill">${enough ? split.front.attacks + split.back.attacks + ' ATAQUES' : 'SEM AMOSTRA'}</span></div>${enough ? `<div class="structure-grid">${structureCard('LEVANTADOR NO FUNDO', '3 atacantes de rede', split.back, lg.back, backBetter)}${structureCard('LEVANTADOR NA REDE', '2 atacantes de rede', split.front, lg.front, !backBetter)}</div><div class="structure-reading"><b>Leitura</b><p>${setterStructureRead(split)}</p><small>O corte descreve associação dentro da estrutura 5–1. Passe, adversário, escalação e contexto também influenciam o resultado.</small></div>` : `<div class="structure-empty"><strong>A leitura começa depois do primeiro jogo.</strong><p>O Data Hub vai comparar ataque e bloqueio quando o levantador estiver no fundo e quando chegar à rede, sem exigir que você acompanhe R1–R6.</p></div>`}</section>`;
}
function lineupIdentity(ids) {
  let ps = ids.map(player),
    passers = ps.filter(p => ['PON', 'LIB'].includes(p.pos)),
    attackers = ps.filter(p => ['PON', 'CEN', 'OPO'].includes(p.pos)),
    front = ps.slice(0, 6),
    setter = ps.find(p => p.pos === 'LEV'),
    mean = (arr, k) => (arr.length ? arr.reduce((n, p) => n + p[k], 0) / arr.length : 0),
    pass = mean(passers, 'receive'),
    attack = mean(attackers, 'attack'),
    serve = mean(front, 'serve'),
    block =
      front.reduce((n, p) => n + p.block + ((p.height_cm || heightFor(p)) - 195) * 0.55, 0) / Math.max(1, front.length),
    traits = [];
  traits.push({
    v: pass,
    label: pass >= 82 ? 'Passe muito forte' : pass >= 75 ? 'Passe estável' : 'Passe vulnerável',
    detail: `${passers.map(p => p.name).join(' + ')}`
  });
  traits.push({
    v: attack,
    label: attack >= 84 ? 'Alto poder de definição' : attack >= 76 ? 'Ataque equilibrado' : 'Ataque de construção',
    detail: `Saída e ponteiros: ${Math.round(attack)} de ataque médio`
  });
  traits.push({
    v: block,
    label: block >= 86 ? 'Rede muito física' : block >= 78 ? 'Boa presença de rede' : 'Rede mais técnica que física',
    detail: `Altura e bloqueio da formação`
  });
  traits.push({
    v: serve,
    label: serve >= 84 ? 'Saque de pressão' : serve >= 76 ? 'Saque equilibrado' : 'Saque de controle',
    detail: `${Math.round(serve)} de saque médio`
  });
  traits.sort((a, b) => b.v - a.v);
  return { setter, top: traits.slice(0, 2), weak: traits.at(-1) };
}
function formationIdentityPanel(ids) {
  let x = lineupIdentity(ids);
  return `<section class="formation-identity"><small>IDENTIDADE DA FORMAÇÃO</small><h3>${x.setter?.name || 'Levantador'} · ${x.setter ? roleLabel(x.setter) : ''}</h3><div class="formation-traits">${x.top.map(t => `<span class="positive"><b>${t.label}</b><small>${t.detail}</small></span>`).join('')}<span><b>${x.weak.label}</b><small>Ponto a acompanhar · ${x.weak.detail}</small></span></div></section>`;
}
function courtTacticMarker(p, t) {
  let tags = [];
  if (
    (t.distribution === 'middle' && p.pos === 'CEN') ||
    (t.distribution === 'opposite' && p.pos === 'OPO') ||
    (t.distribution === 'wings' && p.pos === 'PON')
  )
    tags.push('ATAQUE ↑');
  if ((t.protect === 'libero' && p.pos === 'LIB') || t.protect === 'player:' + p.id) tags.push('PROTEGIDO');
  return tags.length ? `<span class="court-tactic-marker">${tags.join(' · ')}</span>` : '';
}
function teamDataRows() {
  return clubs.map(c => {
    let s = seasonStats(c.id),
      games = state.results.filter(m => m.home === c.id || m.away === c.id),
      sets = games.reduce((n, m) => n + m.setScores.length, 0);
    return {
      id: c.id,
      games: games.length,
      attack: s.attacks ? (s.kills - s.errors - s.blocked) / s.attacks : null,
      receive: s.receptions ? s.positive / s.receptions : null,
      serve: s.served ? s.breaks / s.served : null,
      block: sets ? s.blocks / sets : null
    };
  });
}
function rankMetric(rows, key, id) {
  let valid = rows.filter(r => r[key] != null).sort((a, b) => b[key] - a[key]),
    idx = valid.findIndex(r => r.id === id);
  return idx < 0 ? null : { rank: idx + 1, n: valid.length, value: valid[idx][key] };
}
function teamIdentityPanel() {
  let rows = teamDataRows(),
    defs = [
      ['attack', 'Ataque'],
      ['receive', 'Recepção'],
      ['serve', 'Pontos sacando'],
      ['block', 'Bloqueio']
    ],
    items = defs.map(([k, label]) => ({ k, label, r: rankMetric(rows, k, state.club) })).filter(x => x.r),
    best = [...items].sort((a, b) => a.r.rank - b.r.rank)[0],
    weak = [...items].sort((a, b) => b.r.rank - a.r.rank)[0];
  if (!items.length) return '';
  let text =
    best && weak && best.k !== weak.k
      ? `${best.label} é hoje o fundamento mais bem posicionado do time (${best.r.rank}º de ${best.r.n}). ${weak.label} é o ponto que mais fica para trás (${weak.r.rank}º).`
      : 'A amostra ainda está formando a identidade estatística da equipe.';
  return `<section class="panel team-identity"><div class="panelhead"><div><small>QUEM SOMOS ATÉ AQUI</small><h2>Identidade do time</h2></div><span class="pill">LIGA DE 8</span></div><div class="identity-strip">${items.map(x => `<span class="${x.r.rank <= 2 ? 'good' : x.r.rank >= 7 ? 'watch' : ''}"><b>${x.label}</b><strong>${x.r.rank}º</strong><small>de ${x.r.n}</small></span>`).join('')}</div><p>${text}</p></section>`;
}
function teamRankingDefs(source) {
  return source === 'attributes'
    ? [
        ['overallAttr', 'Força média', 'score', 'desc'],
        ['attackAttr', 'Ataque', 'score', 'desc'],
        ['receiveAttr', 'Recepção', 'score', 'desc'],
        ['serveAttr', 'Saque', 'score', 'desc'],
        ['blockAttr', 'Bloqueio', 'score', 'desc'],
        ['setAttr', 'Levantamento', 'score', 'desc'],
        ['defenseAttr', 'Defesa', 'score', 'desc'],
        ['mentalAttr', 'Mental', 'score', 'desc'],
        ['consistencyAttr', 'Consistência', 'score', 'desc']
      ]
    : [
        ['standing', 'Classificação', 'standing', 'asc'],
        ['attack', 'Eficiência de ataque', 'pct', 'desc'],
        ['sideout', 'Virada de bola', 'pct', 'desc'],
        ['break', 'Conversão com saque', 'pct', 'desc'],
        ['receive', 'Recepção positiva', 'pct', 'desc'],
        ['blocksSet', 'Bloqueios / set', 'rate', 'desc'],
        ['acesSet', 'Aces / set', 'rate', 'desc'],
        ['errorsSet', 'Erros cedidos / set', 'rate', 'asc']
      ];
}
function teamRankingRows() {
  let st = standings();
  return clubs.map(c => {
    let games = state.results.filter(m => m.home === c.id || m.away === c.id),
      s = seasonStats(c.id),
      sets = games.reduce((n, m) => n + (m.setScores?.length || 0), 0),
      roster = state.all.filter(p => p.club === c.id),
      mean = k => (roster.length ? roster.reduce((n, p) => n + (Number(p[k]) || 0), 0) / roster.length : null),
      standing = st.findIndex(x => x.id === c.id) + 1,
      stand = st.find(x => x.id === c.id);
    return {
      id: c.id,
      name: c.name,
      short: c.short,
      games: games.length,
      wins: stand?.wins || 0,
      points: stand?.points || 0,
      standing,
      attack: s.attacks ? (s.kills - s.errors - s.blocked) / s.attacks : null,
      sideout: s.received ? s.sideout / s.received : null,
      break: s.served ? s.breaks / s.served : null,
      receive: s.receptions ? s.positive / s.receptions : null,
      blocksSet: sets ? s.blocks / sets : null,
      acesSet: sets ? s.aces / sets : null,
      errorsSet: sets ? s.errorPoints / sets : null,
      overallAttr: roster.length ? roster.reduce((n, p) => n + overall(p), 0) / roster.length : null,
      attackAttr: mean('attack'),
      receiveAttr: mean('receive'),
      serveAttr: mean('serve'),
      blockAttr: mean('block'),
      setAttr: mean('set'),
      defenseAttr: mean('defense'),
      mentalAttr: mean('mental'),
      consistencyAttr: mean('consistency')
    };
  });
}
function playerRankingDefs(source, pos) {
  if (source === 'attributes') {
    let defs = [
      ['overallAttr', 'Overall posicional', 'score'],
      ['attackAttr', 'Ataque', 'score'],
      ['serveAttr', 'Saque', 'score'],
      ['receiveAttr', 'Recepção', 'score'],
      ['blockAttr', 'Bloqueio', 'score'],
      ['setAttr', 'Levantamento', 'score'],
      ['defenseAttr', 'Defesa', 'score'],
      ['mentalAttr', 'Mental', 'score'],
      ['consistencyAttr', 'Consistência', 'score'],
      ['staminaAttr', 'Resistência', 'score']
    ];
    if (pos === 'LEV')
      defs = [defs[5], defs[6], defs[2], defs[7], defs[8], defs[0], defs[4], defs[9], defs[1], defs[3]];
    if (pos === 'LIB')
      defs = [defs[3], defs[6], defs[7], defs[8], defs[9], defs[0], defs[2], defs[1], defs[4], defs[5]];
    if (pos === 'CEN')
      defs = [defs[4], defs[1], defs[2], defs[0], defs[7], defs[8], defs[9], defs[6], defs[3], defs[5]];
    if (pos === 'OPO')
      defs = [defs[1], defs[2], defs[4], defs[0], defs[7], defs[8], defs[9], defs[6], defs[3], defs[5]];
    if (pos === 'PON')
      defs = [defs[1], defs[3], defs[2], defs[4], defs[6], defs[0], defs[7], defs[8], defs[9], defs[5]];
    return defs;
  }
  let common = [
    ['ratingAvg', 'Nota média', 'rating'],
    ['ratingLast5', 'Últimas 5', 'rating'],
    ['ratingBest', 'Melhor atuação', 'rating'],
    ['pointsSet', 'Pontos / set', 'rate'],
    ['attackEff', 'Eficiência de ataque', 'signedPct'],
    ['acesSet', 'Aces / set', 'rate'],
    ['receivePos', 'Recepção positiva', 'pct'],
    ['receivePerfect', 'Passe na mão', 'pct'],
    ['blocksSet', 'Bloqueios / set', 'rate'],
    ['defenseSet', 'Defesas / set', 'rate']
  ];
  if (pos === 'LEV')
    return [
      ['ratingAvg', 'Nota média', 'rating'],
      ['ratingLast5', 'Últimas 5', 'rating'],
      ['ratingBest', 'Melhor atuação', 'rating'],
      ['setterPlus', 'Setter+', 'plus'],
      ['defenseSet', 'Defesas / set', 'rate'],
      ['acesSet', 'Aces / set', 'rate'],
      ['blocksSet', 'Bloqueios / set', 'rate'],
      ['attackEff', 'Eficiência de ataque', 'signedPct']
    ];
  if (pos === 'LIB')
    return [
      ['ratingAvg', 'Nota média', 'rating'],
      ['ratingLast5', 'Últimas 5', 'rating'],
      ['ratingBest', 'Melhor atuação', 'rating'],
      ['receivePos', 'Recepção positiva', 'pct'],
      ['receivePerfect', 'Passe na mão', 'pct'],
      ['defenseSet', 'Defesas / set', 'rate']
    ];
  if (pos === 'CEN')
    return [
      ['ratingAvg', 'Nota média', 'rating'],
      ['ratingLast5', 'Últimas 5', 'rating'],
      ['ratingBest', 'Melhor atuação', 'rating'],
      ['pointsSet', 'Pontos / set', 'rate'],
      ['attackEff', 'Eficiência de ataque', 'signedPct'],
      ['blocksSet', 'Bloqueios / set', 'rate'],
      ['acesSet', 'Aces / set', 'rate']
    ];
  if (pos === 'OPO')
    return [
      ['ratingAvg', 'Nota média', 'rating'],
      ['ratingLast5', 'Últimas 5', 'rating'],
      ['ratingBest', 'Melhor atuação', 'rating'],
      ['pointsSet', 'Pontos / set', 'rate'],
      ['attackEff', 'Eficiência de ataque', 'signedPct'],
      ['acesSet', 'Aces / set', 'rate'],
      ['blocksSet', 'Bloqueios / set', 'rate'],
      ['defenseSet', 'Defesas / set', 'rate']
    ];
  if (pos === 'PON') return common;
  return common;
}
function leaguePlayerRows() {
  let keys = [
      'attacks',
      'kills',
      'errors',
      'blocked',
      'aces',
      'blocks',
      'receptions',
      'positive',
      'perfect',
      'serveErrors',
      'defenses',
      'defenseControlled',
      'defenseErrors',
      'settingErrors',
      'infractions',
      'blockAttempts'
    ],
    agg = new Map(),
    setsMap = new Map(),
    serves = new Map(),
    ratings = new Map(),
    setterAgg = new Map();
  for (let [mi, m] of state.results.entries()) {
    for (let side of [0, 1]) {
      let s = matchStats(m, side);
      for (let [id, x] of Object.entries(s.players || {})) {
        id = Number(id);
        let a = agg.get(id) || Object.fromEntries(keys.map(k => [k, 0]));
        for (let k of keys) a[k] += Number(x[k] || 0);
        agg.set(id, a);
      }
    }
    for (let r of ratingRows(m)) {
      if (r.actions < 3) continue;
      let x = ratings.get(r.id) || { sum: 0, n: 0, values: [] };
      x.sum += r.grade;
      x.n++;
      x.values.push(r.grade);
      ratings.set(r.id, x);
    }
    let meta = m.playerMeta || playerMatchMeta(m);
    for (let [id, x] of Object.entries(meta)) {
      id = Number(id);
      setsMap.set(id, (setsMap.get(id) || 0) + (x.sets?.length || 0));
      serves.set(id, (serves.get(id) || 0) + (x.serves || 0));
    }
    for (let row of m.setterRows || []) {
      let x = setterAgg.get(row.id) || { sum: 0, n: 0, actions: 0 };
      x.sum += (row.setterPlus || 0) * Math.max(1, row.n || 1);
      x.n += Math.max(1, row.n || 1);
      x.actions += row.n || 0;
      setterAgg.set(row.id, x);
    }
  }
  return state.all.map(p => {
    let x = agg.get(p.id) || Object.fromEntries(keys.map(k => [k, 0])),
      sets = setsMap.get(p.id) || 0,
      sv = serves.get(p.id) || 0,
      setter = setterAgg.get(p.id),
      rt = ratings.get(p.id);
    return {
      id: p.id,
      p,
      club: p.club,
      pos: p.pos,
      sets,
      serves: sv,
      ratingAvg: rt ? rt.sum / rt.n : null,
      ratingLast5: rt?.values?.length
        ? rt.values.slice(-5).reduce((a, b) => a + b, 0) / Math.min(5, rt.values.length)
        : null,
      ratingBest: rt?.values?.length ? Math.max(...rt.values) : null,
      ratingN: rt?.n || 0,
      points: x.kills + x.aces + x.blocks,
      pointsSet: sets ? (x.kills + x.aces + x.blocks) / sets : null,
      attackEff: x.attacks ? (x.kills - x.errors - x.blocked) / x.attacks : null,
      acesSet: sets ? x.aces / sets : null,
      receivePos: x.receptions ? x.positive / x.receptions : null,
      receivePerfect: x.receptions ? x.perfect / x.receptions : null,
      blocksSet: sets ? x.blocks / sets : null,
      defenseSet: sets ? x.defenses / sets : null,
      setterPlus: setter ? setter.sum / setter.n : null,
      setterN: setter?.actions || 0,
      ...x,
      overallAttr: overall(p),
      attackAttr: p.attack,
      serveAttr: p.serve,
      receiveAttr: p.receive,
      blockAttr: p.block,
      setAttr: p.set,
      defenseAttr: p.defense,
      mentalAttr: p.mental,
      consistencyAttr: p.consistency,
      staminaAttr: p.stamina
    };
  });
}
function rankingFormat(key, v, type, row) {
  if (v === null || v === undefined || !Number.isFinite(Number(v))) return '—';
  if (type === 'standing') return `${row.standing}º · ${row.points} pts`;
  if (type === 'pct' || type === 'signedPct') return `${Math.round(v * 100)}%`;
  if (type === 'rate') return Number(v).toFixed(2).replace('.', ',');
  if (type === 'plus') return Math.round(v);
  if (type === 'rating') return Number(v).toFixed(1).replace('.', ',');
  return Math.round(v);
}
function playerRankQualified(r, key, source) {
  if (source === 'attributes') return true;
  if (['ratingAvg', 'ratingLast5', 'ratingBest'].includes(key)) return r.ratingN >= 1 && r[key] !== null;
  if (key === 'pointsSet') return r.sets >= 1;
  if (key === 'attackEff') return r.attacks >= 5;
  if (key === 'acesSet') return r.sets >= 1 && r.serves >= 4;
  if (key === 'receivePos' || key === 'receivePerfect') return r.receptions >= 5;
  if (key === 'blocksSet') return r.sets >= 1 && (r.blockAttempts >= 3 || r.blocks >= 1);
  if (key === 'defenseSet') return r.sets >= 1 && r.defenses >= 3;
  if (key === 'setterPlus') return r.setterN >= 8 && r.setterPlus !== null;
  return false;
}
function playerRankSample(r, key, source) {
  if (source === 'attributes') return 'Atributo base';
  if (key === 'ratingAvg') return `${r.ratingN} jogo${r.ratingN === 1 ? '' : 's'}`;
  if (key === 'ratingLast5') return `${Math.min(5, r.ratingN)} jogo${Math.min(5, r.ratingN) === 1 ? '' : 's'}`;
  if (key === 'ratingBest') return `${r.ratingN} jogo${r.ratingN === 1 ? '' : 's'}`;
  if (key === 'pointsSet' || key === 'blocksSet') return `${r.sets} set${r.sets === 1 ? '' : 's'}`;
  if (key === 'attackEff') return `${r.attacks} ataques`;
  if (key === 'acesSet') return `${r.serves} saques`;
  if (key === 'receivePos' || key === 'receivePerfect') return `${r.receptions} recepções`;
  if (key === 'defenseSet') return `${r.defenses} defesas`;
  if (key === 'setterPlus') return `${r.setterN} levantamentos`;
  return '';
}
function rankPodium(rows, key, type, kind) {
  return rows.length
    ? `<div class="ranking-podium">${rows
        .slice(0, 3)
        .map(
          (r, i) =>
            `<article class="rank-card ${i === 0 ? 'leader' : ''}"><span>${i + 1}º</span><strong>${kind === 'team' ? r.name : r.p.name}</strong><small>${kind === 'team' ? (r.id === state.club ? 'SEU TIME' : `${r.games} jogos`) : `${names[r.pos]} · ${club(r.club).short}`}</small><b>${rankingFormat(key, r[key], type, r)}</b></article>`
        )
        .join('')}</div>`
    : '';
}
function teamRankingPanel() {
  let defs = teamRankingDefs(rankingTeamSource);
  if (!defs.some(d => d[0] === rankingTeamMetric)) rankingTeamMetric = defs[0][0];
  let def = defs.find(d => d[0] === rankingTeamMetric),
    [key, label, type, dir] = def,
    rows = teamRankingRows().filter(r => r[key] !== null && r[key] !== undefined),
    sorted = [...rows].sort((a, b) => (dir === 'asc' ? a[key] - b[key] : b[key] - a[key] || a.id - b.id)),
    mine = sorted.findIndex(r => r.id === state.club),
    mean = rows.length ? rows.reduce((n, r) => n + Number(r[key] || 0), 0) / rows.length : null,
    leader = sorted[0],
    metricBar = `<div class="ranking-metricbar">${defs.map(d => `<button class="${d[0] === rankingTeamMetric ? 'active' : ''}" data-ranking-team-metric="${d[0]}">${d[1]}</button>`).join('')}</div>`;
  let summary = leader
    ? `<div class="ranking-summary">${metric('Líder', leader.short, `${label}: ${rankingFormat(key, leader[key], type, leader)}`)}${metric('Seu time', mine >= 0 ? `${mine + 1}º` : '—', mine >= 0 ? rankingFormat(key, sorted[mine][key], type, sorted[mine]) : 'Sem amostra')}${metric('Média da liga', key === 'standing' ? `${(rows.reduce((n, r) => n + r.points, 0) / Math.max(1, rows.length)).toFixed(1).replace('.', ',')} pts` : rankingFormat(key, mean, type, { standing: 0, points: 0 }), `${rows.length} equipes`)}</div>`
    : '';
  return `<div class="ranking-source"><div class="tabs"><button data-ranking-team-source="performance" class="${rankingTeamSource === 'performance' ? 'active' : ''}">Performance</button><button data-ranking-team-source="attributes" class="${rankingTeamSource === 'attributes' ? 'active' : ''}">Atributos do elenco</button></div>${metricBar}</div>${
    !rows.length
      ? `<div class="panel empty"><h2>Amostra em formação</h2><p>Os rankings de performance começam após as primeiras partidas. Os atributos do elenco já podem ser comparados.</p></div>`
      : `${summary}${rankPodium(sorted, key, type, 'team')}<div class="panel ranking-table"><div class="panelhead"><div><small>${rankingTeamSource === 'performance' ? 'DESEMPENHO NA COMPETIÇÃO' : 'FORÇA DO ELENCO'}</small><h2>${label}</h2></div><span class="pill">${rows.length} EQUIPES</span></div>${table(
          ['#', 'Equipe', 'Valor', 'Contexto'],
          sorted.map(
            (r, i) =>
              `<tr class="${r.id === state.club ? 'mine' : ''}"><td class="${i === 0 ? 'lime' : ''}"><b>${i + 1}</b></td><td><strong>${r.name}</strong><small>${r.id === state.club ? 'Seu clube' : r.short}</small></td><td><b>${rankingFormat(key, r[key], type, r)}</b></td><td>${rankingTeamSource === 'performance' ? `${r.games} J · ${r.wins} V · ${r.points} pts` : '14 atletas · média do elenco'}</td></tr>`
          )
        )}<p class="ranking-footnote">${rankingTeamSource === 'performance' ? 'Performance usa somente partidas concluídas. Em “Erros cedidos / set”, menor é melhor.' : 'Atributos do elenco são médias dos 14 atletas; “Força média” usa o overall específico de cada posição.'}</p></div>`
  }`;
}
function playerRankingPanel() {
  let defs = playerRankingDefs(rankingPlayerSource, rankingPlayerPos);
  if (!defs.some(d => d[0] === rankingPlayerMetric)) rankingPlayerMetric = defs[0][0];
  let [key, label, type] = defs.find(d => d[0] === rankingPlayerMetric),
    rows = leaguePlayerRows().filter(
      r =>
        (rankingPlayerPos === 'ALL' || r.pos === rankingPlayerPos) &&
        r[key] !== null &&
        r[key] !== undefined &&
        playerRankQualified(r, key, rankingPlayerSource)
    ),
    sorted = [...rows].sort((a, b) => b[key] - a[key] || a.id - b.id),
    mean = rows.length ? rows.reduce((n, r) => n + Number(r[key] || 0), 0) / rows.length : null,
    bestMine = sorted.find(r => r.club === state.club),
    mineRank = bestMine ? sorted.indexOf(bestMine) + 1 : null,
    metricBar = `<div class="ranking-metricbar">${defs.map(d => `<button class="${d[0] === rankingPlayerMetric ? 'active' : ''}" data-ranking-player-metric="${d[0]}">${d[1]}</button>`).join('')}</div>`,
    posOptions = [
      ['ALL', 'Todas as posições'],
      ['LEV', 'Levantadores'],
      ['PON', 'Ponteiros'],
      ['CEN', 'Centrais'],
      ['OPO', 'Opostos'],
      ['LIB', 'Líberos']
    ];
  let summary = rows.length
    ? `<div class="ranking-summary">${metric('Líder', sorted[0].p.name, `${club(sorted[0].club).short} · ${rankingFormat(key, sorted[0][key], type, sorted[0])}`)}${metric('Média', rankingFormat(key, mean, type, { standing: 0, points: 0 }), `${rows.length} atletas classificados`)}${metric('Melhor do seu time', bestMine ? `${mineRank}º` : '—', bestMine ? `${bestMine.p.name} · ${rankingFormat(key, bestMine[key], type, bestMine)}` : 'Sem atleta classificado')}</div>`
    : '';
  return `<div class="ranking-player-controls"><div class="tabs"><button data-ranking-player-source="performance" class="${rankingPlayerSource === 'performance' ? 'active' : ''}">Performance</button><button data-ranking-player-source="attributes" class="${rankingPlayerSource === 'attributes' ? 'active' : ''}">Atributos</button></div><label class="field ranking-position">Posição<select id="ranking-position">${posOptions.map(([v, l]) => `<option value="${v}" ${v === rankingPlayerPos ? 'selected' : ''}>${l}</option>`).join('')}</select></label>${metricBar}</div>${
    !rows.length
      ? `<div class="panel empty"><h2>Amostra em formação</h2><p>Este ranking exige volume mínimo para não transformar uma única bola em liderança da liga. Troque o fundamento ou consulte Atributos enquanto a competição ganha amostra.</p></div>`
      : `${summary}${rankPodium(sorted, key, type, 'player')}<div class="panel ranking-table"><div class="panelhead"><div><small>${rankingPlayerSource === 'performance' ? 'PRODUÇÃO EM QUADRA' : 'ATRIBUTO DO JOGADOR'}</small><h2>${label}${rankingPlayerPos !== 'ALL' ? ` · ${names[rankingPlayerPos]}` : ''}</h2></div><span class="pill">${rows.length} CLASSIFICADOS</span></div>${table(
          ['#', 'Jogador', 'Equipe', 'Valor', 'Amostra'],
          sorted.map(
            (r, i) =>
              `<tr class="${r.club === state.club ? 'mine' : ''}"><td class="${i === 0 ? 'lime' : ''}"><b>${i + 1}</b></td><td>${playerIdentity(r.p, { clickable: true, compact: true, includeServe: false })}</td><td><strong>${club(r.club).short}</strong></td><td><b>${rankingFormat(key, r[key], type, r)}</b></td><td>${playerRankSample(r, key, rankingPlayerSource)}</td></tr>`
          )
        )}<p class="ranking-footnote">${rankingPlayerSource === 'performance' ? 'Nota média exige ao menos uma partida com três ações registradas; demais fundamentos mantêm amostras mínimas por ação. Setter+ exige 8 levantamentos registrados. Rankings usam apenas partidas concluídas.' : 'Atributos são comparações da base do jogo. Overall é calculado com pesos/fundamentos relevantes para cada posição, não como uma régua única entre funções.'}</p></div>`
  }`;
}
function ranking() {
  return `${heading('Ranking', 'Quem está acima da média na liga.', 'Escolha uma lente e compare equipes ou jogadores.', button('Abrir análises', 'data'))}<div class="ranking-shell"><div class="ranking-scope tabs"><button data-ranking-scope="teams" class="${rankingScope === 'teams' ? 'active' : ''}">Equipes</button><button data-ranking-scope="players" class="${rankingScope === 'players' ? 'active' : ''}">Jogadores</button></div>${rankingScope === 'teams' ? teamRankingPanel() : playerRankingPanel()}</div>`;
}

function lineMetrics(ids) {
  let ps = ids.map(player);
  return `<div class="line-metrics">${[
    ['Força', null],
    ['Ataque', 'attack'],
    ['Recepção', 'receive'],
    ['Saque', 'serve'],
    ['Bloqueio', 'block'],
    ['Entrosamento', 'chemistry']
  ]
    .map(
      ([label, k]) =>
        `<span>${label}<b>${Math.round(ps.reduce((n, p) => n + (k ? p[k] : overall(p)), 0) / ps.length)}</b></span>`
    )
    .join('')}</div>`;
}
function oldPreMatchInfo(pair) {
  if (!pair) return '';
  let ids = state.lines[state.club],
    opp = pair.find(id => id !== state.club),
    team = ids.map(player),
    avg = k => Math.round(team.reduce((a, p) => a + p[k], 0) / 7);
  return `<div class="note"><p>${matchContextText(state.results, pair, state.club)}</p><h3>Rodada ${state.round + 1} de ${fixtures.length} · ${pair[0] === state.club ? 'Em casa' : 'Fora de casa'}</h3><p>Força provável do adversário: ${Math.round(state.lines[opp].map(player).reduce((a, p) => a + overall(p), 0) / 7)} · Sistema 5–1 · Rotação inicial R1</p><p>Físico ${avg('condition')}% · Moral ${avg('morale')}% · Entrosamento ${avg('chemistry')}%</p><p>${team.map(p => `${p.pos}: ${athleteLabel(p)}`).join(' · ')}</p></div><div class="panel" style="text-align:left;margin-top:20px"><h2>Orientação tática</h2>${tacticalForm(state.tactics[state.club])}</div>`;
}
function targetOptions() {
  let pair = next();
  let opp =
    match && !match.done ? [match.home, match.away].find(id => id !== state.club) : pair?.find(id => id !== state.club);
  return state.all
    .filter(p => p.club === opp && ['PON', 'LIB'].includes(p.pos))
    .map(p => ['player:' + p.id, athleteLabel(p)]);
}
function narrate(e) {
  return e.steps
    .map(s =>
      s.type === 'serve'
        ? `${athleteLabel(player(s.player))} saca.`
        : s.type === 'receive'
          ? `${athleteLabel(player(s.player))}: ${['recepção sem controle', 'recepção quebrada', 'passe limitado', 'passe positivo', 'passe perfeito'][s.quality]}.`
          : s.type === 'defense'
            ? `${athleteLabel(player(s.player))} mantém a bola viva.`
            : s.type === 'set'
              ? `${athleteLabel(player(s.player))} aciona ${athleteLabel(player(s.target))}.`
              : ''
    )
    .filter(Boolean)
    .join(' ');
}
function legacyMatchContext(m) {
  if (m.done)
    return `<p>${club(m.sets[0] === 3 ? m.home : m.away).name} vence por ${Math.max(...m.sets)} a ${Math.min(...m.sets)}.</p>`;
  let server = m.teams[m.server][(6 - m.rotation[m.server]) % 6],
    side = m.home === state.club ? 0 : 1,
    recent = m.events
      .slice(-8)
      .map(e => `<span class="${e.winner === side ? 'lime' : 'orange'}">${e.winner === side ? '●' : '○'}</span>`)
      .join(' '),
    lead = m.score[side] - m.score[1 - side],
    avg = k => m.teams[side].reduce((n, p) => n + p[k], 0) / 7,
    fluid = lead >= 6 && (m.momentum?.[side] || 0) >= 3 && avg('morale') >= 78 && avg('chemistry') >= 78;
  return `<p>Saque: <b>${club(m.server === 0 ? m.home : m.away).short} · ${athleteLabel(server)}</b></p><p aria-label="Sequência recente">${recent || 'Aguardando primeiro saque'} <small>● seu ponto · ○ adversário</small></p>${fluid ? '<div class="note">Seu time joga solto: vantagem no placar e confiança na sequência.</div>' : ''}`;
}
function openDialog(title, body) {
  let d = $('#detail');
  d.className = '';
  d.innerHTML = `<div class="panelhead"><h2>${escapeHtml(title)}</h2><button id="close" aria-label="Fechar">✕</button></div>${body}`;
  d.showModal();
  $('#close').onclick = () => d.close();
  return d;
}
function subDialog(selectedId = null) {
  if (!match || match.done) return;
  stop();
  render();
  let side = match.home === state.club ? 0 : 1,
    team = match.teams[side],
    ratings = ratingRows(match),
    setEvents = match.events.filter(e => e.set === match.setScores.length + 1),
    setStats = stats(setEvents, side),
    pickOut = selectedId !== null ? team.findIndex(p => p.id === selectedId) : -1,
    pickIn = null,
    d = openDialog('Banco e substituições', '');
  d.className = 'sub-dialog';
  function playerLine(p, index) {
    let r = ratings.find(x => x.id === p.id),
      ps = setStats.players[p.id] || {},
      stateNow = playerLiveState(match, p),
      points = (ps.kills || 0) + (ps.aces || 0) + (ps.blocks || 0),
      canOut = true;
    return `<button class="sub-player-card ${pickOut === index ? 'selected' : ''}" data-sub-out="${index}" ${canOut ? '' : 'disabled'}><span class="sub-player-role">${p.pos}</span><span class="sub-player-main"><strong>${p.name}</strong><small>${roleLabel(p)} · ${heightLabel(p)}</small></span><span class="sub-player-right"><b>${r && r.actions >= 3 ? r.grade.toFixed(1) : '—'}</b><small>${points} pts · ${Math.round(p.condition)}%</small></span>${stateNow?.label ? `<i>${stateNow.label}</i>` : ''}</button>`;
  }
  function benchOptions() {
    if (pickOut < 0) return [];
    let out = team[pickOut];
    return state.all
      .filter(q => q.club === state.club && q.pos === out.pos && !team.some(a => a.id === q.id))
      .map(q => {
        let live = match.bench?.[q.id] || q;
        return { ...q, condition: live.condition ?? q.condition, confidence: live.confidence ?? q.morale };
      })
      .sort((a, b) => overall(b) - overall(a));
  }
  function renderSub() {
    let out = pickOut >= 0 ? team[pickOut] : null,
      candidates = benchOptions(),
      recommended = candidates[0];
    d.innerHTML = `<div class="panelhead sub-head"><div><small>SET ${match.setScores.length + 1} · ${match.substitutions?.[side] || 0} DE 6 TROCAS</small><h2>${out ? 'Escolha quem entra' : 'Escolha quem sai'}</h2></div><button id="close">×</button></div><section class="sub-sheet">${out ? `<div class="sub-context"><div><small>SAI</small><strong>${out.name}</strong><span>${roleLabel(out)} · físico ${Math.round(out.condition)}%</span></div><button data-sub-back>Trocar escolha</button></div>` : `<div class="sub-intro"><small>QUADRA</small><p>Escolha o atleta que você quer tirar. Nota, pontos, físico e estado atual aparecem para apoiar a decisão.</p></div><div class="sub-oncourt">${team.map(playerLine).join('')}</div>`}${out ? `<div class="sub-bench-title"><div><small>BANCO</small><h3>${names[out.pos]} disponíveis</h3></div>${recommended ? `<span>melhor OVR: ${recommended.name.split(' ')[0]}</span>` : ''}</div><div class="sub-bench">${candidates.length ? candidates.map(q => `<button class="sub-bench-card ${pickIn === q.id ? 'selected' : ''}" data-sub-in="${q.id}"><span><strong>${q.name}</strong><small>${roleLabel(q)} · ${heightLabel(q)} · ${serveStyleLabel(q)}</small></span><span class="sub-bench-meta"><b>OVR ${overall(q)}</b><small>Físico ${Math.round(q.condition)}% · Moral ${Math.round(q.morale)}%</small></span></button>`).join('') : '<div class="sub-empty">Sem atleta disponível para esta posição.</div>'}</div><div class="sub-footer">${pickIn ? button('Confirmar troca', 'confirm-sub', 'primary') : `<button class="primary" disabled>Escolha quem entra</button>`}</div>` : ''}</section>`;
    d.querySelector('#close').onclick = () => d.close();
    d.querySelectorAll('[data-sub-out]').forEach(
      b =>
        (b.onclick = () => {
          pickOut = Number(b.dataset.subOut);
          pickIn = null;
          renderSub();
        })
    );
    d.querySelector('[data-sub-back]')?.addEventListener('click', () => {
      pickOut = -1;
      pickIn = null;
      renderSub();
    });
    d.querySelectorAll('[data-sub-in]').forEach(
      b =>
        (b.onclick = () => {
          pickIn = Number(b.dataset.subIn);
          renderSub();
        })
    );
    d.querySelector('[data-action="confirm-sub"]')?.addEventListener('click', () => {
      try {
        let incoming = player(pickIn),
          outPlayer = substitute(match, side, pickOut, incoming);
        d.close();
        commit();
        render();
        notify(incoming.name + ' entra no lugar de ' + outPlayer.name + '.');
      } catch (e) {
        notify(e.message);
      }
    });
  }
  renderSub();
}
function timeoutDialog() {
  if (!match || match.done) return;
  stop();
  let side = match.home === state.club ? 0 : 1;
  if ((match.timeouts?.[side] || 0) >= 2) {
    notify('Você já usou os dois tempos deste set.');
    return;
  }
  let set = match.setScores.length + 1,
    score = match.score.join('–'),
    context = matchContext(match),
    lead = match.score[side] - match.score[1 - side],
    situation =
      lead >= 4
        ? 'Seu time tem vantagem. Use o tempo para manter controle.'
        : lead <= -4
          ? 'O adversário abriu vantagem. A fala precisa interromper o momento.'
          : Math.abs(lead) <= 1
            ? 'O set está no detalhe. A intervenção pode mudar o próximo bloco de rallies.'
            : 'Há margem para ajustar sem mudar tudo.';
  let d = openDialog(
    'Pedido de tempo',
    `<section class="timeout-sheet"><div class="timeout-head"><div><small>PEDIDO DE TEMPO · SET ${set}</small><strong>${club(match.home).short} ${score} ${club(match.away).short}</strong></div><span>${2 - (match.timeouts?.[side] || 0)} restante${2 - (match.timeouts?.[side] || 0) === 1 ? '' : 's'}</span></div><div class="timeout-read"><small>LEITURA RÁPIDA</small><p>${situation}</p><span>${context.act === 'closing' ? 'Fechamento do set' : context.act === 'adjust' ? 'Momento de ajuste' : 'Leitura inicial'} · ${context.level || 'pressão normal'}</span></div><div class="timeout-call"><small>O QUE VOCÊ DIZ?</small><div class="timeout-talks">${talkChoices(
      match,
      side
    )
      .map(
        ([tone, title, detail]) =>
          `<button data-timeout-talk="${tone}"><strong>${title}</strong><span>${detail}</span></button>`
      )
      .join('')}</div></div></section>`
  );
  d.className = 'timeout-dialog';
  d.querySelectorAll('[data-timeout-talk]').forEach(
    b =>
      (b.onclick = () => {
        let tone = b.dataset.timeoutTalk;
        try {
          takeTimeout(match, side, 'calm');
          match.breakKind = 'timeout';
          match.coaching = true;
          focusTalk(match, side, tone);
          for (let p of match.teams[side]) {
            let delta =
              tone === 'demand'
                ? p.mental >= 70
                  ? 4
                  : -3
                : tone === 'reinforce'
                  ? 5
                  : tone === 'calm'
                    ? 3
                    : tone === 'energize'
                      ? 3
                      : tone === 'guide'
                        ? 2
                        : 1;
            p.confidence = Math.max(35, Math.min(99, (p.confidence ?? p.morale) + delta));
          }
          match.decisions.push({
            type: 'talk',
            side,
            set: match.setScores.length + 1,
            rally: match.events.length,
            tone,
            breakKind: 'timeout'
          });
          d.close();
          delete match.breakKind;
          match.coaching = false;
          commit();
          render();
          notify('Tempo concluído. O time volta com uma orientação clara.');
        } catch (e) {
          notify(e.message);
        }
      })
  );
}
function simulate(mode) {
  if (needsTalk(match)) {
    notify('Escolha a palestra antes de avançar.');
    return;
  }
  if (!match || match.done || timer || simulating) return;
  simulating = true;
  stop();
  resumeMatch();
  let set = match.setScores.length;
  notify('Simulando pontos…');
  document.querySelectorAll('[data-action]').forEach(b => (b.disabled = true));
  setTimeout(() => {
    try {
      let count = 0;
      while (!match.done) {
        one();
        count++;
        if (match.breakKind) break;
        if (
          matchContext(match).act === 'closing' ||
          (mode === 'three' && count >= 3) ||
          (mode === 'five' && count >= 5) ||
          (mode !== 'match' && match.setScores.length !== set)
        )
          break;
        if (count > 10000) throw Error('Simulação interrompida para preservar o jogo.');
      }
      simulating = false;
      render();
      notify(
        match.done
          ? 'Fim de jogo. Resultado e classificação atualizados.'
          : match.breakKind === 'technical'
            ? 'Intervalo técnico. Analise o set antes de retomar.'
            : match.setScores.length !== set
              ? 'Fim do set. Revise as decisões antes de continuar.'
              : 'Avanço concluído.'
      );
    } catch (e) {
      simulating = false;
      stop();
      commit();
      render();
      notify(e.message);
    }
  }, 40);
}
function compactHistoryReport(m) {
  let a = matchStats(m, 0),
    b = matchStats(m, 1),
    mv = matchMvp(m),
    rows = [
      ['Ataque', pct(a.kills, a.attacks), pct(b.kills, b.attacks)],
      ['Recepção +', pct(a.positive, a.receptions), pct(b.positive, b.receptions)],
      ['Bloqueios', a.blocks, b.blocks],
      ['Aces', a.aces, b.aces],
      ['Erros cedidos', a.errorPoints, b.errorPoints]
    ];
  return `<section class="postgame-sheet"><section class="postgame-report-hero" style="--winner:${club(m.sets[0] === 3 ? m.home : m.away).color}"><div class="postgame-report-kicker"><span>ARQUIVO DA TEMPORADA</span><b>${m.classification || matchClassification(m)}</b></div><div class="postgame-report-score"><div><small>${club(m.home).short}</small><strong>${m.sets[0]}</strong></div><i>×</i><div><strong>${m.sets[1]}</strong><small>${club(m.away).short}</small></div></div><div class="postgame-report-sets">${m.setScores.map((s, i) => `<span><b>${i + 1}º</b>${s[0]}–${s[1]}</span>`).join('')}</div><h2>${m.headline || matchHeadline(m)}</h2>${mv?.p ? `<div class="postgame-report-mvp"><div><small>MVP</small><strong>${mv.p.name}</strong><span>${roleLabel(mv.p)}</span></div><b>★ ${(ratingRows(m).find(r => r.id === mv.p.id)?.grade || 0).toFixed(1)}</b></div>` : ''}</section><div class="panel"><div class="panelhead"><div><small>RESUMO COMPACTO</small><h2>Estatísticas preservadas</h2></div><span class="pill">DETALHE RALLY A RALLY ARQUIVADO</span></div>${table(
    ['Indicador', club(m.home).short, club(m.away).short],
    rows.map(r => `<tr>${r.map(x => `<td>${x}</td>`).join('')}</tr>`)
  )}<p class="formhint">Para manter o save leve, o rally a rally fica disponível apenas nas 3 partidas mais recentes do seu clube. Placar, sets, notas, MVP, decisões e estatísticas agregadas desta partida continuam preservados.</p></div></section>`;
}
function reportDialog(m) {
  if (!m) return;
  let d = $('#detail');
  if (d?.open) d.close();
  openDialog('Analisar partida', m.events?.length ? postGamePanel(m) : compactHistoryReport(m));
  d = $('#detail');
  d.className = 'postgame-dialog';
  bind();
}
function validActive(m, v) {
  try {
    if (
      m.focus !== undefined &&
      (!Array.isArray(m.focus) ||
        m.focus.length !== 2 ||
        m.focus.some(
          f =>
            f !== null &&
            (!Number.isInteger(f.set) ||
              f.set < 1 ||
              f.set > 5 ||
              !Number.isInteger(f.until) ||
              f.until < 0 ||
              f.until > m.events.length + 6)
        ))
    )
      return false;
    if (
      m.focusChecks !== undefined &&
      (!Array.isArray(m.focusChecks) || m.focusChecks.length > 20 || m.focusChecks.some(k => typeof k !== 'string'))
    )
      return false;
    if (
      m.setForm !== undefined &&
      (!Array.isArray(m.setForm) ||
        m.setForm.length !== 2 ||
        m.setForm.some(n => !Number.isFinite(n) || Math.abs(n) > 2.4))
    )
      return false;
    let pair = fixtures[v.round]?.find(p => p.includes(v.club));
    if (
      !pair ||
      m.done ||
      m.home !== pair[0] ||
      m.away !== pair[1] ||
      ![0, 1].includes(m.server) ||
      ![0, 1].includes(m.initialServer) ||
      !Number.isInteger(m.rngState) ||
      !Array.isArray(m.events) ||
      m.events.length > 10000
    )
      return false;
    for (let k of ['score', 'sets', 'rotation'])
      if (
        !Array.isArray(m[k]) ||
        m[k].length !== 2 ||
        m[k].some(n => !Number.isInteger(n) || n < 0 || n > (k === 'rotation' ? 5 : k === 'sets' ? 2 : 10000))
      )
        return false;
    if (!Array.isArray(m.setScores) || m.setScores.length !== m.sets[0] + m.sets[1]) return false;
    for (let side of [0, 1]) {
      if (
        !Array.isArray(m.teams[side]) ||
        m.teams[side].length !== 7 ||
        new Set(m.teams[side].map(p => p.id)).size !== 7
      )
        return false;
      for (let [i, p] of m.teams[side].entries()) {
        let original = v.all.find(q => q.id === p.id);
        if (
          !original ||
          original.club !== pair[side] ||
          original.pos !== POS[i] ||
          p.name !== original.name ||
          Object.keys(attrs)
            .concat(['condition', 'morale', 'chemistry'])
            .some(k => !Number.isFinite(p[k]) || p[k] < 0 || p[k] > 100)
        )
          return false;
      }
      if ((m.timeouts?.[side] || 0) > 2 || (m.substitutions?.[side] || 0) > 6) return false;
    }
    for (let p of Object.values(m.bench || {})) {
      let q = v.all.find(q => q.id === p.id);
      if (
        !q ||
        p.name !== q.name ||
        p.club !== q.club ||
        p.pos !== q.pos ||
        Object.keys(attrs)
          .concat(['condition', 'morale', 'chemistry'])
          .some(k => !Number.isFinite(p[k]) || p[k] < 0 || p[k] > 100)
      )
        return false;
    }
    for (let side of [0, 1]) {
      let t = m.tactics?.[side];
      for (let [k, opts] of Object.entries({
        serve: ['safe', 'balanced', 'selective', 'aggressive'],
        distribution: ['balanced', 'middle', 'opposite', 'wings'],
        target: ['weak', 'mixed', 'libero'],
        block: ['read', 'opposite', 'middle', 'wings'],
        pace: ['balanced', 'fast', 'control']
      }))
        if (!opts.includes(t?.[k]) && !(['target', 'block'].includes(k) && /^player:\d+$/.test(t?.[k]))) return false;
    }
    for (let e of m.events)
      if (
        ![
          'Erro de saque',
          'Infração de saque',
          'Ace',
          'Ataque para fora',
          'Bloqueio ponto',
          'Ponto de ataque',
          'Infração',
          'Erro de defesa'
        ].includes(e.reason) ||
        !Number.isInteger(e.set) ||
        !Array.isArray(e.score) ||
        e.score.length !== 2 ||
        e.score.some(n => !Number.isInteger(n) || n < 0) ||
        !Array.isArray(e.rotation) ||
        e.rotation.length !== 2 ||
        e.rotation.some(n => !Number.isInteger(n) || n < 0 || n > 5) ||
        !v.all.some(p => p.id === e.actor) ||
        ![0, 1].includes(e.winner) ||
        ![0, 1].includes(e.serving) ||
        !Array.isArray(e.steps) ||
        e.steps.some(
          s => !v.all.some(p => p.id === s.player) || (s.type === 'set' && !v.all.some(p => p.id === s.target))
        )
      )
        return false;
    return true;
  } catch {
    return false;
  }
}
function awards(m) {
  let entries = [0, 1].flatMap(side =>
    Object.entries(stats(m.events, side).players).map(([id, p]) => ({
      id: Number(id),
      ...p,
      points: p.kills + p.aces + p.blocks,
      value: p.kills + p.aces + p.blocks - p.errors - p.blocked - p.serveErrors
    }))
  );
  return `<div class="note">${[
    ['MVP', 'value'],
    ['Maior pontuador', 'points'],
    ['Melhor bloqueador', 'blocks'],
    ['Melhor sacador', 'aces']
  ]
    .map(([label, k]) => {
      let p = [...entries].sort((a, b) => b[k] - a[k] || a.id - b.id)[0];
      return `<p>${label}: <strong>${athleteLabel(player(p.id))}</strong>${k === 'value' ? '' : ` · ${p[k]}`}</p>`;
    })
    .join(
      ''
    )}<small>MVP: pontos menos erros de saque, ataque e bloqueios sofridos. Empates: ordem do cadastro.</small></div>`;
}

function storyCards(items) {
  return items.length
    ? `<div class="story-list">${items.map(s => `<article class="story"><div class="eyebrow">${s.importance >= 5 ? 'Momento decisivo' : 'A história do jogo'} · Set ${s.set} · ${s.score.join('–')}</div><h3>${s.title}</h3><p>${s.body}</p></article>`).join('')}</div>`
    : '';
}
function setNarrativeText(m, set, side) {
  let ev = m.events.filter(e => e.set === set),
    opp = 1 - side,
    st = stats(ev, side),
    so = stats(ev, opp),
    att = ev
      .flatMap(e => e.steps || [])
      .filter(x => x.team === side && x.type === 'attack' && x.outcome !== 'cancelled'),
    kills = att.filter(x => ['kill', 'faultWin', 'defenseError'].includes(x.outcome)),
    quick = att.filter(x => x.setType === 'QUICK'),
    quickKills = quick.filter(x => ['kill', 'faultWin', 'defenseError'].includes(x.outcome)),
    hands = kills.filter(x => ['OUTSIDE_HAND', 'BLOCK_OUT'].includes(x.finish)),
    pipe = att.filter(x => x.origin === 'BACK_MIDDLE'),
    pipeKills = pipe.filter(x => ['kill', 'faultWin', 'defenseError'].includes(x.outcome)),
    oppId = m.teams[side].find(x => x.pos === 'OPO')?.id,
    oppAtt = att.filter(x => x.player === oppId),
    oppKills = oppAtt.filter(x => ['kill', 'faultWin', 'defenseError'].includes(x.outcome)),
    rec = ev.flatMap(e => e.steps || []).filter(x => x.team === side && x.type === 'receive'),
    late = ev
      .filter(e => Math.max(...(e.scoreBefore || [0, 0])) >= 18)
      .flatMap(e => e.steps || [])
      .filter(x => x.team === side && x.type === 'receive'),
    early = ev
      .filter(e => Math.max(...(e.scoreBefore || [0, 0])) < 18)
      .flatMap(e => e.steps || [])
      .filter(x => x.team === side && x.type === 'receive'),
    avg = a => (a.length ? a.reduce((n, x) => n + x.quality, 0) / a.length : 0),
    rate = (a, b) => (b ? a / b : 0);
  let signals = [];
  const add = (score, text) => signals.push({ score, text });
  let attackEff = rate((st.kills || 0) - (st.errors || 0) - (st.blocked || 0), st.attacks || 0),
    oppEff = rate((so.kills || 0) - (so.errors || 0) - (so.blocked || 0), so.attacks || 0),
    sideout = rate(st.sideout, st.received),
    oppSideout = rate(so.sideout, so.received),
    breakRate = rate(st.breaks, st.served),
    oppBreak = rate(so.breaks, so.served);
  if ((st.aces || 0) - (so.aces || 0) >= 3)
    add(8, `O saque abriu a diferença: ${st.aces} aces contra ${so.aces} do rival.`);
  if ((st.blocks || 0) - (so.blocks || 0) >= 3)
    add(8, `O bloqueio produziu vantagem direta: ${st.blocks} pontos contra ${so.blocks}.`);
  if ((so.errorPoints || 0) - (st.errorPoints || 0) >= 4)
    add(
      7,
      `A equipe ofereceu menos pontos de graça: ${st.errorPoints} erros que deram ponto contra ${so.errorPoints}.`
    );
  if (st.attacks >= 12 && so.attacks >= 12 && attackEff - oppEff >= 0.1)
    add(
      7,
      `O ataque foi mais eficiente no conjunto da parcial: ${signedPct(st.kills - st.errors - st.blocked, st.attacks)} contra ${signedPct(so.kills - so.errors - so.blocked, so.attacks)}.`
    );
  if (st.received >= 8 && so.received >= 8 && sideout - oppSideout >= 0.11)
    add(7, `A virada de bola sustentou o set: ${pct(st.sideout, st.received)} contra ${pct(so.sideout, so.received)}.`);
  if (st.served >= 8 && so.served >= 8 && breakRate - oppBreak >= 0.1)
    add(
      6,
      `Com o saque, a equipe converteu mais oportunidades de break: ${pct(st.breaks, st.served)} contra ${pct(so.breaks, so.served)}.`
    );
  if (early.length >= 4 && late.length >= 4 && avg(early) - avg(late) >= 0.55)
    add(
      7,
      `O passe caiu na reta final e reduziu as opções de construção. A equipe precisou jogar mais bolas fora do sistema.`
    );
  if (hands.length >= 3)
    add(
      6,
      `${athleteLabel(player(hands[0].player))} encontrou soluções contra o bloqueio: ${hands.length} pontos explorando as mãos adversárias.`
    );
  if (oppAtt.length >= 8 && oppKills.length >= 5)
    add(6, `A saída carregou boa parte do ataque: ${oppKills.length} pontos em ${oppAtt.length} bolas para o oposto.`);
  if (pipe.length >= 4 && pipeKills.length >= 3)
    add(
      5,
      `O ataque pelo fundo ajudou a abrir a rede: ${pipeKills.length} pontos em ${pipe.length} bolas pelo dos três.`
    );
  if (quick.length >= 6 && quickKills.length / quick.length >= 0.65)
    add(
      5,
      `O primeiro tempo foi muito eficiente quando apareceu: ${quickKills.length} pontos em ${quick.length} bolas.`
    );
  signals.sort((a, b) => b.score - a.score);
  if (signals.length) return signals[0].text;
  if (rec.length)
    return `A recepção terminou com ${pct(rec.filter(x => x.quality >= 3).length, rec.length)} de passe positivo. O set foi decidido pelo equilíbrio entre primeira bola, virada e pressão no saque.`;
  return 'O set foi decidido pela soma entre saque, passe, ataque, bloqueio e erros que deram ponto.';
}
function liveStory(m) {
  let set = m.setScores.length;
  if (set && (m.done || m.events.at(-1)?.set === set)) {
    let score = m.setScores.at(-1),
      winner = score[0] > score[1] ? 0 : 1,
      c = club([m.home, m.away][winner]),
      events = m.events.filter(e => e.set === set),
      a = stats(events, winner),
      b = stats(events, 1 - winner),
      best = Object.entries(a.players).sort(
        (x, y) => y[1].kills + y[1].aces + y[1].blocks - (x[1].kills + x[1].aces + x[1].blocks)
      )[0];
    return `<div class="match-story set-winner" style="--team:${c.color}"><small>FIM DO ${set}º SET</small><h3>${c.name} fecha: ${score[winner]}–${score[1 - winner]}</h3><p>${setNarrativeText(m, set, winner)}</p><small>${a.kills} pontos de ataque · ${a.blocks} bloqueios · ${a.aces} aces · ${b.errorPoints} pontos recebidos em erros adversários.</small>${best ? `<small>Destaque: ${athleteLabel(player(best[0]))} · ${best[1].kills + best[1].aces + best[1].blocks} pontos no set.</small>` : ''}</div>`;
  }
  let side = m.home === state.club ? 0 : 1,
    recent = m.events.slice(-6),
    won = recent.filter(e => e.winner === side).length;
  return `<div class="match-story"><h3>${recent.length < 4 ? 'Primeiros movimentos' : won >= 4 ? '↑ Você crescendo' : won <= 2 ? '↓ Rival em melhor momento' : '→ Disputa equilibrada'}</h3><p>${recent.length ? won + ' dos últimos ' + recent.length + ' pontos para seu time.' : 'O primeiro saque abre a história da partida.'}</p></div>`;
}
function editorialHome() {
  let m = state.last,
    own = state.results.filter(m => m.home === state.club || m.away === state.club),
    f = form(state.results, state.club),
    h = m ? highlights(m, state.all, 1)[0] : null,
    stage =
      state.round >= 6
        ? 'Balanço da campanha'
        : state.round >= 4
          ? 'Reta final'
          : state.round >= 2
            ? 'A temporada ganha forma'
            : 'Primeiros capítulos';
  return `<section class="editorial"><div class="eyebrow">${stage}</div><h2>${h ? h.title : !own.length ? 'A primeira história começa em quadra' : f.count >= 2 ? `${f.count} ${f.won ? 'vitórias' : 'derrotas'} seguidas. Qual será a resposta?` : 'Um novo capítulo pela frente'}</h2><p>${h ? h.body : !own.length ? 'Escolha quem começa jogando. Um reserva pode ganhar espaço, uma sequência pode mudar o set e cada confronto vai deixar um registro.' : `${own.length} partidas disputadas. O próximo ajuste nasce do que aconteceu em quadra.`}</p><div class="split">${m ? button('Rever a história do jogo', 'history:' + state.results.indexOf(m)) : button('Preparar estreia', 'match', 'primary')}${own.length ? button('Memória da campanha', 'memory') : ''}</div></section>`;
}
function clubNews() {
  let roster = state.all.filter(p => p.club === state.club),
    stories = roster
      .map(p => ({ p, s: playerStory(p, state.results) }))
      .sort(
        (a, b) =>
          Number(['Em alta', 'Jovem em destaque', 'Pressionado'].includes(b.s.label)) -
          Number(['Em alta', 'Jovem em destaque', 'Pressionado'].includes(a.s.label))
      )
      .slice(0, 2),
    league = clubs
      .filter(c => c.id !== state.club)
      .map(c => ({ c, f: form(state.results, c.id) }))
      .filter(x => x.f.count >= 2);
  return `<div class="panel"><h2>No seu clube</h2>${stories.map(({ p, s }) => `<div class="news-item"><span class="tag">${s.label}</span><h3><button class="text-button" data-player="${p.id}">${athleteLabel(p)}</button></h3><p>${s.body}</p></div>`).join('')}</div><div class="panel"><h2>Pela liga</h2>${league.length ? league.map(({ c, f }) => `<div class="news-item"><h3>${c.name}</h3><p>${f.count} ${f.won ? 'vitórias' : 'derrotas'} consecutivas na Copa Laboratório.</p></div>`).join('') : state.results.length ? `<p>${standings()[0].name} ocupa o primeiro lugar com ${standings()[0].points} pontos. ${state.round < fixtures.length ? 'A próxima rodada pode mudar o cenário.' : 'A campanha está concluída.'}</p>` : '<p>Os oito clubes chegam à primeira rodada sem resultados. As notícias surgem do que acontecer na competição.</p>'}</div>`;
}
function recentPlayerForm(p) {
  let games = state.results.filter(m => m.home === p.club || m.away === p.club).slice(-5),
    values = [];
  for (let m of games) {
    let r = ratingRows(m).find(x => x.id === p.id && x.actions >= 3);
    if (r) values.push(r.grade);
  }
  let avg = values.length ? values.reduce((a, b) => a + b, 0) / values.length : null,
    best = values.length ? Math.max(...values) : null,
    label =
      avg === null
        ? 'Sem amostra'
        : avg >= 7.45
          ? 'Em grande fase'
          : avg >= 7.0
            ? 'Em alta'
            : avg >= 6.55
              ? 'Estável'
              : avg >= 6.15
                ? 'Oscilando'
                : 'Em baixa';
  return { n: values.length, avg, best, label, values };
}
function coachRelationship(p) {
  let hist = state.results
    .flatMap(m =>
      (m.coachTalkHistory || []).flatMap(h =>
        (h.reactions || []).filter(r => r.id === p.id).map(r => ({ ...r, kind: h.kind, tone: h.tone }))
      )
    )
    .slice(-8);
  if (!hist.length) return '';
  let score = hist.reduce((n, r) => n + (r.delta || 0) + (r.morale || 0) + (r.chemistry || 0) * 1.5, 0) / hist.length,
    label =
      score >= 3
        ? 'Responde bem às mensagens do treinador'
        : score <= -0.5
          ? 'Tem reagido mal a algumas cobranças'
          : 'Relação estável com a comissão';
  return `<div class="coach-memory"><small>RELAÇÃO COM O TREINADOR</small><strong>${label}</strong><span>${hist.length} interações recentes registradas.</span></div>`;
}
function playerNarrative(p) {
  let s = playerStory(p, state.results),
    f = recentPlayerForm(p),
    moments = state.results
      .flatMap(m =>
        highlights(m, state.all, 20)
          .filter(h => h.actor === p.id)
          .map(h => ({ ...h, round: m.round }))
      )
      .slice(-3),
    form = `<div class="player-form"><span class="tag">${f.label}</span><b>${f.avg !== null ? f.avg.toFixed(2) : '—'}</b><small>${f.n ? `nota média nas últimas ${f.n} aparições` : 'a forma começa quando houver jogos'}</small></div>`;
  return `<div class="note"><h3>${s.label}</h3><p>${s.body}</p>${form}</div>${p.club === state.club ? coachRelationship(p) : ''}${moments.length ? `<h3 style="margin-top:20px">Momentos desta campanha</h3>${storyCards(moments)}` : ''}`;
}
function seasonMemory(full = false) {
  let own = state.results.filter(m => m.home === state.club || m.away === state.club);
  if (!own.length)
    return '<div class="note"><h3>A memória começa no primeiro jogo</h3><p>Grandes sequências, viradas e reencontros serão registrados aqui.</p></div>';
  let records = own
      .flatMap(m => {
        let s = matchStats(m, m.home === state.club ? 0 : 1);
        return Object.entries(s.players).map(([id, p]) => ({ id: Number(id), points: p.kills + p.aces + p.blocks, m }));
      })
      .sort((a, b) => b.points - a.points),
    best = records[0],
    games = full ? own : own.slice(-3);
  return `<div class="panel"><div class="panelhead"><h2>Memória da campanha</h2><span class="tag">${own.length} JOGOS</span></div>${state.round === fixtures.length ? `<h3>Campeão: ${standings()[0].name}</h3>` : ''}<p>Recorde de pontos em uma partida do seu clube: <b>${athleteLabel(player(best.id))}, ${best.points}</b>, na rodada ${best.m.round + 1}.</p>${games
    .map(m => {
      let h = highlights(m, state.all, 1)[0];
      return `<article class="memory-game"><div><small>Rodada ${m.round + 1} · ${m.setScores.length === 5 ? 'Tie-break' : 'Jogo concluído'}</small><h3>${club(m.home).short} ${m.sets.join(' × ')} ${club(m.away).short}</h3><p>${h ? h.title : 'Resultado e estatísticas preservados.'}</p></div>${button('Rever', 'history:' + state.results.indexOf(m))}</article>`;
    })
    .join('')}<h3 style="margin-top:20px">Reencontros</h3>${clubs
    .filter(c => c.id !== state.club)
    .map(c => {
      let r = rivalry(state.results, state.club, c.id);
      return r.games.length
        ? `<p>${c.name}: ${r.wins} vitória(s), ${r.losses} derrota(s)${r.tiebreaks ? ` · ${r.tiebreaks} tie-break(s)` : ''}.</p>`
        : '';
    })
    .join('')}<small>Histórico desta Copa. Carreira com várias temporadas ainda não está disponível.</small></div>`;
}
function bindDialogHistory() {
  document.querySelectorAll('#detail [data-action]').forEach(
    e =>
      (e.onclick = () => {
        let m = state.results[Number(e.dataset.action.slice(8))];
        if (m) {
          $('#detail').close();
          reportDialog(m);
        }
      })
  );
}
function coachPanel(m) {
  let side = m.home === state.club ? 1 : 0,
    id = side === 0 ? m.home : m.away,
    c = coaches[id],
    ds = (m.decisions || []).filter(d => d.side === side && d.automatic),
    last = ds.at(-1);
  return `<div class="coach-card"><span class="eyebrow">Banco adversário · ${c.label}</span><h3>${c.name}</h3><p>${last ? (last.reason === 'player-state-sub' ? 'O treinador reagiu a um atleta sob pressão e mexeu no passe.' : last.reason === 'player-state-protect' ? 'O rival protegeu um passador que vinha sofrendo no saque.' : last.type === 'timeout' ? 'O treinador interrompeu o jogo para reorganizar o time.' : last.type === 'sub' ? 'O treinador acionou o banco para renovar o time.' : 'O treinador ajustou o plano tático.') : c.description}</p></div>`;
}

function setAnalysis(m, set) {
  let events = m.events.filter(e => e.set === set),
    ss = [0, 1].map(side => stats(events, side));
  if (!events.length) return '<p>O diagnóstico começa com os primeiros pontos deste set.</p>';
  let score = events.at(-1).score,
    lead = score[0] === score[1] ? null : score[0] > score[1] ? 0 : 1,
    ended = set <= m.setScores.length,
    rows = [
      ['Saque: aces', ...ss.map(s => s.aces)],
      ['Erros de saque', ...ss.map(s => s.serveErrors)],
      ['Bloqueios ponto', ...ss.map(s => s.blocks)],
      [
        'Passe positivo',
        ...ss.map(s => benchmarkPct(s.positive, s.receptions, 'receive') + ' (n=' + s.receptions + ')')
      ],
      ['Passe na mão', ...ss.map(s => pct(s.perfect, s.receptions))],
      ['Defesas realizadas', ...ss.map(s => Object.values(s.players).reduce((n, p) => n + p.defenses, 0))],
      ['Eficiência de ataque', ...ss.map(s => benchmarkPct(s.kills - s.errors - s.blocked, s.attacks, 'efficiency'))],
      ['Erros que deram ponto', ...ss.map(s => s.errorPoints)]
    ];
  let reasons = '';
  if (lead !== null) {
    let a = ss[lead],
      b = ss[1 - lead],
      parts = [
        ['pontos de ataque', a.kills - b.kills],
        ['aces', a.aces - b.aces],
        ['bloqueios ponto', a.blocks - b.blocks],
        ['pontos recebidos em erros do adversário', b.errorPoints - a.errorPoints]
      ]
        .filter(x => x[1] > 0)
        .sort((a, b) => b[1] - a[1]);
    reasons = `${club(lead === 0 ? m.home : m.away).name} ${ended ? 'venceu' : 'lidera'} por ${score[lead]} a ${score[1 - lead]}. ${
      parts.length
        ? 'As maiores vantagens no saldo foram ' +
          parts
            .slice(0, 2)
            .map(([k, v]) => v + ' ' + k)
            .join(' e ') +
          '.'
        : ''
    } ${setNarrativeText(m, set, lead)}`;
  } else
    reasons = 'Placar empatado. Compare o passe, a virada de bola, o saque e os erros para orientar o próximo ajuste.';
  return `<h3>${ended ? 'Resumo' : 'Diagnóstico'} do ${set}º set · ${score.join(' × ')}</h3><p>${reasons}</p>${setMomentMemory(m, set)}${table(
    ['Fundamento', club(m.home).short, club(m.away).short],
    rows.map(r => '<tr>' + r.map(x => '<td>' + x + '</td>').join('') + '</tr>')
  )}<small>Saldo de pontos explica o placar; passe e defesa ajudam a interpretar o jogo. Defesas são ações realizadas, não uma taxa de sucesso.</small>`;
}
function ratingRows(m) {
  if ((!m.events || !m.events.length) && Array.isArray(m.ratings)) return m.ratings;
  return [0, 1]
    .flatMap(side =>
      Object.entries(stats(m.events, side).players).map(([id, p]) => {
        let athlete = player(id),
          sets = m.events
            .flatMap(e => e.steps || [])
            .filter(s => s.type === 'set' && s.player === Number(id) && Number.isFinite(s.precision)),
          actions =
            p.attacks + p.receptions + p.aces + p.blocks + p.serveErrors + p.defenses + p.infractions + sets.length,
          points = p.kills + p.aces + p.blocks;
        if (athlete.pos === 'LEV' && sets.length) {
          let precision = sets.reduce((n, s) => n + s.precision, 0) / sets.length,
            decision = sets.reduce((n, s) => n + (s.expected - s.bestExpected), 0) / sets.length,
            adv = sets.filter(s => s.nblock <= 1).length / sets.length,
            oos = sets.filter(s => s.quality <= 2 || s.transition),
            oosQuality = oos.length ? oos.reduce((n, s) => n + s.precision, 0) / oos.length : precision,
            elite =
              Math.max(0, (precision - 90) / 8) * 0.4 +
              Math.max(0, (decision + 0.015) / 0.015) * 0.22 +
              Math.max(0, (adv - 0.4) / 0.25) * 0.18,
            grade =
              5.95 +
              clamp((precision - 68) / 18, -1.2, 1.2) * 0.88 +
              clamp((decision + 0.03) / 0.065, -1, 1) * 0.6 +
              clamp((adv - 0.42) / 0.27, -1, 1) * 0.32 +
              clamp((oosQuality - 60) / 20, -1, 1) * 0.23 +
              elite * 1.25 +
              (precision >= 88 && adv >= 0.5 && decision >= -0.02 ? 0.38 : 0) +
              (oos.length >= 8 && oosQuality >= 78 ? 0.22 : 0) +
              p.blocks * 0.06 +
              p.aces * 0.07 -
              p.serveErrors * 0.1 -
              p.settingErrors * 0.28;
          return { id: Number(id), side, actions, points, grade: clamp(grade, 4, 8.7) };
        }
        let impact = 0,
          den = 2.7 + actions * 0.115,
          bonus = 0;
        if (athlete.pos === 'PON') {
          impact =
            p.kills * 0.64 +
            p.aces * 0.92 +
            p.blocks * 0.84 +
            p.defenses * 0.18 +
            p.positive * 0.23 -
            p.errors * 0.94 -
            p.blocked * 0.6 -
            p.serveErrors * 0.74 -
            (p.receptions - p.positive) * 0.16;
          den = 2.8 + actions * 0.12;
          let kr = p.attacks ? p.kills / p.attacks : 0,
            pr = p.receptions ? p.positive / p.receptions : 0;
          if (p.attacks >= 12 && kr >= 0.55) bonus += 0.38;
          if (p.receptions >= 10 && pr >= 0.55) bonus += 0.22;
          if (points >= 18) bonus += 0.28;
        } else if (athlete.pos === 'CEN') {
          impact =
            p.kills * 0.6 +
            p.aces * 0.85 +
            p.blocks * 0.98 +
            p.defenses * 0.08 -
            p.errors * 0.96 -
            p.blocked * 0.56 -
            p.serveErrors * 0.73;
          den = 3.7 + actions * 0.155;
          let kr = p.attacks ? p.kills / p.attacks : 0;
          if (p.attacks >= 8 && kr >= 0.6) bonus += 0.3;
          if (p.blocks >= 4) bonus += 0.28;
          if (points >= 14) bonus += 0.22;
        } else if (athlete.pos === 'OPO') {
          impact =
            p.kills * 0.66 +
            p.aces * 0.92 +
            p.blocks * 0.8 +
            p.defenses * 0.1 -
            p.errors -
            p.blocked * 0.64 -
            p.serveErrors * 0.77;
          den = 3.0 + actions * 0.125;
          let kr = p.attacks ? p.kills / p.attacks : 0;
          if (p.attacks >= 14 && kr >= 0.55) bonus += 0.36;
          if (points >= 20) bonus += 0.32;
        } else if (athlete.pos === 'LIB') {
          impact =
            p.defenses * 0.38 + p.positive * 0.27 - (p.receptions - p.positive) * 0.19 - (p.defenseErrors || 0) * 0.9;
          den = 2.8 + actions * 0.12;
          let pr = p.receptions ? p.positive / p.receptions : 0;
          if (p.receptions >= 15 && pr >= 0.6) bonus += 0.38;
          if (p.defenses >= 10) bonus += 0.32;
          if (p.receptions >= 18 && pr >= 0.65 && p.defenses >= 8) bonus += 0.25;
        }
        return { id: Number(id), side, actions, points, grade: clamp(6 + impact / den + bonus, 3.8, 9.4) };
      })
    )
    .sort((a, b) => b.grade - a.grade || b.actions - a.actions);
}
function liveRatings(m) {
  let rows = ratingRows(m),
    star = rows.find(p => p.actions >= 5);
  return `<div class="panel"><h2>Notas e destaque até agora</h2>${star ? `<div class="note"><h3>${athleteLabel(player(star.id))} · ${star.grade.toFixed(1)}</h3><p>${club(star.side === 0 ? m.home : m.away).short} · ${star.points} pontos diretos · destaque provisório.</p></div>` : '<p>Aguardando um atleta com pelo menos cinco ações registradas para apontar o destaque.</p>'}${table(
    ['Atleta', 'Nota', 'Pontos'],
    rows.map(
      p =>
        `<tr><td>${athleteLabel(player(p.id))}<small>${player(p.id).pos} · ${club(p.side === 0 ? m.home : m.away).short}</small></td><td>${p.actions >= 3 ? p.grade.toFixed(1) : '—'}</td><td>${p.points}</td></tr>`
    )
  )}<small>Nota experimental a partir de três ações. A escala do levantador foi recalibrada para não receber vantagem estrutural apenas pelo volume de levantamentos; grandes notas agora exigem precisão, decisão e criação de vantagem acima da média.</small></div>`;
}
function coachingPanel(m) {
  if (m.done) return '';
  if (!m.coaching) return '';
  const side = m.home === state.club ? 0 : 1;
  if (m.breakKind === 'set' && benchTab === 'setstory') return setBreakPanel(m, m.setScores.length, side);
  const review = benchReview(m),
    set = m.breakKind === 'set' ? m.setScores.length : m.setScores.length + 1,
    st = stats(
      m.events.filter(e => e.set === set),
      side
    ),
    fields = tacticalForm(m.tactics[side]).match(/<label[\s\S]*?<\/label>/g) || [];
  let body = '';
  if (benchTab === 'analyst') body = stateAssistantCue(m, side) + assistantPanel(m, set);
  else if (benchTab === 'talk') body = compactTalk(m);
  else if (benchTab === 'summary') body = compactBenchSummary(m, set, side);
  else {
    const groups = [fields.slice(0, 3), fields.slice(3, 6), fields.slice(6)],
      page = Math.min(benchPage, groups.length - 1);
    body =
      '<div class="bench-fields">' +
      groups[page].join('') +
      '</div><div class="bench-pager">' +
      button('←', 'bench-page:' + Math.max(0, page - 1), '', page === 0) +
      '<span>Ajustes ' +
      (page + 1) +
      ' / ' +
      groups.length +
      '</span>' +
      button('→', 'bench-page:' + Math.min(groups.length - 1, page + 1), '', page === groups.length - 1) +
      '</div>';
  }
  let threshold = Math.max(...m.score),
    breakTitle =
      m.breakKind === 'technical'
        ? `INTERVALO · ${threshold >= 16 ? '16' : '8'} PONTOS`
        : m.breakKind === 'highlight'
          ? 'MOMENTO DECISIVO'
          : m.breakKind === 'set'
            ? 'INTERVALO ENTRE SETS'
            : m.breakKind === 'opening'
              ? 'PRÉ-JOGO'
              : 'COMISSÃO TÉCNICA',
    breakSub =
      m.breakKind === 'technical'
        ? 'Parada curta para leitura e orientação'
        : m.breakKind === 'highlight'
          ? 'O próximo rally merece atenção total'
          : m.breakKind === 'opening'
            ? 'Últimos ajustes antes do primeiro saque'
            : 'Ajuste o time antes de retomar';
  return (
    '<section class="bench-board break-' +
    (m.breakKind || 'coach') +
    '"><div class="bench-context"><small>' +
    breakTitle +
    '</small><strong>' +
    breakSub +
    '</strong></div><div class="bench-score"><div class="bench-score-team"><span>' +
    club(m.home).short +
    '</span><b>' +
    m.score[0] +
    '</b></div><div class="bench-score-center"><small>SET ' +
    (m.setScores.length + 1) +
    '</small><strong>' +
    m.sets.join('–') +
    '</strong><span>SETS</span></div><div class="bench-score-team away"><b>' +
    m.score[1] +
    '</b><span>' +
    club(m.away).short +
    '</span></div></div><div class="bench-summary">' +
    (m.events.length
      ? 'Neste set · ' + st.aces + ' aces · ' + st.blocks + ' bloqueios · ' + st.errorPoints + ' erros'
      : 'Plano inicial · acompanhe os primeiros pontos') +
    (focusLoad(m, side) ? ' · Atenção do time oscilando' : '') +
    '</div><nav class="bench-tabs" aria-label="Comissão técnica">' +
    [
      ['analyst', 'Auxiliar'],
      ['talk', needsTalk(m) || m.breakKind === 'technical' ? 'Falar •' : 'Falar ✓'],
      ['tactics', 'Tática'],
      ['summary', 'Resumo']
    ]
      .map(
        ([id, title]) =>
          '<button data-action="bench-tab:' + id + '" aria-pressed="' + (benchTab === id) + '">' + title + '</button>'
      )
      .join('') +
    '</nav><div class="bench-body">' +
    body +
    '</div><div class="bench-footer">' +
    (needsTalk(m)
      ? button(
          m.breakKind === 'opening' ? 'Escolher fala antes de iniciar' : 'Escolher fala',
          'bench-tab:talk',
          'primary'
        )
      : button(
          m.breakKind === 'opening' ? 'INICIAR JOGO' : m.events.length ? 'Voltar ao jogo' : 'Começar partida',
          'play',
          'primary'
        )) +
    button('Ver quadra', 'overlay-close') +
    '</div></section>'
  );
}

function resumeMatch() {
  if (match) {
    let opening = match.breakKind === 'opening';
    delete match.breakKind;
    match.coaching = false;
    commit();
    if (opening) requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: 'instant' }));
  }
}
function checkInterval(m) {
  if (m.done) return false;
  let last = m.events.at(-1);
  if (!last || last.set !== m.setScores.length + 1) return false;
  let leader = Math.max(...last.score),
    previous = Math.max(...last.scoreBefore),
    thresholds = last.set === 5 ? [8] : [8, 16];
  return thresholds.some(n => previous < n && leader >= n);
}

function teamIdentity(m, side) {
  let c = club(side === 0 ? m.home : m.away),
    serving = !m.done && m.server === side;
  return `<div class="team-identity ${serving ? 'has-serve' : ''}" style="--team:${c.color}">${crest(c)}<div class="match-team-copy"><span class="match-team-kicker">${c.id === state.club ? 'SEU TIME' : 'ADVERSÁRIO'} · ${side === 0 ? 'CASA' : 'FORA'}</span><strong>${c.name}</strong><b class="match-team-short">${c.short}</b>${serving ? '<span class="serve-indicator">● SAQUE</span>' : ''}</div></div>`;
}
function onCourt(m) {
  let ratings = ratingRows(m);
  function card(p, position, serving, liberoActive = false) {
    let r = ratings.find(r => r.id === p.id),
      side = p.club === m.home ? 0 : 1,
      ss = stats(m.events, side).players[p.id],
      extra = ss
        ? p.pos === 'LIB'
          ? `Recepção ${benchmarkPct(ss.positive, ss.receptions, 'receive', p.pos)} · ${ss.defenses} defesas`
          : p.pos === 'LEV'
            ? `Precisão ${setterPrecision(m, p.id)}`
            : `Ataque ${benchmarkPct(ss.kills, ss.attacks, 'attack', p.pos)} · ${ss.blocks} bloqueios`
        : 'Aguardando ações.';
    return `<article class="court-athlete ${serving ? 'is-serving' : ''} ${liberoActive ? 'is-libero' : ''}" data-court-player="${p.id}"><button class="court-action" data-action="court-action:${p.id}" aria-describedby="hover-${p.id}"><span class="court-card-top"><b class="court-pos">${position.replace('P', '')}</b><span class="athlete-top">${liberoActive ? 'LÍBERO' : p.pos}</span>${serving ? '<i class="court-serve-dot">●</i>' : ''}</span><strong class="athlete-name">${p.name}</strong><span class="compact-rating"><b>★ ${r && r.actions >= 3 ? r.grade.toFixed(1) : '—'}</b><i>${r?.points || 0} pts</i></span></button>${courtSignal(m, p).replace(/<details class="court-signal"><summary>(.*?)<\/summary>[\s\S]*?<\/details>/, '<div class="court-state">$1</div>')}<div class="player-hover" id="hover-${p.id}" role="tooltip"><strong>${athleteLabel(p)} · ${p.pos}</strong><p>Físico ${Math.round(p.condition)} · Confiança ${Math.round(p.confidence ?? p.morale)}<br>${confidence(p.confidence ?? p.morale)}</p><p>${extra}</p>${liberoActive ? '<small>Líbero em quadra no lugar do central do fundo. A troca não consome substituição.</small>' : ''}${courtSignal(m, p)}<small>${
      m.events
        .filter(e => e.actor === p.id)
        .slice(-2)
        .map(e => feedLine(e, player))
        .join(' · ') || 'Sem ações decisivas recentes.'
    }</small></div></article>`;
  }
  return `<div class="panel on-court unified-court">${[0, 1]
    .map(side => {
      let c = club([m.home, m.away][side]),
        rot = m.rotation[side],
        positions = side === 0 ? [0, 5, 4, 1, 2, 3] : [3, 2, 1, 4, 5, 0],
        court = activeSix(m, side);
      return `${side === 1 ? '<div class="court-net" aria-label="Rede central"><span>REDE</span></div>' : ''}<section class="team-court half-${side}" style="--team:${c.color}"><div class="half-label"><strong>${c.short}</strong><span>ROTAÇÃO ${rot + 1}</span></div><div class="live-court">${positions
        .map(position => {
          let entry = court.find(e => e.position === position);
          return entry
            ? card(
                entry.player,
                'P' + (position + 1),
                !m.done && m.server === side && position === 0,
                entry.player.pos === 'LIB'
              )
            : '';
        })
        .join('')}</div></section>`;
    })
    .join('')}</div>`;
}

function migrateHeights(v) {
  if (!v || !Array.isArray(v.all)) return;
  for (const p of v.all) if (p) p.height_cm ??= heightFor(p);
  for (const m of [...(Array.isArray(v.results) ? v.results : []), ...(v.active ? [v.active] : [])]) {
    if (!m || !Array.isArray(m.teams)) continue;
    let pool = m.teams.flatMap(t => (Array.isArray(t) ? t : [])).concat(Object.values(m.bench || {}));
    for (const p of pool) {
      if (!p) continue;
      p.height_cm = v.all.find(q => q.id === p.id)?.height_cm || p.height_cm || heightFor(p);
    }
  }
}
function ensureAiTeamStyles(v) {
  v.tactics ??= {};
  for (const c of clubs) {
    if (c.id === v.club) continue;
    v.tactics[c.id] = { ...defaultTactics(c.id), protect: v.tactics[c.id]?.protect || 'none' };
  }
}
function ownReceiverOptions() {
  let ids =
    match && !match.done
      ? match.teams[match.home === state.club ? 0 : 1].map(p => p.id)
      : state.lines[state.club] || [];
  return ids
    .map(player)
    .filter(p => ['PON', 'LIB'].includes(p.pos))
    .map(p => ['player:' + p.id, athleteLabel(p)]);
}
function opponentAttackOptions() {
  let opp =
      match && !match.done
        ? [match.home, match.away].find(id => id !== state.club)
        : next()?.find(id => id !== state.club),
    ids = match && !match.done ? match.teams[match.home === state.club ? 1 : 0].map(p => p.id) : state.lines[opp] || [];
  return ids
    .map(player)
    .filter(p => ['PON', 'CEN', 'OPO'].includes(p.pos))
    .map(p => ['player:' + p.id, athleteLabel(p)]);
}
function leagueMatches() {
  return match && !match.done ? [...state.results, match] : state.results;
}
function benchmarkPct(a, b, key, pos = null) {
  let matches = leagueMatches(),
    league = pos
      ? matches.reduce(
          (out, m) => {
            for (let side of [0, 1])
              for (let [id, p] of Object.entries(matchStats(m, side).players || {})) {
                if (player(id)?.pos === pos)
                  for (let k of ['attacks', 'kills', 'errors', 'blocked', 'positive', 'receptions'])
                    out[k] += p[k] || 0;
              }
            return out;
          },
          { attacks: 0, kills: 0, errors: 0, blocked: 0, positive: 0, receptions: 0 }
        )
      : leagueAggregateStats(),
    map = {
      receive: ['positive', 'receptions'],
      attack: ['kills', 'attacks'],
      efficiency: ['kills', 'attacks'],
      sideout: ['sideout', 'received'],
      break: ['breaks', 'served']
    },
    [num, den] = map[key],
    la = key === 'efficiency' ? league.kills - league.errors - league.blocked : league[num],
    lb = league[den];
  return `${pct(a, b)} <small class="league-ref">Liga${pos ? ' ' + pos : ''} ${pct(la, lb)} · n=${lb}${b < 20 ? ' · Amostra baixa' : ''}${b && lb ? ' · ' + ((a / b - la / lb) * 100 >= 0 ? '+' : '') + Math.round((a / b - la / lb) * 100) + ' p.p.' : ''}</small>`;
}
function assistantPanel(m, set) {
  const items = benchReview(m).items,
    page = Math.min(benchPage, Math.max(0, items.length - 1)),
    item = items[page];
  if (!item)
    return '<div class="bench-empty"><h3>Sem mudança recomendada</h3><p>A amostra ainda não indica um ajuste. Mantenha o plano e acompanhe a execução.</p></div>';
  return (
    '<article class="bench-advice kind-' +
    (item.kind || 'LEITURA').toLowerCase() +
    '"><div class="bench-pager">' +
    button('←', 'bench-page:' + Math.max(0, page - 1), '', page === 0) +
    '<span>Sugestão ' +
    (page + 1) +
    ' / ' +
    items.length +
    '</span>' +
    button('→', 'bench-page:' + Math.min(items.length - 1, page + 1), '', page === items.length - 1) +
    '</div><small class="advice-kind">' +
    (item.kind || 'LEITURA') +
    '</small><h3>' +
    item.title +
    '</h3><p>' +
    item.detail +
    '</p><p class="bench-risk"><b>Risco:</b> ' +
    item.risk +
    '</p><div class="bench-choice" aria-live="polite">' +
    (item.response
      ? '<strong>' +
        (item.response === 'accepted' ? '✓ Aceita · ajuste aplicado' : 'Não aceita · plano mantido') +
        '</strong>'
      : button('Aceitar', 'bench-accept:' + page, 'primary') + button('Não aceitar', 'bench-decline:' + page)) +
    '</div></article>'
  );
}
function applyAdvice(index) {
  if (!match || match.done) return;
  if (!match.coaching) {
    stop();
    match.coaching = true;
    benchTab = 'analyst';
    commit();
    render();
    return;
  }
  respondAdvice(index, true);
}
function setterPanel() {
  let rows = setterMetrics(leagueMatches());
  return `<div class="panel"><h2>Setter+ · Qualidade do levantamento</h2><p>Índice experimental: 100 é a média dos levantadores elegíveis nesta competição. Combina decisão (30%), precisão (25%), vantagem de bloqueio (20%), resultado fora do sistema (15%) e controle de erros (10%). A escolha ofensiva agora também é influenciada pelo atributo de levantamento; o índice continua contextual e não deve ser lido isoladamente.</p>${
    rows.length
      ? table(
          ['Atleta', 'Bolas', 'Setter+', 'Decision+', 'Execution+', 'BlockAdv+', 'OOS+', 'ErrorCtrl+'],
          rows.map(
            r =>
              `<tr><td>${athleteLabel(player(r.id))}</td><td>${r.n}</td><td class="lime">${r.setterPlus.toFixed(1)}</td>${['decision', 'execution', 'blockAdv', 'oos', 'errorControl'].map(k => `<td>${r[k + 'Plus'] === null ? '—' : r[k + 'Plus'].toFixed(1)}</td>`).join('')}</tr>`
          )
        )
      : '<p>É preciso ter pelo menos dois levantadores com oito bolas com precisão e opções registradas nesta atualização. Partidas antigas sem esses dados não entram no índice.</p>'
  }<small>Decision+: valor esperado da opção escolhida versus a melhor opção disponível; Execution+: precisão registrada do levantamento; BlockAdv+: bolas contra até um bloqueador; OOS+: resultado fora do sistema; ErrorCtrl+: erros e bloqueios sofridos. Sem bolas fora do sistema, OOS+ fica sem nota.</small></div>`;
}
function languageDataPanels() {
  let m = state.last,
    side = m?.home === state.club ? 0 : 1,
    events = dataMode === 'last' && m ? m.events || [] : totalEvents();
  if (!events.length) return '';
  let teamSide = dataMode === 'last' && m ? side : 0,
    s = stats(events, teamSide),
    order = ['FRONT_LEFT', 'FRONT_MIDDLE', 'FRONT_RIGHT', 'BACK_LEFT', 'BACK_MIDDLE', 'BACK_RIGHT'],
    originRows = order.map(k => {
      let x = s.attackOrigins[k] || { attacks: 0, kills: 0 };
      return `<tr><td>${originLabel(k)}</td><td>${x.attacks}</td><td>${x.kills || 0}</td><td>${pct(x.kills || 0, x.attacks)}</td></tr>`;
    }),
    errorEvents = events.filter(e => e.errorTeam === teamSide),
    exclusiveErrors = {
      Saque: errorEvents.filter(e => !e.infraction && e.errorType === 'SERVE').length,
      Ataque: errorEvents.filter(e => !e.infraction && e.errorType === 'ATTACK').length,
      Recepção: errorEvents.filter(e => !e.infraction && e.errorType === 'RECEPTION').length,
      Defesa: errorEvents.filter(e => !e.infraction && e.errorType === 'DEFENSE').length,
      Levantamento: errorEvents.filter(e => !e.infraction && e.errorType === 'SETTING').length,
      Infrações: errorEvents.filter(e => !!e.infraction).length
    },
    infRows = Object.entries(s.infractionsByType || {})
      .sort((a, b) => b[1] - a[1])
      .map(([k, v]) => `<tr><td>${infractionLabel(k)}</td><td>${v}</td></tr>`),
    pipe = s.attackOrigins.BACK_MIDDLE || { attacks: 0, kills: 0 },
    quick = s.attackSetTypes.QUICK || { attacks: 0, kills: 0 },
    att = events
      .flatMap(e => e.steps || [])
      .filter(x => x.team === teamSide && x.type === 'attack' && x.outcome !== 'cancelled'),
    kills = att.filter(x => x.outcome === 'kill'),
    countFinish = k => att.filter(x => x.finish === k).length,
    countKillFinish = k => kills.filter(x => x.finish === k).length,
    handPts = countKillFinish('OUTSIDE_HAND') + countKillFinish('BLOCK_OUT'),
    clean = Math.max(0, kills.length - handPts - countKillFinish('BLOCK_DEFLECTION')),
    blockRows = [
      ['Pontos limpos', clean],
      ['Explorou bloqueio', countKillFinish('BLOCK_OUT')],
      ['Mão de fora', countKillFinish('OUTSIDE_HAND')],
      ['Desvio no bloqueio', countKillFinish('BLOCK_DEFLECTION')],
      ['Rejogo', countFinish('RECYCLE')],
      ['Bloqueado', att.filter(x => x.outcome === 'blocked').length]
    ].map(r => `<tr><td>${r[0]}</td><td>${r[1]}</td></tr>`),
    playerIds = [...new Set(att.map(x => x.player))],
    playerRows = playerIds
      .map(id => {
        let a = att.filter(x => x.player === id),
          k = a.filter(x => x.outcome === 'kill'),
          hands = k.filter(x => ['OUTSIDE_HAND', 'BLOCK_OUT'].includes(x.finish)).length,
          tips = k.filter(x => x.finish === 'TIP').length,
          recycle = a.filter(x => x.finish === 'RECYCLE').length,
          blocked = a.filter(x => x.outcome === 'blocked').length,
          errors = a.filter(x => x.outcome === 'error').length,
          clean = Math.max(0, k.length - hands - k.filter(x => x.finish === 'BLOCK_DEFLECTION').length);
        return { id, att: a.length, clean, hands, tips, recycle, blocked, errors };
      })
      .sort((a, b) => b.att - a.att)
      .map(
        x =>
          `<tr><td>${athleteLabel(player(x.id))}</td><td>${x.att}</td><td>${x.clean}</td><td>${x.hands}</td><td>${x.tips}</td><td>${x.recycle}</td><td>${x.blocked}</td><td>${x.errors}</td></tr>`
      ),
    receives = events.flatMap(e => e.steps || []).filter(x => x.team === teamSide && x.type === 'receive'),
    gradeOrder = ['ON_HAND', 'POSITIVE', 'OFF_NET', 'BROKEN', 'BURST', 'ERROR'],
    passRows = gradeOrder.map(g => {
      let n = receives.filter(
        x => (x.passGrade || { 0: 'ERROR', 1: 'BURST', 2: 'BROKEN', 3: 'POSITIVE', 4: 'ON_HAND' }[x.quality]) === g
      ).length;
      return `<tr><td>${passLabel(g)}</td><td>${n}</td><td>${pct(n, receives.length)}</td></tr>`;
    });
  return `<div class="metrics">${metric('Passe na mão', pct(s.perfect, s.receptions), s.perfect + ' / ' + s.receptions + ' recepções')}${metric('Ataque dos três', `${pipe.kills || 0}/${pipe.attacks || 0}`, 'Pontos / ataques pelo fundo do meio')}${metric('Primeiro tempo', `${quick.kills || 0}/${quick.attacks || 0}`, 'Pontos / bolas rápidas pelo meio')}</div><div class="grid"><div class="panel"><div class="panelhead"><h2>Qualidade do passe</h2><small>LINGUAGEM DE QUADRA</small></div>${table(['Passe', 'Ocorrências', '%'], passRows)}</div><div class="panel"><div class="panelhead"><h2>Ataque por origem</h2><small>MESMOS EVENTOS DO FEED</small></div>${table(['Origem', 'Ataques', 'Pontos', 'Conversão'], originRows)}</div></div><div class="panel"><div class="panelhead"><h2>Soluções contra o bloqueio</h2><small>RECURSO DO ATACANTE</small></div>${table(['Resultado / recurso', 'Ocorrências'], blockRows)}</div><div class="panel"><div class="panelhead"><h2>Leitura individual contra o bloqueio</h2><small>QUEM ENCONTROU SOLUÇÕES</small></div>${table(['Atleta', 'Ataques', 'Pontos limpos', 'Explorou mãos', 'Largadas', 'Rejogo', 'Bloqueado', 'Erros'], playerRows)}</div><div class="grid"><div class="panel"><div class="panelhead"><h2>Erros que deram ponto</h2><small>CATEGORIAS EXCLUSIVAS</small></div>${table(
    ['Fundamento', 'Pontos cedidos'],
    Object.entries(exclusiveErrors).map(r => `<tr><td>${r[0]}</td><td>${r[1]}</td></tr>`)
  )}<small>Cada ponto cedido aparece uma única vez. Quando o erro é uma infração, ele entra em Infrações e não volta a ser somado em Saque, Ataque ou Levantamento.</small></div>${infRows.length ? `<div class="panel"><div class="panelhead"><h2>Infrações registradas</h2><small>CONTEXTO REAL DO RALLY</small></div>${table(['Infração', 'Ocorrências'], infRows)}</div>` : '<div class="panel"><h2>Infrações registradas</h2><p>Nenhuma infração registrada nesta amostra.</p></div>'}</div>`;
}
function data() {
  let ctx = dataContext(),
    deep = ctx.events.length
      ? `<details class="advanced-data"><summary><span><b>Abrir análise avançada</b><small>Rotações, passe, origens do ataque, soluções contra bloqueio e Setter+</small></span><strong>ABRIR</strong></summary>${advancedDataBasics()}${languageDataPanels()}${setterPanel()}</details>`
      : '';
  return legacyData() + deep;
}
function lastPoint(m) {
  let e = m.events.at(-1);
  if (!e) return '';
  let phase = phaseCue(e),
    notable = notableFeedLine(e, player),
    target = e.set === 5 ? 15 : 25,
    gap = Math.abs(e.score[0] - e.score[1]),
    afterSetPoint = Math.max(...e.score) >= target - 1 && gap === 1,
    decisive = e.context?.matchPointBefore
      ? 'MATCH POINT'
      : e.context?.setPointBefore || afterSetPoint
        ? 'SET POINT'
        : '',
    showPhase = (e.highlight || e.context?.pressure >= 0.72) && phase;
  return `<div class="last-point ${e.infraction ? 'last-infraction' : ''}" style="--team:${club(e.winner === 0 ? m.home : m.away).color}"><div class="last-point-copy">${e.infraction && e.context?.pressure >= 0.65 ? '<small class="event-kicker">INFRAÇÃO</small>' : showPhase ? `<small class="event-kicker">${phase.toUpperCase()}</small>` : '<small class="event-kicker neutral">ÚLTIMO PONTO</small>'}<span>${feedLine(e, player)}</span>${notable ? `<small class="feed-subline">${notable}</small>` : ''}</div><div class="last-point-score"><b>${e.score.join('–')}</b><small>${club(e.winner === 0 ? m.home : m.away).short}</small></div><small class="last-point-meta">Set ${e.set}${decisive ? ' · ' + decisive : ''}</small></div>`;
}

function adjustmentFeedback(m, side) {
  const changes = (m.decisions || []).filter(d => d.type === 'tactic' && d.side === side).slice(-3);
  return changes
    .map(d => {
      const next = (m.decisions || []).find(q => q.type === 'tactic' && q.side === side && q.rally > d.rally),
        end = next?.rally ?? m.events.length,
        after = m.events.slice(d.rally, Math.min(end, d.rally + 8)).filter(e => e.set === d.set),
        before = m.events
          .slice(0, d.rally)
          .filter(e => e.set === d.set)
          .slice(-8);
      const metric = events => {
        const own = stats(events, side),
          opp = stats(events, 1 - side);
        if (d.key === 'target' || d.key === 'protect') {
          const who = d.key === 'target' ? 1 - side : side,
            id = Number(String(d.to).split(':')[1]),
            receives = events
              .flatMap(e => e.steps)
              .filter(s => s.team === who && s.type === 'receive' && (!Number.isFinite(id) || s.player === id));
          return receives.filter(s => s.quality >= 3).length + ' positivas / ' + receives.length + ' recepções';
        }
        if (d.key === 'block' || d.key === 'distribution') {
          const team = d.key === 'block' ? 1 - side : side;
          return ['PON', 'CEN', 'OPO']
            .map(pos => {
              const ids = m.teams[team].filter(p => p.pos === pos).map(p => p.id),
                a = events
                  .flatMap(e => e.steps)
                  .filter(s => s.type === 'attack' && s.team === team && ids.includes(s.player));
              return pos + ': ' + a.filter(s => s.outcome === 'kill').length + ' pontos / ' + a.length + ' ataques';
            })
            .join('; ');
        }
        if (d.key === 'defense')
          return (
            Object.values(own.players).reduce((n, p) => n + p.defenses, 0) +
            ' defesas; ' +
            opp.kills +
            ' pontos rivais em ' +
            opp.attacks +
            ' ataques'
          );
        if (d.key === 'serve')
          return own.serveErrors + ' erros / ' + own.served + ' saques; ' + own.breaks + ' pontos sacando';
        return (
          own.kills + ' pontos, ' + (own.errors + own.blocked) + ' erros/bloqueados em ' + own.attacks + ' ataques'
        );
      };
      const response = (m.decisions || [])
        .filter(q => q.side !== side && q.automatic && q.rally >= d.rally && q.rally < d.rally + 8)
        .map(q => (q.type === 'tactic' ? 'ajuste tático' : q.type === 'timeout' ? 'pedido de tempo' : 'substituição'));
      return (
        '<div class="note"><h3>Acompanhamento: ' +
        ({
          serve: 'saque',
          target: 'alvo do saque',
          protect: 'recepção',
          block: 'bloqueio',
          distribution: 'distribuição',
          pace: 'ritmo',
          defense: 'defesa'
        }[d.key] || 'plano tático') +
        '</h3><p>Antes (' +
        before.length +
        ' pontos): ' +
        metric(before) +
        '.<br>Depois (' +
        after.length +
        '/8 pontos): ' +
        metric(after) +
        '.</p><small>' +
        (after.length < 8
          ? next || m.done || m.setScores.length >= d.set
            ? 'Janela encerrada sem amostra suficiente. '
            : 'Amostra incompleta; aguarde mais ações. '
          : 'Janela concluída. ') +
        (response.length ? 'Resposta adversária: ' + response.join(', ') + '. ' : '') +
        'Outras mudanças e a qualidade do adversário também influenciam; este recorte não prova causalidade.</small></div>'
      );
    })
    .join('');
}
function focusPanel(m, side) {
  return focusLoad(m, side)
    ? '<div class="note"><h3>A atenção caiu</h3><p>O time relaxou após construir vantagem. O efeito é breve e afeta execução, sem apagar a confiança. Considere um tempo para reorganizar a equipe e um saque mais seguro.</p>' +
        ((m.timeouts?.[side] || 0) < 2
          ? button('Pedir tempo', 'timeout')
          : '<small>Tempos esgotados neste set. Ajuste o plano e acompanhe a recuperação.</small>') +
        '</div>'
    : '';
}

function courtSignal(m, p) {
  let st = playerLiveState(m, p);
  if (!st) return '';
  return `<details class="court-signal"><summary>${st.label}</summary><small>${st.evidence}</small></details>`;
}

function confidence(n) {
  return n >= 90
    ? '↑↑ Muito confiante'
    : n >= 80
      ? '↑ Confiante'
      : n >= 65
        ? '→ Estável'
        : n >= 50
          ? '↓ Pressionado'
          : '↓↓ Abalado';
}
function needsTalk(m) {
  return (
    !!m &&
    !m.done &&
    m.events.every(e => e.set !== m.setScores.length + 1) &&
    !(m.decisions || []).some(d => d.type === 'talk' && d.set === m.setScores.length + 1)
  );
}
function executionTalk(m, side) {
  if (!m.setScores.length)
    return { title: 'Reforçar execução', detail: 'Peça mais precisão nos fundamentos sem mudar o plano.' };
  let set = m.setScores.length,
    st = stats(
      m.events.filter(e => e.set === set),
      side
    ),
    eff = st.attacks ? (st.kills - st.errors - st.blocked) / st.attacks : 0;
  if (st.receptions >= 6 && st.positive / st.receptions < 0.45)
    return { title: 'Corrigir recepção', detail: 'Reforce plataforma e primeira bola por alguns rallies.' };
  if (st.served >= 6 && st.serveErrors / st.served > 0.16)
    return { title: 'Ajustar execução do saque', detail: 'Peça precisão antes de aumentar novamente o risco.' };
  if (st.attacks >= 8 && eff < 0.3)
    return { title: 'Corrigir execução ofensiva', detail: 'Reforce escolha de golpe e controle contra o bloqueio.' };
  return { title: 'Reforçar execução', detail: 'Consolide o fundamento que sustentou o set anterior.' };
}
function talkChoices(m, side) {
  let tech = executionTalk(m, side);
  return [
    ['demand', 'Cobrar concentração', 'Recupera foco; pode pressionar atletas menos resistentes.'],
    ['guide', 'Orientar o plano', 'Reforça a leitura tática e reduz o relaxamento.'],
    ['reinforce', 'Reforçar confiança', 'Ajuda quem está abalado; pode gerar acomodação.'],
    ['execute', tech.title, tech.detail],
    ['simplify', 'Simplificar o jogo', 'Reduz erros e estabiliza a execução, mas diminui o teto ofensivo.'],
    ['calm', 'Acalmar o time', 'Reduz ansiedade e variância por alguns rallies.'],
    ['energize', 'Aumentar a energia', 'Aumenta intensidade e agressividade, com um pouco mais de risco.']
  ];
}
function talkPanel(m) {
  if (!needsTalk(m)) return '';
  let side = m.home === state.club ? 0 : 1;
  return `<section class="team-talk"><small>VESTIÁRIO · ${m.setScores.length + 1}º SET</small><h2>O que o time precisa ouvir?</h2><p>${m.setScores.length ? 'O set anterior ficou para trás. Defina o tom da retomada.' : 'Estabeleça o tom antes do primeiro saque.'}</p>${talkChoices(
    m,
    side
  )
    .map(([tone, title, detail]) => button(title, 'talk:' + tone) + `<small>${detail}</small>`)
    .join('')}</section>`;
}
function giveTalk(tone) {
  if (
    !match ||
    match.done ||
    !['demand', 'guide', 'reinforce', 'execute', 'simplify', 'calm', 'energize'].includes(tone)
  )
    return;
  let side = match.home === state.club ? 0 : 1,
    required = needsTalk(match),
    breakTalk = match.breakKind === 'technical' || match.breakKind === 'timeout';
  if (!required && !breakTalk) return;
  let sameBreak = (match.decisions || []).some(
    d =>
      d.type === 'talk' &&
      d.set === match.setScores.length + 1 &&
      d.rally === match.events.length &&
      d.breakKind === match.breakKind
  );
  if (!required && sameBreak) return;
  focusTalk(match, side, tone);
  let reactions = [];
  for (let p of match.teams[side]) {
    let before = p.confidence ?? p.morale,
      delta =
        tone === 'demand'
          ? p.mental >= 70
            ? 6
            : -5
          : tone === 'guide'
            ? 2
            : tone === 'reinforce'
              ? p.morale >= 90
                ? -2
                : 7
              : tone === 'execute'
                ? 1
                : tone === 'simplify'
                  ? 2
                  : tone === 'calm'
                    ? p.mental < 70
                      ? 4
                      : 2
                    : tone === 'energize'
                      ? p.mental >= 70
                        ? 4
                        : 2
                      : 0;
    p.confidence = clamp(before + delta, 35, 99);
    if (tone === 'guide' || tone === 'calm') p.chemistry = Math.min(99, p.chemistry + 1);
    reactions.push({ id: p.id, delta: p.confidence - before });
  }
  match.decisions ??= [];
  match.decisions.push({
    type: 'talk',
    side,
    set: match.setScores.length + 1,
    rally: match.events.length,
    tone,
    breakKind: match.breakKind || 'set'
  });
  match.coachTalkHistory ??= [];
  match.coachTalkHistory.push({
    kind: 'inmatch',
    tone,
    set: match.setScores.length + 1,
    rally: match.events.length,
    breakKind: match.breakKind || 'set',
    reactions
  });
  commit();
  render();
  notify(
    tone === 'execute'
      ? 'Orientação técnica aplicada por oito rallies.'
      : tone === 'simplify'
        ? 'O time vai simplificar a execução.'
        : tone === 'calm'
          ? 'O time baixa a rotação e recupera estabilidade.'
          : tone === 'energize'
            ? 'O treinador aumenta a energia do grupo.'
            : 'Palestra concluída.'
  );
}
function initialPlan() {
  let pair = next();
  if (!pair) return null;
  let opp = pair.find(id => id !== state.club),
    roster = state.lines[opp].map(player),
    target = roster.filter(p => ['PON', 'LIB'].includes(p.pos)).sort((a, b) => a.receive - b.receive)[0],
    danger = roster.filter(p => ['PON', 'CEN', 'OPO'].includes(p.pos)).sort((a, b) => b.attack - a.attack)[0];
  return { target, danger, block: { PON: 'wings', CEN: 'middle', OPO: 'opposite' }[danger.pos] };
}
function applyInitialPlan() {
  let plan = initialPlan();
  if (!plan || (match && !match.done)) return;
  state.tactics[state.club].target = 'player:' + plan.target.id;
  state.tactics[state.club].block = plan.block;
  commit();
  render();
  notify('Plano inicial aplicado. Você pode ajustar antes do saque.');
}
function tacticLabel(key, value) {
  let maps = {
    serve: { safe: 'Conservador', balanced: 'Equilibrado', selective: 'Seletivo', aggressive: 'Agressivo' },
    distribution: { balanced: 'Equilibrada', middle: 'Centrais', opposite: 'Oposto', wings: 'Pontas' },
    pace: { balanced: 'Equilibrado', fast: 'Acelerado', control: 'Controlado' },
    block: { read: 'Leitura', middle: 'Fecha o meio', opposite: 'Fecha a saída', wings: 'Fecha a entrada' },
    defense: {
      standard: 'Padrão',
      diagonal: 'Protege diagonal',
      parallel: 'Protege paralela',
      deep: 'Protege fundo',
      advance: 'Defesa adiantada'
    }
  };
  return maps[key]?.[value] || String(value || '—');
}
function opponentStyleRead(opp) {
  let profile = teamStyle(opp),
    games = state.results.filter(m => m.home === opp || m.away === opp),
    observed = games.slice(-5),
    values = { serve: [], distribution: [], pace: [], block: [], defense: [] };
  for (let m of observed) {
    let side = m.home === opp ? 0 : 1,
      t = m.initialTactics?.[side] || m.tactics?.[side];
    if (!t) continue;
    for (let k of Object.keys(values)) if (t[k]) values[k].push(t[k]);
  }
  let mode = (xs, fallback) => {
    if (!xs.length) return fallback;
    let c = {};
    xs.forEach(x => (c[x] = (c[x] || 0) + 1));
    return Object.entries(c).sort((a, b) => b[1] - a[1])[0][0];
  };
  let tactics = Object.fromEntries(Object.keys(values).map(k => [k, mode(values[k], profile.tactics[k])])),
    confidence = games.length >= 5 ? 'ALTA' : games.length >= 2 ? 'MÉDIA' : 'BAIXA';
  return { profile, tactics, confidence, games: games.length };
}
function styleAssistantCard(opp, home) {
  let read = opponentStyleRead(opp),
    t = read.tactics,
    crowd = home ? crowdProfile(state.club) : crowdProfile(opp),
    crowdOwner = home ? 'Nossa torcida' : 'Torcida rival',
    items = [
      ['Saque', tacticLabel('serve', t.serve)],
      ['Distribuição', tacticLabel('distribution', t.distribution)],
      ['Ritmo', tacticLabel('pace', t.pace)],
      ['Bloqueio', tacticLabel('block', t.block)],
      ['Defesa', tacticLabel('defense', t.defense)]
    ];
  return `<section class="pregame-style"><div class="pregame-style-head"><div><small>COMO ELES JOGAM</small><h2>${read.profile.label}</h2><p>${read.profile.description}</p></div><span class="scout-confidence">CONFIANÇA ${read.confidence}${read.games ? ` · ${read.games} J` : ''}</span></div><div class="pregame-style-grid">${items.map(([k, v]) => `<article><small>${k}</small><strong>${v}</strong></article>`).join('')}</div><div class="pregame-crowd"><div class="crowd-meter"><b>${crowd.level}/5</b><span>${Array.from({ length: 5 }, (_, i) => `<i class="${i < crowd.level ? 'on' : ''}"></i>`).join('')}</span></div><div><small>${crowdOwner.toUpperCase()}</small><strong>${crowd.label}</strong><p>${crowd.description}</p></div></div></section>`;
}
function preMatchInfo(pair) {
  if (!pair) return '';
  normalizeNextPlan();
  let opp = pair.find(id => id !== state.club),
    oppClub = club(opp),
    us = club(state.club),
    home = pair[0] === state.club,
    games = state.results.filter(m => m.home === opp || m.away === opp),
    ss = seasonStats(opp),
    ourStats = seasonStats(state.club),
    oppRoster = state.lines[opp].map(player),
    ourRoster = state.lines[state.club].map(player),
    keyPlayers = oppRoster
      .map(p => ({ p, s: ss.players[p.id] }))
      .sort((a, b) =>
        games.length
          ? (b.s?.kills || 0) +
            (b.s?.aces || 0) +
            (b.s?.blocks || 0) -
            ((a.s?.kills || 0) + (a.s?.aces || 0) + (a.s?.blocks || 0))
          : overall(b.p) - overall(a.p)
      )
      .slice(0, 3),
    plan = initialPlan(),
    ourAvg = Math.round(ourRoster.reduce((n, p) => n + overall(p), 0) / ourRoster.length),
    oppAvg = Math.round(oppRoster.reduce((n, p) => n + overall(p), 0) / oppRoster.length),
    ourForm = state.results.filter(m => m.home === state.club || m.away === state.club).slice(-5),
    oppForm = games.slice(-5),
    formBadge = (m, id) => {
      let side = m.home === id ? 0 : 1;
      return `<span class="${m.sets[side] === 3 ? 'win' : 'loss'}">${m.sets[side] === 3 ? 'V' : 'D'} ${m.sets[side]}–${m.sets[1 - side]}</span>`;
    },
    ourAttack = ourStats.attacks ? ourStats.kills / ourStats.attacks : null,
    oppAttack = ss.attacks ? ss.kills / ss.attacks : null,
    ourRec = ourStats.receptions ? ourStats.positive / ourStats.receptions : null,
    oppRec = ss.receptions ? ss.positive / ss.receptions : null;
  return `<section class="prematch-shell"><div class="pregame-hero"><div class="pregame-kicker"><span>RODADA ${state.round + 1}</span><b>${home ? 'EM CASA' : 'FORA DE CASA'}</b></div><div class="pregame-versus"><div class="pregame-team ours">${crest(us)}<strong>${us.short}</strong><small>${us.name}</small></div><div class="pregame-vs"><span>VS</span><small>${home ? 'Seu ginásio' : 'Ginásio rival'}</small></div><div class="pregame-team">${crest(oppClub)}<strong>${oppClub.short}</strong><small>${oppClub.name}</small></div></div><p>${matchContextText(state.results, pair, state.club)}</p></div><div class="pregame-glance"><article><small>FORÇA DA FORMAÇÃO</small><strong>${ourAvg} <i>×</i> ${oppAvg}</strong><span>${ourAvg > oppAvg ? 'leve vantagem nossa' : oppAvg > ourAvg ? 'leve vantagem rival' : 'equilíbrio técnico'}</span></article><article><small>NOSSA FORMA</small><div class="pregame-form">${ourForm.length ? ourForm.map(x => formBadge(x, state.club)).join('') : '<span>—</span>'}</div></article><article><small>FORMA RIVAL</small><div class="pregame-form">${oppForm.length ? oppForm.map(x => formBadge(x, opp)).join('') : '<span>—</span>'}</div></article></div>${styleAssistantCard(opp, home)}<section class="pregame-reading"><div class="pregame-reading-head"><small>LEITURA RÁPIDA</small><h2>Onde a partida pode ser decidida</h2></div><div class="pregame-matchups"><article><span>Ataque</span><strong>${ourAttack === null ? '—' : Math.round(ourAttack * 100) + '%'} <i>×</i> ${oppAttack === null ? '—' : Math.round(oppAttack * 100) + '%'}</strong><small>conversão em ponto</small></article><article><span>Recepção</span><strong>${ourRec === null ? '—' : Math.round(ourRec * 100) + '%'} <i>×</i> ${oppRec === null ? '—' : Math.round(oppRec * 100) + '%'}</strong><small>passes positivos</small></article><article><span>Plano</span><strong>${serveStyleLabel(plan.target)}</strong><small>pressionar ${plan.target.name.split(' ')[0]}</small></article></div></section><section class="pregame-key"><div class="panelhead"><div><small>ADVERSÁRIO</small><h2>Três jogadores para observar</h2></div></div><div class="pregame-key-grid">${keyPlayers.map(({ p, s }, i) => `<article><span class="pregame-key-rank">${i + 1}</span>${playerIdentity(p, { compact: true })}<strong>${roleLabel(p)}</strong><small>${s ? ((s.kills + s.aces + s.blocks) / Math.max(1, games.length)).toFixed(1) + ' pts/jogo' : 'Destaque pelo elenco inicial'}</small></article>`).join('')}</div></section><section class="pregame-plan"><div class="pregame-plan-icon">◇</div><div><small>PLANO DO AUXILIAR</small><h2>Começar com uma hipótese clara</h2><p><b>Saque:</b> testar ${plan.target.name}, ${roleLabel(plan.target).toLowerCase()}. <b>Bloqueio:</b> atenção especial a ${plan.danger.name}, ${roleLabel(plan.danger).toLowerCase()}.</p><span>Se o adversário reagir, o auxiliar deve pedir variação em vez de insistir automaticamente.</span></div>${button('Aplicar plano', 'initial-plan', 'primary')}</section><details class="pregame-deep"><summary>Ver análise completa do adversário</summary>${opponentRanks(opp)}${matchPrepBlock()}${oldPreMatchInfo(pair)}</details></section>`;
}

function playerDossier(p) {
  let ss = seasonStats(p.club).players[p.id],
    head = `<div class="player-dossier-head">${playerIdentity(p, { compact: true })}</div>`,
    tribute = p.tribute
      ? `<div class="tribute-profile"><small>HOMENAGEM</small><strong>Thiago Alves no auge</strong><p>${p.legacyNote || ''}</p><div><span>ATAQUE <b>${p.attack}</b></span><span>SAQUE <b>${p.serve}</b></span><span>RECEPÇÃO <b>${p.receive}</b></span><span>MENTAL <b>${p.mental}</b></span></div></div>`
      : '';
  if (!ss)
    return `<section class="prematch-dossier">${head}${tribute}<p>Sem jogos observados nesta competição. A avaliação ainda depende dos atributos.</p></section>`;
  return `<section class="prematch-dossier">${head}${tribute}<h3>Dossiê de desempenho</h3><p><b>${roleLabel(p)}</b> · ${heightLabel(p)} · Saque ${serveStyleLabel(p)}</p><p>Ataque: ${benchmarkPct(ss.kills, ss.attacks, 'attack', p.pos)}</p><p>Recepção: ${benchmarkPct(ss.positive, ss.receptions, 'receive', p.pos)}</p><p>${ss.aces} aces · ${ss.blocks} bloqueios · ${ss.defenses} defesas${ss.defenses ? ' · ' + Math.round((100 * (ss.defenseControlled || 0)) / ss.defenses) + '% controladas' : ''}.</p><small>Compare volume, função e salário. Produção ainda não equivale a valor de mercado.</small></section>`;
}

function syncMatchOverlay() {
  if (view !== 'match' || !match || match.done || !match.coaching) return;
  let title =
    match.breakKind === 'set'
      ? 'Intervalo entre sets'
      : match.breakKind === 'technical'
        ? 'Intervalo técnico'
        : match.breakKind === 'opening'
          ? 'Antes do primeiro saque'
          : 'Comissão técnica';
  let d = openDialog(title, coachingPanel(match));
  d.className = 'bench-dialog';
  bind();
  $('#close').onclick = () => {
    let opening = match?.breakKind === 'opening';
    match.coaching = false;
    commit();
    d.close();
    if (opening) notify('Pré-jogo pendente. Toque em “Iniciar jogo” para voltar às orientações.');
  };
  d.oncancel = () => {
    let opening = match?.breakKind === 'opening';
    match.coaching = false;
    commit();
    if (opening) notify('Pré-jogo pendente. Toque em “Iniciar jogo” para voltar às orientações.');
  };
}

// Audio starts only after an explicit user gesture. Synthesized gym cues, no downloaded assets.

function toggleGymSound() {
  try {
    const Audio = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!Audio) {
      notify('Áudio indisponível neste navegador.');
      return;
    }
    gymAudio ??= new Audio();
    gymAudio.resume();
    gymSound = !gymSound;
    render();
  } catch {
    gymSound = false;
    notify('Não foi possível ativar o som.');
  }
}
function playGymEvent(m) {
  if (!gymSound || !gymAudio || gymAudio.state !== 'running') return;
  let e = m.events.at(-1);
  if (!e) return;
  const ctx = gymAudio,
    t = ctx.currentTime,
    tone = (hz, duration, gain, at) => {
      let o = ctx.createOscillator(),
        g = ctx.createGain();
      o.frequency.value = hz;
      o.connect(g);
      g.connect(ctx.destination);
      g.gain.setValueAtTime(gain, at);
      g.gain.exponentialRampToValueAtTime(0.0001, at + duration);
      o.start(at);
      o.stop(at + duration);
    };
  e.steps
    .filter(s => ['serve', 'attack', 'block', 'defense'].includes(s.type))
    .slice(0, 10)
    .forEach((s, i) => tone(s.type === 'block' ? 130 : s.type === 'serve' ? 240 : 180, 0.06, 0.055, t + i * 0.055));
  tone(1600, 0.12, 0.025, t + 0.6);
  let duration = 0.7,
    buffer = ctx.createBuffer(1, ctx.sampleRate * duration, ctx.sampleRate),
    data = buffer.getChannelData(0),
    home = e.winner === 0,
    intensity = (home ? 0.028 : 0.01) * (Math.max(...e.scoreBefore) >= 20 ? 1.6 : 1) * (e.steps.length > 10 ? 1.3 : 1);
  for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * Math.sin((Math.PI * i) / data.length);
  let source = ctx.createBufferSource(),
    gain = ctx.createGain(),
    filter = ctx.createBiquadFilter();
  source.buffer = buffer;
  filter.type = 'lowpass';
  filter.frequency.value = 900;
  gain.gain.value = intensity;
  source.connect(filter);
  filter.connect(gain);
  gain.connect(ctx.destination);
  source.start(t + 0.65);
}
function opponentRanks(opp) {
  let all = clubs.map(c => {
      let s = seasonStats(c.id),
        sets = state.results
          .filter(m => m.home === c.id || m.away === c.id)
          .reduce((n, m) => n + m.setScores.length, 0);
      return { id: c.id, s, sets };
    }),
    metrics = [
      ['Ataque', x => (x.s.attacks ? x.s.kills / x.s.attacks : null)],
      ['Recepção', x => (x.s.receptions ? x.s.positive / x.s.receptions : null)],
      ['Bloqueio / set', x => (x.sets ? x.s.blocks / x.sets : null)],
      ['Aces / set', x => (x.sets ? x.s.aces / x.sets : null)]
    ];
  return `<h3>Posição nos fundamentos</h3><div class="form-strip">${metrics
    .map(([label, value]) => {
      let ranked = all.filter(x => value(x) !== null).sort((a, b) => value(b) - value(a)),
        entry = ranked.find(x => x.id === opp),
        rank = entry ? 1 + ranked.filter(x => value(x) > value(entry)).length : null;
      return `<span>${label}: ${rank ? rank + 'º de ' + ranked.length : 'sem amostra'}</span>`;
    })
    .join('')}</div>`;
}

function settingContext(m) {
  let rows = [0, 1].map(side => {
    let sets = m.events
        .flatMap(e => e.steps)
        .filter(s => s.type === 'set' && s.team === side && Number.isFinite(s.precision)),
      attacks = m.events.flatMap(e => e.steps).filter(s => s.type === 'attack' && s.team === side),
      league = leagueMatches().flatMap(m => m.events.flatMap(e => e.steps)),
      ls = league.filter(s => s.type === 'set' && Number.isFinite(s.precision)),
      la = league.filter(s => s.type === 'attack'),
      ratio = (xs, test) => (xs.length ? Math.round((100 * xs.filter(test).length) / xs.length) + '%' : '—'),
      split = good => {
        let xs = attacks.filter(s => (s.quality >= 3 && !s.transition) === good),
          ys = la.filter(s => (s.quality >= 3 && !s.transition) === good);
        return (
          ratio(xs, s => s.outcome === 'kill') +
          ' · Liga ' +
          ratio(ys, s => s.outcome === 'kill') +
          ' · n=' +
          xs.length +
          (xs.length < 20 ? ' · amostra baixa' : '')
        );
      };
    return [
      club([m.home, m.away][side]).name,
      sets.length
        ? (sets.reduce((n, s) => n + s.precision, 0) / sets.length).toFixed(0) +
          ' · Liga LEV ' +
          (ls.reduce((n, s) => n + s.precision, 0) / ls.length).toFixed(0)
        : 'Sem amostra',
      ratio(sets, s => s.nblock <= 1) + ' · Liga LEV ' + ratio(ls, s => s.nblock <= 1),
      split(true),
      split(false)
    ];
  });
  return (
    '<h3>Levantamento e contexto do ataque</h3>' +
    table(
      ['Time', 'Precisão', 'Bloqueio simples/zero', 'Ataque no sistema', 'Ataque fora do sistema'],
      rows.map(row => '<tr>' + row.map(x => '<td>' + x + '</td>').join('') + '</tr>')
    )
  );
}

function shortAction(e) {
  return feedLine(e, player);
}
function setterPrecision(m, id) {
  let sets = m.events
    .flatMap(e => e.steps)
    .filter(s => s.type === 'set' && s.player === id && Number.isFinite(s.precision));
  return sets.length
    ? (sets.reduce((n, s) => n + s.precision, 0) / sets.length).toFixed(0) + ' · n=' + sets.length
    : 'sem amostra';
}
function courtActions(id) {
  if (!match) return;
  stop();
  match.coaching = false;
  render();
  let p = match.teams.flat().find(p => p.id === id),
    own = p.club === state.club,
    side = p.club === match.home ? 0 : 1,
    r = ratingRows(match).find(x => x.id === id),
    ps = stats(match.events, side).players[p.id] || {},
    points = (ps.kills || 0) + (ps.aces || 0) + (ps.blocks || 0),
    stateNow = playerLiveState(match, p),
    options = '';
  if (!match.done) {
    if (own) {
      options += button('Substituir', 'court-sub:' + id, 'primary');
      if (['PON', 'LIB'].includes(p.pos)) options += button('Proteger recepção', 'court-protect:' + id);
      if (['PON', 'CEN', 'OPO'].includes(p.pos))
        options += button(
          'Priorizar no ataque',
          'court-tactic:distribution:' + { PON: 'wings', CEN: 'middle', OPO: 'opposite' }[p.pos]
        );
    } else {
      if (['PON', 'LIB'].includes(p.pos)) options += button('Direcionar saque', 'court-target:' + id, 'primary');
      if (p.pos !== 'LIB') options += button('Priorizar bloqueio', 'court-block:' + id);
    }
  }
  let d = openDialog(
    p.name,
    `<section class="court-player-sheet"><div class="court-player-summary">${playerIdentity(p, { compact: true })}<div class="court-player-kpis"><span><small>NOTA</small><b>${r && r.actions >= 3 ? r.grade.toFixed(1) : '—'}</b></span><span><small>PONTOS</small><b>${points}</b></span><span><small>FÍSICO</small><b>${Math.round(p.condition)}%</b></span></div>${stateNow?.label ? `<div class="court-player-state"><small>ESTADO ATUAL</small><strong>${stateNow.label}</strong><span>${stateNow.evidence || ''}</span></div>` : ''}</div><div class="court-player-actions">${options || '<p>Partida encerrada.</p>'}</div><details class="court-player-deep"><summary>Ver dados completos</summary><p>Confiança ${Math.round(p.confidence ?? p.morale)} · ${confidence(p.confidence ?? p.morale)}</p>${playerDossier(p)}</details></section>`
  );
  d.className = 'court-player-dialog';
  bind();
  document
    .querySelectorAll('[data-action^="court-protect:"],[data-action^="court-target:"],[data-action^="court-block:"]')
    .forEach(
      el =>
        (el.onclick = () => {
          let key = el.dataset.action.split(':')[0].slice(6),
            teamSide = match.home === state.club ? 0 : 1,
            from = match.tactics[teamSide][key];
          match.tactics[teamSide][key] = 'player:' + id;
          if (key === 'block') clearAssistantPlan(match, teamSide, key);
          match.decisions.push({
            type: 'tactic',
            side: teamSide,
            key,
            from,
            to: 'player:' + id,
            set: match.setScores.length + 1,
            rally: match.events.length
          });
          commit();
          d.close();
          render();
          notify('Ajuste aplicado.');
        })
    );
}
function captureCourt() {
  let nodes = [...document.querySelectorAll('[data-court-player]')];
  return {
    nodes: nodes.map(el => ({ id: el.dataset.courtPlayer, box: el.getBoundingClientRect(), el })),
    index: document.querySelector('.match-stage')?.dataset?.rally
  };
}
function animateCourt(previous) {
  let stage = document.querySelector('.match-stage');
  if (!stage?.dataset || !match) return;
  stage.dataset.rally = String(match.events.length);
  if (!globalThis.matchMedia || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  let duration = matchSpeed === 2 ? 220 : 420;
  for (let old of previous.nodes) {
    if (!document.querySelector('[data-court-player="' + old.id + '"]') && old.el.cloneNode) {
      let ghost = old.el.cloneNode(true);
      ghost.removeAttribute('data-court-player');
      ghost.setAttribute('aria-hidden', 'true');
      Object.assign(ghost.style, {
        position: 'fixed',
        left: old.box.left + 'px',
        top: old.box.top + 'px',
        width: old.box.width + 'px',
        height: old.box.height + 'px',
        pointerEvents: 'none',
        zIndex: '40'
      });
      document.body.append(ghost);
      let animation = ghost.animate?.(
        [
          { transform: 'translateX(0)', opacity: 1 },
          { transform: 'translateX(-24px)', opacity: 0 }
        ],
        { duration }
      );
      if (animation) animation.onfinish = () => ghost.remove();
      else ghost.remove();
    }
  }
  document.querySelectorAll('[data-court-player]').forEach(el => {
    if (!el.animate) return;
    let old = previous.nodes.find(n => n.id === el.dataset.courtPlayer),
      box = el.getBoundingClientRect();
    if (old) {
      let x = old.box.left - box.left,
        y = old.box.top - box.top;
      if (x || y)
        el.animate([{ transform: `translate(${x}px,${y}px)` }, { transform: 'translate(0,0)' }], {
          duration,
          easing: 'ease-out'
        });
    } else if (previous.nodes.length)
      el.animate(
        [
          { transform: 'translateX(24px)', opacity: 0 },
          { transform: 'translateX(0)', opacity: 1 }
        ],
        { duration }
      );
  });
  if (previous.index !== undefined && previous.index !== String(match.events.length)) {
    let e = match.events.at(-1);
    document.querySelector(`[data-score-side="${e.winner}"]`)?.animate?.(
      [
        { transform: 'translateY(-8px)', opacity: 0.4 },
        { transform: 'translateY(0)', opacity: 1 }
      ],
      { duration: 280 }
    );
    document
      .querySelector(`[data-court-player="${e.actor}"]`)
      ?.animate?.(
        [
          {
            boxShadow: '0 0 0 2px ' + (e.reason.includes('Erro') || e.reason.includes('fora') ? '#FF6B5F' : '#A8FF3E')
          },
          { boxShadow: '0 0 0 0 transparent' }
        ],
        { duration: 600 }
      );
  }
}

function normalizeNextPlan() {
  let pair = next();
  if (!pair) return;
  for (let id of pair) {
    let other = pair.find(x => x !== id);
    state.tactics[id] = matchTactics(
      state.tactics[id],
      state.lines[id].map(player),
      state.lines[other].map(player),
      id
    );
  }
}
async function restartTest() {
  if (state.club === null) return;
  stop();
  let backup = portableSave();
  try {
    await dbWrite(backup, BACKUP_ID);
  } catch {
    notify('Não foi possível guardar o backup. Exporte o jogo antes de reiniciar.');
    return;
  }
  let all = state.all.map(p => {
      let copy = { ...p, condition: 100 };
      delete copy.confidence;
      delete copy.actionRun;
      return copy;
    }),
    clubId = state.club,
    lines = JSON.parse(JSON.stringify(state.lines)),
    tactics = JSON.parse(JSON.stringify(state.tactics));
  state = {
    ...fresh(),
    club: clubId,
    all,
    lines,
    tactics,
    active: null,
    reset_note: 'Novo teste com físico recuperado e elenco preservado.'
  };
  match = null;
  view = 'home';
  normalizeNextPlan();
  commit();
  render();
  notify('Temporada reiniciada. Elenco e escalação preservados; físico recuperado.');
}

function planFeedback(m, side) {
  const plan = m.initialPlan?.[side];
  if (!plan || !String(plan.target).startsWith('player:')) return '';
  const id = Number(plan.target.slice(7)),
    set = m.setScores.length + 1,
    events = m.events.filter(e => e.set === set),
    served = events.filter(e => e.serving === side),
    targeted = served.filter(e => e.steps.some(s => s.type === 'receive' && s.player === id)),
    won = targeted.filter(e => e.winner === 1 - side).length,
    p = m.teams[1 - side].find(p => p.id === id);
  if (!p) return '';
  return (
    '<details><summary>Monitor do plano inicial</summary><p>Alvo: ' +
    athleteLabel(p) +
    '. Recebeu ' +
    targeted.length +
    ' de ' +
    served.length +
    ' saques no nosso saque neste set.</p><p>Virada de bola rival nessas bolas: ' +
    benchmarkPct(won, targeted.length, 'sideout') +
    '.</p><small>' +
    (targeted.length < 8
      ? 'Amostra insuficiente para concluir. '
      : 'Compare com os próximos pontos antes de manter ou trocar o alvo. ') +
    (m.tactics[1 - side].protect === 'player:' + id ? 'O adversário está protegendo este passador.' : '') +
    '</small></details>'
  );
}

function benchReview(m) {
  const stamp = m.seed + ':' + m.setScores.length + ':' + m.events.length;
  if (!benchReviews.has(m) || benchReviews.get(m).stamp !== stamp) {
    const side = m.home === state.club ? 0 : 1,
      set = m.breakKind === 'set' ? m.setScores.length : m.setScores.length + 1;
    let locked = new Set(
        assistantPlanStates(m, side)
          .filter(p => p.holding || p.settling)
          .map(p => p.key)
      ),
      items = advice(m, side, set, state.all)
        .filter(i => !locked.has(i.key))
        .map(i => ({ ...i, response: null }));
    for (const i of items) {
      const seen = (m.decisions || []).some(
        d =>
          d.type === 'adviceSeen' &&
          d.set === set &&
          d.rally === m.events.length &&
          d.key === i.key &&
          d.title === i.title
      );
      if (!seen) {
        m.decisions ??= [];
        m.decisions.push({
          type: 'adviceSeen',
          side,
          set,
          rally: m.events.length,
          key: i.key,
          title: i.title,
          kind: i.kind
        });
      }
    }
    if (!m.events.length && !items.length) {
      const opp = m.teams[1 - side],
        target = opp.filter(p => ['PON', 'LIB'].includes(p.pos)).sort((a, b) => a.receive - b.receive)[0];
      items = [
        {
          kind: 'EXPLORAR',
          title: 'Testar o passador mais vulnerável',
          detail:
            athleteLabel(target) +
            ' tem o menor atributo de recepção entre os passadores adversários. Avalie a resposta nos primeiros pontos.',
          risk: 'Concentrar o saque facilita a proteção adversária.',
          key: 'target',
          value: 'player:' + target.id,
          response: null
        }
      ];
    }
    items.forEach(i => {
      const d = (m.decisions || [])
        .filter(
          d =>
            d.type === 'adviceResponse' &&
            d.rally === m.events.length &&
            d.set === m.setScores.length + 1 &&
            d.key === i.key &&
            d.value === i.value
        )
        .at(-1);
      if (d) i.response = d.accepted ? 'accepted' : 'declined';
    });
    benchReviews.set(m, { stamp, items });
  }
  if (benchStamp !== stamp) {
    benchStamp = stamp;
    benchTab = m.breakKind === 'technical' ? 'talk' : 'analyst';
    benchPage = 0;
  }
  return benchReviews.get(m);
}
function respondAdvice(index, accepted) {
  if (!match || match.done || !match.coaching) return;
  const review = benchReview(match),
    item = review.items[index];
  if (!item || item.response) return;
  const side = match.home === state.club ? 0 : 1;
  item.response = accepted ? 'accepted' : 'declined';
  if (accepted) {
    const from = match.tactics[side][item.key];
    match.tactics[side][item.key] = item.value;
    state.tactics[state.club][item.key] = item.value;
    if (item.kind === 'ANTECIPAR' && item.key === 'target') clearAssistantPlan(match, side, 'target');
    else if (['distribution', 'block', 'target'].includes(item.key))
      startAssistantPlan(match, side, item, 'accepted-advice');
    match.decisions.push({
      type: 'tactic',
      set: match.setScores.length + 1,
      rally: match.events.length,
      side,
      key: item.key,
      from: from || 'none',
      to: item.value,
      reason: item.kind === 'ANTECIPAR' ? 'assistant-reaction' : 'assistant-advice'
    });
  }
  match.decisions.push({
    type: 'adviceResponse',
    side,
    set: match.setScores.length + 1,
    rally: match.events.length,
    key: item.key,
    value: item.value,
    title: item.title,
    accepted
  });
  commit();
  render();
}
function compactTalk(m) {
  let side = m.home === state.club ? 0 : 1,
    required = needsTalk(m),
    optional = m.breakKind === 'technical' || m.breakKind === 'timeout',
    used =
      optional &&
      (m.decisions || []).some(
        d =>
          d.type === 'talk' &&
          d.set === m.setScores.length + 1 &&
          d.rally === m.events.length &&
          d.breakKind === m.breakKind
      );
  if (!required && (!optional || used))
    return '<div class="bench-empty"><h3>Palestra concluída</h3><p>Revise o plano ou continue a partida.</p></div>';
  return (
    '<div class="bench-talk"><h3>' +
    (optional ? 'Quer dizer algo agora?' : 'Como orientar o time?') +
    '</h3><p>' +
    (optional
      ? 'A fala é opcional neste intervalo e substitui qualquer efeito curto anterior.'
      : 'Escolha o tom antes do próximo saque.') +
    '</p>' +
    talkChoices(m, side)
      .map(
        ([tone, title, detail]) =>
          '<button data-action="talk:' + tone + '"><strong>' + title + '</strong><span>' + detail + '</span></button>'
      )
      .join('') +
    '</div>'
  );
}

function compactBenchSummary(m, set, side) {
  const events = m.events.filter(e => e.set === set),
    a = stats(events, side),
    b = stats(events, 1 - side),
    score = m.setScores[set - 1];
  return (
    '<div class="bench-set-summary"><h3>' +
    (score ? 'Set ' + set + ': ' + score.join('–') : 'Leitura do set ' + set) +
    '</h3>' +
    table(
      ['Fundamento', 'Nosso time', 'Rival'],
      [
        ['Aces', a.aces, b.aces],
        ['Bloqueios', a.blocks, b.blocks],
        ['Recepção +', a.positive + '/' + a.receptions, b.positive + '/' + b.receptions],
        [
          'Defesas',
          Object.values(a.players).reduce((n, p) => n + p.defenses, 0),
          Object.values(b.players).reduce((n, p) => n + p.defenses, 0)
        ],
        ['Erros', a.errorPoints, b.errorPoints]
      ].map(row => '<tr>' + row.map(v => '<td>' + v + '</td>').join('') + '</tr>')
    ) +
    '<p>Compare erros e produção. Recepção: passes positivos / total.</p></div>'
  );
}

function arenaDisplay(m) {
  const c = matchContext(m),
    a = c.arena;
  return (
    '<div class="arena-readout"><span>👥 ' +
    a.attendance.toLocaleString('pt-BR') +
    ' / ' +
    a.capacity.toLocaleString('pt-BR') +
    ' · ' +
    Math.round(a.occupancy * 100) +
    '% ocupação</span><small>Perfil da torcida · ' +
    a.engagementLabel +
    ' · nível ' +
    a.engagement +
    '/5</small>' +
    (!m.done
      ? '<b>' +
        { reading: 'LEITURA', adjust: 'AJUSTE', closing: 'FECHAMENTO · rally a rally' }[c.act] +
        '</b>' +
        (['Alta', 'Crítica'].includes(c.level) ? '<small>Disputa ' + c.level.toLowerCase() + '</small>' : '')
      : '') +
    '</div>'
  );
}
