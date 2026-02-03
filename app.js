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
  products: '++id, name, hsn_code, category, stock_quantity, stock_rolls, min_stock, rate,  unit, gst_rate, created_at',
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
          // 1. Calculate new stock for PRIMARY unit (Kgs/Mtrs)
          const newStock = Math.max(0, product.stock_quantity - item.quantity);
          
          // 2. NEW: Calculate new stock for SECONDARY unit (Rolls)
    // We default to 0 if stock_rolls doesn't exist yet
          const currentRolls = product.stock_rolls || 0;
          const newStockRolls = Math.max(0, currentRolls - (item.rolls || 0));
    
          await db.products.update(item.product_id, { 
            stock_quantity: newStock,
            stock_rolls: newStockRolls, // Update the database
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
                  <span>${Utils.formatCurrency(invoice.netSubtotal || (invoice.subtotal - (invoice.totalDiscount || 0)))}</span>
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

      if (company.logo) {
          try {
              // 1. Get the real image dimensions
              // We await this so we can calculate layout before drawing
              const dims = await Utils.getImageDimensions(company.logo);
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
              const format = company.logo.startsWith('data:image/png') ? 'PNG' : 'JPEG';

              // 6. Draw Image with perfect dimensions
              doc.addImage(company.logo, format, logoX, brandingY, finalW, finalH);
              
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
      const head = [['#', 'Description','Rolls', 'HSN', 'Qty', 'Rate', 'Discount', 'GST%', 'Total (INR)']]; // Added 'Discount'
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
            index + 1, 
            item.name, 
            item.rolls || '-', // NEW: Show Rolls (or dash if 0/null)
            item.hsn_code || 'N/A',
            `${item.quantity} ${item.unit}`, 
            item.rate.toFixed(2),
            discountText, // NEW data cell
            `${item.gst_rate}%`, 
            itemTotal.toFixed(2)
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
            2: { halign: 'center' },
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
        // NEW: Load rolls
        document.getElementById('product-opening-rolls').value = product.stock_rolls || '0';
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
    // NEW: Save rolls
    stock_rolls: parseInt(document.getElementById('product-opening-rolls').value) || 0,
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
            // NEW: Restore Rolls
            product.stock_rolls = (product.stock_rolls || 0) + (item.rolls || 0);
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
        <div class="item-rolls">
          <input type="number" class="form-control rolls-input" placeholder="Rolls" min="0" step="1">
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

        // NEW: Capture Rolls
        const rollsInput = row.querySelector('.rolls-input');
        const rolls = rollsInput ? parseInt(rollsInput.value) || 0 : 0;

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
          rolls: rolls, // NEW: Save rolls to the item
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
            <td>
            ${product.stock_quantity} ${product.unit || 'PCS'}<br>
            <small class="text-secondary">${product.stock_rolls || 0} Rolls</small>
            </td>
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
    const rolls = parseInt(document.getElementById('adj-rolls').value) || 0; // NEW
    // FIX: Ensure 'notes' is defined properly
    const notesInput = document.getElementById('adj-notes');
    const notes = notesInput ? notesInput.value.trim() : '';
    
    if (!productId || (quantity === 0 && rolls === 0)) {
      NotificationService.error('Please enter a quantity or rolls to adjust.');
      return;
    }
    LoadingService.show('Saving adjustment...');
    try {
      const product = await db.products.get(productId);
      if (!product) throw new Error('Product not found');
      const adjustmentQty = type === 'addition' ? quantity : -quantity;
      const adjRolls = type === 'addition' ? rolls : -rolls; // NEW

      const newStock = product.stock_quantity + adjustmentQty;
      const newRolls = (product.stock_rolls || 0) + adjRolls; // NEW

      await db.transaction('rw', db.products, db.inventory_transactions, async () => {
        await db.products.update(productId, { stock_quantity: newStock, stock_rolls: newRolls });
        await db.inventory_transactions.add({
          product_id: productId,
          transaction_type: 'adjustment',
          quantity: adjustmentQty,
          // We add rolls info to the notes automatically if not provided
          notes: notes || `Manual ${type} (Rolls: ${adjRolls > 0 ? '+' : ''}${adjRolls})`,
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
      if (company) {
  

          // NEW: Load Logo Preview
          const logoPreview = document.getElementById('logo-preview');
          const noLogoText = document.getElementById('no-logo-text');
          const removeBtn = document.getElementById('remove-logo-btn');

          if (company.logo) {
              logoPreview.src = company.logo;
              logoPreview.style.display = 'block';
              noLogoText.style.display = 'none';
              removeBtn.style.display = 'inline-block';
          } else {
              logoPreview.src = '';
              logoPreview.style.display = 'none';
              noLogoText.style.display = 'block';
              removeBtn.style.display = 'none';
          }
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

      // NEW: Handle Logo
      const logoPreview = document.getElementById('logo-preview');
      const newLogoData = logoPreview.dataset.newValue;
      let logoToSave = appState.company?.logo; // Default to existing

      if (newLogoData === 'REMOVED') {
        logoToSave = null;
      } else if (newLogoData) {
        logoToSave = newLogoData;
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
        branch: document.getElementById('company-branch')?.value.trim() || '',
     
        logo: logoToSave,
      
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

    // --- 3. Listen for Status Updates from Backend ---
    if (window.electronAPI) {
      window.electronAPI.onUpdateStatus((status) => {
        this.setUpdateStatus(status.state, status.message);
      });
    }

    // Logo Upload Listener
    const logoInput = document.getElementById('company-logo-input');
    if (logoInput) {
    // Prevent duplicate listener by cloning (if needed) or just ensure single bind
        logoInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
            // Check size (limit to 500KB to keep DB fast)
            if (file.size > 500 * 1024) {
                NotificationService.error("Image too large. Please use an image under 500KB.");
                return;
            }

            const reader = new FileReader();
            reader.onload = function(evt) {
                const base64Image = evt.target.result;
                
                // Update Preview immediately
                document.getElementById('logo-preview').src = base64Image;
                document.getElementById('logo-preview').style.display = 'block';
                document.getElementById('no-logo-text').style.display = 'none';
                document.getElementById('remove-logo-btn').style.display = 'inline-block';
                
                // We'll temporarily store this in a global variable or hidden input to save it later
                // Or easier: Save it directly to the DB now? 
                // Let's stick to the "Save Settings" button flow.
                // We will add a data attribute to the preview image to hold the new value.
                document.getElementById('logo-preview').dataset.newValue = base64Image;
            };
            reader.readAsDataURL(file);
        }
    });
}

    // NEW: Remove Logo Listener
    const removeLogoBtn = document.getElementById('remove-logo-btn');
    if (removeLogoBtn) {
        removeLogoBtn.addEventListener('click', () => {
        document.getElementById('logo-preview').src = '';
        document.getElementById('logo-preview').style.display = 'none';
        document.getElementById('logo-preview').dataset.newValue = 'REMOVED'; // Mark for deletion
        document.getElementById('no-logo-text').style.display = 'block';
        removeLogoBtn.style.display = 'none';
        document.getElementById('company-logo-input').value = ''; // Reset input
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