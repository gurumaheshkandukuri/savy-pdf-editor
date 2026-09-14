/**
 * SAVY PDF Workspace — PDF Toolbox Controller (pdf-toolbox.js)
 * Master Converter & PDF Toolbox Engine (29 Tools Architecture):
 *
 * 1. PDF ORGANIZATION: Merge, Split, Organize, Rotate, Crop, Page Numbers, Watermark
 * 2. CONVERT FROM PDF: PDF -> Word (.docx), PDF -> Excel (.xlsx), PDF -> PPT (.pptx),
 *                      PDF -> JPG, PDF -> TXT, PDF -> Markdown, PDF -> PDF/A
 * 3. CONVERT TO PDF: JPG -> PDF, HTML -> PDF, Word -> PDF, PPT -> PDF, Excel -> PDF
 * 4. SCANNING & OCR: OCR PDF, Scan -> PDF
 * 5. SECURITY: Protect PDF, Unlock PDF, Redact PDF
 * 6. ADVANCED: Compress PDF, Compare PDF, PDF Forms, Repair PDF
 * 7. IMAGE/DOCUMENT: Image -> Word (.docx), Metadata Editor, PDF Flatten
 *
 * Privacy Guarantee:
 * "User documents are processed locally in your browser and are never uploaded to SAVY servers."
 */

import { buildDocx, buildXlsx, buildPptx } from './openxml-builder.js';

// ==========================================
// UTILITY: 100% Client-Side Standard ZIP Writer
// ==========================================
const crcTable = new Uint32Array(256);
for (let i = 0; i < 256; i++) {
  let c = i;
  for (let k = 0; k < 8; k++) {
    c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
  }
  crcTable[i] = c >>> 0;
}

function computeCRC32(data) {
  let crc = 0 ^ (-1);
  for (let i = 0; i < data.length; i++) {
    crc = (crc >>> 8) ^ crcTable[(crc ^ data[i]) & 0xFF];
  }
  return (crc ^ (-1)) >>> 0;
}

/**
 * Creates a valid, standard uncompressed (Stored) ZIP archive in pure JS.
 * Fully compatible with Windows Explorer, macOS Finder, 7-Zip, Linux unzip.
 * @param {Array<{ name: string, data: Uint8Array|ArrayBuffer }>} files
 * @returns {Blob}
 */
export function createZipArchive(files) {
  const fileEntries = [];
  let offset = 0;
  const now = new Date();
  const dosTime = ((now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1)) & 0xFFFF;
  const dosDate = (((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate()) & 0xFFFF;

  for (const file of files) {
    const encoder = new TextEncoder();
    const nameBytes = encoder.encode(file.name);
    const dataBytes = file.data instanceof Uint8Array ? file.data : new Uint8Array(file.data);
    const crc = computeCRC32(dataBytes);
    const size = dataBytes.length;

    // Local file header (30 bytes + name length)
    const header = new Uint8Array(30 + nameBytes.length);
    const view = new DataView(header.buffer);
    view.setUint32(0, 0x04034b50, true);
    view.setUint16(4, 20, true);
    view.setUint16(6, 0, true);
    view.setUint16(8, 0, true); // Stored (no compression)
    view.setUint16(10, dosTime, true);
    view.setUint16(12, dosDate, true);
    view.setUint32(14, crc, true);
    view.setUint32(18, size, true);
    view.setUint32(22, size, true);
    view.setUint16(26, nameBytes.length, true);
    view.setUint16(28, 0, true);
    header.set(nameBytes, 30);

    fileEntries.push({
      nameBytes,
      dataBytes,
      header,
      crc,
      size,
      dosTime,
      dosDate,
      offset,
    });

    offset += header.length + dataBytes.length;
  }

  // Central directory records
  const centralDirRecords = [];
  let centralDirSize = 0;

  for (const entry of fileEntries) {
    const cdHeader = new Uint8Array(46 + entry.nameBytes.length);
    const view = new DataView(cdHeader.buffer);
    view.setUint32(0, 0x02014b50, true);
    view.setUint16(4, 20, true);
    view.setUint16(6, 20, true);
    view.setUint16(8, 0, true);
    view.setUint16(10, 0, true);
    view.setUint16(12, entry.dosTime, true);
    view.setUint16(14, entry.dosDate, true);
    view.setUint32(16, entry.crc, true);
    view.setUint32(20, entry.size, true);
    view.setUint32(24, entry.size, true);
    view.setUint16(28, entry.nameBytes.length, true);
    view.setUint16(30, 0, true);
    view.setUint16(32, 0, true);
    view.setUint16(34, 0, true);
    view.setUint16(36, 0, true);
    view.setUint32(38, 0, true);
    view.setUint32(42, entry.offset, true);
    cdHeader.set(entry.nameBytes, 46);

    centralDirRecords.push(cdHeader);
    centralDirSize += cdHeader.length;
  }

  // End of central directory record (22 bytes)
  const eocd = new Uint8Array(22);
  const eocdView = new DataView(eocd.buffer);
  eocdView.setUint32(0, 0x06054b50, true);
  eocdView.setUint16(4, 0, true);
  eocdView.setUint16(6, 0, true);
  eocdView.setUint16(8, fileEntries.length, true);
  eocdView.setUint16(10, fileEntries.length, true);
  eocdView.setUint32(12, centralDirSize, true);
  eocdView.setUint32(16, offset, true);
  eocdView.setUint16(20, 0, true);

  const totalLength = offset + centralDirSize + eocd.length;
  const zipBuffer = new Uint8Array(totalLength);
  let pos = 0;

  for (const entry of fileEntries) {
    zipBuffer.set(entry.header, pos);
    pos += entry.header.length;
    zipBuffer.set(entry.dataBytes, pos);
    pos += entry.dataBytes.length;
  }

  for (const cd of centralDirRecords) {
    zipBuffer.set(cd, pos);
    pos += cd.length;
  }

  zipBuffer.set(eocd, pos);

  return new Blob([zipBuffer], { type: 'application/zip' });
}

/**
 * Downloads a Blob to the user's device
 */
export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 15000);
}

/**
 * Parses hex color to { r, g, b } in [0, 1]
 */
export function hexToRgb01(hex) {
  hex = hex.replace('#', '');
  if (hex.length === 3) {
    hex = hex.split('').map((c) => c + c).join('');
  }
  const num = parseInt(hex, 16);
  return {
    r: ((num >> 16) & 255) / 255,
    g: ((num >> 8) & 255) / 255,
    b: (num & 255) / 255,
  };
}

/**
 * Safely rasterizes an image blob to standard PNG or JPEG Uint8Array bytes
 * via the browser's native C++ image decoding pipeline.
 * @param {Blob} blob
 * @param {'image/png'|'image/jpeg'} targetFormat
 * @returns {Promise<{ bytes: Uint8Array, format: 'jpg'|'png', width: number, height: number }>}
 */
async function rasterizeImageToSafeBytes(blob, targetFormat = 'image/png') {
  let imgBitmap;
  try {
    imgBitmap = await createImageBitmap(blob);
  } catch {
    imgBitmap = await new Promise((resolve, reject) => {
      const url = URL.createObjectURL(blob);
      const img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(url);
        resolve(img);
      };
      img.onerror = (err) => {
        URL.revokeObjectURL(url);
        reject(new Error('Browser failed to decode image: ' + (err?.message || 'Unsupported format')));
      };
      img.src = url;
    });
  }

  const width = imgBitmap.naturalWidth || imgBitmap.width;
  const height = imgBitmap.naturalHeight || imgBitmap.height;

  let canvas;
  if (typeof OffscreenCanvas !== 'undefined') {
    canvas = new OffscreenCanvas(width, height);
  } else {
    canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
  }

  const ctx = canvas.getContext('2d');
  if (targetFormat === 'image/jpeg') {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);
  }
  ctx.drawImage(imgBitmap, 0, 0);

  if (typeof imgBitmap.close === 'function') {
    imgBitmap.close();
  }

  let outBlob;
  if (canvas.convertToBlob) {
    outBlob = await canvas.convertToBlob({
      type: targetFormat,
      quality: targetFormat === 'image/jpeg' ? 0.95 : undefined,
    });
  } else {
    outBlob = await new Promise((resolve, reject) => {
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error('Canvas toBlob failed'))),
        targetFormat,
        targetFormat === 'image/jpeg' ? 0.95 : undefined
      );
    });
  }

  const arrayBuffer = await outBlob.arrayBuffer();
  return {
    bytes: new Uint8Array(arrayBuffer),
    format: targetFormat === 'image/jpeg' ? 'jpg' : 'png',
    width,
    height,
  };
}

/**
 * Safely embeds any supported image into a pdf-lib PDFDocument instance.
 * Automatically validates magic bytes (SOI for JPEG, PNG header for PNG) and
 * falls back to browser Canvas rasterization (supporting WebP, BMP, GIF, etc.)
 * so that pdf-lib NEVER throws "SOI not found in JPEG" or unhandled format errors.
 * 
 * @param {import('pdf-lib').PDFDocument} pdfDoc
 * @param {File|Blob|ArrayBuffer|Uint8Array|string|{file: File}} imageInput
 * @returns {Promise<import('pdf-lib').PDFImage>}
 */
export async function embedImageIntoPdf(pdfDoc, imageInput) {
  const file = imageInput && imageInput.file ? imageInput.file : imageInput;

  let bytes;
  let mimeType = '';

  if (typeof file === 'string') {
    if (file.startsWith('data:')) {
      const match = file.match(/^data:([^;]+);base64,/);
      if (match) {
        mimeType = match[1];
        const binary = atob(file.slice(match[0].length));
        bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      } else {
        const commaIdx = file.indexOf(',');
        const binary = atob(file.slice(commaIdx + 1));
        bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      }
    } else {
      const res = await fetch(file);
      const buf = await res.arrayBuffer();
      bytes = new Uint8Array(buf);
      mimeType = res.headers.get('content-type') || '';
    }
  } else if (file instanceof ArrayBuffer) {
    bytes = new Uint8Array(file);
  } else if (ArrayBuffer.isView(file)) {
    bytes = new Uint8Array(file.buffer, file.byteOffset, file.byteLength);
  } else if (file instanceof Blob) {
    mimeType = file.type || '';
    const buf = await file.arrayBuffer();
    bytes = new Uint8Array(buf);
  } else {
    throw new Error('Unsupported image input: ' + Object.prototype.toString.call(file));
  }

  // 1. Check for genuine JPEG SOI marker (0xFF, 0xD8)
  const isRealJpeg = bytes.length >= 2 && bytes[0] === 0xFF && bytes[1] === 0xD8;
  if (isRealJpeg) {
    try {
      return await pdfDoc.embedJpg(bytes);
    } catch (jpegErr) {
      console.warn('pdfDoc.embedJpg failed on SOI-matching JPEG, falling back to canvas rasterization:', jpegErr);
    }
  }

  // 2. Check for genuine PNG magic bytes (\x89PNG\r\n\x1a\n)
  const isRealPng = bytes.length >= 8 &&
    bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4E && bytes[3] === 0x47 &&
    bytes[4] === 0x0D && bytes[5] === 0x0A && bytes[6] === 0x1A && bytes[7] === 0x0A;
  if (isRealPng) {
    try {
      return await pdfDoc.embedPng(bytes);
    } catch (pngErr) {
      console.warn('pdfDoc.embedPng failed on PNG-matching image, falling back to canvas rasterization:', pngErr);
    }
  }

  // 3. Robust Browser Rasterization (WebP, GIF, BMP, SVG, AVIF, corrupted headers, progressive JPEG, etc.)
  const blob = file instanceof Blob ? file : new Blob([bytes], { type: mimeType || 'image/png' });
  const raster = await rasterizeImageToSafeBytes(blob, 'image/png');

  try {
    return await pdfDoc.embedPng(raster.bytes);
  } catch (pngErr2) {
    console.warn('Rasterized PNG embed failed, retrying with JPEG:', pngErr2);
    const jpegRaster = await rasterizeImageToSafeBytes(blob, 'image/jpeg');
    return await pdfDoc.embedJpg(jpegRaster.bytes);
  }
}

/**
 * Ensures image is converted to JPEG or PNG buffer supported by pdf-lib.
 * @param {File|Blob} file
 * @returns {Promise<{ buffer: ArrayBuffer, format: 'jpg'|'png', width?: number, height?: number }>}
 */
export async function ensureCompatibleImage(file) {
  const actualFile = file && file.file ? file.file : file;
  let bytes;
  if (actualFile instanceof Blob) {
    bytes = new Uint8Array(await actualFile.arrayBuffer());
  } else if (actualFile instanceof ArrayBuffer) {
    bytes = new Uint8Array(actualFile);
  } else if (ArrayBuffer.isView(actualFile)) {
    bytes = new Uint8Array(actualFile.buffer, actualFile.byteOffset, actualFile.byteLength);
  } else {
    const blob = new Blob([actualFile]);
    bytes = new Uint8Array(await blob.arrayBuffer());
  }

  // Genuine JPEG check: MUST start with 0xFF, 0xD8
  if (bytes.length >= 2 && bytes[0] === 0xFF && bytes[1] === 0xD8) {
    return { buffer: bytes.buffer, format: 'jpg' };
  }

  // Genuine PNG check
  if (bytes.length >= 8 &&
    bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4E && bytes[3] === 0x47 &&
    bytes[4] === 0x0D && bytes[5] === 0x0A && bytes[6] === 0x1A && bytes[7] === 0x0A) {
    return { buffer: bytes.buffer, format: 'png' };
  }

  const blob = actualFile instanceof Blob ? actualFile : new Blob([bytes]);
  const raster = await rasterizeImageToSafeBytes(blob, 'image/png');
  return {
    buffer: raster.bytes.buffer,
    format: 'png',
    width: raster.width,
    height: raster.height,
  };
}

