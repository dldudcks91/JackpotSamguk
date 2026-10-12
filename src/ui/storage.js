/** 세이브 저장소 어댑터 — localStorage 에 닿는 곳은 여기 하나 */
const KEY = 'jackpot_samguk_save_v1';
const PREF = 'jackpot_samguk_pref_v1';

export function readSave() {
    try {
        const s = localStorage.getItem(KEY);
        return s ? JSON.parse(s) : null;
    } catch {
        return null;
    }
}

export function writeSave(meta) {
    try {
        localStorage.setItem(KEY, JSON.stringify(meta));
        return true;
    } catch {
        return false;
    }
}

export function clearSave() {
    try { localStorage.removeItem(KEY); } catch { /* 저장소가 막혔으면 할 일이 없다 */ }
}

export function readPref() {
    try { return JSON.parse(localStorage.getItem(PREF) || '{}'); } catch { return {}; }
}

export function writePref(p) {
    try { localStorage.setItem(PREF, JSON.stringify(p)); } catch { /* 편의 설정 — 못 써도 된다 */ }
}
