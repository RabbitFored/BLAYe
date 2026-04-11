/**
 * BLAYe - Application Boot
 * Initializes the application and exposes global references
 */

// Global functions for inline onclick handlers in HTML
window.CustomerController = CustomerController;
window.ProductController = ProductController;
window.InvoiceController = InvoiceController;

// Initialize the application when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  App.init().catch(error => {
    console.error('Failed to initialize application:', error);
    
    document.getElementById('loading-screen').style.display = 'none';
    document.getElementById('app').classList.remove('hidden');
    
    NotificationService.error('Application started in limited mode. Some features may not work.');
  });
});
