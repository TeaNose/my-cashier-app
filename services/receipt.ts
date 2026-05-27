import type { Transaction, TransactionItem } from '@/db/transactions';
import type { ShopInfo } from '@/db/settings';

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

  return blocks;
}
