/**
 * Universal Clipboard Copy Utility
 * Works seamlessly in Secure (HTTPS / localhost) and Insecure (HTTP / IP:PORT) contexts.
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  if (!text) return false;

  // 1. Try modern Navigator Clipboard API if available in a Secure Context
  if (typeof window !== 'undefined' && window.isSecureContext && navigator?.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (err) {
      console.warn('Modern Clipboard API failed, falling back to execCommand:', err);
    }
  }

  // 2. Universal Fallback: Hidden Textarea with document.execCommand('copy')
  // This works across HTTP, IP addresses, older mobile browsers, and embedded WebViews.
  try {
    const textArea = document.createElement('textarea');
    textArea.value = text;
    
    // Prevent scrolling and keep invisible
    textArea.style.position = 'fixed';
    textArea.style.left = '-999999px';
    textArea.style.top = '-999999px';
    textArea.setAttribute('readonly', '');
    textArea.style.opacity = '0';
    
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    
    // Support for iOS selection
    if (navigator.userAgent.match(/ipad|ipod|iphone/i)) {
      const range = document.createRange();
      range.selectNodeContents(textArea);
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(range);
      textArea.setSelectionRange(0, 999999);
    }
    
    const successful = document.execCommand('copy');
    document.body.removeChild(textArea);
    
    if (successful) {
      return true;
    }
  } catch (fallbackErr) {
    console.error('Universal execCommand copy fallback failed:', fallbackErr);
  }

  return false;
}
