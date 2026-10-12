# -*- coding: utf-8 -*-
"""Codex(ChatGPT 로그인) 그림 발주기 — API 는 절대 안 쓴다.

python tools/art/run_codex.py <잡 파일.json> [잡 id ...]

잡 파일: {"out": "tools/art/out/<묶음>", "style": "prompts/<공통 문체>.txt"(선택),
          "jobs": [{"id": "...", "prompt": "..." | "prompt_file": "...", "refs": ["경로.png", ...]}]}
- style 이 있으면 각 잡의 prompt 뒤에 붙는다(그림체 문장을 한 곳에서 관리)
- 이미 out/<id>.png 가 있으면 건너뛴다 (다시 뽑으려면 지운다)
- CODEX_PAR(기본 3) 개씩 병렬
"""
import concurrent.futures as cf
import json
import os
import shutil
import subprocess
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
EXE = max((Path.home() / '.vscode/extensions').glob('openai.chatgpt-*-win32-x64'),
          key=lambda p: p.stat().st_mtime) / 'bin/windows-x86_64/codex.exe'
PAR = int(os.environ.get('CODEX_PAR', '3'))
WORK = Path(os.environ.get('CODEX_WORK', ROOT / 'tools/art/_run'))

WRAP = ("Use your built-in image generation tool to create exactly ONE image from the prompt below. "
        "Do not write code, do not run commands, do not edit any files. "
        "When the image is saved, reply with only its absolute file path.\n\n")


def log(msg, logfile):
    line = time.strftime('%H:%M:%S ') + msg
    print(line, flush=True)
    with open(logfile, 'a', encoding='utf-8') as f:
        f.write(line + '\n')


def from_thread(events):
    """events.jsonl 의 thread_id → ~/.codex/generated_images/<thread_id>/ 의 가장 새 PNG"""
    for line in events.read_text(encoding='utf-8', errors='replace').splitlines():
        if '"thread.started"' in line:
            d = Path.home() / '.codex/generated_images' / json.loads(line)['thread_id']
            pngs = sorted(d.glob('*.png'), key=lambda q: q.stat().st_mtime)
            return pngs[-1] if pngs else None
    return None


def run(job, conf, base, outdir, logfile):
    style = (base / conf['style']).read_text(encoding='utf-8') if conf.get('style') else ''
    text = job.get('prompt') or (base / job['prompt_file']).read_text(encoding='utf-8')
    body = WRAP + text.strip() + ('\n\n' + style.strip() if style else '')
    wd = WORK / outdir.name / job['id']
    wd.mkdir(parents=True, exist_ok=True)
    last = wd / 'last.txt'
    if last.exists():
        last.unlink()
    cmd = [str(EXE), 'exec', '-s', 'read-only', '-C', str(wd), '--skip-git-repo-check',
           '-c', 'model_reasoning_effort="low"', '--json', '-o', str(last)]
    for r in job.get('refs', []):
        cmd += ['-i', str((ROOT / r).resolve())]
    cmd += ['-']
    t0 = time.time()
    log(f"{job['id']} start refs={job.get('refs', [])}", logfile)
    with open(wd / 'events.jsonl', 'w', encoding='utf-8') as ev:
        p = subprocess.run(cmd, input=body.encode('utf-8'), stdout=ev, stderr=subprocess.STDOUT, timeout=1200)
    txt = last.read_text(encoding='utf-8', errors='replace').strip() if last.exists() else ''
    path = next((Path(s.strip().strip('`"')) for s in txt.splitlines()
                 if s.strip().lower().strip('`"').endswith('.png')), None)
    if not path or not path.exists():
        path = from_thread(wd / 'events.jsonl')
    if p.returncode != 0 or not path or not path.exists():
        log(f"{job['id']} FAIL rc={p.returncode} last={txt[:200]!r} ({time.time() - t0:.0f}s)", logfile)
        return job['id'], False
    dst = outdir / f"{job['id']}.png"
    shutil.copy2(path, dst)
    log(f"{job['id']} ok ({time.time() - t0:.0f}s)", logfile)
    return job['id'], True


def main():
    jf = Path(sys.argv[1]).resolve()
    conf = json.loads(jf.read_text(encoding='utf-8'))
    base = jf.parent
    outdir = (ROOT / conf['out']).resolve()
    outdir.mkdir(parents=True, exist_ok=True)
    logfile = outdir / 'run.log'
    want = set(sys.argv[2:])
    jobs = [j for j in conf['jobs'] if (not want or j['id'] in want) and not (outdir / f"{j['id']}.png").exists()]
    log(f'batch {jf.name} {[j["id"] for j in jobs]} par={PAR} exe={EXE.parent.parent.parent.name}', logfile)
    with cf.ThreadPoolExecutor(PAR) as ex:
        res = list(ex.map(lambda j: run(j, conf, base, outdir, logfile), jobs))
    log('done ' + ' '.join(f'{i}={"ok" if ok else "FAIL"}' for i, ok in res), logfile)


if __name__ == '__main__':
    main()
