# -*- coding: utf-8 -*-
"""2x2 시트 → 칸 네 장. 칸 사이 홈(밝은 무채색 띠)을 찾아 가른다.

python tools/art/cut_sheets.py portraits_sd # 초상(SD · 지금 쓰는 것) → 흰 배경을 투명으로 → src/assets/art/portraits/<id>.webp (512)
python tools/art/cut_sheets.py soldiers    # 졸병 → src/assets/art/soldiers/<type>.png + <type>_team.png (군복 색 층)
python tools/art/cut_sheets.py portraits   # (옛) 극장 간판 초상 — 같은 자리에 덮어쓴다
python tools/art/cut_sheets.py icons       # 아이콘 → 배경을 투명으로 → src/assets/art/symbols/<id>.png (256)
python tools/art/cut_sheets.py backgrounds # 배경 → src/assets/art/backgrounds/<id>.webp (1500 폭)
"""
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parents[2]
INSET = 18   # 홈 · 바깥 테두리의 크림색 띠가 칸 가장자리에 남지 않게 안쪽으로 깎는다
OUT = ROOT / 'tools/art/out'
ART = ROOT / 'src/assets/art'

PORTRAITS = {
    'style_test/C_billboard': ['guanyu', 'zhangfei', 'caocao', 'lubu'],
    'portraits/sheet1': ['liubei', 'zhaoyun', 'zhugeliang', 'machao'],
    'portraits/sheet2': ['huangzhong', 'zhangliao', 'zhouyu', 'simayi'],
    'portraits/sheet3': ['sunquan', 'luxun', 'xiahoudun', 'xuchu'],
    'portraits/sheet4': ['ganning', 'taishici', 'weiyan', 'pangde'],
    'portraits/sheet5': ['zhangjiao', 'yuanshao', 'caochun', 'huaxiong'],
}
PORTRAITS_SD = {
    'portraits_sd/sd0': ['guanyu', 'zhangfei', 'caocao', 'lubu'],
    'portraits_sd/sd1': ['liubei', 'zhaoyun', 'zhugeliang', 'machao'],
    'portraits_sd/sd2': ['huangzhong', 'zhangliao', 'zhouyu', 'simayi'],
    'portraits_sd/sd3': ['sunquan', 'luxun', 'xiahoudun', 'xuchu'],
    'portraits_sd/sd4': ['ganning', 'taishici', 'weiyan', 'pangde'],
    'portraits_sd/sd5': ['zhangjiao', 'yuanshao', 'caochun', 'huaxiong'],
}
SOLDIERS = ('soldiers_sd/soldiers2', ['infantry', 'archer', 'cavalry'])   # 한 줄 셋 — 왼쪽부터
SOLDIER_H = 220   # 보병 키(px) — 셋 다 같은 배율로 줄인다(기병이 더 크다)
ICONS = {
    'icons/icons1': ['soldier', 'train', 'book', 'coin'],
    'icons/icons2': ['wild', 'tally_bronze', 'tally_silver', 'tally_gold'],
    'icons/icons3': ['peach', 'tank', 'castle', 'banner'],
    'icons/icons4': ['infantry', 'archer', 'cavalry', 'coins'],
}


def is_gutter_px(p):
    """홈 = 밝은 크림색(누런 끼가 조금 있다) — 겨자색 배경(파랑이 낮다)과 갈린다"""
    r, g, b = p[:3]
    light = min(r, g, b) > 180 and max(r, g, b) - min(r, g, b) < 75
    dark = max(r, g, b) < 55   # 아이콘 시트는 홈이 검은 선이다
    return light or dark


