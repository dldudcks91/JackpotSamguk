/** 군영 — 출정 · 등용 · 장수록 · 도움말 */
import { h, modal, toast, sleep } from './dom.js';
import { portraitUrl, bgUrl, iconUrl, unitIcon } from './art.js';
import { readPref, writePref } from './storage.js';
import { isUnlocked, recruit, canRecruit } from '../game_logic/meta.js';
import { heroStats, capOf, bondMods } from '../game_logic/stats.js';
import { pickWeighted } from '../game_logic/slot.js';

export const GRADE_NAME = { 1: '일반', 2: '명장', 3: '전설' };
export const SPECIAL_DESC = {
    chained: '연환선 — 적에게 붙은 불이 옆 배로 번진다',
    flood: '수공 — 전장이 물에 잠겨 모두 느리게 움직인다',
};

const TABS = [
    { id: 'stages', han: '征', name: '출정' },
    { id: 'recruit', han: '募', name: '등용' },
    { id: 'codex', han: '將', name: '장수록' },
    { id: 'help', han: '書', name: '도움말' },
];

export function heroCard(app, id, opt = {}) {
    const d = app.data;
    const hero = d.heroes[id];
    const owned = app.meta.heroes[id];
    const unknown = opt.showUnknown && !owned;
    const el = h('div', { class: `hcard g-${hero.grade}${opt.small ? ' small' : ''}${unknown ? ' unknown' : ''}${opt.sel ? ' sel' : ''}${opt.cur ? ' cur' : ''}`, onclick: opt.onclick },
        h('div', { class: 'face', style: { backgroundImage: `url(${portraitUrl(d, id)})` } }),
        h('div', { class: `grade g${hero.grade}` }, GRADE_NAME[hero.grade]),
        owned && owned.dupes ? h('div', { class: 'bt' }, `+${owned.dupes}`) : null,
        h('div', { class: 'nm' }, unknown ? '???' : hero.name),
        h('div', { class: 'meta' }, h('img', { src: unitIcon(hero.type) }), d.units[hero.type].name));
    return el;
}

export function renderHub(app, root, arg = {}) {
    let tab = arg.tab || 'stages';
    const main = h('div', { class: 'hub-main' });
    const nav = h('div', { class: 'hub-nav' });
    root.append(h('div', { class: 'hub' }, nav, main));

    function drawNav() {
        const m = app.meta;
        const cleared = Object.keys(m.cleared).length;
        nav.innerHTML = '';
        nav.append(h('div', { class: 'brand' }, '잭팟', h('br'), '삼국지'));
        for (const t of TABS) {
            nav.append(h('button', { class: `navbtn${t.id === tab ? ' on' : ''}`, onclick: () => { tab = t.id; draw(); } },
                h('span', { class: 'han' }, t.han), t.name));
        }
        nav.append(h('div', { class: 'fame' },
            h('div', {}, '명성'),
            h('div', { class: 'big' }, h('img', { src: iconUrl('banner') }), String(m.fame)),
            h('div', { class: 'sub' }, `장수 ${Object.keys(m.heroes).length}/${app.data.heroList.length} · 평정 ${cleared}/10`),
            h('button', { class: 'btn small ivory', style: { marginTop: '10px' }, onclick: () => app.go('title') }, '타이틀로')));
    }

    function draw() {
        drawNav();
        main.innerHTML = '';
        if (tab === 'stages') drawStages(app, main);
        else if (tab === 'recruit') drawRecruit(app, main, { firstTime: arg.firstTime, onChange: drawNav });
        else if (tab === 'codex') drawCodex(app, main);
        else drawHelp(app, main);
    }
    draw();
    return () => {};
}

