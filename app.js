/**
 * BLAYe - GST Billing System
 * Author: RabbitFoRed
 * ORG : THEOSTRICH
 * Date: September 2025
 */

// Database Configuration using Dexie.js

const db = new Dexie('BLAYeDB');


const BACKEND_URL = 'https://gst-api.theostrich.eu.org/api/v1';


db.version(1).stores({
  companies: '++id, gstin, name, state, state_code, address, city, pincode, beneficiaryName, accountNumber, ifscCode, bankName, branch, created_at',
  customers: '++id, name, gstin, aadhar, phone, email, state_code, created_at',
  products: '++id, name, hsn_code, category, stock_quantity, min_stock, rate,  unit, gst_rate, created_at',
  invoices: '++id, invoice_number, customer_id, date, total_amount, amount_paid, payment_status, created_at',
  payments: '++id, invoice_id, amount, payment_method, payment_date, created_at',
  inventory_transactions: '++id, product_id, transaction_type, quantity, reference_id, created_at',
  settings: '++id, key, value, updated_at',
  sync_queue: '++id, table_name, operation, record_id, data, status, created_at'
});

// Global Application State
class AppState {
  constructor() {
    this.currentPage = 'dashboard';
    this.currentUser = null;
    this.isOnline = navigator.onLine;
    this.syncInProgress = false;
    this.charts = {};
    this.settings = {};
    this.editingRecord = null;
    this.currentFilters = {};
    this.company = null;
    this.isInitialized = false;
  }

  updateSyncStatus() {
    const syncDot = document.getElementById('sync-dot');
    const syncText = document.getElementById('sync-text');
    
    if (!syncDot || !syncText) return;
    
    if (this.syncInProgress) {
      syncDot.className = 'status-dot syncing';
      syncText.textContent = 'Syncing...';
    } else if (this.isOnline) {
      syncDot.className = 'status-dot online';
      syncText.textContent = 'Online';
    } else {
      syncDot.className = 'status-dot offline';
      syncText.textContent = 'Offline';
    }
  }

  // FIXED: Update header title immediately
  updateHeaderTitle(companyName) {
    const titleEl = document.getElementById('app-title');
    if (titleEl && companyName) {
      titleEl.textContent = companyName;
    }
  }
}

const appState = new AppState();

// Utility Functions
class Utils {
  static getImageDimensions(dataUrl) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        resolve({ width: img.width, height: img.height });
      };
      img.onerror = reject;
      img.src = dataUrl;
    });
  }
  static formatCurrencyCompact(num) {
    if (num === null || num === undefined) return '₹0';
    const amount = Number(num);
    
    // For numbers in crores
    if (Math.abs(amount) >= 10000000) {
      return '₹' + (amount / 10000000).toFixed(2) + ' Cr';
    }
    // For numbers in lakhs
    if (Math.abs(amount) >= 100000) {
      return '₹' + (amount / 100000).toFixed(2) + ' L';
    }
    // For smaller numbers, format with commas
    return '₹' + amount.toLocaleString('en-IN', { maximumFractionDigits: 0 });
  }
  static amountInWords(num) {
    const amount = Math.round(num);

    if (amount > Number.MAX_SAFE_INTEGER) {
        return "Amount too large to represent in words";
    }
    if (amount === 0) return "Zero";

    const a = ['', 'one ', 'two ', 'three ', 'four ', 'five ', 'six ', 'seven ', 'eight ', 'nine ', 'ten ', 'eleven ', 'twelve ', 'thirteen ', 'fourteen ', 'fifteen ', 'sixteen ', 'seventeen ', 'eighteen ', 'nineteen '];
    // FIXED: Added trailing spaces to the 'tens' array
    const b = ['', '', 'twenty ', 'thirty ', 'forty ', 'fifty ', 'sixty ', 'seventy ', 'eighty ', 'ninety '];

    const toWords = (n, prefix = '') => {
      let str = '';
      if (n > 0) {
        if (n > 19) {
            str += b[Math.floor(n / 10)] + a[n % 10];
        } else {
            str += a[n];
        }
        str += prefix;
      }
      return str;
    }

    let result = '';
    result += (amount > 9999999) ? this.amountInWords(Math.floor(amount / 10000000)) + 'crore ' : '';
    result += toWords(Math.floor((amount / 100000) % 100), 'lakh ');
    result += toWords(Math.floor((amount / 1000) % 100), 'thousand ');
    result += toWords(Math.floor((amount / 100) % 10), 'hundred ');
    
    if (amount > 100 && amount % 100 > 0) {
        result += 'and ';
    }
    
    result += toWords(amount % 100, '');

    return result.trim().replace(/\s+/g, ' ').split(' ').map(s => s.charAt(0).toUpperCase() + s.substring(1)).join(' ');
  }

  static formatDateForInput(date) {
    if (!date) return '';
    const d = new Date(date);
    const year = d.getFullYear();
    const month = (d.getMonth() + 1).toString().padStart(2, '0');
    const day = d.getDate().toString().padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
  static formatCurrency(amount) {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(amount || 0);
  }

  static formatNumber(number) {
    return new Intl.NumberFormat('en-IN').format(number || 0);
  }

  static formatDate(date, format = 'short') {
    try {
      const options = format === 'long' ? 
        { day: '2-digit', month: 'long', year: 'numeric' } :
        { day: '2-digit', month: '2-digit', year: 'numeric' };
      
      return new Date(date).toLocaleDateString('en-IN', options);
    } catch {
      return 'Invalid Date';
    }
  }

  static generateId(prefix = '') {
    return prefix + Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
  }

  static validateGSTIN(gstin) {
    if (!gstin) return false;
    const gstinRegex = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;
    return gstinRegex.test(gstin.trim().toUpperCase());
  }

  static validateAadhar(aadhar) {
    if (!aadhar) return true; // Optional field
    const cleanAadhar = aadhar.replace(/\s/g, '');
    return /^\d{12}$/.test(cleanAadhar);
  }
  static formatAadhar(aadhar) {
    const clean = aadhar.replace(/\s/g, '');
    return clean.replace(/(\d{4})(\d{4})(\d{4})/, '$1 $2 $3');
  }
  static validatePhone(phone) {
    const phoneRegex = /^[6-9][0-9]{9}$/;
    return phoneRegex.test(phone.toString().replace(/\s/g, ''));
  }

  static validateEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  static debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
      const later = () => {
        clearTimeout(timeout);
        func(...args);
      };
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
    };
  }

  static async delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  static sanitizeHtml(str) {
    if (!str) return '';
    const temp = document.createElement('div');
    temp.textContent = str;
    return temp.innerHTML;
  }

  // FIXED: Enhanced amount calculation
  static calculateAmount(quantity, rate) {
    const qty = parseFloat(quantity) || 0;
    const rt = parseFloat(rate) || 0;
    return Math.round((qty * rt) * 100) / 100; // Round to 2 decimal places
  }

  static calculateGST(amount, gstRate) {
    const amt = parseFloat(amount) || 0;
    const rate = parseFloat(gstRate) || 0;
    return Math.round((amt * rate / 100) * 100) / 100;
  }
   static async checkForDuplicates(tableName, field, value, excludeId = null) {
    try {
      const existing = await db[tableName].where(field).equals(value).first();
      
      if (existing && (!excludeId || existing.id !== excludeId)) {
        return existing;
      }
      
      return false;
    } catch (error) {
      console.error('Error checking duplicates:', error);
      return false;
    }
  }
}


const STATES_OF_INDIA = [
  { "code": "35", "name": "ANDAMAN AND NICOBAR ISLANDS" }, { "code": "37", "name": "ANDHRA PRADESH" },
  { "code": "12", "name": "ARUNACHAL PRADESH" }, { "code": "18", "name": "ASSAM" },
  { "code": "10", "name": "BIHAR" }, { "code": "04", "name": "CHANDIGARH" },
  { "code": "22", "name": "CHHATTISGARH" }, { "code": "26", "name": "DADRA AND NAGAR HAVELI AND DAMAN AND DIU" },
  { "code": "07", "name": "DELHI" }, { "code": "30", "name": "GOA" },
  { "code": "24", "name": "GUJARAT" }, { "code": "06", "name": "HARYANA" },
  { "code": "02", "name": "HIMACHAL PRADESH" }, { "code": "01", "name": "JAMMU AND KASHMIR" },
  { "code": "20", "name": "JHARKHAND" }, { "code": "29", "name": "KARNATAKA" },
  { "code": "32", "name": "KERALA" }, { "code": "38", "name": "LADAKH" },
  { "code": "31", "name": "LAKSHADWEEP" }, { "code": "23", "name": "MADHYA PRADESH" },
  { "code": "27", "name": "MAHARASHTRA" }, { "code": "14", "name": "MANIPUR" },
  { "code": "17", "name": "MEGHALAYA" }, { "code": "15", "name": "MIZORAM" },
  { "code": "13", "name": "NAGALAND" }, { "code": "21", "name": "ODISHA" },
  { "code": "97", "name": "OTHER TERRITORY" }, { "code": "34", "name": "PUDUCHERRY" },
  { "code": "03", "name": "PUNJAB" }, { "code": "08", "name": "RAJASTHAN" },
  { "code": "11", "name": "SIKKIM" }, { "code": "33", "name": "TAMIL NADU" },
  { "code": "36", "name": "TELANGANA" }, { "code": "16", "name": "TRIPURA" },
  { "code": "09", "name": "UTTAR PRADESH" }, { "code": "05", "name": "UTTARAKHAND" },
  { "code": "19", "name": "WEST BENGAL" }
];

class NotificationService {
  static show(message, type = 'info', duration = 5000) {
    const container = document.getElementById('notification-container');
    if (!container) return;
    
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    
    const icons = {
      success: '<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>',
      error: '<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>',
      warning: '<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>',
      info: '<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>'
    };

    notification.innerHTML = `
      <div class="notification-icon" style="color: var(--color-${type})">${icons[type]}</div>
      <div class="notification-content">
        <p class="notification-message">${Utils.sanitizeHtml(message)}</p>
      </div>
      <button class="notification-close" onclick="this.parentElement.remove()">&times;</button>
    `;

    container.appendChild(notification);

    if (duration > 0) {
      setTimeout(() => {
        if (notification.parentElement) {
          notification.remove();
        }
      }, duration);
    }

    return notification;
  }

  static success(message, duration = 3000) {
    return this.show(message, 'success', duration);
  }

  static error(message, duration = 5000) {
    return this.show(message, 'error', duration);
  }

  static warning(message, duration = 4000) {
    return this.show(message, 'warning', duration);
  }

  static info(message, duration = 3000) {
    return this.show(message, 'info', duration);
  }
}

// Loading Service
class LoadingService {
  static show(message = 'Processing...') {
    const overlay = document.getElementById('loading-overlay');
    const messageEl = document.getElementById('loading-message');
    if (overlay && messageEl) {
      messageEl.textContent = message;
      overlay.classList.remove('hidden');
    }
  }

  static hide() {
    const overlay = document.getElementById('loading-overlay');
    if (overlay) {
      overlay.classList.add('hidden');
    }
  }
}

// FIXED: Database Service with proper error handling
class DatabaseService {
  static async initializeData() {
    try {
      // Try to open the database first
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
      
      // Initialize with default data if DB fails
      appState.settings = {
        next_invoice_number: '1',
        invoice_prefix: 'INV',
        payment_terms: '30',
        terms_conditions: 'Payment due within 30 days.',
        auto_backup: 'daily',
        low_stock_threshold: '10'
      };
      
      appState.company = {
        id: 1
      };
      
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
      // Company data
      console.log('Seeding initial data...');

      const company = {};
      await db.companies.add(company);

      const customers = [];
      await db.customers.bulkAdd(customers);

      const products = [];
      await db.products.bulkAdd(products);

      const invoices = [];
      await db.invoices.bulkAdd(invoices);

      // Default settings
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
      await db.delete(); // Delete the entire database
      NotificationService.success('Application has been reset and will now reload.');
      setTimeout(() => window.location.reload(), 2000);
    } catch (error) {
      console.error('Factory reset failed:', error);
      NotificationService.error('Failed to reset the application.');
      LoadingService.hide();
    }
  }
}

// ENHANCED GSTIN Service
class GstinService {
  static async fetchGstinData(gstin) {
    try {
      LoadingService.show('Fetching GSTIN data...');
      
      const mockData = await this.getMockGstinData(gstin);
      if (mockData.success) {
        LoadingService.hide();
        return mockData;
      }

      await Utils.delay(1500);

      const stateCode = gstin.substring(0, 2);
      const stateMapping = {
        '01': { name: 'JAMMU AND KASHMIR' }, '02': { name: 'HIMACHAL PRADESH' },
        '03': { name: 'PUNJAB' }, '04': { name: 'CHANDIGARH' },
        '24': { name: 'GUJARAT' }, '27': { name: 'MAHARASHTRA' },
        '33': { name: 'TAMIL NADU' }, '29': { name: 'KARNATAKA' }
      };

      LoadingService.hide();

      return {
        success: true,
        data: {
          legal_name: 'SAMPLE COMPANY PRIVATE LIMITED',
          trade_name: 'Sample Company',
          address: 'SAMPLE ADDRESS LINE 1, SAMPLE AREA',
          city: 'SAMPLE CITY',
          state: stateMapping[stateCode]?.name || 'UNKNOWN STATE',
          pincode: '000000',
          state_code: stateCode
        }
      };

    } catch (error) {
      LoadingService.hide();
      return {
        success: false,
        error: 'Failed to fetch GSTIN data. Please try again.'
      };
    }
  }

  static async getMockGstinData(gstin) {
    const mockData = {
      '33AFQFS4393P1Z0': {
        legal_name: 'SRI VAARI TEX PRIVATE LIMITED',
        trade_name: 'Sri Vaari Tex',
        address: 'D.NO. 63/29, NESAVALAR COLONY, 2ND STREET',
        city: 'TIRUPUR',
        state: 'TAMIL NADU',
        pincode: '641602',
        state_code: '33'
      },
      '27BCDPG1234H1Z5': {
        legal_name: 'GOLDEN TEXTILES PRIVATE LIMITED',
        trade_name: 'Golden Textiles',
        address: 'SHOP 15, TEXTILE MARKET',
        city: 'MUMBAI',
        state: 'MAHARASHTRA',
        pincode: '400001',
        state_code: '27'
      }
    };

    if (mockData[gstin]) {
      return { success: true, data: mockData[gstin] };
    }

    return { success: false };
  }
}

// ENHANCED Invoice Service with working calculations
class InvoiceService {
  static calculateGST(customerStateCode, companyStateCode, amount, gstRate) {
    const amt = parseFloat(amount) || 0;
    const rate = parseFloat(gstRate) || 0;
    
    if (customerStateCode === companyStateCode) {
      const cgst = Math.round((amt * rate) / 200 * 100) / 100;
      const sgst = Math.round((amt * rate) / 200 * 100) / 100;
      return { cgst, sgst, igst: 0, total: cgst + sgst };
    } else {
      const igst = Math.round((amt * rate) / 100 * 100) / 100;
      return { cgst: 0, sgst: 0, igst, total: igst };
    }
  }

  static async getNextInvoiceNumber() {
    const prefix = appState.settings.invoice_prefix || 'INV';
    const nextNumber = parseInt(appState.settings.next_invoice_number || '1');
    await DatabaseService.updateSetting('next_invoice_number', (nextNumber + 1).toString());
    return `${prefix}${nextNumber.toString().padStart(3, '0')}`;
  }

  static async createInvoice(invoiceData) {
    try {
      const invoice = {
        ...invoiceData,
        invoice_number: await this.getNextInvoiceNumber(),
        //customer_id: invoiceData.customer_id,
        //date: invoiceData.date,
        //items: invoiceData.items,
        //subtotal: invoiceData.subtotal,
        //tax_amount: invoiceData.tax_amount,
        //total_amount: invoiceData.total_amount,
        //payment_status: 'pending',
        created_at: new Date()
      };

      const invoiceId = await db.invoices.add(invoice);

      for (const item of invoiceData.items) {
        const product = await db.products.get(item.product_id);
        if (product) {
          const newStock = Math.max(0, product.stock_quantity - item.quantity);
          await db.products.update(item.product_id, { 
            stock_quantity: newStock,
            updated_at: new Date()
          });

          await db.inventory_transactions.add({
            product_id: item.product_id,
            transaction_type: 'sale',
            quantity: -item.quantity,
            reference_id: invoiceId.toString(),
            reference_type: 'invoice',
            notes: `Sale via invoice ${invoice.invoice_number}`,
            created_at: new Date()
          });
        }
      }

      return { success: true, invoiceId, invoice: { ...invoice, id: invoiceId } };
    } catch (error) {
      console.error('Failed to create invoice:', error);
      return { success: false, error: error.message };
    }
  }

  // UPDATED: This method is now completely overhauled
  static async generateInvoiceHTML(invoiceId) {
    try {
      const invoice = await db.invoices.get(invoiceId);
      if (!invoice) throw new Error('Invoice not found');

      const customer = await db.customers.get(invoice.customer_id);
      const company = appState.company || {}; 
      
      const isInterState = customer.state_code !== company.state_code;

      // --- 1. Item Table Generation ---
      let itemsHTML = '';
      for (let i = 0; i < invoice.items.length; i++) {
        const item = invoice.items[i];

        // FIXED: Change 'item.netAmount' to 'item.amount'
        // This now shows the gross total (Qty * Rate)
        const itemTotal = item.amount ?? Utils.calculateAmount(item.quantity, item.rate);
        
        let discountText = '-';
        if (item.discount && item.discount.value > 0) {
                if (item.discount.type === 'percentage') {
            discountText = `${item.discount.value}%`;
        } else if (item.discount.type === 'per_unit') {
            discountText = `${Utils.formatCurrency(item.discount.value)} / ${item.unit || 'Unit'}`; // NEW
        } else { // 'fixed'
            discountText = Utils.formatCurrency(item.discount.value);
        }
       }
        itemsHTML += `
          <tr>
            <td>${i + 1}</td>
            <td>
              <strong>${Utils.sanitizeHtml(item.name)}</strong><br>
              <small>HSN: ${item.hsn_code || 'N/A'}</small>
            </td>
            <td>${item.quantity} ${item.unit || 'PCS'}</td>
            <td class="text-right">${Utils.formatCurrency(item.rate)}</td>
            <td class="text-right">${discountText}</td> <td class="text-right">${item.gst_rate}%</td>
            <td class="text-right"><strong>${Utils.formatCurrency(itemTotal)}</strong></td>
          </tr>
        `;
      }

      // --- 2. Tax Rows Calculation ---
      let taxRows = '';
      if (isInterState) {
        taxRows = `
          <div class="total-row">
            <span>IGST:</span>
            <span>${Utils.formatCurrency(invoice.tax_amount || 0)}</span>
          </div>
        `;
      } else {
        const halfTax = (invoice.tax_amount || 0) / 2;
        taxRows = `
          <div class="total-row">
            <span>CGST:</span>
            <span>${Utils.formatCurrency(halfTax)}</span>
          </div>
          <div class="total-row">
            <span>SGST:</span>
            <span>${Utils.formatCurrency(halfTax)}</span>
          </div>
        `;
      }

      // --- 3. Final HTML Assembly ---
      return `
        <div class="invoice-print-header">
          <div class="company-details">
            <h2>${Utils.sanitizeHtml(company.name || '')}</h2>
            <p>${Utils.sanitizeHtml(company.address || '')}</p>
            <p>${Utils.sanitizeHtml(company.city || '')}, ${Utils.sanitizeHtml(company.state || '')} - ${Utils.sanitizeHtml(company.pincode || '')}</p>
            <p>Phone: ${company.phone || ''} | Email: ${company.email || ''}</p>
            <p><strong>GSTIN: ${company.gstin || ''}</strong></p>
          </div>
          <div class="invoice-info">
            <h3>TAX INVOICE</h3>
            <p><strong>${invoice.invoice_number}</strong></p>
            <p>Date: ${Utils.formatDate(invoice.date)}</p>
          </div>
        </div>

        <div class="billing-details">
          <div class="bill-to">
            <h4>Bill To:</h4>
            <p><strong>${Utils.sanitizeHtml(customer?.name || 'Unknown Customer')}</strong></p>
            <p>${Utils.sanitizeHtml(customer?.address || '')}</p>
            <p>${Utils.sanitizeHtml(customer?.city || '')}, ${Utils.sanitizeHtml(customer?.state || '')}</p>
            <p>Phone: ${customer?.phone || ''}</p>
            ${customer?.gstin ? `<p><strong>GSTIN: ${customer.gstin}</strong></p>` : ''}
            ${customer?.aadhar ? `<p>Aadhar No.: ${customer.aadhar}</p>` : ''}
          </div>
        </div>

       <table class="invoice-items-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Description</th>
                <th>Qty</th>
                <th class="text-right">Rate</th>
                <th class="text-right">Discount</th>
                <th class="text-right">GST%</th>
                <th class="text-right">Total</th>
              </tr>
            </thead>
            <tbody>${itemsHTML}</tbody>
          </table>

<div class="invoice-totals-print">
                <div class="total-row">
                    <span>Subtotal:</span>
                    <span>${Utils.formatCurrency(invoice.subtotal || 0)}</span>
                </div>
                ${invoice.totalDiscount && invoice.totalDiscount > 0 ? `
                <div class="total-row">
                    <span>Discount:</span>
                    <span class="text-success">- ${Utils.formatCurrency(invoice.totalDiscount)}</span>
                </div>` : ''}

                <div class="total-row" style="font-weight: 500; border-top: 1px dashed var(--color-border); padding-top: var(--space-4); margin-top: var(--space-4);">
                  <span>Taxable Amount:</span>
                  <span>${Utils.formatCurrency(invoice.netSubtotal || (invoice.subtotal - displayDiscountTotal))}</span>
                </div>

                ${taxRows}
                <div class="total-row total-final">
                    <span>Total Amount:</span>
                    <span>${Utils.formatCurrency(invoice.total_amount || 0)}</span>
                </div>
            </div>
        <div class="invoice-footer" style="margin-top: 16px;">
            <p><strong>Amount in Words:</strong> ${Utils.amountInWords(invoice.total_amount || 0)}</p>
        </div>

        <div class="invoice-footer" style="margin-top: 24px; padding-top: 20px; border-top: 1px solid #ddd;">
            <p><strong>Bank Details:</strong></p>
            <p>
                Beneficiary: ${company?.beneficiaryName || ''}<br>
                A/C No: ${company?.accountNumber || ''} | IFSC: ${company?.ifscCode || ''}<br>
                Bank: ${company?.bankName || ''}, ${company?.branch || ''}
            </p>
            <br>
            <p><strong>Terms & Conditions:</strong></p>
            <p>${Utils.sanitizeHtml(appState.settings.terms_conditions || 'Payment due within 30 days.')}</p>
            <br>
            <p style="text-align: center;"><strong>Thank you for your business!</strong></p>
        </div>
      `;
    } catch (error) {
      console.error('Failed to generate invoice HTML:', error);
      throw error;
    }
  }
}


