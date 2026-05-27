# Bluetooth Thermal Printer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Print 58mm ESC/POS receipts to an iWare Bluetooth Classic thermal printer from the checkout success screen and the history detail view on Android.

**Architecture:** Four units with clear boundaries — `db/settings` (key/value SQLite persistence), `services/receipt` (pure block builder), `services/printer` (sole owner of the native module), and an Expo config plugin that injects Android Bluetooth permissions during prebuild. UI talks to those three modules; only `services/printer` knows the native library exists.

**Tech Stack:** Expo SDK 54 (managed → custom dev build), React Native 0.81, expo-router, expo-sqlite, TypeScript, Jest, `tp-react-native-bluetooth-printer` (Bluetooth Classic + ESC/POS).

**Spec:** [docs/superpowers/specs/2026-05-27-bluetooth-thermal-printer-design.md](../specs/2026-05-27-bluetooth-thermal-printer-design.md)

---

## Task 1: Set up Jest so the receipt builder can be TDD'd

The project already depends on `react-test-renderer` but has no `test` script, no Jest config, and no Jest dependency. We need a runnable `npm test` before we can write the receipt builder under TDD.

**Files:**
- Modify: `package.json` (add `test` script, add `jest`, `jest-expo`, `@types/jest` devDependencies)
- Create: `jest.config.js`

- [ ] **Step 1: Install Jest with the Expo preset**

```bash
npm install --save-dev jest@^29 jest-expo@~54.0.0 @types/jest@^29
```

Expected: installs cleanly. The `jest-expo` major must match the Expo SDK major (54).

- [ ] **Step 2: Add the `test` script to `package.json`**

In `package.json` `scripts`, add:

```json
"test": "jest"
```

So the full `scripts` block becomes:

```json
"scripts": {
  "start": "expo start",
  "android": "expo run:android",
  "ios": "expo run:ios",
  "web": "expo start --web",
  "test": "jest"
}
```

- [ ] **Step 3: Create `jest.config.js`**

```js
module.exports = {
  preset: 'jest-expo',
  testMatch: ['**/__tests__/**/*.(test|spec).(ts|tsx|js|jsx)'],
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native|@react-navigation|expo(nent)?|@expo(nent)?/.*|expo-modules-core|@unimodules/.*|unimodules|sentry-expo|native-base|react-native-svg)/)',
  ],
};
```

- [ ] **Step 4: Verify Jest runs**

```bash
npm test -- --listTests
```

Expected: lists `components/__tests__/StyledText-test.js` (existing) and exits 0.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json jest.config.js
git commit -m "chore: configure Jest with jest-expo preset"
```

---

## Task 2: Add `app_settings` table and `db/settings.ts` module

A key/value SQLite table backs all app-level settings (shop info + saved printer). Lazy-seed the receipt footer default on first read.

**Files:**
- Modify: `db/database.ts` (add `app_settings` CREATE TABLE to the init exec)
- Create: `db/settings.ts`

- [ ] **Step 1: Add the `app_settings` table to the schema**

In `db/database.ts`, inside the `db.execAsync` template literal (after the `transaction_items` table), add:

```sql
CREATE TABLE IF NOT EXISTS app_settings (
  key   TEXT PRIMARY KEY,
  value TEXT
);
```

The full file becomes:

```ts
import * as SQLite from 'expo-sqlite';

let db: SQLite.SQLiteDatabase | null = null;

