/** node 에서 CSV 를 읽어 data 를 만든다 (테스트 · 밸런스 시뮬 전용 — 게임은 ui/loader.js 가 fetch 로 읽는다) */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { parseCsv } from '../game_logic/csv.js';
import { buildData, TABLES } from '../game_logic/data.js';

const DATA_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'data');

export function loadDataNode(overrides = {}) {
    const raw = {};
    for (const t of TABLES) raw[t] = parseCsv(readFileSync(join(DATA_DIR, `${t}.csv`), 'utf8'));
    const data = buildData(raw);
    Object.assign(data.B, overrides);
    return data;
}
