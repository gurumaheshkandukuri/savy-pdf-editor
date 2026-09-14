/**
 * SAVY PDF Workspace — PDF Page Operations Module (pdf-page-operations.js)
 * Real client-side PDF document operations engine utilizing pdf-lib:
 * - Compiling documents with reordered, duplicated, rotated, and blank pages
 * - Extracting selected pages
 * - Splitting PDFs by ranges or into individual pages
 * - Merging multiple local PDFs
 * - Burning Phase 2 annotations tied to stable page IDs
 *
 * Privacy Guarantee: 100% in-browser client-side execution. Zero server uploads.
 */

import { PdfContentStreamEditor } from './pdf-content-stream-editor.js';

export class PDFPageOperations {
  constructor() {
    this.cachedLibDocs = new Map();
  }

  isEngineLoaded() {
    return typeof window !== 'undefined' && Boolean(window.PDFLib);
  }

  /**
   * Helper to get or load a PDFLib.PDFDocument from an ArrayBuffer
   */
  async getLibDoc(docId, arrayBuffer) {
    if (!this.cachedLibDocs.has(docId)) {
      const { PDFDocument } = window.PDFLib;
      const doc = await PDFDocument.load(arrayBuffer, { ignoreEncryption: true });
      this.cachedLibDocs.set(docId, doc);
    }
    return this.cachedLibDocs.get(docId);
  }

  /**
   * Helper to load standard fonts into a PDFDocument
   */
  async loadStandardFonts(pdfDoc) {
    const { StandardFonts } = window.PDFLib;
    const fontHelvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const fontHelveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const fontHelveticaOblique = await pdfDoc.embedFont(StandardFonts.HelveticaOblique);
    const fontTimes = await pdfDoc.embedFont(StandardFonts.TimesRoman);
    const fontTimesBold = await pdfDoc.embedFont(StandardFonts.TimesRomanBold);
    const fontCourier = await pdfDoc.embedFont(StandardFonts.Courier);
    const fontCourierBold = await pdfDoc.embedFont(StandardFonts.CourierBold);

    return {
      Helvetica: { regular: fontHelvetica, bold: fontHelveticaBold, italic: fontHelveticaOblique },
      TimesRoman: { regular: fontTimes, bold: fontTimesBold, italic: fontTimes },
      Courier: { regular: fontCourier, bold: fontCourierBold, italic: fontCourier },
    };
  }

