/**
 * SAVY PDF Workspace — Annotation Manager (annotation-manager.js)
 * Coordinates client-side interactive annotations, coordinate transformations,
 * selection handles, and multi-page persistence.
 */

export class AnnotationManager {
  constructor({
    overlayEl,
    drawingCanvasEl,
    historyManager,
    onSelectionChange,
    onAnnotationChange,
  }) {
    this.overlayEl = overlayEl;
    this.drawingCanvasEl = drawingCanvasEl;
    this.historyManager = historyManager;
    this.onSelectionChange = onSelectionChange || (() => {});
    this.onAnnotationChange = onAnnotationChange || (() => {});

    // Annotations partitioned by pageId or pageNumber: Map<string|number, Array<Annotation>>
    this.annotationsByPage = new Map();
    this.currentPage = 1;
    this.currentPageId = null;
    this.documentModel = null;
    this.scale = 1.0;
    this.pageSize = { width: 612, height: 792 }; // Unscaled PDF points

    this.selectedAnnotationId = null;

    // Drag / Resize interaction state
    this.interactionState = null;

    this.initEvents();
  }

  setDocumentModel(model) {
    this.documentModel = model;
  }

  setPageContext(pageNumber, scale, pageSize, pageId = null) {
    this.currentPage = pageNumber;
    if (pageId) {
      this.currentPageId = pageId;
    } else if (this.documentModel) {
      const p = this.documentModel.getPage(pageNumber - 1);
      this.currentPageId = p ? p.id : String(pageNumber);
    } else {
      this.currentPageId = String(pageNumber);
    }

    this.scale = scale;
    if (pageSize) {
      this.pageSize = pageSize;
    }
    this.render();
  }

  setScale(scale) {
    this.scale = scale;
    this.render();
  }

  getAnnotationsForPage(pageKey) {
    let key = pageKey;
    if (typeof pageKey === 'number' && this.documentModel) {
      const page = this.documentModel.getPage(pageKey - 1);
      if (page) {
        key = page.id;
      }
    }
    if (!key) {
      key = this.currentPageId || String(this.currentPage);
    }
    // If key not found directly, check if annotations were registered under numeric index/pageId
    if (!this.annotationsByPage.has(key) && this.documentModel) {
      const allPages = typeof this.documentModel.getPages === 'function' ? this.documentModel.getPages() : (this.documentModel.pages || []);
      const idx = allPages.findIndex((p) => p.id === key);
      if (idx !== -1) {
        const numKey = String(idx + 1);
        if (this.annotationsByPage.has(numKey)) {
          const annots = this.annotationsByPage.get(numKey);
          this.annotationsByPage.set(key, annots);
          this.annotationsByPage.delete(numKey);
        }
      }
    }
    if (!this.annotationsByPage.has(key)) {
      this.annotationsByPage.set(key, []);
    }
    return this.annotationsByPage.get(key);
  }

  cloneAnnotations(sourcePageId, targetPageId) {
    const sourceList = this.getAnnotationsForPage(sourcePageId);
    if (!sourceList || sourceList.length === 0) return [];

    const clonedList = sourceList.map((annot) => ({
      ...JSON.parse(JSON.stringify(annot)),
      id: 'annot_' + Math.random().toString(36).substring(2, 11) + '_' + Date.now().toString(36),
    }));

    this.annotationsByPage.set(targetPageId, clonedList);
    this.onAnnotationChange();
    return clonedList;
  }

  deleteAnnotationsForPage(pageId) {
    if (this.annotationsByPage.has(pageId)) {
      this.annotationsByPage.delete(pageId);
      this.onAnnotationChange();
    }
  }

  getAllAnnotationsByPageId() {
    return this.annotationsByPage;
  }

  getAllAnnotations() {
    return this.annotationsByPage;
  }

  getAllAnnotationsFlat() {
    const all = [];
    for (const [, list] of this.annotationsByPage.entries()) {
      all.push(...list);
    }
    return all;
  }

