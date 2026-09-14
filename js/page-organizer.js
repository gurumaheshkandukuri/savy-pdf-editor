/**
 * SAVY PDF Workspace — Page Organizer & Thumbnail Manager (page-organizer.js)
 * Manages the thumbnail sidebar, selection, drag-and-drop reordering,
 * page transformations (rotation, duplication, deletion, blank pages),
 * extract, split, and merge workflows.
 *
 * Privacy Guarantee: 100% in-browser processing. Zero cloud uploads.
 */

export class PageOrganizer {
  constructor({
    panelEl,
    thumbnailContainerEl,
    documentModel,
    annotationManager,
    pdfViewer,
    pdfExport,
    historyManager,
    onToast,
  }) {
    this.panelEl = panelEl;
    this.containerEl = thumbnailContainerEl;
    this.documentModel = documentModel;
    this.annotationManager = annotationManager;
    this.pdfViewer = pdfViewer;
    this.pdfExport = pdfExport;
    this.historyManager = historyManager;
    this.onToast = onToast || ((msg) => console.log(msg));

    this.selectedPageIds = new Set();
    this.activePageId = null;
    this.draggedPageId = null;
    this.dragOverPageId = null;

    // Thumbnail cache: pageId -> HTMLCanvasElement | ImageBitmap
    this.thumbnailCache = new Map();

    this.isOpen = true;

    this.init();
  }

  init() {
    this.bindDomEvents();

    if (this.documentModel) {
      this.documentModel.on('change', () => {
        this.renderThumbnails();
      });
    }
  }

  setDocumentModel(model) {
    this.documentModel = model;
    this.documentModel.on('change', () => {
      this.renderThumbnails();
    });
    this.selectedPageIds.clear();
    this.renderThumbnails();
  }

  open() {
    this.isOpen = true;
    if (this.panelEl) {
      this.panelEl.classList.add('is-open');
      this.panelEl.style.display = 'flex';
    }
    if (this.documentModel && this.documentModel.getPageCount() > 0) {
      if (!this.containerEl || this.containerEl.children.length === 0) {
        this.renderThumbnails();
      }
      this.updateActiveThumbnailHighlight();
    }
  }

  close() {
    this.isOpen = false;
    if (this.panelEl) {
      this.panelEl.classList.remove('is-open');
      this.panelEl.style.display = 'none';
    }
  }

  getSelectedPages() {
    if (!this.documentModel) return [];
    return Array.from(this.selectedPageIds)
      .map((id) => this.documentModel.getPageById(id))
      .filter(Boolean);
  }

  togglePanel(forceState = null) {
    const targetState = forceState !== null ? forceState : !this.isOpen;
    if (targetState) {
      this.open();
    } else {
      this.close();
    }
  }

  setActivePage(pageNum, pageRecord = null) {
    if (pageRecord) {
      this.activePageId = pageRecord.id;
    } else if (this.documentModel) {
      const p = this.documentModel.getPage(pageNum - 1);
      this.activePageId = p ? p.id : null;
    }

    this.updateActiveThumbnailHighlight();
  }

  updateActiveThumbnailHighlight() {
    if (!this.containerEl) return;
    const cards = this.containerEl.querySelectorAll('.thumbnail-card');
    cards.forEach((card) => {
      const cardId = card.dataset.pageId;
      const isActive = cardId === this.activePageId;
      card.classList.toggle('is-active-page', isActive);
      if (isActive) {
        card.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }
    });
  }

