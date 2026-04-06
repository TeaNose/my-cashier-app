import { getDatabase } from './database';

export type Product = {
  id: number;
  name: string;
  sku: string | null;
  barcode: string | null;
  category_id: number | null;
  unit: string | null;
  buy_price: number;
  sell_price: number;
  stock_qty: number;
  min_stock_alert: number;
  is_active: number;
  created_at: string;
  updated_at: string;
};

export type CreateProductInput = {
  name: string;
  sku?: string;
  barcode?: string;
  category_id?: number | null;
  unit?: string;
  buy_price?: number;
  sell_price: number;
  stock_qty?: number;
  min_stock_alert?: number;
  is_active?: boolean;
};

export async function createProduct(input: CreateProductInput): Promise<Product> {
  const db = await getDatabase();
  const result = await db.runAsync(
    `INSERT INTO products (name, sku, barcode, category_id, unit, buy_price, sell_price, stock_qty, min_stock_alert, is_active)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    input.name.trim(),
    input.sku?.trim() || null,
    input.barcode?.trim() || null,
    input.category_id ?? null,
    input.unit?.trim() || null,
    input.buy_price ?? 0,
    input.sell_price,
    input.stock_qty ?? 0,
    input.min_stock_alert ?? 0,
    input.is_active === false ? 0 : 1,
  );
  const row = await db.getFirstAsync<Product>(
    'SELECT * FROM products WHERE id = ?',
    result.lastInsertRowId,
  );
  return row!;
}

export async function getProducts(): Promise<Product[]> {
  const db = await getDatabase();
  return db.getAllAsync<Product>('SELECT * FROM products ORDER BY name ASC');
}

export async function deleteProduct(id: number): Promise<void> {
  const db = await getDatabase();
  await db.runAsync('DELETE FROM products WHERE id = ?', id);
}