  hasAnyAnnotations() {
    for (const [, list] of this.annotationsByPage.entries()) {
      if (list.length > 0) return true;
    }
    return false;
  }

  // --- Coordinate Transformations (PDF Points <-> Viewport Pixels) ---
  viewportToPdf(vx, vy) {
    return {
      x: vx / this.scale,
      y: vy / this.scale,
    };
  }

  pdfToViewport(px, py) {
    return {
      x: px * this.scale,
      y: py * this.scale,
    };
  }

  // --- CRUD Operations with History Tracking ---
  addAnnotation(annotation, recordHistory = true) {
    let activeKey = annotation.pageId || this.currentPageId;
    if (!activeKey && this.documentModel && (annotation.pageNumber || this.currentPage)) {
      const pNum = annotation.pageNumber || this.currentPage;
      const p = this.documentModel.getPage(pNum - 1);
      if (p) activeKey = p.id;
    }
    if (!activeKey) {
      activeKey = this.currentPage ? String(this.currentPage) : '1';
    }
    const list = this.getAnnotationsForPage(activeKey);
    list.push(annotation);

    if (recordHistory && this.historyManager) {
      this.historyManager.push({
        type: 'ADD',
        pageNumber: annotation.pageNumber || this.currentPage,
        pageId: activeKey,
        annotation: { ...annotation },
      });
    }

    this.selectAnnotation(annotation.id);
    this.render();
    this.onAnnotationChange();
    return annotation;
  }

  insertAnnotation(pageKey, annotation, recordHistory = true) {
    const list = this.getAnnotationsForPage(pageKey);
    list.push(annotation);
    if (pageKey === this.currentPage || pageKey === this.currentPageId) {
      this.render();
    }
    this.onAnnotationChange();
  }

  removeAnnotation(pageKey, annotationId, recordHistory = true) {
    const list = this.getAnnotationsForPage(pageKey);
    const index = list.findIndex((a) => a.id === annotationId);
    if (index !== -1) {
      const removed = list.splice(index, 1)[0];
      if (this.selectedAnnotationId === annotationId) {
        this.deselect();
      }
      if (recordHistory && this.historyManager) {
        this.historyManager.push({
          type: 'DELETE',
          pageNumber: this.currentPage,
          pageId: this.currentPageId,
          annotation: removed,
        });
      }
      if (pageKey === this.currentPage || pageKey === this.currentPageId) {
        this.render();
      }
      this.onAnnotationChange();
    }
  }

  deleteSelected() {
    if (!this.selectedAnnotationId) return false;
    const activeKey = this.currentPageId || this.currentPage;
    this.removeAnnotation(activeKey, this.selectedAnnotationId, true);
    return true;
  }

  updateAnnotationDirect(pageKey, annotationId, changes, recordHistory = false) {
    const list = this.getAnnotationsForPage(pageKey);
    const annot = list.find((a) => a.id === annotationId);
    if (annot) {
      const before = { ...annot, style: { ...annot.style } };
      Object.assign(annot, changes);
      if (changes.style) {
        annot.style = { ...before.style, ...changes.style };
      }
      if (recordHistory && this.historyManager) {
        this.historyManager.push({
          type: 'MODIFY',
          pageNumber: this.currentPage,
          pageId: this.currentPageId,
          id: annotationId,
          before,
          after: { ...annot, style: { ...annot.style } },
        });
      }
      if (pageKey === this.currentPage || pageKey === this.currentPageId) {
        this.render();
      }
      this.onAnnotationChange();
      if (this.selectedAnnotationId === annotationId) {
        this.onSelectionChange(annot);
      }
    }
  }

  updateSelectedStyle(styleChanges) {
    const selected = this.getSelectedAnnotation();
    if (!selected) return;
    const activeKey = this.currentPageId || this.currentPage;
    this.updateAnnotationDirect(activeKey, selected.id, {
      style: { ...selected.style, ...styleChanges },
    }, true);
  }

