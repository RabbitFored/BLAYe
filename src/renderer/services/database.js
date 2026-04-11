/**
 * BLAYe - Database Configuration & Service
 * Dexie.js IndexedDB wrapper
 */

const db = new Dexie('BLAYeDB');

const BACKEND_URL = 'https://gst-api.theostrich.eu.org/api/v1';

db.version(1).stores({
  companies: '++id, gstin, name, state, state_code, address, city, pincode, beneficiaryName, accountNumber, ifscCode, bankName, branch, created_at',
  customers: '++id, name, gstin, aadhar, phone, email, state_code, created_at',
  products: '++id, name, hsn_code, category, stock_quantity, stock_rolls, min_stock, rate,  unit, gst_rate, created_at',
  invoices: '++id, invoice_number, customer_id, date, total_amount, amount_paid, payment_status, created_at',
  payments: '++id, invoice_id, amount, payment_method, payment_date, created_at',
  inventory_transactions: '++id, product_id, transaction_type, quantity, reference_id, created_at',
  settings: '++id, key, value, updated_at',
  sync_queue: '++id, table_name, operation, record_id, data, status, created_at'
});

class DatabaseService {
  static async initializeData() {
    try {
      await db.open();
      
      const settingsCount = await db.settings.count();
      if (settingsCount === 0) {
        await this.seedInitialData();
      }
      
      await this.loadAppSettings();
      await this.loadCompanyInfo();
      return true;
    } catch (error) {
      console.error('Failed to initialize database:', error);
      NotificationService.error('Database initialization failed. Using demo mode.');
      
      appState.settings = {
        next_invoice_number: '1',
        invoice_prefix: 'INV',
        payment_terms: '30',
        terms_conditions: 'Payment due within 30 days.',
        auto_backup: 'daily',
        low_stock_threshold: '10'
      };
      
      appState.company = { id: 1 };
      appState.updateHeaderTitle(appState.company.name);
      return true;
    }
  }
  
  static async loadCompanyInfo() {
    try {
      const company = await db.companies.orderBy('id').first();
      if (company) {
        appState.company = company;
        appState.updateHeaderTitle(company.name);
      }
    } catch (error) {
      console.error('Failed to load company info:', error);
    }
  }

  static async seedInitialData() {
    try {
      console.log('Seeding initial data...');
      await db.companies.add({});
      await db.customers.bulkAdd([]);
      await db.products.bulkAdd([]);
      await db.invoices.bulkAdd([]);

      const defaultSettings = [
        { key: 'next_invoice_number', value: '1', updated_at: new Date() },
        { key: 'invoice_prefix', value: 'INV', updated_at: new Date() },
        { key: 'payment_terms', value: '30', updated_at: new Date() },
        { key: 'terms_conditions', value: 'Payment due within 30 days. Subject to Surat jurisdiction.', updated_at: new Date() },
        { key: 'auto_backup', value: 'daily', updated_at: new Date() },
        { key: 'low_stock_threshold', value: '10', updated_at: new Date() },
        { key: 'isSetupComplete', value: 'false', updated_at: new Date() }
      ];
      await db.settings.bulkAdd(defaultSettings);
    } catch (error) {
      console.error('Failed to seed data:', error);
      throw error;
    }
  }

  static async loadAppSettings() {
    try {
      const settings = await db.settings.toArray();
      appState.settings = {};
      settings.forEach(setting => {
        appState.settings[setting.key] = setting.value;
      });
    } catch (error) {
      console.error('Failed to load settings:', error);
    }
  }

  static async updateSetting(key, value) {
    try {
      const existing = await db.settings.where('key').equals(key).first();
      if (existing) {
        await db.settings.update(existing.id, { value, updated_at: new Date() });
      } else {
        await db.settings.add({ key, value, updated_at: new Date() });
      }
      appState.settings[key] = value;
    } catch (error) {
      console.error('Failed to update setting:', error);
    }
  }

  static async performFactoryReset() {
    LoadingService.show('Resetting application...');
    try {
      await db.delete();
      NotificationService.success('Application has been reset and will now reload.');
      setTimeout(() => window.location.reload(), 2000);
    } catch (error) {
      console.error('Factory reset failed:', error);
      NotificationService.error('Failed to reset the application.');
      LoadingService.hide();
    }
  }
}
