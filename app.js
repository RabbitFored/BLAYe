/**
 * BLAYe - Production-Ready GST Billing System
 * FIXED Version - All Critical Issues Resolved
 * Author: RabbitFoRed
 * ORG : THEOSTRICH
 * Date: September 2025
 */

// Database Configuration using Dexie.js

const db = new Dexie('BLAYeDB');


const BACKEND_URL = 'https://gst-api.theostrich.eu.org/api/v1';


db.version(1).stores({
  companies: '++id, gstin, name, state, state_code, beneficiaryName, accountNumber, ifscCode, bankName, branch, created_at',
  customers: '++id, name, gstin, aadhar, phone, email, state_code, created_at',
  products: '++id, name, hsn_code, category, stock_quantity, min_stock, rate,  unit, gst_rate, created_at',
  invoices: '++id, invoice_number, customer_id, date, total, payment_status, created_at',
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


// const COMPANY_LOGO_BASE64 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAANwAAABNCAMAAABmDrNoAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAKeUExURQAAAAAAAAAAAAAAAAAAnwAAnQABAQAAoAAAoQAAogAAowADoAADnwADoQAGoQAGogEKoQILogILowcMpAgMpQoNpQoNpgwPpgwPpw4QqA4QqiUSqyQTqyUUqyUVrCUYriuZsyyaszaetjietyybuEKivkKjv0OkwEekwkmlxE+nxVCpx1OpzVaqzlyw0l+x0mGz1Ge31mi412q62G272W+92nHA3HPC3XbF33jG4XvH4XzI4n7J44DL5IDL5YHM5YLO54TO54bQ6YjR6YvS6o/U65LV7JbX7Zfa7pmdnp+goaGioqKjpKWlpqeoqKipqqqqq62trq+vr7CwsLGxsrKys7OztLW1tbe3t7i4uLm5ubq6uru7u7y8vL29vb6+vr+/v8DAwMHBwcLCwsPDw8TExMXFxcbGxsfHx8jIyMnJycrKysvLy8zMzM3Nzc7Ozs/Pz9DQ0NHR0dLS0tPT09TU1NXV1dbW1tfX19jY2NnZ2dra2tvb29zc3N3d3d7e3t/f3+Dg4OHh4eLi4uPj4+Tk5OXl5ebm5ufn5+jo6Onp6erq6uvr6+zs7O3t7e7u7u/v7/Dw8PHx8fLy8vPz8/T09PX19fb29vf39/j4+Pn5+fr6+vv7+/z8/P39/f7+/v///0Sc0ogAAABvdFJOU/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////8AXwkyzAAAAAlwSFlzAAAXEQAAFxEByibzPwAABM1JREFUeF7tXeluE0EQbgoJgU1L2mQh2yS0u4Q0mpjELd0lu1uS3f3/3x1wLpWk9cK95i1l7jlnZv5s5pVERERERERERERERERERPR/U3/60+M0+3mS+tMbH7d1a/Mh+x49I/+hM//h464mFqfN+jO2T47R4/fX+fE/bB9D59/89s6+e2f811Lz1x5608s7L9/f/+D3/d++fW/r+sfnV7ffu64b/4a7fO/d7T3u/72zrx3XzeJ1/eGz//D2O48P//P57p+y+/3L/3s3fV84iFf/N++pP38xGMe1s3/9Y/mX75354//0VnU94bPx0aM373d+T3f/V04+l9H8zQe3+34+N6P3/v9L98b//bN+N/e2/fx3f//T7633/v+N/f2908+f/e7/s29/b17+8M//5v7++b29+69996rB/+bf+9s7+2ff+9s/343Vv/u3t69/e6r/Zt7++b2t9/92ztf7d/d299+19cO/s29fXN7++a+dm7/bt7euf3pL5+O//3pL59/t3/3bt7euX321/6Nvf3u/w9t/d/r/Xv723v72ztf7d983/j3u7/d+/rbu1/r327/7t65fXNfO5f/2797p99/651/7998V/f2/T+//Rsf3/s3n/vX/u5fvz8c35v39f/6135u/u7f/v7/9g9/3/8f/v5fP/9/f2/f/86P29/t3/vX27/7t/frb+/X27+/X/9u/+7f3q3v7es3v+v/3Rsfv72vf/u7e2/f+/s/v7ev/t29/f2D/3v37v4P//53//bOvnl/f2/f/3u//t298+W/fXPfOxf/9t6+w/97d28c1//2zs//n/rbr/k39/b1/+5r59a9e3e/+b98b9/+pE/H23v7+sf/+NdfPje/t+9e/e7euf3vvv3t3b3/v7d/1G77a//qf/tq5e2//1qf+ze/+7f3+X/9a/m//+r7xGz7e+d/u7d/9u3v723v7B3/n3r7e/u7fu3u/+zd/9//6t/f2f/5/7++b2z/8G+7t7+6/fO/+zb39g3+zb3+/d/d+/d/t3/3bv/vX23/v7du/+ze+e+/q3r37e/t7f2/f29f7O3v3z/7+X/9O/86P29/+wQ/8g3/wb+6/+7d+c/9+/869+8u/+d+9e/eXf3N/b1//x/0b92589+7eXf7Nff29+/v/u3/rN/cO/8G/+7fO/Rtf7959b//g39zdP/t2767+/N/du/u3b+4d/g13f/9///b+/M//y3/z335v/+Defv7fv63P/+v/fG//0B/+Db/2/w5n438f/N/t7//o/H/7B79u/+5/r3/3r7d/96/3b//gB/5O/869/YP/oG/8f/ev/9u/f/Bf79+/+4sfP/wXf+ff+v9O/86/82987179vXt/f+9ff//u//ze/Wtf//bv/f1+7f17f+/e+6t69+5+797dO/i/+zf/9t4+F//1z/zI+N9+f29//69/9/5u/u/+zb2Dr3/vXt7t39u/+1dvf+f+1t95/u69g6/+9d69e/e++v7evbv37n7rP/8uP/8vP/8HP/Af/sE/+Dfv/d17t//gB37gP/g3//b+/s2+9/8+uX/9W+/+7d/9W//6F//2zvv/+/3P/f82/t7Z+P/8+/u/e/fufevvb+9++v1v/d+/v/X43fX51z/zv/6N//0//4Nf+/Vv//z/7e69c18/1/nxb/5Xv23s7//vP/v6v9u//2D437/0+N1ff+d+7P/9v/5/b/z4+X39+1/9+/7/7/u/+1f/7h8693d+/G/9v7+3b/x+//7XP/+3X7/9n+s3vvf9f/G/f/fu//X/9v1z/d+9/c+Pv/vXf//v/0P9+v//739/7//g/71/85/7V//6V//mv/61/8U/+Pz7+r+/e+ceXl5q7x4eHh5e+yP//r3H+tVve3d/7179r+fNf/H7t3/r9z9y79/t/f0//z/7O/8/Hh627x/22v8tN69829t8b3/v3v3tP/+/+7d+9+/2v7ev/tXf+fevvzX46/f/3t3v//XvP/ev/t3/3X+z//f+zb/3/+D///f+vf+9f2v+/1/9G/du7+7t2x//0b//+7/+v7V//w//1v8t/179/+H+vf/F/+qXv/iv/dVv/sN/69/q3/3bf/0H/3/9u3/3r/5rf2//+i/+/v6tX//uP/nxf339v/79/f1/r3737/7e3//bf/2v/3Zvf+ff+b+/+3fv3f/v//2X/+I//Bv+P5//Ff8//o3/9W/8/t7b3+3fuf+lR+7f3/vX//1v/f5Xf7u3v3fv/j//7u/tv7Wv/+v79+5+/Qd/5/6tf/X/9X+X//av/8v//n9v/+D/7v8f/uv/6/+t/+v//n/+P/6t//3X//9+//+//xf/+v/+X/z//v/9//5P/uv/0X/9H/3f/8//+//y/9u393/85/q//0//79O/eu/8//+n/+v5+PiP//H03Hn+4z/+46f/+On/0yPi3z//+N0/evyPiL/7H5/+/OP/D4mIiIiIiIiIiIiIiIj6z+g/f6eT8/h/c7cAAAAASUVORK5CYII=';


// Notification System
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
        id: 1,
        name: 'BLAYe',
        gstin: '24ABOPK8249G1ZC'
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
      const company = {
        gstin: '24ABOPK8249G1ZC',
        aadhar: '',
        name: 'BLAYe',
        legal_name: 'OSTRICH Private Limited',
        address: 'Plot No 4, Abdulla Park, Rander Road, Nr Muskan Raw House',
        city: 'Surat',
        state: 'Gujarat',
        pincode: '395009',
        state_code: '24',
        phone: '9825110717',
        email: 'BLAYe@gmail.com',
        created_at: new Date()
      };
      
      await db.companies.add(company);

      // Sample customers
      const customers = [
       /* {
          name: 'Sri Vaari Tex',
          gstin: '33AFQFS4393P1Z0',
          aadhar: '',
          address: 'D.No. 63/29, Nesavalar Colony, 2nd Street',
          city: 'Tirupur',
          state: 'Tamil Nadu',
          pincode: '641602',
          state_code: '33',
          phone: '9876543210',
          email: 'srivaaritex@gmail.com',
          created_at: new Date()
        },
        {
          name: 'Golden Textiles',
          gstin: '',
          aadhar: '1234 5678 9012',
          address: 'Shop 15, Textile Market',
          city: 'Mumbai',
          state: 'Maharashtra',
          pincode: '400001',
          state_code: '27',
          phone: '9123456789',
          email: 'golden@gmail.com',
          created_at: new Date()
        },
        {
          name: 'Raj Enterprises',
          gstin: '',
          address: '123, Market Street, Local Area',
          city: 'Surat',
          state: 'Gujarat',
          pincode: '395009',
          state_code: '24',
          phone: '9988776655',
          email: '',
          created_at: new Date()
        } */
      ];

      await db.customers.bulkAdd(customers);

      // Sample products
      const products = [
       /* {
          name: 'Karara Spandex',
          hsn_code: '60063100',
          category: 'Fabric',
          unit: 'KGS',
          rate: 175.00,
          gst_rate: 5,
          stock_quantity: 1500,
          min_stock: 100,
          created_at: new Date()
        },
        {
          name: 'Cotton Fabric Premium',
          hsn_code: '52081200',
          category: 'Fabric',
          unit: 'MTR',
          rate: 85.00,
          gst_rate: 5,
          stock_quantity: 2500,
          min_stock: 200,
          created_at: new Date()
        },
        {
          name: 'Polyester Blend',
          hsn_code: '54071000',
          category: 'Fabric',
          unit: 'KGS',
          rate: 120.00,
          gst_rate: 12,
          stock_quantity: 800,
          min_stock: 50,
          created_at: new Date()
        },
        {
          name: 'Silk Fabric Royal',
          hsn_code: '50079900',
          category: 'Fabric',
          unit: 'MTR',
          rate: 350.00,
          gst_rate: 5,
          stock_quantity: 300,
          min_stock: 25,
          created_at: new Date()
        },
        {
          name: 'Denim Fabric',
          hsn_code: '52111100',
          category: 'Fabric',
          unit: 'MTR',
          rate: 95.00,
          gst_rate: 12,
          stock_quantity: 25,
          min_stock: 100,
          created_at: new Date()
        }*/
      ];

      await db.products.bulkAdd(products);

      // Sample invoices
      const invoices = [
        /*{
          invoice_number: 'INV720',
          customer_id: 1,
          date: '2024-12-06',
          items: [
            {
              product_id: 1,
              name: 'Karara Spandex',
              hsn_code: '60063100',
              quantity: 100,
              unit: 'KGS',
              rate: 175.00,
              amount: 17500,
              gst_rate: 5,
              tax_amount: 875
            }
          ],
          subtotal: 17500,
          tax_amount: 875,
          total_amount: 18375,
          payment_status: 'pending',
          created_at: new Date()
        },
        {
          invoice_number: 'INV721',
          customer_id: 2,
          date: '2024-12-05',
          items: [
            {
              product_id: 2,
              name: 'Cotton Fabric Premium',
              hsn_code: '52081200',
              quantity: 500,
              unit: 'MTR',
              rate: 85.00,
              amount: 42500,
              gst_rate: 5,
              tax_amount: 2125
            }
          ],
          subtotal: 42500,
          tax_amount: 2125,
          total_amount: 44625,
          payment_status: 'pending',
          created_at: new Date()
        },
        {
          invoice_number: 'INV722',
          customer_id: 3,
          date: '2024-11-20',
          items: [
            {
              product_id: 3,
              name: 'Polyester Blend',
              hsn_code: '54071000',
              quantity: 50,
              unit: 'KGS',
              rate: 120.00,
              amount: 6000,
              gst_rate: 12,
              tax_amount: 720
            }
          ],
          subtotal: 6000,
          tax_amount: 720,
          total_amount: 6720,
          payment_status: 'paid',
          created_at: new Date()
        }*/
      ];

      await db.invoices.bulkAdd(invoices);

      // Default settings
      const defaultSettings = [
        { key: 'next_invoice_number', value: '723', updated_at: new Date() },
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
        invoice_number: await this.getNextInvoiceNumber(),
        customer_id: invoiceData.customer_id,
        date: invoiceData.date,
        items: invoiceData.items,
        subtotal: invoiceData.subtotal,
        tax_amount: invoiceData.tax_amount,
        total_amount: invoiceData.total_amount,
        payment_status: 'pending',
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
      const company = appState.company || await db.companies.orderBy('id').first();
      
      const isInterState = customer.state_code !== company.state_code;

      let itemsHTML = '';
      for (let i = 0; i < invoice.items.length; i++) {
        const item = invoice.items[i];
        const itemTotal = item.amount || Utils.calculateAmount(item.quantity, item.rate);
        
        itemsHTML += `
          <tr>
            <td>${i + 1}</td>
            <td>
              <strong>${Utils.sanitizeHtml(item.name)}</strong><br>
              <small>HSN: ${item.hsn_code || 'N/A'}</small>
            </td>
            <td>${item.quantity} ${item.unit || 'PCS'}</td>
            <td class="text-right">${Utils.formatCurrency(item.rate)}</td>
            <td class="text-right">${item.gst_rate}%</td>
            <td class="text-right"><strong>${Utils.formatCurrency(itemTotal)}</strong></td>
          </tr>
        `;
      }
      
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

      return `
        <div class="invoice-print-header">
          <div class="company-details">
            <h2>${Utils.sanitizeHtml(company?.name || 'BLAYe')}</h2>
            <p>${Utils.sanitizeHtml(company?.address || '')}</p>
            <p>${Utils.sanitizeHtml(company?.city || '')}, ${Utils.sanitizeHtml(company?.state || '')} - ${company?.pincode || ''}</p>
            <p>Phone: ${company?.phone || ''} | Email: ${company?.email || ''}</p>
            <p><strong>GSTIN: ${company?.gstin || ''}</strong></p>
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
          </div>
        </div>

        <table class="invoice-items-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Description</th>
              <th>Qty</th>
              <th class="text-right">Rate</th>
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
  //  try {
  //    if (typeof window.jspdf === 'undefined' || typeof window.jspdf.jsPDF.API.autoTable !== 'function') {
  //      NotificationService.warning('PDF library not fully loaded. Please check internet and try again.');
  //      return;
  //    }

      const invoice = await db.invoices.get(invoiceId);
      const customer = await db.customers.get(invoice.customer_id);
      const company = appState.company || await db.companies.orderBy('id').first();
      
      const { jsPDF } = window.jspdf;
      const doc = new jsPDF();
      
      const pageHeight = doc.internal.pageSize.height;
      const pageWidth = doc.internal.pageSize.width;

      // --- PDF Header (Fine-Tuned Spacing) ---
      let headerY = 15;
      const lineSpacing = 5;

      doc.setFontSize(8);
      doc.setFont(undefined, 'italic');
      doc.text('Original for Recipient', pageWidth - 15, headerY, { align: 'right' });
      doc.setFont(undefined, 'normal');
      
      headerY += 5;
      doc.setFontSize(18);
      doc.setFont(undefined, 'bold');
      doc.text(company?.name.toUpperCase() || 'STAR FABRICS', pageWidth / 2, headerY, { align: 'center' });
      
      headerY += lineSpacing + 2;
      doc.setFontSize(9);
      doc.setFont(undefined, 'normal');
      
      // Centered Company Details with consistent spacing
      const addressLine1 = company?.address || 'Plot No 4, Abdulla Park, Rander Road, Nr Muskan Raw House';
      const addressLine2 = `${company?.city || 'SURAT'} ${company?.pincode || '395009'} ${company?.state || 'GUJARAT'} State Code: ${company?.state_code || '24'}`;
      doc.text(addressLine1, pageWidth / 2, headerY, { align: 'center' });
      headerY += lineSpacing;
      doc.text(addressLine2, pageWidth / 2, headerY, { align: 'center' });
      headerY += lineSpacing;
      doc.setFont(undefined, 'bold');
      doc.text(`GSTIN: ${company?.gstin || 'N/A'}`, pageWidth / 2, headerY, { align: 'center' });
      headerY += lineSpacing;
      doc.setFont(undefined, 'normal');
      const companyContact = `Phone: ${company?.phone || '9825110717'} Email: ${company?.email || ''}`;
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
      doc.text(`Aadhar No.: ${customer?.aadhar || 'N/A'}`, 15, customerMetaY + 5);

      const rightColumnX = 135;
      doc.setFontSize(10);
      doc.text(`Invoice No.:`, rightColumnX, customerY + 6);
      doc.setFont(undefined, 'bold');
      doc.text(`${invoice.invoice_number}`, rightColumnX + 26, customerY + 6);
      doc.setFont(undefined, 'normal');
      doc.text(`Date:`, rightColumnX, customerY + 12);
      doc.text(`${Utils.formatDate(invoice.date)}`, rightColumnX + 26, customerY + 12);
      
      const tableStartY = customerMetaY + 10;
      const head = [['#', 'Description', 'HSN', 'Qty', 'Rate', 'GST%', 'Total (INR)']];
      const body = invoice.items.map((item, index) => {
        const itemTotal = item.amount || Utils.calculateAmount(item.quantity, item.rate);
        return [
          index + 1, item.name, item.hsn_code || 'N/A',
          `${item.quantity} ${item.unit}`,
          item.rate.toFixed(2), `${item.gst_rate}%`, itemTotal.toFixed(2)
        ];
      });

      doc.autoTable({
        head: head, body: body, startY: tableStartY,
        theme: 'grid',
        headStyles: { fillColor: [230, 230, 230], textColor: [0, 0, 0], fontStyle: 'bold' },
        styles: { fontSize: 8, cellPadding: 2, lineColor: [200, 200, 200], lineWidth: 0.1 },
        columnStyles: {
          3: { halign: 'right' }, 4: { halign: 'right' }, 5: { halign: 'center' }, 6: { halign: 'right' }
        }
      });
      
      // --- PDF Footer ---
      let finalY = 190;
      const rightColX = pageWidth - 15;
      const leftColX = 15;
      doc.setLineWidth(0.2);
      doc.line(leftColX, finalY, rightColX, finalY);
      
      let leftY = finalY + 5;
      doc.setFontSize(8);
      doc.setFont(undefined, 'bold');
      doc.text('Bank Details :', leftColX + 2, leftY);
      doc.setFont(undefined, 'normal');
      leftY += 5;
      doc.text(`Bank   : ${company.bankName || 'N/A'}`, leftColX + 2, leftY);
      doc.text(`Branch : ${company.branch || 'N/A'}`, leftColX + 60, leftY);
      leftY += 5;
      doc.text(`A/c No.: ${company.accountNumber || 'N/A'}`, leftColX + 2, leftY);
      doc.text(`IFSC   : ${company.ifscCode || 'N/A'}`, leftColX + 60, leftY);

      const formatNumber = (num) => (num || 0).toLocaleString('en-IN', {minimumFractionDigits: 2, maximumFractionDigits: 2});
      const exactTotal = invoice.subtotal + invoice.tax_amount;
      const roundedTotal = Math.round(exactTotal);
      const roundOff = roundedTotal - exactTotal;
      let rightY = finalY + 5;
      doc.setFontSize(9);
      doc.text('Taxable Rs.', rightColX - 45, rightY);
      doc.text(formatNumber(invoice.subtotal), rightColX, rightY, { align: 'right' });
      rightY += 5;
      const isInterState = customer.state_code !== company.state_code;
      if (isInterState) {
          doc.text('+ IGST', rightColX - 45, rightY);
          doc.text(formatNumber(invoice.tax_amount), rightColX, rightY, { align: 'right' });
          rightY += 5;
      } else {
          const halfTax = (invoice.tax_amount || 0) / 2;
          doc.text('+ CGST', rightColX - 45, rightY);
          doc.text(formatNumber(halfTax), rightColX, rightY, { align: 'right' });
          rightY += 5;
          doc.text('+ SGST', rightColX - 45, rightY);
          doc.text(formatNumber(halfTax), rightColX, rightY, { align: 'right' });
          rightY += 5;
      }
      doc.text('Round Off', rightColX - 45, rightY);
      doc.text(roundOff.toFixed(2), rightColX, rightY, { align: 'right' });
      doc.line(rightColX - 60, rightY + 2, rightColX, rightY + 2);
      rightY += 7;
      doc.setFont(undefined, 'bold');
      doc.text('Total Rs.', rightColX - 45, rightY);
      doc.text(formatNumber(roundedTotal), rightColX, rightY, { align: 'right' });
      
      doc.setFontSize(8);
      doc.setFont(undefined, 'bold');
      doc.text('Rupees:', leftColX + 2, rightY);
      doc.setFont(undefined, 'normal');
      const amountInWordsStr = Utils.amountInWords(roundedTotal).toUpperCase() + " ONLY";
      const amountInWordsLines = doc.splitTextToSize(amountInWordsStr, 120); 
      doc.text(amountInWordsLines, leftColX + 15, rightY);
      const amountInWordsHeight = amountInWordsLines.length * 4;
      let bottomY = rightY + amountInWordsHeight;

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
      doc.text(`For ${company?.name || 'STAR FABRICS'}`, rightColX, signatureY - 2, {align: 'right'});
      doc.setFont(undefined, 'normal');
      doc.text('Authorised Signatory', rightColX, signatureY + 10, {align: 'right'});


      return doc; 

      //doc.save(`invoice-${invoice.invoice_number}.pdf`);
      //NotificationService.success('PDF downloaded successfully!');
    //} catch (error) {
    //  console.error('Failed to generate PDF:', error);
    //  NotificationService.error('Failed to generate PDF. Please try again.');
    //}
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
      doc.text(company.name?.toUpperCase() || 'BLAYe', pageWidth / 2, headerY, { align: 'center' });
      headerY += lineSpacing + 2;
      doc.setFontSize(9);
      doc.setFont(undefined, 'normal');
      const addressLine1 = company.address || '';
      const addressLine2 = `${company.city || ''} ${company.pincode || ''} ${company.state || ''}`;
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

      // Load initial page
      await this.showPage('dashboard');

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
  static setupEventListeners() {
    console.log('Setting up event listeners...');
    
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
        // customers: '++id, name, gstin, aadhar, phone, email, state_code, created_at',
        name: document.getElementById('customer-name').value.trim(),
        phone: document.getElementById('customer-phone').value.trim(),
        email: document.getElementById('customer-email').value.trim(),
        // created_at: new Date() 

        gstin: document.getElementById('customer-gstin').value.trim(),
        aadhar: document.getElementById('customer-aadhar').value.trim(),
        address: document.getElementById('customer-address').value.trim(),
        city: document.getElementById('customer-city').value.trim(),
        state: selectedOption.text.includes(' - ') ? selectedOption.text.split(' - ')[1] : selectedOption.text,
        state_code: stateSelect.value,
        pincode: document.getElementById('customer-pincode').value.trim()



        //address: document.getElementById('customer-address').value.trim(),
        //city: document.getElementById('customer-city').value.trim(),
        //state: document.getElementById('customer-state').value.trim()
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
    stock_quantity: parseInt(document.getElementById('product-opening-stock').value),
    min_stock: parseInt(document.getElementById('product-min-stock').value),
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

// FIXED: Enhanced Invoice Controller with working filters and calculations
class InvoiceController {
  static async loadPage() {
    await this.loadInvoices();
    this.setupEventListeners();
  }

  // FIXED: Working invoice filters
  static async loadInvoices(filters = {}) {
    try {
      let invoices = await db.invoices.orderBy('created_at').reverse().toArray();

      // Apply status filter - FIXED
      if (filters.status && filters.status !== '') {
        if (filters.status === 'overdue') {
          const today = new Date().toISOString().split('T')[0];
          invoices = invoices.filter(inv => 
            inv.payment_status === 'pending'
          );
        } else {
          invoices = invoices.filter(inv => inv.payment_status === filters.status);
        }
      }

      // Apply search filter
      if (filters.searchTerm) {
        const searchTerm = filters.searchTerm.toLowerCase();
        const filteredInvoices = [];
        
        for (const invoice of invoices) {
          const customer = await db.customers.get(invoice.customer_id);
          const customerName = customer?.name?.toLowerCase() || '';
          
          if (invoice.invoice_number.toLowerCase().includes(searchTerm) ||
              customerName.includes(searchTerm)) {
            filteredInvoices.push(invoice);
          }
        }
        invoices = filteredInvoices;
      }

      // Apply date filters
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
        
        // Check if overdue
        const today = new Date().toISOString().split('T')[0];
        const finalStatus = invoice.payment_status;
        
        const statusClass = finalStatus === 'paid' ? 'success' : 
                          finalStatus === 'overdue' ? 'error' : 'warning';
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
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                    <circle cx="12" cy="12" r="3"/>
                  </svg>
                </button>
                <button class="btn btn--primary btn--sm btn-icon" onclick="InvoiceController.printInvoice(${invoice.id})" title="Print">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"/>
                  </svg>
                </button>
                <button class="btn btn--outline btn--sm btn-icon" onclick="InvoiceController.downloadInvoice(${invoice.id})" title="Download">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3"/>
                  </svg>
                </button>
              </div>
            </td>
          </tr>
        `;
      }

      if (html === '') {
        html = '<tr><td colspan="8" class="text-center" style="padding: 40px;">No invoices found</td></tr>';
      }

      tbody.innerHTML = html;

    } catch (error) {
      console.error('Failed to load invoices:', error);
      document.getElementById('invoices-tbody').innerHTML = '<tr><td colspan="8" class="text-center">Error loading invoices</td></tr>';
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
    });

    // Quantity/Rate input handlers
    newContainer.addEventListener('input', (e) => {
      if (e.target.classList.contains('quantity-input') || e.target.classList.contains('rate-input')) {
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

  static calculateTotals() {
    const rows = document.querySelectorAll('.item-row');
    let subtotal = 0;
    let totalGST = 0;

    rows.forEach(row => {
      const quantityInput = row.querySelector('.quantity-input');
      const rateInput = row.querySelector('.rate-input');
      const productSelect = row.querySelector('.product-select');
      
      if (quantityInput && rateInput && productSelect && quantityInput.value && rateInput.value) {
        const quantity = parseFloat(quantityInput.value) || 0;
        const rate = parseFloat(rateInput.value) || 0;
        const amount = Utils.calculateAmount(quantity, rate);
        
        const option = productSelect.selectedOptions[0];
        const gstRate = option ? parseFloat(option.dataset.gst) || 0 : 0;
        const gstAmount = Utils.calculateGST(amount, gstRate);
        
        subtotal += amount;
        totalGST += gstAmount;
      }
    });

    const total = subtotal + totalGST;

    const subtotalEl = document.getElementById('invoice-subtotal');
    const gstEl = document.getElementById('invoice-gst');
    const totalEl = document.getElementById('invoice-total');

    if (subtotalEl) subtotalEl.textContent = Utils.formatCurrency(subtotal);
    if (gstEl) gstEl.textContent = Utils.formatCurrency(totalGST);
    if (totalEl) totalEl.textContent = Utils.formatCurrency(total);
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
          <input type="number" class="form-control quantity-input" placeholder="Qty" step="0.001" min="0" required>
        </div>
        <div class="item-rate">
          <input type="number" class="form-control rate-input" placeholder="Rate" step="0.01" min="0" required>
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
    const dueDate = document.getElementById('invoice-due-date')?.value;

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
    let subtotal = 0;
    let totalGST = 0;

    for (const row of rows) {
      const productSelect = row.querySelector('.product-select');
      const quantityInput = row.querySelector('.quantity-input');
      const rateInput = row.querySelector('.rate-input');

      if (!productSelect.value || !quantityInput.value || !rateInput.value) {
        continue;
      }

      try {
        const productId = parseInt(productSelect.value);
        const product = await db.products.get(productId);
        if (!product) continue;
        
        const quantity = parseFloat(quantityInput.value);
        const rate = parseFloat(rateInput.value);
        const amount = Utils.calculateAmount(quantity, rate);
        const gstAmount = Utils.calculateGST(amount, product.gst_rate);

        items.push({
          product_id: productId,
          name: product.name,
          hsn_code: product.hsn_code,
          quantity: quantity,
          unit: product.unit,
          rate: rate,
          amount: amount,
          gst_rate: product.gst_rate,
          tax_amount: gstAmount
        });

        subtotal += amount;
        totalGST += gstAmount;
      } catch (error) {
        console.error('Error processing item:', error);
        continue;
      }
    }

    if (items.length === 0) {
      NotificationService.error('Please add at least one item');
      return;
    }

    try {
      const invoiceData = {
        customer_id: parseInt(customerId),
        date: invoiceDate,
        items: items,
        subtotal: subtotal,
        tax_amount: totalGST,
        total_amount: subtotal + totalGST
      };

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
      
      if (titleEl) titleEl.textContent = `Invoice ${invoice.invoice_number}`;
      if (contentEl) contentEl.innerHTML = invoiceHTML;
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

// SIMPLIFIED Controllers for other pages
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

class ReportController {
  static loadPage() {
    this.setupEventListeners();

    // Formatting dates in the local timezone to avoid UTC conversion issues.
    const today = new Date();
    const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    const lastDayOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);
    
    document.getElementById('report-start-date').value = Utils.formatDateForInput(firstDayOfMonth);
    document.getElementById('report-end-date').value = Utils.formatDateForInput(lastDayOfMonth);
  }

  static setupEventListeners() {
    document.querySelector('.reports-grid').addEventListener('click', (e) => {
      if (e.target.dataset.report === 'sales') {
        this.generateSalesReport();
      } else if (e.target.dataset.report) {
        NotificationService.info(`${e.target.dataset.report.toUpperCase()} report coming soon!`);
      }
    });

    document.getElementById('close-report').addEventListener('click', () => {
      document.getElementById('report-display').classList.add('hidden');
    });

    document.getElementById('print-report').addEventListener('click', () => this.printReport());
    document.getElementById('download-report').addEventListener('click', () => this.downloadReport());
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

      document.getElementById('report-title').textContent = appState.currentReportData.title;
      document.getElementById('report-content').innerHTML = reportHTML;
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
  static async loadPage() {
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
          'company-state': company.state_code,
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
        gstin: document.getElementById('company-gstin')?.value.trim() || '',
        phone: document.getElementById('company-phone')?.value.trim() || '',
        email: document.getElementById('company-email')?.value.trim() || '',
        address: document.getElementById('company-address')?.value.trim() || '',
        state_code: stateSelect.value,
        state: selectedOption.text.includes(' - ') ? selectedOption.text.split(' - ')[1] : selectedOption.text,
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
}


class BackupController {
  static init() {
    // Listener for the main backup button in the header
    const backupBtn = document.getElementById('backup-btn');
    if (backupBtn) {
      backupBtn.addEventListener('click', () => BackupService.exportData());
    }

    // Listeners for the restore section on the settings page
    const restoreBtn = document.getElementById('restore-btn');
    const restoreFileInput = document.getElementById('restore-file-input');
    
    if (restoreBtn && restoreFileInput) {
      restoreBtn.addEventListener('click', () => {
        const file = restoreFileInput.files[0];
        BackupService.importData(file);
      });
    }
  }
}

// In app.js

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