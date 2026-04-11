class PaymentController {
  static init() {
    // Listener for the payment form submission
    document.getElementById('payment-form')?.addEventListener('submit', (e) => {
      e.preventDefault();
      this.savePayment();
    });
  }

  static async openPaymentModal(invoiceId) {
    const modal = document.getElementById('payment-modal');
    const form = document.getElementById('payment-form');
    if (!modal || !form) return;

    form.reset();
    form.dataset.invoiceId = invoiceId;

    const invoice = await db.invoices.get(invoiceId);
    const amountDue = (invoice.total_amount || 0) - (invoice.amount_paid || 0);

    document.getElementById('payment-invoice-number').textContent = invoice.invoice_number;
    document.getElementById('payment-total-amount').textContent = Utils.formatCurrency(invoice.total_amount);
    document.getElementById('payment-amount-due').textContent = Utils.formatCurrency(amountDue);
    document.getElementById('payment-amount').value = amountDue.toFixed(2);
    document.getElementById('payment-date').value = Utils.formatDateForInput(new Date());
    
    modal.classList.remove('hidden');
  }

  static async savePayment() {
    const form = document.getElementById('payment-form');
    const invoiceId = parseInt(form.dataset.invoiceId);
    const amount = parseFloat(document.getElementById('payment-amount').value);
    
    if (!invoiceId || !amount || amount <= 0) {
      NotificationService.error('Please enter a valid payment amount.');
      return;
    }

    LoadingService.show('Recording payment...');
    try {
      const invoice = await db.invoices.get(invoiceId);
      const newAmountPaid = (invoice.amount_paid || 0) + amount;
      
      let newStatus = 'pending';
      if (newAmountPaid >= invoice.total_amount) {
        newStatus = 'paid';
      } else if (newAmountPaid > 0) {
        newStatus = 'partially paid';
      }

      await db.transaction('rw', db.invoices, db.payments, async () => {
        // Add payment record
        await db.payments.add({
          invoice_id: invoiceId,
          amount: amount,
          payment_date: document.getElementById('payment-date').value,
          payment_method: document.getElementById('payment-method').value,
          notes: document.getElementById('payment-notes').value,
          created_at: new Date()
        });
        
        // Update invoice
        await db.invoices.update(invoiceId, {
          amount_paid: newAmountPaid,
          payment_status: newStatus
        });
      });

      document.getElementById('payment-modal').classList.add('hidden');
      await InvoiceController.loadInvoices();
      NotificationService.success('Payment recorded successfully!');

    } catch (error) {
      console.error('Failed to save payment:', error);
      NotificationService.error('Failed to save payment.');
    } finally {
      LoadingService.hide();
    }
  }

  static async displayPaymentHistory(invoiceId) {
    const container = document.getElementById('payment-history-list');
    const payments = await db.payments.where('invoice_id').equals(invoiceId).toArray();

    if (payments.length > 0) {
      container.innerHTML = payments.map(p => `
        <div class="payment-history-item">
          <span>${Utils.formatDate(p.payment_date)} - ${p.payment_method}</span>
          <strong>${Utils.formatCurrency(p.amount)}</strong>
        </div>
      `).join('');
      document.getElementById('payment-history-section').classList.remove('hidden');
    } else {
      container.innerHTML = '';
      document.getElementById('payment-history-section').classList.add('hidden');
    }
  }
}
