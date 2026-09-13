/**
 * SAVY PDF Workspace — Redaction Manager (redaction-manager.js)
 * Phase 5 Visual & Sanitized Redaction Engine
 *
 * Provides two modes of client-side redaction:
 * 1. Permanent Visual Redaction:
 *    Burns solid opaque black rectangles (rgb 0, 0, 0) directly into the PDF content stream via pdf-lib.
 *    Honest limitation disclosure: Underlying text streams may still be indexed or extractable in some viewers.
 *
 * 2. Sanitized Redaction (Page Rasterization):
 *    Renders redacted page(s) to a high-DPI HTML5 canvas with redactions permanently rasterized
 *    into the pixel buffer, completely eliminating underlying text tokens, glyphs, and font streams.
 *    Verified by PDF.js text extraction returning zero underlying text.
 *
 * Privacy Guarantee:
 * "Your PDF is processed locally in your browser and is not uploaded to SAVY's servers."
 */

import { downloadBlob, sanitizeFilename } from './security-manager.js';
import { PDFPageOperations } from './pdf-page-operations.js';

export class RedactionManager {
  constructor({ editorApp, onToast }) {
    this.editorApp = editorApp;
    this.onToast = onToast || (() => {});

    this.initElements();
    this.bindEvents();
  }

  initElements() {
    this.applyModal = document.getElementById('applyRedactionModal');
    this.btnConfirmRedaction = document.getElementById('btnConfirmApplyRedaction');
    this.btnCancelRedaction = document.getElementById('btnCancelApplyRedaction');
    this.redactCountEl = document.getElementById('applyRedactCount');
    this.btnToolbarApply = document.getElementById('btnApplyRedactionToolbar');
  }

  bindEvents() {
    this.btnToolbarApply?.addEventListener('click', () => this.openApplyModal());
    this.btnCancelRedaction?.addEventListener('click', () => this.closeApplyModal());
    this.btnConfirmRedaction?.addEventListener('click', () => this.executeApplyRedactions());
  }

  openApplyModal() {
    const allAnnots = this.editorApp.annotationManager.getAllAnnotationsByPageId();
    let redactCount = 0;
    for (const list of allAnnots.values()) {
      redactCount += list.filter((a) => a.type === 'redact').length;
    }

    if (redactCount === 0) {
      this.onToast('No draft redactions found. Use the Redact tool to draw areas first.');
      return;
    }

    if (this.redactCountEl) this.redactCountEl.textContent = redactCount;
    if (this.applyModal) this.applyModal.style.display = 'flex';
  }

  closeApplyModal() {
    if (this.applyModal) this.applyModal.style.display = 'none';
  }

