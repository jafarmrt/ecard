import { EmployeeProfile } from '../types';

/**
 * Downloads or opens the official product catalog PDF
 */
export function downloadCatalogPdf(target?: EmployeeProfile | string): boolean {
  try {
    let targetPdfUrl = '/roya-catalog.pdf';
    let fileId = '2026';

    if (typeof target === 'string') {
      targetPdfUrl = target || '/roya-catalog.pdf';
    } else if (target) {
      targetPdfUrl = target.catalogPdfUrl || target.catalogUrl || '/roya-catalog.pdf';
      fileId = target.id || '2026';
    }
    
    // If it's a PDF file or local asset, trigger download
    const filename = `Roya-Surface-Center-Catalog-${fileId}.pdf`;

    // Create anchor element to force download
    const link = document.createElement('a');
    link.href = targetPdfUrl;
    link.download = filename;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    return true;
  } catch (err) {
    console.error('Error downloading catalog PDF:', err);
    try {
      const fallbackUrl = typeof target === 'string' ? target : (target?.catalogPdfUrl || target?.catalogUrl || '/roya-catalog.pdf');
      const fallbackLink = document.createElement('a');
      fallbackLink.href = fallbackUrl;
      fallbackLink.target = '_blank';
      fallbackLink.rel = 'noopener noreferrer';
      document.body.appendChild(fallbackLink);
      fallbackLink.click();
      document.body.removeChild(fallbackLink);
    } catch {
      // ignore
    }
    return false;
  }
}
