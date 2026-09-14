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
  constructor({ canvas, viewportContainer, textLayer, onPageChange, onDocumentLoaded, onZoomChange, onError }) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.viewportContainer = viewportContainer;
    this.textLayer = textLayer || (typeof document !== 'undefined' ? document.getElementById('pdfTextLayer') : null);
    this.onPageChange = onPageChange || (() => {});
    this.onDocumentLoaded = onDocumentLoaded || (() => {});
    this.onZoomChange = onZoomChange || (() => {});
    this.onError = onError || ((err) => console.error(err));

    this.pdfDoc = null;
    this.currentPage = 1;
    this.totalPages = 0;
    this.scale = 1.0;
    this.renderTask = null;
    this.textLayerRenderTask = null;
    this.currentFile = null;
    this.docMetadata = null;
    this.isRendering = false;
    this.documentModel = null;

    this.setupResolutionWatcher();
  }

  setupResolutionWatcher() {
    if (typeof window === 'undefined') return;

    let mediaQuery = null;
    const updatePixelRatio = () => {
      if (mediaQuery) {
        mediaQuery.removeEventListener('change', updatePixelRatio);
      }
      const dpr = window.devicePixelRatio || 1;
      mediaQuery = window.matchMedia(`(resolution: ${dpr}dppx)`);
      mediaQuery.addEventListener('change', updatePixelRatio);

      if ((this.pdfDoc || this.documentModel) && !this.isRendering) {
        this.renderPage(this.currentPage);
      }
    };

    const dpr = window.devicePixelRatio || 1;
    mediaQuery = window.matchMedia(`(resolution: ${dpr}dppx)`);
    mediaQuery.addEventListener('change', updatePixelRatio);

    let resizeTimer = null;
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        if ((this.pdfDoc || this.documentModel) && !this.isRendering) {
          this.renderPage(this.currentPage);
        }
      }, 200);
    });
  }

  setDocumentModel(model) {
    this.documentModel = model;
    if (model) {
      this.totalPages = model.getPageCount();
    }
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

      if (window.pdfjsLib.GlobalWorkerOptions && !window.pdfjsLib.GlobalWorkerOptions.workerSrc) {
        window.pdfjsLib.GlobalWorkerOptions.workerSrc =
          'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
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
      } else if (ArrayBuffer.isView(input)) {
        arrayBuffer = input.buffer.slice(input.byteOffset, input.byteOffset + input.byteLength);
        fileMeta.size = arrayBuffer.byteLength;
      } else {
        throw new Error('Unsupported input format for PDF loading.');
      }

      // Preserve clean clone of original bytes for export pipeline
      this.rawArrayBuffer = arrayBuffer.slice(0);

      // Cancel any ongoing render
      if (this.renderTask) {
        this.renderTask.cancel();
      }

      const loadingTask = window.pdfjsLib.getDocument({
        data: arrayBuffer,
        cMapUrl: 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/cmaps/',
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

      await this.onDocumentLoaded(this.docMetadata);
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
    if (this.documentModel && this.documentModel.getPageCount() > 0) {
      this.totalPages = this.documentModel.getPageCount();
    }
    if (pageNum < 1 || pageNum > this.totalPages) {
      return;
    }

    // Cancel in-flight render tasks if active
    if (this.renderTask) {
      this.renderTask.cancel();
      this.renderTask = null;
    }
    if (this.textLayerRenderTask) {
      this.textLayerRenderTask.cancel();
      this.textLayerRenderTask = null;
    }

    this.isRendering = true;
    this.currentPage = pageNum;
    const pixelRatio = window.devicePixelRatio || 1;

    try {
      const pageRecord = this.documentModel ? this.documentModel.getPage(pageNum - 1) : null;

      if (pageRecord && pageRecord.isBlank) {
        // Render crisp blank page
        let unscaledW = pageRecord.width || 612;
        let unscaledH = pageRecord.height || 792;
        const rot = (pageRecord.rotation || 0) % 360;
        if (rot === 90 || rot === 270) {
          const temp = unscaledW;
          unscaledW = unscaledH;
          unscaledH = temp;
        }

        this.currentPageSize = { width: unscaledW, height: unscaledH };
        const cssWidth = Math.round(unscaledW * this.scale);
        const cssHeight = Math.round(unscaledH * this.scale);

        this.canvas.width = Math.round(cssWidth * pixelRatio);
        this.canvas.height = Math.round(cssHeight * pixelRatio);
        this.canvas.style.width = `${cssWidth}px`;
        this.canvas.style.height = `${cssHeight}px`;

        if (this.canvas.parentElement && this.canvas.parentElement.classList.contains('pdf-page-wrapper')) {
          this.canvas.parentElement.style.width = `${cssWidth}px`;
          this.canvas.parentElement.style.height = `${cssHeight}px`;
        }

        if (this.textLayer) {
          this.textLayer.innerHTML = '';
          this.textLayer.style.display = 'none';
        }

        this.ctx.save();
        this.ctx.fillStyle = '#FFFFFF';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        this.ctx.restore();

        this.isRendering = false;
        this.onPageChange(this.currentPage, this.totalPages, pageRecord);
        return;
      }

      // Render PDF page (from primary or imported source doc)
      let srcPdfjsDoc = this.pdfDoc;
      let srcPageIndex = pageNum;

      if (pageRecord && pageRecord.docId) {
        const srcObj = this.documentModel.getSourceDoc(pageRecord.docId);
        if (srcObj && srcObj.pdfjsDoc) {
          srcPdfjsDoc = srcObj.pdfjsDoc;
        }
        srcPageIndex = pageRecord.sourceIndex + 1;
      }

      if (!srcPdfjsDoc) {
        throw new Error('No PDF document loaded.');
      }

      const page = await srcPdfjsDoc.getPage(srcPageIndex);

      const userRotation = pageRecord?.rotation || 0;
      const totalRotation = ((page.rotate || 0) + userRotation) % 360;

      // 1. Natural page viewport at scale 1.0 (unscaled points)
      const unscaledViewport = page.getViewport({ scale: 1.0, rotation: totalRotation });
      this.currentPageSize = { width: unscaledViewport.width, height: unscaledViewport.height };

      // 2. CSS display viewport at current zoom scale
      const cssViewport = page.getViewport({ scale: this.scale, rotation: totalRotation });
      const cssWidth = Math.round(cssViewport.width);
      const cssHeight = Math.round(cssViewport.height);

      // 3. Native backing resolution viewport (scaled by devicePixelRatio for high-DPI retina sharpness)
      const renderScale = this.scale * pixelRatio;
      const renderViewport = page.getViewport({ scale: renderScale, rotation: totalRotation });

      this.canvas.width = Math.round(renderViewport.width);
      this.canvas.height = Math.round(renderViewport.height);

      this.canvas.style.width = `${cssWidth}px`;
      this.canvas.style.height = `${cssHeight}px`;

      if (this.canvas.parentElement && this.canvas.parentElement.classList.contains('pdf-page-wrapper')) {
        this.canvas.parentElement.style.width = `${cssWidth}px`;
        this.canvas.parentElement.style.height = `${cssHeight}px`;
      }

      // 4. Update Text Layer container dimensions & CSS scale factor
      if (this.textLayer) {
        this.textLayer.innerHTML = '';
        this.textLayer.style.display = '';
        this.textLayer.style.width = `${cssWidth}px`;
        this.textLayer.style.height = `${cssHeight}px`;
        this.textLayer.style.setProperty('--scale-factor', cssViewport.scale);
      }

      const renderContext = {
        canvasContext: this.ctx,
        viewport: renderViewport,
      };

      this.renderTask = page.render(renderContext);

      // 5. Render Text Layer concurrently using official PDF.js renderTextLayer API
      let textLayerPromise = null;
      if (this.textLayer && window.pdfjsLib && typeof window.pdfjsLib.renderTextLayer === 'function') {
        textLayerPromise = (async () => {
          try {
            const textContent = await page.getTextContent();
            if (!this.isRendering) return;
            this.textLayerRenderTask = window.pdfjsLib.renderTextLayer({
              textContentSource: textContent,
              container: this.textLayer,
              viewport: cssViewport,
            });
            await this.textLayerRenderTask.promise;
            this.textLayerRenderTask = null;
          } catch (textErr) {
            if (textErr?.name !== 'RenderingCancelledException') {
              console.warn('Text layer render error:', textErr);
            }
          }
        })();
      }

      await this.renderTask.promise;
      this.renderTask = null;

      if (textLayerPromise) {
        await textLayerPromise;
      }

      this.isRendering = false;

      this.onPageChange(this.currentPage, this.totalPages, pageRecord);
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
    if (this.pdfDoc || this.documentModel) {
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
    if (!this.pdfDoc && !this.documentModel) return;
    const pageSize = this.getPageSize();
    const scrollArea = this.viewportContainer || document.getElementById('workspaceScrollArea');
    if (!scrollArea || pageSize.width <= 0) return;

    const style = window.getComputedStyle(scrollArea);
    const padLeft = parseFloat(style.paddingLeft) || 0;
    const padRight = parseFloat(style.paddingRight) || 0;
    const availableWidth = scrollArea.clientWidth - padLeft - padRight;
    if (availableWidth > 0) {
      const targetScale = availableWidth / pageSize.width;
      this.setZoom(targetScale);
    }
  }

  async fitPage() {
    if (!this.pdfDoc && !this.documentModel) return;
    const pageSize = this.getPageSize();
    const scrollArea = this.viewportContainer || document.getElementById('workspaceScrollArea');
    if (!scrollArea || pageSize.width <= 0 || pageSize.height <= 0) return;

    const style = window.getComputedStyle(scrollArea);
    const padH = (parseFloat(style.paddingLeft) || 0) + (parseFloat(style.paddingRight) || 0);
    const padV = (parseFloat(style.paddingTop) || 0) + (parseFloat(style.paddingBottom) || 0);
    const availableWidth = scrollArea.clientWidth - padH;
    const availableHeight = scrollArea.clientHeight - padV;
    if (availableWidth > 0 && availableHeight > 0) {
      const scaleW = availableWidth / pageSize.width;
      const scaleH = availableHeight / pageSize.height;
      const targetScale = Math.min(scaleW, scaleH);
      this.setZoom(targetScale);
    }
  }

  async nextPage() {
    if (this.currentPage < this.totalPages) {
      return await this.renderPage(this.currentPage + 1);
    }
  }

  async prevPage() {
    if (this.currentPage > 1) {
      return await this.renderPage(this.currentPage - 1);
    }
  }

  async goToPage(pageNum) {
    const target = Math.max(1, Math.min(pageNum, this.totalPages));
    return await this.renderPage(target);
  }

  hasDocument() {
    return Boolean(this.pdfDoc);
  }

  getMetadata() {
    return this.docMetadata;
  }

  getPageSize() {
    return this.currentPageSize || { width: 612, height: 792 };
  }

  getOriginalBytes() {
    return this.rawArrayBuffer ? this.rawArrayBuffer.slice(0) : null;
  }

  closeDocument() {
    if (this.renderTask) {
      try {
        this.renderTask.cancel();
      } catch (e) {}
      this.renderTask = null;
    }
    if (this.textLayerRenderTask) {
      try {
        this.textLayerRenderTask.cancel();
      } catch (e) {}
      this.textLayerRenderTask = null;
    }
    if (this.pdfDoc && typeof this.pdfDoc.destroy === 'function') {
      try {
        this.pdfDoc.destroy();
      } catch (e) {}
    }
    this.pdfDoc = null;
    this.rawArrayBuffer = null;
    this.currentFile = null;
    this.docMetadata = null;
    this.currentPage = 1;
    this.totalPages = 0;
    if (this.textLayer) {
      this.textLayer.innerHTML = '';
      this.textLayer.style.width = '0px';
      this.textLayer.style.height = '0px';
    }
    if (this.canvas) {
      const ctx = this.canvas.getContext('2d');
      if (ctx) ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
      this.canvas.style.width = '0px';
      this.canvas.style.height = '0px';
    }
  }
}

