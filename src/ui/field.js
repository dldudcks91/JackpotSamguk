/** 전장 캔버스 — 배경 · 배치 칸 · 토큰 · 이펙트. 전투 계산은 모른다(sim 의 좌표와 이벤트만 읽는다) */
import { img, bgUrl, faceToken, iconUrl, soldierSprite } from './art.js';
import { cellPos, squadLayout, PLAYER } from '../game_logic/battle.js';
import { soldierProfile } from '../game_logic/stats.js';

const C = {
    ivory: '#efe6cf', ink: '#1b1410', blue: '#2b4c9b', red: '#c8321e', yellow: '#e8b422', green: '#2e7d5b',
};
const TEAM_PLAYER = '#4a6fc9';   // 아군 졸병 군복 색 (적은 스테이지 색)
// 졸병 그림 배율 — 보병 그림 키(SOLDIER_PX, 창 끝까지)를 병사 반지름의 몇 배로 그리나. 셋이 같은 배율이라 기병이 더 크다
const SOLDIER_PX = 220;
const SOLDIER_H = 4.4;
const SOLDIER_KINDS = new Set(['soldier', 'enemy', 'summon']);

function lum(hex) {
    const n = parseInt(hex.slice(1), 16);
    const r = (n >> 16) & 255;
    const g = (n >> 8) & 255;
    const b = n & 255;
    return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}

export class FieldRenderer {
    constructor(canvas, data, stage) {
        this.cv = canvas;
        this.g = canvas.getContext('2d');
        this.data = data;
        this.stage = stage;
        this.W = data.B.field_w;
        this.H = data.B.field_h;
        this.q = 1;
        this.resize(1);
        this.bg = img(bgUrl(stage.bg));
        this.tank = img(iconUrl('tank'));
        this.enemyFill = stage.color;
        this.enemyGlyph = lum(stage.color) > 0.55 ? C.ink : C.ivory;
        this.fx = [];
        this.time = 0;
        this.glyph = {};
        for (const [id, u] of Object.entries(data.units)) this.glyph[id] = u.glyph;
        this.facing = new Map();   // 유닛 id → 1(오른쪽) / -1(왼쪽) — 움직이는 쪽을 본다
        this.simRef = null;
    }

    /** 캔버스 내부 해상도 — 화면이 크면 선명하게 (q = 논리 1 단위당 픽셀) */
    resize(q) {
        this.q = Math.max(1, Math.min(2.5, q));
        this.cv.width = Math.round(this.W * this.q);
        this.cv.height = Math.round(this.H * this.q);
        this.g.setTransform(this.q, 0, 0, this.q, 0, 0);
    }

