import { useCallback, useState } from 'react';
import { FlatList, StyleSheet, Alert, TouchableOpacity, TextInput } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import FontAwesome from '@expo/vector-icons/FontAwesome';

import { Text, View } from '@/components/Themed';
import { EmptyState } from '@/components/EmptyState';
import { useTheme } from '@/hooks/useTheme';
import { getProducts, deleteProduct, type Product } from '@/db/products';
import { t } from '@/i18n';

export default function ProductsScreen() {
  const { tint, inputBackground, inputBorder, text } = useTheme();
  const [products, setProducts] = useState<Product[]>([]);
  const [search, setSearch] = useState('');

  const loadProducts = useCallback(async () => {
    const data = await getProducts();
    setProducts(data);
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadProducts();
    }, [loadProducts]),
  );

  const filtered = search.trim()
    ? products.filter(
        (p) =>
          p.name.toLowerCase().includes(search.toLowerCase()) ||
          (p.sku && p.sku.toLowerCase().includes(search.toLowerCase())) ||
          (p.barcode && p.barcode.toLowerCase().includes(search.toLowerCase())),
      )
    : products;

  const handleDelete = (product: Product) => {
    Alert.alert(t('products.delete_title'), t('products.delete_confirm', { name: product.name }), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.delete'),
        style: 'destructive',
        onPress: async () => {
          await deleteProduct(product.id);
          loadProducts();
        },
      },
    ]);
  };

  const formatPrice = (price: number) =>
    price.toLocaleString('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 });

  if (products.length === 0) {
    return (
      <EmptyState
        icon="cube"
        title={t('products.title')}
        subtitle={t('products.empty_subtitle')}
        buttonLabel={t('products.add_button')}
        onPress={() => router.push('/add-product')}
      />
    );
  }

  return (
    <View style={styles.container}>
      {/* Search Bar */}
      <View style={styles.searchRow}>
        <View
          style={[styles.searchBox, { backgroundColor: inputBackground, borderColor: inputBorder }]}
        >
          <FontAwesome name="search" size={14} color={text} style={{ opacity: 0.4 }} />
          <TextInput
            style={[styles.searchInput, { color: text }]}
            placeholder={t('products.search_placeholder')}
            placeholderTextColor={text + '60'}
            value={search}
            onChangeText={setSearch}
            returnKeyType="search"
          />
          {search.length > 0 && (
            <TouchableOpacity onPress={() => setSearch('')}>
              <FontAwesome name="times-circle" size={16} color={text} style={{ opacity: 0.3 }} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {filtered.length === 0 ? (
        <View style={styles.emptySearch}>
          <FontAwesome name="search" size={32} color={tint} style={{ opacity: 0.3 }} />
          <Text style={styles.emptySearchText}>{t('products.no_match', { query: search })}</Text>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <View style={styles.row}>
              <TouchableOpacity
                style={styles.rowContent}
                activeOpacity={0.7}
                onPress={() => router.push({ pathname: '/edit-product', params: { id: item.id } })}
              >
                <Text style={styles.name}>{item.name}</Text>
                <Text style={[styles.price, { color: tint }]}>{formatPrice(item.sell_price)}</Text>
                <View style={styles.metaRow}>
                  {item.sku ? <Text style={styles.meta}>{t('products.sku_label')}: {item.sku}</Text> : null}
                  <Text style={styles.meta}>{t('products.stock')}: {item.stock_qty}</Text>
                  {item.is_active === 0 && <Text style={styles.inactive}>{t('common.inactive')}</Text>}
                </View>
              </TouchableOpacity>
              <View style={styles.actions}>
                <TouchableOpacity
                  onPress={() => router.push({ pathname: '/edit-product', params: { id: item.id } })}
                  hitSlop={8}
                  style={styles.actionBtn}
                >
                  <FontAwesome name="pencil" size={18} color={tint} />
                </TouchableOpacity>
                <TouchableOpacity onPress={() => handleDelete(item)} hitSlop={8} style={styles.actionBtn}>
                  <FontAwesome name="trash-o" size={18} color="#ff3b30" />
                </TouchableOpacity>
              </View>
            </View>
          )}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
        />
      )}
      <TouchableOpacity
        activeOpacity={0.7}
        style={[styles.fab, { backgroundColor: tint }]}
        onPress={() => router.push('/add-product')}
      >
        <FontAwesome name="plus" size={24} color="#fff" />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  searchRow: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
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
  emptySearch: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 40,
  },
  emptySearchText: {
    fontSize: 14,
    opacity: 0.5,
    textAlign: 'center',
  },
  list: {
    padding: 16,
    paddingBottom: 80,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 4,
  },
  rowContent: {
    flex: 1,
  },
  name: {
    fontSize: 16,
    fontWeight: '600',
  },
  price: {
    fontSize: 14,
    fontWeight: '700',
    marginTop: 2,
  },
  metaRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 4,
  },
  meta: {
    fontSize: 12,
    opacity: 0.5,
  },
  inactive: {
    fontSize: 12,
    color: '#FF3B30',
    fontWeight: '600',
  },
  actions: {
    flexDirection: 'row',
    gap: 16,
    alignItems: 'center',
  },
  actionBtn: {
    padding: 4,
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#c6c6c8',
  },
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
  },
});
