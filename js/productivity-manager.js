/**
 * SAVY PDF Workspace — Productivity Manager (productivity-manager.js)
 * Coordinates Phase 6 productivity operations:
 * - Crop Pages
 * - Page Resize & Margins
 * - Headers & Footers
 * - Legal Bates Numbering
 * - Custom & Preset Stamps
 * - Interactive AcroForm Builder
 * - Comprehensive Document Inspector
 *
 * Privacy Guarantee:
 * "Your PDF is processed locally in your browser and is never uploaded to SAVY servers."
 */

export class ProductivityManager {
  constructor({ editorApp, onToast }) {
    this.editorApp = editorApp;
    this.pdfViewer = editorApp.pdfViewer;
    this.documentModel = editorApp.documentModel;
    this.annotationManager = editorApp.annotationManager;
    this.pdfExport = editorApp.pdfExport;
    this.onToast = onToast || (() => {});

    this.initElements();
    this.bindEvents();
  }

  initElements() {
    // Crop Modal
    this.cropModal = document.getElementById('cropModal');
    this.btnCropClose = document.getElementById('btnCropClose');
    this.btnCropApply = document.getElementById('btnCropApply');
    this.cropPageRange = document.getElementById('cropPageRange');
    this.cropCustomRange = document.getElementById('cropCustomRange');
    this.cropTop = document.getElementById('cropTop');
    this.cropRight = document.getElementById('cropRight');
    this.cropBottom = document.getElementById('cropBottom');
    this.cropLeft = document.getElementById('cropLeft');

    // Page Resize & Margins Modal
    this.resizeModal = document.getElementById('pageSizeModal');
    this.btnResizeClose = document.getElementById('btnResizeClose');
    this.btnResizeApply = document.getElementById('btnResizeApply');
    this.resizePreset = document.getElementById('resizePreset');
    this.resizeOrientation = document.getElementById('resizeOrientation');
    this.resizeCustomDims = document.getElementById('resizeCustomDims');
    this.resizeCustomW = document.getElementById('resizeCustomW');
    this.resizeCustomH = document.getElementById('resizeCustomH');
    this.resizeMargin = document.getElementById('resizeMargin');
    this.resizePageRange = document.getElementById('resizePageRange');
    this.resizeCustomRange = document.getElementById('resizeCustomRange');

    // Headers & Footers Modal
    this.headerFooterModal = document.getElementById('headerFooterModal');
    this.btnHfClose = document.getElementById('btnHfClose');
    this.btnHfApply = document.getElementById('btnHfApply');
    this.hfHeaderLeft = document.getElementById('hfHeaderLeft');
    this.hfHeaderCenter = document.getElementById('hfHeaderCenter');
    this.hfHeaderRight = document.getElementById('hfHeaderRight');
    this.hfFooterLeft = document.getElementById('hfFooterLeft');
    this.hfFooterCenter = document.getElementById('hfFooterCenter');
    this.hfFooterRight = document.getElementById('hfFooterRight');
    this.hfFontSize = document.getElementById('hfFontSize');
    this.hfFontFamily = document.getElementById('hfFontFamily');
    this.hfColor = document.getElementById('hfColor');
    this.hfMargin = document.getElementById('hfMargin');
    this.hfPageRange = document.getElementById('hfPageRange');
    this.hfCustomRange = document.getElementById('hfCustomRange');

    // Bates Numbering Modal
    this.batesModal = document.getElementById('batesModal');
    this.btnBatesClose = document.getElementById('btnBatesClose');
    this.btnBatesApply = document.getElementById('btnBatesApply');
    this.batesPrefix = document.getElementById('batesPrefix');
    this.batesSuffix = document.getElementById('batesSuffix');
    this.batesStart = document.getElementById('batesStart');
    this.batesPadding = document.getElementById('batesPadding');
    this.batesPosition = document.getElementById('batesPosition');
    this.batesFontSize = document.getElementById('batesFontSize');
    this.batesMargin = document.getElementById('batesMargin');
    this.batesPageRange = document.getElementById('batesPageRange');
    this.batesCustomRange = document.getElementById('batesCustomRange');

    // Stamp Modal
    this.stampModal = document.getElementById('stampModal');
    this.btnStampClose = document.getElementById('btnStampClose');
    this.stampPresets = document.querySelectorAll('.stamp-preset-btn');
    this.stampCustomText = document.getElementById('stampCustomText');
    this.stampCustomColor = document.getElementById('stampCustomColor');
    this.stampCustomRotation = document.getElementById('stampCustomRotation');
    this.stampCustomOpacity = document.getElementById('stampCustomOpacity');
    this.stampCustomDate = document.getElementById('stampCustomDate');
    this.btnStampInsertCustom = document.getElementById('btnStampInsertCustom');

    // Form Field Builder Modal
    this.formModal = document.getElementById('formBuilderModal');
    this.btnFormClose = document.getElementById('btnFormClose');
    this.btnFormInsert = document.getElementById('btnFormInsert');
    this.formFieldType = document.getElementById('formFieldType');
    this.formFieldName = document.getElementById('formFieldName');
    this.formDefaultVal = document.getElementById('formDefaultVal');
    this.formPlaceholder = document.getElementById('formPlaceholder');
    this.formOptionsContainer = document.getElementById('formOptionsGroup');
    this.formOptionsInput = document.getElementById('formOptionsInput');

    // Document Inspector Modal
    this.inspectorModal = document.getElementById('docInspectorModal');
    this.btnInspectorClose = document.getElementById('btnInspectorClose');
    this.inspectorContent = document.getElementById('docInspectorContent');
  }

