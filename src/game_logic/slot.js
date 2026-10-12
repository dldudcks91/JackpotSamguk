/**
 * 슬롯 두 대 — 병사 슬롯(3×3 · 줄 8개)과 등용 슬롯(릴 3개). 결과 계산만 한다(돈 · 카드 처리는 run.js · meta.js).
 * 난수는 주입받은 rng 하나만 쓴다.
 */

/** 3×3 칸 번호: 0 1 2 / 3 4 5 / 6 7 8 */
export const PAYLINES = [
    [0, 1, 2], [3, 4, 5], [6, 7, 8],   // 가로
    [0, 3, 6], [1, 4, 7], [2, 5, 8],   // 세로
    [0, 4, 8], [2, 4, 6],              // 대각
];

export function pickWeighted(rng, rows, key = 'weight') {
    let total = 0;
    for (const r of rows) total += r[key];
    let x = rng() * total;
    for (const r of rows) {
        x -= r[key];
        if (x < 0) return r;
    }
    return rows[rows.length - 1];
}

/**
 * 병사 슬롯 한 번.
 * @returns {{grid: string[], lines: {cells:number[], kind:string}[], pay: {soldiers, train, tech, gold, jackpot}, counts}}
 *   pay.train/tech = 이번 스핀이 준 조각 수 · jackpot = 時 가 jackpot_wild 개 이상
 */
export function spinSoldier(data, rng) {
    const syms = data.slotSymbols;
    const grid = [];
    for (let i = 0; i < 9; i++) grid.push(pickWeighted(rng, syms).id);
    return evalSoldierGrid(data, grid);
}

/** 판(9칸)을 받아 줄과 지급을 셈한다 — 테스트가 판을 직접 넣을 수 있게 나눴다 */
export function evalSoldierGrid(data, grid) {
    const B = data.B;
    const kindOf = id => data.slotSymbols.find(s => s.id === id).kind;
    const kinds = grid.map(kindOf);
    const counts = { soldier: 0, train: 0, tech: 0, coin: 0, wild: 0 };
    for (const k of kinds) counts[k]++;

    const lines = [];
    for (const cells of PAYLINES) {
        const ks = cells.map(c => kinds[c]);
        const base = ks.filter(k => k !== 'wild');
        if (base.length === 0) continue;                 // 時 세 칸 줄은 잭팟이 따로 셈한다
        if (base.every(k => k === base[0])) lines.push({ cells, kind: base[0] });
    }
    const lineCount = k => lines.filter(l => l.kind === k).length;

    const pay = {
        soldiers: counts.soldier * B.pay_soldier_cell + lineCount('soldier') * B.pay_soldier_line,
        train: counts.train + lineCount('train') * B.pay_frag_line,
        tech: counts.tech + lineCount('tech') * B.pay_frag_line,
        gold: counts.coin * B.pay_coin_cell + lineCount('coin') * B.pay_coin_line,
        jackpot: counts.wild >= B.jackpot_wild,
    };
    return { grid, lines, pay, counts };
}

/**
 * 등용 슬롯 한 번 — 릴 셋의 점수 합으로 등급을 정한다. 桃 셋 = 도원결의.
 * @returns {{reels: string[], score: number, grade: 1|2|3, taoyuan: boolean}}
 */
export function spinRecruit(data, rng) {
    const reels = [0, 1, 2].map(() => pickWeighted(rng, data.recruitSymbols).id);
    return evalRecruit(data, reels);
}

export function evalRecruit(data, reels) {
    const B = data.B;
    const sym = id => data.recruitSymbols.find(s => s.id === id);
    const score = reels.reduce((a, id) => a + sym(id).score, 0);
    const taoyuan = reels.every(id => id === 'peach');
    const grade = score >= B.recruit_legend_score ? 3 : score >= B.recruit_elite_score ? 2 : 1;
    return { reels, score, grade, taoyuan };
}
