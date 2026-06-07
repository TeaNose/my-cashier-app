import { useCallback, useState } from 'react';
import { FlatList, StyleSheet, Alert } from 'react-native';
import { router } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { TouchableOpacity } from 'react-native';

import { Text, View } from '@/components/Themed';
import { EmptyState } from '@/components/EmptyState';
import { useTheme } from '@/hooks/useTheme';
import { getCategories, deleteCategory, type Category } from '@/db/categories';
import { t } from '@/i18n';
import { upperCase } from '@/utils/text';

export default function CategoriesScreen() {
  const { tint } = useTheme();
  const [categories, setCategories] = useState<Category[]>([]);

  const loadCategories = useCallback(async () => {
    const data = await getCategories();
    setCategories(data);
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadCategories();
    }, [loadCategories]),
  );

  const handleDelete = (category: Category) => {
    Alert.alert(t('common.delete'), t('categories.delete_confirm', { name: upperCase(category.name) }), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.delete'),
        style: 'destructive',
        onPress: async () => {
          await deleteCategory(category.id);
          loadCategories();
        },
      },
    ]);
  };

  if (categories.length === 0) {
    return (
      <EmptyState
        icon="th-large"
        title={t('categories.title')}
        subtitle={t('categories.empty_subtitle')}
        buttonLabel={t('categories.add_button')}
        onPress={() => router.push('/add-category')}
      />
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={categories}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <View style={styles.row}>
            <View style={styles.rowContent}>
              <Text style={styles.name}>{upperCase(item.name)}</Text>
              {item.description ? (
                <Text style={styles.description}>{item.description}</Text>
              ) : null}
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
        onPress={() => router.push('/add-category')}
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
  description: {
    fontSize: 13,
    opacity: 0.6,
    marginTop: 2,
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