  bindEvents() {
    // --- Crop Events ---
    if (this.btnCropClose) this.btnCropClose.addEventListener('click', () => this.closeModal(this.cropModal));
    if (this.cropPageRange) {
      this.cropPageRange.addEventListener('change', () => {
        if (this.cropCustomRange) {
          this.cropCustomRange.style.display = this.cropPageRange.value === 'custom' ? 'block' : 'none';
        }
      });
    }
    if (this.btnCropApply) this.btnCropApply.addEventListener('click', () => this.applyCrop());

    // --- Resize Events ---
    if (this.btnResizeClose) this.btnResizeClose.addEventListener('click', () => this.closeModal(this.resizeModal));
    if (this.resizePreset) {
      this.resizePreset.addEventListener('change', () => {
        if (this.resizeCustomDims) {
          this.resizeCustomDims.style.display = this.resizePreset.value === 'custom' ? 'flex' : 'none';
        }
      });
    }
    if (this.resizePageRange) {
      this.resizePageRange.addEventListener('change', () => {
        if (this.resizeCustomRange) {
          this.resizeCustomRange.style.display = this.resizePageRange.value === 'custom' ? 'block' : 'none';
        }
      });
    }
    if (this.btnResizeApply) this.btnResizeApply.addEventListener('click', () => this.applyResize());

    // --- Headers & Footers Events ---
    if (this.btnHfClose) this.btnHfClose.addEventListener('click', () => this.closeModal(this.headerFooterModal));
    if (this.hfPageRange) {
      this.hfPageRange.addEventListener('change', () => {
        if (this.hfCustomRange) {
          this.hfCustomRange.style.display = this.hfPageRange.value === 'custom' ? 'block' : 'none';
        }
      });
    }
    if (this.btnHfApply) this.btnHfApply.addEventListener('click', () => this.applyHeaderFooter());

    // --- Bates Numbering Events ---
    if (this.btnBatesClose) this.btnBatesClose.addEventListener('click', () => this.closeModal(this.batesModal));
    if (this.batesPageRange) {
      this.batesPageRange.addEventListener('change', () => {
        if (this.batesCustomRange) {
          this.batesCustomRange.style.display = this.batesPageRange.value === 'custom' ? 'block' : 'none';
        }
      });
    }
    if (this.btnBatesApply) this.btnBatesApply.addEventListener('click', () => this.applyBates());

    // --- Stamp Events ---
    if (this.btnStampClose) this.btnStampClose.addEventListener('click', () => this.closeModal(this.stampModal));
    if (this.stampPresets) {
      this.stampPresets.forEach((btn) => {
        btn.addEventListener('click', () => {
          const type = btn.dataset.stampType || 'approved';
          const text = btn.dataset.stampText || btn.textContent.trim();
          const color = btn.dataset.stampColor || '#16A34A';
          this.insertStamp({ text, color, rotation: -12, opacity: 0.85, date: this.getTodayDate() });
          this.closeModal(this.stampModal);
        });
      });
    }
    if (this.btnStampInsertCustom) {
      this.btnStampInsertCustom.addEventListener('click', () => {
        const text = this.stampCustomText?.value.trim() || 'CUSTOM';
        const color = this.stampCustomColor?.value || '#2563EB';
        const rotation = Number(this.stampCustomRotation?.value) || 0;
        const opacity = Number(this.stampCustomOpacity?.value) || 0.85;
        const date = this.stampCustomDate?.checked ? this.getTodayDate() : null;

        this.insertStamp({ text, color, rotation, opacity, date });
        this.closeModal(this.stampModal);
      });
    }

    // --- Form Field Builder Events ---
    if (this.btnFormClose) this.btnFormClose.addEventListener('click', () => this.closeModal(this.formModal));
    if (this.formFieldType) {
      this.formFieldType.addEventListener('change', () => {
        const t = this.formFieldType.value;
        if (this.formOptionsContainer) {
          this.formOptionsContainer.style.display = (t === 'dropdown' || t === 'radio') ? 'block' : 'none';
        }
      });
    }
    if (this.btnFormInsert) {
      this.btnFormInsert.addEventListener('click', () => {
        const formType = this.formFieldType?.value || 'text';
        const fieldName = this.formFieldName?.value.trim() || `Field_${Date.now().toString(36)}`;
        const defaultValue = this.formDefaultVal?.value.trim() || '';
        const placeholder = this.formPlaceholder?.value.trim() || '';
        const rawOptions = this.formOptionsInput?.value.trim() || '';
        const options = rawOptions ? rawOptions.split('\n').map((o) => o.trim()).filter(Boolean) : ['Option 1', 'Option 2'];

        this.insertFormField({ formType, fieldName, defaultValue, placeholder, options });
        this.closeModal(this.formModal);
      });
    }

    // --- Document Inspector Events ---
    if (this.btnInspectorClose) this.btnInspectorClose.addEventListener('click', () => this.closeModal(this.inspectorModal));
  }