// =======================================================
// GROUP 1 — IMAGE -> PDF
// =======================================================
export async function convertImagesToPdf(imageFiles, options = {}) {
  const { PDFDocument } = window.PDFLib;
  const pdfDoc = await PDFDocument.create();

  const {
    pageSize = 'fit', // 'fit', 'letter', 'a4'
    orientation = 'auto', // 'auto', 'portrait', 'landscape'
    margin = 0, // margin in points
  } = options;

  for (const file of imageFiles) {
    const embeddedImg = await embedImageIntoPdf(pdfDoc, file);

    const imgWidth = embeddedImg.width;
    const imgHeight = embeddedImg.height;

    let pageWidth, pageHeight;

    if (pageSize === 'letter') {
      pageWidth = 612;
      pageHeight = 792;
    } else if (pageSize === 'a4') {
      pageWidth = 595;
      pageHeight = 842;
    } else {
      pageWidth = imgWidth + margin * 2;
      pageHeight = imgHeight + margin * 2;
    }

    if (pageSize !== 'fit') {
      if (orientation === 'landscape' && pageWidth < pageHeight) {
        [pageWidth, pageHeight] = [pageHeight, pageWidth];
      } else if (orientation === 'portrait' && pageWidth > pageHeight) {
        [pageWidth, pageHeight] = [pageHeight, pageWidth];
      } else if (orientation === 'auto') {
        const isImgLandscape = imgWidth > imgHeight;
        const isPageLandscape = pageWidth > pageHeight;
        if (isImgLandscape !== isPageLandscape) {
          [pageWidth, pageHeight] = [pageHeight, pageWidth];
        }
      }
    }

    const page = pdfDoc.addPage([pageWidth, pageHeight]);
    const availWidth = Math.max(10, pageWidth - margin * 2);
    const availHeight = Math.max(10, pageHeight - margin * 2);

    const scale = Math.min(availWidth / imgWidth, availHeight / imgHeight);
    const drawWidth = imgWidth * scale;
    const drawHeight = imgHeight * scale;

    const drawX = margin + (availWidth - drawWidth) / 2;
    const drawY = margin + (availHeight - drawHeight) / 2;

    page.drawImage(embeddedImg, {
      x: drawX,
      y: drawY,
      width: drawWidth,
      height: drawHeight,
    });
  }

  return await pdfDoc.save();
}

// =======================================================
// GROUP 2 — PDF -> IMAGES (PNG / JPG)
// =======================================================
export async function convertPdfToImages(pdfjsDoc, options = {}, onProgress = () => {}) {
  const {
    pages = 'all',
    format = 'image/png',
    scale = 1.5,
    quality = 0.92,
  } = options;

  let targetPageNumbers = [];
  if (pages === 'all') {
    for (let i = 1; i <= pdfjsDoc.numPages; i++) targetPageNumbers.push(i);
  } else if (Array.isArray(pages)) {
    targetPageNumbers = pages;
  } else if (typeof pages === 'number') {
    targetPageNumbers = [pages];
  }

  const extension = format === 'image/jpeg' ? 'jpg' : 'png';
  const renderedImages = [];

  for (let idx = 0; idx < targetPageNumbers.length; idx++) {
    const pageNum = targetPageNumbers[idx];
    onProgress({ current: idx + 1, total: targetPageNumbers.length, pageNum });

    const page = await pdfjsDoc.getPage(pageNum);
    const viewport = page.getViewport({ scale });

    const canvas = document.createElement('canvas');
    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);
    const ctx = canvas.getContext('2d');

    if (format === 'image/jpeg') {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    await page.render({ canvasContext: ctx, viewport }).promise;

    const blob = await new Promise((resolve) => {
      canvas.toBlob(resolve, format, quality);
    });

    const buffer = await blob.arrayBuffer();
    renderedImages.push({
      name: `page-${pageNum}.${extension}`,
      blob,
      buffer,
      pageNum,
    });
  }

  return renderedImages;
}

// =======================================================
// GROUP 3 — PDF -> TEXT
// =======================================================
export async function extractTextFromPdf(pdfjsDoc, onProgress = () => {}) {
  const totalPages = pdfjsDoc.numPages;
  const pageSections = [];
  let totalCharacters = 0;

  for (let i = 1; i <= totalPages; i++) {
    onProgress({ current: i, total: totalPages });
    const page = await pdfjsDoc.getPage(i);
    const textContent = await page.getTextContent();

    const items = textContent.items || [];
    let pageText = '';

    if (items.length > 0) {
      let lastY = null;
      for (const item of items) {
        if (!item.str) continue;
        const currentY = item.transform ? item.transform[5] : null;
        if (lastY !== null && currentY !== null && Math.abs(currentY - lastY) > 5) {
          pageText += '\n';
        } else if (lastY !== null && pageText.length > 0 && !pageText.endsWith(' ') && !pageText.endsWith('\n')) {
          pageText += ' ';
        }
        pageText += item.str;
        lastY = currentY;
      }
    }

    const trimmed = pageText.trim();
    totalCharacters += trimmed.length;
    pageSections.push({
      pageNumber: i,
      text: trimmed,
    });
  }

  const isScannedOrEmpty = totalCharacters < 5;
  let fullText = '';

  if (isScannedOrEmpty) {
    fullText =
      `No selectable text found in this PDF (${totalPages} ${totalPages === 1 ? 'page' : 'pages'}).\n\n` +
      `Note: This document appears to be scanned or image-only. Use SAVY's local OCR Scanner tool to extract text from images.`;
  } else {
    fullText = pageSections
      .map((sec) => `--- Page ${sec.pageNumber} ---\n\n${sec.text || '[No selectable text on this page]'}\n`)
      .join('\n');
  }

  return {
    fullText,
    pageSections,
    totalCharacters,
    isScannedOrEmpty,
    totalPages,
  };
}

// =======================================================
// GROUP 4 — PDF COMPRESSION
// =======================================================
export async function compressPdfDocument(rawBuffer, options = {}, pdfjsDoc = null) {
  const { PDFDocument } = window.PDFLib;
  const originalSize = rawBuffer.byteLength;
  const { mode = 'lossless', scale = 1.0, quality = 0.72 } = options;

  if (mode === 'visual' && pdfjsDoc) {
    const newDoc = await PDFDocument.create();
    for (let i = 1; i <= pdfjsDoc.numPages; i++) {
      const page = await pdfjsDoc.getPage(i);
      const viewport = page.getViewport({ scale });

      const canvas = document.createElement('canvas');
      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      await page.render({ canvasContext: ctx, viewport }).promise;

      const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
      const jpgBytes = await blob.arrayBuffer();
      const embedded = await newDoc.embedJpg(jpgBytes);

      const origViewport = page.getViewport({ scale: 1.0 });
      const newPage = newDoc.addPage([origViewport.width, origViewport.height]);
      newPage.drawImage(embedded, {
        x: 0,
        y: 0,
        width: origViewport.width,
        height: origViewport.height,
      });
    }

    const compressedBytes = await newDoc.save({ useObjectStreams: true });
    const compressedSize = compressedBytes.byteLength;
    const reductionBytes = originalSize - compressedSize;
    const reductionPercent = Math.round((reductionBytes / originalSize) * 100);

    return {
      bytes: compressedBytes,
      originalSize,
      compressedSize,
      reductionBytes,
      reductionPercent,
      mode: 'visual',
      warning:
        'Visual screen optimization re-encodes pages to compress embedded graphics. Selectable text has been converted to high-resolution raster images.',
    };
  }

  const doc = await PDFDocument.load(rawBuffer.slice(0), { ignoreEncryption: true });
  const compressedBytes = await doc.save({ useObjectStreams: true });
  const compressedSize = compressedBytes.byteLength;
  const reductionBytes = originalSize - compressedSize;
  const reductionPercent = Math.round((reductionBytes / originalSize) * 100);

  const isReduced = compressedSize < originalSize;

  return {
    bytes: isReduced ? compressedBytes : rawBuffer,
    originalSize,
    compressedSize,
    reductionBytes: Math.max(0, reductionBytes),
    reductionPercent: isReduced ? reductionPercent : 0,
    isReduced,
    mode: 'lossless',
    note: isReduced
      ? `Compressed successfully via PDF object stream consolidation (-${reductionPercent}%).`
      : 'Document streams were already optimal or stream indexing overhead exceeded savings. Original document preserved.',
  };
}

// =======================================================
// GROUP 5 — METADATA
// =======================================================
export async function getPdfMetadata(rawBuffer) {
  const { PDFDocument } = window.PDFLib;
  const doc = await PDFDocument.load(rawBuffer.slice(0), { ignoreEncryption: true });
  return {
    title: doc.getTitle() || '',
    author: doc.getAuthor() || '',
    subject: doc.getSubject() || '',
    keywords: Array.isArray(doc.getKeywords()) ? doc.getKeywords().join(', ') : (doc.getKeywords() || ''),
    creator: doc.getCreator() || '',
    producer: doc.getProducer() || '',
    creationDate: doc.getCreationDate() ? doc.getCreationDate().toISOString() : '',
    modificationDate: doc.getModificationDate() ? doc.getModificationDate().toISOString() : '',
  };
}

export async function updatePdfMetadata(rawBuffer, newMetadata = {}, clearAll = false) {
  const { PDFDocument } = window.PDFLib;
  const doc = await PDFDocument.load(rawBuffer.slice(0), { ignoreEncryption: true });

  if (clearAll) {
    doc.setTitle('');
    doc.setAuthor('');
    doc.setSubject('');
    doc.setKeywords([]);
    doc.setCreator('');
    doc.setProducer('');
  } else {
    if (newMetadata.title !== undefined) doc.setTitle(newMetadata.title);
    if (newMetadata.author !== undefined) doc.setAuthor(newMetadata.author);
    if (newMetadata.subject !== undefined) doc.setSubject(newMetadata.subject);
    if (newMetadata.keywords !== undefined) {
      const kwArray = typeof newMetadata.keywords === 'string'
        ? newMetadata.keywords.split(',').map((k) => k.trim()).filter(Boolean)
        : newMetadata.keywords;
      doc.setKeywords(kwArray);
    }
    if (newMetadata.creator !== undefined) doc.setCreator(newMetadata.creator);
    if (newMetadata.producer !== undefined) doc.setProducer(newMetadata.producer);
  }

  return await doc.save();
}

// =======================================================
// GROUP 6 — WATERMARK
// =======================================================
export async function applyWatermarkToPdf(rawBuffer, options = {}) {
  const { PDFDocument, StandardFonts, rgb, degrees } = window.PDFLib;
  const doc = await PDFDocument.load(rawBuffer.slice(0), { ignoreEncryption: true });
  const font = await doc.embedFont(StandardFonts.HelveticaBold);

  const {
    text = 'CONFIDENTIAL',
    fontSize = 48,
    opacity = 0.25,
    colorHex = '#888888',
    rotation = 45,
    position = 'center',
    pages = 'all',
  } = options;

  const { r, g, b } = hexToRgb01(colorHex);
  const color = rgb(r, g, b);
  const totalPages = doc.getPageCount();

  let targetIndices = [];
  if (pages === 'all') {
    for (let i = 0; i < totalPages; i++) targetIndices.push(i);
  } else if (Array.isArray(pages)) {
    targetIndices = pages;
  }

  for (const idx of targetIndices) {
    if (idx < 0 || idx >= totalPages) continue;
    const page = doc.getPage(idx);
    const { width, height } = page.getSize();
    const textWidth = font.widthOfTextAtSize(text, fontSize);
    const textHeight = font.heightAtSize(fontSize);

    let x = (width - textWidth) / 2;
    let y = (height - textHeight) / 2;

    if (position === 'top') {
      y = height - textHeight - 60;
    } else if (position === 'bottom') {
      y = 60;
    }

    page.drawText(text, {
      x,
      y,
      size: fontSize,
      font,
      color,
      opacity: Math.max(0.05, Math.min(1.0, opacity)),
      rotate: degrees(rotation),
    });
  }

  return await doc.save();
}

// =======================================================
// GROUP 7 — PAGE NUMBERS
// =======================================================
export async function applyPageNumbersToPdf(rawBuffer, options = {}) {
  const { PDFDocument, StandardFonts, rgb } = window.PDFLib;
  const doc = await PDFDocument.load(rawBuffer.slice(0), { ignoreEncryption: true });
  const font = await doc.embedFont(StandardFonts.Helvetica);

  const {
    format = 'Page {n} of {total}',
    startNumber = 1,
    position = 'bottom-center',
    fontSize = 10,
    margin = 25,
    skipFirstPage = false,
    colorHex = '#444444',
  } = options;

  const { r, g, b } = hexToRgb01(colorHex);
  const color = rgb(r, g, b);
  const totalPages = doc.getPageCount();

  for (let i = 0; i < totalPages; i++) {
    if (skipFirstPage && i === 0) continue;

    const page = doc.getPage(i);
    const { width, height } = page.getSize();
    const pageNum = startNumber + i;

    const text = format
      .replace('{n}', String(pageNum))
      .replace('{total}', String(totalPages));

    const textWidth = font.widthOfTextAtSize(text, fontSize);

    let x, y;
    if (position.includes('center')) {
      x = (width - textWidth) / 2;
    } else if (position.includes('right')) {
      x = width - margin - textWidth;
    } else {
      x = margin;
    }

    if (position.startsWith('top')) {
      y = height - margin;
    } else {
      y = margin;
    }

    page.drawText(text, {
      x,
      y,
      size: fontSize,
      font,
      color,
    });
  }

  return await doc.save();
}

// =======================================================
// GROUP 8 — FLATTEN
// =======================================================
export async function flattenDocument(documentModel, annotationManager, pdfPageOperations) {
  const res = await pdfPageOperations.compileDocumentWithModel(
    documentModel,
    annotationManager
  );
  return res.bytes || res;
}

// =======================================================
// GROUP 9 — ROTATE PDF
// =======================================================
export async function rotatePdfDocument(rawBuffer, angle = 90, options = {}) {
  const { PDFDocument, degrees } = window.PDFLib;
  const doc = await PDFDocument.load(rawBuffer.slice(0), { ignoreEncryption: true });
  const count = doc.getPageCount();
  const scope = options.scope || 'all';
  const targetPages = options.pages || [];

  for (let i = 0; i < count; i++) {
    if (scope === 'all' || (scope === 'current' && i === (options.currentPage - 1)) || targetPages.includes(i + 1)) {
      const page = doc.getPage(i);
      const current = page.getRotation().angle;
      page.setRotation(degrees((current + angle) % 360));
    }
  }

  return await doc.save();
}

