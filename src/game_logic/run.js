/**
 * 한 판(스테이지 한 번)의 상태와 규칙 — 준비(스핀 · 카드 · 배치) → 전투 → 정산 → 다음 웨이브.
 * 상태는 평범한 객체(run). 함수들은 그 객체를 고친다. DOM 을 모른다.
 */
import { makeRng, deriveSeed } from './rng.js';
import { spinSoldier } from './slot.js';
import { capOf, rankOf, techDepth, bondMods } from './stats.js';
import { BattleSim } from './battle.js';

let cardSeq = 1;

/**
 * @param meta  판 밖 상태 (heroes: {id: {dupes}})
 * @param deploy 출진 장수 id 배열 (순서 = 기본 배치 칸)
 */
export function createRun(data, meta, stageId, deploy, seed) {
    const stage = data.stageById[stageId];
    const B = data.B;
    const DEFAULT_CELLS = [5, 2, 8, 4, 1, 7, 3, 0, 6];   // 전열 가운데 → 위 → 아래 → 중열 …
    const { mods, active } = bondMods(data, deploy);
    const run = {
        stageId, seed, spinCount: 0, battleCount: 0,
        waveIdx: 0, phase: 'prep',
        gold: stage.start_gold,
        castleHp: stage.castle_hp, castleMax: stage.castle_hp,
        spinsThisPrep: 0,
        frags: { train: 0, tech: 0 },
        tray: [],
        typeLevel: { infantry: 0, archer: 0, cavalry: 0 },
        bondMods: mods, bonds: active,
        squads: deploy.map((id, i) => ({
            heroId: id,
            dupes: meta.heroes[id]?.dupes ?? 0,
            cell: DEFAULT_CELLS[i],
            soldiers: 0, merit: 0, rank: 0,
            branch: null, nodes: 0, tank: false,
        })),
        log: [],
        stats: { kills: 0, waves: 0, bossKilled: false, spins: 0, jackpots: 0 },
        lastSpin: null, lastBattle: null,
    };
    for (const sq of run.squads) sq.soldiers = Math.min(B.start_soldiers, capOf(data, sq.heroId, sq.dupes, 0));
    return run;
}

export const squadCap = (data, sq) => capOf(data, sq.heroId, sq.dupes, sq.rank);

export function spinCost(data, run) {
    return data.B.spin_cost_base + data.B.spin_cost_step * run.spinsThisPrep;
}

export function canSpin(data, run) {
    if (run.phase !== 'prep') return { ok: false, why: '전투 중에는 못 돌린다' };
    if (run.tray.length >= data.B.tray_max) return { ok: false, why: '카드 칸이 가득 찼다 — 먼저 카드를 쓰자' };
    if (run.gold < spinCost(data, run)) return { ok: false, why: '군자금이 모자란다' };
    return { ok: true };
}

function pushCard(run, kind, amount = 1) {
    // 충원 카드는 한 장으로 쌓는다 — 정원을 넘는 수는 카드에 남으므로 합쳐도 잃는 게 없다
    if (kind === 'soldier') {
        const same = run.tray.find(c => c.kind === 'soldier');
        if (same) { same.amount += amount; return same; }
    }
    const card = { uid: cardSeq++, kind, amount };
    run.tray.push(card);
    return card;
}

/** 병사 슬롯 한 번 — 군자금을 내고, 결과를 카드 · 조각 · 엽전으로 바꾼다 */
export function spin(data, run) {
    const c = canSpin(data, run);
    if (!c.ok) return { ok: false, why: c.why };
    const B = data.B;
    const cost = spinCost(data, run);
    run.gold -= cost;
    run.spinsThisPrep++;
    const rng = makeRng(deriveSeed(run.seed, 1000 + run.spinCount++));
    const res = spinSoldier(data, rng);
    const got = [];
    if (res.pay.soldiers > 0) got.push(pushCard(run, 'soldier', res.pay.soldiers));
    run.frags.train += res.pay.train;
    run.frags.tech += res.pay.tech;
    while (run.frags.train >= B.frag_per_card) { run.frags.train -= B.frag_per_card; got.push(pushCard(run, 'train')); }
    while (run.frags.tech >= B.frag_per_card) { run.frags.tech -= B.frag_per_card; got.push(pushCard(run, 'tech')); }
    run.gold += res.pay.gold;
    if (res.pay.jackpot) { got.push(pushCard(run, 'tank')); run.stats.jackpots++; }
    run.stats.spins++;
    run.lastSpin = { ...res, cost, got };
    return { ok: true, res, cost, got };
}

