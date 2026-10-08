export const UNITS: readonly string[] = ['Nos', 'Pcs', 'Kg', 'Mtr', 'Ltr', 'Box', 'Set'];
export const PAYMENT_TERMS: readonly string[] = ['Immediate', '7 days', '15 days', '30 days', '45 days', '60 days', '90 days'];
export const TRANSPORT_MODES: readonly string[] = ['By Road', 'By Hand', 'Courier', 'Rail', 'Air'];
/** HSN codes are 4, 6 or 8 digits; stored as text so leading zeros survive. */
export const HSN_PATTERN = /^\d{4}(\d{2}){0,2}$/;
