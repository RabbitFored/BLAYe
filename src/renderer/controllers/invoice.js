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
              // FIX: Also restore rolls (was missing, unlike cancelInvoice)
              product.stock_rolls = (product.stock_rolls || 0) + (item.rolls || 0);
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

  // InvoiceController.setupEventListeners() removed — logic now lives in App.setupEventListeners()

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

        
        
        const netAmount = lineTotal - itemDiscountAmount;
        // FIX: Calculate GST on net amount (after discount), not gross amount
        const gstAmount = Utils.calculateGST(netAmount, product.gst_rate);

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
