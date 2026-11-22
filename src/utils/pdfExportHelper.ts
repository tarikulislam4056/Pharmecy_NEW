import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

const colorCache = new Map<string, string>();

function resolveCssColor(colorStr: string): string {
  if (!colorStr) return '#000000';
  if (colorCache.has(colorStr)) return colorCache.get(colorStr)!;

  let resolved = '#000000';
  try {
    const canvas = document.createElement('canvas');
    canvas.width = 1;
    canvas.height = 1;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.fillStyle = '#000000';
      ctx.fillStyle = colorStr;
      ctx.fillRect(0, 0, 1, 1);
      const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
      if (a === 0) {
        resolved = 'transparent';
      } else if (a === 255) {
        resolved = `rgb(${r}, ${g}, ${b})`;
      } else {
        resolved = `rgba(${r}, ${g}, ${b}, ${(a / 255).toFixed(2)})`;
      }
    }
  } catch (e) {
    resolved = '#000000';
  }

  colorCache.set(colorStr, resolved);
  return resolved;
}

function cleanUnsupportedColors(cssText: string): string {
  if (!cssText) return cssText;
  return cssText.replace(/(oklch|oklab|lch|lab|color-mix)\([^\)]*(?:\([^\)]*\)[^\)]*)*\)/gi, (match) => {
    return resolveCssColor(match);
  });
}

