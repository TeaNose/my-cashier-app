# Import Products from CSV

**Date:** 2026-06-02
**Target platform:** Android + iOS (same as existing export)

## Goal

Let the user import products from a CSV file so a product catalog can be carried to a
new/replacement device. Importing both **adds** new products and **overwrites** existing
ones, complementing the existing CSV export. The primary scenario is restoring a catalog
onto a fresh install where the product list is empty.

## Constraints & context

- Builds on the existing export feature (`services/export.ts`, `db/products.ts:buildProductsCsv`).
- The export CSV has **no `id` column** and the `products` table has **no unique
  constraint** on `sku`/`barcode`, so matching for overwrite is by business fields, not row id.
- Export CSV layout: a UTF-8 BOM, a shop-name row, a title row, a blank row, the header
  row, then one row per product, with columns: Name, SKU, Barcode, Category, Unit,
  Buy Price, Sell Price, Stock, Min Stock, Status. Numbers are written raw (e.g. `15000`),
  not currency-formatted.
- App is Expo SDK 54 with `expo-file-system` and `expo-sharing` already present. No
  document picker yet.
- Indonesian + English locales via `i18n/translations.ts`. Existing exports may be in
  either language, so column headers and the Status value can be in either language.

## Decisions (from brainstorming)

- **Match key:** SKU first, then name. A row with a non-blank SKU matching an existing
  product (case-insensitive) updates it; if the SKU is blank or unmatched, fall back to a
  case-insensitive name match; if still no match, insert a new product.
- **Accepted format:** the exact file the export produces (same-as-export round trip).
- **Invalid rows:** skip and report — import every valid row, count and skip the rest,
  then show a summary.

## Non-goals (out of scope)

- Importing transactions / history (export of those exists; import does not).
- Merging stock quantities (overwrite replaces the value; it does not add to it).
- Conflict resolution UI / per-row review or diff preview.
- Deleting products absent from the CSV (import never deletes).
- Dedup of pre-existing duplicate products in the database.
- A separate "barcode" match key.

## New dependency

`expo-document-picker` — to let the user pick a `.csv` file from device storage / Files /
Drive. Installed via `npx expo install expo-document-picker` so the version matches SDK 54.

## Architecture

### `db/products.ts` — parsing + upsert (mirrors `buildProductsCsv`)

**`parseProductsCsv(text: string): { rows: ParsedProductRow[]; skipped: number }`**

- A small CSV tokenizer that handles quoted fields, escaped `""`, commas inside quotes,
  and `\r\n` / `\n` line endings. Leading UTF-8 BOM stripped.
- **Header detection by label, not position.** Normalize each cell (trim + lowercase) and
  look it up in a label→field map that recognizes both locales:
  - `nama` / `name` → `name`
  - `sku` → `sku`
  - `barcode` → `barcode`
  - `kategori` / `category` → `category`
  - `satuan` / `unit` → `unit`
  - `harga beli per satuan` / `buy price per unit` → `buy_price`
  - `harga jual per satuan` / `sell price per unit` → `sell_price`
  - `stok` / `stock` → `stock_qty`
  - `stok minimum` / `min stock` → `min_stock_alert`
  - `status` → `status`
  The header row is the first row whose recognized columns include **both** `name` and
  `sell_price`. Rows before it (shop name, title, blank) are ignored. This makes import
  locale-independent and tolerant of reordered/extra columns.
- For each data row after the header, build a record by reading cells at the mapped column
  indices. A row is **valid** iff `name` is non-empty and `sell_price` parses to a finite
  number `>= 0`. Invalid rows increment `skipped`.
- Field coercion:
  - `buy_price`, `stock_qty`, `min_stock_alert`: parse number, default `0` when
    blank/unparseable. Quantities rounded to integers.
  - `sku`, `barcode`, `unit`: trimmed string or `null` when blank.
  - `category`: trimmed string or `null` when blank (resolved to an id at import time).
  - `status` → `is_active`: `0` if the normalized value is `inactive` or `nonaktif`,
    else `1` (active is the default, including blank).

