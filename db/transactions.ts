import { getDatabase } from './database';
import { threeMonthsAgoUtc } from '@/utils/date';
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
  // Current buy price of the linked product, joined in for reporting/export.
  // Null when the product no longer exists.
  buy_price?: number | null;
};

export type CartItem = {
  product_id: number;
  product_name: string;
  price: number;
  qty: number;
};

// Stable payment method codes stored in the DB. 'cash' is the default.
export const PAYMENT_METHODS = ['cash', 'qris', 'transfer', 'kasbon'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

// Human-readable label for a stored payment method code (falls back to the
// raw code for unknown values, e.g. legacy data).
export function paymentMethodLabel(code: string): string {
  switch (code) {
    case 'cash':
      return t('checkout.pm_cash');
    case 'qris':
      return t('checkout.pm_qris');
    case 'transfer':
      return t('checkout.pm_transfer');
    case 'kasbon':
      return t('checkout.pm_kasbon');
    default:
      return code;
  }
}

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

// Housekeeping: remove transactions older than three months so the on-device
// DB doesn't grow unbounded. Linked transaction_items are deleted automatically
// via the ON DELETE CASCADE foreign key. Returns the number of rows removed.
export async function deleteOldTransactions(now: Date = new Date()): Promise<number> {
  const db = await getDatabase();
  const result = await db.runAsync(
    'DELETE FROM transactions WHERE created_at < ?',
    threeMonthsAgoUtc(now),
  );
  return result.changes;
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

export async function getTransactionsWithItemsByDate(
  date: Date,
): Promise<TransactionWithItems[]> {
  const db = await getDatabase();
  const transactions = await getTransactionsByDate(date);
  if (transactions.length === 0) return [];

  const ids = transactions.map((tx) => tx.id);
  const placeholders = ids.map(() => '?').join(',');
  const items = await db.getAllAsync<TransactionItem>(
    `SELECT ti.*, p.buy_price AS buy_price
     FROM transaction_items ti
     LEFT JOIN products p ON p.id = ti.product_id
     WHERE ti.transaction_id IN (${placeholders})`,
    ...ids,
  );

  const itemsByTx = new Map<number, TransactionItem[]>();
  for (const item of items) {
    const list = itemsByTx.get(item.transaction_id);
    if (list) list.push(item);
    else itemsByTx.set(item.transaction_id, [item]);
  }

  return transactions.map((tx) => ({ ...tx, items: itemsByTx.get(tx.id) ?? [] }));
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
  transactions: TransactionWithItems[],
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
      t('export.col_method'),
      t('export.col_product'),
      t('export.col_qty'),
      t('export.col_buy_price'),
      t('export.col_sell_price'),
      t('export.col_subtotal'),
      t('export.col_profit'),
      t('export.col_notes'),
    ]
      .map(csvField)
      .join(','),
  );

  let totalSubtotal = 0;
  let totalProfit = 0;

  for (const tx of transactions) {
    const txDate = formatCsvDate(tx.created_at);
    for (const item of tx.items) {
      const buyPrice = item.buy_price ?? 0;
      const profit = item.subtotal - buyPrice * item.qty;
      totalSubtotal += item.subtotal;
      totalProfit += profit;
      rows.push(
        [
          tx.id,
          txDate,
          paymentMethodLabel(tx.payment_method),
          item.product_name,
          item.qty,
          buyPrice,
          item.price,
          item.subtotal,
          profit,
          tx.notes ?? '',
        ]
          .map(csvField)
          .join(','),
      );
    }
  }

  // Totals row: sums of Subtotal and Laba, aligned to their columns.
  rows.push(
    [
      t('export.row_total'),
      '',
      '',
      '',
      '',
      '',
      '',
      totalSubtotal,
      totalProfit,
      '',
    ]
      .map(csvField)
      .join(','),
  );

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
