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

  it('renders the shop address as a centered line when set', () => {
    const blocks = buildReceipt(baseTransaction, baseItems, baseShop);
    expect(blocks[1]).toEqual({
      kind: 'text',
      text: 'Jl. Mawar 12',
      align: 'center',
    });
  });

  it('skips the address line when address is empty', () => {
    const blocks = buildReceipt(baseTransaction, baseItems, { ...baseShop, address: '' });
    expect(blocks[1]).toEqual({ kind: 'divider' });
  });

  it('renders the transaction number zero-padded to 6 digits', () => {
    const blocks = buildReceipt(baseTransaction, baseItems, baseShop);
    expect(blocks).toContainEqual({
      kind: 'text',
      text: 'No.  : 000123',
      align: 'left',
    });
  });

  it('renders the date as DD/MM/YYYY HH:mm in device local time', () => {
    const blocks = buildReceipt(baseTransaction, baseItems, baseShop);
    const dateBlock = blocks.find(
      (b) => b.kind === 'text' && (b as { text: string }).text.startsWith('Tgl  :'),
    );
    expect(dateBlock).toBeDefined();
    expect((dateBlock as { text: string }).text).toMatch(/^Tgl  : \d{2}\/\d{2}\/\d{4} \d{2}:\d{2}$/);
  });

  it('renders each item as a name line followed by an indented qty x price / subtotal columns line', () => {
    const blocks = buildReceipt(baseTransaction, baseItems, baseShop);
    expect(blocks).toContainEqual({ kind: 'text', text: 'Kopi Susu Gula Aren', align: 'left' });
    expect(blocks).toContainEqual({ kind: 'columns', cols: ['  2 x 18.000', '36.000'] });
    expect(blocks).toContainEqual({ kind: 'text', text: 'Roti Bakar Coklat', align: 'left' });
    expect(blocks).toContainEqual({ kind: 'columns', cols: ['  1 x 12.000', '12.000'] });
  });

  it('wraps long product names into 32-char chunks before the qty line', () => {
    const longName = 'A'.repeat(70); // 70 chars → 32 + 32 + 6
    const items: TransactionItem[] = [
      { id: 9, transaction_id: 123, product_id: 9, product_name: longName, price: 1000, qty: 1, subtotal: 1000 },
    ];
    const blocks = buildReceipt(baseTransaction, items, baseShop);
    const nameLines = blocks
      .filter((b): b is { kind: 'text'; text: string } =>
        b.kind === 'text' && (b as { text: string }).text.startsWith('A'),
      )
      .map((b) => b.text);
    expect(nameLines).toEqual(['A'.repeat(32), 'A'.repeat(32), 'A'.repeat(6)]);
  });

  it('renders Total (bold), Bayar, and Kembali rows with Rp prefix', () => {
    const blocks = buildReceipt(baseTransaction, baseItems, baseShop);
    expect(blocks).toContainEqual({ kind: 'columns', cols: ['TOTAL', 'Rp 48.000'], bold: true });
    expect(blocks).toContainEqual({ kind: 'columns', cols: ['Bayar', 'Rp 50.000'] });
    expect(blocks).toContainEqual({ kind: 'columns', cols: ['Kembali', 'Rp 2.000'] });
  });

  it('omits the Kembali row when change is zero', () => {
    const exact: Transaction = { ...baseTransaction, amount_paid: 48000, change_amount: 0 };
    const blocks = buildReceipt(exact, baseItems, baseShop);
    expect(blocks.some((b) => b.kind === 'columns' && b.cols[0] === 'Kembali')).toBe(false);
  });

  it('renders the notes section with a leading divider when notes are present', () => {
    const withNotes: Transaction = { ...baseTransaction, notes: 'Pelanggan tetap' };
    const blocks = buildReceipt(withNotes, baseItems, baseShop);
    const idx = blocks.findIndex((b) => b.kind === 'text' && (b as { text: string }).text.startsWith('Catatan:'));
    expect(idx).toBeGreaterThan(-1);
    expect(blocks[idx - 1]).toEqual({ kind: 'divider' });
    expect((blocks[idx] as { text: string }).text).toBe('Catatan: Pelanggan tetap');
  });

  it('omits the notes section entirely when notes is null or blank', () => {
    const blocks = buildReceipt(baseTransaction, baseItems, baseShop);
    expect(blocks.some((b) => b.kind === 'text' && (b as { text: string }).text.startsWith('Catatan:'))).toBe(false);
  });

  it('renders the footer centered, then a feed for the tear bar', () => {
    const blocks = buildReceipt(baseTransaction, baseItems, baseShop);
    const footerIdx = blocks.findIndex(
      (b) => b.kind === 'text' && (b as { text: string }).text === 'Terima kasih',
    );
    expect(footerIdx).toBeGreaterThan(-1);
    expect((blocks[footerIdx] as { align: string }).align).toBe('center');
    const tail = blocks.slice(footerIdx + 1);
    expect(tail.some((b) => b.kind === 'feed')).toBe(true);
  });
});