  // --- Modal Helpers ---
  openModal(el) {
    if (!this.pdfViewer.hasDocument()) {
      this.onToast('Please open a PDF document first.');
      return;
    }
    if (el) {
      el.style.display = 'flex';
      el.classList.add('is-open');
    }
  }

  closeModal(el) {
    if (el) {
      el.style.display = 'none';
      el.classList.remove('is-open');
    }
  }

  getTodayDate() {
    return new Date().toISOString().split('T')[0];
  }

  // --- Crop Action ---
  openCropModal() {
    this.openModal(this.cropModal);
  }

  async applyCrop() {
    const rangeVal = this.cropPageRange?.value || 'current';
    const range = rangeVal === 'custom' ? (this.cropCustomRange?.value || 'current') : rangeVal;

    const top = Number(this.cropTop?.value) || 0;
    const right = Number(this.cropRight?.value) || 0;
    const bottom = Number(this.cropBottom?.value) || 0;
    const left = Number(this.cropLeft?.value) || 0;

    this.onToast('Applying lossless /CropBox to pages...');

    try {
      const ops = this.pdfExport.pageOperations;
      const originalName = this.pdfViewer.currentFile?.name || 'document.pdf';
      const result = await ops.cropPages(this.documentModel, this.annotationManager, {
        pageRange: range,
        currentPage: this.pdfViewer.currentPage || 1,
        margins: { top, right, bottom, left },
        originalName,
        download: true,
      });

      this.closeModal(this.cropModal);
      this.onToast(`Cropped ${result.croppedCount} page(s). Downloaded ${result.filename}`);
    } catch (err) {
      console.error('Crop error:', err);
      this.onToast('Crop failed: ' + err.message);
    }
  }

  // --- Resize Action ---
  openResizeModal() {
    this.openModal(this.resizeModal);
  }

  async applyResize() {
    const preset = this.resizePreset?.value || 'a4';
    const orientation = this.resizeOrientation?.value || 'portrait';
    const margin = Number(this.resizeMargin?.value) || 36;
    const rangeVal = this.resizePageRange?.value || 'all';
    const range = rangeVal === 'custom' ? (this.resizeCustomRange?.value || 'all') : rangeVal;

    const customWidth = Number(this.resizeCustomW?.value) || 612;
    const customHeight = Number(this.resizeCustomH?.value) || 792;

    this.onToast('Scaling page content to target size and margins...');

    try {
      const ops = this.pdfExport.pageOperations;
      const originalName = this.pdfViewer.currentFile?.name || 'document.pdf';
      const result = await ops.resizePages(this.documentModel, this.annotationManager, {
        targetSize: preset,
        orientation,
        customWidth,
        customHeight,
        margins: { top: margin, right: margin, bottom: margin, left: margin },
        pageRange: range,
        currentPage: this.pdfViewer.currentPage || 1,
        originalName,
        download: true,
      });

      this.closeModal(this.resizeModal);
      this.onToast(`Resized ${result.resizedCount} page(s). Downloaded ${result.filename}`);
    } catch (err) {
      console.error('Resize error:', err);
      this.onToast('Resize failed: ' + err.message);
    }
  }

