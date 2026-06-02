# Products CSV Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the user import a products CSV (the same file the export produces) to add new products and overwrite existing ones, for moving a catalog to a new device.

**Architecture:** Pure CSV logic (build + parse + match) lives in a new dependency-free module `services/products-csv.ts` so it is unit-testable without SQLite. The SQLite upsert lives in `db/products.ts`. A `services/import.ts` picks a file, reads it, and parses it; the Products screen confirms with the user, then applies the import in a single transaction.

**Tech Stack:** Expo SDK 54, expo-sqlite, expo-file-system (new `File` API), expo-document-picker (new), Jest + jest-expo, i18n (id/en), TypeScript.

---

## File structure

- `services/products-csv.ts` — **new, pure.** CSV tokenizer, `buildProductsCsv` (moved here), `parseProductsCsv`, `matchExistingId`, and the shared types. Imports only `@/i18n` and a type-only `Product` from `@/db/products` (erased at runtime, no cycle).
- `db/products.ts` — **modified.** Drop the moved `buildProductsCsv`/`csvField`/`ProductExportRow`; keep `getProductsForExport`; add `importProducts` (SQLite upsert).
- `services/export.ts` — **modified.** Import `buildProductsCsv` from the new module.
- `services/import.ts` — **new.** `ImportError`, `pickAndParseProductsCsv`.
- `i18n/translations.ts` — **modified.** New `import` group (id + en).
- `components/EmptyState.tsx` — **modified.** Optional secondary action.
- `app/(tabs)/products.tsx` — **modified.** Import button (search row + empty state), handlers, state.
- `__tests__/products-csv.test.ts` — **new.** Tests for `parseProductsCsv` and `matchExistingId`.

---

## Task 1: Add the document picker dependency

**Files:**
- Modify: `package.json` (via expo install)

- [ ] **Step 1: Install expo-document-picker**

Run: `npx expo install expo-document-picker`
Expected: `package.json` gains `expo-document-picker` at an SDK-54-compatible version; install completes without peer-dependency errors.

- [ ] **Step 2: Verify it resolves**