// ── 출정 ─────────────────────────────────────
function drawStages(app, main) {
    const d = app.data;
    const m = app.meta;
    main.append(h('h1', { class: 'hub-head' }, '출정', h('small', {}, '역사의 명장면 열 곳 — 언제나 막는 쪽이다')));
    const next = d.stages.find(s => !m.cleared[s.id] && isUnlocked(m, s.id));
    const grid = h('div', { class: 'stages' });
    for (const s of d.stages) {
        const locked = !isUnlocked(m, s.id);
        const cleared = !!m.cleared[s.id];
        const card = h('div', { class: `stage-card${locked ? ' locked' : ''}${next === s ? ' next' : ''}`,
            onclick: () => locked ? toast('앞 전투부터 막아야 한다') : openDeploy(app, s) },
        h('div', { class: 'bg', style: { backgroundImage: `url(${bgUrl(s.bg)})` } }),
        h('div', { class: 'shade' }),
        h('div', { class: 'num' }, String(s.id)),
        locked ? null : h('div', { class: 'boss', style: { backgroundImage: `url(${portraitUrl(d, s.boss)})` } }),
        cleared ? h('div', { class: 'stamp clear' }, '막아냄') : locked ? h('div', { class: 'stamp' }, '잠김') : null,
        h('div', { class: 'info' },
            h('div', { class: 'year' }, `${s.year}년 · ${s.place}`),
            h('div', { class: 'name' }, s.name),
            h('div', { class: 'enemy' }, locked ? '' : `적: ${s.enemy} · 보스 ${d.heroes[s.boss].name}`)));
        grid.append(card);
    }
    main.append(grid);
}

