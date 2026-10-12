/**
 * 단정 묶음 — node(run_tests.js)와 브라우저(dev/test.html)에서 같이 돈다.
 * test(name, fn) 를 모은 배열을 돌려준다. fn 은 실패하면 throw.
 */
import { evalSoldierGrid, evalRecruit, PAYLINES } from '../game_logic/slot.js';
import { createRun, spin, spinCost, canApply, applyCard, placeSquad, startBattle, finishBattle } from '../game_logic/run.js';
import { newMeta, loadMeta, recruit, settleRun } from '../game_logic/meta.js';
import { capOf, rankOf, techMods } from '../game_logic/stats.js';
import { autoRun, autoPrep } from './autoplay.js';

function eq(a, b, msg) {
    if (a !== b) throw new Error(`${msg}: ${JSON.stringify(a)} !== ${JSON.stringify(b)}`);
}
function ok(c, msg) {
    if (!c) throw new Error(msg);
}

export function suite(data) {
    const T = [];
    const test = (name, fn) => T.push({ name, fn });
    const B = data.B;

    test('CSV — 장수마다 계략 · 병종이 있다', () => {
        for (const id of data.heroList) {
            const h = data.heroes[id];
            ok(data.skills[h.skill], `${id} 계략 ${h.skill} 없음`);
            ok(data.units[h.type], `${id} 병종 ${h.type} 없음`);
            ok([1, 2, 3].includes(h.grade), `${id} 등급`);
        }
        eq(data.heroList.length, 24, '장수 수');
    });
    test('CSV — 스테이지 10 · 보스는 장수 표에 있다 · 마지막 웨이브가 보스', () => {
        eq(data.stages.length, 10, '스테이지 수');
        for (const s of data.stages) {
            ok(data.heroes[s.boss], `${s.id} 보스 ${s.boss}`);
            ok(s.waves.length >= 3, `${s.id} 웨이브 수`);
            eq(s.waves[s.waves.length - 1].boss, 1, `${s.id} 마지막 웨이브 보스`);
            eq(s.waves.filter(w => w.boss).length, 1, `${s.id} 보스 웨이브 하나`);
        }
    });
    test('CSV — 테크는 병종마다 갈래 둘 × 노드 셋', () => {
        for (const t of ['infantry', 'archer', 'cavalry']) {
            for (const b of ['a', 'b']) eq(data.tech[t][b].nodes.filter(Boolean).length, 3, `${t}/${b}`);
        }
    });
    test('CSV — 인연 멤버는 장수 표에 있다', () => {
        for (const b of data.bonds) for (const m of b.members) ok(data.heroes[m], `${b.id}: ${m}`);
    });

    test('병사 슬롯 — 줄 8개', () => eq(PAYLINES.length, 8, 'paylines'));
    test('병사 슬롯 — 卒 아홉 칸 = 줄 8개', () => {
        const r = evalSoldierGrid(data, Array(9).fill('soldier'));
        eq(r.lines.length, 8, 'lines');
        eq(r.pay.soldiers, 9 * B.pay_soldier_cell + 8 * B.pay_soldier_line, 'soldiers');
    });
    test('병사 슬롯 — 時 는 와일드 · 셋이면 잭팟', () => {
        const g = ['wild', 'coin', 'coin', 'train', 'wild', 'book', 'soldier', 'book', 'wild'];
        const r = evalSoldierGrid(data, g);
        ok(r.pay.jackpot, 'jackpot');
        // 0-4-8 대각은 時 셋 → 줄 아님 · 0-1-2 = 時 錢 錢 → 錢 줄
        ok(r.lines.some(l => l.kind === 'coin' && l.cells.join() === '0,1,2'), '錢 줄');
        ok(!r.lines.some(l => l.cells.join() === '0,4,8'), '時 셋 줄은 줄로 안 센다');
    });
    test('병사 슬롯 — 꽝이 없다(어떤 칸이든 뭔가 준다)', () => {
        for (const s of data.slotSymbols) {
            if (s.kind === 'wild') continue;
            const r = evalSoldierGrid(data, [s.id, 'wild', 'wild', ...Array(6).fill(s.id)].slice(0, 9));
            const p = r.pay;
            ok(p.soldiers + p.train + p.tech + p.gold > 0, s.id);
        }
    });
    test('등용 슬롯 — 점수 경계 · 桃 셋 = 도원결의', () => {
        eq(evalRecruit(data, ['bronze', 'bronze', 'bronze']).grade, 1, '동동동');
        eq(evalRecruit(data, ['silver', 'silver', 'silver']).grade, 2, '은은은');
        eq(evalRecruit(data, ['gold', 'gold', 'silver']).grade, 3, '금금은');
        ok(evalRecruit(data, ['peach', 'peach', 'peach']).taoyuan, '도원결의');
    });

    test('판 — 스핀 값은 준비 단계 안에서 오르고 다음 웨이브에 처음으로', () => {
        const meta = newMeta(data, 7);
        const run = createRun(data, meta, 1, data.startHeroes, 99);
        run.gold = 999;
        const c0 = spinCost(data, run);
        spin(data, run);
        eq(spinCost(data, run), c0 + B.spin_cost_step, '오름');
        run.tray = [];
        const sim = startBattle(data, run);
        sim.recordEvents = false;
        while (!sim.over) sim.step(B.tick);
        finishBattle(data, run, sim.result());
        if (run.phase === 'prep') eq(spinCost(data, run), c0, '돌아옴');
    });
    test('판 — 충원은 정원까지 · 남은 수는 카드에 남는다', () => {
        const meta = newMeta(data, 7);
        const run = createRun(data, meta, 1, ['liubei'], 1);
        const sq = run.squads[0];
        const cap = capOf(data, 'liubei', 0, 0);
        run.tray.push({ uid: 9001, kind: 'soldier', amount: 999 });
        applyCard(data, run, 9001, 0);
        eq(sq.soldiers, cap, '정원');
        ok(run.tray.find(c => c.uid === 9001).amount > 0, '남은 카드');
        eq(canApply(data, run, run.tray[0], 0).ok, false, '정원이 차면 못 쓴다');
    });
    test('판 — 병법은 장군직 깊이까지 · 첫 노드는 갈래가 필요', () => {
        const meta = newMeta(data, 7);
        const run = createRun(data, meta, 1, ['pangde'], 1);
        run.tray.push({ uid: 9101, kind: 'tech', amount: 1 }, { uid: 9102, kind: 'tech', amount: 1 });
        eq(applyCard(data, run, 9101, 0).ok, false, '갈래 없이');
        eq(applyCard(data, run, 9101, 0, 'a').ok, true, '갈래 a');
        eq(applyCard(data, run, 9102, 0).ok, false, '교위는 1단까지');
        run.squads[0].rank = 1;
        eq(applyCard(data, run, 9102, 0).ok, true, '중랑장은 2단');
        eq(techMods(data, 'cavalry', 'a', 2).hp, 1.4, '돌격 2단 = 중갑 체력');
    });
    test('판 — 배치 칸에 다른 부대가 있으면 자리를 바꾼다', () => {
        const meta = newMeta(data, 7);
        const run = createRun(data, meta, 1, data.startHeroes, 1);
        const c0 = run.squads[0].cell;
        const c1 = run.squads[1].cell;
        placeSquad(run, 0, c1);
        eq(run.squads[0].cell, c1, '옮김');
        eq(run.squads[1].cell, c0, '바꿈');
    });
    test('장군직 — 전공 경계', () => {
        eq(rankOf(data, 0), 0, '0');
        eq(rankOf(data, B.rank1_merit), 1, 'r1');
        eq(rankOf(data, B.rank3_merit), 3, 'r3');
    });

    test('전투 — 같은 시드면 같은 결과', () => {
        const meta = newMeta(data, 3);
        const mk = () => {
            const run = createRun(data, meta, 2, data.startHeroes, 4242);
            run.squads.forEach(s => (s.soldiers = 6));
            const sim = startBattle(data, run);
            sim.recordEvents = false;
            while (!sim.over) sim.step(B.tick);
            return JSON.stringify(sim.result());
        };
        eq(mk(), mk(), '결정성');
    });
    test('전투 — 웨이브는 끝난다(시간 제한 안)', () => {
        const meta = newMeta(data, 3);
        const run = createRun(data, meta, 10, data.startHeroes, 5);
        const sim = startBattle(data, run);
        sim.recordEvents = false;
        let n = 0;
        while (!sim.over && n++ < 1e6) sim.step(B.tick);
        ok(sim.over, '끝남');
        ok(sim.t <= B.time_limit + B.tick, '시간');
    });
    test('전투 — 장수가 쓰러지면 부대가 흩어진다', () => {
        const meta = newMeta(data, 3);
        const run = createRun(data, meta, 1, ['liubei'], 5);
        run.squads[0].soldiers = 8;
        const sim = startBattle(data, run);
        const hero = sim.units.find(u => u.kind === 'hero');
        sim.kill(hero, null);
        eq(sim.units.filter(u => !u.dead && u.kind === 'soldier' && u.side === 0).length, 0, '병사 0');
    });
    test('전투 — 적은 부장이 이끄는 무리로 오고, 부장이 쓰러지면 무리가 흩어진다', () => {
        const meta = newMeta(data, 3);
        const run = createRun(data, meta, 1, ['liubei'], 5);
        const sim = startBattle(data, run);
        sim.recordEvents = false;
        while (!sim.units.some(u => u.kind === 'officer')) sim.step(B.tick);
        const off = sim.units.find(u => u.kind === 'officer');
        const band = sim.units.filter(u => u.kind === 'enemy' && u.lead === off.id);
        ok(band.length > 0, '무리');
        sim.kill(off, null);
        ok(band.every(u => u.routed !== undefined), '흩어짐');
        for (let i = 0; i < 200; i++) sim.step(B.tick);
        ok(band.every(u => u.dead), '사라짐');
    });

    test('등용 — 새 장수 / 돌파 / 상한이면 환급', () => {
        const meta = newMeta(data, 11);
        meta.fame = 1e6;
        const seen = new Set();
        let dupe = false;
        for (let i = 0; i < 300; i++) {
            const r = recruit(data, meta);
            for (const x of r.results) {
                if (x.kind === 'new') seen.add(x.heroId);
                if (x.kind === 'dupe') dupe = true;
            }
        }
        ok(seen.size > 5, '새 장수');
        ok(dupe, '돌파');
        for (const h of Object.values(meta.heroes)) ok(h.dupes <= B.breakthrough_max, '상한');
    });
    test('세이브 — JSON 왕복', () => {
        const meta = newMeta(data, 11);
        meta.fame = 500;
        recruit(data, meta);
        meta.cleared[1] = true;
        const back = loadMeta(data, JSON.parse(JSON.stringify(meta)));
        eq(JSON.stringify(back), JSON.stringify(meta), '왕복');
        eq(loadMeta(data, { v: 999 }), null, '모르는 판');
    });
    test('정산 — 이기면 깬 스테이지 · 명성', () => {
        const meta = newMeta(data, 11);
        const res = autoRun(data, meta, 1);
        const f0 = meta.fame;
        const s = settleRun(data, meta, res.run);
        eq(meta.fame, f0 + s.fame, '명성');
        if (res.run.phase === 'won') ok(meta.cleared[1], '깬 기록');
    });
    test('자동 준비 — 카드를 쓰고 돈이 음수가 되지 않는다', () => {
        const meta = newMeta(data, 11);
        const run = createRun(data, meta, 1, data.startHeroes, 3);
        autoPrep(data, run);
        ok(run.gold >= 0, '돈');
    });
    return T;
}

export function runSuite(data, log = console.log) {
    let pass = 0;
    let fail = 0;
    for (const t of suite(data)) {
        try {
            t.fn();
            pass++;
            log(`  ok   ${t.name}`);
        } catch (e) {
            fail++;
            log(`  FAIL ${t.name} — ${e.message}`);
        }
    }
    log(`${pass} passed, ${fail} failed`);
    return { pass, fail };
}
