import { getDatabase } from './database';

export type Category = {
  id: number;
  name: string;
  description: string | null;
  created_at: string;
  updated_at: string;
};

export async function createCategory(name: string, description: string): Promise<Category> {
  const db = await getDatabase();
  const result = await db.runAsync(
    'INSERT INTO categories (name, description) VALUES (?, ?)',
    name.trim(),
    description.trim() || null,
  );
  const row = await db.getFirstAsync<Category>(
    'SELECT * FROM categories WHERE id = ?',
    result.lastInsertRowId,
  );
  return row!;
}

export async function getCategories(): Promise<Category[]> {
  const db = await getDatabase();
  return db.getAllAsync<Category>('SELECT * FROM categories ORDER BY name ASC');
}

export async function deleteCategory(id: number): Promise<void> {
  const db = await getDatabase();
  await db.runAsync('DELETE FROM categories WHERE id = ?', id);
}
