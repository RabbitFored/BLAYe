class InventoryController {
  static async loadPage() {
    // this.setupEventListeners();
    await this.loadInventoryList();
  }
  
  static setupEventListeners() {
    const adjustmentBtn = document.getElementById('stock-adjustment-btn');
    if (adjustmentBtn) {
      adjustmentBtn.addEventListener('click', () => this.openAdjustmentModal());
    }

    const adjustmentForm = document.getElementById('stock-adjustment-form');
    if (adjustmentForm) {
      adjustmentForm.addEventListener('submit', (e) => {
        e.preventDefault();
        this.saveAdjustment();
      });
    }

    const tbody = document.getElementById('inventory-tbody');
    if (tbody) {

      const newTbody = tbody.cloneNode(true);
      tbody.parentNode.replaceChild(newTbody, tbody);

      newTbody.addEventListener('click', (e) => {
        const target = e.target.closest('.expand-btn');
        if (target) {
          this.toggleTransactionHistory(target);
        }
      });
    }
  }

  static async loadInventoryList() {
    const tbody = document.getElementById('inventory-tbody');
    try {
      const products = await db.products.orderBy('name').toArray();
      const transactions = await db.inventory_transactions.orderBy('created_at').reverse().toArray();

      // This is the corrected and complete logic for updating the summary cards
      document.getElementById('total-products').textContent = products.length;
      document.getElementById('low-stock-items').textContent = products.filter(p => p.stock_quantity <= p.min_stock && p.stock_quantity > 0).length;
      document.getElementById('out-of-stock').textContent = products.filter(p => p.stock_quantity <= 0).length;
      document.getElementById('inventory-value').textContent = Utils.formatCurrencyCompact(
        products.reduce((sum, p) => sum + (p.stock_quantity * (p.rate || 0)), 0)
      );
      
      let html = '';
      for (const product of products) {
        const stockValue = product.stock_quantity * (product.rate || 0);
        const stockStatus = product.stock_quantity <= 0 ? 'Out of Stock' : 
                           product.stock_quantity <= product.min_stock ? 'Low Stock' : 'In Stock';
        const statusClass = product.stock_quantity <= 0 ? 'status--error' : 
                           product.stock_quantity <= product.min_stock ? 'status--warning' : 'status--success';
        
        html += `
          <tr class="product-summary-row" data-product-id="${product.id}">
            <td><button class="expand-btn" data-product-id="${product.id}">+</button></td>
            <td>${Utils.sanitizeHtml(product.name)}</td>
            <td>
            ${product.stock_quantity} ${product.unit || 'PCS'}<br>
            <small class="text-secondary">${product.stock_rolls || 0} Rolls</small>
            </td>
            <td>${product.min_stock} ${product.unit || 'PCS'}</td>
            <td class="currency">${Utils.formatCurrency(product.rate || 0)}</td>
            <td class="currency">${Utils.formatCurrency(stockValue)}</td>
            <td><span class="status ${statusClass}">${stockStatus}</span></td>
          </tr>
        `;
        
        const productTransactions = transactions.filter(t => t.product_id === product.id);
        let logHtml = productTransactions.map(tx => `
          <tr>
            <td>${Utils.formatDate(tx.created_at)}</td>
            <td>${tx.notes || tx.transaction_type}</td>
            <td class="text-right ${tx.quantity > 0 ? 'text-success' : 'text-error'}">${tx.quantity > 0 ? '+' : ''}${tx.quantity}</td>
          </tr>`).join('');

        html += `
          <tr class="transaction-log-row" data-log-for="${product.id}">
            <td colspan="7" class="transaction-log-cell">
              <div class="transaction-log-content">
                <h5>Transaction History for ${Utils.sanitizeHtml(product.name)}</h5>
                ${productTransactions.length > 0 ? `
                  <table class="transaction-log-table">
                    <thead><tr><th>Date</th><th>Description</th><th class="text-right">Change</th></tr></thead>
                    <tbody>${logHtml}</tbody>
                  </table>` : '<p class="text-secondary">No transaction history found.</p>'
                }
              </div>
            </td>
          </tr>
        `;
      }
      if (tbody) {
        tbody.innerHTML = html || '<tr><td colspan="7" class="text-center">No products found.</td></tr>';
      }
    } catch (error) {
      console.error('Failed to load inventory:', error);
      if (tbody) {
        tbody.innerHTML = '<tr><td colspan="7" class="text-center">An error occurred while loading inventory.</td></tr>';
      }
    }
  }

  static toggleTransactionHistory(button) {
    // This is now called via event delegation from App.setupEventListeners
    button.classList.toggle('expanded');
    button.textContent = button.classList.contains('expanded') ? '−' : '+';
    const productId = button.dataset.productId;
    const logRow = document.querySelector(`.transaction-log-row[data-log-for="${productId}"]`);
    if (logRow) {
      logRow.classList.toggle('visible');
    }
  }


  static async openAdjustmentModal() {
    const modal = document.getElementById('stock-adjustment-modal');
    if (!modal) return;
    document.getElementById('stock-adjustment-form').reset();
    const productSelect = document.getElementById('adj-product-select');
    const products = await db.products.orderBy('name').toArray();
    productSelect.innerHTML = '<option value="">Select a Product</option>' + 
      products.map(p => `<option value="${p.id}">${Utils.sanitizeHtml(p.name)}</option>`).join('');
    modal.classList.remove('hidden');
  }

  static async saveAdjustment() {
    const productId = parseInt(document.getElementById('adj-product-select').value);
    const type = document.getElementById('adj-type-select').value;
    const quantity = parseFloat(document.getElementById('adj-quantity').value);
    const rolls = parseInt(document.getElementById('adj-rolls').value) || 0; // NEW
    // FIX: Ensure 'notes' is defined properly
    const notesInput = document.getElementById('adj-notes');
    const notes = notesInput ? notesInput.value.trim() : '';
    
    if (!productId || (quantity === 0 && rolls === 0)) {
      NotificationService.error('Please enter a quantity or rolls to adjust.');
      return;
    }
    LoadingService.show('Saving adjustment...');
    try {
      const product = await db.products.get(productId);
      if (!product) throw new Error('Product not found');
      const adjustmentQty = type === 'addition' ? quantity : -quantity;
      const adjRolls = type === 'addition' ? rolls : -rolls; // NEW

      const newStock = product.stock_quantity + adjustmentQty;
      const newRolls = (product.stock_rolls || 0) + adjRolls; // NEW

      await db.transaction('rw', db.products, db.inventory_transactions, async () => {
        await db.products.update(productId, { stock_quantity: newStock, stock_rolls: newRolls });
        await db.inventory_transactions.add({
          product_id: productId,
          transaction_type: 'adjustment',
          quantity: adjustmentQty,
          // We add rolls info to the notes automatically if not provided
          notes: notes || `Manual ${type} (Rolls: ${adjRolls > 0 ? '+' : ''}${adjRolls})`,
          created_at: new Date()
        });
      });
      document.getElementById('stock-adjustment-modal').classList.add('hidden');
      await this.loadInventoryList();
      NotificationService.success('Stock adjusted successfully!');
    } catch (error) {
      console.error('Failed to save stock adjustment:', error);
      NotificationService.error('Failed to save adjustment.');
    } finally {
      LoadingService.hide();
    }
  }
}
