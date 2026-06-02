import { useState, useCallback, useEffect } from 'react';
import { StyleSheet, FlatList, TouchableOpacity, Modal, Platform, ActivityIndicator, Alert } from 'react-native';
import { useFocusEffect } from 'expo-router';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import DateTimePicker from '@react-native-community/datetimepicker';

import { Text, View } from '@/components/Themed';
import { useTheme } from '@/hooks/useTheme';
import {
  getTransactionsByDate,
  getTransactionWithItems,
  type Transaction,
  type TransactionWithItems,
} from '@/db/transactions';
import { t } from '@/i18n';
import { getShopInfo, getSavedPrinter, type SavedPrinter } from '@/db/settings';
import { buildReceipt } from '@/services/receipt';
import { printReceipt, PrinterError } from '@/services/printer';
import { exportTransactionsCsv, ExportError, type ExportMode } from '@/services/export';

export default function HistoryScreen() {
  const { tint, background, inputBorder } = useTheme();

  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [selected, setSelected] = useState<TransactionWithItems | null>(null);
  const [showDetail, setShowDetail] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [savedPrinter, setSavedPrinter] = useState<SavedPrinter | null>(null);
  const [printStatus, setPrintStatus] = useState<'idle' | 'printing' | 'done' | 'error'>('idle');
  const [printError, setPrintError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    getSavedPrinter().then(setSavedPrinter);
  }, []);

  const loadTransactions = useCallback((date: Date) => {
    getTransactionsByDate(date).then(setTransactions);
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadTransactions(selectedDate);
    }, [loadTransactions, selectedDate]),
  );

  const totalForDay = transactions.reduce((sum, t) => sum + t.total, 0);

  const formatDayLabel = (d: Date) => {
    const today = new Date();
    const isToday =
      d.getFullYear() === today.getFullYear() &&
      d.getMonth() === today.getMonth() &&
      d.getDate() === today.getDate();
    const label = d.toLocaleDateString('id-ID', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
    return isToday ? `${t('history.today')}, ${label}` : label;
  };

  const onDateChange = (_event: any, date?: Date) => {
    if (Platform.OS !== 'ios') setShowDatePicker(false);
    if (date) setSelectedDate(date);
  };

  const formatPrice = (price: number) =>
    price.toLocaleString('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 });

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr + 'Z');
    return d.toLocaleString('id-ID', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const viewDetail = async (id: number) => {
    const data = await getTransactionWithItems(id);
    if (data) {
      setSelected(data);
      setShowDetail(true);
      setPrintStatus('idle');
      setPrintError(null);
    }
  };

  const handleReprint = async () => {
    if (!savedPrinter || !selected) return;
    if (printStatus === 'printing') return;
    setPrintError(null);
    setPrintStatus('printing');
    try {
      const shopInfo = await getShopInfo();
      const blocks = buildReceipt(selected, selected.items, shopInfo);
      await printReceipt(savedPrinter.mac, blocks);
      setPrintStatus('done');
    } catch (e) {
      if (e instanceof PrinterError) {
        setPrintError(t(`printer.err_${e.code}` as any));
      } else {
        setPrintError(t('common.error'));
      }
      setPrintStatus('error');
    }
  };

  const runExport = async (mode: ExportMode) => {
    setExporting(true);
    try {
      const result = await exportTransactionsCsv(selectedDate, mode);
      if (result.method === 'saved') {
        Alert.alert(t('common.success'), t('export.saved'));
      }
    } catch (e) {
      const code = e instanceof ExportError ? e.code : 'failed';
      Alert.alert(t('common.error'), t(`export.${code}` as any));
    } finally {
      setExporting(false);
    }
  };

  const handleExport = () => {
    if (exporting || transactions.length === 0) return;
    Alert.alert(t('export.choose_title'), t('export.choose_message'), [
      { text: t('export.download'), onPress: () => runExport('download') },
      { text: t('export.share'), onPress: () => runExport('share') },
      { text: t('common.cancel'), style: 'cancel' },
    ]);
  };

  const renderTransaction = ({ item }: { item: Transaction }) => (
    <TouchableOpacity
      style={[styles.card, { borderColor: inputBorder }]}
      activeOpacity={0.7}
      onPress={() => viewDetail(item.id)}
    >
      <View style={styles.cardHeader}>
        <Text style={styles.txId}>#{item.id}</Text>
        <Text style={styles.txDate}>{formatDate(item.created_at)}</Text>
      </View>
      <View style={styles.cardBody}>
        <Text style={[styles.txTotal, { color: tint }]}>{formatPrice(item.total)}</Text>
        <View style={[styles.badge, { backgroundColor: '#34C75920' }]}>
          <Text style={[styles.badgeText, { color: '#34C759' }]}>
            {item.payment_method.toUpperCase()}
          </Text>
        </View>
      </View>
      {item.notes ? (
        <Text style={styles.txNotes} numberOfLines={1}>{item.notes}</Text>
      ) : null}
    </TouchableOpacity>
  );

  return (
    <View style={[styles.container, { backgroundColor: background }]}>
      {/* Date Filter Header */}
      <View style={[styles.dateHeader, { borderBottomColor: inputBorder }]}>
        <TouchableOpacity
          style={[styles.dateBtn, { borderColor: inputBorder }]}
          activeOpacity={0.7}
          onPress={() => setShowDatePicker(true)}
        >
          <FontAwesome name="calendar" size={16} color={tint} />
          <Text style={styles.dateBtnText}>{formatDayLabel(selectedDate)}</Text>
          <FontAwesome name="caret-down" size={14} color={tint} />
        </TouchableOpacity>
        <View style={styles.headerRight}>
          <View style={styles.dayTotalRow}>
            <Text style={styles.dayTotalLabel}>{t('history.tx_count', { count: transactions.length })}</Text>
            <Text style={[styles.dayTotalValue, { color: tint }]}>{formatPrice(totalForDay)}</Text>
          </View>
          <TouchableOpacity
            style={[
              styles.exportBtn,
              { borderColor: inputBorder, opacity: transactions.length === 0 ? 0.4 : 1 },
            ]}
            activeOpacity={0.7}
            onPress={handleExport}
            disabled={transactions.length === 0 || exporting}
            accessibilityLabel={t('export.button')}
          >
            {exporting ? (
              <ActivityIndicator size="small" color={tint} />
            ) : (
              <FontAwesome name="share-square-o" size={18} color={tint} />
            )}
          </TouchableOpacity>
        </View>
      </View>

      {showDatePicker && (
        <DateTimePicker
          value={selectedDate}
          mode="date"
          display={Platform.OS === 'ios' ? 'inline' : 'default'}
          maximumDate={new Date()}
          onChange={onDateChange}
        />
      )}

      {transactions.length === 0 ? (
        <View style={styles.emptyContainer}>
          <FontAwesome name="history" size={40} color={tint} style={{ opacity: 0.5 }} />
          <Text style={styles.emptyText}>{t('history.empty_on_date')}</Text>
        </View>
      ) : (
        <FlatList
          data={transactions}
          keyExtractor={(item) => item.id.toString()}
          renderItem={renderTransaction}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
        />
      )}

      {/* Detail Modal */}
      <Modal visible={showDetail} transparent animationType="fade">
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => {
            setShowDetail(false);
            setPrintStatus('idle');
            setPrintError(null);
          }}
        >
          <View style={styles.modalContent}>
            {selected && (
              <>
                <Text style={styles.modalTitle}>{t('history.transaction')} #{selected.id}</Text>
                <Text style={styles.modalDate}>{formatDate(selected.created_at)}</Text>

                <View style={[styles.divider, { backgroundColor: inputBorder }]} />

                {selected.items.map((item) => (
                  <View key={item.id} style={styles.detailRow}>
                    <View style={styles.detailLeft}>
                      <Text style={styles.detailName}>{item.product_name}</Text>
                      <Text style={styles.detailQty}>
                        {item.qty} x {formatPrice(item.price)}
                      </Text>
                    </View>
                    <Text style={styles.detailSubtotal}>{formatPrice(item.subtotal)}</Text>
                  </View>
                ))}

                <View style={[styles.divider, { backgroundColor: inputBorder }]} />

                <View style={styles.detailRow}>
                  <Text style={styles.detailBoldLabel}>{t('history.total')}</Text>
                  <Text style={[styles.detailBoldValue, { color: tint }]}>
                    {formatPrice(selected.total)}
                  </Text>
                </View>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>{t('history.paid')}</Text>
                  <Text style={styles.detailValue}>{formatPrice(selected.amount_paid)}</Text>
                </View>
                {selected.change_amount > 0 && (
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>{t('history.change')}</Text>
                    <Text style={[styles.detailValue, { color: '#FF9500' }]}>
                      {formatPrice(selected.change_amount)}
                    </Text>
                  </View>
                )}
                {selected.notes ? (
                  <Text style={styles.notesText}>{t('history.notes_label')}: {selected.notes}</Text>
                ) : null}
                <TouchableOpacity
                  style={[
                    styles.reprintBtn,
                    { backgroundColor: tint, opacity: savedPrinter ? 1 : 0.4 },
                  ]}
                  onPress={handleReprint}
                  disabled={!savedPrinter || printStatus === 'printing'}
                >
                  {printStatus === 'printing' ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={styles.reprintBtnText}>{t('printer.reprint')}</Text>
                  )}
                </TouchableOpacity>
                {!savedPrinter && (
                  <Text style={styles.reprintHint}>{t('printer.no_printer_hint')}</Text>
                )}
                {printError && (
                  <Text style={styles.reprintError}>{printError}</Text>
                )}
              </>
            )}
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  dateHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    gap: 12,
  },
  dateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  dateBtnText: {
    fontSize: 14,
    fontWeight: '600',
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  dayTotalRow: {
    alignItems: 'flex-end',
  },
  exportBtn: {
    borderWidth: 1,
    borderRadius: 10,
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayTotalLabel: {
    fontSize: 11,
    opacity: 0.6,
  },
  dayTotalValue: {
    fontSize: 16,
    fontWeight: '800',
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  emptyText: {
    fontSize: 14,
    opacity: 0.5,
  },
  listContent: {
    padding: 16,
    gap: 10,
  },
  card: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  txId: {
    fontSize: 14,
    fontWeight: '700',
  },
  txDate: {
    fontSize: 12,
    opacity: 0.5,
  },
  cardBody: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 6,
  },
  txTotal: {
    fontSize: 18,
    fontWeight: '800',
  },
  badge: {
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  txNotes: {
    fontSize: 12,
    opacity: 0.5,
    marginTop: 6,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  modalContent: {
    borderRadius: 14,
    padding: 20,
    maxHeight: 500,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '800',
    textAlign: 'center',
  },
  modalDate: {
    fontSize: 13,
    opacity: 0.5,
    textAlign: 'center',
    marginTop: 4,
  },
  divider: {
    height: 1,
    marginVertical: 12,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  detailLeft: {
    flex: 1,
    marginRight: 12,
  },
  detailName: {
    fontSize: 15,
    fontWeight: '600',
  },
  detailQty: {
    fontSize: 13,
    opacity: 0.6,
  },
  detailSubtotal: {
    fontSize: 15,
    fontWeight: '600',
  },
  detailBoldLabel: {
    fontSize: 16,
    fontWeight: '800',
  },
  detailBoldValue: {
    fontSize: 18,
    fontWeight: '800',
  },
  detailLabel: {
    fontSize: 14,
    opacity: 0.6,
  },
  detailValue: {
    fontSize: 15,
    fontWeight: '600',
  },
  notesText: {
    fontSize: 13,
    opacity: 0.5,
    marginTop: 4,
    fontStyle: 'italic',
  },
  reprintBtn: {
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 20,
    alignItems: 'center',
    marginTop: 16,
  },
  reprintBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  reprintHint: { color: '#FF9500', fontSize: 13, marginTop: 8, textAlign: 'center' },
  reprintError: { color: '#FF3B30', fontSize: 13, marginTop: 8, textAlign: 'center' },
});
