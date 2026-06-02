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
