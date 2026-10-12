/**
 * 오토배틀 — 웨이브 하나. 고정 간격(step(dt))으로 굴리고, 난수는 시드 RNG 하나만 쓴다 → 같은 시드 = 같은 전투.
 * 화면은 sim.units 와 sim.events(그리고 비운다)만 읽는다. DOM 을 모른다.
 *
 * 좌표: x 0 = 내 성(왼쪽 끝) · 적은 오른쪽에서 온다.
 *
 * 부대 = 장수 원판 하나 + 뒤따르는 병사 대형. 장수가 적 무리를 마중 나가고 병사는 대형 자리(장수 기준 ox, oy)를 따라간다.
 * 장수가 교전하면 병사는 대형을 풀고 장수 곁의 적을 친다 · 적이 없으면 다시 줄을 서서 자기 칸으로 돌아간다.
 * 적도 무리마다 부장(보스 웨이브의 가운데 무리는 보스)이 이끈다 — 부장이 쓰러지면 그 무리는 흩어져 도망친다.
 * 아군 장수와 적 부장 · 보스가 맞닿으면 일기토.
 */
import { makeRng } from './rng.js';
import { soldierProfile, heroProfile, bossProfile, enemyProfile, officerProfile, tankProfile } from './stats.js';

export const PLAYER = 0;
export const ENEMY = 1;
const LEADERS = new Set(['hero', 'officer', 'boss']);

export function cellPos(data, cell) {
    const B = data.B;
    const col = cell % 3;
    const row = Math.floor(cell / 3);
    return { x: B.deploy_x0 + col * B.deploy_dx, y: B.deploy_y0 + row * B.deploy_dy };
}

/** 대형 자리 — 이끄는 이 뒤에 formation_rows 줄로. dir 1 = 앞이 오른쪽(아군) · -1 = 앞이 왼쪽(적) */
export function formation(B, n, dir) {
    const rows = B.formation_rows;
    const g = B.formation_gap;
    const out = [];
    for (let k = 0; k < n; k++) {
        const col = Math.floor(k / rows);
        const row = k % rows;
        const inCol = Math.min(rows, n - col * rows);   // 덜 찬 마지막 열은 가운데로 모은다
        out.push({ ox: -dir * (B.formation_back + col * g), oy: (row - (inCol - 1) / 2) * g });
    }
    return out;
}

/** 부대의 대형 — 장수 자리와 병사 자리들 (전투 시작 · 준비 화면 미리보기가 같이 쓴다) */
export function squadLayout(data, sq) {
    const B = data.B;
    const a = cellPos(data, sq.cell);
    const hero = { x: a.x + 20, y: a.y };
    const soldiers = formation(B, sq.soldiers, 1).map(s => ({ ...s, x: hero.x + s.ox, y: hero.y + s.oy }));
    let tank = null;
    if (sq.tank) {
        const cols = Math.ceil(sq.soldiers / B.formation_rows);
        const ox = -(B.formation_back + cols * B.formation_gap + 26);
        tank = { ox, oy: 0, x: hero.x + ox, y: hero.y };
    }
    return { anchor: a, hero, soldiers, tank };
}

export class BattleSim {
    constructor(data, run, seed) {
        this.data = data;
        this.B = data.B;
        this.run = run;
        this.stage = data.stageById[run.stageId];
        this.wave = this.stage.waves[run.waveIdx];
        this.rng = makeRng(seed);
        this.t = 0;
        this.units = [];
        this.byId = new Map();
        this.nextId = 1;
        this.nextGroup = 1;
        this.zones = [];
        this.events = [];
        this.recordEvents = true;
        this.castleHp = run.castleHp;
        this.leaked = 0;
        this.goldBonus = 0;
        this.squadKills = run.squads.map(() => 0);
        this.squadCount = run.squads.map(() => 0);   // 부대마다 살아 있는 병사 — 적이 장수를 덜 노리는 데 쓴다
        this.heroDead = run.squads.map(() => false);
        this.kills = 0;
        this.fled = 0;
        this.duels = 0;
        this.bossKilled = false;
        this.over = false;
        this.victory = false;
        this.floodMul = this.stage.special === 'flood' ? this.B.flood_speed : 1;
        this.chained = this.stage.special === 'chained';
        this.es = this.enemyStage();
        run.squads.forEach((sq, i) => this.spawnSquad(sq, i));
        this.queue = this.buildQueue();
    }

    emit(e) {
        if (this.recordEvents) this.events.push(e);
    }

