import FontAwesome from '@expo/vector-icons/FontAwesome';
import { StyleSheet, TouchableOpacity, Text as RNText } from 'react-native';

import { Text, View } from '@/components/Themed';
import { useTheme } from '@/hooks/useTheme';

type Props = {
  icon: React.ComponentProps<typeof FontAwesome>['name'];
  title: string;
  subtitle: string;
  buttonLabel: string;
  onPress: () => void;
};

export function EmptyState({ icon, title, subtitle, buttonLabel, onPress }: Props) {
  const { tint } = useTheme();

  return (
    <View style={styles.container}>
      <FontAwesome name={icon} size={48} color={tint} style={styles.icon} />
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.subtitle}>{subtitle}</Text>

      <TouchableOpacity
        activeOpacity={0.7}
        style={[styles.button, { backgroundColor: tint }]}
        onPress={onPress}
      >
        <FontAwesome name="plus" size={16} color="#fff" />
        <RNText style={styles.buttonText}>{buttonLabel}</RNText>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  icon: {
    marginBottom: 16,
  },
  title: {
    fontSize: 22,
    fontWeight: 'bold',
  },
  subtitle: {
    fontSize: 14,
    opacity: 0.6,
    marginTop: 8,
    marginBottom: 28,
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 10,
    paddingVertical: 14,
    paddingHorizontal: 24,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
});
