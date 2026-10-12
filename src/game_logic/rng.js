/**
 * 시드 RNG — mulberry32. **게임 전체에서 난수는 이 모듈 하나만 쓴다** (CLAUDE.md 이식성 규칙 2).
 * Math.random 을 직접 부르면 같은 시드로 엔진 이식 결과를 대조할 수 없다.
 *
 * 순수 모듈 — DOM/저장소/시계 접근 없음.
 */

export function makeRng(seed) {
    let s = seed >>> 0;
    return () => {
        s = (s + 0x6D2B79F5) >>> 0;
        let t = Math.imul(s ^ (s >>> 15), 1 | s);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

/**
 * 마스터 시드 + 스트림 번호 → 파생 시드.
 * 세이브에는 마스터 시드와 **카운터**만 남긴다 — n번째 전투는 언제 다시 돌려도 같은 전투다.
 */
export const deriveSeed = (master, stream) =>
    (Math.imul(master ^ 0x9E3779B9, 2654435761) + Math.imul(stream + 1, 40503)) >>> 0;
