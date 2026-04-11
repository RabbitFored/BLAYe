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