  getSelectedAnnotation() {
    if (!this.selectedAnnotationId) return null;
    const list = this.getAnnotationsForPage(this.currentPage);
    return list.find((a) => a.id === this.selectedAnnotationId) || null;
  }

  selectAnnotation(id) {
    if (this.selectedAnnotationId === id) return;
    this.selectedAnnotationId = id;
    this.render();
    this.onSelectionChange(this.getSelectedAnnotation());
  }

  deselect() {
    if (!this.selectedAnnotationId) return;
    this.selectedAnnotationId = null;
    this.render();
    this.onSelectionChange(null);
  }

  clear() {
    this.annotationsByPage.clear();
    this.selectedAnnotationId = null;
    this.render();
    this.onSelectionChange(null);
    this.onAnnotationChange();
  }

  // --- Overlay Rendering ---
  render() {
    if (!this.overlayEl) return;
    this.overlayEl.innerHTML = '';

    const list = this.getAnnotationsForPage(this.currentPage);

    for (const annot of list) {
      const isSelected = annot.id === this.selectedAnnotationId;
      const el = document.createElement('div');
      el.className = `annotation-item annotation-type-${annot.type} ${isSelected ? 'is-selected' : ''}`;
      el.dataset.id = annot.id;

      // Position in viewport pixels
      const vx = annot.x * this.scale;
      const vy = annot.y * this.scale;
      const vw = Math.max(12, annot.width * this.scale);
      const vh = Math.max(12, annot.height * this.scale);

      el.style.left = `${Math.round(vx)}px`;
      el.style.top = `${Math.round(vy)}px`;
      el.style.width = `${Math.round(vw)}px`;
      el.style.height = `${Math.round(vh)}px`;

      // Render content based on type
      this.renderAnnotationContent(el, annot, vw, vh);

      // Render selection bounding box & resize handles
      if (isSelected) {
        this.renderSelectionHandles(el, annot);
      }

      this.overlayEl.appendChild(el);
    }
  }