function openDeploy(app, s) {
    const d = app.data;
    const m = app.meta;
    const pref = readPref();
    const owned = Object.keys(m.heroes).sort((a, b) => d.heroes[b].grade - d.heroes[a].grade
        || (m.heroes[b].dupes - m.heroes[a].dupes) || d.heroList.indexOf(a) - d.heroList.indexOf(b));
    let picked = (pref.deploy?.[s.id] || []).filter(id => m.heroes[id]).slice(0, s.deploy);
    if (!picked.length) picked = owned.slice(0, s.deploy);

    const pickedBox = h('div', { class: 'picked' });
    const rosterBox = h('div', { class: 'roster' });
    const bondBox = h('div', { class: 'bonds' });
    const countEl = h('span');
    const goBtn = h('button', { class: 'btn red', style: { fontSize: '34px', padding: '10px 40px' }, onclick: () => {
        if (!picked.length) return;
        const p = readPref();
        (p.deploy ??= {})[s.id] = picked;
        writePref(p);
        dlg.close();
        app.go('battle', { stageId: s.id, deploy: picked.slice() });
    } }, '출진!');

    function redraw() {
        pickedBox.innerHTML = '';
        if (!picked.length) pickedBox.append(h('div', { class: 'empty' }, '아래에서 장수를 눌러 출진시키자'));
        for (const id of picked) pickedBox.append(heroCard(app, id, { small: true, onclick: () => { picked = picked.filter(x => x !== id); redraw(); } }));
        rosterBox.innerHTML = '';
        for (const id of owned) {
            rosterBox.append(heroCard(app, id, { small: true, sel: picked.includes(id), onclick: () => {
                if (picked.includes(id)) picked = picked.filter(x => x !== id);
                else if (picked.length < s.deploy) picked.push(id);
                else return toast(`이 전투는 ${s.deploy}명까지 나간다`);
                redraw();
            } }));
        }
        const { active } = bondMods(d, picked);
        bondBox.innerHTML = '';
        bondBox.append(h('span', { style: { fontFamily: 'var(--font-title)', fontSize: '18px' } }, '인연'));
        if (!active.length) bondBox.append(h('span', { class: 'bond-chip off' }, '없음'));
        for (const b of active) bondBox.append(h('span', { class: 'bond-chip', tip: `<b>${b.name}</b><br>${b.desc}` }, b.name));
        countEl.textContent = `${picked.length} / ${s.deploy}`;
        goBtn.disabled = !picked.length;
    }

    const content = h('div', { class: 'deploy' },
        h('div', { class: 'intro' },
            h('div', { class: 'bgthumb', style: { backgroundImage: `url(${bgUrl(s.bg)})` } }),
            h('h2', {}, `${s.id}. ${s.name}`),
            h('div', {}, s.intro),
            h('div', { class: 'facts' },
                h('b', {}, '연도'), h('span', {}, `${s.year}년 · ${s.place}`),
                h('b', {}, '적'), h('span', {}, s.enemy),
                h('b', {}, '보스'), h('span', {}, d.heroes[s.boss].name),
                h('b', {}, '웨이브'), h('span', {}, `${s.waves.length} (마지막이 보스)`),
                s.special ? h('b', {}, '특징') : null, s.special ? h('span', {}, SPECIAL_DESC[s.special]) : null)),
        h('div', {},
            h('div', { class: 'head-row', style: { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' } },
                h('h2', { style: { fontSize: '30px' } }, '출진 장수 ', countEl),
                h('span', { style: { color: 'var(--ink2)' } }, '장수를 누르면 넣고 뺀다')),
            pickedBox, bondBox, rosterBox,
            h('div', { class: 'go' }, goBtn)));
    const dlg = modal(content);
    redraw();
}

// ── 등용 ─────────────────────────────────────
function drawRecruit(app, main, { firstTime, onChange }) {
    const d = app.data;
    const B = d.B;
    main.append(h('h1', { class: 'hub-head' }, '등용', h('small', {}, '명성을 걸고 병부 슬롯을 당긴다 — 뽑은 장수는 지든 이기든 남는다')));
    const reels = [0, 1, 2].map(() => h('div', { class: 'reel' }, h('img', { src: iconUrl('tally_bronze') }), h('div', { class: 'score' }, '')));
    const reveal = h('div', { class: 'reveal' },
        h('div', { class: 'placeholder' }, firstTime ? '처음 받은 명성으로\n장수부터 뽑자!' : '레버를 당기면\n여기에 장수가 나온다'));
    let busy = false;
    const one = h('button', { class: 'btn red', onclick: () => go(1) }, `등용 · 명성 ${B.recruit_cost}`);
    const five = h('button', { class: 'btn', onclick: () => go(5) }, `5연속 · ${B.recruit_cost * 5}`);
    const syms = d.recruitSymbols;
    const rules = h('div', { class: 'rules', html:
        `세 릴의 점수를 더해 등급이 정해진다 — ` +
        syms.map(s => `<img src="${iconUrl(s.icon)}"> ${s.score}`).join(' · ') +
        `<br>합 ${B.recruit_legend_score} 이상 <b style="color:var(--g3)">전설</b> · ${B.recruit_elite_score} 이상 <b style="color:var(--g2)">명장</b> · 그 밑은 일반` +
        `<br><img src="${iconUrl('peach')}"> 세 개 = <b style="color:var(--yellow)">도원결의</b> — 유비 · 관우 · 장비가 한꺼번에` +
        `<br>이미 있는 장수가 또 나오면 <b>돌파</b>(능력치 +${Math.round(B.breakthrough_per * 100)}% · 최대 ${B.breakthrough_max})` });
    const machine = h('div', { class: 'machine' },
        h('div', { class: 'marquee' }, '천하 인재 등용기', h('small', {}, '— 병부(虎符)가 맞으면 명장이 온다 —')),
        h('div', { class: 'reels' }, reels),
        h('div', { class: 'controls' }, one, five),
        rules);
    main.append(h('div', { class: 'recruit' }, machine, reveal));
    refreshBtns();

    function refreshBtns() {
        one.disabled = busy || !canRecruit(d, app.meta);
        five.disabled = busy || app.meta.fame < B.recruit_cost * 5;
    }

    async function spinReels(final, ms) {
        const t0 = performance.now();
        reels.forEach(r => r.classList.add('spin'));
        const stopAt = [ms * 0.55, ms * 0.8, ms];
        const done = [false, false, false];
        while (done.some(x => !x)) {
            const t = performance.now() - t0;
            reels.forEach((r, i) => {
                if (done[i]) return;
                const im = r.querySelector('img');
                if (t >= stopAt[i]) {
                    done[i] = true;
                    r.classList.remove('spin');
                    const s = syms.find(x => x.id === final[i]);
                    im.src = iconUrl(s.icon);
                    r.querySelector('.score').textContent = `+${s.score}`;
                } else {
                    im.src = iconUrl(pickWeighted(Math.random, syms).icon);
                }
            });
            await sleep(70);
        }
    }

    async function go(n) {
        if (busy) return;
        busy = true;
        refreshBtns();
        const outs = [];
        for (let i = 0; i < n; i++) {
            const r = recruit(d, app.meta);
            if (!r.ok) break;
            outs.push(r);
            await spinReels(r.spin.reels, n === 1 ? 1300 : 520);
        }
        app.save();
        onChange();
        showResults(outs);
        busy = false;
        refreshBtns();
    }

    function showResults(outs) {
        reveal.innerHTML = '';
        if (!outs.length) return;
        const all = outs.flatMap(o => o.results.map(x => ({ ...x, taoyuan: o.spin.taoyuan })));
        const best = all.slice().sort((a, b) => d.heroes[b.heroId].grade - d.heroes[a.heroId].grade || (a.kind === 'new' ? -1 : 1))[0];
        const hero = d.heroes[best.heroId];
        const label = best.taoyuan ? '도원결의!!' : best.kind === 'new' ? (hero.grade === 3 ? '전설 등장!' : '새 장수!') : best.kind === 'dupe' ? `돌파 +${best.dupes}` : '명성 환급';
        reveal.append(h('div', { class: `banner${best.kind === 'dupe' ? ' dupe' : ''}${hero.grade === 3 || best.taoyuan ? ' legend' : ''} pop-in` }, label));
        reveal.append(h('div', { class: `big-card g-${hero.grade} pop-in` },
            h('div', { class: 'face', style: { backgroundImage: `url(${portraitUrl(d, best.heroId)})` } }),
            h('div', { class: 'nm' }, `${hero.name}`),
            h('div', { class: 'q' }, `「${hero.quip}」`)));
        if (all.length > 1) {
            const row = h('div', { class: 'multi' });
            for (const x of all) {
                const c = heroCard(app, x.heroId, { small: true });
                c.append(h('div', { class: `tag ${x.kind}` }, x.kind === 'new' ? '새 장수' : x.kind === 'dupe' ? `돌파 +${x.dupes}` : '환급'));
                row.append(c);
            }
            reveal.append(row);
        }
    }
}

// ── 장수록 ─────────────────────────────────────
function drawCodex(app, main) {
    const d = app.data;
    const m = app.meta;
    main.append(h('h1', { class: 'hub-head' }, '장수록', h('small', {}, `${Object.keys(m.heroes).length} / ${d.heroList.length}명`)));
    const grid = h('div', { class: 'grid' });
    const detail = h('div', { class: 'panel detail' });
    const order = d.heroList.slice().sort((a, b) => d.heroes[b].grade - d.heroes[a].grade);
    let cur = order.find(id => m.heroes[id]) || order[0];
    function draw() {
        grid.innerHTML = '';
        for (const id of order) grid.append(heroCard(app, id, { showUnknown: true, cur: id === cur, onclick: () => { cur = id; draw(); } }));
        drawDetail(app, detail, cur);
    }
    main.append(h('div', { class: 'codex' }, grid, detail));
    draw();
}

function drawDetail(app, el, id) {
    const d = app.data;
    const hero = d.heroes[id];
    const owned = app.meta.heroes[id];
    el.innerHTML = '';
    if (!owned) {
        el.append(h('h3', {}, '???'), h('p', {}, `${GRADE_NAME[hero.grade]} 등급 · ${d.units[hero.type].name}`), h('p', {}, '아직 등용하지 못한 장수다.'));
        return;
    }
    const s = heroStats(d, id, owned.dupes);
    const B = d.B;
    const sk = d.skills[hero.skill];
    const bar = (lbl, v, sub) => h('div', { class: 'stat' },
        h('span', {}, lbl), h('div', { class: 'bar' }, h('i', { style: { width: `${Math.min(100, v)}%` } })), h('span', { class: 'val' }, String(v)),
        h('div', { class: 'sub' }, sub));
    el.append(
        h('div', { class: 'top' },
            h('div', { class: 'face', style: { backgroundImage: `url(${portraitUrl(d, id)})` } }),
            h('div', {},
                h('h3', {}, hero.name),
                h('div', { class: 'line' }, h('span', { class: `grade g${hero.grade}`, style: { padding: '1px 8px', border: '2px solid var(--ink)', borderRadius: '3px', fontFamily: 'var(--font-title)' } }, GRADE_NAME[hero.grade]),
                    h('img', { src: unitIcon(hero.type) }), d.units[hero.type].name),
                h('div', { class: 'line', style: { marginTop: '8px' } }, `돌파 ${owned.dupes} / ${B.breakthrough_max}`))),
        h('div', { class: 'stats' },
            bar('통솔', s.lead, `정원 ${capOf(d, id, owned.dupes, 0)}명`),
            bar('무력', s.str, `장수 체력 ${Math.round(B.hero_hp_base + s.str * B.hero_hp_per_str)} · 데미지 ${Math.round(B.hero_dmg_base + s.str * B.hero_dmg_per_str)}`),
            bar('지력', s.int, `계략 위력 ×${(B.skill_int_base + s.int * B.skill_int_per).toFixed(2)}`)),
        h('div', { class: 'skill' }, h('b', {}, sk.name), h('div', {}, sk.desc)),
        h('div', { class: 'quip' }, `「${hero.quip}」`));
}

// ── 도움말 ─────────────────────────────────────
function drawHelp(app, main) {
    const B = app.data.B;
    const I = id => `<img src="${iconUrl(id)}">`;
    main.append(h('h1', { class: 'hub-head' }, '도움말'));
    const p = (title, html) => h('div', { class: 'panel' }, h('h3', {}, title), h('div', { html }));
    main.append(h('div', { class: 'help' },
        p('흐름', '<ul><li>군영에서 <b>등용</b>으로 장수를 뽑는다</li><li><b>출정</b>에서 전투를 고르고 장수를 출진시킨다</li><li>웨이브마다 <b>준비 → 전투</b>. 마지막 웨이브는 보스</li><li>지든 이기든 명성을 들고 돌아온다. 장수는 남는다</li><li>열 번째 전투를 막으면 엔딩</li></ul>'),
        p('병사 슬롯', `<ul><li>${I('soldier')} 충원 — 병사를 데려온다</li><li>${I('train')} 훈련 · ${I('book')} 병법 — 조각 ${B.frag_per_card}개가 모이면 카드 한 장</li><li>${I('coin')} 엽전 — 군자금</li><li>${I('wild')} 시공 균열 — 아무 그림이나 된다. ${B.jackpot_wild}개 이상이면 잭팟</li><li>가로 · 세로 · 대각 8줄. 줄을 맞추면 더 준다</li><li>같은 준비 단계에서 돌릴수록 비싸진다. 다음 웨이브엔 다시 싸다</li></ul>`),
        p('카드', `<ul><li>카드를 아래 <b>부대</b>에 끌어다 놓는다 (눌러서 고른 뒤 부대를 눌러도 된다)</li><li>${I('soldier')} 충원 — 그 부대에 병사 (정원까지)</li><li>${I('train')} 훈련 — 그 장수의 <b>병종 전체</b>가 세진다</li><li>${I('book')} 병법 — 그 부대의 테크 한 단계</li><li>${I('tank')} 전차 — 그 부대에 전차 한 대</li></ul>`),
        p('부대와 장수', '<ul><li>부대 = 장수 + 병사. 병사는 장수의 병종을 따른다</li><li><b>통솔</b> = 정원 · <b>무력</b> = 장수 체력과 데미지 · <b>지력</b> = 계략 위력</li><li>병사는 죽으면 사라진다. 살아남으면 다음 웨이브로 이어진다</li><li><b>장수가 쓰러지면 부대가 흩어진다</b>. 장수는 다음 웨이브에 혼자 돌아온다</li></ul>'),
        p('장군직과 테크', `<ul><li>부대가 적을 쓰러뜨리면 <b>전공</b>이 쌓여 승진한다</li><li>교위 → 중랑장(전공 ${B.rank1_merit}) → 장군(${B.rank2_merit}) → 대장군(${B.rank3_merit})</li><li>장군직이 테크 깊이를 연다: 교위 1단 · 중랑장 2단 · 장군 3단</li><li>3단에 오르면 정예 이름이 붙는다 (서량철기 · 연노병 …)</li></ul>`),
        p('배치와 전투', '<ul><li>준비 단계에 전장의 장수를 끌어 <b>3×3 칸</b>으로 옮긴다</li><li>오른쪽 열이 전열 — 적이 먼저 닿는다</li><li>전투가 시작되면 <b>장수가 병사를 이끌고</b> 다가오는 적 무리를 마중 나간다. 자기 칸에서 너무 멀리는 안 간다 — 빈 줄로는 적이 빠져나간다</li><li>적도 <b>부장</b>(將)이 무리를 이끈다. <b>부장을 쓰러뜨리면 그 무리는 흩어져 도망친다</b></li><li>장수와 적장이 맞닿으면 <b>일기토</b> — 무력이 높을수록 이긴다</li><li>적이 왼쪽 끝 성에 닿으면 성 체력이 깎인다. <b>보스가 닿으면 진다</b></li><li>전투는 자동이다. 기본 ×2 · 「결과만 ▶▶」을 누르면 그 웨이브를 바로 끝낸다</li></ul>')));
}
