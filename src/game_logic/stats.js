/**
 * 장수 · 부대의 파생 수치 — 돌파 · 장군직 · 훈련 · 테크 · 인연을 한곳에서 합친다.
 * 순수 함수만 둔다(상태를 바꾸지 않는다).
 */

export const RANK_NAMES = ['교위', '중랑장', '장군', '대장군'];
const TECH_DEPTH = [1, 2, 3, 3];

/** 돌파를 반영한 세 스탯 */
export function heroStats(data, heroId, dupes = 0) {
    const h = data.heroes[heroId];
    const m = 1 + data.B.breakthrough_per * Math.min(dupes, data.B.breakthrough_max);
    return { lead: Math.round(h.lead * m), str: Math.round(h.str * m), int: Math.round(h.int * m) };
}

export function rankOf(data, merit) {
    const B = data.B;
    if (merit >= B.rank3_merit) return 3;
    if (merit >= B.rank2_merit) return 2;
    if (merit >= B.rank1_merit) return 1;
    return 0;
}

export const techDepth = rank => TECH_DEPTH[rank];

/** 다음 장군직까지 필요한 전공 (대장군이면 null) */
export function nextRankMerit(data, rank) {
    return [data.B.rank1_merit, data.B.rank2_merit, data.B.rank3_merit][rank] ?? null;
}

export function capOf(data, heroId, dupes, rank) {
    const s = heroStats(data, heroId, dupes);
    return data.B.cap_base + Math.floor(s.lead * data.B.cap_per_lead) + (rank >= 3 ? data.B.grand_cap_bonus : 0);
}

/** 출진 명단에서 켜진 인연 → { heroId: {dmg, hp, skill, spd, cdr} } 와 켜진 인연 목록 */
export function bondMods(data, heroIds) {
    const mods = {};
    const active = [];
    for (const b of data.bonds) {
        const present = b.members.filter(m => heroIds.includes(m));
        if (present.length < b.need) continue;
        active.push({ id: b.id, name: b.name, members: present, desc: b.desc });
        for (const m of present) {
            const o = (mods[m] ??= { dmg: 0, hp: 0, skill: 0, spd: 0, cdr: 0 });
            o[b.effect] += b.value;
        }
    }
    return { mods, active };
}

const NO_BOND = { dmg: 0, hp: 0, skill: 0, spd: 0, cdr: 0 };

/** 테크 노드들을 하나의 보정치로 접는다 */
export function techMods(data, type, branch, nodes) {
    const m = {
        hp: 1, dmg: 1, speed: 1, cd: 1, armor: 0, range: 0, reach: 0, charge: 1,
        splash: null, burn: null, multi: 1, crit: null, bonus: null, ranged: 0, fireweak: 1,
    };
    if (!branch || !nodes) return m;
    const list = data.tech[type][branch].nodes.slice(0, nodes);
    for (const n of list) {
        for (const [k, v] of Object.entries(n.effects)) {
            if (k === 'hp' || k === 'dmg' || k === 'speed' || k === 'cd') m[k] *= v;
            else if (k === 'armor' || k === 'range' || k === 'reach') m[k] += v;
            else if (k === 'charge' || k === 'multi') m[k] = Math.max(m[k], v);
            else if (k === 'ranged' || k === 'fireweak') m[k] = v;
            else m[k] = v;   // splash · burn · crit · bonus
        }
    }
    return m;
}

/** 병사 한 명의 전투 수치 (부대 · 판 상태를 반영) */
export function soldierProfile(data, squad, run) {
    const hero = data.heroes[squad.heroId];
    const u = data.units[hero.type];
    const lvl = run.typeLevel[hero.type] || 0;
    const t = 1 + data.B.train_bonus * lvl;
    const tm = techMods(data, hero.type, squad.branch, squad.nodes);
    const bm = run.bondMods[squad.heroId] || NO_BOND;
    const ranged = tm.ranged > 0 || u.range > 0;
    return {
        type: hero.type,
        hp: u.hp * t * tm.hp * (1 + bm.hp),
        dmg: u.dmg * t * tm.dmg * (1 + bm.dmg) * (tm.ranged > 0 ? 0.8 : 1),
        range: ranged ? (tm.ranged || u.range) + tm.range : 0,
        reach: tm.reach,
        speed: u.speed * tm.speed,
        cd: u.cd * tm.cd * (1 - bm.spd),
        armor: tm.armor,
        charge: tm.charge,
        splash: tm.splash,
        burn: tm.burn,
        multi: tm.multi,
        crit: tm.crit,
        bonus: tm.bonus,
        fireweak: tm.fireweak,
    };
}