    add(u) {
        u.id = this.nextId++;
        u.dead = false;
        u.cdLeft = u.cdLeft ?? this.rng() * 0.6;
        u.target = null;
        u.moved = 0;
        u.stun = 0;
        u.slow = 0;
        u.burn = null;
        u.buffs = [];
        u.maxHp = u.p.hp;
        u.hp = u.hp ?? u.p.hp;
        this.units.push(u);
        this.byId.set(u.id, u);
        return u;
    }

    spawnSquad(sq, i) {
        const B = this.B;
        const hp = heroProfile(this.data, sq, this.run);
        const sp = soldierProfile(this.data, sq, this.run);
        const L = squadLayout(this.data, sq);
        const skill = this.data.skills[this.data.heroes[sq.heroId].skill];
        // 부대 걸음 = 장수와 병사 중 느린 쪽 (전차는 뒤처지면 따라온다)
        const lead = this.add({
            side: PLAYER, kind: 'hero', squad: i, heroId: sq.heroId, p: hp,
            x: L.hero.x, y: L.hero.y, ax: L.hero.x, ay: L.hero.y, r: B.hero_radius,
            skill: { def: skill, cdLeft: skill.first }, pace: L.soldiers.length ? Math.min(hp.speed, sp.speed) : hp.speed,
        });
        for (const s of L.soldiers) {
            this.add({ side: PLAYER, kind: 'soldier', squad: i, p: sp, x: s.x, y: s.y, lead: lead.id, ox: s.ox, oy: s.oy, r: B.soldier_radius });
        }
        this.squadCount[i] = L.soldiers.length;
        if (L.tank) {
            this.add({ side: PLAYER, kind: 'tank', squad: i, p: tankProfile(this.data), x: L.tank.x, y: L.tank.y,
                lead: lead.id, ox: L.tank.ox, oy: L.tank.oy, r: 22 });
        }
    }

    /** 난이도 손잡이(balance)까지 곱한 스테이지 배율 */
    enemyStage() {
        const B = this.B;
        const ramp = 1 + B.enemy_stage_ramp * (this.stage.id - 1);
        return {
            ...this.stage,
            hp_mult: this.stage.hp_mult * B.enemy_hp_mult * ramp,
            dmg_mult: this.stage.dmg_mult * B.enemy_dmg_mult * ramp,
            boss_hp: this.stage.boss_hp * B.enemy_hp_mult * ramp,
            boss_dmg: this.stage.boss_dmg * B.enemy_dmg_mult * ramp,
        };
    }

    /** 웨이브 → 무리들. 무리 k 는 k × (spread / (무리-1)) 초 + 흩어짐에 부장과 함께 한꺼번에 나타난다 */
    buildQueue() {
        const w = this.wave;
        const B = this.B;
        const types = [];
        const cm = B.enemy_count_mult;
        for (const t of ['infantry', 'archer', 'cavalry']) for (let k = 0; k < Math.round(w[t] * cm); k++) types.push(t);
        // 섞는다 (Fisher–Yates)
        for (let i = types.length - 1; i > 0; i--) {
            const j = Math.floor(this.rng() * (i + 1));
            [types[i], types[j]] = [types[j], types[i]];
        }
        const G = Math.max(1, Math.min(B.enemy_groups, types.length));
        const gap = G > 1 ? w.spread / (G - 1) : 0;
        const groups = Array.from({ length: G }, (_, k) => ({ at: k * gap + this.rng() * B.group_jitter, types: [], boss: false }));
        types.forEach((t, k) => groups[k % G].types.push(t));
        if (w.boss) groups[Math.floor((G - 1) / 2)].boss = true;
        groups.sort((a, b) => a.at - b.at);
        return groups;
    }

    spawnGroup(g) {
        const B = this.B;
        const gid = this.nextGroup++;
        const y = B.spawn_y_min + this.rng() * (B.spawn_y_max - B.spawn_y_min);
        const x = B.spawn_x;
        let lead;
        if (g.boss) {
            const id = this.stage.boss;
            const skill = this.data.skills[this.data.heroes[id].skill];
            lead = this.add({ side: ENEMY, kind: 'boss', squad: -1, group: gid, heroId: id, p: bossProfile(this.data, id, this.es),
                x, y, r: B.boss_radius, skill: { def: skill, cdLeft: skill.first + 2 } });
            this.emit({ k: 'boss', heroId: id });
        } else {
            lead = this.add({ side: ENEMY, kind: 'officer', squad: -1, group: gid,
                p: officerProfile(this.data, majority(g.types), this.es), x, y, r: B.officer_radius });
        }
        // 무리 걸음 = 가장 느린 병사에 맞춘다
        let pace = lead.p.speed;
        const slots = formation(B, g.types.length, -1);
        g.types.forEach((t, k) => {
            const p = enemyProfile(this.data, t, this.es);
            pace = Math.min(pace, p.speed);
            const s = slots[k];
            this.add({ side: ENEMY, kind: 'enemy', squad: -1, group: gid, p, lead: lead.id, ox: s.ox, oy: s.oy,
                x: x + s.ox, y: y + s.oy, r: B.soldier_radius });
        });
        lead.pace = pace;
    }