  /**
   * Burn annotations for a page onto a destination PDFPage
   */
  async burnPageAnnotations(pdfDoc, pdfPage, annotations, fontMap) {
    if (!annotations || annotations.length === 0) return;

    const { rgb, LineCapStyle } = window.PDFLib;
    const { width: pageWidth, height: pageHeight } = pdfPage.getSize();

    for (const annot of annotations) {
      const s = annot.style || {};

      switch (annot.type) {
        case 'text': {
          const content = annot.content || '';
          if (!content.trim()) break;

          const family = fontMap[s.fontFamily] || fontMap.Helvetica;
          let font = family.regular;
          if (s.bold) font = family.bold;
          else if (s.italic) font = family.italic;

          const fontSize = Number(s.fontSize) || 16;
          const textColor = this.hexToRgb(s.color || '#000000', rgb);

          const lines = content.split('\n');
          const lineHeight = fontSize * 1.25;

          lines.forEach((line, idx) => {
            const pdfX = annot.x;
            const pdfY = pageHeight - (annot.y + (idx + 1) * lineHeight - (lineHeight - fontSize) * 0.7);

            pdfPage.drawText(line, {
              x: pdfX,
              y: pdfY,
              size: fontSize,
              font,
              color: textColor,
            });

            if (s.underline) {
              const textWidth = font.widthOfTextAtSize(line, fontSize);
              pdfPage.drawLine({
                start: { x: pdfX, y: pdfY - 2 },
                end: { x: pdfX + textWidth, y: pdfY - 2 },
                thickness: 1,
                color: textColor,
              });
            }
          });
          break;
        }

        case 'drawing':
        case 'highlight': {
          const points = annot.points;
          if (!points || points.length === 0) break;

          const strokeColor = this.hexToRgb(s.color || (annot.type === 'highlight' ? '#FACC15' : '#2563EB'), rgb);
          const strokeWidth = Number(s.strokeWidth) || (annot.type === 'highlight' ? 12 : 3);
          const opacity = annot.type === 'highlight' ? (Number(s.opacity) || 0.35) : (Number(s.opacity) || 1.0);

          const svgPath = this.pointsToSvgPath(points, annot.x, annot.y);
          if (svgPath) {
            pdfPage.drawSvgPath(svgPath, {
              x: annot.x,
              y: pageHeight - annot.y,
              borderColor: strokeColor,
              borderWidth: strokeWidth,
              opacity,
            });
          }
          break;
        }

        case 'rectangle': {
          const borderColor = this.hexToRgb(s.color || '#2563EB', rgb);
          const borderWidth = Number(s.strokeWidth) || 2;
          const hasFill = s.fillColor && s.fillColor !== 'transparent';
          const fillColor = hasFill ? this.hexToRgb(s.fillColor, rgb) : undefined;
          const opacity = (s.opacity !== undefined && !isNaN(Number(s.opacity))) ? Number(s.opacity) : 1.0;

          const pdfX = annot.x;
          const pdfY = pageHeight - annot.y - annot.height;

          pdfPage.drawRectangle({
            x: pdfX,
            y: pdfY,
            width: annot.width,
            height: annot.height,
            borderColor,
            borderWidth,
            color: fillColor,
            opacity,
          });
          break;
        }

        case 'circle': {
          const borderColor = this.hexToRgb(s.color || '#2563EB', rgb);
          const borderWidth = Number(s.strokeWidth) || 2;
          const hasFill = s.fillColor && s.fillColor !== 'transparent';
          const fillColor = hasFill ? this.hexToRgb(s.fillColor, rgb) : undefined;
          const opacity = (s.opacity !== undefined && !isNaN(Number(s.opacity))) ? Number(s.opacity) : 1.0;

          const centerPdfX = annot.x + annot.width / 2;
          const centerPdfY = pageHeight - (annot.y + annot.height / 2);

          pdfPage.drawEllipse({
            x: centerPdfX,
            y: centerPdfY,
            xScale: annot.width / 2,
            yScale: annot.height / 2,
            borderColor,
            borderWidth,
            color: fillColor,
            opacity,
          });
          break;
        }

        case 'line': {
          const strokeColor = this.hexToRgb(s.color || '#2563EB', rgb);
          const strokeWidth = Number(s.strokeWidth) || 3;

          const startPdfX = annot.x + (annot.x1Rel !== undefined ? annot.x1Rel : 0);
          const startPdfY = pageHeight - (annot.y + (annot.y1Rel !== undefined ? annot.y1Rel : 0));
          const endPdfX = annot.x + (annot.x2Rel !== undefined ? annot.x2Rel : annot.width);
          const endPdfY = pageHeight - (annot.y + (annot.y2Rel !== undefined ? annot.y2Rel : annot.height));

          pdfPage.drawLine({
            start: { x: startPdfX, y: startPdfY },
            end: { x: endPdfX, y: endPdfY },
            thickness: strokeWidth,
            color: strokeColor,
            lineCap: LineCapStyle.Round,
          });

          if (s.arrow) {
            this.drawArrowHeadPdf(pdfPage, startPdfX, startPdfY, endPdfX, endPdfY, strokeColor, strokeWidth);
          }
          break;
        }

        case 'image':
        case 'signature': {
          const dataUrl = annot.dataUrl;
          if (!dataUrl) break;

          let embeddedImg;
          const isPng = dataUrl.startsWith('data:image/png');
          const isJpg = dataUrl.startsWith('data:image/jpeg') || dataUrl.startsWith('data:image/jpg');

          if (isPng) {
            const bytes = this.dataUrlToUint8Array(dataUrl);
            try {
              embeddedImg = await pdfDoc.embedPng(bytes);
            } catch {
              const pngBytes = await this.convertToPngBytes(dataUrl);
              embeddedImg = await pdfDoc.embedPng(pngBytes);
            }
          } else if (isJpg) {
            const bytes = this.dataUrlToUint8Array(dataUrl);
            const isRealJpeg = bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xd8;
            if (isRealJpeg) {
              try {
                embeddedImg = await pdfDoc.embedJpg(bytes);
              } catch {
                const pngBytes = await this.convertToPngBytes(dataUrl);
                embeddedImg = await pdfDoc.embedPng(pngBytes);
              }
            } else {
              const pngBytes = await this.convertToPngBytes(dataUrl);
              embeddedImg = await pdfDoc.embedPng(pngBytes);
            }
          } else {
            const pngBytes = await this.convertToPngBytes(dataUrl);
            embeddedImg = await pdfDoc.embedPng(pngBytes);
          }

          const pdfX = annot.x;
          const pdfY = pageHeight - annot.y - annot.height;

          pdfPage.drawImage(embeddedImg, {
            x: pdfX,
            y: pdfY,
            width: annot.width,
            height: annot.height,
          });
          break;
        }

        case 'redact': {
          const pdfX = annot.x;
          const pdfY = pageHeight - annot.y - annot.height;

          pdfPage.drawRectangle({
            x: pdfX,
            y: pdfY,
            width: annot.width,
            height: annot.height,
            color: rgb(0, 0, 0),
            opacity: 1.0,
          });
          break;
        }

        case 'stamp': {
          const text = (annot.text || 'APPROVED').toUpperCase();
          const colorHex = annot.color || s.color || '#16A34A';
          const stampColor = this.hexToRgb(colorHex, rgb);
          const rotation = Number(annot.rotation) || 0;
          const opacity = annot.opacity !== undefined ? Number(annot.opacity) : 0.85;

          const pdfX = annot.x;
          const pdfY = pageHeight - annot.y - annot.height;
          const w = annot.width || 160;
          const h = annot.height || 60;

          const font = fontMap.Helvetica ? fontMap.Helvetica.bold : null;
          const fontSize = Math.min(24, Math.max(11, Math.floor(h * 0.38)));

          // Outer badge border
          pdfPage.drawRectangle({
            x: pdfX,
            y: pdfY,
            width: w,
            height: h,
            borderColor: stampColor,
            borderWidth: 2.5,
            color: this.hexToRgb('#FFFFFF', rgb),
            opacity: opacity * 0.15,
            rotate: window.PDFLib.degrees(rotation),
          });

          // Inner badge border
          pdfPage.drawRectangle({
            x: pdfX + 3,
            y: pdfY + 3,
            width: Math.max(1, w - 6),
            height: Math.max(1, h - 6),
            borderColor: stampColor,
            borderWidth: 1,
            opacity: opacity * 0.8,
            rotate: window.PDFLib.degrees(rotation),
          });

          if (font) {
            const textWidth = font.widthOfTextAtSize(text, fontSize);
            const textX = pdfX + Math.max(0, (w - textWidth) / 2);
            const textY = pdfY + (h - fontSize) / 2 + (annot.date ? 6 : 0);

            pdfPage.drawText(text, {
              x: textX,
              y: textY,
              size: fontSize,
              font,
              color: stampColor,
              opacity,
              rotate: window.PDFLib.degrees(rotation),
            });

            if (annot.date) {
              const dateSize = Math.max(8, Math.floor(fontSize * 0.45));
              const dateText = String(annot.date);
              const dateWidth = font.widthOfTextAtSize(dateText, dateSize);
              const dateX = pdfX + Math.max(0, (w - dateWidth) / 2);
              const dateY = pdfY + (h - fontSize) / 2 - dateSize - 2;

              pdfPage.drawText(dateText, {
                x: dateX,
                y: dateY,
                size: dateSize,
                font,
                color: stampColor,
                opacity: opacity * 0.9,
                rotate: window.PDFLib.degrees(rotation),
              });
            }
          }
          break;
        }

        case 'text_replacement': {
          // True PDF text replacement is applied at the content stream level.
          // Zero background masking rectangles are drawn.
          const content = annot.text !== undefined ? annot.text : (annot.content || '');
          if (content && content.trim().length > 0) {
            const family = fontMap[annot.fontFamily || annot.style?.fontFamily] || fontMap.Helvetica;
            let font = family.regular;
            if (annot.bold || annot.style?.bold) font = family.bold;
            else if (annot.italic || annot.style?.italic) font = family.italic;

            const fontSize = Number(annot.fontSize || annot.style?.fontSize) || 14;
            const textColor = this.hexToRgb(annot.color || annot.style?.color || '#000000', rgb);

            const lines = content.split('\n');
            lines.forEach((line, idx) => {
              const pdfX = annot.x;
              const baselineFromTop = annot.y + (idx + 1) * fontSize;
              const pdfY = pageHeight - baselineFromTop;

              pdfPage.drawText(line, {
                x: pdfX,
                y: pdfY,
                size: fontSize,
                font,
                color: textColor,
              });

              if (annot.underline) {
                const textWidth = font.widthOfTextAtSize(line, fontSize);
                pdfPage.drawLine({
                  start: { x: pdfX, y: pdfY - 2 },
                  end: { x: pdfX + textWidth, y: pdfY - 2 },
                  thickness: 1,
                  color: textColor,
                });
              }
            });
          }
          break;
        }
      }
    }
  }

