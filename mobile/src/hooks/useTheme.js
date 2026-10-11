import { useEffect, useState } from 'react';
import { AccessibilityInfo, Appearance, useColorScheme } from 'react-native';
import { dark, light, palettes } from '../theme';

/**
 * Returns the ACTIVE palette (light or dark), following the OS setting
 * live — flipping your phone to dark mode re-renders every themed
 * screen without a restart.
 */
export function useTheme() {
  const scheme = useColorScheme();
  const [system, setSystem] = useState(scheme || 'light');

  useEffect(() => {
    const sub = Appearance.addChangeListener(({ colorScheme }) => {
      setSystem(colorScheme || 'light');
    });
    return () => sub.remove();
  }, []);

  return palettes[system === 'dark' ? 'dark' : 'light'] || light;
}

/**
 * True when the user has requested reduced motion at the OS level.
 * Decorative animation (pulses, shimmers) MUST be gated on this;
 * emergency affordances (SOS countdown) remain but become static
 * text + haptics, never animation-only signals.
 */
export function useReducedMotion() {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled().then((v) => {
      if (mounted) setReduced(!!v);
    });
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', (v) => {
      if (mounted) setReduced(!!v);
    });
    return () => {
      mounted = false;
      sub.remove();
    };
  }, []);

  return reduced;
}
