class PDFService {
  static async generateInvoiceDoc(invoiceId) {
      const invoice = await db.invoices.get(invoiceId);
      const customer = await db.customers.get(invoice.customer_id);
      const company = appState.company || {};
      
      const { jsPDF } = window.jspdf;
      const doc = new jsPDF({
            orientation: 'portrait',
            unit: 'mm',
            format: 'a4'
      });
      
      const pageHeight = doc.internal.pageSize.height;
      const pageWidth = doc.internal.pageSize.width;

            // --- PDF Header (Fine-Tuned Spacing) ---
      let headerY = 15;
      const lineSpacing = 5;

      
// "Original for Recipient" - Keep this at the very top right
      doc.setFontSize(8);
      doc.setFont(undefined, 'italic');
      doc.text('Original for Recipient', pageWidth - 15, headerY, { align: 'right' });
      doc.setFont(undefined, 'normal');

// NEW
// 
      let brandingY = headerY + 5; 

      if (company.logo) {
          try {
              // 1. Get the real image dimensions
              // We await this so we can calculate layout before drawing
              const dims = await Utils.getImageDimensions(company.logo);
              const imgRatio = dims.width / dims.height;

              // 2. Define the Maximum Box (The limit of how big the logo can be)
              const maxW = 40; // Max width in mm
              const maxH = 25; // Max height in mm

              // 3. Calculate Scaled Dimensions (Fit within box)
              let finalW = maxW;
              let finalH = maxW / imgRatio;

              if (finalH > maxH) {
                  finalH = maxH;
                  finalW = maxH * imgRatio;
              }

              // 4. Calculate Center X
              const logoX = (pageWidth - finalW) / 2;

              // 5. Detect Format (PNG/JPEG) from the data URL
              const format = company.logo.startsWith('data:image/png') ? 'PNG' : 'JPEG';

              // 6. Draw Image with perfect dimensions
              doc.addImage(company.logo, format, logoX, brandingY, finalW, finalH);
              
              // 7. Update cursor position
              headerY = brandingY + finalH + 2; 

          } catch (err) {
              console.error("Error adding logo:", err);
              // Fallback to text if logo fails
              doc.setFontSize(18);
              doc.setFont(undefined, 'bold');
              doc.text(company?.name.toUpperCase() || 'YOUR COMPANY', pageWidth / 2, brandingY + 5, { align: 'center' });
              headerY += 10;
          }
      } else {
          // No logo? Draw the text title as fallback
          doc.setFontSize(18);
          doc.setFont(undefined, 'bold');
          doc.text(company?.name.toUpperCase() || 'YOUR COMPANY', pageWidth / 2, brandingY + 5, { align: 'center' });
          headerY += 10; // Move down for text height
      }
      headerY += lineSpacing + 2;
      doc.setFontSize(9);
      doc.setFont(undefined, 'normal');
      
      // Centered Company Details with consistent spacing
      const addressLine1 = String(company.address ?? '');
      const addressLine2 = `${String(company.city ?? '')} ${String(company.pincode ?? '')} ${String(company.state ?? '')}`;
      doc.text(addressLine1, pageWidth / 2, headerY, { align: 'center' });
      headerY += lineSpacing;
      doc.text(addressLine2, pageWidth / 2, headerY, { align: 'center' });
      headerY += lineSpacing;
      doc.setFont(undefined, 'bold');
      doc.text(`GSTIN: ${company?.gstin || 'N/A'}`, pageWidth / 2, headerY, { align: 'center' });
      headerY += lineSpacing;
      doc.setFont(undefined, 'normal');
      const companyContact = `Phone: ${String(company.phone ?? '')} Email: ${String(company.email ?? '')}`;
      doc.text(companyContact, pageWidth / 2, headerY, { align: 'center' });

      // Perfectly centered "TAX INVOICE" section
      headerY += 6;
      doc.setLineWidth(0.2);
      doc.line(15, headerY, pageWidth - 15, headerY); // Top line
      headerY += 4;
      doc.setFontSize(14);
      doc.setFont(undefined, 'bold');
      doc.text('TAX INVOICE', pageWidth / 2, headerY, { align: 'center', baseline: 'middle' });
      headerY += 4;
      doc.line(15, headerY, pageWidth - 15, headerY); // Bottom line
      // --- End Header ---

      let customerY = headerY + 5;
      doc.setFontSize(10);
      doc.setFont(undefined, 'bold');
      doc.text('Bill To:', 15, customerY);
      doc.setFont(undefined, 'normal');
      
      doc.setFontSize(10);
      doc.setFont(undefined, 'bold');
      doc.text(customer?.name || 'Unknown Customer', 15, customerY + 6);
      doc.setFont(undefined, 'normal');
      doc.setFontSize(9);
      const fullAddress = `${customer?.address || ''}, ${customer?.city || ''}, ${customer?.state || ''} - ${customer?.pincode || ''}`;
      const addressLines = doc.splitTextToSize(fullAddress, 115);
      doc.text(addressLines, 15, customerY + 11);
      let customerMetaY = customerY + 11 + (addressLines.length * 4) + 2;
      doc.text(`GSTIN: ${customer?.gstin || 'N/A'}`, 15, customerMetaY);
      customerMetaY += 5;
      if (customer?.aadhar) {
        doc.text(`Aadhar No.: ${customer.aadhar}`, 15, customerMetaY);
        customerMetaY += 5; // Move down again
    }
      const rightColumnX = 135;
      doc.setFontSize(10);
      doc.text(`Invoice No.:`, rightColumnX, customerY + 6);
      doc.setFont(undefined, 'bold');
      doc.text(`${invoice.invoice_number}`, rightColumnX + 26, customerY + 6);
      doc.setFont(undefined, 'normal');
      doc.text(`Date:`, rightColumnX, customerY + 12);
      doc.text(`${Utils.formatDate(invoice.date)}`, rightColumnX + 26, customerY + 12);
      
      const tableStartY = customerMetaY + 10;
      const head = [['#', 'Description', 'HSN', 'Rolls', 'Qty', 'Rate', 'Discount', 'GST%', 'Total (INR)']]; // Added 'Discount'
      const body = invoice.items.map((item, index) => {
    
        // FIXED: Change 'item.netAmount' to 'item.amount'
        // This now shows the gross total (Qty * Rate)
        const itemTotal = item.amount; // Use the saved net amount

        let discountText = '-';
        if (item.discount && item.discount.value > 0) {
            if (item.discount.type === 'percentage') {
            discountText = `${item.discount.value}%`;
        } else if (item.discount.type === 'per_unit') {
            discountText = `${item.discount.value.toFixed(2)}/U`; // NEW (short for unit)
        } else { // 'fixed'
            discountText = item.discount.value.toFixed(2);
        }
        }
        return [
            index + 1, 
            item.name, 
            item.hsn_code || 'N/A',
            item.rolls || '-', // NEW: Show Rolls (or dash if 0/null)
            `${item.quantity} ${item.unit}`, 
            item.rate.toFixed(2),
            discountText, // NEW data cell
            `${item.gst_rate}%`, 
            itemTotal.toFixed(2)
        ];
    });

      // Define the height needed for your footer elements
      // const footerHeight = 65; // Adjust this based on your footer content (bank, terms, signature)
  
      doc.autoTable({
        head: head, 
        body: body, 
        startY: tableStartY,
        // ... (theme and headStyles) ...
        //styles: { fontSize: 8, cellPadding: 2, /* ... */ },
        // --- AFTER (Monochromatic Header) ---
        //theme: 'grid', // Use the grid theme
        headStyles: { fillColor: [230, 230, 230], textColor: [0, 0, 0], fontStyle: 'bold', fontSize: 9 }, // Light gray header, black bold text
        styles: { fontSize: 9, cellPadding: 2, }, // Light gray grid lines, black text
        columnStyles: {
            // UPDATED: Column indices have shifted
            0: { halign: 'center' }, 
            2: { halign: 'center' },
            3: { halign: 'left' }, 
            4: { halign: 'center' }, 
            5: { halign: 'center' }, 
            6: { halign: 'center' }, 
            7: { halign: 'right' }
        },

        // --- NEW: Use didParseCell to precisely control HEADER alignment ---
        didParseCell: function (data) {
        // Apply styles ONLY to header cells
        if (data.row.section === 'head') {
            // Center align the '#' column header
            if (data.column.index === 0) {
                data.cell.styles.halign = 'center';
            }
            // Center align the 'GST%' column header
            else if (data.column.index === 6) {
                 data.cell.styles.halign = 'center';
            }
             // Center align the 'Discount' column header
            else if (data.column.index === 5) {
                 data.cell.styles.halign = 'center';
            }
            else if (data.column.index === 3) {
                 data.cell.styles.halign = 'left';
            }
            else if (data.column.index === 4) {
                 data.cell.styles.halign = 'center';
            }
            else if (data.column.index === 7) {
                 data.cell.styles.halign = 'right';
            }
            // Left align all other headers (Description, HSN, Qty, Rate, Total)
            else {
                data.cell.styles.halign = 'left';
            }
        }}
       // margin: { bottom: footerHeight }

    
      

    });
      
      // --- PDF Footer ---
      

      const totalPages = doc.internal.getNumberOfPages();
      doc.setPage(totalPages);

      let finalY = 190;
      //let finalY = (doc.autoTable.previous ? doc.autoTable.previous.finalY + 10: tableStartY);

      //if (pageHeight - finalY < footerHeight) {
      //  doc.addPage();
      //  finalY = 15; // Reset Y position to the top of the new page
    //}// else {
     //   finalY += 10; // Add some padding after the table
    //}
      const rightColX = pageWidth - 15;
      const leftColX = 15;
      doc.setLineWidth(0.2);
      doc.line(leftColX, finalY, rightColX, finalY);
    
      // --- Column 1: Bank Details ---
      let leftY = finalY + 5;
      doc.setFontSize(8);
      doc.setFont(undefined, 'bold');
      doc.text('Bank Details :', leftColX + 2, leftY);
      doc.setFont(undefined, 'normal');
      leftY += 5;
      doc.text(`Beneficiary: ${company.beneficiaryName || ''}`, leftColX + 2, leftY);
      leftY += 5;
      doc.text(`Bank   : ${company.bankName || 'N/A'}`, leftColX + 2, leftY);
      doc.text(`Branch : ${company.branch || 'N/A'}`, leftColX + 60, leftY);
      leftY += 5;
      doc.text(`A/c No.: ${company.accountNumber || 'N/A'}`, leftColX + 2, leftY);
      doc.text(`IFSC   : ${company.ifscCode || 'N/A'}`, leftColX + 60, leftY);
      leftY += 2; // Final padding for this column

      // --- Column 2: Totals Section ---
      const formatNumber = (num) => (num || 0).toLocaleString('en-IN', {minimumFractionDigits: 2, maximumFractionDigits: 2});
      const exactTotal = invoice.subtotal + invoice.tax_amount;
      const roundedTotal = Math.round(invoice.total_amount);
      const roundOff = roundedTotal - invoice.total_amount;
      let rightY = finalY + 5;
      doc.setFontSize(9);
      doc.text('Subtotal Rs.', rightColX - 45, rightY);
      doc.text(formatNumber(invoice.subtotal), rightColX, rightY, { align: 'right' });
      rightY += 5;

      if (invoice.totalDiscount && invoice.totalDiscount > 0) {
        doc.text('Discount', rightColX - 45, rightY);
        doc.text(`- ${formatNumber(invoice.totalDiscount)}`, rightColX, rightY, { align: 'right' });
        rightY += 5;
      }

      const taxableAmount = invoice.netSubtotal ?? (invoice.subtotal - (invoice.totalDiscount || 0));
      doc.setFont(undefined, 'bold'); // Make it slightly distinct
      doc.text('Taxable Amount', rightColX - 45, rightY);
      doc.text(formatNumber(taxableAmount), rightColX, rightY, { align: 'right' });
      doc.setFont(undefined, 'normal'); // Reset font weight
      rightY += 5;

      const isInterState = customer.state_code !== company.state_code;
      if (isInterState) {
        doc.text('+ IGST', rightColX - 45, rightY);
        doc.text(formatNumber(invoice.tax_amount), rightColX, rightY, { align: 'right' });
        rightY += 5;
      } else {
        const totalTax = invoice.tax_amount || 0;
        const cgst = Math.floor((totalTax / 2) * 100) / 100;
        const sgst = totalTax - cgst;
        doc.text('+ CGST', rightColX - 45, rightY);
        doc.text(formatNumber(cgst), rightColX, rightY, { align: 'right' });
        rightY += 5;
        doc.text('+ SGST', rightColX - 45, rightY);
        doc.text(formatNumber(sgst), rightColX, rightY, { align: 'right' });
        rightY += 5;
    }
    
      
      doc.text('Round Off', rightColX - 45, rightY);
      doc.text(roundOff.toFixed(2), rightColX, rightY, { align: 'right' });
      doc.line(rightColX - 60, rightY + 2, rightColX, rightY + 2);
      rightY += 7;
      doc.setFont(undefined, 'bold');
      doc.text('Total Rs.', rightColX - 45, rightY);
      doc.text(formatNumber(roundedTotal), rightColX, rightY, { align: 'right' })
      
      // --- Content Below Columns (Rupees, Terms, etc.) ---
      // Find the bottom of the taller column to start the next section
      let bottomY = Math.max(leftY, rightY) + 5;

      doc.setFontSize(8);
      doc.setFont(undefined, 'bold');
      doc.text('Rupees:', leftColX + 2, bottomY);
      doc.setFont(undefined, 'normal');
      const amountInWordsStr = Utils.amountInWords(roundedTotal).toUpperCase() + " ONLY";
      const amountInWordsLines = doc.splitTextToSize(amountInWordsStr, 120); 
      doc.text(amountInWordsLines, leftColX + 15, bottomY);
    
      // Adjust Y position based on how many lines the text took
      bottomY += (amountInWordsLines.length * 4) + 2; 

      doc.line(leftColX, bottomY, rightColX, bottomY);
      bottomY += 5;
      doc.setFont(undefined, 'bold');
      doc.text('TERMS:', leftColX + 2, bottomY);
      doc.setFont(undefined, 'normal');
      doc.text('E. & O. E.', rightColX, bottomY, {align: 'right'});
      const terms = doc.splitTextToSize(appState.settings.terms_conditions, 180);
      doc.text(terms, leftColX + 2, bottomY + 4);
    
      const signatureY = pageHeight - 25;
      doc.line(leftColX, signatureY, rightColX, signatureY);
      doc.setFontSize(9);
      doc.text('Received By', leftColX + 2, signatureY + 5);
      doc.text('Checked By', pageWidth / 2, signatureY + 5, {align: 'center'});
      doc.setFont(undefined, 'bold');
      doc.text(`For ${company?.name || 'Your Company'}`, rightColX, signatureY - 2, {align: 'right'});
      doc.setFont(undefined, 'normal');
      doc.text('Authorised Signatory', rightColX, signatureY + 10, {align: 'right'});
      return doc; 
  }
  static async generateInvoicePDF(invoiceId) {
    try {
      if (typeof window.jspdf === 'undefined' || typeof window.jspdf.jsPDF.API.autoTable !== 'function') {
        NotificationService.warning('PDF library not fully loaded. Please check internet and try again.');
        return;
      }
      
      const doc = await this.generateInvoiceDoc(invoiceId);
      const invoice = await db.invoices.get(invoiceId);
      doc.save(`invoice-${invoice.invoice_number}.pdf`);
      NotificationService.success('PDF downloaded successfully!');

    } catch (error) {
      console.error('Failed to generate PDF:', error);
      NotificationService.error('Failed to generate PDF. Please try again.');
    }
  }
  // Method to generate a PDF for the Sales Report
  static async generateSalesReportPDF(reportData) {
    LoadingService.show('Creating PDF...');
    try {
      const { jsPDF } = window.jspdf;
      const doc = new jsPDF();
      const company = appState.company || {};
      const pageWidth = doc.internal.pageSize.width;
      const pageHeight = doc.internal.pageSize.height;
      const leftMargin = 15;
      const rightMargin = pageWidth - 15;
      
      // --- New Professional Header (adapted from Invoice) ---
      let headerY = 15;
      const lineSpacing = 5;
      doc.setFontSize(18);
      doc.setFont(undefined, 'bold');
      doc.text(String(company.name?.toUpperCase() ?? ''), pageWidth / 2, headerY, { align: 'center' });
      headerY += lineSpacing + 2;
      doc.setFontSize(9);
      doc.setFont(undefined, 'normal');
      const addressLine1 = String(company.address ?? '');
      const addressLine2 = `${String(company.city ?? '')} ${String(company.pincode ?? '')} ${String(company.state ?? '')}`;
  
      doc.text(addressLine1, pageWidth / 2, headerY, { align: 'center' });
      headerY += lineSpacing;
      doc.text(addressLine2, pageWidth / 2, headerY, { align: 'center' });
      
      headerY += 8;
      doc.setLineWidth(0.2);
      doc.line(leftMargin, headerY, rightMargin, headerY); // Top line
      headerY += 5;
      doc.setFontSize(14);
      doc.setFont(undefined, 'bold');
      doc.text('SALES REPORT', pageWidth / 2, headerY, { align: 'center', baseline: 'middle' });
      headerY += 5;
      doc.line(leftMargin, headerY, rightMargin, headerY); // Bottom line
      
      // --- Report-Specific Details ---
      headerY += 8;
      doc.setFontSize(10);
      doc.setFont(undefined, 'bold');
      doc.text('Report Period:', leftMargin, headerY);
      doc.setFont(undefined, 'normal');
      doc.text(reportData.dateRange, leftMargin + 30, headerY);

      // --- Report Summary ---
      let summaryY = headerY + 10;
      doc.setFontSize(10);
      doc.setFont(undefined, 'bold');
      doc.text('Summary', leftMargin, summaryY);
      doc.setFont(undefined, 'normal');
      summaryY += 6;
      reportData.summary.forEach(item => {
        doc.text(item.label + ':', 15, summaryY);
        let valueStr;
        if (item.isCurrency) {
          valueStr = (item.value || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        } else {
          valueStr = item.value.toString();
        }
        doc.text(valueStr, rightMargin, summaryY, { align: 'right' });
        summaryY += 7;
      });
      
      // --- Main Data Table ---
      const head = [['Invoice #', 'Date', 'Customer', 'Amount (INR)', 'Status']];
      const body = [];
      for(const invoice of reportData.invoices) {
        const customer = await db.customers.get(invoice.customer_id);
        body.push([
          invoice.invoice_number,
          Utils.formatDate(invoice.date),
          customer?.name || 'N/A',
          (invoice.total_amount || 0).toLocaleString('en-IN', {minimumFractionDigits: 2, maximumFractionDigits: 2}),
          invoice.payment_status
        ]);
      }
      
      doc.autoTable({
        head: head, body: body, startY: summaryY + 5,
        theme: 'grid',
        headStyles: { fillColor: [20, 30, 40], textColor: 255 }, // Dark header for reports
        columnStyles: { 3: { halign: 'right' } },
        didDrawPage: function (data) {
          // --- Footer with Page Numbers ---
          doc.setFontSize(8);
          doc.setTextColor(100);
          const pageCount = doc.internal.getNumberOfPages();

          const dateStr = `Generated on: ${new Date().toLocaleDateString('en-IN')}`;
          doc.text(dateStr, data.settings.margin.left, pageHeight - 10);

          const pageNumStr = `Page ${data.pageNumber} of ${pageCount}`;
          doc.text(pageNumStr, rightMargin, pageHeight - 10, { align: 'right' });
        }
      });
      
      const date = new Date().toISOString().split('T')[0];
      doc.save(`Sales-Report-${date}.pdf`);

    } catch (error) {
      console.error('Failed to create report PDF:', error);
      NotificationService.error('Could not create report PDF.');
    } finally {
      LoadingService.hide();
    }
  }
}