/** 장수 본인의 전투 수치 + 계략 배율 */
export function heroProfile(data, squad, run) {
    const B = data.B;
    const hero = data.heroes[squad.heroId];
    const u = data.units[hero.type];
    const s = heroStats(data, squad.heroId, squad.dupes);
    const bm = run.bondMods[squad.heroId] || NO_BOND;
    const grand = squad.rank >= 3 ? B.grand_stat_mult : 1;
    return {
        type: hero.type,
        hp: (B.hero_hp_base + s.str * B.hero_hp_per_str) * grand * (1 + bm.hp),
        dmg: (B.hero_dmg_base + s.str * B.hero_dmg_per_str) * grand * (1 + bm.dmg),
        range: u.range,
        reach: 0,
        speed: u.speed * 0.95,
        cd: u.cd * 0.9 * (1 - bm.spd),
        armor: 0,
        charge: 1, splash: null, burn: null, multi: 1, crit: null, bonus: null, fireweak: 1,
        skillMult: (B.skill_int_base + s.int * B.skill_int_per) * (1 + bm.skill),
        skillCdMult: 1 - bm.cdr,
        str: s.str,
    };
}

/** 보스(적 장수) 수치 — 같은 장수 표를 쓰고 스테이지 배율을 곱한다 */
export function bossProfile(data, heroId, stage) {
    const B = data.B;
    const hero = data.heroes[heroId];
    const u = data.units[hero.type];
    const s = heroStats(data, heroId, 0);
    return {
        type: hero.type,
        hp: (B.hero_hp_base + s.str * B.hero_hp_per_str) * stage.boss_hp,
        dmg: (B.hero_dmg_base + s.str * B.hero_dmg_per_str) * stage.boss_dmg,
        range: u.range,
        reach: 0,
        speed: u.speed * 0.85,
        cd: u.cd * 0.9,
        armor: 0,
        charge: 1, splash: null, burn: null, multi: 1, crit: null, bonus: null, fireweak: 1,
        skillMult: (B.skill_int_base + s.int * B.skill_int_per) * stage.boss_dmg,
        skillCdMult: 1,
        str: s.str,
    };
}

/** 적 병사 수치 */
export function enemyProfile(data, type, stage) {
    const u = data.units[type];
    return {
        type,
        hp: u.hp * stage.hp_mult,
        dmg: u.dmg * stage.dmg_mult,
        range: u.range,
        reach: 0,
        speed: u.speed * 0.92,
        cd: u.cd,
        armor: 0,
        charge: 1, splash: null, burn: null, multi: 1, crit: null, bonus: null, fireweak: 1,
    };
}

/** 적 부장 — 무리 하나를 이끈다. 병종은 그 무리에 가장 많은 병종 */
export function officerProfile(data, type, stage) {
    const B = data.B;
    const u = data.units[type];
    return {
        type,
        hp: B.officer_hp * stage.hp_mult,
        dmg: B.officer_dmg * stage.dmg_mult,
        range: u.range,
        reach: 0,
        speed: u.speed * 0.92,
        cd: u.cd * 0.9,
        armor: 0,
        charge: 1, splash: null, burn: null, multi: 1, crit: null, bonus: null, fireweak: 1,
        str: B.officer_str_base + B.officer_str_step * (stage.id - 1),
    };
}

export function tankProfile(data) {
    const B = data.B;
    return {
        type: 'tank', hp: B.tank_hp, dmg: B.tank_dmg, range: B.tank_range, reach: 0, speed: B.tank_speed,
        cd: B.tank_cd, armor: 0.3, charge: 1, splash: [B.tank_splash, 0.8], burn: null, multi: 1, crit: null,
        bonus: null, fireweak: 1,
    };
}
