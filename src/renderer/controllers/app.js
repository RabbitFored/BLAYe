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
    document.getElementById('customer-export')?.addEventListener('click', () => CustomerController.exportCSV());
    document.getElementById('barcode-scanner')?.addEventListener('click', () => NotificationService.info('Barcode scanning is not available in the browser. This feature works in the desktop app.'));
    
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
        else if (reportType === 'customer') ReportController.generateCustomerReport();
        else if (reportType === 'inventory') ReportController.generateInventoryReport();
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

