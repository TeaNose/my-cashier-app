import { useState, useEffect, useRef } from 'react';
import {
  StyleSheet,
  Switch,
  Alert,
  TouchableOpacity,
  Modal,
  FlatList,
  ActivityIndicator,
} from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view';
import { router, useLocalSearchParams } from 'expo-router';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { CameraView, useCameraPermissions } from 'expo-camera';

import { Text, View } from '@/components/Themed';
import { FormInput } from '@/components/FormInput';
import { PrimaryButton } from '@/components/PrimaryButton';
import { useTheme } from '@/hooks/useTheme';
import { getCategories, type Category } from '@/db/categories';
import { getProductById, updateProduct } from '@/db/products';
import { t } from '@/i18n';

export default function EditProductScreen() {
  const { tint, background } = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();

  const [loading, setLoading] = useState(true);
  const [name, setName] = useState('');
  const [sku, setSku] = useState('');
  const [barcode, setBarcode] = useState('');
  const [scanning, setScanning] = useState(false);
  const [permission, requestPermission] = useCameraPermissions();
  const scanCooldown = useRef(false);
  const [buyPrice, setBuyPrice] = useState('');
  const [sellPrice, setSellPrice] = useState('');
  const [stockQty, setStockQty] = useState('');
  const [minStockAlert, setMinStockAlert] = useState('');
  const [unit, setUnit] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState<Category | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [showCategoryPicker, setShowCategoryPicker] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const load = async () => {
      const [cats, product] = await Promise.all([
        getCategories(),
        getProductById(Number(id)),
      ]);
      setCategories(cats);
      if (product) {
        setName(product.name);
        setSku(product.sku || '');
        setBarcode(product.barcode || '');
        setBuyPrice(product.buy_price ? String(product.buy_price) : '');
        setSellPrice(String(product.sell_price));
        setStockQty(String(product.stock_qty));
        setMinStockAlert(String(product.min_stock_alert));
        setUnit(product.unit || '');
        setIsActive(product.is_active === 1);
        if (product.category_id) {
          const cat = cats.find((c) => c.id === product.category_id);
          if (cat) setSelectedCategory(cat);
        }
      }
      setLoading(false);
    };
    load();
  }, [id]);

  const handleSave = async () => {
    if (!name.trim()) {
      Alert.alert(t('common.validation'), t('products.name_required'));
      return;
    }
    if (!sellPrice.trim() || isNaN(Number(sellPrice))) {
      Alert.alert(t('common.validation'), t('products.sell_price_required'));
      return;
    }

    setSaving(true);
    try {
      await updateProduct(Number(id), {
        name: name.trim(),
        sku: sku.trim() || undefined,
        barcode: barcode.trim() || undefined,
        category_id: selectedCategory?.id ?? null,
        unit: unit.trim() || undefined,
        buy_price: Number(buyPrice) || 0,
        sell_price: Number(sellPrice),
        stock_qty: Number(stockQty) || 0,
        min_stock_alert: Number(minStockAlert) || 0,
        is_active: isActive,
      });
      Alert.alert(t('common.success'), t('products.updated', { name }), [
        { text: t('common.ok'), onPress: () => router.back() },
      ]);
    } catch (error) {
      Alert.alert(t('common.error'), `${t('products.update_failed')} ${t('common.try_again')}`);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: background }]}>
        <ActivityIndicator size="large" color={tint} />
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
      {/* Basic Info */}
      <Text style={styles.sectionTitle}>{t('products.basic_info')}</Text>
      <View style={styles.section}>
        <FormInput
          label={t('products.name')}
          value={name}
          onChangeText={setName}
          placeholder={t('products.name_placeholder')}
        />
        <FormInput
          label={t('products.sku')}
          value={sku}
          onChangeText={setSku}
          placeholder={t('products.sku_placeholder')}
          autoCapitalize="characters"
        />

        {/* Barcode */}
        <Text style={styles.inputLabel}>{t('products.barcode')}</Text>
        <View style={styles.barcodeRow}>
          <View style={styles.barcodeInputWrapper}>
            <FormInput
              value={barcode}
              onChangeText={setBarcode}
              placeholder={t('products.barcode_placeholder')}
            />
          </View>
          <TouchableOpacity
            style={[styles.scanBtn, { backgroundColor: tint }]}
            onPress={async () => {
              if (!permission?.granted) {
                const result = await requestPermission();
                if (!result.granted) {
                  Alert.alert(t('products.permission_required'), t('products.camera_permission'));
                  return;
                }
              }
              setScanning(true);
            }}
          >
            <FontAwesome name="qrcode" size={20} color="#fff" />
          </TouchableOpacity>
        </View>

        {/* Category Dropdown */}
        <Text style={styles.inputLabel}>{t('products.category')}</Text>
        <TouchableOpacity
          style={[styles.dropdown, { borderColor: tint + '40' }]}
          onPress={() => setShowCategoryPicker(true)}
        >
          <Text style={[styles.dropdownText, !selectedCategory && styles.dropdownPlaceholder]}>
            {selectedCategory ? selectedCategory.name : t('products.select_category')}
          </Text>
          <Text style={styles.dropdownArrow}>▼</Text>
        </TouchableOpacity>

        <Modal visible={showCategoryPicker} transparent animationType="fade">
          <TouchableOpacity
            style={styles.modalOverlay}
            activeOpacity={1}
            onPress={() => setShowCategoryPicker(false)}
          >
            <View style={styles.modalContent}>
              <Text style={styles.modalTitle}>{t('products.select_category_title')}</Text>
              {categories.length === 0 ? (
                <Text style={styles.emptyText}>{t('products.no_categories')}</Text>
              ) : (
                <FlatList
                  data={categories}
                  keyExtractor={(item) => item.id.toString()}
                  renderItem={({ item }) => (
                    <TouchableOpacity
                      style={[
                        styles.optionRow,
                        selectedCategory?.id === item.id && { backgroundColor: tint + '20' },
                      ]}
                      onPress={() => {
                        setSelectedCategory(item);
                        setShowCategoryPicker(false);
                      }}
                    >
                      <Text style={styles.optionText}>{item.name}</Text>
                      {selectedCategory?.id === item.id && (
                        <Text style={[styles.checkMark, { color: tint }]}>✓</Text>
                      )}
                    </TouchableOpacity>
                  )}
                />
              )}
              {selectedCategory && (
                <TouchableOpacity
                  style={styles.clearButton}
                  onPress={() => {
                    setSelectedCategory(null);
                    setShowCategoryPicker(false);
                  }}
                >
                  <Text style={styles.clearButtonText}>{t('products.clear_selection')}</Text>
                </TouchableOpacity>
              )}
            </View>
          </TouchableOpacity>
        </Modal>

        <FormInput
          label={t('products.unit')}
          value={unit}
          onChangeText={setUnit}
          placeholder={t('products.unit_placeholder')}
        />
      </View>

      {/* Pricing */}
      <Text style={styles.sectionTitle}>{t('products.pricing')}</Text>
      <View style={styles.section}>
        <FormInput
          label={t('products.buy_price')}
          value={buyPrice}
          onChangeText={setBuyPrice}
          placeholder="0"
          keyboardType="decimal-pad"
        />
        <FormInput
          label={t('products.sell_price')}
          value={sellPrice}
          onChangeText={setSellPrice}
          placeholder="0"
          keyboardType="decimal-pad"
        />
      </View>

      {/* Stock */}
      <Text style={styles.sectionTitle}>{t('products.stock_section')}</Text>
      <View style={styles.section}>
        <FormInput
          label={t('products.stock_qty')}
          value={stockQty}
          onChangeText={setStockQty}
          placeholder="0"
          keyboardType="number-pad"
        />
        <FormInput
          label={t('products.min_stock_alert')}
          value={minStockAlert}
          onChangeText={setMinStockAlert}
          placeholder="0"
          keyboardType="number-pad"
        />
      </View>

      {/* Status */}
      <View style={styles.switchRow}>
        <Text style={styles.switchLabel}>{t('common.active')}</Text>
        <Switch value={isActive} onValueChange={setIsActive} trackColor={{ true: tint }} />
      </View>

      <PrimaryButton label={saving ? t('common.saving') : t('products.update_product')} onPress={handleSave} />

      {/* Barcode Scanner Modal */}
      <Modal visible={scanning} animationType="slide">
        <View style={styles.scannerContainer}>
          <CameraView
            style={styles.camera}
            barcodeScannerSettings={{ barcodeTypes: ['qr', 'ean13', 'ean8', 'code128', 'code39'] }}
            onBarcodeScanned={({ data }) => {
              if (scanCooldown.current) return;
              scanCooldown.current = true;
              setBarcode(data);
              setScanning(false);
              setTimeout(() => { scanCooldown.current = false; }, 1500);
            }}
          />
          <View style={styles.scanOverlay}>
            <View style={styles.scanFrame} />
            <Text style={styles.scanHint}>{t('products.point_camera')}</Text>
          </View>
          <TouchableOpacity
            style={styles.scanCloseBtn}
            onPress={() => setScanning(false)}
          >
            <FontAwesome name="times" size={24} color="#fff" />
          </TouchableOpacity>
        </View>
      </Modal>
    </KeyboardAwareScrollView>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollView: {
    flex: 1,
  },
  container: {
    padding: 20,
    paddingBottom: 40,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginTop: 20,
    marginBottom: 4,
  },
  section: {
    marginBottom: 8,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '600',
    marginTop: 12,
    marginBottom: 6,
  },
  dropdown: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 14,
    marginBottom: 4,
  },
  dropdownText: {
    fontSize: 15,
    flex: 1,
  },
  dropdownPlaceholder: {
    opacity: 0.4,
  },
  dropdownArrow: {
    fontSize: 10,
    opacity: 0.5,
    marginLeft: 8,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    paddingHorizontal: 30,
  },
  modalContent: {
    borderRadius: 14,
    paddingVertical: 20,
    paddingHorizontal: 16,
    maxHeight: 400,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 12,
    textAlign: 'center',
  },
  emptyText: {
    textAlign: 'center',
    opacity: 0.5,
    paddingVertical: 20,
  },
  optionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  optionText: {
    fontSize: 16,
  },
  checkMark: {
    fontSize: 18,
    fontWeight: '700',
  },
  clearButton: {
    marginTop: 12,
    paddingVertical: 10,
    alignItems: 'center',
  },
  clearButtonText: {
    fontSize: 14,
    color: '#FF3B30',
    fontWeight: '600',
  },
  barcodeRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
  },
  barcodeInputWrapper: {
    flex: 1,
  },
  scanBtn: {
    width: 48,
    height: 48,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 0,
  },
  scannerContainer: {
    flex: 1,
    backgroundColor: '#000',
  },
  camera: {
    flex: 1,
  },
  scanOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  scanFrame: {
    width: 250,
    height: 250,
    borderWidth: 2,
    borderColor: '#fff',
    borderRadius: 16,
    backgroundColor: 'transparent',
  },
  scanHint: {
    color: '#fff',
    fontSize: 14,
    marginTop: 20,
    textAlign: 'center',
  },
  scanCloseBtn: {
    position: 'absolute',
    top: 50,
    right: 20,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 20,
    marginBottom: 24,
  },
  switchLabel: {
    fontSize: 14,
    fontWeight: '600',
  },
});