Run: `npx tsc --noEmit`
Expected: no errors (no usage yet; this just confirms the install didn't break types).

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add expo-document-picker for CSV import"
```

---

## Task 2: Extract pure CSV module (no behavior change)

Move the export-side CSV helpers into a dependency-free module so parsing can be unit-tested. This is a pure refactor — the exported CSV output must be byte-identical.

**Files:**
- Create: `services/products-csv.ts`
- Modify: `db/products.ts` (remove moved code; keep `getProductsForExport`)
- Modify: `services/export.ts` (update import)

- [ ] **Step 1: Create `services/products-csv.ts`**

```typescript
import { t } from '@/i18n';
import type { Product } from '@/db/products';

// A product row enriched with its (joined) category name, used for export.
export type ProductExportRow = Product & { category_name: string | null };

// A validated row parsed from an imported CSV, ready to upsert.
export type ParsedProductRow = {
  name: string;
  sku: string | null;
  barcode: string | null;
  category: string | null;
  unit: string | null;
  buy_price: number;
  sell_price: number;
  stock_qty: number;
  min_stock_alert: number;
  is_active: number;
};

// Minimal shape needed to match an imported row against the existing catalog.
export type ExistingProduct = { id: number; sku: string | null; name: string };

function csvField(value: string | number): string {
  const s = String(value);
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export function buildProductsCsv(products: ProductExportRow[], shopName: string): string {
  const rows: string[] = [];
  rows.push(csvField(shopName || t('export.untitled_shop')));
  rows.push(csvField(t('export.products_title')));
  rows.push('');
  rows.push(
    [
      t('export.col_name'),
      t('export.col_sku'),
      t('export.col_barcode'),
      t('export.col_category'),
      t('export.col_unit'),
      t('export.col_buy_price'),
      t('export.col_sell_price'),
      t('export.col_stock'),
      t('export.col_min_stock'),
      t('export.col_status'),
    ]
      .map(csvField)
      .join(','),
  );

  for (const p of products) {
    rows.push(
      [
        p.name,
        p.sku ?? '',
        p.barcode ?? '',
        p.category_name ?? '',
        p.unit ?? '',
        p.buy_price,
        p.sell_price,
        p.stock_qty,
        p.min_stock_alert,
        p.is_active === 1 ? t('export.status_active') : t('export.status_inactive'),
      ]
        .map(csvField)
        .join(','),
    );
  }

  // Prepend a UTF-8 BOM so Excel reads non-ASCII text correctly.
  return '﻿' + rows.join('\r\n') + '\r\n';
}
```

- [ ] **Step 2: Remove the moved code from `db/products.ts`**

Delete the `ProductExportRow` type, `csvField`, and `buildProductsCsv` from `db/products.ts`. Replace the `getProductsForExport` definition + the (now-deleted) helpers block with:

```typescript
import type { ProductExportRow } from '@/services/products-csv';

export async function getProductsForExport(): Promise<ProductExportRow[]> {
  const db = await getDatabase();
  return db.getAllAsync<ProductExportRow>(
    `SELECT p.*, c.name AS category_name
     FROM products p
     LEFT JOIN categories c ON c.id = p.category_id
     ORDER BY p.name ASC`,
  );
}
```

Keep the existing `import { t } from '@/i18n';` line only if it is still referenced elsewhere in the file; after this move `t` is no longer used in `db/products.ts`, so **remove that import** to avoid an unused-import error.

- [ ] **Step 3: Update `services/export.ts` import**

Change:

```typescript
import { buildProductsCsv, getProductsForExport } from '@/db/products';
```

to:

```typescript
import { getProductsForExport } from '@/db/products';
import { buildProductsCsv } from '@/services/products-csv';
```

- [ ] **Step 4: Verify types and existing tests**

Run: `npx tsc --noEmit && npm test`
Expected: tsc clean; jest passes (existing `receipt.test.ts` green, no new failures).

- [ ] **Step 5: Commit**

```bash
git add services/products-csv.ts db/products.ts services/export.ts
git commit -m "refactor: extract pure products-csv module"
```

---

## Task 3: Parse CSV — `parseProductsCsv` (TDD)

**Files:**
- Test: `__tests__/products-csv.test.ts`
- Modify: `services/products-csv.ts`

- [ ] **Step 1: Write the failing tests**

Create `__tests__/products-csv.test.ts`:

```typescript
import {
  parseProductsCsv,
  buildProductsCsv,
  matchExistingId,
  type ProductExportRow,
} from '@/services/products-csv';

const makeRow = (over: Partial<ProductExportRow>): ProductExportRow => ({
  id: 1,
  name: 'Item',
  sku: null,
  barcode: null,
  category_id: null,
  category_name: null,
  unit: null,
  buy_price: 0,
  sell_price: 1000,
  stock_qty: 0,
  min_stock_alert: 0,
  is_active: 1,
  created_at: '',
  updated_at: '',
  ...over,
});

describe('parseProductsCsv', () => {
  it('round-trips a buildProductsCsv export', () => {
    const csv = buildProductsCsv(
      [
        makeRow({ name: 'Kopi', sku: 'K1', sell_price: 15000, buy_price: 9000, stock_qty: 5, category_name: 'minuman' }),
        makeRow({ name: 'Teh', sku: 'T1', sell_price: 8000, is_active: 0 }),
      ],
      'Warung Kita',
    );
    const { rows, skipped } = parseProductsCsv(csv);
    expect(skipped).toBe(0);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ name: 'Kopi', sku: 'K1', sell_price: 15000, buy_price: 9000, stock_qty: 5, category: 'minuman', is_active: 1 });
    expect(rows[1]).toMatchObject({ name: 'Teh', sku: 'T1', sell_price: 8000, is_active: 0 });
  });

  it('strips a UTF-8 BOM and ignores the shop/title/blank preamble', () => {
    const csv = '﻿Warung\r\nDaftar Produk\r\n\r\nNama,SKU,Harga Jual per Satuan\r\nKopi,K1,15000\r\n';
    const { rows } = parseProductsCsv(csv);
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe('Kopi');
  });

  it('accepts English headers', () => {
    const csv = 'Name,SKU,Sell Price per Unit,Status\r\nMilk,M1,5000,Inactive\r\n';
    const { rows } = parseProductsCsv(csv);
    expect(rows[0]).toMatchObject({ name: 'Milk', sku: 'M1', sell_price: 5000, is_active: 0 });
  });

  it('matches columns by header regardless of order', () => {
    const csv = 'Harga Jual per Satuan,Nama,Stok\r\n15000,Kopi,7\r\n';
    const { rows } = parseProductsCsv(csv);
    expect(rows[0]).toMatchObject({ name: 'Kopi', sell_price: 15000, stock_qty: 7 });
  });

  it('handles quoted fields with commas, quotes, and newlines', () => {
    const csv = 'Nama,Harga Jual per Satuan,Catatan\r\n"Kopi, Susu",15000,"He said ""hi"""\r\n';
    const { rows } = parseProductsCsv(csv);
    expect(rows[0].name).toBe('Kopi, Susu');
  });

  it('skips rows with a missing name or non-numeric sell price', () => {
    const csv = 'Nama,Harga Jual per Satuan\r\n,15000\r\nKopi,abc\r\nTeh,8000\r\n';
    const { rows, skipped } = parseProductsCsv(csv);
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe('Teh');
    expect(skipped).toBe(2);
  });

  it('defaults blank optional numerics to 0 and blank status to active', () => {
    const csv = 'Nama,Harga Jual per Satuan,Harga Beli per Satuan,Stok,Status\r\nKopi,15000,,,\r\n';
    const { rows } = parseProductsCsv(csv);
    expect(rows[0]).toMatchObject({ buy_price: 0, stock_qty: 0, is_active: 1 });
  });

  it('returns no rows when there is no recognizable header', () => {
    const { rows, skipped } = parseProductsCsv('foo,bar\r\n1,2\r\n');
    expect(rows).toHaveLength(0);
    expect(skipped).toBe(0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- products-csv`
Expected: FAIL — `parseProductsCsv`/`matchExistingId` are not exported yet (TypeError / undefined).

- [ ] **Step 3: Implement `parseProductsCsv` in `services/products-csv.ts`**

Add to `services/products-csv.ts`:

```typescript
type Field =
  | 'name'
  | 'sku'
  | 'barcode'
  | 'category'
  | 'unit'
  | 'buy_price'
  | 'sell_price'
  | 'stock_qty'
  | 'min_stock_alert'
  | 'status';

// Recognize both Indonesian and English export headers (normalized lowercase).
const HEADER_FIELDS: Record<string, Field> = {
  nama: 'name',
  name: 'name',
  sku: 'sku',
  barcode: 'barcode',
  kategori: 'category',
  category: 'category',
  satuan: 'unit',
  unit: 'unit',
  'harga beli per satuan': 'buy_price',
  'buy price per unit': 'buy_price',
  'harga jual per satuan': 'sell_price',
  'sell price per unit': 'sell_price',
  stok: 'stock_qty',
  stock: 'stock_qty',
  'stok minimum': 'min_stock_alert',
  'min stock': 'min_stock_alert',
  status: 'status',
};

// Split raw CSV text into rows of string cells. Handles quoted fields,
// escaped "" quotes, embedded commas/newlines, and \r\n or \n endings.
function tokenizeCsv(text: string): string[][] {
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1); // strip BOM
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      field += ch;
      i++;
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      i++;
      continue;
    }
    if (ch === ',') {
      row.push(field);
      field = '';
      i++;
      continue;
    }
    if (ch === '\r') {
      i++;
      continue;
    }
    if (ch === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
      i++;
      continue;
    }
    field += ch;
    i++;
  }
  row.push(field);
  rows.push(row);
  // Drop rows that are entirely empty (blank separator line, trailing newline).
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

function parseNumber(s: string): number | null {
  const trimmed = s.trim();
  if (trimmed === '') return null;
  const cleaned = trimmed.replace(/[^0-9.\-]/g, '');
  if (cleaned === '' || cleaned === '-' || cleaned === '.') return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

// Map a header row's cells to column indices. Returns null unless both the
// required columns (name + sell_price) are present.
function buildColumnMap(cells: string[]): Partial<Record<Field, number>> | null {
  const map: Partial<Record<Field, number>> = {};
  cells.forEach((cell, idx) => {
    const field = HEADER_FIELDS[cell.trim().toLowerCase()];
    if (field && map[field] === undefined) map[field] = idx;
  });
  if (map.name === undefined || map.sell_price === undefined) return null;
  return map;
}

export function parseProductsCsv(text: string): { rows: ParsedProductRow[]; skipped: number } {
  const allRows = tokenizeCsv(text);

  let headerIdx = -1;
  let colMap: Partial<Record<Field, number>> | null = null;
  for (let i = 0; i < allRows.length; i++) {
    const m = buildColumnMap(allRows[i]);
    if (m) {
      headerIdx = i;
      colMap = m;
      break;
    }
  }
  if (!colMap) return { rows: [], skipped: 0 };

  const rows: ParsedProductRow[] = [];
  let skipped = 0;
  for (let i = headerIdx + 1; i < allRows.length; i++) {
    const cells = allRows[i];
    const get = (f: Field) => {
      const idx = colMap![f];
      return idx === undefined ? '' : (cells[idx] ?? '').trim();
    };

    const name = get('name');
    const sell = parseNumber(get('sell_price'));
    if (!name || sell === null || sell < 0) {
      skipped++;
      continue;
    }

    const status = get('status').toLowerCase();
    rows.push({
      name,
      sku: get('sku') || null,
      barcode: get('barcode') || null,
      category: get('category') || null,
      unit: get('unit') || null,
      buy_price: parseNumber(get('buy_price')) ?? 0,
      sell_price: sell,
      stock_qty: Math.round(parseNumber(get('stock_qty')) ?? 0),
      min_stock_alert: Math.round(parseNumber(get('min_stock_alert')) ?? 0),
      is_active: status === 'inactive' || status === 'nonaktif' ? 0 : 1,
    });
  }

  return { rows, skipped };
}
```

- [ ] **Step 4: Run tests to verify the parse tests pass**

Run: `npm test -- products-csv`
Expected: the `parseProductsCsv` tests PASS. (`matchExistingId` tests still fail — added in Task 4.)

- [ ] **Step 5: Commit**

```bash
git add services/products-csv.ts __tests__/products-csv.test.ts
git commit -m "feat: parse products CSV (locale-independent, header-mapped)"
```

---

## Task 4: Match imported rows — `matchExistingId` (TDD)

**Files:**
- Modify: `__tests__/products-csv.test.ts`
- Modify: `services/products-csv.ts`

- [ ] **Step 1: Add failing tests**

Append to `__tests__/products-csv.test.ts`:

```typescript
describe('matchExistingId', () => {
  const existing = [
    { id: 10, sku: 'K1', name: 'Kopi' },
    { id: 20, sku: null, name: 'Teh Manis' },
  ];

  it('matches by SKU case-insensitively', () => {
    expect(matchExistingId({ sku: 'k1', name: 'Different' } as any, existing)).toBe(10);
  });

  it('falls back to name when SKU is blank', () => {
    expect(matchExistingId({ sku: null, name: 'teh manis' } as any, existing)).toBe(20);
  });

  it('falls back to name when the SKU does not match', () => {
    expect(matchExistingId({ sku: 'ZZZ', name: 'Kopi' } as any, existing)).toBe(10);
  });

  it('returns null when nothing matches', () => {
    expect(matchExistingId({ sku: 'X', name: 'Nasi' } as any, existing)).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test -- products-csv`
Expected: FAIL — `matchExistingId` is not defined.

- [ ] **Step 3: Implement `matchExistingId`**

Add to `services/products-csv.ts`:

```typescript
// Match an imported row to an existing product: by non-blank SKU first
// (case-insensitive), then by name (case-insensitive). Returns the matched
// product id, or null if the row should be inserted as new.
export function matchExistingId(row: ParsedProductRow, existing: ExistingProduct[]): number | null {
  if (row.sku) {
    const sku = row.sku.toLowerCase();
    const bySku = existing.find((p) => p.sku && p.sku.toLowerCase() === sku);
    if (bySku) return bySku.id;
  }
  const name = row.name.toLowerCase();
  const byName = existing.find((p) => p.name.toLowerCase() === name);
  return byName ? byName.id : null;
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npm test -- products-csv`
Expected: ALL products-csv tests PASS.

- [ ] **Step 5: Commit**

```bash
git add services/products-csv.ts __tests__/products-csv.test.ts
git commit -m "feat: match imported product rows by SKU then name"
```

---

## Task 5: Upsert into SQLite — `importProducts`

The matching and parsing logic is already covered by unit tests; this task wires them to the database. Verified by typecheck + manual run (the codebase does not unit-test SQLite code).

**Files:**
- Modify: `db/products.ts`

- [ ] **Step 1: Implement `importProducts`**

Add to `db/products.ts` (after `getProductsForExport`):

```typescript
import {
  matchExistingId,
  type ParsedProductRow,
  type ExistingProduct,
} from '@/services/products-csv';

// Add new products and overwrite existing ones (matched by SKU then name).
// Categories referenced by name are created on demand. Runs in one transaction.
export async function importProducts(
  rows: ParsedProductRow[],
): Promise<{ added: number; updated: number }> {
  const db = await getDatabase();
  let added = 0;
  let updated = 0;

  const existing = await db.getAllAsync<ExistingProduct>('SELECT id, sku, name FROM products');
  const categories = await db.getAllAsync<{ id: number; name: string }>(
    'SELECT id, name FROM categories',
  );
  // Categories are stored lowercased; key the cache by lowercased name.
  const catByName = new Map(categories.map((c) => [c.name.toLowerCase(), c.id]));

  await db.withTransactionAsync(async () => {
    for (const row of rows) {
      let categoryId: number | null = null;
      if (row.category) {
        const key = row.category.trim().toLowerCase();
        if (key) {
          const cached = catByName.get(key);
          if (cached !== undefined) {
            categoryId = cached;
          } else {
            const res = await db.runAsync(
              'INSERT INTO categories (name, description) VALUES (?, ?)',
              key,
              '',
            );
            categoryId = res.lastInsertRowId;
            catByName.set(key, categoryId);
          }
        }
      }

      const matchId = matchExistingId(row, existing);
      if (matchId !== null) {
        await db.runAsync(
          `UPDATE products SET name = ?, sku = ?, barcode = ?, category_id = ?, unit = ?, buy_price = ?, sell_price = ?, stock_qty = ?, min_stock_alert = ?, is_active = ?, updated_at = datetime('now')
           WHERE id = ?`,
          row.name,
          row.sku,
          row.barcode,
          categoryId,
          row.unit,
          row.buy_price,
          row.sell_price,
          row.stock_qty,
          row.min_stock_alert,
          row.is_active,
          matchId,
        );
        updated++;
      } else {
        const res = await db.runAsync(
          `INSERT INTO products (name, sku, barcode, category_id, unit, buy_price, sell_price, stock_qty, min_stock_alert, is_active)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          row.name,
          row.sku,
          row.barcode,
          categoryId,
          row.unit,
          row.buy_price,
          row.sell_price,
          row.stock_qty,
          row.min_stock_alert,
          row.is_active,
        );
        // Track the insert so a later row with the same SKU/name updates it
        // instead of inserting a duplicate from the same file.
        existing.push({ id: res.lastInsertRowId, sku: row.sku, name: row.name });
        added++;
      }
    }
  });

  return { added, updated };
}
```

- [ ] **Step 2: Verify types**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add db/products.ts
git commit -m "feat: importProducts upsert with category auto-create"
```

---

## Task 6: File picking + parse orchestration — `services/import.ts`

**Files:**
- Create: `services/import.ts`

- [ ] **Step 1: Create `services/import.ts`**

```typescript
import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';

import { parseProductsCsv, type ParsedProductRow } from '@/services/products-csv';

export class ImportError extends Error {
  code: 'cancelled' | 'empty' | 'no_valid_rows' | 'failed';
  constructor(code: 'cancelled' | 'empty' | 'no_valid_rows' | 'failed') {
    super(code);
    this.name = 'ImportError';
    this.code = code;
  }
}

// Let the user pick a CSV file, read it, and parse it. Does NOT touch the
// database — the caller confirms with the user, then applies importProducts.
export async function pickAndParseProductsCsv(): Promise<{
  rows: ParsedProductRow[];
  skipped: number;
}> {
  let result: DocumentPicker.DocumentPickerResult;
  try {
    result = await DocumentPicker.getDocumentAsync({
      // Some Android file providers mistype CSVs; '*/*' keeps them selectable.
      type: ['text/csv', 'text/comma-separated-values', 'application/csv', '*/*'],
      copyToCacheDirectory: true,
    });
  } catch {
    throw new ImportError('failed');
  }

  if (result.canceled || !result.assets || result.assets.length === 0) {
    throw new ImportError('cancelled');
  }

  let text: string;
  try {
    const file = new File(result.assets[0].uri);
    text = await file.text();
  } catch {
    throw new ImportError('failed');
  }

  const { rows, skipped } = parseProductsCsv(text);
  if (rows.length === 0 && skipped === 0) throw new ImportError('empty');
  if (rows.length === 0) throw new ImportError('no_valid_rows');
  return { rows, skipped };
}
```

- [ ] **Step 2: Verify types**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add services/import.ts
git commit -m "feat: pick and parse products CSV file"
```

---

## Task 7: i18n keys

**Files:**
- Modify: `i18n/translations.ts`

- [ ] **Step 1: Add the `import` group to the `id` locale**

In `i18n/translations.ts`, immediately after the `id` locale's `export: { ... }` block's closing `},` (the one before the `en:` locale begins), add:

```typescript
    import: {
      button: 'Impor',
      confirm_title: 'Impor Produk',
      confirm_message:
        'Impor {count} produk? Produk yang cocok berdasarkan SKU atau nama akan diperbarui.',
      confirm_action: 'Impor',
      result_title: 'Impor Selesai',
      result_message: '{added} ditambahkan, {updated} diperbarui, {skipped} dilewati.',
      empty: 'File tidak berisi produk.',
      no_valid_rows: 'Tidak ada baris produk yang valid untuk diimpor.',
      failed: 'Gagal mengimpor file.',
    },
```

- [ ] **Step 2: Add the `import` group to the `en` locale**

After the `en` locale's `export: { ... }` block's closing `},` (before the final `},` that closes `en`), add:

```typescript
    import: {
      button: 'Import',
      confirm_title: 'Import Products',
      confirm_message:
        'Import {count} products? Products matching by SKU or name will be updated.',
      confirm_action: 'Import',
      result_title: 'Import Complete',
      result_message: '{added} added, {updated} updated, {skipped} skipped.',
      empty: 'The file contains no products.',
      no_valid_rows: 'No valid product rows to import.',
      failed: 'Failed to import the file.',
    },
```

- [ ] **Step 3: Verify types**

Run: `npx tsc --noEmit`
Expected: no errors (translation keys resolve via the `DotPaths` type).

- [ ] **Step 4: Commit**

```bash
git add i18n/translations.ts
git commit -m "i18n: add product import strings (id + en)"
```

---

## Task 8: EmptyState secondary action

So Import is reachable on a fresh device where the product list is empty.

**Files:**
- Modify: `components/EmptyState.tsx`

- [ ] **Step 1: Add optional secondary-action props and render**

Replace the contents of `components/EmptyState.tsx` with:

```typescript
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { StyleSheet, TouchableOpacity, Text as RNText } from 'react-native';

import { Text, View } from '@/components/Themed';
import { useTheme } from '@/hooks/useTheme';

type Props = {
  icon: React.ComponentProps<typeof FontAwesome>['name'];
  title: string;
  subtitle: string;
  buttonLabel: string;
  onPress: () => void;
  secondaryLabel?: string;
  secondaryIcon?: React.ComponentProps<typeof FontAwesome>['name'];
  onSecondaryPress?: () => void;
};

export function EmptyState({
  icon,
  title,
  subtitle,
  buttonLabel,
  onPress,
  secondaryLabel,
  secondaryIcon,
  onSecondaryPress,
}: Props) {
  const { tint } = useTheme();

  return (
    <View style={styles.container}>
      <FontAwesome name={icon} size={48} color={tint} style={styles.icon} />
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.subtitle}>{subtitle}</Text>

      <TouchableOpacity
        activeOpacity={0.7}
        style={[styles.button, { backgroundColor: tint }]}
        onPress={onPress}
      >
        <FontAwesome name="plus" size={16} color="#fff" />
        <RNText style={styles.buttonText}>{buttonLabel}</RNText>
      </TouchableOpacity>

      {secondaryLabel && onSecondaryPress ? (
        <TouchableOpacity
          activeOpacity={0.7}
          style={[styles.secondaryButton, { borderColor: tint }]}
          onPress={onSecondaryPress}
        >
          {secondaryIcon ? <FontAwesome name={secondaryIcon} size={16} color={tint} /> : null}
          <RNText style={[styles.secondaryButtonText, { color: tint }]}>{secondaryLabel}</RNText>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  icon: {
    marginBottom: 16,
  },
  title: {
    fontSize: 22,
    fontWeight: 'bold',
  },
  subtitle: {
    fontSize: 14,
    opacity: 0.6,
    marginTop: 8,
    marginBottom: 28,
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 10,
    paddingVertical: 14,
    paddingHorizontal: 24,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  secondaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 10,
    borderWidth: 1,
    paddingVertical: 12,
    paddingHorizontal: 24,
    marginTop: 12,
  },
  secondaryButtonText: {
    fontSize: 16,
    fontWeight: '700',
  },
});
```

- [ ] **Step 2: Verify types**

Run: `npx tsc --noEmit`
Expected: no errors (existing `EmptyState` callers omit the new optional props).

- [ ] **Step 3: Commit**

```bash
git add components/EmptyState.tsx
git commit -m "feat: optional secondary action on EmptyState"
```

---

## Task 9: Wire import into the Products screen

**Files:**
- Modify: `app/(tabs)/products.tsx`

- [ ] **Step 1: Update imports**

In `app/(tabs)/products.tsx`, change the products-db import line and add the import-service line. The current line:

```typescript
import { getProducts, deleteProduct, type Product } from '@/db/products';
import { exportProductsCsv, ExportError, type ExportMode } from '@/services/export';
```

becomes:

```typescript
import { getProducts, deleteProduct, importProducts, type Product } from '@/db/products';
import { exportProductsCsv, ExportError, type ExportMode } from '@/services/export';
import { pickAndParseProductsCsv, ImportError } from '@/services/import';
import { type ParsedProductRow } from '@/services/products-csv';
```

- [ ] **Step 2: Add import state**

After the existing `const [exporting, setExporting] = useState(false);`, add:

```typescript
  const [importing, setImporting] = useState(false);
```

- [ ] **Step 3: Add import handlers**

Immediately after the existing `handleExport` function, add:

```typescript
  const applyImport = async (rows: ParsedProductRow[], skipped: number) => {
    setImporting(true);
    try {
      const { added, updated } = await importProducts(rows);
      loadProducts();
      Alert.alert(
        t('import.result_title'),
        t('import.result_message', { added, updated, skipped }),
      );
    } catch {
      Alert.alert(t('common.error'), t('import.failed'));
    } finally {
      setImporting(false);
    }
  };

  const handleImport = async () => {
    if (importing || exporting) return;
    setImporting(true);
    let parsed: { rows: ParsedProductRow[]; skipped: number };
    try {
      parsed = await pickAndParseProductsCsv();
    } catch (e) {
      if (!(e instanceof ImportError) || e.code !== 'cancelled') {
        const code = e instanceof ImportError ? e.code : 'failed';
        Alert.alert(t('common.error'), t(`import.${code}` as any));
      }
      return;
    } finally {
      setImporting(false);
    }
    Alert.alert(t('import.confirm_title'), t('import.confirm_message', { count: parsed.rows.length }), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('import.confirm_action'), onPress: () => applyImport(parsed.rows, parsed.skipped) },
    ]);
  };
```

- [ ] **Step 4: Add Import to the empty state**

Replace the early-return `EmptyState` block:

```typescript
  if (products.length === 0) {
    return (
      <EmptyState
        icon="cube"
        title={t('products.title')}
        subtitle={t('products.empty_subtitle')}
        buttonLabel={t('products.add_button')}
        onPress={() => router.push('/add-product')}
      />
    );
  }
```

with:

```typescript
  if (products.length === 0) {
    return (
      <EmptyState
        icon="cube"
        title={t('products.title')}
        subtitle={t('products.empty_subtitle')}
        buttonLabel={t('products.add_button')}
        onPress={() => router.push('/add-product')}
        secondaryLabel={t('import.button')}
        secondaryIcon="upload"
        onSecondaryPress={handleImport}
      />
    );
  }
```

- [ ] **Step 5: Add the Import button to the search row**

In the search row, the export button currently follows the search box. Add an import button **before** the export `TouchableOpacity` (so order is search box, Import, Export):

```typescript
        <TouchableOpacity
          style={[styles.exportBtn, { borderColor: inputBorder }]}
          activeOpacity={0.7}
          onPress={handleImport}
          disabled={importing || exporting}
          accessibilityLabel={t('import.button')}
        >
          {importing ? (
            <ActivityIndicator size="small" color={tint} />
          ) : (
            <FontAwesome name="upload" size={18} color={tint} />
          )}
        </TouchableOpacity>
```

- [ ] **Step 6: Verify types**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add app/(tabs)/products.tsx
git commit -m "feat: import products CSV from products screen + empty state"
```

---

## Task 10: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Typecheck + tests**

Run: `npx tsc --noEmit && npm test`
Expected: tsc clean; all jest tests pass.

- [ ] **Step 2: Manual device/emulator checklist**

Build/run the dev client (`npx expo run:android`) and verify:
- With products present: tap Import in the search row → pick a CSV exported earlier → confirm dialog shows the right count → result shows added/updated/skipped → list refreshes.
- Re-import the same file → all rows report as **updated**, none added (no duplicates).
- Fresh state (delete all products): empty state shows an **Import** button → import restores the catalog.
- Pick a non-CSV / garbage file → `empty` or `no_valid_rows` error alert, nothing imported.
- Cancel the picker → no alert, no change.
- Category names in the CSV that didn't exist before are created and shown on the products.

- [ ] **Step 3: Final commit (if any manual fixes were needed)**

```bash
git add -A
git commit -m "fix: products CSV import follow-ups"
```

(Skip if no changes were required.)
