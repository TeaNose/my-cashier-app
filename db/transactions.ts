import { getDatabase } from './database';
import { t } from '@/i18n';

export type Transaction = {
  id: number;
  total: number;
  amount_paid: number;
  change_amount: number;
  payment_method: string;
  notes: string | null;
  created_at: string;
};

export type TransactionItem = {
  id: number;
  transaction_id: number;
  product_id: number;
  product_name: string;
  price: number;
  qty: number;
  subtotal: number;
};

export type CartItem = {
  product_id: number;
  product_name: string;
  price: number;
  qty: number;
};

export type TransactionWithItems = Transaction & {
  items: TransactionItem[];
};

export async function createTransaction(
  items: CartItem[],
  amountPaid: number,
  paymentMethod: string = 'cash',
  notes?: string,
): Promise<Transaction> {
  const db = await getDatabase();
  const total = items.reduce((sum, item) => sum + item.price * item.qty, 0);
  const changeAmount = amountPaid - total;

  const result = await db.runAsync(
    `INSERT INTO transactions (total, amount_paid, change_amount, payment_method, notes)
     VALUES (?, ?, ?, ?, ?)`,
    total,
    amountPaid,
    changeAmount,
    paymentMethod,
    notes?.trim() || null,
  );

  const transactionId = result.lastInsertRowId;

  for (const item of items) {
    await db.runAsync(
      `INSERT INTO transaction_items (transaction_id, product_id, product_name, price, qty, subtotal)
       VALUES (?, ?, ?, ?, ?, ?)`,
      transactionId,
      item.product_id,
      item.product_name,
      item.price,
      item.qty,
      item.price * item.qty,
    );

    // Deduct stock
    await db.runAsync(
      `UPDATE products SET stock_qty = MAX(0, stock_qty - ?) WHERE id = ?`,
      item.qty,
      item.product_id,
    );
  }

  const row = await db.getFirstAsync<Transaction>(
    'SELECT * FROM transactions WHERE id = ?',
    transactionId,
  );
  return row!;
}

export async function getTransactions(): Promise<Transaction[]> {
  const db = await getDatabase();
  return db.getAllAsync<Transaction>(
    'SELECT * FROM transactions ORDER BY created_at DESC',
  );
}

export async function getTransactionsByDate(date: Date): Promise<Transaction[]> {
  const db = await getDatabase();
  // Build local-day [start, end) range, then convert to UTC ISO strings
  // because created_at is stored in UTC by SQLite's CURRENT_TIMESTAMP.
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const end = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1);
  const toSqlUtc = (d: Date) =>
    d.toISOString().slice(0, 19).replace('T', ' ');
  return db.getAllAsync<Transaction>(
    'SELECT * FROM transactions WHERE created_at >= ? AND created_at < ? ORDER BY created_at DESC',
    toSqlUtc(start),
    toSqlUtc(end),
  );
}

function csvField(value: string | number): string {
  const s = String(value);
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function formatCsvDate(createdAt: string): string {
  // created_at is stored in UTC; append 'Z' so it's parsed as UTC, then show local time.
  const d = new Date(createdAt + 'Z');
  return d.toLocaleString('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function buildTransactionsCsv(
  transactions: Transaction[],
  shopName: string,
  date: Date,
): string {
  const dateLabel = date.toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  const rows: string[] = [];
  rows.push(csvField(shopName || t('export.untitled_shop')));
  rows.push(csvField(`${t('export.title')} - ${dateLabel}`));
  rows.push('');
  rows.push(
    [
      t('export.col_id'),
      t('export.col_date'),
      t('export.col_total'),
      t('export.col_paid'),
      t('export.col_change'),
      t('export.col_method'),
      t('export.col_notes'),
    ]
      .map(csvField)
      .join(','),
  );

  for (const tx of transactions) {
    rows.push(
      [
        tx.id,
        formatCsvDate(tx.created_at),
        tx.total,
        tx.amount_paid,
        tx.change_amount,
        tx.payment_method,
        tx.notes ?? '',
      ]
        .map(csvField)
        .join(','),
    );
  }

  // Prepend a UTF-8 BOM so Excel reads non-ASCII text correctly.
  return '﻿' + rows.join('\r\n') + '\r\n';
}

export async function getTransactionWithItems(id: number): Promise<TransactionWithItems | null> {
  const db = await getDatabase();
  const transaction = await db.getFirstAsync<Transaction>(
    'SELECT * FROM transactions WHERE id = ?',
    id,
  );
  if (!transaction) return null;

  const items = await db.getAllAsync<TransactionItem>(
    'SELECT * FROM transaction_items WHERE transaction_id = ?',
    id,
  );

  return { ...transaction, items };
}
