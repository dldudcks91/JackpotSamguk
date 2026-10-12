# 잭팟 삼국지 (가제) — Project Guide

슬롯머신으로 병사를 찍어 내고, 뽑기로 모은 장수에게 붙여서, 삼국지 명장면 10개를 막아 내는 **한 시간짜리 B급 오토배틀 디펜스**.
2026-10-12 TheSevenSimulationRPG 세션의 대화(슬롯 디펜스 조사 → 삼국지 → 구조 논의)에서 출발했다. **그 게임과는 무관한 별도 프로젝트다.**

- 기획: [docs/GAME_DESIGN.md](docs/GAME_DESIGN.md) — 항목마다 [사용자] · [제안] · [판단] 표시
- 아트: [docs/ART.md](docs/ART.md) — 인물 = TheSevenSimulationRPG 식 SD 카툰 · 배경 · 아이콘 = 옛 극장 간판 · Codex(ChatGPT 로그인) 발주 절차
- 개발: [docs/DEV.md](docs/DEV.md) — 구조 · 검증 · 밸런스 손잡이 · 남은 일

## 실행
- `start.bat` → `http://localhost:8790/index.html` (`serve.py` = http.server + `no-cache` · ETag)
- ES Modules 라 `file://` 로는 안 열린다
- 에이전트가 검증용으로 띄울 땐 **다른 포트**(예: 8791)를 `Start-Process` 로 · 끌 땐 그 PID 하나만

## 규칙
1. **문서는 한국어** · 게임 안 글은 B급 톤(과장 · 개그)으로
2. **수치는 CSV(`src/data/`)가 SSOT** — 코드에 숫자를 박지 않는다. 기획서엔 키 이름만
3. **`src/game_logic/` 은 DOM 을 모른다** — `document` · `window` · `localStorage` 0. 데이터는 주입, 난수는 `rng.js` 의 시드 RNG 하나(`Math.random` 금지 — 화면 장식용 `ui/` 는 예외)
4. **세이브는 엔진 중립 JSON** — `meta.js` 가 만들고, 저장소 접근은 `ui/storage.js` 한 곳
5. **그림은 Codex(ChatGPT 로그인)로만** — OpenAI API · API 키 금지. 부르기 전 `codex login status` 확인 → [docs/ART.md](docs/ART.md)
6. **AI 슬롭 금지** — 매끈한 디지털 페인팅 · 광택 · 빛 번짐 · 반짝이 · 네온 · 대칭 폭발 금지. 인물(장수 · 졸병)은 TheSevenSimulationRPG 식 SD 카툰(굵은 검은 외곽선 · 두 톤 납작 채색 · 큰 머리), 배경 · 아이콘은 옛 극장 간판
7. **git 커밋/푸시는 사용자가 요청할 때만** — 공개 저장소 `github.com/dldudcks91/JackpotSamguk` (2026-10-12 · `tools/art/out/` 원본 PNG 는 올리지 않는다)

## 폴더
```
JackpotSamguk/
├── CLAUDE.md · start.bat · serve.py · package.json(node 테스트 · 시뮬 전용, 의존성 없음)
├── docs/            GAME_DESIGN.md · ART.md · DEV.md
├── tools/
│   ├── art/         run_codex.py(발주) · cut_sheets.py(자르기 · 누끼 · 설치) · prompts/(잡 · 그림체 문장) · refs/(그림체 참조) · out/(원본 PNG)
│   ├── gen_waves.py waves.csv 초안을 식으로 뽑는 도우미 (한 번 뽑은 뒤엔 CSV 가 SSOT)
│   └── sweep.sh     밸런스 스윕 (시드 12개 병렬)
└── src/
    ├── index.html
    ├── game_logic/  rng · csv · data · slot · stats · battle · run · meta  (이식 대상 — 순수)
    ├── ui/          main · hub · battle_view · field(캔버스) · dom · art · loader · storage · style.css
    ├── data/        CSV 10종 (balance · heroes · skills · unit_types · tech · stages · waves · bonds · slot_symbols · recruit_symbols)
    ├── dev/         tests.js(단정) · autoplay.js(자동 플레이어) · run_tests.js · run_sim.js · wave_times.js · test.html
    └── assets/art/  portraits/(24 · 투명 webp) · soldiers/(병종 3 × 바탕 · 군복 층) · backgrounds/(10 + title) · symbols/(16 · 투명 png)
```

## 검증
- `node src/dev/run_tests.js` — 단정 22개 + 그림 파일 존재
- `node src/dev/wave_times.js 3` — 스테이지별 웨이브 길이 · 일기토 · 도망 비율
- `node src/dev/run_sim.js 6 --log` · `sh tools/sweep.sh "--key=value"` — 처음부터 엔딩까지 자동 플레이 · 분 · 스테이지별 첫 시도 승률
- 브라우저: `http://localhost:8790/dev/test.html` (같은 단정) · 화면 흐름은 Playwright(anaconda python · `channel='msedge'` · PowerShell 에서) — `window.__app` · `window.__battle.finishWave()` 가 개발용 고리

---
*마지막 업데이트: 2026-10-12*
