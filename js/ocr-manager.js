/**
 * SAVY PDF Workspace — Client-Side Optical Character Recognition (ocr-manager.js)
 * High-resolution local text extraction from scanned PDF documents using Tesseract.js (WASM).
 *
 * Privacy Guarantee:
 * "Your PDF is processed locally in your browser and is never uploaded to SAVY servers."
 * WebAssembly OCR runs 100% inside your browser memory.
 */

export class OCRManager {
  constructor({ editorApp, onToast }) {
    this.editorApp = editorApp;
    this.pdfViewer = editorApp.pdfViewer;
    this.documentModel = editorApp.documentModel;
    this.onToast = onToast || (() => {});

    this.isProcessing = false;
    this.isCancelled = false;
    this.extractedText = '';
    this.worker = null;

    this.initElements();
    this.bindEvents();
  }

  initElements() {
    this.modal = document.getElementById('ocrModal');
    this.btnClose = document.getElementById('btnOcrClose');
    this.btnCancel = document.getElementById('btnOcrCancel');
    this.btnStart = document.getElementById('btnOcrStart');
    this.btnCopy = document.getElementById('btnOcrCopy');
    this.btnDownload = document.getElementById('btnOcrDownload');

    this.rangeSelect = document.getElementById('ocrPageRange');
    this.customRangeInput = document.getElementById('ocrCustomRange');
    this.languageSelect = document.getElementById('ocrLanguage');

    this.progressBar = document.getElementById('ocrProgressBar');
    this.progressFill = document.getElementById('ocrProgressFill');
    this.progressText = document.getElementById('ocrProgressText');
    this.resultContainer = document.getElementById('ocrResultContainer');
    this.resultTextarea = document.getElementById('ocrResultText');
  }

  bindEvents() {
    if (this.btnClose) {
      this.btnClose.addEventListener('click', () => this.close());
    }

    if (this.btnCancel) {
      this.btnCancel.addEventListener('click', () => this.cancel());
    }

    if (this.btnStart) {
      this.btnStart.addEventListener('click', () => this.runOCR());
    }

    if (this.btnCopy) {
      this.btnCopy.addEventListener('click', () => {
        if (this.resultTextarea && this.resultTextarea.value) {
          navigator.clipboard.writeText(this.resultTextarea.value);
          this.onToast('OCR text copied to clipboard.');
        }
      });
    }

    if (this.btnDownload) {
      this.btnDownload.addEventListener('click', () => this.downloadText());
    }

    if (this.rangeSelect) {
      this.rangeSelect.addEventListener('change', () => {
        if (this.customRangeInput) {
          this.customRangeInput.style.display = this.rangeSelect.value === 'custom' ? 'block' : 'none';
        }
      });
    }
  }

  openModal() {
    this.open();
  }

  open() {
    if (!this.pdfViewer.hasDocument()) {
      this.onToast('Please open a PDF document first.');
      return;
    }

    this.isCancelled = false;
    this.isProcessing = false;
    if (this.modal) {
      this.modal.style.display = 'flex';
      this.modal.classList.add('is-open');
    }

    if (this.progressBar) this.progressBar.style.display = 'none';
    if (this.progressFill) this.progressFill.style.width = '0%';
    if (this.btnStart) this.btnStart.disabled = false;
    if (this.btnCancel) this.btnCancel.disabled = true;
    if (this.resultContainer) this.resultContainer.style.display = 'none';
  }

  close() {
    if (this.isProcessing) {
      this.cancel();
    }
    if (this.modal) {
      this.modal.style.display = 'none';
      this.modal.classList.remove('is-open');
    }
  }

  cancel() {
    this.isCancelled = true;
    this.isProcessing = false;
    if (this.progressText) {
      this.progressText.textContent = 'OCR process cancelled.';
    }
    if (this.btnStart) this.btnStart.disabled = false;
    if (this.btnCancel) this.btnCancel.disabled = true;
    this.onToast('OCR process cancelled.');
  }