    alive(side) {
        return this.units.filter(u => !u.dead && (side === undefined || u.side === side));
    }

    buff(u, k) {
        let v = 0;
        for (const b of u.buffs) if (b.k === k) v += b.v;
        return v;
    }

    // ── 한 걸음 ─────────────────────────────────────────────
    step(dt) {
        if (this.over) return;
        this.t += dt;
        while (this.queue.length && this.queue[0].at <= this.t) this.spawnGroup(this.queue.shift());

        // 불 지대
        for (const z of this.zones) {
            z.t -= dt;
            for (const u of this.units) {
                if (u.dead || u.side === z.side) continue;
                if (dist2(u, z) <= z.r * z.r) this.damage(u, z.dps * dt, z.src, { fire: true });
            }
        }
        this.zones = this.zones.filter(z => z.t > 0);

        const list = this.units.slice();
        for (const u of list) {
            if (u.dead) continue;
            if (u.ttl !== undefined) {
                u.ttl -= dt;
                if (u.ttl <= 0) { this.remove(u); continue; }
            }
            this.tickStatus(u, dt);
            if (u.dead) continue;
            u.cdLeft -= dt;
            if (u.duelCd > 0) u.duelCd -= dt;
            if (u.skill) u.skill.cdLeft -= dt;
            if (u.stun > 0) continue;
            if (u.skill && u.routed === undefined && u.skill.cdLeft <= 0 && this.tryCast(u)) {
                u.skill.cdLeft = u.skill.def.cd * (u.p.skillCdMult ?? 1);
            }
            if (u.dead) continue;
            this.act(u, dt);
        }
        this.separate();
        if (this.units.some(u => u.dead)) {
            this.units = this.units.filter(u => !u.dead);
        }
        this.checkEnd();
    }

    tickStatus(u, dt) {
        if (u.stun > 0) u.stun -= dt;
        if (u.slow > 0) u.slow -= dt;
        if (u.buffs.length) {
            for (const b of u.buffs) b.t -= dt;
            u.buffs = u.buffs.filter(b => b.t > 0);
        }
        if (u.burn) {
            u.burn.t -= dt;
            this.damage(u, u.burn.dps * dt, u.burn.src, { fire: true });
            if (this.chained && u.side === ENEMY && !u.dead && this.rng() < this.B.fire_spread_chance * dt) {
                const n = this.nearest(u, ENEMY, this.B.fire_spread_radius, v => !v.burn && v !== u);
                if (n) {
                    n.burn = { dps: u.burn.dps, t: Math.max(2, u.burn.t), src: u.burn.src };
                    this.emit({ k: 'spread', x1: u.x, y1: u.y, x2: n.x, y2: n.y });
                }
            }
            if (u.burn && u.burn.t <= 0) u.burn = null;
        }
    }

    nearest(from, side, maxD, filter) {
        let best = null;
        let bd = maxD * maxD;
        for (const v of this.units) {
            if (v.dead || v.side !== side) continue;
            if (filter && !filter(v)) continue;
            const d = dist2(from, v);
            if (d < bd) { bd = d; best = v; }
        }
        return best;
    }

    /** 칠 상대 고르기 — 가장 가까운 적. 도망치는 적은 안 쫓고, 병사가 남은 아군 장수는 guard_bias 만큼 멀게 친다 */
    pick(from, side, maxD, filter) {
        const bias = side === PLAYER ? this.B.guard_bias : 0;
        let best = null;
        let bs = Infinity;
        for (const v of this.units) {
            if (v.dead || v.side !== side || v.routed !== undefined) continue;
            if (filter && !filter(v)) continue;
            const d = Math.sqrt(dist2(from, v));
            if (d > maxD) continue;
            const s = d + (bias && v.kind === 'hero' && this.squadCount[v.squad] > 0 ? bias : 0);
            if (s < bs) { bs = s; best = v; }
        }
        return best;
    }

    speedOf(u) {
        return u.p.speed * (u.slow > 0 ? 0.55 : 1) * this.floodMul;
    }

    /** 무리 걸음 — 이끄는 이가 행군할 때 */
    paceOf(u) {
        return (u.pace ?? u.p.speed) * (u.slow > 0 ? 0.55 : 1) * this.floodMul;
    }