  /**
   * Compile full document taking into account all documentModel page operations:
   * Reordering, duplication, rotation, blank pages, and annotations.
   */
  async compileDocumentWithModel(documentModel, annotationManager, originalName = 'document.pdf') {
    if (!this.isEngineLoaded()) {
      throw new Error('pdf-lib is not loaded. Please verify your connection.');
    }

    const { PDFDocument, degrees } = window.PDFLib;
    const destDoc = await PDFDocument.create();
    const fontMap = await this.loadStandardFonts(destDoc);

    const pages = documentModel.getPages();
    if (pages.length === 0) {
      throw new Error('Cannot export document with zero pages.');
    }

    for (let i = 0; i < pages.length; i++) {
      const pageRecord = pages[i];
      let destPage;

      if (pageRecord.isBlank) {
        destPage = destDoc.addPage([pageRecord.width || 612, pageRecord.height || 792]);
      } else {
        const srcObj = documentModel.getSourceDoc(pageRecord.docId);
        if (!srcObj || !srcObj.arrayBuffer) {
          throw new Error(`Source document for page ${i + 1} not found.`);
        }

        const srcLibDoc = await this.getLibDoc(pageRecord.docId, srcObj.arrayBuffer);
        const [copied] = await destDoc.copyPages(srcLibDoc, [pageRecord.sourceIndex]);
        destPage = destDoc.addPage(copied);
      }

      // Apply cumulative rotation
      const baseRotation = destPage.getRotation().angle;
      const userRotation = pageRecord.rotation || 0;
      destPage.setRotation(degrees((baseRotation + userRotation) % 360));

      // 1. Apply true underlying PDF content stream text replacements
      const pageAnnots = annotationManager ? annotationManager.getAnnotationsForPage(pageRecord.id) : [];
      const textReplacements = pageAnnots.filter((a) => a.type === 'text_replacement');
      if (textReplacements.length > 0) {
        const replacements = textReplacements.map((a) => ({
          originalText: a.originalText,
          newText: a.newText !== undefined ? a.newText : (a.text !== undefined ? a.text : (a.content || '')),
        }));
        await PdfContentStreamEditor.replaceTextInPage(destDoc, destPage, replacements);
      }

      // 2. Burn remaining visual annotations (excluding text_replacement)
      const nonStreamAnnots = pageAnnots.filter((a) => a.type !== 'text_replacement');
      await this.burnPageAnnotations(destDoc, destPage, nonStreamAnnots, fontMap);

      // Burn interactive AcroForm fields
      const formFields = pageAnnots.filter((a) => a.type === 'form_field');
      if (formFields.length > 0) {
        const form = destDoc.getForm();
        const { height: ph } = destPage.getSize();
        for (const f of formFields) {
          const fx = f.x;
          const fy = ph - f.y - f.height;
          const name = f.fieldName || `field_${pageRecord.id}_${f.id}`;
          try {
            if (f.formType === 'text') {
              const tf = form.createTextField(name);
              if (f.defaultValue) tf.setText(f.defaultValue);
              if (f.placeholder) tf.setToolTip(f.placeholder);
              tf.addToPage(destPage, { x: fx, y: fy, width: f.width, height: f.height });
            } else if (f.formType === 'checkbox') {
              const cb = form.createCheckBox(name);
              if (f.checked) cb.check();
              cb.addToPage(destPage, { x: fx, y: fy, width: f.width || 20, height: f.height || 20 });
            } else if (f.formType === 'dropdown') {
              const dd = form.createDropdown(name);
              const opts = f.options && f.options.length > 0 ? f.options : ['Option 1', 'Option 2'];
              dd.setOptions(opts);
              if (f.defaultValue && opts.includes(f.defaultValue)) dd.select(f.defaultValue);
              else if (opts[0]) dd.select(opts[0]);
              dd.addToPage(destPage, { x: fx, y: fy, width: f.width, height: f.height });
            } else if (f.formType === 'radio') {
              const grp = f.groupName || 'radioGroup_1';
              let rg;
              try { rg = form.getRadioGroup(grp); } catch { rg = form.createRadioGroup(grp); }
              const optVal = f.optionValue || `opt_${f.id}`;
              rg.addOptionToPage(optVal, destPage, { x: fx, y: fy, width: f.width || 20, height: f.height || 20 });
            }
          } catch (formErr) {
            console.warn('Form field compilation notice:', formErr);
          }
        }
      }
    }

    const compiledBytes = await destDoc.save();

    const cleanBase = originalName.replace(/\.pdf$/i, '');
    const filename = `${cleanBase}-edited.pdf`;

    this.triggerDownload(compiledBytes, filename);

    return {
      success: true,
      filename,
      size: compiledBytes.byteLength,
      bytes: compiledBytes,
      buffer: compiledBytes,
    };
  }

