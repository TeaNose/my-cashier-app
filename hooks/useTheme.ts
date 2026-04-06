import { useColorScheme } from 'react-native';

import Colors, { type Theme } from '@/constants/Colors';

export function useTheme(): Theme & { colorScheme: 'light' | 'dark' } {
  const colorScheme = (useColorScheme() ?? 'light') as 'light' | 'dark';
  return { ...Colors[colorScheme], colorScheme };
}
