import { Button, Checkbox, createTheme, PasswordInput, Select, Textarea, TextInput } from '@mantine/core';

/** Large by default: 18px+ text, 50px inputs and buttons (size "lg"). */
export const theme = createTheme({
  primaryColor: 'blue',
  defaultRadius: 'md',
  fontSizes: { xs: '1.125rem', sm: '1.125rem', md: '1.125rem', lg: '1.25rem', xl: '1.5rem' },
  components: {
    Button: Button.extend({ defaultProps: { size: 'lg' } }),
    TextInput: TextInput.extend({ defaultProps: { size: 'lg' } }),
    PasswordInput: PasswordInput.extend({ defaultProps: { size: 'lg' } }),
    Textarea: Textarea.extend({ defaultProps: { size: 'lg' } }),
    Select: Select.extend({ defaultProps: { size: 'lg', allowDeselect: false, maxDropdownHeight: 320 } }),
    Checkbox: Checkbox.extend({ defaultProps: { size: 'lg' } }),
  },
});

/** Big square tiles on Home (links and the Excel button share this look). */
export const TILE_STYLE = {
  textDecoration: 'none',
  color: 'inherit',
  minHeight: 120,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 8,
} as const;