export async function getDatabase(): Promise<SQLite.SQLiteDatabase> {
  if (db) return db;

  db = await SQLite.openDatabaseAsync('cashier.db');
  await db.execAsync(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      sku TEXT,
      barcode TEXT,
      category_id INTEGER,
      unit TEXT,
      buy_price REAL DEFAULT 0,
      sell_price REAL NOT NULL,
      stock_qty INTEGER DEFAULT 0,
      min_stock_alert INTEGER DEFAULT 0,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      total REAL NOT NULL,
      amount_paid REAL NOT NULL,
      change_amount REAL NOT NULL DEFAULT 0,
      payment_method TEXT NOT NULL DEFAULT 'cash',
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS transaction_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      transaction_id INTEGER NOT NULL,
      product_id INTEGER NOT NULL,
      product_name TEXT NOT NULL,
      price REAL NOT NULL,
      qty INTEGER NOT NULL,
      subtotal REAL NOT NULL,
      FOREIGN KEY (transaction_id) REFERENCES transactions(id) ON DELETE CASCADE,
      FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS app_settings (
      key   TEXT PRIMARY KEY,
      value TEXT
    );
  `);

  return db;
}
```

- [ ] **Step 2: Create `db/settings.ts`**

```ts
import { getDatabase } from './database';

export type ShopInfo = {
  name: string;
  address: string;
  footer: string;
};

export type SavedPrinter = {
  mac: string;
  name: string;
};

const DEFAULT_FOOTER = 'Terima kasih';

async function getSetting(key: string): Promise<string | null> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ value: string | null }>(
    'SELECT value FROM app_settings WHERE key = ?',
    key,
  );
  return row?.value ?? null;
}

async function setSetting(key: string, value: string | null): Promise<void> {
  const db = await getDatabase();
  if (value === null) {
    await db.runAsync('DELETE FROM app_settings WHERE key = ?', key);
    return;
  }
  await db.runAsync(
    `INSERT INTO app_settings (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    key,
    value,
  );
}

export async function getShopInfo(): Promise<ShopInfo> {
  const [name, address, footer] = await Promise.all([
    getSetting('shop_name'),
    getSetting('shop_address'),
    getSetting('receipt_footer'),
  ]);
  return {
    name: name ?? '',
    address: address ?? '',
    footer: footer ?? DEFAULT_FOOTER,
  };
}

export async function setShopInfo(info: ShopInfo): Promise<void> {
  await Promise.all([
    setSetting('shop_name', info.name),
    setSetting('shop_address', info.address),
    setSetting('receipt_footer', info.footer),
  ]);
}

export async function getSavedPrinter(): Promise<SavedPrinter | null> {
  const [mac, name] = await Promise.all([
    getSetting('printer_mac'),
    getSetting('printer_name'),
  ]);
  if (!mac) return null;
  return { mac, name: name ?? mac };
}

export async function setSavedPrinter(printer: SavedPrinter | null): Promise<void> {
  if (printer === null) {
    await Promise.all([
      setSetting('printer_mac', null),
      setSetting('printer_name', null),
    ]);
    return;
  }
  await Promise.all([
    setSetting('printer_mac', printer.mac),
    setSetting('printer_name', printer.name),
  ]);
}
```

- [ ] **Step 3: Verify the project still type-checks**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add db/database.ts db/settings.ts
git commit -m "feat(db): add app_settings table and settings module"
```

---

## Task 3: Receipt builder — types and skeleton (TDD red)

Write the first failing test for the pure receipt builder. The builder produces a list of `ReceiptBlock` from a transaction, items, and shop info. This task only adds the types and an empty implementation so the first test fails on the assertion (not on import).

**Files:**
- Create: `services/receipt.ts`
- Create: `__tests__/receipt.test.ts`

- [ ] **Step 1: Create the skeleton with types**

```ts
// services/receipt.ts
import type { Transaction, TransactionItem } from '@/db/transactions';
import type { ShopInfo } from '@/db/settings';

export type ReceiptBlock =
  | { kind: 'text'; text: string; align?: 'left' | 'center' | 'right'; bold?: boolean; size?: 'normal' | 'double' }
  | { kind: 'columns'; cols: [string, string]; bold?: boolean }
  | { kind: 'divider' }
  | { kind: 'feed'; lines: number };

export const RECEIPT_WIDTH = 32;

export function buildReceipt(
  _transaction: Transaction,
  _items: TransactionItem[],
  _shopInfo: ShopInfo,
): ReceiptBlock[] {
  return [];
}
```

- [ ] **Step 2: Write the first failing test (header rendering)**

```ts
// __tests__/receipt.test.ts
import { buildReceipt } from '@/services/receipt';
import type { Transaction, TransactionItem } from '@/db/transactions';
import type { ShopInfo } from '@/db/settings';

const baseTransaction: Transaction = {
  id: 123,
  total: 48000,
  amount_paid: 50000,
  change_amount: 2000,
  payment_method: 'cash',
  notes: null,
  created_at: '2026-05-27 14:32:00',
};

const baseItems: TransactionItem[] = [
  { id: 1, transaction_id: 123, product_id: 1, product_name: 'Kopi Susu Gula Aren', price: 18000, qty: 2, subtotal: 36000 },
  { id: 2, transaction_id: 123, product_id: 2, product_name: 'Roti Bakar Coklat', price: 12000, qty: 1, subtotal: 12000 },
];

const baseShop: ShopInfo = { name: 'Warung Kita', address: 'Jl. Mawar 12', footer: 'Terima kasih' };

describe('buildReceipt', () => {
  it('renders the shop name as a centered, bold, double-height heading', () => {
    const blocks = buildReceipt(baseTransaction, baseItems, baseShop);
    expect(blocks[0]).toEqual({
      kind: 'text',
      text: 'Warung Kita',
      align: 'center',
      bold: true,
      size: 'double',
    });
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

```bash
npm test -- __tests__/receipt.test.ts
```

Expected: FAIL — `expect(received).toEqual(expected)` with `received` being `undefined` (because `buildReceipt` returns `[]`).

- [ ] **Step 4: Implement just enough to pass — shop name block**

Replace `buildReceipt` in `services/receipt.ts` with:

```ts
export function buildReceipt(
  transaction: Transaction,
  items: TransactionItem[],
  shopInfo: ShopInfo,
): ReceiptBlock[] {
  const blocks: ReceiptBlock[] = [];

  blocks.push({
    kind: 'text',
    text: shopInfo.name,
    align: 'center',
    bold: true,
    size: 'double',
  });

  return blocks;
}
```

- [ ] **Step 5: Verify the test passes**

```bash
npm test -- __tests__/receipt.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add services/receipt.ts __tests__/receipt.test.ts
git commit -m "feat(receipt): add builder skeleton with shop name block"
```

---

## Task 4: Receipt builder — address, transaction meta, divider, items, totals

Drive out the rest of the receipt structure test-by-test. Each step adds one test, watches it fail, then adds the minimum production code to make it pass.

**Files:**
- Modify: `__tests__/receipt.test.ts`
- Modify: `services/receipt.ts`

- [ ] **Step 1: Test — address line rendered when set, skipped when empty**

Append to `__tests__/receipt.test.ts`:

```ts
  it('renders the shop address as a centered line when set', () => {
    const blocks = buildReceipt(baseTransaction, baseItems, baseShop);
    expect(blocks[1]).toEqual({
      kind: 'text',
      text: 'Jl. Mawar 12',
      align: 'center',
    });
  });

  it('skips the address line when address is empty', () => {
    const blocks = buildReceipt(baseTransaction, baseItems, { ...baseShop, address: '' });
    // Block right after the shop name should NOT be an address text block; should be the divider
    expect(blocks[1]).toEqual({ kind: 'divider' });
  });
```

- [ ] **Step 2: Run — verify the new tests fail**

```bash
npm test -- __tests__/receipt.test.ts
```

Expected: 2 new failures.

- [ ] **Step 3: Add address + first divider**

In `services/receipt.ts`, after pushing the shop name block:

```ts
  if (shopInfo.address.trim().length > 0) {
    blocks.push({ kind: 'text', text: shopInfo.address, align: 'center' });
  }

  blocks.push({ kind: 'divider' });
```

- [ ] **Step 4: Run — all three header tests pass**

```bash
npm test -- __tests__/receipt.test.ts
```

Expected: PASS.

- [ ] **Step 5: Test — transaction No. and Tgl lines**

Append:

```ts
  it('renders the transaction number zero-padded to 6 digits', () => {
    const blocks = buildReceipt(baseTransaction, baseItems, baseShop);
    expect(blocks).toContainEqual({
      kind: 'text',
      text: 'No.  : 000123',
      align: 'left',
    });
  });

  it('renders the date as DD/MM/YYYY HH:mm in device local time', () => {
    const blocks = buildReceipt(baseTransaction, baseItems, baseShop);
    // created_at is stored as UTC; the test environment runs in whatever TZ Jest uses.
    // Lock the test by passing a fixed-format Date the builder will format.
    const dateBlock = blocks.find(
      (b) => b.kind === 'text' && (b as { text: string }).text.startsWith('Tgl  :'),
    );
    expect(dateBlock).toBeDefined();
    expect((dateBlock as { text: string }).text).toMatch(/^Tgl  : \d{2}\/\d{2}\/\d{4} \d{2}:\d{2}$/);
  });
```

- [ ] **Step 6: Run — both fail**

```bash
npm test -- __tests__/receipt.test.ts
```

Expected: FAIL for both transaction-meta tests.

- [ ] **Step 7: Add transaction meta lines + divider**

In `services/receipt.ts`, after the first divider push:

```ts
  const idStr = String(transaction.id).padStart(6, '0');
  blocks.push({ kind: 'text', text: `No.  : ${idStr}`, align: 'left' });

  const created = new Date(transaction.created_at + 'Z');
  const pad = (n: number) => String(n).padStart(2, '0');
  const dateStr =
    `${pad(created.getDate())}/${pad(created.getMonth() + 1)}/${created.getFullYear()} ` +
    `${pad(created.getHours())}:${pad(created.getMinutes())}`;
  blocks.push({ kind: 'text', text: `Tgl  : ${dateStr}`, align: 'left' });

  blocks.push({ kind: 'divider' });
```

- [ ] **Step 8: Run — both pass**

```bash
npm test -- __tests__/receipt.test.ts
```

Expected: PASS.

- [ ] **Step 9: Test — itemized list (name then qty/price/subtotal indented)**

Append:

```ts
  it('renders each item as a name line followed by an indented qty x price / subtotal columns line', () => {
    const blocks = buildReceipt(baseTransaction, baseItems, baseShop);
    expect(blocks).toContainEqual({ kind: 'text', text: 'Kopi Susu Gula Aren', align: 'left' });
    expect(blocks).toContainEqual({ kind: 'columns', cols: ['  2 x 18.000', '36.000'] });
    expect(blocks).toContainEqual({ kind: 'text', text: 'Roti Bakar Coklat', align: 'left' });
    expect(blocks).toContainEqual({ kind: 'columns', cols: ['  1 x 12.000', '12.000'] });
  });

  it('wraps long product names into 32-char chunks before the qty line', () => {
    const longName = 'A'.repeat(70); // 70 chars → 32 + 32 + 6
    const items: TransactionItem[] = [
      { id: 9, transaction_id: 123, product_id: 9, product_name: longName, price: 1000, qty: 1, subtotal: 1000 },
    ];
    const blocks = buildReceipt(baseTransaction, items, baseShop);
    const nameLines = blocks
      .filter((b): b is { kind: 'text'; text: string } =>
        b.kind === 'text' && (b as { text: string }).text.startsWith('A'),
      )
      .map((b) => b.text);
    expect(nameLines).toEqual(['A'.repeat(32), 'A'.repeat(32), 'A'.repeat(6)]);
  });
```

- [ ] **Step 10: Run — items tests fail**

```bash
npm test -- __tests__/receipt.test.ts
```

Expected: FAIL on both items tests.

- [ ] **Step 11: Add item rendering**

In `services/receipt.ts`, add a helper near the top of the file (outside `buildReceipt`):

```ts
function formatNumber(n: number): string {
  return n.toLocaleString('id-ID');
}

function wrap(text: string, width: number): string[] {
  if (text.length <= width) return [text];
  const lines: string[] = [];
  let remaining = text;
  while (remaining.length > width) {
    lines.push(remaining.slice(0, width));
    remaining = remaining.slice(width);
  }
  if (remaining.length > 0) lines.push(remaining);
  return lines;
}
```

Then in `buildReceipt`, after the transaction meta divider:

```ts
  for (const item of items) {
    for (const line of wrap(item.product_name, RECEIPT_WIDTH)) {
      blocks.push({ kind: 'text', text: line, align: 'left' });
    }
    blocks.push({
      kind: 'columns',
      cols: [`  ${item.qty} x ${formatNumber(item.price)}`, formatNumber(item.subtotal)],
    });
  }

  blocks.push({ kind: 'divider' });
```

- [ ] **Step 12: Run — items tests pass**

```bash
npm test -- __tests__/receipt.test.ts
```

Expected: PASS.

- [ ] **Step 13: Test — Total/Bayar/Kembali rows**

Append:

```ts
  it('renders Total (bold), Bayar, and Kembali rows with Rp prefix', () => {
    const blocks = buildReceipt(baseTransaction, baseItems, baseShop);
    expect(blocks).toContainEqual({ kind: 'columns', cols: ['TOTAL', 'Rp 48.000'], bold: true });
    expect(blocks).toContainEqual({ kind: 'columns', cols: ['Bayar', 'Rp 50.000'] });
    expect(blocks).toContainEqual({ kind: 'columns', cols: ['Kembali', 'Rp 2.000'] });
  });

  it('omits the Kembali row when change is zero', () => {
    const exact: Transaction = { ...baseTransaction, amount_paid: 48000, change_amount: 0 };
    const blocks = buildReceipt(exact, baseItems, baseShop);
    expect(blocks.some((b) => b.kind === 'columns' && b.cols[0] === 'Kembali')).toBe(false);
  });
```

- [ ] **Step 14: Run — both fail**

```bash
npm test -- __tests__/receipt.test.ts
```

Expected: FAIL.

- [ ] **Step 15: Add totals rendering**

In `services/receipt.ts`, after the post-items divider:

```ts
  blocks.push({ kind: 'columns', cols: ['TOTAL', `Rp ${formatNumber(transaction.total)}`], bold: true });
  blocks.push({ kind: 'columns', cols: ['Bayar', `Rp ${formatNumber(transaction.amount_paid)}`] });
  if (transaction.change_amount > 0) {
    blocks.push({ kind: 'columns', cols: ['Kembali', `Rp ${formatNumber(transaction.change_amount)}`] });
  }
```

- [ ] **Step 16: Run — totals tests pass**

```bash
npm test -- __tests__/receipt.test.ts
```

Expected: PASS.

- [ ] **Step 17: Test — notes section and footer**

Append:

```ts
  it('renders the notes section with a leading divider when notes are present', () => {
    const withNotes: Transaction = { ...baseTransaction, notes: 'Pelanggan tetap' };
    const blocks = buildReceipt(withNotes, baseItems, baseShop);
    const idx = blocks.findIndex((b) => b.kind === 'text' && (b as { text: string }).text.startsWith('Catatan:'));
    expect(idx).toBeGreaterThan(-1);
    expect(blocks[idx - 1]).toEqual({ kind: 'divider' });
    expect((blocks[idx] as { text: string }).text).toBe('Catatan: Pelanggan tetap');
  });

  it('omits the notes section entirely when notes is null or blank', () => {
    const blocks = buildReceipt(baseTransaction, baseItems, baseShop);
    expect(blocks.some((b) => b.kind === 'text' && (b as { text: string }).text.startsWith('Catatan:'))).toBe(false);
  });

  it('renders the footer centered, then a feed for the tear bar', () => {
    const blocks = buildReceipt(baseTransaction, baseItems, baseShop);
    const footerIdx = blocks.findIndex(
      (b) => b.kind === 'text' && (b as { text: string }).text === 'Terima kasih',
    );
    expect(footerIdx).toBeGreaterThan(-1);
    expect((blocks[footerIdx] as { align: string }).align).toBe('center');
    const tail = blocks.slice(footerIdx + 1);
    expect(tail.some((b) => b.kind === 'feed')).toBe(true);
  });
```

- [ ] **Step 18: Run — three new failures**

```bash
npm test -- __tests__/receipt.test.ts
```

Expected: FAIL.

- [ ] **Step 19: Add notes + footer + feed**

In `services/receipt.ts`, after the totals:

```ts
  const notes = transaction.notes?.trim();
  if (notes) {
    blocks.push({ kind: 'divider' });
    for (const line of wrap(`Catatan: ${notes}`, RECEIPT_WIDTH)) {
      blocks.push({ kind: 'text', text: line, align: 'left' });
    }
  }

  blocks.push({ kind: 'divider' });
  blocks.push({ kind: 'text', text: shopInfo.footer, align: 'center' });
  blocks.push({ kind: 'feed', lines: 3 });
```

- [ ] **Step 20: Run — all receipt tests pass**

```bash
npm test
```

Expected: full suite PASS (existing snapshot test + all receipt tests).

- [ ] **Step 21: Commit**

```bash
git add services/receipt.ts __tests__/receipt.test.ts
git commit -m "feat(receipt): build full receipt structure (items, totals, notes, footer)"
```

---

## Task 5: Install Bluetooth library and Expo config plugin, then prebuild

This is a one-time pipeline change. After this task the project no longer runs in Expo Go — daily dev becomes `npm run android` against a built APK.

**Files:**
- Create: `plugins/with-bluetooth-printer.js`
- Modify: `app.json`
- Modify: `package.json`

- [ ] **Step 1: Install the library**

```bash
npm install tp-react-native-bluetooth-printer
```

Expected: installs cleanly. If a peer warning about React 19 appears, it is acceptable — the module's runtime surface does not depend on React.

- [ ] **Step 2: Create the config plugin**

```js
// plugins/with-bluetooth-printer.js
const { withAndroidManifest } = require('@expo/config-plugins');

const PERMISSIONS = [
  'android.permission.BLUETOOTH',
  'android.permission.BLUETOOTH_ADMIN',
  'android.permission.BLUETOOTH_CONNECT',
  'android.permission.BLUETOOTH_SCAN',
  'android.permission.ACCESS_FINE_LOCATION',
];

module.exports = function withBluetoothPrinter(config) {
  return withAndroidManifest(config, (cfg) => {
    const manifest = cfg.modResults.manifest;
    manifest['uses-permission'] = manifest['uses-permission'] || [];
    for (const name of PERMISSIONS) {
      const already = manifest['uses-permission'].some(
        (p) => p.$ && p.$['android:name'] === name,
      );
      if (!already) {
        manifest['uses-permission'].push({ $: { 'android:name': name } });
      }
    }
    return cfg;
  });
};
```

- [ ] **Step 3: Register the plugin in `app.json`**

In `app.json`, the `plugins` array currently is:

```json
"plugins": [
  "expo-router",
  "expo-sqlite",
  "@react-native-community/datetimepicker",
  [
    "expo-splash-screen",
    {
      "image": "./assets/images/splash-icon.png",
      "imageWidth": 200,
      "resizeMode": "contain",
      "backgroundColor": "#ffffff",
      "dark": { "backgroundColor": "#1c1c1e" }
    }
  ]
]
```

Append `"./plugins/with-bluetooth-printer.js"` as the last entry, so the array becomes:

```json
"plugins": [
  "expo-router",
  "expo-sqlite",
  "@react-native-community/datetimepicker",
  [
    "expo-splash-screen",
    {
      "image": "./assets/images/splash-icon.png",
      "imageWidth": 200,
      "resizeMode": "contain",
      "backgroundColor": "#ffffff",
      "dark": { "backgroundColor": "#1c1c1e" }
    }
  ],
  "./plugins/with-bluetooth-printer.js"
]
```

- [ ] **Step 4: Prebuild**

```bash
npx expo prebuild --clean --platform android
```

Expected: regenerates `android/`. Verify by grepping the manifest:

```bash
grep -E 'BLUETOOTH|ACCESS_FINE_LOCATION' android/app/src/main/AndroidManifest.xml
```

Expected: five `uses-permission` lines.

- [ ] **Step 5: Smoke build**

```bash
npm run android
```

Expected: builds and installs on the connected Android device/emulator without errors. App boots to the existing cashier screen.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json plugins/with-bluetooth-printer.js app.json
git commit -m "feat(android): integrate tp-react-native-bluetooth-printer via config plugin"
```

Note: do **not** commit `android/` or `ios/`. They are generated and should be in `.gitignore`. If they are not, add them in a follow-up commit:

```bash
echo -e "\nandroid/\nios/" >> .gitignore
git add .gitignore
git commit -m "chore: ignore generated prebuild folders"
```

---

## Task 6: `services/printer.ts` — Bluetooth + ESC/POS wrapper

The single file that imports `tp-react-native-bluetooth-printer`. Throws `PrinterError` with typed `code` values so the UI can map to localized messages.

**Files:**
- Create: `services/printer.ts`

- [ ] **Step 1: Write the module**

```ts
// services/printer.ts
import { PermissionsAndroid, Platform } from 'react-native';
import {
  BluetoothManager,
  BluetoothEscposPrinter,
} from 'tp-react-native-bluetooth-printer';
import type { ReceiptBlock } from './receipt';

export type PrinterErrorCode =
  | 'bluetooth_off'
  | 'permission_denied'
  | 'not_found'
  | 'connect_failed'
  | 'print_failed';

export class PrinterError extends Error {
  constructor(public code: PrinterErrorCode, message?: string) {
    super(message ?? code);
    this.name = 'PrinterError';
  }
}

export type BluetoothDevice = { name: string; address: string };

let connectedMac: string | null = null;

const ALIGN = {
  left: BluetoothEscposPrinter.ALIGN.LEFT,
  center: BluetoothEscposPrinter.ALIGN.CENTER,
  right: BluetoothEscposPrinter.ALIGN.RIGHT,
};

export async function ensurePermissions(): Promise<void> {
  if (Platform.OS !== 'android') return;
  const sdk = Platform.Version as number;
  const needed: string[] =
    sdk >= 31
      ? [
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
        ]
      : [PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION];
  const result = await PermissionsAndroid.requestMultiple(needed as any);
  const allGranted = needed.every(
    (p) => result[p as keyof typeof result] === PermissionsAndroid.RESULTS.GRANTED,
  );
  if (!allGranted) throw new PrinterError('permission_denied');
}

export async function enableBluetooth(): Promise<void> {
  try {
    const isEnabled = await BluetoothManager.isBluetoothEnabled();
    if (isEnabled === 'true' || isEnabled === true) return;
    await BluetoothManager.enableBluetooth();
  } catch (e: any) {
    throw new PrinterError('bluetooth_off', e?.message);
  }
}

export async function scanDevices(): Promise<{ paired: BluetoothDevice[]; found: BluetoothDevice[] }> {
  try {
    const raw = await BluetoothManager.scanDevices();
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    const toDev = (d: any): BluetoothDevice => ({ name: d?.name ?? '(tanpa nama)', address: d?.address });
    return {
      paired: (parsed?.paired ?? []).map(toDev),
      found: (parsed?.found ?? []).map(toDev),
    };
  } catch (e: any) {
    throw new PrinterError('not_found', e?.message);
  }
}

export function isConnected(): boolean {
  return connectedMac !== null;
}

export async function connect(mac: string): Promise<void> {
  if (connectedMac === mac) return;
  try {
    await BluetoothManager.connect(mac);
    connectedMac = mac;
  } catch (e: any) {
    // One silent retry on transient failure.
    try {
      await BluetoothManager.connect(mac);
      connectedMac = mac;
    } catch (e2: any) {
      connectedMac = null;
      throw new PrinterError('connect_failed', e2?.message ?? e?.message);
    }
  }
}

export async function disconnect(): Promise<void> {
  if (!connectedMac) return;
  try {
    await BluetoothManager.disconnect(connectedMac);
  } finally {
    connectedMac = null;
  }
}

async function emitBlock(block: ReceiptBlock): Promise<void> {
  switch (block.kind) {
    case 'text': {
      await BluetoothEscposPrinter.printerAlign(ALIGN[block.align ?? 'left']);
      await BluetoothEscposPrinter.setBlob(block.bold ? 1 : 0);
      const opts: any = {
        widthtimes: block.size === 'double' ? 1 : 0,
        heigthtimes: block.size === 'double' ? 1 : 0,
        fonttype: 0,
      };
      await BluetoothEscposPrinter.printText(block.text + '\r\n', opts);
      await BluetoothEscposPrinter.setBlob(0);
      break;
    }
    case 'columns': {
      await BluetoothEscposPrinter.printerAlign(ALIGN.left);
      await BluetoothEscposPrinter.setBlob(block.bold ? 1 : 0);
      const leftWidth = 20;
      const rightWidth = 12;
      await BluetoothEscposPrinter.printColumn(
        [leftWidth, rightWidth],
        [BluetoothEscposPrinter.ALIGN.LEFT, BluetoothEscposPrinter.ALIGN.RIGHT],
        [block.cols[0], block.cols[1]],
        { encoding: 'CP437', codepage: 0, fonttype: 0 } as any,
      );
      await BluetoothEscposPrinter.setBlob(0);
      break;
    }
    case 'divider': {
      await BluetoothEscposPrinter.printerAlign(ALIGN.left);
      await BluetoothEscposPrinter.printText('-'.repeat(32) + '\r\n', {});
      break;
    }
    case 'feed': {
      await BluetoothEscposPrinter.printText('\r\n'.repeat(block.lines), {});
      break;
    }
  }
}

export async function printBlocks(blocks: ReceiptBlock[]): Promise<void> {
  try {
    for (const block of blocks) {
      await emitBlock(block);
    }
  } catch (e: any) {
    throw new PrinterError('print_failed', e?.message);
  }
}

export async function printReceipt(mac: string, blocks: ReceiptBlock[]): Promise<void> {
  await ensurePermissions();
  await enableBluetooth();
  await connect(mac);
  await printBlocks(blocks);
}
```

- [ ] **Step 2: Type-check the module**

```bash
npx tsc --noEmit
```

Expected: no errors. If the native module ships without TS types, suppress the missing-module import error with a one-line `declare module 'tp-react-native-bluetooth-printer';` shim in a new file `types/tp-react-native-bluetooth-printer.d.ts`, then add `"types"` config or re-run.

- [ ] **Step 3: Commit**

```bash
git add services/printer.ts
# Also stage the shim if you needed to create one:
git add types/tp-react-native-bluetooth-printer.d.ts 2>/dev/null || true
git commit -m "feat(printer): add Bluetooth ESC/POS wrapper service"
```

---

## Task 7: i18n — add `printer.*` and `settings.*` namespaces

All UI strings for the new screens. Default language is Indonesian (existing pattern).

**Files:**
- Modify: `i18n/translations.ts`

- [ ] **Step 1: Add the two namespaces**

In `i18n/translations.ts`, inside `translations.id`, add (alongside `common`, `tabs`, etc.):

```ts
    printer: {
      print_receipt: 'Cetak struk',
      reprint: 'Cetak ulang',
      printing: 'Mencetak…',
      no_printer_hint: 'Atur printer di Pengaturan dulu',
      open_settings: 'Buka Pengaturan',
      try_again: 'Coba lagi',
      test_print: 'Test print',
      save: 'Simpan',
      scanning: 'Mencari perangkat…',
      connecting: 'Menghubungkan…',
      connected: 'Terhubung',
      paired_section: 'Sudah dipasangkan',
      found_section: 'Ditemukan',
      no_name: '(tanpa nama)',
      enable: 'Aktifkan',
      err_bluetooth_off: 'Bluetooth nonaktif',
      err_permission_denied: 'Izin Bluetooth ditolak',
      err_not_found: 'Printer tidak ditemukan',
      err_connect_failed: 'Gagal terhubung ke printer',
      err_print_failed: 'Gagal mencetak',
    },
    settings: {
      title: 'Pengaturan',
      shop_section: 'Informasi Toko',
      shop_name: 'Nama Toko',
      shop_address: 'Alamat',
      receipt_footer: 'Catatan Kaki Struk',
      printer_section: 'Printer',
      not_set: 'Belum dipilih',
      pick_printer: 'Pilih printer',
      remove_printer: 'Hapus',
      saved: 'Tersimpan',
    },
    stack: {
      add_product: 'Tambah Produk',
      edit_product: 'Ubah Produk',
      add_category: 'Tambah Kategori',
      checkout: 'Pembayaran',
      printer_setup: 'Atur Printer',
    },
```

If `stack` already exists (it does), only add the `printer_setup` line — do not duplicate the block. The exact change to `stack` is one new key:

```ts
      printer_setup: 'Atur Printer',
```

Also add a new key to `tabs` for the Settings tab:

```ts
    tabs: {
      cashier: 'Kasir',
      products: 'Produk',
      categories: 'Kategori',
      history: 'Riwayat',
      settings: 'Pengaturan',
    },
```

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add i18n/translations.ts
git commit -m "i18n: add printer and settings namespaces"
```

---

## Task 8: Settings tab — `app/(tabs)/settings.tsx` and tab registration

A new 5th tab. Reads shop info and saved printer on focus; saves on button tap.

**Files:**
- Create: `app/(tabs)/settings.tsx`
- Modify: `app/(tabs)/_layout.tsx`

- [ ] **Step 1: Register the new tab**

In `app/(tabs)/_layout.tsx`, after the `history` `<Tabs.Screen>` block, add:

```tsx
      <Tabs.Screen
        name="settings"
        options={{
          title: t('tabs.settings'),
          tabBarIcon: ({ color }) => <TabBarIcon name="cog" color={color} />,
        }}
      />
```

- [ ] **Step 2: Create the Settings screen**

```tsx
// app/(tabs)/settings.tsx
import { useCallback, useState } from 'react';
import { StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view';
import { router, useFocusEffect } from 'expo-router';
import FontAwesome from '@expo/vector-icons/FontAwesome';

import { Text, View } from '@/components/Themed';
import { FormInput } from '@/components/FormInput';
import { PrimaryButton } from '@/components/PrimaryButton';
import { useTheme } from '@/hooks/useTheme';
import {
  getShopInfo,
  setShopInfo,
  getSavedPrinter,
  setSavedPrinter,
  type SavedPrinter,
} from '@/db/settings';
import { t } from '@/i18n';

export default function SettingsScreen() {
  const { tint, background, inputBorder } = useTheme();
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [footer, setFooter] = useState('');
  const [printer, setPrinter] = useState<SavedPrinter | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const [info, p] = await Promise.all([getShopInfo(), getSavedPrinter()]);
    setName(info.name);
    setAddress(info.address);
    setFooter(info.footer);
    setPrinter(p);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const handleSave = async () => {
    setSaving(true);
    try {
      await setShopInfo({ name, address, footer });
      Alert.alert(t('common.success'), t('settings.saved'));
    } finally {
      setSaving(false);
    }
  };

  const handleRemovePrinter = async () => {
    await setSavedPrinter(null);
    setPrinter(null);
  };

  return (
    <KeyboardAwareScrollView
      style={[styles.scroll, { backgroundColor: background }]}
      contentContainerStyle={styles.container}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={styles.section}>{t('settings.shop_section')}</Text>
      <FormInput label={t('settings.shop_name')} value={name} onChangeText={setName} />
      <FormInput
        label={t('settings.shop_address')}
        value={address}
        onChangeText={setAddress}
        multiline
      />
      <FormInput label={t('settings.receipt_footer')} value={footer} onChangeText={setFooter} />
      <PrimaryButton
        label={saving ? t('common.saving') : t('common.save')}
        onPress={handleSave}
      />

      <View style={styles.divider} />

      <Text style={styles.section}>{t('settings.printer_section')}</Text>
      <View style={[styles.printerRow, { borderColor: inputBorder }]}>
        <FontAwesome name="print" size={20} color={tint} style={{ marginRight: 12 }} />
        <View style={{ flex: 1 }}>
          <Text style={styles.printerName}>
            {printer ? printer.name : t('settings.not_set')}
          </Text>
          {printer && <Text style={styles.printerMac}>{printer.mac}</Text>}
        </View>
      </View>
      <View style={styles.printerActions}>
        <TouchableOpacity
          style={[styles.btn, { backgroundColor: tint }]}
          onPress={() => router.push('/printer-setup')}
        >
          <Text style={styles.btnText}>{t('settings.pick_printer')}</Text>
        </TouchableOpacity>
        {printer && (
          <TouchableOpacity
            style={[styles.btn, { backgroundColor: '#FF3B30' }]}
            onPress={handleRemovePrinter}
          >
            <Text style={styles.btnText}>{t('settings.remove_printer')}</Text>
          </TouchableOpacity>
        )}
      </View>
    </KeyboardAwareScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  container: { padding: 20, paddingBottom: 40 },
  section: { fontSize: 18, fontWeight: '700', marginTop: 8, marginBottom: 10 },
  divider: { height: 1, opacity: 0.2, marginVertical: 24, backgroundColor: '#888' },
  printerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 10,
    padding: 14,
    marginBottom: 12,
  },
  printerName: { fontSize: 15, fontWeight: '600' },
  printerMac: { fontSize: 12, opacity: 0.6, marginTop: 2 },
  printerActions: { flexDirection: 'row', gap: 10 },
  btn: { borderRadius: 8, paddingHorizontal: 14, paddingVertical: 10 },
  btnText: { color: '#fff', fontSize: 14, fontWeight: '700' },
});
```

- [ ] **Step 3: Smoke test in app**

```bash
npm run android
```

Expected: a 5th "Pengaturan" tab appears with a cog icon. Open it; fill in shop name/address/footer; tap Save; tap "Pilih printer" → app crashes because `printer-setup` route does not exist yet (acceptable — fixed in Task 9). Re-open Settings: values persisted.

- [ ] **Step 4: Commit**

```bash
git add app/\(tabs\)/_layout.tsx app/\(tabs\)/settings.tsx
git commit -m "feat(settings): add Settings tab with shop info and printer slot"
```

---

## Task 9: Printer setup screen — `app/printer-setup.tsx`

Scans, lets the user pick a device, optionally test-prints, and saves.

**Files:**
- Create: `app/printer-setup.tsx`
- Modify: `app/_layout.tsx` (register the route's stack header title)

- [ ] **Step 1: Add the stack header for `printer-setup`**

Open `app/_layout.tsx` and locate the existing `Stack` screens. After the `checkout` screen entry, add:

```tsx
        <Stack.Screen name="printer-setup" options={{ title: t('stack.printer_setup') }} />
```

(Match the surrounding `Stack.Screen` pattern; if `t` is not already imported there, add `import { t } from '@/i18n';`.)

- [ ] **Step 2: Create the printer setup screen**

```tsx
// app/printer-setup.tsx
import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, FlatList, TouchableOpacity, ActivityIndicator } from 'react-native';
import { router } from 'expo-router';
import FontAwesome from '@expo/vector-icons/FontAwesome';

