import { getDatabase } from './database';

export type ShopInfo = {
  name: string;
  address: string;
  footer: string;
};

export type SavedPrinter = {
  mac: string;
  name: string;
};

const DEFAULT_FOOTER = 'Terima kasih';

async function getSetting(key: string): Promise<string | null> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ value: string | null }>(
    'SELECT value FROM app_settings WHERE key = ?',
    key,
  );
  return row?.value ?? null;
}

async function setSetting(key: string, value: string | null): Promise<void> {
  const db = await getDatabase();
  if (value === null) {
    await db.runAsync('DELETE FROM app_settings WHERE key = ?', key);
    return;
  }
  await db.runAsync(
    `INSERT INTO app_settings (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    key,
    value,
  );
}

export async function getShopInfo(): Promise<ShopInfo> {
  const [name, address, footer] = await Promise.all([
    getSetting('shop_name'),
    getSetting('shop_address'),
    getSetting('receipt_footer'),
  ]);
  return {
    name: name ?? '',
    address: address ?? '',
    footer: footer ?? DEFAULT_FOOTER,
  };
}

export async function setShopInfo(info: ShopInfo): Promise<void> {
  await Promise.all([
    setSetting('shop_name', info.name),
    setSetting('shop_address', info.address),
    setSetting('receipt_footer', info.footer),
  ]);
}

export async function getSavedPrinter(): Promise<SavedPrinter | null> {
  const [mac, name] = await Promise.all([
    getSetting('printer_mac'),
    getSetting('printer_name'),
  ]);
  if (!mac) return null;
  return { mac, name: name ?? mac };
}

export async function setSavedPrinter(printer: SavedPrinter | null): Promise<void> {
  if (printer === null) {
    await Promise.all([
      setSetting('printer_mac', null),
      setSetting('printer_name', null),
    ]);
    return;
  }
  await Promise.all([
    setSetting('printer_mac', printer.mac),
    setSetting('printer_name', printer.name),
  ]);
}