  renderAnnotationContent(container, annot, widthPx, heightPx) {
    const s = annot.style || {};

    switch (annot.type) {
      case 'text': {
        const textDiv = document.createElement('div');
        textDiv.className = 'annot-text-content';
        textDiv.textContent = annot.content || 'Text';
        textDiv.style.color = s.color || '#000000';
        textDiv.style.fontSize = `${Math.round((s.fontSize || 16) * this.scale)}px`;
        textDiv.style.fontFamily = s.fontFamily || 'Helvetica, sans-serif';
        textDiv.style.fontWeight = s.bold ? '700' : '400';
        textDiv.style.fontStyle = s.italic ? 'italic' : 'normal';
        textDiv.style.textDecoration = s.underline ? 'underline' : 'none';
        textDiv.style.textAlign = s.align || 'left';
        textDiv.style.lineHeight = '1.2';
        textDiv.style.width = '100%';
        textDiv.style.height = '100%';
        textDiv.style.whiteSpace = 'pre-wrap';
        textDiv.style.wordBreak = 'break-word';

        // Double-click to edit inline
        textDiv.addEventListener('dblclick', (e) => {
          e.stopPropagation();
          this.enableInlineTextEdit(container, annot, textDiv);
        });

        container.appendChild(textDiv);
        break;
      }

      case 'text_replacement': {
        // Solid background mask to occlude the underlying original text on canvas
        container.style.backgroundColor = annot.backgroundColor || '#FFFFFF';
        container.style.zIndex = '15';

        const textDiv = document.createElement('div');
        textDiv.className = 'annot-text-content annot-text-replacement-content';
        textDiv.textContent = annot.content || annot.newText || '';
        textDiv.style.color = s.color || '#000000';
        textDiv.style.fontSize = `${Math.round((s.fontSize || 14) * this.scale)}px`;
        textDiv.style.fontFamily = s.fontFamily || 'Helvetica, sans-serif';
        textDiv.style.fontWeight = s.bold ? '700' : '400';
        textDiv.style.fontStyle = s.italic ? 'italic' : 'normal';
        textDiv.style.textDecoration = s.underline ? 'underline' : 'none';
        textDiv.style.textAlign = s.align || 'left';
        textDiv.style.lineHeight = '1.2';
        textDiv.style.width = '100%';
        textDiv.style.height = '100%';
        textDiv.style.whiteSpace = 'pre';
        textDiv.style.wordBreak = 'normal';

        // Double-click to edit replacement inline
        textDiv.addEventListener('dblclick', (e) => {
          e.stopPropagation();
          this.enableInlineTextEdit(container, annot, textDiv);
        });

        container.appendChild(textDiv);
        break;
      }

      case 'drawing':
      case 'highlight': {
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('width', '100%');
        svg.setAttribute('height', '100%');
        svg.setAttribute('viewBox', `0 0 ${annot.width} ${annot.height}`);
        svg.style.overflow = 'visible';

        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        const d = this.pointsToSvgPath(annot.points, annot.x, annot.y);
        path.setAttribute('d', d);
        path.setAttribute('fill', 'none');
        path.setAttribute('stroke', s.color || '#2563EB');
        path.setAttribute('stroke-width', s.strokeWidth || 3);
        path.setAttribute('stroke-linecap', 'round');
        path.setAttribute('stroke-linejoin', 'round');
        if (annot.type === 'highlight') {
          path.setAttribute('stroke-opacity', s.opacity || 0.35);
        }
        svg.appendChild(path);
        container.appendChild(svg);
        break;
      }

      case 'rectangle': {
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('width', '100%');
        svg.setAttribute('height', '100%');
        svg.setAttribute('viewBox', `0 0 ${annot.width} ${annot.height}`);

        const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        const sw = s.strokeWidth || 2;
        rect.setAttribute('x', sw / 2);
        rect.setAttribute('y', sw / 2);
        rect.setAttribute('width', Math.max(1, annot.width - sw));
        rect.setAttribute('height', Math.max(1, annot.height - sw));
        rect.setAttribute('stroke', s.color || '#2563EB');
        rect.setAttribute('stroke-width', sw);
        rect.setAttribute('fill', s.fillColor || 'transparent');
        if (s.opacity < 1.0) {
          rect.setAttribute('opacity', s.opacity);
        }
        svg.appendChild(rect);
        container.appendChild(svg);
        break;
      }

      case 'circle': {
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('width', '100%');
        svg.setAttribute('height', '100%');
        svg.setAttribute('viewBox', `0 0 ${annot.width} ${annot.height}`);

        const ellipse = document.createElementNS('http://www.w3.org/2000/svg', 'ellipse');
        const sw = s.strokeWidth || 2;
        const rx = Math.max(1, (annot.width - sw) / 2);
        const ry = Math.max(1, (annot.height - sw) / 2);
        ellipse.setAttribute('cx', annot.width / 2);
        ellipse.setAttribute('cy', annot.height / 2);
        ellipse.setAttribute('rx', rx);
        ellipse.setAttribute('ry', ry);
        ellipse.setAttribute('stroke', s.color || '#2563EB');
        ellipse.setAttribute('stroke-width', sw);
        ellipse.setAttribute('fill', s.fillColor || 'transparent');
        if (s.opacity < 1.0) {
          ellipse.setAttribute('opacity', s.opacity);
        }
        svg.appendChild(ellipse);
        container.appendChild(svg);
        break;
      }

      case 'line': {
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('width', '100%');
        svg.setAttribute('height', '100%');
        svg.setAttribute('viewBox', `0 0 ${annot.width} ${annot.height}`);
        svg.style.overflow = 'visible';

        const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        const isArrow = s.arrow === true;
        line.setAttribute('x1', annot.x1Rel !== undefined ? annot.x1Rel : 0);
        line.setAttribute('y1', annot.y1Rel !== undefined ? annot.y1Rel : 0);
        line.setAttribute('x2', annot.x2Rel !== undefined ? annot.x2Rel : annot.width);
        line.setAttribute('y2', annot.y2Rel !== undefined ? annot.y2Rel : annot.height);
        line.setAttribute('stroke', s.color || '#2563EB');
        line.setAttribute('stroke-width', s.strokeWidth || 3);
        line.setAttribute('stroke-linecap', 'round');
        svg.appendChild(line);

        if (isArrow) {
          // Arrowhead polygon at end point
          const arrowHead = this.createArrowHeadSvg(
            annot.x1Rel !== undefined ? annot.x1Rel : 0,
            annot.y1Rel !== undefined ? annot.y1Rel : 0,
            annot.x2Rel !== undefined ? annot.x2Rel : annot.width,
            annot.y2Rel !== undefined ? annot.y2Rel : annot.height,
            s.color || '#2563EB',
            s.strokeWidth || 3
          );
          if (arrowHead) svg.appendChild(arrowHead);
        }

        container.appendChild(svg);
        break;
      }

      case 'image':
      case 'signature': {
        const img = document.createElement('img');
        img.src = annot.dataUrl;
        img.alt = annot.type;
        img.style.width = '100%';
        img.style.height = '100%';
        img.style.objectFit = 'contain';
        img.style.pointerEvents = 'none';
        container.appendChild(img);
        break;
      }

      case 'redact': {
        const redactBox = document.createElement('div');
        redactBox.className = 'annot-redact-draft';
        redactBox.innerHTML = `
          <div class="redact-crosshatch"></div>
          <span class="redact-label">REDACT</span>
        `;
        container.appendChild(redactBox);
        break;
      }

      case 'stamp': {
        const stampBox = document.createElement('div');
        stampBox.className = 'annot-stamp-element';
        const color = annot.color || s.color || '#16A34A';
        const rot = Number(annot.rotation) || 0;
        const opacity = annot.opacity !== undefined ? Number(annot.opacity) : 0.85;

        stampBox.style.borderColor = color;
        stampBox.style.color = color;
        stampBox.style.transform = `rotate(${rot}deg)`;
        stampBox.style.opacity = opacity;

        const text = (annot.text || 'APPROVED').toUpperCase();
        const dateStr = annot.date ? `<div class="stamp-date">${annot.date}</div>` : '';

        stampBox.innerHTML = `
          <div class="stamp-inner-border" style="border-color: ${color};">
            <div class="stamp-text">${text}</div>
            ${dateStr}
          </div>
        `;
        container.appendChild(stampBox);
        break;
      }

      case 'form_field': {
        const formBox = document.createElement('div');
        formBox.className = `annot-form-field annot-form-${annot.formType || 'text'}`;

        const label = annot.fieldName ? `<span class="form-field-tag">${annot.fieldName}</span>` : '';

        switch (annot.formType) {
          case 'text':
            formBox.innerHTML = `
              ${label}
              <input type="text" class="form-preview-input" placeholder="${annot.placeholder || 'Text field'}" value="${annot.defaultValue || ''}" readonly />
            `;
            break;
          case 'checkbox':
            formBox.innerHTML = `
              <label class="form-preview-checkbox">
                <input type="checkbox" ${annot.checked ? 'checked' : ''} disabled />
                <span class="form-checkbox-custom"></span>
                ${label}
              </label>
            `;
            break;
          case 'dropdown': {
            const opts = annot.options && annot.options.length > 0 ? annot.options : ['Option 1', 'Option 2'];
            const optHtml = opts.map((o) => `<option ${o === annot.defaultValue ? 'selected' : ''}>${o}</option>`).join('');
            formBox.innerHTML = `
              ${label}
              <select class="form-preview-select" disabled>${optHtml}</select>
            `;
            break;
          }
          case 'radio':
            formBox.innerHTML = `
              <label class="form-preview-radio">
                <input type="radio" checked disabled />
                <span class="form-radio-custom"></span>
                ${label}
              </label>
            `;
            break;
          default:
            formBox.innerHTML = `${label}<div class="form-preview-placeholder">Form Field</div>`;
            break;
        }
        container.appendChild(formBox);
        break;
      }
    }
  }