import { Text, View } from '@/components/Themed';
import { useTheme } from '@/hooks/useTheme';
import { setSavedPrinter } from '@/db/settings';
import {
  ensurePermissions,
  enableBluetooth,
  scanDevices,
  connect,
  printBlocks,
  PrinterError,
  type BluetoothDevice,
} from '@/services/printer';
import { t } from '@/i18n';

type Status = 'idle' | 'scanning' | 'connecting' | 'connected' | 'testing' | 'error';

function errorKey(code: PrinterError['code']): string {
  return `printer.err_${code}`;
}

export default function PrinterSetupScreen() {
  const { tint, background, inputBorder } = useTheme();
  const [paired, setPaired] = useState<BluetoothDevice[]>([]);
  const [found, setFound] = useState<BluetoothDevice[]>([]);
  const [selected, setSelected] = useState<BluetoothDevice | null>(null);
  const [status, setStatus] = useState<Status>('idle');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleError = (e: unknown) => {
    if (e instanceof PrinterError) {
      setErrorMsg(t(errorKey(e.code) as any));
    } else {
      setErrorMsg(t('common.error'));
    }
    setStatus('error');
  };

  const runScan = useCallback(async () => {
    setErrorMsg(null);
    setStatus('scanning');
    try {
      await ensurePermissions();
      await enableBluetooth();
      const { paired: p, found: f } = await scanDevices();
      setPaired(p);
      setFound(f);
      setStatus('idle');
    } catch (e) {
      handleError(e);
    }
  }, []);

  useEffect(() => {
    runScan();
  }, [runScan]);

  const handlePick = async (device: BluetoothDevice) => {
    setErrorMsg(null);
    setSelected(device);
    setStatus('connecting');
    try {
      await connect(device.address);
      setStatus('connected');
    } catch (e) {
      handleError(e);
    }
  };

  const handleTest = async () => {
    if (!selected) return;
    setErrorMsg(null);
    setStatus('testing');
    try {
      await printBlocks([
        { kind: 'text', text: '*** TEST PRINT ***', align: 'center', bold: true },
        { kind: 'feed', lines: 2 },
      ]);
      setStatus('connected');
    } catch (e) {
      handleError(e);
    }
  };

  const handleSave = async () => {
    if (!selected) return;
    await setSavedPrinter({ mac: selected.address, name: selected.name || selected.address });
    router.back();
  };

  const renderDevice = (device: BluetoothDevice) => {
    const isSelected = selected?.address === device.address;
    return (
      <View key={device.address} style={[styles.deviceCard, { borderColor: inputBorder }]}>
        <TouchableOpacity style={styles.deviceRow} onPress={() => handlePick(device)}>
          <FontAwesome
            name={isSelected && status === 'connected' ? 'check-circle' : 'bluetooth'}
            size={20}
            color={tint}
            style={{ marginRight: 12 }}
          />
          <View style={{ flex: 1 }}>
            <Text style={styles.deviceName}>{device.name || t('printer.no_name')}</Text>
            <Text style={styles.deviceMac}>{device.address}</Text>
          </View>
          {isSelected && status === 'connecting' && <ActivityIndicator />}
        </TouchableOpacity>
        {isSelected && (status === 'connected' || status === 'testing') && (
          <View style={styles.deviceActions}>
            <TouchableOpacity
              style={[styles.btn, { backgroundColor: '#34C759' }]}
              onPress={handleTest}
              disabled={status === 'testing'}
            >
              <Text style={styles.btnText}>
                {status === 'testing' ? t('printer.printing') : t('printer.test_print')}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.btn, { backgroundColor: tint }]} onPress={handleSave}>
              <Text style={styles.btnText}>{t('printer.save')}</Text>
            </TouchableOpacity>
          </View>
        )}
        {isSelected && status === 'error' && errorMsg && (
          <Text style={styles.errorText}>{errorMsg}</Text>
        )}
      </View>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: background }]}>
      {status === 'scanning' && (
        <View style={styles.bannerRow}>
          <ActivityIndicator />
          <Text style={styles.bannerText}>{t('printer.scanning')}</Text>
        </View>
      )}
      {status === 'error' && !selected && errorMsg && (
        <View style={styles.bannerRow}>
          <Text style={[styles.bannerText, { color: '#FF3B30' }]}>{errorMsg}</Text>
          <TouchableOpacity onPress={runScan} style={[styles.btn, { backgroundColor: tint }]}>
            <Text style={styles.btnText}>{t('printer.try_again')}</Text>
          </TouchableOpacity>
        </View>
      )}

      <FlatList
        ListHeaderComponent={
          <>
            <Text style={styles.section}>{t('printer.paired_section')}</Text>
            {paired.length === 0 && <Text style={styles.empty}>—</Text>}
            {paired.map(renderDevice)}
            <Text style={[styles.section, { marginTop: 16 }]}>{t('printer.found_section')}</Text>
            {found.length === 0 && <Text style={styles.empty}>—</Text>}
            {found.map(renderDevice)}
          </>
        }
        data={[]}
        renderItem={null}
        contentContainerStyle={{ padding: 16 }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  bannerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
  },
  bannerText: { flex: 1, fontSize: 14 },
  section: { fontSize: 16, fontWeight: '700', marginBottom: 8 },
  empty: { opacity: 0.5, marginBottom: 8 },
  deviceCard: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    marginBottom: 10,
  },
  deviceRow: { flexDirection: 'row', alignItems: 'center' },
  deviceName: { fontSize: 15, fontWeight: '600' },
  deviceMac: { fontSize: 12, opacity: 0.6, marginTop: 2 },
  deviceActions: { flexDirection: 'row', gap: 10, marginTop: 10 },
  btn: { borderRadius: 8, paddingHorizontal: 14, paddingVertical: 10 },
  btnText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  errorText: { color: '#FF3B30', marginTop: 8, fontSize: 13 },
});
```

- [ ] **Step 3: Smoke test on real hardware**

Power on the iWare printer. Run:

```bash
npm run android
```

Open Settings → "Pilih printer". Expected:
1. App requests Bluetooth permissions (one-time).
2. Scan completes; the iWare appears under "Sudah dipasangkan" if previously paired in OS, or under "Ditemukan" otherwise.
3. Tap it → status transitions to connecting → connected; Test print and Save buttons appear.
4. Tap "Test print" → printer prints `*** TEST PRINT ***`.
5. Tap "Simpan" → returns to Settings, which now shows the saved printer.

- [ ] **Step 4: Commit**

```bash
git add app/_layout.tsx app/printer-setup.tsx
git commit -m "feat(printer): add printer setup screen with scan, test, save"
```

---

## Task 10: Print button on checkout success screen

Below the change amount, before "Kembali ke kasir". Disabled when no printer is saved; deep-links to Settings in that case.

**Files:**
- Modify: `app/checkout.tsx`

- [ ] **Step 1: Wire imports and saved-printer state**

At the top of `app/checkout.tsx`, add to the existing imports:

```ts
import { useEffect } from 'react';
import { ActivityIndicator } from 'react-native';
import { getShopInfo, getSavedPrinter, type SavedPrinter } from '@/db/settings';
import { buildReceipt } from '@/services/receipt';
import { printReceipt, PrinterError } from '@/services/printer';
```

(`useState` is already imported; `useEffect` needs to be added to the same `react` import line.)

- [ ] **Step 2: Add print state inside the component**

Inside `CheckoutScreen`, alongside the other `useState` calls:

```ts
  const [savedPrinter, setSavedPrinter] = useState<SavedPrinter | null>(null);
  const [printStatus, setPrintStatus] = useState<'idle' | 'printing' | 'done' | 'error'>('idle');
  const [printError, setPrintError] = useState<string | null>(null);
  const [savedTransactionId, setSavedTransactionId] = useState<number | null>(null);

  useEffect(() => {
    getSavedPrinter().then(setSavedPrinter);
  }, []);
