/**
 * CSV 파서 — src/data/*.csv (SSOT) 를 객체 배열로 푼다.
 * 파싱만 한다 — fetch(네트워크)는 ui/ 어댑터의 일이다 (이 모듈은 엔진을 모른다).
 *
 * 규칙: 첫 줄 = 헤더. 한 행 = 한 줄(셀 안 줄바꿈 없음). 숫자로 읽히는 값은 숫자로 변환한다.
 * **쉼표가 든 셀은 큰따옴표로 감싼다** — 셀 안의 큰따옴표는 `""` [2026-09-15 · 스토리 글이 쉼표를 쓴다 · INTERFACE §2-2].
 * 따옴표로 **시작하는** 셀만 감싼 셀로 읽는다 — 셀 가운데의 `"` 는 글자 그대로다.
 */

/** 한 줄을 셀로 가른다 — 감싼 셀 안의 쉼표는 가르지 않는다 */
function splitLine(line) {
    const cells = [];
    let i = 0;
    for (;;) {
        if (line[i] === '"') {
            let v = '';
            i++;
            while (i < line.length) {
                if (line[i] === '"') {
                    if (line[i + 1] === '"') { v += '"'; i += 2; continue; }
                    i++;
                    break;
                }
                v += line[i++];
            }
            cells.push(v);
            const next = line.indexOf(',', i);   // 닫는 따옴표와 다음 쉼표 사이는 버린다
            if (next === -1) break;
            i = next + 1;
        } else {
            const next = line.indexOf(',', i);
            if (next === -1) { cells.push(line.slice(i)); break; }
            cells.push(line.slice(i, next));
            i = next + 1;
        }
    }
    return cells;
}

export function parseCsv(text) {
    const lines = text.replace(/^﻿/, '').split(/\r?\n/).filter(l => l.trim() !== '');
    if (lines.length === 0) return [];
    const head = splitLine(lines[0]).map(h => h.trim());
    return lines.slice(1).map(line => {
        const cells = splitLine(line);
        const row = {};
        head.forEach((h, i) => {
            const v = (cells[i] ?? '').trim();
            row[h] = v !== '' && !isNaN(Number(v)) ? Number(v) : v;
        });
        return row;
    });
}

/** key,value,description 형태(balance.csv)를 {key: value} 로 눕힌다 */
export function keyValue(rows) {
    const out = {};
    for (const r of rows) out[r.key] = r.value;
    return out;
}

/** 배열을 특정 컬럼 값으로 인덱싱한다 — byId(rows, 'monster_idx') */
export function indexBy(rows, col) {
    const out = {};
    for (const r of rows) out[r[col]] = r;
    return out;
}
