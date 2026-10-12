/** 전투 화면 — 준비(슬롯 · 카드 · 배치) ↔ 전투(오토배틀) · 웨이브 정산 · 판 결과 */
import { h, modal, toast, toStage, hideTip, sleep, stageScale } from './dom.js';
import { portraitUrl, bgUrl, iconUrl, unitIcon } from './art.js';
import { readPref, writePref } from './storage.js';
import { FieldRenderer } from './field.js';
import { GRADE_NAME, SPECIAL_DESC } from './hub.js';
import { createRun, spin, canSpin, spinCost, canApply, applyCard, placeSquad, startBattle, finishBattle, squadCap } from '../game_logic/run.js';
import { settleRun, newRunSeed } from '../game_logic/meta.js';
import { RANK_NAMES, techDepth, nextRankMerit } from '../game_logic/stats.js';
import { PAYLINES, pickWeighted } from '../game_logic/slot.js';
import { squadLayout } from '../game_logic/battle.js';

const lum = hex => { const n = parseInt(hex.slice(1), 16); return (0.299 * (n >> 16 & 255) + 0.587 * (n >> 8 & 255) + 0.114 * (n & 255)) / 255; };

const FIELD_SCALE = 1150 / 1200;   // 캔버스 CSS 폭 / 논리 폭
const CARD_INFO = {
    soldier: { icon: 'soldier', name: '충원' },
    train: { icon: 'train', name: '훈련' },
    tech: { icon: 'book', name: '병법' },
    tank: { icon: 'tank', name: '전차' },
};