```

- [ ] **Step 3: Capture the saved transaction id after `createTransaction`**

In `handlePay`, after the `setChangeAmount(transaction.change_amount);` line, add:

```ts
      setSavedTransactionId(transaction.id);
```

- [ ] **Step 4: Add the print handler**

Below `handlePay`, add:

```ts
  const handlePrint = async () => {
    if (!savedPrinter || savedTransactionId === null) return;
    setPrintError(null);
    setPrintStatus('printing');
    try {
      const [shopInfo] = await Promise.all([getShopInfo()]);
      const transactionRow = {
        id: savedTransactionId,
        total,
        amount_paid: paidNum,
        change_amount: changeAmount,
        payment_method: 'cash' as const,
        notes: notes || null,
        created_at: new Date().toISOString().slice(0, 19).replace('T', ' '),
      };
      const items = cart.map((c, i) => ({
        id: i + 1,
        transaction_id: savedTransactionId,
        product_id: c.product_id,
        product_name: c.product_name,
        price: c.price,
        qty: c.qty,
        subtotal: c.price * c.qty,
      }));
      const blocks = buildReceipt(transactionRow, items, shopInfo);
      await printReceipt(savedPrinter.mac, blocks);
      setPrintStatus('done');
    } catch (e) {
      if (e instanceof PrinterError) {
        setPrintError(t(`printer.err_${e.code}` as any));
      } else {
        setPrintError(t('common.error'));
      }
      setPrintStatus('error');
    }
  };
