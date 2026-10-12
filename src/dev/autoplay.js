/**
 * 자동 플레이어 — 밸런스 시뮬 · 테스트용. 「보통 사람이 할 법한」 단순한 판단만 한다.
 * 브라우저(dev/sim.html)와 node(run_sim.js) 양쪽에서 쓴다.
 */
import { createRun, spin, canSpin, spinCost, canApply, applyCard, startBattle, finishBattle, squadCap } from '../game_logic/run.js';
import { newMeta, recruit, canRecruit, settleRun, isUnlocked, newRunSeed } from '../game_logic/meta.js';
import { heroStats } from '../game_logic/stats.js';

/** 장수 점수 — 등급 · 돌파 · 스탯 합 */
export function heroScore(data, meta, id) {
    const s = heroStats(data, id, meta.heroes[id].dupes);
    return s.lead + s.str + s.int + data.heroes[id].grade * 30;
}

export function pickDeploy(data, meta, stageId) {
    const cap = data.stageById[stageId].deploy;
    return Object.keys(meta.heroes).sort((a, b) => heroScore(data, meta, b) - heroScore(data, meta, a)).slice(0, cap);
}

/** 준비 단계 — 돌릴 만큼 돌리고 카드를 다 쓴다 */
export function autoPrep(data, run, opt = {}) {
    const maxSpins = opt.maxSpins ?? 6;
    const reserve = opt.reserve ?? 0;
    let n = 0;
    for (;;) {
        useCards(data, run);
        if (n >= maxSpins || !canSpin(data, run).ok || run.gold - spinCost(data, run) < reserve) break;
        spin(data, run);
        n++;
    }
    useCards(data, run);
    return n;
}

function useCards(data, run) {
    let progress = true;
    while (progress) {
        progress = false;
        for (const card of run.tray.slice()) {
            const order = run.squads.map((sq, i) => i);
            let target = -1;
            if (card.kind === 'soldier') {
                order.sort((a, b) => (squadCap(data, run.squads[b]) - run.squads[b].soldiers) - (squadCap(data, run.squads[a]) - run.squads[a].soldiers));
            } else if (card.kind === 'train') {
                // 병사가 가장 많은 병종
                order.sort((a, b) => run.squads[b].soldiers - run.squads[a].soldiers);
            } else {
                order.sort((a, b) => run.squads[b].merit - run.squads[a].merit);
            }
            for (const i of order) {
                if (canApply(data, run, card, i).ok) { target = i; break; }
            }
            if (target < 0) continue;
            const branch = run.squads[target].branch || (run.squads[target].merit % 2 ? 'b' : 'a');
            const r = applyCard(data, run, card.uid, target, branch);
            if (r.ok) progress = true;
        }
    }
}

/** 웨이브 하나를 끝까지 굴린다 */
export function autoBattle(data, run) {
    const sim = startBattle(data, run);
    sim.recordEvents = false;
    const dt = data.B.tick;
    while (!sim.over) sim.step(dt);
    const r = sim.result();
    finishBattle(data, run, r);
    return r;
}

/** 한 판 */
export function autoRun(data, meta, stageId, opt = {}) {
    const deploy = opt.deploy || pickDeploy(data, meta, stageId);
    const run = createRun(data, meta, stageId, deploy, newRunSeed(meta));
    let battleTime = 0;
    let spins = 0;
    let preps = 0;
    while (run.phase === 'prep') {
        spins += autoPrep(data, run, opt);
        preps++;
        const r = autoBattle(data, run);
        battleTime += r.time;
    }
    return { run, battleTime, spins, preps, deploy };
}

/**
 * 처음부터 엔딩까지 — 판마다 등용을 한다.
 * 실제 시간 견적 = 전투 시간 ÷ 2(기본 속도 ×2) + 준비 단계(기본 12초 + 스핀당 2.5초) + 판 사이 60초(등용 · 편성)
 */
export function autoCampaign(data, seed, opt = {}) {
    const meta = newMeta(data, seed);
    const log = [];
    let seconds = 0;
    const recruitAll = () => {
        while (canRecruit(data, meta)) recruit(data, meta);
    };
    recruitAll();
    for (let guard = 0; guard < (opt.maxRuns ?? 80); guard++) {
        const next = data.stages.find(s => !meta.cleared[s.id] && isUnlocked(meta, s.id));
        if (!next) break;
        const res = autoRun(data, meta, next.id, opt);
        const settle = settleRun(data, meta, res.run);
        const t = res.battleTime / (opt.speed ?? 2) + res.preps * 12 + res.spins * 2.5 + 60;
        seconds += t;
        log.push({ stage: next.id, phase: res.run.phase, wave: res.run.waveIdx + 1, fame: settle.fame,
            castle: res.run.castleHp, minutes: +(t / 60).toFixed(1), heroes: Object.keys(meta.heroes).length });
        recruitAll();
        if (settle.ending) break;
    }
    return { meta, log, minutes: seconds / 60, done: !!meta.ending };
}
