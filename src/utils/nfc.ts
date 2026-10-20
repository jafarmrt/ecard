export interface NfcWriteResult {
  success: boolean;
  message: string;
  error?: string;
}

export function isWebNfcSupported(): boolean {
  return typeof window !== 'undefined' && 'NDEFReader' in window;
}

/**
 * Write URL to physical NFC tag via Web NFC API
 */
export async function writeUrlToNfc(url: string, onStatusUpdate?: (status: string) => void): Promise<NfcWriteResult> {
  if (!isWebNfcSupported()) {
    return {
      success: false,
      message: 'مرورگر شما از Web NFC پشتیبانی نمی‌کند. لطفاً از مرورگر کروم روی گوشی اندروید یا اپلیکیشن‌های NFC Tools استفاده کنید.',
    };
  }

  try {
    // @ts-expect-error NDEFReader is not in standard DOM lib yet
    const ndef = new window.NDEFReader();
    onStatusUpdate?.('لطفاً کارت NFC را به پشت گوشی خود نزدیک کنید...');
    
    await ndef.write({
      records: [
        {
          recordType: 'url',
          data: url,
        },
      ],
    });

    return {
      success: true,
      message: 'لینک کارت ویزیت هوشمند با موفقیت روی تگ NFC نوشته شد!',
    };
  } catch (error) {
    const err = error as Error;
    console.error('NFC Write Error:', err);
    return {
      success: false,
      message: 'خطا در نوشتن روی کارت NFC: ' + (err.message || 'عملیات لغو شد'),
      error: err.message,
    };
  }
}