    // ── 이벤트 → 이펙트 ──
    push(e) {
        const fx = this.fx;
        switch (e.k) {
        case 'atk':
            if (e.ranged) fx.push({ k: 'arrow', ...e, life: 0.22, t: 0 });
            else fx.push({ k: 'slash', x: e.x2, y: e.y2, side: e.side, big: e.charged, life: e.charged ? 0.3 : 0.14, t: 0 });
            break;
        case 'die':
            if (SOLDIER_KINDS.has(e.kind) && e.unitType) {
                fx.push({ k: 'fall', x: e.x, y: e.y, side: e.side, type: e.unitType, r: this.data.B.soldier_radius, life: 0.6, t: 0 });
            } else {
                fx.push({ k: 'die', x: e.x, y: e.y, side: e.side, life: 0.45, t: 0, kind: e.kind });
            }
            break;
        case 'flee':
            fx.push({ k: 'flee', x: e.x, y: e.y, life: 0.7, t: 0 });
            break;
        case 'skill':
            this.skillFx(e);
            break;
        case 'num':
            fx.push({ k: 'num', x: e.x + (Math.random() - 0.5) * 16, y: e.y, v: e.v, side: e.side, life: 0.8, t: 0 });
            break;
        case 'leak':
            fx.push({ k: 'leak', y: e.y, life: 0.6, t: 0 });
            break;
        case 'rout':
            fx.push({ k: 'callout', x: e.x, y: e.y - 30, text: '부대 붕괴!', color: C.ivory, stroke: C.red, life: 1.4, t: 0, size: 26 });
            break;
        case 'scatter':
            fx.push({ k: 'callout', x: e.x, y: e.y - 30, text: e.boss ? '대장이 쓰러졌다! 적이 흩어진다' : '부장 격파! 무리가 흩어진다',
                color: C.yellow, stroke: C.ink, life: 1.3, t: 0, size: 22 });
            break;
        case 'duel':
            fx.push({ k: 'ring', x: e.x, y: e.y, r: 46, color: C.yellow, life: 0.5, t: 0, fill: true });
            fx.push({ k: 'callout', x: e.x, y: e.y - 44, text: '일기토!', color: C.red, stroke: C.ivory, life: 1.2, t: 0, size: 30 });
            break;
        case 'boom':
            fx.push({ k: 'ring', x: e.x, y: e.y, r: e.r, color: '#e8742a', life: 0.35, t: 0, fill: true });
            break;
        case 'spread':
            fx.push({ k: 'line', x1: e.x1, y1: e.y1, x2: e.x2, y2: e.y2, color: '#e8742a', w: 4, life: 0.3, t: 0 });
            break;
        case 'bolt':
            fx.push({ k: 'bolt', x: e.x, y: e.y, life: 0.3, t: 0, seed: Math.random() });
            break;
        case 'vanish':
            fx.push({ k: 'die', x: e.x, y: e.y, side: 2, life: 0.35, t: 0 });
            break;
        default:
        }
    }

    skillFx(e) {
        const fx = this.fx;
        const enemy = e.side !== PLAYER;
        fx.push({ k: 'callout', x: e.x, y: e.y - 34, text: e.name, color: enemy ? C.red : C.yellow, stroke: C.ink, life: 1.3, t: 0, size: 30 });
        switch (e.template) {
        case 'aoe':
        case 'rebel':
            fx.push({ k: 'ring', x: e.x, y: e.y, r: e.r, color: C.red, life: 0.4, t: 0, fill: true });
            break;
        case 'stun':
            fx.push({ k: 'ring', x: e.x, y: e.y, r: e.r, color: C.yellow, life: 0.5, t: 0, fill: true });
            break;
        case 'heal':
            fx.push({ k: 'ring', x: e.x, y: e.y, r: e.r, color: C.green, life: 0.6, t: 0, fill: true });
            break;
        case 'buff_dmg':
        case 'buff_spd':
            if (e.r) fx.push({ k: 'ring', x: e.x, y: e.y, r: e.r, color: C.yellow, life: 0.6, t: 0 });
            else fx.push({ k: 'flash', color: 'rgba(232,180,34,0.22)', life: 0.45, t: 0 });
            break;
        case 'self':
        case 'self_armor':
            fx.push({ k: 'ring', x: e.x, y: e.y, r: 34, color: e.template === 'self' ? C.red : C.ivory, life: 0.5, t: 0 });
            break;
        case 'line':
        case 'dash':
            fx.push({ k: 'band', x1: e.x1, y1: e.y1, x2: e.x2, y2: e.y2, w: e.template === 'line' ? e.w * 2 : 26,
                color: e.template === 'line' ? C.ivory : C.yellow, life: 0.45, t: 0 });
            break;
        case 'snipe':
            fx.push({ k: 'line', x1: e.x, y1: e.y, x2: e.x2, y2: e.y2, color: C.red, w: 3, life: 0.35, t: 0 });
            fx.push({ k: 'ring', x: e.x2, y: e.y2, r: 30, color: C.red, life: 0.35, t: 0 });
            break;
        case 'summon':
            fx.push({ k: 'ring', x: e.x2, y: e.y2, r: 70, color: C.ivory, life: 0.5, t: 0 });
            break;
        case 'gold':
            if (e.gold) fx.push({ k: 'callout', x: e.x, y: e.y - 70, text: `+${e.gold}냥`, color: C.yellow, stroke: C.ink, life: 1.2, t: 0, size: 24 });
            if (e.hire) fx.push({ k: 'callout', x: e.x, y: e.y - 70, text: `용병 ${e.hire}명 고용`, color: C.ivory, stroke: C.ink, life: 1.2, t: 0, size: 22 });
            break;
        default:
        }
    }

