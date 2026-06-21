# MTGO Decklist Tools

A collection of scripts for downloading and analyzing MTGO decklists.

| Script | Docs | Description |
| --- | --- | --- |
| `downloadDecklists.js` | [downloadDecklists.md](downloadDecklists.md) | Download event decklists from the MTGO website and save them locally |
| `analyzeCards.js` | [analyzeCards.md](analyzeCards.md) | Aggregate card usage statistics from saved decklists, broken down by format |
| `setCards.js` | [setCards.md](setCards.md) | List cards from a given set that are actually played in a given format |
| `buildSetPage.js` | [buildSetPage.md](buildSetPage.md) | Generate an HTML page per set showing card usage across all formats |
| `buildIndex.js` | [buildIndex.md](buildIndex.md) | Generate the index page that lists all sets and loads them in a two-panel layout |

---

## Requirements

- [Node.js](https://nodejs.org/) (v18 or later recommended)
- [Playwright](https://playwright.dev/) + Chromium — required by `downloadDecklists.js` only

```bash
npm install
npx playwright install chromium
```

---

## Decklist Storage Structure

Created by `downloadDecklists.js` and read by `analyzeCards.js` and `setCards.js`.

```
decklists/
└── {format}/
    └── {year}/
        └── {month}/
            └── {day}/
                └── {player}.txt
```

Supported formats: `Standard`, `Modern`, `Legacy`, `Vintage`, `Pauper`, `Pioneer`, `Premodern`, `Duel Commander`, `Contraption`

---

## Quick Start

```bash
# 1. Download this month's decklists
node downloadDecklists.js

# 2. Check card usage in Modern
node analyzeCards.js --format Modern --top 20

# 3. See which DSK cards see play in Modern
node setCards.js --set dsk --format Modern
```