  async runOCR() {
    if (!window.Tesseract) {
      this.onToast('Loading OCR engine (Tesseract.js)...');
      try {
        await this.loadTesseractScript();
      } catch (err) {
        this.onToast('Failed to load OCR engine from CDN: ' + err.message);
        return;
      }
    }

    const totalPages = this.documentModel ? this.documentModel.getPageCount() : (this.pdfViewer.totalPages || 0);
    if (totalPages === 0) return;

    let targetPages = [];
    const rangeVal = this.rangeSelect ? this.rangeSelect.value : 'all';

    if (rangeVal === 'current') {
      targetPages = [this.pdfViewer.currentPage || 1];
    } else if (rangeVal === 'custom' && this.customRangeInput?.value) {
      targetPages = this.editorApp.pdfExport.pageOperations.parsePageRange(
        this.customRangeInput.value,
        totalPages,
        this.pdfViewer.currentPage || 1
      );
    } else {
      for (let i = 1; i <= totalPages; i++) targetPages.push(i);
    }

    if (targetPages.length === 0) {
      this.onToast('No pages selected for OCR.');
      return;
    }

    this.isProcessing = true;
    this.isCancelled = false;
    if (this.btnStart) this.btnStart.disabled = true;
    if (this.btnCancel) this.btnCancel.disabled = false;
    if (this.progressBar) this.progressBar.style.display = 'block';
    if (this.resultContainer) this.resultContainer.style.display = 'none';

    const lang = this.languageSelect ? this.languageSelect.value : 'eng';
    let combinedText = '';

    try {
      for (let idx = 0; idx < targetPages.length; idx++) {
        if (this.isCancelled) break;

        const pageNum = targetPages[idx];
        const pctBase = Math.round((idx / targetPages.length) * 100);

        if (this.progressText) {
          this.progressText.textContent = `Rendering page ${pageNum} (${idx + 1}/${targetPages.length})...`;
        }
        if (this.progressFill) this.progressFill.style.width = `${pctBase}%`;

        // Render page to high-resolution 2.0x canvas for OCR accuracy
        const pageCanvas = await this.renderPageToCanvas(pageNum, 2.0);
        if (!pageCanvas || this.isCancelled) break;

        if (this.progressText) {
          this.progressText.textContent = `Recognizing text on page ${pageNum} (${idx + 1}/${targetPages.length})...`;
        }

        const { data } = await window.Tesseract.recognize(pageCanvas, lang, {
          logger: (m) => {
            if (m.status === 'recognizing text' && m.progress !== undefined) {
              const pagePct = Math.round(m.progress * 100);
              const overallPct = Math.round(pctBase + (m.progress / targetPages.length) * 100);
              if (this.progressFill) this.progressFill.style.width = `${overallPct}%`;
              if (this.progressText) {
                this.progressText.textContent = `Page ${pageNum} (${idx + 1}/${targetPages.length}): ${pagePct}%`;
              }
            }
          },
        });

        const pageText = (data && data.text) ? data.text.trim() : '';
        combinedText += `\n\n--- Page ${pageNum} ---\n\n${pageText}\n`;
      }

      if (!this.isCancelled) {
        this.extractedText = combinedText.trim();
        if (this.progressFill) this.progressFill.style.width = '100%';
        if (this.progressText) this.progressText.textContent = 'OCR completed successfully!';

        if (this.resultContainer) this.resultContainer.style.display = 'block';
        if (this.resultTextarea) this.resultTextarea.value = this.extractedText;

        this.onToast(`OCR extracted text from ${targetPages.length} page(s).`);
      }
    } catch (err) {
      console.error('OCR Error:', err);
      if (this.progressText) this.progressText.textContent = `OCR failed: ${err.message}`;
      this.onToast('OCR failed: ' + err.message);
    } finally {
      this.isProcessing = false;
      if (this.btnStart) this.btnStart.disabled = false;
      if (this.btnCancel) this.btnCancel.disabled = true;
    }
  }

  async renderPageToCanvas(pageNum, scale = 2.0) {
    const pageRecord = this.documentModel ? this.documentModel.getPage(pageNum - 1) : null;
    if (pageRecord && pageRecord.isBlank) {
      const c = document.createElement('canvas');
      c.width = 612 * scale;
      c.height = 792 * scale;
      const ctx = c.getContext('2d');
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, c.width, c.height);
      return c;
    }

    let srcPdfjsDoc = this.pdfViewer.pdfDoc;
    let srcPageIndex = pageNum;

    if (pageRecord && pageRecord.docId) {
      const srcObj = this.documentModel.getSourceDoc(pageRecord.docId);
      if (srcObj && srcObj.pdfjsDoc) srcPdfjsDoc = srcObj.pdfjsDoc;
      srcPageIndex = pageRecord.sourceIndex + 1;
    }

    if (!srcPdfjsDoc) return null;

    const page = await srcPdfjsDoc.getPage(srcPageIndex);
    const userRotation = pageRecord?.rotation || 0;
    const totalRotation = ((page.rotate || 0) + userRotation) % 360;
    const viewport = page.getViewport({ scale, rotation: totalRotation });

    const canvas = document.createElement('canvas');
    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    await page.render({
      canvasContext: ctx,
      viewport,
    }).promise;

    return canvas;
  }

  loadTesseractScript() {
    return new Promise((resolve, reject) => {
      if (window.Tesseract) {
        resolve();
        return;
      }
      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';
      script.onload = () => resolve();
      script.onerror = (e) => reject(new Error('Could not load Tesseract.js from CDN.'));
      document.head.appendChild(script);
    });
  }

  downloadText() {
    if (!this.extractedText) return;
    const blob = new Blob([this.extractedText], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const originalName = this.pdfViewer.currentFile?.name || 'document';
    const cleanBase = originalName.replace(/\.pdf$/i, '');
    a.href = url;
    a.download = `${cleanBase}-ocr.txt`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 8000);
  }
}