    update(dt) {
        this.time += dt;
        for (const f of this.fx) f.t += dt;
        this.fx = this.fx.filter(f => f.t < f.life);
    }

    // ── 그리기 ──
    drawBg() {
        const g = this.g;
        const im = this.bg;
        if (im.complete && im.naturalWidth) {
            // 3:2 그림을 2:1 전장에 — 가운데 가로 띠를 쓴다
            const sw = im.naturalWidth;
            const sh = sw * (this.H / this.W);
            g.drawImage(im, 0, (im.naturalHeight - sh) / 2, sw, sh, 0, 0, this.W, this.H);
        } else {
            g.fillStyle = '#5a4630';
            g.fillRect(0, 0, this.W, this.H);
        }
        g.fillStyle = 'rgba(20,12,6,0.18)';
        g.fillRect(0, 0, this.W, this.H);
        // 성 쪽 경계
        g.fillStyle = 'rgba(200,50,30,0.18)';
        g.fillRect(0, 0, this.data.B.leak_x, this.H);
    }

    drawGrid(hoverCell, occupied) {
        const g = this.g;
        const B = this.data.B;
        const labels = ['후열', '중열', '전열'];
        g.save();
        g.font = "20px 'Black Han Sans'";
        g.textAlign = 'center';
        for (let col = 0; col < 3; col++) {
            const x = B.deploy_x0 + col * B.deploy_dx;
            g.fillStyle = 'rgba(239,230,207,0.9)';
            g.strokeStyle = C.ink;
            g.lineWidth = 4;
            g.strokeText(labels[col], x - 10, 24);
            g.fillText(labels[col], x - 10, 24);
        }
        for (let cell = 0; cell < 9; cell++) {
            const p = cellPos(this.data, cell);
            const w = B.deploy_dx - 12;
            const hh = B.deploy_dy - 14;
            g.beginPath();
            roundRect(g, p.x - w / 2 - 10, p.y - hh / 2, w, hh, 10);
            g.fillStyle = cell === hoverCell ? 'rgba(232,180,34,0.35)' : occupied.has(cell) ? 'rgba(43,76,155,0.16)' : 'rgba(239,230,207,0.08)';
            g.fill();
            g.setLineDash([10, 7]);
            g.lineWidth = cell === hoverCell ? 4 : 2.5;
            g.strokeStyle = cell === hoverCell ? C.yellow : 'rgba(239,230,207,0.7)';
            g.stroke();
            g.setLineDash([]);
        }
        g.restore();
    }

    /** 졸병 — 발이 (x, y + r0) 에 닿게. face 1 = 오른쪽 · -1 = 왼쪽(기본: 아군 오른쪽 · 적 왼쪽). 그림이 아직 안 왔으면 장기알로 */
    soldier(x, y, r0, side, type, hpFrac, summon, bob = 0, face = side === PLAYER ? 1 : -1) {
        const g = this.g;
        const sp = soldierSprite(type, side === PLAYER ? TEAM_PLAYER : this.enemyFill, face < 0);
        if (!sp) return this.chip(x, y, r0, side, type, hpFrac, summon);
        const k = (r0 * SOLDIER_H) / SOLDIER_PX;
        const w = sp.width * k;
        const h = sp.height * k;
        g.fillStyle = 'rgba(20,12,6,0.32)';
        g.beginPath();
        g.ellipse(x, y + r0, w * 0.32, r0 * 0.32, 0, 0, Math.PI * 2);
        g.fill();
        if (summon) g.globalAlpha = 0.72;
        g.drawImage(sp, x - w / 2, y + r0 - h - bob, w, h);
        g.globalAlpha = 1;
        if (hpFrac < 0.999) this.hpBar(x, y + r0 + 3, r0 * 2, 3, hpFrac, side);
    }

