# analyzeCards.js

Reads saved decklists and aggregates card usage statistics by format. Uses only Node.js built-in modules — no additional dependencies required.

Requires decklists to be downloaded first with `downloadDecklists.js`.

---

## Usage

```bash
node analyzeCards.js [options]
```

| Option | Description |
| --- | --- |
| `--format <name>` | Aggregate a specific format only (e.g. `Modern`, `Legacy`, `Duel Commander`) |
| `--from YYYY/MM` | Start month for aggregation |
| `--to YYYY/MM` | End month for aggregation |
| `--top <N>` | Show only the top N cards |
| `--main-only` | Count main deck copies only |
| `--side-only` | Count sideboard copies only |
| `--output <file>` | Save results to a `.json` or `.csv` file |

### Examples

```bash
# All formats, all time
node analyzeCards.js

# Modern, June 2026, top 20 cards
node analyzeCards.js --format Modern --from 2026/06 --top 20

# Legacy main deck only, first half of 2026
node analyzeCards.js --format Legacy --main-only --from 2026/01 --to 2026/06

# Save results to CSV
node analyzeCards.js --format Pauper --output pauper.csv
```

---

## Output

### Terminal

Results are printed as a table, one section per format:

```
════════════════════════════════════════════════════════════════════════
  Format: Modern  (2385 decks, 1499 unique cards)
────────────────────────────────────────────────────────────────────────
  Card Name                               Decks  Copies   Avg
────────────────────────────────────────────────────────────────────────
  Vexing Bauble                            1007    1986  1.97
  Consign to Memory                         970    3324  3.43
  ...
════════════════════════════════════════════════════════════════════════
```

| Column | Description |
| --- | --- |
| Card Name | Card name |
| Decks | Number of decks containing this card |
| Copies | Total copies across all decks |
| Avg | Average copies per deck |

Sorted by Decks descending, then Copies descending.

### File Output

Use `--output` to save results to a file. The format is determined by the file extension.

- `.json` — one object per format, each containing a `cards` array
- `.csv` — columns: `format,card_name,deck_count,total_copies,avg_copies`
