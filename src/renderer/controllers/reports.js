class ReportController {
  static loadPage() {
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
      else if (reportType === 'customer') this.generateCustomerReport();
      else if (reportType === 'inventory') this.generateInventoryReport();
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

  // ────────────────────────────────────────────────
  // Customer Report
  // ────────────────────────────────────────────────
  static async generateCustomerReport() {
    LoadingService.show('Generating Customer Report...');
    try {
      const startDate = document.getElementById('report-start-date').value;
      const endDate = document.getElementById('report-end-date').value;
      if (!startDate || !endDate) throw new Error('Please select a valid date range.');

      const customers = await db.customers.toArray();
      const invoices = await db.invoices.where('date').between(startDate, endDate, true, true).toArray();

      const customerMap = {};
      for (const c of customers) {
        customerMap[c.id] = { name: c.name, gstin: c.gstin || '-', phone: c.phone || '-', totalSales: 0, invoiceCount: 0, outstanding: 0 };
      }

      for (const inv of invoices) {
        const entry = customerMap[inv.customer_id];
        if (entry) {
          entry.totalSales += inv.total_amount || 0;
          entry.invoiceCount++;
          if (inv.payment_status !== 'paid' && inv.payment_status !== 'cancelled') {
            entry.outstanding += (inv.total_amount || 0) - (inv.amount_paid || 0);
          }
        }
      }

      const rows = Object.values(customerMap).filter(c => c.invoiceCount > 0)
        .sort((a, b) => b.totalSales - a.totalSales);

      const totalSales = rows.reduce((s, r) => s + r.totalSales, 0);
      const totalOutstanding = rows.reduce((s, r) => s + r.outstanding, 0);

      appState.currentReportData = {
        type: 'customer',
        title: 'Customer Report',
        dateRange: `From ${Utils.formatDate(startDate)} to ${Utils.formatDate(endDate)}`,
        summary: [
          { label: 'Total Customers', value: rows.length, isCurrency: false },
          { label: 'Total Sales', value: totalSales, isCurrency: true },
          { label: 'Total Outstanding', value: totalOutstanding, isCurrency: true },
        ],
        rows: rows
      };

      // Render into sales-report-content (reusing that container)
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
                <th>Customer</th><th>GSTIN</th><th>Phone</th>
                <th class="text-right">Invoices</th><th class="text-right">Total Sales (₹)</th>
                <th class="text-right">Outstanding (₹)</th>
              </tr>
            </thead>
            <tbody>
              ${rows.map(r => `
                <tr>
                  <td>${Utils.sanitizeHtml(r.name)}</td><td>${r.gstin}</td><td>${r.phone}</td>
                  <td class="text-right">${r.invoiceCount}</td>
                  <td class="text-right">${Utils.formatNumber(r.totalSales)}</td>
                  <td class="text-right ${r.outstanding > 0 ? 'text-error' : ''}">${Utils.formatNumber(r.outstanding)}</td>
                </tr>
              `).join('') || '<tr><td colspan="6" class="text-center">No customer data for this period.</td></tr>'}
            </tbody>
          </table>
        </div>
      `;

      document.getElementById('sales-report-content').innerHTML = reportHTML;
      document.getElementById('report-title').textContent = 'Customer Report';
      document.getElementById('report-display').classList.remove('hidden');

    } catch (error) {
      console.error('Failed to generate customer report:', error);
      NotificationService.error(error.message || 'Could not generate customer report.');
    } finally {
      LoadingService.hide();
    }
  }

  // ────────────────────────────────────────────────
  // Inventory Report
  // ────────────────────────────────────────────────
  static async generateInventoryReport() {
    LoadingService.show('Generating Inventory Report...');
    try {
      const products = await db.products.toArray();
      const threshold = parseInt(appState.settings.low_stock_threshold || '10');

      let totalValue = 0;
      let lowStockCount = 0;
      let outOfStockCount = 0;

      const rows = products.map(p => {
        const stock = p.stock_quantity || 0;
        const rolls = p.stock_rolls || 0;
        const value = stock * (p.rate || 0);
        totalValue += value;

        let status = 'In Stock';
        if (stock <= 0) { status = 'Out of Stock'; outOfStockCount++; }
        else if (stock <= (p.min_stock || threshold)) { status = 'Low Stock'; lowStockCount++; }

        return {
          name: p.name, hsn: p.hsn_code || '-', unit: p.unit || 'PCS',
          stock, rolls, minStock: p.min_stock || threshold, rate: p.rate || 0, value, status
        };
      }).sort((a, b) => a.stock - b.stock);

      appState.currentReportData = {
        type: 'inventory',
        title: 'Inventory Report',
        dateRange: `As of ${Utils.formatDate(new Date())}`,
        summary: [
          { label: 'Total Products', value: products.length, isCurrency: false },
          { label: 'Total Stock Value', value: totalValue, isCurrency: true },
          { label: 'Low Stock Items', value: lowStockCount, isCurrency: false },
          { label: 'Out of Stock', value: outOfStockCount, isCurrency: false },
        ],
        rows: rows
      };

      document.getElementById('gst-report-content').classList.add('hidden');
      document.getElementById('sales-report-content').classList.remove('hidden');

      const statusClass = (s) => s === 'Out of Stock' ? 'text-error' : s === 'Low Stock' ? 'text-warning' : 'text-success';

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
                <th>Product</th><th>HSN</th><th>Stock</th><th>Rolls</th>
                <th>Min Stock</th><th class="text-right">Rate (₹)</th>
                <th class="text-right">Value (₹)</th><th>Status</th>
              </tr>
            </thead>
            <tbody>
              ${rows.map(r => `
                <tr>
                  <td>${Utils.sanitizeHtml(r.name)}</td><td>${r.hsn}</td>
                  <td>${r.stock} ${r.unit}</td><td>${r.rolls}</td>
                  <td>${r.minStock}</td>
                  <td class="text-right">${Utils.formatNumber(r.rate)}</td>
                  <td class="text-right">${Utils.formatNumber(r.value)}</td>
                  <td><span class="${statusClass(r.status)}">${r.status}</span></td>
                </tr>
              `).join('') || '<tr><td colspan="8" class="text-center">No products found.</td></tr>'}
            </tbody>
          </table>
        </div>
      `;

      document.getElementById('sales-report-content').innerHTML = reportHTML;
      document.getElementById('report-title').textContent = 'Inventory Report';
      document.getElementById('report-display').classList.remove('hidden');

    } catch (error) {
      console.error('Failed to generate inventory report:', error);
      NotificationService.error(error.message || 'Could not generate inventory report.');
    } finally {
      LoadingService.hide();
    }
  }

  // ────────────────────────────────────────────────
  // GST / GSTR-1 Report (existing)
  // ────────────────────────────────────────────────
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

        if (isB2B) {
          b2bInvoices.push({ invoice, customer });
        } else {
          const key = `${customer.state_code}_${invoice.items[0]?.gst_rate || 0}`;
          if (!b2cSmallSummary[key]) {
            b2cSmallSummary[key] = { state: customer.state, rate: invoice.items[0]?.gst_rate || 0, taxableValue: 0 };
          }
          b2cSmallSummary[key].taxableValue += invoice.subtotal || 0;
        }

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
        dateRange: `From ${Utils.formatDate(startDate)} to ${Utils.formatDate(endDate)}`,
        b2b: b2bInvoices, 
        b2c: Object.values(b2cSmallSummary), 
        hsn: Object.values(hsnSummary) 
      };

      document.getElementById('sales-report-content').classList.add('hidden');
      document.getElementById('gst-report-content').classList.remove('hidden'); 

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
    let b2bHtml = `
      <table class="data-table"><thead><tr><th>Customer GSTIN</th><th>Customer Name</th><th>Invoice #</th><th>Date</th><th class="text-right">Value (₹)</th><th class="text-right">Tax (₹)</th></tr></thead><tbody>
      ${data.b2b.map(({invoice, customer}) => `
        <tr>
          <td>${customer.gstin}</td><td>${customer.name}</td><td>${invoice.invoice_number}</td><td>${Utils.formatDate(invoice.date)}</td>
          <td class="text-right">${Utils.formatNumber(invoice.subtotal)}</td><td class="text-right">${Utils.formatNumber(invoice.tax_amount)}</td>
        </tr>`).join('') || '<tr><td colspan="6" class="text-center">No B2B invoices in this period.</td></tr>'}
      </tbody></table>`;
    document.getElementById('tab-b2b').innerHTML = b2bHtml;

    let b2cHtml = `
      <table class="data-table"><thead><tr><th>State</th><th>Rate (%)</th><th class="text-right">Taxable Value (₹)</th></tr></thead><tbody>
      ${data.b2c.map(item => `
        <tr>
          <td>${item.state}</td><td>${item.rate}%</td><td class="text-right">${Utils.formatNumber(item.taxableValue)}</td>
        </tr>`).join('') || '<tr><td colspan="3" class="text-center">No B2C invoices in this period.</td></tr>'}
      </tbody></table>`;
    document.getElementById('tab-b2c').innerHTML = b2cHtml;

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

  // ────────────────────────────────────────────────
  // Sales Report (existing)
  // ────────────────────────────────────────────────
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
        type: 'sales',
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
    if (appState.currentReportData) {
      PDFService.generateReportPDF(appState.currentReportData, 'print');
    } else {
      NotificationService.error('No report generated to print.');
    }
  }

  static downloadReport() {
    if (appState.currentReportData) {
      PDFService.generateReportPDF(appState.currentReportData, 'download');
    } else {
      NotificationService.error('No report generated to download.');
    }
  }
}