    /** 쓰러지는 졸병 — 발을 축으로 뒤로 넘어가며 흐려진다 */
    fallen(f, k) {
        const sp = soldierSprite(f.type, f.side === PLAYER ? TEAM_PLAYER : this.enemyFill, f.side !== PLAYER);
        if (!sp) return;
        const g = this.g;
        const s = (f.r * SOLDIER_H) / SOLDIER_PX;
        const w = sp.width * s;
        const h = sp.height * s;
        const back = f.side === PLAYER ? -1 : 1;   // 보는 쪽의 반대로 넘어간다
        g.globalAlpha = k < 0.5 ? 1 : 1 - (k - 0.5) / 0.5;
        g.translate(f.x, f.y + f.r);
        g.rotate(back * Math.min(1, k * 3) * (Math.PI / 2));
        g.drawImage(sp, -w / 2, -h, w, h);
    }

    /** 장기알 — 졸병 그림을 못 읽었을 때만 */
    chip(x, y, r0, side, type, hpFrac, summon) {
        const g = this.g;
        const r = r0 * 1.12;
        g.beginPath();
        for (let i = 0; i < 8; i++) {
            const a = Math.PI / 8 + (i * Math.PI) / 4;
            const px = x + Math.cos(a) * r;
            const py = y + Math.sin(a) * r;
            if (i === 0) g.moveTo(px, py); else g.lineTo(px, py);
        }
        g.closePath();
        g.fillStyle = side === PLAYER ? C.ivory : this.enemyFill;
        g.fill();
        g.lineWidth = side === PLAYER ? 2.6 : 2;
        g.strokeStyle = side === PLAYER ? C.blue : C.ink;
        if (summon) g.setLineDash([3, 3]);
        g.stroke();
        g.setLineDash([]);
        g.fillStyle = side === PLAYER ? C.blue : this.enemyGlyph;
        g.font = `900 ${Math.round(r * 1.25)}px 'Noto Serif KR'`;
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillText(this.glyph[type] || '兵', x, y + 1);
        if (hpFrac < 0.999) this.hpBar(x, y + r + 3, r * 2, 3, hpFrac, side);
    }

    hero(x, y, r0, side, heroId, hpFrac, boss) {
        const g = this.g;
        const r = r0 * 1.1;
        const face = faceToken(this.data, heroId, 96);
        g.save();
        g.beginPath();
        g.arc(x, y, r + 3, 0, Math.PI * 2);
        g.fillStyle = C.ink;
        g.fill();
        if (face) g.drawImage(face, x - r, y - r, r * 2, r * 2);
        g.beginPath();
        g.arc(x, y, r, 0, Math.PI * 2);
        g.lineWidth = boss ? 5 : 4;
        g.strokeStyle = side === PLAYER ? C.blue : C.red;
        g.stroke();
        g.restore();
        this.hpBar(x, y + r + 6, r * 2.4, 5, hpFrac, side);
    }

