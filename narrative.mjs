import {clubs, stats, pct, athleteLabel} from './engine.mjs';

// Narratives are derived from saved rallies and decisions, never random headlines.
const name = id => clubs.find(c => c.id === id)?.name || 'Equipe';
const clubId = (m, side) => side === 0 ? m.home : m.away;
const scored = e => ['Ponto de ataque', 'Ace', 'Bloqueio ponto'].includes(e.reason);
const decisions = m => Array.isArray(m.decisions) ? m.decisions : [];
const playerName = (all, id) => { const p = all.find(x => x.id === id); return p ? athleteLabel(p) : 'Atleta'; };
export function phase(m, side) {
  const last = m.events.at(-1);
  if (!last) return {label:'Primeiro saque', detail:'O jogo começa sem uma sequência estabelecida.',tone:'neutral'};
  if (m.done) return {label:m.sets[side] === 3 ? 'Vitória' : 'Derrota',detail:`${m.sets[side]} a ${m.sets[1-side]} em sets.`,tone:m.sets[side]===3?'up':'down'};
  if (last.set !== m.setScores.length+1) return {label:'Novo set',detail:'Placar zerado. É hora de ajustar o plano.',tone:'neutral'};
  const recent=m.events.filter(e=>e.set===last.set).slice(-8), lead=m.score[side]-m.score[1-side];
  let run=0; for(let i=recent.length-1;i>=0&&recent[i].winner===last.winner;i--)run++;
  const errors=recent.filter(e=>e.errorTeam===side).length;
  const avg=k=>m.teams[side].reduce((a,p)=>a+p[k],0)/m.teams[side].length;
  if (lead>=6&&last.winner===side&&run>=3&&avg('morale')>=78&&avg('chemistry')>=78) return {label:'Jogando solto',detail:`${run} pontos seguidos e ${lead} de vantagem. O time combina confiança e entrosamento.`,tone:'up'};
  if (errors>=3&&lead<0) return {label:'Nervosismo',detail:`${errors} erros que deram ponto nos últimos ${recent.length} pontos.`,tone:'down'};
  if (last.winner!==side&&run>=4) return {label:'Sob pressão',detail:`O adversário marcou os últimos ${run} pontos.`,tone:'down'};
  if (last.winner===side&&run>=3&&lead<=0) return {label:'Reação',detail:`${run} pontos seguidos para voltar à disputa.`,tone:'up'};
  if (lead>=5) return {label:'Controle',detail:`${lead} pontos de vantagem neste set.`,tone:'up'};
  if (last.winner===side&&run>=3) return {label:'Crescendo',detail:`Seu time conquistou os últimos ${run} pontos.`,tone:'up'};
  return {label:'Em disputa',detail:Math.abs(lead)<=2?'Até dois pontos separam os times.':'A sequência ainda não consolidou uma mudança de momento.',tone:'neutral'};
}

