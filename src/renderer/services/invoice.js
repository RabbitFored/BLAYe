/**
 * BLAYe - Invoice Service
 * Handles invoice creation, calculations, and HTML generation
 */

class InvoiceService {
  static calculateGST(customerStateCode, companyStateCode, amount, gstRate) {
    const amt = parseFloat(amount) || 0;
    const rate = parseFloat(gstRate) || 0;
    
    if (customerStateCode === companyStateCode) {
      const cgst = Math.round((amt * rate) / 200 * 100) / 100;
      const sgst = Math.round((amt * rate) / 200 * 100) / 100;
      return { cgst, sgst, igst: 0, total: cgst + sgst };
    } else {
      const igst = Math.round((amt * rate) / 100 * 100) / 100;
      return { cgst: 0, sgst: 0, igst, total: igst };
    }
  }

  static async getNextInvoiceNumber() {
    const prefix = appState.settings.invoice_prefix || 'INV';
    const nextNumber = parseInt(appState.settings.next_invoice_number || '1');
    await DatabaseService.updateSetting('next_invoice_number', (nextNumber + 1).toString());
    return `${prefix}${nextNumber.toString().padStart(3, '0')}`;
  }

  static async createInvoice(invoiceData) {
    try {
      const invoice = {
        ...invoiceData,
        invoice_number: await this.getNextInvoiceNumber(),
        created_at: new Date()
      };

      const invoiceId = await db.invoices.add(invoice);

      for (const item of invoiceData.items) {
        const product = await db.products.get(item.product_id);
        if (product) {
          const newStock = Math.max(0, product.stock_quantity - item.quantity);
          const currentRolls = product.stock_rolls || 0;
          const newStockRolls = Math.max(0, currentRolls - (item.rolls || 0));
    
          await db.products.update(item.product_id, { 
            stock_quantity: newStock,
            stock_rolls: newStockRolls,
            updated_at: new Date()
          });

          await db.inventory_transactions.add({
            product_id: item.product_id,
            transaction_type: 'sale',
            quantity: -item.quantity,
            reference_id: invoiceId.toString(),
            reference_type: 'invoice',
            notes: `Sale via invoice ${invoice.invoice_number}`,
            created_at: new Date()
          });
        }
      }

      return { success: true, invoiceId, invoice: { ...invoice, id: invoiceId } };
    } catch (error) {
      console.error('Failed to create invoice:', error);
      return { success: false, error: error.message };
    }
  }