    reachOf(u, t) {
        return u.p.range > 0 ? u.p.range : u.r + t.r + this.B.melee_reach + u.p.reach;
    }

    live(id) {
        const v = id ? this.byId.get(id) : null;
        return v && !v.dead && v.routed === undefined ? v : null;
    }

    act(u, dt) {
        if (u.routed !== undefined) { this.flee(u, dt); return; }
        if (LEADERS.has(u.kind)) { this.actLeader(u, dt); return; }
        const lead = u.lead ? this.byId.get(u.lead) : null;
        if (lead && !lead.dead) this.actMember(u, lead, dt);
        else this.actFree(u, dt);
    }

    /** 칠 수 있으면 치고, 아니면 다가간다 */
    engage(u, tgt, dt, step) {
        const d = Math.sqrt(dist2(u, tgt));
        const reach = this.reachOf(u, tgt);
        if (d <= reach) {
            if (u.cdLeft <= 0) {
                this.attack(u, tgt);
                u.cdLeft = u.p.cd * (1 - Math.min(0.6, this.buff(u, 'spd')));
            }
        } else {
            this.moveToward(u, tgt.x, tgt.y, Math.min(d - reach * 0.8, step), d);
        }
        return d;
    }

    /** 장수 · 부장 · 보스 — 무리를 이끈다 */
    actLeader(u, dt) {
        const B = this.B;
        const isPlayer = u.side === PLAYER;
        const home = isPlayer ? { x: u.ax, y: u.ay } : null;
        const zone = B.leash + u.p.range;
        let tgt = this.live(u.target);
        // 아군 장수는 자기 칸에서 leash 안의 적만 마중 나간다(배치가 의미를 갖도록) · 적 부장은 aggro 안의 아군을 친다
        if (tgt && isPlayer && dist2(home, tgt) > zone * zone) tgt = null;
        if (tgt && !isPlayer && dist2(u, tgt) > (B.aggro_enemy * 1.5) ** 2) tgt = null;
        // 장수는 곁(skirmish)에 적장이 있으면 그쪽부터 노린다 — 장수끼리 맞붙는다
        const inZone = v => !isPlayer || dist2(home, v) <= zone * zone;
        if (!tgt || !LEADERS.has(tgt.kind)) {
            const rival = this.pick(u, 1 - u.side, B.skirmish + u.p.range, v => LEADERS.has(v.kind) && inZone(v));
            if (rival) tgt = rival;
        }
        if (!tgt) tgt = this.pick(u, 1 - u.side, isPlayer ? Infinity : Math.max(B.aggro_enemy, u.p.range + 20), inZone);
        u.target = tgt ? tgt.id : null;
        if (tgt) {
            const d = Math.sqrt(dist2(u, tgt));
            if (LEADERS.has(tgt.kind) && this.tryDuel(u, tgt, d)) return;
            // 멀면 부대 걸음으로 행군, 가까우면 제 속도로 붙는다
            const far = d > this.reachOf(u, tgt) + B.skirmish;
            this.engage(u, tgt, dt, (far ? this.paceOf(u) * B.march_mult : this.speedOf(u)) * dt);
            return;
        }
        const march = this.paceOf(u) * B.march_mult * dt;
        if (isPlayer) {
            // 적이 없으면 자기 칸으로 돌아간다
            const d = Math.sqrt(dist2(u, home));
            if (d > 3) this.moveToward(u, home.x, home.y, Math.min(d, march), d);
        } else {
            u.x -= march;
            u.moved += march;
            if (u.x < B.leak_x) this.leak(u);
        }
    }

    /** 무리 안의 병사 — 이끄는 이가 싸우면 곁의 적을 치고, 아니면 대형 자리로 */
    actMember(u, lead, dt) {
        const B = this.B;
        const opp = 1 - u.side;
        const zone = B.skirmish + u.p.range;
        const engaged = !!this.live(lead.target);
        let tgt = this.live(u.target);
        if (tgt && dist2(lead, tgt) > (zone + 40) ** 2) tgt = null;   // 이끄는 이에게서 너무 멀어지면 놓는다
        if (!tgt) {
            // 교전 중이면 이끄는 이 곁(zone)의 적 · 아니면 코앞(사거리)의 적만
            const reach = engaged ? zone * 2 : Math.max(u.p.range, u.r * 4);
            tgt = this.pick(u, opp, reach, v => dist2(lead, v) <= zone * zone);
        }
        u.target = tgt ? tgt.id : null;
        if (tgt) {
            this.engage(u, tgt, dt, this.speedOf(u) * dt);
            return;
        }
        const sx = lead.x + u.ox;
        const sy = lead.y + u.oy;
        const d = Math.sqrt(dist2(u, { x: sx, y: sy }));
        if (d > 1.5) {
            const v = Math.max(this.speedOf(u), this.paceOf(lead)) * B.march_mult * (d > 30 ? 1.3 : 1);
            this.moveToward(u, sx, sy, Math.min(d, v * dt), d);
        }
    }

