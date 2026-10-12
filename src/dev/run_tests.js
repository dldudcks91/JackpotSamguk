import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { loadDataNode } from './node_data.js';
import { runSuite } from './tests.js';

const data = loadDataNode();
const { fail } = runSuite(data);

// 그림 파일이 다 있는지 (node 에서만)
const ART = join(dirname(fileURLToPath(import.meta.url)), '..', 'assets', 'art');
const missing = [];
for (const id of data.heroList) if (!existsSync(join(ART, 'portraits', `${data.heroes[id].portrait}.webp`))) missing.push(`portraits/${id}`);
for (const s of data.stages) if (!existsSync(join(ART, 'backgrounds', `${s.bg}.webp`))) missing.push(`backgrounds/${s.bg}`);
for (const s of [...data.slotSymbols, ...data.recruitSymbols]) if (!existsSync(join(ART, 'symbols', `${s.icon}.png`))) missing.push(`symbols/${s.icon}`);
for (const t of Object.keys(data.units)) for (const f of [t, `${t}_team`]) if (!existsSync(join(ART, 'soldiers', `${f}.png`))) missing.push(`soldiers/${f}`);
console.log(missing.length ? `  FAIL 그림 없음: ${missing.join(', ')}` : '  ok   그림 파일이 다 있다');
process.exit(fail || missing.length ? 1 : 0);