    /** 적 부장 — 이름 없는 부장(스테이지 색 원판 + 將 + 뒤에 꽂은 깃발) */
    officer(x, y, r0, hpFrac, face) {
        const g = this.g;
        const r = r0 * 1.1;
        g.save();
        // 깃발 — 등 뒤(보는 쪽 반대)에 꽂는다
        const bx = x - face * r * 0.55;
        g.strokeStyle = C.ink;
        g.lineWidth = 2.5;
        g.beginPath();
        g.moveTo(bx, y - r * 0.4);
        g.lineTo(bx, y - r * 2.3);
        g.stroke();
        const fl = Math.sin(this.time * 6 + x * 0.05) * 3;
        g.beginPath();
        g.moveTo(bx, y - r * 2.3);
        g.lineTo(bx - face * r * 1.25, y - r * 1.95 + fl);
        g.lineTo(bx, y - r * 1.55);
        g.closePath();
        g.fillStyle = this.enemyFill;
        g.fill();
        g.lineWidth = 2;
        g.stroke();
        // 원판
        g.beginPath();
        g.arc(x, y, r + 3, 0, Math.PI * 2);
        g.fillStyle = C.ink;
        g.fill();
        g.beginPath();
        g.arc(x, y, r, 0, Math.PI * 2);
        g.fillStyle = this.enemyFill;
        g.fill();
        g.lineWidth = 3;
        g.strokeStyle = C.red;
        g.stroke();
        g.fillStyle = this.enemyGlyph;
        g.font = `900 ${Math.round(r * 1.15)}px 'Noto Serif KR'`;
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillText('將', x, y + 1);
        g.restore();
        this.hpBar(x, y + r + 6, r * 2.2, 4, hpFrac, 1);
    }

    hpBar(x, y, w, hgt, f, side) {
        const g = this.g;
        g.fillStyle = 'rgba(0,0,0,0.65)';
        g.fillRect(x - w / 2 - 1, y - 1, w + 2, hgt + 2);
        g.fillStyle = side === PLAYER ? '#5aa05a' : C.red;
        g.fillRect(x - w / 2, y, w * Math.max(0, f), hgt);
    }

    tankAt(x, y) {
        const im = this.tank;
        if (im.complete && im.naturalWidth) this.g.drawImage(im, x - 30, y - 30, 60, 60);
    }

    /** 준비 단계 — 부대를 대형대로 미리 보여 준다 */
    drawPrep(run, opt = {}) {
        this.drawBg();
        const occupied = new Set(run.squads.map(s => s.cell));
        this.drawGrid(opt.hoverCell ?? -1, occupied);
        const B = this.data.B;
        run.squads.forEach((sq, i) => {
            if (opt.drag && opt.drag.idx === i) return;
            const sp = soldierProfile(this.data, sq, run);
            const L = squadLayout(this.data, sq);
            for (const s of [...L.soldiers].sort((a, b) => a.y - b.y)) this.soldier(s.x, s.y, B.soldier_radius, PLAYER, sp.type, 1);
            if (L.tank) this.tankAt(L.tank.x, L.tank.y);
            this.hero(L.hero.x, L.hero.y, B.hero_radius, PLAYER, sq.heroId, 1, false);
        });
        if (opt.drag) {
            const sq = run.squads[opt.drag.idx];
            this.g.globalAlpha = 0.85;
            this.hero(opt.drag.x, opt.drag.y, B.hero_radius + 6, PLAYER, sq.heroId, 1, false);
            this.g.globalAlpha = 1;
        }
        this.drawFx();
    }

