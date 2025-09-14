// __tests__/utils.test.js

// This is a bit of a workaround to get our class-based app.js to work with Jest
// We need to simulate a browser environment for some parts of the app to load.
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!doctype html><html><body></body></html>');
global.window = dom.window;
global.document = dom.window.document;
global.navigator = dom.window.navigator;
const Dexie = require('dexie'); 
// Now, we can import the classes from app.js
const { Utils } = require('../app.js'); // Adjust path if needed

// 'describe' groups related tests together
describe('Utils.amountInWords', () => {

  // 'test' defines a single test case
  test('should correctly convert simple numbers', () => {
    expect(Utils.amountInWords(5)).toBe('Five');
    expect(Utils.amountInWords(19)).toBe('Nineteen');
  });

  test('should correctly convert numbers with tens and units', () => {
    expect(Utils.amountInWords(87)).toBe('Eighty Seven');
  });

  test('should correctly convert hundreds', () => {
    expect(Utils.amountInWords(300)).toBe('Three Hundred');
    expect(Utils.amountInWords(549)).toBe('Five Hundred and Forty Nine');
  });

  test('should correctly convert thousands', () => {
    expect(Utils.amountInWords(7000)).toBe('Seven Thousand');
    expect(Utils.amountInWords(8520)).toBe('Eight Thousand Five Hundred and Twenty');
    expect(Utils.amountInWords(99999)).toBe('Ninety Nine Thousand Nine Hundred and Ninety Nine');
  });
  
  test('should correctly convert lakhs', () => {
    expect(Utils.amountInWords(100000)).toBe('One Lakh');
    expect(Utils.amountInWords(1234567)).toBe('Twelve Lakh Thirty Four Thousand Five Hundred and Sixty Seven');
  });

  test('should correctly convert crores', () => {
    expect(Utils.amountInWords(10000000)).toBe('One Crore');
    expect(Utils.amountInWords(9988776655)).toBe('Nine Hundred and Ninety Eight Crore Eighty Seven Lakh Seventy Seven Thousand Six Hundred and Fifty Five');
  });
  
  test('should handle zero correctly', () => {
    expect(Utils.amountInWords(0)).toBe('Zero');
  });
});