    /** 이끄는 이가 없는 유닛 — 복병 · 용병 · 부장이 성에 닿아 남겨진 병사 */
    actFree(u, dt) {
        const B = this.B;
        const isPlayer = u.side === PLAYER;
        let tgt = this.live(u.target);
        if (!tgt) tgt = this.pick(u, 1 - u.side, Math.max(isPlayer ? B.aggro_player : B.aggro_enemy, u.p.range + 20));
        u.target = tgt ? tgt.id : null;
        if (tgt) {
            this.engage(u, tgt, dt, this.speedOf(u) * dt);
            return;
        }
        if (!isPlayer) {
            const step = this.speedOf(u) * B.march_mult * dt;
            u.x -= step;
            u.moved += step;
            if (u.x < B.leak_x) this.leak(u);
        }
    }

    /** 부장을 잃은 병사 — 오른쪽으로 도망치다 사라진다(격퇴로 친다) */
    flee(u, dt) {
        u.routed -= dt;
        u.target = null;
        u.x += this.speedOf(u) * this.B.flee_speed * dt;
        if (u.routed <= 0 || u.x > this.B.field_w + 40) {
            u.dead = true;
            this.byId.delete(u.id);
            this.kills++;
            this.fled++;
            this.emit({ k: 'vanish', x: u.x, y: u.y });
        }
    }

    /** 일기토 — 아군 장수 ↔ 적 부장 · 보스가 맞닿으면 한 번. 무력^duel_pow 비로 승부 */
    tryDuel(a, b, d) {
        const B = this.B;
        const hero = a.side === PLAYER ? a : b;
        const foe = a.side === PLAYER ? b : a;
        if (hero.kind !== 'hero' || (foe.kind !== 'officer' && foe.kind !== 'boss')) return false;
        if (foe.dueled || hero.duelCd > 0 || hero.stun > 0 || foe.stun > 0) return false;
        if (d > hero.r + foe.r + B.duel_reach) return false;
        const sh = hero.p.str ** B.duel_pow;
        const sf = foe.p.str ** B.duel_pow;
        const win = this.rng() < sh / (sh + sf);
        foe.dueled = true;
        hero.duelCd = B.duel_cd;
        this.duels++;
        this.emit({ k: 'duel', heroId: hero.heroId, foeKind: foe.kind, foeHeroId: foe.heroId || null, win,
            x: (hero.x + foe.x) / 2, y: (hero.y + foe.y) / 2 });
        if (win) {
            if (foe.kind === 'boss') this.damage(foe, foe.maxHp * B.duel_boss_loss, hero, { raw: true, show: true });
            else this.kill(foe, hero);
        } else {
            this.damage(hero, hero.maxHp * B.duel_hero_loss, foe, { raw: true, show: true });
        }
        return true;
    }

    moveToward(u, x, y, step, d) {
        if (d <= 0.001 || step <= 0) return;
        u.x += ((x - u.x) / d) * step;
        u.y += ((y - u.y) / d) * step;
        u.moved += step;
    }

    attack(u, tgt) {
        const p = u.p;
        let dmg = p.dmg * (1 + this.buff(u, 'dmg'));
        let charged = false;
        if (p.charge > 1 && u.moved >= 60) { dmg *= p.charge; charged = true; }
        u.moved = 0;
        if (p.crit && this.rng() < p.crit[0]) dmg *= p.crit[1];
        let targets = [tgt];
        if (p.multi > 1 && p.range > 0) {
            const others = this.units
                .filter(v => !v.dead && v.side !== u.side && v !== tgt && dist2(u, v) <= p.range * p.range)
                .sort((a, b) => dist2(u, a) - dist2(u, b))
                .slice(0, p.multi - 1);
            targets = targets.concat(others);
        }
        for (const t of targets) {
            const bonus = p.bonus && t.p.type === p.bonus[0] ? p.bonus[1] : 1;
            this.emit({ k: 'atk', ranged: p.range > 0, unitType: p.type, side: u.side, id: u.id, x1: u.x, y1: u.y, x2: t.x, y2: t.y, charged });
            this.damage(t, dmg * bonus, u, {});
            if (p.burn && !t.dead) t.burn = { dps: p.burn[0], t: p.burn[1], src: u };
        }
        if (p.splash) {
            const [r, ratio] = p.splash;
            for (const v of this.units) {
                if (v.dead || v.side === u.side || v === tgt) continue;
                if (dist2(v, tgt) <= r * r) this.damage(v, dmg * ratio, u, {});
            }
            if (u.kind === 'tank') this.emit({ k: 'boom', x: tgt.x, y: tgt.y, r });
        }
    }

