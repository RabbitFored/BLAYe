/**
 * BLAYe - Utility Functions, Constants & App State
 */

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
      img.onload = () => resolve({ width: img.width, height: img.height });
      img.onerror = reject;
      img.src = dataUrl;
    });
  }

  static formatCurrencyCompact(num) {
    if (num === null || num === undefined) return '₹0';
    const amount = Number(num);
    if (Math.abs(amount) >= 10000000) return '₹' + (amount / 10000000).toFixed(2) + ' Cr';
    if (Math.abs(amount) >= 100000) return '₹' + (amount / 100000).toFixed(2) + ' L';
    return '₹' + amount.toLocaleString('en-IN', { maximumFractionDigits: 0 });
  }

  static amountInWords(num) {
    const amount = Math.round(num);
    if (amount > Number.MAX_SAFE_INTEGER) return "Amount too large to represent in words";
    if (amount === 0) return "Zero";

    const a = ['', 'one ', 'two ', 'three ', 'four ', 'five ', 'six ', 'seven ', 'eight ', 'nine ', 'ten ', 'eleven ', 'twelve ', 'thirteen ', 'fourteen ', 'fifteen ', 'sixteen ', 'seventeen ', 'eighteen ', 'nineteen '];
    const b = ['', '', 'twenty ', 'thirty ', 'forty ', 'fifty ', 'sixty ', 'seventy ', 'eighty ', 'ninety '];

    const toWords = (n, prefix = '') => {
      let str = '';
      if (n > 0) {
        str += (n > 19) ? b[Math.floor(n / 10)] + a[n % 10] : a[n];
        str += prefix;
      }
      return str;
    };

    let result = '';
    result += (amount > 9999999) ? this.amountInWords(Math.floor(amount / 10000000)) + 'crore ' : '';
    result += toWords(Math.floor((amount / 100000) % 100), 'lakh ');
    result += toWords(Math.floor((amount / 1000) % 100), 'thousand ');
    result += toWords(Math.floor((amount / 100) % 10), 'hundred ');
    if (amount > 100 && amount % 100 > 0) result += 'and ';
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
      style: 'currency', currency: 'INR',
      minimumFractionDigits: 0, maximumFractionDigits: 0
    }).format(amount || 0);
  }

  static formatNumber(number) {
    return new Intl.NumberFormat('en-IN').format(number || 0);
  }

  static formatDate(date, format = 'short') {
    try {
      const options = format === 'long'
        ? { day: '2-digit', month: 'long', year: 'numeric' }
        : { day: '2-digit', month: '2-digit', year: 'numeric' };
      return new Date(date).toLocaleDateString('en-IN', options);
    } catch { return 'Invalid Date'; }
  }

  static generateId(prefix = '') {
    return prefix + Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
  }

  static validateGSTIN(gstin) {
    if (!gstin) return false;
    return /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/.test(gstin.trim().toUpperCase());
  }

  static validateAadhar(aadhar) {
    if (!aadhar) return true;
    return /^\d{12}$/.test(aadhar.replace(/\s/g, ''));
  }

  static formatAadhar(aadhar) {
    return aadhar.replace(/\s/g, '').replace(/(\d{4})(\d{4})(\d{4})/, '$1 $2 $3');
  }

  static validatePhone(phone) {
    return /^[6-9][0-9]{9}$/.test(phone.toString().replace(/\s/g, ''));
  }

  static validateEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }

  static debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
      const later = () => { clearTimeout(timeout); func(...args); };
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

  static calculateAmount(quantity, rate) {
    const qty = parseFloat(quantity) || 0;
    const rt = parseFloat(rate) || 0;
    return Math.round((qty * rt) * 100) / 100;
  }

  static calculateGST(amount, gstRate) {
    const amt = parseFloat(amount) || 0;
    const rate = parseFloat(gstRate) || 0;
    return Math.round((amt * rate / 100) * 100) / 100;
  }

  static async checkForDuplicates(tableName, field, value, excludeId = null) {
    try {
      const existing = await db[tableName].where(field).equals(value).first();
      if (existing && (!excludeId || existing.id !== excludeId)) return existing;
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
