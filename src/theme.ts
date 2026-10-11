import {
  Button,
  Checkbox,
  createTheme,
  Loader,
  PasswordInput,
  Select,
  Textarea,
  TextInput,
  type CSSVariablesResolver,
  type MantineColorsTuple,
} from '@mantine/core';

/**
 * Neon tuples keep the pure neon colour at index 4 (primaryShade). In dark mode Mantine takes the
 * text of light/outline/subtle variants from index 0 and their tint from index 2, hence the light tint first.
 */
const neon = (tint: string, base: string, ...darker: [string, string, string, string, string]): MantineColorsTuple => [
  tint, base, base, base, base, ...darker,
];

const YELLOW = neon('#fff67a', '#fcee0a', '#e0d300', '#b8ad00', '#8f8600', '#666000', '#3d3a00');
const CYAN = neon('#7df7ff', '#00f0ff', '#00d2e0', '#00a8b3', '#007f87', '#00565b', '#002e31');
const RED = neon('#ff8aa1', '#ff2a55', '#e02049', '#b81a3b', '#8f142e', '#660e20', '#3d0813');
const MAGENTA = neon('#ff8ceb', '#ff2bd6', '#e022bc', '#b81b98', '#8f1575', '#660f54', '#3d0932');
const GREEN = neon('#8cffb9', '#39ff88', '#2fe074', '#26b85f', '#1d8f49', '#156633', '#0c3d1e');
const ORANGE = neon('#ffc27a', '#ff9a1f', '#e0861a', '#b86c15', '#8f5410', '#663c0b', '#3d2406');

/** Large by default: 18px+ text, 50px inputs and buttons (size "lg"). */
export const theme = createTheme({
  primaryColor: 'neon',
  primaryShade: 4,
  autoContrast: true,
  white: '#e6f1ff',
  black: '#07080d',
  defaultRadius: 0,
  respectReducedMotion: true,
  fontFamily: "'Chakra Petch', system-ui, sans-serif",
  fontFamilyMonospace: "'JetBrains Mono Variable', ui-monospace, monospace",
  headings: {
    fontFamily: "'Orbitron Variable', 'Chakra Petch', sans-serif",
    fontWeight: '800',
    sizes: {
      h1: { fontSize: 'clamp(1.6rem, 4.5vw, 2.6rem)', lineHeight: '1.15' },
      h2: { fontSize: '1.5rem', lineHeight: '1.15' },
      h3: { fontSize: '1.25rem', lineHeight: '1.15' },
    },
  },
  fontSizes: { xs: '1.125rem', sm: '1.125rem', md: '1.125rem', lg: '1.25rem', xl: '1.5rem' },
  colors: {
    dark: ['#e6f1ff', '#c3d3ea', '#8ea3c0', '#7388a6', '#23304a', '#1b2335', '#151a26', '#0e1119', '#0a0d14', '#07080d'],
    neon: YELLOW,
    yellow: YELLOW,
    cyan: CYAN,
    blue: CYAN,
    teal: CYAN,
    red: RED,
    violet: MAGENTA,
    green: GREEN,
    orange: ORANGE,
  },
  components: {
    Button: Button.extend({ defaultProps: { size: 'lg' } }),
    TextInput: TextInput.extend({ defaultProps: { size: 'lg' } }),
    PasswordInput: PasswordInput.extend({ defaultProps: { size: 'lg' } }),
    Textarea: Textarea.extend({ defaultProps: { size: 'lg' } }),
    Select: Select.extend({ defaultProps: { size: 'lg', allowDeselect: false, maxDropdownHeight: 320 } }),
    Checkbox: Checkbox.extend({ defaultProps: { size: 'lg' } }),
    Loader: Loader.extend({ defaultProps: { type: 'bars' } }),
  },
});

/** Dark-only: palette roles come from the --cy-* tokens in styles/cyber.css. */
export const cssVariablesResolver: CSSVariablesResolver = () => ({
  variables: {},
  light: {},
  dark: {
    '--mantine-color-body': 'var(--cy-bg)',
    '--mantine-color-text': 'var(--cy-text)',
    '--mantine-color-dimmed': 'var(--cy-dim)',
    '--mantine-color-placeholder': 'var(--cy-dim)',
    '--mantine-color-anchor': 'var(--cy-cyan)',
    '--mantine-color-error': 'var(--cy-red)',
  },
});
