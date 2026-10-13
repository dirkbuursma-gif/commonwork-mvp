import mammoth from 'mammoth';

const MAX_EXTRACTED_CHARACTERS = 50_000;
const MAX_DOCX_UNCOMPRESSED_BYTES = 20 * 1024 * 1024;
const MAX_DOCX_ENTRIES = 256;

interface ExtractionRequest {
  type: 'extract';
  bytes: ArrayBuffer;
}

function inspectDocxArchive(bytes: ArrayBuffer): 'ok' | 'password-protected' | 'unreadable' {
  const data = new DataView(bytes);
  const minimumEndRecordOffset = Math.max(0, data.byteLength - 22 - 65_535);
  let endRecordOffset = -1;

  for (let offset = data.byteLength - 22; offset >= minimumEndRecordOffset; offset -= 1) {
    if (data.getUint32(offset, true) === 0x06054b50) {
      endRecordOffset = offset;
      break;
    }
  }
  if (endRecordOffset < 0 || endRecordOffset + 22 > data.byteLength) return 'unreadable';

  const diskNumber = data.getUint16(endRecordOffset + 4, true);
  const centralDisk = data.getUint16(endRecordOffset + 6, true);
  const entriesOnDisk = data.getUint16(endRecordOffset + 8, true);
  const entryCount = data.getUint16(endRecordOffset + 10, true);
  const centralDirectorySize = data.getUint32(endRecordOffset + 12, true);
  const centralDirectoryOffset = data.getUint32(endRecordOffset + 16, true);

  if (
    diskNumber !== 0 ||
    centralDisk !== 0 ||
    entriesOnDisk !== entryCount ||
    entryCount === 0xffff ||
    centralDirectorySize === 0xffffffff ||
    centralDirectoryOffset === 0xffffffff ||
    entryCount > MAX_DOCX_ENTRIES ||
    centralDirectoryOffset + centralDirectorySize > endRecordOffset
  ) {
    return 'unreadable';
  }

  let offset = centralDirectoryOffset;
  let totalUncompressedBytes = 0;
  for (let entry = 0; entry < entryCount; entry += 1) {
    if (offset + 46 > data.byteLength || data.getUint32(offset, true) !== 0x02014b50) return 'unreadable';

    const flags = data.getUint16(offset + 8, true);
    const compressedSize = data.getUint32(offset + 20, true);
    const uncompressedSize = data.getUint32(offset + 24, true);
    const nameLength = data.getUint16(offset + 28, true);
    const extraLength = data.getUint16(offset + 30, true);
    const commentLength = data.getUint16(offset + 32, true);

    if ((flags & 1) !== 0) return 'password-protected';
    if (uncompressedSize === 0xffffffff || compressedSize === 0xffffffff) return 'unreadable';
    if (uncompressedSize > Math.max(compressedSize, 1) * 100) return 'unreadable';

    totalUncompressedBytes += uncompressedSize;
    if (totalUncompressedBytes > MAX_DOCX_UNCOMPRESSED_BYTES) return 'unreadable';

    offset += 46 + nameLength + extraLength + commentLength;
    if (offset > centralDirectoryOffset + centralDirectorySize) return 'unreadable';
  }

  return offset === centralDirectoryOffset + centralDirectorySize ? 'ok' : 'unreadable';
}

self.postMessage({ type: 'ready' });

self.addEventListener('message', async (event: MessageEvent<ExtractionRequest>) => {
  if (event.data.type !== 'extract') return;
  const { bytes } = event.data;

  try {
    const archiveStatus = inspectDocxArchive(bytes);
    if (archiveStatus !== 'ok') {
      self.postMessage({ type: 'result', ok: false, reason: archiveStatus });
      return;
    }

    self.postMessage({ type: 'progress', phase: 'extracting' });
    const result = await mammoth.extractRawText({ arrayBuffer: bytes });
    if (result.value.length > MAX_EXTRACTED_CHARACTERS) {
      self.postMessage({ type: 'result', ok: false, reason: 'too-many-characters' });
      return;
    }
    if (!result.value.trim()) {
      self.postMessage({ type: 'result', ok: false, reason: 'no-searchable-text' });
      return;
    }
    self.postMessage({ type: 'result', ok: true, text: result.value });
  } catch (error) {
    if (
      typeof error === 'object' &&
      error !== null &&
      'name' in error &&
      error.name === 'PasswordException'
    ) {
      self.postMessage({ type: 'result', ok: false, reason: 'password-protected' });
      return;
    }
    self.postMessage({ type: 'result', ok: false, reason: 'unreadable' });
  }
});
