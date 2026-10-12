/** CSV 를 fetch 로 읽어 data 를 만든다 — 브라우저 쪽 어댑터 (game_logic 은 fetch 를 모른다) */
import { parseCsv } from '../game_logic/csv.js';
import { buildData, TABLES } from '../game_logic/data.js';

export async function loadData(base = 'data/') {
    const raw = {};
    await Promise.all(TABLES.map(async t => {
        const res = await fetch(`${base}${t}.csv`, { cache: 'no-cache' });
        if (!res.ok) throw new Error(`${t}.csv ${res.status}`);
        raw[t] = parseCsv(await res.text());
    }));
    return buildData(raw);
}
