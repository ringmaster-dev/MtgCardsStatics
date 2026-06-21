# MTGO Decklist Tools

MTGO 덱리스트 수집 및 분석 스크립트 모음입니다.

| 스크립트 | 문서 | 역할 |
| --- | --- | --- |
| `downloadDecklists.js` | [downloadDecklists.ko.md](downloadDecklists.ko.md) | MTGO 공식 사이트에서 덱리스트를 받아 로컬에 저장 |
| `analyzeCards.js` | [analyzeCards.ko.md](analyzeCards.ko.md) | 저장된 덱리스트에서 포맷별 카드 사용 통계 출력 |
| `setCards.js` | [setCards.ko.md](setCards.ko.md) | 특정 세트 수록 카드 중 특정 포맷에서 실제 사용된 카드 목록 출력 |

---

## 요구 사항

- [Node.js](https://nodejs.org/) (v18 이상 권장)
- [Playwright](https://playwright.dev/) + Chromium — `downloadDecklists.js` 에서만 필요

```bash
npm install
npx playwright install chromium
```

---

## 덱리스트 저장 구조

`downloadDecklists.js`가 생성하는 폴더 구조이며, `analyzeCards.js`와 `setCards.js`가 이 구조를 그대로 읽습니다.

```
decklists/
└── {포맷}/
    └── {년}/
        └── {월}/
            └── {일}/
                └── {플레이어이름}.txt
```

지원 포맷: `Standard`, `Modern`, `Legacy`, `Vintage`, `Pauper`, `Pioneer`, `Premodern`, `Duel Commander`, `Contraption`

---

## 빠른 시작

```bash
# 1. 이번 달 덱리스트 수집
node downloadDecklists.js

# 2. Modern 포맷 카드 사용 현황 확인
node analyzeCards.js --format Modern --top 20

# 3. DSK 세트에서 Modern에 쓰이는 카드 확인
node setCards.js --set dsk --format Modern
```