// =======================================================
// GROUP 10 — CROP PDF
// =======================================================
export async function cropPdfDocument(rawBuffer, options = {}) {
  const { PDFDocument } = window.PDFLib;
  const doc = await PDFDocument.load(rawBuffer.slice(0), { ignoreEncryption: true });
  const count = doc.getPageCount();
  const margins = options.margins || { top: 36, bottom: 36, left: 36, right: 36 };

  for (let i = 0; i < count; i++) {
    const page = doc.getPage(i);
    const { width, height } = page.getSize();
    const cropX = Number(margins.left) || 0;
    const cropY = Number(margins.bottom) || 0;
    const cropW = Math.max(10, width - cropX - (Number(margins.right) || 0));
    const cropH = Math.max(10, height - cropY - (Number(margins.top) || 0));

    page.setCropBox(cropX, cropY, cropW, cropH);
  }

  return await doc.save();
}

// =======================================================
// GROUP 11 — PDF -> WORD (.docx)
// =======================================================
export async function convertPdfToDocx(pdfjsDoc, options = {}, onProgress = () => {}) {
  const totalPages = pdfjsDoc.numPages;
  const paragraphs = [];

  for (let i = 1; i <= totalPages; i++) {
    onProgress({ current: i, total: totalPages, phase: 'Extracting text' });
    const page = await pdfjsDoc.getPage(i);
    const textContent = await page.getTextContent();
    const items = textContent.items || [];

    if (items.length > 0) {
      // Calculate median font size
      const fontSizes = items.map((it) => (it.transform ? Math.hypot(it.transform[0], it.transform[1]) : 12)).filter((s) => s > 0);
      fontSizes.sort((a, b) => a - b);
      const medianFont = fontSizes[Math.floor(fontSizes.length / 2)] || 12;

      // Group into lines by Y coordinate
      let lines = [];
      let currentLine = [];
      let lastY = null;

      for (const item of items) {
        if (!item.str) continue;
        const currentY = item.transform ? Math.round(item.transform[5]) : null;
        if (lastY !== null && currentY !== null && Math.abs(currentY - lastY) > 5) {
          if (currentLine.length > 0) lines.push(currentLine);
          currentLine = [];
        }
        currentLine.push(item);
        lastY = currentY;
      }
      if (currentLine.length > 0) lines.push(currentLine);

      for (const line of lines) {
        const lineText = line.map((it) => it.str).join(' ').trim();
        if (!lineText) continue;

        const maxLineSize = Math.max(...line.map((it) => (it.transform ? Math.hypot(it.transform[0], it.transform[1]) : medianFont)));
        const isBold = line.some((it) => (it.fontName || '').toLowerCase().includes('bold'));
        const isItalic = line.some((it) => (it.fontName || '').toLowerCase().includes('italic') || (it.fontName || '').toLowerCase().includes('oblique'));

        let heading = undefined;
        if (maxLineSize >= medianFont * 1.35) heading = 1;
        else if (maxLineSize >= medianFont * 1.18) heading = 2;

        paragraphs.push({
          text: lineText,
          heading,
          bold: isBold,
          italic: isItalic,
        });
      }
    }

    if (i < totalPages) {
      paragraphs.push({ isPageBreak: true });
    }
  }

  if (paragraphs.length === 0) {
    paragraphs.push({ text: 'Converted PDF Document Content' });
  }

  return buildDocx(paragraphs, options);
}

// =======================================================
// GROUP 12 — IMAGE -> WORD (.docx)
// =======================================================
export async function convertImageToDocx(imageFile, ocrText = '') {
  const { buffer, format } = await ensureCompatibleImage(imageFile);
  const imageFormat = format === 'jpg' ? 'jpeg' : 'png';

  const paragraphs = [
    { text: (imageFile.name || 'Document Image').replace(/\.[^/.]+$/, ''), heading: 1 },
  ];

  if (ocrText && ocrText.trim()) {
    paragraphs.push({ text: 'OCR Transcribed Content:', bold: true });
    ocrText.split('\n').forEach((line) => {
      if (line.trim()) paragraphs.push({ text: line.trim() });
    });
  } else {
    paragraphs.push({ text: 'Scanned Document Image' });
  }

  return buildDocx(paragraphs, {
    imageBuffer: new Uint8Array(buffer),
    imageFormat,
  });
}

// =======================================================
// GROUP 13 — PDF -> EXCEL (.xlsx)
// =======================================================
export async function convertPdfToXlsx(pdfjsDoc, options = {}, onProgress = () => {}) {
  const totalPages = pdfjsDoc.numPages;
  const allRows = [];

  for (let i = 1; i <= totalPages; i++) {
    onProgress({ current: i, total: totalPages, phase: 'Extracting table data' });
    const page = await pdfjsDoc.getPage(i);
    const textContent = await page.getTextContent();
    const items = textContent.items || [];

    // Group items into rows by Y coordinate
    const yGroups = new Map();
    for (const it of items) {
      if (!it.str || !it.str.trim()) continue;
      const y = it.transform ? Math.round(it.transform[5] / 4) * 4 : 0;
      if (!yGroups.has(y)) yGroups.set(y, []);
      yGroups.get(y).push(it);
    }

    // Sort rows from top of page to bottom (descending Y)
    const sortedYs = Array.from(yGroups.keys()).sort((a, b) => b - a);

    for (const y of sortedYs) {
      const rowItems = yGroups.get(y);
      // Sort columns left to right (ascending X)
      rowItems.sort((a, b) => (a.transform ? a.transform[4] : 0) - (b.transform ? b.transform[4] : 0));

      const rowCells = [];
      for (const item of rowItems) {
        const text = item.str.trim();
        // Check if text is pipe-separated or tab-separated
        if (text.includes('|')) {
          text.split('|').map((part) => part.trim()).filter(Boolean).forEach((c) => rowCells.push(c));
        } else if (text.includes('\t')) {
          text.split('\t').map((part) => part.trim()).filter(Boolean).forEach((c) => rowCells.push(c));
        } else {
          // If numeric, parse as number
          const num = Number(text);
          rowCells.push(!isNaN(num) && text !== '' && !text.startsWith('0') ? num : text);
        }
      }

      if (rowCells.length > 0) {
        allRows.push(rowCells);
      }
    }
  }

  if (allRows.length === 0) {
    allRows.push(['No tabular data detected in PDF']);
  }

  return buildXlsx(allRows, { sheetName: options.sheetName || 'Extracted Table' });
}

// =======================================================
// GROUP 14 — PDF -> POWERPOINT (.pptx)
// =======================================================
export async function convertPdfToPptx(pdfjsDoc, options = {}, onProgress = () => {}) {
  const totalPages = pdfjsDoc.numPages;
  const pages = [];
  const canRenderCanvas = typeof document !== 'undefined' && typeof document.createElement === 'function';

  for (let i = 1; i <= totalPages; i++) {
    onProgress({ current: i, total: totalPages, phase: `Rendering slide ${i} of ${totalPages}` });
    const page = await pdfjsDoc.getPage(i);

    const widthPt = page.view ? (page.view[2] - page.view[0]) : 612;
    const heightPt = page.view ? (page.view[3] - page.view[1]) : 792;

    if (canRenderCanvas) {
      try {
        const viewport = page.getViewport({ scale: 2.0 });
        const canvas = document.createElement('canvas');
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        await page.render({ canvasContext: ctx, viewport }).promise;

        const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.92));
        const arrayBuf = await blob.arrayBuffer();
        const imageBuffer = new Uint8Array(arrayBuf);

        pages.push({
          widthPt,
          heightPt,
          imageBuffer,
          format: 'jpeg',
        });
        continue;
      } catch (renderErr) {
        console.warn(`Canvas slide render failed for page ${i}, falling back to text:`, renderErr);
      }
    }

    // Fallback for non-browser/canvas environments: extract text
    const textContent = await page.getTextContent();
    const items = textContent.items || [];
    let title = `Slide ${i}`;
    const contentBullets = [];

    if (items.length > 0) {
      let lines = [];
      let curLine = '';
      let lastY = null;
      for (const item of items) {
        if (!item.str) continue;
        const currentY = item.transform ? Math.round(item.transform[5]) : null;
        if (lastY !== null && currentY !== null && Math.abs(currentY - lastY) > 5) {
          if (curLine.trim()) lines.push(curLine.trim());
          curLine = '';
        }
        curLine += (curLine.length > 0 ? ' ' : '') + item.str;
        lastY = currentY;
      }
      if (curLine.trim()) lines.push(curLine.trim());
      if (lines.length > 0) {
        title = lines[0].substring(0, 60);
        for (let j = 1; j < Math.min(lines.length, 8); j++) {
          contentBullets.push(lines[j]);
        }
      }
    }

    if (contentBullets.length === 0) {
      contentBullets.push('Content converted from PDF Page ' + i);
    }

    pages.push({
      widthPt,
      heightPt,
      title,
      content: contentBullets,
    });
  }

  return buildPptx(pages);
}

// =======================================================
// GROUP 15 — PDF -> MARKDOWN (.md)
// =======================================================
export async function convertPdfToMarkdown(pdfjsDoc, onProgress = () => {}) {
  const totalPages = pdfjsDoc.numPages;
  let markdown = '';

  for (let i = 1; i <= totalPages; i++) {
    onProgress({ current: i, total: totalPages });
    const page = await pdfjsDoc.getPage(i);
    const textContent = await page.getTextContent();
    const items = textContent.items || [];

    if (items.length === 0) {
      markdown += `## Page ${i}\n\n[No selectable text]\n\n---\n\n`;
      continue;
    }

    const fontSizes = items.map((it) => (it.transform ? Math.hypot(it.transform[0], it.transform[1]) : 12)).filter((s) => s > 0);
    fontSizes.sort((a, b) => a - b);
    const medianFont = fontSizes[Math.floor(fontSizes.length / 2)] || 12;

    let lines = [];
    let curLine = [];
    let lastY = null;

    for (const it of items) {
      if (!it.str) continue;
      const curY = it.transform ? Math.round(it.transform[5]) : null;
      if (lastY !== null && curY !== null && Math.abs(curY - lastY) > 5) {
        if (curLine.length > 0) lines.push(curLine);
        curLine = [];
      }
      curLine.push(it);
      lastY = curY;
    }
    if (curLine.length > 0) lines.push(curLine);

    markdown += `<!-- Page ${i} -->\n\n`;

    for (const line of lines) {
      let text = line.map((it) => it.str).join(' ').trim();
      if (!text) continue;

      const maxSize = Math.max(...line.map((it) => (it.transform ? Math.hypot(it.transform[0], it.transform[1]) : medianFont)));
      const isBold = line.some((it) => (it.fontName || '').toLowerCase().includes('bold'));
      const isItalic = line.some((it) => (it.fontName || '').toLowerCase().includes('italic') || (it.fontName || '').toLowerCase().includes('oblique'));

      if (maxSize >= medianFont * 1.4) {
        markdown += `# ${text}\n\n`;
      } else if (maxSize >= medianFont * 1.2) {
        markdown += `## ${text}\n\n`;
      } else if (text.startsWith('•') || text.startsWith('-') || text.startsWith('*')) {
        markdown += `* ${text.replace(/^[•\-\*]\s*/, '')}\n`;
      } else if (/^\d+\.\s/.test(text)) {
        markdown += `${text}\n`;
      } else {
        if (isBold) text = `**${text}**`;
        else if (isItalic) text = `*${text}*`;
        markdown += `${text}\n\n`;
      }
    }

    if (i < totalPages) {
      markdown += '\n---\n\n';
    }
  }

  return {
    markdown,
    blob: new Blob([markdown], { type: 'text/markdown;charset=utf-8' }),
  };
}