  /**
   * Extract selected pages into a new PDF
   */
  async extractPages(documentModel, annotationManager, pageTargets, originalName = 'document.pdf') {
    if (!this.isEngineLoaded()) {
      throw new Error('pdf-lib is not loaded.');
    }

    const targetSet = new Set(Array.isArray(pageTargets) ? pageTargets : [pageTargets]);
    if (targetSet.size === 0) {
      throw new Error('No pages selected for extraction.');
    }

    const { PDFDocument, degrees } = window.PDFLib;
    const destDoc = await PDFDocument.create();
    const fontMap = await this.loadStandardFonts(destDoc);

    const allPages = documentModel.getPages();
    const pagesToExtract = allPages.filter((p, idx) => targetSet.has(p.id) || targetSet.has(idx) || targetSet.has(idx + 1));

    if (pagesToExtract.length === 0) {
      throw new Error('None of the selected pages were found in the document.');
    }

    for (const pageRecord of pagesToExtract) {
      let destPage;
      if (pageRecord.isBlank) {
        destPage = destDoc.addPage([pageRecord.width || 612, pageRecord.height || 792]);
      } else {
        const srcObj = documentModel.getSourceDoc(pageRecord.docId);
        const srcLibDoc = await this.getLibDoc(pageRecord.docId, srcObj.arrayBuffer);
        const [copied] = await destDoc.copyPages(srcLibDoc, [pageRecord.sourceIndex]);
        destPage = destDoc.addPage(copied);
      }

      const baseRotation = destPage.getRotation().angle;
      const userRotation = pageRecord.rotation || 0;
      destPage.setRotation(degrees((baseRotation + userRotation) % 360));

      const pageAnnots = annotationManager ? annotationManager.getAnnotationsForPage(pageRecord.id) : [];
      await this.burnPageAnnotations(destDoc, destPage, pageAnnots, fontMap);
    }

    const compiledBytes = await destDoc.save();
    const cleanBase = originalName.replace(/\.pdf$/i, '');
    const filename = `${cleanBase}-extracted.pdf`;

    this.triggerDownload(compiledBytes, filename);

    return {
      success: true,
      filename,
      size: compiledBytes.byteLength,
      bytes: compiledBytes,
    };
  }

  /**
   * Split PDF into parts (either every page or by range strings like '1-3', '4-7')
   */
  async splitPdf(documentModel, annotationManager, options = { mode: 'all' }, originalName = 'document.pdf') {
    if (!this.isEngineLoaded()) {
      throw new Error('pdf-lib is not loaded.');
    }

    const allPages = documentModel.getPages();
    if (allPages.length === 0) {
      throw new Error('Document has no pages to split.');
    }

    const cleanBase = originalName.replace(/\.pdf$/i, '');
    const results = [];

    let groups = [];
    if (options.mode === 'all') {
      // Each page is its own document
      groups = allPages.map((p, idx) => ({
        label: `page-${idx + 1}`,
        pages: [p],
      }));
    } else if (options.mode === 'ranges' && Array.isArray(options.ranges)) {
      for (const r of options.ranges) {
        const match = r.trim().match(/^(\d+)(?:-(\d+))?$/);
        if (!match) continue;
        const start = parseInt(match[1], 10);
        const end = match[2] ? parseInt(match[2], 10) : start;
        const rangePages = [];
        for (let pIdx = start - 1; pIdx < end && pIdx < allPages.length; pIdx++) {
          if (pIdx >= 0) rangePages.push(allPages[pIdx]);
        }
        if (rangePages.length > 0) {
          groups.push({
            label: `part-${start}-${end}`,
            pages: rangePages,
          });
        }
      }
    }

    if (groups.length === 0) {
      throw new Error('No valid split groups specified.');
    }

    const { PDFDocument, degrees } = window.PDFLib;

    for (const grp of groups) {
      const destDoc = await PDFDocument.create();
      const fontMap = await this.loadStandardFonts(destDoc);

      for (const pageRecord of grp.pages) {
        let destPage;
        if (pageRecord.isBlank) {
          destPage = destDoc.addPage([pageRecord.width || 612, pageRecord.height || 792]);
        } else {
          const srcObj = documentModel.getSourceDoc(pageRecord.docId);
          const srcLibDoc = await this.getLibDoc(pageRecord.docId, srcObj.arrayBuffer);
          const [copied] = await destDoc.copyPages(srcLibDoc, [pageRecord.sourceIndex]);
          destPage = destDoc.addPage(copied);
        }

        const baseRotation = destPage.getRotation().angle;
        const userRotation = pageRecord.rotation || 0;
        destPage.setRotation(degrees((baseRotation + userRotation) % 360));

        const pageAnnots = annotationManager ? annotationManager.getAnnotationsForPage(pageRecord.id) : [];
        await this.burnPageAnnotations(destDoc, destPage, pageAnnots, fontMap);
      }

      const compiledBytes = await destDoc.save();
      const filename = `${cleanBase}-${grp.label}.pdf`;
      this.triggerDownload(compiledBytes, filename);
      results.push({
        filename,
        size: compiledBytes.byteLength,
        bytes: compiledBytes,
      });
    }

    return results;
  }

