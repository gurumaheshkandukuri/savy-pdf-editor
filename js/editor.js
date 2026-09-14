/**
 * SAVY PDF Workspace — Editor Application Controller (editor.js)
 * Coordinates the multi-panel editor interface, binds PDFViewer, PDFTools,
 * AnnotationManager, HistoryManager, and PDFExport into a seamless,
 * 100% client-side local PDF editing engine.
 *
 * Privacy Guarantee: All processing is local. Zero cloud uploads.
 */

import { PDFViewer } from './pdf-viewer.js';
import { PDFTools } from './pdf-tools.js';
import { PDFExport } from './export.js';
import { AnnotationManager } from './annotation-manager.js';
import { HistoryManager } from './history-manager.js';
import { DocumentModel } from './document-model.js';
import { PageOrganizer } from './page-organizer.js';
import { PDFToolbox, convertImagesToPdf, embedImageIntoPdf } from './pdf-toolbox.js';
import { SecurityManager } from './security-manager.js';
import { RedactionManager } from './redaction-manager.js';
import { SearchManager } from './search-manager.js';
import { PresentationManager } from './presentation-manager.js';
import { OCRManager } from './ocr-manager.js';
import { ProductivityManager } from './productivity-manager.js';
import { AIManager } from './ai-manager.js';
import { TextEditorManager } from './text-editor-manager.js';

// IndexedDB Helper for cross-page document passing
const DB_NAME = 'SAVY_LOCAL_STORE';
const STORE_NAME = 'pending_documents';

function openIndexedDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = (e) => resolve(e.target.result);
    request.onerror = (e) => reject(e.target.error);
  });
}

async function getPendingDocument() {
  try {
    const db = await openIndexedDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get('active_pdf');
      req.onsuccess = () => {
        const item = req.result;
        // Clean up once retrieved so page reload behaves cleanly
        store.delete('active_pdf');
        resolve(item || null);
      };
      req.onerror = () => resolve(null);
    });
  } catch (err) {
    console.warn('Local storage check skipped:', err);
    return null;
  }
}

class EditorApp {
  constructor() {
    this.initElements();
    this.initModules();
    this.bindEvents();
    this.checkInitialPayload();
  }

  initElements() {
    // Top bar
    this.fileNameEl = document.getElementById('fileName');
    this.fileMetaEl = document.getElementById('fileMeta');
    this.btnOpenFile = document.getElementById('btnOpenFile');
    this.btnCloseDocument = document.getElementById('btnCloseDocument');
    this.btnExport = document.getElementById('btnExport');
    this.btnUndo = document.getElementById('btnUndo');
    this.btnRedo = document.getElementById('btnRedo');
    this.fileInput = document.getElementById('fileInputHidden');
    this.imageFileInput = document.getElementById('imageFileInput');
    this.btnApplyRedactionToolbar = document.getElementById('btnApplyRedactionToolbar');
    this.btnOpenPrivacyCenter = document.getElementById('btnOpenPrivacyCenter');
    this.btnHeaderSearch = document.getElementById('btnHeaderSearch');
    this.btnHeaderFindReplace = document.getElementById('btnHeaderFindReplace');
    this.btnHeaderPresentation = document.getElementById('btnHeaderPresentation');
    this.btnHeaderInspector = document.getElementById('btnHeaderInspector');
    this.btnHeaderShortcuts = document.getElementById('btnHeaderShortcuts');
    this.shortcutsModal = document.getElementById('shortcutsModal');
    this.btnCloseShortcuts = document.getElementById('btnCloseShortcuts');
    this.btnCloseShortcutsFooter = document.getElementById('btnCloseShortcutsFooter');
    this.drawerBackdrop = document.getElementById('drawerBackdrop');
    this.mobileBottomBar = document.getElementById('mobileBottomBar');

    // Toolbar & Panels
    this.toolbarEl = document.getElementById('editorToolbar');
    this.sidebarEl = document.getElementById('editorSidebar');

    // Workspace & Layers
    this.scrollAreaEl = document.getElementById('workspaceScrollArea');
    this.workspaceEl = this.scrollAreaEl || document.getElementById('editorWorkspace');
    this.emptyStateEl = document.getElementById('workspaceEmptyState');
    this.viewportContainer = document.getElementById('pdfViewportContainer');
    this.pdfPageWrapper = document.getElementById('pdfPageWrapper');
    this.pdfCanvas = document.getElementById('pdfCanvas');
    this.annotationOverlay = document.getElementById('annotationOverlay');
    this.drawingCanvas = document.getElementById('drawingCanvas');
    this.drawingCtx = this.drawingCanvas ? this.drawingCanvas.getContext('2d') : null;
    this.textLayerEl = document.getElementById('pdfTextLayer');
    this.textEditLayer = document.getElementById('textEditLayer');
    this.loadingOverlay = document.getElementById('pdfLoadingOverlay');
    this.btnEmptyBrowse = document.getElementById('btnEmptyBrowse');

    // Bottom Bar
    this.btnPrevPage = document.getElementById('btnPrevPage');
    this.btnNextPage = document.getElementById('btnNextPage');
    this.pageNumInput = document.getElementById('pageNumInput');
    this.totalPagesEl = document.getElementById('totalPages');
    this.btnZoomOut = document.getElementById('btnZoomOut');
    this.btnZoomIn = document.getElementById('btnZoomIn');
    this.zoomSelect = document.getElementById('zoomSelect');

    // Sidebar Properties
    this.metaPropName = document.getElementById('metaPropName');
    this.metaPropSize = document.getElementById('metaPropSize');
    this.metaPropPages = document.getElementById('metaPropPages');
    this.metaPropVersion = document.getElementById('metaPropVersion');
    this.toolPropTitle = document.getElementById('toolPropTitle');
    this.toolPropDesc = document.getElementById('toolPropDesc');
    this.btnDeleteSelected = document.getElementById('btnDeleteSelected');

    // Contextual Controls
    this.propGroupColor = document.getElementById('propGroupColor');
    this.colorSwatches = document.querySelectorAll('.color-swatch');
    this.propColorPicker = document.getElementById('propColorPicker');
    this.propGroupStroke = document.getElementById('propGroupStroke');
    this.propStrokeWidth = document.getElementById('propStrokeWidth');
    this.propStrokeWidthVal = document.getElementById('propStrokeWidthVal');
    this.propGroupOpacity = document.getElementById('propGroupOpacity');
    this.propOpacity = document.getElementById('propOpacity');
    this.propOpacityVal = document.getElementById('propOpacityVal');
    this.propGroupTypography = document.getElementById('propGroupTypography');
    this.propFontFamily = document.getElementById('propFontFamily');
    this.propFontSize = document.getElementById('propFontSize');
    this.btnBold = document.getElementById('btnBold');
    this.btnItalic = document.getElementById('btnItalic');
    this.btnUnderline = document.getElementById('btnUnderline');
    this.btnAlignLeft = document.getElementById('btnAlignLeft');
    this.btnAlignCenter = document.getElementById('btnAlignCenter');
    this.btnAlignRight = document.getElementById('btnAlignRight');
    this.propGroupShape = document.getElementById('propGroupShape');
    this.propFillTransparent = document.getElementById('propFillTransparent');
    this.propFillColor = document.getElementById('propFillColor');

    // Signature Modal
    this.sigModal = document.getElementById('signatureModal');
    this.sigCanvas = document.getElementById('signatureCanvas');
    this.sigCtx = this.sigCanvas ? this.sigCanvas.getContext('2d') : null;
    this.btnSigClose = document.getElementById('btnSigClose');
    this.btnSigClear = document.getElementById('btnSigClear');
    this.btnSigCancel = document.getElementById('btnSigCancel');
    this.btnSigInsert = document.getElementById('btnSigInsert');
    this.sigColorBtns = document.querySelectorAll('.sig-color-btn');
    this.sigCurrentColor = '#000000';
    this.isSigDrawing = false;
    this.sigHasDrawn = false;

    // Drawing interaction state
    this.activeDrawingState = null;

    // Organizer & Phase 3 Modals
    this.btnToggleOrganizer = document.getElementById('btnToggleOrganizer');
    this.pageOrganizerPanel = document.getElementById('pageOrganizerPanel');
    this.thumbnailContainer = document.getElementById('thumbnailContainer');

    this.insertPdfFileInput = document.getElementById('insertPdfFileInput');
    this.mergeFileInput = document.getElementById('mergeFileInput');

    this.insertBlankModal = document.getElementById('insertBlankModal');
    this.splitModal = document.getElementById('splitModal');
    this.mergeModal = document.getElementById('mergeModal');
    this.mergeFiles = [];

    // Toast container
    this.toastContainer = document.getElementById('toastContainer');
  }

