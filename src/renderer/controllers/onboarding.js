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