export async function exportElementToPdf(
  element: HTMLElement | null,
  fileName: string = 'document.pdf',
  isLandscape: boolean = false
): Promise<boolean> {
  if (!element) {
    window.print();
    return true;
  }

  // Find the true document child node if wrapped
  const targetElement = (element.querySelector('.printable-receipt') ||
    element.querySelector('.printable-invoice-a4') ||
    element.querySelector('.printable-invoice') ||
    element.querySelector('.printable-voucher') ||
    element.querySelector('.printable-report') ||
    element.querySelector('.printable-barcodes') ||
    element.querySelector('.printable-document') ||
    element.firstElementChild ||
    element) as HTMLElement;

  try {
    const isThermal =
      targetElement.classList.contains('printable-receipt') ||
      targetElement.offsetWidth <= 420;

    const isReport = targetElement.classList.contains('printable-report');
    const estimatedHeight = Math.max(targetElement.scrollHeight || 1000, 1000);
    // Keep canvas safely within browser height limits (~14,500px) so large lists never truncate
    const safeScale = isThermal
      ? 2.5
      : Math.min(2.2, Math.max(0.5, Number((14500 / estimatedHeight).toFixed(2))));

    interface MeasuredTablePagination {
      clonedHeight: number;
      tableTop: number;
      tableBottom: number;
      theadTop: number;
      theadHeight: number;
      rowBottoms: number[];
    }
    let measuredTable: MeasuredTablePagination | null = null;

    const canvas = await html2canvas(targetElement, {
      scale: safeScale,
      useCORS: true,
      allowTaint: true,
      logging: false,
      backgroundColor: '#ffffff',
      windowWidth: isThermal ? 400 : (isLandscape ? 1200 : 900),
      windowHeight: estimatedHeight + 400,
      scrollX: 0,
      scrollY: 0,
      onclone: (clonedDoc, clonedEl) => {
        // Remove dark mode class from html, body, and cloned element hierarchy to force pure light-mode rendering
        if (clonedDoc.documentElement) {
          clonedDoc.documentElement.classList.remove('dark');
        }
        if (clonedDoc.body) {
          clonedDoc.body.classList.remove('dark');
        }
        let current: HTMLElement | null = clonedEl;
        while (current) {
          current.classList.remove('dark');
          current = current.parentElement;
        }

        // 1. Sanitize all <style> tags in the cloned document for html2canvas parser
        const styleTags = clonedDoc.querySelectorAll('style');
        styleTags.forEach((styleTag) => {
          if (styleTag.textContent) {
            styleTag.textContent = cleanUnsupportedColors(styleTag.textContent);
          }
        });

        // 2. Sanitize all inline styles across all cloned elements
        const allElements = clonedDoc.querySelectorAll('*');
        allElements.forEach((el) => {
          const htmlEl = el as HTMLElement;
          if (htmlEl.getAttribute && htmlEl.getAttribute('style')) {
            const currentStyle = htmlEl.getAttribute('style') || '';
            if (/(oklch|oklab|lch|lab|color-mix)/i.test(currentStyle)) {
              htmlEl.setAttribute('style', cleanUnsupportedColors(currentStyle));
            }
          }
        });

        // 3. Clean up any broken or hidden images
        const imgElements = clonedDoc.querySelectorAll('img');
        imgElements.forEach((img) => {
          const htmlImg = img as HTMLImageElement;
          if (!htmlImg.src || htmlImg.src.trim() === '' || htmlImg.style.display === 'none' || htmlImg.classList.contains('hidden')) {
            htmlImg.style.display = 'none';
          }
        });

        // 4. Force solid white background, block layout, and exact A4 width on clone
        if (clonedEl) {
          clonedEl.style.backgroundColor = '#ffffff';
          clonedEl.style.color = '#000000';
          clonedEl.style.margin = '0 auto';
          clonedEl.style.boxShadow = 'none';
          clonedEl.style.border = 'none';
          clonedEl.style.height = 'auto';
          clonedEl.style.minHeight = '0px';
          clonedEl.style.maxHeight = 'none';
          clonedEl.style.overflow = 'visible';
          if (isReport) {
            clonedEl.style.display = 'block';
            clonedEl.style.padding = '8px 12px';
          }
          if (!isThermal) {
            const targetW = isLandscape ? '1123px' : '794px';
            clonedEl.style.width = targetW;
            clonedEl.style.minWidth = targetW;
            clonedEl.style.maxWidth = targetW;
          }

          // 5. Measure table row boundaries for clean row-aligned multi-page pagination
          if (!isThermal) {
            const rootRect = clonedEl.getBoundingClientRect();
            const tables = Array.from(clonedEl.querySelectorAll('table'));
            let primaryTable: HTMLTableElement | null = null;
            let maxRows = 0;
            tables.forEach((tbl) => {
              const count = tbl.querySelectorAll('tbody tr').length;
              if (count > maxRows) {
                maxRows = count;
                primaryTable = tbl;
              }
            });

            if (primaryTable && maxRows > 0 && rootRect.height > 0) {
              const tblRect = (primaryTable as HTMLTableElement).getBoundingClientRect();
              const theadEl = (primaryTable as HTMLTableElement).querySelector('thead');
              const theadRect = theadEl ? theadEl.getBoundingClientRect() : null;
              const rows = Array.from(
                (primaryTable as HTMLTableElement).querySelectorAll('tbody tr, tfoot tr')
              );
              const rowBottoms = rows
                .map((row) => Math.round(row.getBoundingClientRect().bottom - rootRect.top))
                .filter((y) => y > 0)
                .sort((a, b) => a - b);

              measuredTable = {
                clonedHeight: rootRect.height,
                tableTop: Math.max(0, tblRect.top - rootRect.top),
                tableBottom: Math.max(0, tblRect.bottom - rootRect.top),
                theadTop: theadRect ? Math.max(0, theadRect.top - rootRect.top) : 0,
                theadHeight: theadRect ? Math.max(0, theadRect.height) : 0,
                rowBottoms,
              };
            }
          }
        }
      },
    });

    if (isThermal) {
      // 80mm thermal receipt sizing
      const imgData = canvas.toDataURL('image/png', 1.0);
      const pdfWidth = 80;
      const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: [pdfWidth, Math.max(pdfHeight, 60)],
      });

      pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight, undefined, 'FAST');
      pdf.save(fileName);
      return true;
    }

    // Standard A4 PDF generation with clean margins and row-boundary-aware pagination
    const pdf = new jsPDF(isLandscape ? 'l' : 'p', 'mm', 'a4');
    const pdfWidth = pdf.internal.pageSize.getWidth(); // 210mm or 297mm
    const pdfPageHeight = pdf.internal.pageSize.getHeight(); // 297mm or 210mm
    const marginMm = 6;
    const usableWidthMm = pdfWidth - marginMm * 2;
    const usableHeightMm = pdfPageHeight - marginMm * 2;
    const canvasPxPerMm = canvas.width / usableWidthMm;
    const maxPageCanvasPx = Math.floor(usableHeightMm * canvasPxPerMm);

    const cropSliceToDataUrl = (startY: number, sliceHeight: number): string => {
      const safeStart = Math.max(0, Math.min(canvas.height - 1, Math.floor(startY)));
      const safeHeight = Math.max(1, Math.min(canvas.height - safeStart, Math.ceil(sliceHeight)));
      const sliceCanvas = document.createElement('canvas');
      sliceCanvas.width = canvas.width;
      sliceCanvas.height = safeHeight;
      const ctx = sliceCanvas.getContext('2d');
      if (ctx) {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, sliceCanvas.width, sliceCanvas.height);
        ctx.drawImage(
          canvas,
          0,
          safeStart,
          canvas.width,
          safeHeight,
          0,
          0,
          canvas.width,
          safeHeight
        );
      }
      return sliceCanvas.toDataURL('image/png', 1.0);
    };

    if (canvas.height <= maxPageCanvasPx + 4) {
      // Single page document
      const imgData = canvas.toDataURL('image/png', 1.0);
      const renderedHeightMm = canvas.height / canvasPxPerMm;
      pdf.addImage(imgData, 'PNG', marginMm, marginMm, usableWidthMm, renderedHeightMm, undefined, 'FAST');
    } else {
      // Multi-page document: fill page 1 completely up to last fitting row, then continue cleanly on next pages
      const pxToCanvasY =
        measuredTable && measuredTable.clonedHeight > 0
          ? canvas.height / measuredTable.clonedHeight
          : safeScale;

      const rowBottomsCanvas = measuredTable
        ? Array.from(new Set(measuredTable.rowBottoms.map((y) => Math.round(y * pxToCanvasY))))
            .filter((y) => y > 0 && y <= canvas.height)
            .sort((a, b) => a - b)
        : [];

      const theadTopCanvas = measuredTable ? Math.round(measuredTable.theadTop * pxToCanvasY) : 0;
      const theadHeightCanvas = measuredTable ? Math.round(measuredTable.theadHeight * pxToCanvasY) : 0;
      const tableTopCanvas = measuredTable ? Math.round(measuredTable.tableTop * pxToCanvasY) : 0;
      const tableBottomCanvas = measuredTable ? Math.round(measuredTable.tableBottom * pxToCanvasY) : 0;

      const canRepeatThead =
        Boolean(measuredTable) &&
        theadHeightCanvas > 4 &&
        theadHeightCanvas < maxPageCanvasPx * 0.25;

      const theadImgData = canRepeatThead
        ? cropSliceToDataUrl(theadTopCanvas, theadHeightCanvas)
        : null;
      const theadHeightMm = theadHeightCanvas / canvasPxPerMm;

      let currentY = 0;
      let pageIndex = 0;

      while (currentY < canvas.height - 2) {
        if (pageIndex > 0) {
          pdf.addPage();
        }

        let cursorMmY = marginMm;
        let availableCanvasPx = maxPageCanvasPx;

        const shouldRepeatHeader =
          pageIndex > 0 &&
          Boolean(theadImgData) &&
          currentY >= tableTopCanvas + theadHeightCanvas &&
          currentY < tableBottomCanvas - 4;

        if (shouldRepeatHeader && theadImgData) {
          pdf.addImage(
            theadImgData,
            'PNG',
            marginMm,
            cursorMmY,
            usableWidthMm,
            theadHeightMm,
            undefined,
            'FAST'
          );
          cursorMmY += theadHeightMm;
          availableCanvasPx = Math.max(100, availableCanvasPx - theadHeightCanvas);
        }

        const idealMaxY = Math.min(canvas.height, currentY + availableCanvasPx);
        let nextY = idealMaxY;

        if (idealMaxY < canvas.height && rowBottomsCanvas.length > 0) {
          // Pick the deepest row boundary that fits completely within this page
          let bestRowEnd = -1;
          for (let i = 0; i < rowBottomsCanvas.length; i++) {
            const candidate = rowBottomsCanvas[i];
            if (candidate > currentY + 4 && candidate <= idealMaxY) {
              bestRowEnd = candidate;
            } else if (candidate > idealMaxY) {
              break;
            }
          }
          if (bestRowEnd > currentY) {
            nextY = bestRowEnd;
          }
        }

        const sliceHeight = Math.max(1, nextY - currentY);
        const sliceDataUrl = cropSliceToDataUrl(currentY, sliceHeight);
        const sliceHeightMm = sliceHeight / canvasPxPerMm;

        pdf.addImage(
          sliceDataUrl,
          'PNG',
          marginMm,
          cursorMmY,
          usableWidthMm,
          sliceHeightMm,
          undefined,
          'FAST'
        );

        currentY = nextY;
        pageIndex += 1;

        // Hard safety guard against infinite loops
        if (pageIndex > 500) break;
      }
    }

    pdf.save(fileName);
    return true;
  } catch (error) {
    console.error('PDF export error:', error);
    window.print();
    return false;
  }
}