  /**
   * Merge multiple local PDF documents into one PDF
   * @param {Array<{ name: string, arrayBuffer: ArrayBuffer }>} filesList
   * @param {string} [outputName]
   */
  async mergePdfs(filesList, outputName = null) {
    if (!this.isEngineLoaded()) {
      throw new Error('pdf-lib is not loaded.');
    }

    if (!Array.isArray(filesList) || filesList.length === 0) {
      throw new Error('No PDF files provided to merge.');
    }

    const { PDFDocument } = window.PDFLib;
    const mergedDoc = await PDFDocument.create();

    for (const file of filesList) {
      const srcDoc = await PDFDocument.load(file.arrayBuffer, { ignoreEncryption: true });
      const indices = srcDoc.getPageIndices();
      const copiedPages = await mergedDoc.copyPages(srcDoc, indices);
      for (const p of copiedPages) {
        mergedDoc.addPage(p);
      }
    }

    const compiledBytes = await mergedDoc.save();
    const firstClean = filesList[0]?.name?.replace(/\.pdf$/i, '') || 'document';
    const filename = outputName || `${firstClean}-merged.pdf`;

    this.triggerDownload(compiledBytes, filename);

    return {
      success: true,
      filename,
      size: compiledBytes.byteLength,
      bytes: compiledBytes,
    };
  }

  /**
   * Helper to parse user page range string into 1-based page numbers
   * @param {string|number|Array<number>} rangeInput - 'all', 'current', '1-3, 5', etc.
   * @param {number} totalPages
   * @param {number} [currentPage=1]
   * @returns {Array<number>}
   */
  parsePageRange(rangeInput, totalPages, currentPage = 1) {
    if (!rangeInput || rangeInput === 'all') {
      const pages = [];
      for (let i = 1; i <= totalPages; i++) pages.push(i);
      return pages;
    }
    if (rangeInput === 'current') {
      return [Math.min(totalPages, Math.max(1, currentPage))];
    }
    if (Array.isArray(rangeInput)) {
      return rangeInput.filter((n) => typeof n === 'number' && n >= 1 && n <= totalPages);
    }
    if (typeof rangeInput === 'number') {
      return rangeInput >= 1 && rangeInput <= totalPages ? [rangeInput] : [1];
    }

    const selected = new Set();
    const parts = String(rangeInput).split(',');
    for (const part of parts) {
      const trimmed = part.trim();
      if (!trimmed) continue;
      if (trimmed.includes('-')) {
        const [startStr, endStr] = trimmed.split('-');
        const start = parseInt(startStr, 10);
        const end = parseInt(endStr, 10);
        if (!isNaN(start) && !isNaN(end)) {
          const min = Math.min(start, end);
          const max = Math.max(start, end);
          for (let i = min; i <= max; i++) {
            if (i >= 1 && i <= totalPages) selected.add(i);
          }
        }
      } else {
        const num = parseInt(trimmed, 10);
        if (!isNaN(num) && num >= 1 && num <= totalPages) {
          selected.add(num);
        }
      }
    }
    const result = Array.from(selected).sort((a, b) => a - b);
    return result.length > 0 ? result : [Math.min(totalPages, Math.max(1, currentPage))];
  }

  /**
   * Crop pages losslessly using the standard PDF /CropBox dictionary.
   * Preserves 100% vector and text fidelity.
   */
  async cropPages(documentModel, annotationManager, options = {}) {
    if (!this.isEngineLoaded()) throw new Error('pdf-lib is not loaded.');

    const { PDFDocument, degrees } = window.PDFLib;
    const pages = documentModel.getPages();
    const totalPages = pages.length;
    if (totalPages === 0) throw new Error('Document has no pages.');

    const targetPageNums = this.parsePageRange(options.pageRange || 'current', totalPages, options.currentPage || 1);
    const targetSet = new Set(targetPageNums);

    const destDoc = await PDFDocument.create();
    const fontMap = await this.loadStandardFonts(destDoc);

    for (let i = 0; i < pages.length; i++) {
      const pageRecord = pages[i];
      const pageNum = i + 1;
      let destPage;

      if (pageRecord.isBlank) {
        destPage = destDoc.addPage([pageRecord.width || 612, pageRecord.height || 792]);
      } else {
        const srcObj = documentModel.getSourceDoc(pageRecord.docId);
        const srcLibDoc = await this.getLibDoc(pageRecord.docId, srcObj.arrayBuffer);
        const [copied] = await destDoc.copyPages(srcLibDoc, [pageRecord.sourceIndex]);
        destPage = destDoc.addPage(copied);
      }

      const baseRotation = destPage.getRotation().angle;
      const userRotation = pageRecord.rotation || 0;
      destPage.setRotation(degrees((baseRotation + userRotation) % 360));

      if (targetSet.has(pageNum)) {
        const { width, height } = destPage.getSize();
        let cropX = 0;
        let cropY = 0;
        let cropW = width;
        let cropH = height;

        if (options.cropBox) {
          cropX = Math.max(0, Math.min(width - 10, options.cropBox.x || 0));
          cropY = Math.max(0, Math.min(height - 10, options.cropBox.y || 0));
          cropW = Math.max(10, Math.min(width - cropX, options.cropBox.width || (width - cropX)));
          cropH = Math.max(10, Math.min(height - cropY, options.cropBox.height || (height - cropY)));
        } else if (options.margins) {
          const m = options.margins;
          cropX = Number(m.left) || 0;
          cropY = Number(m.bottom) || 0;
          cropW = Math.max(10, width - cropX - (Number(m.right) || 0));
          cropH = Math.max(10, height - cropY - (Number(m.top) || 0));
        }

        destPage.setCropBox(cropX, cropY, cropW, cropH);
      }

      const pageAnnots = annotationManager ? annotationManager.getAnnotationsForPage(pageRecord.id) : [];
      await this.burnPageAnnotations(destDoc, destPage, pageAnnots, fontMap);
    }

    const compiledBytes = await destDoc.save();
    const cleanBase = (options.originalName || 'document.pdf').replace(/\.pdf$/i, '');
    const filename = `${cleanBase}-cropped.pdf`;

    if (options.download !== false) {
      this.triggerDownload(compiledBytes, filename);
    }

    return {
      success: true,
      filename,
      size: compiledBytes.byteLength,
      bytes: compiledBytes,
      croppedCount: targetSet.size,
    };
  }

