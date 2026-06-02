import { File, Paths } from 'expo-file-system';
import { StorageAccessFramework } from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';

import { buildTransactionsCsv, getTransactionsWithItemsByDate } from '@/db/transactions';
import { getProductsForExport } from '@/db/products';
import { buildProductsCsv } from '@/services/products-csv';
import { getShopInfo } from '@/db/settings';

export class ExportError extends Error {
  code: 'sharing_unavailable' | 'failed';
  constructor(code: 'sharing_unavailable' | 'failed') {
    super(code);
    this.name = 'ExportError';
    this.code = code;
  }
}

// 'download' = save the file straight to device storage.
// 'share' = hand the file to the OS share sheet.
export type ExportMode = 'download' | 'share';

// 'saved' = written directly to a user-chosen folder on the device (Android).
// 'shared' = handed to the OS share sheet (iOS download fallback, or 'share').
export type ExportResult = { method: 'saved' | 'shared' };

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

async function shareCsv(csv: string, filename: string): Promise<ExportResult> {
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
  return { method: 'shared' };
}

async function downloadCsv(csv: string, filename: string): Promise<ExportResult> {
  // Android has a user-accessible filesystem: let the user pick a folder (e.g.
  // Download) and write the file straight there. iOS has no such folder, so we
  // fall back to the share sheet, where "Save to Files" is the equivalent.
  if (Platform.OS === 'android') {
    const permission =
      await StorageAccessFramework.requestDirectoryPermissionsAsync();
    if (permission.granted) {
      // createFileAsync wants the name without the extension; it appends one
      // based on the MIME type.
      const safUri = await StorageAccessFramework.createFileAsync(
        permission.directoryUri,
        filename.replace(/\.csv$/, ''),
        'text/csv',
      );
      await StorageAccessFramework.writeAsStringAsync(safUri, csv);
      return { method: 'saved' };
    }
    // Permission declined — fall back to sharing.
  }

  return shareCsv(csv, filename);
}

export async function exportTransactionsCsv(
  date: Date,
  mode: ExportMode,
): Promise<ExportResult> {
  const [shopInfo, transactions] = await Promise.all([
    getShopInfo(),
    getTransactionsWithItemsByDate(date),
  ]);
  const csv = buildTransactionsCsv(transactions, shopInfo.name, date);

  const prefix = sanitizeForFilename(shopInfo.name);
  const filename = `${prefix ? prefix + '-' : ''}transactions-${toDateStamp(date)}.csv`;

  try {
    return mode === 'download'
      ? await downloadCsv(csv, filename)
      : await shareCsv(csv, filename);
  } catch (e) {
    if (e instanceof ExportError) throw e;
    throw new ExportError('failed');
  }
}

export async function exportProductsCsv(mode: ExportMode): Promise<ExportResult> {
  const [shopInfo, products] = await Promise.all([getShopInfo(), getProductsForExport()]);
  const csv = buildProductsCsv(products, shopInfo.name);

  const prefix = sanitizeForFilename(shopInfo.name);
  const filename = `${prefix ? prefix + '-' : ''}products-${toDateStamp(new Date())}.csv`;

  try {
    return mode === 'download'
      ? await downloadCsv(csv, filename)
      : await shareCsv(csv, filename);
  } catch (e) {
    if (e instanceof ExportError) throw e;
    throw new ExportError('failed');
  }
}