  /**
   * Render all thumbnails based on the current documentModel state
   */
  async renderThumbnails() {
    if (!this.containerEl || !this.documentModel) return;

    const pages = this.documentModel.getPages();
    const totalPages = pages.length;

    // Update count badge
    const badge = document.getElementById('organizerPageCountBadge');
    if (badge) badge.textContent = `${totalPages}`;

    // Clean up selected IDs that no longer exist
    const currentIds = new Set(pages.map((p) => p.id));
    for (const id of this.selectedPageIds) {
      if (!currentIds.has(id)) {
        this.selectedPageIds.delete(id);
      }
    }

    this.updateSelectionToolbar();

    // Disconnect any existing observer
    if (this.thumbnailObserver) {
      this.thumbnailObserver.disconnect();
      this.thumbnailObserver = null;
    }

    this.containerEl.innerHTML = '';

    if (totalPages === 0) {
      this.containerEl.innerHTML = `
        <div class="organizer-empty-state">
          <p>No pages in document</p>
        </div>
      `;
      return;
    }

    // Configure IntersectionObserver for on-demand lazy rendering of thumbnails
    const useIntersection = typeof window !== 'undefined' && 'IntersectionObserver' in window;
    if (useIntersection) {
      this.thumbnailObserver = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              const card = entry.target;
              if (card.dataset.rendered !== 'true') {
                card.dataset.rendered = 'true';
                const pageId = card.dataset.pageId;
                const pageRec = this.documentModel?.getPageById(pageId);
                const canvas = card.querySelector('.thumbnail-canvas');
                if (canvas && pageRec) {
                  this.renderThumbnailCanvas(canvas, pageRec);
                }
              }
              this.thumbnailObserver?.unobserve(card);
            }
          });
        },
        {
          root: this.containerEl,
          rootMargin: '160px 0px',
        }
      );
    }

    // Render cards using DocumentFragment for atomic DOM insertion
    const fragment = document.createDocumentFragment();
    for (let idx = 0; idx < pages.length; idx++) {
      const pageRecord = pages[idx];
      const pageNum = idx + 1;
      const card = this.createThumbnailCard(pageRecord, pageNum);
      fragment.appendChild(card);

      // Eagerly render first 4 pages for instant initial view; lazy load the rest
      if (idx < 4) {
        card.dataset.rendered = 'true';
        this.renderThumbnailCanvas(card.querySelector('canvas'), pageRecord);
      } else if (this.thumbnailObserver) {
        this.thumbnailObserver.observe(card);
      } else {
        card.dataset.rendered = 'true';
        this.renderThumbnailCanvas(card.querySelector('canvas'), pageRecord);
      }
    }
    this.containerEl.appendChild(fragment);

    this.updateActiveThumbnailHighlight();
  }

  createThumbnailCard(pageRecord, pageNum) {
    const card = document.createElement('div');
    card.className = 'thumbnail-card';
    card.dataset.pageId = pageRecord.id;
    card.dataset.pageIndex = pageNum - 1;
    card.draggable = true;

    const isSelected = this.selectedPageIds.has(pageRecord.id);
    if (isSelected) card.classList.add('is-selected');

    // Dimension / Orientation label
    const isLandscape = (pageRecord.rotation === 90 || pageRecord.rotation === 270)
      ? pageRecord.height > pageRecord.width
      : pageRecord.width > pageRecord.height;
    const orientLabel = isLandscape ? 'Landscape' : 'Portrait';
    const dimLabel = `${Math.round(pageRecord.width)}×${Math.round(pageRecord.height)} pt • ${orientLabel}`;

    card.innerHTML = `
      <div class="thumbnail-header">
        <label class="thumbnail-checkbox-wrap" title="Select page">
          <input type="checkbox" class="thumbnail-checkbox" ${isSelected ? 'checked' : ''} />
          <span class="custom-checkbox"></span>
        </label>
        <span class="thumbnail-page-num">Page ${pageNum}</span>
        <span class="thumbnail-drag-handle" title="Drag to reorder">⋮⋮</span>
      </div>
      <div class="thumbnail-preview-box">
        <canvas class="thumbnail-canvas" width="120" height="155"></canvas>
        ${pageRecord.rotation ? `<span class="thumbnail-rotation-badge">${pageRecord.rotation}°</span>` : ''}
        ${pageRecord.isBlank ? `<span class="thumbnail-blank-badge">Blank</span>` : ''}
      </div>
      <div class="thumbnail-footer">
        <span class="thumbnail-dims">${dimLabel}</span>
      </div>
      <div class="thumbnail-hover-actions">
        <button type="button" class="btn-thumb-action" data-action="rotate-cw" title="Rotate Clockwise 90°">⟳</button>
        <button type="button" class="btn-thumb-action" data-action="duplicate" title="Duplicate Page">⎘</button>
        <button type="button" class="btn-thumb-action btn-thumb-danger" data-action="delete" title="Delete Page">🗑</button>
      </div>
    `;

    // --- Card Click & Selection Events ---
    const checkbox = card.querySelector('.thumbnail-checkbox');
    checkbox.addEventListener('change', (e) => {
      e.stopPropagation();
      this.togglePageSelection(pageRecord.id, checkbox.checked);
    });

    card.addEventListener('click', (e) => {
      // Ignore clicks on action buttons
      if (e.target.closest('.thumbnail-hover-actions') || e.target.closest('.thumbnail-checkbox-wrap')) {
        return;
      }

      if (e.shiftKey || e.ctrlKey || e.metaKey) {
        this.togglePageSelection(pageRecord.id, !this.selectedPageIds.has(pageRecord.id));
      } else {
        // Navigate main viewer to this page
        const targetPage = pageNum;
        this.pdfViewer.goToPage(targetPage);
        this.setActivePage(targetPage, pageRecord);
      }
    });

    // --- Hover Action Buttons ---
    card.querySelectorAll('.btn-thumb-action').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const action = btn.dataset.action;
        this.handleCardAction(action, pageRecord.id);
      });
    });

    // --- Drag and Drop Reordering Events ---
    card.addEventListener('dragstart', (e) => {
      this.draggedPageId = pageRecord.id;
      card.classList.add('is-dragging');
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', pageRecord.id);
    });

    card.addEventListener('dragend', () => {
      card.classList.remove('is-dragging');
      this.draggedPageId = null;
      this.clearDragOverStyles();
    });

    card.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      if (this.draggedPageId && this.draggedPageId !== pageRecord.id) {
        card.classList.add('is-drag-over');
      }
    });

    card.addEventListener('dragleave', () => {
      card.classList.remove('is-drag-over');
    });

    card.addEventListener('drop', (e) => {
      e.preventDefault();
      card.classList.remove('is-drag-over');
      if (this.draggedPageId && this.draggedPageId !== pageRecord.id) {
        const fromIdx = this.documentModel.getPageIndexById(this.draggedPageId);
        const toIdx = this.documentModel.getPageIndexById(pageRecord.id);

        if (fromIdx !== -1 && toIdx !== -1 && fromIdx !== toIdx) {
          const snapshotBefore = this.documentModel.createSnapshot();
          this.documentModel.reorderPage(fromIdx, toIdx);
          const snapshotAfter = this.documentModel.createSnapshot();

          if (this.historyManager) {
            this.historyManager.push({
              type: 'DOCUMENT_PAGES',
              documentModel: this.documentModel,
              before: snapshotBefore,
              after: snapshotAfter,
            });
          }

          this.onToast(`Page ${fromIdx + 1} moved to position ${toIdx + 1}`);
        }
      }
    });

    return card;
  }

  clearDragOverStyles() {
    if (this.containerEl) {
      this.containerEl.querySelectorAll('.thumbnail-card').forEach((c) => {
        c.classList.remove('is-drag-over');
      });
    }
  }

  /**
   * Render miniature canvas preview using PDF.js
   */
  async renderThumbnailCanvas(canvas, pageRecord) {
    if (!canvas || !pageRecord) return;
    const ctx = canvas.getContext('2d');

    const cacheKey = `${pageRecord.id}_rot${pageRecord.rotation || 0}_${Math.round(pageRecord.width)}x${Math.round(pageRecord.height)}`;
    if (this.thumbnailCache.has(cacheKey)) {
      const cached = this.thumbnailCache.get(cacheKey);
      canvas.width = cached.width;
      canvas.height = cached.height;
      ctx.drawImage(cached, 0, 0);
      return;
    }

    if (pageRecord.isBlank) {
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.strokeStyle = '#E2E8F0';
      ctx.strokeRect(0, 0, canvas.width, canvas.height);
      return;
    }

    try {
      const srcObj = this.documentModel.getSourceDoc(pageRecord.docId);
      if (!srcObj || !srcObj.pdfjsDoc) return;

      const page = await srcObj.pdfjsDoc.getPage(pageRecord.sourceIndex + 1);
      const userRotation = pageRecord.rotation || 0;
      const totalRotation = ((page.rotate || 0) + userRotation) % 360;

      const unscaledViewport = page.getViewport({ scale: 1.0, rotation: totalRotation });

      const scale = Math.min(120 / unscaledViewport.width, 155 / unscaledViewport.height);
      const viewport = page.getViewport({ scale, rotation: totalRotation });

      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);

      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      await page.render({
        canvasContext: ctx,
        viewport,
      }).promise;

      // Cache the rendered thumbnail for instantaneous re-display
      try {
        const offscreen = document.createElement('canvas');
        offscreen.width = canvas.width;
        offscreen.height = canvas.height;
        const offCtx = offscreen.getContext('2d');
        offCtx.drawImage(canvas, 0, 0);
        this.thumbnailCache.set(cacheKey, offscreen);
      } catch {
        // Ignore cache creation error
      }
    } catch (err) {
      // Graceful fallback for cancelled renders
      ctx.fillStyle = '#F8FAFC';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
  }

  // --- Selection Management ---
  togglePageSelection(pageId, isSelected) {
    if (isSelected) {
      this.selectedPageIds.add(pageId);
    } else {
      this.selectedPageIds.delete(pageId);
    }

    const card = this.containerEl.querySelector(`[data-page-id="${pageId}"]`);
    if (card) {
      card.classList.toggle('is-selected', isSelected);
      const cb = card.querySelector('.thumbnail-checkbox');
      if (cb) cb.checked = isSelected;
    }

    this.updateSelectionToolbar();
  }

  selectAllPages() {
    const pages = this.documentModel.getPages();
    pages.forEach((p) => this.selectedPageIds.add(p.id));

    if (this.containerEl) {
      this.containerEl.querySelectorAll('.thumbnail-card').forEach((card) => {
        card.classList.add('is-selected');
        const cb = card.querySelector('.thumbnail-checkbox');
        if (cb) cb.checked = true;
      });
    }

    this.updateSelectionToolbar();
  }

  clearSelection() {
    this.selectedPageIds.clear();

    if (this.containerEl) {
      this.containerEl.querySelectorAll('.thumbnail-card').forEach((card) => {
        card.classList.remove('is-selected');
        const cb = card.querySelector('.thumbnail-checkbox');
        if (cb) cb.checked = false;
      });
    }

    this.updateSelectionToolbar();
  }

  updateSelectionToolbar() {
    const count = this.selectedPageIds.size;
    const total = this.documentModel ? this.documentModel.getPageCount() : 0;

    const textEl = document.getElementById('organizerSelectionText');
    if (textEl) {
      textEl.textContent = count === 0 ? '0 selected' : `${count} of ${total} selected`;
    }

    const hasSelection = count > 0;
    const canMove = count === 1;

    // Toggle button disabled states
    const setDisabled = (id, disabled) => {
      const btn = document.getElementById(id);
      if (btn) btn.disabled = disabled;
    };

    setDisabled('btnMovePageUp', !canMove);
    setDisabled('btnMovePageDown', !canMove);
    setDisabled('btnRotatePageLeft', !hasSelection);
    setDisabled('btnRotatePageRight', !hasSelection);
    setDisabled('btnDuplicatePages', !hasSelection);
    setDisabled('btnDeletePages', !hasSelection);
    setDisabled('btnExtractPages', !hasSelection);
  }

  // --- Page Operations Executed from UI ---
  handleCardAction(action, pageId) {
    switch (action) {
      case 'rotate-cw':
        this.rotatePages([pageId], 90);
        break;
      case 'duplicate':
        this.duplicatePages([pageId]);
        break;
      case 'delete':
        this.confirmAndDeletePages([pageId]);
        break;
    }
  }

  moveSelectedUp() {
    if (this.selectedPageIds.size !== 1) return;
    const pageId = Array.from(this.selectedPageIds)[0];
    const idx = this.documentModel.getPageIndexById(pageId);
    if (idx > 0) {
      const before = this.documentModel.createSnapshot();
      this.documentModel.movePage(idx, -1);
      const after = this.documentModel.createSnapshot();
      this.recordDocHistory(before, after);
    }
  }

  moveSelectedDown() {
    if (this.selectedPageIds.size !== 1) return;
    const pageId = Array.from(this.selectedPageIds)[0];
    const idx = this.documentModel.getPageIndexById(pageId);
    if (idx < this.documentModel.getPageCount() - 1) {
      const before = this.documentModel.createSnapshot();
      this.documentModel.movePage(idx, 1);
      const after = this.documentModel.createSnapshot();
      this.recordDocHistory(before, after);
    }
  }

  rotatePages(targetIds, degreesDelta) {
    const targets = targetIds && targetIds.length > 0 ? targetIds : Array.from(this.selectedPageIds);
    if (targets.length === 0) return;

    const before = this.documentModel.createSnapshot();
    this.documentModel.rotatePages(targets, degreesDelta);
    const after = this.documentModel.createSnapshot();
    this.recordDocHistory(before, after);

    // Re-render main viewer if active page was rotated
    if (this.activePageId && targets.includes(this.activePageId)) {
      this.pdfViewer.renderPage(this.pdfViewer.currentPage);
    }

    this.onToast(`Rotated ${targets.length} page(s) ${degreesDelta > 0 ? 'clockwise' : 'counterclockwise'}`);
  }

  duplicatePages(targetIds) {
    const targets = targetIds && targetIds.length > 0 ? targetIds : Array.from(this.selectedPageIds);
    if (targets.length === 0) return;

    const before = this.documentModel.createSnapshot();
    const duplications = this.documentModel.duplicatePages(targets);

    // Clone Phase 2 annotations for the duplicated pages
    if (this.annotationManager) {
      for (const { originalId, newPage } of duplications) {
        this.annotationManager.cloneAnnotations(originalId, newPage.id);
      }
    }

    const after = this.documentModel.createSnapshot();
    this.recordDocHistory(before, after);

    this.onToast(`Duplicated ${duplications.length} page(s)`);
  }

  confirmAndDeletePages(targetIds) {
    const targets = targetIds && targetIds.length > 0 ? targetIds : Array.from(this.selectedPageIds);
    if (targets.length === 0) return;

    const totalPages = this.documentModel.getPageCount();
    if (targets.length >= totalPages) {
      this.onToast('Cannot delete all pages. The document must contain at least one page.');
      return;
    }

    if (targets.length > 1) {
      const confirmed = window.confirm(`Are you sure you want to delete ${targets.length} pages?`);
      if (!confirmed) return;
    }

    const before = this.documentModel.createSnapshot();
    this.documentModel.deletePages(targets);

    // Clean up annotations
    if (this.annotationManager) {
      for (const id of targets) {
        this.annotationManager.deleteAnnotationsForPage(id);
      }
    }

    const after = this.documentModel.createSnapshot();
    this.recordDocHistory(before, after);

    // Clear selection
    targets.forEach((id) => this.selectedPageIds.delete(id));
    this.updateSelectionToolbar();

    // Adjust main viewer page number if needed
    const newTotal = this.documentModel.getPageCount();
    const currentViewerPage = Math.min(this.pdfViewer.currentPage, newTotal);
    this.pdfViewer.goToPage(currentViewerPage);

    this.onToast(`Deleted ${targets.length} page(s)`);
  }

  reversePages() {
    const before = this.documentModel.createSnapshot();
    this.documentModel.reversePages();
    const after = this.documentModel.createSnapshot();
    this.recordDocHistory(before, after);

    this.pdfViewer.renderPage(this.pdfViewer.currentPage);
    this.onToast('Reversed document page order');
  }

  recordDocHistory(before, after) {
    if (this.historyManager) {
      this.historyManager.push({
        type: 'DOCUMENT_PAGES',
        documentModel: this.documentModel,
        before,
        after,
      });
    }
  }

  // --- Document-Level Workflows: Extract, Split, Merge, Insert Blank, Insert PDF ---
  async extractSelectedPages() {
    if (this.selectedPageIds.size === 0) {
      this.onToast('Please select at least one page to extract.');
      return;
    }

    try {
      this.onToast('Extracting selected pages...');
      const result = await this.pdfExport.extractPages(
        this.documentModel,
        this.annotationManager,
        Array.from(this.selectedPageIds),
        this.documentModel.originalFilename
      );
      this.onToast(`Extracted ${result.filename} successfully!`);
    } catch (err) {
      this.onToast(`Extraction error: ${err.message}`);
    }
  }

  // --- DOM Event Bindings ---
  bindDomEvents() {
    // Select all / clear buttons
    const btnSelectAll = document.getElementById('btnSelectAllPages');
    if (btnSelectAll) btnSelectAll.addEventListener('click', () => this.selectAllPages());

    const btnClear = document.getElementById('btnClearPageSelection');
    if (btnClear) btnClear.addEventListener('click', () => this.clearSelection());

    // Panel close button
    const btnClose = document.getElementById('btnCloseOrganizer');
    if (btnClose) btnClose.addEventListener('click', () => this.togglePanel(false));

    // Toolbar buttons
    const btnUp = document.getElementById('btnMovePageUp');
    if (btnUp) btnUp.addEventListener('click', () => this.moveSelectedUp());

    const btnDown = document.getElementById('btnMovePageDown');
    if (btnDown) btnDown.addEventListener('click', () => this.moveSelectedDown());

    const btnRotLeft = document.getElementById('btnRotatePageLeft');
    if (btnRotLeft) btnRotLeft.addEventListener('click', () => this.rotatePages(null, -90));

    const btnRotRight = document.getElementById('btnRotatePageRight');
    if (btnRotRight) btnRotRight.addEventListener('click', () => this.rotatePages(null, 90));

    const btnDup = document.getElementById('btnDuplicatePages');
    if (btnDup) btnDup.addEventListener('click', () => this.duplicatePages(null));

    const btnDel = document.getElementById('btnDeletePages');
    if (btnDel) btnDel.addEventListener('click', () => this.confirmAndDeletePages(null));

    const btnRev = document.getElementById('btnReversePages');
    if (btnRev) btnRev.addEventListener('click', () => this.reversePages());

    const btnExtract = document.getElementById('btnExtractPages');
    if (btnExtract) btnExtract.addEventListener('click', () => this.extractSelectedPages());
  }

  clear() {
    if (this.thumbnailObserver) {
      this.thumbnailObserver.disconnect();
      this.thumbnailObserver = null;
    }
    this.selectedPageIds.clear();
    this.activePageId = null;
    this.draggedPageId = null;
    this.dragOverPageId = null;
    this.thumbnailCache.clear();
    if (this.containerEl) this.containerEl.innerHTML = '';
    const badge = document.getElementById('organizerPageCountBadge');
    if (badge) badge.textContent = '0';
    const selText = document.getElementById('organizerSelectionText');
    if (selText) selText.textContent = '0 selected';
  }
}