  static async generateInvoiceHTML(invoiceId) {
    try {
      const invoice = await db.invoices.get(invoiceId);
      if (!invoice) throw new Error('Invoice not found');

      const customer = await db.customers.get(invoice.customer_id);
      const company = appState.company || {}; 
      
      const isInterState = customer.state_code !== company.state_code;

      let itemsHTML = '';
      for (let i = 0; i < invoice.items.length; i++) {
        const item = invoice.items[i];
        const itemTotal = item.amount ?? Utils.calculateAmount(item.quantity, item.rate);
        
        let discountText = '-';
        if (item.discount && item.discount.value > 0) {
          if (item.discount.type === 'percentage') {
            discountText = `${item.discount.value}%`;
          } else if (item.discount.type === 'per_unit') {
            discountText = `${Utils.formatCurrency(item.discount.value)} / ${item.unit || 'Unit'}`;
          } else {
            discountText = Utils.formatCurrency(item.discount.value);
          }
        }
        itemsHTML += `
          <tr>
            <td>${i + 1}</td>
            <td>
              <strong>${Utils.sanitizeHtml(item.name)}</strong><br>
              <small>HSN: ${item.hsn_code || 'N/A'}</small>
            </td>
            <td>${item.quantity} ${item.unit || 'PCS'}</td>
            <td class="text-right">${Utils.formatCurrency(item.rate)}</td>
            <td class="text-right">${discountText}</td> <td class="text-right">${item.gst_rate}%</td>
            <td class="text-right"><strong>${Utils.formatCurrency(itemTotal)}</strong></td>
          </tr>
        `;
      }

      let taxRows = '';
      if (isInterState) {
        taxRows = `
          <div class="total-row">
            <span>IGST:</span>
            <span>${Utils.formatCurrency(invoice.tax_amount || 0)}</span>
          </div>
        `;
      } else {
        const halfTax = (invoice.tax_amount || 0) / 2;
        taxRows = `
          <div class="total-row">
            <span>CGST:</span>
            <span>${Utils.formatCurrency(halfTax)}</span>
          </div>
          <div class="total-row">
            <span>SGST:</span>
            <span>${Utils.formatCurrency(halfTax)}</span>
          </div>
        `;
      }

      return `
        <div class="invoice-print-header">
          <div class="company-details">
            <h2>${Utils.sanitizeHtml(company.name || '')}</h2>
            <p>${Utils.sanitizeHtml(company.address || '')}</p>
            <p>${Utils.sanitizeHtml(company.city || '')}, ${Utils.sanitizeHtml(company.state || '')} - ${Utils.sanitizeHtml(company.pincode || '')}</p>
            <p>Phone: ${company.phone || ''} | Email: ${company.email || ''}</p>
            <p><strong>GSTIN: ${company.gstin || ''}</strong></p>
          </div>
          <div class="invoice-info">
            <h3>TAX INVOICE</h3>
            <p><strong>${invoice.invoice_number}</strong></p>
            <p>Date: ${Utils.formatDate(invoice.date)}</p>
          </div>
        </div>

        <div class="billing-details">
          <div class="bill-to">
            <h4>Bill To:</h4>
            <p><strong>${Utils.sanitizeHtml(customer?.name || 'Unknown Customer')}</strong></p>
            <p>${Utils.sanitizeHtml(customer?.address || '')}</p>
            <p>${Utils.sanitizeHtml(customer?.city || '')}, ${Utils.sanitizeHtml(customer?.state || '')}</p>
            <p>Phone: ${customer?.phone || ''}</p>
            ${customer?.gstin ? `<p><strong>GSTIN: ${customer.gstin}</strong></p>` : ''}
            ${customer?.aadhar ? `<p>Aadhar No.: ${customer.aadhar}</p>` : ''}
          </div>
        </div>

       <table class="invoice-items-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Description</th>
                <th>Qty</th>
                <th class="text-right">Rate</th>
                <th class="text-right">Discount</th>
                <th class="text-right">GST%</th>
                <th class="text-right">Total</th>
              </tr>
            </thead>
            <tbody>${itemsHTML}</tbody>
          </table>

<div class="invoice-totals-print">
                <div class="total-row">
                    <span>Subtotal:</span>
                    <span>${Utils.formatCurrency(invoice.subtotal || 0)}</span>
                </div>
                ${invoice.totalDiscount && invoice.totalDiscount > 0 ? `
                <div class="total-row">
                    <span>Discount:</span>
                    <span class="text-success">- ${Utils.formatCurrency(invoice.totalDiscount)}</span>
                </div>` : ''}

                <div class="total-row" style="font-weight: 500; border-top: 1px dashed var(--color-border); padding-top: var(--space-4); margin-top: var(--space-4);">
                  <span>Taxable Amount:</span>
                  <span>${Utils.formatCurrency(invoice.netSubtotal || (invoice.subtotal - (invoice.totalDiscount || 0)))}</span>
                </div>

                ${taxRows}
                <div class="total-row total-final">
                    <span>Total Amount:</span>
                    <span>${Utils.formatCurrency(invoice.total_amount || 0)}</span>
                </div>
            </div>
        <div class="invoice-footer" style="margin-top: 16px;">
            <p><strong>Amount in Words:</strong> ${Utils.amountInWords(invoice.total_amount || 0)}</p>
        </div>

        <div class="invoice-footer" style="margin-top: 24px; padding-top: 20px; border-top: 1px solid #ddd;">
            <p><strong>Bank Details:</strong></p>
            <p>
                Beneficiary: ${company?.beneficiaryName || ''}<br>
                A/C No: ${company?.accountNumber || ''} | IFSC: ${company?.ifscCode || ''}<br>
                Bank: ${company?.bankName || ''}, ${company?.branch || ''}
            </p>
            <br>
            <p><strong>Terms & Conditions:</strong></p>
            <p>${Utils.sanitizeHtml(appState.settings.terms_conditions || 'Payment due within 30 days.')}</p>
            <br>
            <p style="text-align: center;"><strong>Thank you for your business!</strong></p>
        </div>
      `;
    } catch (error) {
      console.error('Failed to generate invoice HTML:', error);
      throw error;
    }
  }
}
