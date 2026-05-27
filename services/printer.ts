// services/printer.ts
import { PermissionsAndroid, Platform } from 'react-native';
import {
  BluetoothManager,
  BluetoothEscposPrinter,
  ALIGN as PrinterAlign,
} from 'tp-react-native-bluetooth-printer';
import type { ReceiptBlock } from './receipt';

export type PrinterErrorCode =
  | 'bluetooth_off'
  | 'permission_denied'
  | 'not_found'
  | 'connect_failed'
  | 'print_failed';

export class PrinterError extends Error {
  constructor(public code: PrinterErrorCode, message?: string) {
    super(message ?? code);
    this.name = 'PrinterError';
  }
}

export type BluetoothDevice = { name: string; address: string };

let connectedMac: string | null = null;

const ALIGN = {
  left: PrinterAlign.LEFT,
  center: PrinterAlign.CENTER,
  right: PrinterAlign.RIGHT,
};

export async function ensurePermissions(): Promise<void> {
  if (Platform.OS !== 'android') return;
  const sdk = Platform.Version as number;
  const needed: string[] =
    sdk >= 31
      ? [
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
        ]
      : [PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION];
  const result = await PermissionsAndroid.requestMultiple(needed as any);
  const allGranted = needed.every(
    (p) => result[p as keyof typeof result] === PermissionsAndroid.RESULTS.GRANTED,
  );
  if (!allGranted) throw new PrinterError('permission_denied');
}

export async function enableBluetooth(): Promise<void> {
  try {
    const isEnabled = await BluetoothManager.isBluetoothEnabled();
    if ((isEnabled as any) === 'true' || isEnabled === true) return;
    await BluetoothManager.enableBluetooth();
  } catch (e: any) {
    throw new PrinterError('bluetooth_off', e?.message);
  }
}

export async function scanDevices(): Promise<{ paired: BluetoothDevice[]; found: BluetoothDevice[] }> {
  try {
    const raw = await BluetoothManager.scanDevices();
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    const toDev = (d: any): BluetoothDevice => ({ name: d?.name ?? '(tanpa nama)', address: d?.address });
    return {
      paired: (parsed?.paired ?? []).map(toDev),
      found: (parsed?.found ?? []).map(toDev),
    };
  } catch (e: any) {
    throw new PrinterError('not_found', e?.message);
  }
}

export function isConnected(): boolean {
  return connectedMac !== null;
}

export async function connect(mac: string): Promise<void> {
  if (connectedMac === mac) return;
  try {
    await BluetoothManager.connect(mac);
    connectedMac = mac;
  } catch (e: any) {
    // One silent retry on transient failure.
    try {
      await BluetoothManager.connect(mac);
      connectedMac = mac;
    } catch (e2: any) {
      connectedMac = null;
      throw new PrinterError('connect_failed', e2?.message ?? e?.message);
    }
  }
}

export async function disconnect(): Promise<void> {
  // tp-react-native-bluetooth-printer exposes no disconnect method on the
  // native side; clearing the cached MAC is the most we can do. The
  // underlying socket is closed by the OS when the app backgrounds or the
  // peer device drops the connection.
  connectedMac = null;
}

async function emitBlock(block: ReceiptBlock): Promise<void> {
  switch (block.kind) {
    case 'text': {
      await BluetoothEscposPrinter.printerAlign(ALIGN[block.align ?? 'left']);
      await BluetoothEscposPrinter.setBold(block.bold ? 1 : 0);
      const opts: any = {
        widthtimes: block.size === 'double' ? 1 : 0,
        heigthtimes: block.size === 'double' ? 1 : 0,
        fonttype: 0,
      };
      await BluetoothEscposPrinter.printText(block.text + '\r\n', opts);
      await BluetoothEscposPrinter.setBold(0);
      break;
    }
    case 'columns': {
      await BluetoothEscposPrinter.printerAlign(ALIGN.left);
      await BluetoothEscposPrinter.setBold(block.bold ? 1 : 0);
      const leftWidth = 20;
      const rightWidth = 12;
      await BluetoothEscposPrinter.printColumn(
        [leftWidth, rightWidth],
        [PrinterAlign.LEFT, PrinterAlign.RIGHT],
        [block.cols[0], block.cols[1]],
        { encoding: 'CP437', codepage: 0, fonttype: 0 } as any,
      );
      await BluetoothEscposPrinter.setBold(0);
      break;
    }
    case 'divider': {
      await BluetoothEscposPrinter.printerAlign(ALIGN.left);
      await BluetoothEscposPrinter.printText('-'.repeat(32) + '\r\n', {});
      break;
    }
    case 'feed': {
      await BluetoothEscposPrinter.printText('\r\n'.repeat(block.lines), {});
      break;
    }
  }
}

export async function printBlocks(blocks: ReceiptBlock[]): Promise<void> {
  try {
    for (const block of blocks) {
      await emitBlock(block);
    }
  } catch (e: any) {
    throw new PrinterError('print_failed', e?.message);
  }
}

export async function printReceipt(mac: string, blocks: ReceiptBlock[]): Promise<void> {
  await ensurePermissions();
  await enableBluetooth();
  await connect(mac);
  await printBlocks(blocks);
}
