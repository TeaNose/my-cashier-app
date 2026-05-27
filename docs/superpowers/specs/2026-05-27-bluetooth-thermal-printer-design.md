# Bluetooth Thermal Printer Integration

**Date:** 2026-05-27
**Target hardware:** iWare 58mm Portable Thermal Printer (Bluetooth Classic / SPP, ESC/POS)
**Target platform:** Android only

## Goal

Allow the cashier to print a paper receipt for a transaction from a 58mm Bluetooth thermal printer. The cashier pairs the printer once in Settings; subsequent prints are a single tap on the checkout success screen or the history detail view.

## Constraints

- **Single printer model**: iWare 58mm or compatible ESC/POS printers using Bluetooth Classic SPP.
- **Android only**: iOS is out of scope. iWare is not MFi-certified, so Classic Bluetooth on iOS is not viable.
- **Indonesian locale**: prices in `id-ID` (Rp prefix, `.` thousand separator), receipts in Bahasa Indonesia.
- **Existing app**: Expo SDK 54, new architecture enabled, expo-router, expo-sqlite. Currently has no native modules — adding the printer means moving from Expo Go to a custom dev build (one-time pipeline change).

## Non-goals (explicitly out of scope)

- iOS support.
- Logo / bitmap image printing.
- QR code on receipt.
- Multiple saved printers / per-shift printer profiles.
- Automatic print after payment (rejected — manual control prevents paper waste and surfaces printer-offline conditions clearly).
- Background reconnection, connection health pings, print queue.
- Daily Z-report / shift summary printing (separate feature).
- Configurable paper width or character encoding — hardcoded to 58mm and the iWare's default codepage.

## Architecture

Four new units, each with a single, well-bounded purpose:

### `db/settings.ts` — settings persistence

Backs a new SQLite table:

```sql
CREATE TABLE IF NOT EXISTS app_settings (
  key   TEXT PRIMARY KEY,
  value TEXT
);
```

Exposes raw `getSetting(key)` / `setSetting(key, value)` plus typed helpers:

- `getShopInfo(): Promise<{ name: string; address: string; footer: string }>`
- `setShopInfo(info): Promise<void>`
- `getSavedPrinter(): Promise<{ mac: string; name: string } | null>`
- `setSavedPrinter(printer | null): Promise<void>`

Keys used: `shop_name`, `shop_address`, `receipt_footer`, `printer_mac`, `printer_name`. The footer key seeds to `"Terima kasih"` on first read if unset.

### `services/receipt.ts` — pure receipt builder

```ts
type ReceiptBlock =
  | { kind: 'text'; text: string; align?: 'left'|'center'|'right'; bold?: boolean; size?: 'normal'|'double' }
  | { kind: 'columns'; cols: [string, string] }   // left-aligned, right-aligned, 32-char total
  | { kind: 'divider' }                            // 32 dashes
  | { kind: 'feed'; lines: number };

function buildReceipt(
  transaction: Transaction,
  items: TransactionItem[],
  shopInfo: ShopInfo,
): ReceiptBlock[];
```

No printer or React Native dependencies — fully unit-testable in plain Node. All layout, wrapping, and conditional sections (skip address if empty, skip notes if absent) live here.

### `services/printer.ts` — Bluetooth + printer wrapper

The only file that imports `tp-react-native-bluetooth-printer`. Public surface:

```ts
async function enableBluetooth(): Promise<void>;            // throws if user declines
async function ensurePermissions(): Promise<void>;          // runtime BT_SCAN/BT_CONNECT
async function scanDevices(): Promise<{ paired: Device[]; found: Device[] }>;
async function connect(mac: string): Promise<void>;          // idempotent; 1 silent retry
async function disconnect(): Promise<void>;
function isConnected(): boolean;
async function printBlocks(blocks: ReceiptBlock[]): Promise<void>;
async function printReceipt(mac, blocks): Promise<void>;     // connect-if-needed + printBlocks + feed
```

Throws `PrinterError` with typed `code`:
`bluetooth_off | permission_denied | not_found | connect_failed | print_failed`.

Connection lifecycle is lazy: connect on first print, keep the connection open for the session, transparently reconnect on the next print if dropped. No background thread.

### `plugins/with-bluetooth-printer.js` — Expo config plugin

