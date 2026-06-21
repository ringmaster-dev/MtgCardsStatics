# buildIndex.js

Scans `pages/` for set HTML files produced by `buildSetPage.js` and generates a two-panel index page (`pages/index.html`).

The left sidebar lists sets grouped into **Standard** and **Other** sections, sorted newest-first within each section. Clicking a set loads its page in the right-hand iframe. The sidebar width is adjustable by dragging the divider.

---

## Usage

```bash
node buildIndex.js
```

No arguments. Run after generating set pages with `buildSetPage.js`.

---

## What it does

1. Scans `pages/` for `*.html` files (excluding `index.html` and `about.html`)
2. Fetches current Standard-legal set codes from [whatsinstandard.com](https://whatsinstandard.com/api/v6/standard.json)
   - Only sets that have already been released (`enterDate ≤ today`) and not yet rotated out (`exitDate` is null or in the future) are considered Standard-legal
3. Streams `default-cards-*.json` to read each set's name and release date
4. Filters out unreleased sets (sets where `released_at > today`) from both sections
5. Splits sets into **Standard** and **Other**, each sorted by release date descending
6. Writes `pages/index.html`

---

## Output

`pages/index.html` — a self-contained single-file page with:

- **Sidebar** — set list grouped by Standard / Other, with a search box to filter by code or name, and an About link at the bottom
- **Iframe** — displays the selected set page; opens to the most recent Standard set by default
- **Resizable divider** — drag the border between sidebar and iframe to resize; min/max width is calculated automatically from the shortest and longest set name

---

## Dependencies

| Source | Purpose |
| --- | --- |
| `pages/*.html` | Set pages produced by `buildSetPage.js` |
| `default-cards-*.json` | Scryfall bulk data — used to read set names and release dates |
| `whatsinstandard.com` API | Determines which sets are currently Standard-legal |