  /**
   * Resize pages with standard presets (A4, Letter, Legal, Custom) and configurable margins.
   * Scales original page content proportionally to fit within the printable area.
   */
  async resizePages(documentModel, annotationManager, options = {}) {
    if (!this.isEngineLoaded()) throw new Error('pdf-lib is not loaded.');

    const { PDFDocument, degrees } = window.PDFLib;
    const pages = documentModel.getPages();
    const totalPages = pages.length;
    if (totalPages === 0) throw new Error('Document has no pages.');

    const targetPageNums = this.parsePageRange(options.pageRange || 'all', totalPages, options.currentPage || 1);
    const targetSet = new Set(targetPageNums);

    const PRESET_SIZES = {
      a4: [595.28, 841.89],
      letter: [612, 792],
      legal: [612, 1008],
    };

    let [targetW, targetH] = PRESET_SIZES[options.targetSize?.toLowerCase()] || [612, 792];
    if (options.targetSize === 'custom' && options.customWidth && options.customHeight) {
      targetW = Number(options.customWidth);
      targetH = Number(options.customHeight);
    }

    const m = options.margins || { top: 36, right: 36, bottom: 36, left: 36 };
    const marginTop = Number(m.top) || 0;
    const marginRight = Number(m.right) || 0;
    const marginBottom = Number(m.bottom) || 0;
    const marginLeft = Number(m.left) || 0;

    const destDoc = await PDFDocument.create();
    const fontMap = await this.loadStandardFonts(destDoc);

    for (let i = 0; i < pages.length; i++) {
      const pageRecord = pages[i];
      const pageNum = i + 1;

      if (!targetSet.has(pageNum)) {
        let destPage;
        if (pageRecord.isBlank) {
          destPage = destDoc.addPage([pageRecord.width || 612, pageRecord.height || 792]);
        } else {
          const srcObj = documentModel.getSourceDoc(pageRecord.docId);
          const srcLibDoc = await this.getLibDoc(pageRecord.docId, srcObj.arrayBuffer);
          const [copied] = await destDoc.copyPages(srcLibDoc, [pageRecord.sourceIndex]);
          destPage = destDoc.addPage(copied);
        }
        const baseRotation = destPage.getRotation().angle;
        const userRotation = pageRecord.rotation || 0;
        destPage.setRotation(degrees((baseRotation + userRotation) % 360));

        const pageAnnots = annotationManager ? annotationManager.getAnnotationsForPage(pageRecord.id) : [];
        await this.burnPageAnnotations(destDoc, destPage, pageAnnots, fontMap);
        continue;
      }

      let pageW = targetW;
      let pageH = targetH;

      if (options.orientation === 'landscape' && pageW < pageH) {
        [pageW, pageH] = [pageH, pageW];
      } else if (options.orientation === 'portrait' && pageW > pageH) {
        [pageW, pageH] = [pageH, pageW];
      }

      const destPage = destDoc.addPage([pageW, pageH]);

      if (pageRecord.isBlank) {
        const pageAnnots = annotationManager ? annotationManager.getAnnotationsForPage(pageRecord.id) : [];
        await this.burnPageAnnotations(destDoc, destPage, pageAnnots, fontMap);
        continue;
      }

      const srcObj = documentModel.getSourceDoc(pageRecord.docId);
      const origLibDoc = await this.getLibDoc(pageRecord.docId, srcObj.arrayBuffer);
      const [embeddedPage] = await destDoc.embedPages([origLibDoc.getPages()[pageRecord.sourceIndex]]);
      const origSize = embeddedPage.size();

      if (options.orientation === 'auto') {
        const isOrigLandscape = origSize.width > origSize.height;
        const isTargetLandscape = pageW > pageH;
        if (isOrigLandscape !== isTargetLandscape) {
          [pageW, pageH] = [pageH, pageW];
          destPage.setSize(pageW, pageH);
        }
      }

      const availW = Math.max(10, pageW - marginLeft - marginRight);
      const availH = Math.max(10, pageH - marginTop - marginBottom);

      const scale = Math.min(availW / origSize.width, availH / origSize.height);
      const drawW = origSize.width * scale;
      const drawH = origSize.height * scale;

      const drawX = marginLeft + (availW - drawW) / 2;
      const drawY = marginBottom + (availH - drawH) / 2;

      destPage.drawPage(embeddedPage, {
        x: drawX,
        y: drawY,
        width: drawW,
        height: drawH,
      });

      const pageAnnots = annotationManager ? annotationManager.getAnnotationsForPage(pageRecord.id) : [];
      await this.burnPageAnnotations(destDoc, destPage, pageAnnots, fontMap);
    }

    const compiledBytes = await destDoc.save();
    const cleanBase = (options.originalName || 'document.pdf').replace(/\.pdf$/i, '');
    const filename = `${cleanBase}-resized.pdf`;

    if (options.download !== false) {
      this.triggerDownload(compiledBytes, filename);
    }

    return {
      success: true,
      filename,
      size: compiledBytes.byteLength,
      bytes: compiledBytes,
      resizedCount: targetSet.size,
    };
  }

