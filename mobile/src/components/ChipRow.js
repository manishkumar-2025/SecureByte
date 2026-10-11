import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { spacing, touchMin } from '../theme';
import { useTheme } from '../hooks/useTheme';
import PressableScale from './PressableScale';

/** Horizontal row of selectable filter chips (single-select with "All"). */
export default function ChipRow({ options, value, onChange }) {
  const c = useTheme();
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
      {options.map((opt) => {
        const active = value === opt.value;
        return (
          <PressableScale
            key={opt.value || 'all'}
            onPress={() => onChange(opt.value)}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            accessibilityLabel={`Filter: ${opt.label}`}
          >
            <View
              style={[
                styles.chip,
                { backgroundColor: active ? c.primary : c.card, borderColor: active ? c.primary : c.border },
              ]}
            >
              <Text style={[styles.label, { color: active ? c.onPrimary : c.sub }]}>
                {opt.icon ? `${opt.icon} ` : ''}
                {opt.label}
              </Text>
            </View>
          </PressableScale>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: { paddingVertical: 4, paddingRight: spacing.l },
  chip: {
    minHeight: touchMin - 10,
    justifyContent: 'center',
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: spacing.m,
    marginRight: spacing.s,
  },
  label: { fontSize: 13, fontWeight: '600' },
});
