import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';

import { parseProductsCsv, type ParsedProductRow } from '@/services/products-csv';

export class ImportError extends Error {
  code: 'cancelled' | 'empty' | 'no_valid_rows' | 'failed';
  constructor(code: 'cancelled' | 'empty' | 'no_valid_rows' | 'failed') {
    super(code);
    this.name = 'ImportError';
    this.code = code;
  }
}

// Let the user pick a CSV file, read it, and parse it. Does NOT touch the
// database — the caller confirms with the user, then applies importProducts.
export async function pickAndParseProductsCsv(): Promise<{
  rows: ParsedProductRow[];
  skipped: number;
}> {
  let result: DocumentPicker.DocumentPickerResult;
  try {
    result = await DocumentPicker.getDocumentAsync({
      // Some Android file providers mistype CSVs; '*/*' keeps them selectable.
      type: ['text/csv', 'text/comma-separated-values', 'application/csv', '*/*'],
      copyToCacheDirectory: true,
    });
  } catch {
    throw new ImportError('failed');
  }

  if (result.canceled || !result.assets || result.assets.length === 0) {
    throw new ImportError('cancelled');
  }

  let text: string;
  try {
    const file = new File(result.assets[0].uri);
    text = await file.text();
  } catch {
    throw new ImportError('failed');
  }

  const { rows, skipped } = parseProductsCsv(text);
  if (rows.length === 0 && skipped === 0) throw new ImportError('empty');
  if (rows.length === 0) throw new ImportError('no_valid_rows');
  return { rows, skipped };
}