```

- [ ] **Step 5: Render the print button in the success view**

In the `if (completed)` JSX block, replace the existing `TouchableOpacity` ("Kembali ke kasir") with a wrapping `<>` fragment that includes the print button above it:

```tsx
        <TouchableOpacity
          style={[
            styles.doneBtn,
            { backgroundColor: tint, opacity: savedPrinter ? 1 : 0.4 },
          ]}
          onPress={handlePrint}
          disabled={!savedPrinter || printStatus === 'printing'}
        >
          {printStatus === 'printing' ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.doneBtnText}>
              {printStatus === 'done' ? t('printer.reprint') : t('printer.print_receipt')}
            </Text>
          )}
        </TouchableOpacity>
        {!savedPrinter && (
          <TouchableOpacity onPress={() => router.push('/(tabs)/settings')}>
            <Text style={styles.helperText}>{t('printer.no_printer_hint')}</Text>
          </TouchableOpacity>
        )}
        {printError && (
          <Text style={styles.errorText}>{printError}</Text>
        )}
        <TouchableOpacity
          style={[styles.doneBtn, { backgroundColor: tint, marginTop: 12 }]}
          onPress={() => {
            requestCartClear();
            router.dismissAll();
          }}
        >
          <Text style={styles.doneBtnText}>{t('checkout.back_to_cashier')}</Text>
        </TouchableOpacity>
