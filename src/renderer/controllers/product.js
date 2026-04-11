class ProductController {
  static async loadPage() {
    try {
      this.setupEventListeners();
      await this.populateCategoryFilter();

      // Check for a pre-set filter from another page (like the dashboard)
      if (appState.initialProductFilter) {
        // Apply the filter
        await this.loadProducts(appState.initialProductFilter);
        
        // Update the UI to reflect the filter
        if (appState.initialProductFilter.stockStatus) {
            const stockFilterEl = document.getElementById('stock-filter');
            if(stockFilterEl) stockFilterEl.value = appState.initialProductFilter.stockStatus;
        }
        
        // Clear the state so it doesn't apply again
        appState.initialProductFilter = null;
      } else {
        // Load products normally without any filters
        await this.loadProducts();
      }
    } catch (error) {
      console.error('Failed to load products page:', error);
    }
  }

  static async loadProducts(filters = {}) {
    try {
      let products = await db.products.orderBy('name').toArray();

      if (filters.searchTerm) {
        const term = filters.searchTerm.toLowerCase();
        products = products.filter(p => 
          p.name.toLowerCase().includes(term) || 
          (p.hsn_code && p.hsn_code.toLowerCase().includes(term))
        );
      }
      
      if (filters.category) {
        products = products.filter(p => p.category === filters.category);
      }
      
      if (filters.hsn) {
        products = products.filter(p => p.hsn_code && p.hsn_code.startsWith(filters.hsn));
      }

      if (filters.stockStatus) {
        switch(filters.stockStatus) {
          case 'low':
            products = products.filter(p => p.stock_quantity > 0 && p.stock_quantity <= p.min_stock);
            break;
          case 'out':
            products = products.filter(p => p.stock_quantity <= 0);
            break;
          case 'in':
            products = products.filter(p => p.stock_quantity > p.min_stock);
            break;
        }
      }
      const tbody = document.getElementById('products-tbody');
      if (!tbody) return;

      let html = '';
      for (const product of products) {
        const stockStatus = product.stock_quantity <= 0 ? 'out' : 
                           product.stock_quantity <= product.min_stock ? 'low' : 'healthy';
        const stockClass = stockStatus === 'out' ? 'text-error' : 
                          stockStatus === 'low' ? 'text-warning' : '';

        html += `
          <tr>
            <td>
              <div class="item-details">
                <div class="item-name">${Utils.sanitizeHtml(product.name)}</div>
                <div class="item-meta">${Utils.sanitizeHtml(product.category || 'Uncategorized')}</div>
              </div>
            </td>
            <td>${product.hsn_code || 'N/A'}</td>
            <td>${product.unit || 'PCS'}</td>
            <td class="currency">${Utils.formatCurrency(product.rate || 0)}</td>
            <td>
              <div class="stock-status">
                <span class="stock-indicator ${stockStatus}"></span>
                <span class="stock-text ${stockClass}">${product.stock_quantity} ${product.unit || 'PCS'}</span>
              </div>
            </td>
            <td>${product.gst_rate || 0}%</td>
            <td>
              <div class="action-buttons">
                <button class="btn btn--secondary btn--sm btn-icon" onclick="ProductController.editProduct(${product.id})" title="Edit">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
                    <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
                  </svg>
                </button>
                <button class="btn btn--outline btn--sm btn-icon" onclick="ProductController.deleteProduct(${product.id})" title="Delete">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
                  </svg>
                </button>
              </div>
            </td>
          </tr>
        `;
      }

      tbody.innerHTML = html || '<tr><td colspan="7" class="text-center">No products found</td></tr>';
    } catch (error) {
      console.error('Failed to load products:', error);
    }
  }

  static setupEventListeners() {
    const searchInput = document.getElementById('product-search');
    const categoryFilter = document.getElementById('category-filter');
    const stockFilter = document.getElementById('stock-filter');
    const hsnFilter = document.getElementById('hsn-filter');
    
    
    const applyFilters = () => {
      const filters = {
        searchTerm: searchInput?.value.trim() || '',
        category: categoryFilter?.value || '',
        stockStatus: stockFilter?.value || '',
        hsn: hsnFilter?.value.trim() || ''
      };
      this.loadProducts(filters);
    };
     
     const debouncedApplyFilters = Utils.debounce(applyFilters, 300);

    if (searchInput) searchInput.addEventListener('input', debouncedApplyFilters);
    if (hsnFilter) hsnFilter.addEventListener('input', debouncedApplyFilters);
    if (categoryFilter) categoryFilter.addEventListener('change', applyFilters);
    if (stockFilter) stockFilter.addEventListener('change', applyFilters);
  

    //if (searchInput) {
    //  searchInput.addEventListener('input', Utils.debounce(applyFilters, 300));
   // }
    // hsn, cat , stock


  }

  static async populateCategoryFilter() {
    try {
      const products = await db.products.toArray();
      const categories = [...new Set(products.map(p => p.category).filter(Boolean))]; // Get unique, non-empty categories
      const select = document.getElementById('category-filter');
      if (!select) return;

      // Keep the "All Categories" option
      select.innerHTML = '<option value="">All Categories</option>';

      categories.sort().forEach(category => {
        const option = document.createElement('option');
        option.value = category;
        option.textContent = category;
        select.appendChild(option);
      });
    } catch (error) {
      console.error('Failed to populate categories:', error);
    }
  }


  static async openModal(productId = null) {
    const modal = document.getElementById('product-modal');
    if (modal) modal.classList.remove('hidden');
    
    if (productId) {
      try {
        const product = await db.products.get(productId);
        document.getElementById('product-name').value = product.name || '';
        document.getElementById('product-rate').value = product.rate || '';
        document.getElementById('product-category').value = product.category || '';
        document.getElementById('product-hsn').value = product.hsn_code || '';
        document.getElementById('product-unit').value = product.unit || '';
        document.getElementById('product-opening-stock').value = product.stock_quantity || '';
        // NEW: Load rolls
        document.getElementById('product-opening-rolls').value = product.stock_rolls || '0';
        document.getElementById('product-min-stock').value = product.min_stock || '';
        document.getElementById('product-gst').value = product.gst_rate || '';
        //   products:  , ,, ,  unit, gst_rate, created_at',
        appState.editingRecord = product;
      } catch (error) {
        console.error('Failed to load product:', error);
      }
    } else {
      document.getElementById('product-form').reset();
      appState.editingRecord = null;
    }
  }

  static async saveProduct(event) {
    event.preventDefault();
    
    try {
      const productData = {
    name: document.getElementById('product-name').value,
    hsn_code: document.getElementById('product-hsn').value,
    unit: document.getElementById('product-unit').value,
    rate: parseFloat(document.getElementById('product-rate').value),
    gst_rate: parseInt(document.getElementById('product-gst').value),
    stock_quantity: parseFloat(document.getElementById('product-opening-stock').value),
    // NEW: Save rolls
    stock_rolls: parseInt(document.getElementById('product-opening-rolls').value) || 0,
    min_stock: parseFloat(document.getElementById('product-min-stock').value),
    category: document.getElementById('product-category').value
        //created_at: new Date()
      };
      
      // Validation
      if (!productData.name || productData.rate <= 0) {
        NotificationService.error('Name and rate are required');
        return;
      }

      //await db.products.add(productData);
      //NotificationService.success('Product saved successfully');

      if (appState.editingRecord && appState.editingRecord.id) {
        // We are in EDIT mode
        const productId = appState.editingRecord.id;
        productData.updated_at = new Date(); // Add updated timestamp
        
        await db.products.update(productId, productData);
        NotificationService.success('Product updated successfully');
      
      } else {
        // We are in ADD mode
        productData.created_at = new Date(); // Add created timestamp
        
        await db.products.add(productData);
        NotificationService.success('Product saved successfully');
      }
      this.closeModal();
      await this.loadProducts();
      await this.populateCategoryFilter(); // Repopulate categories in case a new one was added

      DashboardController.updateNavigationCounts();
      OnboardingController.updateStepStatus();
    } catch (error) {
      console.error('Failed to save product:', error);
      NotificationService.error('Failed to save product');
    }
  }

  static async editProduct(productId) {
    await this.openModal(productId);
  }

  static async deleteProduct(productId) {
    if (confirm('Delete this product?')) {
      try {
        await db.products.delete(productId);
        NotificationService.success('Product deleted');
        await this.loadProducts();
        DashboardController.updateNavigationCounts();
      } catch (error) {
        NotificationService.error('Failed to delete product');
      }
    }
  }

  static closeModal() {
    const modal = document.getElementById('product-modal');
    if (modal) modal.classList.add('hidden');
  }
}
