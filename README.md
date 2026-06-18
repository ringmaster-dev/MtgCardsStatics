# MTGO Decklist Downloader

[MTGO 공식 덱리스트 페이지](https://www.mtgo.com/decklists)에서 이벤트별 덱리스트를 받아 로컬에 저장하는 스크립트입니다. 사이트의 **Download Decklist** 버튼이 만들어내는 것과 동일한 `.txt` 파일 형식으로 저장합니다.

---

## 요구 사항

- [Node.js](https://nodejs.org/) (v18 이상 권장)
- [Playwright](https://playwright.dev/) + Chromium

### 설치

```bash
npm install
npx playwright install chromium
```

> 덱리스트 페이지는 JavaScript로 데이터를 렌더링하기 때문에 단순 HTTP 요청으로는 받을 수 없습니다. 그래서 Playwright(헤드리스 Chromium)로 페이지를 열어 내장 데이터(`window.MTGO.decklists.data`)를 추출합니다.

---

## 사용법

```bash
node downloadDecklists.js [옵션]
```

| 옵션 | 설명 |
| --- | --- |
| (옵션 없음) | 이번 달 이벤트만 받기 |
| `--month YYYY/MM` | 특정 한 달만 받기 (예: `--month 2026/03`) |
| `--from YYYY/MM` | 해당 월부터 **현재 달까지** 받기 |
| `--from YYYY/MM --to YYYY/MM` | 지정한 범위만 받기 |
| `--force` | 이미 저장된 파일도 덮어쓰기 (다른 옵션과 조합 가능) |

- 날짜 형식은 `YYYY/MM` 또는 `YYYY-MM` (예: `2026/03`, `2026-3`).
- `--month`는 `--from`/`--to`와 함께 쓸 수 없습니다.

### 예시

```bash
# 이번 달
node downloadDecklists.js

# 2026년 3월만
node downloadDecklists.js --month 2026/03

# 2026년 1월부터 지금까지
node downloadDecklists.js --from 2026/01

# 2025년 1월 ~ 2025년 12월
node downloadDecklists.js --from 2025/01 --to 2025/12

# 가장 오래된 데이터부터 전부 (※ 매우 큰 작업)
node downloadDecklists.js --from 2015/11
```

---

## 저장 구조

```
decklists/
└── {포맷}/
    └── {년}/
        └── {월}/
            └── {일}/
                └── {플레이어이름}.txt
```

예시:

```
decklists/
├── Modern/2026/06/17/Boin.txt
├── Legacy/2026/06/17/maximusdee.txt
└── Standard/2026/06/18/...
```

### 포맷 폴더

이벤트의 포맷에 따라 자동 분류됩니다:

`Standard`, `Modern`, `Legacy`, `Vintage`, `Pauper`, `Pioneer`, `Premodern`, `Duel Commander`, `Contraption`

> 정식 포맷 목록에 없는 특수 이벤트(예: `Limited RC` — Limited Regional Championship)는 이벤트 이름을 기반으로 폴더가 만들어집니다.

### 파일 형식

각 `.txt`는 사이트의 Download Decklist 버튼과 동일한 형식입니다 — 메인덱, 빈 줄 3개, 사이드보드 순서:

```
4 Aether Vial
1 Arid Mesa
...
4 Snow-Covered Plains


2 Containment Priest
1 Surgical Extraction
...
```

(카드는 이름 알파벳순 정렬, 줄바꿈은 `CRLF`)

---

## 동작 방식

- **중복 방지(기본)**: 이미 존재하는 파일은 건너뜁니다. 매일 실행하면 새 이벤트만 추가되어, 일일 수집·이어받기에 적합합니다. 덮어쓰려면 `--force`.
- **데이터 없는 달 자동 스킵**: MTGO는 데이터가 없는 달을 요청하면 현재 월 데이터로 폴백합니다. 스크립트는 이벤트 URL의 실제 날짜가 요청한 연/월과 일치하는지 검증해, 폴백된 잘못된 데이터를 받지 않고 `데이터 없음 (스킵)`으로 처리합니다.
- **재시도**: 이벤트 페이지 로딩 실패 시 자동으로 한 번 더 시도합니다. 그래도 실패하면 `FAILED (timeout)`으로 표시하고 다음으로 넘어갑니다. 실패한 이벤트는 같은 명령을 다시 실행하면 (중복 방지 덕분에) 빠르게 메꿔집니다.

### 출력 예시

```
Range: 2025/01 ~ 2025/12  [skip existing]

Loading 2025/01 ... 386 events (누적 386)
Loading 2025/02 ... 320 events (누적 706)
...

Processing: Legacy Challenge 32 ... OK — 32 saved → decklists\Legacy\2025\01\05
Processing: Modern League ... OK — 3 saved, 11 skipped → decklists\Modern\2025\01\05
Processing: Standard League ... SKIPPED (no decklists)
...

────────────────────────────────────────────────────────────
Done. 1234 files saved, 5678 skipped, 5 events failed.
Output: C:\Workspace\MtgCardsStatics\decklists
```

---

## 데이터 가용 범위

MTGO 공식 아카이브는 **2015년 11월**부터 제공됩니다. 그 이전 달은 데이터가 없어 자동 스킵됩니다.

전체를 받으려면:

```bash
node downloadDecklists.js --from 2015/11
```

> ⚠️ 약 10년치 데이터로, 수십만 개 파일·수 시간이 소요될 수 있습니다. 중간에 멈춰도 다시 실행하면 중복 없이 이어집니다.

---

## 참고

- 한 번 실행 시 헤드리스 Chromium 브라우저 1개를 띄워 이벤트를 **순차적으로** 처리합니다. 같은 출력 폴더에 대해 여러 개를 동시에 실행하지 마세요(파일 경합 발생).
- 네트워크 상태에 따라 일부 이벤트가 타임아웃될 수 있으며, 재실행으로 보완됩니다.
