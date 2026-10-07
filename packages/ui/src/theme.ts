import {
  createTheme,
  type MantineColorsTuple
} from '@mantine/core';

const brand: MantineColorsTuple = [
  '#eef4ff',
  '#dbe7ff',
  '#b7ccff',
  '#8fafff',
  '#6d94ff',
  '#527fff',
  '#3f70ff',
  '#2c5fe6',
  '#1c50cc',
  '#0d42b3'
];

export const theme = createTheme({
  primaryColor: 'brand',
  primaryShade: {
    light: 7,
    dark: 5
  },
  colors: {
    brand
  },
  fontFamily:
    'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  headings: {
    fontFamily:
      'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
  },
  defaultRadius: 'md',
  components: {
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