import { buildReceipt } from '@/services/receipt';
import type { Transaction, TransactionItem } from '@/db/transactions';
import type { ShopInfo } from '@/db/settings';

const baseTransaction: Transaction = {
  id: 123,
  total: 48000,
  amount_paid: 50000,
  change_amount: 2000,
  payment_method: 'cash',
  notes: null,
  created_at: '2026-05-27 14:32:00',
};

const baseItems: TransactionItem[] = [
  { id: 1, transaction_id: 123, product_id: 1, product_name: 'Kopi Susu Gula Aren', price: 18000, qty: 2, subtotal: 36000 },
  { id: 2, transaction_id: 123, product_id: 2, product_name: 'Roti Bakar Coklat', price: 12000, qty: 1, subtotal: 12000 },
];

const baseShop: ShopInfo = { name: 'Warung Kita', address: 'Jl. Mawar 12', footer: 'Terima kasih' };

describe('buildReceipt', () => {
  it('renders the shop name as a centered, bold, double-height heading', () => {
    const blocks = buildReceipt(baseTransaction, baseItems, baseShop);
    expect(blocks[0]).toEqual({
      kind: 'text',
      text: 'Warung Kita',
      align: 'center',
      bold: true,
      size: 'double',
    });
  });
});
