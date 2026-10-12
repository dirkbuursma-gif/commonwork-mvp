import * as pdfjs from 'pdfjs-dist';
import pdfjsWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

const MAX_EXTRACTED_CHARACTERS = 50_000;
const MAX_PDF_PAGES = 10;

pdfjs.GlobalWorkerOptions.workerSrc = pdfjsWorkerUrl;

export type PdfExtractionFailure =
  | 'too-many-pages'
  | 'too-many-characters'
  | 'no-searchable-text'
  | 'password-protected'
  | 'unreadable';

export type PdfExtractionResult =
  | { ok: true; text: string }
  | { ok: false; reason: PdfExtractionFailure };

export async function extractPdfText(bytes: ArrayBuffer, signal: AbortSignal): Promise<PdfExtractionResult> {
  const loadingTask = pdfjs.getDocument({
    data: new Uint8Array(bytes),
    disableAutoFetch: true,
    disableStream: true,
    isEvalSupported: false,
    useSystemFonts: false,
  });
  const cancel = () => {
    void loadingTask.destroy();
  };
  signal.addEventListener('abort', cancel, { once: true });

  let document: Awaited<typeof loadingTask.promise> | null = null;
  try {
    document = await loadingTask.promise;
    if (signal.aborted) throw new DOMException('PDF extraction was cancelled.', 'AbortError');
    if (document.numPages > MAX_PDF_PAGES) return { ok: false, reason: 'too-many-pages' };

    const pages: string[] = [];
    let characterCount = 0;
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      if (signal.aborted) throw new DOMException('PDF extraction was cancelled.', 'AbortError');
      const page = await document.getPage(pageNumber);
      const content = await page.getTextContent();
      const pageText = content.items
        .flatMap((item) => 'str' in item ? [item.str] : [])
        .join(' ');
      characterCount += pageText.length;
      if (characterCount > MAX_EXTRACTED_CHARACTERS) return { ok: false, reason: 'too-many-characters' };
      pages.push(pageText);
      page.cleanup();
    }

    const text = pages.join('\n').trim();
    return text
      ? { ok: true, text }
      : { ok: false, reason: 'no-searchable-text' };
  } catch (error) {
    if (signal.aborted) throw error;
    return {
      ok: false,
      reason:
        typeof error === 'object' &&
        error !== null &&
        'name' in error &&
        error.name === 'PasswordException'
          ? 'password-protected'
          : 'unreadable',
    };
  } finally {
    signal.removeEventListener('abort', cancel);
    if (document) await document.destroy();
    else await loadingTask.destroy();
  }
}
