/**
 * 판 밖 상태 — 명성 · 가진 장수(돌파) · 깬 스테이지. 세이브는 이 객체 그대로의 JSON(엔진 중립).
 * 저장소 접근은 ui/ 의 어댑터가 한다.
 */
import { makeRng, deriveSeed } from './rng.js';
import { spinRecruit } from './slot.js';
import { fameOf } from './run.js';

export const SAVE_VERSION = 1;

export function newMeta(data, seed) {
    const heroes = {};
    for (const id of data.startHeroes) heroes[id] = { dupes: 0 };
    return {
        v: SAVE_VERSION, seed: seed >>> 0,
        fame: data.B.start_fame,
        heroes,
        cleared: {},
        counters: { recruit: 0, run: 0 },
        stats: { runs: 0, wins: 0, losses: 0, recruits: 0, startedAt: null, endedAt: null },
        ending: false,
    };
}

/** 세이브 JSON → meta (모르는 장수 · 망가진 값은 걸러낸다) */
export function loadMeta(data, obj) {
    if (!obj || obj.v !== SAVE_VERSION || typeof obj.fame !== 'number') return null;
    const m = newMeta(data, obj.seed ?? 1);
    m.fame = Math.max(0, Math.floor(obj.fame));
    m.heroes = {};
    for (const [id, h] of Object.entries(obj.heroes || {})) {
        if (data.heroes[id]) m.heroes[id] = { dupes: Math.max(0, Math.min(data.B.breakthrough_max, h.dupes | 0)) };
    }
    for (const id of data.startHeroes) m.heroes[id] ??= { dupes: 0 };
    for (const [k, v] of Object.entries(obj.cleared || {})) if (data.stageById[k] && v) m.cleared[k] = true;
    Object.assign(m.counters, obj.counters || {});
    Object.assign(m.stats, obj.stats || {});
    m.ending = !!obj.ending;
    return m;
}

export function isUnlocked(meta, stageId) {
    return stageId === 1 || !!meta.cleared[stageId - 1];
}

export function canRecruit(data, meta) {
    return meta.fame >= data.B.recruit_cost;
}

/**
 * 등용 슬롯 한 번.
 * @returns {{ok, spin, results: {heroId, kind: 'new'|'dupe'|'refund', dupes}[], refund}}
 */
export function recruit(data, meta) {
    const B = data.B;
    if (!canRecruit(data, meta)) return { ok: false, why: '명성이 모자란다' };
    meta.fame -= B.recruit_cost;
    const rng = makeRng(deriveSeed(meta.seed, 100 + meta.counters.recruit++));
    const spin = spinRecruit(data, rng);
    let ids;
    if (spin.taoyuan) {
        ids = ['liubei', 'guanyu', 'zhangfei'];
    } else {
        const pool = data.heroesByGrade[spin.grade];
        ids = [pool[Math.floor(rng() * pool.length)]];
    }
    let refund = 0;
    const results = ids.map(id => {
        const h = meta.heroes[id];
        if (!h) {
            meta.heroes[id] = { dupes: 0 };
            return { heroId: id, kind: 'new', dupes: 0 };
        }
        if (h.dupes < B.breakthrough_max) {
            h.dupes++;
            return { heroId: id, kind: 'dupe', dupes: h.dupes };
        }
        refund += B.recruit_refund;
        return { heroId: id, kind: 'refund', dupes: h.dupes };
    });
    meta.fame += refund;
    meta.stats.recruits++;
    return { ok: true, spin, results, refund };
}

/** 판이 끝나면 — 명성을 쌓고 깬 스테이지를 기록한다 */
export function settleRun(data, meta, run) {
    const first = run.phase === 'won' && !meta.cleared[run.stageId];
    const fame = fameOf(data, run, first);
    meta.fame += fame;
    meta.stats.runs++;
    if (run.phase === 'won') {
        meta.stats.wins++;
        meta.cleared[run.stageId] = true;
    } else {
        meta.stats.losses++;
    }
    const ending = run.phase === 'won' && run.stageId === data.stages.length && !meta.ending;
    if (ending) meta.ending = true;
    return { fame, firstClear: first, ending };
}

export function newRunSeed(meta) {
    return deriveSeed(meta.seed, 7000 + meta.counters.run++);
}
