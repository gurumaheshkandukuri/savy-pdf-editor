/**
 * SAVY PDF Workspace — PDF Viewer Module (pdf-viewer.js)
 * Responsible for local, client-side PDF document loading, rendering, and viewport navigation
 * utilizing PDF.js (CDN-loaded).
 *
 * Privacy Guarantee: All bytes are parsed in browser memory.
 */

// Configure PDF.js Worker if pdfjsLib is present
if (typeof window !== 'undefined' && window.pdfjsLib) {
  window.pdfjsLib.GlobalWorkerOptions.workerSrc =
    'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
}

export class PDFViewer {
  constructor({ canvas, viewportContainer, onPageChange, onDocumentLoaded, onZoomChange, onError }) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.viewportContainer = viewportContainer;
    this.onPageChange = onPageChange || (() => {});
    this.onDocumentLoaded = onDocumentLoaded || (() => {});
    this.onZoomChange = onZoomChange || (() => {});
    this.onError = onError || ((err) => console.error(err));

    this.pdfDoc = null;
    this.currentPage = 1;
    this.totalPages = 0;
    this.scale = 1.0;
    this.renderTask = null;
    this.currentFile = null;
    this.docMetadata = null;
    this.isRendering = false;
  }

  /**
   * Load a PDF document from File object or ArrayBuffer
   * @param {File|ArrayBuffer} input
   * @param {string} [filename]
   */
  async loadDocument(input, filename = 'document.pdf') {
    try {
      if (!window.pdfjsLib) {
        throw new Error('PDF.js library is not loaded. Please verify your connection to the CDN.');
      }

      let arrayBuffer;
      let fileMeta = {
        name: filename,
        size: 0,
      };

      if (input instanceof File) {
        fileMeta.name = input.name;
        fileMeta.size = input.size;
        arrayBuffer = await input.arrayBuffer();
        this.currentFile = input;
      } else if (input instanceof ArrayBuffer) {
        arrayBuffer = input;
        fileMeta.size = input.byteLength;
      } else {
        throw new Error('Unsupported input format for PDF loading.');
      }

      // Cancel any ongoing render
      if (this.renderTask) {
        this.renderTask.cancel();
      }

      const loadingTask = window.pdfjsLib.getDocument({
        data: arrayBuffer,
        cMapUrl: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/cmaps/',
        cMapPacked: true,
      });

      this.pdfDoc = await loadingTask.promise;
      this.totalPages = this.pdfDoc.numPages;
      this.currentPage = 1;

      // Extract metadata safely
      try {
        const meta = await this.pdfDoc.getMetadata();
        this.docMetadata = {
          ...fileMeta,
          title: meta?.info?.Title || fileMeta.name,
          author: meta?.info?.Author || 'Not specified',
          creator: meta?.info?.Creator || 'Local Document',
          producer: meta?.info?.Producer || 'Standard PDF',
          version: meta?.info?.PDFFormatVersion || '1.7',
          pages: this.totalPages,
        };
      } catch (metaErr) {
        this.docMetadata = {
          ...fileMeta,
          title: fileMeta.name,
          pages: this.totalPages,
          version: 'Standard',
        };
      }

      await this.renderPage(1);

      this.onDocumentLoaded(this.docMetadata);
      return this.docMetadata;
    } catch (err) {
      if (err.name === 'RenderingCancelledException') {
        return;
      }
      this.onError(err);
      throw err;
    }
  }

  /**
   * Render a specific page number to the canvas
   * @param {number} pageNum
   */
  async renderPage(pageNum) {
    if (!this.pdfDoc || pageNum < 1 || pageNum > this.totalPages) {
      return;
    }

    // Cancel in-flight render task if active
    if (this.renderTask) {
      this.renderTask.cancel();
      this.renderTask = null;
    }

    this.isRendering = true;
    this.currentPage = pageNum;

    try {
      const page = await this.pdfDoc.getPage(pageNum);
      const pixelRatio = window.devicePixelRatio || 1;

      const viewport = page.getViewport({ scale: this.scale });

      // Canvas internal resolution (scaled for crisp high-DPI retina display)
      this.canvas.width = Math.floor(viewport.width * pixelRatio);
      this.canvas.height = Math.floor(viewport.height * pixelRatio);

      // Canvas CSS layout size
      this.canvas.style.width = `${Math.floor(viewport.width)}px`;
      this.canvas.style.height = `${Math.floor(viewport.height)}px`;

      const renderContext = {
        canvasContext: this.ctx,
        viewport: viewport,
        transform: pixelRatio !== 1 ? [pixelRatio, 0, 0, pixelRatio, 0, 0] : null,
      };

      this.renderTask = page.render(renderContext);
      await this.renderTask.promise;
      this.renderTask = null;
      this.isRendering = false;

      this.onPageChange(this.currentPage, this.totalPages);
    } catch (error) {
      this.isRendering = false;
      if (error?.name === 'RenderingCancelledException') {
        // Expected cancellation when user quickly clicks through pages
        return;
      }
      this.onError(error);
    }
  }

  /**
   * Adjust scale directly
   * @param {number} newScale
   */
  async setZoom(newScale) {
    const clamped = Math.max(0.25, Math.min(newScale, 3.0));
    if (Math.abs(this.scale - clamped) < 0.01) return;
    this.scale = clamped;
    this.onZoomChange(this.scale);
    if (this.pdfDoc) {
      await this.renderPage(this.currentPage);
    }
  }

  zoomIn() {
    this.setZoom(this.scale + 0.25);
  }

  zoomOut() {
    this.setZoom(this.scale - 0.25);
  }

  async fitWidth() {
    if (!this.pdfDoc) return;
    const page = await this.pdfDoc.getPage(this.currentPage);
    const unscaledViewport = page.getViewport({ scale: 1.0 });
    const availableWidth = this.viewportContainer.clientWidth - 48; // padding allowance
    if (availableWidth > 0 && unscaledViewport.width > 0) {
      const targetScale = availableWidth / unscaledViewport.width;
      this.setZoom(targetScale);
    }
  }

  async fitPage() {
    if (!this.pdfDoc) return;
    const page = await this.pdfDoc.getPage(this.currentPage);
    const unscaledViewport = page.getViewport({ scale: 1.0 });
    const availableWidth = this.viewportContainer.clientWidth - 48;
    const availableHeight = this.viewportContainer.clientHeight - 80;
    if (availableWidth > 0 && availableHeight > 0) {
      const scaleW = availableWidth / unscaledViewport.width;
      const scaleH = availableHeight / unscaledViewport.height;
      const targetScale = Math.min(scaleW, scaleH);
      this.setZoom(targetScale);
    }
  }

  nextPage() {
    if (this.currentPage < this.totalPages) {
      this.renderPage(this.currentPage + 1);
    }
  }

  prevPage() {
    if (this.currentPage > 1) {
      this.renderPage(this.currentPage - 1);
    }
  }

  goToPage(pageNum) {
    const target = Math.max(1, Math.min(pageNum, this.totalPages));
    this.renderPage(target);
  }

  hasDocument() {
    return Boolean(this.pdfDoc);
  }

  getMetadata() {
    return this.docMetadata;
  }
}
