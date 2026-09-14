/**
 * SAVY PDF Workspace — PDF Export Module (export.js)
 * Real client-side PDF compilation and annotation burning engine utilizing pdf-lib.
 *
 * Privacy Guarantee: 100% in-browser memory compilation. Zero bytes transmitted to any server.
 */

import { PDFPageOperations } from './pdf-page-operations.js';
import { PdfContentStreamEditor } from './pdf-content-stream-editor.js';

export class PDFExport {
  constructor({ onExportStart, onExportSuccess, onExportError } = {}) {
    this.onExportStart = onExportStart || (() => {});
    this.onExportSuccess = onExportSuccess || (() => {});
    this.onExportError = onExportError || ((err) => console.error(err));
    this.pageOperations = new PDFPageOperations();
  }

  isEngineLoaded() {
    return typeof window !== 'undefined' && Boolean(window.PDFLib);
  }

  /**
   * Compiles user modifications onto the original PDF document bytes
   * and triggers a local browser download.
   *
   * @param {ArrayBuffer|DocumentModel} sourceOrModel - Original PDF bytes or DocumentModel
   * @param {Map<number, Array<Object>>|Object|AnnotationManager} annotationsByPage - Page-keyed annotations or manager
   * @param {string} [originalName='document.pdf'] - Source file name
   * @returns {Promise<{ success: boolean, filename: string, size: number }>}
   */
  async compileModifiedDocument(sourceOrModel, annotationsByPage, originalName = 'document.pdf') {
    try {
      this.onExportStart();

      if (!this.isEngineLoaded()) {
        throw new Error('pdf-lib is not loaded. Please verify your connection to the CDN.');
      }

      // If a DocumentModel was passed, route through full Phase 3 page operations engine
      if (sourceOrModel && typeof sourceOrModel.getPages === 'function') {
        const result = await this.pageOperations.compileDocumentWithModel(sourceOrModel, annotationsByPage, originalName);
        this.onExportSuccess(result);
        return result;
      }

      const sourceBytes = sourceOrModel;
      if (!sourceBytes || sourceBytes.byteLength === 0) {
        throw new Error('No PDF document loaded to export.');
      }

      const { PDFDocument, rgb, StandardFonts, LineCapStyle } = window.PDFLib;

      // Load original document in memory
      const pdfDoc = await PDFDocument.load(sourceBytes, { ignoreEncryption: true });

      // Pre-embed standard fonts
      const fontHelvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);
      const fontHelveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
      const fontHelveticaOblique = await pdfDoc.embedFont(StandardFonts.HelveticaOblique);
      const fontTimes = await pdfDoc.embedFont(StandardFonts.TimesRoman);
      const fontTimesBold = await pdfDoc.embedFont(StandardFonts.TimesRomanBold);
      const fontCourier = await pdfDoc.embedFont(StandardFonts.Courier);
      const fontCourierBold = await pdfDoc.embedFont(StandardFonts.CourierBold);

      const fontMap = {
        Helvetica: { regular: fontHelvetica, bold: fontHelveticaBold, italic: fontHelveticaOblique },
        TimesRoman: { regular: fontTimes, bold: fontTimesBold, italic: fontTimes },
        Courier: { regular: fontCourier, bold: fontCourierBold, italic: fontCourier },
      };

      const pages = pdfDoc.getPages();

      // Normalize annotationsByPage into a lookup function
      const getPageAnnots = (pageNum) => {
        if (annotationsByPage && typeof annotationsByPage.getAnnotationsForPage === 'function') {
          return annotationsByPage.getAnnotationsForPage(pageNum) || [];
        }
        if (annotationsByPage instanceof Map) {
          return annotationsByPage.get(pageNum) || annotationsByPage.get(String(pageNum)) || [];
        }
        if (Array.isArray(annotationsByPage)) {
          return annotationsByPage.filter((a) => a.pageNumber === pageNum || a.page === pageNum);
        }
        const val = annotationsByPage?.[pageNum] || annotationsByPage?.[String(pageNum)];
        return Array.isArray(val) ? val : [];
      };

      // Burn annotations onto each page
      for (let pageIdx = 0; pageIdx < pages.length; pageIdx++) {
        const pageNum = pageIdx + 1;
        const pageAnnots = getPageAnnots(pageNum);
        if (!pageAnnots || pageAnnots.length === 0) continue;

        const pdfPage = pages[pageIdx];
        const { width: pageWidth, height: pageHeight } = pdfPage.getSize();

        // 1. Apply true underlying PDF content stream text replacements
        const textReplacements = pageAnnots.filter((a) => a.type === 'text_replacement');
        if (textReplacements.length > 0) {
          const replacements = textReplacements.map((a) => ({
            originalText: a.originalText,
            newText: a.newText !== undefined ? a.newText : (a.text !== undefined ? a.text : (a.content || '')),
          }));
          await PdfContentStreamEditor.replaceTextInPage(pdfDoc, pdfPage, replacements);
        }

        // 2. Burn remaining visual annotations (excluding text_replacement)
        const nonStreamAnnots = pageAnnots.filter((a) => a.type !== 'text_replacement');
        for (const annot of nonStreamAnnots) {
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

              // Split multi-line text
              const lines = content.split('\n');
              const lineHeight = fontSize * 1.25;

              lines.forEach((line, idx) => {
                const pdfX = annot.x;
                // Baseline offset: PDF coordinates start from bottom; adjust for cap-height
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

              // Construct smooth Bezier SVG path
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
                // For WebP or other formats, convert to PNG via offscreen canvas
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

      // Compile binary
      const modifiedBytes = await pdfDoc.save();

      // Trigger local download
      const cleanBase = originalName.replace(/\.pdf$/i, '');
      const editedFilename = `${cleanBase}-edited.pdf`;

      const blob = new Blob([modifiedBytes], { type: 'application/pdf' });
      const downloadUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = editedFilename;
      document.body.appendChild(link);
      link.click();
      link.remove();

      setTimeout(() => URL.revokeObjectURL(downloadUrl), 8000);

      const result = {
        success: true,
        filename: editedFilename,
        size: modifiedBytes.byteLength,
        bytes: modifiedBytes,
      };

      this.onExportSuccess(result);
      return result;
    } catch (err) {
      this.onExportError(err);
      throw err;
    }
  }

  async extractPages(documentModel, annotationManager, targets, originalName) {
    return this.pageOperations.extractPages(documentModel, annotationManager, targets, originalName);
  }

  async splitPdf(documentModel, annotationManager, options, originalName) {
    return this.pageOperations.splitPdf(documentModel, annotationManager, options, originalName);
  }

  async mergePdfs(filesList, outputName) {
    return this.pageOperations.mergePdfs(filesList, outputName);
  }

  // --- Utility Functions ---
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