  renderSelectionHandles(container, annot) {
    const handles = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];
    handles.forEach((dir) => {
      const handle = document.createElement('div');
      handle.className = `selection-handle handle-${dir}`;
      handle.dataset.direction = dir;
      container.appendChild(handle);
    });

    // Delete quick-action button at top-right
    const btnDel = document.createElement('button');
    btnDel.type = 'button';
    btnDel.className = 'selection-delete-btn';
    btnDel.title = 'Delete annotation (Delete)';
    btnDel.innerHTML = `<img src="/assets/icons/trash.svg" width="12" height="12" alt="" />`;
    btnDel.addEventListener('click', (e) => {
      e.stopPropagation();
      this.deleteSelected();
    });
    container.appendChild(btnDel);
  }

  enableInlineTextEdit(container, annot, textDiv) {
    textDiv.style.display = 'none';

    const textarea = document.createElement('textarea');
    textarea.className = 'annot-text-editor';
    textarea.value = annot.content || '';
    textarea.style.color = annot.style?.color || '#000000';
    textarea.style.fontSize = `${Math.round((annot.style?.fontSize || 16) * this.scale)}px`;
    textarea.style.fontFamily = annot.style?.fontFamily || 'Helvetica, sans-serif';
    textarea.style.fontWeight = annot.style?.bold ? '700' : '400';
    textarea.style.fontStyle = annot.style?.italic ? 'italic' : 'normal';

    const finishEdit = () => {
      const newText = textarea.value.trim();
      textarea.remove();
      if (newText) {
        this.updateAnnotationDirect(this.currentPage, annot.id, { content: newText }, true);
      } else {
        // Auto-remove empty text annotation
        this.removeAnnotation(this.currentPage, annot.id, true);
      }
    };

    textarea.addEventListener('blur', finishEdit);
    textarea.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        textarea.blur();
      }
    });

    container.appendChild(textarea);
    textarea.focus();
    textarea.select();
  }

  // --- Pointer & Touch Interactions for Drag & Resize ---
  initEvents() {
    this.overlayEl?.addEventListener('pointerdown', (e) => this.handlePointerDown(e));
    window.addEventListener('pointermove', (e) => this.handlePointerMove(e));
    window.addEventListener('pointerup', (e) => this.handlePointerUp(e));
    window.addEventListener('pointercancel', (e) => this.handlePointerUp(e));
  }

  handlePointerDown(e) {
    // Only handle primary button / touch
    if (e.button !== 0 && e.pointerType === 'mouse') return;

    const handle = e.target.closest('.selection-handle');
    const annotItem = e.target.closest('.annotation-item');

    if (handle) {
      // Begin resizing
      e.stopPropagation();
      e.preventDefault();
      const annotId = annotItem.dataset.id;
      const annot = this.getSelectedAnnotation();
      if (!annot || annot.id !== annotId) return;

      this.interactionState = {
        type: 'resize',
        direction: handle.dataset.direction,
        startX: e.clientX,
        startY: e.clientY,
        initialAnnot: { ...annot },
      };
    } else if (annotItem) {
      // Begin dragging/moving or selecting
      e.stopPropagation();
      const annotId = annotItem.dataset.id;
      this.selectAnnotation(annotId);
      const annot = this.getSelectedAnnotation();
      if (!annot) return;

      // Don't drag if user clicked textarea
      if (e.target.tagName === 'TEXTAREA') return;

      this.interactionState = {
        type: 'drag',
        startX: e.clientX,
        startY: e.clientY,
        initialAnnot: { ...annot },
        hasMoved: false,
      };
    }
  }

  handlePointerMove(e) {
    if (!this.interactionState) return;

    const dx = (e.clientX - this.interactionState.startX) / this.scale;
    const dy = (e.clientY - this.interactionState.startY) / this.scale;
    const init = this.interactionState.initialAnnot;

    if (this.interactionState.type === 'drag') {
      if (Math.abs(dx) > 2 || Math.abs(dy) > 2) {
        this.interactionState.hasMoved = true;
      }
      const newX = Math.max(0, Math.min(init.x + dx, this.pageSize.width - init.width));
      const newY = Math.max(0, Math.min(init.y + dy, this.pageSize.height - init.height));

      this.updateAnnotationDirect(this.currentPage, init.id, { x: newX, y: newY }, false);
    } else if (this.interactionState.type === 'resize') {
      const dir = this.interactionState.direction;
      let { x, y, width, height } = init;

      if (dir.includes('e')) width = Math.max(16, init.width + dx);
      if (dir.includes('s')) height = Math.max(16, init.height + dy);
      if (dir.includes('w')) {
        const potentialW = init.width - dx;
        if (potentialW >= 16) {
          width = potentialW;
          x = init.x + dx;
        }
      }
      if (dir.includes('n')) {
        const potentialH = init.height - dy;
        if (potentialH >= 16) {
          height = potentialH;
          y = init.y + dy;
        }
      }

      this.updateAnnotationDirect(this.currentPage, init.id, { x, y, width, height }, false);
    }
  }

  handlePointerUp(e) {
    if (!this.interactionState) return;

    const init = this.interactionState.initialAnnot;
    const current = this.getSelectedAnnotation();

    // If moved or resized, push history action
    if (current && (current.x !== init.x || current.y !== init.y || current.width !== init.width || current.height !== init.height)) {
      if (this.historyManager) {
        this.historyManager.push({
          type: 'MODIFY',
          pageNumber: this.currentPage,
          id: init.id,
          before: init,
          after: { ...current },
        });
      }
    }

    this.interactionState = null;
  }

  // --- SVG Path Smoothing Utilities for Freehand Drawings & Highlights ---
  pointsToSvgPath(points, originX = 0, originY = 0) {
    if (!points || points.length === 0) return '';
    if (points.length === 1) {
      const p = points[0];
      const relX = p.x - originX;
      const relY = p.y - originY;
      return `M ${relX} ${relY} L ${relX + 0.1} ${relY + 0.1}`;
    }

    let d = `M ${points[0].x - originX} ${points[0].y - originY}`;
    for (let i = 1; i < points.length - 1; i++) {
      const current = points[i];
      const next = points[i + 1];
      const midX = (current.x + next.x) / 2 - originX;
      const midY = (current.y + next.y) / 2 - originY;
      d += ` Q ${current.x - originX} ${current.y - originY}, ${midX} ${midY}`;
    }
    const last = points[points.length - 1];
    d += ` L ${last.x - originX} ${last.y - originY}`;
    return d;
  }

  createArrowHeadSvg(x1, y1, x2, y2, color, strokeWidth) {
    const angle = Math.atan2(y2 - y1, x2 - x1);
    const headLength = Math.max(10, strokeWidth * 3.5);
    const angle1 = angle - Math.PI / 6;
    const angle2 = angle + Math.PI / 6;

    const p1x = x2 - headLength * Math.cos(angle1);
    const p1y = y2 - headLength * Math.sin(angle1);
    const p2x = x2 - headLength * Math.cos(angle2);
    const p2y = y2 - headLength * Math.sin(angle2);

    const polygon = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
    polygon.setAttribute('points', `${x2},${y2} ${p1x},${p1y} ${p2x},${p2y}`);
    polygon.setAttribute('fill', color);
    return polygon;
  }
}