  // --- Headers & Footers Action ---
  openHeaderFooterModal() {
    this.openModal(this.headerFooterModal);
  }

  async applyHeaderFooter() {
    const headerLeft = this.hfHeaderLeft?.value.trim() || '';
    const headerCenter = this.hfHeaderCenter?.value.trim() || '';
    const headerRight = this.hfHeaderRight?.value.trim() || '';
    const footerLeft = this.hfFooterLeft?.value.trim() || '';
    const footerCenter = this.hfFooterCenter?.value.trim() || '';
    const footerRight = this.hfFooterRight?.value.trim() || '';

    const fontSize = Number(this.hfFontSize?.value) || 9;
    const fontFamily = this.hfFontFamily?.value || 'Helvetica';
    const color = this.hfColor?.value || '#555555';
    const margin = Number(this.hfMargin?.value) || 36;
    const rangeVal = this.hfPageRange?.value || 'all';
    const range = rangeVal === 'custom' ? (this.hfCustomRange?.value || 'all') : rangeVal;

    this.onToast('Burning headers and footers...');

    try {
      const ops = this.pdfExport.pageOperations;
      const originalName = this.pdfViewer.currentFile?.name || 'document.pdf';
      const result = await ops.applyHeadersFooters(this.documentModel, this.annotationManager, {
        headerLeft,
        headerCenter,
        headerRight,
        footerLeft,
        footerCenter,
        footerRight,
        fontSize,
        fontFamily,
        color,
        margin,
        pageRange: range,
        currentPage: this.pdfViewer.currentPage || 1,
        originalName,
        download: true,
      });

      this.closeModal(this.headerFooterModal);
      this.onToast(`Headers & footers applied. Downloaded ${result.filename}`);
    } catch (err) {
      console.error('Header/footer error:', err);
      this.onToast('Failed: ' + err.message);
    }
  }

  // --- Bates Numbering Action ---
  openBatesModal() {
    this.openModal(this.batesModal);
  }

  async applyBates() {
    const prefix = this.batesPrefix?.value !== undefined ? this.batesPrefix.value : 'SAVY-';
    const suffix = this.batesSuffix?.value || '';
    const startNumber = Number(this.batesStart?.value) || 1;
    const padding = Number(this.batesPadding?.value) || 6;
    const position = this.batesPosition?.value || 'bottom-right';
    const fontSize = Number(this.batesFontSize?.value) || 10;
    const margin = Number(this.batesMargin?.value) || 36;
    const rangeVal = this.batesPageRange?.value || 'all';
    const range = rangeVal === 'custom' ? (this.batesCustomRange?.value || 'all') : rangeVal;

    this.onToast('Applying sequential Bates numbering...');

    try {
      const ops = this.pdfExport.pageOperations;
      const originalName = this.pdfViewer.currentFile?.name || 'document.pdf';
      const result = await ops.applyBatesNumbering(this.documentModel, this.annotationManager, {
        prefix,
        suffix,
        startNumber,
        padding,
        position,
        fontSize,
        margin,
        pageRange: range,
        currentPage: this.pdfViewer.currentPage || 1,
        originalName,
        download: true,
      });

      this.closeModal(this.batesModal);
      this.onToast(`Bates numbering applied to ${result.batesCount} pages. Downloaded ${result.filename}`);
    } catch (err) {
      console.error('Bates error:', err);
      this.onToast('Bates numbering failed: ' + err.message);
    }
  }

  // --- Stamp Insertion ---
  openStampModal() {
    this.openModal(this.stampModal);
  }

  insertStamp({ text, color, rotation = -12, opacity = 0.85, date = null }) {
    const pageSize = this.pdfViewer.currentPageSize || { width: 612, height: 792 };
    const width = 160;
    const height = date ? 64 : 52;
    const x = Math.max(20, (pageSize.width - width) / 2);
    const y = Math.max(20, (pageSize.height - height) / 3);

    const stampAnnot = {
      id: 'stamp_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 7),
      type: 'stamp',
      text: text.toUpperCase(),
      color,
      rotation,
      opacity,
      date,
      x,
      y,
      width,
      height,
      style: {
        color,
        opacity,
      },
    };

    this.annotationManager.addAnnotation(stampAnnot);
    this.annotationManager.selectAnnotation(stampAnnot.id);
    this.onToast(`Placed "${text}" stamp. Move or resize as needed.`);
  }

