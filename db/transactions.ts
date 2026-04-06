import { getDatabase } from './database';

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
