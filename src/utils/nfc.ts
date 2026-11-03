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
const WRITE_TIMEOUT_MS = 60_000;

export async function writeUrlToNfc(
  url: string,
  onStatusUpdate?: (status: string) => void,
  signal?: AbortSignal
): Promise<NfcWriteResult> {
  if (!isWebNfcSupported()) {
    return {
      success: false,
      message: 'مرورگر شما از Web NFC پشتیبانی نمی‌کند. لطفاً از مرورگر کروم روی گوشی اندروید یا اپلیکیشن‌های NFC Tools استفاده کنید.',
    };
  }

  // Stops waiting for a tag after a minute, or when the user presses "cancel" (signal).
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, WRITE_TIMEOUT_MS);
  const onCancel = () => controller.abort();
  if (signal?.aborted) controller.abort();
  signal?.addEventListener('abort', onCancel);

  try {
    // @ts-expect-error NDEFReader is not in standard DOM lib yet
    const ndef = new window.NDEFReader();
    onStatusUpdate?.('لطفاً کارت NFC را به پشت گوشی خود نزدیک کنید...');

    await ndef.write(
      {
        records: [
          {
            recordType: 'url',
            data: url,
          },
        ],
      },
      { signal: controller.signal }
    );

    return {
      success: true,
      message: 'لینک کارت ویزیت هوشمند با موفقیت روی تگ NFC نوشته شد!',
    };
  } catch (error) {
    const err = error as Error;
    if (controller.signal.aborted || err?.name === 'AbortError') {
      return {
        success: false,
        message: timedOut
          ? 'در یک دقیقه کارتی نزدیک نشد. دوباره روی دکمه رایت بزنید و کارت را به پشت گوشی بچسبانید.'
          : 'رایت لغو شد. چیزی روی کارت نوشته نشد.',
        error: 'aborted',
      };
    }
    if (err?.name === 'NotAllowedError') {
      return {
        success: false,
        message: 'اجازه دسترسی به NFC داده نشد. NFC گوشی را روشن کنید و در پیام مرورگر «اجازه» را بزنید.',
        error: err.message,
      };
    }
    console.error('NFC Write Error:', err);
    return {
      success: false,
      message: 'خطا در نوشتن روی کارت NFC: ' + (err.message || 'عملیات لغو شد'),
      error: err.message,
    };
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onCancel);
  }
}