export function renderBattle(app, root, { stageId, deploy }) {
    const d = app.data;
    const B = d.B;
    const stage = d.stageById[stageId];
    const run = createRun(d, app.meta, stageId, deploy, newRunSeed(app.meta));
    app.save();   // 판 씨앗 카운터

    const pref = readPref();
    const SPEEDS = [1, 2, 4];
    let speed = SPEEDS.includes(pref.speed) ? pref.speed : 2;
    let sim = null;
    let acc = 0;
    let raf = 0;
    let last = performance.now();
    let picked = null;        // 눌러서 고른 카드 uid
    let dragCard = null;      // { uid, ghost }
    let dragSquad = null;     // { idx, x, y }
    let hoverCell = -1;
    let spinning = false;
    let ended = false;

    // ── 뼈대 ──
    const el = {};
    el.stName = h('div', { class: 'st' }, stage.name, h('small', {}, `${stage.year}년`));
    el.wave = h('div', { class: 'wave' });
    el.castleHp = h('i');
    el.castle = h('div', { class: 'castle', tip: '<b>성 체력</b><br>적이 왼쪽 끝에 닿으면 깎인다. 보스가 닿으면 진다' },
        h('img', { src: iconUrl('castle') }), h('div', { class: 'hp' }, el.castleHp), el.castleTxt = h('span'));
    el.gold = h('div', { class: 'gold', tip: '<b>군자금</b><br>병사 슬롯을 돌리는 돈. 적을 쓰러뜨리고 웨이브를 막으면 들어온다' },
        h('img', { src: iconUrl('coins') }), el.goldTxt = h('span'));
    el.speed = h('div', { class: 'speed' }, SPEEDS.map(s => h('button', { 'data-s': s, onclick: () => setSpeed(s) }, `×${s}`)),
        h('button', { class: 'skip', tip: '<b>결과만 보기</b><br>이 웨이브를 끝까지 바로 계산한다', onclick: skipWave }, '결과만 ▶▶'));
    el.exit = h('button', { class: 'exit', onclick: retreat }, '후퇴');
    const topbar = h('div', { class: 'topbar' }, el.stName, el.wave, el.castle, el.gold, h('div', { class: 'spacer' }), el.speed, el.exit);

    const canvas = h('canvas');
    el.phaseTag = h('div', { class: 'phase-tag' });
    el.bonds = h('div', { class: 'bonds' }, run.bonds.map(b => h('span', { class: 'bond-chip', tip: `<b>${b.name}</b><br>${b.desc}` }, b.name)));
    const fieldWrap = h('div', { class: 'field-wrap' }, canvas, el.phaseTag, el.bonds);
    el.bonds.style.pointerEvents = 'auto';

    // 슬롯
    el.tiles = Array.from({ length: 9 }, () => h('div', { class: 'tile' }, h('img', { src: iconUrl('soldier') })));
    el.lines = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    el.lines.setAttribute('width', '300');
    el.lines.setAttribute('height', '300');
    el.jack = h('div', { class: 'jackpot' });
    el.fragT = h('span');
    el.fragB = h('span');
    el.spinBtn = h('button', { class: 'btn red', onclick: doSpin });
    el.why = h('div', { class: 'why' });
    el.pay = h('div', { class: 'paybox' });
    el.tray = h('div', { class: 'tray' });
    const side = h('div', { class: 'side' },
        h('div', { class: 'slot-head' }, h('div', { class: 't' }, '병사 슬롯'),
            h('div', { class: 'frags' },
                h('span', { tip: `<b>훈련 조각</b><br>${B.frag_per_card}개가 모이면 훈련 카드` }, h('img', { src: iconUrl('train') }), el.fragT),
                h('span', { tip: `<b>병법 조각</b><br>${B.frag_per_card}개가 모이면 병법 카드` }, h('img', { src: iconUrl('book') }), el.fragB))),
        h('div', { class: 'slotbox' }, h('div', { class: 'slotgrid' }, el.tiles), el.lines, el.jack),
        h('div', { class: 'spinrow' }, el.spinBtn, el.why),
        el.pay,
        h('div', { class: 'tray-head' }, '카드', h('small', {}, '부대에 끌어다 놓는다')),
        el.tray,
        h('div', { class: 'start' }, el.startBtn = h('button', { class: 'btn red', onclick: beginBattle }, '전투 개시'), el.hint = h('div', { class: 'hint' })));

    // 부대 띠
    el.squads = h('div', { style: { display: 'flex', gap: '10px', width: '100%' } });
    const squadbar = h('div', { class: 'squadbar' }, el.squads);

    root.append(h('div', { class: 'battle' }, topbar, fieldWrap, side, squadbar));
    const fr = new FieldRenderer(canvas, d, stage);
    const fitCanvas = () => fr.resize((window.devicePixelRatio || 1) * stageScale.k * FIELD_SCALE);
    fitCanvas();
    window.addEventListener('resize', fitCanvas);

    // 첫 판 그림
    const lastGrid = ['soldier', 'coin', 'train', 'book', 'soldier', 'coin', 'soldier', 'wild', 'soldier'];
    lastGrid.forEach((id, i) => setTile(i, id));

    // ── 갱신 ──
    function refreshTop() {
        const nw = stage.waves.length;
        el.wave.innerHTML = '';
        el.wave.append(`웨이브 ${Math.min(run.waveIdx + 1, nw)}/${nw}`);
        const pips = h('span', { class: 'pips' });
        for (let i = 0; i < nw; i++) {
            pips.append(h('i', { class: (i < run.waveIdx ? 'done' : i === run.waveIdx ? 'now' : '') + (i === nw - 1 ? ' boss' : '') }));
        }
        el.wave.append(pips);
        const hp = sim ? Math.max(0, sim.castleHp) : run.castleHp;
        el.castleHp.style.width = `${(100 * hp) / run.castleMax}%`;
        el.castleTxt.textContent = `${hp}/${run.castleMax}`;
        el.goldTxt.textContent = String(run.gold);
        el.speed.querySelectorAll('button[data-s]').forEach(b => b.classList.toggle('on', Number(b.dataset.s) === speed));
        el.speed.style.visibility = run.phase === 'battle' ? 'visible' : 'hidden';
    }

    function refreshSlot() {
        const prep = run.phase === 'prep';
        const c = canSpin(d, run);
        el.spinBtn.textContent = `돌린다 · ${spinCost(d, run)}냥`;
        el.spinBtn.disabled = !prep || !c.ok || spinning;
        el.why.textContent = prep ? (c.ok ? (run.spinsThisPrep ? '돌릴수록 비싸진다' : '') : c.why) : '전투 중';
        const dots = n => Array.from({ length: B.frag_per_card }, (_, i) => h('i', { class: i < n ? 'on' : '' }));
        el.fragT.innerHTML = '';
        el.fragT.append(...dots(run.frags.train));
        el.fragB.innerHTML = '';
        el.fragB.append(...dots(run.frags.tech));
    }

    function cardTip(card) {
        switch (card.kind) {
        case 'soldier': return `<b>충원 +${card.amount}</b><br>그 부대에 병사 ${card.amount}명 (정원까지 · 남으면 카드에 남는다)`;
        case 'train': return '<b>훈련</b><br>그 장수의 병종 전체 — 체력 · 데미지 +' + Math.round(B.train_bonus * 100) + '%';
        case 'tech': return '<b>병법</b><br>그 부대의 테크 한 단계';
        case 'tank': return '<b>전차</b><br>시대착오. 그 부대에 전차 한 대가 붙는다';
        default: return '';
        }
    }

    function refreshTray(newUids = []) {
        el.tray.innerHTML = '';
        for (let i = 0; i < B.tray_max; i++) {
            const card = run.tray[i];
            if (!card) { el.tray.append(h('div', { class: 'cslot' })); continue; }
            const info = CARD_INFO[card.kind];
            const c = h('div', { class: `card k-${card.kind}${picked === card.uid ? ' picked' : ''}${newUids.includes(card.uid) ? ' new' : ''}`, tip: cardTip(card) },
                h('img', { src: iconUrl(info.icon) }),
                h('div', { class: 'lb' }, card.kind === 'soldier' ? `충원 +${card.amount}` : info.name));
            c.addEventListener('pointerdown', e => cardDown(e, card));
            el.tray.append(c);
        }
        for (let i = B.tray_max; i < run.tray.length; i++) {
            // 넘친 카드도 보여 준다 (쓰기 전엔 못 돌린다)
            const card = run.tray[i];
            const info = CARD_INFO[card.kind];
            const c = h('div', { class: `card k-${card.kind}`, tip: cardTip(card) }, h('img', { src: iconUrl(info.icon) }), h('div', { class: 'lb' }, info.name));
            c.addEventListener('pointerdown', e => cardDown(e, card));
            el.tray.append(c);
        }
    }

    function liveSoldiers(i) {
        if (!sim) return run.squads[i].soldiers;
        let n = 0;
        for (const u of sim.units) if (!u.dead && u.side === 0 && u.squad === i && u.kind === 'soldier') n++;
        return n;
    }

    function refreshSquads() {
        el.squads.innerHTML = '';
        run.squads.forEach((sq, i) => {
            const hero = d.heroes[sq.heroId];
            const cap = squadCap(d, sq);
            const n = liveSoldiers(i);
            const next = nextRankMerit(d, sq.rank);
            const prev = [0, B.rank1_merit, B.rank2_merit, B.rank3_merit][sq.rank];
            const meritF = next ? (sq.merit - prev) / (next - prev) : 1;
            const depth = techDepth(sq.rank);
            const pips = h('span', { class: 'tech' });
            for (let k = 0; k < 3; k++) pips.append(h('i', { class: k < sq.nodes ? 'on' : k >= depth ? 'lock' : '' }));
            const br = sq.branch ? d.tech[hero.type][sq.branch] : null;
            const nodeName = br && sq.nodes ? br.nodes[sq.nodes - 1].name : '';
            const techTip = br
                ? `<b>${br.name}</b><br>` + br.nodes.map((nd, k) => `${k < sq.nodes ? '◆' : '◇'} ${nd.name} — ${nd.desc}`).join('<br>')
                : `<b>테크</b><br>병법 카드를 놓으면 갈래를 고른다 · 지금 장군직으로 ${depth}단까지`;
            const heroDead = sim && !sim.units.some(u => !u.dead && u.kind === 'hero' && u.squad === i);
            const sk = d.skills[hero.skill];
            const card = h('div', { class: `squad${heroDead ? ' dead' : ''}`, 'data-idx': i, onclick: () => squadClick(i) },
                h('div', { class: 'head' },
                    h('div', { class: 'face', style: { backgroundImage: `url(${portraitUrl(d, sq.heroId)})` } },
                        h('span', { class: 'rank' }, RANK_NAMES[sq.rank]),
                        sq.tank ? h('img', { class: 'tank', src: iconUrl('tank') }) : null),
                    h('div', {},
                        h('div', { class: 'nm' }, hero.name),
                        h('div', { class: 'sub' }, h('img', { src: unitIcon(hero.type) }), d.units[hero.type].name, h('span', { class: `grade g${hero.grade}` }, GRADE_NAME[hero.grade])))),
                h('div', { class: 'rows' },
                    h('div', { class: 'r', tip: `<b>병사</b><br>정원 ${cap}명 (통솔)` }, h('span', { class: 'lbl' }, '병사'), h('div', { class: 'bar' }, h('i', { style: { width: `${(100 * n) / cap}%` } })), h('span', { class: 'num' }, `${n}/${cap}`)),
                    h('div', { class: 'r', tip: `<b>전공 ${sq.merit}</b><br>${next ? `${next}이면 ${RANK_NAMES[sq.rank + 1]}` : '대장군 — 더 오를 곳이 없다'}` }, h('span', { class: 'lbl' }, '전공'), h('div', { class: 'bar merit' }, h('i', { style: { width: `${100 * Math.min(1, meritF)}%` } })), h('span', { class: 'num' }, String(sq.merit))),
                    h('div', { class: 'r', tip: techTip }, h('span', { class: 'lbl' }, '테크'), pips, h('span', { class: 'num', style: { color: 'var(--green)' } }, nodeName))),
                h('div', { class: 'skillname', tip: `<b>${sk.name}</b><br>${sk.desc}` }, h('b', {}, sk.name), h('span', {}, `무 ${hero.str} · 지 ${hero.int}`)));
            el.squads.append(card);
        });
        markTargets();
    }

    function refreshAll() {
        refreshTop();
        refreshSlot();
        refreshTray();
        refreshSquads();
        const prep = run.phase === 'prep';
        el.startBtn.disabled = !prep || spinning;
        el.startBtn.textContent = run.waveIdx === stage.waves.length - 1 ? '보스전 개시' : '전투 개시';
        el.hint.textContent = prep ? '슬롯을 돌려 카드를 받고, 부대에 놓고, 전장의 장수를 끌어 배치한다' : '전투는 자동으로 흘러간다';
        el.exit.disabled = !prep && !ended ? false : false;
        if (prep) {
            const w = stage.waves[run.waveIdx];
            const cm = B.enemy_count_mult;
            el.phaseTag.textContent = `준비 — 다음 적: 보병 ${Math.round(w.infantry * cm)} · 궁병 ${Math.round(w.archer * cm)} · 기병 ${Math.round(w.cavalry * cm)}${w.boss ? ` · 보스 ${d.heroes[stage.boss].name}` : ''}`;
        } else {
            el.phaseTag.textContent = `전투 — 웨이브 ${run.waveIdx + 1}`;
        }
    }

    // ── 슬롯 ──
    function setTile(i, symId) {
        const s = d.slotSymbols.find(x => x.id === symId);
        el.tiles[i].querySelector('img').src = iconUrl(s.icon);
    }

    async function doSpin() {
        if (spinning || run.phase !== 'prep') return;
        const before = run.tray.map(c => c.uid);
        const r = spin(d, run);
        if (!r.ok) { toast(r.why); return; }
        spinning = true;
        refreshAll();
        el.pay.textContent = '';
        el.lines.innerHTML = '';
        el.jack.innerHTML = '';
        el.tiles.forEach(t => t.classList.remove('win'));
        // 굴림 — 열마다 시간차로 멈춘다
        const stopAt = [420, 620, 820];
        const t0 = performance.now();
        el.tiles.forEach(t => t.classList.add('rolling'));
        for (;;) {
            const t = performance.now() - t0;
            let rolling = false;
            for (let i = 0; i < 9; i++) {
                const col = i % 3;
                if (t >= stopAt[col]) {
                    if (el.tiles[i].classList.contains('rolling')) { el.tiles[i].classList.remove('rolling'); setTile(i, r.res.grid[i]); }
                } else {
                    rolling = true;
                    setTile(i, pickWeighted(Math.random, d.slotSymbols).id);
                }
            }
            if (!rolling) break;
            await sleep(60);
        }
        // 줄 표시
        for (const ln of r.res.lines) {
            for (const c of ln.cells) el.tiles[c].classList.add('win');
            const a = ln.cells[0];
            const b = ln.cells[2];
            const cx = c => 48 + (c % 3) * 102;
            const cy = c => 48 + Math.floor(c / 3) * 102;
            const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
            line.setAttribute('x1', cx(a)); line.setAttribute('y1', cy(a));
            line.setAttribute('x2', cx(b)); line.setAttribute('y2', cy(b));
            line.setAttribute('stroke', '#c8321e'); line.setAttribute('stroke-width', '7'); line.setAttribute('stroke-linecap', 'round');
            line.setAttribute('opacity', '0.85');
            el.lines.append(line);
        }
        const p = r.res.pay;
        const parts = [];
        if (p.soldiers) parts.push(`<b>충원 +${p.soldiers}</b>`);
        if (p.train) parts.push(`훈련 조각 +${p.train}`);
        if (p.tech) parts.push(`병법 조각 +${p.tech}`);
        if (p.gold) parts.push(`<b>+${p.gold}냥</b>`);
        if (r.res.lines.length) parts.unshift(`<b>${r.res.lines.length}줄!</b>`);
        el.pay.innerHTML = parts.join(' · ');
        if (p.jackpot) {
            el.jack.append(h('span', { class: 'pop-in' }, '시대착오', h('br'), '잭팟!!'));
            toast('시공이 뒤틀렸다 — 전차 카드!');
            setTimeout(() => (el.jack.innerHTML = ''), 2200);
        }
        spinning = false;
        const fresh = run.tray.filter(c => !before.includes(c.uid)).map(c => c.uid);
        refreshAll();
        refreshTray(fresh);
    }

    // ── 카드 놓기 ──
    function cardDown(e, card) {
        if (run.phase !== 'prep') return;
        e.preventDefault();
        const start = { x: e.clientX, y: e.clientY };
        const src = e.currentTarget;
        let ghost = null;
        const move = ev => {
            if (!ghost && Math.hypot(ev.clientX - start.x, ev.clientY - start.y) > 6) {
                ghost = src.cloneNode(true);
                ghost.classList.add('ghost');
                ghost.style.width = `${src.offsetWidth}px`;
                document.getElementById('stage').append(ghost);
                dragCard = { uid: card.uid };
                hideTip();
            }
            if (ghost) {
                const p = toStage(ev.clientX, ev.clientY);
                ghost.style.left = `${p.x - src.offsetWidth / 2}px`;
                ghost.style.top = `${p.y - 40}px`;
                markHover(ev.clientX, ev.clientY, card);
            }
        };
        const up = ev => {
            window.removeEventListener('pointermove', move);
            window.removeEventListener('pointerup', up);
            if (ghost) {
                ghost.remove();
                const idx = squadUnder(ev.clientX, ev.clientY);
                dragCard = null;
                clearMarks();
                if (idx >= 0) useCard(card.uid, idx);
                markTargets();
            } else {
                picked = picked === card.uid ? null : card.uid;
                refreshTray();
                markTargets();
            }
        };
        window.addEventListener('pointermove', move);
        window.addEventListener('pointerup', up);
    }

    function squadUnder(cx, cy) {
        const t = document.elementFromPoint(cx, cy);
        const s = t && t.closest('.squad');
        return s ? Number(s.dataset.idx) : -1;
    }

    function clearMarks() {
        el.squads.querySelectorAll('.squad').forEach(s => {
            s.classList.remove('drop-ok', 'drop-no');
            s.querySelector('.why')?.remove();
        });
    }

    function markHover(cx, cy, card) {
        clearMarks();
        const idx = squadUnder(cx, cy);
        if (idx < 0) return;
        const s = el.squads.querySelector(`.squad[data-idx="${idx}"]`);
        const chk = canApply(d, run, card, idx);
        s.classList.add(chk.ok ? 'drop-ok' : 'drop-no');
        if (!chk.ok && chk.why) s.append(h('div', { class: 'why' }, chk.why));
    }

    /** 고른 카드가 있으면 쓸 수 있는 부대를 표시 */
    function markTargets() {
        clearMarks();
        const card = run.tray.find(c => c.uid === picked);
        if (!card) return;
        el.squads.querySelectorAll('.squad').forEach(s => {
            const ok = canApply(d, run, card, Number(s.dataset.idx)).ok;
            s.classList.add(ok ? 'drop-ok' : 'drop-no');
        });
    }

    function squadClick(i) {
        if (!picked) return;
        const uid = picked;
        picked = null;
        useCard(uid, i);
    }

    function useCard(uid, idx) {
        const card = run.tray.find(c => c.uid === uid);
        if (!card) return;
        const chk = canApply(d, run, card, idx);
        if (!chk.ok) { if (chk.why) toast(chk.why); refreshAll(); return; }
        if (card.kind === 'tech' && chk.needBranch) {
            pickBranch(idx, br => {
                const r = applyCard(d, run, uid, idx, br);
                if (r.ok) toast(r.note);
                refreshAll();
            });
            return;
        }
        const r = applyCard(d, run, uid, idx);
        if (r.ok) toast(r.note); else if (r.why) toast(r.why);
        refreshAll();
    }

    function pickBranch(idx, cb) {
        const hero = d.heroes[run.squads[idx].heroId];
        const T = d.tech[hero.type];
        const opt = b => h('div', { class: 'opt', onclick: () => { dlg.close(); cb(b); } },
            h('h4', {}, T[b].name),
            h('ol', {}, T[b].nodes.map(n => h('li', {}, `${n.name} — ${n.desc}`))));
        const dlg = modal(h('div', { class: 'branch-pick' },
            h('h2', {}, `${hero.name} 부대 — 어느 갈래로?`),
            h('div', { style: { color: 'var(--ink2)' } }, `${d.units[hero.type].name} 테크는 한 번 고르면 이번 판 동안 바뀌지 않는다. 마지막 단계에 정예 이름이 붙는다.`),
            h('div', { class: 'opts' }, opt('a'), opt('b'))));
    }

    // ── 배치 (전장에서 장수를 끈다) ──
    function fieldPoint(e) {
        const p = toStage(e.clientX, e.clientY);
        return { x: p.x / FIELD_SCALE, y: (p.y - 64) / FIELD_SCALE };
    }

    canvas.addEventListener('pointerdown', e => {
        if (run.phase !== 'prep') return;
        const p = fieldPoint(e);
        let best = -1;
        let bd = 40 * 40;
        run.squads.forEach((sq, i) => {
            const L = squadLayout(d, sq);
            const dd = (L.hero.x - p.x) ** 2 + (L.hero.y - p.y) ** 2;
            if (dd < bd) { bd = dd; best = i; }
        });
        if (best < 0) {
            const cell = fr.cellAt(p.x, p.y);
            best = run.squads.findIndex(s => s.cell === cell);
        }
        if (best < 0) return;
        canvas.setPointerCapture(e.pointerId);
        dragSquad = { idx: best, x: p.x, y: p.y };
    });
    canvas.addEventListener('pointermove', e => {
        if (!dragSquad) {
            if (run.phase === 'prep') canvas.style.cursor = 'grab';
            return;
        }
        const p = fieldPoint(e);
        dragSquad.x = p.x;
        dragSquad.y = p.y;
        hoverCell = fr.cellAt(p.x, p.y);
    });
    canvas.addEventListener('pointerup', () => {
        if (!dragSquad) return;
        if (hoverCell >= 0) placeSquad(run, dragSquad.idx, hoverCell);
        dragSquad = null;
        hoverCell = -1;
    });

    // ── 전투 ──
    function beginBattle() {
        if (run.phase !== 'prep' || spinning) return;
        picked = null;
        sim = startBattle(d, run);
        acc = 0;
        refreshAll();
    }

    /** 결과만 보기 — 지금 웨이브를 끝까지 바로 굴린다(이펙트 없이) */
    function skipWave() {
        if (!sim || sim.over) return;
        sim.recordEvents = false;
        while (!sim.over) sim.step(B.tick);
        sim.recordEvents = true;
        for (const u of sim.units) { u.px = u.x; u.py = u.y; }
    }

    function setSpeed(s) {
        speed = s;
        const p = readPref();
        p.speed = s;
        writePref(p);
        refreshTop();
    }

    let squadTick = 0;
    function frame(now) {
        const dt = Math.min(0.1, (now - last) / 1000);
        last = now;
        if (sim && !sim.over) {
            acc += dt * speed;
            const tick = B.tick;
            let steps = 0;
            while (acc >= tick && steps < 12 && !sim.over) {
                for (const u of sim.units) { u.px = u.x; u.py = u.y; }
                sim.step(tick);
                acc -= tick;
                steps++;
                for (const e of sim.events) handleEvent(e);
                sim.events.length = 0;
            }
            fr.update(dt * speed);
            fr.drawBattle(sim, Math.min(1, acc / tick));
            squadTick += dt;
            if (squadTick > 0.25) { squadTick = 0; refreshSquads(); refreshTop(); }
        } else if (sim && sim.over) {
            fr.update(dt);
            fr.drawBattle(sim, 1);
        } else {
            fr.update(dt);
            fr.drawPrep(run, { hoverCell, drag: dragSquad });
        }
        // 웨이브가 끝났으면 한 번만 정산 (개발용 finishWave 로 끝낸 경우도 여기서 잡힌다)
        if (sim && sim.over && !sim.settled && !ended) {
            sim.settled = true;
            onWaveEnd();
        }
        raf = requestAnimationFrame(frame);
    }

    function handleEvent(e) {
        fr.push(e);
        if (e.k === 'leak') {
            el.castle.classList.remove('hit');
            void el.castle.offsetWidth;
            el.castle.classList.add('hit');
        } else if (e.k === 'boss') {
            const hero = d.heroes[e.heroId];
            const b = h('div', { class: 'banner-boss' },
                h('div', { class: 'face', style: { backgroundImage: `url(${portraitUrl(d, e.heroId)})` } }),
                h('div', { class: 't' }, `${hero.name} 등장!`));
            document.getElementById('overlay').append(b);
            setTimeout(() => b.remove(), 2400);
        } else if (e.k === 'duel') {
            duelCutIn(e);
        }
    }

    /** 일기토 컷인 — 두 얼굴 + 승패 한 줄. 전투는 멈추지 않는다 · 새 일기토가 오면 바꿔 단다 */
    let duelEl = null;
    function duelCutIn(e) {
        const hero = d.heroes[e.heroId];
        const foeName = e.foeKind === 'boss' ? d.heroes[e.foeHeroId].name : `${stage.enemy} 부장`;
        const foeFace = e.foeKind === 'boss'
            ? h('div', { class: 'face', style: { backgroundImage: `url(${portraitUrl(d, e.foeHeroId)})` } })
            : h('div', { class: 'face officer', style: { background: stage.color, color: lum(stage.color) > 0.55 ? 'var(--ink)' : 'var(--ivory)' } }, '將');
        const line = e.win
            ? (e.foeKind === 'boss' ? `${hero.name}의 일격! ${foeName}이(가) 휘청인다` : `${hero.name}, 단칼에 베었다!`)
            : `${hero.name}, 밀렸다…`;
        if (duelEl) duelEl.remove();
        duelEl = h('div', { class: `duel-cut ${e.win ? 'win' : 'lose'}` },
            h('div', { class: 'face', style: { backgroundImage: `url(${portraitUrl(d, e.heroId)})` } }),
            h('div', { class: 'mid' }, h('div', { class: 'vs' }, '일기토'), h('div', { class: 'names' }, `${hero.name} vs ${foeName}`), h('div', { class: 'res' }, line)),
            foeFace);
        document.getElementById('overlay').append(duelEl);
        const me = duelEl;
        setTimeout(() => { me.remove(); if (duelEl === me) duelEl = null; }, 1600);
    }

    function onWaveEnd() {
        const r = sim.result();
        const waveNo = run.waveIdx + 1;
        const phase = finishBattle(d, run, r);
        const lb = run.lastBattle;
        refreshAll();
        if (phase === 'prep') {
            sim = null;
            const promos = lb.promos.map(i => {
                const sq = run.squads[i];
                return h('div', { class: 'promo' }, `${d.heroes[sq.heroId].name} — ${RANK_NAMES[sq.rank]} 승진!`);
            });
            const routs = r.heroDead.map((x, i) => x ? h('p', {}, `${d.heroes[run.squads[i].heroId].name} 부대가 흩어졌다 — 장수 혼자 돌아왔다`) : null);
            const box = h('div', { class: 'panel wave-sum pop-in', onclick: () => box.remove() },
                h('h3', {}, `웨이브 ${waveNo} 막음!`),
                h('p', {}, `적 ${r.kills} 처치 · 군자금 +${lb.gold}` + (r.leaked ? ` · 성 -${r.leaked}` : '')),
                promos, routs);
            document.getElementById('overlay').append(box);
            setTimeout(() => box.remove(), 2800);
        } else {
            endRun();
        }
    }

    function retreat() {
        if (ended) return;
        if (!window.confirm('후퇴하면 이 판은 진 것으로 친다. 그래도 명성은 받는다. 후퇴할까?')) return;
        if (sim && !sim.over) {
            sim.over = true;
        }
        run.phase = 'lost';
        endRun();
    }

    function endRun() {
        if (ended) return;
        ended = true;
        const won = run.phase === 'won';
        if (won && run.stageId === d.stages.length) app.meta.stats.endedAt = Date.now();
        const s = settleRun(d, app.meta, run);
        app.save();
        const W = run.stats;
        const content = h('div', { class: `result ${won ? 'win' : 'lose'}` },
            h('h2', { class: 'title-font' }, won ? '막아냈다!' : '성이 무너졌다…'),
            h('div', { class: 'sub' }, won
                ? `${stage.name} — 적이 물러갔다. 슬롯머신이 기분 좋게 딸랑거렸다.`
                : '성문이 열렸다. 슬롯머신은 아무 일 없다는 듯 번쩍였다. 장수들은 무사히 군영으로 돌아왔다.'),
            h('div', { class: 'rows' },
                h('span', {}, '쓰러뜨린 적'), h('b', {}, String(W.kills)),
                h('span', {}, '막은 웨이브'), h('b', {}, `${W.waves} / ${stage.waves.length}`),
                h('span', {}, '보스'), h('b', {}, W.bossKilled ? '쓰러뜨렸다' : '못 잡았다'),
                h('span', {}, '슬롯'), h('b', {}, `${W.spins}번` + (W.jackpots ? ` · 잭팟 ${W.jackpots}` : '')),
                s.firstClear ? h('span', {}, '첫 평정 보너스') : null, s.firstClear ? h('b', {}, `+${B.fame_first_clear}`) : null),
            h('div', { class: 'fame' }, '명성 ', h('span', {}, `+${s.fame}`)),
            h('div', { style: { display: 'flex', gap: '14px', justifyContent: 'center' } },
                s.ending
                    ? h('button', { class: 'btn red', onclick: () => app.go('ending') }, '천하통일 →')
                    : h('button', { class: 'btn', onclick: () => app.go('hub', { tab: won ? 'stages' : 'recruit' }) }, won ? '군영으로' : '등용하러 간다'),
                !s.ending && !won ? h('button', { class: 'btn ivory', onclick: () => app.go('hub', { tab: 'stages' }) }, '출정 목록') : null));
        modal(content, { closable: false });
    }

    // 개발 · 헤드리스 검증용 — 지금 웨이브를 단숨에 끝까지 굴린다
    window.__battle = {
        run, get sim() { return sim; },
        finishWave() {
            if (!sim) beginBattle();
            sim.recordEvents = false;
            while (!sim.over) { for (const u of sim.units) { u.px = u.x; u.py = u.y; } sim.step(B.tick); }
            sim.recordEvents = true;
        },
    };

    // ── 시작 ──
    refreshAll();
    raf = requestAnimationFrame(frame);
    const intro = modal(h('div', { class: 'intro-card' },
        h('div', { class: 'bgthumb', style: { backgroundImage: `url(${bgUrl(stage.bg)})` } }, h('div', { class: 'yr' }, `${stage.year}`)),
        h('div', { class: 'body' },
            h('h2', {}, stage.name),
            h('p', {}, stage.intro),
            stage.special ? h('p', { style: { color: 'var(--red)', fontFamily: 'var(--font-title)', fontSize: '22px' } }, SPECIAL_DESC[stage.special]) : null,
            h('div', { style: { display: 'flex', justifyContent: 'flex-end' } },
                h('button', { class: 'btn red', onclick: () => intro.close() }, '막으러 간다')))), { closable: false });
    intro.el.classList.add('intro-card');

    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', fitCanvas); delete window.__battle; };
}