class PDFService {
  static async generateInvoiceDoc(invoiceId) {
      const invoice = await db.invoices.get(invoiceId);
      const customer = await db.customers.get(invoice.customer_id);
      const company = appState.company || {};
      
      const { jsPDF } = window.jspdf;
      const doc = new jsPDF({
            orientation: 'portrait',
            unit: 'mm',
            format: 'a4'
      });
      
      const pageHeight = doc.internal.pageSize.height;
      const pageWidth = doc.internal.pageSize.width;

      const testLogo = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAMCAgMCAgMDAwMEAwMEBQgFBQQEBQoHBwYIDAoMDAsKCwsNDhIQDQ4RDgsLEBYQERMUFRUVDA8XGBYUGBIUFRT/2wBDAQMEBAUEBQkFBQkUDQsNFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBT/wAARCANpA4wDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwD9U6KKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKSigBaKSigBaKTNGaAFopM0tABRSZozQAtFFFABRRSUALRSUZoAWiiigAooooAKKKSgBaKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiikoAWikpaACoz0p9Myo60AIPpQylq4vxt8WvC3w9iDa7rNrZuy7lhaXMjf7q/er588dft56dYpJbeFNHl1Kb7q3d83lRf720fM3/jtctXE0aPxyse/l+Q5lmj/2Wi2u/T7z626Lg8Vn6v4i0zQbNrnUNQt7GBeslxMqL+Zr84/Fn7VnxF8Vlg2sf2ZE3/LPT49n/j33q8r1LWL/AFq5M+o3txfzt96S4maRv++mrx6mcU46RVz9IwXhjjaiTxVZQ8lq/v0P0q1v9qD4baJuWXxNbTuv8Nrmb/0GuH1b9unwFp4b7Fa6pqf/AFxgVf8A0Jlr4Dorzp5zWfwqx9pQ8NMqppe1nOT9dPyPs/U/+CgllGcaf4OuLn/r5vVh/wDQVasO4/4KCau3+p8HWsX/AF0vmb/2mtfJlFc7zPFS3dj3afAORU1rRv8AOX+Z9Rzft8eJ3k/deG9NjT+600jVah/b+1tWXf4UsmXvtvGXP/jtfKVIzbV3M1L+0sT/ADG/+o+QW/gW+b/zPsOx/wCCg0m5Vu/BexP4mg1Hc3/fLRr/AOhV1Gm/t8eErrat5oerWh/vKsbr/wChV8BXXibT7NtrXCs3/TP5qy7jx5Cu7yLWSX/ebbWyzLFLrc8nEcCcPyWkHF+Un/mz9RtJ/bA+GmrFVbWnsmbtdQSR/wBK9A8N/FDwp4sbZpPiHT7+T/nnDOrN/wB89a/GmTx1eM3yW8SrULeN75WX/Vf9816NHMMRJ25bnx+O4DyqnFyp4lw9bP8Ar7z9xFkXsyEe1Sj/ADxX4z+Hf2pviL4RVRpXim8to1+7G8nnL/3zJur2vwL/AMFHPiFpkkK67olh4itf4nRWtZG/4Eu5f/Ha+ioRxNf/AJcyXyPynMcpoYC7ji4TX+Kz+7/gn6X0ZNfJ9r/wUP8Ah9NpcM1zo+vQXrL+8tVhjk2/7reZtasbUf8AgpJ4fjJ+weDtTuR63FzHD/6Dur1Y5bjJaxpv8j4ueYYWm7OZ9k8+lL+FfC9x/wAFLJG3LD8Pgv8AdaTWM/8Ajvk1B/w8q1D/AKEK3/8ABq3/AMZrdZPjWv4Zz/2thP5z7v8Awox7V8Jxf8FK7xWxJ4BhI9F1Zgf/AERWha/8FLIG/wCPnwBLF/1y1ZZP/aK0nk+NX/LsazbCfzn25SZ96+QLH/gpB4Rb/j88K61B/wBcWhk/9mWuksP+CgnwxvSomj1qw/67Wat/6CzVhLLMZHemzaOY4WW1RH01u96XmvEdJ/bK+E2rBdvimO0Ldru3kj/9lrudB+MXgfxQyx6Z4t0W8mb7scV9H5n/AHzu3Vyyw1an8UGvU6Y4mlPaaZ2ePapKiWVWGVYVJketYfI3TT6i0UUUFBRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABUfbpT6ZmjyF5iDPpRuPfpXMeNfiDoPgDS31DXNQisbZeA0j8s391V/iavi/wCM37ZWt+LJLnTPCLSaLpX3ftX/AC8S/wC1/wBM1/8AHq4q+MpYZe9ufU5Lw7j87qqGHjaPWT0X3n1L8Uv2ivB3wpV4dQv1udTVflsLX95N/wAC/u/8Cr5B+JP7Y/jPxk0tvpLR+HdObhVtzumZf9p//ia8HmlkuJmmlkaWSRtzMzbmZqZXymIzOrWuoOyP6FyXgHLctjGeIXtKnd7fJEt5eXGo3Ul1d3EtzcSNuknmk3Mzf7TVFRRXkNt7u5+lxpxpK0EkvIKKKKRYUUUUB1Corq6hs4WknkWKP/arH1zxRDpe6GD9/df+OrXE32pXF/M0lxJu/wDZa1hRlOVo7nm4nHUsOm5PRfcdNqXjdVby7KPc3/PSSubvtUur9v38zMv93+Gs2a8VfufNVWSaSX7zfLX22A4XxWKSlNKK7n4tnniXl+XylSpSdSS7bfeXGuo1/iqGTUG/hWprHQ7i8+Zv3Uf95q6Cz0m3s9rKu5v7zV+h4PhTB0VeS5n3f6H4NmviXnGMvGjL2ceyV395g2+m315/Dtj/ALzfLWpb+GYV2tNI0rVsUV9dRwOHw6tCC+R+Y4nN8djHetVbv3epXt7C3tduyGNasUUV2pJdLHkOUpPV3CiiiqJCiiigAooooAKKKKACiiipcU9WrjTa2djoPDvxB8UeEGX+xfEGp6Uv920vJI1/75WvT/Df7ZvxX8O4VvEP9pRr/Df28cn/AI9XiFFcs8Jh6us4XOiGKrU37sj7M8Jf8FINWg2xeJPCVrer/FNptw0LL/2zk3bv++lr2Xwr+3d8MPEG1b28vtCkb+HULb5f++o91fmdXoPwO+Ed/wDGjx9Z6BaFoLX/AF19dqv+ot1+83/xNeJisowMacqjXKezhszxcpqF73P1i8JeM9D8baSNS0DU7fVbFm2rPbSbl3eldBXO+C/Bul+AfDdhoWjWy2mnWkflxxr26cn3roq/PZcvM1DY+7hzOKc9woooqSwooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAqNmxjjNSVk65rlp4fsWubqURovr1Nc9etDD03UqOyRUYym+WO5dmmit4zJKwVV6s1eE/Hj9prTfhb4Vury0Rbq7/1NuG+7JN/Co/+Kqv45+IsurQ3E0832LS4VaRl3bdqr/E1fn78RPiBN8WviJJebm/sfT90dnG393+9/vNX5dLiernGJdDLvdpR3l1+R+pcNcJfXq8ZYpaFvXvGGv8Aji/bU/Eeozalfzbm/eSfLHu/hjX+FazaKK65SlN3k/8AM/p3D4ajhaSpUFaKCiiipOoKKKKACiiijpcaCuQ8SeKvma1sm+X+Kdf/AGWjxZ4j+aSxt2/66Sf+y1w811/Cn/fVe3luV18xqKMNF3PgOJuK8JkWHc60rPolu/QsTXSxM38TVRklaVvm+7TK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mZqRuUVHDcR3C7omVlqStjS9woooo6i13R1fw3+J2v8Awo8SRa34fu2trlflkib/AFcy/wDPORf4lr9N/gP8f9D+Onh0XNiVtNXgVRfaY7fvIW9R/eX/AGq/J2ui8A+PNa+Gnii117QbxrTULdv+AyL/ABKy/wAS15eNwUcRFyhucGIwsa0eZbn7LhuKdXk3wB+O2lfHLwmt/aFbbVbcKl/p+7LQt6/7rc7a9Zr42UJU3yy3PmZRcHyvcKKKKkgKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACsXxN4Y03xhod3o+r2kV9p11H5c0Eq/KwraqNuWou4u63Gm4u6Py6/aR/Zs1L4J6415aJJe+FbmT/Rrzb80Lf885P9r/ANCrxKv2e8ReHdO8V6Rd6XqtpFe2F1H5c0Ey7lda/O39pL9kfVPhXcXWveHI5dS8KN+8ZfvTWX+zJ/eX/a/76r6rA5hGovZ1dz6DC41SShM+c6KRaWve06HsBRRRQIqXmnW95/rY/wDgS1h33hmSL5rdvNX+633q6eiplGMtxNXOAmja3kZXVlb/AGq6Twf8S/E3gOZZND1i5sV+80O7dG3/AGz+7WpdWcN4u2WNWrBvvC7L81q29f7rV5WKy6hio8leClF9GhXlDWJ9HfD39tBWaO18Yabtb/oJaf8A+zR//E/9819D+F/H3h7xtbrJomsWuofLuaOKT94v+8v3q/NCaCS3k2urK1SWN/caXdR3FrcS200bblkjbay1+M534Y5fjrzwDdOXa/us9TDZhKMrVr2P1Lor4X8D/tUeLvDbRw39ymsWq/8ALO9+9/38+9X0T4L/AGmvCfipY47yZtEvG/5Z3v8Aq/8Av5/+zX8/5rwdmuUSanDmXfofWU6cq8Oek1JeR6/RUdvcR3cayRSLJG3zKytuVqkr4mSlF2krMxtbRqwUUUVIBRRRQAUUUUAFFFFABVDWtB07xJp8ljqljBqFrJ96G5j3LV+itqVarQlz0ZcrXXqJpSVmrnzd8Rv2OdL1RZrzwlef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WXdJa/upP7v8Nc3NFJbyeW67ZK77bVfUNNhv49rr838LVhKn1JlHmRzeh+I7jRm2r+/tW+9A1dVHYaf4jt/tGnSeRJ/FHXF6hpc2nSfOu6P+Fqjsb+bTbhZreTypF/u18hmWS08VedONp/mfY5LxJXy9qlX96n+KOssbzWPBuqR3VldT6fdL92eBtte8/Dn9ra6tWjs/F1t9ph/hv7Zf3i/70f8AF/wGvHNF8QWviO3+z3Cqtx/FG38X+7VXVvCrRbpLP5o/+edfjOaZHRrydLF07Pv1+R+tPC4TNqKrUXzJ9eqPvvw34t0nxhp63ukX0V7bt/FG33f9lv7tbFfnB4d8Uax4N1RbzSbyfT7pflby2+9/ssv8VfSvwx/autNQMen+LI1sbn7q38P+pk/3l/hr8jzLhLEYW9TDax/E+QxeT1aF5U9Y/ifRVFV7HULfUrWO6tZo7mCRdyyRtuVlqxXwkoyhLlkrM+d1WjVgoooqQCiiigAooooAKKKKL2A8y+MnwP0n4saW0jKljrkMf+j6gq/+Oyf3lr4V8XeD9U8C69caTq9u1teQ/wDfLL/eX/Zr9N68++MHwh0v4saC1vcKttqkK/6Hfbfmjb+63+zX7LwTx1XyerHB493ovr1j5nkYvBqonOG58C6Lq32WTyZW/ct/e/hrpv4a5vxZ4V1LwXr11o+rW7QX1u21lb7rf7S/7NWtB1LzF+zu3zL/AKuv7CwuKhiKcatJ3i9n38z5pRcXaW5tV+g/7APxMHiPwDfeFLqXdeaJLvt938VvJyv/AHy27/vpa/Pivaf2QfHDeCfjtoReTbb6o39mzf8AbT7v/kTbUY6iq1FowxdL2lJvsfqh0zTqj7ZqSvh1rqfJbBRRRTAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKSlooAgmt45o2jkVXRl2srd68A+J37F/gDx+s1xYWjeGtUbdtudNX93u/2ofu/wDfO2voam7R61pCrOk7xdjSFSdN3iz8wfiX+xr8Q/h+009n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FABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAlQXDCOBmJwAKsV5v8fvFa+DPhL4j1HeI5jbNBDz/AMtJP3a/q1S3bU58RP2dKU+yPzS8Ral/bOvalqHzf6VdSXH/AH026s6iivn276n4bUl7Scp92FFFFIgKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiilbaqszMq0AJXGeLvE3m7rG1b93/y0k/vf7NHibxb9o3Wtk37v/lpIv8VclXRGPLqe1g8HKck5K9/vCilWui8M6D9qkW6nX9yv3V/vVwYnFqKcYH9N8DeHdSvOGPzSGnSHX1ZqeFdG+x2/2qVf30n3f9la36KK+ek23dn9c0aMcPBUorYKKKKk3CiiigAoooo8+odDO166+y6bM38Tfu1r2L9k74ZsguPF1/HtZt0Fkrf3f+Wkn/sv/fVeZ+FvBN18UvG1nokG5bGH99eTL/yzX/4qv0R+GvwhSPT7ONoP7P0i2jWOKFfvOtfNZv8AWcdJZdgIXlL4n0S8z8u4tzulg4Om3Yq+DvBNz4quskGOyVv3k3/sq17jpel2+jWcdtbRrFFH8qqtS2VjBYW8cFvGscKDaqr2q1xX3nDnDWHyOkra1Huz+b8wzGrjp32j0QZp9NVafX2kW2tTyAoooqgCiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKjepKY2AvNAnbqJwOa+HP20/i8viLXbfwdps26x06TzL5lb71x/Cv/AAH/ANCb/Zr0T9on9qiz8LWdzoHhO6S91yT93JeQtujtPo38T+1fD80sl1M00sjSySNuZmbczNXn4ivH4Inwee5rDkeGpfMbupKKK8w/PtnYKKKKBhRRRQAUUUUAFFFFABRRRQAUUUUAFFFFAnYKKZcXEdrH5k8ixR/3mrl9W8bxxL5dgu5v+ejU7N6HRToVKrtB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"
      // --- PDF Header (Fine-Tuned Spacing) ---
      let headerY = 15;
      const lineSpacing = 5;

      
// "Original for Recipient" - Keep this at the very top right
      doc.setFontSize(8);
      doc.setFont(undefined, 'italic');
      doc.text('Original for Recipient', pageWidth - 15, headerY, { align: 'right' });
      doc.setFont(undefined, 'normal');

// NEW
// 
      let brandingY = headerY + 5; 

      if (testLogo) {
          try {
              // 1. Get the real image dimensions
              // We await this so we can calculate layout before drawing
              const dims = await Utils.getImageDimensions(testLogo);
              const imgRatio = dims.width / dims.height;

              // 2. Define the Maximum Box (The limit of how big the logo can be)
              const maxW = 40; // Max width in mm
              const maxH = 25; // Max height in mm

              // 3. Calculate Scaled Dimensions (Fit within box)
              let finalW = maxW;
              let finalH = maxW / imgRatio;

              if (finalH > maxH) {
                  finalH = maxH;
                  finalW = maxH * imgRatio;
              }

              // 4. Calculate Center X
              const logoX = (pageWidth - finalW) / 2;

              // 5. Detect Format (PNG/JPEG) from the data URL
              const format = testLogo.startsWith('data:image/png') ? 'PNG' : 'JPEG';

              // 6. Draw Image with perfect dimensions
              doc.addImage(testLogo, format, logoX, brandingY, finalW, finalH);
              
              // 7. Update cursor position
              headerY = brandingY + finalH + 2; 

          } catch (err) {
              console.error("Error adding logo:", err);
              // Fallback to text if logo fails
              doc.setFontSize(18);
              doc.setFont(undefined, 'bold');
              doc.text(company?.name.toUpperCase() || 'YOUR COMPANY', pageWidth / 2, brandingY + 5, { align: 'center' });
              headerY += 10;
          }
      } else {
          // No logo? Draw the text title as fallback
          doc.setFontSize(18);
          doc.setFont(undefined, 'bold');
          doc.text(company?.name.toUpperCase() || 'YOUR COMPANY', pageWidth / 2, brandingY + 5, { align: 'center' });
          headerY += 10; // Move down for text height
      }
      headerY += lineSpacing + 2;
      doc.setFontSize(9);
      doc.setFont(undefined, 'normal');
      
      // Centered Company Details with consistent spacing
      const addressLine1 = String(company.address ?? '');
      const addressLine2 = `${String(company.city ?? '')} ${String(company.pincode ?? '')} ${String(company.state ?? '')}`;
      doc.text(addressLine1, pageWidth / 2, headerY, { align: 'center' });
      headerY += lineSpacing;
      doc.text(addressLine2, pageWidth / 2, headerY, { align: 'center' });
      headerY += lineSpacing;
      doc.setFont(undefined, 'bold');
      doc.text(`GSTIN: ${company?.gstin || 'N/A'}`, pageWidth / 2, headerY, { align: 'center' });
      headerY += lineSpacing;
      doc.setFont(undefined, 'normal');
      const companyContact = `Phone: ${String(company.phone ?? '')} Email: ${String(company.email ?? '')}`;
      doc.text(companyContact, pageWidth / 2, headerY, { align: 'center' });

      // Perfectly centered "TAX INVOICE" section
      headerY += 6;
      doc.setLineWidth(0.2);
      doc.line(15, headerY, pageWidth - 15, headerY); // Top line
      headerY += 4;
      doc.setFontSize(14);
      doc.setFont(undefined, 'bold');
      doc.text('TAX INVOICE', pageWidth / 2, headerY, { align: 'center', baseline: 'middle' });
      headerY += 4;
      doc.line(15, headerY, pageWidth - 15, headerY); // Bottom line
      // --- End Header ---

      let customerY = headerY + 5;
      doc.setFontSize(10);
      doc.setFont(undefined, 'bold');
      doc.text('Bill To:', 15, customerY);
      doc.setFont(undefined, 'normal');
      
      doc.setFontSize(10);
      doc.setFont(undefined, 'bold');
      doc.text(customer?.name || 'Unknown Customer', 15, customerY + 6);
      doc.setFont(undefined, 'normal');
      doc.setFontSize(9);
      const fullAddress = `${customer?.address || ''}, ${customer?.city || ''}, ${customer?.state || ''} - ${customer?.pincode || ''}`;
      const addressLines = doc.splitTextToSize(fullAddress, 115);
      doc.text(addressLines, 15, customerY + 11);
      let customerMetaY = customerY + 11 + (addressLines.length * 4) + 2;
      doc.text(`GSTIN: ${customer?.gstin || 'N/A'}`, 15, customerMetaY);
      customerMetaY += 5;
      if (customer?.aadhar) {
        doc.text(`Aadhar No.: ${customer.aadhar}`, 15, customerMetaY);
        customerMetaY += 5; // Move down again
    }
      const rightColumnX = 135;
      doc.setFontSize(10);
      doc.text(`Invoice No.:`, rightColumnX, customerY + 6);
      doc.setFont(undefined, 'bold');
      doc.text(`${invoice.invoice_number}`, rightColumnX + 26, customerY + 6);
      doc.setFont(undefined, 'normal');
      doc.text(`Date:`, rightColumnX, customerY + 12);
      doc.text(`${Utils.formatDate(invoice.date)}`, rightColumnX + 26, customerY + 12);
      
      const tableStartY = customerMetaY + 10;
      const head = [['#', 'Description', 'HSN', 'Qty', 'Rate', 'Discount', 'GST%', 'Total (INR)']]; // Added 'Discount'
      const body = invoice.items.map((item, index) => {
    
        // FIXED: Change 'item.netAmount' to 'item.amount'
        // This now shows the gross total (Qty * Rate)
        const itemTotal = item.amount; // Use the saved net amount

        let discountText = '-';
        if (item.discount && item.discount.value > 0) {
            if (item.discount.type === 'percentage') {
            discountText = `${item.discount.value}%`;
        } else if (item.discount.type === 'per_unit') {
            discountText = `${item.discount.value.toFixed(2)}/U`; // NEW (short for unit)
        } else { // 'fixed'
            discountText = item.discount.value.toFixed(2);
        }
        }
        return [
            index + 1, item.name, item.hsn_code || 'N/A',
            `${item.quantity} ${item.unit}`, item.rate.toFixed(2),
            discountText, // NEW data cell
            `${item.gst_rate}%`, itemTotal.toFixed(2)
        ];
    });

      // Define the height needed for your footer elements
      // const footerHeight = 65; // Adjust this based on your footer content (bank, terms, signature)
  
      doc.autoTable({
        head: head, 
        body: body, 
        startY: tableStartY,
        // ... (theme and headStyles) ...
        //styles: { fontSize: 8, cellPadding: 2, /* ... */ },
        // --- AFTER (Monochromatic Header) ---
        //theme: 'grid', // Use the grid theme
        headStyles: { fillColor: [230, 230, 230], textColor: [0, 0, 0], fontStyle: 'bold', fontSize: 9 }, // Light gray header, black bold text
        styles: { fontSize: 9, cellPadding: 2, }, // Light gray grid lines, black text
        columnStyles: {
            // UPDATED: Column indices have shifted
            0: { halign: 'center' }, 
            3: { halign: 'left' }, 
            4: { halign: 'center' }, 
            5: { halign: 'center' }, 
            6: { halign: 'center' }, 
            7: { halign: 'right' }
        },

        // --- NEW: Use didParseCell to precisely control HEADER alignment ---
        didParseCell: function (data) {
        // Apply styles ONLY to header cells
        if (data.row.section === 'head') {
            // Center align the '#' column header
            if (data.column.index === 0) {
                data.cell.styles.halign = 'center';
            }
            // Center align the 'GST%' column header
            else if (data.column.index === 6) {
                 data.cell.styles.halign = 'center';
            }
             // Center align the 'Discount' column header
            else if (data.column.index === 5) {
                 data.cell.styles.halign = 'center';
            }
            else if (data.column.index === 3) {
                 data.cell.styles.halign = 'left';
            }
            else if (data.column.index === 4) {
                 data.cell.styles.halign = 'center';
            }
            else if (data.column.index === 7) {
                 data.cell.styles.halign = 'right';
            }
            // Left align all other headers (Description, HSN, Qty, Rate, Total)
            else {
                data.cell.styles.halign = 'left';
            }
        }}
       // margin: { bottom: footerHeight }

    
      

    });
      
      // --- PDF Footer ---
      

      const totalPages = doc.internal.getNumberOfPages();
      doc.setPage(totalPages);

      let finalY = 190;
      //let finalY = (doc.autoTable.previous ? doc.autoTable.previous.finalY + 10: tableStartY);

      //if (pageHeight - finalY < footerHeight) {
      //  doc.addPage();
      //  finalY = 15; // Reset Y position to the top of the new page
    //}// else {
     //   finalY += 10; // Add some padding after the table
    //}
      const rightColX = pageWidth - 15;
      const leftColX = 15;
      doc.setLineWidth(0.2);
      doc.line(leftColX, finalY, rightColX, finalY);
    
      // --- Column 1: Bank Details ---
      let leftY = finalY + 5;
      doc.setFontSize(8);
      doc.setFont(undefined, 'bold');
      doc.text('Bank Details :', leftColX + 2, leftY);
      doc.setFont(undefined, 'normal');
      leftY += 5;
      doc.text(`Beneficiary: ${company.beneficiaryName || ''}`, leftColX + 2, leftY);
      leftY += 5;
      doc.text(`Bank   : ${company.bankName || 'N/A'}`, leftColX + 2, leftY);
      doc.text(`Branch : ${company.branch || 'N/A'}`, leftColX + 60, leftY);
      leftY += 5;
      doc.text(`A/c No.: ${company.accountNumber || 'N/A'}`, leftColX + 2, leftY);
      doc.text(`IFSC   : ${company.ifscCode || 'N/A'}`, leftColX + 60, leftY);
      leftY += 2; // Final padding for this column

      // --- Column 2: Totals Section ---
      const formatNumber = (num) => (num || 0).toLocaleString('en-IN', {minimumFractionDigits: 2, maximumFractionDigits: 2});
      const exactTotal = invoice.subtotal + invoice.tax_amount;
      const roundedTotal = Math.round(invoice.total_amount);
      const roundOff = roundedTotal - invoice.total_amount;
      let rightY = finalY + 5;
      doc.setFontSize(9);
      doc.text('Subtotal Rs.', rightColX - 45, rightY);
      doc.text(formatNumber(invoice.subtotal), rightColX, rightY, { align: 'right' });
      rightY += 5;

      if (invoice.totalDiscount && invoice.totalDiscount > 0) {
        doc.text('Discount', rightColX - 45, rightY);
        doc.text(`- ${formatNumber(invoice.totalDiscount)}`, rightColX, rightY, { align: 'right' });
        rightY += 5;
      }

      const taxableAmount = invoice.netSubtotal ?? (invoice.subtotal - (invoice.totalDiscount || 0));
      doc.setFont(undefined, 'bold'); // Make it slightly distinct
      doc.text('Taxable Amount', rightColX - 45, rightY);
      doc.text(formatNumber(taxableAmount), rightColX, rightY, { align: 'right' });
      doc.setFont(undefined, 'normal'); // Reset font weight
      rightY += 5;

      const isInterState = customer.state_code !== company.state_code;
      if (isInterState) {
        doc.text('+ IGST', rightColX - 45, rightY);
        doc.text(formatNumber(invoice.tax_amount), rightColX, rightY, { align: 'right' });
        rightY += 5;
      } else {
        const totalTax = invoice.tax_amount || 0;
        const cgst = Math.floor((totalTax / 2) * 100) / 100;
        const sgst = totalTax - cgst;
        doc.text('+ CGST', rightColX - 45, rightY);
        doc.text(formatNumber(cgst), rightColX, rightY, { align: 'right' });
        rightY += 5;
        doc.text('+ SGST', rightColX - 45, rightY);
        doc.text(formatNumber(sgst), rightColX, rightY, { align: 'right' });
        rightY += 5;
    }
    
      
      doc.text('Round Off', rightColX - 45, rightY);
      doc.text(roundOff.toFixed(2), rightColX, rightY, { align: 'right' });
      doc.line(rightColX - 60, rightY + 2, rightColX, rightY + 2);
      rightY += 7;
      doc.setFont(undefined, 'bold');
      doc.text('Total Rs.', rightColX - 45, rightY);
      doc.text(formatNumber(roundedTotal), rightColX, rightY, { align: 'right' })
      
      // --- Content Below Columns (Rupees, Terms, etc.) ---
      // Find the bottom of the taller column to start the next section
      let bottomY = Math.max(leftY, rightY) + 5;

      doc.setFontSize(8);
      doc.setFont(undefined, 'bold');
      doc.text('Rupees:', leftColX + 2, bottomY);
      doc.setFont(undefined, 'normal');
      const amountInWordsStr = Utils.amountInWords(roundedTotal).toUpperCase() + " ONLY";
      const amountInWordsLines = doc.splitTextToSize(amountInWordsStr, 120); 
      doc.text(amountInWordsLines, leftColX + 15, bottomY);
    
      // Adjust Y position based on how many lines the text took
      bottomY += (amountInWordsLines.length * 4) + 2; 

      doc.line(leftColX, bottomY, rightColX, bottomY);
      bottomY += 5;
      doc.setFont(undefined, 'bold');
      doc.text('TERMS:', leftColX + 2, bottomY);
      doc.setFont(undefined, 'normal');
      doc.text('E. & O. E.', rightColX, bottomY, {align: 'right'});
      const terms = doc.splitTextToSize(appState.settings.terms_conditions, 180);
      doc.text(terms, leftColX + 2, bottomY + 4);
    
      const signatureY = pageHeight - 25;
      doc.line(leftColX, signatureY, rightColX, signatureY);
      doc.setFontSize(9);
      doc.text('Received By', leftColX + 2, signatureY + 5);
      doc.text('Checked By', pageWidth / 2, signatureY + 5, {align: 'center'});
      doc.setFont(undefined, 'bold');
      doc.text(`For ${company?.name || 'Your Company'}`, rightColX, signatureY - 2, {align: 'right'});
      doc.setFont(undefined, 'normal');
      doc.text('Authorised Signatory', rightColX, signatureY + 10, {align: 'right'});
      return doc; 
  }
  static async generateInvoicePDF(invoiceId) {
    try {
      if (typeof window.jspdf === 'undefined' || typeof window.jspdf.jsPDF.API.autoTable !== 'function') {
        NotificationService.warning('PDF library not fully loaded. Please check internet and try again.');
        return;
      }
      
      const doc = await this.generateInvoiceDoc(invoiceId);
      const invoice = await db.invoices.get(invoiceId);
      doc.save(`invoice-${invoice.invoice_number}.pdf`);
      NotificationService.success('PDF downloaded successfully!');

    } catch (error) {
      console.error('Failed to generate PDF:', error);
      NotificationService.error('Failed to generate PDF. Please try again.');
    }
  }
  // Method to generate a PDF for the Sales Report
  static async generateSalesReportPDF(reportData) {
    LoadingService.show('Creating PDF...');
    try {
      const { jsPDF } = window.jspdf;
      const doc = new jsPDF();
      const company = appState.company || {};
      const pageWidth = doc.internal.pageSize.width;
      const pageHeight = doc.internal.pageSize.height;
      const leftMargin = 15;
      const rightMargin = pageWidth - 15;
      
      // --- New Professional Header (adapted from Invoice) ---
      let headerY = 15;
      const lineSpacing = 5;
      doc.setFontSize(18);
      doc.setFont(undefined, 'bold');
      doc.text(String(company.name?.toUpperCase() ?? ''), pageWidth / 2, headerY, { align: 'center' });
      headerY += lineSpacing + 2;
      doc.setFontSize(9);
      doc.setFont(undefined, 'normal');
      const addressLine1 = String(company.address ?? '');
      const addressLine2 = `${String(company.city ?? '')} ${String(company.pincode ?? '')} ${String(company.state ?? '')}`;
  
      doc.text(addressLine1, pageWidth / 2, headerY, { align: 'center' });
      headerY += lineSpacing;
      doc.text(addressLine2, pageWidth / 2, headerY, { align: 'center' });
      
      headerY += 8;
      doc.setLineWidth(0.2);
      doc.line(leftMargin, headerY, rightMargin, headerY); // Top line
      headerY += 5;
      doc.setFontSize(14);
      doc.setFont(undefined, 'bold');
      doc.text('SALES REPORT', pageWidth / 2, headerY, { align: 'center', baseline: 'middle' });
      headerY += 5;
      doc.line(leftMargin, headerY, rightMargin, headerY); // Bottom line
      
      // --- Report-Specific Details ---
      headerY += 8;
      doc.setFontSize(10);
      doc.setFont(undefined, 'bold');
      doc.text('Report Period:', leftMargin, headerY);
      doc.setFont(undefined, 'normal');
      doc.text(reportData.dateRange, leftMargin + 30, headerY);

      // --- Report Summary ---
      let summaryY = headerY + 10;
      doc.setFontSize(10);
      doc.setFont(undefined, 'bold');
      doc.text('Summary', leftMargin, summaryY);
      doc.setFont(undefined, 'normal');
      summaryY += 6;
      reportData.summary.forEach(item => {
        doc.text(item.label + ':', 15, summaryY);
        let valueStr;
        if (item.isCurrency) {
          valueStr = (item.value || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        } else {
          valueStr = item.value.toString();
        }
        doc.text(valueStr, rightMargin, summaryY, { align: 'right' });
        summaryY += 7;
      });
      
      // --- Main Data Table ---
      const head = [['Invoice #', 'Date', 'Customer', 'Amount (INR)', 'Status']];
      const body = [];
      for(const invoice of reportData.invoices) {
        const customer = await db.customers.get(invoice.customer_id);
        body.push([
          invoice.invoice_number,
          Utils.formatDate(invoice.date),
          customer?.name || 'N/A',
          (invoice.total_amount || 0).toLocaleString('en-IN', {minimumFractionDigits: 2, maximumFractionDigits: 2}),
          invoice.payment_status
        ]);
      }
      
      doc.autoTable({
        head: head, body: body, startY: summaryY + 5,
        theme: 'grid',
        headStyles: { fillColor: [20, 30, 40], textColor: 255 }, // Dark header for reports
        columnStyles: { 3: { halign: 'right' } },
        didDrawPage: function (data) {
          // --- Footer with Page Numbers ---
          doc.setFontSize(8);
          doc.setTextColor(100);
          const pageCount = doc.internal.getNumberOfPages();

          const dateStr = `Generated on: ${new Date().toLocaleDateString('en-IN')}`;
          doc.text(dateStr, data.settings.margin.left, pageHeight - 10);

          const pageNumStr = `Page ${data.pageNumber} of ${pageCount}`;
          doc.text(pageNumStr, rightMargin, pageHeight - 10, { align: 'right' });
        }
      });
      
      const date = new Date().toISOString().split('T')[0];
      doc.save(`Sales-Report-${date}.pdf`);

    } catch (error) {
      console.error('Failed to create report PDF:', error);
      NotificationService.error('Could not create report PDF.');
    } finally {
      LoadingService.hide();
    }
  }
}


class BackupService {
  static async exportData() {
    LoadingService.show('Creating backup...');
    try {
      const tablesToExport = ['companies', 'customers', 'products', 'invoices', 'payments', 'inventory_transactions', 'settings'];
      const exportData = {
        version: '1.0.0',
        exportedAt: new Date().toISOString(),
        data: {}
      };

      for (const tableName of tablesToExport) {
        const tableData = await db[tableName].toArray();
        exportData.data[tableName] = tableData;
      }

      const jsonString = JSON.stringify(exportData, null, 2);
      const blob = new Blob([jsonString], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const date = new Date().toISOString().split('T')[0];
      a.href = url;
      a.download = `BLAYe-Backup-${date}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      LoadingService.hide();
      NotificationService.success('Data backup successful!');
    } catch (error) {
      LoadingService.hide();
      console.error('Backup failed:', error);
      NotificationService.error('Data backup failed.');
    }
  }
  static async importData(file) {
    if (!file) {
      NotificationService.error('Please select a backup file.');
      return;
    }

    const confirmation = prompt('This will ERASE all current data. This cannot be undone. Type "RESTORE" to confirm.');
    if (confirmation !== 'RESTORE') {
      NotificationService.info('Restore operation cancelled.');
      return;
    }

    LoadingService.show('Restoring data...');
    try {
      const fileContent = await file.text();
      const backupData = JSON.parse(fileContent);

      if (!backupData.data || !backupData.version) {
        throw new Error('Invalid backup file format.');
      }

      await db.transaction('rw', db.tables, async () => {
        for (const table of db.tables) {
          await table.clear();
        }
        for (const tableName of Object.keys(backupData.data)) {
          if (db[tableName]) {
            await db[tableName].bulkAdd(backupData.data[tableName]);
          }
        }
      });
      
      LoadingService.hide();
      NotificationService.success('Restore successful! The application will now reload.');
      setTimeout(() => window.location.reload(), 2000);

    } catch (error) {
      LoadingService.hide();
      console.error('Restore failed:', error);
      NotificationService.error('Restore failed. Please check the file and try again.');
    }
  }
  static async performRestore(file) {
    LoadingService.show('Restoring data...');
    try {
      const fileContent = await file.text();
      const backupData = JSON.parse(fileContent);

      if (!backupData.data || !backupData.version) {
        throw new Error('Invalid backup file format.');
      }

      await db.transaction('rw', db.tables, async () => {
        for (const table of db.tables) {
          await table.clear();
        }
        for (const tableName of Object.keys(backupData.data)) {
          if (db[tableName]) {
            await db[tableName].bulkAdd(backupData.data[tableName]);
          }
        }
      });
      
      LoadingService.hide();
      NotificationService.success('Restore successful! The application will now reload.');
      setTimeout(() => window.location.reload(), 2000);

    } catch (error) {
      LoadingService.hide();
      console.error('Restore failed:', error);
      NotificationService.error('Restore failed. Please check the file and try again.');
    }
  }
}

// FIXED: Dashboard Controller with proper async handling

class DashboardController {
  static async loadPage() {
    try {
      await this.updateStats();
      await this.loadSalesChart();
      await this.loadRecentActivity();
      this.setupEventListeners();  // NEW: Setup listeners for the dashboard page
      this.updateNavigationCounts(); 
    } catch (error) {
      console.error('Failed to load dashboard:', error);
      NotificationService.error('Failed to load dashboard data');
    }
  }
   static setupEventListeners() {

    // UPDATED: Added a listener for the 'view-low-stock' button
    const chartFilterButtons = document.querySelectorAll('.chart-filter');
    chartFilterButtons.forEach(button => {
      button.addEventListener('click', (e) => {
        // Remove active class from all buttons
        chartFilterButtons.forEach(btn => btn.classList.remove('active'));
        // Add active class to the clicked button
        const clickedButton = e.currentTarget;
        clickedButton.classList.add('active');
        
        // Get the period and reload the chart
        const period = parseInt(clickedButton.dataset.period, 10);
        this.loadSalesChart(period);
      });
    });

    // Low stock button listener
    const lowStockButton = document.getElementById('view-low-stock');
    if (lowStockButton) {
      lowStockButton.addEventListener('click', () => {
        // Set a temporary state that the products page can read
        appState.initialProductFilter = { stockStatus: 'low' };
        // Navigate to the products page
        App.showPage('products');
      });
    }
  }

  static async updateStats() {
    try {
      const todayStr = Utils.formatDateForInput(new Date());
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayStr = Utils.formatDateForInput(yesterday);

      const todayInvoices = await db.invoices.where('date').equals(todayStr).toArray();
      const yesterdayInvoices = await db.invoices.where('date').equals(yesterdayStr).toArray();

      const todaySales = todayInvoices.reduce((sum, inv) => sum + (inv.total_amount || 0), 0);
      const yesterdaySales = yesterdayInvoices.reduce((sum, inv) => sum + (inv.total_amount || 0), 0);

      const todaySalesEl = document.getElementById('today-sales');
      if (todaySalesEl) todaySalesEl.textContent = Utils.formatCurrencyCompact(todaySales);
      
      const salesTrend = yesterdaySales > 0 ? ((todaySales - yesterdaySales) / yesterdaySales * 100) : (todaySales > 0 ? 100 : 0);
      const trendEl = document.getElementById('sales-trend');
      if (trendEl) {
        trendEl.textContent = (salesTrend >= 0 ? '+' : '') + salesTrend.toFixed(1) + '%';
        trendEl.className = salesTrend >= 0 ? 'trend-value' : 'trend-value negative';
      }

      const thisMonth = new Date();
      const firstDay = new Date(thisMonth.getFullYear(), thisMonth.getMonth(), 1);
      

      const thisMonthInvoices = await db.invoices
        .where('date')
        .between(Utils.formatDateForInput(firstDay), todayStr, true, true)
        .toArray();

      const thisMonthRevenue = thisMonthInvoices.reduce((sum, inv) => sum + (inv.total_amount || 0), 0);
      const monthlyRevenueEl = document.getElementById('monthly-revenue');
      if (monthlyRevenueEl) monthlyRevenueEl.textContent = Utils.formatCurrencyCompact(thisMonthRevenue);

      const pendingInvoices = await db.invoices.where('payment_status').equals('pending').toArray();
      const pendingAmount = pendingInvoices.reduce((sum, inv) => sum + (inv.total_amount || 0), 0);

      const pendingAmountEl = document.getElementById('pending-amount');
      const pendingCountEl = document.getElementById('pending-count');
      if (pendingAmountEl) pendingAmountEl.textContent = Utils.formatCurrencyCompact(pendingAmount);
      if (pendingCountEl) pendingCountEl.textContent = `${pendingInvoices.length} invoices`;

      const products = await db.products.toArray();
      const lowStockItems = products.filter(p => p.stock_quantity <= p.min_stock);

      const lowStockCountEl = document.getElementById('low-stock-count');
      if (lowStockCountEl) lowStockCountEl.textContent = lowStockItems.length;
    } catch (error) {
      console.error('Failed to update stats:', error);
      // Use fallback values
      document.getElementById('today-sales').textContent = '₹0';
      document.getElementById('monthly-revenue').textContent = '₹0';
      document.getElementById('pending-amount').textContent = '₹0';
      document.getElementById('low-stock-count').textContent = '0';
    }
  }

  static async loadSalesChart(period = 7) {
    const ctx = document.getElementById('salesChart');
    if (!ctx) return;

    try {
      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(endDate.getDate() - (period - 1));

      const startDateStr = Utils.formatDateForInput(startDate);
      const endDateStr = Utils.formatDateForInput(endDate);

      // 1. More efficiently fetch only the invoices needed for the chart
      const invoicesInRange = await db.invoices
        .where('date')
        .between(startDateStr, endDateStr, true, true)
        .toArray();
      
      // 2. Pre-calculate the total sales for each day in a single pass
      const salesByDay = {};
      invoicesInRange.forEach(inv => {
        salesByDay[inv.date] = (salesByDay[inv.date] || 0) + (inv.total_amount || 0);
      });

      const labels = [];
      const dataArray = [];

      // 3. Build the labels and data in a synchronized loop
      for (let i = 0; i < period; i++) {
        const currentDay = new Date(startDate);
        currentDay.setDate(startDate.getDate() + i);
        const currentDayStr = Utils.formatDateForInput(currentDay);
        
        labels.push(currentDay.toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit' }));
        dataArray.push(salesByDay[currentDayStr] || 0); // Use the pre-calculated total, or 0 if no sales
      }

      if (appState.charts.salesChart) {
        appState.charts.salesChart.destroy();
      }

      appState.charts.salesChart = new Chart(ctx, {
        type: 'line',
        data: {
          labels: labels,
          datasets: [{
            label: 'Sales',
            data: dataArray,
            borderColor: '#1FB8CD',
            backgroundColor: 'rgba(31, 184, 205, 0.1)',
            borderWidth: 3,
            fill: true,
            tension: 0.4,
            pointBackgroundColor: '#1FB8CD',
            pointBorderColor: '#1FB8CD',
            pointRadius: period <= 30 ? 4 : 2,
            pointHoverRadius: 6
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: {
              callbacks: {
                label: function(context) {
                  return 'Sales: ' + Utils.formatCurrency(context.parsed.y);
                }
              }
            }
          },
          scales: {
            y: {
              beginAtZero: true,
              ticks: {
                callback: function(value) {
                  if (value >= 10000000) return '₹' + (value/10000000) + ' Cr';
                  if (value >= 100000) return '₹' + (value/100000) + ' L';
                  return Utils.formatCurrency(value);
                }
              }
            }
          }
        }
      });
    } catch (error) {
      console.error('Failed to load sales chart:', error);
    }
  }

  static async loadRecentActivity() {
    try {
      const recentInvoices = await db.invoices
        .orderBy('created_at')
        .reverse()
        .limit(5)
        .toArray();

      const activityList = document.getElementById('activity-list');
      if (!activityList) return;

      let html = '';

      for (const invoice of recentInvoices) {
        const customer = await db.customers.get(invoice.customer_id);
        const statusColor = invoice.payment_status === 'paid' ? 'success' : 
                          invoice.payment_status === 'overdue' ? 'error' : 'warning';
        const statusIcon = invoice.payment_status === 'paid' ? 
          '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>' :
          invoice.payment_status === 'overdue' ?
          '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>' :
          '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 6v6l4 2"/><circle cx="12" cy="12" r="10"/></svg>';

        html += `
          <div class="activity-item">
            <div class="activity-icon" style="background: var(--color-bg-${statusColor === 'success' ? '3' : statusColor === 'error' ? '4' : '2'}); color: var(--color-${statusColor});">
              ${statusIcon}
            </div>
            <div class="activity-content">
              <p class="activity-title">Invoice ${invoice.invoice_number} - ${Utils.formatCurrency(invoice.total_amount || 0)}</p>
              <p class="activity-meta">${customer?.name || 'Unknown Customer'} • ${Utils.formatDate(invoice.date)} • ${invoice.payment_status}</p>
            </div>
          </div>
        `;
      }

      if (html === '') {
        html = '<p class="text-secondary" style="text-align: center; padding: 20px;">No recent activity</p>';
      }

      activityList.innerHTML = html;

    } catch (error) {
      console.error('Failed to load recent activity:', error);
      const activityList = document.getElementById('activity-list');
      if (activityList) {
        activityList.innerHTML = '<p class="text-secondary" style="text-align: center; padding: 20px;">Unable to load recent activity</p>';
      }
    }
  }

  static updateNavigationCounts() {
    Promise.all([
      db.customers.count(),
      db.products.count(),
      db.invoices.count()
    ]).then(([customerCount, productCount, invoiceCount]) => {
      const customerBadge = document.getElementById('customers-count');
      const productBadge = document.getElementById('products-count');
      const invoiceBadge = document.getElementById('invoices-count');
      
      if (customerBadge) customerBadge.textContent = customerCount;
      if (productBadge) productBadge.textContent = productCount;
      if (invoiceBadge) invoiceBadge.textContent = invoiceCount;
    }).catch(error => {
      console.error('Failed to update navigation counts:', error);
    });
  }
}

// FIXED: Application Initialization with proper error handling
class App {
  static async init() {
    try {

      ThemeController.applySavedTheme();

      LoadingService.show('Initializing application...');

      // Initialize database
      const dbInitialized = await DatabaseService.initializeData();
      if (!dbInitialized) {
        throw new Error('Failed to initialize database');
      }

      // Setup event listeners BEFORE showing pages
      this.setupEventListeners();
      this.setupNetworkDetection();

      await OnboardingController.init();
      await this.showPage('dashboard');

      BackupController.init();
      PaymentController.init(); 
      ThemeController.init();

      // Load initial page
      await this.showPage('dashboard');
      this.displayAppVersion();

      // Mark as initialized
      appState.isInitialized = true;

      // Hide loading and show app
      LoadingService.hide();
      document.getElementById('loading-screen').style.display = 'none';
      document.getElementById('app').classList.remove('hidden');

      // Success message
      NotificationService.success('BLAYe Billing System ready!');

    } catch (error) {
      console.error('Failed to initialize app:', error);
      LoadingService.hide();
      
      // Try to show app anyway in demo mode
      document.getElementById('loading-screen').style.display = 'none';
      document.getElementById('app').classList.remove('hidden');
      
      NotificationService.error('Application started in demo mode. Some features may be limited.');
      
      // Setup basic functionality
      this.setupEventListeners();
      await this.showPage('dashboard');
    }
  }

  // FIXED: Event listeners setup with proper error handling
  /*static setupEventListeners() {
    console.log('Setting up global event listeners...');
    
    try {
      // Navigation
      document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', async (e) => {
          e.preventDefault();
          const page = item.getAttribute('data-page');
          if (page) {
            await this.showPage(page);
          }
        });
      });

      // Quick actions
      const quickCreateInvoice = document.getElementById('quick-create-invoice');
      const quickAddCustomer = document.getElementById('quick-add-customer');
      const quickAddProduct = document.getElementById('quick-add-product');

      if (quickCreateInvoice) {
        quickCreateInvoice.addEventListener('click', () => InvoiceController.openModal());
      }

      if (quickAddCustomer) {
        quickAddCustomer.addEventListener('click', () => CustomerController.openModal());
      }

      if (quickAddProduct) {
        quickAddProduct.addEventListener('click', () => ProductController.openModal());
      }

      // Page action buttons
      
      // Modal close buttons
      document.querySelectorAll('.modal-close, [data-dismiss="modal"]').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.preventDefault();
          const modal = btn.closest('.modal');
          if (modal) modal.classList.add('hidden');
        });
      });

      // Form submissions
      

      // Close modals when clicking outside
      document.querySelectorAll('.modal').forEach(modal => {
        modal.addEventListener('click', (e) => {
          if (e.target === modal) {
            modal.classList.add('hidden');
          }
        });
      });

      // Mobile menu toggle
      const menuToggle = document.getElementById('menu-toggle');
      const sidebar = document.getElementById('sidebar');
      
      if (menuToggle && sidebar) {
        menuToggle.addEventListener('click', () => {
          sidebar.classList.toggle('open');
        });
      }

      // FIXED: Quick actions with proper modal opening
      const quickInvoiceBtn = document.getElementById('quick-invoice');
      if (quickInvoiceBtn) {
        quickInvoiceBtn.addEventListener('click', (e) => {
          e.preventDefault();
          InvoiceController.openModal();
        });
      }

      const addCustomerBtn = document.getElementById('add-customer-btn');
      if (addCustomerBtn) {
        addCustomerBtn.addEventListener('click', (e) => {
          e.preventDefault();
          CustomerController.openModal();
        });
      }

      const addProductBtn = document.getElementById('add-product-btn');
      if (addProductBtn) {
        addProductBtn.addEventListener('click', (e) => {
          e.preventDefault();
          ProductController.openModal();
        });
      }

      const createInvoiceBtn = document.getElementById('create-invoice-btn');
      if (createInvoiceBtn) {
        createInvoiceBtn.addEventListener('click', (e) => {
          e.preventDefault();
          InvoiceController.openModal();
        });
      }

      // FIXED: Modal close buttons
      document.querySelectorAll('.modal-close, [data-dismiss="modal"]').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.preventDefault();
          const modal = btn.closest('.modal');
          if (modal) modal.classList.add('hidden');
        });
      });

      // FIXED: Form submissions
      const customerForm = document.getElementById('customer-form');
      if (customerForm) {
        customerForm.addEventListener('submit', CustomerController.saveCustomer.bind(CustomerController));
      }

      const productForm = document.getElementById('product-form');
      if (productForm) {
        productForm.addEventListener('submit', ProductController.saveProduct.bind(ProductController));
      }

      const invoiceForm = document.getElementById('invoice-form');
      if (invoiceForm) {
        invoiceForm.addEventListener('submit', InvoiceController.saveInvoice.bind(InvoiceController));
      }

      // FIXED: GSTIN fetch button
      const fetchGstinBtn = document.getElementById('fetch-gstin-data');
      if (fetchGstinBtn) {
        fetchGstinBtn.addEventListener('click',  () => CustomerController.fetchGstinData());
      }

      // FIXED: Settings save
      const saveSettingsBtn = document.getElementById('save-settings');
      if (saveSettingsBtn) {
        saveSettingsBtn.addEventListener('click', SettingsController.saveSettings);
      }

      // Close modals when clicking outside
      document.querySelectorAll('.modal').forEach(modal => {
        modal.addEventListener('click', (e) => {
          if (e.target === modal) {
            modal.classList.add('hidden');
          }
        });
      });

      // Keyboard shortcuts
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
          document.querySelectorAll('.modal:not(.hidden)').forEach(modal => {
            modal.classList.add('hidden');
          });
        }
      });

    } catch (error) {
      console.error('Failed to setup event listeners:', error);
    }
  }
  */

  static setupEventListeners() {
    console.log('Setting up global event listeners...');
    
    // --- Navigation ---
    document.querySelector('.sidebar-nav')?.addEventListener('click', (e) => {
      e.preventDefault();
      const navItem = e.target.closest('.nav-item');
      if (navItem && navItem.dataset.page) {
        this.showPage(navItem.dataset.page);
      }
    });

    // --- Global Actions & Quick Actions ---
    document.getElementById('backup-btn')?.addEventListener('click', () => BackupService.exportData());
    document.getElementById('menu-toggle')?.addEventListener('click', () => document.getElementById('sidebar')?.classList.toggle('open'));
    document.getElementById('quick-create-invoice')?.addEventListener('click', () => InvoiceController.openModal());
    document.getElementById('quick-add-customer')?.addEventListener('click', () => CustomerController.openModal());
    document.getElementById('quick-add-product')?.addEventListener('click', () => ProductController.openModal());
    
    // --- Page-Level "Add" Buttons ---
    document.getElementById('add-customer-btn')?.addEventListener('click', () => CustomerController.openModal());
    document.getElementById('add-product-btn')?.addEventListener('click', () => ProductController.openModal());
    document.getElementById('create-invoice-btn')?.addEventListener('click', () => InvoiceController.openModal());
    
    // --- Form Submissions (FIXED: Passing the 'e' event object) ---
    document.getElementById('customer-form')?.addEventListener('submit', (e) => CustomerController.saveCustomer(e));
    document.getElementById('product-form')?.addEventListener('submit', (e) => ProductController.saveProduct(e));
    document.getElementById('invoice-form')?.addEventListener('submit', (e) => InvoiceController.saveInvoice(e));
    document.getElementById('stock-adjustment-form')?.addEventListener('submit', (e) => { e.preventDefault(); InventoryController.saveAdjustment(); });
    
    // --- Settings, Reports, and other buttons ---
    document.getElementById('save-settings')?.addEventListener('click', () => SettingsController.saveSettings());
    document.getElementById('fetch-gstin-data')?.addEventListener('click', () => CustomerController.fetchGstinData());
    
    document.querySelector('.reports-grid')?.addEventListener('click', (e) => {
      const reportBtn = e.target.closest('button[data-report]');
      if (reportBtn) {
        const reportType = reportBtn.dataset.report;
        if (reportType === 'sales') ReportController.generateSalesReport();
        else if (reportType === 'gst') ReportController.generateGstReport();
        else NotificationService.info(`${reportType.toUpperCase()} report coming soon!`);
      }
    });
    document.getElementById('close-report')?.addEventListener('click', () => document.getElementById('report-display').classList.add('hidden'));
    document.getElementById('print-report')?.addEventListener('click', () => ReportController.printReport());
    document.getElementById('download-report')?.addEventListener('click', () => ReportController.downloadReport());

    // --- Invoice Page: Filters and Dynamic Menu ---
    const invoiceSearch = document.getElementById('invoice-search');
    const statusFilter = document.getElementById('status-filter');
    const dateFromFilter = document.getElementById('date-from');
    const dateToFilter = document.getElementById('date-to');
    const clearFiltersBtn = document.getElementById('clear-filters');
    const applyInvoiceFilters = () => {
      const filters = {
        searchTerm: invoiceSearch?.value.trim() || '',
        status: statusFilter?.value || '',
        dateFrom: dateFromFilter?.value || '',
        dateTo: dateToFilter?.value || ''
      };
      InvoiceController.loadInvoices(filters);
    };
    invoiceSearch?.addEventListener('input', Utils.debounce(applyInvoiceFilters, 300));
    statusFilter?.addEventListener('change', applyInvoiceFilters);
    dateFromFilter?.addEventListener('change', applyInvoiceFilters);
    dateToFilter?.addEventListener('change', applyInvoiceFilters);
    clearFiltersBtn?.addEventListener('click', () => {
        if(invoiceSearch) invoiceSearch.value = '';
        if(statusFilter) statusFilter.value = '';
        if(dateFromFilter) dateFromFilter.value = '';
        if(dateToFilter) dateToFilter.value = '';
        InvoiceController.loadInvoices();
    });

    const invoicesTbody = document.getElementById('invoices-tbody');
    if (invoicesTbody) {
      invoicesTbody.addEventListener('click', (e) => {
        const menuBtn = e.target.closest('.action-menu-btn');
        const menuItem = e.target.closest('.action-menu-item');
        
        if (menuBtn) {
          e.preventDefault();
          const menu = menuBtn.nextElementSibling;
          document.querySelectorAll('.action-menu-content.show').forEach(m => {
            if (m !== menu) m.classList.remove('show');
          });
          menu.classList.toggle('show');
          return;
        }

        if (menuItem) {
          e.preventDefault();
          const invoiceId = parseInt(menuItem.dataset.invoiceId);
          const action = menuItem.dataset.action;
          if (action === 'add-payment') PaymentController.openPaymentModal(invoiceId);
          if (action === 'download') InvoiceController.downloadInvoice(invoiceId);
          if (action === 'cancel') InvoiceController.cancelInvoice(invoiceId);
          if (action === 'delete') InvoiceController.deleteInvoice(invoiceId);
          menuItem.closest('.action-menu-content').classList.remove('show');
        }
      });
    }

    // --- Inventory Page ---
    document.getElementById('stock-adjustment-btn')?.addEventListener('click', () => InventoryController.openAdjustmentModal());
    const inventoryTbody = document.getElementById('inventory-tbody');
    if (inventoryTbody) {
      inventoryTbody.addEventListener('click', (e) => {
        const target = e.target.closest('.expand-btn');
        if (target) InventoryController.toggleTransactionHistory(target);
      });
    }

    // --- Modal Closing Logic ---
    document.body.addEventListener('click', (e) => {
      if (e.target.matches('.modal-close, [data-dismiss="modal"]')) {
        e.preventDefault();
        const modal = e.target.closest('.modal');
        if (modal) modal.classList.add('hidden');
      }
      if (e.target.matches('.modal')) {
        e.target.classList.add('hidden');
      }
    });
    
    // --- Global Keyboard Shortcuts ---
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        document.querySelectorAll('.modal:not(.hidden)').forEach(modal => modal.classList.add('hidden'));
      }
    });
  }

  static setupNetworkDetection() {
    window.addEventListener('online', () => {
      appState.isOnline = true;
      appState.updateSyncStatus();
      NotificationService.info('Connection restored');
    });

    window.addEventListener('offline', () => {
      appState.isOnline = false;
      appState.updateSyncStatus();
      NotificationService.warning('Working offline');
    });

    appState.updateSyncStatus();
  }

  static async displayAppVersion() {
    if (window.electronAPI && window.electronAPI.getAppVersion) {
        try {
            const version = await window.electronAPI.getAppVersion();
            
            // Update Sidebar
            const sidebarEl = document.getElementById('app-version-sidebar');
            if (sidebarEl) sidebarEl.textContent = `v${version}`;

            // Update Settings Page
            const settingsEl = document.getElementById('app-version-settings');
            if (settingsEl) settingsEl.textContent = `v${version}`;
            
        } catch (error) {
            console.error('Failed to get app version:', error);
        } 
    } else {
      console.error('Electron API missing or getAppVersion not defined');
  }
}


  // FIXED: Page navigation with proper error handling
  static async showPage(pageId) {
    try {
      // Hide all pages
      document.querySelectorAll('.page').forEach(page => {
        page.classList.remove('active');
      });

      // Show selected page
      const targetPage = document.getElementById(pageId + '-page');
      if (targetPage) {
        targetPage.classList.add('active');
      }

      // Update navigation
      document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.remove('active');
      });

      const navItem = document.querySelector(`[data-page="${pageId}"]`);
      if (navItem) {
        navItem.classList.add('active');
      }

      appState.currentPage = pageId;

      // Load page data
      try {
        switch (pageId) {
          case 'dashboard':
            await DashboardController.loadPage();
            break;
          case 'customers':
            await CustomerController.loadPage();
            break;
          case 'products':
            await ProductController.loadPage();
            break;
          case 'invoices':
            await InvoiceController.loadPage();
            break;
          case 'inventory':
            await InventoryController.loadPage();
            break;
          case 'reports':
            await ReportController.loadPage(); 
            break;
          case 'settings':
            await SettingsController.loadPage();
            break;
        }
      } catch (error) {
        console.error(`Failed to load ${pageId} page:`, error);
        NotificationService.warning(`Some features on ${pageId} page may not work properly`);
      }

      // Close sidebar on mobile
      if (window.innerWidth <= 768) {
        const sidebar = document.getElementById('sidebar');
        if (sidebar) sidebar.classList.remove('open');
      }

    } catch (error) {
      console.error(`Failed to navigate to ${pageId}:`, error);
      NotificationService.error(`Failed to load ${pageId} page`);
    }
  }
}

// SIMPLIFIED Controllers to avoid complex async issues
class CustomerController {
  static async _fetchAndDisplayCaptcha() {
    const captchaImg = document.getElementById('captcha-image');
    const captchaLoading = document.getElementById('captcha-loading');

    if (captchaImg) captchaImg.classList.add('hidden');
    if (captchaLoading) captchaLoading.classList.remove('hidden');

    try {
      const response = await fetch(`${BACKEND_URL}/getCaptcha`);
      if (!response.ok) throw new Error('Failed to fetch captcha from backend.');

      const data = await response.json();
      appState.gstSessionId = data.sessionId;
      captchaImg.src = data.image;

    } catch (error) {
      console.error('Captcha fetch error:', error);
      NotificationService.error('Could not load captcha. Ensure backend is running.');
    } finally {
      if (captchaImg) captchaImg.classList.remove('hidden');
      if (captchaLoading) captchaLoading.classList.add('hidden');
    }
  }

  static async loadPage() {
    try {
      await this.loadCustomers();
      this.setupEventListeners();
    } catch (error) {
      console.error('Failed to load customers page:', error);
      document.getElementById('customers-tbody').innerHTML = '<tr><td colspan="6" class="text-center">Error loading customers</td></tr>';
    }
  }

  static async loadCustomers(searchTerm = '') {
    try {
      const customers = await db.customers.orderBy('name').toArray();
      const tbody = document.getElementById('customers-tbody');
      if (!tbody) return;

      let html = '';
      for (const customer of customers) {
        if (!searchTerm || customer.name.toLowerCase().includes(searchTerm.toLowerCase())) {
          html += `
            <tr>
              <td>
                <div class="item-details">
                  <div class="item-name">${Utils.sanitizeHtml(customer.name)}</div>
                  <div class="item-meta">${Utils.sanitizeHtml(customer.city || '')}, ${Utils.sanitizeHtml(customer.state || '')}</div>
                </div>
              </td>
              <td>
                <div>${customer.phone || 'N/A'}</div>
                <div class="item-meta">${customer.email || 'No email'}</div>
              </td>
              <td>${customer.gstin || 'Unregistered'}</td>
              <td class="currency">₹0</td>
              <td>Never</td>
              <td>
                <div class="action-buttons">
                  <button class="btn btn--secondary btn--sm btn-icon" onclick="CustomerController.editCustomer(${customer.id})" title="Edit">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
                      <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
                    </svg>
                  </button>
                  <button class="btn btn--outline btn--sm btn-icon" onclick="CustomerController.deleteCustomer(${customer.id})" title="Delete">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
                    </svg>
                  </button>
                </div>
              </td>
            </tr>
          `;
        }
      }

      tbody.innerHTML = html || '<tr><td colspan="6" class="text-center">No customers found</td></tr>';
    } catch (error) {
      console.error('Failed to load customers:', error);
      document.getElementById('customers-tbody').innerHTML = '<tr><td colspan="6" class="text-center">Error loading customers</td></tr>';
    }
  }

  static setupEventListeners() {
    const searchInput = document.getElementById('customer-search');
    if (searchInput) {
      searchInput.addEventListener('input', Utils.debounce((e) => {
        this.loadCustomers(e.target.value.trim());
      }, 300));
    }
  }

  static async openModal(customerId = null) {
    const modal = document.getElementById('customer-modal');
    if (!modal) return;

    // Reset and show the modal
    document.getElementById('customer-form').reset();
    document.getElementById('captcha-section').classList.add('hidden');
    modal.classList.remove('hidden');

    // Populate the state dropdown
    SettingsController.populateStates('customer-state');
    
    // Set up the listener to show the captcha on demand
    const gstinInput = document.getElementById('customer-gstin');
    const captchaSection = document.getElementById('captcha-section');
    
    // FIXED: The handler now correctly uses `event.currentTarget`
    const gstinInputHandler = (event) => {
      // `event.currentTarget` always refers to the element the listener is attached to
      if (event.currentTarget.value.length > 0) {
        if (captchaSection.classList.contains('hidden')) {
          captchaSection.classList.remove('hidden');
          this._fetchAndDisplayCaptcha(); // Fetch captcha only when it becomes visible
        }
      } else {
        captchaSection.classList.add('hidden');
      }
    };
    
    // Use a fresh listener to avoid duplicates from previous modal openings
    //const newGstinInput = gstinInput.cloneNode(true);
    //gstinInput.parentNode.replaceChild(newGstinInput, gstinInput);
    //newGstinInput.addEventListener('input', gstinInputHandler);

    // Load data if we are editing, otherwise set title for adding
    if (customerId) {
      document.getElementById('customer-modal-title').textContent = 'Edit Customer';
      try {
      

        const customer = await db.customers.get(customerId);

         // ... (loading customer data) ...
        document.getElementById('customer-name').value = customer.name || '';
        
        gstinInput.value = customer.gstin || '';
        //document.getElementById('customer-gstin').value = customer.gstin || '';
        document.getElementById('customer-aadhar').value = customer.aadhar || '';
        document.getElementById('customer-phone').value = customer.phone || '';
        document.getElementById('customer-email').value = customer.email || '';
        document.getElementById('customer-address').value = customer.address || '';
        document.getElementById('customer-city').value = customer.city || '';
        document.getElementById('customer-state').value = customer.state_code || '';
        document.getElementById('customer-pincode').value = customer.pincode || '';

        //const currentGstinInput = document.getElementById('customer-gstin');
        //currentGstinInput.value = customer.gstin || '';

        // Manually dispatch an 'input' event to trigger the captcha logic
        //currentGstinInput.dispatchEvent(new Event('input'));

        appState.editingRecord = customer;

        gstinInput.addEventListener('input', gstinInputHandler);

      } catch (error) {
        console.error('Failed to load customer:', error);
      }
    } else {
      document.getElementById('customer-modal-title').textContent = 'Add Customer';
      appState.editingRecord = null;
      gstinInput.addEventListener('input', gstinInputHandler);
    }
    document.getElementById('refresh-captcha-btn').addEventListener('click', () => this._fetchAndDisplayCaptcha());
  }

  static async fetchGstinData() {
    const gstin = document.getElementById('customer-gstin').value.trim().toUpperCase();
    const captcha = document.getElementById('customer-captcha').value.trim();
    const sessionId = appState.gstSessionId;

    if (!Utils.validateGSTIN(gstin)) {
      NotificationService.error('Please enter a valid 15-character GSTIN.');
      return;
    }
    if (!captcha) {
      NotificationService.error('Please enter the captcha.');
      return;
    }

    LoadingService.show('Fetching GSTIN data...');
    try {
      const response = await fetch(`${BACKEND_URL}/getGSTDetails`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, GSTIN: gstin, captcha })
      });

      if (!response.ok) throw new Error('Backend server returned an error.');
      
      const data = await response.json();
      console.log('GSTIN API response:', data);
      if (data.error || data.errorDesc || data.errorCode || data.sts === 'CAN') {
        // Use a more generic but helpful error message for all API failures
        NotificationService.error('Invalid GSTIN or Captcha. Please try again.');
        this._fetchAndDisplayCaptcha(); 
        document.getElementById('customer-captcha').value = '';
      } else {
        // FIXED: Mapped the new API response keys to the form fields.
        document.getElementById('customer-name').value = data.tradeNam || data.lgnm || '';
        document.getElementById('customer-address').value = data.pradr?.adr || '';
        
        // Clear fields that are not provided separately in this API response
        document.getElementById('customer-city').value = '';
        document.getElementById('customer-pincode').value = '';

        // Set the state from the first two digits of the GSTIN itself
        if (data.gstin) {
            const stateCode = data.gstin.substring(0, 2);
            document.getElementById('customer-state').value = stateCode;
        }

        NotificationService.success('Customer data fetched successfully!');
        document.getElementById('captcha-section').classList.add('hidden');
      }
    } catch (error) {
      console.error('GSTIN fetch failed:', error);
      NotificationService.error('An unexpected error occurred. Check backend connection.');
    } finally {
      LoadingService.hide();
      // Get a new captcha for the next attempt
      //this._fetchAndDisplayCaptcha();
      //document.getElementById('customer-captcha').value = '';
    }
  }

  static async saveCustomer(event) {
    event.preventDefault();
    
    try {
      const stateSelect = document.getElementById('customer-state');
      const selectedOption = stateSelect.options[stateSelect.selectedIndex];
      const customerData = {
        name: document.getElementById('customer-name').value.trim(),
        phone: document.getElementById('customer-phone').value.trim(),
        email: document.getElementById('customer-email').value.trim(),
        gstin: document.getElementById('customer-gstin').value.trim().toUpperCase(),
        aadhar: document.getElementById('customer-aadhar').value.trim(),
        address: document.getElementById('customer-address').value.trim(),
        city: document.getElementById('customer-city').value.trim(),
        state: selectedOption.text.includes(' - ') ? selectedOption.text.split(' - ')[1] : selectedOption.text,
        state_code: stateSelect.value,
        pincode: document.getElementById('customer-pincode').value.trim()
      };

      if (!customerData.name) {
        NotificationService.error('Customer Name is required');
        return;
      }
      // Check if we are editing an existing customer
      if (appState.editingRecord && appState.editingRecord.id) {
        // We are in EDIT mode
        const customerId = appState.editingRecord.id;
        // Add an updated_at field for good practice
        customerData.updated_at = new Date();
        
        await db.customers.update(customerId, customerData);
        NotificationService.success('Customer updated successfully');
      
      } else {
        customerData.created_at = new Date()
        await db.customers.add(customerData);
        NotificationService.success('Customer added successfully');
      }
      
      this.closeModal();
      await this.loadCustomers();
      DashboardController.updateNavigationCounts();
      OnboardingController.updateStepStatus()

    } catch (error) {
      console.error('Failed to save customer:', error);
      NotificationService.error('Failed to save customer');
    }
  }

  static async editCustomer(customerId) {
    await this.openModal(customerId);
  }

  static async deleteCustomer(customerId) {
    if (confirm('Delete this customer?')) {
      try {
        await db.customers.delete(customerId);
        NotificationService.success('Customer deleted');
        await this.loadCustomers();
        DashboardController.updateNavigationCounts();
      } catch (error) {
        NotificationService.error('Failed to delete customer');
      }
    }
  }

  static closeModal() {
    const modal = document.getElementById('customer-modal');
    if (modal) modal.classList.add('hidden');
  }
}

class ProductController {
  static async loadPage() {
    try {
      this.setupEventListeners();
      await this.populateCategoryFilter();

      // Check for a pre-set filter from another page (like the dashboard)
      if (appState.initialProductFilter) {
        // Apply the filter
        await this.loadProducts(appState.initialProductFilter);
        
        // Update the UI to reflect the filter
        if (appState.initialProductFilter.stockStatus) {
            const stockFilterEl = document.getElementById('stock-filter');
            if(stockFilterEl) stockFilterEl.value = appState.initialProductFilter.stockStatus;
        }
        
        // Clear the state so it doesn't apply again
        appState.initialProductFilter = null;
      } else {
        // Load products normally without any filters
        await this.loadProducts();
      }
    } catch (error) {
      console.error('Failed to load products page:', error);
    }
  }

  static async loadProducts(filters = {}) {
    try {
      let products = await db.products.orderBy('name').toArray();

      if (filters.searchTerm) {
        const term = filters.searchTerm.toLowerCase();
        products = products.filter(p => 
          p.name.toLowerCase().includes(term) || 
          (p.hsn_code && p.hsn_code.toLowerCase().includes(term))
        );
      }
      
      if (filters.category) {
        products = products.filter(p => p.category === filters.category);
      }
      
      if (filters.hsn) {
        products = products.filter(p => p.hsn_code && p.hsn_code.startsWith(filters.hsn));
      }

      if (filters.stockStatus) {
        switch(filters.stockStatus) {
          case 'low':
            products = products.filter(p => p.stock_quantity > 0 && p.stock_quantity <= p.min_stock);
            break;
          case 'out':
            products = products.filter(p => p.stock_quantity <= 0);
            break;
          case 'in':
            products = products.filter(p => p.stock_quantity > p.min_stock);
            break;
        }
      }
      const tbody = document.getElementById('products-tbody');
      if (!tbody) return;

      let html = '';
      for (const product of products) {
        const stockStatus = product.stock_quantity <= 0 ? 'out' : 
                           product.stock_quantity <= product.min_stock ? 'low' : 'healthy';
        const stockClass = stockStatus === 'out' ? 'text-error' : 
                          stockStatus === 'low' ? 'text-warning' : '';

        html += `
          <tr>
            <td>
              <div class="item-details">
                <div class="item-name">${Utils.sanitizeHtml(product.name)}</div>
                <div class="item-meta">${Utils.sanitizeHtml(product.category || 'Uncategorized')}</div>
              </div>
            </td>
            <td>${product.hsn_code || 'N/A'}</td>
            <td>${product.unit || 'PCS'}</td>
            <td class="currency">${Utils.formatCurrency(product.rate || 0)}</td>
            <td>
              <div class="stock-status">
                <span class="stock-indicator ${stockStatus}"></span>
                <span class="stock-text ${stockClass}">${product.stock_quantity} ${product.unit || 'PCS'}</span>
              </div>
            </td>
            <td>${product.gst_rate || 0}%</td>
            <td>
              <div class="action-buttons">
                <button class="btn btn--secondary btn--sm btn-icon" onclick="ProductController.editProduct(${product.id})" title="Edit">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
                    <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
                  </svg>
                </button>
                <button class="btn btn--outline btn--sm btn-icon" onclick="ProductController.deleteProduct(${product.id})" title="Delete">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
                  </svg>
                </button>
              </div>
            </td>
          </tr>
        `;
      }

      tbody.innerHTML = html || '<tr><td colspan="7" class="text-center">No products found</td></tr>';
    } catch (error) {
      console.error('Failed to load products:', error);
    }
  }

  static setupEventListeners() {
    const searchInput = document.getElementById('product-search');
    const categoryFilter = document.getElementById('category-filter');
    const stockFilter = document.getElementById('stock-filter');
    const hsnFilter = document.getElementById('hsn-filter');
    
    
    const applyFilters = () => {
      const filters = {
        searchTerm: searchInput?.value.trim() || '',
        category: categoryFilter?.value || '',
        stockStatus: stockFilter?.value || '',
        hsn: hsnFilter?.value.trim() || ''
      };
      this.loadProducts(filters);
    };
     
     const debouncedApplyFilters = Utils.debounce(applyFilters, 300);

    if (searchInput) searchInput.addEventListener('input', debouncedApplyFilters);
    if (hsnFilter) hsnFilter.addEventListener('input', debouncedApplyFilters);
    if (categoryFilter) categoryFilter.addEventListener('change', applyFilters);
    if (stockFilter) stockFilter.addEventListener('change', applyFilters);
  

    //if (searchInput) {
    //  searchInput.addEventListener('input', Utils.debounce(applyFilters, 300));
   // }
    // hsn, cat , stock


  }

  static async populateCategoryFilter() {
    try {
      const products = await db.products.toArray();
      const categories = [...new Set(products.map(p => p.category).filter(Boolean))]; // Get unique, non-empty categories
      const select = document.getElementById('category-filter');
      if (!select) return;

      // Keep the "All Categories" option
      select.innerHTML = '<option value="">All Categories</option>';

      categories.sort().forEach(category => {
        const option = document.createElement('option');
        option.value = category;
        option.textContent = category;
        select.appendChild(option);
      });
    } catch (error) {
      console.error('Failed to populate categories:', error);
    }
  }


  static async openModal(productId = null) {
    const modal = document.getElementById('product-modal');
    if (modal) modal.classList.remove('hidden');
    
    if (productId) {
      try {
        const product = await db.products.get(productId);
        document.getElementById('product-name').value = product.name || '';
        document.getElementById('product-rate').value = product.rate || '';
        document.getElementById('product-category').value = product.category || '';
        document.getElementById('product-hsn').value = product.hsn_code || '';
        document.getElementById('product-unit').value = product.unit || '';
        document.getElementById('product-opening-stock').value = product.stock_quantity || '';
        document.getElementById('product-min-stock').value = product.min_stock || '';
        document.getElementById('product-gst').value = product.gst_rate || '';
        //   products:  , ,, ,  unit, gst_rate, created_at',
        appState.editingRecord = product;
      } catch (error) {
        console.error('Failed to load product:', error);
      }
    } else {
      document.getElementById('product-form').reset();
      appState.editingRecord = null;
    }
  }

  static async saveProduct(event) {
    event.preventDefault();
    
    try {
      const productData = {
    name: document.getElementById('product-name').value,
    hsn_code: document.getElementById('product-hsn').value,
    unit: document.getElementById('product-unit').value,
    rate: parseFloat(document.getElementById('product-rate').value),
    gst_rate: parseInt(document.getElementById('product-gst').value),
    stock_quantity: parseFloat(document.getElementById('product-opening-stock').value),
    min_stock: parseFloat(document.getElementById('product-min-stock').value),
    category: document.getElementById('product-category').value
        //created_at: new Date()
      };
      
      // Validation
      if (!productData.name || productData.rate <= 0) {
        NotificationService.error('Name and rate are required');
        return;
      }

      //await db.products.add(productData);
      //NotificationService.success('Product saved successfully');

      if (appState.editingRecord && appState.editingRecord.id) {
        // We are in EDIT mode
        const productId = appState.editingRecord.id;
        productData.updated_at = new Date(); // Add updated timestamp
        
        await db.products.update(productId, productData);
        NotificationService.success('Product updated successfully');
      
      } else {
        // We are in ADD mode
        productData.created_at = new Date(); // Add created timestamp
        
        await db.products.add(productData);
        NotificationService.success('Product saved successfully');
      }
      this.closeModal();
      await this.loadProducts();
      await this.populateCategoryFilter(); // Repopulate categories in case a new one was added

      DashboardController.updateNavigationCounts();
      OnboardingController.updateStepStatus();
    } catch (error) {
      console.error('Failed to save product:', error);
      NotificationService.error('Failed to save product');
    }
  }

  static async editProduct(productId) {
    await this.openModal(productId);
  }

  static async deleteProduct(productId) {
    if (confirm('Delete this product?')) {
      try {
        await db.products.delete(productId);
        NotificationService.success('Product deleted');
        await this.loadProducts();
        DashboardController.updateNavigationCounts();
      } catch (error) {
        NotificationService.error('Failed to delete product');
      }
    }
  }

  static closeModal() {
    const modal = document.getElementById('product-modal');
    if (modal) modal.classList.add('hidden');
  }
}

// Enhanced Invoice Controller with working filters and calculations
class InvoiceController {
  static async loadPage() {
    await this.loadInvoices();
    //this.setupEventListeners();
  }

  // Working invoice filters
  static async loadInvoices(filters = {}) {
    try {
      let invoices = await db.invoices.orderBy('created_at').reverse().toArray();

      // The logic for filtering invoices based on status, search term, and dates.
      if (filters.status && filters.status !== '') {
        invoices = invoices.filter(inv => inv.payment_status === filters.status);
      }
      if (filters.searchTerm) {
        const searchTerm = filters.searchTerm.toLowerCase();
        const customerIds = (await db.customers.where('name').startsWithIgnoreCase(searchTerm).toArray()).map(c => c.id);
        invoices = invoices.filter(inv => 
            inv.invoice_number.toLowerCase().includes(searchTerm) || 
            customerIds.includes(inv.customer_id)
        );
      }
      if (filters.dateFrom) {
        invoices = invoices.filter(inv => inv.date >= filters.dateFrom);
      }
      if (filters.dateTo) {
        invoices = invoices.filter(inv => inv.date <= filters.dateTo);
      }

      const tbody = document.getElementById('invoices-tbody');
      if (!tbody) return;

      let html = '';
      for (const invoice of invoices) {
        const customer = await db.customers.get(invoice.customer_id);
        const finalStatus = invoice.payment_status || 'pending';
        const statusClass = finalStatus === 'paid' ? 'success' : 
                          finalStatus === 'cancelled' ? 'info' : 'warning';
        const statusText = finalStatus.charAt(0).toUpperCase() + finalStatus.slice(1);

        html += `
          <tr>
            <td><strong>${invoice.invoice_number}</strong></td>
            <td>${Utils.sanitizeHtml(customer?.name || 'Unknown')}</td>
            <td>${Utils.formatDate(invoice.date)}</td>
            <td class="currency">${Utils.formatCurrency(invoice.total_amount || 0)}</td>
            <td class="currency">${Utils.formatCurrency(invoice.tax_amount || 0)}</td>
            <td><span class="status status--${statusClass}">${statusText}</span></td>
            <td>
              <div class="action-buttons">
                <button class="btn btn--secondary btn--sm btn-icon" onclick="InvoiceController.viewInvoice(${invoice.id})" title="View">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>
                </button>
                
                <div class="action-menu">
                  <button class="btn btn--outline btn--sm btn-icon action-menu-btn" title="More Actions">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 5.25a1.5 1.5 0 110-3 1.5 1.5 0 010 3zm0 6a1.5 1.5 0 110-3 1.5 1.5 0 010 3zm0 6a1.5 1.5 0 110-3 1.5 1.5 0 010 3z"/></svg>
                  </button>
                  <div class="action-menu-content">
                    ${finalStatus !== 'paid' && finalStatus !== 'cancelled' ? 
                    `<button class="action-menu-item" data-invoice-id="${invoice.id}" data-action="add-payment">Add Payment</button>` : ''}
                    <button class="action-menu-item" data-invoice-id="${invoice.id}" data-action="download">Download PDF</button>
                    ${finalStatus !== 'paid' && finalStatus !== 'cancelled' ? 
                    `<button class="action-menu-item" data-invoice-id="${invoice.id}" data-action="cancel">Cancel Invoice</button>` : ''}
                    <button class="action-menu-item text-error" data-invoice-id="${invoice.id}" data-action="delete">Delete Invoice</button>
                  </div>
                </div>
              </div>
            </td>
          </tr>
        `;
      }
      tbody.innerHTML = html || '<tr><td colspan="7" class="text-center">No invoices found</td></tr>';
    } catch (error) {
      console.error('Failed to load invoices:', error);
    }
  }

  // Function to cancel an invoice
  static async cancelInvoice(invoiceId) {
    if (!confirm('Are you sure you want to cancel this invoice? This will return the items to stock. This action cannot be undone.')) {
      return;
    }
    LoadingService.show('Cancelling invoice...');
    try {
      const invoice = await db.invoices.get(invoiceId);
      if (!invoice) throw new Error('Invoice not found.');

      await db.transaction('rw', db.invoices, db.products, db.inventory_transactions, async () => {
        // Return items to stock
        for (const item of invoice.items) {
          await db.products.where('id').equals(item.product_id).modify(product => {
            product.stock_quantity += item.quantity;
          });
          await db.inventory_transactions.add({
            product_id: item.product_id,
            transaction_type: 'cancellation',
            quantity: item.quantity, // Positive quantity to add back
            reference_id: invoiceId.toString(),
            notes: `Return from cancelled invoice ${invoice.invoice_number}`,
            created_at: new Date()
          });
        }
        // Update the invoice status
        await db.invoices.update(invoiceId, { payment_status: 'cancelled' });
      });

      await this.loadInvoices();
      NotificationService.success('Invoice has been cancelled.');
    } catch (error) {
      console.error('Failed to cancel invoice:', error);
      NotificationService.error('Failed to cancel invoice.');
    } finally {
      LoadingService.hide();
    }
  }

  // Function to permanently delete an invoice
  static async deleteInvoice(invoiceId) {
    if (!confirm('Are you sure you want to PERMANENTLY DELETE this invoice? This action cannot be undone.')) {
      return;
    }
    LoadingService.show('Deleting invoice...');
    try {
      const invoice = await db.invoices.get(invoiceId);
      if (!invoice) throw new Error('Invoice not found.');

      await db.transaction('rw', db.invoices, db.products, db.inventory_transactions, async () => {
        // Return items to stock only if the invoice wasn't already cancelled
        if (invoice.payment_status !== 'cancelled') {
          for (const item of invoice.items) {
            await db.products.where('id').equals(item.product_id).modify(product => {
              product.stock_quantity += item.quantity;
            });
            await db.inventory_transactions.add({
              product_id: item.product_id,
              transaction_type: 'deletion',
              quantity: item.quantity,
              reference_id: invoiceId.toString(),
              notes: `Stock return from deleted invoice ${invoice.invoice_number}`,
              created_at: new Date()
            });
          }
        }
        // Delete the invoice itself
        await db.invoices.delete(invoiceId);
      });
      
      await this.loadInvoices();
      NotificationService.success('Invoice permanently deleted.');
    } catch (error) {
      console.error('Failed to delete invoice:', error);
      NotificationService.error('Failed to delete invoice.');
    } finally {
      LoadingService.hide();
    }
  }

  // FIXED: Working event listeners for filters
  static setupEventListeners() {
    const searchInput = document.getElementById('invoice-search');
    const statusFilter = document.getElementById('status-filter');
    const dateFromFilter = document.getElementById('date-from');
    const dateToFilter = document.getElementById('date-to');
    const clearFiltersBtn = document.getElementById('clear-filters');

    const applyFilters = () => {
      const filters = {
        searchTerm: searchInput?.value.trim() || '',
        status: statusFilter?.value || '',
        dateFrom: dateFromFilter?.value || '',
        dateTo: dateToFilter?.value || ''
      };
      
      this.loadInvoices(filters);
    };

    if (searchInput) {
      searchInput.addEventListener('input', Utils.debounce(applyFilters, 300));
    }

    if (statusFilter) {
      statusFilter.addEventListener('change', applyFilters);
    }

    if (dateFromFilter) {
      dateFromFilter.addEventListener('change', applyFilters);
    }

    if (dateToFilter) {
      dateToFilter.addEventListener('change', applyFilters);
    }

    if (clearFiltersBtn) {
      clearFiltersBtn.addEventListener('click', () => {
        if (searchInput) searchInput.value = '';
        if (statusFilter) statusFilter.value = '';
        if (dateFromFilter) dateFromFilter.value = '';
        if (dateToFilter) dateToFilter.value = '';
        this.loadInvoices();
      });
    }

    const tbody = document.getElementById('invoices-tbody');
    if (tbody) {
      tbody.addEventListener('click', (e) => {
        const menuBtn = e.target.closest('.action-menu-btn');
        const menuItem = e.target.closest('.action-menu-item');
        
        // Handle opening/closing the menu
        if (menuBtn) {
          e.preventDefault();
          const menu = menuBtn.nextElementSibling;
          // Close other menus
          document.querySelectorAll('.action-menu-content.show').forEach(m => {
            if (m !== menu) m.classList.remove('show');
          });
          menu.classList.toggle('show');
          return;
        }

        // Handle clicking an item inside the menu
        if (menuItem) {
          e.preventDefault();
          const invoiceId = parseInt(menuItem.dataset.invoiceId);
          const action = menuItem.dataset.action;

          if (action === 'add-payment') PaymentController.openPaymentModal(invoiceId);
          if (action === 'download') this.downloadInvoice(invoiceId);
          
          menuItem.closest('.action-menu-content').classList.remove('show');
        }
      });
      
      // Close menus if clicking elsewhere
      window.addEventListener('click', (e) => {
        if (!e.target.closest('.action-menu')) {
          document.querySelectorAll('.action-menu-content.show').forEach(m => m.classList.remove('show'));
        }
      });
    }
  }

  // FIXED: Working invoice modal with calculations
  static async openModal() {
    const modal = document.getElementById('invoice-modal');
    const customerSelect = document.getElementById('invoice-customer');
    
    if (!modal || !customerSelect) {
      NotificationService.error('Invoice form not found');
      return;
    }
    
    // Populate customers
    try {
      const customers = await db.customers.orderBy('name').toArray();
      customerSelect.innerHTML = '<option value="">Select Customer</option>' + 
        customers.map(c => `<option value="${c.id}">${Utils.sanitizeHtml(c.name)}</option>`).join('');
    } catch (error) {
      console.error('Failed to load customers:', error);
    }
    
    // Set dates
    document.getElementById('invoice-date').value = Utils.formatDateForInput(new Date());
    
    //const dueDate = new Date();
    //dueDate.setDate(dueDate.getDate() + 30);
    //const dueDateInput = document.getElementById('invoice-due-date');
    //if (dueDateInput) dueDateInput.value = dueDate.toISOString().split('T')[0];

    // Setup products and calculations
    await this.populateProductSelects();
    this.setupInvoiceCalculation();

    modal.classList.remove('hidden');
  }

  static async populateProductSelects(targetSelect = null) {
    try {
      const products = await db.products.toArray();
      const productOptionsHTML = '<option value="">Select Product</option>' + 
        products.map(p => `<option value="${p.id}" data-rate="${p.rate}" data-gst="${p.gst_rate}" data-unit="${p.unit}">${Utils.sanitizeHtml(p.name)} - ${Utils.formatCurrency(p.rate)}</option>`).join('');

      if (targetSelect) {
        // If a specific dropdown is provided, only populate that one.
        targetSelect.innerHTML = productOptionsHTML;
      } else {
        // Otherwise, populate all dropdowns (for when the form first opens).
        const allSelects = document.querySelectorAll('.product-select');
        allSelects.forEach(select => {
          select.innerHTML = productOptionsHTML;
        });
      }
    } catch (error) {
      console.error('Failed to populate products:', error);
    }
  }

  // FIXED: Working calculation setup
  static setupInvoiceCalculation() {
    const container = document.getElementById('invoice-items-container');
    if (!container) return;

    // Clear existing listeners
    container.replaceWith(container.cloneNode(true));
    const newContainer = document.getElementById('invoice-items-container');

    // Add item functionality
    newContainer.addEventListener('click', (e) => {
      if (e.target.classList.contains('add-item')) {
        this.addInvoiceItem();
      } else if (e.target.classList.contains('remove-item')) {
        e.target.closest('.item-row').remove();
        this.calculateTotals();
      }
    });

    // Product selection handler
    newContainer.addEventListener('change', (e) => {
      if (e.target.classList.contains('product-select')) {
        const row = e.target.closest('.item-row');
        const option = e.target.selectedOptions[0];
        
        if (option && option.dataset.rate) {
          const rateInput = row.querySelector('.rate-input');
          if (rateInput) rateInput.value = option.dataset.rate;
          
          this.calculateRowAmount(row);
          this.calculateTotals();
        }
      }
      if (e.target.classList.contains('discount-type-select')) {
        const row = e.target.closest('.item-row');
        const discountValueInput = row.querySelector('.discount-value-input');
        if (discountValueInput) {
          // Reset discount value when type changes
          discountValueInput.value = '';
          this.calculateRowAmount(row);
          this.calculateTotals();
        }
      }
    });

    // Quantity/Rate input handlers
    newContainer.addEventListener('input', (e) => {
      if (e.target.classList.contains('quantity-input') || e.target.classList.contains('rate-input') || e.target.classList.contains('discount-value-input')) {
        const row = e.target.closest('.item-row');
        this.calculateRowAmount(row);
        this.calculateTotals();
      }
    });

    // Initialize first row
    this.calculateTotals();
  }

  static calculateRowAmount(row) {
    const quantityInput = row.querySelector('.quantity-input');
    const rateInput = row.querySelector('.rate-input');
    const amountDisplay = row.querySelector('.amount-display');
    
    if (quantityInput && rateInput && amountDisplay) {
      const quantity = parseFloat(quantityInput.value) || 0;
      const rate = parseFloat(rateInput.value) || 0;
      const amount = Utils.calculateAmount(quantity, rate);
      
      amountDisplay.value = Utils.formatCurrency(amount);
    }
  }

  // In app.js, replace the entire calculateTotals function in InvoiceController

static calculateTotals() {
    const rows = document.querySelectorAll('.item-row');
    let grossSubtotal = 0;
    let totalItemDiscount = 0;
    let totalGST = 0;

    // --- 1. Calculate Item Totals and Discounts ---
    rows.forEach(row => {
        const quantity = parseFloat(row.querySelector('.quantity-input').value) || 0;
        const rate = parseFloat(row.querySelector('.rate-input').value) || 0;
        
        // Safely check for discount inputs, which might be hidden
        const discountValueInput = row.querySelector('.discount-value-input');
        const discountValue = discountValueInput ? parseFloat(discountValueInput.value) || 0 : 0;
        const discountType = row.querySelector('.discount-type-select')?.value || 'percentage';

        const productSelect = row.querySelector('.product-select');
        const amountDisplay = row.querySelector('.amount-display');
        
        if (quantity > 0 && rate > 0) {
            const lineTotal = Utils.calculateAmount(quantity, rate);
            grossSubtotal += lineTotal;

            // The "Net Amount" column now shows the gross lineTotal (Qty * Rate)
            if (amountDisplay) amountDisplay.value = Utils.formatCurrency(lineTotal);

            let itemDiscountAmount = 0;
            if (discountValue > 0) {
                if (discountType === 'percentage') {
            itemDiscountAmount = (lineTotal * discountValue / 100);
        } else if (discountType === 'per_unit') {
            itemDiscountAmount = (discountValue * quantity); // NEW CALCULATION
        } else { // 'fixed'
            itemDiscountAmount = discountValue;
        }
            }
            totalItemDiscount += itemDiscountAmount;

            const netAmount = lineTotal - itemDiscountAmount;// This is the (hidden) taxable value of the item
            //if (amountDisplay) amountDisplay.value = Utils.formatCurrency(netAmount);
            
            const option = productSelect.selectedOptions[0];
            const gstRate = option ? parseFloat(option.dataset.gst) || 0 : 0;
            totalGST += Utils.calculateGST(netAmount, gstRate);
        } else {
            if (amountDisplay) amountDisplay.value = Utils.formatCurrency(0);
        }
    });

    // --- 2. Calculate Invoice-Level Discount ---
    // FIXED: Added optional chaining (?.) to prevent the error if the element is not found.
    const invoiceDiscountValue = parseFloat(document.getElementById('invoice-discount-value')?.value) || 0;
    const invoiceDiscountType = document.getElementById('invoice-discount-type')?.value || 'percentage';
    
    let invoiceDiscountAmount = 0;
    if (invoiceDiscountValue > 0) {
        invoiceDiscountAmount = (invoiceDiscountType === 'percentage')
            ? (grossSubtotal * invoiceDiscountValue / 100)
            : invoiceDiscountValue;
    }
    
    // Recalculate GST if invoice-level discount is applied
    if (invoiceDiscountAmount > 0) {
        const netSubtotalAfterInvoiceDiscount = grossSubtotal - invoiceDiscountAmount;
        totalGST = 0; // Reset GST
        rows.forEach(row => {
            const quantity = parseFloat(row.querySelector('.quantity-input').value) || 0;
            const rate = parseFloat(row.querySelector('.rate-input').value) || 0;
            if (quantity > 0 && rate > 0) {
                 const lineTotal = Utils.calculateAmount(quantity, rate);
                 const proportionOfTotal = grossSubtotal > 0 ? lineTotal / grossSubtotal : 0;
                 const discountedLineValue = lineTotal - (invoiceDiscountAmount * proportionOfTotal);
                 const option = row.querySelector('.product-select').selectedOptions[0];
                 const gstRate = option ? parseFloat(option.dataset.gst) || 0 : 0;
                 totalGST += Utils.calculateGST(discountedLineValue, gstRate);
            }
        });
    }

    // --- 3. Update Final Totals ---
    const totalDiscount = totalItemDiscount + invoiceDiscountAmount;
    const finalTotal = (grossSubtotal - totalDiscount) + totalGST;

    document.getElementById('invoice-subtotal').textContent = Utils.formatCurrency(grossSubtotal);
    document.getElementById('invoice-discount').textContent = `- ${Utils.formatCurrency(totalDiscount)}`;
    document.getElementById('invoice-gst').textContent = Utils.formatCurrency(totalGST);
    document.getElementById('invoice-total').textContent = Utils.formatCurrency(finalTotal);
}

  static addInvoiceItem() {
    const container = document.getElementById('invoice-items-container');
    if (!container) return;

    const newRow = document.createElement('div');
    newRow.className = 'item-row';
    newRow.innerHTML = `
      <div class="item-grid">
        <div class="item-product">
          <select class="form-control product-select" required></select>
        </div>
        <div class="item-quantity">
          <input type="number" class="form-control quantity-input" placeholder="Qty" step="any" min="0" required>
        </div>
        <div class="item-rate">
          <input type="number" class="form-control rate-input" placeholder="Rate" step="any" min="0" required>
        </div>
        <div class="item-discount">
            <div class="input-group">
                <input type="number" class="form-control discount-value-input" placeholder="0" min="0" step="any">
                <select class="form-control discount-type-select" style="max-width: 60px;">
                    <option value="per_unit">₹/Unit</option>
                    <option value="percentage">%</option>
                    <option value="fixed">₹</option>
                </select>
            </div>
        </div>
        <div class="item-amount">
          <input type="text" class="form-control amount-display" placeholder="Amount" readonly>
        </div>
        <div class="item-actions">
          <button type="button" class="btn btn--outline btn--sm remove-item">×</button>
        </div>
      </div>
    `;

    container.appendChild(newRow);
    
    // Get the dropdown from ONLY the new row we just created
    const newSelect = newRow.querySelector('.product-select');
    // And populate ONLY that new dropdown
    this.populateProductSelects(newSelect);
  }

  // FIXED: Working invoice creation
  static async saveInvoice(event) {
    event.preventDefault();
    
    const customerId = document.getElementById('invoice-customer')?.value;
    const invoiceDate = document.getElementById('invoice-date')?.value;
    //const dueDate = document.getElementById('invoice-due-date')?.value;

    if (!customerId) {
      NotificationService.error('Please select a customer');
      return;
    }

    if (!invoiceDate) {
      NotificationService.error('Please select invoice and due dates');
      return;
    }

    // Collect items
    const rows = document.querySelectorAll('.item-row');
    const items = [];
    let grossSubtotal = 0;
    let totalItemDiscount = 0;

    // --- A. Process each item row to capture all data, including discounts ---
    for (const row of rows) {
      const productSelect = row.querySelector('.product-select');
      const quantityInput = row.querySelector('.quantity-input');
      const rateInput = row.querySelector('.rate-input');

      if (!productSelect.value || !quantityInput.value || !rateInput.value) {
        continue;
      }

      const discountValueInput = row.querySelector('.discount-value-input');
      const discountValue = discountValueInput ? parseFloat(discountValueInput.value) || 0 : 0;
      const discountType = row.querySelector('.discount-type-select')?.value || 'percentage';

      try {
        const productId = parseInt(productSelect.value);
        const product = await db.products.get(productId);
        if (!product) continue;
        
        const quantity = parseFloat(quantityInput.value);
        const rate = parseFloat(rateInput.value);

        const lineTotal = Utils.calculateAmount(quantity, rate);
        grossSubtotal += lineTotal;

        let itemDiscountAmount = 0;
        if (discountValue > 0) {
                if (discountType === 'percentage') {
            itemDiscountAmount = (lineTotal * discountValue / 100);
        } else if (discountType === 'per_unit') {
            itemDiscountAmount = (discountValue * quantity); // NEW CALCULATION
        } else { // 'fixed'
            itemDiscountAmount = discountValue;
        }
            }
        totalItemDiscount += itemDiscountAmount;

        
        
        const amount = Utils.calculateAmount(quantity, rate);
        const netAmount = lineTotal - itemDiscountAmount;
        const gstAmount = Utils.calculateGST(amount, product.gst_rate);

        items.push({
          product_id: productId,
          name: product.name,
          hsn_code: product.hsn_code,
          quantity: quantity,
          unit: product.unit,
          rate: rate,
          discount: { type: discountType, value: discountValue },
          discountAmount: itemDiscountAmount,
          netAmount: netAmount,
          amount: lineTotal,
          gst_rate: product.gst_rate,
          tax_amount: gstAmount
        });

        //subtotal += amount;
        //totalGST += gstAmount;
      } catch (error) {
        console.error('Error processing item:', error);
        continue;
      }
    }

    if (items.length === 0) {
      NotificationService.error('Please add at least one item');
      return;
    }

    // --- B. Process invoice-level discount and recalculate total GST ---
    const invoiceDiscountValue = parseFloat(document.getElementById('invoice-discount-value')?.value) || 0;
    const invoiceDiscountType = document.getElementById('invoice-discount-type')?.value || 'percentage';
    let invoiceDiscountAmount = 0;
    if (invoiceDiscountValue > 0) {
        invoiceDiscountAmount = invoiceDiscountType === 'percentage'
            ? (grossSubtotal * invoiceDiscountValue / 100)
            : invoiceDiscountValue;
    }
    
    // Recalculate total GST based on the final discounted values
    let totalGST = 0;
    items.forEach(item => {
        const proportionOfTotal = grossSubtotal > 0 ? item.amount / grossSubtotal : 0;
        const finalItemValue = item.netAmount - (invoiceDiscountAmount * proportionOfTotal);
        totalGST += Utils.calculateGST(finalItemValue, item.gst_rate);
    });

    // --- C. Construct the final invoice object ---
    const totalDiscount = totalItemDiscount + invoiceDiscountAmount;
    const netSubtotal = grossSubtotal - totalDiscount;
    try {
      const invoiceData = {
        customer_id: parseInt(customerId),
        date: invoiceDate,
        items: items,
        subtotal: grossSubtotal,
        totalDiscount: totalDiscount,
        netSubtotal: netSubtotal, // Taxable value
        tax_amount: totalGST,
        total_amount: netSubtotal + totalGST,
        payment_status: 'pending',
        amount_paid: 0
      };
//invoices: '++id, invoice_number, customer_id, date, total, amount_paid, payment_status, created_at',
      const result = await InvoiceService.createInvoice(invoiceData);
      
      if (result.success) {
        NotificationService.success('Invoice created successfully');
        this.closeModal();
        await this.loadInvoices();
        DashboardController.updateNavigationCounts();

        // Automatically open the viewer for the new invoice
        this.viewInvoice(result.invoiceId);
        
        if (appState.currentPage === 'dashboard') {
          await DashboardController.updateStats();
          await DashboardController.loadRecentActivity();
        }
        OnboardingController.updateStepStatus();
      } else {
        NotificationService.error(result.error || 'Failed to create invoice');
      }

    } catch (error) {
      console.error('Failed to create invoice:', error);
      NotificationService.error('Failed to create invoice');
    }
  }

  static async viewInvoice(invoiceId) {
    try {
      LoadingService.show('Loading invoice...');
      
      const invoiceHTML = await InvoiceService.generateInvoiceHTML(invoiceId);
      const invoice = await db.invoices.get(invoiceId);
      
      
      const viewerModal = document.getElementById('invoice-viewer-modal');
      const titleEl = document.getElementById('invoice-viewer-title');
      const contentEl = document.getElementById('invoice-content');
      
      await PaymentController.displayPaymentHistory(invoiceId);
      
      if (titleEl) titleEl.textContent = `Invoice ${invoice.invoice_number}`;
      if (contentEl) contentEl.innerHTML = invoiceHTML;

      //document.getElementById('edit-invoice-btn').onclick = () => this.editInvoice(invoiceId);
      
      document.getElementById('print-invoice-btn').onclick = () => this.printInvoice(invoiceId);
      document.getElementById('download-invoice-btn').onclick = () => this.downloadInvoice(invoiceId);
      
      document.getElementById('edit-invoice-btn').onclick = () => {
        NotificationService.info('Editing will be available in a future update.');
      };

      if (viewerModal) viewerModal.classList.remove('hidden');
      
      LoadingService.hide();
    } catch (error) {
      LoadingService.hide();
      NotificationService.error('Failed to load invoice details');
    }
  }

  static async printInvoice(invoiceId) {
    LoadingService.show('Preparing print preview...');
    try {
      const doc = await PDFService.generateInvoiceDoc(invoiceId);

      // Environment-specific printing logic
      if (window.electronAPI && typeof window.electronAPI.printComponentPDF === 'function') {
        
        // --- ELECTRON PATH ---
        // FIXED: Get the PDF as raw binary data (ArrayBuffer)
        const pdfData = doc.output('arraybuffer');
        
        // Send the raw data to the main process
        window.electronAPI.printComponentPDF(pdfData);

        LoadingService.hide();

      } else {
        
        // --- WEB BROWSER PATH (This part is unchanged) ---
        const pdfBlob = doc.output('blob');
        const blobUrl = URL.createObjectURL(pdfBlob);
        const oldIframe = document.getElementById('print-iframe');
        if (oldIframe) oldIframe.remove();
        const iframe = document.createElement('iframe');
        iframe.style.display = 'none';
        iframe.id = 'print-iframe';
        iframe.src = blobUrl;
        document.body.appendChild(iframe);
        iframe.onload = () => {
          iframe.contentWindow.focus();
          const cleanup = () => {
            URL.revokeObjectURL(blobUrl);
            if (iframe.parentElement) iframe.parentElement.removeChild(iframe);
          };
          iframe.contentWindow.onafterprint = cleanup;
          iframe.contentWindow.print();
          LoadingService.hide();
        };
      }
    } catch (error) {
      LoadingService.hide();
      console.error('Failed to print invoice:', error);
      NotificationService.error('Failed to prepare invoice for printing.');
    }
  }


  // FIXED: Actual PDF download
  static async downloadInvoice(invoiceId) {
    try {
      await PDFService.generateInvoicePDF(invoiceId);
    } catch (error) {
      NotificationService.error('PDF download requires full version');
    }
  }

  static closeModal() {
    const modals = ['invoice-modal', 'invoice-viewer-modal'];
    modals.forEach(modalId => {
      const modal = document.getElementById(modalId);
      if (modal) modal.classList.add('hidden');
    });
    
    // Reset form
    const form = document.getElementById('invoice-form');
    if (form) form.reset();
    
    // Clear items except first row
    const container = document.getElementById('invoice-items-container');
    if (container) {
      const rows = container.querySelectorAll('.item-row');
      rows.forEach((row, index) => {
        if (index > 0) row.remove();
      });
      
      // Reset first row
      const firstRow = container.querySelector('.item-row');
      if (firstRow) {
        firstRow.querySelectorAll('input, select').forEach(input => {
          input.value = '';
        });
      }
    }
    
    this.calculateTotals();
  }
}

class PaymentController {
  static init() {
    // Listener for the payment form submission
    document.getElementById('payment-form')?.addEventListener('submit', (e) => {
      e.preventDefault();
      this.savePayment();
    });
  }

  static async openPaymentModal(invoiceId) {
    const modal = document.getElementById('payment-modal');
    const form = document.getElementById('payment-form');
    if (!modal || !form) return;

    form.reset();
    form.dataset.invoiceId = invoiceId;

    const invoice = await db.invoices.get(invoiceId);
    const amountDue = (invoice.total_amount || 0) - (invoice.amount_paid || 0);

    document.getElementById('payment-invoice-number').textContent = invoice.invoice_number;
    document.getElementById('payment-total-amount').textContent = Utils.formatCurrency(invoice.total_amount);
    document.getElementById('payment-amount-due').textContent = Utils.formatCurrency(amountDue);
    document.getElementById('payment-amount').value = amountDue.toFixed(2);
    document.getElementById('payment-date').value = Utils.formatDateForInput(new Date());
    
    modal.classList.remove('hidden');
  }

  static async savePayment() {
    const form = document.getElementById('payment-form');
    const invoiceId = parseInt(form.dataset.invoiceId);
    const amount = parseFloat(document.getElementById('payment-amount').value);
    
    if (!invoiceId || !amount || amount <= 0) {
      NotificationService.error('Please enter a valid payment amount.');
      return;
    }

    LoadingService.show('Recording payment...');
    try {
      const invoice = await db.invoices.get(invoiceId);
      const newAmountPaid = (invoice.amount_paid || 0) + amount;
      
      let newStatus = 'pending';
      if (newAmountPaid >= invoice.total_amount) {
        newStatus = 'paid';
      } else if (newAmountPaid > 0) {
        newStatus = 'partially paid';
      }

      await db.transaction('rw', db.invoices, db.payments, async () => {
        // Add payment record
        await db.payments.add({
          invoice_id: invoiceId,
          amount: amount,
          payment_date: document.getElementById('payment-date').value,
          payment_method: document.getElementById('payment-method').value,
          notes: document.getElementById('payment-notes').value,
          created_at: new Date()
        });
        
        // Update invoice
        await db.invoices.update(invoiceId, {
          amount_paid: newAmountPaid,
          payment_status: newStatus
        });
      });

      document.getElementById('payment-modal').classList.add('hidden');
      await InvoiceController.loadInvoices();
      NotificationService.success('Payment recorded successfully!');

    } catch (error) {
      console.error('Failed to save payment:', error);
      NotificationService.error('Failed to save payment.');
    } finally {
      LoadingService.hide();
    }
  }

  static async displayPaymentHistory(invoiceId) {
    const container = document.getElementById('payment-history-list');
    const payments = await db.payments.where('invoice_id').equals(invoiceId).toArray();

    if (payments.length > 0) {
      container.innerHTML = payments.map(p => `
        <div class="payment-history-item">
          <span>${Utils.formatDate(p.payment_date)} - ${p.payment_method}</span>
          <strong>${Utils.formatCurrency(p.amount)}</strong>
        </div>
      `).join('');
      document.getElementById('payment-history-section').classList.remove('hidden');
    } else {
      container.innerHTML = '';
      document.getElementById('payment-history-section').classList.add('hidden');
    }
  }
}
// SIMPLIFIED Controllers for other pages
/*
class InventoryController {
  static async loadPage() {
    try {
      const products = await db.products.toArray();
      
      document.getElementById('total-products').textContent = products.length;
      document.getElementById('low-stock-items').textContent = products.filter(p => p.stock_quantity <= p.min_stock).length;
      document.getElementById('out-of-stock').textContent = products.filter(p => p.stock_quantity <= 0).length;
      document.getElementById('inventory-value').textContent = Utils.formatCurrency(
        products.reduce((sum, p) => sum + (p.stock_quantity * (p.rate || 0)), 0)
      );
      
      const tbody = document.getElementById('inventory-tbody');
      if (tbody) {
        let html = '';
        products.forEach(product => {
          const stockValue = product.stock_quantity * (product.rate || 0);
          const stockStatus = product.stock_quantity <= 0 ? 'Out of Stock' : 
                             product.stock_quantity <= product.min_stock ? 'Low Stock' : 'In Stock';
          const statusClass = product.stock_quantity <= 0 ? 'status--error' : 
                             product.stock_quantity <= product.min_stock ? 'status--warning' : 'status--success';

          html += `
            <tr>
              <td>${Utils.sanitizeHtml(product.name)}</td>
              <td>${product.stock_quantity} ${product.unit || 'PCS'}</td>
              <td>${product.min_stock} ${product.unit || 'PCS'}</td>
              <td class="currency">${Utils.formatCurrency(product.rate || 0)}</td>
              <td class="currency">${Utils.formatCurrency(stockValue)}</td>
              <td>${Utils.formatDate(product.created_at)}</td>
              <td><span class="status ${statusClass}">${stockStatus}</span></td>
            </tr>
          `;
        });
        tbody.innerHTML = html || '<tr><td colspan="7" class="text-center">No products found</td></tr>';
      }
    } catch (error) {
      console.error('Failed to load inventory:', error);
    }
  }
}
*/

// In app.js
class InventoryController {
  static async loadPage() {
    // this.setupEventListeners();
    await this.loadInventoryList();
  }
  
  static setupEventListeners() {
    const adjustmentBtn = document.getElementById('stock-adjustment-btn');
    if (adjustmentBtn) {
      adjustmentBtn.addEventListener('click', () => this.openAdjustmentModal());
    }

    const adjustmentForm = document.getElementById('stock-adjustment-form');
    if (adjustmentForm) {
      adjustmentForm.addEventListener('submit', (e) => {
        e.preventDefault();
        this.saveAdjustment();
      });
    }

    const tbody = document.getElementById('inventory-tbody');
    if (tbody) {

      const newTbody = tbody.cloneNode(true);
      tbody.parentNode.replaceChild(newTbody, tbody);

      newTbody.addEventListener('click', (e) => {
        const target = e.target.closest('.expand-btn');
        if (target) {
          this.toggleTransactionHistory(target);
        }
      });
    }
  }

  static async loadInventoryList() {
    const tbody = document.getElementById('inventory-tbody');
    try {
      const products = await db.products.orderBy('name').toArray();
      const transactions = await db.inventory_transactions.orderBy('created_at').reverse().toArray();

      // This is the corrected and complete logic for updating the summary cards
      document.getElementById('total-products').textContent = products.length;
      document.getElementById('low-stock-items').textContent = products.filter(p => p.stock_quantity <= p.min_stock && p.stock_quantity > 0).length;
      document.getElementById('out-of-stock').textContent = products.filter(p => p.stock_quantity <= 0).length;
      document.getElementById('inventory-value').textContent = Utils.formatCurrencyCompact(
        products.reduce((sum, p) => sum + (p.stock_quantity * (p.rate || 0)), 0)
      );
      
      let html = '';
      for (const product of products) {
        const stockValue = product.stock_quantity * (product.rate || 0);
        const stockStatus = product.stock_quantity <= 0 ? 'Out of Stock' : 
                           product.stock_quantity <= product.min_stock ? 'Low Stock' : 'In Stock';
        const statusClass = product.stock_quantity <= 0 ? 'status--error' : 
                           product.stock_quantity <= product.min_stock ? 'status--warning' : 'status--success';
        
        html += `
          <tr class="product-summary-row" data-product-id="${product.id}">
            <td><button class="expand-btn" data-product-id="${product.id}">+</button></td>
            <td>${Utils.sanitizeHtml(product.name)}</td>
            <td>${product.stock_quantity} ${product.unit || 'PCS'}</td>
            <td>${product.min_stock} ${product.unit || 'PCS'}</td>
            <td class="currency">${Utils.formatCurrency(product.rate || 0)}</td>
            <td class="currency">${Utils.formatCurrency(stockValue)}</td>
            <td><span class="status ${statusClass}">${stockStatus}</span></td>
          </tr>
        `;
        
        const productTransactions = transactions.filter(t => t.product_id === product.id);
        let logHtml = productTransactions.map(tx => `
          <tr>
            <td>${Utils.formatDate(tx.created_at)}</td>
            <td>${tx.notes || tx.transaction_type}</td>
            <td class="text-right ${tx.quantity > 0 ? 'text-success' : 'text-error'}">${tx.quantity > 0 ? '+' : ''}${tx.quantity}</td>
          </tr>`).join('');

        html += `
          <tr class="transaction-log-row" data-log-for="${product.id}">
            <td colspan="7" class="transaction-log-cell">
              <div class="transaction-log-content">
                <h5>Transaction History for ${Utils.sanitizeHtml(product.name)}</h5>
                ${productTransactions.length > 0 ? `
                  <table class="transaction-log-table">
                    <thead><tr><th>Date</th><th>Description</th><th class="text-right">Change</th></tr></thead>
                    <tbody>${logHtml}</tbody>
                  </table>` : '<p class="text-secondary">No transaction history found.</p>'
                }
              </div>
            </td>
          </tr>
        `;
      }
      if (tbody) {
        tbody.innerHTML = html || '<tr><td colspan="7" class="text-center">No products found.</td></tr>';
      }
    } catch (error) {
      console.error('Failed to load inventory:', error);
      if (tbody) {
        tbody.innerHTML = '<tr><td colspan="7" class="text-center">An error occurred while loading inventory.</td></tr>';
      }
    }
  }

  static toggleTransactionHistory(button) {
    // This is now called via event delegation from App.setupEventListeners
    button.classList.toggle('expanded');
    button.textContent = button.classList.contains('expanded') ? '−' : '+';
    const productId = button.dataset.productId;
    const logRow = document.querySelector(`.transaction-log-row[data-log-for="${productId}"]`);
    if (logRow) {
      logRow.classList.toggle('visible');
    }
  }


  static async openAdjustmentModal() {
    const modal = document.getElementById('stock-adjustment-modal');
    if (!modal) return;
    document.getElementById('stock-adjustment-form').reset();
    const productSelect = document.getElementById('adj-product-select');
    const products = await db.products.orderBy('name').toArray();
    productSelect.innerHTML = '<option value="">Select a Product</option>' + 
      products.map(p => `<option value="${p.id}">${Utils.sanitizeHtml(p.name)}</option>`).join('');
    modal.classList.remove('hidden');
  }

  static async saveAdjustment() {
    const productId = parseInt(document.getElementById('adj-product-select').value);
    const type = document.getElementById('adj-type-select').value;
    const quantity = parseFloat(document.getElementById('adj-quantity').value);
    const notes = document.getElementById('adj-notes').value.trim();
    if (!productId || !quantity || quantity <= 0) {
      NotificationService.error('Please select a product and enter a valid quantity.');
      return;
    }
    LoadingService.show('Saving adjustment...');
    try {
      const product = await db.products.get(productId);
      if (!product) throw new Error('Product not found');
      const adjustmentQty = type === 'addition' ? quantity : -quantity;
      const newStock = product.stock_quantity + adjustmentQty;
      await db.transaction('rw', db.products, db.inventory_transactions, async () => {
        await db.products.update(productId, { stock_quantity: newStock });
        await db.inventory_transactions.add({
          product_id: productId,
          transaction_type: 'adjustment',
          quantity: adjustmentQty,
          notes: notes || `Manual ${type}`,
          created_at: new Date()
        });
      });
      document.getElementById('stock-adjustment-modal').classList.add('hidden');
      await this.loadInventoryList();
      NotificationService.success('Stock adjusted successfully!');
    } catch (error) {
      console.error('Failed to save stock adjustment:', error);
      NotificationService.error('Failed to save adjustment.');
    } finally {
      LoadingService.hide();
    }
  }
}
class ReportController {
  static loadPage() {
    //this.setupEventListeners();

    // Formatting dates in the local timezone to avoid UTC conversion issues.
    const today = new Date();
    const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    const lastDayOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);
    
    document.getElementById('report-start-date').value = Utils.formatDateForInput(firstDayOfMonth);
    document.getElementById('report-end-date').value = Utils.formatDateForInput(lastDayOfMonth);
  }

  static setupEventListeners() {
    document.querySelector('.reports-grid').addEventListener('click', (e) => {
      const reportType = e.target.dataset.report;
      if (reportType === 'sales') this.generateSalesReport();
      else if (reportType === 'gst') this.generateGstReport();
      else if (reportType) NotificationService.info(`${reportType.toUpperCase()} report coming soon!`);
    });

    document.getElementById('close-report').addEventListener('click', () => {
      document.getElementById('report-display').classList.add('hidden');
    });

    document.querySelector('.report-tabs').addEventListener('click', (e) => {
      if (e.target.classList.contains('tab-link')) {
        const tabId = e.target.dataset.tab;
        document.querySelectorAll('.tab-link').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
        e.target.classList.add('active');
        document.getElementById(`tab-${tabId}`).classList.add('active');
      }
    });

    document.getElementById('print-report').addEventListener('click', () => this.printReport());
    document.getElementById('download-report').addEventListener('click', () => this.downloadReport());
  }

  static async generateGstReport() {
    LoadingService.show('Generating GSTR-1 Report...');
    try {
      const startDate = document.getElementById('report-start-date').value;
      const endDate = document.getElementById('report-end-date').value;
      if (!startDate || !endDate) throw new Error('Please select a valid date range.');
      
      const invoices = await db.invoices.where('date').between(startDate, endDate, true, true).toArray();
      const company = appState.company;

      let b2bInvoices = [];
      let b2cSmallSummary = {};
      let hsnSummary = {};

      for (const invoice of invoices) {
        const customer = await db.customers.get(invoice.customer_id);
        const isB2B = Utils.validateGSTIN(customer.gstin);

        // Categorize invoices
        if (isB2B) {
          b2bInvoices.push({ invoice, customer });
        } else {
          // B2C Small (we're ignoring B2C Large for simplicity for now)
          const key = `${customer.state_code}_${invoice.items[0]?.gst_rate || 0}`;
          if (!b2cSmallSummary[key]) {
            b2cSmallSummary[key] = { state: customer.state, rate: invoice.items[0]?.gst_rate || 0, taxableValue: 0 };
          }
          b2cSmallSummary[key].taxableValue += invoice.subtotal || 0;
        }

        // Aggregate HSN data
        for (const item of invoice.items) {
          const hsnKey = item.hsn_code || 'N/A';
          if (!hsnSummary[hsnKey]) {
            hsnSummary[hsnKey] = { hsn: hsnKey, description: item.name, qty: 0, taxableValue: 0, tax: 0 };
          }
          hsnSummary[hsnKey].qty += item.quantity || 0;
          hsnSummary[hsnKey].taxableValue += item.amount || 0;
          hsnSummary[hsnKey].tax += item.tax_amount || 0;
        }
      }

      appState.currentReportData = { 
        type: 'gst',
        title: 'GSTR-1 Summary',
        b2b: b2bInvoices, 
        b2c: Object.values(b2cSmallSummary), 
        hsn: Object.values(hsnSummary) 
      };

      document.getElementById('sales-report-content').classList.add('hidden');
      document.getElementById('gst-report-content').classList.remove('hidden'); 

      // Generate HTML for each tab
      this._renderGstReportTabs(appState.currentReportData);

      document.getElementById('report-title').textContent = appState.currentReportData.title;
      document.getElementById('report-display').classList.remove('hidden');

    } catch (error) {
      console.error('Failed to generate GST report:', error);
      NotificationService.error(error.message || 'Could not generate GST report.');
    } finally {
      LoadingService.hide();
    }
  }

  static _renderGstReportTabs(data) {
    // B2B Tab
    let b2bHtml = `
      <table class="data-table"><thead><tr><th>Customer GSTIN</th><th>Customer Name</th><th>Invoice #</th><th>Date</th><th class="text-right">Value (₹)</th><th class="text-right">Tax (₹)</th></tr></thead><tbody>
      ${data.b2b.map(({invoice, customer}) => `
        <tr>
          <td>${customer.gstin}</td><td>${customer.name}</td><td>${invoice.invoice_number}</td><td>${Utils.formatDate(invoice.date)}</td>
          <td class="text-right">${Utils.formatNumber(invoice.subtotal)}</td><td class="text-right">${Utils.formatNumber(invoice.tax_amount)}</td>
        </tr>`).join('') || '<tr><td colspan="6" class="text-center">No B2B invoices in this period.</td></tr>'}
      </tbody></table>`;
    document.getElementById('tab-b2b').innerHTML = b2bHtml;

    // B2C Small Tab
    let b2cHtml = `
      <table class="data-table"><thead><tr><th>State</th><th>Rate (%)</th><th class="text-right">Taxable Value (₹)</th></tr></thead><tbody>
      ${data.b2c.map(item => `
        <tr>
          <td>${item.state}</td><td>${item.rate}%</td><td class="text-right">${Utils.formatNumber(item.taxableValue)}</td>
        </tr>`).join('') || '<tr><td colspan="3" class="text-center">No B2C invoices in this period.</td></tr>'}
      </tbody></table>`;
    document.getElementById('tab-b2c').innerHTML = b2cHtml;

    // HSN Summary Tab
    let hsnHtml = `
      <table class="data-table"><thead><tr><th>HSN</th><th>Description</th><th class="text-right">Quantity</th><th class="text-right">Taxable Value (₹)</th><th class="text-right">Tax (₹)</th></tr></thead><tbody>
      ${data.hsn.map(item => `
        <tr>
          <td>${item.hsn}</td><td>${item.description}</td><td class="text-right">${item.qty}</td>
          <td class="text-right">${Utils.formatNumber(item.taxableValue)}</td><td class="text-right">${Utils.formatNumber(item.tax)}</td>
        </tr>`).join('') || '<tr><td colspan="5" class="text-center">No items to summarize in this period.</td></tr>'}
      </tbody></table>`;
    document.getElementById('tab-hsn').innerHTML = hsnHtml;
  }

  static async generateSalesReport() {
    LoadingService.show('Generating sales report...');
    try {
      const startDate = document.getElementById('report-start-date').value;
      const endDate = document.getElementById('report-end-date').value;

      if (!startDate || !endDate) {
        NotificationService.error('Please select a valid date range.');
        LoadingService.hide();
        return;
      }

      const invoices = await db.invoices.where('date').between(startDate, endDate, true, true).toArray();
      
      let totalSales = 0;
      let totalTax = 0;
      let totalAmount = 0;
      const invoiceCount = invoices.length;

      let detailedRows = '';
      for (const invoice of invoices) {
        const customer = await db.customers.get(invoice.customer_id);
        totalSales += invoice.subtotal || 0;
        totalTax += invoice.tax_amount || 0;
        totalAmount += invoice.total_amount || 0;
        detailedRows += `
          <tr>
            <td>${invoice.invoice_number}</td>
            <td>${Utils.formatDate(invoice.date)}</td>
            <td>${Utils.sanitizeHtml(customer?.name || 'N/A')}</td>
            <td class="text-right">${Utils.formatNumber(invoice.total_amount)}</td>
            <td><span class="status status--${invoice.payment_status === 'paid' ? 'success' : 'warning'}">${invoice.payment_status}</span></td>
          </tr>
        `;
      }

      appState.currentReportData = {
        title: 'Sales Report',
        dateRange: `From ${Utils.formatDate(startDate)} to ${Utils.formatDate(endDate)}`,
        summary: [
          { label: 'Total Invoices', value: invoiceCount, isCurrency: false },
          { label: 'Total Taxable Sales', value: totalSales, isCurrency: true },
          { label: 'Total GST Collected', value: totalTax, isCurrency: true },
          { label: 'Total Invoice Amount', value: totalAmount, isCurrency: true },
        ],
        invoices: invoices
      };

      document.getElementById('gst-report-content').classList.add('hidden');
      document.getElementById('sales-report-content').classList.remove('hidden');

      const reportHTML = `
        <div class="report-summary">
          ${appState.currentReportData.summary.map(item => `
            <div class="summary-card">
              <h4>${item.label}</h4>
              <p>${item.isCurrency ? Utils.formatCurrency(item.value) : item.value}</p>
            </div>
          `).join('')}
        </div>
        <div class="table-container" style="margin-top: 24px;">
          <table class="data-table">
            <thead>
              <tr>
                <th>Invoice #</th>
                <th>Date</th>
                <th>Customer</th>
                <th class="text-right">Amount (₹)</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>${detailedRows}</tbody>
          </table>
        </div>
      `;

      document.getElementById('sales-report-content').innerHTML = reportHTML;
      document.getElementById('report-title').textContent = appState.currentReportData.title;
      document.getElementById('report-display').classList.remove('hidden');

    } catch (error) {
      console.error('Failed to generate sales report:', error);
      NotificationService.error('Could not generate sales report.');
    } finally {
      LoadingService.hide();
    }
  }

  static printReport() {
    window.print();
  }

  static downloadReport() {
    if (appState.currentReportData) {
      PDFService.generateSalesReportPDF(appState.currentReportData);
    } else {
      NotificationService.error('No report generated to download.');
    }
  }
}

// FIXED: Settings Controller with immediate header update
class SettingsController {
  static hasResetListener = false;

  static async loadPage() {
    this.setupEventListeners();
    try {
      this.populateStates('company-state');
      const company = appState.company || await db.companies.orderBy('id').first();
      
      if (company) {
        const fields = {
          'company-name': company.name,
          'company-gstin': company.gstin,
          'company-phone': company.phone,
          'company-email': company.email,
          'company-address': company.address,
          'company-city': company.city,
          'company-state': company.state_code,
          'company-pincode': company.pincode,
          'company-beneficiary': company.beneficiaryName,
          'company-bank-name': company.bankName,
          'company-account-number': company.accountNumber,
          'company-ifsc': company.ifscCode,
          'company-branch': company.branch
        };

        Object.entries(fields).forEach(([id, value]) => {
          const element = document.getElementById(id);
          if (element) element.value = value || '';
        });

      }

      // Load settings
      const settingsFields = {
        'next-invoice-number': appState.settings.next_invoice_number || '1',
        'invoice-prefix': appState.settings.invoice_prefix || 'INV',
        'payment-terms': appState.settings.payment_terms || '30',
        'terms-conditions': appState.settings.terms_conditions || '',
        'auto-backup': appState.settings.auto_backup || 'daily',
        'low-stock-threshold': appState.settings.low_stock_threshold || '10'
      };

      Object.entries(settingsFields).forEach(([id, value]) => {
        const element = document.getElementById(id);
        if (element) element.value = value;
      });

    } catch (error) {
      console.error('Failed to load settings:', error);
      NotificationService.error('Failed to load settings');
    }
  }

  // FIXED: Save settings with immediate header update
  static async saveSettings() {
    try {
      const stateSelect = document.getElementById('company-state');
      const selectedOption = stateSelect.options[stateSelect.selectedIndex];
      const companyName = document.getElementById('company-name')?.value.trim() || '';
      
      if (!companyName) {
        NotificationService.error('Company name is required');
        return;
      }

      const companyData = {
        name: companyName,
        gstin: document.getElementById('company-gstin')?.value.trim().toUpperCase() || '',
        phone: document.getElementById('company-phone')?.value.trim() || '',
        email: document.getElementById('company-email')?.value.trim() || '',
        address: document.getElementById('company-address')?.value.trim() || '',
        city: document.getElementById('company-city')?.value.trim() || '',
        state_code: stateSelect.value,
        state: selectedOption.text.includes(' - ') ? selectedOption.text.split(' - ')[1] : selectedOption.text,
        pincode: document.getElementById('company-pincode')?.value.trim() || '',
        beneficiaryName: document.getElementById('company-beneficiary')?.value.trim() || '',
        bankName: document.getElementById('company-bank-name')?.value.trim() || '',
        accountNumber: document.getElementById('company-account-number')?.value.trim() || '',
        ifscCode: document.getElementById('company-ifsc')?.value.trim() || '',
        branch: document.getElementById('company-branch')?.value.trim() || ''
     

      
      };

      // Update company in database
      if (appState.company) {
        await db.companies.update(appState.company.id, {
          ...companyData,
          updated_at: new Date()
        });
      } else {
        const companyId = await db.companies.add({
          ...companyData,
          created_at: new Date()
        });
        appState.company = { id: companyId, ...companyData };
      }
      await DatabaseService.loadCompanyInfo();
      // FIXED: Update header immediately
      appState.company = { ...appState.company, ...companyData };
      appState.updateHeaderTitle(companyName);

      // Update settings
      const settingsToUpdate = {
        next_invoice_number: document.getElementById('next-invoice-number')?.value || '1',
        invoice_prefix: document.getElementById('invoice-prefix')?.value || 'INV',
        payment_terms: document.getElementById('payment-terms')?.value || '30',
        terms_conditions: document.getElementById('terms-conditions')?.value || '',
        auto_backup: document.getElementById('auto-backup')?.value || 'daily',
        low_stock_threshold: document.getElementById('low-stock-threshold')?.value || '10'
      };

      for (const [key, value] of Object.entries(settingsToUpdate)) {
        await DatabaseService.updateSetting(key, value);
      }

      NotificationService.success('Settings saved successfully');
      OnboardingController.updateStepStatus();
    } catch (error) {
      console.error('Failed to save settings:', error);
      NotificationService.error('Failed to save settings');
    }
  }

  static populateStates(selectElementId) {
    const select = document.getElementById(selectElementId);
    if (!select) return;

    select.innerHTML = '<option value="">Select State</option>';
    STATES_OF_INDIA.forEach(state => {
      const option = document.createElement('option');
      option.value = state.code;
      option.textContent = `${state.code} - ${state.name}`;
      select.appendChild(option);
    });
  }
  static setupEventListeners() {
    // Prevent duplicate listeners if this is called multiple times
    if (this.hasResetListener) return;

    // --- 1. Existing Factory Reset Listener (Ctrl+Shift+Delete) ---
    document.addEventListener('keydown', (e) => {
      if (appState.currentPage === 'settings' && e.ctrlKey && e.shiftKey && e.key === 'Delete') {
        e.preventDefault();
        this.showResetConfirmation();
      }
    });

    // --- 2. NEW: Manual "Check for Updates" Button Listener ---
    const checkUpdateBtn = document.getElementById('check-update-btn');
    if (checkUpdateBtn) {
      checkUpdateBtn.addEventListener('click', () => {
        // Update UI immediately
        this.setUpdateStatus('checking', 'Checking...');

        // Call the Electron API bridge
        if (window.electronAPI) {
          window.electronAPI.checkForUpdates();
        } else {
          console.error('Electron API not available');
          this.setUpdateStatus('error', 'Update API not available');
        }
      });
    }

    // --- 3. NEW: Listen for Status Updates from Backend ---
    if (window.electronAPI) {
      window.electronAPI.onUpdateStatus((status) => {
        this.setUpdateStatus(status.state, status.message);
      });
    }

    // Mark listeners as attached
    this.hasResetListener = true;
  }
  // --- NEW Helper Method for Update Status UI ---
  static setUpdateStatus(state, message) {
    const statusText = document.getElementById('update-status-text');
    const btn = document.getElementById('check-update-btn');

    if (!statusText || !btn) return;

    // Update the status message
    statusText.textContent = message;
    statusText.className = 'text-secondary'; // Reset base class

    // Handle specific states
    switch (state) {
      case 'checking':
      case 'available':
        btn.disabled = true;
        btn.textContent = 'Processing...';
        statusText.classList.add('text-info');
        break;
      
      case 'downloaded':
        btn.disabled = false;
        btn.textContent = 'Restart to Update';
        statusText.classList.add('text-success');
        // Change button action to restart (optional, or let user restart manually)
        btn.onclick = () => {
           if(window.electronAPI) window.electronAPI.quitAndInstall(); 
        };
        break;
        
      case 'error':
        btn.disabled = false;
        btn.textContent = 'Retry';
        statusText.classList.add('text-error');
        break;
        
      case 'not-available': // Means "Up to date"
      default:
        btn.disabled = false;
        btn.textContent = 'Check for Updates';
        if (state === 'not-available') statusText.classList.add('text-success');
        break;
    }
  }
  static showResetConfirmation() {
    const modal = document.getElementById('factory-reset-modal');
    const confirmInput = document.getElementById('reset-confirm-text');
    const confirmBtn = document.getElementById('reset-confirm-btn');
    if (!modal || !confirmInput || !confirmBtn) return;

    confirmInput.value = '';
    confirmBtn.disabled = true;
    modal.classList.remove('hidden');

    const handleConfirmation = () => {
      confirmBtn.disabled = confirmInput.value !== 'RESET ALL';
    };

    const handleReset = () => {
      modal.classList.add('hidden');
      DatabaseService.performFactoryReset();
      // Clean up listeners to prevent memory leaks
      confirmInput.removeEventListener('input', handleConfirmation);
      confirmBtn.removeEventListener('click', handleReset);
    };

    confirmInput.addEventListener('input', handleConfirmation);
    confirmBtn.addEventListener('click', handleReset);
  }
}


class BackupController {
  static init() {
    const backupBtn = document.getElementById('backup-btn');
    if (backupBtn) {
      backupBtn.addEventListener('click', () => BackupService.exportData());
    }

    const restoreBtn = document.getElementById('restore-btn');
    if (restoreBtn) {
      restoreBtn.addEventListener('click', () => {
        const restoreFileInput = document.getElementById('restore-file-input');
        const file = restoreFileInput.files[0];
        if (!file) {
          NotificationService.error('Please select a backup file.');
          return;
        }
        this.showRestoreConfirmation(file);
      });
    }
  }
  static showRestoreConfirmation(file) {
    const modal = document.getElementById('restore-confirm-modal');
    const confirmInput = document.getElementById('restore-confirm-text');
    const confirmBtn = document.getElementById('restore-confirm-btn');
    if (!modal || !confirmInput || !confirmBtn) return;

    confirmInput.value = '';
    confirmBtn.disabled = true;
    modal.classList.remove('hidden');

    const handleConfirmation = () => {
      confirmBtn.disabled = confirmInput.value !== 'RESTORE';
    };

    const handleRestore = () => {
      modal.classList.add('hidden');
      BackupService.performRestore(file);
      // Clean up listeners to prevent memory leaks
      confirmInput.removeEventListener('input', handleConfirmation);
      confirmBtn.removeEventListener('click', handleRestore);
    };

    confirmInput.addEventListener('input', handleConfirmation);
    confirmBtn.addEventListener('click', handleRestore);
  }
}

class OnboardingController {
  static async init() {
    if (appState.settings.isSetupComplete === 'true') {
      document.getElementById('onboarding-wizard').classList.add('hidden');
      document.getElementById('dashboard-content').classList.remove('hidden');
      return;
    }
    this.showWizard();
  }

  static showWizard() {
    document.getElementById('dashboard-content').classList.add('hidden');
    document.getElementById('onboarding-wizard').classList.remove('hidden');
    this.updateStepStatus();

    // Event listeners are now simpler
    document.querySelector('#onboarding-wizard').addEventListener('click', (e) => {
      if (e.target.tagName === 'BUTTON') {
        if (e.target.dataset.step) {
          this.handleStepAction(e.target.dataset.step);
        } else if (e.target.id === 'finish-onboarding-btn') {
          this.finishOnboarding();
        }
      }
    });
  }

  static async updateStepStatus() {
    const company = await db.companies.orderBy('id').first();
    const productCount = await db.products.count();
    const customerCount = await db.customers.count();
    const invoiceCount = await db.invoices.count();
    
    document.querySelectorAll('.onboarding-step').forEach(el => el.classList.remove('active', 'completed'));
    
    if (company && company.name && company.gstin) {
      document.getElementById('step-company').classList.add('completed');
    } else {
      document.getElementById('step-company').classList.add('active');
      return;
    }

    if (productCount > 0) {
      document.getElementById('step-product').classList.add('completed');
    } else {
      document.getElementById('step-product').classList.add('active');
      return;
    }

    if (customerCount > 0) {
      document.getElementById('step-customer').classList.add('completed');
    } else {
      document.getElementById('step-customer').classList.add('active');
      return;
    }

    if (invoiceCount > 0) {
      document.getElementById('step-invoice').classList.add('completed');
      this.finishOnboarding();
    } else {
      document.getElementById('step-invoice').classList.add('active');
    }
  }
  
  static handleStepAction(step) {
    switch(step) {
      case 'company': App.showPage('settings'); break;
      case 'product': ProductController.openModal(); break;
      case 'customer': CustomerController.openModal(); break;
      case 'invoice': InvoiceController.openModal(); break;
    }
  }

  static async finishOnboarding() {
    await DatabaseService.updateSetting('isSetupComplete', 'true');
    document.getElementById('onboarding-wizard').classList.add('hidden');
    document.getElementById('dashboard-content').classList.remove('hidden');
    DashboardController.loadPage(); 
  }
}

class ThemeController {
  static init() {
    const themeButtons = document.querySelectorAll('.theme-btn');
    themeButtons.forEach(button => {
      button.addEventListener('click', () => {
        const theme = button.dataset.theme;
        this.setTheme(theme);
      });
    });
  }

  static setTheme(theme) {
    const root = document.documentElement;
    if (theme === 'system') {
      root.removeAttribute('data-color-scheme');
      localStorage.removeItem('theme');
    } else {
      root.setAttribute('data-color-scheme', theme);
      localStorage.setItem('theme', theme);
    }
    this.updateActiveButton(theme);
  }

  static applySavedTheme() {
    const savedTheme = localStorage.getItem('theme') || 'light';
    this.setTheme(savedTheme);
  }

  static updateActiveButton(activeTheme) {
    document.querySelectorAll('.theme-btn').forEach(button => {
      if (button.dataset.theme === activeTheme) {
        button.classList.add('active');
      } else {
        button.classList.remove('active');
      }
    });
  }
}
// Global functions for onclick handlers
window.CustomerController = CustomerController;
window.ProductController = ProductController;
window.InvoiceController = InvoiceController;

// FIXED: Initialize the application when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  // Start initialization immediately
  App.init().catch(error => {
    console.error('Failed to initialize application:', error);
    
    // Try to show basic functionality
    document.getElementById('loading-screen').style.display = 'none';
    document.getElementById('app').classList.remove('hidden');
    
    NotificationService.error('Application started in limited mode. Some features may not work.');
  });
});

// Export for debugging
if (typeof window !== 'undefined') {
  window.BLAYe = {
    App,
    DatabaseService,
    Utils,
    NotificationService,
    appState,
    db
  };
}