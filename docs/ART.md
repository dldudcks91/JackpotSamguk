# 잭팟 삼국지 — 아트

## 1. 그림체

| 무엇 | 그림체 | 근거 |
|---|---|---|
| **인물** — 장수 초상 24 · 졸병 3 | **TheSevenSimulationRPG 식 SD 카툰** | [사용자 · 2026-10-12] 「캐릭터 생김새를 TheSevenSimulationRPG 같은 SD 느낌으로」 · 「병사도 장기말에서 쫄쫄이 병사로」 |
| 배경 10 + 타이틀 · 아이콘 16 | 옛 극장 간판 | [판단 · 2026-10-12] — 인물만 갈았고 배경 · 아이콘은 그대로다 |

### 인물 — SD 카툰
TheSevenSimulationRPG 의 Gemini 영웅 초상과 같은 결: **아주 굵고 조금 고르지 않은 검은 외곽선 · 재질마다 두 톤(바탕 + 딱 끊긴 그림자 하나)만 쓰는 납작 채색 · 탁하고 흙빛 도는 색 · 납작한 색 안의 옅은 때 · 짙은 눈썹과 눈썹 그늘에 묻힌 눈 · 큰 머리 · 짧은 목 · 좁은 어깨**. 배경은 투명.

- 참조 그림 `tools/art/refs/seven_sd_ref.png` — TheSevenSimulationRPG `faces/gemini/hero/` 의 knight_4 · knight_5 · mage_2 · mage_3 을 흰 바탕 2×2 로 묶은 것. 문신 · 십자가 같은 소품이 있는 초상은 뺐다(참조의 소품이 그대로 옮아온다)
- 발주에 「참조의 얼굴 · 민머리 · 갑옷 · 사슬 · 수염 · 문양은 베끼지 말 것」을 적는다
- 문장 `tools/art/prompts/style_sd.txt`

### B급은 표정과 소품으로
그림체는 진지하게 두고 **표정과 소품을 과장**한다 — 우는 유비(어깨까지 늘어진 귀) · 수염 쓰다듬는 관우 · 관을 메고 오는 방덕 · 데운 술잔을 든 채 놀란 화웅 · 웃통 벗고 알통 자랑하는 허저 · 고개가 뒤로 돌아간 사마의 · 깨진 손목시계(시공 균열) · 전차.

### 슬롭 금지 목록 (모든 발주에 붙는다)
매끈한 디지털 페인팅 · 에어브러시 피부 · 부드러운 그라데이션 · 림 라이트 · 빛 번짐 · 보케 · 신의 빛 · 반짝이 · 보석 면 · 네온 · 3D 렌더 결 · 플라스틱 광택 · 섬세한 장식 무늬 · 판타지 게임 스플래시 아트. 글자 · 숫자 · 한자 · 서명 금지.
- 인물(`style_sd.txt`)은 여기에 **애니풍 반짝이는 눈 · 볼터치 · 파스텔 · 귀여운 마스코트**를 더 막는다 — SD 비율이어도 귀엽게 가지 않는다
- 배경 · 아이콘(`style_billboard.txt`)은 옛 극장 간판 문장 + 위 목록

## 2. 그림 목록

| 종류 | 수 | 원본 | 설치 | 크기 |
|---|---|---|---|---|
| 장수 초상 | 24 | `out/portraits_sd/sd0~sd5` (2×2 시트 · 흰 바탕 · 검은 칸 선) | `src/assets/art/portraits/<id>.webp` | 512 정사각 · 투명 |
| 졸병 | 3 | `out/soldiers_sd/soldiers2` (한 줄 셋 — 보병 · 궁병 · 기병) | `src/assets/art/soldiers/<type>.png` + `<type>_team.png` | 보병 키 220 · 셋이 같은 배율 |
| 전장 배경 | 10 | `out/backgrounds/bg01~10` | `src/assets/art/backgrounds/bgNN.webp` | 1500×1000 (전장은 가운데 2:1 띠를 쓴다) |
| 타이틀 | 1 | `out/backgrounds/title` | `backgrounds/title.webp` | 1500×1000 |
| 아이콘 | 16 | `out/icons/icons1~4` (2×2 시트 · 상아색 배경) | `src/assets/art/symbols/<id>.png` | 256 · 투명 |

시트 → 칸 대응은 `tools/art/cut_sheets.py` 의 `PORTRAITS_SD` · `SOLDIERS` · `ICONS` 표. 옛 극장 간판 초상(`out/style_test/C_billboard` · `out/portraits/sheet1~5`)은 원본으로 남아 있다 — `cut_sheets.py portraits` 를 돌리면 같은 자리에 되돌아간다.

