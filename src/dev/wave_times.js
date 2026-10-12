/**
 * 웨이브 길이 재기 — 자동 플레이어로 엔딩까지 가며 스테이지마다 웨이브 한 번의 전투 시간(×1 기준 초) · 일기토 · 도망 수.
 * node src/dev/wave_times.js [시드 수=3] [--key=value ...]
 */
import { loadDataNode } from './node_data.js';
import { autoPrep, pickDeploy } from './autoplay.js';
import { newMeta, settleRun, newRunSeed, isUnlocked, recruit, canRecruit } from '../game_logic/meta.js';
import { createRun, startBattle, finishBattle } from '../game_logic/run.js';

const args = process.argv.slice(2);
const n = Number(args.find(a => /^\d+$/.test(a)) ?? 3);
const over = {};
for (const a of args) {
    const m = a.match(/^--(\w+)=(.+)$/);
    if (m) over[m[1]] = isNaN(Number(m[2])) ? m[2] : Number(m[2]);
}
const data = loadDataNode(over);
const st = {};
for (let s = 1; s <= n; s++) {
    const meta = newMeta(data, s * 7919);
    while (canRecruit(data, meta)) recruit(data, meta);
    for (let guard = 0; guard < 80; guard++) {
        const next = data.stages.find(x => !meta.cleared[x.id] && isUnlocked(meta, x.id));
        if (!next) break;
        const run = createRun(data, meta, next.id, pickDeploy(data, meta, next.id), newRunSeed(meta));
        while (run.phase === 'prep') {
            autoPrep(data, run, {});
            const sim = startBattle(data, run);
            sim.recordEvents = false;
            while (!sim.over) sim.step(data.B.tick);
            const r = sim.result();
            const o = (st[next.id] ??= { t: [], duels: 0, fled: 0, kills: 0, heroDead: 0, waves: 0 });
            o.t.push(r.time);
            o.duels += r.duels;
            o.fled += r.fled;
            o.kills += r.kills;
            o.heroDead += r.heroDead.filter(Boolean).length;
            o.waves++;
            finishBattle(data, run, r);
        }
        const settle = settleRun(data, meta, run);
        while (canRecruit(data, meta)) recruit(data, meta);
        if (settle.ending) break;
    }
}
console.log('stage  waves  avg(s)  max(s)  duels/wave  fled%  heroDead/wave');
for (const [k, o] of Object.entries(st)) {
    const avg = o.t.reduce((a, b) => a + b, 0) / o.t.length;
    console.log(`${k.padStart(5)}  ${String(o.waves).padStart(5)}  ${avg.toFixed(1).padStart(6)}  ${Math.max(...o.t).toFixed(1).padStart(6)}  ${(o.duels / o.waves).toFixed(2).padStart(10)}  ${((100 * o.fled) / Math.max(1, o.kills)).toFixed(0).padStart(5)}  ${(o.heroDead / o.waves).toFixed(2).padStart(13)}`);
}
