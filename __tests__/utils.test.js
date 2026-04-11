const { Utils } = require('../src/renderer/services/utils.js');

describe('Utils.amountInWords', () => {

  test('should correctly convert simple numbers', () => {
    expect(Utils.amountInWords(5)).toBe('Five');
    expect(Utils.amountInWords(19)).toBe('Nineteen');
  });

  test('should correctly convert numbers with tens and units', () => {
    expect(Utils.amountInWords(87)).toBe('Eighty Seven');
  });

  test('should correctly convert hundreds', () => {
    expect(Utils.amountInWords(300)).toBe('Three Hundred');
    expect(Utils.amountInWords(549)).toBe('Five Hundred And Forty Nine');
  });

  test('should correctly convert thousands', () => {
    expect(Utils.amountInWords(7000)).toBe('Seven Thousand');
    expect(Utils.amountInWords(8520)).toBe('Eight Thousand Five Hundred And Twenty');
    expect(Utils.amountInWords(99999)).toBe('Ninety Nine Thousand Nine Hundred And Ninety Nine');
  });
  
  test('should correctly convert lakhs', () => {
    expect(Utils.amountInWords(100000)).toBe('One Lakh');
    expect(Utils.amountInWords(1234567)).toBe('Twelve Lakh Thirty Four Thousand Five Hundred And Sixty Seven');
  });

  test('should correctly convert crores', () => {
    expect(Utils.amountInWords(10000000)).toBe('One Crore');
    expect(Utils.amountInWords(9988776655)).toBe('Nine Hundred And Ninety Eight Crore Eighty Seven Lakh Seventy Six Thousand Six Hundred And Fifty Five');
  });
  
  test('should handle zero correctly', () => {
    expect(Utils.amountInWords(0)).toBe('Zero');
  });
});