/** 그림 경로와 미리 읽기 — 캔버스가 쓰는 그림은 Image 로 들고 있는다 */
export const ART = 'assets/art/';

export const portraitUrl = (data, id) => `${ART}portraits/${data.heroes[id].portrait}.webp`;
export const bgUrl = id => `${ART}backgrounds/${id}.webp`;
export const iconUrl = id => `${ART}symbols/${id}.png`;
export const unitIcon = type => iconUrl(type);   // infantry · archer · cavalry
export const soldierUrl = type => `${ART}soldiers/${type}.png`;
export const soldierTeamUrl = type => `${ART}soldiers/${type}_team.png`;
export const PORTRAIT_BG = '#cdb98f';   // 초상은 투명 배경 — 둥근 토큰 바탕

const cache = new Map();

export function img(url) {
    let im = cache.get(url);
    if (!im) {
        im = new Image();
        im.decoding = 'async';
        im.src = url;
        cache.set(url, im);
    }
    return im;
}

export function preload(urls) {
    return Promise.all(urls.map(u => new Promise(res => {
        const im = img(u);
        if (im.complete && im.naturalWidth) return res();
        im.onload = () => res();
        im.onerror = () => res();
    })));
}

/** 장수 얼굴을 원형으로 잘라 둔 캔버스 (전장 토큰용) */
const faceCache = new Map();
export function faceToken(data, id, size = 64) {
    const key = `${id}@${size}`;
    let c = faceCache.get(key);
    if (c) return c;
    const im = img(portraitUrl(data, id));
    if (!im.complete || !im.naturalWidth) return null;
    c = document.createElement('canvas');
    c.width = c.height = size;
    const g = c.getContext('2d');
    g.beginPath();
    g.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
    g.clip();
    g.fillStyle = PORTRAIT_BG;
    g.fillRect(0, 0, size, size);
    // 얼굴이 가운데 위쪽에 있다 — 위쪽 70% 를 쓴다
    const s = im.naturalWidth;
    g.drawImage(im, s * 0.14, s * 0.04, s * 0.72, s * 0.72, 0, 0, size, size);
    faceCache.set(key, c);
    return c;
}

/** 졸병 그림 = 바탕(군복은 회색) + 군복 층에 편 색을 곱한 것. 편 색 · 방향마다 한 번 굽는다 */
const soldierCache = new Map();
export function soldierSprite(type, color, flip) {
    const key = `${type}|${color}|${flip ? 1 : 0}`;
    let c = soldierCache.get(key);
    if (c) return c;
    const base = img(soldierUrl(type));
    const team = img(soldierTeamUrl(type));
    if (!base.complete || !base.naturalWidth || !team.complete || !team.naturalWidth) return null;
    const w = base.naturalWidth;
    const h = base.naturalHeight;
    const tint = document.createElement('canvas');
    tint.width = w;
    tint.height = h;
    const t = tint.getContext('2d');
    t.drawImage(team, 0, 0);
    t.globalCompositeOperation = 'multiply';
    t.fillStyle = color;
    t.fillRect(0, 0, w, h);
    t.globalCompositeOperation = 'destination-in';
    t.drawImage(team, 0, 0);
    c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const g = c.getContext('2d');
    if (flip) {
        g.translate(w, 0);
        g.scale(-1, 1);
    }
    g.drawImage(base, 0, 0);
    g.drawImage(tint, 0, 0);
    soldierCache.set(key, c);
    return c;
}