```

- [ ] **Step 6: Add the two new styles**

In the `StyleSheet.create` block, add:

```ts
  helperText: {
    color: '#FF9500',
    fontSize: 13,
    marginTop: 8,
    textDecorationLine: 'underline',
  },
  errorText: {
    color: '#FF3B30',
    fontSize: 13,
    marginTop: 8,
  },
```

- [ ] **Step 7: Smoke test**

```bash
npm run android
```

Run a real checkout. On the success screen:
- With no printer saved: "Cetak struk" disabled, hint shows.
- With printer saved: tap "Cetak struk" → printer prints a full receipt matching the layout in the spec. Button label changes to "Cetak ulang"; tapping it prints again.
- Turn printer off, tap again → red error text appears.

- [ ] **Step 8: Commit**

```bash
git add app/checkout.tsx
git commit -m "feat(checkout): add print receipt button on success screen"
```

---

## Task 11: Reprint button on history detail modal

Same flow as checkout, scoped to a `TransactionWithItems` already loaded by the modal.

**Files:**
- Modify: `app/(tabs)/history.tsx`

- [ ] **Step 1: Wire imports and reprint state**

At the top of `app/(tabs)/history.tsx`, add to existing imports:

```ts
import { useEffect } from 'react';
import { ActivityIndicator } from 'react-native';
import { getShopInfo, getSavedPrinter, type SavedPrinter } from '@/db/settings';
import { buildReceipt } from '@/services/receipt';
import { printReceipt, PrinterError } from '@/services/printer';
```

(`useState`, `useCallback`, `useFocusEffect` are already imported; `useEffect` is new.)

Inside `HistoryScreen`, alongside the other `useState` calls:

```ts
  const [savedPrinter, setSavedPrinter] = useState<SavedPrinter | null>(null);
  const [printStatus, setPrintStatus] = useState<'idle' | 'printing' | 'done' | 'error'>('idle');
  const [printError, setPrintError] = useState<string | null>(null);

  useEffect(() => {
    getSavedPrinter().then(setSavedPrinter);
  }, []);
