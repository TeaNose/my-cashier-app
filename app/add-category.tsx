import { useState } from 'react';
import { StyleSheet, ScrollView, Alert } from 'react-native';
import { router } from 'expo-router';

import { View } from '@/components/Themed';
import { FormInput } from '@/components/FormInput';
import { PrimaryButton } from '@/components/PrimaryButton';
import { useTheme } from '@/hooks/useTheme';
import { createCategory } from '@/db/categories';

export default function AddCategoryScreen() {
  const { background } = useTheme();

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!name.trim()) {
      Alert.alert('Validation', 'Category name is required.');
      return;
    }

    setSaving(true);
    try {
      await createCategory(name, description);
      Alert.alert('Success', `Category "${name}" created.`, [
        { text: 'OK', onPress: () => router.back() },
      ]);
    } catch (error) {
      Alert.alert('Error', 'Failed to save category. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <ScrollView
      style={[styles.scrollView, { backgroundColor: background }]}
      contentContainerStyle={styles.container}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.section}>
        <FormInput
          label="Name *"
          value={name}
          onChangeText={setName}
          placeholder="e.g. Beverages"
        />
        <FormInput
          label="Description"
          value={description}
          onChangeText={setDescription}
          placeholder="Optional description"
          multiline
        />
      </View>

      <PrimaryButton label={saving ? 'Saving...' : 'Save Category'} onPress={handleSave} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scrollView: {
    flex: 1,
  },
  container: {
    padding: 20,
  },
  section: {
    marginBottom: 24,
  },
});
