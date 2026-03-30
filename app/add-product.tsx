import { useState } from 'react';
import {
  StyleSheet,
  TextInput,
  Pressable,
  ScrollView,
  Switch,
  Alert,
  useColorScheme,
} from 'react-native';
import { router } from 'expo-router';

import { Text, View } from '@/components/Themed';
import Colors from '@/constants/Colors';

export default function AddProductScreen() {
  const colorScheme = useColorScheme() ?? 'light';
  const tint = Colors[colorScheme].tint;
  const textColor = Colors[colorScheme].text;
  const inputBg = colorScheme === 'dark' ? '#1c1c1e' : '#f2f2f7';
  const borderColor = colorScheme === 'dark' ? '#38383a' : '#c6c6c8';

  const [name, setName] = useState('');
  const [sku, setSku] = useState('');
  const [buyPrice, setBuyPrice] = useState('');
  const [sellPrice, setSellPrice] = useState('');
  const [stockQty, setStockQty] = useState('');
  const [minStockAlert, setMinStockAlert] = useState('');
  const [unit, setUnit] = useState('');
  const [isActive, setIsActive] = useState(true);

  // TODO: Replace with actual categories from database
  const [categoryId, setCategoryId] = useState('');

  const handleSave = () => {
    if (!name.trim()) {
      Alert.alert('Validation', 'Product name is required.');
      return;
    }
    if (!sellPrice.trim() || isNaN(Number(sellPrice))) {
      Alert.alert('Validation', 'A valid sell price is required.');
      return;
    }

    // TODO: Save to database
    Alert.alert('Success', `Product "${name}" created.`, [
      { text: 'OK', onPress: () => router.back() },
    ]);
  };

  const inputStyle = [styles.input, { backgroundColor: inputBg, borderColor, color: textColor }];

  return (
    <ScrollView
      style={[styles.scrollView, { backgroundColor: Colors[colorScheme].background }]}
      contentContainerStyle={styles.container}
      keyboardShouldPersistTaps="handled"
    >
      {/* Basic Info */}
      <Text style={styles.sectionTitle}>Basic Information</Text>
      <View style={styles.section}>
        <Text style={styles.label}>Product Name *</Text>
        <TextInput
          style={inputStyle}
          value={name}
          onChangeText={setName}
          placeholder="e.g. Coca Cola 330ml"
          placeholderTextColor="#999"
        />

        <Text style={styles.label}>SKU</Text>
        <TextInput
          style={inputStyle}
          value={sku}
          onChangeText={setSku}
          placeholder="e.g. BEV-CC-330"
          placeholderTextColor="#999"
          autoCapitalize="characters"
        />

        <Text style={styles.label}>Category</Text>
        <TextInput
          style={inputStyle}
          value={categoryId}
          onChangeText={setCategoryId}
          placeholder="Category ID (picker coming soon)"
          placeholderTextColor="#999"
          keyboardType="number-pad"
        />

        <Text style={styles.label}>Unit</Text>
        <TextInput
          style={inputStyle}
          value={unit}
          onChangeText={setUnit}
          placeholder="e.g. pcs, kg, liter"
          placeholderTextColor="#999"
        />
      </View>

      {/* Pricing */}
      <Text style={styles.sectionTitle}>Pricing</Text>
      <View style={styles.section}>
        <Text style={styles.label}>Buy Price</Text>
        <TextInput
          style={inputStyle}
          value={buyPrice}
          onChangeText={setBuyPrice}
          placeholder="0"
          placeholderTextColor="#999"
          keyboardType="decimal-pad"
        />

        <Text style={styles.label}>Sell Price *</Text>
        <TextInput
          style={inputStyle}
          value={sellPrice}
          onChangeText={setSellPrice}
          placeholder="0"
          placeholderTextColor="#999"
          keyboardType="decimal-pad"
        />
      </View>

      {/* Stock */}
      <Text style={styles.sectionTitle}>Stock</Text>
      <View style={styles.section}>
        <Text style={styles.label}>Stock Quantity</Text>
        <TextInput
          style={inputStyle}
          value={stockQty}
          onChangeText={setStockQty}
          placeholder="0"
          placeholderTextColor="#999"
          keyboardType="number-pad"
        />

        <Text style={styles.label}>Minimum Stock Alert</Text>
        <TextInput
          style={inputStyle}
          value={minStockAlert}
          onChangeText={setMinStockAlert}
          placeholder="0"
          placeholderTextColor="#999"
          keyboardType="number-pad"
        />
      </View>

      {/* Status */}
      <View style={styles.switchRow}>
        <Text style={styles.label}>Active</Text>
        <Switch
          value={isActive}
          onValueChange={setIsActive}
          trackColor={{ true: tint }}
        />
      </View>

      <Pressable
        style={({ pressed }) => [
          styles.button,
          { backgroundColor: tint, opacity: pressed ? 0.8 : 1 },
        ]}
        onPress={handleSave}
      >
        <Text style={styles.buttonText}>Save Product</Text>
      </Pressable>
    </ScrollView>
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
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginTop: 20,
    marginBottom: 4,
  },
  section: {
    marginBottom: 8,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 6,
    marginTop: 16,
  },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    fontSize: 16,
  },
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 20,
    marginBottom: 24,
  },
  button: {
    borderRadius: 10,
    padding: 16,
    alignItems: 'center',
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
});
