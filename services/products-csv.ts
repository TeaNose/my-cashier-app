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
