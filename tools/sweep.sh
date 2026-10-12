#!/bin/sh
# 밸런스 스윕 — 시드 4묶음 × 3개를 병렬로 돌려 합친다
# sh tools/sweep.sh "--enemy_count_mult=2.0 ..."
cfg="$1"
for o in 0 3 6 9; do node src/dev/run_sim.js 3 --json --offset=$o $cfg | grep '^JSON' & done | python -c "
import sys, json
rows=[json.loads(l[5:]) for l in sys.stdin]
n=len(rows); m=sorted(r['minutes'] for r in rows)
print(f'n={n} done={sum(r[\"done\"] for r in rows)} runs={sum(r[\"runs\"] for r in rows)/n:.1f} minutes avg={sum(m)/n:.0f} med={m[n//2]:.0f} min={m[0]:.0f} max={m[-1]:.0f}')
st={}
for r in rows:
    for k,v in r['tries'].items(): st.setdefault(int(k),[]).append(v)
print('first-try win%: ' + '  '.join(f'{k}:{100*sum(1 for v in st[k] if v==1)/len(st[k]):.0f}' for k in sorted(st)))
print('avg tries:      ' + '  '.join(f'{k}:{sum(st[k])/len(st[k]):.1f}' for k in sorted(st)))
"
