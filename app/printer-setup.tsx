// app/printer-setup.tsx
import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, FlatList, TouchableOpacity, ActivityIndicator } from 'react-native';
import { router } from 'expo-router';
import FontAwesome5 from '@expo/vector-icons/FontAwesome5';

import { Text, View } from '@/components/Themed';
import { useTheme } from '@/hooks/useTheme';
import { setSavedPrinter } from '@/db/settings';
import {
  ensurePermissions,
  enableBluetooth,
  scanDevices,
  connect,
  printBlocks,
  PrinterError,
  type BluetoothDevice,
} from '@/services/printer';
import { t } from '@/i18n';

type Status = 'idle' | 'scanning' | 'connecting' | 'connected' | 'testing' | 'error';

function errorKey(code: PrinterError['code']): string {
  return `printer.err_${code}`;
}

export default function PrinterSetupScreen() {
  const { tint, background, inputBorder } = useTheme();
  const [paired, setPaired] = useState<BluetoothDevice[]>([]);
  const [found, setFound] = useState<BluetoothDevice[]>([]);
  const [selected, setSelected] = useState<BluetoothDevice | null>(null);
  const [status, setStatus] = useState<Status>('idle');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleError = (e: unknown) => {
    if (e instanceof PrinterError) {
      setErrorMsg(t(errorKey(e.code) as any));
    } else {
      setErrorMsg(t('common.error'));
    }
    setStatus('error');
  };

  const runScan = useCallback(async () => {
    setErrorMsg(null);
    setStatus('scanning');
    try {
      await ensurePermissions();
      await enableBluetooth();
      const { paired: p, found: f } = await scanDevices();
      setPaired(p);
      setFound(f);
      setStatus('idle');
    } catch (e) {
      handleError(e);
    }
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      setErrorMsg(null);
      setStatus('scanning');
      try {
        await ensurePermissions();
        await enableBluetooth();
        const { paired: p, found: f } = await scanDevices();
        if (!alive) return;
        setPaired(p);
        setFound(f);
        setStatus('idle');
      } catch (e) {
        if (!alive) return;
        if (e instanceof PrinterError) {
          setErrorMsg(t(errorKey(e.code) as any));
        } else {
          setErrorMsg(t('common.error'));
        }
        setStatus('error');
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const handlePick = async (device: BluetoothDevice) => {
    setErrorMsg(null);
    setSelected(device);
    setStatus('connecting');
    try {
      await connect(device.address);
      setStatus('connected');
    } catch (e) {
      handleError(e);
    }
  };

  const handleTest = async () => {
    if (!selected) return;
    setErrorMsg(null);
    setStatus('testing');
    try {
      await printBlocks([
        { kind: 'text', text: '*** TEST PRINT ***', align: 'center', bold: true },
        { kind: 'feed', lines: 2 },
      ]);
      setStatus('connected');
    } catch (e) {
      handleError(e);
    }
  };

  const handleSave = async () => {
    if (!selected) return;
    try {
      await setSavedPrinter({ mac: selected.address, name: selected.name || selected.address });
      router.back();
    } catch {
      setErrorMsg(t('common.error'));
      setStatus('error');
    }
  };

  const renderDevice = (device: BluetoothDevice) => {
    const isSelected = selected?.address === device.address;
    return (
      <View key={device.address} style={[styles.deviceCard, { borderColor: inputBorder }]}>
        <TouchableOpacity
          style={styles.deviceRow}
          onPress={() => handlePick(device)}
          disabled={status === 'connecting' || status === 'scanning' || status === 'testing'}
        >
          <FontAwesome5
            name={isSelected && status === 'connected' ? 'check-circle' : 'bluetooth'}
            size={20}
            color={tint}
            style={{ marginRight: 12 }}
          />
          <View style={{ flex: 1 }}>
            <Text style={styles.deviceName}>{device.name || t('printer.no_name')}</Text>
            <Text style={styles.deviceMac}>{device.address}</Text>
          </View>
          {isSelected && status === 'connecting' && <ActivityIndicator />}
        </TouchableOpacity>
        {isSelected && (status === 'connected' || status === 'testing') && (
          <View style={styles.deviceActions}>
            <TouchableOpacity
              style={[styles.btn, { backgroundColor: '#34C759' }]}
              onPress={handleTest}
              disabled={status === 'testing'}
            >
              <Text style={styles.btnText}>
                {status === 'testing' ? t('printer.printing') : t('printer.test_print')}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.btn, { backgroundColor: tint }]} onPress={handleSave}>
              <Text style={styles.btnText}>{t('printer.save')}</Text>
            </TouchableOpacity>
          </View>
        )}
        {isSelected && status === 'error' && errorMsg && (
          <Text style={styles.errorText}>{errorMsg}</Text>
        )}
      </View>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: background }]}>
      {status === 'scanning' && (
        <View style={styles.bannerRow}>
          <ActivityIndicator />
          <Text style={styles.bannerText}>{t('printer.scanning')}</Text>
        </View>
      )}
      {status === 'error' && !selected && errorMsg && (
        <View style={styles.bannerRow}>
          <Text style={[styles.bannerText, { color: '#FF3B30' }]}>{errorMsg}</Text>
          <TouchableOpacity onPress={runScan} style={[styles.btn, { backgroundColor: tint }]}>
            <Text style={styles.btnText}>{t('printer.try_again')}</Text>
          </TouchableOpacity>
        </View>
      )}

      <FlatList
        ListHeaderComponent={
          <>
            <Text style={styles.section}>{t('printer.paired_section')}</Text>
            {paired.length === 0 && <Text style={styles.empty}>—</Text>}
            {paired.map(renderDevice)}
            <Text style={[styles.section, { marginTop: 16 }]}>{t('printer.found_section')}</Text>
            {found.length === 0 && <Text style={styles.empty}>—</Text>}
            {found.map(renderDevice)}
          </>
        }
        data={[]}
        renderItem={null}
        contentContainerStyle={{ padding: 16 }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  bannerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
  },
  bannerText: { flex: 1, fontSize: 14 },
  section: { fontSize: 16, fontWeight: '700', marginBottom: 8 },
  empty: { opacity: 0.5, marginBottom: 8 },
  deviceCard: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    marginBottom: 10,
  },
  deviceRow: { flexDirection: 'row', alignItems: 'center' },
  deviceName: { fontSize: 15, fontWeight: '600' },
  deviceMac: { fontSize: 12, opacity: 0.6, marginTop: 2 },
  deviceActions: { flexDirection: 'row', gap: 10, marginTop: 10 },
  btn: { borderRadius: 8, paddingHorizontal: 14, paddingVertical: 10 },
  btnText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  errorText: { color: '#FF3B30', marginTop: 8, fontSize: 13 },
});