Injects on prebuild:

- Android manifest permissions: `BLUETOOTH`, `BLUETOOTH_ADMIN`, `BLUETOOTH_CONNECT`, `BLUETOOTH_SCAN`, `ACCESS_FINE_LOCATION` (the last is required for scans on API ≤ 30).
- Module gradle linkage if autolinking misses it.

Registered in `app.json` under `plugins`. Prebuild applies the patch on every run, so the generated `android/` stays reproducible.

### Boundary rules

UI imports `db/settings`, `services/printer`, and `services/receipt`. The native module (`tp-react-native-bluetooth-printer`) is referenced from exactly one file — `services/printer.ts` — so swapping libraries later means changing one file. `services/receipt` has no React Native or printer dependencies.

## UI changes

### New Settings tab (`app/(tabs)/settings.tsx`)

Added as a 5th tab with a `cog` icon, registered in `app/(tabs)/_layout.tsx`.

**Shop info** section — three `FormInput` rows:

- Shop name (`shop_name`)
- Address (multiline, optional, `shop_address`)
- Receipt footer (optional, defaults to "Terima kasih", `receipt_footer`)

A "Simpan" button persists all three via `setShopInfo`.

**Printer** section — shows current saved printer as `<name> · <mac>` or "Belum dipilih". Buttons:

- "Pilih printer" → navigates to `/printer-setup`.
- "Hapus" (only when a printer is saved) → clears the saved MAC.

### New printer setup screen (`app/printer-setup.tsx`)

Pushed from Settings. Flow:

1. On mount: call `ensurePermissions()`, then `enableBluetooth()` (prompts the user if radio is off).
2. Show two sections: **"Sudah dipasangkan"** (OS-paired devices) and **"Ditemukan"** (active-scan results). Each row is tappable.
3. Tapping a device calls `connect(mac)`. On success, the row expands to reveal:
   - "Test print" — sends a short `*** TEST PRINT ***` receipt.
   - "Simpan" — calls `setSavedPrinter({ mac, name })` and returns to Settings.
4. Status state machine: `idle | scanning | connecting | connected | testing | error`.
5. Errors render inline next to the offending action with a "Coba lagi" tap. No `Alert` dialogs except for terminal failures.

### Checkout success screen (`app/checkout.tsx`)

Below the change amount block, add a primary "Cetak struk" button (uses `tint`). The existing "Kembali ke kasir" button stays below it.

Button states (`idle | printing | done | error`):

- `idle` → label "Cetak struk".
- `printing` → spinner + label "Mencetak…", disabled.
- `done` → label "Cetak ulang" (so cashier can reprint a second copy).
- `error` → label reverts; inline red helper text under the button shows the mapped error message and "Coba lagi" action.

If `getSavedPrinter()` returns null, the button is disabled with helper text "Atur printer di Pengaturan dulu" that taps through to Settings.

### History reprint (`app/(tabs)/history.tsx`)

The existing detail modal already loads a `TransactionWithItems`. Add a "Cetak ulang" button in its footer using the same flow and state machine as checkout.

### i18n

All new strings go into `i18n/translations.ts` under two new namespaces:

- `printer.*` — button labels, status messages, error messages.
- `settings.*` — Settings tab labels, form labels.

No hardcoded UI text.

## Data flow — print sequence

```
[User taps "Cetak struk" on success screen]
        |
        v
[UI] getShopInfo() + getSavedPrinter()  ── DB
        |
        v
[UI] buildReceipt(transaction, items, shopInfo) → ReceiptBlock[]
        |
        v
[UI] printer.printReceipt(savedPrinter.mac, blocks)
        |
        +─ ensurePermissions()
        +─ enableBluetooth()
        +─ connect(mac)         ── one silent retry on transient failure
        +─ printBlocks(blocks)  ── translate each block to BluetoothEscposPrinter calls
        +─ feed 3 lines         ── clear the tear bar
        |
        v
[UI] state → done | error (with PrinterError.code → localized message)
```

## Receipt layout (58mm, 32 characters wide)

