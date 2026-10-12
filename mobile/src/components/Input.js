import React, { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { radius, spacing, touchMin, type } from '../theme';
import { useTheme } from '../hooks/useTheme';

/**
 * Labelled, theme-aware text input with a focus ring, inline validation
 * message and accessible label. Focus ring gives clear keyboard-focus
 * feedback (Material 3 style) without extra dependencies.
 */
export default function Input({ label, error, hint, secureTextEntry = false, style, ...props }) {
  const c = useTheme();
  const [focused, setFocused] = useState(false);

  return (
    <View style={[styles.container, style]}>
      {label ? <Text style={[styles.label, { color: c.text }]}>{label}</Text> : null}
      <TextInput
        style={[
          styles.input,
          { backgroundColor: c.card, borderColor: c.border, color: c.text },
          focused && { borderColor: c.primary, borderWidth: 2 },
          error ? { borderColor: c.danger } : null,
        ]}
        placeholderTextColor={c.faint}
        secureTextEntry={secureTextEntry}
        accessibilityLabel={label}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        {...props}
      />
      {hint && !error ? <Text style={[styles.hint, { color: c.faint }]}>{hint}</Text> : null}
      {error ? (
        <Text style={[styles.error, { color: c.danger }]} accessibilityLiveRegion="polite">
          ⚠ {error}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginBottom: spacing.m },
  label: { ...type.caption, fontWeight: '700', marginBottom: 6, letterSpacing: 0.2 },
  input: {
    minHeight: touchMin,
    borderWidth: 1.2,
    borderRadius: radius.m,
    paddingHorizontal: spacing.l,
    fontSize: 15,
  },
  hint: { fontSize: 12, marginTop: 4 },
  error: { fontSize: 12.5, marginTop: 5, fontWeight: '600' },
});
