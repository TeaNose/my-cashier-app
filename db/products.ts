import { getDatabase } from './database';
import {
  matchExistingId,
  type ProductExportRow,
  type ParsedProductRow,
  type ExistingProduct,
} from '@/services/products-csv';

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
    input.name.trim().toUpperCase(),
    input.sku?.trim().toUpperCase() || null,
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

// Names and SKUs are stored uppercased, so duplicate checks compare uppercased
// values. Pass `excludeId` when editing to ignore the product being edited.
export async function productNameExists(name: string, excludeId?: number): Promise<boolean> {
  const value = name.trim().toUpperCase();
  if (!value) return false;
  const db = await getDatabase();
  const row =
    excludeId !== undefined
      ? await db.getFirstAsync<{ id: number }>(
          'SELECT id FROM products WHERE name = ? AND id != ?',
          value,
          excludeId,
        )
      : await db.getFirstAsync<{ id: number }>('SELECT id FROM products WHERE name = ?', value);
  return row !== null;
}

export async function skuExists(sku: string, excludeId?: number): Promise<boolean> {
  const value = sku.trim().toUpperCase();
  if (!value) return false;
  const db = await getDatabase();
  const row =
    excludeId !== undefined
      ? await db.getFirstAsync<{ id: number }>(
          'SELECT id FROM products WHERE sku = ? AND id != ?',
          value,
          excludeId,
        )
      : await db.getFirstAsync<{ id: number }>('SELECT id FROM products WHERE sku = ?', value);
  return row !== null;
}

export async function getProducts(): Promise<Product[]> {
  const db = await getDatabase();
  return db.getAllAsync<Product>('SELECT * FROM products ORDER BY name ASC');
}

export async function getProductById(id: number): Promise<Product | null> {
  const db = await getDatabase();
  return db.getFirstAsync<Product>('SELECT * FROM products WHERE id = ?', id);
}

export async function updateProduct(id: number, input: CreateProductInput): Promise<Product> {
  const db = await getDatabase();
  await db.runAsync(
    `UPDATE products SET name = ?, sku = ?, barcode = ?, category_id = ?, unit = ?, buy_price = ?, sell_price = ?, stock_qty = ?, min_stock_alert = ?, is_active = ?, updated_at = datetime('now')
     WHERE id = ?`,
    input.name.trim().toUpperCase(),
    input.sku?.trim().toUpperCase() || null,
    input.barcode?.trim() || null,
    input.category_id ?? null,
    input.unit?.trim() || null,
    input.buy_price ?? 0,
    input.sell_price,
    input.stock_qty ?? 0,
    input.min_stock_alert ?? 0,
    input.is_active === false ? 0 : 1,
    id,
  );
  const row = await db.getFirstAsync<Product>('SELECT * FROM products WHERE id = ?', id);
  return row!;
}

export async function deleteProduct(id: number): Promise<void> {
  const db = await getDatabase();
  await db.runAsync('DELETE FROM products WHERE id = ?', id);
}

export async function getProductsForExport(): Promise<ProductExportRow[]> {
  const db = await getDatabase();
  return db.getAllAsync<ProductExportRow>(
    `SELECT p.*, c.name AS category_name
     FROM products p
     LEFT JOIN categories c ON c.id = p.category_id
     ORDER BY p.name ASC`,
  );
}

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
  // Categories are stored uppercased; key the cache by uppercased name.
  const catByName = new Map(categories.map((c) => [c.name.toUpperCase(), c.id]));

  await db.withTransactionAsync(async () => {
    for (const row of rows) {
      let categoryId: number | null = null;
      if (row.category) {
        const key = row.category.trim().toUpperCase();
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

      // Names and SKUs are stored uppercased.
      const name = row.name.toUpperCase();
      const sku = row.sku ? row.sku.toUpperCase() : null;

      const matchId = matchExistingId(row, existing);
      if (matchId !== null) {
        await db.runAsync(
          `UPDATE products SET name = ?, sku = ?, barcode = ?, category_id = ?, unit = ?, buy_price = ?, sell_price = ?, stock_qty = ?, min_stock_alert = ?, is_active = ?, updated_at = datetime('now')
           WHERE id = ?`,
          name,
          sku,
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
          name,
          sku,
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
        existing.push({ id: res.lastInsertRowId, sku, name });
        added++;
      }
    }
  });

  return { added, updated };
}
