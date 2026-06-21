# downloadDecklists.js

Downloads event decklists from the [MTGO official decklist page](https://www.mtgo.com/decklists) and saves them locally as `.txt` files — the same format produced by the site's **Download Decklist** button.

---

## Requirements

- [Node.js](https://nodejs.org/) (v18 or later recommended)
- [Playwright](https://playwright.dev/) + Chromium

```bash
npm install
npx playwright install chromium
```

> The decklist page renders its data with JavaScript, so a plain HTTP request is not enough. The script launches a headless Chromium browser via Playwright and extracts the embedded data from `window.MTGO.decklists.data`.

---

## Usage

```bash
node downloadDecklists.js [options]
```

| Option | Description |
| --- | --- |
| (none) | Download this month's events only |
| `--month YYYY/MM` | Download a specific month (e.g. `--month 2026/03`) |
| `--from YYYY/MM` | Download from the given month up to the current month |
| `--from YYYY/MM --to YYYY/MM` | Download a specific range |
| `--force` | Overwrite existing files |

- Date format: `YYYY/MM` or `YYYY-MM` (e.g. `2026/03`, `2026-3`).
- `--month` cannot be combined with `--from` / `--to`.

### Examples

```bash
# This month
node downloadDecklists.js

# March 2026 only
node downloadDecklists.js --month 2026/03

# January 2026 through the current month
node downloadDecklists.js --from 2026/01

# January 2025 through December 2025
node downloadDecklists.js --from 2025/01 --to 2025/12

# Everything from the beginning of the MTGO archive (very large job)
node downloadDecklists.js --from 2015/11
```

---

## Storage Structure

```
decklists/
└── {format}/
    └── {year}/
        └── {month}/
            └── {day}/
                └── {player}.txt
```

Example:

```
decklists/
├── Modern/2026/06/17/Boin.txt
├── Legacy/2026/06/17/maximusdee.txt
└── Standard/2026/06/18/...
```

### Format Folders

Events are automatically sorted into folders by format:

`Standard`, `Modern`, `Legacy`, `Vintage`, `Pauper`, `Pioneer`, `Premodern`, `Duel Commander`, `Contraption`

> Events that don't match a known format (e.g. `Limited RC`) get a folder named after the event itself.

### File Format

Each `.txt` file follows the same layout as the site's Download Decklist button — main deck, three blank lines, sideboard:

```
4 Aether Vial
1 Arid Mesa
...
4 Snow-Covered Plains


2 Containment Priest
1 Surgical Extraction
...
```

Cards are sorted alphabetically by name. Line endings are `CRLF`.

---

## How It Works

- **Deduplication (default):** Existing files are skipped. Running the script daily will only add new events, making it suitable for incremental collection. Use `--force` to overwrite.
- **Empty-month detection:** When MTGO has no data for a requested month, it silently falls back to the current month's data. The script validates that each event URL's date matches the requested year/month and skips any that don't, preventing duplicate data from being saved.
- **Retry:** If an event page fails to load, the script retries once automatically. Persistent failures are logged as `FAILED (timeout)` and skipped. Re-running the same command will fill in the gaps without re-downloading already-saved files.

### Sample Output

```
Range: 2025/01 ~ 2025/12  [skip existing]

Loading 2025/01 ... 386 events (cumulative 386)
Loading 2025/02 ... 320 events (cumulative 706)
...

Processing: Legacy Challenge 32 ... OK — 32 saved → decklists/Legacy/2025/01/05
Processing: Modern League ... OK — 3 saved, 11 skipped → decklists/Modern/2025/01/05
Processing: Standard League ... SKIPPED (no decklists)
...

────────────────────────────────────────────────────────────
Done. 1234 files saved, 5678 skipped, 5 events failed.
Output: /Workspace/MtgCardsStatics/decklists
```

---

## Data Availability

The MTGO official archive goes back to **November 2015**. Months before that have no data and are automatically skipped.

> ⚠️ Downloading the full archive (`--from 2015/11`) covers roughly ten years of data and may take several hours. If interrupted, re-running the command will resume without re-downloading existing files.

---

## Notes

- The script uses a single headless Chromium instance and processes events **sequentially**. Do not run multiple instances against the same output folder.
- Network issues may cause some events to time out; re-running will fill those in.