```
       <SHOP NAME>           ← centered, bold, double-height
     <shop address>          ← centered, normal (skipped if empty)
--------------------------------
No.  : 000123
Tgl  : 27/05/2026 14:32
--------------------------------
Kopi Susu Gula Aren
  2 x 18.000          36.000
Roti Bakar Coklat
  1 x 12.000          12.000
--------------------------------
TOTAL              Rp 48.000  ← bold
Bayar              Rp 50.000
Kembali            Rp  2.000
--------------------------------
Catatan: <notes>              ← only when notes present, wrapped at 32 chars
--------------------------------
       <footer text>          ← centered
        ~~~ * * * ~~~
```

- Number format reuses the existing `id-ID` locale formatter.
- Long item names wrap to as many 32-character lines as needed; the qty/subtotal line is always indented two spaces under the last name line so columns stay aligned.
- Currency uses the `Rp ` prefix; amounts are right-aligned via `printColumn`.
- Transaction ID is zero-padded to 6 digits (`000123`).
- Date format: `DD/MM/YYYY HH:mm` in the device's local timezone.

## Error handling

`services/printer` always throws `PrinterError { code, message }`. UI maps `code` to a Bahasa Indonesia message and a recovery action:

| `code`              | Message                       | Recovery action                              |
|---------------------|-------------------------------|----------------------------------------------|
| `bluetooth_off`     | Bluetooth nonaktif            | "Aktifkan" → fires enable intent             |
| `permission_denied` | Izin Bluetooth ditolak        | "Buka Pengaturan" → app settings deep link   |
| `not_found`         | Printer tidak ditemukan       | "Pilih printer lain" → `/printer-setup`      |
| `connect_failed`    | Gagal terhubung ke printer    | "Coba lagi" → re-run `printReceipt`          |
| `print_failed`      | Gagal mencetak                | "Coba lagi" → re-run `printReceipt`          |

## Dev pipeline changes

One-time setup, documented in a new "Development build" section of the README:

1. `npm install tp-react-native-bluetooth-printer`.
2. Register `./plugins/with-bluetooth-printer.js` in `app.json` `plugins`.
3. `npx expo prebuild --clean` — generates `android/` and `ios/`.
4. `npm run android` — builds and installs on the connected device. Expo Go is no longer used.

The generated `android/` folder is reproducible from `app.json` + the plugin, so it does not need to be hand-edited.

## Testing strategy

- **Unit tests (Jest, runs in CI without device):** `services/receipt.ts` is pure. Table-driven cases cover header presence/absence, empty notes, very long product names that wrap, single- vs multi-line items, zero-change vs positive-change transactions. The receipt builder is where almost all logic correctness lives.
- **Manual smoke tests on real hardware:** the printer service. Documented in the PR description as a checklist:
  - scan → connect → test print
  - checkout → print on success screen
  - history → open transaction → reprint
  - kill app, reopen, reprint (cold-connection path)
  - toggle Bluetooth off mid-flow (error path)
- No mocking of the native module. The receipt builder gives all the unit confidence; mocking a thin wrapper around a vendor SDK is performative.

## File map

New:

- `plugins/with-bluetooth-printer.js`
- `services/printer.ts`
- `services/receipt.ts`
- `db/settings.ts`
- `app/(tabs)/settings.tsx`
- `app/printer-setup.tsx`
- `__tests__/receipt.test.ts`

Modified:

- `db/database.ts` — add `app_settings` table to schema
- `app/(tabs)/_layout.tsx` — register Settings tab
- `app/checkout.tsx` — add "Cetak struk" button to success screen
- `app/(tabs)/history.tsx` — add "Cetak ulang" button to detail modal
- `i18n/translations.ts` — new `printer.*` and `settings.*` namespaces
- `app.json` — register Expo config plugin
- `package.json` — add `tp-react-native-bluetooth-printer`
- `README.md` — add "Development build" section

## Risks (worth being aware of, not blockers)

- **Android 12+ permission model:** `BLUETOOTH_SCAN` and `BLUETOOTH_CONNECT` are split from the legacy `BLUETOOTH` group. The user sees two permission prompts on first install. Acceptable.
- **Library health:** `tp-react-native-bluetooth-printer` is community-maintained and depends on Android's Classic Bluetooth API, which is quietly deprecated by Google in favor of BLE. Long-horizon risk; not actionable today.
- **New architecture interop:** occasional rough edges with non-TurboModule libraries. If we hit one, the last-resort fallback is disabling the new arch only for this module via a build property.
