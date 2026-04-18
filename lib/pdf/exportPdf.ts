/**
 * lib/pdf/exportPdf.ts
 * Client-side PDF generation: html2canvas → jsPDF (A4 portrait).
 * Dynamic imports keep bundle weight out of the SSR path.
 */

export async function exportToPdf(element: HTMLElement, filename: string): Promise<void> {
  const [html2canvas, jsPDF] = await Promise.all([
    import('html2canvas').then(m => m.default),
    import('jspdf').then(m => m.default),
  ]);

  const canvas = await html2canvas(element, {
    scale:           2,
    useCORS:         true,
    logging:         false,
    backgroundColor: '#ffffff',
  });

  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  const pageW  = pdf.internal.pageSize.getWidth();   // 210 mm
  const pageH  = pdf.internal.pageSize.getHeight();  // 297 mm

  const canvasW = canvas.width;
  const canvasH = canvas.height;

  // Total rendered height mapped to mm (fitted to A4 width)
  const totalMm = (canvasH / canvasW) * pageW;

  if (totalMm <= pageH) {
    // Fits on a single page
    pdf.addImage(canvas.toDataURL('image/png'), 'PNG', 0, 0, pageW, totalMm);
  } else {
    // Multi-page: slice canvas vertically into page-height chunks.
    // Math.ceil avoids a sub-pixel ghost page: A4 ratio × canvasW is never
    // exactly an integer, so floor produces N×pageH < canvasH by ~1 px, which
    // causes Math.ceil(totalPages) to overshoot by 1. Ceiling the slice height
    // instead keeps totalPages = Math.ceil(canvasH / pageHeightPx) exact.
    const pageHeightPx = Math.ceil(canvasW * (pageH / pageW));
    const totalPages   = Math.ceil(canvasH / pageHeightPx);

    for (let page = 0; page < totalPages; page++) {
      if (page > 0) pdf.addPage();

      const srcY  = page * pageHeightPx;
      const srcH  = Math.min(pageHeightPx, canvasH - srcY);

      const slice = document.createElement('canvas');
      slice.width  = canvasW;
      slice.height = srcH;

      const ctx = slice.getContext('2d');
      if (ctx) ctx.drawImage(canvas, 0, srcY, canvasW, srcH, 0, 0, canvasW, srcH);

      const sliceH = (srcH / canvasW) * pageW;
      pdf.addImage(slice.toDataURL('image/png'), 'PNG', 0, 0, pageW, sliceH);
    }
  }

  pdf.save(filename);
}
