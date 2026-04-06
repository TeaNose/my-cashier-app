import { useCallback, useState } from 'react';
import { FlatList, StyleSheet, Alert, TouchableOpacity } from 'react-native';
import { router } from 'expo-router';
import { useFocusEffect } from 'expo-router';
import FontAwesome from '@expo/vector-icons/FontAwesome';

import { Text, View } from '@/components/Themed';
import { EmptyState } from '@/components/EmptyState';
import { useTheme } from '@/hooks/useTheme';
import { getProducts, deleteProduct, type Product } from '@/db/products';

export default function ProductsScreen() {
  const { tint } = useTheme();
  const [products, setProducts] = useState<Product[]>([]);

  const loadProducts = useCallback(async () => {
    const data = await getProducts();
    setProducts(data);
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadProducts();
    }, [loadProducts]),
  );

  const handleDelete = (product: Product) => {
    Alert.alert('Delete', `Delete "${product.name}"?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
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
        title="Products"
        subtitle="No products yet. Add your first product!"
        buttonLabel="Add Product"
        onPress={() => router.push('/add-product')}
      />
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={products}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <View style={styles.row}>
            <View style={styles.rowContent}>
              <Text style={styles.name}>{item.name}</Text>
              <Text style={[styles.price, { color: tint }]}>{formatPrice(item.sell_price)}</Text>
              <View style={styles.metaRow}>
                {item.sku ? <Text style={styles.meta}>SKU: {item.sku}</Text> : null}
                <Text style={styles.meta}>Stock: {item.stock_qty}</Text>
                {item.is_active === 0 && <Text style={styles.inactive}>Inactive</Text>}
              </View>
            </View>
            <TouchableOpacity onPress={() => handleDelete(item)} hitSlop={8}>
              <FontAwesome name="trash-o" size={20} color="#ff3b30" />
            </TouchableOpacity>
          </View>
        )}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
      />
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
  list: {
    padding: 16,
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
