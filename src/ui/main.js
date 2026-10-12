/** 진입점 — 데이터 읽기 · 세이브 · 화면 전환 · 한 장 배율 */
import { loadData } from './loader.js';
import { readSave, writeSave, clearSave } from './storage.js';
import { newMeta, loadMeta } from '../game_logic/meta.js';
import { h, stageScale, hideTip } from './dom.js';
import { preload, portraitUrl, bgUrl, iconUrl, soldierUrl, soldierTeamUrl } from './art.js';
import { renderHub } from './hub.js';
import { renderBattle } from './battle_view.js';

const app = {
    data: null,
    meta: null,
    save() { if (this.meta) writeSave(this.meta); },
    go(screen, arg) {
        hideTip();
        document.getElementById('overlay').innerHTML = '';
        const root = document.getElementById('screen');
        if (this.cleanup) { this.cleanup(); this.cleanup = null; }
        root.innerHTML = '';
        if (screen === 'title') renderTitle(root);
        else if (screen === 'hub') this.cleanup = renderHub(app, root, arg);
        else if (screen === 'battle') this.cleanup = renderBattle(app, root, arg);
        else if (screen === 'ending') renderEnding(root);
    },
};
window.__app = app;   // 개발 · 헤드리스 검증용

function fitStage() {
    const k = Math.min(window.innerWidth / 1600, window.innerHeight / 900);
    stageScale.k = k;
    document.getElementById('stage').style.transform = `scale(${k})`;
}

function renderTitle(root) {
    const has = !!app.meta;
    const el = h('div', { class: 'title-screen', style: { backgroundImage: `url(${bgUrl('title')})` } },
        h('div', { class: 'logo' }, '잭팟 삼국지', h('small', {}, '천하가 슬롯머신에 빨려 들어갔다!')),
        h('div', { class: 'menu' },
            has ? h('button', { class: 'btn', onclick: () => app.go('hub') }, '이어 하기') : null,
            h('button', { class: has ? 'btn ivory' : 'btn', onclick: () => newGame(has) }, '새 게임')),
        h('div', { class: 'credit' }, '가제 · 2026 · 오토배틀 슬롯 디펜스'));
    root.append(el);
}

function newGame(confirmFirst) {
    if (confirmFirst && !window.confirm('지금까지 모은 장수와 명성이 사라진다. 새로 시작할까?')) return;
    clearSave();
    app.meta = newMeta(app.data, (Date.now() ^ 0x5bd1e995) >>> 0);
    app.meta.stats.startedAt = Date.now();
    app.save();
    app.go('hub', { tab: 'recruit', firstTime: true });
}

function renderEnding(root) {
    const m = app.meta;
    const mins = m.stats.startedAt ? Math.round(((m.stats.endedAt || Date.now()) - m.stats.startedAt) / 60000) : null;
    root.append(h('div', { class: 'ending', style: { backgroundImage: `url(${bgUrl('title')})` } },
        h('div', { class: 'panel' },
            h('h1', {}, '천하통일'),
            h('p', {}, '오장원의 바람이 멎었다. 열 개의 전장을 모두 막아 낸 슬롯머신은 마지막으로 한 번 덜컹거리더니, 잭팟 소리 대신 조용히 식었다.'),
            h('p', {}, '사람들은 그날을 이렇게 기록했다. 「천하는 하나가 되었다. 다만 왜 관우가 둘이었는지는 아무도 설명하지 못했다.」'),
            h('p', {}, `출정 ${m.stats.runs}번 · 승리 ${m.stats.wins} · 패배 ${m.stats.losses} · 등용 ${m.stats.recruits}번` + (mins ? ` · 약 ${mins}분` : '')),
            h('button', { class: 'btn', onclick: () => app.go('hub') }, '군영으로'))));
}

async function boot() {
    fitStage();
    window.addEventListener('resize', fitStage);
    const root = document.getElementById('screen');
    root.append(h('div', { style: { color: '#efe6cf', font: '28px sans-serif', padding: '40px' } }, '슬롯머신에 기름 치는 중…'));
    app.data = await loadData();
    const saved = readSave();
    app.meta = saved ? loadMeta(app.data, saved) : null;
    const d = app.data;
    await preload([
        bgUrl('title'),
        ...d.heroList.map(id => portraitUrl(d, id)),
        ...d.stages.map(s => bgUrl(s.bg)),
        ...d.slotSymbols.map(s => iconUrl(s.icon)),
        ...d.recruitSymbols.map(s => iconUrl(s.icon)),
        ...['tank', 'castle', 'coins', 'banner', 'infantry', 'archer', 'cavalry'].map(iconUrl),
        ...Object.keys(d.units).flatMap(t => [soldierUrl(t), soldierTeamUrl(t)]),
    ]);
    const q = new URLSearchParams(location.search);
    if (q.get('dev') === 'battle' && app.meta) {
        app.go('battle', { stageId: Number(q.get('stage') || 1), deploy: Object.keys(app.meta.heroes).slice(0, 3) });
    } else {
        app.go('title');
    }
}

boot().catch(err => {
    console.error(err);
    document.getElementById('screen').innerHTML = `<pre style="color:#fff;padding:30px">불러오기 실패: ${err.message}\n\nstart.bat 으로 띄웠는지 확인하자 (file:// 로는 안 열린다)</pre>`;
});