    damage(t, amount, src, opts) {
        if (t.dead) return;
        let a = amount;
        if (!opts.raw) {
            if (opts.fire) a *= t.p.fireweak;
            const armor = Math.min(0.8, t.p.armor + this.buff(t, 'armor'));
            a *= 1 - armor;
        }
        t.hp -= a;
        if (opts.show) this.emit({ k: 'num', x: t.x, y: t.y - t.r, v: Math.round(a), side: t.side });
        if (t.hp <= 0) this.kill(t, src);
    }

    kill(u, src) {
        if (u.dead) return;
        u.dead = true;
        this.byId.delete(u.id);
        this.emit({ k: 'die', x: u.x, y: u.y, side: u.side, kind: u.kind, unitType: u.p.type, routed: u.routed !== undefined });
        if (u.side === ENEMY) {
            this.kills++;
            if (src && src.side === PLAYER && src.squad >= 0) this.squadKills[src.squad]++;
            if (u.kind === 'boss') this.bossKilled = true;
            if (u.kind === 'officer' || u.kind === 'boss') this.scatter(u);
        } else if (u.kind === 'hero') {
            // 장수가 쓰러지면 부대가 흩어진다
            this.heroDead[u.squad] = true;
            this.squadCount[u.squad] = 0;
            for (const v of this.units) {
                if (!v.dead && v.side === PLAYER && v.squad === u.squad && v.kind === 'soldier') {
                    v.dead = true;
                    this.byId.delete(v.id);
                    this.emit({ k: 'flee', x: v.x, y: v.y });
                }
            }
            this.emit({ k: 'rout', squad: u.squad, heroId: u.heroId, x: u.x, y: u.y });
        } else if (u.kind === 'soldier') {
            this.squadCount[u.squad]--;
        }
    }

    /** 부장(보스)이 쓰러진 무리 — 흩어져 도망친다 */
    scatter(lead) {
        let n = 0;
        for (const v of this.units) {
            if (v.dead || v.lead !== lead.id) continue;
            v.routed = this.B.flee_time;
            v.lead = null;
            v.target = null;
            n++;
        }
        this.emit({ k: 'scatter', x: lead.x, y: lead.y, n, boss: lead.kind === 'boss' });
    }

    remove(u) {
        u.dead = true;
        this.byId.delete(u.id);
        this.emit({ k: 'vanish', x: u.x, y: u.y });
    }

    leak(u) {
        const B = this.B;
        const loss = u.kind === 'boss' ? B.leak_boss : u.kind === 'officer' ? B.leak_officer : B.leak_soldier;
        this.castleHp -= loss;
        this.leaked += loss;
        u.dead = true;
        this.byId.delete(u.id);
        this.emit({ k: 'leak', y: u.y, loss });
    }

    separate() {
        const us = this.units;
        const n = us.length;
        const w = u => (u.kind === 'boss' || u.kind === 'tank' ? 0.2 : LEADERS.has(u.kind) ? 0.35 : 1);
        for (let i = 0; i < n; i++) {
            const a = us[i];
            if (a.dead) continue;
            for (let j = i + 1; j < n; j++) {
                const b = us[j];
                if (b.dead) continue;
                const dx = b.x - a.x;
                const dy = b.y - a.y;
                const min = (a.r + b.r) * 0.85;
                const d2 = dx * dx + dy * dy;
                if (d2 >= min * min || d2 === 0) continue;
                const d = Math.sqrt(d2);
                const push = (min - d) * 0.5;
                const ux = dx / d;
                const uy = dy / d;
                const wa = w(a);
                const wb = w(b);
                a.x -= ux * push * wa; a.y -= uy * push * wa;
                b.x += ux * push * wb; b.y += uy * push * wb;
            }
        }
        const B = this.B;
        for (const u of us) {
            if (u.y < 20) u.y = 20;
            if (u.y > B.field_h - 20) u.y = B.field_h - 20;
            if (u.side === PLAYER && u.x < 14) u.x = 14;
            if (u.x > B.field_w + 60) u.x = B.field_w + 60;
        }
    }

