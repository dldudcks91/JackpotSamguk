/** 작은 DOM 도우미 · 툴팁 · 토스트 */

export function h(tag, attrs = {}, ...kids) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
        if (v === undefined || v === null || v === false) continue;
        if (k === 'class') el.className = v;
        else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
        else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
        else if (k === 'html') el.innerHTML = v;
        else if (k === 'tip') setTip(el, v);
        else el.setAttribute(k, v === true ? '' : v);
    }
    for (const kid of kids.flat()) {
        if (kid === null || kid === undefined || kid === false) continue;
        el.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
    }
    return el;
}

export const $ = (sel, root = document) => root.querySelector(sel);

// ── 툴팁 — 그 대상의 효과만 짧게 ──
const tipEl = () => document.getElementById('tip');
export function setTip(el, html) {
    el.dataset.tip = html;
    el.addEventListener('mouseenter', showTip);
    el.addEventListener('mousemove', moveTip);
    el.addEventListener('mouseleave', hideTip);
}
function showTip(e) {
    const t = tipEl();
    const html = e.currentTarget.dataset.tip;
    if (!html) return;
    t.innerHTML = html;
    t.style.display = 'block';
    moveTip(e);
}
function moveTip(e) {
    const t = tipEl();
    const w = t.offsetWidth;
    const hgt = t.offsetHeight;
    let x = e.clientX + 16;
    let y = e.clientY + 18;
    if (x + w > window.innerWidth - 6) x = e.clientX - w - 12;
    if (y + hgt > window.innerHeight - 6) y = e.clientY - hgt - 12;
    t.style.left = `${x}px`;
    t.style.top = `${y}px`;
}
export function hideTip() {
    const t = tipEl();
    if (t) t.style.display = 'none';
}

let toastTimer = 0;
export function toast(msg, ms = 1600) {
    const t = document.getElementById('toast');
    t.textContent = msg;
    t.classList.add('on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('on'), ms);
}

/** 화면 한 장(1600×900) 배율 — 포인터 좌표를 한 장 좌표로 바꿀 때 쓴다 */
export const stageScale = { k: 1 };
export function toStage(clientX, clientY) {
    const r = document.getElementById('stage').getBoundingClientRect();
    return { x: (clientX - r.left) / stageScale.k, y: (clientY - r.top) / stageScale.k };
}

export function modal(content, { onClose, closable = true } = {}) {
    const back = h('div', { class: 'modal-back' });
    const box = h('div', { class: 'panel modal' }, content);
    if (closable) {
        box.append(h('button', { class: 'close', onclick: () => close() }, '✕'));
    }
    back.append(box);
    document.getElementById('overlay').append(back);
    function close() {
        back.remove();
        hideTip();
        onClose?.();
    }
    return { el: box, close };
}

export const sleep = ms => new Promise(r => setTimeout(r, ms));
