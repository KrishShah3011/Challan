const ONES = [
  'Zero', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten',
  'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen',
];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

function below100(n: number): string {
  if (n < 20) return ONES[n];
  return TENS[Math.floor(n / 10)] + (n % 10 ? `-${ONES[n % 10]}` : '');
}

function below1000(n: number): string {
  const hundreds = Math.floor(n / 100);
  const rest = n % 100;
  return [hundreds ? `${ONES[hundreds]} Hundred` : '', rest ? below100(rest) : ''].filter(Boolean).join(' ');
}

/** Indian system: crore (10^7), lakh (10^5), thousand, hundred. Crores recurse, e.g. "One Lakh Crore". */
function indian(n: bigint): string {
  if (n === 0n) return '';
  const crore = n / 10000000n;
  const rest = n % 10000000n;
  const lakh = Number(rest / 100000n);
  const thousand = Number((rest % 100000n) / 1000n);
  const hundreds = Number(rest % 1000n);
  return [
    crore ? `${indian(crore)} Crore` : '',
    lakh ? `${below100(lakh)} Lakh` : '',
    thousand ? `${below100(thousand)} Thousand` : '',
    hundreds ? below1000(hundreds) : '',
  ]
    .filter(Boolean)
    .join(' ');
}

/** Whole rupees -> "Rupees One Lakh Twelve Thousand Three Hundred Forty-Five Only". */
export function amountInWords(rupees: string | number | bigint): string {
  const n = BigInt(rupees);
  if (n < 0n) throw new Error('amountInWords: negative amount');
  return `Rupees ${n === 0n ? 'Zero' : indian(n)} Only`;
}
