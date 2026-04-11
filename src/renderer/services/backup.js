class BackupService {
  static async exportData() {
    LoadingService.show('Creating backup...');
    try {
      const tablesToExport = ['companies', 'customers', 'products', 'invoices', 'payments', 'inventory_transactions', 'settings'];
      const exportData = {
        version: '1.0.0',
        exportedAt: new Date().toISOString(),
        data: {}
      };

      for (const tableName of tablesToExport) {
        const tableData = await db[tableName].toArray();
        exportData.data[tableName] = tableData;
      }

      const jsonString = JSON.stringify(exportData, null, 2);
      const blob = new Blob([jsonString], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const date = new Date().toISOString().split('T')[0];
      a.href = url;
      a.download = `BLAYe-Backup-${date}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      LoadingService.hide();
      NotificationService.success('Data backup successful!');
    } catch (error) {
      LoadingService.hide();
      console.error('Backup failed:', error);
      NotificationService.error('Data backup failed.');
    }
  }
  // importData() removed — use performRestore() instead (was a duplicate)
  static async performRestore(file) {
    LoadingService.show('Restoring data...');
    try {
      const fileContent = await file.text();
      const backupData = JSON.parse(fileContent);

      if (!backupData.data || !backupData.version) {
        throw new Error('Invalid backup file format.');
      }

      await db.transaction('rw', db.tables, async () => {
        for (const table of db.tables) {
          await table.clear();
        }
        for (const tableName of Object.keys(backupData.data)) {
          if (db[tableName]) {
            await db[tableName].bulkAdd(backupData.data[tableName]);
          }
        }
      });
      
      LoadingService.hide();
      NotificationService.success('Restore successful! The application will now reload.');
      setTimeout(() => window.location.reload(), 2000);

    } catch (error) {
      LoadingService.hide();
      console.error('Restore failed:', error);
      NotificationService.error('Restore failed. Please check the file and try again.');
    }
  }
}
