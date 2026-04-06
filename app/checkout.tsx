import { useState } from 'react';
import {
  StyleSheet,
  TouchableOpacity,
  Alert,
  TextInput,
} from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view';
import { router, useLocalSearchParams } from 'expo-router';
import FontAwesome from '@expo/vector-icons/FontAwesome';

import { Text, View } from '@/components/Themed';
import { PrimaryButton } from '@/components/PrimaryButton';
import { useTheme } from '@/hooks/useTheme';
import { createTransaction, type CartItem } from '@/db/transactions';
import { requestCartClear } from './(tabs)/cashier';
import { t } from '@/i18n';

const QUICK_AMOUNTS = [1000, 2000, 5000, 10000, 20000, 50000, 100000];

export default function CheckoutScreen() {
  const { tint, background, inputBackground, inputBorder, text } = useTheme();
  const params = useLocalSearchParams<{ cart: string }>();
  const cart: CartItem[] = JSON.parse(params.cart || '[]');

  const total = cart.reduce((sum, item) => sum + item.price * item.qty, 0);

  const [amountPaid, setAmountPaid] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [changeAmount, setChangeAmount] = useState(0);

  const paidNum = Number(amountPaid) || 0;
  const isExact = paidNum === total;
  const isSufficient = paidNum >= total;

  const formatPrice = (price: number) =>
    price.toLocaleString('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 });

  const handleQuickAmount = (amount: number) => {
    setAmountPaid((prev) => String((Number(prev) || 0) + amount));
  };

  const handlePay = async () => {
    if (!isSufficient) {
      Alert.alert(t('checkout.insufficient'), t('checkout.insufficient_msg'));
      return;
    }

    setSaving(true);
    try {
      const transaction = await createTransaction(
        cart,
        paidNum,
        'cash',
        notes || undefined,
      );
      setChangeAmount(transaction.change_amount);
      setCompleted(true);
    } catch (error) {
      Alert.alert(t('common.error'), t('checkout.save_failed'));
    } finally {
      setSaving(false);
    }
  };

  if (completed) {
    return (
      <View style={[styles.container, styles.centered, { backgroundColor: background }]}>
        <FontAwesome name="check-circle" size={64} color="#34C759" />
        <Text style={styles.successTitle}>{t('checkout.success_title')}</Text>
        <Text style={[styles.totalLabel, { marginTop: 16 }]}>{t('checkout.total')}</Text>
        <Text style={[styles.totalValue, { color: tint }]}>{formatPrice(total)}</Text>
        <Text style={styles.totalLabel}>{t('checkout.paid')}</Text>
        <Text style={styles.paidValue}>{formatPrice(paidNum)}</Text>
        {changeAmount > 0 && (
          <>
            <Text style={styles.totalLabel}>{t('checkout.change')}</Text>
            <Text style={[styles.changeValue, { color: '#FF9500' }]}>
              {formatPrice(changeAmount)}
            </Text>
          </>
        )}
        <TouchableOpacity
          style={[styles.doneBtn, { backgroundColor: tint }]}
          onPress={() => {
            requestCartClear();
            router.dismissAll();
          }}
        >
          <Text style={styles.doneBtnText}>{t('checkout.back_to_cashier')}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <KeyboardAwareScrollView
      style={[styles.scrollView, { backgroundColor: background }]}
      contentContainerStyle={styles.container}
      keyboardShouldPersistTaps="handled"
      extraScrollHeight={120}
      enableOnAndroid={true}
    >
      {/* Order Summary */}
      <Text style={styles.sectionTitle}>{t('checkout.order_summary')}</Text>
      <View style={[styles.summaryCard, { borderColor: inputBorder }]}>
        {cart.map((item) => (
          <View key={item.product_id} style={styles.summaryRow}>
            <View style={styles.summaryLeft}>
              <Text style={styles.itemName} numberOfLines={1}>
                {item.product_name}
              </Text>
              <Text style={styles.itemDetail}>
                {item.qty} x {formatPrice(item.price)}
              </Text>
            </View>
            <Text style={styles.itemSubtotal}>
              {formatPrice(item.price * item.qty)}
            </Text>
          </View>
        ))}
        <View style={[styles.divider, { backgroundColor: inputBorder }]} />
        <View style={styles.summaryRow}>
          <Text style={styles.totalLabelBold}>{t('checkout.total')}</Text>
          <Text style={[styles.totalBold, { color: tint }]}>{formatPrice(total)}</Text>
        </View>
      </View>

      {/* Payment */}
      <Text style={styles.sectionTitle}>{t('checkout.payment')}</Text>
      <Text style={styles.inputLabel}>{t('checkout.amount_paid')}</Text>
      <TextInput
        style={[
          styles.amountInput,
          {
            backgroundColor: inputBackground,
            borderColor: isSufficient || !amountPaid ? inputBorder : '#FF3B30',
            color: text,
          },
        ]}
        value={amountPaid}
        onChangeText={setAmountPaid}
        placeholder="0"
        placeholderTextColor={text + '40'}
        keyboardType="number-pad"
      />

      {/* Quick Amount Buttons */}
      <View style={styles.quickRow}>
        <TouchableOpacity
          style={[styles.quickBtn, { backgroundColor: '#34C759' }]}
          onPress={() => setAmountPaid(String(total))}
        >
          <Text style={styles.quickBtnText}>{t('checkout.exact')}</Text>
        </TouchableOpacity>
        {QUICK_AMOUNTS.filter((a) => a >= total * 0.1).slice(0, 4).map((amount) => (
          <TouchableOpacity
            key={amount}
            style={[styles.quickBtn, { backgroundColor: inputBackground, borderColor: inputBorder, borderWidth: 1 }]}
            onPress={() => handleQuickAmount(amount)}
          >
            <Text style={[styles.quickBtnText, { color: text }]}>
              +{amount >= 1000 ? `${amount / 1000}k` : amount}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {paidNum > 0 && isSufficient && (
        <View style={[styles.changeBox, { backgroundColor: '#FF950020' }]}>
          <Text style={styles.changeLabel}>{t('checkout.change')}</Text>
          <Text style={[styles.changeAmount, { color: '#FF9500' }]}>
            {formatPrice(paidNum - total)}
          </Text>
        </View>
      )}

      {/* Notes */}
      <Text style={[styles.inputLabel, { marginTop: 16 }]}>{t('checkout.notes_label')}</Text>
      <TextInput
        style={[
          styles.notesInput,
          { backgroundColor: inputBackground, borderColor: inputBorder, color: text },
        ]}
        value={notes}
        onChangeText={setNotes}
        placeholder={t('checkout.notes_placeholder')}
        placeholderTextColor={text + '40'}
        multiline
      />

      <PrimaryButton
        label={saving ? t('common.processing') : t('checkout.pay', { amount: formatPrice(total) })}
        onPress={handlePay}
      />
    </KeyboardAwareScrollView>
  );
}

const styles = StyleSheet.create({
  scrollView: {
    flex: 1,
  },
  container: {
    padding: 20,
    paddingBottom: 40,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginTop: 8,
    marginBottom: 10,
  },
  summaryCard: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    marginBottom: 20,
    gap: 10,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  summaryLeft: {
    flex: 1,
    marginRight: 12,
  },
  itemName: {
    fontSize: 15,
    fontWeight: '600',
  },
  itemDetail: {
    fontSize: 13,
    opacity: 0.6,
    marginTop: 1,
  },
  itemSubtotal: {
    fontSize: 15,
    fontWeight: '600',
  },
  divider: {
    height: 1,
    marginVertical: 4,
  },
  totalLabelBold: {
    fontSize: 16,
    fontWeight: '800',
  },
  totalBold: {
    fontSize: 18,
    fontWeight: '800',
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 6,
  },
  amountInput: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 14,
    fontSize: 20,
    fontWeight: '700',
    textAlign: 'center',
  },
  quickRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 10,
  },
  quickBtn: {
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  quickBtnText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
  },
  changeBox: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderRadius: 10,
    padding: 14,
    marginTop: 14,
  },
  changeLabel: {
    fontSize: 15,
    fontWeight: '600',
  },
  changeAmount: {
    fontSize: 20,
    fontWeight: '800',
  },
  notesInput: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    minHeight: 60,
    textAlignVertical: 'top',
  },
  successTitle: {
    fontSize: 24,
    fontWeight: '800',
    marginTop: 16,
  },
  totalLabel: {
    fontSize: 14,
    opacity: 0.5,
    marginTop: 8,
  },
  totalValue: {
    fontSize: 28,
    fontWeight: '800',
  },
  paidValue: {
    fontSize: 20,
    fontWeight: '700',
  },
  changeValue: {
    fontSize: 24,
    fontWeight: '800',
  },
  doneBtn: {
    borderRadius: 10,
    paddingVertical: 14,
    paddingHorizontal: 32,
    marginTop: 32,
  },
  doneBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
});
