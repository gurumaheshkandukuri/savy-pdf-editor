/**
 * SAVY PDF Workspace — Presentation Mode Manager (presentation-manager.js)
 * Clean, distraction-free fullscreen presentation and slideshow viewer.
 *
 * Privacy Guarantee: Your PDF is processed locally in your browser and is never uploaded to SAVY servers.
 * Presentation mode runs 100% in browser memory without altering the document.
 */

export class PresentationManager {
  constructor({ editorApp, onToast }) {
    this.editorApp = editorApp;
    this.pdfViewer = editorApp.pdfViewer;
    this.documentModel = editorApp.documentModel;
    this.onToast = onToast || (() => {});

    this.isActive = false;
    this.currentSlide = 1;
    this.totalSlides = 1;
    this.fitMode = 'fit-page'; // 'fit-page' | 'fit-width'
    this.scale = 1.0;

    this.initElements();
    this.bindEvents();
  }

  initElements() {
    this.container = document.getElementById('presentationContainer');
    this.canvas = document.getElementById('presentationCanvas');
    this.ctx = this.canvas ? this.canvas.getContext('2d') : null;
    this.hud = document.getElementById('presentationHud');
    this.counterEl = document.getElementById('presentationCounter');
    this.btnPrev = document.getElementById('btnPresentationPrev');
    this.btnNext = document.getElementById('btnPresentationNext');
    this.btnExit = document.getElementById('btnPresentationExit');
    this.btnFitToggle = document.getElementById('btnPresentationFit');
  }

  bindEvents() {
    // Global shortcut F5
    window.addEventListener('keydown', (e) => {
      if (e.key === 'F5') {
        e.preventDefault();
        if (this.isActive) {
          this.exit();
        } else {
          this.start();
        }
      }
    });

    if (this.btnExit) {
      this.btnExit.addEventListener('click', () => this.exit());
    }

    if (this.btnPrev) {
      this.btnPrev.addEventListener('click', () => this.prevSlide());
    }

    if (this.btnNext) {
      this.btnNext.addEventListener('click', () => this.nextSlide());
    }

    if (this.btnFitToggle) {
      this.btnFitToggle.addEventListener('click', () => {
        this.fitMode = this.fitMode === 'fit-page' ? 'fit-width' : 'fit-page';
        this.renderCurrentSlide();
      });
    }

    // Fullscreen change listener
    document.addEventListener('fullscreenchange', () => {
      if (!document.fullscreenElement && this.isActive) {
        this.exit(false); // Cleanly exit if user pressed Esc to exit fullscreen
      }
    });

    // Presentation keyboard navigation
    window.addEventListener('keydown', (e) => {
      if (!this.isActive) return;

      if (e.key === 'ArrowRight' || e.key === 'PageDown' || e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        this.nextSlide();
      } else if (e.key === 'ArrowLeft' || e.key === 'PageUp' || e.key === 'Backspace') {
        e.preventDefault();
        this.prevSlide();
      } else if (e.key === 'Home') {
        e.preventDefault();
        this.goToSlide(1);
      } else if (e.key === 'End') {
        e.preventDefault();
        this.goToSlide(this.totalSlides);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        this.exit();
      }
    });

    // Resize listener
    window.addEventListener('resize', () => {
      if (this.isActive) {
        this.renderCurrentSlide();
      }
    });
  }

  async start() {
    if (!this.pdfViewer.hasDocument()) {
      this.onToast('Please open a PDF document first.');
      return;
    }

    this.totalSlides = this.documentModel ? this.documentModel.getPageCount() : (this.pdfViewer.totalPages || 1);
    this.currentSlide = this.pdfViewer.currentPage || 1;
    this.isActive = true;

    if (this.container) {
      this.container.style.display = 'flex';
      this.container.classList.add('is-active');
    }

    // Request native browser fullscreen
    try {
      if (this.container && this.container.requestFullscreen && !document.fullscreenElement) {
        await this.container.requestFullscreen();
      }
    } catch (err) {
      console.warn('Native fullscreen request notice:', err);
    }

    await this.renderCurrentSlide();
  }

