import { useState, useCallback, useRef } from 'react';
import {
  StyleSheet,
  FlatList,
  TouchableOpacity,
  TextInput,
  Alert,
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { CameraView, useCameraPermissions } from 'expo-camera';

import { Text, View } from '@/components/Themed';
import { useTheme } from '@/hooks/useTheme';
import { getProducts, type Product } from '@/db/products';
import { type CartItem } from '@/db/transactions';
import { t } from '@/i18n';

let _shouldClearCart = false;
export function requestCartClear() {
  _shouldClearCart = true;
}

export default function CashierScreen() {
  const { tint, background, inputBackground, inputBorder, text } = useTheme();

  const [allProducts, setAllProducts] = useState<Product[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [search, setSearch] = useState('');
  const [hasSearched, setHasSearched] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [permission, requestPermission] = useCameraPermissions();
  const scanCooldown = useRef(false);

  useFocusEffect(
    useCallback(() => {
      if (_shouldClearCart) {
        setCart([]);
        setSearch('');
        setHasSearched(false);
        _shouldClearCart = false;
      }
      getProducts().then((all) =>
        setAllProducts(all.filter((p) => p.is_active === 1)),
      );
    }, []),
  );

  const searchResults = hasSearched
    ? allProducts.filter((p) =>
        p.name.toLowerCase().includes(search.toLowerCase()) ||
        (p.sku && p.sku.toLowerCase().includes(search.toLowerCase())) ||
        (p.barcode && p.barcode.toLowerCase().includes(search.toLowerCase())),
      )
    : [];

  const cartTotal = cart.reduce((sum, item) => sum + item.price * item.qty, 0);
  const cartCount = cart.reduce((sum, item) => sum + item.qty, 0);

  const handleSearchChange = (text: string) => {
    setSearch(text);
    setHasSearched(text.trim().length > 0);
  };

  const addToCart = (product: Product) => {
    setCart((prev) => {
      const existing = prev.find((c) => c.product_id === product.id);
      if (existing) {
        return prev.map((c) =>
          c.product_id === product.id ? { ...c, qty: c.qty + 1 } : c,
        );
      }
      return [
        ...prev,
        {
          product_id: product.id,
          product_name: product.name,
          price: product.sell_price,
          qty: 1,
        },
      ];
    });
  };

  const removeFromCart = (productId: number) => {
    setCart((prev) => {
      const existing = prev.find((c) => c.product_id === productId);
      if (!existing) return prev;
      if (existing.qty <= 1) return prev.filter((c) => c.product_id !== productId);
      return prev.map((c) =>
        c.product_id === productId ? { ...c, qty: c.qty - 1 } : c,
      );
    });
  };

  const deleteFromCart = (productId: number) => {
    setCart((prev) => prev.filter((c) => c.product_id !== productId));
  };

  const getCartQty = (productId: number) =>
    cart.find((c) => c.product_id === productId)?.qty ?? 0;

  const handleCheckout = () => {
    if (cart.length === 0) {
      Alert.alert(t('cashier.empty_cart'), t('cashier.empty_cart_msg'));
      return;
    }
    router.push({
      pathname: '/checkout',
      params: { cart: JSON.stringify(cart) },
    });
  };

  const clearCart = () => {
    if (cart.length === 0) return;
    Alert.alert(t('cashier.clear_cart'), t('cashier.clear_cart_msg'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('common.clear'), style: 'destructive', onPress: () => setCart([]) },
    ]);
  };

  const handleScan = async () => {
    if (!permission?.granted) {
      const result = await requestPermission();
      if (!result.granted) {
        Alert.alert(t('cashier.permission_required'), t('cashier.camera_permission'));
        return;
      }
    }
    setScanning(true);
  };

  const onBarcodeScanned = ({ data }: { data: string }) => {
    if (scanCooldown.current) return;
    scanCooldown.current = true;

    setScanning(false);

    // Match by barcode first, then SKU
    const found = allProducts.find(
      (p) =>
        (p.barcode && p.barcode.toLowerCase() === data.toLowerCase()) ||
        (p.sku && p.sku.toLowerCase() === data.toLowerCase()),
    );

    if (found) {
      addToCart(found);
      Alert.alert(t('cashier.added'), t('cashier.added_msg', { name: found.name }));
    } else {
      Alert.alert(t('cashier.not_found'), t('cashier.not_found_msg', { code: data }));
    }

    setTimeout(() => {
      scanCooldown.current = false;
    }, 1500);
  };

  const formatPrice = (price: number) =>
    price.toLocaleString('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 });

  const renderProduct = ({ item }: { item: Product }) => {
    const qty = getCartQty(item.id);
    return (
      <View style={[styles.productCard, { borderColor: inputBorder }]}>
        <TouchableOpacity
          style={styles.productInfo}
          activeOpacity={0.7}
          onPress={() => addToCart(item)}
        >
          <Text style={styles.productName} numberOfLines={1}>
            {item.name}
          </Text>
          <Text style={[styles.productPrice, { color: tint }]}>
            {formatPrice(item.sell_price)}
          </Text>
          {item.stock_qty > 0 && (
            <Text style={styles.stockLabel}>{t('cashier.stock')}: {item.stock_qty}</Text>
          )}
        </TouchableOpacity>
        {qty > 0 ? (
          <View style={styles.qtyControls}>
            <TouchableOpacity
              style={[styles.qtyBtn, { backgroundColor: '#FF3B30' }]}
              onPress={() => removeFromCart(item.id)}
            >
              <FontAwesome name="minus" size={12} color="#fff" />
            </TouchableOpacity>
            <Text style={styles.qtyText}>{qty}</Text>
            <TouchableOpacity
              style={[styles.qtyBtn, { backgroundColor: tint }]}
              onPress={() => addToCart(item)}
            >
              <FontAwesome name="plus" size={12} color="#fff" />
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity
            style={[styles.addBtn, { backgroundColor: tint }]}
            onPress={() => addToCart(item)}
          >
            <FontAwesome name="plus" size={14} color="#fff" />
          </TouchableOpacity>
        )}
      </View>
    );
  };

  // Scanner view
  if (scanning) {
    return (
      <View style={[styles.container, { backgroundColor: '#000' }]}>
        <CameraView
          style={styles.camera}
          barcodeScannerSettings={{ barcodeTypes: ['qr', 'ean13', 'ean8', 'code128', 'code39'] }}
          onBarcodeScanned={onBarcodeScanned}
        />
        <View style={styles.scanOverlay}>
          <View style={styles.scanFrame} />
          <Text style={styles.scanHint}>{t('cashier.point_camera')}</Text>
        </View>
        <TouchableOpacity
          style={styles.scanCloseBtn}
          onPress={() => setScanning(false)}
        >
          <FontAwesome name="times" size={24} color="#fff" />
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: background }]}>
      {/* Search + Scan Row */}
      <View style={styles.searchRow}>
        <View
          style={[styles.searchBox, { backgroundColor: inputBackground, borderColor: inputBorder, flex: 1 }]}
        >
          <FontAwesome name="search" size={14} color={text} style={{ opacity: 0.4 }} />
          <TextInput
            style={[styles.searchInput, { color: text }]}
            placeholder={t('cashier.search_placeholder')}
            placeholderTextColor={text + '60'}
            value={search}
            onChangeText={handleSearchChange}
            returnKeyType="search"
          />
          {search.length > 0 && (
            <TouchableOpacity onPress={() => { setSearch(''); setHasSearched(false); }}>
              <FontAwesome name="times-circle" size={16} color={text} style={{ opacity: 0.3 }} />
            </TouchableOpacity>
          )}
        </View>
        <TouchableOpacity
          style={[styles.scanBtn, { backgroundColor: tint }]}
          onPress={handleScan}
        >
          <FontAwesome name="qrcode" size={20} color="#fff" />
        </TouchableOpacity>
      </View>

      {/* Content */}
      {!hasSearched && cart.length === 0 ? (
        <View style={styles.emptyContainer}>
          <FontAwesome name="search" size={40} color={tint} style={{ opacity: 0.3 }} />
          <Text style={styles.emptyTitle}>{t('cashier.search_or_scan')}</Text>
          <Text style={styles.emptyText}>
            {t('cashier.search_hint')}
          </Text>
        </View>
      ) : !hasSearched && cart.length > 0 ? (
        <View style={styles.cartOnlyContainer}>
          <Text style={styles.cartSectionTitle}>{t('cashier.cart_title', { count: cartCount })}</Text>
          <FlatList
            data={cart}
            keyExtractor={(item) => item.product_id.toString()}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            renderItem={({ item }) => (
              <View style={[styles.productCard, { borderColor: inputBorder }]}>
                <TouchableOpacity
                  style={styles.deleteBtn}
                  onPress={() => deleteFromCart(item.product_id)}
                >
                  <FontAwesome name="trash-o" size={16} color="#FF3B30" />
                </TouchableOpacity>
                <View style={styles.productInfo}>
                  <Text style={styles.productName} numberOfLines={1}>
                    {item.product_name}
                  </Text>
                  <Text style={[styles.productPrice, { color: tint }]}>
                    {formatPrice(item.price)} x {item.qty} = {formatPrice(item.price * item.qty)}
                  </Text>
                </View>
                <View style={styles.qtyControls}>
                  <TouchableOpacity
                    style={[styles.qtyBtn, { backgroundColor: '#FF3B30' }]}
                    onPress={() => removeFromCart(item.product_id)}
                  >
                    <FontAwesome name="minus" size={12} color="#fff" />
                  </TouchableOpacity>
                  <Text style={styles.qtyText}>{item.qty}</Text>
                  <TouchableOpacity
                    style={[styles.qtyBtn, { backgroundColor: tint }]}
                    onPress={() => {
                      const product = allProducts.find((p) => p.id === item.product_id);
                      if (product) addToCart(product);
                    }}
                  >
                    <FontAwesome name="plus" size={12} color="#fff" />
                  </TouchableOpacity>
                </View>
              </View>
            )}
          />
        </View>
      ) : searchResults.length === 0 ? (
        <View style={styles.emptyContainer}>
          <FontAwesome name="search" size={40} color={tint} style={{ opacity: 0.3 }} />
          <Text style={styles.emptyText}>{t('cashier.no_match', { query: search })}</Text>
        </View>
      ) : (
        <FlatList
          data={searchResults}
          keyExtractor={(item) => item.id.toString()}
          renderItem={renderProduct}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
        />
      )}

      {/* Cart Footer */}
      {cart.length > 0 && (
        <View style={[styles.cartFooter, { borderTopColor: inputBorder }]}>
          <View style={styles.cartInfo}>
            <TouchableOpacity onPress={clearCart} style={styles.clearBtn}>
              <FontAwesome name="trash-o" size={16} color="#FF3B30" />
            </TouchableOpacity>
            <View>
              <Text style={styles.cartCount}>{cartCount} {t('cashier.items_suffix')}</Text>
              <Text style={[styles.cartTotal, { color: tint }]}>{formatPrice(cartTotal)}</Text>
            </View>
          </View>
          <TouchableOpacity
            style={[styles.checkoutBtn, { backgroundColor: tint }]}
            activeOpacity={0.8}
            onPress={handleCheckout}
          >
            <FontAwesome name="arrow-right" size={16} color="#fff" />
            <Text style={styles.checkoutText}>{t('cashier.checkout')}</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
    gap: 10,
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    padding: 0,
  },
  scanBtn: {
    width: 44,
    height: 44,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 40,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginTop: 8,
  },
  emptyText: {
    fontSize: 14,
    opacity: 0.5,
    textAlign: 'center',
  },
  cartOnlyContainer: {
    flex: 1,
  },
  cartSectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 4,
  },
  listContent: {
    padding: 16,
    paddingBottom: 100,
    gap: 10,
  },
  productCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
  },
  productInfo: {
    flex: 1,
  },
  productName: {
    fontSize: 16,
    fontWeight: '600',
  },
  productPrice: {
    fontSize: 14,
    fontWeight: '700',
    marginTop: 2,
  },
  stockLabel: {
    fontSize: 12,
    opacity: 0.5,
    marginTop: 2,
  },
  qtyControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  qtyBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  qtyText: {
    fontSize: 16,
    fontWeight: '700',
    minWidth: 20,
    textAlign: 'center',
  },
  deleteBtn: {
    padding: 6,
    marginRight: 8,
  },
  addBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cartFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderTopWidth: 1,
  },
  cartInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  clearBtn: {
    padding: 6,
  },
  cartCount: {
    fontSize: 12,
    opacity: 0.6,
  },
  cartTotal: {
    fontSize: 18,
    fontWeight: '800',
  },
  checkoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 20,
  },
  checkoutText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  // Scanner styles
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
});
