# -*- coding: utf-8 -*-
"""waves.csv 초안을 식으로 뽑는 도우미 — 한 번 뽑은 뒤엔 CSV 가 SSOT 다(손으로 고쳐도 된다).

python tools/gen_waves.py > src/data/waves.csv
"""
WAVES = [4, 4, 5, 5, 5, 6, 5, 5, 6, 6]
# 스테이지별 병종 비율 (보병, 궁병, 기병) — 특징은 GAME_DESIGN §7
MIX = {1: (0.85, 0.15, 0.0), 2: (0.55, 0.15, 0.30), 3: (0.45, 0.45, 0.10), 4: (0.40, 0.15, 0.45),
       5: (0.55, 0.30, 0.15), 6: (0.60, 0.25, 0.15), 7: (0.45, 0.40, 0.15), 8: (0.55, 0.25, 0.20),
       9: (0.55, 0.25, 0.20), 10: (0.45, 0.35, 0.20)}
HORDE = {1: 1.25, 6: 1.3, 9: 1.15}
COUNT_MULT = 2.0   # 2026-10-12 밸런스 시뮬 — 적이 한 줄로 졸졸 오면 아군이 안 죽는다


def split(n, mix):
    a = round(n * mix[1])
    c = round(n * mix[2])
    return n - a - c, a, c


print('stage,wave,infantry,archer,cavalry,spread,boss')
for s, nw in enumerate(WAVES, 1):
    base = 6 + 2 * s
    for w in range(1, nw + 1):
        boss = 1 if w == nw else 0
        n = base + 3 * (w - 1) if not boss else base + 2 * (w - 1)
        n = round(n * HORDE.get(s, 1.0) * COUNT_MULT)
        i, a, c = split(n, MIX[s])
        spread = round(8 + n * 0.18)
        print(f'{s},{w},{i},{a},{c},{spread},{boss}')
