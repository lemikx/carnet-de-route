import { convertToEurCents, effectiveRate, formatEur, parseAmount, toCents } from './money';

describe('parseAmount', () => {
  it.each([
    ['40,5', 40.5],
    ['1 200,50', 1200.5],
    ['1200.5', 1200.5],
    ['0', 0],
    ['  12 ', 12],
  ])('accepte %s', (input, expected) => expect(parseAmount(input)).toBe(expected));
  it.each(['12,345', '-3', '', 'abc', '1,2,3', '1e3'])('refuse %s', (input) => expect(parseAmount(input)).toBeNull());
});

describe('centimes', () => {
  it('arrondit sans erreur de virgule flottante', () => {
    expect(toCents(19.99)).toBe(1999);
    expect(toCents(0.1 + 0.2)).toBe(30);
  });
  it('convertit en euros', () => expect(convertToEurCents(10000, 0.0061)).toBe(6100));
});

describe('effectiveRate', () => {
  it('ne majore pas l’euro', () => expect(effectiveRate('EUR', 1, 3)).toBe(1));
  it('majore une devise étrangère de la marge', () => expect(effectiveRate('JPY', 0.0061, 3)).toBeCloseTo(0.006283, 6));
});

describe('formatEur', () => {
  it('formate à la française', () => expect(formatEur(123456).replace(/\s/g, ' ')).toBe('1 234,56 €'));
});