/** 카드를 그 부대에 쓸 수 있나 — 화면이 드롭 대상을 표시하는 데도 쓴다 */
export function canApply(data, run, card, sqIdx) {
    const sq = run.squads[sqIdx];
    if (!sq || !card) return { ok: false, why: '' };
    if (run.phase !== 'prep') return { ok: false, why: '전투 중에는 못 쓴다' };
    switch (card.kind) {
    case 'soldier':
        return sq.soldiers >= squadCap(data, sq) ? { ok: false, why: '정원이 찼다' } : { ok: true };
    case 'train':
        return { ok: true };
    case 'tech': {
        if (sq.nodes >= 3) return { ok: false, why: '테크를 끝까지 탔다' };
        if (sq.nodes >= techDepth(sq.rank)) {
            const need = ['', '중랑장', '장군'][sq.nodes] || '';
            return { ok: false, why: `장군직이 모자란다 (${need} 필요)` };
        }
        return { ok: true, needBranch: !sq.branch };
    }
    case 'tank':
        return sq.tank ? { ok: false, why: '이미 전차가 있다' } : { ok: true };
    default:
        return { ok: false, why: '' };
    }
}

/** 카드를 부대에 쓴다. 병법 카드의 첫 노드는 branch('a'|'b')가 필요하다 */
export function applyCard(data, run, cardUid, sqIdx, branch) {
    const idx = run.tray.findIndex(c => c.uid === cardUid);
    if (idx < 0) return { ok: false, why: '카드가 없다' };
    const card = run.tray[idx];
    const chk = canApply(data, run, card, sqIdx);
    if (!chk.ok) return chk;
    const sq = run.squads[sqIdx];
    const hero = data.heroes[sq.heroId];
    let note = '';
    switch (card.kind) {
    case 'soldier': {
        const add = Math.min(card.amount, squadCap(data, sq) - sq.soldiers);
        sq.soldiers += add;
        card.amount -= add;
        if (card.amount <= 0) run.tray.splice(idx, 1);
        note = `${hero.name} 부대 +${add}명`;
        break;
    }
    case 'train':
        run.typeLevel[hero.type]++;
        run.tray.splice(idx, 1);
        note = `${data.units[hero.type].name} 훈련 ${run.typeLevel[hero.type]}단계`;
        break;
    case 'tech': {
        if (!sq.branch) {
            if (branch !== 'a' && branch !== 'b') return { ok: false, why: '갈래를 골라야 한다', needBranch: true };
            sq.branch = branch;
        }
        sq.nodes++;
        run.tray.splice(idx, 1);
        note = `${hero.name} 부대 — ${data.tech[hero.type][sq.branch].nodes[sq.nodes - 1].name}`;
        break;
    }
    case 'tank':
        sq.tank = true;
        run.tray.splice(idx, 1);
        note = `${hero.name} 부대에 전차가 붙었다`;
        break;
    }
    return { ok: true, note };
}

/** 부대를 배치 칸으로 옮긴다 — 칸에 다른 부대가 있으면 자리를 바꾼다 */
export function placeSquad(run, sqIdx, cell) {
    if (run.phase !== 'prep') return false;
    if (cell < 0 || cell > 8) return false;
    const other = run.squads.findIndex(s => s.cell === cell);
    if (other >= 0 && other !== sqIdx) run.squads[other].cell = run.squads[sqIdx].cell;
    run.squads[sqIdx].cell = cell;
    return true;
}

export function startBattle(data, run) {
    if (run.phase !== 'prep') return null;
    run.phase = 'battle';
    const sim = new BattleSim(data, run, deriveSeed(run.seed, 5000 + run.battleCount++));
    return sim;
}

/** 전투 결과를 판에 반영한다 → run.phase 는 'prep' | 'won' | 'lost' */
export function finishBattle(data, run, r) {
    const B = data.B;
    const stage = data.stageById[run.stageId];
    run.castleHp = r.castleHp;
    run.stats.kills += r.kills;
    const promos = [];
    run.squads.forEach((sq, i) => {
        sq.soldiers = r.heroDead[i] ? 0 : r.survivors[i];
        if (!r.tankAlive[i]) sq.tank = false;
        sq.merit += r.squadKills[i];
        const nr = rankOf(data, sq.merit);
        if (nr > sq.rank) {
            sq.rank = nr;
            promos.push(i);
        }
        sq.soldiers = Math.min(sq.soldiers, squadCap(data, sq));
    });
    const gold = r.kills * B.gold_per_kill + (r.victory ? B.gold_wave_clear : 0) + r.goldBonus;
    run.gold += gold;
    run.lastBattle = { ...r, gold, promos };
    if (!r.victory || run.castleHp <= 0) {
        run.phase = 'lost';
        return run.phase;
    }
    run.stats.waves++;
    if (r.bossKilled) run.stats.bossKilled = true;
    if (run.waveIdx >= stage.waves.length - 1) {
        run.phase = 'won';
        return run.phase;
    }
    run.waveIdx++;
    run.spinsThisPrep = 0;
    run.phase = 'prep';
    return run.phase;
}

/** 판이 끝났을 때 받는 명성 */
export function fameOf(data, run, firstClear) {
    const B = data.B;
    let f = run.stats.kills * B.fame_per_kill + run.stats.waves * B.fame_per_wave;
    if (run.stats.bossKilled) f += B.fame_boss;
    if (run.phase === 'won') f += firstClear ? B.fame_first_clear : B.fame_clear;
    return f;
}
