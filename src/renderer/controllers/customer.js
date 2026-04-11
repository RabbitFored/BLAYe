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

      // Pre-compute outstanding amounts and last transaction dates for all customers
      const invoices = await db.invoices.toArray();
      const customerStats = {};
      for (const inv of invoices) {
        if (!customerStats[inv.customer_id]) {
          customerStats[inv.customer_id] = { outstanding: 0, lastDate: null };
        }
        const stats = customerStats[inv.customer_id];
        if (inv.payment_status !== 'cancelled') {
          stats.outstanding += (inv.total_amount || 0) - (inv.amount_paid || 0);
        }
        const invDate = inv.date ? new Date(inv.date) : null;
        if (invDate && (!stats.lastDate || invDate > stats.lastDate)) {
          stats.lastDate = invDate;
        }
      }

      let html = '';
      for (const customer of customers) {
        if (!searchTerm || customer.name.toLowerCase().includes(searchTerm.toLowerCase())) {
          const stats = customerStats[customer.id] || { outstanding: 0, lastDate: null };
          const outstandingDisplay = Utils.formatCurrency(Math.max(0, stats.outstanding));
          const lastTxDisplay = stats.lastDate ? Utils.formatDate(stats.lastDate) : 'Never';

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
              <td class="currency">${outstandingDisplay}</td>
              <td>${lastTxDisplay}</td>
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

  // AbortController to prevent event listener leaks across modal re-opens
  static _modalAbortController = null;

  static async openModal(customerId = null) {
    const modal = document.getElementById('customer-modal');
    if (!modal) return;

    // Abort any listeners from a previous modal opening
    if (this._modalAbortController) {
      this._modalAbortController.abort();
    }
    this._modalAbortController = new AbortController();
    const signal = this._modalAbortController.signal;

    // Reset and show the modal
    document.getElementById('customer-form').reset();
    document.getElementById('captcha-section').classList.add('hidden');
    modal.classList.remove('hidden');

    // Populate the state dropdown
    SettingsController.populateStates('customer-state');
    
    // Set up the listener to show the captcha on demand
    const gstinInput = document.getElementById('customer-gstin');
    const captchaSection = document.getElementById('captcha-section');
    
    const gstinInputHandler = (event) => {
      if (event.currentTarget.value.length > 0) {
        if (captchaSection.classList.contains('hidden')) {
          captchaSection.classList.remove('hidden');
          this._fetchAndDisplayCaptcha();
        }
      } else {
        captchaSection.classList.add('hidden');
      }
    };

    // Load data if we are editing, otherwise set title for adding
    if (customerId) {
      document.getElementById('customer-modal-title').textContent = 'Edit Customer';
      try {
        const customer = await db.customers.get(customerId);

        document.getElementById('customer-name').value = customer.name || '';
        gstinInput.value = customer.gstin || '';
        document.getElementById('customer-aadhar').value = customer.aadhar || '';
        document.getElementById('customer-phone').value = customer.phone || '';
        document.getElementById('customer-email').value = customer.email || '';
        document.getElementById('customer-address').value = customer.address || '';
        document.getElementById('customer-city').value = customer.city || '';
        document.getElementById('customer-state').value = customer.state_code || '';
        document.getElementById('customer-pincode').value = customer.pincode || '';

        appState.editingRecord = customer;
      } catch (error) {
        console.error('Failed to load customer:', error);
      }
    } else {
      document.getElementById('customer-modal-title').textContent = 'Add Customer';
      appState.editingRecord = null;
    }

    // FIX: Use { signal } so listeners are auto-removed when modal reopens
    gstinInput.addEventListener('input', gstinInputHandler, { signal });
    document.getElementById('refresh-captcha-btn').addEventListener('click', () => this._fetchAndDisplayCaptcha(), { signal });
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
