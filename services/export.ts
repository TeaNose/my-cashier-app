import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

import { buildTransactionsCsv, type Transaction } from '@/db/transactions';
import { getShopInfo } from '@/db/settings';

export class ExportError extends Error {
  code: 'sharing_unavailable' | 'failed';
  constructor(code: 'sharing_unavailable' | 'failed') {
    super(code);
    this.name = 'ExportError';
    this.code = code;
  }
}

function sanitizeForFilename(name: string): string {
  return name
    .trim()
    .replace(/[^a-zA-Z0-9-_ ]/g, '')
    .replace(/\s+/g, '-')
    .slice(0, 40);
}

function toDateStamp(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export async function exportTransactionsCsv(
  transactions: Transaction[],
  date: Date,
): Promise<void> {
  const shopInfo = await getShopInfo();
  const csv = buildTransactionsCsv(transactions, shopInfo.name, date);

  const prefix = sanitizeForFilename(shopInfo.name);
  const filename = `${prefix ? prefix + '-' : ''}transactions-${toDateStamp(date)}.csv`;

  try {
    const file = new File(Paths.cache, filename);
    file.create({ overwrite: true });
    file.write(csv);

    if (!(await Sharing.isAvailableAsync())) {
      throw new ExportError('sharing_unavailable');
    }

    await Sharing.shareAsync(file.uri, {
      mimeType: 'text/csv',
      UTI: 'public.comma-separated-values-text',
      dialogTitle: filename,
    });
  } catch (e) {
    if (e instanceof ExportError) throw e;
    throw new ExportError('failed');
  }
}