    /** 전투 — 보간(alpha)해서 그린다 */
    drawBattle(sim, alpha) {
        this.drawBg();
        const g = this.g;
        for (const z of sim.zones) this.fireZone(z);
        const B = this.data.B;
        const lerp = u => ({
            x: u.px === undefined ? u.x : u.px + (u.x - u.px) * alpha,
            y: u.py === undefined ? u.y : u.py + (u.y - u.py) * alpha,
        });
        if (this.simRef !== sim) { this.simRef = sim; this.facing.clear(); }
        // 움직이는 쪽을 본다 (멈춰 있으면 마지막 방향 · 처음엔 아군 오른쪽 · 적 왼쪽)
        const faceOf = u => {
            const dx = u.px === undefined ? 0 : u.x - u.px;
            let f = this.facing.get(u.id);
            if (Math.abs(dx) > 0.4) { f = dx > 0 ? 1 : -1; this.facing.set(u.id, f); }
            return f ?? (u.side === PLAYER ? 1 : -1);
        };
        // 병사 먼저(아래쪽이 앞에 오게 y 순), 장수 · 부장 · 보스 · 전차는 위에
        const grunts = sim.units.filter(u => !u.dead && SOLDIER_KINDS.has(u.kind)).sort((a, b) => a.y - b.y);
        for (const u of grunts) {
            const p = lerp(u);
            const moving = u.px !== undefined && Math.abs(u.x - u.px) + Math.abs(u.y - u.py) > 0.05;
            const bob = moving ? Math.abs(Math.sin(this.time * 15 + u.id * 1.7)) * u.r * 0.35 : 0;
            if (u.routed !== undefined) g.globalAlpha = Math.max(0.25, Math.min(1, u.routed / 1.2));
            this.soldier(p.x, p.y, u.r, u.side, u.p.type, u.hp / u.maxHp, u.kind === 'summon', bob, faceOf(u));
            g.globalAlpha = 1;
            if (u.stun > 0) this.stunMark(p.x, p.y - u.r * 2.6);
            if (u.burn) this.burnMark(p.x, p.y);
        }
        for (const u of sim.units) {
            if (u.dead) continue;
            const p = lerp(u);
            if (u.kind === 'officer') {
                this.officer(p.x, p.y, u.r, u.hp / u.maxHp, faceOf(u));
                if (u.stun > 0) this.stunMark(p.x, p.y - u.r - 10);
            } else if (u.kind === 'tank') {
                this.tankAt(p.x, p.y);
                this.hpBar(p.x, p.y + 30, 50, 4, u.hp / u.maxHp, u.side);
            } else if (u.kind === 'hero' || u.kind === 'boss') {
                this.hero(p.x, p.y, u.r, u.side, u.heroId, u.hp / u.maxHp, u.kind === 'boss');
                if (u.stun > 0) this.stunMark(p.x, p.y - u.r - 10);
                if (u.buffs.length) {
                    g.beginPath();
                    g.arc(p.x, p.y, u.r + 7, 0, Math.PI * 2);
                    g.strokeStyle = 'rgba(232,180,34,0.8)';
                    g.lineWidth = 3;
                    g.stroke();
                }
            }
        }
        this.drawFx();
    }

    stunMark(x, y) {
        const g = this.g;
        const a = this.time * 6;
        g.fillStyle = C.yellow;
        g.strokeStyle = C.ink;
        g.lineWidth = 1.5;
        for (let i = 0; i < 2; i++) {
            const px = x + Math.cos(a + i * Math.PI) * 9;
            g.beginPath();
            g.arc(px, y, 3.2, 0, Math.PI * 2);
            g.fill();
            g.stroke();
        }
    }

    burnMark(x, y) {
        const g = this.g;
        const f = 0.5 + 0.5 * Math.sin(this.time * 18 + x);
        g.fillStyle = `rgba(232,116,42,${0.55 + 0.3 * f})`;
        g.beginPath();
        g.moveTo(x - 5, y - 6);
        g.lineTo(x, y - 16 - f * 4);
        g.lineTo(x + 5, y - 6);
        g.closePath();
        g.fill();
    }

