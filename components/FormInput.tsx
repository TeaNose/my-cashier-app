import { StyleSheet, TextInput, type TextInputProps } from 'react-native';

import { Text, View } from '@/components/Themed';
import { useTheme } from '@/hooks/useTheme';

type Props = TextInputProps & {
  label: string;
  multiline?: boolean;
};

export function FormInput({ label, multiline, style, ...rest }: Props) {
  const { text, inputBackground, inputBorder } = useTheme();

  return (
    <View style={styles.wrapper}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        style={[
          styles.input,
          multiline && styles.textArea,
          { backgroundColor: inputBackground, borderColor: inputBorder, color: text },
          style,
        ]}
        placeholderTextColor="#999"
        textAlignVertical={multiline ? 'top' : 'auto'}
        multiline={multiline}
        numberOfLines={multiline ? 4 : undefined}
        {...rest}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    marginTop: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 6,
  },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    fontSize: 16,
  },
  textArea: {
    minHeight: 100,
  },
});
