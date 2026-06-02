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
