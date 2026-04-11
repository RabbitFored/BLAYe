const { InvoiceService } = require('../src/renderer/services/invoice.js');

describe('InvoiceService.calculateGST', () => {

  test('should correctly calculate intra-state GST (CGST/SGST)', () => {
    const result = InvoiceService.calculateGST('29', '29', 1000, 18);
    expect(result.cgst).toBe(90);
    expect(result.sgst).toBe(90);
    expect(result.igst).toBe(0);
    expect(result.total).toBe(180);
  });

  test('should correctly calculate inter-state GST (IGST)', () => {
    const result = InvoiceService.calculateGST('33', '29', 1000, 18);
    expect(result.cgst).toBe(0);
    expect(result.sgst).toBe(0);
    expect(result.igst).toBe(180);
    expect(result.total).toBe(180);
  });

  test('should round correctly to 2 decimal places', () => {
    const result = InvoiceService.calculateGST('29', '29', 1000.5, 18); // 180.09 GST => 90.045
    expect(result.cgst).toBe(90.05); // rounded up
    expect(result.sgst).toBe(90.05); // rounded up
    expect(result.igst).toBe(0);
  });
});
