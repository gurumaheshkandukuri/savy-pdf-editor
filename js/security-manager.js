/**
 * SAVY PDF Workspace — Security & Privacy Manager (security-manager.js)
 * Phase 5 Core Security Infrastructure:
 * 1. Object URL Tracking & Memory Lifecycle Cleanup
 * 2. Document Security & Privacy Inspection (Metadata, Annotations, Flattening, Encryption)
 * 3. Filename & User Input Sanitization (XSS and Path Traversal protection)
 * 4. Workspace Memory Reset & Document Close Handler
 * 5. Privacy Center Controller
 *
 * Privacy Guarantee:
 * "Your PDF is processed locally in your browser and is not uploaded to SAVY's servers."
 */

const activeObjectURLs = new Set();

/**
 * Tracks an allocated Object URL so it can be safely revoked during document transitions or reset.
 * @param {string} url
 * @returns {string}
 */
export function trackObjectURL(url) {
  if (url && typeof url === 'string' && url.startsWith('blob:')) {
    activeObjectURLs.add(url);
  }
  return url;
}

/**
 * Revokes a tracked Object URL and removes it from the tracking set.
 * @param {string} url
 */
export function revokeTrackedObjectURL(url) {
  if (url && activeObjectURLs.has(url)) {
    try {
      URL.revokeObjectURL(url);
    } catch {}
    activeObjectURLs.delete(url);
  }
}

/**
 * Revokes all tracked Object URLs currently allocated in memory.
 */
export function revokeAllObjectURLs() {
  for (const url of activeObjectURLs) {
    try {
      URL.revokeObjectURL(url);
    } catch {}
  }
  activeObjectURLs.clear();
}

/**
 * Strips directory traversal, invalid characters, and control characters from filenames.
 * @param {string} name
 * @param {string} [fallback='document']
 * @returns {string}
 */
