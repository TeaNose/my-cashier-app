import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, useColorScheme, View } from 'react-native';
import FontAwesome from '@expo/vector-icons/FontAwesome';

import Colors from '@/constants/Colors';
import { t } from '@/i18n';

type Props = {
  onFinish: () => void;
};

export function SplashOverlay({ onFinish }: Props) {
  const scheme = useColorScheme() ?? 'light';
  const palette = Colors[scheme];
  const opacity = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0.85)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: 350,
        useNativeDriver: true,
      }),
      Animated.spring(scale, {
        toValue: 1,
        friction: 6,
        tension: 80,
        useNativeDriver: true,
      }),
    ]).start();

    const timeout = setTimeout(() => {
      Animated.timing(opacity, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }).start(() => onFinish());
    }, 1400);

    return () => clearTimeout(timeout);
  }, [opacity, scale, onFinish]);

  return (
    <View style={[styles.container, { backgroundColor: palette.background }]}>
      <Animated.View style={{ opacity, transform: [{ scale }], alignItems: 'center' }}>
        <View style={[styles.iconCircle, { backgroundColor: palette.tint }]}>
          <FontAwesome name="shopping-cart" size={48} color="#fff" />
        </View>
        <Animated.Text style={[styles.title, { color: palette.text }]}>
          My Cashier App
        </Animated.Text>
        <Animated.Text style={[styles.subtitle, { color: palette.text }]}>
          {t('splash.tagline')}
        </Animated.Text>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 999,
  },
  iconCircle: {
    width: 110,
    height: 110,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.18,
    shadowRadius: 12,
    elevation: 6,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  subtitle: {
    fontSize: 14,
    opacity: 0.55,
    marginTop: 6,
  },
});
