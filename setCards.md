# setCards.js

Cross-references a Scryfall `default-cards` JSON with saved decklists to produce a list of **cards from a given set that are actually played in a given format**.

- Basic land cards are excluded from results.
- When a card appears multiple times in the same set (alternate art, etc.), the entry with the lowest collector number is used.
- The JSON (typically ~550 MB) is processed via line streaming, so memory usage stays low.

Requires decklists downloaded with `downloadDecklists.js` and a `default-cards` JSON from Scryfall.

> Scryfall Bulk Data: https://scryfall.com/docs/api/bulk-data

Place the `default-cards-*.json` file in the same folder as the script — it will be picked up automatically. If multiple files are present, the one with the latest filename is used. You can also specify a path explicitly with `--cards-json`.

---

## Usage

```bash
node setCards.js [options]
```

| Option | Description |
| --- | --- |
| `--set <code>` | Set code (e.g. `dsk`, `mh3`, `blb`) — case-insensitive |
| `--format <name>` | Format name (e.g. `Modern`, `Legacy`) |
| `--from YYYY/MM` | Start month for decklist aggregation |
| `--to YYYY/MM` | End month for decklist aggregation |
| `--top <N>` | Show only the first N cards (by collector number) |
| `--main-only` | Count main deck copies only |
| `--side-only` | Count sideboard copies only |
| `--output <file>` | Save results to a `.json` or `.csv` file |
| `--cards-json <path>` | Path to the `default-cards` JSON file |
| `--list-sets` | Print all set codes and names found in the JSON |

`--set` and `--format` are required (except when using `--list-sets`).

### Examples

```bash
# Cards from DSK played in Modern
node setCards.js --set dsk --format Modern

# MH3 cards in Legacy, using decklists from June 2026 onward
node setCards.js --set mh3 --format Legacy --from 2026/06

# Main deck only, save to CSV
node setCards.js --set dsk --format Modern --main-only --output dsk_modern.csv

# List available set codes
node setCards.js --list-sets
```

---

## Output

### Terminal

Results are sorted by collector number ascending:

```
════════════════════════════════════════════════════════════════════════════════════
  Set   : DSK — Duskmourn: House of Horror
  Format: Modern  (2587 decks)
  Cards : 23 unique cards from this set
────────────────────────────────────────────────────────────────────────────────────
     #  R  Card Name                               Decks  Copies   Avg
────────────────────────────────────────────────────────────────────────────────────
    42  M  Abhorrent Oculus                          142     467  3.29
   106  R  Leyline of the Void                        95     306  3.22
   ...
════════════════════════════════════════════════════════════════════════════════════
```

| Column | Description |
| --- | --- |
| # | Collector number within the set |
| R | Rarity — `C` Common / `U` Uncommon / `R` Rare / `M` Mythic |
| Card Name | Card name |
| Decks | Number of decks containing this card |
| Copies | Total copies across all decks |
| Avg | Average copies per deck |

### File Output

Use `--output` to save results to a file. The format is determined by the file extension.

- `.json` — set/format metadata and a `cards` array
- `.csv` — columns: `set,set_name,format,collector_number,card_name,rarity,type_line,mana_cost,deck_count,total_copies,avg_copies`