  initModules() {
    // 0. Document Model
    this.documentModel = new DocumentModel();

    // 1. History Manager
    this.historyManager = new HistoryManager({
      onHistoryChange: ({ canUndo, canRedo }) => {
        if (this.btnUndo) this.btnUndo.disabled = !canUndo;
        if (this.btnRedo) this.btnRedo.disabled = !canRedo;
      },
    });

    // 2. Annotation Manager
    this.annotationManager = new AnnotationManager({
      overlayEl: this.annotationOverlay,
      drawingCanvasEl: this.drawingCanvas,
      historyManager: this.historyManager,
      onSelectionChange: (annot) => this.handleSelectionChanged(annot),
      onAnnotationChange: () => {
        this.securityManager?.updateSecurityStatus();
        this.updateRedactionToolbarVisibility();
      },
    });
    this.annotationManager.setDocumentModel(this.documentModel);
    this.historyManager.setAnnotationManager(this.annotationManager);

    // 3. Export Manager
    this.pdfExport = new PDFExport({
      onExportStart: () => {
        this.showToast('Compiling edited PDF locally with pdf-lib...');
      },
      onExportSuccess: (result) => {
        this.showToast(`Downloaded ${result.filename} (${this.formatFileSize(result.size)})`);
      },
      onExportError: (err) => {
        console.error('Export error:', err);
        this.showToast('Export failed: ' + (err.message || 'Unknown error'));
      },
    });

    // 4. Tools Registry
    this.pdfTools = new PDFTools({
      onToolChange: (tool) => {
        this.handleToolChanged(tool);
      },
      onPhase2Notice: (tool) => {
        this.showToast(`"${tool.name}" is scheduled for Phase 3.`);
      },
      onSettingsChange: (settings) => {
        this.syncControlsWithSettings(settings);
      },
    });

    // Render Toolbar icons
    this.renderToolbar();

    // 5. PDF.js Viewer
    this.pdfViewer = new PDFViewer({
      canvas: this.pdfCanvas,
      viewportContainer: this.workspaceEl,
      textLayer: this.textLayerEl,
      onDocumentLoaded: (meta) => this.handleDocumentLoaded(meta),
      onPageChange: (current, total, pageRecord) => this.handlePageChanged(current, total, pageRecord),
      onZoomChange: (scale) => this.handleZoomChanged(scale),
      onError: (err) => this.handleViewerError(err),
    });
    this.pdfViewer.setDocumentModel(this.documentModel);

    // 6. Page Organizer
    this.pageOrganizer = new PageOrganizer({
      panelEl: this.pageOrganizerPanel,
      thumbnailContainerEl: this.thumbnailContainer,
      documentModel: this.documentModel,
      annotationManager: this.annotationManager,
      pdfViewer: this.pdfViewer,
      pdfExport: this.pdfExport,
      historyManager: this.historyManager,
      onToast: (msg) => this.showToast(msg),
    });

    // 7. PDF Toolbox (Phase 4)
    this.pdfToolbox = new PDFToolbox({
      editorApp: this,
      onToast: (msg) => this.showToast(msg),
    });

    // 8. Security & Privacy Manager (Phase 5)
    this.securityManager = new SecurityManager({
      editorApp: this,
      onToast: (msg) => this.showToast(msg),
    });

    // 9. Redaction Manager (Phase 5)
    this.redactionManager = new RedactionManager({
      editorApp: this,
      onToast: (msg) => this.showToast(msg),
    });

    // 10. Search Manager (Phase 6)
    this.searchManager = new SearchManager({
      editorApp: this,
      onToast: (msg) => this.showToast(msg),
    });

    // 11. Presentation Manager (Phase 6)
    this.presentationManager = new PresentationManager({
      editorApp: this,
      onToast: (msg) => this.showToast(msg),
    });

    // 12. OCR Manager (Phase 6)
    this.ocrManager = new OCRManager({
      editorApp: this,
      onToast: (msg) => this.showToast(msg),
    });

    // 13. Productivity Manager (Phase 6)
    this.productivityManager = new ProductivityManager({
      editorApp: this,
      onToast: (msg) => this.showToast(msg),
    });

    // 14. Phase 7 UX, Mobile, PWA & Error modules
    this.initMobileBottomBar();
    this.initPWA();
    this.initErrorHandling();

    // 15. AI Manager (Phase 8)
    this.aiManager = new AIManager({
      editorApp: this,
      onToast: (msg, type) => this.showToast(msg, type),
    });

    // 16. Text Editor Manager (Visual Existing PDF Text Editing)
    this.textEditorManager = new TextEditorManager({ editorApp: this });
  }

  updateRedactionToolbarVisibility() {
    if (!this.btnApplyRedactionToolbar) return;
    const allAnnots = this.annotationManager.getAllAnnotationsByPageId();
    let hasRedact = false;
    for (const list of allAnnots.values()) {
      if (list.some((a) => a.type === 'redact')) {
        hasRedact = true;
        break;
      }
    }
    this.btnApplyRedactionToolbar.style.display = hasRedact ? 'inline-block' : 'none';
  }

  renderToolbar() {
    this.toolbarEl.innerHTML = '';
    const tools = this.pdfTools.getTools();

    const activeGroup = document.createElement('div');
    activeGroup.className = 'toolbar-group';

    const secondaryGroup = document.createElement('div');
    secondaryGroup.className = 'toolbar-group';

    tools.forEach((tool) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `tool-btn ${tool.status === 'disabled_phase_3' ? 'phase-2-tool' : ''} ${
        tool.id === 'select' ? 'active' : ''
      }`;
      btn.id = `tool_${tool.id}`;
      btn.setAttribute(
        'data-tooltip',
        tool.status === 'disabled_phase_3'
          ? `${tool.name} (Phase 3)`
          : `${tool.name} (${tool.shortcut})`
      );
      btn.setAttribute('aria-label', tool.name);

      btn.innerHTML = `
        <img src="${tool.icon}" alt="" />
        ${tool.status === 'disabled_phase_3' ? '<span class="phase-badge"></span>' : ''}
      `;

      btn.addEventListener('click', () => {
        if (tool.id === 'insert_image') {
          if (!this.pdfViewer.hasDocument()) {
            this.showToast('Please open a PDF document first.');
            return;
          }
          this.imageFileInput?.click();
          return;
        }

        if (tool.id === 'add_signature') {
          if (!this.pdfViewer.hasDocument()) {
            this.showToast('Please open a PDF document first.');
            return;
          }
          this.openSignatureModal();
          return;
        }

        if (tool.id === 'stamp') {
          if (!this.pdfViewer.hasDocument()) {
            this.showToast('Please open a PDF document first.');
            return;
          }
          this.productivityManager?.openStampModal();
          return;
        }

        if (tool.id === 'form_field') {
          if (!this.pdfViewer.hasDocument()) {
            this.showToast('Please open a PDF document first.');
            return;
          }
          this.productivityManager?.openFormModal();
          return;
        }

        const success = this.pdfTools.selectTool(tool.id);
        if (success) {
          this.updateActiveToolUI(tool.id);
        }
      });

      if (['select', 'hand'].includes(tool.id)) {
        activeGroup.appendChild(btn);
      } else {
        secondaryGroup.appendChild(btn);
      }
    });

    const divider = document.createElement('div');
    divider.className = 'toolbar-divider';

