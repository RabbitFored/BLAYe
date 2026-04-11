/**
 * BLAYe - Notification & Loading Services
 */

class NotificationService {
  static show(message, type = 'info', duration = 5000) {
    const container = document.getElementById('notification-container');
    if (!container) return;
    
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    
    const icons = {
      success: '<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>',
      error: '<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>',
      warning: '<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>',
      info: '<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>'
    };

    notification.innerHTML = `
      <div class="notification-icon" style="color: var(--color-${type})">${icons[type]}</div>
      <div class="notification-content">
        <p class="notification-message">${Utils.sanitizeHtml(message)}</p>
      </div>
      <button class="notification-close" onclick="this.parentElement.remove()">&times;</button>
    `;

    container.appendChild(notification);
    if (duration > 0) {
      setTimeout(() => { if (notification.parentElement) notification.remove(); }, duration);
    }
    return notification;
  }

  static success(message, duration = 3000) { return this.show(message, 'success', duration); }
  static error(message, duration = 5000) { return this.show(message, 'error', duration); }
  static warning(message, duration = 4000) { return this.show(message, 'warning', duration); }
  static info(message, duration = 3000) { return this.show(message, 'info', duration); }
}

class LoadingService {
  static show(message = 'Processing...') {
    const overlay = document.getElementById('loading-overlay');
    const messageEl = document.getElementById('loading-message');
    if (overlay && messageEl) {
      messageEl.textContent = message;
      overlay.classList.remove('hidden');
    }
  }

  static hide() {
    const overlay = document.getElementById('loading-overlay');
    if (overlay) overlay.classList.add('hidden');
  }
}