    checkEnd() {
        const B = this.B;
        if (this.castleHp <= 0) { this.finish(false); return; }
        const enemies = this.units.some(u => !u.dead && u.side === ENEMY);
        if (!this.queue.length && !enemies) { this.finish(true); return; }
        if (this.t >= B.time_limit) {
            for (const u of this.units) if (!u.dead && u.side === ENEMY && u.routed === undefined) this.leak(u);
            for (const g of this.queue) this.castleHp -= (g.boss ? B.leak_boss : B.leak_officer) + g.types.length * B.leak_soldier;
            this.queue = [];
            this.finish(this.castleHp > 0);
        }
    }

    finish(victory) {
        this.over = true;
        this.victory = victory;
        this.emit({ k: 'end', victory });
    }

    result() {
        const survivors = this.run.squads.map(() => 0);
        const tankAlive = this.run.squads.map(() => false);
        for (const u of this.units) {
            if (u.dead || u.side !== PLAYER) continue;
            if (u.kind === 'soldier') survivors[u.squad]++;
            if (u.kind === 'tank') tankAlive[u.squad] = true;
        }
        return {
            victory: this.victory,
            castleHp: Math.max(0, this.castleHp),
            leaked: this.leaked,
            squadKills: this.squadKills.slice(),
            survivors,
            heroDead: this.heroDead.slice(),
            tankAlive,
            goldBonus: this.goldBonus,
            kills: this.kills,
            fled: this.fled,
            duels: this.duels,
            bossKilled: this.bossKilled,
            time: this.t,
        };
    }