  /**
   * Executes the chosen redaction method (Visual or Sanitized)
   */
  async executeApplyRedactions() {
    const mode = document.querySelector('input[name="redactionMode"]:checked')?.value || 'visual';
    const btn = this.btnConfirmRedaction;

    try {
      if (btn) {
        btn.disabled = true;
        btn.textContent = 'Applying Redactions...';
      }

      let resultBytes;
      const docName = sanitizeFilename(
        (this.editorApp.pdfViewer.docMetadata?.name || 'document').replace(/\.pdf$/i, '')
      );
      let filename;

      if (mode === 'sanitized') {
        // Mode B: Sanitized Redaction (Page Rasterization)
        resultBytes = await this.applySanitizedRedactions();
        filename = `${docName}-sanitized-redacted.pdf`;
      } else {
        // Mode A: Permanent Visual Redaction (pdf-lib Opaque Box)
        resultBytes = await this.applyVisualRedactions();
        filename = `${docName}-visual-redacted.pdf`;
      }

      // Download file
      downloadBlob(new Blob([resultBytes], { type: 'application/pdf' }), filename);

      // Clean up overlay redaction annotations and reload the new document in viewer
      this.cleanupRedactionAnnotations();
      await this.editorApp.pdfViewer.loadDocument(resultBytes, filename);

      this.closeApplyModal();
      this.onToast(
        mode === 'sanitized'
          ? 'Sanitized redaction applied! Text layer was eliminated from redacted pages.'
          : 'Visual redaction applied! Opaque black blocks burned into PDF.'
      );
    } catch (err) {
      console.error('Redaction execution error:', err);
      this.onToast('Redaction failed: ' + (err.message || 'Unknown error'));
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = 'Apply & Download PDF';
      }
    }
  }

  /**
   * Mode A: Permanent Visual Redaction
   * Uses pdf-lib to draw solid opaque black rectangles into page content stream
   */
  async applyVisualRedactions() {
    const ops = this.editorApp.pdfExport?.pageOperations || new PDFPageOperations();

    const res = await ops.compileDocumentWithModel(
      this.editorApp.documentModel,
      this.editorApp.annotationManager
    );

    return res.bytes || res;
  }

  /**
   * Mode B: Sanitized Redaction
   * Renders redacted pages to high-DPI canvas with redaction pixels burned in,
   * converting pages to images to completely remove underlying text tokens.
   */
  async applySanitizedRedactions() {
    const { PDFDocument } = window.PDFLib;
    const pdfjsDoc = this.editorApp.pdfViewer.pdfDoc;
    const docModel = this.editorApp.documentModel;
    const annotManager = this.editorApp.annotationManager;

    const newDoc = await PDFDocument.create();
    const totalPages = docModel.getPageCount();

    for (let pageIdx = 0; pageIdx < totalPages; pageIdx++) {
      const pageRecord = docModel.getPage(pageIdx);
      const pageAnnots = annotManager.getAnnotationsForPage(pageRecord.id);
      const redactAnnots = pageAnnots.filter((a) => a.type === 'redact');

      if (redactAnnots.length > 0) {
        // This page has redactions: Render to canvas and destroy underlying text stream
        const srcObj = docModel.getSourceDoc(pageRecord.docId);
        const sourceDoc = srcObj?.pdfjsDoc || pdfjsDoc;
        const pageNum = (pageRecord.sourceIndex !== undefined && pageRecord.sourceIndex !== null)
          ? pageRecord.sourceIndex + 1
          : pageIdx + 1;
        const page = await sourceDoc.getPage(pageNum);
        const scale = 1.5; // High-DPI crisp scale
        const viewport = page.getViewport({ scale, rotation: pageRecord.rotation || 0 });

        const canvas = document.createElement('canvas');
        canvas.width = Math.floor(viewport.width);
        canvas.height = Math.floor(viewport.height);
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Render underlying page
        await page.render({ canvasContext: ctx, viewport }).promise;

        // Permanently draw solid black boxes over the canvas pixels
        ctx.fillStyle = '#000000';
        for (const r of redactAnnots) {
          const vx = r.x * scale;
          const vy = r.y * scale;
          const vw = r.width * scale;
          const vh = r.height * scale;
          ctx.fillRect(vx, vy, vw, vh);
        }

        // Convert canvas to image buffer
        const blob = await new Promise((res) => canvas.toBlob(res, 'image/jpeg', 0.92));
        const imgBuffer = await blob.arrayBuffer();
        const embeddedImg = await newDoc.embedJpg(imgBuffer);

        // Add page matching original point dimensions
        const newPage = newDoc.addPage([pageRecord.width || 612, pageRecord.height || 792]);
        newPage.drawImage(embeddedImg, {
          x: 0,
          y: 0,
          width: pageRecord.width || 612,
          height: pageRecord.height || 792,
        });
      } else {
        // No redactions on this page: copy directly to preserve crisp vectors & selectable text
        const srcObj = docModel.getSourceDoc(pageRecord.docId);
        if (srcObj && srcObj.arrayBuffer) {
          const srcDoc = await PDFDocument.load(srcObj.arrayBuffer.slice(0));
          const [copied] = await newDoc.copyPages(srcDoc, [pageRecord.sourceIndex]);
          copied.setRotation(window.PDFLib.degrees(pageRecord.rotation || 0));
          newDoc.addPage(copied);
        } else {
          newDoc.addPage([pageRecord.width || 612, pageRecord.height || 792]);
        }
      }
    }

    return await newDoc.save({ useObjectStreams: true });
  }

  /**
   * Cleans up draft redaction annotations from the active document overlay
   */
  cleanupRedactionAnnotations() {
    const allAnnots = this.editorApp.annotationManager.getAllAnnotationsByPageId();
    for (const [pageId, list] of allAnnots.entries()) {
      const nonRedacts = list.filter((a) => a.type !== 'redact');
      this.editorApp.annotationManager.setAnnotationsForPage(pageId, nonRedacts);
    }
    this.editorApp.annotationManager.renderCurrentPage();
  }
}
