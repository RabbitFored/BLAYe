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