    fireZone(z) {
        const g = this.g;
        g.save();
        g.beginPath();
        g.arc(z.x, z.y, z.r, 0, Math.PI * 2);
        g.fillStyle = z.side === PLAYER ? 'rgba(232,96,30,0.22)' : 'rgba(150,40,160,0.18)';
        g.fill();
        g.lineWidth = 3;
        g.strokeStyle = z.side === PLAYER ? 'rgba(200,50,30,0.8)' : 'rgba(110,30,120,0.8)';
        g.setLineDash([12, 8]);
        g.stroke();
        g.setLineDash([]);
        // 불꽃 혀 — 개수를 정한 큰 삼각형
        const n = 9;
        for (let i = 0; i < n; i++) {
            const a = (i / n) * Math.PI * 2 + z.x * 0.01;
            const rr = z.r * (0.25 + 0.6 * ((i * 37) % 10) / 10);
            const x = z.x + Math.cos(a) * rr;
            const y = z.y + Math.sin(a) * rr;
            const f = 0.5 + 0.5 * Math.sin(this.time * 9 + i * 1.7);
            g.beginPath();
            g.moveTo(x - 9, y + 6);
            g.lineTo(x, y - 18 - f * 12);
            g.lineTo(x + 9, y + 6);
            g.closePath();
            g.fillStyle = i % 2 ? '#e8742a' : C.yellow;
            g.fill();
            g.lineWidth = 2;
            g.strokeStyle = C.ink;
            g.stroke();
        }
        g.restore();
    }

