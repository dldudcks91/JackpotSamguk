/**
 * CSV 행들 → 게임이 쓰는 데이터 묶음. 파싱된 행 배열을 받는다(읽기는 ui/ 어댑터나 dev 러너의 일).
 * 순수 모듈 — DOM/저장소 접근 없음.
 */
import { keyValue, indexBy } from './csv.js';

export const TABLES = ['balance', 'unit_types', 'heroes', 'skills', 'tech', 'stages', 'waves', 'bonds',
    'slot_symbols', 'recruit_symbols'];

/** "armor=0.2|charge=1.8|splash=40:0.5" → {armor:0.2, charge:1.8, splash:[40,0.5]} */
export function parseEffects(s) {
    const out = {};
    if (!s) return out;
    for (const part of String(s).split('|')) {
        const [k, v] = part.split('=');
        if (!k) continue;
        if (v.includes(':')) {
            out[k] = v.split(':').map(x => (isNaN(Number(x)) ? x : Number(x)));
        } else {
            out[k] = isNaN(Number(v)) ? v : Number(v);
        }
    }
    return out;
}

export function buildData(raw) {
    const B = keyValue(raw.balance);
    const units = indexBy(raw.unit_types, 'id');
    const heroes = indexBy(raw.heroes, 'id');
    const skills = indexBy(raw.skills, 'id');
    const stages = raw.stages.map(s => ({ ...s, waves: [] }));
    const stageById = indexBy(stages, 'id');
    for (const w of raw.waves) stageById[w.stage].waves.push(w);
    for (const s of stages) s.waves.sort((a, b) => a.wave - b.wave);

    // tech[type][branch] = [node1, node2, node3] (+ branchName)
    const tech = {};
    for (const r of raw.tech) {
        const t = (tech[r.type] ??= {});
        const b = (t[r.branch] ??= { id: r.branch, name: r.branch_name, nodes: [] });
        b.nodes[r.node - 1] = { name: r.name, effects: parseEffects(r.effects), desc: r.desc };
    }

    const bonds = raw.bonds.map(b => ({ ...b, members: String(b.members).split('|') }));
    const heroesByGrade = { 1: [], 2: [], 3: [] };
    for (const h of raw.heroes) heroesByGrade[h.grade].push(h.id);

    return {
        B,
        units,
        heroes,
        heroList: raw.heroes.map(h => h.id),
        heroesByGrade,
        skills,
        tech,
        stages,
        stageById,
        bonds,
        slotSymbols: raw.slot_symbols,
        recruitSymbols: raw.recruit_symbols,
        startHeroes: String(B.start_heroes).split('|'),
    };
}