**`importProducts(rows: ParsedProductRow[]): Promise<{ added: number; updated: number }>`**

- Runs inside a single transaction (`db.withTransactionAsync`).
- Resolves each row's category name to a `category_id`: look up an existing category by
  lowercased name; create it (empty description) if absent; cache within the call so the
  same name isn't created twice.
- Match: if `sku` non-blank, `SELECT id FROM products WHERE LOWER(sku) = LOWER(?)` (first
  match); else/if no match, `SELECT id FROM products WHERE LOWER(name) = LOWER(?)`.
  - Match found → `UPDATE` all editable fields, increment `updated`.
  - No match → `INSERT`, increment `added`.

### `services/import.ts` — file picking + parsing (mirrors `export.ts`)

Because the screen must confirm with the user **before** mutating data, the work is split:
the service picks + reads + parses the file; the screen confirms; then the screen calls
`importProducts` (the db upsert) to apply.

**`pickAndParseProductsCsv(): Promise<{ rows: ParsedProductRow[]; skipped: number }>`**

- `DocumentPicker.getDocumentAsync({ type: 'text/csv' })` (with `'*/*'` fallback if the CSV
  MIME filter excludes valid files on some pickers).
- If cancelled → throw `ImportError('cancelled')`.
- Read the file contents (`new File(uri).text()` via `expo-file-system`).
- `parseProductsCsv` → if no header/data rows at all → `ImportError('empty')`; if rows is
  empty but something was skipped → `ImportError('no_valid_rows')`.
- Otherwise return `{ rows, skipped }`.
- `ImportError` codes: `cancelled`, `empty`, `no_valid_rows`, `failed`, mapped to i18n
  messages. `cancelled` is silent (no alert); any unexpected throw maps to `failed`.

### UI — `app/(tabs)/products.tsx`

- An **Import** icon button (`download`/`upload` FontAwesome) next to Export in the search row.
- Tap flow:
  1. `pickAndParseProductsCsv()` (service) → parsed `rows` + `skipped` count.
  2. Confirmation `Alert`: "Import N products? Existing products matching by SKU or name
     will be updated." Cancel / Import.
  3. On Import → `importProducts(rows)` → result `Alert`: "X added, Y updated, Z skipped."
  4. Reload the list.
- An `ActivityIndicator` while reading/applying; the button is disabled meanwhile.

### UI — `components/EmptyState.tsx`

- Add an **optional secondary action** (`secondaryLabel?`, `onSecondaryPress?`,
  `secondaryIcon?`) rendered as an outline/text button below the primary button. Used so
  **Import is reachable when the product list is empty** — the fresh-device migration case,
  which is the whole point of the feature.

### i18n — `i18n/translations.ts` (id + en)

New keys under a `products`/`import` grouping: import button label, picker/confirm title +
message, result summary (with `{added}`, `{updated}`, `{skipped}` params), and error
messages for `empty`, `no_valid_rows`, `failed`.

## Error handling

| Situation | Behavior |
|-----------|----------|
| User cancels picker | Silent, no alert |
| File unreadable / parse throws | `failed` alert |
| No header / no data rows at all | `empty` alert |
| Rows present but all invalid | `no_valid_rows` alert |
| Mixed valid/invalid | Import valid, report skipped count |
| Category name new | Auto-created |
| DB error mid-import | Transaction rolls back; `failed` alert |

## Testing

- Unit tests for `parseProductsCsv`: round-trip a `buildProductsCsv` output; quoted fields
  with commas/quotes/newlines; Indonesian vs English headers; reordered columns; missing
  name; non-numeric sell price; blank optional numerics; status active/inactive/blank in
  both languages; BOM handling.
- Unit tests for `importProducts` against an in-memory/temp DB: insert-new; update-by-SKU;
  update-by-name fallback; category auto-create + reuse; counts correct; rollback on error.
- Manual: export on device A, import on a fresh device B, verify catalog matches; re-import
  same file updates rather than duplicates.
</content>