export function matchStories(m, all) {
  const out=[],seen=new Set(),bySet=new Map(),points={},maxLead={},runs={side:null,n:0};
  const emit=(e,type,title,body,importance=1,actor=null,key=type+':'+e.set)=>{if(seen.has(key))return;seen.add(key);out.push({id:key,index:e.index,set:e.set,score:e.score,title,body,importance,actor,type});};
  for(const e of m.events){
    if(!bySet.has(e.set)){bySet.set(e.set,[]);runs.side=null;runs.n=0;maxLead[0]=0;maxLead[1]=0;}
    const seq=bySet.get(e.set);seq.push(e);
    const team=name(clubId(m,e.winner)),actor=playerName(all,e.actor),before=e.scoreBefore||[e.score[0]-(e.winner===0?1:0),e.score[1]-(e.winner===1?1:0)];
    const target=e.set===5?15:25,critical=Math.max(...before)>=target-2&&Math.abs(before[0]-before[1])<=2;
    runs.n=runs.side===e.winner?runs.n+1:1;runs.side=e.winner;
    for(const side of [0,1])maxLead[side]=Math.max(maxLead[side],before[side]-before[1-side],e.score[side]-e.score[1-side]);
    const defenses=e.steps.filter(s=>s.type==='defense').length;
    if(e.greatMoment){const why=(e.momentReasons||[]).slice(0,3).join(' · ');emit(e,'great-moment','GRANDE MOMENTO',why||`${Math.round(e.rallyDuration||0)} segundos de rally e impacto ${e.momentImpact}.`,6,e.actor,'great-moment:'+e.index);}
    else if(e.momentLevel==='STRONG'){const why=(e.momentReasons||[]).slice(0,2).join(' · ');emit(e,'strong-moment','DESTAQUE DA QUADRA',why||`Impacto ${e.momentImpact}.`,4,e.actor,'strong-moment:'+e.index);}
    if(e.streaks?.consecutiveAces>=3)emit(e,'serve-fire','PEGOU FOGO NO SAQUE',`${actor}: ${e.streaks.consecutiveAces} aces consecutivos.`,5,e.actor,`serve-fire:${e.set}:${e.actor}:${e.streaks.consecutiveAces}`);
    if(e.streaks?.consecutiveBlocks>=3)emit(e,'wall','PAREDÃO ARMADO',`${actor}: ${e.streaks.consecutiveBlocks} bloqueios ponto consecutivos.`,5,e.actor,`wall:${e.set}:${e.actor}:${e.streaks.consecutiveBlocks}`);
    if(e.sameRallyDigs?.count>=4){const digger=playerName(all,e.sameRallyDigs.playerId);emit(e,'libero-wall','LÍBERO FECHOU O FUNDO',`${digger}: ${e.sameRallyDigs.count} defesas no mesmo rally.`,5,e.sameRallyDigs.playerId,`libero-wall:${e.index}`);}
    if(e.streaks?.consecutiveKills>=5)emit(e,'turning-all','VIRANDO TUDO',`${actor}: ${e.streaks.consecutiveKills} bolas consecutivas convertidas.`,4,e.actor,`turning-all:${e.set}:${e.actor}:${e.streaks.consecutiveKills}`);
    if(defenses>=3)emit(e,'rally','Ninguém deixou a bola cair',`${defenses} defesas mantiveram o rally vivo. ${scored(e)?`${actor} faz o ponto de ${team}.`:`Um erro de ${actor} dá o ponto a ${team}.`}`,critical?5:3,e.actor,'rally:'+e.index);
    if(critical&&e.reason==='Ace')emit(e,'critical-ace',`${actor} acerta sob pressão`,`Ace para ${team} no ${e.score.join(' a ')}.`,5,e.actor,'ace:'+e.index);
    if(critical&&e.reason==='Erro de saque')emit(e,'critical-error','Um saque caro na reta final',`${actor} erra o saque em ${before.join(' a ')}. Ponto de ${team}.`,4,e.actor,'error:'+e.index);
    if(runs.n>=4&&(runs.n-4)%2===0)emit(e,'run',`${team}: ${runs.n} pontos consecutivos`,`${before[e.winner]-runs.n+1} a ${before[1-e.winner]} vira ${e.score[e.winner]} a ${e.score[1-e.winner]} na perspectiva da equipe.`,runs.n>=6?4:3,null,`run:${e.set}:${e.winner}:${runs.n}`);
    const recent=seq.slice(-8),direct=recent.filter(x=>x.actor===e.actor&&x.winner===e.winner&&scored(x));
    if(scored(e)&&direct.length>=4)emit(e,'protagonist',`${actor} chama o jogo`,`${direct.length} pontos diretos nos últimos ${recent.length} pontos.`,3,e.actor,`protagonist:${e.set}:${e.actor}`);
    if(['Ace','Bloqueio ponto'].includes(e.reason)){
      const same=recent.filter(x=>x.winner===e.winner&&x.reason===e.reason);
      if(same.length>=3)emit(e,'weapon',e.reason==='Ace'?'O SAQUE ENCAIXOU':'BLOQUEIO EM EVIDÊNCIA',`${team}: ${same.length} ${e.reason==='Ace'?'aces':'bloqueios ponto'} nos últimos ${recent.length} pontos.`,4,null,`weapon:${e.set}:${e.winner}:${e.reason}`);
    }
    const receive=e.steps.find(s=>s.type==='receive');
    if(receive){const passes=recent.flatMap(x=>x.steps).filter(s=>s.type==='receive'&&s.player===receive.player);if(passes.length>=4&&passes.filter(s=>s.quality<=2).length>=3)emit(e,'target',`${playerName(all,receive.player)} sob pressão no passe`,`${passes.filter(s=>s.quality<=2).length} de ${passes.length} recepções recentes ficaram abaixo de passe positivo.`,3,receive.player,`target:${e.set}:${receive.player}`);}
    // Cultural match states: all are derived from the stored technical event, never from a random headline.
    for(const observedSide of [0,1]){
      const teamRecent=recent.flatMap(x=>x.steps).filter(s=>s.team===observedSide),teamName=name(clubId(m,observedSide));
      const receives=teamRecent.filter(s=>s.type==='receive'),broken=receives.filter(s=>s.quality<=2);
      if(receives.length>=5&&broken.length>=4)emit(e,'pass-broke','PASSE QUEBROU',`${teamName}: ${broken.length} de ${receives.length} recepções recentes tiraram o levantador da rede.`,3,null,`pass-broke:${e.set}:${observedSide}`);
      const receivedPoints=recent.filter(x=>x.serving===1-observedSide),turned=receivedPoints.filter(x=>x.winner===observedSide);
      if(receivedPoints.length>=5&&turned.length<=1)emit(e,'cannot-turn','NÃO CONSEGUE VIRAR',`${teamName} perdeu ${receivedPoints.length-turned.length} das últimas ${receivedPoints.length} bolas recebendo.`,4,null,`cannot-turn:${e.set}:${observedSide}`);
      const attacks=teamRecent.filter(s=>s.type==='attack'&&s.outcome!=='cancelled'),middleIds=all.filter(p=>p.club===clubId(m,observedSide)&&p.pos==='CEN').map(p=>p.id),middle=attacks.filter(s=>middleIds.includes(s.player));
      if(attacks.length>=8&&middle.length<=1)emit(e,'middle-missing','CENTRAL SUMIU DO JOGO',`${teamName} usou o meio só ${middle.length} vez(es) nas últimas ${attacks.length} bolas de ataque.`,3,null,`middle-missing:${e.set}:${observedSide}`);
      const oppIds=all.filter(p=>p.club===clubId(m,observedSide)&&p.pos==='OPO').map(p=>p.id),oppAttacks=attacks.filter(s=>oppIds.includes(s.player)),oppKills=oppAttacks.filter(s=>s.outcome==='kill');
      if(oppAttacks.length>=5&&oppKills.length>=3)emit(e,'opposite-load','SAÍDA CARREGANDO O ATAQUE',`${teamName}: ${oppKills.length} pontos em ${oppAttacks.length} bolas recentes com o oposto.`,3,oppKills.at(-1)?.player,`opposite-load:${e.set}:${observedSide}`);
      const pipe=attacks.filter(s=>s.origin==='BACK_MIDDLE'),pipeKills=pipe.filter(s=>s.outcome==='kill');
      if(pipe.length>=3&&pipeKills.length>=2)emit(e,'pipe','DOS TRÊS FUNCIONANDO',`${teamName}: ${pipeKills.length} pontos em ${pipe.length} ataques dos três neste recorte.`,3,pipeKills.at(-1)?.player,`pipe:${e.set}:${observedSide}`);
      const hands=attacks.filter(s=>['OUTSIDE_HAND','BLOCK_OUT'].includes(s.finish));
      if(hands.length>=2)emit(e,'hands','EXPLORANDO AS MÃOS',`${teamName} encontrou ${hands.length} soluções recentes usando o bloqueio.`,3,hands.at(-1)?.player,`hands:${e.set}:${observedSide}`);
      const blocks=teamRecent.filter(s=>s.type==='block');
      if(blocks.length>=2)emit(e,'block-reading','BLOQUEIO COMEÇOU A LER',`${teamName} marcou ${blocks.length} tocos no recorte recente.`,3,blocks.at(-1)?.player,`block-reading:${e.set}:${observedSide}`);
      const errors=recent.filter(x=>x.errorTeam===observedSide);
      if(errors.length>=3)emit(e,'errors-weigh','ERROS COMEÇAM A PESAR',`${teamName} cedeu ${errors.length} dos últimos ${recent.length} pontos em erros identificados.`,4,null,`errors-weigh:${e.set}:${observedSide}`);
      const serviceRun=recent.filter(x=>x.serving===observedSide&&x.winner===observedSide);
      if(serviceRun.length>=3){const lastServer=[...serviceRun.at(-1).steps].reverse().find(s=>s.type==='serve')?.player;emit(e,'serve-run','BOA PASSAGEM NO SAQUE',`${teamName} fez ${serviceRun.length} pontos recentes sacando${lastServer?' com '+playerName(all,lastServer):''}.`,4,lastServer,`serve-run:${e.set}:${observedSide}`);}
    }
    for(const d of decisions(m).filter(d=>d.set===e.set&&Number.isInteger(d.rally)&&d.rally<e.index)){
      const after=seq.filter(x=>x.index>d.rally);
      if(d.type==='timeout'&&after.length===5){let won=after.filter(x=>x.winner===d.side).length;emit(e,'timeout',won>=4?'Resposta depois da conversa':won<=1?'A conversa ainda não mudou o placar':'Retomada equilibrada',`${name(clubId(m,d.side))} venceu ${won} dos cinco pontos após o tempo. O dado não isola o efeito da intervenção.`,won>=4?4:2,null,`timeout:${d.side}:${d.rally}:${d.set}`);}
      if(d.type==='sub'&&all.some(p=>p.id===d.in)){let n=after.filter(x=>x.actor===d.in&&x.winner===d.side&&scored(x)).length;if(n>=3)emit(e,'sub',`${playerName(all,d.in)} sai do banco e pontua`,`${n} pontos diretos desde a entrada neste set, no lugar de ${playerName(all,d.out)}.`,4,d.in,`sub:${d.side}:${d.rally}:${d.in}`);}
    }
    if(e.score[e.winner]>=target&&e.score[e.winner]-e.score[1-e.winner]>=2&&maxLead[1-e.winner]>=5)emit(e,'comeback','O set mudou de dono',`${team} superou uma desvantagem de ${maxLead[1-e.winner]} pontos e fechou em ${e.score.join(' a ')}.`,5,null,'comeback:'+e.set);
  }
  return out;
}
export function highlights(m,all,limit=3){return matchStories(m,all).sort((a,b)=>b.importance-a.importance||b.index-a.index).slice(0,limit).sort((a,b)=>a.index-b.index)}
export function form(results,id){const games=results.filter(m=>m.home===id||m.away===id);const last=games.at(-1);if(!last)return {count:0,won:false};let won=last.sets[last.home===id?0:1]===3,count=0;for(let i=games.length-1;i>=0;i--){let m=games[i];if((m.sets[m.home===id?0:1]===3)!==won)break;count++;}return {count,won}}
export function playerStory(p,results){
  const games=results.filter(m=>m.home===p.club||m.away===p.club),history=games.map(m=>{let side=m.home===p.club?0:1,s=m.aggregate?.[side]||stats(m.events||[],side);return {m,s:s.players[p.id]}});
  const recent=history.slice(-5),played=recent.filter(x=>x.s),last=history.at(-1),s=last?.s;
  if(!games.length)return {label:p.age<=22?'Jovem em observação':p.age>=32?'Veterano':'Disputando espaço',body:'O histórico esportivo começa na primeira partida.'};
  if(!s&&games.length>=2)return {label:'Buscando espaço',body:'Sem ações registradas na última partida. Considere uma oportunidade na escalação.'};
  if(s&&s.attacks>=10&&(s.kills-s.errors-s.blocked)/s.attacks>=.5)return {label:p.age<=22?'Jovem em destaque':'Em alta',body:`${s.kills} pontos de ataque e ${pct(s.kills-s.errors-s.blocked,s.attacks)} de eficiência na última partida (${s.attacks} ataques).`};
  if(s&&s.attacks>=10&&(s.kills-s.errors-s.blocked)/s.attacks<.15)return {label:'Pressionado',body:`Eficiência de ${pct(s.kills-s.errors-s.blocked,s.attacks)} em ${s.attacks} ataques no último jogo. Uma partida não define o atleta.`};
  if(played.length>=4&&played.slice(-4).every(x=>x.s.attacks>=8&&(x.s.kills-x.s.errors-x.s.blocked)/x.s.attacks>=.35))return {label:'Regularidade',body:'Quatro partidas recentes com volume e eficiência consistentes no ataque.'};
  if(s)return {label:'Em quadra',body:`${s.kills+s.aces+s.blocks} pontos diretos e ${s.defenses} defesas na última partida.`};
  return {label:'Disputando espaço',body:'Ainda sem ações registradas na competição.'};
}
export function rivalry(results,a,b){const games=results.filter(m=>m.home===a&&m.away===b||m.home===b&&m.away===a);let wins=games.filter(m=>m.sets[m.home===a?0:1]===3).length;return {games,wins,losses:games.length-wins,tiebreaks:games.filter(m=>m.setScores.length===5).length};}
export function matchContextText(results,pair,id){if(!pair)return 'A Copa terminou. Os momentos da campanha ficam no histórico.';let opp=pair.find(x=>x!==id),h=rivalry(results,id,opp),f=form(results,opp);return [h.games.length?`Reencontro: ${h.wins} vitória(s) e ${h.losses} derrota(s) contra ${name(opp)}.`:`Primeiro encontro com ${name(opp)} nesta campanha.`,f.count>=2?`O adversário vem de ${f.count} ${f.won?'vitórias':'derrotas'} consecutivas.`:'',h.tiebreaks?'O confronto anterior teve tie-break.':''].filter(Boolean).join(' ')}
