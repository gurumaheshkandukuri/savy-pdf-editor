/**
 * SAVY PDF Workspace — Editor Application Controller (editor.js)
 * Coordinates the multi-panel editor interface, binds PDFViewer, PDFTools, and PDFExport,
 * and maintains local client-side state.
 */

import { PDFViewer } from './pdf-viewer.js';
import { PDFTools } from './pdf-tools.js';
import { PDFExport } from './export.js';

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
    this.btnExport = document.getElementById('btnExport');
    this.fileInput = document.getElementById('fileInputHidden');

    // Toolbar & Panels
    this.toolbarEl = document.getElementById('editorToolbar');
    this.sidebarEl = document.getElementById('editorSidebar');

    // Workspace & Canvas
    this.workspaceEl = document.getElementById('editorWorkspace');
    this.emptyStateEl = document.getElementById('workspaceEmptyState');
    this.viewportContainer = document.getElementById('pdfViewportContainer');
    this.pdfCanvas = document.getElementById('pdfCanvas');
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

    // Toast container
    this.toastContainer = document.getElementById('toastContainer');
  }

  initModules() {
    // 1. Initialize Export Manager
    this.pdfExport = new PDFExport({
      onExportBlocked: (info) => {
        this.showToast(`${info.title}: ${info.message}`);
      },
    });

    // 2. Initialize Tools Registry
    this.pdfTools = new PDFTools({
      onToolChange: (tool) => {
        this.handleToolChanged(tool);
      },
      onPhase2Notice: (tool) => {
        this.showToast(
          `"${tool.name}" is scheduled for Phase 2. In Phase 1, tools operate in viewing mode.`
        );
      },
    });

    // Render Toolbar icons
    this.renderToolbar();

    // 3. Initialize PDF.js Viewer
    this.pdfViewer = new PDFViewer({
      canvas: this.pdfCanvas,
      viewportContainer: this.workspaceEl,
      onDocumentLoaded: (meta) => this.handleDocumentLoaded(meta),
      onPageChange: (current, total) => this.handlePageChanged(current, total),
      onZoomChange: (scale) => this.handleZoomChanged(scale),
      onError: (err) => this.handleViewerError(err),
    });
  }

  renderToolbar() {
    this.toolbarEl.innerHTML = '';
    const tools = this.pdfTools.getTools();

    // Group 1: Viewing/Active tools (Phase 1)
    const activeGroup = document.createElement('div');
    activeGroup.className = 'toolbar-group';

    // Group 2: Phase 2 tools
    const phase2Group = document.createElement('div');
    phase2Group.className = 'toolbar-group';

    tools.forEach((tool) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `tool-btn ${tool.phase === 2 ? 'phase-2-tool' : ''} ${
        tool.id === 'select' ? 'active' : ''
      }`;
      btn.id = `tool_${tool.id}`;
      btn.setAttribute(
        'data-tooltip',
        tool.phase === 2
          ? `${tool.name} (Phase 2)`
          : `${tool.name} (${tool.shortcut})`
      );
      btn.setAttribute('aria-label', tool.name);

      btn.innerHTML = `
        <img src="${tool.icon}" alt="" />
        ${tool.phase === 2 ? '<span class="phase-badge"></span>' : ''}
      `;

      btn.addEventListener('click', () => {
        const success = this.pdfTools.selectTool(tool.id);
        if (success) {
          this.toolbarEl.querySelectorAll('.tool-btn').forEach((b) => b.classList.remove('active'));
          btn.classList.add('active');
        }
      });

      if (tool.phase === 1) {
        activeGroup.appendChild(btn);
      } else {
        phase2Group.appendChild(btn);
      }
    });

    const divider = document.createElement('div');
    divider.className = 'toolbar-divider';

    this.toolbarEl.appendChild(activeGroup);
    this.toolbarEl.appendChild(divider);
    this.toolbarEl.appendChild(phase2Group);
  }

  bindEvents() {
    // Open file triggers
    this.btnOpenFile?.addEventListener('click', () => this.fileInput?.click());
    this.btnEmptyBrowse?.addEventListener('click', () => this.fileInput?.click());

    // File input selection
    this.fileInput?.addEventListener('change', (e) => {
      const file = e.target.files?.[0];
      if (file) {
        this.loadFile(file);
      }
      this.fileInput.value = '';
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
      this.pdfExport.requestExport(this.pdfViewer.getMetadata());
    });

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
      // Don't intercept when user is typing in an input
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) {
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'o') {
        e.preventDefault();
        this.fileInput?.click();
      }

      if (e.key === 'ArrowRight' || e.key === 'PageDown') {
        e.preventDefault();
        this.pdfViewer.nextPage();
      }

      if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
        e.preventDefault();
        this.pdfViewer.prevPage();
      }

      if (e.key === '+' || e.key === '=') {
        e.preventDefault();
        this.pdfViewer.zoomIn();
      }

      if (e.key === '-') {
        e.preventDefault();
        this.pdfViewer.zoomOut();
      }
    });
  }

  async checkInitialPayload() {
    const payload = await getPendingDocument();
    if (payload && payload.file) {
      this.loadFile(payload.file, payload.name);
    }
  }

  async loadFile(file, name) {
    try {
      this.showLoading(true);
      await this.pdfViewer.loadDocument(file, name || file.name);
      this.showLoading(false);
    } catch (err) {
      this.showLoading(false);
      this.showToast('Could not load PDF: ' + (err.message || 'Unknown error'));
    }
  }

  handleDocumentLoaded(meta) {
    // Hide empty state, show canvas viewport
    if (this.emptyStateEl) this.emptyStateEl.style.display = 'none';
    if (this.viewportContainer) this.viewportContainer.classList.add('active');

    // Update Header
    if (this.fileNameEl) this.fileNameEl.textContent = meta.name;
    const formattedSize = this.formatFileSize(meta.size);
    if (this.fileMetaEl) {
      this.fileMetaEl.textContent = `${meta.pages} ${meta.pages === 1 ? 'page' : 'pages'} • ${formattedSize}`;
    }

    // Enable navigation controls
    if (this.pageNumInput) {
      this.pageNumInput.value = '1';
      this.pageNumInput.max = meta.pages;
    }
    if (this.totalPagesEl) {
      this.totalPagesEl.textContent = meta.pages;
    }

    // Update Sidebar Properties
    if (this.metaPropName) this.metaPropName.textContent = meta.name;
    if (this.metaPropSize) this.metaPropSize.textContent = formattedSize;
    if (this.metaPropPages) this.metaPropPages.textContent = meta.pages;
    if (this.metaPropVersion) this.metaPropVersion.textContent = `PDF ${meta.version}`;
  }

  handlePageChanged(current, total) {
    if (this.pageNumInput) this.pageNumInput.value = current;
    if (this.totalPagesEl) this.totalPagesEl.textContent = total;
    if (this.btnPrevPage) this.btnPrevPage.disabled = current <= 1;
    if (this.btnNextPage) this.btnNextPage.disabled = current >= total;
  }

  handleZoomChanged(scale) {
    const pct = Math.round(scale * 100);
    if (this.zoomSelect) {
      // Find matching standard option or set closest
      const opt = Array.from(this.zoomSelect.options).find((o) => o.value === scale.toFixed(2));
      if (opt) {
        this.zoomSelect.value = opt.value;
      }
    }
  }

  handleToolChanged(tool) {
    if (this.toolPropTitle) this.toolPropTitle.textContent = tool.name;
    if (this.toolPropDesc) this.toolPropDesc.textContent = tool.description;

    // Adjust workspace cursor
    if (tool.id === 'hand') {
      this.workspaceEl.style.cursor = 'grab';
    } else {
      this.workspaceEl.style.cursor = 'default';
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

  showToast(message) {
    if (!this.toastContainer) return;
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.innerHTML = `
      <img src="/assets/icons/info.svg" width="16" height="16" alt="" />
      <span>${message}</span>
    `;
    this.toastContainer.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transition = 'opacity 0.25s ease';
      setTimeout(() => toast.remove(), 250);
    }, 3800);
  }

  formatFileSize(bytes) {
    if (!bytes || bytes === 0) return '0 KB';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }
}

// Instantiate on DOM ready
document.addEventListener('DOMContentLoaded', () => {
  new EditorApp();
});
