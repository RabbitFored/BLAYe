class BackupController {
  static init() {
    const backupBtn = document.getElementById('backup-btn');
    if (backupBtn) {
      backupBtn.addEventListener('click', () => BackupService.exportData());
    }

    const restoreBtn = document.getElementById('restore-btn');
    if (restoreBtn) {
      restoreBtn.addEventListener('click', () => {
        const restoreFileInput = document.getElementById('restore-file-input');
        const file = restoreFileInput.files[0];
        if (!file) {
          NotificationService.error('Please select a backup file.');
          return;
        }
        this.showRestoreConfirmation(file);
      });
    }
  }
  static showRestoreConfirmation(file) {
    const modal = document.getElementById('restore-confirm-modal');
    const confirmInput = document.getElementById('restore-confirm-text');
    const confirmBtn = document.getElementById('restore-confirm-btn');
    if (!modal || !confirmInput || !confirmBtn) return;

    confirmInput.value = '';
    confirmBtn.disabled = true;
    modal.classList.remove('hidden');

    const handleConfirmation = () => {
      confirmBtn.disabled = confirmInput.value !== 'RESTORE';
    };

    const handleRestore = () => {
      modal.classList.add('hidden');
      BackupService.performRestore(file);
      // Clean up listeners to prevent memory leaks
      confirmInput.removeEventListener('input', handleConfirmation);
      confirmBtn.removeEventListener('click', handleRestore);
    };

    confirmInput.addEventListener('input', handleConfirmation);
    confirmBtn.addEventListener('click', handleRestore);
  }
}