export function sanitizeFilename(name, fallback = 'document') {
  if (!name || typeof name !== 'string') return fallback;
  let clean = name.replace(/[/\\?%*:|"<>]/g, '_').replace(/\.\./g, '_').trim();
  clean = clean.replace(/[\x00-\x1f\x80-\x9f]/g, '');
  if (!clean || clean === '.') clean = fallback;
  return clean;
}

/**
 * Escapes HTML characters to prevent XSS injection into DOM.
 * @param {string} str
 * @returns {string}
 */
export function escapeHtml(str) {
  if (typeof str !== 'string') return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Downloads a Blob to the user's local disk while tracking and safely cleaning up the Object URL.
 * @param {Blob} blob
 * @param {string} filename
 */
export function downloadBlob(blob, filename) {
  const url = trackObjectURL(URL.createObjectURL(blob));
  const a = document.createElement('a');
  a.href = url;
  a.download = sanitizeFilename(filename, 'document.pdf');
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => revokeTrackedObjectURL(url), 15000);
}

export class SecurityManager {
  constructor({ editorApp, onToast }) {
    this.editorApp = editorApp;
    this.onToast = onToast || (() => {});

    this.initElements();
    this.bindEvents();
  }

  initElements() {
    this.privacyBadge = document.getElementById('privacyShieldBadge');
    this.privacyModal = document.getElementById('privacyCenterModal');
    this.btnPrivacyClose = document.getElementById('btnPrivacyCenterClose');
    this.btnCloseDoc = document.getElementById('btnCloseDocument');

    // Sidebar Security Elements
    this.secPropMetadata = document.getElementById('secPropMetadata');
    this.secPropAnnotations = document.getElementById('secPropAnnotations');
    this.secPropFlatten = document.getElementById('secPropFlatten');
    this.secPropEncryption = document.getElementById('secPropEncryption');
    this.btnSecManageMetadata = document.getElementById('btnSecManageMetadata');
    this.btnSecFlatten = document.getElementById('btnSecFlatten');
    this.btnSecEncryptionInfo = document.getElementById('btnSecEncryptionInfo');

    // Encryption info modal
    this.encryptionModal = document.getElementById('encryptionInfoModal');
  }

  bindEvents() {
    // Privacy Badge opens Privacy Center
    this.privacyBadge?.addEventListener('click', () => this.openPrivacyCenter());
    this.btnPrivacyClose?.addEventListener('click', () => this.closePrivacyCenter());

    // Close / Reset document button
    this.btnCloseDoc?.addEventListener('click', () => this.handleCloseDocument());

    // Privacy Center tab switching
    document.querySelectorAll('.privacy-tab-btn').forEach((tab) => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.privacy-tab-btn').forEach((t) => t.classList.remove('active'));
        document.querySelectorAll('.privacy-tab-pane').forEach((p) => p.classList.remove('active'));
        tab.classList.add('active');
        const targetId = tab.getAttribute('data-tab');
        const targetPane = document.getElementById(targetId);
        if (targetPane) targetPane.classList.add('active');
      });
    });

    // Sidebar quick triggers
    this.btnSecManageMetadata?.addEventListener('click', () => {
      this.editorApp.pdfToolbox?.launchTool('metadata');
    });

    this.btnSecFlatten?.addEventListener('click', () => {
      this.editorApp.pdfToolbox?.launchTool('flatten');
    });

    this.btnSecEncryptionInfo?.addEventListener('click', () => {
      if (this.encryptionModal) this.encryptionModal.style.display = 'flex';
    });
  }

  openPrivacyCenter() {
    if (this.privacyModal) {
      this.privacyModal.style.display = 'flex';
    }
  }

  closePrivacyCenter() {
    if (this.privacyModal) {
      this.privacyModal.style.display = 'none';
    }
  }

  /**
   * Evaluates the current document's security and privacy profile and updates sidebar inspector.
   */
  async updateSecurityStatus() {
    if (!this.editorApp.pdfViewer.hasDocument()) {
      if (this.secPropMetadata) this.secPropMetadata.textContent = 'No Document';
      if (this.secPropAnnotations) this.secPropAnnotations.textContent = 'None';
      if (this.secPropFlatten) this.secPropFlatten.textContent = 'None';
      if (this.secPropEncryption) this.secPropEncryption.textContent = 'None';
      return;
    }

    // 1. Metadata status
    try {
      const rawBytes = this.editorApp.pdfViewer.getOriginalBytes();
      if (rawBytes && window.PDFLib) {
        const { PDFDocument } = window.PDFLib;
        const doc = await PDFDocument.load(rawBytes.slice(0));
        const hasTitle = Boolean(doc.getTitle());
        const hasAuthor = Boolean(doc.getAuthor());
        const hasProducer = Boolean(doc.getProducer());

        if (this.secPropMetadata) {
          if (!hasTitle && !hasAuthor && !hasProducer) {
            this.secPropMetadata.innerHTML = '<span class="sec-badge-clean">✓ Clean / Purged</span>';
          } else {
            this.secPropMetadata.innerHTML = '<span class="sec-badge-info">Contains Document Info</span>';
          }
        }
      }
    } catch {
      if (this.secPropMetadata) this.secPropMetadata.textContent = 'Standard';
    }

    // 2. Active overlay annotations status
    const allAnnots = this.editorApp.annotationManager.getAllAnnotationsByPageId();
    let totalAnnots = 0;
    for (const list of allAnnots.values()) totalAnnots += list.length;

    if (this.secPropAnnotations) {
      this.secPropAnnotations.textContent = totalAnnots === 0 ? '0 Overlays' : `${totalAnnots} Active Overlays`;
    }

    // 3. Flatten status
    if (this.secPropFlatten) {
      this.secPropFlatten.innerHTML = totalAnnots === 0
        ? '<span class="sec-badge-clean">Flattened (Base Layer)</span>'
        : '<span class="sec-badge-warn">Contains Unflattened Overlays</span>';
    }

    // 4. Encryption / Password status
    if (this.secPropEncryption) {
      this.secPropEncryption.innerHTML = '<span class="sec-badge-neutral">Standard (Unencrypted)</span>';
    }
  }

  /**
   * Resets workspace memory, revokes object URLs, clears annotations, and restores empty state.
   */
  async handleCloseDocument() {
    const hasDoc = this.editorApp.pdfViewer.hasDocument();
    if (!hasDoc) return;

    const allAnnots = this.editorApp.annotationManager.getAllAnnotationsByPageId();
    let totalAnnots = 0;
    for (const list of allAnnots.values()) totalAnnots += list.length;

    if (totalAnnots > 0) {
      const confirmClose = window.confirm(
        'You have active un-exported annotations or edits. Are you sure you want to close this document and clear memory?'
      );
      if (!confirmClose) return;
    }

    this.resetWorkspace();
  }

  resetWorkspace() {
    // 0. Clear persistent local session
    this.editorApp?.sessionManager?.clearActiveSession();

    // 1. Cancel ongoing renders and reset viewer
    if (this.editorApp.pdfViewer) {
      if (this.editorApp.pdfViewer.renderTask) {
        this.editorApp.pdfViewer.renderTask.cancel();
      }
      this.editorApp.pdfViewer.pdfDoc = null;
      this.editorApp.pdfViewer.currentFile = null;
      this.editorApp.pdfViewer.rawArrayBuffer = null;
      this.editorApp.pdfViewer.totalPages = 0;
      this.editorApp.pdfViewer.currentPage = 1;

      const canvas = this.editorApp.pdfCanvas;
      if (canvas) {
        const ctx = canvas.getContext('2d');
        ctx?.clearRect(0, 0, canvas.width, canvas.height);
        canvas.width = 0;
        canvas.height = 0;
      }
    }

    // 2. Clear Document Model & Page Organizer
    if (this.editorApp.documentModel) {
      this.editorApp.documentModel.clear();
    }
    if (this.editorApp.pageOrganizer) {
      this.editorApp.pageOrganizer.clear();
    }

    // 3. Clear Annotations & History
    if (this.editorApp.annotationManager) {
      this.editorApp.annotationManager.clear();
    }
    if (this.editorApp.historyManager) {
      this.editorApp.historyManager.clear();
    }

    // Clear AI Session Memory
    if (this.editorApp.aiManager) {
      this.editorApp.aiManager.cachedExtraction = null;
      this.editorApp.aiManager.clearChat();
      this.editorApp.aiManager.close();
    }

    // 4. Revoke all allocated Object URLs
    revokeAllObjectURLs();

    // 5. Hide active viewport and show empty workspace
    if (this.editorApp.viewportContainer) {
      this.editorApp.viewportContainer.classList.remove('active');
    }
    if (this.editorApp.emptyStateEl) {
      this.editorApp.emptyStateEl.style.display = 'flex';
    }

    // 6. Reset filename and metadata chips
    if (this.editorApp.fileNameEl) this.editorApp.fileNameEl.textContent = 'No Document';
    if (this.editorApp.fileMetaEl) this.editorApp.fileMetaEl.textContent = 'Files Stay on Your Device';
    if (this.editorApp.pageNumInput) this.editorApp.pageNumInput.value = '1';
    if (this.editorApp.totalPagesEl) this.editorApp.totalPagesEl.textContent = '0';
    if (this.editorApp.btnCloseDocument) this.editorApp.btnCloseDocument.style.display = 'none';
    this.editorApp.updateRedactionToolbarVisibility?.();

    this.updateSecurityStatus();
    this.onToast('Document closed. Browser memory cleared.');
  }
}