    drawFx() {
        const g = this.g;
        for (const f of this.fx) {
            const k = f.t / f.life;
            g.save();
            switch (f.k) {
            case 'arrow': {
                const x = f.x1 + (f.x2 - f.x1) * k;
                const y = f.y1 + (f.y2 - f.y1) * k;
                const d = Math.hypot(f.x2 - f.x1, f.y2 - f.y1) || 1;
                const ux = (f.x2 - f.x1) / d;
                const uy = (f.y2 - f.y1) / d;
                g.strokeStyle = f.side === PLAYER ? C.ink : '#5a1a10';
                g.lineWidth = 2;
                g.beginPath();
                g.moveTo(x - ux * 14, y - uy * 14);
                g.lineTo(x, y);
                g.stroke();
                break;
            }
            case 'slash': {
                g.globalAlpha = 1 - k;
                g.strokeStyle = f.big ? C.yellow : C.ivory;
                g.lineWidth = f.big ? 4 : 2;
                const s = f.big ? 16 : 8;
                g.beginPath();
                g.moveTo(f.x - s, f.y - s);
                g.lineTo(f.x + s, f.y + s);
                if (f.big) { g.moveTo(f.x + s, f.y - s); g.lineTo(f.x - s, f.y + s); }
                g.stroke();
                break;
            }
            case 'fall':
                this.fallen(f, k);
                break;
            case 'die': {
                g.globalAlpha = 1 - k;
                g.fillStyle = f.side === PLAYER ? 'rgba(239,230,207,0.7)' : 'rgba(40,30,20,0.6)';
                g.beginPath();
                g.arc(f.x, f.y, 6 + k * 12, 0, Math.PI * 2);
                g.fill();
                break;
            }
            case 'flee': {
                g.globalAlpha = 1 - k;
                g.fillStyle = C.ivory;
                g.beginPath();
                g.arc(f.x - k * 40, f.y - k * 10, 7, 0, Math.PI * 2);
                g.fill();
                break;
            }
            case 'ring': {
                const r = f.r * (0.35 + 0.65 * Math.min(1, k * 2.2));
                g.globalAlpha = 1 - k;
                g.beginPath();
                g.arc(f.x, f.y, r, 0, Math.PI * 2);
                if (f.fill) { g.fillStyle = f.color; g.globalAlpha = (1 - k) * 0.28; g.fill(); g.globalAlpha = 1 - k; }
                g.lineWidth = 6;
                g.strokeStyle = C.ink;
                g.stroke();
                g.lineWidth = 3.5;
                g.strokeStyle = f.color;
                g.stroke();
                break;
            }
            case 'band': {
                g.globalAlpha = 1 - k;
                g.lineCap = 'round';
                g.strokeStyle = C.ink;
                g.lineWidth = f.w + 6;
                g.beginPath();
                g.moveTo(f.x1, f.y1);
                g.lineTo(f.x2, f.y2);
                g.stroke();
                g.strokeStyle = f.color;
                g.lineWidth = f.w;
                g.stroke();
                break;
            }
            case 'line': {
                g.globalAlpha = 1 - k;
                g.strokeStyle = f.color;
                g.lineWidth = f.w;
                g.beginPath();
                g.moveTo(f.x1, f.y1);
                g.lineTo(f.x2, f.y2);
                g.stroke();
                break;
            }
            case 'bolt': {
                g.globalAlpha = 1 - k;
                g.strokeStyle = C.yellow;
                g.lineWidth = 5;
                g.beginPath();
                let x = f.x + 30;
                let y = 0;
                g.moveTo(x, y);
                const steps = 6;
                for (let i = 1; i <= steps; i++) {
                    y = (f.y * i) / steps;
                    x = f.x + (i === steps ? 0 : ((i * 53 + f.seed * 100) % 40) - 20);
                    g.lineTo(x, y);
                }
                g.stroke();
                g.strokeStyle = C.ink;
                g.lineWidth = 1.5;
                g.stroke();
                break;
            }
            case 'flash': {
                g.globalAlpha = 1 - k;
                g.fillStyle = f.color;
                g.fillRect(0, 0, this.W, this.H);
                break;
            }
            case 'leak': {
                g.globalAlpha = 1 - k;
                g.fillStyle = C.red;
                g.fillRect(0, f.y - 30, 34, 60);
                break;
            }
            case 'num': {
                g.globalAlpha = 1 - k * k;
                g.font = "22px 'Black Han Sans'";
                g.textAlign = 'center';
                g.lineWidth = 4;
                g.strokeStyle = C.ink;
                g.fillStyle = f.side === PLAYER ? '#ff8a6a' : C.ivory;
                const y = f.y - k * 26;
                g.strokeText(String(f.v), f.x, y);
                g.fillText(String(f.v), f.x, y);
                break;
            }
            case 'callout': {
                const pop = k < 0.12 ? 0.6 + (k / 0.12) * 0.6 : k < 0.2 ? 1.2 - ((k - 0.12) / 0.08) * 0.2 : 1;
                g.globalAlpha = k > 0.75 ? 1 - (k - 0.75) / 0.25 : 1;
                g.translate(Math.min(this.W - 120, Math.max(120, f.x)), Math.max(40, f.y - k * 24));
                g.rotate(-0.06);
                g.scale(pop, pop);
                g.font = `${f.size}px 'Black Han Sans'`;
                g.textAlign = 'center';
                g.textBaseline = 'middle';
                g.lineJoin = 'round';
                g.lineWidth = 8;
                g.strokeStyle = f.stroke;
                g.strokeText(f.text, 0, 0);
                g.fillStyle = f.color;
                g.fillText(f.text, 0, 0);
                break;
            }
            default:
            }
            g.restore();
        }
    }

    /** 캔버스 좌표 → 배치 칸 (없으면 -1) */
    cellAt(x, y) {
        const B = this.data.B;
        for (let cell = 0; cell < 9; cell++) {
            const p = cellPos(this.data, cell);
            const w = B.deploy_dx;
            const hh = B.deploy_dy;
            if (x >= p.x - w / 2 - 10 && x <= p.x + w / 2 - 10 && y >= p.y - hh / 2 && y <= p.y + hh / 2) return cell;
        }
        return -1;
    }
}

function roundRect(g, x, y, w, h, r) {
    g.moveTo(x + r, y);
    g.lineTo(x + w - r, y);
    g.quadraticCurveTo(x + w, y, x + w, y + r);
    g.lineTo(x + w, y + h - r);
    g.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    g.lineTo(x + r, y + h);
    g.quadraticCurveTo(x, y + h, x, y + h - r);
    g.lineTo(x, y + r);
    g.quadraticCurveTo(x, y, x + r, y);
}