    this.toolbarEl.appendChild(activeGroup);
    this.toolbarEl.appendChild(divider);
    this.toolbarEl.appendChild(secondaryGroup);
  }

  bindEvents() {
    // Open file triggers
    this.btnOpenFile?.addEventListener('click', () => this.fileInput?.click());
    this.btnEmptyBrowse?.addEventListener('click', () => this.fileInput?.click());
    this.btnCloseDocument?.addEventListener('click', () => this.closeDocument());

    // File input selection
    this.fileInput?.addEventListener('change', (e) => {
      const file = e.target.files?.[0];
      if (file) {
        this.loadFile(file);
      }
      this.fileInput.value = '';
    });

    // Image file selection
    this.imageFileInput?.addEventListener('change', (e) => {
      const file = e.target.files?.[0];
      if (file) {
        this.handleInsertImageFile(file);
      }
      this.imageFileInput.value = '';
    });

    // Drag and Drop on workspace
    this.workspaceEl?.addEventListener('dragover', (e) => {
      e.preventDefault();
      this.emptyStateEl?.classList.add('dragover');
    });

    this.workspaceEl?.addEventListener('dragleave', () => {
      this.emptyStateEl?.classList.remove('dragover');
    });

    this.workspaceEl?.addEventListener('drop', (e) => {
      e.preventDefault();
      this.emptyStateEl?.classList.remove('dragover');
      const file = e.dataTransfer?.files?.[0];
      if (file && (file.type === 'application/pdf' || file.name.endsWith('.pdf'))) {
        this.loadFile(file);
      } else {
        this.showToast('Please drop a valid PDF file.');
      }
    });

    // Export Trigger
    this.btnExport?.addEventListener('click', () => {
      this.exportDocument();
    });

    // Toggle Organizer
    this.btnToggleOrganizer?.addEventListener('click', () => {
      this.pageOrganizer.togglePanel();
      if (this.drawerBackdrop && window.innerWidth <= 768) {
        this.drawerBackdrop.style.display = this.pageOrganizer.isOpen ? 'block' : 'none';
      }
    });

    // Close organizer drawer button
    document.getElementById('btnCloseOrganizer')?.addEventListener('click', () => {
      if (this.drawerBackdrop) this.drawerBackdrop.style.display = 'none';
    });

    // Mobile Drawer Backdrop click
    this.drawerBackdrop?.addEventListener('click', () => {
      this.pageOrganizer.togglePanel(false);
      this.drawerBackdrop.style.display = 'none';
    });

    // Undo / Redo
    this.btnUndo?.addEventListener('click', () => this.historyManager.undo(this.annotationManager));
    this.btnRedo?.addEventListener('click', () => this.historyManager.redo(this.annotationManager));

    // Privacy Center trigger
    this.btnOpenPrivacyCenter?.addEventListener('click', () => {
      this.securityManager?.openPrivacyCenter();
    });

    // Phase 6 Header Triggers (Search, Presentation, Inspector)
    this.btnHeaderSearch?.addEventListener('click', () => {
      this.searchManager?.open(false);
    });
    this.btnHeaderFindReplace?.addEventListener('click', () => {
      this.searchManager?.open(true);
    });
    this.btnHeaderPresentation?.addEventListener('click', () => {
      this.presentationManager?.start();
    });
    this.btnHeaderInspector?.addEventListener('click', () => {
      this.productivityManager?.openDocumentInspector();
    });

    // Phase 7 Keyboard Shortcuts Dialog Triggers
    this.btnHeaderShortcuts?.addEventListener('click', () => this.toggleShortcutsModal());
    this.btnCloseShortcuts?.addEventListener('click', () => this.toggleShortcutsModal(false));
    this.btnCloseShortcutsFooter?.addEventListener('click', () => this.toggleShortcutsModal(false));
    this.shortcutsModal?.addEventListener('click', (e) => {
      if (e.target === this.shortcutsModal) this.toggleShortcutsModal(false);
    });

    // Organizer Modal Events (Insert Blank, Insert PDF, Split, Merge)
    this.initOrganizerModalEvents();

    // Page navigation
    this.btnPrevPage?.addEventListener('click', () => this.pdfViewer.prevPage());
    this.btnNextPage?.addEventListener('click', () => this.pdfViewer.nextPage());

    this.pageNumInput?.addEventListener('change', () => {
      const num = parseInt(this.pageNumInput.value, 10);
      if (!isNaN(num)) {
        this.pdfViewer.goToPage(num);
      }
    });

    // Zoom controls
    this.btnZoomOut?.addEventListener('click', () => this.pdfViewer.zoomOut());
    this.btnZoomIn?.addEventListener('click', () => this.pdfViewer.zoomIn());

    this.zoomSelect?.addEventListener('change', () => {
      const val = this.zoomSelect.value;
      if (val === 'fit-width') {
        this.pdfViewer.fitWidth();
      } else if (val === 'fit-page') {
        this.pdfViewer.fitPage();
      } else {
        const parsed = parseFloat(val);
        if (!isNaN(parsed)) {
          this.pdfViewer.setZoom(parsed);
        }
      }
    });

    // Global keyboard shortcuts
    window.addEventListener('keydown', (e) => {
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName) || document.activeElement?.isContentEditable) {
        return;
      }

      // Find & Replace
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        this.searchManager?.open(false);
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'h') {
        e.preventDefault();
        this.searchManager?.open(true);
        return;
      }

      // Undo / Redo
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) {
          this.historyManager.redo(this.annotationManager);
        } else {
          this.historyManager.undo(this.annotationManager);
        }
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        this.historyManager.redo(this.annotationManager);
        return;
      }

      // Delete selected annotation
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        this.annotationManager.deleteSelected();
        return;
      }

      // Escape key: closes modals/search/drawer or deselects annotation
      if (e.key === 'Escape') {
        if (this.shortcutsModal && this.shortcutsModal.style.display !== 'none') {
          this.toggleShortcutsModal(false);
          return;
        }
        if (this.searchManager && this.searchManager.isOpen) {
          this.searchManager.close();
          return;
        }
        const openModals = document.querySelectorAll('.savy-modal, .modal-backdrop');
        let closedModal = false;
        openModals.forEach((m) => {
          if (m.style.display !== 'none') {
            m.style.display = 'none';
            closedModal = true;
          }
        });
        if (this.drawerBackdrop) this.drawerBackdrop.style.display = 'none';
        if (closedModal) return;

        this.annotationManager.deselect();
        return;
      }

      // Shortcuts Modal Toggle (?)
      if (e.key === '?' || (e.shiftKey && e.key === '/')) {
        e.preventDefault();
        this.toggleShortcutsModal();
        return;
      }

      // Reset Zoom (0 or Ctrl+0)
      if (e.key === '0' || ((e.ctrlKey || e.metaKey) && (e.key === '0' || e.key === 'NumPad0'))) {
        e.preventDefault();
        this.pdfViewer.fitWidth();
        if (this.zoomSelect) this.zoomSelect.value = 'fit-width';
        return;
      }

      // Open file
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'o') {
        e.preventDefault();
        this.fileInput?.click();
        return;
      }

      // Page nav
      if (e.key === 'ArrowRight' || e.key === 'PageDown') {
        e.preventDefault();
        this.pdfViewer.nextPage();
        return;
      }
      if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
        e.preventDefault();
        this.pdfViewer.prevPage();
        return;
      }

      // Zoom
      if (e.key === '+' || e.key === '=') {
        e.preventDefault();
        this.pdfViewer.zoomIn();
        return;
      }
      if (e.key === '-') {
        e.preventDefault();
        this.pdfViewer.zoomOut();
        return;
      }

      // Single-Key Tool Selection (when not holding Ctrl / Meta / Alt)
      if (!e.ctrlKey && !e.metaKey && !e.altKey) {
        const k = e.key.toUpperCase();
        const toolMap = {
          V: 'select',
          H: 'hand',
          E: 'edit_text',
          T: 'annotate_text',
          P: 'draw_ink',
          L: 'highlight',
          R: 'shape_rect',
          C: 'shape_circle',
          A: 'shape_line',
          I: 'insert_image',
          S: 'add_signature',
          M: 'stamp',
          F: 'form_field',
          X: 'redact',
        };
        if (toolMap[k]) {
          const toolId = toolMap[k];
          if (toolId === 'insert_image') {
            if (!this.pdfViewer.hasDocument()) {
              this.showToast('Please open a PDF document first.', 'warning');
              return;
            }
            this.imageFileInput?.click();
            return;
          }
          if (toolId === 'add_signature') {
            if (!this.pdfViewer.hasDocument()) {
              this.showToast('Please open a PDF document first.', 'warning');
              return;
            }
            this.openSignatureModal();
            return;
          }
          if (toolId === 'stamp') {
            if (!this.pdfViewer.hasDocument()) {
              this.showToast('Please open a PDF document first.', 'warning');
              return;
            }
            this.productivityManager?.openStampModal();
            return;
          }
          if (toolId === 'form_field') {
            if (!this.pdfViewer.hasDocument()) {
              this.showToast('Please open a PDF document first.', 'warning');
              return;
            }
            this.productivityManager?.openFormModal();
            return;
          }

          const success = this.pdfTools.selectTool(toolId);
          if (success) {
            this.updateActiveToolUI(toolId);
          }
          return;
        }
      }
    });

    // Drawing Canvas pointer events
    this.initDrawingEvents();

    // Contextual property sidebar events
    this.initPropertyEvents();

    // Signature modal events
    this.initSignatureModalEvents();
  }

  // --- Real-time Drawing & Shape Creation on Canvas ---
  initDrawingEvents() {
    if (!this.drawingCanvas) return;

    this.drawingCanvas.addEventListener('pointerdown', (e) => this.handleCanvasPointerDown(e));
    window.addEventListener('pointermove', (e) => this.handleCanvasPointerMove(e));
    window.addEventListener('pointerup', (e) => this.handleCanvasPointerUp(e));
  }

  handleCanvasPointerDown(e) {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    if (!this.pdfViewer.hasDocument()) return;

    const tool = this.pdfTools.getActiveTool();
    if (!tool) return;

    const rect = this.drawingCanvas.getBoundingClientRect();
    const vx = e.clientX - rect.left;
    const vy = e.clientY - rect.top;
    const pt = this.annotationManager.viewportToPdf(vx, vy);

    if (tool.id === 'annotate_text') {
      // Create inline text box at click position
      const s = this.pdfTools.getSettings();
      const annot = {
        id: 'annot_' + Math.random().toString(36).substr(2, 9),
        type: 'text',
        pageNumber: this.pdfViewer.currentPage,
        x: Math.max(10, pt.x),
        y: Math.max(10, pt.y),
        width: 140,
        height: 32,
        content: 'Edit text',
        style: { ...s },
      };
      this.annotationManager.addAnnotation(annot, true);
      // Switch back to select tool so user can immediately move/edit
      this.pdfTools.selectTool('select');
      this.syncActiveToolbarButton('select');
      return;
    }

    if (['draw_ink', 'highlight'].includes(tool.id)) {
      e.preventDefault();
      this.activeDrawingState = {
        type: tool.id,
        points: [pt],
        settings: this.pdfTools.getSettings(),
      };
      this.drawSmoothStroke();
      return;
    }

    if (['shape_rect', 'shape_circle', 'shape_line', 'redact'].includes(tool.id)) {
      e.preventDefault();
      this.activeDrawingState = {
        type: tool.id,
        startPt: pt,
        currentPt: pt,
        settings: this.pdfTools.getSettings(),
      };
    }
  }

  handleCanvasPointerMove(e) {
    if (!this.activeDrawingState) return;

    const rect = this.drawingCanvas.getBoundingClientRect();
    const vx = e.clientX - rect.left;
    const vy = e.clientY - rect.top;
    const pt = this.annotationManager.viewportToPdf(vx, vy);

    if (['draw_ink', 'highlight'].includes(this.activeDrawingState.type)) {
      this.activeDrawingState.points.push(pt);
      this.drawSmoothStroke();
    } else if (['shape_rect', 'shape_circle', 'shape_line', 'redact'].includes(this.activeDrawingState.type)) {
      this.activeDrawingState.currentPt = pt;
      this.drawShapePreview();
    }
  }

  handleCanvasPointerUp(e) {
    if (!this.activeDrawingState) return;

    const s = this.activeDrawingState.settings;
    const type = this.activeDrawingState.type;

    if (['draw_ink', 'highlight'].includes(type)) {
      const pts = this.activeDrawingState.points;
      if (pts.length > 0) {
        // Calculate bounding box
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        for (const p of pts) {
          if (p.x < minX) minX = p.x;
          if (p.y < minY) minY = p.y;
          if (p.x > maxX) maxX = p.x;
          if (p.y > maxY) maxY = p.y;
        }

        const padding = (s.strokeWidth || 3) / 2;
        const x = Math.max(0, minX - padding);
        const y = Math.max(0, minY - padding);
        const width = Math.max(10, maxX - minX + padding * 2);
        const height = Math.max(10, maxY - minY + padding * 2);

        const annot = {
          id: 'annot_' + Math.random().toString(36).substr(2, 9),
          type: type === 'highlight' ? 'highlight' : 'drawing',
          pageNumber: this.pdfViewer.currentPage,
          x,
          y,
          width,
          height,
          points: pts,
          style: {
            ...s,
            opacity: type === 'highlight' ? (s.opacity || 0.35) : 1.0,
            color: type === 'highlight' ? (s.color || '#FACC15') : s.color,
          },
        };
        this.annotationManager.addAnnotation(annot, true);
      }
    } else if (['shape_rect', 'shape_circle', 'shape_line'].includes(type)) {
      const p1 = this.activeDrawingState.startPt;
      const p2 = this.activeDrawingState.currentPt;

      const minX = Math.min(p1.x, p2.x);
      const minY = Math.min(p1.y, p2.y);
      const width = Math.max(16, Math.abs(p2.x - p1.x));
      const height = Math.max(16, Math.abs(p2.y - p1.y));

      let annotType = 'rectangle';
      if (type === 'shape_circle') annotType = 'circle';
      if (type === 'shape_line') annotType = 'line';

      const annot = {
        id: 'annot_' + Math.random().toString(36).substr(2, 9),
        type: annotType,
        pageNumber: this.pdfViewer.currentPage,
        x: minX,
        y: minY,
        width,
        height,
        x1Rel: p1.x - minX,
        y1Rel: p1.y - minY,
        x2Rel: p2.x - minX,
        y2Rel: p2.y - minY,
        style: { ...s },
      };
      this.annotationManager.addAnnotation(annot, true);
    } else if (type === 'redact') {
      const p1 = this.activeDrawingState.startPt;
      const p2 = this.activeDrawingState.currentPt;

      const minX = Math.min(p1.x, p2.x);
      const minY = Math.min(p1.y, p2.y);
      const width = Math.max(16, Math.abs(p2.x - p1.x));
      const height = Math.max(16, Math.abs(p2.y - p1.y));

      const annot = {
        id: 'annot_' + Math.random().toString(36).substr(2, 9),
        type: 'redact',
        pageNumber: this.pdfViewer.currentPage,
        x: minX,
        y: minY,
        width,
        height,
        style: { ...s },
      };
      this.annotationManager.addAnnotation(annot, true);
      this.securityManager?.updateSecurityStatus();
      this.updateRedactionToolbarVisibility();
    }

    // Clear preview canvas
    this.clearDrawingCanvas();
    this.activeDrawingState = null;
  }

  drawSmoothStroke() {
    if (!this.drawingCtx || !this.activeDrawingState) return;
    const ctx = this.drawingCtx;
    const pts = this.activeDrawingState.points;
    const s = this.activeDrawingState.settings;
    const scale = this.pdfViewer.scale;

    this.clearDrawingCanvas();

    if (pts.length === 0) return;

    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = (s.strokeWidth || 3) * scale;
    ctx.strokeStyle = s.color || '#2563EB';

    if (this.activeDrawingState.type === 'highlight') {
      ctx.globalAlpha = s.opacity || 0.35;
      ctx.strokeStyle = s.color || '#FACC15';
    }

    ctx.beginPath();
    const p0 = pts[0];
    ctx.moveTo(p0.x * scale, p0.y * scale);

    if (pts.length === 1) {
      ctx.lineTo(p0.x * scale + 0.5, p0.y * scale + 0.5);
    } else {
      for (let i = 1; i < pts.length - 1; i++) {
        const xc = ((pts[i].x + pts[i + 1].x) / 2) * scale;
        const yc = ((pts[i].y + pts[i + 1].y) / 2) * scale;
        ctx.quadraticCurveTo(pts[i].x * scale, pts[i].y * scale, xc, yc);
      }
      const last = pts[pts.length - 1];
      ctx.lineTo(last.x * scale, last.y * scale);
    }

    ctx.stroke();
    ctx.restore();
  }

  drawShapePreview() {
    if (!this.drawingCtx || !this.activeDrawingState) return;
    const ctx = this.drawingCtx;
    const p1 = this.activeDrawingState.startPt;
    const p2 = this.activeDrawingState.currentPt;
    const s = this.activeDrawingState.settings;
    const scale = this.pdfViewer.scale;

    this.clearDrawingCanvas();

    const vx1 = p1.x * scale;
    const vy1 = p1.y * scale;
    const vx2 = p2.x * scale;
    const vy2 = p2.y * scale;

    ctx.save();
    ctx.lineWidth = (s.strokeWidth || 2) * scale;
    ctx.strokeStyle = s.color || '#2563EB';
    ctx.fillStyle = s.fillColor && s.fillColor !== 'transparent' ? s.fillColor : 'transparent';

    const minX = Math.min(vx1, vx2);
    const minY = Math.min(vy1, vy2);
    const w = Math.abs(vx2 - vx1);
    const h = Math.abs(vy2 - vy1);

    if (this.activeDrawingState.type === 'shape_rect') {
      if (s.fillColor && s.fillColor !== 'transparent') ctx.fillRect(minX, minY, w, h);
      ctx.strokeRect(minX, minY, w, h);
    } else if (this.activeDrawingState.type === 'shape_circle') {
      ctx.beginPath();
      ctx.ellipse(minX + w / 2, minY + h / 2, Math.max(1, w / 2), Math.max(1, h / 2), 0, 0, Math.PI * 2);
      if (s.fillColor && s.fillColor !== 'transparent') ctx.fill();
      ctx.stroke();
    } else if (this.activeDrawingState.type === 'shape_line') {
      ctx.beginPath();
      ctx.moveTo(vx1, vy1);
      ctx.lineTo(vx2, vy2);
      ctx.stroke();
    } else if (this.activeDrawingState.type === 'redact') {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
      ctx.fillRect(minX, minY, w, h);
      ctx.strokeStyle = '#dc2626';
      ctx.setLineDash([4 * scale, 4 * scale]);
      ctx.lineWidth = 2 * scale;
      ctx.strokeRect(minX, minY, w, h);
    }

    ctx.restore();
  }

  clearDrawingCanvas() {
    if (!this.drawingCtx || !this.drawingCanvas) return;
    this.drawingCtx.clearRect(0, 0, this.drawingCanvas.width, this.drawingCanvas.height);
  }

  syncCanvasDimensions() {
    if (!this.pdfCanvas || !this.drawingCanvas || !this.annotationOverlay) return;
    const w = this.pdfCanvas.style.width;
    const h = this.pdfCanvas.style.height;

    if (this.pdfPageWrapper) {
      this.pdfPageWrapper.style.width = w;
      this.pdfPageWrapper.style.height = h;
    }

    if (this.textLayerEl) {
      this.textLayerEl.style.width = w;
      this.textLayerEl.style.height = h;
    }

    this.annotationOverlay.style.width = w;
    this.annotationOverlay.style.height = h;

    const pixelRatio = window.devicePixelRatio || 1;
    const numW = parseInt(w, 10) || 600;
    const numH = parseInt(h, 10) || 800;

    this.drawingCanvas.width = numW * pixelRatio;
    this.drawingCanvas.height = numH * pixelRatio;
    this.drawingCanvas.style.width = w;
    this.drawingCanvas.style.height = h;

    if (this.drawingCtx) {
      this.drawingCtx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    }
  }

  // --- Contextual Property Sidebar Controls ---
  initPropertyEvents() {
    // Delete Selected
    this.btnDeleteSelected?.addEventListener('click', () => {
      this.annotationManager.deleteSelected();
    });

    // Color Swatches
    this.colorSwatches.forEach((swatch) => {
      swatch.addEventListener('click', () => {
        const color = swatch.dataset.color;
        this.colorSwatches.forEach((s) => s.classList.remove('is-active'));
        swatch.classList.add('is-active');
        if (this.propColorPicker) this.propColorPicker.value = color;

        this.applyPropertyChange({ color });
      });
    });

    // Color Picker
    this.propColorPicker?.addEventListener('input', (e) => {
      const color = e.target.value;
      this.colorSwatches.forEach((s) => s.classList.remove('is-active'));
      this.applyPropertyChange({ color });
    });

    // Stroke Width Slider
    this.propStrokeWidth?.addEventListener('input', (e) => {
      const strokeWidth = parseInt(e.target.value, 10);
      if (this.propStrokeWidthVal) this.propStrokeWidthVal.textContent = `${strokeWidth}px`;
      this.applyPropertyChange({ strokeWidth });
    });

    // Opacity Slider
    this.propOpacity?.addEventListener('input', (e) => {
      const opacityVal = parseInt(e.target.value, 10);
      if (this.propOpacityVal) this.propOpacityVal.textContent = `${opacityVal}%`;
      this.applyPropertyChange({ opacity: opacityVal / 100 });
    });

    // Font Family
    this.propFontFamily?.addEventListener('change', (e) => {
      this.applyPropertyChange({ fontFamily: e.target.value });
    });

    // Font Size
    this.propFontSize?.addEventListener('change', (e) => {
      this.applyPropertyChange({ fontSize: parseInt(e.target.value, 10) });
    });

    // Bold, Italic, Underline
    this.btnBold?.addEventListener('click', () => {
      const selected = this.annotationManager.getSelectedAnnotation();
      const current = selected ? selected.style?.bold : this.pdfTools.getSettings().bold;
      const val = !current;
      this.btnBold.classList.toggle('is-active', val);
      this.applyPropertyChange({ bold: val });
    });

    this.btnItalic?.addEventListener('click', () => {
      const selected = this.annotationManager.getSelectedAnnotation();
      const current = selected ? selected.style?.italic : this.pdfTools.getSettings().italic;
      const val = !current;
      this.btnItalic.classList.toggle('is-active', val);
      this.applyPropertyChange({ italic: val });
    });

    this.btnUnderline?.addEventListener('click', () => {
      const selected = this.annotationManager.getSelectedAnnotation();
      const current = selected ? selected.style?.underline : this.pdfTools.getSettings().underline;
      const val = !current;
      this.btnUnderline.classList.toggle('is-active', val);
      this.applyPropertyChange({ underline: val });
    });

    // Alignment
    const alignBtns = [this.btnAlignLeft, this.btnAlignCenter, this.btnAlignRight];
    alignBtns.forEach((btn) => {
      btn?.addEventListener('click', () => {
        alignBtns.forEach((b) => b?.classList.remove('is-active'));
        btn.classList.add('is-active');
        let align = 'left';
        if (btn === this.btnAlignCenter) align = 'center';
        if (btn === this.btnAlignRight) align = 'right';
        this.applyPropertyChange({ align });
      });
    });

    // Fill Options
    this.propFillTransparent?.addEventListener('change', (e) => {
      const isTransparent = e.target.checked;
      if (this.propFillColor) this.propFillColor.disabled = isTransparent;
      const fillColor = isTransparent ? 'transparent' : (this.propFillColor?.value || '#BFDBFE');
      this.applyPropertyChange({ fillColor });
    });

    this.propFillColor?.addEventListener('input', (e) => {
      this.applyPropertyChange({ fillColor: e.target.value });
    });
  }

  applyPropertyChange(changes) {
    // If an annotation is selected, update it live
    if (this.annotationManager.selectedAnnotationId) {
      this.annotationManager.updateSelectedStyle(changes);
    }
    // Update default settings for active tool
    this.pdfTools.updateSettings(changes);
  }

  handleSelectionChanged(selectedAnnot) {
    if (this.btnDeleteSelected) {
      this.btnDeleteSelected.style.display = selectedAnnot ? 'inline-block' : 'none';
    }

    if (selectedAnnot) {
      if (this.toolPropTitle) this.toolPropTitle.textContent = `Selected: ${selectedAnnot.type.toUpperCase()}`;
      if (this.toolPropDesc) this.toolPropDesc.textContent = 'Drag to move, use handles to resize, or adjust style below.';

      this.syncControlsWithSettings(selectedAnnot.style || {}, selectedAnnot.type);
    } else {
      const tool = this.pdfTools.getActiveTool();
      if (this.toolPropTitle) this.toolPropTitle.textContent = tool?.name || 'Select';
      if (this.toolPropDesc) this.toolPropDesc.textContent = tool?.description || '';

      this.syncControlsWithSettings(this.pdfTools.getSettings(), tool?.id);
    }
  }

  syncControlsWithSettings(settings, type) {
    // Color
    if (settings.color) {
      if (this.propColorPicker) this.propColorPicker.value = settings.color;
      this.colorSwatches.forEach((s) => {
        s.classList.toggle('is-active', s.dataset.color.toLowerCase() === settings.color.toLowerCase());
      });
    }

    // Stroke
    if (settings.strokeWidth && this.propStrokeWidth) {
      this.propStrokeWidth.value = settings.strokeWidth;
      if (this.propStrokeWidthVal) this.propStrokeWidthVal.textContent = `${settings.strokeWidth}px`;
    }

    // Opacity
    if (settings.opacity !== undefined && this.propOpacity) {
      const pct = Math.round(settings.opacity * 100);
      this.propOpacity.value = pct;
      if (this.propOpacityVal) this.propOpacityVal.textContent = `${pct}%`;
    }

    // Typography visibility
    const isText = type === 'text' || type === 'annotate_text';
    if (this.propGroupTypography) {
      this.propGroupTypography.style.display = isText ? 'flex' : 'none';
      if (isText) {
        if (settings.fontFamily && this.propFontFamily) this.propFontFamily.value = settings.fontFamily;
        if (settings.fontSize && this.propFontSize) this.propFontSize.value = String(settings.fontSize);
        this.btnBold?.classList.toggle('is-active', Boolean(settings.bold));
        this.btnItalic?.classList.toggle('is-active', Boolean(settings.italic));
        this.btnUnderline?.classList.toggle('is-active', Boolean(settings.underline));
      }
    }

    // Shape Fill visibility
    const isShape = ['rectangle', 'circle', 'shape_rect', 'shape_circle'].includes(type);
    if (this.propGroupShape) {
      this.propGroupShape.style.display = isShape ? 'flex' : 'none';
      if (isShape) {
        const isTransparent = !settings.fillColor || settings.fillColor === 'transparent';
        if (this.propFillTransparent) this.propFillTransparent.checked = isTransparent;
        if (this.propFillColor) {
          this.propFillColor.disabled = isTransparent;
          if (!isTransparent) this.propFillColor.value = settings.fillColor;
        }
      }
    }
  }

  // --- Image Insertion ---
  handleInsertImageFile(file) {
    if (!file) return;

    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
      this.showToast('Please select a valid PNG, JPG, or WebP image.');
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target?.result;
      const img = new Image();
      img.onload = () => {
        // Compute scaled dimensions (max width 220 in PDF points)
        const maxW = 220;
        const aspect = (img.naturalHeight || 1) / (img.naturalWidth || 1);
        const w = Math.min(maxW, img.naturalWidth || maxW);
        const h = w * aspect;

        const pageSize = this.pdfViewer.getPageSize();
        const x = Math.max(20, (pageSize.width - w) / 2);
        const y = Math.max(20, (pageSize.height - h) / 2);

        const annot = {
          id: 'annot_' + Math.random().toString(36).substr(2, 9),
          type: 'image',
          pageNumber: this.pdfViewer.currentPage,
          x,
          y,
          width: w,
          height: h,
          dataUrl,
        };

        this.annotationManager.addAnnotation(annot, true);
        this.pdfTools.selectTool('select');
        this.syncActiveToolbarButton('select');
        this.showToast('Image inserted onto current page.');
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
  }

  // --- Signature Modal ---
  initSignatureModalEvents() {
    this.btnSigClose?.addEventListener('click', () => this.closeSignatureModal());
    this.btnSigCancel?.addEventListener('click', () => this.closeSignatureModal());

    this.btnSigClear?.addEventListener('click', () => {
      this.clearSignatureCanvas();
    });

    this.sigColorBtns?.forEach((btn) => {
      btn.addEventListener('click', () => {
        this.sigColorBtns.forEach((b) => b.classList.remove('is-active'));
        btn.classList.add('is-active');
        this.sigCurrentColor = btn.dataset.color || '#000000';
      });
    });

    if (this.sigCanvas) {
      this.sigCanvas.addEventListener('pointerdown', (e) => {
        this.isSigDrawing = true;
        this.sigHasDrawn = true;
        const rect = this.sigCanvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        this.sigCtx.beginPath();
        this.sigCtx.moveTo(x, y);
        this.sigCtx.strokeStyle = this.sigCurrentColor;
        this.sigCtx.lineWidth = 2.5;
        this.sigCtx.lineCap = 'round';
        this.sigCtx.lineJoin = 'round';
      });

      window.addEventListener('pointermove', (e) => {
        if (!this.isSigDrawing || !this.sigCtx) return;
        const rect = this.sigCanvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        this.sigCtx.lineTo(x, y);
        this.sigCtx.stroke();
      });

      window.addEventListener('pointerup', () => {
        this.isSigDrawing = false;
      });
    }

    this.btnSigInsert?.addEventListener('click', () => {
      if (!this.sigHasDrawn) {
        this.showToast('Please draw your signature before inserting.');
        return;
      }

      const dataUrl = this.sigCanvas.toDataURL('image/png');
      const pageSize = this.pdfViewer.getPageSize();
      const w = 180;
      const h = 70;
      const x = Math.max(20, (pageSize.width - w) / 2);
      const y = Math.max(20, pageSize.height - h - 60);

      const annot = {
        id: 'annot_' + Math.random().toString(36).substr(2, 9),
        type: 'signature',
        pageNumber: this.pdfViewer.currentPage,
        x,
        y,
        width: w,
        height: h,
        dataUrl,
      };

      this.annotationManager.addAnnotation(annot, true);
      this.closeSignatureModal();
      this.pdfTools.selectTool('select');
      this.syncActiveToolbarButton('select');
      this.showToast('Signature placed on current page.');
    });
  }

  openSignatureModal() {
    if (!this.sigModal) return;
    this.sigModal.style.display = 'flex';
    this.clearSignatureCanvas();
  }

  closeSignatureModal() {
    if (!this.sigModal) return;
    this.sigModal.style.display = 'none';
  }

  clearSignatureCanvas() {
    if (!this.sigCtx || !this.sigCanvas) return;
    this.sigCtx.clearRect(0, 0, this.sigCanvas.width, this.sigCanvas.height);
    this.sigHasDrawn = false;
  }

  syncActiveToolbarButton(toolId) {
    this.toolbarEl?.querySelectorAll('.tool-btn').forEach((btn) => {
      btn.classList.toggle('active', btn.id === `tool_${toolId}`);
    });
  }

  // --- Document Export ---
  async exportDocument() {
    if (!this.pdfViewer.hasDocument()) {
      this.showToast('No PDF document is currently loaded.');
      return;
    }

    const meta = this.pdfViewer.getMetadata() || { name: 'document.pdf' };

    // Export using DocumentModel (preserving all reorders, rotations, duplicates, blank pages, and annotations)
    await this.pdfExport.compileModifiedDocument(this.documentModel, this.annotationManager, meta.name);
  }

  async checkInitialPayload() {
    const payload = await getPendingDocument();
    const urlParams = new URLSearchParams(window.location.search);
    const initialAction = urlParams.get('action') || urlParams.get('tool');

    if (payload && payload.file) {
      const isImage = (payload.file.type && payload.file.type.startsWith('image/')) ||
        /\.(jpe?g|png|webp|gif|bmp|svg)$/i.test(payload.name || payload.file.name || '');

      if (isImage || initialAction === 'images-to-pdf' || initialAction === 'image-to-pdf') {
        if (this.pdfToolbox) {
          this.pdfToolbox.openImgToPdf();
          this.pdfToolbox.addImagesToPdfList([payload.file]);
        }
      } else {
        this.loadFile(payload.file, payload.name);
      }
    } else if (initialAction) {
      this.handleInitialToolAction(initialAction);
    }
  }

  async loadFile(file, name) {
    try {
      this.showLoading(true);
      this.annotationManager.clear();
      this.historyManager.clear();
      await this.pdfViewer.loadDocument(file, name || file.name);
      this.showLoading(false);
    } catch (err) {
      this.showLoading(false);
      this.showToast('Could not load PDF: ' + (err.message || 'Unknown error'));
    }
  }

  closeDocument() {
    if (this.securityManager) {
      this.securityManager.resetWorkspace();
    } else {
      this.resetWorkspace();
    }
  }

  resetWorkspace() {
    if (this.pdfViewer) {
      if (typeof this.pdfViewer.closeDocument === 'function') {
        this.pdfViewer.closeDocument();
      } else {
        if (this.pdfViewer.pdfDoc && typeof this.pdfViewer.pdfDoc.destroy === 'function') {
          try { this.pdfViewer.pdfDoc.destroy(); } catch (e) {}
        }
        this.pdfViewer.pdfDoc = null;
        this.pdfViewer.currentFile = null;
        this.pdfViewer.rawArrayBuffer = null;
        this.pdfViewer.totalPages = 0;
        this.pdfViewer.currentPage = 1;
      }
    }

    if (this.documentModel) {
      this.documentModel.clear();
    }

    if (this.pageOrganizer) {
      this.pageOrganizer.clear();
    }

    if (this.annotationManager) {
      this.annotationManager.clear();
      this.annotationManager.deselect();
    }

    if (this.historyManager) {
      this.historyManager.clear();
    }

    this.searchManager?.invalidateCache();
    this.textEditorManager?.invalidateCache();
    if (this.aiManager) {
      this.aiManager.cachedExtraction = null;
      this.aiManager.chatHistory = [];
      if (this.aiManager.aiChatMessages) this.aiManager.aiChatMessages.innerHTML = '';
      if (this.aiManager.aiSummaryOutput) this.aiManager.aiSummaryOutput.innerHTML = '';
      if (this.aiManager.aiKeyPointsOutput) this.aiManager.aiKeyPointsOutput.innerHTML = '';
      if (this.aiManager.aiOutlineOutput) this.aiManager.aiOutlineOutput.innerHTML = '';
    }

    if (this.viewportContainer) {
      this.viewportContainer.classList.remove('active');
    }
    if (this.emptyStateEl) {
      this.emptyStateEl.style.display = 'flex';
    }

    if (this.fileNameEl) this.fileNameEl.textContent = 'No Document';
    if (this.fileMetaEl) this.fileMetaEl.textContent = 'Files Stay on Your Device';
    if (this.pageNumInput) this.pageNumInput.value = '1';
    if (this.totalPagesEl) this.totalPagesEl.textContent = '0';
    if (this.btnCloseDocument) this.btnCloseDocument.style.display = 'none';

    if (this.metaPropName) this.metaPropName.textContent = 'No Document';
    if (this.metaPropSize) this.metaPropSize.textContent = '0 KB';
    if (this.metaPropPages) this.metaPropPages.textContent = '0';
    if (this.metaPropVersion) this.metaPropVersion.textContent = '—';

    if (this.drawingCtx && this.drawingCanvas) {
      this.drawingCtx.clearRect(0, 0, this.drawingCanvas.width, this.drawingCanvas.height);
    }

    this.pdfTools?.selectTool('select');
    this.updateActiveToolUI('select');
  }

  async handleDocumentLoaded(meta) {
    if (this.emptyStateEl) this.emptyStateEl.style.display = 'none';
    if (this.viewportContainer) this.viewportContainer.classList.add('active');

    // Initialize DocumentModel with the loaded pdfjsDoc and rawArrayBuffer
    const originalBytes = this.pdfViewer.getOriginalBytes();
    if (originalBytes && this.pdfViewer.pdfDoc) {
      await this.documentModel.loadInitialDocument(originalBytes, meta.name, this.pdfViewer.pdfDoc);
      this.pageOrganizer.setDocumentModel(this.documentModel);
    }

    if (this.fileNameEl) this.fileNameEl.textContent = meta.name;
    const formattedSize = this.formatFileSize(meta.size);
    if (this.fileMetaEl) {
      this.fileMetaEl.textContent = `${meta.pages} ${meta.pages === 1 ? 'page' : 'pages'} • ${formattedSize}`;
    }

    if (this.pageNumInput) {
      this.pageNumInput.value = '1';
      this.pageNumInput.max = meta.pages;
    }
    if (this.totalPagesEl) {
      this.totalPagesEl.textContent = meta.pages;
    }

    if (this.metaPropName) this.metaPropName.textContent = meta.name;
    if (this.metaPropSize) this.metaPropSize.textContent = formattedSize;
    if (this.metaPropPages) this.metaPropPages.textContent = meta.pages;
    if (this.metaPropVersion) this.metaPropVersion.textContent = `PDF ${meta.version}`;

    this.syncCanvasDimensions();
    const firstPage = this.documentModel.getPage(0);
    this.annotationManager.setPageContext(1, this.pdfViewer.scale, this.pdfViewer.getPageSize(), firstPage?.id);
    this.pageOrganizer.setActivePage(1, firstPage);

    if (this.btnCloseDocument) this.btnCloseDocument.style.display = 'inline-flex';
    this.searchManager?.invalidateCache();
    if (this.aiManager) {
      this.aiManager.cachedExtraction = null;
    }
    await this.securityManager?.updateSecurityStatus();
    this.updateRedactionToolbarVisibility();

    // Check for direct tool action requested via URL (from /tools/ pages)
    const urlParams = new URLSearchParams(window.location.search);
    const initialAction = urlParams.get('action') || urlParams.get('tool');
    if (initialAction) {
      this.handleInitialToolAction(initialAction);
    }
  }

  handleInitialToolAction(action) {
    if (!action) return;
    setTimeout(() => {
      const act = String(action).toLowerCase().trim();
      switch (act) {
        case 'editor':
          this.pdfTools?.selectTool('select');
          this.updateActiveToolUI('select');
          break;
        case 'edit-text':
        case 'edit_text':
          this.pdfTools?.selectTool('edit_text');
          this.updateActiveToolUI('edit_text');
          break;
        case 'merge':
          if (this.mergeModal) this.mergeModal.style.display = 'flex';
          else this.pdfToolbox?.launchTool('merge');
          break;
        case 'split':
          if (this.splitModal) this.splitModal.style.display = 'flex';
          else this.pdfToolbox?.launchTool('split');
          break;
        case 'compress':
          this.pdfToolbox?.launchTool('compress');
          break;
        case 'redact':
          this.pdfTools?.selectTool('redact');
          this.updateActiveToolUI('redact');
          this.showToast('Redact tool active: drag across sensitive area to redact.');
          break;
        case 'forms':
        case 'form':
          this.productivityManager?.openFormModal();
          break;
        case 'ocr':
          if (typeof this.ocrManager?.openModal === 'function') {
            this.ocrManager.openModal();
          } else if (typeof this.ocrManager?.open === 'function') {
            this.ocrManager.open();
          }
          break;
        case 'pdf-to-image':
        case 'pdf-to-images':
          this.pdfToolbox?.launchTool('pdf-to-images');
          break;
        case 'pdf-to-text':
          this.pdfToolbox?.launchTool('pdf-to-text');
          break;
        case 'image-to-pdf':
        case 'images-to-pdf':
          this.pdfToolbox?.launchTool('images-to-pdf');
          break;
        case 'watermark':
          this.pdfToolbox?.launchTool('watermark');
          break;
        case 'metadata':
          this.securityManager?.openMetadataModal ? this.securityManager.openMetadataModal() : this.pdfToolbox?.launchTool('metadata');
          break;
        case 'page-numbering':
          this.pdfToolbox?.launchTool('page-numbering');
          break;
        case 'crop':
          this.productivityManager?.openCropModal();
          break;
        case 'resize':
          this.productivityManager?.openResizeModal();
          break;
        case 'headers-footers':
        case 'header-footer':
          this.productivityManager?.openHeaderFooterModal();
          break;
        case 'bates':
          this.productivityManager?.openBatesModal();
          break;
        case 'stamps':
        case 'stamp':
          this.productivityManager?.openStampModal();
          break;
        case 'presentation':
          this.presentationManager?.start();
          break;
        case 'ai':
          this.aiManager?.open();
          break;
        case 'inspector':
          this.productivityManager?.openDocumentInspector();
          break;
        case 'toolbox':
          this.pdfToolbox?.openToolbox();
          break;
        case 'rotate':
          this.pdfToolbox?.launchTool('rotate');
          break;
        case 'organize':
          this.openPageOrganizer();
          break;
        case 'pdf-to-word':
        case 'word':
          this.pdfToolbox?.launchTool('pdf-to-word');
          break;
        case 'image-to-word':
          this.pdfToolbox?.launchTool('image-to-word');
          break;
        case 'pdf-to-excel':
        case 'excel':
          this.pdfToolbox?.launchTool('pdf-to-excel');
          break;
        case 'pdf-to-powerpoint':
        case 'pdf-to-pptx':
        case 'powerpoint':
          this.pdfToolbox?.launchTool('pdf-to-pptx');
          break;
        case 'pdf-to-pdfa':
        case 'pdfa':
          this.pdfToolbox?.launchTool('pdf-to-pdfa');
          break;
        case 'pdf-to-markdown':
        case 'markdown':
          this.pdfToolbox?.launchTool('pdf-to-markdown');
          break;
        case 'html-to-pdf':
        case 'html':
          this.pdfToolbox?.launchTool('html-to-pdf');
          break;
        case 'scan-to-pdf':
        case 'scan':
          this.pdfToolbox?.launchTool('scan-to-pdf');
          break;
        case 'compare-pdf':
        case 'compare':
          this.pdfToolbox?.launchTool('compare-pdf');
          break;
        case 'repair-pdf':
        case 'repair':
          this.pdfToolbox?.launchTool('repair-pdf');
          break;
        case 'protect-pdf':
        case 'protect':
          this.pdfToolbox?.launchTool('protect-pdf');
          break;
        case 'unlock-pdf':
        case 'unlock':
          this.pdfToolbox?.launchTool('unlock-pdf');
          break;
        case 'word-to-pdf':
          this.pdfToolbox?.launchTool('word-to-pdf');
          break;
        case 'powerpoint-to-pdf':
          this.pdfToolbox?.launchTool('powerpoint-to-pdf');
          break;
        case 'excel-to-pdf':
          this.pdfToolbox?.launchTool('excel-to-pdf');
          break;
        default:
          if (this.pdfToolbox) {
            this.pdfToolbox.launchTool(act);
          }
          break;
      }
    }, 400);
  }

  openPageOrganizer() {
    if (!this.documentModel?.isLoaded) {
      this.showToast('Please open a PDF document to organize pages.');
      this.fileInput?.click();
      return;
    }
    this.pageOrganizer?.open();
    if (this.drawerBackdrop && window.innerWidth <= 768) {
      this.drawerBackdrop.style.display = 'block';
    }
    this.showToast('Page Organizer opened. Drag thumbnails to reorder, or use page actions.');
  }

  handlePageChanged(current, total, pageRecord = null) {
    if (this.pageNumInput) this.pageNumInput.value = current;
    if (this.totalPagesEl) this.totalPagesEl.textContent = total;
    if (this.metaPropPages) this.metaPropPages.textContent = total;

    if (this.btnPrevPage) this.btnPrevPage.disabled = current <= 1;
    if (this.btnNextPage) this.btnNextPage.disabled = current >= total;

    this.syncCanvasDimensions();

    const pageId = pageRecord ? pageRecord.id : (this.documentModel ? this.documentModel.getPage(current - 1)?.id : null);
    this.annotationManager.setPageContext(current, this.pdfViewer.scale, this.pdfViewer.getPageSize(), pageId);
    this.pageOrganizer.setActivePage(current, pageRecord);

    if (this.textEditorManager?.isActive) {
      this.textEditorManager.renderCurrentPage();
    }

    this.securityManager?.updateSecurityStatus();
    this.updateRedactionToolbarVisibility();
  }

  // --- Phase 3 Modals & Document Operations ---
  initOrganizerModalEvents() {
    // 1. Insert Blank Page Modal
    const btnOpenInsertBlank = document.getElementById('btnInsertBlankPage');
    const btnCloseInsertBlank = document.getElementById('btnCloseInsertBlank');
    const btnCancelInsertBlank = document.getElementById('btnCancelInsertBlank');
    const btnConfirmInsertBlank = document.getElementById('btnConfirmInsertBlank');
    const posSelect = document.getElementById('insertBlankPosition');
    const sizeSelect = document.getElementById('insertBlankSize');

    const openBlankModal = () => {
      if (!this.pdfViewer.hasDocument()) {
        this.showToast('Please open a PDF document first.');
        return;
      }
      if (this.insertBlankModal) this.insertBlankModal.style.display = 'flex';
    };

    const closeBlankModal = () => {
      if (this.insertBlankModal) this.insertBlankModal.style.display = 'none';
    };

    btnOpenInsertBlank?.addEventListener('click', openBlankModal);
    btnCloseInsertBlank?.addEventListener('click', closeBlankModal);
    btnCancelInsertBlank?.addEventListener('click', closeBlankModal);

    btnConfirmInsertBlank?.addEventListener('click', () => {
      const pos = posSelect?.value || 'after';
      const sizeMode = sizeSelect?.value || 'match';

      let w = 612, h = 792;
      const curSize = this.pdfViewer.getPageSize();
      if (sizeMode === 'match') {
        w = curSize.width;
        h = curSize.height;
      } else if (sizeMode === 'a4') {
        w = 595.28;
        h = 841.89;
      } else if (sizeMode === 'letter') {
        w = 612;
        h = 792;
      }

      let insertIdx = this.pdfViewer.currentPage;
      if (pos === 'before') insertIdx = this.pdfViewer.currentPage - 1;
      else if (pos === 'start') insertIdx = 0;
      else if (pos === 'end') insertIdx = this.documentModel.getPageCount();

      const before = this.documentModel.createSnapshot();
      this.documentModel.insertBlankPage(insertIdx, { width: w, height: h });
      const after = this.documentModel.createSnapshot();

      if (this.historyManager) {
        this.historyManager.push({
          type: 'DOCUMENT_PAGES',
          documentModel: this.documentModel,
          before,
          after,
        });
      }

      closeBlankModal();
      this.pdfViewer.goToPage(insertIdx + 1);
      this.showToast(`Blank page inserted at position ${insertIdx + 1}`);
    });

    // 2. Insert Pages from another PDF
    const btnOpenInsertPdf = document.getElementById('btnInsertPdfPages');
    btnOpenInsertPdf?.addEventListener('click', () => {
      if (!this.pdfViewer.hasDocument()) {
        this.showToast('Please open a PDF document first.');
        return;
      }
      this.insertPdfFileInput?.click();
    });

    this.insertPdfFileInput?.addEventListener('change', async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;

      try {
        this.showToast(`Importing pages from ${file.name}...`);
        const buffer = await file.arrayBuffer();
        const bufferForModel = buffer.slice(0);
        const loadingTask = window.pdfjsLib.getDocument({ data: buffer });
        const importedPdfjsDoc = await loadingTask.promise;

        const docId = this.documentModel.addSourceDocument(file.name, bufferForModel, importedPdfjsDoc);
        const insertIdx = this.pdfViewer.currentPage; // Insert after current page

        const before = this.documentModel.createSnapshot();
        const importedPages = await this.documentModel.insertPagesFromDocument(insertIdx, docId);
        const after = this.documentModel.createSnapshot();

        if (this.historyManager) {
          this.historyManager.push({
            type: 'DOCUMENT_PAGES',
            documentModel: this.documentModel,
            before,
            after,
          });
        }

        this.showToast(`Inserted ${importedPages.length} page(s) from "${file.name}"`);
      } catch (err) {
        console.error('Insert PDF error:', err);
        this.showToast(`Could not insert PDF: ${err.message}`);
      }
      this.insertPdfFileInput.value = '';
    });

    // 3. Split PDF Modal
    const btnOpenSplit = document.getElementById('btnSplitPdf');
    const btnCloseSplit = document.getElementById('btnCloseSplitModal');
    const btnCancelSplit = document.getElementById('btnCancelSplit');
    const btnConfirmSplit = document.getElementById('btnConfirmSplit');
    const splitModeAll = document.getElementById('splitModeAll');
    const splitModeRanges = document.getElementById('splitModeRanges');
    const splitRangeGroup = document.getElementById('splitRangeInputGroup');
    const splitRangeInput = document.getElementById('splitRangeInput');

    const openSplitModal = () => {
      if (!this.pdfViewer.hasDocument()) {
        this.showToast('Please open a PDF document first.');
        return;
      }
      if (this.splitModal) this.splitModal.style.display = 'flex';
    };

    const closeSplitModal = () => {
      if (this.splitModal) this.splitModal.style.display = 'none';
    };

    btnOpenSplit?.addEventListener('click', openSplitModal);
    btnCloseSplit?.addEventListener('click', closeSplitModal);
    btnCancelSplit?.addEventListener('click', closeSplitModal);

    splitModeAll?.addEventListener('change', () => {
      if (splitRangeGroup) splitRangeGroup.style.display = 'none';
    });

    splitModeRanges?.addEventListener('change', () => {
      if (splitRangeGroup) splitRangeGroup.style.display = 'flex';
    });

    btnConfirmSplit?.addEventListener('click', async () => {
      const mode = splitModeRanges?.checked ? 'ranges' : 'all';
      let options = { mode };

      if (mode === 'ranges') {
        const val = splitRangeInput?.value?.trim();
        if (!val) {
          this.showToast('Please enter page ranges (e.g. 1-2, 3-4)');
          return;
        }
        const ranges = val.split(',').map((s) => s.trim()).filter(Boolean);
        options.ranges = ranges;
      }

      try {
        this.showToast('Splitting PDF document...');
        closeSplitModal();
        const results = await this.pdfExport.splitPdf(
          this.documentModel,
          this.annotationManager,
          options,
          this.documentModel.originalFilename
        );
        this.showToast(`Split complete! Generated ${results.length} PDF file(s).`);
      } catch (err) {
        console.error('Split error:', err);
        this.showToast(`Split failed: ${err.message}`);
      }
    });

    // 4. Merge PDFs Modal
    const btnOpenMerge = document.getElementById('btnMergePdfs');
    const btnCloseMerge = document.getElementById('btnCloseMergeModal');
    const btnCancelMerge = document.getElementById('btnCancelMerge');
    const btnConfirmMerge = document.getElementById('btnConfirmMerge');
    const btnBrowseMerge = document.getElementById('btnBrowseMergeFiles');
    const btnClearMerge = document.getElementById('btnClearMergeFiles');
    const mergeDropzone = document.getElementById('mergeDropzone');

    const openMergeModal = () => {
      if (this.mergeModal) this.mergeModal.style.display = 'flex';
      this.renderMergeFileList();
    };

    const closeMergeModal = () => {
      if (this.mergeModal) this.mergeModal.style.display = 'none';
    };

    btnOpenMerge?.addEventListener('click', openMergeModal);
    btnCloseMerge?.addEventListener('click', closeMergeModal);
    btnCancelMerge?.addEventListener('click', closeMergeModal);

    btnBrowseMerge?.addEventListener('click', () => this.mergeFileInput?.click());
    mergeDropzone?.addEventListener('click', (e) => {
      if (e.target !== btnBrowseMerge) this.mergeFileInput?.click();
    });

    btnClearMerge?.addEventListener('click', () => {
      this.mergeFiles = [];
      this.renderMergeFileList();
    });

    mergeDropzone?.addEventListener('dragover', (e) => {
      e.preventDefault();
      mergeDropzone.classList.add('is-drag-over');
    });

    mergeDropzone?.addEventListener('dragleave', () => {
      mergeDropzone.classList.remove('is-drag-over');
    });

    mergeDropzone?.addEventListener('drop', async (e) => {
      e.preventDefault();
      mergeDropzone.classList.remove('is-drag-over');
      const files = Array.from(e.dataTransfer.files).filter((f) => f.type === 'application/pdf' || f.name.endsWith('.pdf'));
      for (const file of files) {
        const arrayBuffer = await file.arrayBuffer();
        this.mergeFiles.push({ name: file.name, size: file.size, arrayBuffer });
      }
      this.renderMergeFileList();
    });

    this.mergeFileInput?.addEventListener('change', async (e) => {
      const files = Array.from(e.target.files || []);
      for (const file of files) {
        const arrayBuffer = await file.arrayBuffer();
        this.mergeFiles.push({ name: file.name, size: file.size, arrayBuffer });
      }
      this.mergeFileInput.value = '';
      this.renderMergeFileList();
    });

    btnConfirmMerge?.addEventListener('click', async () => {
      if (this.mergeFiles.length === 0) return;
      try {
        this.showToast('Merging PDF files locally...');
        closeMergeModal();
        const result = await this.pdfExport.mergePdfs(this.mergeFiles);
        this.showToast(`Merged ${this.mergeFiles.length} files into ${result.filename}!`);
      } catch (err) {
        console.error('Merge error:', err);
        this.showToast(`Merge failed: ${err.message}`);
      }
    });
  }

  renderMergeFileList() {
    const listEl = document.getElementById('mergeFilesList');
    const countEl = document.getElementById('mergeFileCount');
    const btnClear = document.getElementById('btnClearMergeFiles');
    const btnConfirm = document.getElementById('btnConfirmMerge');

    if (!listEl) return;

    if (countEl) countEl.textContent = `${this.mergeFiles.length}`;
    if (btnClear) btnClear.style.display = this.mergeFiles.length > 0 ? 'inline-block' : 'none';
    if (btnConfirm) btnConfirm.disabled = this.mergeFiles.length < 2;

    listEl.innerHTML = '';

    if (this.mergeFiles.length === 0) {
      listEl.innerHTML = '<div class="merge-empty-list">No files added yet. Select 2 or more PDFs to merge.</div>';
      return;
    }

    this.mergeFiles.forEach((file, idx) => {
      const row = document.createElement('div');
      row.className = 'merge-file-row';
      row.innerHTML = `
        <div class="merge-file-info">
          <span class="merge-file-name" title="${file.name}">${idx + 1}. ${file.name}</span>
          <span class="merge-file-size">(${this.formatFileSize(file.size)})</span>
        </div>
        <div class="merge-file-actions">
          <button type="button" class="btn-merge-action" data-action="up" ${idx === 0 ? 'disabled' : ''} title="Move Up">↑</button>
          <button type="button" class="btn-merge-action" data-action="down" ${idx === this.mergeFiles.length - 1 ? 'disabled' : ''} title="Move Down">↓</button>
          <button type="button" class="btn-merge-action btn-danger" data-action="remove" title="Remove">✕</button>
        </div>
      `;

      row.querySelector('[data-action="up"]')?.addEventListener('click', () => {
        if (idx > 0) {
          const temp = this.mergeFiles[idx];
          this.mergeFiles[idx] = this.mergeFiles[idx - 1];
          this.mergeFiles[idx - 1] = temp;
          this.renderMergeFileList();
        }
      });

      row.querySelector('[data-action="down"]')?.addEventListener('click', () => {
        if (idx < this.mergeFiles.length - 1) {
          const temp = this.mergeFiles[idx];
          this.mergeFiles[idx] = this.mergeFiles[idx + 1];
          this.mergeFiles[idx + 1] = temp;
          this.renderMergeFileList();
        }
      });

      row.querySelector('[data-action="remove"]')?.addEventListener('click', () => {
        this.mergeFiles.splice(idx, 1);
        this.renderMergeFileList();
      });

      listEl.appendChild(row);
    });
  }

  handleZoomChanged(scale) {
    const pct = Math.round(scale * 100);
    if (this.zoomSelect) {
      const opt = Array.from(this.zoomSelect.options).find(
        (o) => !o.hasAttribute('data-custom') && o.value === scale.toFixed(2)
      );
      let customOpt = this.zoomSelect.querySelector('option[data-custom="true"]');
      if (opt) {
        if (customOpt) customOpt.remove();
        this.zoomSelect.value = opt.value;
      } else {
        if (!customOpt) {
          customOpt = document.createElement('option');
          customOpt.setAttribute('data-custom', 'true');
          this.zoomSelect.appendChild(customOpt);
        }
        customOpt.value = scale.toFixed(2);
        customOpt.textContent = `${pct}%`;
        this.zoomSelect.value = customOpt.value;
      }
    }

    this.syncCanvasDimensions();
    this.annotationManager.setScale(scale);
    if (this.textEditorManager?.isActive) {
      this.textEditorManager.renderCurrentPage();
    }
  }

  handleToolChanged(tool) {
    if (this.toolPropTitle) this.toolPropTitle.textContent = tool.name;
    if (this.toolPropDesc) this.toolPropDesc.textContent = tool.description;

    // Viewport cursor and drawing canvas interaction routing
    const isDrawingTool = ['draw_ink', 'highlight', 'shape_rect', 'shape_circle', 'shape_line', 'annotate_text', 'redact'].includes(tool.id);

    if (this.drawingCanvas) {
      if (isDrawingTool) {
        this.drawingCanvas.classList.add('is-drawing-active');
      } else {
        this.drawingCanvas.classList.remove('is-drawing-active');
      }
    }

    if (this.textEditorManager) {
      if (tool.id === 'edit_text') {
        this.textEditorManager.setActive(true);
      } else {
        this.textEditorManager.setActive(false);
      }
    }

    const targetCursor = tool.id === 'hand' ? 'grab' : 'default';
    if (this.workspaceEl) this.workspaceEl.style.cursor = targetCursor;
    const rootWorkspace = document.getElementById('editorWorkspace');
    if (rootWorkspace) rootWorkspace.style.cursor = targetCursor;

    if (this.textLayerEl) {
      if (tool.id === 'hand') {
        this.textLayerEl.style.pointerEvents = 'none';
        this.textLayerEl.style.userSelect = 'none';
      } else {
        this.textLayerEl.style.pointerEvents = 'auto';
        this.textLayerEl.style.userSelect = 'text';
      }
    }

    if (tool.id !== 'select') {
      this.annotationManager.deselect();
    }

    // Only sync tool settings if NO annotation is currently selected
    const selected = this.annotationManager.getSelectedAnnotation();
    if (selected) {
      this.syncControlsWithSettings(selected.style || {}, selected.type);
    } else {
      this.syncControlsWithSettings(this.pdfTools.getSettings(), tool.id);
    }
  }

  handleViewerError(err) {
    console.error('PDF Viewer Encountered Error:', err);
    this.showToast('Rendering error: ' + (err.message || 'Check browser console'));
  }

  showLoading(isLoading) {
    if (this.loadingOverlay) {
      if (isLoading) {
        this.loadingOverlay.classList.add('active');
      } else {
        this.loadingOverlay.classList.remove('active');
      }
    }
  }

  toggleShortcutsModal(forceState = null) {
    if (!this.shortcutsModal) return;
    const shouldShow = forceState !== null ? forceState : this.shortcutsModal.style.display === 'none';
    this.shortcutsModal.style.display = shouldShow ? 'flex' : 'none';
  }

  updateActiveToolUI(toolId) {
    if (this.toolbarEl) {
      this.toolbarEl.querySelectorAll('.tool-btn').forEach((b) => {
        b.classList.toggle('active', b.id === `tool_${toolId}`);
      });
    }
    if (this.mobileBottomBar) {
      this.mobileBottomBar.querySelectorAll('.btn-mobile-tool').forEach((b) => {
        b.classList.toggle('active', b.dataset.tool === toolId);
      });
    }
  }

  initMobileBottomBar() {
    if (!this.mobileBottomBar) return;

    this.mobileBottomBar.querySelectorAll('.btn-mobile-tool').forEach((btn) => {
      btn.addEventListener('click', () => {
        const toolId = btn.dataset.tool;
        if (!toolId) {
          if (btn.id === 'btnMobileMoreTools') {
            const toolbox = document.getElementById('toolboxModal');
            if (toolbox) toolbox.style.display = 'flex';
          }
          return;
        }

        if (['insert_image', 'add_signature', 'stamp', 'form_field'].includes(toolId)) {
          if (!this.pdfViewer.hasDocument()) {
            this.showToast('Please open a PDF document first.', 'warning');
            return;
          }
        }

        if (toolId === 'insert_image') {
          this.imageFileInput?.click();
          return;
        }
        if (toolId === 'add_signature') {
          this.openSignatureModal();
          return;
        }

        const success = this.pdfTools.selectTool(toolId);
        if (success) {
          this.updateActiveToolUI(toolId);
        }
      });
    });
  }

  initPWA() {
    // Register Service Worker in production/HTTP environments
    if (typeof window !== 'undefined' && 'serviceWorker' in navigator && window.location.protocol.startsWith('http')) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js').then((reg) => {
          console.log('SAVY Service Worker active with scope:', reg.scope);
        }).catch((err) => {
          console.warn('SAVY Service Worker registration skipped:', err);
        });
      });
    }

    window.addEventListener('offline', () => {
      this.showToast('You are currently offline. SAVY continues working locally in your browser.', 'info', 5000);
    });

    window.addEventListener('online', () => {
      this.showToast('Connection restored. SAVY remains 100% local.', 'success', 3000);
    });
  }

  initErrorHandling() {
    const isExtensionNoise = (err, msg = '') => {
      const text = `${msg} ${err?.message || ''} ${err?.stack || ''} ${String(err || '')}`.toLowerCase();
      return (
        text.includes('translate-page') ||
        text.includes('chrome-extension://') ||
        text.includes('moz-extension://') ||
        text.includes('cannot find menu item with id') ||
        text.includes('resizeobserver loop') ||
        text.includes('the message port closed before a response was received')
      );
    };

    window.addEventListener('error', (event) => {
      if (isExtensionNoise(event.error, event.message)) {
        return;
      }
      console.error('SAVY Application Error:', event.error || event.message);
      const userMessage = event.message && !event.message.includes('Script error')
        ? `Notice: ${event.message.replace(/Uncaught (Error: )?/, '')}`
        : 'An operation could not complete. Your document is preserved safely in local memory.';
      this.showToast(userMessage, 'error', 5000);
    });

    window.addEventListener('unhandledrejection', (event) => {
      if (isExtensionNoise(event.reason, event.reason?.message)) {
        event.preventDefault?.();
        return;
      }
      console.error('SAVY Unhandled Promise Rejection:', event.reason);
      const reasonMsg = event.reason?.message || 'Operation could not complete as requested.';
      this.showToast(`Notice: ${reasonMsg}`, 'warning', 4500);
    });
  }

  showToast(message, type = 'info', duration = 3500) {
    if (!this.toastContainer) return;

    // Limit maximum concurrent toasts to prevent screen crowding
    while (this.toastContainer.children.length >= 4) {
      this.toastContainer.removeChild(this.toastContainer.firstChild);
    }

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.setAttribute('role', type === 'error' ? 'alert' : 'status');

    let iconSvg = '';
    if (type === 'success') {
      iconSvg = '<svg class="toast-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 6L9 17l-5-5"></path></svg>';
    } else if (type === 'error') {
      iconSvg = '<svg class="toast-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>';
    } else if (type === 'warning') {
      iconSvg = '<svg class="toast-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>';
    } else {
      iconSvg = '<svg class="toast-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>';
    }

    toast.innerHTML = `
      ${iconSvg}
      <span class="toast-msg">${message}</span>
      <button type="button" class="toast-close" aria-label="Dismiss notification">✕</button>
    `;

    const closeBtn = toast.querySelector('.toast-close');
    closeBtn?.addEventListener('click', () => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(12px) scale(0.96)';
      setTimeout(() => toast.remove(), 200);
    });

    this.toastContainer.appendChild(toast);

    setTimeout(() => {
      if (toast.isConnected) {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(12px) scale(0.96)';
        setTimeout(() => toast.remove(), 200);
      }
    }, duration);
  }

  formatFileSize(bytes) {
    if (!bytes || bytes === 0) return '0 KB';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }
}

// Expose global showToast helper
window.showToast = (msg, type, dur) => {
  if (window.EditorAppInstance) {
    window.EditorAppInstance.showToast(msg, type, dur);
  }
};

// Instantiate safely for both direct and module bundled execution
function initEditorApp() {
  if (!window.EditorAppInstance) {
    window.EditorAppInstance = new EditorApp();
    window.editorApp = window.EditorAppInstance;
    window.convertImagesToPdf = convertImagesToPdf;
    window.embedImageIntoPdf = embedImageIntoPdf;
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initEditorApp);
} else {
  initEditorApp();
}
