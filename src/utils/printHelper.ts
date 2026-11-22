/**
 * DokanPro High-Precision Cross-Browser Print Helper
 * 
 * Works seamlessly in all modern browsers, desktop & mobile,
 * as well as inside sandboxed iframes (e.g. AI Studio development environment).
 */

export interface PrintOptions {
  documentTitle?: string;
  isThermal80mm?: boolean;
  isLandscape?: boolean;
  onBeforePrint?: () => void;
  onAfterPrint?: () => void;
}

export function printElement(
  element: HTMLElement | null,
  options: PrintOptions = {}
): boolean {
  if (!element) {
    // Fallback if element not found: standard window print
    window.focus();
    window.print();
    return true;
  }

  const { documentTitle = 'DokanPro Document', isThermal80mm = false, isLandscape = false } = options;

  try {
    // 1. Check if an isolated iframe already exists, else create one
    const frameId = '__dokanpro_isolated_print_frame__';
    let printFrame = document.getElementById(frameId) as HTMLIFrameElement | null;

    if (printFrame) {
      document.body.removeChild(printFrame);
    }

    printFrame = document.createElement('iframe');
    printFrame.id = frameId;
    printFrame.name = frameId;
    printFrame.style.position = 'fixed';
    printFrame.style.top = '-10000px';
    printFrame.style.left = '-10000px';
    printFrame.style.width = isLandscape ? '1123px' : '794px';
    printFrame.style.height = '1000px';
    printFrame.style.border = 'none';
    printFrame.style.zIndex = '-9999';
    printFrame.style.visibility = 'hidden';
    printFrame.setAttribute('aria-hidden', 'true');

    document.body.appendChild(printFrame);

    const frameDoc = printFrame.contentDocument || printFrame.contentWindow?.document;
    if (!frameDoc) {
      throw new Error('Unable to access print frame document');
    }

    // 2. Collect all styles & stylesheets from the main document
    const headStyles: string[] = [];

    // Copy <link rel="stylesheet">
    const linkTags = document.querySelectorAll('link[rel="stylesheet"]');
    linkTags.forEach(link => {
      headStyles.push(link.outerHTML);
    });

    // Copy <style> tags (Tailwind CSS, fonts, etc.)
    const styleTags = document.querySelectorAll('style');
    styleTags.forEach(style => {
      headStyles.push(style.outerHTML);
    });

    // Specific print sizing and page rules
    const printPageRule = isThermal80mm
      ? `
        @page {
          size: 80mm auto;
          margin: 0;
        }
        body {
          width: 80mm !important;
          max-width: 80mm !important;
          margin: 0 auto !important;
          padding: 3mm !important;
          font-size: 11px !important;
        }
        .printable-receipt {
          width: 100% !important;
          max-width: 100% !important;
          box-shadow: none !important;
          border: none !important;
          padding: 0 !important;
        }
      `
      : `
        @page {
          size: ${isLandscape ? 'A4 landscape' : 'A4 portrait'};
          margin: 8mm 8mm;
        }
        body {
          width: 100% !important;
          margin: 0 !important;
          padding: 0 !important;
          font-size: 12px !important;
        }
        .print-container,
        .printable-document-container,
        .printable-report {
          display: block !important;
          width: 100% !important;
          max-width: 100% !important;
          height: auto !important;
          min-height: 0 !important;
          max-height: none !important;
          overflow: visible !important;
          box-shadow: none !important;
          border: none !important;
          margin: 0 !important;
          padding: 0 !important;
          position: static !important;
          break-inside: auto !important;
          page-break-inside: auto !important;
        }
        .printable-invoice, .printable-voucher, .printable-statement {
          width: 100% !important;
          max-width: 100% !important;
          height: auto !important;
          min-height: 0 !important;
          max-height: none !important;
          overflow: visible !important;
          box-shadow: none !important;
          border: none !important;
          padding: 0 !important;
          break-inside: auto !important;
          page-break-inside: auto !important;
        }
      `;

    const printResetStyles = `
      <style>
        *, *::before, *::after {
          box-sizing: border-box !important;
          -webkit-print-color-adjust: exact !important;
          print-color-adjust: exact !important;
        }
        html, body {
          background: #ffffff !important;
          color: #000000 !important;
          display: block !important;
          height: auto !important;
          min-height: 0 !important;
          max-height: none !important;
          overflow: visible !important;
          font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
        }
        table {
          width: 100% !important;
          border-collapse: collapse !important;
          break-inside: auto !important;
          page-break-inside: auto !important;
        }
        thead {
          display: table-header-group !important;
        }
        tbody {
          display: table-row-group !important;
        }
        tfoot {
          display: table-row-group !important;
        }
        tr {
          break-inside: avoid !important;
          page-break-inside: avoid !important;
          break-after: auto !important;
          page-break-after: auto !important;
        }
        td, th {
          break-inside: avoid !important;
          page-break-inside: avoid !important;
        }
        .no-print, button, input, select {
          display: none !important;
        }
        
        /* Force light-mode colors inside print iframe to resolve dark-mode black box variables */
        body, html, .print-container, [class*="bg-zinc-50"], [class*="bg-zinc-100"], [class*="bg-zinc-200"] {
          --color-zinc-50: #fafafa !important;
          --color-zinc-100: #f4f4f5 !important;
          --color-zinc-200: #e4e4e7 !important;
          --color-zinc-300: #d4d4d8 !important;
          --color-zinc-400: #a1a1aa !important;
          --color-zinc-500: #71717a !important;
          --color-zinc-600: #52525b !important;
          --color-zinc-700: #3f3f46 !important;
          --color-zinc-800: #27272a !important;
          --color-zinc-900: #18181b !important;
        }

        .bg-zinc-50, [class*="bg-zinc-50"] { background-color: #fafafa !important; }
        .bg-zinc-100, [class*="bg-zinc-100"] { background-color: #f4f4f5 !important; }
        .bg-zinc-200, [class*="bg-zinc-200"] { background-color: #e4e4e7 !important; }
        .bg-zinc-300, [class*="bg-zinc-300"] { background-color: #d4d4d8 !important; }
        .bg-slate-50, [class*="bg-slate-50"] { background-color: #f8fafc !important; }
        .bg-slate-100, [class*="bg-slate-100"] { background-color: #f1f5f9 !important; }
        .text-zinc-500 { color: #71717a !important; }
        .text-zinc-600 { color: #52525b !important; }
        .text-zinc-700 { color: #3f3f46 !important; }
        .text-zinc-800 { color: #27272a !important; }
        .text-zinc-900 { color: #18181b !important; }
        .border-zinc-200 { border-color: #e4e4e7 !important; }
        .border-zinc-300 { border-color: #d4d4d8 !important; }

        ${printPageRule}

        @media print {
          html, body {
            display: block !important;
            height: auto !important;
            min-height: 0 !important;
            max-height: none !important;
            overflow: visible !important;
          }
          ${printPageRule}
          thead { display: table-header-group !important; }
          tbody { display: table-row-group !important; }
          tfoot { display: table-row-group !important; }
          tr {
            break-inside: avoid !important;
            page-break-inside: avoid !important;
          }
        }
      </style>
    `;

    // 3. Clone printable element content
    const contentHtml = element.outerHTML;

    // 4. Construct printable document
    const fullHtml = `
      <!DOCTYPE html>
      <html lang="en">
        <head>
          <meta charset="utf-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1.0" />
          <title>${documentTitle}</title>
          ${headStyles.join('\n')}
          ${printResetStyles}
        </head>
        <body>
          <div class="print-container">
            ${contentHtml}
          </div>
        </body>
      </html>
    `;

    frameDoc.open();
    frameDoc.write(fullHtml);
    frameDoc.close();

    // 5. Trigger Print after assets, images & layout have settled
    const printWindow = printFrame.contentWindow;
    if (!printWindow) {
      throw new Error('Print frame window not available');
    }

    let printed = false;
    const triggerPrint = () => {
      if (printed) return;
      printed = true;
      try {
        if (options.onBeforePrint) options.onBeforePrint();
        printWindow.focus();
        printWindow.print();
        if (options.onAfterPrint) options.onAfterPrint();
      } catch (err) {
        console.warn('Iframe print error, falling back to window.print():', err);
        window.focus();
        window.print();
      }
    };

    const images = Array.from(frameDoc.querySelectorAll('img')).filter(img => !img.complete);
    if (images.length === 0) {
      setTimeout(() => {
        printWindow.requestAnimationFrame(() => triggerPrint());
      }, 200);
    } else {
      let remaining = images.length;
      const onImgDone = () => {
        remaining -= 1;
        if (remaining <= 0) {
          printWindow.requestAnimationFrame(() => triggerPrint());
        }
      };
      images.forEach(img => {
        img.addEventListener('load', onImgDone, { once: true });
        img.addEventListener('error', onImgDone, { once: true });
      });
      // Safety fallback so print always triggers even if an image stalls
      setTimeout(triggerPrint, 600);
    }

    return true;
  } catch (error) {
    console.warn('Isolated frame printing failed, using direct window.print fallback:', error);
    window.focus();
    window.print();
    return true;
  }
}
