import type { Transaction, TransactionItem } from '@/db/transactions';
import type { ShopInfo } from '@/db/settings';

function formatNumber(n: number): string {
  return n.toLocaleString('id-ID');
}

function wrap(text: string, width: number): string[] {
  if (text.length <= width) return [text];
  const lines: string[] = [];
  let remaining = text;
  while (remaining.length > width) {
    lines.push(remaining.slice(0, width));
    remaining = remaining.slice(width);
  }
  if (remaining.length > 0) lines.push(remaining);
  return lines;
}

export type ReceiptBlock =
  | { kind: 'text'; text: string; align?: 'left' | 'center' | 'right'; bold?: boolean; size?: 'normal' | 'double' }
  | { kind: 'columns'; cols: [string, string]; bold?: boolean }
  | { kind: 'divider' }
  | { kind: 'feed'; lines: number };

export const RECEIPT_WIDTH = 32;

export function buildReceipt(
  transaction: Transaction,
  items: TransactionItem[],
  shopInfo: ShopInfo,
): ReceiptBlock[] {
  const blocks: ReceiptBlock[] = [];

  blocks.push({
    kind: 'text',
    text: shopInfo.name,
    align: 'center',
    bold: true,
    size: 'double',
  });

  if (shopInfo.address.trim().length > 0) {
    blocks.push({ kind: 'text', text: shopInfo.address, align: 'center' });
  }

  blocks.push({ kind: 'divider' });

  const idStr = String(transaction.id).padStart(6, '0');
  blocks.push({ kind: 'text', text: `No.  : ${idStr}`, align: 'left' });

  const created = new Date(transaction.created_at + 'Z');
  const pad = (n: number) => String(n).padStart(2, '0');
  const dateStr =
    `${pad(created.getDate())}/${pad(created.getMonth() + 1)}/${created.getFullYear()} ` +
    `${pad(created.getHours())}:${pad(created.getMinutes())}`;
  blocks.push({ kind: 'text', text: `Tgl  : ${dateStr}`, align: 'left' });

  blocks.push({ kind: 'divider' });

  for (const item of items) {
    for (const line of wrap(item.product_name, RECEIPT_WIDTH)) {
      blocks.push({ kind: 'text', text: line, align: 'left' });
    }
    blocks.push({
      kind: 'columns',
      cols: [`  ${item.qty} x ${formatNumber(item.price)}`, formatNumber(item.subtotal)],
    });
  }

  blocks.push({ kind: 'divider' });

  blocks.push({ kind: 'columns', cols: ['TOTAL', `Rp ${formatNumber(transaction.total)}`], bold: true });
  blocks.push({ kind: 'columns', cols: ['Bayar', `Rp ${formatNumber(transaction.amount_paid)}`] });
  if (transaction.change_amount > 0) {
    blocks.push({ kind: 'columns', cols: ['Kembali', `Rp ${formatNumber(transaction.change_amount)}`] });
  }

  const notes = transaction.notes?.trim();
  if (notes) {
    blocks.push({ kind: 'divider' });
    for (const line of wrap(`Catatan: ${notes}`, RECEIPT_WIDTH)) {
      blocks.push({ kind: 'text', text: line, align: 'left' });
    }
  }

  blocks.push({ kind: 'divider' });
  blocks.push({ kind: 'text', text: shopInfo.footer, align: 'center' });
  blocks.push({ kind: 'feed', lines: 3 });

  return blocks;
}