```

- [ ] **Step 2: Add the reprint handler**

Below the other handlers (after `viewDetail`):

```ts
  const handleReprint = async () => {
    if (!savedPrinter || !selected) return;
    setPrintError(null);
    setPrintStatus('printing');
    try {
      const shopInfo = await getShopInfo();
      const blocks = buildReceipt(selected, selected.items, shopInfo);
      await printReceipt(savedPrinter.mac, blocks);
      setPrintStatus('done');
    } catch (e) {
      if (e instanceof PrinterError) {
        setPrintError(t(`printer.err_${e.code}` as any));
      } else {
        setPrintError(t('common.error'));
      }
      setPrintStatus('error');
    }
  };
```

Also clear the print state when the modal closes — change the modal `onPress` from:

```tsx
          onPress={() => setShowDetail(false)}
```

to:

```tsx
          onPress={() => {
            setShowDetail(false);
            setPrintStatus('idle');
            setPrintError(null);
          }}
```

- [ ] **Step 3: Add the reprint button at the bottom of the modal**

Inside the modal, after the closing `{selected.notes ? (...) : null}` block but before the closing `</View>` for `modalContent`, add:

```tsx
                <TouchableOpacity
                  style={[
                    styles.reprintBtn,
                    { backgroundColor: tint, opacity: savedPrinter ? 1 : 0.4 },
                  ]}
                  onPress={handleReprint}
                  disabled={!savedPrinter || printStatus === 'printing'}
                >
                  {printStatus === 'printing' ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={styles.reprintBtnText}>{t('printer.reprint')}</Text>
                  )}
                </TouchableOpacity>
                {!savedPrinter && (
                  <Text style={styles.reprintHint}>{t('printer.no_printer_hint')}</Text>
                )}
                {printError && (
                  <Text style={styles.reprintError}>{printError}</Text>
                )}
