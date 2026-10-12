import React from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { radius, spacing } from '../theme';
import { useTheme, useReducedMotion } from '../hooks/useTheme';

/**
 * Segmented tab control (Queue / Analytics / Users) with an animated
 * selection thumb. Fully theme-aware and keyboard/screen-reader
 * labelled. Honours reduced motion (thumb jumps without animating).
 */
export default function SegmentedTabs({ tabs, value, onChange }) {
  const c = useTheme();
  const reducedMotion = useReducedMotion();
  const index = Math.max(0, tabs.findIndex((t) => t.value === value));
  const animatedIndex = React.useRef(new Animated.Value(index)).current;

  React.useEffect(() => {
    Animated.timing(animatedIndex, { toValue: index, duration: reducedMotion ? 0 : 180, useNativeDriver: true }).start();
  }, [index, animatedIndex, reducedMotion]);

  return (
    <View style={[styles.wrap, { backgroundColor: c.background, borderColor: c.border }]}>
      <Animated.View
        pointerEvents="none"
        style={[
          styles.thumb,
          {
            backgroundColor: c.cardElevated,
            width: `${100 / tabs.length}%`,
            transform: [
              {
                translateX: animatedIndex.interpolate({
                  inputRange: [0, Math.max(tabs.length - 1, 1)],
                  outputRange: ['0%', `${100 * (tabs.length - 1)}%`],
                }),
              },
            ],
          },
        ]}
      />
      {tabs.map((t) => {
        const active = t.value === value;
        return (
          <Pressable
            key={t.value}
            onPress={() => onChange(t.value)}
            style={styles.tabWrap}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            hitSlop={{ top: 8, bottom: 8 }}
          >
            <Text
              style={[styles.tab, { color: active ? c.text : c.sub }, active && styles.active]}
            >
              {t.icon ? `${t.icon} ` : ''}
              {t.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    borderRadius: radius.m,
    borderWidth: 1,
    padding: 3,
    position: 'relative',
    overflow: 'hidden',
  },
  thumb: {
    position: 'absolute',
    top: 3,
    bottom: 3,
    left: 3,
    borderRadius: radius.s,
    elevation: 2,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
  },
  tabWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', zIndex: 1 },
  tab: {
    fontSize: 13.5,
    fontWeight: '600',
    paddingVertical: 9,
    paddingHorizontal: spacing.s,
    textAlign: 'center',
  },
  active: {
    fontWeight: '800',
  },
});
