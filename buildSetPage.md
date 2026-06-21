# buildSetPage.js

Generates an HTML page for a given Magic: The Gathering set showing which cards see play across competitive MTGO formats (Standard, Pioneer, Modern, Legacy, Vintage, Pauper).

Requires a [Scryfall bulk data](https://scryfall.com/docs/api/bulk-data) file (`default-cards-*.json`) in the project root and decklists downloaded with `downloadDecklists.js`.

Output is written to `pages/{set_code}.html`.

---

## Usage

```bash
node buildSetPage.js --set <code> [options]
```

| Option | Description |
| --- | --- |
| `--set <code>` | **(Required)** Scryfall set code (e.g. `dsk`, `mh3`) |
| `--from YYYY/MM` | Only count decklists from this month onward |
| `--to YYYY/MM` | Only count decklists up to and including this month |
| `--out <dir>` | Output directory (default: `pages/`) |
| `--cards-json <file>` | Explicit path to the Scryfall bulk JSON (auto-detected otherwise) |

### Examples

```bash
# Generate the DSK set page using all available decklists
node buildSetPage.js --set dsk

# Generate using only decklists from June 2026 onward
node buildSetPage.js --set mh3 --from 2026/06

# Write output to a custom directory
node buildSetPage.js --set dsk --out ./dist
```

---

## Output

The generated page (`pages/{set_code}.html`) contains:

- **Header** — set name, set code, card count with rarity breakdown (M / R / U / C), and date range of the decklist data used
- **Format totals** — deck counts per format (Standard, Pioneer, Modern, Legacy, Vintage, Pauper)
- **Card table** — one row per card, sortable by collector number, with columns for each format showing how many decks the card appeared in
  - Heat coloring: cells are highlighted in 4 intensity levels based on the card's usage relative to the most-played card in that format
  - Card image tooltip: hovering a card name shows its card image via the Scryfall CDN
- **Filter bar** — filter by rarity (Mythic / Rare / Uncommon / Common) or search by name

### Card selection rules

- Only cards whose collector number is the lowest among same-named printings in the set are included (avoids duplicate rows for cards with multiple art versions)
- Basic land type cards (`Plains`, `Island`, etc.) are excluded

---

## Data sources

| Source | Purpose |
| --- | --- |
| `decklists/` | MTGO event decklists (produced by `downloadDecklists.js`) |
| `default-cards-*.json` | Scryfall bulk card data (card names, collector numbers, rarities, image URLs) |