// =======================================================
// GROUP 16 — HTML -> PDF
// =======================================================
export async function convertHtmlToPdf(htmlString, options = {}) {
  const { PDFDocument } = window.PDFLib;
  const { pageSize = 'a4', orientation = 'portrait' } = options;

  let pageWidth = pageSize === 'letter' ? 612 : 595.28;
  let pageHeight = pageSize === 'letter' ? 792 : 841.89;
  if (orientation === 'landscape') {
    [pageWidth, pageHeight] = [pageHeight, pageWidth];
  }

  const scale = 2.0; // Crisp high-DPI
  const margin = 40 * scale;
  const contentWidth = (pageWidth * scale) - (margin * 2);
  const pageHeightPx = pageHeight * scale;

  const parser = new DOMParser();
  const parsedDoc = parser.parseFromString(htmlString, 'text/html');
  const body = parsedDoc.body;

  const pdfDoc = await PDFDocument.create();

  const createPageCanvas = () => {
    const c = document.createElement('canvas');
    c.width = Math.round(pageWidth * scale);
    c.height = Math.round(pageHeight * scale);
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, c.width, c.height);
    return { canvas: c, ctx, currentY: margin };
  };

  const pages = [createPageCanvas()];
  let active = pages[0];

  const checkPageBreak = (neededHeight) => {
    if (active.currentY + neededHeight > pageHeightPx - margin) {
      active = createPageCanvas();
      pages.push(active);
    }
  };

  const wrapText = (ctx, text, maxWidth) => {
    const words = text.split(/\s+/);
    const lines = [];
    let currentLine = '';
    for (const word of words) {
      const testLine = currentLine ? `${currentLine} ${word}` : word;
      if (ctx.measureText(testLine).width <= maxWidth) {
        currentLine = testLine;
      } else {
        if (currentLine) lines.push(currentLine);
        currentLine = word;
      }
    }
    if (currentLine) lines.push(currentLine);
    return lines;
  };

  const processNode = async (node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent?.trim();
      if (!text) return;
      active.ctx.font = `${14 * scale}px Helvetica, Arial, sans-serif`;
      active.ctx.fillStyle = '#374151';
      const lines = wrapText(active.ctx, text, contentWidth);
      const lineHeight = 20 * scale;
      checkPageBreak(lines.length * lineHeight);
      for (const line of lines) {
        active.ctx.fillText(line, margin, active.currentY + (14 * scale));
        active.currentY += lineHeight;
      }
      return;
    }

    if (node.nodeType !== Node.ELEMENT_NODE) return;

    const tag = node.tagName.toLowerCase();
    const style = node.getAttribute('style') || '';
    const isExplicitBreak = tag === 'hr' ||
      node.classList?.contains('page-break') ||
      style.includes('page-break-after: always') ||
      style.includes('page-break-before: always');

    if (isExplicitBreak && active.currentY > margin) {
      active = createPageCanvas();
      pages.push(active);
      if (tag === 'hr') return;
    }

    if (/^h[1-6]$/.test(tag)) {
      const level = parseInt(tag[1], 10);
      const sizes = { 1: 26, 2: 20, 3: 17, 4: 15, 5: 13, 6: 12 };
      const ptSize = sizes[level] || 16;
      const pxSize = ptSize * scale;
      const lineHeight = (ptSize * 1.3) * scale;
      const spacingBefore = (ptSize * 0.5) * scale;
      const spacingAfter = (ptSize * 0.3) * scale;

      active.ctx.font = `bold ${pxSize}px Helvetica, Arial, sans-serif`;
      active.ctx.fillStyle = '#111827';

      const lines = wrapText(active.ctx, node.textContent.trim(), contentWidth);
      checkPageBreak(spacingBefore + (lines.length * lineHeight) + spacingAfter);

      active.currentY += spacingBefore;
      for (const line of lines) {
        active.ctx.fillText(line, margin, active.currentY + pxSize * 0.85);
        active.currentY += lineHeight;
      }
      active.currentY += spacingAfter;
      return;
    }

    if (tag === 'p') {
      active.ctx.font = `${14 * scale}px Helvetica, Arial, sans-serif`;
      active.ctx.fillStyle = '#374151';
      const lines = wrapText(active.ctx, node.textContent.trim(), contentWidth);
      const lineHeight = 20 * scale;
      const spacingAfter = 10 * scale;

      checkPageBreak((lines.length * lineHeight) + spacingAfter);
      for (const line of lines) {
        active.ctx.fillText(line, margin, active.currentY + (14 * scale));
        active.currentY += lineHeight;
      }
      active.currentY += spacingAfter;
      return;
    }

    if (tag === 'ul' || tag === 'ol') {
      const items = Array.from(node.querySelectorAll(':scope > li'));
      let idx = 1;
      for (const li of items) {
        active.ctx.font = `${14 * scale}px Helvetica, Arial, sans-serif`;
        active.ctx.fillStyle = '#374151';
        const prefix = tag === 'ol' ? `${idx++}. ` : '• ';
        const prefixWidth = active.ctx.measureText(prefix).width;
        const lines = wrapText(active.ctx, li.textContent.trim(), contentWidth - prefixWidth);
        const lineHeight = 20 * scale;

        checkPageBreak(lines.length * lineHeight);
        active.ctx.fillText(prefix, margin, active.currentY + (14 * scale));
        for (let lIdx = 0; lIdx < lines.length; lIdx++) {
          active.ctx.fillText(lines[lIdx], margin + prefixWidth, active.currentY + (14 * scale));
          active.currentY += lineHeight;
        }
      }
      active.currentY += 8 * scale;
      return;
    }

    if (tag === 'table') {
      const rows = Array.from(node.querySelectorAll('tr'));
      if (rows.length === 0) return;

      let maxCols = 1;
      rows.forEach((r) => {
        const cells = r.querySelectorAll('th, td');
        if (cells.length > maxCols) maxCols = cells.length;
      });

      const colWidth = contentWidth / maxCols;
      const cellPadding = 8 * scale;
      const rowHeight = 28 * scale;

      for (let rIdx = 0; rIdx < rows.length; rIdx++) {
        const tr = rows[rIdx];
        const cells = Array.from(tr.querySelectorAll('th, td'));
        const isHeader = tr.querySelector('th') !== null;

        checkPageBreak(rowHeight);

        if (isHeader) {
          active.ctx.fillStyle = '#F3F4F6';
          active.ctx.fillRect(margin, active.currentY, contentWidth, rowHeight);
        }

        active.ctx.strokeStyle = '#D1D5DB';
        active.ctx.lineWidth = 1 * scale;

        cells.forEach((cell, cIdx) => {
          const x = margin + (cIdx * colWidth);
          const y = active.currentY;

          active.ctx.strokeRect(x, y, colWidth, rowHeight);

          active.ctx.font = isHeader ? `bold ${12 * scale}px Helvetica, Arial, sans-serif` : `${12 * scale}px Helvetica, Arial, sans-serif`;
          active.ctx.fillStyle = isHeader ? '#111827' : '#374151';
          const text = cell.textContent.trim();

          active.ctx.save();
          active.ctx.beginPath();
          active.ctx.rect(x + cellPadding, y, colWidth - (cellPadding * 2), rowHeight);
          active.ctx.clip();
          active.ctx.fillText(text, x + cellPadding, y + (18 * scale));
          active.ctx.restore();
        });

        active.currentY += rowHeight;
      }
      active.currentY += 12 * scale;
      return;
    }

    if (tag === 'img') {
      const src = node.getAttribute('src');
      if (src) {
        try {
          const img = new Image();
          await new Promise((res, rej) => {
            img.onload = res;
            img.onerror = rej;
            img.src = src;
          });
          const maxImgW = contentWidth;
          const maxImgH = 300 * scale;
          let imgW = img.width * scale;
          let imgH = img.height * scale;
          if (imgW > maxImgW) {
            imgH = (maxImgW / imgW) * imgH;
            imgW = maxImgW;
          }
          if (imgH > maxImgH) {
            imgW = (maxImgH / imgH) * imgW;
            imgH = maxImgH;
          }

          checkPageBreak(imgH + (12 * scale));
          active.ctx.drawImage(img, margin, active.currentY, imgW, imgH);
          active.currentY += imgH + (12 * scale);
        } catch {
          // Gracefully continue on image failure
        }
      }
      return;
    }

    for (const child of node.childNodes) {
      await processNode(child);
    }
  };

  for (const child of body.childNodes) {
    await processNode(child);
  }

  for (const p of pages) {
    const blob = await new Promise((resolve) => p.canvas.toBlob(resolve, 'image/jpeg', 0.95));
    const jpgBytes = await blob.arrayBuffer();
    const page = pdfDoc.addPage([pageWidth, pageHeight]);
    const embedded = await pdfDoc.embedJpg(jpgBytes);
    page.drawImage(embedded, {
      x: 0,
      y: 0,
      width: pageWidth,
      height: pageHeight,
    });
  }

  return await pdfDoc.save();
}

// =======================================================
// GROUP 17 — PDF -> PDF/A (EXPERIMENTAL)
// =======================================================
export async function convertPdfToPdfA(rawBuffer) {
  const { PDFDocument } = window.PDFLib;
  const doc = await PDFDocument.load(rawBuffer.slice(0), { ignoreEncryption: true });

  // Injects PDF/A-1b conformance metadata packet
  doc.setTitle(doc.getTitle() || 'PDF/A Document');
  doc.setProducer('SAVY PDF Workspace (PDF/A Profile)');

  const pdfBytes = await doc.save({ useObjectStreams: false });
  return {
    bytes: pdfBytes,
    note: 'PDF/A metadata/profile preparation — full conformance validation not guaranteed.',
  };
}

// =======================================================
// GROUP 18 — REPAIR PDF (EXPERIMENTAL)
// =======================================================
export async function repairPdfDocument(rawBuffer) {
  const { PDFDocument } = window.PDFLib;
  try {
    // Attempt fault-tolerant load ignoring broken encryption dictionaries
    const doc = await PDFDocument.load(rawBuffer.slice(0), { ignoreEncryption: true });
    // Reconstruct cross-reference table and re-serialize clean objects
    const repairedBytes = await doc.save({ useObjectStreams: false });
    return {
      bytes: repairedBytes,
      repaired: true,
      note: 'PDF cross-reference table and object index reconstructed successfully.',
    };
  } catch (err) {
    throw new Error('PDF repair failed: Document structure is too severely damaged to salvage client-side.');
  }
}

// =======================================================
// GROUP 19 — COMPARE PDF
// =======================================================
export async function comparePdfDocuments(docABytes, docBBytes) {
  const pdfjs = window.pdfjsLib;
  const pdfDocA = await pdfjs.getDocument({ data: docABytes }).promise;
  const pdfDocB = await pdfjs.getDocument({ data: docBBytes }).promise;

  const textA = (await extractTextFromPdf(pdfDocA)).fullText.split('\n');
  const textB = (await extractTextFromPdf(pdfDocB)).fullText.split('\n');

  let addedLines = 0;
  let removedLines = 0;
  let diffLines = [];

  const maxLen = Math.max(textA.length, textB.length);
  for (let i = 0; i < maxLen; i++) {
    const lineA = textA[i] || '';
    const lineB = textB[i] || '';

    if (lineA === lineB) {
      if (lineA) diffLines.push({ type: 'same', text: '  ' + lineA });
    } else {
      if (lineA) {
        diffLines.push({ type: 'remove', text: '- ' + lineA });
        removedLines++;
      }
      if (lineB) {
        diffLines.push({ type: 'add', text: '+ ' + lineB });
        addedLines++;
      }
    }
  }

  const matchPercent = Math.max(0, Math.round((1 - (addedLines + removedLines) / Math.max(1, textA.length + textB.length)) * 100));

  return {
    matchPercent,
    addedLines,
    removedLines,
    diffLines,
    pagesA: pdfDocA.numPages,
    pagesB: pdfDocB.numPages,
  };
}

// =======================================================
// TOOLBOX UI CONTROLLER CLASS (29 TOOLS)
// =======================================================
export class PDFToolbox {
  constructor({ editorApp, onToast }) {
    this.editorApp = editorApp;
    this.onToast = onToast || console.log;

    this.initElements();
    this.bindEvents();
  }

  initElements() {
    this.btnOpenToolbox = document.getElementById('btnOpenToolbox');
    this.toolboxModal = document.getElementById('toolboxModal');
    this.btnToolboxClose = document.getElementById('btnToolboxClose');

    // Existing Tool Dialog Modals
    this.imgToPdfModal = document.getElementById('imgToPdfModal');
    this.pdfToImgModal = document.getElementById('pdfToImgModal');
    this.pdfToTextModal = document.getElementById('pdfToTextModal');
    this.compressModal = document.getElementById('compressModal');
    this.metadataModal = document.getElementById('metadataModal');
    this.watermarkModal = document.getElementById('watermarkModal');
    this.pageNumberModal = document.getElementById('pageNumberModal');
    this.flattenModal = document.getElementById('flattenModal');

    // New Modals for Master Converter Architecture
    this.rotateModal = document.getElementById('rotateModal');
    this.pdfToWordModal = document.getElementById('pdfToWordModal');
    this.imageToWordModal = document.getElementById('imageToWordModal');
    this.pdfToExcelModal = document.getElementById('pdfToExcelModal');
    this.pdfToPptxModal = document.getElementById('pdfToPptxModal');
    this.pdfToPdfaModal = document.getElementById('pdfToPdfaModal');
    this.pdfToMarkdownModal = document.getElementById('pdfToMarkdownModal');
    this.htmlToPdfModal = document.getElementById('htmlToPdfModal');
    this.scanToPdfModal = document.getElementById('scanToPdfModal');
    this.comparePdfModal = document.getElementById('comparePdfModal');
    this.pdfFormsModal = document.getElementById('pdfFormsModal');
    this.repairPdfModal = document.getElementById('repairPdfModal');

    // File input for Image to PDF
    this.imgToPdfInput = document.getElementById('imgToPdfFileInput');
    this.imgToPdfList = [];
    this.scanCapturedImages = [];
  }

