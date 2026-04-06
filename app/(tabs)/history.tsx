import { useState, useCallback } from 'react';
import { StyleSheet, FlatList, TouchableOpacity, Modal } from 'react-native';
import { useFocusEffect } from 'expo-router';
import FontAwesome from '@expo/vector-icons/FontAwesome';

import { Text, View } from '@/components/Themed';
import { useTheme } from '@/hooks/useTheme';
import {
  getTransactions,
  getTransactionWithItems,
  type Transaction,
  type TransactionWithItems,
} from '@/db/transactions';

export default function HistoryScreen() {
  const { tint, background, inputBorder } = useTheme();

  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [selected, setSelected] = useState<TransactionWithItems | null>(null);
  const [showDetail, setShowDetail] = useState(false);

  useFocusEffect(
    useCallback(() => {
      getTransactions().then(setTransactions);
    }, []),
  );

  const formatPrice = (price: number) =>
    price.toLocaleString('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 });

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr + 'Z');
    return d.toLocaleDateString('id-ID', {
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
    }
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
      {transactions.length === 0 ? (
        <View style={styles.emptyContainer}>
          <FontAwesome name="history" size={40} color={tint} style={{ opacity: 0.5 }} />
          <Text style={styles.emptyText}>No transactions yet.</Text>
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
          onPress={() => setShowDetail(false)}
        >
          <View style={styles.modalContent}>
            {selected && (
              <>
                <Text style={styles.modalTitle}>Transaction #{selected.id}</Text>
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
                  <Text style={styles.detailBoldLabel}>Total</Text>
                  <Text style={[styles.detailBoldValue, { color: tint }]}>
                    {formatPrice(selected.total)}
                  </Text>
                </View>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Paid</Text>
                  <Text style={styles.detailValue}>{formatPrice(selected.amount_paid)}</Text>
                </View>
                {selected.change_amount > 0 && (
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Change</Text>
                    <Text style={[styles.detailValue, { color: '#FF9500' }]}>
                      {formatPrice(selected.change_amount)}
                    </Text>
                  </View>
                )}
                {selected.notes ? (
                  <Text style={styles.notesText}>Notes: {selected.notes}</Text>
                ) : null}
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
});
