# BLAYe - Professional GST Billing System

A desktop billing and inventory management application built for Indian businesses, with full GST compliance features.

**Built by [RabbitFoRed](https://github.com/RabbitFored) / THEOSTRICH**

## Features

- 🧾 **Invoice Management** — Create, view, download, and print GST-compliant tax invoices
- 👥 **Customer Management** — CRUD with GSTIN lookup via government API
- 📦 **Product & Inventory** — Track stock levels (quantity + rolls), low-stock alerts, stock adjustments
- 💰 **Payment Tracking** — Record payments against invoices, track outstanding balances
- 📊 **Reports** — Sales reports, GST/GSTR-1 reports with PDF export
- 🔄 **Backup & Restore** — JSON-based data backup and restore
- 🌙 **Dark Mode** — Light, dark, and system theme support
- 🖨️ **PDF Generation** — Professional invoice PDFs with company logo support
- 🔄 **Auto Updates** — Built-in Electron auto-updater

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Desktop Runtime | Electron |
| Database | Dexie.js (IndexedDB) |
| PDF Generation | jsPDF + AutoTable |
| Charts | Chart.js |
| Installer | Electron Forge (Squirrel, WiX) |
| Testing | Jest + Playwright |

## Project Structure

```
BLAYe/
├── src/
│   ├── main/                       # Electron main process
│   │   ├── main.js                 # Window creation, IPC, auto-updater
│   │   └── preload.js              # Context bridge
│   ├── renderer/                   # Frontend (browser context)
│   │   ├── index.html              # UI shell
│   │   ├── app.js                  # Boot script (DOMContentLoaded)
│   │   ├── style.css               # All styles
│   │   ├── services/               # Business logic
│   │   │   ├── utils.js            # AppState, Utils, constants
│   │   │   ├── notification.js     # Toast notifications + loading overlay
│   │   │   ├── database.js         # Dexie DB schema + DatabaseService
│   │   │   ├── invoice.js          # InvoiceService (calculations, HTML)
│   │   │   ├── pdf.js              # PDFService (jsPDF generation)
│   │   │   └── backup.js           # BackupService (export/restore)
│   │   └── controllers/            # UI controllers
│   │       ├── app.js              # App init, routing, event listeners
│   │       ├── dashboard.js        # Dashboard stats & charts
│   │       ├── customer.js         # Customer CRUD + GSTIN lookup
│   │       ├── product.js          # Product CRUD
│   │       ├── invoice.js          # Invoice creation workflow
│   │       ├── payment.js          # Payment recording
│   │       ├── inventory.js        # Stock management
│   │       ├── reports.js          # Report generation
│   │       ├── settings.js         # Company & app settings
│   │       ├── backup.js           # Backup UI controller
│   │       ├── onboarding.js       # First-run wizard
│   │       └── theme.js            # Dark/light mode
│   └── libs/                       # Vendored libraries
├── __tests__/                      # Unit tests (Jest)
├── e2e/                            # E2E tests (Playwright)
├── package.json
├── forge.config.js
└── README.md
```

## Getting Started

### Prerequisites
- Node.js 18+
- npm

### Install Dependencies
```bash
npm install
```

### Development
```bash
npm run dev
```

### Build Installers
```bash
# Package the app
npm run package

# Create distributable installers
npm run make
```

### Run Tests
```bash
# Unit tests
npm test

# E2E tests
npx playwright test
```

## License

ISC
