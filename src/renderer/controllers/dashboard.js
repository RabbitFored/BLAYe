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