  // --- Form Field Insertion ---
  openFormModal() {
    this.openModal(this.formModal);
  }

  insertFormField({ formType, fieldName, defaultValue = '', placeholder = '', options = [] }) {
    const pageSize = this.pdfViewer.currentPageSize || { width: 612, height: 792 };

    let width = 180;
    let height = 32;

    if (formType === 'checkbox' || formType === 'radio') {
      width = 24;
      height = 24;
    } else if (formType === 'dropdown') {
      width = 180;
      height = 32;
    }

    const x = Math.max(20, (pageSize.width - width) / 2);
    const y = Math.max(20, (pageSize.height - height) / 2);

    const formAnnot = {
      id: 'form_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 7),
      type: 'form_field',
      formType,
      fieldName,
      defaultValue,
      placeholder,
      options,
      checked: false,
      x,
      y,
      width,
      height,
      style: {
        color: '#2563EB',
      },
    };

    this.annotationManager.addAnnotation(formAnnot);
    this.annotationManager.selectAnnotation(formAnnot.id);
    this.onToast(`Inserted ${formType} field "${fieldName}".`);
  }

  // --- Document Inspector ---
  async openDocumentInspector() {
    if (!this.pdfViewer.hasDocument()) {
      this.onToast('Please open a PDF document first.');
      return;
    }

    this.openModal(this.inspectorModal);
    if (!this.inspectorContent) return;

    this.inspectorContent.innerHTML = '<div class="inspector-loading">Inspecting document metadata and structure...</div>';

    try {
      const pdfjsDoc = this.pdfViewer.pdfDoc;
      const metadataObj = await pdfjsDoc.getMetadata().catch(() => ({ info: {}, metadata: null }));
      const info = metadataObj.info || {};

      const totalPages = this.documentModel ? this.documentModel.getPageCount() : pdfjsDoc.numPages;
      const file = this.pdfViewer.currentFile;
      const fileSize = file ? this.formatBytes(file.size) : 'Unknown';
      const fileName = file ? file.name : 'document.pdf';

      // Current page dimensions
      const curPageNum = this.pdfViewer.currentPage || 1;
      const curPage = await pdfjsDoc.getPage(Math.min(pdfjsDoc.numPages, curPageNum));
      const unscaledViewport = curPage.getViewport({ scale: 1.0 });

      const widthPt = Math.round(unscaledViewport.width);
      const heightPt = Math.round(unscaledViewport.height);
      const widthIn = (widthPt / 72).toFixed(2);
      const heightIn = (heightPt / 72).toFixed(2);
      const widthMm = (widthPt * 0.352778).toFixed(1);
      const heightMm = (heightPt * 0.352778).toFixed(1);

      const orientation = widthPt > heightPt ? 'Landscape' : 'Portrait';

      // AcroForm detection
      let formFieldCount = 0;
      try {
        if (window.PDFLib && this.pdfViewer.rawArrayBuffer) {
          const { PDFDocument } = window.PDFLib;
          const libDoc = await PDFDocument.load(this.pdfViewer.rawArrayBuffer, { ignoreEncryption: true });
          const form = libDoc.getForm();
          const fields = form.getFields();
          formFieldCount = fields.length;
        }
      } catch (err) {
        console.warn('Form detection notice:', err);
      }

      // Count user annotations and redactions
      let totalAnnotations = 0;
      let totalRedactions = 0;
      let totalStamps = 0;
      let totalFormFields = 0;

      const allAnnots = this.annotationManager.getAllAnnotationsByPageId();
      for (const [, list] of allAnnots.entries()) {
        for (const a of list) {
          totalAnnotations++;
          if (a.type === 'redact') totalRedactions++;
          if (a.type === 'stamp') totalStamps++;
          if (a.type === 'form_field') totalFormFields++;
        }
      }

      this.inspectorContent.innerHTML = `
        <div class="inspector-grid">
          <div class="inspector-card">
            <h4>Document File</h4>
            <div class="inspector-row"><span class="inspector-label">Filename:</span> <span class="inspector-value">${fileName}</span></div>
            <div class="inspector-row"><span class="inspector-label">File Size:</span> <span class="inspector-value">${fileSize}</span></div>
            <div class="inspector-row"><span class="inspector-label">PDF Version:</span> <span class="inspector-value">${info.PDFFormatVersion || '1.7'}</span></div>
            <div class="inspector-row"><span class="inspector-label">Page Count:</span> <span class="inspector-value">${totalPages}</span></div>
          </div>

          <div class="inspector-card">
            <h4>Page Geometry (Page ${curPageNum})</h4>
            <div class="inspector-row"><span class="inspector-label">Points (pt):</span> <span class="inspector-value">${widthPt} × ${heightPt} pt</span></div>
            <div class="inspector-row"><span class="inspector-label">Inches (in):</span> <span class="inspector-value">${widthIn}" × ${heightIn}"</span></div>
            <div class="inspector-row"><span class="inspector-label">Millimeters:</span> <span class="inspector-value">${widthMm} × ${heightMm} mm</span></div>
            <div class="inspector-row"><span class="inspector-label">Orientation:</span> <span class="inspector-value">${orientation}</span></div>
          </div>

          <div class="inspector-card">
            <h4>Metadata Dictionary</h4>
            <div class="inspector-row"><span class="inspector-label">Title:</span> <span class="inspector-value">${info.Title || '—'}</span></div>
            <div class="inspector-row"><span class="inspector-label">Author:</span> <span class="inspector-value">${info.Author || '—'}</span></div>
            <div class="inspector-row"><span class="inspector-label">Subject:</span> <span class="inspector-value">${info.Subject || '—'}</span></div>
            <div class="inspector-row"><span class="inspector-label">Keywords:</span> <span class="inspector-value">${info.Keywords || '—'}</span></div>
            <div class="inspector-row"><span class="inspector-label">Creator / Tool:</span> <span class="inspector-value">${info.Creator || '—'}</span></div>
            <div class="inspector-row"><span class="inspector-label">Producer:</span> <span class="inspector-value">${info.Producer || '—'}</span></div>
            <div class="inspector-row"><span class="inspector-label">Created:</span> <span class="inspector-value">${info.CreationDate ? this.formatPdfDate(info.CreationDate) : '—'}</span></div>
            <div class="inspector-row"><span class="inspector-label">Modified:</span> <span class="inspector-value">${info.ModDate ? this.formatPdfDate(info.ModDate) : '—'}</span></div>
          </div>

          <div class="inspector-card">
            <h4>Security & Interactive Features</h4>
            <div class="inspector-row"><span class="inspector-label">Password Encrypted:</span> <span class="inspector-value">${info.IsEncrypted ? 'Yes' : 'No'}</span></div>
            <div class="inspector-row"><span class="inspector-label">Embedded AcroForms:</span> <span class="inspector-value">${formFieldCount} field(s)</span></div>
            <div class="inspector-row"><span class="inspector-label">Session Form Fields:</span> <span class="inspector-value">${totalFormFields} created</span></div>
            <div class="inspector-row"><span class="inspector-label">Session Annotations:</span> <span class="inspector-value">${totalAnnotations}</span></div>
            <div class="inspector-row"><span class="inspector-label">Session Stamps:</span> <span class="inspector-value">${totalStamps}</span></div>
            <div class="inspector-row"><span class="inspector-label">Pending Redactions:</span> <span class="inspector-value">${totalRedactions}</span></div>
          </div>
        </div>
      `;
    } catch (err) {
      console.error('Inspector error:', err);
      this.inspectorContent.innerHTML = `<div class="inspector-error">Failed to inspect document: ${err.message}</div>`;
    }
  }

  formatBytes(bytes) {
    if (!bytes || isNaN(bytes)) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB'];
    let i = 0;
    let val = bytes;
    while (val >= 1024 && i < units.length - 1) {
      val /= 1024;
      i++;
    }
    return `${val.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
  }

  formatPdfDate(dateStr) {
    if (!dateStr) return '—';
    // Format D:YYYYMMDDHHmmSSOHH'mm'
    const m = dateStr.match(/D:(\d{4})(\d{2})(\d{2})(\d{2})?(\d{2})?(\d{2})?/);
    if (m) {
      const year = m[1];
      const month = m[2];
      const day = m[3];
      const hour = m[4] || '00';
      const min = m[5] || '00';
      return `${year}-${month}-${day} ${hour}:${min}`;
    }
    return dateStr;
  }
}