    // ── 계략 ─────────────────────────────────────────────
    tryCast(u) {
        const def = u.skill.def;
        const opp = 1 - u.side;
        const m = u.p.skillMult ?? 1;
        const near = this.nearest(u, opp, 420);
        const tmpl = def.template;
        if (tmpl === 'heal') {
            const hurt = this.units.filter(v => !v.dead && v.side === u.side && v.hp < v.maxHp * 0.85 && dist2(u, v) <= def.radius ** 2);
            if (!hurt.length) return false;
            for (const v of hurt) v.hp = Math.min(v.maxHp, v.hp + def.power * m);
            this.say(u, def, { r: def.radius });
            return true;
        }
        if (!near) return false;
        const tgt = (u.target && this.byId.get(u.target)) || near;
        const oppIn = (cx, cy, r) => this.units.filter(v => !v.dead && v.side === opp && dist2(v, { x: cx, y: cy }) <= r * r);
        const show = { show: true };
        switch (tmpl) {
        case 'aoe': {
            for (const v of oppIn(u.x, u.y, def.radius)) this.damage(v, def.power * m, u, show);
            this.say(u, def, { r: def.radius });
            break;
        }
        case 'rebel': {
            for (const v of oppIn(u.x, u.y, def.radius)) this.damage(v, def.power * m, u, show);
            u.hp = Math.max(1, u.hp - u.maxHp * def.value);
            this.say(u, def, { r: def.radius });
            break;
        }
        case 'stun': {
            for (const v of oppIn(u.x, u.y, def.radius)) {
                this.damage(v, def.power * m, u, show);
                v.stun = Math.max(v.stun, def.duration);
            }
            this.say(u, def, { r: def.radius });
            break;
        }
        case 'line':
        case 'dash': {
            const d = Math.sqrt(dist2(u, tgt)) || 1;
            const ux = (tgt.x - u.x) / d;
            const uy = (tgt.y - u.y) / d;
            const L = def.radius;
            const W = tmpl === 'line' ? def.value / 2 : 34;
            const x1 = u.x;
            const y1 = u.y;
            for (const v of this.units) {
                if (v.dead || v.side !== opp) continue;
                const px = v.x - x1;
                const py = v.y - y1;
                const along = px * ux + py * uy;
                const perp = Math.abs(px * uy - py * ux);
                if (along >= -10 && along <= L && perp <= W + v.r) this.damage(v, def.power * m, u, show);
            }
            if (tmpl === 'dash') {
                u.x = clamp(u.x + ux * L, 20, this.B.field_w - 10);
                u.y = clamp(u.y + uy * L, 20, this.B.field_h - 20);
            }
            this.say(u, def, { x1, y1, x2: x1 + ux * L, y2: y1 + uy * L, w: W });
            break;
        }
        case 'dot': {
            this.zones.push({ x: tgt.x, y: tgt.y, r: def.radius, dps: def.power * m, t: def.duration, side: u.side, src: u });
            this.say(u, def, { x2: tgt.x, y2: tgt.y, r: def.radius, dur: def.duration });
            break;
        }
        case 'buff_dmg':
        case 'buff_spd': {
            const k = tmpl === 'buff_dmg' ? 'dmg' : 'spd';
            for (const v of this.units) {
                if (v.dead || v.side !== u.side) continue;
                if (def.radius > 0 && dist2(u, v) > def.radius ** 2) continue;
                v.buffs.push({ k, v: def.value, t: def.duration });
            }
            this.say(u, def, { r: def.radius || 0 });
            break;
        }
        case 'self': {
            u.hp = Math.min(u.maxHp, u.hp + u.maxHp * def.power);
            u.buffs.push({ k: 'dmg', v: def.value, t: def.duration });
            this.say(u, def, {});
            break;
        }
        case 'self_armor': {
            u.buffs.push({ k: 'armor', v: def.value, t: def.duration });
            this.say(u, def, {});
            break;
        }
        case 'snipe': {
            let best = null;
            for (const v of this.units) if (!v.dead && v.side === opp && (!best || v.hp > best.hp)) best = v;
            this.say(u, def, { x2: best.x, y2: best.y });
            this.damage(best, def.power * m, u, show);
            break;
        }
        case 'volley': {
            const ts = this.units.filter(v => !v.dead && v.side === opp)
                .sort((a, b) => dist2(u, a) - dist2(u, b)).slice(0, def.value);
            for (const v of ts) {
                this.emit({ k: 'atk', ranged: true, unitType: 'archer', side: u.side, x1: u.x, y1: u.y, x2: v.x, y2: v.y });
                this.damage(v, def.power * m, u, show);
            }
            this.say(u, def, {});
            break;
        }
        case 'bolt': {
            const pool = this.units.filter(v => !v.dead && v.side === opp);
            const hits = [];
            for (let i = 0; i < def.value && pool.length; i++) {
                const j = Math.floor(this.rng() * pool.length);
                hits.push(pool.splice(j, 1)[0]);
            }
            for (const v of hits) {
                this.emit({ k: 'bolt', x: v.x, y: v.y });
                this.damage(v, def.power * m, u, show);
            }
            this.say(u, def, {});
            break;
        }
        case 'summon': {
            const dir = u.side === PLAYER ? -1 : 1;
            const base = this.data.units[def.unit];
            const mult = u.side === PLAYER ? 1 + this.B.train_bonus * (this.run.typeLevel[def.unit] || 0) : this.es.hp_mult;
            const p = { ...enemyProfile(this.data, def.unit, { hp_mult: mult, dmg_mult: mult }), speed: base.speed };
            for (let k = 0; k < def.value; k++) {
                const x = clamp(tgt.x + dir * (40 + this.rng() * 30), 20, this.B.field_w);
                const y = clamp(tgt.y + (this.rng() - 0.5) * 120, 30, this.B.field_h - 30);
                this.add({ side: u.side, kind: 'summon', squad: u.squad, p, x, y, r: this.B.soldier_radius,
                    ttl: def.duration || this.B.summon_ttl_default });
            }
            this.say(u, def, { x2: tgt.x, y2: tgt.y });
            break;
        }
        case 'gold': {
            if (u.side !== PLAYER) {
                // 적 원소는 돈으로 병사를 산다 — 보병 몇을 곁에 부른다
                const p = { ...enemyProfile(this.data, 'infantry', this.es) };
                const n = Math.max(3, Math.round(def.power * m));
                for (let k = 0; k < n; k++) {
                    this.add({ side: ENEMY, kind: 'enemy', squad: -1, p, r: this.B.soldier_radius,
                        x: clamp(u.x + 20 + this.rng() * 40, 20, this.B.field_w + 40), y: clamp(u.y + (this.rng() - 0.5) * 140, 30, this.B.field_h - 30) });
                }
                this.say(u, def, { hire: n });
                break;
            }
            const g = Math.round(def.power * m);
            this.goldBonus += g;
            this.say(u, def, { gold: g });
            break;
        }
        default:
            return false;
        }
        return true;
    }

    say(u, def, extra) {
        this.emit({ k: 'skill', side: u.side, id: u.id, heroId: u.heroId, name: def.name, template: def.template,
            x: u.x, y: u.y, ...extra });
    }
}

function dist2(a, b) {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    return dx * dx + dy * dy;
}

function clamp(v, lo, hi) {
    return v < lo ? lo : v > hi ? hi : v;
}

/** 무리에 가장 많은 병종 (같으면 보병 → 궁병 → 기병 순) */
function majority(types) {
    const n = { infantry: 0, archer: 0, cavalry: 0 };
    for (const t of types) n[t] = (n[t] || 0) + 1;
    return Object.keys(n).reduce((a, b) => (n[b] > n[a] ? b : a));
}