  /**
   * Apply headers and footers with dynamic placeholder tokens:
   * {page}, {total}, {filename}, {date}
   */
  async applyHeadersFooters(documentModel, annotationManager, options = {}) {
    if (!this.isEngineLoaded()) throw new Error('pdf-lib is not loaded.');

    const { PDFDocument, rgb, degrees } = window.PDFLib;
    const pages = documentModel.getPages();
    const totalPages = pages.length;
    if (totalPages === 0) throw new Error('Document has no pages.');

    const targetPageNums = this.parsePageRange(options.pageRange || 'all', totalPages, options.currentPage || 1);
    const targetSet = new Set(targetPageNums);

    const destDoc = await PDFDocument.create();
    const fontMap = await this.loadStandardFonts(destDoc);

    const fontSize = Number(options.fontSize) || 9;
    const textColor = this.hexToRgb(options.color || '#555555', rgb);
    const fontName = options.fontFamily || 'Helvetica';
    const font = fontMap[fontName]?.regular || fontMap.Helvetica.regular;
    const margin = Number(options.margin) || 36;
    const originalName = options.originalName || 'document.pdf';
    const dateStr = new Date().toISOString().split('T')[0];

    for (let i = 0; i < pages.length; i++) {
      const pageRecord = pages[i];
      const pageNum = i + 1;
      let destPage;

      if (pageRecord.isBlank) {
        destPage = destDoc.addPage([pageRecord.width || 612, pageRecord.height || 792]);
      } else {
        const srcObj = documentModel.getSourceDoc(pageRecord.docId);
        const srcLibDoc = await this.getLibDoc(pageRecord.docId, srcObj.arrayBuffer);
        const [copied] = await destDoc.copyPages(srcLibDoc, [pageRecord.sourceIndex]);
        destPage = destDoc.addPage(copied);
      }

      const baseRotation = destPage.getRotation().angle;
      const userRotation = pageRecord.rotation || 0;
      destPage.setRotation(degrees((baseRotation + userRotation) % 360));

      const pageAnnots = annotationManager ? annotationManager.getAnnotationsForPage(pageRecord.id) : [];
      await this.burnPageAnnotations(destDoc, destPage, pageAnnots, fontMap);

      if (targetSet.has(pageNum)) {
        const { width, height } = destPage.getSize();

        const replaceTokens = (str) => {
          if (!str) return '';
          return str
            .replace(/\{page\}/gi, String(pageNum))
            .replace(/\{total\}/gi, String(totalPages))
            .replace(/\{filename\}/gi, originalName)
            .replace(/\{date\}/gi, dateStr);
        };

        const headerY = height - margin;
        const footerY = margin - fontSize;

        if (options.headerLeft) {
          const text = replaceTokens(options.headerLeft);
          destPage.drawText(text, { x: margin, y: headerY, size: fontSize, font, color: textColor });
        }
        if (options.headerCenter) {
          const text = replaceTokens(options.headerCenter);
          const w = font.widthOfTextAtSize(text, fontSize);
          destPage.drawText(text, { x: (width - w) / 2, y: headerY, size: fontSize, font, color: textColor });
        }
        if (options.headerRight) {
          const text = replaceTokens(options.headerRight);
          const w = font.widthOfTextAtSize(text, fontSize);
          destPage.drawText(text, { x: width - margin - w, y: headerY, size: fontSize, font, color: textColor });
        }

        if (options.footerLeft) {
          const text = replaceTokens(options.footerLeft);
          destPage.drawText(text, { x: margin, y: footerY, size: fontSize, font, color: textColor });
        }
        if (options.footerCenter) {
          const text = replaceTokens(options.footerCenter);
          const w = font.widthOfTextAtSize(text, fontSize);
          destPage.drawText(text, { x: (width - w) / 2, y: footerY, size: fontSize, font, color: textColor });
        }
        if (options.footerRight) {
          const text = replaceTokens(options.footerRight);
          const w = font.widthOfTextAtSize(text, fontSize);
          destPage.drawText(text, { x: width - margin - w, y: footerY, size: fontSize, font, color: textColor });
        }
      }
    }

    const compiledBytes = await destDoc.save();
    const cleanBase = originalName.replace(/\.pdf$/i, '');
    const filename = `${cleanBase}-headerfooter.pdf`;

    if (options.download !== false) {
      this.triggerDownload(compiledBytes, filename);
    }

    return {
      success: true,
      filename,
      size: compiledBytes.byteLength,
      bytes: compiledBytes,
    };
  }