def gutter_runs(im, axis):
    """axis=0 → 열(세로 띠) 검사 · 각 줄에서 홈 색 비율이 높은 연속 구간들"""
    w, h = im.size
    px = im.load()
    n = w if axis == 0 else h
    m = h if axis == 0 else w
    step = max(1, m // 200)
    score = []
    for i in range(n):
        hit = 0
        tot = 0
        for j in range(0, m, step):
            p = px[i, j] if axis == 0 else px[j, i]
            hit += is_gutter_px(p)
            tot += 1
        score.append(hit / tot)
    return score


def split_points(score, n):
    """가운데 근처(0.42~0.58)에서 홈 비율이 가장 높은 구간의 시작·끝"""
    lo, hi = int(n * 0.42), int(n * 0.58)
    best = max(range(lo, hi), key=lambda i: score[i])
    th = max(0.5, score[best] * 0.6)
    a = best
    while a > lo and score[a - 1] >= th:
        a -= 1
    b = best
    while b < hi and score[b + 1] >= th:
        b += 1
    return a, b + 1


def edge_trim(score, start, end):
    """바깥 테두리 홈을 깎는다 — 앞뒤에서 홈 비율이 높은 줄을 건너뛴다"""
    while start < end and score[start] > 0.5:
        start += 1
    while end > start and score[end - 1] > 0.5:
        end -= 1
    return start, end


def cut4(path):
    im = Image.open(path).convert('RGB')
    w, h = im.size
    cs = gutter_runs(im, 0)
    rs = gutter_runs(im, 1)
    xa, xb = split_points(cs, w)
    ya, yb = split_points(rs, h)
    cols = [edge_trim(cs, 0, xa), edge_trim(cs, xb, w)]
    rows = [edge_trim(rs, 0, ya), edge_trim(rs, yb, h)]
    print('  split', path.name, 'x', (xa, xb), 'y', (ya, yb), 'cols', cols, 'rows', rows)
    out = []
    for (y0, y1) in rows:
        for (x0, x1) in cols:
            out.append(im.crop((x0 + INSET, y0 + INSET, x1 - INSET, y1 - INSET)))
    return out


def cut4_fixed(path, inset=34):
    """정가운데 4등분 — 칸 배경과 홈이 같은 색인 아이콘 시트용 (물체가 칸 가운데에 여백을 두고 있다)"""
    im = Image.open(path).convert('RGB')
    w, h = im.size
    out = []
    for y0, y1 in ((0, h // 2), (h // 2, h)):
        for x0, x1 in ((0, w // 2), (w // 2, w)):
            out.append(im.crop((x0 + inset, y0 + inset, x1 - inset, y1 - inset)))
    return out


def square(im):
    w, h = im.size
    s = min(w, h)
    return im.crop(((w - s) // 2, (h - s) // 2, (w - s) // 2 + s, (h - s) // 2 + s))


def key_out(im, tol=38):
    """모서리 색(배경)과 가까운 픽셀을 투명으로 — 가장자리에서 이어진 것만(물체 안의 같은 색은 남긴다)"""
    im = im.convert('RGBA')
    w, h = im.size
    px = im.load()
    corners = [px[2, 2], px[w - 3, 2], px[2, h - 3], px[w - 3, h - 3]]
    bg = tuple(sorted(c[i] for c in corners)[1] for i in range(3))

    def near(p):
        return abs(p[0] - bg[0]) + abs(p[1] - bg[1]) + abs(p[2] - bg[2]) < tol * 3

    seen = bytearray(w * h)
    stack = [(x, y) for x in range(w) for y in (0, h - 1)] + [(x, y) for y in range(h) for x in (0, w - 1)]
    while stack:
        x, y = stack.pop()
        i = y * w + x
        if seen[i]:
            continue
        seen[i] = 1
        if not near(px[x, y]):
            continue
        px[x, y] = (0, 0, 0, 0)
        if x > 0: stack.append((x - 1, y))
        if x < w - 1: stack.append((x + 1, y))
        if y > 0: stack.append((x, y - 1))
        if y < h - 1: stack.append((x, y + 1))
    # 테두리 한 겹 부드럽게
    a = im.getchannel('A').filter(ImageFilter.MinFilter(3)).filter(ImageFilter.GaussianBlur(0.8))
    im.putalpha(a)
    return im


def fit_tight(im, size, pad=0.08):
    """투명 여백을 걷고 정사각 캔버스 가운데에 맞춘다"""
    bbox = im.getbbox()
    if bbox:
        im = im.crop(bbox)
    w, h = im.size
    s = int(max(w, h) / (1 - 2 * pad))
    canvas = Image.new('RGBA', (s, s), (0, 0, 0, 0))
    canvas.paste(im, ((s - w) // 2, (s - h) // 2), im)
    return canvas.resize((size, size), Image.LANCZOS)


def do_portraits():
    dst = ART / 'portraits'
    dst.mkdir(parents=True, exist_ok=True)
    for sheet, ids in PORTRAITS.items():
        p = OUT / f'{sheet}.png'
        if not p.exists():
            print('skip (none)', sheet)
            continue
        for pid, panel in zip(ids, cut4(p)):
            sq = square(panel).resize((512, 512), Image.LANCZOS)
            sq.save(dst / f'{pid}.webp', 'WEBP', quality=84, method=6)
            print('portrait', pid, panel.size)


def do_icons():
    dst = ART / 'symbols'
    dst.mkdir(parents=True, exist_ok=True)
    for sheet, ids in ICONS.items():
        p = OUT / f'{sheet}.png'
        if not p.exists():
            print('skip (none)', sheet)
            continue
        for iid, panel in zip(ids, cut4_fixed(p)):
            icon = fit_tight(key_out(panel), 256)
            icon.save(dst / f'{iid}.png', optimize=True)
            print('icon', iid, panel.size)


def do_backgrounds():
    dst = ART / 'backgrounds'
    dst.mkdir(parents=True, exist_ok=True)
    for p in sorted((OUT / 'backgrounds').glob('*.png')):
        im = Image.open(p).convert('RGB')
        w, h = im.size
        tw = 1500
        im = im.resize((tw, round(h * tw / w)), Image.LANCZOS)
        im.save(dst / f'{p.stem}.webp', 'WEBP', quality=82, method=6)
        print('bg', p.stem, (w, h), '->', im.size)


# ── SD 그림체 (흰 배경 · 굵은 검은 외곽선) ──

def dark_split(im):
    """검은 칸 선으로 가른 2x2 시트 → 칸 네 개의 상자. 가운데 선 · 바깥 테두리 선을 찾는다"""
    a = np.asarray(im.convert('RGB')).max(axis=2) < 80
    boxes = []
    spans = []
    for axis in (0, 1):   # 0 = 열(세로 선) · 1 = 행(가로 선)
        frac = a.mean(axis=axis)
        n = len(frac)
        lo, hi = int(n * 0.4), int(n * 0.6)
        best = lo + int(frac[lo:hi].argmax())
        # 선 = 거의 다 검은 줄 · 몇 px 두께 (어두운 갑옷이 줄의 절반을 덮어도 선이 아니다)
        line = 0.85
        s, e = best, best
        while s > best - 16 and frac[s - 1] > line:
            s -= 1
        while e < best + 16 and frac[e + 1] > line:
            e += 1
        b0 = 0
        while b0 < 16 and frac[b0] > line:
            b0 += 1
        b1 = n
        while b1 > n - 16 and frac[b1 - 1] > line:
            b1 -= 1
        spans.append([(b0, s), (e + 1, b1)])
    cols, rows = spans
    for (y0, y1) in rows:
        for (x0, x1) in cols:
            boxes.append((x0, y0, x1, y1))
    return boxes


def white_bg_mask(rgb, seeds):
    """흰 배경 = 시드(가장자리)에서 이어진 흰 화소. rgb: HxWx3 uint8 → bool HxW"""
    near = (rgb.min(axis=2) >= 222) & (np.ptp(rgb, axis=2) < 34)
    m = Image.fromarray((near * 255).astype(np.uint8)).copy()   # 배열을 공유하는 그림엔 floodfill 이 안 먹는다
    for (x, y) in seeds:
        if m.getpixel((x, y)) == 255:
            ImageDraw.floodfill(m, (x, y), 128, thresh=0)
    return np.asarray(m) == 128


def enclosed_white(rgb, bg, min_frac=0.003):
    """선에 둘러싸인 배경(깃털 고리 안 · 활과 시위 사이) — 순백이고 넓은 덩어리만. 흰 옷은 때 낀 미색이라 안 걸린다"""
    left = (rgb.min(axis=2) >= 247) & (np.ptp(rgb, axis=2) < 10) & ~bg
    out = np.zeros_like(left)
    need = left.size * min_frac
    while left.any():
        y, x = np.unravel_index(np.argmax(left), left.shape)
        m = Image.fromarray(left.astype(np.uint8) * 255).copy()
        ImageDraw.floodfill(m, (int(x), int(y)), 128, thresh=0)
        comp = np.asarray(m) == 128
        left &= ~comp
        if comp.sum() >= need:
            out |= comp
    return out


def unmatte(rgb, bg, band=2):
    """배경은 투명, 배경에 닿은 테두리 화소는 흰색을 걷어 낸다(반투명 · 색 복원)"""
    h, w, _ = rgb.shape
    near = Image.fromarray((bg * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(band * 2 + 1))
    ring = (np.asarray(near) > 0) & ~bg
    f = rgb.astype(np.float32)
    alpha = np.where(bg, 0.0, 1.0)
    a_ring = np.clip(1 - f.min(axis=2) / 255.0, 0.05, 1.0)
    alpha = np.where(ring, a_ring, alpha)
    col = np.where(ring[..., None], np.clip((f - (1 - a_ring[..., None]) * 255) / a_ring[..., None], 0, 255), f)
    out = np.dstack([col, alpha * 255]).astype(np.uint8)
    return Image.fromarray(out)


def do_portraits_sd():
    dst = ART / 'portraits'
    dst.mkdir(parents=True, exist_ok=True)
    for sheet, ids in PORTRAITS_SD.items():
        p = OUT / f'{sheet}.png'
        if not p.exists():
            print('skip (none)', sheet)
            continue
        im = Image.open(p).convert('RGB')
        for pid, (x0, y0, x1, y1) in zip(ids, dark_split(im)):
            k = 4   # 칸 선 찌꺼기
            x0, y0, x1, y1 = x0 + k, y0 + k, x1 - k, y1 - k
            s = min(x1 - x0, y1 - y0)
            cx = (x0 + x1) // 2
            box = (cx - s // 2, y1 - s, cx - s // 2 + s, y1)   # 가로는 가운데 · 세로는 아래(가슴이 칸 아래에서 잘린다)
            rgb = np.asarray(im.crop(box))
            hh, ww, _ = rgb.shape
            seeds = [(x, 0) for x in range(ww)] + [(0, y) for y in range(hh)] + [(ww - 1, y) for y in range(hh)]
            bg = white_bg_mask(rgb, seeds)
            panel = unmatte(rgb, bg | enclosed_white(rgb, bg))
            panel.resize((512, 512), Image.LANCZOS).save(dst / f'{pid}.webp', 'WEBP', quality=88, method=6)
            print('portrait', pid, box)


def team_mask(rgb):
    """군복 색(코발트 파랑) 화소 — 색상 190~250° · 채도 있음"""
    f = rgb.astype(np.float32) / 255
    mx = f.max(axis=2)
    mn = f.min(axis=2)
    d = mx - mn + 1e-6
    r, g, b = f[..., 0], f[..., 1], f[..., 2]
    hue = np.where(mx == b, 240 + 60 * (r - g) / d, np.where(mx == g, 120 + 60 * (b - r) / d, (60 * (g - b) / d) % 360))
    sat = d / (mx + 1e-6)
    return (hue > 190) & (hue < 255) & (sat > 0.28) & (mx > 0.12)


def do_soldiers():
    sheet, ids = SOLDIERS
    im = Image.open(OUT / f'{sheet}.png').convert('RGB')
    rgb = np.asarray(im)
    h, w, _ = rgb.shape
    seeds = [(x, 0) for x in range(w)] + [(x, h - 1) for x in range(w)] + [(0, y) for y in range(h)] + [(w - 1, y) for y in range(h)]
    bg = white_bg_mask(rgb, seeds)
    rgba = np.asarray(unmatte(rgb, bg | enclosed_white(rgb, bg, min_frac=0.001)))   # 활과 시위 사이
    # 덩어리(이어진 화소) 중 큰 셋 — 활 끝과 말꼬리처럼 열이 겹쳐도 갈린다
    left = rgba[..., 3] > 40
    blobs = []
    while left.any():
        y, x = np.unravel_index(np.argmax(left), left.shape)
        m = Image.fromarray(left.astype(np.uint8) * 255).copy()
        ImageDraw.floodfill(m, (int(x), int(y)), 128, thresh=0)
        comp = np.asarray(m) == 128
        left = left & ~comp
        if comp.sum() > 2000:
            blobs.append(comp)
    blobs = sorted(sorted(blobs, key=lambda c: c.sum())[-len(ids):], key=lambda c: np.where(c.any(axis=0))[0][0])
    crops = []
    for comp in blobs:
        ys = np.where(comp.any(axis=1))[0]
        xs = np.where(comp.any(axis=0))[0]
        sub = rgba[ys[0]:ys[-1] + 1, xs[0]:xs[-1] + 1].copy()
        own = comp[ys[0]:ys[-1] + 1, xs[0]:xs[-1] + 1]
        grow = np.asarray(Image.fromarray(own.astype(np.uint8) * 255).filter(ImageFilter.MaxFilter(5))) > 0
        sub[..., 3] = np.where(grow, sub[..., 3], 0)   # 이웃 덩어리 조각은 지운다(가장자리 반투명은 남긴다)
        crops.append(sub)
    scale = SOLDIER_H / crops[0].shape[0]
    dst = ART / 'soldiers'
    dst.mkdir(parents=True, exist_ok=True)
    for sid, sub in zip(ids, crops):
        tm = team_mask(sub[..., :3]) & (sub[..., 3] > 0)
        v = sub[..., :3].max(axis=2).astype(np.float32)
        top = np.percentile(v[tm], 97) if tm.any() else 255
        gray = np.clip(v / top * 255, 0, 255).astype(np.uint8)
        base = sub.copy()
        lum = (0.3 * sub[..., 0] + 0.59 * sub[..., 1] + 0.11 * sub[..., 2]).astype(np.uint8)
        for c in range(3):
            base[..., c] = np.where(tm, lum, sub[..., c])
        team = np.dstack([gray, gray, gray, np.where(tm, sub[..., 3], 0)]).astype(np.uint8)
        size = (max(1, round(sub.shape[1] * scale)), max(1, round(sub.shape[0] * scale)))
        Image.fromarray(base).resize(size, Image.LANCZOS).save(dst / f'{sid}.png', optimize=True)
        Image.fromarray(team).resize(size, Image.LANCZOS).save(dst / f'{sid}_team.png', optimize=True)
        print('soldier', sid, sub.shape[:2], '->', size, 'team px', int(tm.sum()))


if __name__ == '__main__':
    what = sys.argv[1:] or ['portraits_sd', 'soldiers', 'icons', 'backgrounds']
    for w in what:
        {'portraits': do_portraits, 'portraits_sd': do_portraits_sd, 'soldiers': do_soldiers,
         'icons': do_icons, 'backgrounds': do_backgrounds}[w]()
