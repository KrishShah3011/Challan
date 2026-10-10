import { describe, expect, it } from 'vitest';
import { validateMasters } from './masters';

const good = {
  companies: [
    { Name: 'Real Buyer', Address: 'Vadodara', GSTIN: '24aabca1111d1zr', 'State Code': '' },
    { Name: 'Cash Buyer', Address: 'Jaipur', GSTIN: '', 'State Code': '8' },
  ],
  items: [{ Name: 'Turmeric', Description: 'Ground', HSN: '091030', Unit: 'Kg', 'GST Rate': '5%', 'Default Price': '1,200.50' }],
  charges: [{ Name: 'Freight', 'GST Rate': '18' }],
};

describe('validateMasters', () => {
  it('cleans a good file', () => {
    const r = validateMasters(good);
    expect(r.errors).toEqual([]);
    expect(r.companies).toEqual([
      { name: 'Real Buyer', address: 'Vadodara', gstin: '24AABCA1111D1ZR', state_code: '24' },
      { name: 'Cash Buyer', address: 'Jaipur', gstin: null, state_code: '08' },
    ]);
    expect(r.items[0]).toEqual({ name: 'Turmeric', description: 'Ground', hsn: '091030', unit: 'Kg', gst_rate: '5', default_price: '1200.50' });
    expect(r.chargeTypes).toEqual([{ name: 'Freight', gst_rate: '18' }]);
  });

  it('reports every problem with its Excel row number', () => {
    const r = validateMasters({
      companies: [
        ...good.companies,
        { Name: 'Real Buyer', Address: 'Elsewhere', GSTIN: '24AABCA1111D1ZR', 'State Code': '' },
        { Name: 'Typo Co', Address: 'X', GSTIN: '24AABCA1111D1ZS', 'State Code': '' },
        { Name: 'Wrong State', Address: 'X', GSTIN: '24AABCA1111D1ZR', 'State Code': '27' },
        { Name: 'No State', Address: 'X', GSTIN: '', 'State Code': '' },
      ],
      items: [
        { Name: 'Lost Zero', HSN: '91030', Unit: 'Kg', 'GST Rate': '5' },
        { Name: 'turmeric', HSN: '0910', Unit: 'Kg', 'GST Rate': '5' },
        { Name: 'Turmeric', HSN: '0910', Unit: '', 'GST Rate': '150' },
      ],
      charges: [{ Name: '', 'GST Rate': '' }],
    });
    expect(r.errors).toEqual(expect.arrayContaining([
      'Companies row 4: Same name and GSTIN as row 2.',
      expect.stringMatching(/^Companies row 5: GSTIN 24AABCA1111D1ZS: The last character does not match/),
      'Companies row 6: State Code 27 does not match the GSTIN, which starts with 24.',
      'Companies row 7: State Code is missing or not a GST state code (for example 24 for Gujarat).',
      expect.stringMatching(/^Items row 2: HSN "91030" must be 4, 6 or 8 digits/),
      'Items row 4: Same name as row 3.',
      'Items row 4: Unit is empty.',
      'Items row 4: GST Rate "150" must be a number from 0 to 100.',
      'Charges row 2: Name is empty.',
      'Charges row 2: GST Rate "" must be a number from 0 to 100.',
    ]));
  });
});