- **초상 자르기**: 검은 칸 선(줄의 85% 이상이 검은 몇 px 띠)으로 네 칸을 가른다 → 가슴이 칸 아래에서 잘리므로 정사각은 아래에 붙여 딴다 → 위 · 왼쪽 · 오른쪽 가장자리에서 이어진 흰 바탕을 투명으로(아래 가장자리는 옷이라 시드로 안 쓴다) → **선에 둘러싸인 넓은 순백 덩어리**(여포 깃털 고리 안 · 황충 활 안쪽)도 투명으로 → 테두리 2px 는 흰색을 걷어 반투명으로
- **초상 바탕색**: 투명이라 쓰는 쪽이 깐다 — 화면 칸은 CSS `--portrait-bg`, 전장 얼굴 토큰은 `art.js` 의 `PORTRAIT_BG`(같은 값). 못 만난 장수(장수록)는 바탕 없이 검게 칠해 실루엣이 된다
- **졸병 = 바탕 + 군복 층**: 원본은 코발트 파랑 군복 · 머리띠로 뽑는다(그림에서 파랑은 그것뿐이라고 적는다). 파랑 화소(색상 190 ~ 255° · 채도 0.28 이상)를 군복 층으로 떼어 밝기만 남기고(가장 밝은 곳 = 흰색), 바탕에선 그 자리를 회색으로 바꾼다. 화면은 군복 층에 편 색을 곱해 바탕 위에 얹는다(`art.js soldierSprite`) — 아군 `#4a6fc9`, 적은 스테이지 색(`stages.csv` 의 `color` — 황건적 노랑 · 동탁군 보라 …). 적은 좌우를 뒤집어 왼쪽을 본다
- 전장 장수는 초상을 둥글게 오린 얼굴 토큰이다(위쪽 70%)
- 배경 구도: 높은 곳에서 60도쯤 내려다본 전장 · **왼쪽 끝에 지키는 성/관문** · 가운데는 비워 둔 평평한 땅(토큰이 올라간다) · 사람 없음
- 아이콘: 상아색(#efe6cf) 단색 배경 → 가장자리에서 이어진 배경만 투명으로(`key_out`) — 물체 안의 같은 색은 남는다(활 줄 안쪽 · 엽전 구멍)

## 3. 발주 절차 — Codex(ChatGPT 로그인)

**API 는 절대 쓰지 않는다** (API 키 · `OPENAI_API_KEY` · 플랫폼 호출 금지).

1. `codex login status` → 「Logged in using ChatGPT」인지 확인 (아니면 멈추고 사용자에게 묻는다)
2. 잡 파일을 쓴다 — `tools/art/prompts/<묶음>.json` (`out` · `style` · `jobs[{id, prompt, refs}]`) — 인물은 `portraits_sd.json` · `soldiers_sd.json`
3. `python tools/art/run_codex.py tools/art/prompts/<묶음>.json [잡 id ...]` — `CODEX_PAR`(기본 3)개씩 병렬, 장당 1 ~ 2분. 이미 있는 `out/<id>.png` 는 건너뛴다
4. `python tools/art/cut_sheets.py portraits_sd | soldiers | icons | backgrounds` — 자르기 · 누끼 · 설치 (초상 24장에 1분 반쯤)
5. `node src/dev/run_tests.js` 의 「그림 파일이 다 있다」로 확인

- 실행 파일: VS Code 확장 묶음의 `codex.exe` 중 가장 새 것(`run_codex.py` 가 찾는다)
- 인물 발주는 **`refs/seven_sd_ref.png` 를 `-i` 참조로 붙인다** — 그래야 시트끼리 결이 맞는다
- 졸병은 두 장(`soldiers1` · `soldiers2`)을 뽑아 머리가 더 큰 `soldiers2` 를 골랐다
- ⚠ `cut_sheets.py` 는 numpy · Pillow 만 쓴다(이 기계의 anaconda scipy 는 DLL 이 안 뜬다). Pillow 의 `floodfill` 은 numpy 배열을 공유하는 그림엔 아무것도 안 칠한다 — `Image.fromarray(...).copy()` 로 떼어 쓴다

### 장수 하나를 더할 때
1. `heroes.csv` · `skills.csv` 에 행을 더한다 (`portrait` 열 = 파일 이름)
2. 네 명씩 묶어 시트 잡을 하나 더 쓰고(`portraits_sd.json` 형식) 발주 → `cut_sheets.py` 의 `PORTRAITS_SD` 에 대응을 더해 설치

### 병종 하나를 더할 때
`unit_types.csv` 에 행을 더하고, 졸병 시트를 같은 문장(파랑 군복 · 한 줄 · 오른쪽을 본다)으로 뽑아 `SOLDIERS` 에 넣는다. 셋이 같은 배율이어야 크기가 맞으므로 **한 시트에 같이** 뽑는다.

---
*마지막 업데이트: 2026-10-12*
