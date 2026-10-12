/**
 * 밸런스 시뮬 — 자동 플레이어로 처음부터 엔딩까지 N 번.
 * node src/dev/run_sim.js [시드 수=12] [--log] [--key=value ...(balance 덮어쓰기)]
 */
import { loadDataNode } from './node_data.js';
import { autoCampaign } from './autoplay.js';

const args = process.argv.slice(2);
const n = Number(args.find(a => /^\d+$/.test(a)) ?? 12);
const showLog = args.includes('--log');
const offset = Number((args.find(a => a.startsWith('--offset=')) || '--offset=0').split('=')[1]);
const over = {};
for (const a of args) {
    if (a.startsWith('--offset=')) continue;
    const m = a.match(/^--(\w+)=(.+)$/);
    if (m) over[m[1]] = isNaN(Number(m[2])) ? m[2] : Number(m[2]);
}
const data = loadDataNode(over);

const rows = [];
for (let s = 1; s <= n; s++) {
    const t0 = Date.now();
    const c = autoCampaign(data, (s + offset) * 7919);
    const tries = {};
    for (const l of c.log) tries[l.stage] = (tries[l.stage] || 0) + 1;
    rows.push({ seed: s, done: c.done, runs: c.log.length, minutes: c.minutes, tries, ms: Date.now() - t0 });
    if (args.includes('--json')) console.log('JSON ' + JSON.stringify({ minutes: c.minutes, runs: c.log.length, done: c.done, tries }));
    if (showLog && s === 1) {
        for (const l of c.log) console.log(`  st${l.stage} ${l.phase.padEnd(4)} wave${l.wave} castle${String(l.castle).padStart(3)} fame+${l.fame} ${l.minutes}m heroes${l.heroes}`);
    }
}
const avg = k => rows.reduce((a, r) => a + r[k], 0) / rows.length;
console.log(`seeds=${n} done=${rows.filter(r => r.done).length}/${n} runs≈${avg('runs').toFixed(1)} minutes≈${avg('minutes').toFixed(1)} (min ${Math.min(...rows.map(r => r.minutes)).toFixed(0)} · max ${Math.max(...rows.map(r => r.minutes)).toFixed(0)}) sim ${avg('ms').toFixed(0)}ms/campaign`);
const st = {};
for (const r of rows) for (const [k, v] of Object.entries(r.tries)) (st[k] ??= []).push(v);
console.log('tries per stage: ' + Object.entries(st).map(([k, v]) => `${k}:${(v.reduce((a, b) => a + b, 0) / v.length).toFixed(1)}`).join('  '));
