const { _electron: electron } = require('playwright');
const { test, expect } = require('@playwright/test');
const { findLatestBuild, parseElectronApp } = require('electron-playwright-helpers');

let electronApp;

test.beforeAll(async () => {
  electronApp = await electron.launch({
    args: ['.'] // launches the current directory (uses package.json main entry point)
  });
});

test.afterAll(async () => {
  if (electronApp) {
    await electronApp.close();
  }
});

test('Full Invoice Creation Workflow', async () => {
  const window = await electronApp.firstWindow();
  await window.waitForSelector('#app:not(.hidden)');

  // 1. Add a Product
  await window.click('[data-page="products"]');
  await window.click('#add-product-btn');
  await window.fill('#product-name', 'E2E Test Product');
  await window.fill('#product-rate', '150');
  await window.fill('#product-hsn', '1234');
  await window.selectOption('#product-gst', '12');
  await window.click('#product-form button[type="submit"]');
  
  // Verify product was added
  await expect(window.locator('text=E2E Test Product').first()).toBeVisible();

  // 2. Add a Customer
  await window.click('[data-page="customers"]');
  await window.click('#add-customer-btn');
  await window.fill('#customer-name', 'E2E Test Customer');
  await window.fill('#customer-phone', '9876543210');
  await window.click('#customer-form button[type="submit"]');
  
  // Verify customer was added
  await expect(window.locator('text=E2E Test Customer').first()).toBeVisible();

  // 3. Create an Invoice
  await window.click('[data-page="invoices"]');
  await window.click('#create-invoice-btn');
  
  // Select the customer we just created
  await window.selectOption('#invoice-customer', { label: 'E2E Test Customer' });
  
  // Select the product in the first item row
  await window.selectOption('.item-row .product-select', { label: 'E2E Test Product - ₹150' });
  await window.fill('.item-row .quantity-input', '2');
  
  // Verify calculations
  await expect(window.locator('#invoice-total')).toHaveText('₹300'); // 150 * 2 = 300
  
  // Save the invoice
  await window.click('#invoice-form button[type="submit"]');

  // 4. Verify Invoice was created and viewer opens
  await expect(window.locator('#invoice-viewer-title')).toContainText('Invoice');
  await expect(window.locator('#invoice-content').first()).toContainText('E2E Test Customer');
  
  // Close the viewer
  await window.click('#invoice-viewer-modal .modal-close');
});