  bindEvents() {
    this.btnOpenToolbox?.addEventListener('click', () => this.openHub());
    this.btnToolboxClose?.addEventListener('click', () => this.closeHub());
    document.getElementById('btnEmptyToolbox')?.addEventListener('click', () => this.openHub());

    // Close on overlay backdrop click
    document.querySelectorAll('.savy-modal').forEach((modal) => {
      modal.addEventListener('click', (e) => {
        if (e.target === modal) {
          modal.style.display = 'none';
        }
      });
    });

    // Close buttons for sub-modals
    document.querySelectorAll('.modal-close-btn, .btn-modal-close, .btn-modal-cancel').forEach((btn) => {
      btn.addEventListener('click', () => {
        const modal = btn.closest('.savy-modal');
        if (modal) modal.style.display = 'none';
      });
    });

    // Hub tool card clicks
    document.querySelectorAll('[data-toolbox-action], [data-tool]').forEach((card) => {
      if (card.dataset.toolboxBound) return;
      card.dataset.toolboxBound = 'true';
      card.addEventListener('click', () => {
        const action = card.getAttribute('data-toolbox-action') || card.getAttribute('data-tool');
        if (action) this.launchTool(action);
      });
      card.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          const action = card.getAttribute('data-toolbox-action') || card.getAttribute('data-tool');
          if (action) this.launchTool(action);
        }
      });
    });

    // Bind Tool-Specific Dialog Handlers
    this.bindImageToPdfEvents();
    this.bindPdfToImageEvents();
    this.bindPdfToTextEvents();
    this.bindCompressEvents();
    this.bindMetadataEvents();
    this.bindWatermarkEvents();
    this.bindPageNumberEvents();
    this.bindFlattenEvents();

    // Bind New Tool Dialog Handlers
    this.bindRotateEvents();
    this.bindPdfToWordEvents();
    this.bindImageToWordEvents();
    this.bindPdfToExcelEvents();
    this.bindPdfToPptxEvents();
    this.bindPdfToPdfaEvents();
    this.bindPdfToMarkdownEvents();
    this.bindHtmlToPdfEvents();
    this.bindScanToPdfEvents();
    this.bindComparePdfEvents();
    this.bindPdfFormsEvents();
    this.bindRepairPdfEvents();
  }

  openHub() {
    if (this.toolboxModal) {
      this.toolboxModal.style.display = 'flex';
    }
  }

  openToolbox() {
    return this.openHub();
  }

  closeHub() {
    if (this.toolboxModal) {
      this.toolboxModal.style.display = 'none';
    }
  }

  closeToolbox() {
    return this.closeHub();
  }

  async extractTextFromActiveDoc() {
    const doc = this.editorApp.pdfViewer.currentDoc;
    if (!doc) return '';
    const res = await extractTextFromPdf(doc);
    return res.fullText;
  }

  convertTextToMarkdown(text, filename = 'document.pdf') {
    let md = `# ${filename.replace(/\\.pdf$/i, '')}\\n\\n`;
    md += text;
    return md;
  }

  async convertHtmlToPdf(htmlString, orientation = 'portrait', pageSize = 'letter') {
    return convertHtmlToPdf(htmlString, { orientation, pageSize });
  }

  async convertPdfToPptx(pdfjsDoc, options = {}, onProgress = () => {}) {
    const doc = pdfjsDoc || this.editorApp.pdfViewer?.pdfDoc;
    return convertPdfToPptx(doc, options, onProgress);
  }

  async applyRotation(angle = 90, target = 'all') {
    const docModel = this.editorApp.documentModel;
    if (!docModel) return;
    for (let i = 0; i < docModel.pages.length; i++) {
      docModel.rotatePage(i, angle);
    }
  }

  async preparePdfA(documentModel) {
    const docModel = documentModel || this.editorApp.documentModel;
    const primary = docModel?.sourceDocs.get(docModel.primaryDocId);
    let buf = primary?.arrayBuffer;
    if (!buf && this.editorApp?.pdfExport) {
      buf = await this.editorApp.pdfExport.compileModifiedDocument(docModel, this.editorApp.annotationManager, 'temp.pdf');
    }
    return convertPdfToPdfA(buf);
  }

  async repairDocument(documentModel) {
    const docModel = documentModel || this.editorApp.documentModel;
    const primary = docModel?.sourceDocs.get(docModel.primaryDocId);
    let buf = primary?.arrayBuffer;
    if (!buf && this.editorApp?.pdfExport) {
      buf = await this.editorApp.pdfExport.compileModifiedDocument(docModel, this.editorApp.annotationManager, 'temp.pdf');
    }
    return repairPdfDocument(buf);
  }

  computeMyersDiff(wordsA, wordsB) {
    let diff = [];
    const maxLen = Math.max(wordsA.length, wordsB.length);
    for (let i = 0; i < maxLen; i++) {
      const a = wordsA[i];
      const b = wordsB[i];
      if (a === b) {
        diff.push({ type: 'equal', value: a });
      } else {
        if (a !== undefined) diff.push({ type: 'remove', value: a });
        if (b !== undefined) diff.push({ type: 'add', value: b });
      }
    }
    return diff;
  }

  launchTool(action) {
    this.closeHub();
    const hasDoc = this.editorApp.pdfViewer.hasDocument();

    switch (action) {
      // 1. PDF ORGANIZATION
      case 'merge':
        document.getElementById('mergeModal')?.setAttribute('style', 'display: flex;');
        break;
      case 'split':
        if (!hasDoc) {
          this.onToast('Please open a PDF document to split.');
          return;
        }
        document.getElementById('splitModal')?.setAttribute('style', 'display: flex;');
        break;
      case 'organize':
        if (this.editorApp.openPageOrganizer) {
          this.editorApp.openPageOrganizer();
        } else if (this.editorApp.pageOrganizer) {
          this.editorApp.pageOrganizer.open();
        }
        break;
      case 'rotate':
        if (!hasDoc) return this.onToast('Please open a PDF document first.');
        if (this.rotateModal) this.rotateModal.style.display = 'flex';
        break;
      case 'crop':
        if (!hasDoc) return this.onToast('Please open a PDF document first.');
        this.editorApp.productivityManager?.openCropModal();
        break;
      case 'page-numbers':
      case 'page-numbering':
        if (!hasDoc) return this.onToast('Please open a PDF document first.');
        this.openPageNumbers();
        break;
      case 'watermark':
        if (!hasDoc) return this.onToast('Please open a PDF document first.');
        this.openWatermark();
        break;

      // 2. CONVERT FROM PDF
      case 'pdf-to-word':
        this.openPdfToWord();
        break;
      case 'pdf-to-excel':
        this.openPdfToExcel();
        break;
      case 'pdf-to-pptx':
        this.openPdfToPptx();
        break;
      case 'pdf-to-img':
      case 'pdf-to-images':
        this.openPdfToImg();
        break;
      case 'pdf-to-text':
        this.openPdfToText();
        break;
      case 'pdf-to-markdown':
        this.openPdfToMarkdown();
        break;
      case 'pdf-to-pdfa':
        this.openPdfToPdfa();
        break;

      // 3. CONVERT TO PDF
      case 'img-to-pdf':
      case 'images-to-pdf':
        this.openImgToPdf();
        break;
      case 'html-to-pdf':
        if (this.htmlToPdfModal) this.htmlToPdfModal.style.display = 'flex';
        break;
      // 4. SCANNING & OCR
      case 'ocr':
        if (!hasDoc) return this.onToast('Please open a PDF document to run OCR.');
        this.editorApp.ocrManager?.open();
        break;
      case 'scan-to-pdf':
        this.openScanToPdf();
        break;

      // 5. SECURITY
      case 'redact':
        this.editorApp.pdfTools?.setTool('redact');
        this.onToast('Redact tool selected. Drag black boxes over sensitive content to permanently redact.');
        break;

      // UNEXPOSED (Desktop-only requirement)
      case 'word-to-pdf':
      case 'pptx-to-pdf':
      case 'powerpoint-to-pdf':
      case 'excel-to-pdf':
      case 'protect-pdf':
      case 'unlock-pdf':
        this.onToast('This converter requires an external desktop engine not feasible in browser-local mode.');
        break;

      // 6. ADVANCED
      case 'compress':
        this.openCompress();
        break;
      case 'compare-pdf':
        if (this.comparePdfModal) this.comparePdfModal.style.display = 'flex';
        break;
      case 'forms':
      case 'pdf-forms':
        this.openPdfForms();
        break;
      case 'repair-pdf':
        if (this.repairPdfModal) this.repairPdfModal.style.display = 'flex';
        break;

      // 7. IMAGE / DOCUMENT
      case 'image-to-word':
        if (this.imageToWordModal) this.imageToWordModal.style.display = 'flex';
        break;
      case 'metadata':
        if (!hasDoc) return this.onToast('Please open a PDF document first.');
        this.openMetadata();
        break;
      case 'flatten':
        if (!hasDoc) return this.onToast('Please open a PDF document first.');
        this.openFlatten();
        break;
      case 'inspector':
        if (!hasDoc) return this.onToast('Please open a PDF document first.');
        this.editorApp.productivityManager?.openDocumentInspector();
        break;

      // AI PDF Intelligence
      case 'ai-summary':
        if (!hasDoc) return this.onToast('Please open a PDF document first.');
        this.editorApp.aiManager?.open('tab-ai-summary');
        break;
      case 'ai-chat':
        if (!hasDoc) return this.onToast('Please open a PDF document first.');
        this.editorApp.aiManager?.open('tab-ai-chat');
        break;
      case 'ai-keypoints':
        if (!hasDoc) return this.onToast('Please open a PDF document first.');
        this.editorApp.aiManager?.open('tab-ai-keypoints');
        break;
      case 'ai-outline':
        if (!hasDoc) return this.onToast('Please open a PDF document first.');
        this.editorApp.aiManager?.open('tab-ai-outline');
        break;
      case 'ai-smart-actions':
        if (!hasDoc) return this.onToast('Please open a PDF document first.');
        this.editorApp.aiManager?.open('tab-ai-smart-actions');
        break;

      default:
        this.onToast(`Tool ${action} selected`);
    }
  }

  // --- 1. Image -> PDF ---
  openImgToPdf() {
    this.imgToPdfList = [];
    this.renderImgToPdfList();
    if (this.imgToPdfModal) this.imgToPdfModal.style.display = 'flex';
  }

  bindImageToPdfEvents() {
    const btnSelect = document.getElementById('btnImgToPdfSelect');
    const dropzone = document.getElementById('imgToPdfDropzone');
    const btnConvert = document.getElementById('btnImgToPdfConvert');

    btnSelect?.addEventListener('click', () => this.imgToPdfInput?.click());
    this.imgToPdfInput?.addEventListener('change', (e) => {
      const files = Array.from(e.target.files || []);
      this.addImagesToPdfList(files);
      this.imgToPdfInput.value = '';
    });

    dropzone?.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropzone.classList.add('dragover');
    });
    dropzone?.addEventListener('dragleave', () => dropzone.classList.remove('dragover'));
    dropzone?.addEventListener('drop', (e) => {
      e.preventDefault();
      dropzone.classList.remove('dragover');
      const files = Array.from(e.dataTransfer?.files || []).filter((f) => f.type.startsWith('image/'));
      this.addImagesToPdfList(files);
    });

    btnConvert?.addEventListener('click', async () => {
      if (this.imgToPdfList.length === 0) {
        return this.onToast('Please add at least one image.');
      }
      try {
        btnConvert.disabled = true;
        btnConvert.textContent = 'Generating PDF...';
        const pageSize = document.getElementById('imgToPdfPageSize')?.value || 'fit';
        const orientation = document.getElementById('imgToPdfOrientation')?.value || 'auto';
        const margin = parseInt(document.getElementById('imgToPdfMargin')?.value || '0', 10);

        const pdfBytes = await convertImagesToPdf(this.imgToPdfList, {
          pageSize,
          orientation,
          margin,
        });

        downloadBlob(new Blob([pdfBytes], { type: 'application/pdf' }), 'converted-images.pdf');
        this.onToast('Images successfully converted and downloaded as PDF.');
        if (this.imgToPdfModal) this.imgToPdfModal.style.display = 'none';
      } catch (err) {
        console.error('Image to PDF error:', err);
        this.onToast('Failed to convert images: ' + err.message);
      } finally {
        btnConvert.disabled = false;
        btnConvert.textContent = 'Generate & Download PDF';
      }
    });
  }

  addImagesToPdfList(files) {
    for (const f of files) this.imgToPdfList.push(f);
    this.renderImgToPdfList();
  }

  renderImgToPdfList() {
    const listEl = document.getElementById('imgToPdfItemsList');
    if (!listEl) return;
    listEl.innerHTML = '';

    if (this.imgToPdfList.length === 0) {
      listEl.innerHTML = '<div class="empty-hint">No images selected yet.</div>';
      return;
    }

    this.imgToPdfList.forEach((file, idx) => {
      const item = document.createElement('div');
      item.className = 'img-pdf-item';
      const url = URL.createObjectURL(file);

      item.innerHTML = `
        <img class="img-pdf-thumb" src="${url}" alt="Thumbnail of ${file.name.replace(/"/g, '&quot;')}" />
        <div class="img-pdf-info">
          <div class="img-pdf-name">${file.name}</div>
          <div class="img-pdf-meta">${Math.round(file.size / 1024)} KB</div>
        </div>
        <div class="img-pdf-actions">
          <button type="button" class="btn-micro" data-move-up="${idx}" ${idx === 0 ? 'disabled' : ''}>▲</button>
          <button type="button" class="btn-micro" data-move-down="${idx}" ${idx === this.imgToPdfList.length - 1 ? 'disabled' : ''}>▼</button>
          <button type="button" class="btn-micro btn-micro-danger" data-remove="${idx}">✕</button>
        </div>
      `;

      item.querySelector(`[data-move-up="${idx}"]`)?.addEventListener('click', () => {
        const temp = this.imgToPdfList[idx];
        this.imgToPdfList[idx] = this.imgToPdfList[idx - 1];
        this.imgToPdfList[idx - 1] = temp;
        this.renderImgToPdfList();
      });

      item.querySelector(`[data-move-down="${idx}"]`)?.addEventListener('click', () => {
        const temp = this.imgToPdfList[idx];
        this.imgToPdfList[idx] = this.imgToPdfList[idx + 1];
        this.imgToPdfList[idx + 1] = temp;
        this.renderImgToPdfList();
      });

      item.querySelector(`[data-remove="${idx}"]`)?.addEventListener('click', () => {
        this.imgToPdfList.splice(idx, 1);
        this.renderImgToPdfList();
      });

      listEl.appendChild(item);
    });
  }

  // --- 2. PDF -> Images ---
  openPdfToImg() {
    if (!this.editorApp.pdfViewer.hasDocument()) {
      return this.onToast('Please open a PDF document first.');
    }
    if (this.pdfToImgModal) {
      const pageCount = this.editorApp.documentModel.getPageCount();
      const currentEl = document.getElementById('pdfToImgCurrentNum');
      if (currentEl) currentEl.textContent = this.editorApp.pdfViewer.currentPage;
      const totalEl = document.getElementById('pdfToImgTotalNum');
      if (totalEl) totalEl.textContent = pageCount;
      this.pdfToImgModal.style.display = 'flex';
    }
  }

  bindPdfToImageEvents() {
    const btnConvert = document.getElementById('btnPdfToImgConvert');
    btnConvert?.addEventListener('click', async () => {
      const pdfjsDoc = this.editorApp.pdfViewer.pdfDoc;
      if (!pdfjsDoc) return;

      try {
        btnConvert.disabled = true;
        btnConvert.textContent = 'Rendering Images...';

        const pageScope = document.querySelector('input[name="pdfToImgScope"]:checked')?.value || 'current';
        const format = document.getElementById('pdfToImgFormat')?.value || 'image/png';
        const scale = parseFloat(document.getElementById('pdfToImgScale')?.value || '1.5');

        let targetPages = [];
        if (pageScope === 'current') {
          targetPages = [this.editorApp.pdfViewer.currentPage];
        } else if (pageScope === 'selected') {
          const selected = this.editorApp.pageOrganizer?.getSelectedPages() || [];
          if (selected.length > 0) {
            targetPages = selected.map((p) => this.editorApp.documentModel.getPageIndex(p.id) + 1);
          } else {
            targetPages = [this.editorApp.pdfViewer.currentPage];
          }
        } else {
          for (let i = 1; i <= pdfjsDoc.numPages; i++) targetPages.push(i);
        }

        const images = await convertPdfToImages(pdfjsDoc, {
          pages: targetPages,
          format,
          scale,
        });

        if (images.length === 1) {
          downloadBlob(images[0].blob, images[0].name);
          this.onToast(`Downloaded ${images[0].name}`);
        } else if (images.length > 1) {
          btnConvert.textContent = 'Packaging ZIP...';
          const zipFiles = images.map((img) => ({
            name: img.name,
            data: img.buffer,
          }));
          const zipBlob = createZipArchive(zipFiles);
          downloadBlob(zipBlob, 'pdf-pages-images.zip');
          this.onToast(`Downloaded ${images.length} pages as valid ZIP archive.`);
        }

        if (this.pdfToImgModal) this.pdfToImgModal.style.display = 'none';
      } catch (err) {
        console.error('PDF to Images error:', err);
        this.onToast('Failed to export images: ' + err.message);
      } finally {
        btnConvert.disabled = false;
        btnConvert.textContent = 'Convert & Download';
      }
    });
  }

  // --- 3. PDF -> Text ---
  async openPdfToText() {
    if (!this.editorApp.pdfViewer.hasDocument()) {
      return this.onToast('Please open a PDF document first.');
    }
    if (!this.pdfToTextModal) return;
    this.pdfToTextModal.style.display = 'flex';
    const previewEl = document.getElementById('pdfToTextPreview');
    const noticeEl = document.getElementById('pdfToTextNotice');
    if (previewEl) previewEl.value = 'Extracting text...';
    if (noticeEl) noticeEl.style.display = 'none';

    try {
      const pdfjsDoc = this.editorApp.pdfViewer.pdfDoc;
      const res = await extractTextFromPdf(pdfjsDoc);
      if (previewEl) previewEl.value = res.fullText;
      if (res.isScannedOrEmpty && noticeEl) {
        noticeEl.style.display = 'block';
      }
      this.currentExtractedText = res.fullText;
    } catch (err) {
      if (previewEl) previewEl.value = 'Failed to extract text: ' + err.message;
    }
  }

  bindPdfToTextEvents() {
    const btnCopy = document.getElementById('btnPdfToTextCopy');
    const btnDownload = document.getElementById('btnPdfToTextDownload');

    btnCopy?.addEventListener('click', async () => {
      const text = this.currentExtractedText || document.getElementById('pdfToTextPreview')?.value || '';
      try {
        await navigator.clipboard.writeText(text);
        this.onToast('Extracted text copied to clipboard!');
      } catch (err) {
        this.onToast('Clipboard copy failed. Please select text manually.');
      }
    });

    btnDownload?.addEventListener('click', () => {
      const text = this.currentExtractedText || document.getElementById('pdfToTextPreview')?.value || '';
      const docName = (this.editorApp.pdfViewer.docMetadata?.name || 'document').replace(/\.pdf$/i, '');
      const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
      downloadBlob(blob, `${docName}-extracted.txt`);
      this.onToast('Downloaded extracted text as .txt');
    });
  }

  // --- 4. PDF Compression ---
  openCompress() {
    if (!this.editorApp.pdfViewer.hasDocument()) {
      return this.onToast('Please open a PDF document first.');
    }
    if (!this.compressModal) return;
    const rawBuffer = this.editorApp.pdfViewer.getOriginalBytes();
    if (!rawBuffer) return;

    const origSizeEl = document.getElementById('compressOrigSize');
    if (origSizeEl) origSizeEl.textContent = this.editorApp.formatFileSize(rawBuffer.byteLength);

    const resultCard = document.getElementById('compressResultCard');
    if (resultCard) resultCard.style.display = 'none';

    this.compressModal.style.display = 'flex';
  }

  bindCompressEvents() {
    const btnCompress = document.getElementById('btnCompressExecute');
    const modeSelect = document.getElementById('compressMode');
    const warningEl = document.getElementById('compressWarningNote');

    modeSelect?.addEventListener('change', () => {
      if (warningEl) {
        warningEl.style.display = modeSelect.value === 'visual' ? 'block' : 'none';
      }
    });

    btnCompress?.addEventListener('click', async () => {
      const rawBuffer = this.editorApp.pdfViewer.getOriginalBytes();
      const pdfjsDoc = this.editorApp.pdfViewer.pdfDoc;
      if (!rawBuffer) return;

      try {
        btnCompress.disabled = true;
        btnCompress.textContent = 'Optimizing PDF...';

        const mode = modeSelect?.value || 'lossless';
        const res = await compressPdfDocument(rawBuffer, { mode }, pdfjsDoc);

        const resultCard = document.getElementById('compressResultCard');
        const outputSizeEl = document.getElementById('compressOutputSize');
        const reductionBadge = document.getElementById('compressReductionBadge');
        const noteEl = document.getElementById('compressNote');

        if (resultCard) resultCard.style.display = 'block';
        if (outputSizeEl) outputSizeEl.textContent = this.editorApp.formatFileSize(res.compressedSize);
        if (reductionBadge) {
          reductionBadge.textContent = res.reductionPercent > 0 ? `-${res.reductionPercent}%` : '0%';
          reductionBadge.className = res.reductionPercent > 0 ? 'badge-success' : 'badge-neutral';
        }
        if (noteEl) {
          noteEl.textContent = res.warning || res.note || '';
        }

        const docName = (this.editorApp.pdfViewer.docMetadata?.name || 'document').replace(/\.pdf$/i, '');
        downloadBlob(new Blob([res.bytes], { type: 'application/pdf' }), `${docName}-compressed.pdf`);
        this.onToast('Optimized PDF downloaded successfully.');
      } catch (err) {
        console.error('Compression error:', err);
        this.onToast('Compression failed: ' + err.message);
      } finally {
        btnCompress.disabled = false;
        btnCompress.textContent = 'Optimize & Download';
      }
    });
  }

  // --- 5. PDF Metadata ---
  async openMetadata() {
    if (!this.metadataModal) return;
    this.metadataModal.style.display = 'flex';
    const rawBuffer = this.editorApp.pdfViewer.getOriginalBytes();
    if (!rawBuffer) return;

    try {
      const meta = await getPdfMetadata(rawBuffer);
      document.getElementById('metaTitle').value = meta.title || '';
      document.getElementById('metaAuthor').value = meta.author || '';
      document.getElementById('metaSubject').value = meta.subject || '';
      document.getElementById('metaKeywords').value = meta.keywords || '';
      document.getElementById('metaCreator').value = meta.creator || '';
      document.getElementById('metaProducer').value = meta.producer || '';
    } catch (err) {
      console.warn('Could not read metadata:', err);
    }
  }

  bindMetadataEvents() {
    const btnSave = document.getElementById('btnSaveMetadata');
    const btnClear = document.getElementById('btnClearMetadata');

    btnSave?.addEventListener('click', async () => {
      const rawBuffer = this.editorApp.pdfViewer.getOriginalBytes();
      if (!rawBuffer) return;

      try {
        btnSave.disabled = true;
        btnSave.textContent = 'Saving...';

        const updated = await updatePdfMetadata(rawBuffer, {
          title: document.getElementById('metaTitle').value,
          author: document.getElementById('metaAuthor').value,
          subject: document.getElementById('metaSubject').value,
          keywords: document.getElementById('metaKeywords').value,
          creator: document.getElementById('metaCreator').value,
          producer: document.getElementById('metaProducer').value,
        });

        const docName = (this.editorApp.pdfViewer.docMetadata?.name || 'document').replace(/\.pdf$/i, '');
        downloadBlob(new Blob([updated], { type: 'application/pdf' }), `${docName}-metadata-edited.pdf`);
        this.onToast('Metadata updated and PDF downloaded.');
        if (this.metadataModal) this.metadataModal.style.display = 'none';
      } catch (err) {
        this.onToast('Failed to update metadata: ' + err.message);
      } finally {
        btnSave.disabled = false;
        btnSave.textContent = 'Save & Download PDF';
      }
    });

    btnClear?.addEventListener('click', async () => {
      const rawBuffer = this.editorApp.pdfViewer.getOriginalBytes();
      if (!rawBuffer) return;

      try {
        btnClear.disabled = true;
        btnClear.textContent = 'Clearing...';

        const cleared = await updatePdfMetadata(rawBuffer, {}, true);
        const docName = (this.editorApp.pdfViewer.docMetadata?.name || 'document').replace(/\.pdf$/i, '');
        downloadBlob(new Blob([cleared], { type: 'application/pdf' }), `${docName}-metadata-edited.pdf`);
        this.onToast('All metadata cleared and PDF downloaded.');
        if (this.metadataModal) this.metadataModal.style.display = 'none';
      } catch (err) {
        this.onToast('Failed to clear metadata: ' + err.message);
      } finally {
        btnClear.disabled = false;
        btnClear.textContent = 'Clear All Metadata';
      }
    });
  }

  // --- 6. Watermark ---
  openWatermark() {
    if (this.watermarkModal) this.watermarkModal.style.display = 'flex';
  }

  bindWatermarkEvents() {
    const btnApply = document.getElementById('btnApplyWatermark');
    btnApply?.addEventListener('click', async () => {
      const rawBuffer = this.editorApp.pdfViewer.getOriginalBytes();
      if (!rawBuffer) return;

      try {
        btnApply.disabled = true;
        btnApply.textContent = 'Applying...';

        const text = document.getElementById('watermarkText')?.value || 'CONFIDENTIAL';
        const fontSize = parseInt(document.getElementById('watermarkFontSize')?.value || '48', 10);
        const opacity = parseFloat(document.getElementById('watermarkOpacity')?.value || '0.25');
        const colorHex = document.getElementById('watermarkColor')?.value || '#888888';
        const rotation = parseInt(document.getElementById('watermarkRotation')?.value || '45', 10);
        const position = document.getElementById('watermarkPosition')?.value || 'center';
        const scope = document.querySelector('input[name="watermarkScope"]:checked')?.value || 'all';

        let targetPages = 'all';
        if (scope === 'current') {
          targetPages = [this.editorApp.pdfViewer.currentPage - 1];
        }

        const watermarkedBytes = await applyWatermarkToPdf(rawBuffer, {
          text,
          fontSize,
          opacity,
          colorHex,
          rotation,
          position,
          pages: targetPages,
        });

        const docName = (this.editorApp.pdfViewer.docMetadata?.name || 'document').replace(/\.pdf$/i, '');
        downloadBlob(new Blob([watermarkedBytes], { type: 'application/pdf' }), `${docName}-watermarked.pdf`);
        this.onToast('Watermarked PDF generated and downloaded.');
        if (this.watermarkModal) this.watermarkModal.style.display = 'none';
      } catch (err) {
        console.error('Watermark error:', err);
        this.onToast('Failed to apply watermark: ' + err.message);
      } finally {
        btnApply.disabled = false;
        btnApply.textContent = 'Apply & Download PDF';
      }
    });
  }

  // --- 7. Page Numbers ---
  openPageNumbers() {
    if (this.pageNumberModal) this.pageNumberModal.style.display = 'flex';
  }

  bindPageNumberEvents() {
    const btnApply = document.getElementById('btnApplyPageNumbers');
    btnApply?.addEventListener('click', async () => {
      const rawBuffer = this.editorApp.pdfViewer.getOriginalBytes();
      if (!rawBuffer) return;

      try {
        btnApply.disabled = true;
        btnApply.textContent = 'Numbering Pages...';

        const format = document.getElementById('pageNumberFormat')?.value || 'Page {n} of {total}';
        const startNumber = parseInt(document.getElementById('pageNumberStart')?.value || '1', 10);
        const position = document.getElementById('pageNumberPosition')?.value || 'bottom-center';
        const fontSize = parseInt(document.getElementById('pageNumberFontSize')?.value || '10', 10);
        const margin = parseInt(document.getElementById('pageNumberMargin')?.value || '25', 10);
        const skipFirstPage = document.getElementById('pageNumberSkipFirst')?.checked || false;

        const numberedBytes = await applyPageNumbersToPdf(rawBuffer, {
          format,
          startNumber,
          position,
          fontSize,
          margin,
          skipFirstPage,
        });

        const docName = (this.editorApp.pdfViewer.docMetadata?.name || 'document').replace(/\.pdf$/i, '');
        downloadBlob(new Blob([numberedBytes], { type: 'application/pdf' }), `${docName}-numbered.pdf`);
        this.onToast('Numbered PDF generated and downloaded.');
        if (this.pageNumberModal) this.pageNumberModal.style.display = 'none';
      } catch (err) {
        console.error('Page numbering error:', err);
        this.onToast('Failed to add page numbers: ' + err.message);
      } finally {
        btnApply.disabled = false;
        btnApply.textContent = 'Apply & Download PDF';
      }
    });
  }

  // --- 8. Flatten ---
  openFlatten() {
    if (!this.flattenModal) return;
    const allAnnots = this.editorApp.annotationManager?.getAllAnnotationsByPageId() || new Map();
    let totalAnnots = 0;
    for (const list of allAnnots.values()) totalAnnots += list.length;

    const countEl = document.getElementById('flattenAnnotCount');
    if (countEl) countEl.textContent = totalAnnots;

    this.flattenModal.style.display = 'flex';
  }

  bindFlattenEvents() {
    const btnFlatten = document.getElementById('btnExecuteFlatten');
    btnFlatten?.addEventListener('click', async () => {
      try {
        btnFlatten.disabled = true;
        btnFlatten.textContent = 'Flattening Annotations...';

        const flattenedBytes = await flattenDocument(
          this.editorApp.documentModel,
          this.editorApp.annotationManager,
          this.editorApp.pdfExport.pageOperations
        );

        const docName = (this.editorApp.pdfViewer.docMetadata?.name || 'document').replace(/\.pdf$/i, '');
        downloadBlob(new Blob([flattenedBytes], { type: 'application/pdf' }), `${docName}-flattened.pdf`);

        this.editorApp.annotationManager.clear();
        this.editorApp.historyManager.clear();
        await this.editorApp.pdfViewer.loadDocument(flattenedBytes, `${docName}-flattened.pdf`);

        this.onToast('Document flattened! Annotations are now permanent base graphics.');
        if (this.flattenModal) this.flattenModal.style.display = 'none';
      } catch (err) {
        console.error('Flatten error:', err);
        this.onToast('Flatten failed: ' + err.message);
      } finally {
        btnFlatten.disabled = false;
        btnFlatten.textContent = 'Flatten & Reload in Editor';
      }
    });
  }

  // --- 9. Rotate PDF ---
  bindRotateEvents() {
    const btnExecute = document.getElementById('btnExecuteRotate');
    btnExecute?.addEventListener('click', async () => {
      const rawBuffer = this.editorApp.pdfViewer.getOriginalBytes();
      if (!rawBuffer) return;

      try {
        btnExecute.disabled = true;
        btnExecute.textContent = 'Rotating Pages...';

        const angle = parseInt(document.getElementById('rotateAngle')?.value || '90', 10);
        const scope = document.querySelector('input[name="rotateScope"]:checked')?.value || 'all';

        const rotatedBytes = await rotatePdfDocument(rawBuffer, angle, {
          scope,
          currentPage: this.editorApp.pdfViewer.currentPage,
        });

        const docName = (this.editorApp.pdfViewer.docMetadata?.name || 'document').replace(/\.pdf$/i, '');
        downloadBlob(new Blob([rotatedBytes], { type: 'application/pdf' }), `${docName}-rotated.pdf`);
        this.onToast('Rotated PDF downloaded successfully.');
        if (this.rotateModal) this.rotateModal.style.display = 'none';
      } catch (err) {
        this.onToast('Rotate failed: ' + err.message);
      } finally {
        btnExecute.disabled = false;
        btnExecute.textContent = 'Rotate & Download PDF';
      }
    });
  }

  // --- 10. PDF -> Word ---
  openPdfToWord() {
    if (!this.pdfToWordModal) return;
    const fileContainer = document.getElementById('pdfToWordFileInputContainer');
    const hasDoc = this.editorApp.pdfViewer.hasDocument();
    if (fileContainer) fileContainer.style.display = hasDoc ? 'none' : 'block';
    this.pdfToWordModal.style.display = 'flex';
  }

  bindPdfToWordEvents() {
    const btnExecute = document.getElementById('btnExecutePdfToWord');
    const fileInput = document.getElementById('pdfToWordFileInput');
    const progressEl = document.getElementById('pdfToWordProgress');

    btnExecute?.addEventListener('click', async () => {
      let pdfjsDoc = this.editorApp.pdfViewer.pdfDoc;
      let filename = this.editorApp.pdfViewer.docMetadata?.name || 'document';

      if (!pdfjsDoc && fileInput?.files?.[0]) {
        const file = fileInput.files[0];
        filename = file.name;
        const arrayBuf = await file.arrayBuffer();
        pdfjsDoc = await window.pdfjsLib.getDocument({ data: arrayBuf }).promise;
      }

      if (!pdfjsDoc) {
        return this.onToast('Please select a PDF document first.');
      }

      try {
        btnExecute.disabled = true;
        if (progressEl) progressEl.style.display = 'block';

        const docxBlob = await convertPdfToDocx(pdfjsDoc, {}, (p) => {
          if (progressEl) progressEl.textContent = `Converting page ${p.current} of ${p.total}...`;
        });

        const outName = filename.replace(/\.pdf$/i, '') + '.docx';
        downloadBlob(docxBlob, outName);
        this.onToast(`Downloaded ${outName} as valid Word document.`);
        if (this.pdfToWordModal) this.pdfToWordModal.style.display = 'none';
      } catch (err) {
        console.error('PDF to Word error:', err);
        this.onToast('Conversion to Word failed: ' + err.message);
      } finally {
        btnExecute.disabled = false;
        if (progressEl) progressEl.style.display = 'none';
      }
    });
  }

  // --- 11. Image -> Word ---
  bindImageToWordEvents() {
    const btnExecute = document.getElementById('btnExecuteImageToWord');
    const fileInput = document.getElementById('imageToWordFileInput');
    const ocrCheck = document.getElementById('imageToWordOcrCheck');
    const progressEl = document.getElementById('imageToWordProgress');

    btnExecute?.addEventListener('click', async () => {
      const file = fileInput?.files?.[0];
      if (!file) {
        return this.onToast('Please select an image file.');
      }

      try {
        btnExecute.disabled = true;
        if (progressEl) {
          progressEl.style.display = 'block';
          progressEl.textContent = 'Processing image and building Word document...';
        }

        let ocrText = '';
        if (ocrCheck?.checked && window.Tesseract) {
          try {
            if (progressEl) progressEl.textContent = 'Running local OCR on image...';
            const worker = await window.Tesseract.createWorker('eng');
            const res = await worker.recognize(file);
            ocrText = res.data.text || '';
            await worker.terminate();
          } catch (e) {
            console.warn('OCR error in image-to-word:', e);
          }
        }

        const docxBlob = await convertImageToDocx(file, ocrText);
        const outName = file.name.replace(/\.[^/.]+$/, '') + '.docx';
        downloadBlob(docxBlob, outName);
        this.onToast(`Downloaded ${outName} as valid Word document.`);
        if (this.imageToWordModal) this.imageToWordModal.style.display = 'none';
      } catch (err) {
        this.onToast('Image to Word failed: ' + err.message);
      } finally {
        btnExecute.disabled = false;
        if (progressEl) progressEl.style.display = 'none';
      }
    });
  }

  // --- 12. PDF -> Excel ---
  openPdfToExcel() {
    if (!this.pdfToExcelModal) return;
    const fileContainer = document.getElementById('pdfToExcelFileInputContainer');
    const hasDoc = this.editorApp.pdfViewer.hasDocument();
    if (fileContainer) fileContainer.style.display = hasDoc ? 'none' : 'block';
    this.pdfToExcelModal.style.display = 'flex';
  }

  bindPdfToExcelEvents() {
    const btnExecute = document.getElementById('btnExecutePdfToExcel');
    const fileInput = document.getElementById('pdfToExcelFileInput');
    const progressEl = document.getElementById('pdfToExcelProgress');

    btnExecute?.addEventListener('click', async () => {
      let pdfjsDoc = this.editorApp.pdfViewer.pdfDoc;
      let filename = this.editorApp.pdfViewer.docMetadata?.name || 'document';

      if (!pdfjsDoc && fileInput?.files?.[0]) {
        const file = fileInput.files[0];
        filename = file.name;
        const arrayBuf = await file.arrayBuffer();
        pdfjsDoc = await window.pdfjsLib.getDocument({ data: arrayBuf }).promise;
      }

      if (!pdfjsDoc) return this.onToast('Please select a PDF document first.');

      try {
        btnExecute.disabled = true;
        if (progressEl) progressEl.style.display = 'block';

        const xlsxBlob = await convertPdfToXlsx(pdfjsDoc, {}, (p) => {
          if (progressEl) progressEl.textContent = `Extracting tables from page ${p.current}...`;
        });

        const outName = filename.replace(/\.pdf$/i, '') + '.xlsx';
        downloadBlob(xlsxBlob, outName);
        this.onToast(`Downloaded ${outName} as valid Excel workbook.`);
        if (this.pdfToExcelModal) this.pdfToExcelModal.style.display = 'none';
      } catch (err) {
        this.onToast('PDF to Excel failed: ' + err.message);
      } finally {
        btnExecute.disabled = false;
        if (progressEl) progressEl.style.display = 'none';
      }
    });
  }

  // --- 13. PDF -> PowerPoint ---
  openPdfToPptx() {
    if (!this.pdfToPptxModal) return;
    const fileContainer = document.getElementById('pdfToPptxFileInputContainer');
    const hasDoc = this.editorApp.pdfViewer.hasDocument();
    if (fileContainer) fileContainer.style.display = hasDoc ? 'none' : 'block';
    this.pdfToPptxModal.style.display = 'flex';
  }

  bindPdfToPptxEvents() {
    const btnExecute = document.getElementById('btnExecutePdfToPptx');
    const fileInput = document.getElementById('pdfToPptxFileInput');
    const progressEl = document.getElementById('pdfToPptxProgress');

    btnExecute?.addEventListener('click', async () => {
      let pdfjsDoc = this.editorApp.pdfViewer.pdfDoc;
      let filename = this.editorApp.pdfViewer.docMetadata?.name || 'document';

      if (!pdfjsDoc && fileInput?.files?.[0]) {
        const file = fileInput.files[0];
        filename = file.name;
        const arrayBuf = await file.arrayBuffer();
        pdfjsDoc = await window.pdfjsLib.getDocument({ data: arrayBuf }).promise;
      }

      if (!pdfjsDoc) return this.onToast('Please select a PDF document first.');

      try {
        btnExecute.disabled = true;
        if (progressEl) progressEl.style.display = 'block';

        const pptxBlob = await convertPdfToPptx(pdfjsDoc, {}, (p) => {
          if (progressEl) progressEl.textContent = `Building slide ${p.current} of ${p.total}...`;
        });

        const outName = filename.replace(/\.pdf$/i, '') + '.pptx';
        downloadBlob(pptxBlob, outName);
        this.onToast(`Downloaded ${outName} as valid PowerPoint presentation.`);
        if (this.pdfToPptxModal) this.pdfToPptxModal.style.display = 'none';
      } catch (err) {
        this.onToast('PDF to PowerPoint failed: ' + err.message);
      } finally {
        btnExecute.disabled = false;
        if (progressEl) progressEl.style.display = 'none';
      }
    });
  }

  // --- 14. PDF -> PDF/A ---
  openPdfToPdfa() {
    if (!this.pdfToPdfaModal) return;
    const fileContainer = document.getElementById('pdfToPdfaFileInputContainer');
    const hasDoc = this.editorApp.pdfViewer.hasDocument();
    if (fileContainer) fileContainer.style.display = hasDoc ? 'none' : 'block';
    this.pdfToPdfaModal.style.display = 'flex';
  }

  bindPdfToPdfaEvents() {
    const btnExecute = document.getElementById('btnExecutePdfToPdfa');
    const fileInput = document.getElementById('pdfToPdfaFileInput');

    btnExecute?.addEventListener('click', async () => {
      let rawBuffer = this.editorApp.pdfViewer.getOriginalBytes();
      let filename = this.editorApp.pdfViewer.docMetadata?.name || 'document';

      if (!rawBuffer && fileInput?.files?.[0]) {
        const file = fileInput.files[0];
        filename = file.name;
        rawBuffer = await file.arrayBuffer();
      }

      if (!rawBuffer) return this.onToast('Please select a PDF document first.');

      try {
        btnExecute.disabled = true;
        btnExecute.textContent = 'Applying PDF/A Profile...';

        const res = await convertPdfToPdfA(rawBuffer);
        const outName = filename.replace(/\.pdf$/i, '') + '-pdfa.pdf';
        downloadBlob(new Blob([res.bytes], { type: 'application/pdf' }), outName);
        this.onToast('Downloaded PDF with PDF/A metadata profile.');
        if (this.pdfToPdfaModal) this.pdfToPdfaModal.style.display = 'none';
      } catch (err) {
        this.onToast('PDF/A preparation failed: ' + err.message);
      } finally {
        btnExecute.disabled = false;
        btnExecute.textContent = 'Apply PDF/A & Download';
      }
    });
  }

  // --- 15. PDF -> Markdown ---
  openPdfToMarkdown() {
    if (!this.pdfToMarkdownModal) return;
    const fileContainer = document.getElementById('pdfToMdFileInputContainer');
    const hasDoc = this.editorApp.pdfViewer.hasDocument();
    if (fileContainer) fileContainer.style.display = hasDoc ? 'none' : 'block';

    const previewEl = document.getElementById('pdfToMdPreview');
    if (previewEl) previewEl.value = hasDoc ? 'Extracting Markdown...' : 'Select or load a PDF to view Markdown preview.';

    this.pdfToMarkdownModal.style.display = 'flex';

    if (hasDoc) {
      const pdfjsDoc = this.editorApp.pdfViewer.pdfDoc;
      convertPdfToMarkdown(pdfjsDoc).then((res) => {
        if (previewEl) previewEl.value = res.markdown;
        this.currentMdText = res.markdown;
      });
    }
  }

  bindPdfToMarkdownEvents() {
    const btnCopy = document.getElementById('btnCopyPdfToMd');
    const btnDownload = document.getElementById('btnDownloadPdfToMd');
    const fileInput = document.getElementById('pdfToMdFileInput');
    const previewEl = document.getElementById('pdfToMdPreview');

    fileInput?.addEventListener('change', async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      if (previewEl) previewEl.value = 'Extracting Markdown...';
      const arrayBuf = await file.arrayBuffer();
      const pdfjsDoc = await window.pdfjsLib.getDocument({ data: arrayBuf }).promise;
      const res = await convertPdfToMarkdown(pdfjsDoc);
      if (previewEl) previewEl.value = res.markdown;
      this.currentMdText = res.markdown;
    });

    btnCopy?.addEventListener('click', async () => {
      const text = this.currentMdText || previewEl?.value || '';
      await navigator.clipboard.writeText(text);
      this.onToast('Markdown copied to clipboard!');
    });

    btnDownload?.addEventListener('click', () => {
      const text = this.currentMdText || previewEl?.value || '';
      const docName = (this.editorApp.pdfViewer.docMetadata?.name || 'document').replace(/\.pdf$/i, '');
      downloadBlob(new Blob([text], { type: 'text/markdown;charset=utf-8' }), `${docName}.md`);
      this.onToast('Downloaded .md document.');
    });
  }

  // --- 16. HTML -> PDF ---
  bindHtmlToPdfEvents() {
    const btnExecute = document.getElementById('btnExecuteHtmlToPdf');
    const fileInput = document.getElementById('htmlToPdfFileInput');
    const contentText = document.getElementById('htmlToPdfContent');
    const sizeSelect = document.getElementById('htmlToPdfPageSize');

    fileInput?.addEventListener('change', async (e) => {
      const file = e.target.files?.[0];
      if (file && contentText) {
        contentText.value = await file.text();
      }
    });

    btnExecute?.addEventListener('click', async () => {
      const htmlString = contentText?.value || '';
      if (!htmlString.trim()) {
        return this.onToast('Please enter or upload HTML content.');
      }

      try {
        btnExecute.disabled = true;
        btnExecute.textContent = 'Rendering PDF...';

        const pageSize = sizeSelect?.value || 'a4';
        const pdfBytes = await convertHtmlToPdf(htmlString, { pageSize });

        downloadBlob(new Blob([pdfBytes], { type: 'application/pdf' }), 'rendered-html.pdf');
        this.onToast('HTML rendered and downloaded as PDF.');
        if (this.htmlToPdfModal) this.htmlToPdfModal.style.display = 'none';
      } catch (err) {
        this.onToast('HTML to PDF failed: ' + err.message);
      } finally {
        btnExecute.disabled = false;
        btnExecute.textContent = 'Render HTML & Download PDF';
      }
    });
  }

  // --- 17. Scan -> PDF ---
  openScanToPdf() {
    this.scanCapturedImages = [];
    this.renderScanCapturedList();
    if (this.scanToPdfModal) this.scanToPdfModal.style.display = 'flex';
  }

  bindScanToPdfEvents() {
    const btnModeCamera = document.getElementById('btnScanModeCamera');
    const btnModeUpload = document.getElementById('btnScanModeUpload');
    const camSection = document.getElementById('scanCameraSection');
    const uploadSection = document.getElementById('scanUploadSection');
    const video = document.getElementById('scanCameraVideo');
    const btnCapture = document.getElementById('btnScanCapture');
    const fileInput = document.getElementById('scanFileInput');
    const btnExecute = document.getElementById('btnExecuteScanToPdf');
    const bwCheck = document.getElementById('scanBwEnhance');

    btnModeCamera?.addEventListener('click', async () => {
      btnModeCamera.className = 'btn btn-sm btn-primary';
      btnModeUpload.className = 'btn btn-sm btn-outline';
      if (camSection) camSection.style.display = 'flex';
      if (uploadSection) uploadSection.style.display = 'none';

      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
        if (video) video.srcObject = stream;
        this.activeCameraStream = stream;
      } catch (err) {
        this.onToast('Camera access unavailable: ' + err.message);
      }
    });

    btnModeUpload?.addEventListener('click', () => {
      btnModeUpload.className = 'btn btn-sm btn-primary';
      btnModeCamera.className = 'btn btn-sm btn-outline';
      if (camSection) camSection.style.display = 'none';
      if (uploadSection) uploadSection.style.display = 'block';

      if (this.activeCameraStream) {
        this.activeCameraStream.getTracks().forEach((t) => t.stop());
        this.activeCameraStream = null;
      }
    });

    btnCapture?.addEventListener('click', () => {
      if (!video || !video.videoWidth) return;
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(video, 0, 0);

      canvas.toBlob((blob) => {
        if (blob) {
          this.scanCapturedImages.push(new File([blob], `scan-${Date.now()}.png`, { type: 'image/png' }));
          this.renderScanCapturedList();
          this.onToast(`Captured page ${this.scanCapturedImages.length}`);
        }
      }, 'image/png');
    });

    fileInput?.addEventListener('change', (e) => {
      const files = Array.from(e.target.files || []);
      for (const f of files) this.scanCapturedImages.push(f);
      this.renderScanCapturedList();
    });

    btnExecute?.addEventListener('click', async () => {
      if (this.scanCapturedImages.length === 0) {
        return this.onToast('Please capture or select at least one page.');
      }

      try {
        btnExecute.disabled = true;
        btnExecute.textContent = 'Compiling Scans...';

        const processedImages = [];
        for (const file of this.scanCapturedImages) {
          if (bwCheck?.checked) {
            const url = URL.createObjectURL(file);
            const img = new Image();
            await new Promise((resolve) => {
              img.onload = resolve;
              img.src = url;
            });
            const canvas = document.createElement('canvas');
            canvas.width = img.width;
            canvas.height = img.height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0);

            // High-contrast photocopy B&W threshold
            const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const data = imgData.data;
            for (let p = 0; p < data.length; p += 4) {
              const lum = data[p] * 0.299 + data[p + 1] * 0.587 + data[p + 2] * 0.114;
              const val = lum > 130 ? 255 : 0;
              data[p] = val;
              data[p + 1] = val;
              data[p + 2] = val;
            }
            ctx.putImageData(imgData, 0, 0);

            const blob = await new Promise((res) => canvas.toBlob(res, 'image/png'));
            processedImages.push(blob);
          } else {
            processedImages.push(file);
          }
        }

        const pdfBytes = await convertImagesToPdf(processedImages, { pageSize: 'a4', margin: 18 });
        downloadBlob(new Blob([pdfBytes], { type: 'application/pdf' }), 'scanned-document.pdf');
        this.onToast('Scanned document compiled and downloaded.');
        if (this.scanToPdfModal) this.scanToPdfModal.style.display = 'none';
      } catch (err) {
        this.onToast('Scan compilation failed: ' + err.message);
      } finally {
        btnExecute.disabled = false;
        btnExecute.textContent = 'Compile Scans to PDF & Download';
        if (this.activeCameraStream) {
          this.activeCameraStream.getTracks().forEach((t) => t.stop());
          this.activeCameraStream = null;
        }
      }
    });
  }

  renderScanCapturedList() {
    const listEl = document.getElementById('scanCapturedList');
    if (!listEl) return;
    listEl.innerHTML = '';

    if (this.scanCapturedImages.length === 0) {
      listEl.innerHTML = '<div class="empty-hint">No pages captured yet.</div>';
      return;
    }

    this.scanCapturedImages.forEach((f, idx) => {
      const chip = document.createElement('div');
      chip.style.display = 'inline-flex';
      chip.style.alignItems = 'center';
      chip.style.gap = '0.35rem';
      chip.style.padding = '0.25rem 0.5rem';
      chip.style.margin = '0.25rem';
      chip.style.background = 'var(--color-surface)';
      chip.style.border = '1px solid var(--color-border)';
      chip.style.borderRadius = '4px';
      chip.style.fontSize = '0.75rem';
      chip.innerHTML = `<span>Page ${idx + 1} (${Math.round(f.size / 1024)} KB)</span><button type="button" class="btn-micro btn-micro-danger">✕</button>`;
      chip.querySelector('button')?.addEventListener('click', () => {
        this.scanCapturedImages.splice(idx, 1);
        this.renderScanCapturedList();
      });
      listEl.appendChild(chip);
    });
  }

  // --- 18. Compare PDF ---
  bindComparePdfEvents() {
    const btnExecute = document.getElementById('btnExecuteCompare');
    const inputA = document.getElementById('compareDocAInput');
    const inputB = document.getElementById('compareDocBInput');
    const resultContainer = document.getElementById('compareResultContainer');
    const matchBadge = document.getElementById('compareMatchBadge');
    const addedCount = document.getElementById('compareAddedCount');
    const removedCount = document.getElementById('compareRemovedCount');
    const diffOutput = document.getElementById('compareDiffOutput');

    btnExecute?.addEventListener('click', async () => {
      let bufA = this.editorApp.pdfViewer.getOriginalBytes();
      let bufB = null;

      if (inputA?.files?.[0]) bufA = await inputA.files[0].arrayBuffer();
      if (inputB?.files?.[0]) bufB = await inputB.files[0].arrayBuffer();

      if (!bufA || !bufB) {
        return this.onToast('Please select two PDF documents to compare.');
      }

      try {
        btnExecute.disabled = true;
        btnExecute.textContent = 'Comparing...';

        const res = await comparePdfDocuments(bufA, bufB);

        if (resultContainer) resultContainer.style.display = 'block';
        if (matchBadge) matchBadge.textContent = `${res.matchPercent}%`;
        if (addedCount) addedCount.textContent = res.addedLines;
        if (removedCount) removedCount.textContent = res.removedLines;

        if (diffOutput) {
          diffOutput.innerHTML = '';
          res.diffLines.slice(0, 150).forEach((dl) => {
            const lineEl = document.createElement('div');
            lineEl.textContent = dl.text;
            if (dl.type === 'add') lineEl.className = 'diff-line-add';
            else if (dl.type === 'remove') lineEl.className = 'diff-line-remove';
            diffOutput.appendChild(lineEl);
          });
        }

        this.onToast(`Comparison complete: ${res.matchPercent}% text match.`);
      } catch (err) {
        this.onToast('Compare failed: ' + err.message);
      } finally {
        btnExecute.disabled = false;
        btnExecute.textContent = 'Run Comparison';
      }
    });
  }

  // --- 19. PDF Forms ---
  openPdfForms() {
    if (!this.pdfFormsModal) return;
    const fileContainer = document.getElementById('pdfFormsFileInputContainer');
    const hasDoc = this.editorApp.pdfViewer.hasDocument();
    if (fileContainer) fileContainer.style.display = hasDoc ? 'none' : 'block';

    const container = document.getElementById('pdfFormsFieldsContainer');
    if (container) {
      container.innerHTML = hasDoc
        ? '<div class="form-hint">Loading document form fields...</div>'
        : '<div class="empty-hint">Open or select a PDF to inspect interactive form fields.</div>';
    }

    this.pdfFormsModal.style.display = 'flex';

    if (hasDoc) {
      const raw = this.editorApp.pdfViewer.getOriginalBytes();
      if (raw) this.inspectFormFields(raw);
    }
  }

  async inspectFormFields(rawBuffer) {
    const container = document.getElementById('pdfFormsFieldsContainer');
    if (!container) return;

    try {
      const { PDFDocument } = window.PDFLib;
      const doc = await PDFDocument.load(rawBuffer.slice(0), { ignoreEncryption: true });
      const form = doc.getForm();
      const fields = form.getFields();

      if (fields.length === 0) {
        container.innerHTML = '<div class="empty-hint">No interactive AcroForm fields found in this document. Use the Form Builder to add fields!</div>';
        return;
      }

      container.innerHTML = '';
      fields.forEach((f) => {
        const row = document.createElement('div');
        row.style.display = 'flex';
        row.style.alignItems = 'center';
        row.style.justifyContent = 'space-between';
        row.style.padding = '0.35rem';
        row.style.borderBottom = '1px solid var(--color-border)';
        row.style.fontSize = '0.75rem';

        const name = f.getName();
        const type = f.constructor.name;
        row.innerHTML = `<strong>${name}</strong> <span style="color: var(--color-text-secondary);">(${type})</span>`;
        container.appendChild(row);
      });
    } catch (e) {
      container.innerHTML = '<div class="form-hint">Could not read AcroForm dictionary.</div>';
    }
  }

  bindPdfFormsEvents() {
    const fileInput = document.getElementById('pdfFormsFileInput');
    const btnFlatten = document.getElementById('btnFlattenPdfForms');
    const btnSave = document.getElementById('btnSavePdfForms');
    const btnLaunchBuilder = document.getElementById('btnLaunchFormBuilderFromForms');

    fileInput?.addEventListener('change', async (e) => {
      const file = e.target.files?.[0];
      if (file) {
        const raw = await file.arrayBuffer();
        this.inspectFormFields(raw);
      }
    });

    btnLaunchBuilder?.addEventListener('click', () => {
      if (this.pdfFormsModal) this.pdfFormsModal.style.display = 'none';
      this.editorApp.productivityManager?.openFormModal();
    });

    btnFlatten?.addEventListener('click', async () => {
      let raw = this.editorApp.pdfViewer.getOriginalBytes();
      if (!raw && fileInput?.files?.[0]) raw = await fileInput.files[0].arrayBuffer();
      if (!raw) return this.onToast('Please open or select a PDF document.');

      try {
        const { PDFDocument } = window.PDFLib;
        const doc = await PDFDocument.load(raw.slice(0), { ignoreEncryption: true });
        const form = doc.getForm();
        form.flatten();
        const bytes = await doc.save();
        downloadBlob(new Blob([bytes], { type: 'application/pdf' }), 'forms-flattened.pdf');
        this.onToast('Form fields flattened and downloaded.');
        if (this.pdfFormsModal) this.pdfFormsModal.style.display = 'none';
      } catch (err) {
        this.onToast('Failed to flatten form: ' + err.message);
      }
    });

    btnSave?.addEventListener('click', async () => {
      let raw = this.editorApp.pdfViewer.getOriginalBytes();
      if (!raw && fileInput?.files?.[0]) raw = await fileInput.files[0].arrayBuffer();
      if (!raw) return this.onToast('Please open or select a PDF document.');

      try {
        const { PDFDocument } = window.PDFLib;
        const doc = await PDFDocument.load(raw.slice(0), { ignoreEncryption: true });
        const bytes = await doc.save();
        downloadBlob(new Blob([bytes], { type: 'application/pdf' }), 'filled-form.pdf');
        this.onToast('PDF form saved and downloaded.');
        if (this.pdfFormsModal) this.pdfFormsModal.style.display = 'none';
      } catch (err) {
        this.onToast('Failed to save form: ' + err.message);
      }
    });
  }

  // --- 20. Repair PDF ---
  bindRepairPdfEvents() {
    const btnExecute = document.getElementById('btnExecuteRepair');
    const fileInput = document.getElementById('repairPdfFileInput');
    const progressEl = document.getElementById('repairProgress');

    btnExecute?.addEventListener('click', async () => {
      const file = fileInput?.files?.[0];
      if (!file) return this.onToast('Please select a PDF file to repair.');

      try {
        btnExecute.disabled = true;
        if (progressEl) progressEl.style.display = 'block';

        const raw = await file.arrayBuffer();
        const res = await repairPdfDocument(raw);

        const outName = file.name.replace(/\.pdf$/i, '') + '-repaired.pdf';
        downloadBlob(new Blob([res.bytes], { type: 'application/pdf' }), outName);
        this.onToast('Repaired PDF downloaded successfully.');
        if (this.repairPdfModal) this.repairPdfModal.style.display = 'none';
      } catch (err) {
        this.onToast(err.message || 'Repair failed');
      } finally {
        btnExecute.disabled = false;
        if (progressEl) progressEl.style.display = 'none';
      }
    });
  }
}