  exit(triggerNativeExit = true) {
    this.isActive = false;
    if (this.container) {
      this.container.style.display = 'none';
      this.container.classList.remove('is-active');
    }

    if (triggerNativeExit && document.fullscreenElement && document.exitFullscreen) {
      document.exitFullscreen().catch(() => {});
    }

    // Sync editor to whatever slide we stopped on
    if (this.pdfViewer && this.pdfViewer.currentPage !== this.currentSlide) {
      this.pdfViewer.renderPage(this.currentSlide);
    }
  }

  nextSlide() {
    if (this.currentSlide < this.totalSlides) {
      this.currentSlide++;
      this.renderCurrentSlide();
    }
  }

  prevSlide() {
    if (this.currentSlide > 1) {
      this.currentSlide--;
      this.renderCurrentSlide();
    }
  }

  goToSlide(pageNum) {
    if (pageNum >= 1 && pageNum <= this.totalSlides) {
      this.currentSlide = pageNum;
      this.renderCurrentSlide();
    }
  }

  async renderCurrentSlide() {
    if (!this.canvas || !this.isActive) return;

    const pageNum = this.currentSlide;
    const pageRecord = this.documentModel ? this.documentModel.getPage(pageNum - 1) : null;
    const pixelRatio = window.devicePixelRatio || 1;
    const screenWidth = window.innerWidth;
    const screenHeight = window.innerHeight;

    this.updateHud();

    try {
      if (pageRecord && pageRecord.isBlank) {
        let unscaledW = pageRecord.width || 612;
        let unscaledH = pageRecord.height || 792;
        const scale = Math.min((screenWidth - 40) / unscaledW, (screenHeight - 40) / unscaledH);

        const w = unscaledW * scale;
        const h = unscaledH * scale;

        this.canvas.width = Math.floor(w * pixelRatio);
        this.canvas.height = Math.floor(h * pixelRatio);
        this.canvas.style.width = `${Math.floor(w)}px`;
        this.canvas.style.height = `${Math.floor(h)}px`;

        this.ctx.fillStyle = '#FFFFFF';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        return;
      }

      let srcPdfjsDoc = this.pdfViewer.pdfDoc;
      let srcPageIndex = pageNum;

      if (pageRecord && pageRecord.docId) {
        const srcObj = this.documentModel.getSourceDoc(pageRecord.docId);
        if (srcObj && srcObj.pdfjsDoc) srcPdfjsDoc = srcObj.pdfjsDoc;
        srcPageIndex = pageRecord.sourceIndex + 1;
      }

      if (!srcPdfjsDoc) return;

      const page = await srcPdfjsDoc.getPage(srcPageIndex);
      const userRotation = pageRecord?.rotation || 0;
      const totalRotation = ((page.rotate || 0) + userRotation) % 360;

      const unscaledViewport = page.getViewport({ scale: 1.0, rotation: totalRotation });

      let scale;
      if (this.fitMode === 'fit-width') {
        scale = (screenWidth - 40) / unscaledViewport.width;
      } else {
        // Fit whole page
        const scaleW = (screenWidth - 60) / unscaledViewport.width;
        const scaleH = (screenHeight - 60) / unscaledViewport.height;
        scale = Math.min(scaleW, scaleH);
      }

      const viewport = page.getViewport({ scale, rotation: totalRotation });

      this.canvas.width = Math.floor(viewport.width * pixelRatio);
      this.canvas.height = Math.floor(viewport.height * pixelRatio);
      this.canvas.style.width = `${Math.floor(viewport.width)}px`;
      this.canvas.style.height = `${Math.floor(viewport.height)}px`;

      const renderContext = {
        canvasContext: this.ctx,
        viewport,
        transform: pixelRatio !== 1 ? [pixelRatio, 0, 0, pixelRatio, 0, 0] : null,
      };

      await page.render(renderContext).promise;
    } catch (err) {
      console.warn('Presentation render error:', err);
    }
  }

  updateHud() {
    if (this.counterEl) {
      this.counterEl.textContent = `${this.currentSlide} / ${this.totalSlides}`;
    }
    if (this.btnPrev) {
      this.btnPrev.disabled = this.currentSlide <= 1;
    }
    if (this.btnNext) {
      this.btnNext.disabled = this.currentSlide >= this.totalSlides;
    }
  }
}
