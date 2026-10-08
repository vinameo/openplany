import {
  createTheme,
  virtualColor,
  type CSSVariablesResolver,
  type MantineColorsTuple
} from '@mantine/core';

/*
 * Brand palette, taken from the OpenPlany logo:
 *   Cyber Black     #0F172A — wordmark, light-mode primary, dark-mode page
 *   Electric Yellow #FACC15 — "PLANY" and the box glow, dark-mode primary, accent
 *   Charcoal        #374151 — tagline, light-mode body text, dark-mode borders
 */

/** Slate scale; shade 8 is Cyber Black (the light-mode primary shade). */
const cyber: MantineColorsTuple = [
  '#F8FAFC',
  '#F1F5F9',
  '#E2E8F0',
  '#CBD5E1',
  '#94A3B8',
  '#64748B',
  '#475569',
  '#1E293B',
  '#0F172A',
  '#020617'
];

/** Yellow scale; shade 5 is Electric Yellow (the dark-mode primary shade). */
const electric: MantineColorsTuple = [
  '#FEFCE8',
  '#FEF9C3',
  '#FEF08A',
  '#FDE047',
  '#FCD62E',
  '#FACC15',
  '#EAB308',
  '#CA8A04',
  '#A16207',
  '#854D0E'
];

/** Light-mode neutrals; shade 8 is Charcoal. */
const gray: MantineColorsTuple = [
  '#F9FAFB',
  '#F3F4F6',
  '#E5E7EB',
  '#DDE1E6',
  '#D1D5DB',
  '#9CA3AF',
  '#6B7280',
  '#4B5563',
  '#374151',
  '#1F2937'
];

/**
 * Dark-mode neutrals, as Mantine uses them: 0 text, 2 dimmed, 3 placeholder,
 * 4 borders (Charcoal), 5 hover, 6 inputs, 7 body (Cyber Black), 8 page.
 */
const dark: MantineColorsTuple = [
  '#CBD5E1',
  '#B4C0D0',
  '#94A3B8',
  '#8A98AE',
  '#374151',
  '#2A3646',
  '#1E293B',
  '#0F172A',
  '#0B1120',
  '#060A14'
];

export const theme = createTheme({
  primaryColor: 'primary',
  // Shade per scheme; with `primary` virtual, light → Cyber Black, dark → Electric Yellow.
  primaryShade: {
    light: 8,
    dark: 5
  },
  // Filled colours pick black (Cyber Black) or white text by luminance: white on Cyber Black, Cyber Black on yellow.
  autoContrast: true,
  black: '#0F172A',
  white: '#FFFFFF',
  colors: {
    cyber,
    electric,
    gray,
    dark,
    primary: virtualColor({ name: 'primary', light: 'cyber', dark: 'electric' })
  },
  fontFamily:
    'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  headings: {
    fontFamily:
      'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
  },
  defaultRadius: 'md',
  components: {
    // Cyber Black links sit in Charcoal text in light mode; the underline is what tells them apart.
    Anchor: {
      defaultProps: {
        underline: 'always'
      }
    },
    Avatar: {
      defaultProps: {
        color: 'primary',
        variant: 'filled'
      }
    },
    Button: {
      defaultProps: {
        radius: 'md'
      }
    },
    TextInput: {
      defaultProps: {
        radius: 'md'
      }
    },
    Select: {
      defaultProps: {
        radius: 'md'
      }
    },
    Paper: {
      defaultProps: {
        radius: 'md'
      }
    }
  }
});

/** Semantic colours Mantine derives from its palettes that the brand needs to differ. */
export const cssVariablesResolver: CSSVariablesResolver = () => ({
  variables: {},
  light: {
    // Charcoal body text; titles keep Cyber Black through --mantine-color-bright.
    '--mantine-color-text': 'var(--mantine-color-gray-8)',
    // Mantine's defaults (gray-5, red-6) are under 4.5:1 on white.
    '--mantine-color-placeholder': 'var(--mantine-color-gray-6)',
    '--mantine-color-error': 'var(--mantine-color-red-9)'
  },
  dark: {
    '--mantine-color-bright': 'var(--mantine-color-cyber-0)',
    // Mantine's red-8 is about 4:1 on Cyber Black.
    '--mantine-color-error': 'var(--mantine-color-red-4)'
  }
});
