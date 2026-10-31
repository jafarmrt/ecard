import { EmployeeProfile } from '../types';

const DEFAULT_CATALOG = '/roya-catalog.pdf';

/**
 * The link the catalog button should open. catalogPdfUrl is the file; catalogUrl
 * is often just display text ("catalog.royaco.com" or a Persian title), so it is
 * only used when it is a real URL or path.
 */
export function resolveCatalogUrl(target?: Pick<EmployeeProfile, 'catalogPdfUrl' | 'catalogUrl'> | string): string {
  const candidates =
    typeof target === 'string' ? [target] : [target?.catalogPdfUrl, target?.catalogUrl];
  for (const raw of candidates) {
    const value = String(raw || '').trim();
    if (!value) continue;
    if (/^https?:\/\//i.test(value) || value.startsWith('/')) return value;
    if (/^[a-z0-9-]+(\.[a-z0-9-]+)+(\/\S*)?$/i.test(value)) return `https://${value}`;
  }
  return DEFAULT_CATALOG;
}

/** Downloads (same-origin PDF) or opens (external link) the product catalog. */
export function downloadCatalogPdf(target?: EmployeeProfile | string): boolean {
  const href = resolveCatalogUrl(target);
  const fileId = typeof target === 'object' && target?.id ? target.id : 'catalog';
  try {
    const link = document.createElement('a');
    link.href = href;
    const sameOriginPdf = href.startsWith('/') && /\.pdf($|\?)/i.test(href);
    if (sameOriginPdf) {
      link.download = `Roya-Catalog-${fileId}.pdf`;
    } else {
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
    }
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    return true;
  } catch (err) {
    console.error('Error opening catalog:', err);
    window.open(href, '_blank', 'noopener');
    return false;
  }
}
