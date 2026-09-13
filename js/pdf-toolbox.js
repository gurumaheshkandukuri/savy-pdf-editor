/**
 * SAVY PDF Workspace — PDF Toolbox Controller (pdf-toolbox.js)
 * Phase 4 Core Engine:
 * 1. Image -> PDF (JPG, JPEG, PNG, WebP)
 * 2. PDF -> Images (PNG, JPG, single & multi-page ZIP)
 * 3. PDF -> Text (Client-side extraction with OCR disclaimer)
 * 4. PDF Compression (Lossless stream optimization & visual screen optimization)
 * 5. PDF Metadata Editor (View, edit, and clear metadata)
 * 6. PDF Watermark (Text, rotation, opacity, color, position)
 * 7. PDF Page Numbers (Format, starting index, positions, margins)
 * 8. PDF Flatten (Burn annotations into permanent base layer)
 *
 * Privacy Guarantee:
 * "Your PDF is processed locally in your browser and is not uploaded to SAVY's servers."
 */

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
 * Ensures image is converted to JPEG or PNG buffer supported by pdf-lib.
 * Specifically decodes WebP or other formats via canvas into PNG.
 * @param {File|Blob} file
 * @returns {Promise<{ buffer: ArrayBuffer, format: 'jpg'|'png', width?: number, height?: number }>}
 */
export async function ensureCompatibleImage(file) {
  const isJpeg = file.type === 'image/jpeg' || (file.name && file.name.match(/\.jpe?g$/i));
  const isPng = file.type === 'image/png' || (file.name && file.name.match(/\.png$/i));

  if (isJpeg) {
    const buffer = await file.arrayBuffer();
    return { buffer, format: 'jpg' };
  }
  if (isPng) {
    const buffer = await file.arrayBuffer();
    return { buffer, format: 'png' };
  }

  // WebP or other formats: decode in browser canvas and convert to PNG
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth || img.width;
      canvas.height = img.naturalHeight || img.height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0);
      canvas.toBlob(async (blob) => {
        if (!blob) {
          reject(new Error('Failed to convert image to PNG format'));
          return;
        }
        const buffer = await blob.arrayBuffer();
        resolve({
          buffer,
          format: 'png',
          width: canvas.width,
          height: canvas.height,
        });
      }, 'image/png');
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to load image for conversion'));
    };
    img.src = url;
  });
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
    margin = 0, // margin in points (0, 18, 36, 54)
  } = options;

  for (const file of imageFiles) {
    const { buffer, format } = await ensureCompatibleImage(file);
    let embeddedImg;
    if (format === 'jpg') {
      embeddedImg = await pdfDoc.embedJpg(buffer);
    } else {
      embeddedImg = await pdfDoc.embedPng(buffer);
    }

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
      // 'fit': page matches image dimensions plus margin
      pageWidth = imgWidth + margin * 2;
      pageHeight = imgHeight + margin * 2;
    }

    // Adjust for orientation
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

    // Calculate maximum available area inside margins
    const availWidth = Math.max(10, pageWidth - margin * 2);
    const availHeight = Math.max(10, pageHeight - margin * 2);

    // Scale image to fit inside available area
    const scale = Math.min(availWidth / imgWidth, availHeight / imgHeight);
    const drawWidth = imgWidth * scale;
    const drawHeight = imgHeight * scale;

    // Center image on page
    const drawX = margin + (availWidth - drawWidth) / 2;
    const drawY = margin + (availHeight - drawHeight) / 2;

    page.drawImage(embeddedImg, {
      x: drawX,
      y: drawY,
      width: drawWidth,
      height: drawHeight,
    });
  }

  const pdfBytes = await pdfDoc.save();
  return pdfBytes;
}