```

- [ ] **Step 4: Add the new styles**

In the `StyleSheet.create` block, add:

```ts
  reprintBtn: {
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 20,
    alignItems: 'center',
    marginTop: 16,
  },
  reprintBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  reprintHint: { color: '#FF9500', fontSize: 13, marginTop: 8, textAlign: 'center' },
  reprintError: { color: '#FF3B30', fontSize: 13, marginTop: 8, textAlign: 'center' },
```

- [ ] **Step 5: Smoke test**

```bash
npm run android
```

Open History → tap a past transaction → "Cetak ulang" prints the receipt for that transaction. Close and reopen the modal — print state resets.

- [ ] **Step 6: Commit**

```bash
git add app/\(tabs\)/history.tsx
git commit -m "feat(history): add reprint button to transaction detail modal"
```

---

## Task 12: README "Development build" section

Document the one-time pipeline change so future-you (or anyone cloning the repo) understands why Expo Go no longer works.

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Append the section**

Append the following to `README.md`:

```markdown
## Development build

This project uses native modules (Bluetooth thermal printing) and cannot run in Expo Go.

**One-time setup:**

```bash
npm install
npx expo prebuild --clean --platform android
```

**Daily dev:**

```bash
npm run android
```

This builds and installs a dev APK on the connected Android device or emulator. Reloading JS still works the same — only native changes require a fresh build.

The generated `android/` and `ios/` folders are gitignored; they are reproducible from `app.json` plus the config plugins in `plugins/`.
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: add development build instructions"
```

---

## Self-Review

After all 12 tasks land, sanity-check against the spec:

- **Spec coverage:**
  - `db/settings.ts` + table → Task 2 ✓
  - `services/receipt.ts` (pure builder + tests) → Tasks 3-4 ✓
  - `services/printer.ts` (typed errors, lazy connect) → Task 6 ✓
  - Expo config plugin + Android permissions → Task 5 ✓
  - Settings tab (shop info + printer slot) → Task 8 ✓
  - Printer setup screen (scan, test, save) → Task 9 ✓
  - Checkout print button → Task 10 ✓
  - History reprint → Task 11 ✓
  - i18n namespaces → Task 7 ✓
  - Receipt layout (header, divider, items, totals, notes, footer, feed) → Task 4 ✓
  - Error mapping table → Task 6 (printer.ts) + Tasks 9-11 (UI mapping) ✓
  - README dev build instructions → Task 12 ✓
- **Type consistency:** `ReceiptBlock`, `PrinterError`, `SavedPrinter`, `ShopInfo` are defined once and imported. The `printer.err_*` i18n keys in Task 7 match every `PrinterErrorCode` value in Task 6.
- **No placeholders:** every code step shows complete code; every test step shows the test body and the expected pass/fail outcome.
