import { useState } from 'react';
import { StyleSheet, ScrollView, Alert } from 'react-native';
import { router } from 'expo-router';

import { View } from '@/components/Themed';
import { FormInput } from '@/components/FormInput';
import { PrimaryButton } from '@/components/PrimaryButton';
import { useTheme } from '@/hooks/useTheme';
import { createCategory } from '@/db/categories';
import { t } from '@/i18n';

export default function AddCategoryScreen() {
  const { background } = useTheme();

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!name.trim()) {
      Alert.alert(t('common.validation'), t('categories.name_required'));
      return;
    }

    setSaving(true);
    try {
      await createCategory(name, description);
      Alert.alert(t('common.success'), t('categories.created', { name }), [
        { text: t('common.ok'), onPress: () => router.back() },
      ]);
    } catch (error) {
      Alert.alert(t('common.error'), `${t('categories.save_failed')} ${t('common.try_again')}`);
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
          label={t('categories.name')}
          value={name}
          onChangeText={setName}
          placeholder={t('categories.name_placeholder')}
        />
        <FormInput
          label={t('categories.description')}
          value={description}
          onChangeText={setDescription}
          placeholder={t('categories.description_placeholder')}
          multiline
        />
      </View>

      <PrimaryButton label={saving ? t('common.saving') : t('categories.save_category')} onPress={handleSave} />
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