// =======================================================
// GROUP 2 — PDF -> IMAGES
// =======================================================
export async function convertPdfToImages(pdfjsDoc, options = {}, onProgress = () => {}) {
  const {
    pages = 'all', // 'current', 'all', or array of 1-based page numbers
    format = 'image/png', // 'image/png' or 'image/jpeg'
    scale = 1.5, // 1.0 (72 dpi), 1.5 (108 dpi), 2.0 (144 dpi)
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

    // Fill white background for JPEG
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

    // Reconstruct lines based on y-coordinates
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
      `Note: This document appears to be scanned or image-only. Optical Character Recognition (OCR) is not included in this offline client-side phase.`;
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
    // Visual Screen Optimization: Render pages to canvas at specified scale and compress to JPEG
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

      // Preserve original page dimensions in PDF points
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

  // Default: Stream/Object Optimization (Lossless attempt)
  const doc = await PDFDocument.load(rawBuffer.slice(0));
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
  const doc = await PDFDocument.load(rawBuffer.slice(0));
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
  const doc = await PDFDocument.load(rawBuffer.slice(0));

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
  const doc = await PDFDocument.load(rawBuffer.slice(0));
  const font = await doc.embedFont(StandardFonts.HelveticaBold);

  const {
    text = 'CONFIDENTIAL',
    fontSize = 48,
    opacity = 0.25,
    colorHex = '#888888',
    rotation = 45, // degrees
    position = 'center', // 'center', 'top', 'bottom'
    pages = 'all', // 'all' or array of 0-based page indices
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
  const doc = await PDFDocument.load(rawBuffer.slice(0));
  const font = await doc.embedFont(StandardFonts.Helvetica);

  const {
    format = 'Page {n} of {total}', // 'Page {n} of {total}', '{n} / {total}', '{n}'
    startNumber = 1,
    position = 'bottom-center', // 'bottom-center', 'bottom-right', 'bottom-left', 'top-center', 'top-right', 'top-left'
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

    // Horizontal placement
    if (position.includes('center')) {
      x = (width - textWidth) / 2;
    } else if (position.includes('right')) {
      x = width - margin - textWidth;
    } else {
      // left
      x = margin;
    }

    // Vertical placement
    if (position.startsWith('top')) {
      y = height - margin;
    } else {
      // bottom
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
  // Compile active document with all Phase 2 annotations burned into page streams
  const res = await pdfPageOperations.compileDocumentWithModel(
    documentModel,
    annotationManager
  );
  return res.bytes || res;
}

// =======================================================
// TOOLBOX UI CONTROLLER CLASS
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

    // Tool Dialog Modals
    this.imgToPdfModal = document.getElementById('imgToPdfModal');
    this.pdfToImgModal = document.getElementById('pdfToImgModal');
    this.pdfToTextModal = document.getElementById('pdfToTextModal');
    this.compressModal = document.getElementById('compressModal');
    this.metadataModal = document.getElementById('metadataModal');
    this.watermarkModal = document.getElementById('watermarkModal');
    this.pageNumberModal = document.getElementById('pageNumberModal');
    this.flattenModal = document.getElementById('flattenModal');

    // File input for Image to PDF
    this.imgToPdfInput = document.getElementById('imgToPdfFileInput');
    this.imgToPdfList = [];
  }

  bindEvents() {
    this.btnOpenToolbox?.addEventListener('click', () => this.openHub());
    this.btnToolboxClose?.addEventListener('click', () => this.closeHub());

    // Close on overlay backdrop click
    document.querySelectorAll('.savy-modal').forEach((modal) => {
      modal.addEventListener('click', (e) => {
        if (e.target === modal) {
          modal.style.display = 'none';
        }
      });
    });

    // Close buttons for sub-modals
    document.querySelectorAll('.modal-close-btn, .btn-modal-cancel').forEach((btn) => {
      btn.addEventListener('click', () => {
        const modal = btn.closest('.savy-modal');
        if (modal) modal.style.display = 'none';
      });
    });

    // Hub tool card clicks
    document.querySelectorAll('[data-toolbox-action]').forEach((card) => {
      card.addEventListener('click', () => {
        const action = card.getAttribute('data-toolbox-action');
        this.launchTool(action);
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
  }

  openHub() {
    if (this.toolboxModal) {
      this.toolboxModal.style.display = 'flex';
    }
  }

  closeHub() {
    if (this.toolboxModal) {
      this.toolboxModal.style.display = 'none';
    }
  }

  launchTool(action) {
    this.closeHub();
    const hasDoc = this.editorApp.pdfViewer.hasDocument();

    switch (action) {
      case 'img-to-pdf':
        this.openImgToPdf();
        break;
      case 'pdf-to-img':
        if (!hasDoc) return this.onToast('Please open a PDF document first.');
        this.openPdfToImg();
        break;
      case 'pdf-to-text':
        if (!hasDoc) return this.onToast('Please open a PDF document first.');
        this.openPdfToText();
        break;
      case 'compress':
        if (!hasDoc) return this.onToast('Please open a PDF document first.');
        this.openCompress();
        break;
      case 'metadata':
        if (!hasDoc) return this.onToast('Please open a PDF document first.');
        this.openMetadata();
        break;
      case 'watermark':
        if (!hasDoc) return this.onToast('Please open a PDF document first.');
        this.openWatermark();
        break;
      case 'page-numbers':
        if (!hasDoc) return this.onToast('Please open a PDF document first.');
        this.openPageNumbers();
        break;
      case 'flatten':
        if (!hasDoc) return this.onToast('Please open a PDF document first.');
        this.openFlatten();
        break;
      case 'crop':
        if (!hasDoc) return this.onToast('Please open a PDF document first.');
        this.editorApp.productivityManager?.openCropModal();
        break;
      case 'resize':
        if (!hasDoc) return this.onToast('Please open a PDF document first.');
        this.editorApp.productivityManager?.openResizeModal();
        break;
      case 'headers-footers':
        if (!hasDoc) return this.onToast('Please open a PDF document first.');
        this.editorApp.productivityManager?.openHeaderFooterModal();
        break;
      case 'bates':
        if (!hasDoc) return this.onToast('Please open a PDF document first.');
        this.editorApp.productivityManager?.openBatesModal();
        break;
      case 'ocr':
        if (!hasDoc) return this.onToast('Please open a PDF document first.');
        this.editorApp.ocrManager?.open();
        break;
      case 'inspector':
        if (!hasDoc) return this.onToast('Please open a PDF document first.');
        this.editorApp.productivityManager?.openDocumentInspector();
        break;
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
    for (const f of files) {
      this.imgToPdfList.push(f);
    }
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
        <img class="img-pdf-thumb" src="${url}" alt="" />
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
          const selected = this.editorApp.pageOrganizer.getSelectedPages();
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
          // Download single image directly
          downloadBlob(images[0].blob, images[0].name);
          this.onToast(`Downloaded ${images[0].name}`);
        } else if (images.length > 1) {
          // Package into valid ZIP archive
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
        } else if (scope === 'selected') {
          const selected = this.editorApp.pageOrganizer.getSelectedPages();
          if (selected.length > 0) {
            targetPages = selected.map((p) => this.editorApp.documentModel.getPageIndex(p.id));
          }
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
    const allAnnots = this.editorApp.annotationManager.getAllAnnotationsByPageId();
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

        // 1. Compile modified document with annotations burned in
        const flattenedBytes = await flattenDocument(
          this.editorApp.documentModel,
          this.editorApp.annotationManager,
          this.editorApp.pdfExport.pageOperations
        );

        // 2. Download flattened PDF
        const docName = (this.editorApp.pdfViewer.docMetadata?.name || 'document').replace(/\.pdf$/i, '');
        downloadBlob(new Blob([flattenedBytes], { type: 'application/pdf' }), `${docName}-flattened.pdf`);

        // 3. Clear overlay state and reload into viewer so annotations become base layer
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
}
