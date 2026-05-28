// app/(tabs)/settings.tsx
import { useCallback, useState } from 'react';
import { StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view';
import { router, useFocusEffect } from 'expo-router';
import FontAwesome from '@expo/vector-icons/FontAwesome';

import { Text, View } from '@/components/Themed';
import { FormInput } from '@/components/FormInput';
import { PrimaryButton } from '@/components/PrimaryButton';
import { useTheme } from '@/hooks/useTheme';
import {
  getShopInfo,
  setShopInfo,
  getSavedPrinter,
  setSavedPrinter,
  type SavedPrinter,
} from '@/db/settings';
import { t } from '@/i18n';

export default function SettingsScreen() {
  const { tint, background, inputBorder } = useTheme();
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [footer, setFooter] = useState('');
  const [printer, setPrinter] = useState<SavedPrinter | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const [info, p] = await Promise.all([getShopInfo(), getSavedPrinter()]);
    setName(info.name);
    setAddress(info.address);
    setFooter(info.footer);
    setPrinter(p);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const handleSave = async () => {
    setSaving(true);
    try {
      await setShopInfo({ name, address, footer });
      Alert.alert(t('common.success'), t('settings.saved'));
    } catch {
      Alert.alert(t('common.error'), t('common.try_again'));
    } finally {
      setSaving(false);
    }
  };

  const handleRemovePrinter = async () => {
    try {
      await setSavedPrinter(null);
      setPrinter(null);
    } catch {
      Alert.alert(t('common.error'), t('common.try_again'));
    }
  };

  return (
    <KeyboardAwareScrollView
      style={[styles.scroll, { backgroundColor: background }]}
      contentContainerStyle={styles.container}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={styles.section}>{t('settings.shop_section')}</Text>
      <FormInput label={t('settings.shop_name')} value={name} onChangeText={setName} />
      <FormInput
        label={t('settings.shop_address')}
        value={address}
        onChangeText={setAddress}
        multiline
      />
      <FormInput label={t('settings.receipt_footer')} value={footer} onChangeText={setFooter} />
      <PrimaryButton
        label={saving ? t('common.saving') : t('common.save')}
        onPress={handleSave}
      />

      <View style={styles.divider} />

      <Text style={styles.section}>{t('settings.printer_section')}</Text>
      <View style={[styles.printerRow, { borderColor: inputBorder }]}>
        <FontAwesome name="print" size={20} color={tint} style={{ marginRight: 12 }} />
        <View style={{ flex: 1 }}>
          <Text style={styles.printerName}>
            {printer ? printer.name : t('settings.not_set')}
          </Text>
          {printer && <Text style={styles.printerMac}>{printer.mac}</Text>}
        </View>
      </View>
      <View style={styles.printerActions}>
        <TouchableOpacity
          style={[styles.btn, { backgroundColor: tint }]}
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          onPress={() => (router as any).push('/printer-setup')}
        >
          <Text style={styles.btnText}>{t('settings.pick_printer')}</Text>
        </TouchableOpacity>
        {printer && (
          <TouchableOpacity
            style={[styles.btn, { backgroundColor: '#FF3B30' }]}
            onPress={handleRemovePrinter}
          >
            <Text style={styles.btnText}>{t('settings.remove_printer')}</Text>
          </TouchableOpacity>
        )}
      </View>
    </KeyboardAwareScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  container: { padding: 20, paddingBottom: 40 },
  section: { fontSize: 18, fontWeight: '700', marginTop: 8, marginBottom: 10 },
  divider: { height: 1, opacity: 0.2, marginVertical: 24, backgroundColor: '#888' },
  printerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 10,
    padding: 14,
    marginBottom: 12,
  },
  printerName: { fontSize: 15, fontWeight: '600' },
  printerMac: { fontSize: 12, opacity: 0.6, marginTop: 2 },
  printerActions: { flexDirection: 'row', gap: 10 },
  btn: { borderRadius: 8, paddingHorizontal: 14, paddingVertical: 10 },
  btnText: { color: '#fff', fontSize: 14, fontWeight: '700' },
});