  /**
   * Apply legal sequential Bates numbering: PREFIX-000001-SUFFIX
   */
  async applyBatesNumbering(documentModel, annotationManager, options = {}) {
    if (!this.isEngineLoaded()) throw new Error('pdf-lib is not loaded.');

    const { PDFDocument, rgb, degrees } = window.PDFLib;
    const pages = documentModel.getPages();
    const totalPages = pages.length;
    if (totalPages === 0) throw new Error('Document has no pages.');

    const targetPageNums = this.parsePageRange(options.pageRange || 'all', totalPages, options.currentPage || 1);
    const targetSet = new Set(targetPageNums);

    const destDoc = await PDFDocument.create();
    const fontMap = await this.loadStandardFonts(destDoc);

    const prefix = options.prefix !== undefined ? options.prefix : 'SAVY-';
    const suffix = options.suffix || '';
    let currentNum = Number(options.startNumber) || 1;
    const padding = Number(options.padding) || 6;
    const position = options.position || 'bottom-right';
    const fontSize = Number(options.fontSize) || 10;
    const margin = Number(options.margin) || 36;
    const font = fontMap.HelveticaBold?.regular || fontMap.Helvetica.bold;
    const textColor = this.hexToRgb(options.color || '#000000', rgb);

    for (let i = 0; i < pages.length; i++) {
      const pageRecord = pages[i];
      const pageNum = i + 1;
      let destPage;

      if (pageRecord.isBlank) {
        destPage = destDoc.addPage([pageRecord.width || 612, pageRecord.height || 792]);
      } else {
        const srcObj = documentModel.getSourceDoc(pageRecord.docId);
        const srcLibDoc = await this.getLibDoc(pageRecord.docId, srcObj.arrayBuffer);
        const [copied] = await destDoc.copyPages(srcLibDoc, [pageRecord.sourceIndex]);
        destPage = destDoc.addPage(copied);
      }

      const baseRotation = destPage.getRotation().angle;
      const userRotation = pageRecord.rotation || 0;
      destPage.setRotation(degrees((baseRotation + userRotation) % 360));

      const pageAnnots = annotationManager ? annotationManager.getAnnotationsForPage(pageRecord.id) : [];
      await this.burnPageAnnotations(destDoc, destPage, pageAnnots, fontMap);

      if (targetSet.has(pageNum)) {
        const { width, height } = destPage.getSize();
        const numStr = String(currentNum).padStart(padding, '0');
        const batesLabel = `${prefix}${numStr}${suffix}`;
        const textW = font.widthOfTextAtSize(batesLabel, fontSize);

        let x = width - margin - textW;
        let y = margin;

        switch (position) {
          case 'bottom-left':
            x = margin;
            y = margin;
            break;
          case 'bottom-center':
            x = (width - textW) / 2;
            y = margin;
            break;
          case 'bottom-right':
            x = width - margin - textW;
            y = margin;
            break;
          case 'top-left':
            x = margin;
            y = height - margin;
            break;
          case 'top-center':
            x = (width - textW) / 2;
            y = height - margin;
            break;
          case 'top-right':
            x = width - margin - textW;
            y = height - margin;
            break;
        }

        destPage.drawText(batesLabel, {
          x,
          y,
          size: fontSize,
          font,
          color: textColor,
        });

        currentNum++;
      }
    }

    const compiledBytes = await destDoc.save();
    const cleanBase = (options.originalName || 'document.pdf').replace(/\.pdf$/i, '');
    const filename = `${cleanBase}-bates.pdf`;

    if (options.download !== false) {
      this.triggerDownload(compiledBytes, filename);
    }

    return {
      success: true,
      filename,
      size: compiledBytes.byteLength,
      bytes: compiledBytes,
      batesCount: targetSet.size,
    };
  }

  triggerDownload(bytes, filename) {
    const blob = new Blob([bytes], { type: 'application/pdf' });
    const downloadUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = downloadUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(downloadUrl), 8000);
  }

  // --- Utility Methods ---
  hexToRgb(hex, rgbFunc) {
    if (!hex || hex === 'transparent') return rgbFunc(0, 0, 0);
    let c = hex.replace('#', '');
    if (c.length === 3) {
      c = c[0] + c[0] + c[1] + c[1] + c[2] + c[2];
    }
    const r = parseInt(c.substring(0, 2), 16) / 255;
    const g = parseInt(c.substring(2, 4), 16) / 255;
    const b = parseInt(c.substring(4, 6), 16) / 255;
    return rgbFunc(isNaN(r) ? 0 : r, isNaN(g) ? 0 : g, isNaN(b) ? 0 : b);
  }

  pointsToSvgPath(points, originX = 0, originY = 0) {
    if (!points || points.length === 0) return '';
    if (points.length === 1) {
      const p = points[0];
      const relX = p.x - originX;
      const relY = p.y - originY;
      return `M ${relX} ${relY} L ${relX + 0.1} ${relY + 0.1}`;
    }

    let d = `M ${points[0].x - originX} ${points[0].y - originY}`;
    for (let i = 1; i < points.length - 1; i++) {
      const current = points[i];
      const next = points[i + 1];
      const midX = (current.x + next.x) / 2 - originX;
      const midY = (current.y + next.y) / 2 - originY;
      d += ` Q ${current.x - originX} ${current.y - originY}, ${midX} ${midY}`;
    }
    const last = points[points.length - 1];
    d += ` L ${last.x - originX} ${last.y - originY}`;
    return d;
  }

  drawArrowHeadPdf(pdfPage, x1, y1, x2, y2, color, strokeWidth) {
    const angle = Math.atan2(y2 - y1, x2 - x1);
    const headLength = Math.max(8, strokeWidth * 3.5);
    const angle1 = angle - Math.PI / 6;
    const angle2 = angle + Math.PI / 6;

    const p1x = x2 - headLength * Math.cos(angle1);
    const p1y = y2 - headLength * Math.sin(angle1);
    const p2x = x2 - headLength * Math.cos(angle2);
    const p2y = y2 - headLength * Math.sin(angle2);

    pdfPage.drawLine({
      start: { x: x2, y: y2 },
      end: { x: p1x, y: p1y },
      thickness: strokeWidth,
      color,
    });
    pdfPage.drawLine({
      start: { x: x2, y: y2 },
      end: { x: p2x, y: p2y },
      thickness: strokeWidth,
      color,
    });
  }

  dataUrlToUint8Array(dataUrl) {
    const base64 = dataUrl.split(',')[1];
    const binary = atob(base64);
    const len = binary.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }

  async convertToPngBytes(dataUrl) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth || 300;
        canvas.height = img.naturalHeight || 300;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);
        const pngUrl = canvas.toDataURL('image/png');
        resolve(this.dataUrlToUint8Array(pngUrl));
      };
      img.onerror = reject;
      img.src = dataUrl;
    });
  }
}
