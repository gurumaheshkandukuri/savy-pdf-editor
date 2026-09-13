/**
 * SAVY PDF Workspace — Visual PDF Text Editor Module (text-editor-manager.js)
 * Enables visual PDF existing-text detection, selection, inline editing,
 * and solid background-masked text replacement.
 *
 * Technical Classification:
 * VISUAL PDF TEXT REPLACEMENT — Original PDF text remains underneath a solid
 * background mask in the exported file, while replacement text is drawn over it.
 *
 * Privacy Guarantee:
 * "Your PDF is processed locally in your browser and is never uploaded to SAVY servers."
 * 100% in-memory processing.
 */

export class TextEditorManager {
  constructor(optionsOrApp = {}) {
    const app = optionsOrApp?.editorApp || optionsOrApp;
    this.editorApp = app;
    this.onToast = optionsOrApp?.onToast || ((msg) => app?.showToast?.(msg)) || console.log;

    this.isActive = false;
    this.pageTextCache = new Map(); // pageNum -> Array<TextItemModel>
    this.selectedRunIndex = null;
    this.activeInlineEditor = null;

    this.initElements();
    this.bindEvents();
  }

  get pdfViewer() {
    return this.editorApp?.pdfViewer;
  }

  get documentModel() {
    return this.editorApp?.documentModel;
  }

  get annotationManager() {
    return this.editorApp?.annotationManager;
  }

  get historyManager() {
    return this.editorApp?.historyManager;
  }

  initElements() {
    this.wrapperEl = document.getElementById('pdfPageWrapper');
    this.textEditLayer = document.getElementById('textEditLayer');

    if (!this.textEditLayer && this.wrapperEl) {
      this.textEditLayer = document.createElement('div');
      this.textEditLayer.id = 'textEditLayer';
      this.textEditLayer.className = 'text-edit-layer';
      this.textEditLayer.style.display = 'none';
      this.wrapperEl.appendChild(this.textEditLayer);
    }
  }

  bindEvents() {
    window.addEventListener('keydown', (e) => {
      if (!this.isActive) return;

      if (e.key === 'Escape') {
        if (this.activeInlineEditor) {
          this.cancelInlineEdit();
        } else if (this.selectedRunIndex !== null) {
          this.deselectRun();
        }
      } else if (e.key === 'Enter' && this.selectedRunIndex !== null && !this.activeInlineEditor) {
        const curItems = this.pageTextCache.get(this.pdfViewer.currentPage) || [];
        const item = curItems[this.selectedRunIndex];
        if (item) {
          const runEl = this.textEditLayer?.querySelector(`[data-run-index="${this.selectedRunIndex}"]`);
          if (runEl) this.startInlineEdit(item, runEl);
        }
      }
    });
  }

  /**
   * Activate or deactivate Edit Text mode
   * @param {boolean} active
   */
  setActive(active) {
    this.isActive = Boolean(active);
    if (!this.textEditLayer) this.initElements();
    if (!this.textEditLayer) return;

    if (this.isActive) {
      this.textEditLayer.style.display = 'block';
      this.renderCurrentPage();
      this.onToast('Visual Text Replacement active: Click existing text to mask and replace.');
    } else {
      this.cancelInlineEdit();
      this.deselectRun();
      this.textEditLayer.style.display = 'none';
      this.textEditLayer.innerHTML = '';
    }
  }

  /**
   * Invalidate cached text when document changes or closes
   */
  invalidateCache() {
    this.pageTextCache.clear();
    this.selectedRunIndex = null;
    this.cancelInlineEdit();
    if (this.textEditLayer) {
      this.textEditLayer.innerHTML = '';
    }
  }

  /**
   * Extract text items from PDF.js getTextContent and build text model
   * @param {number} pageNum
   * @returns {Promise<Array<Object>>}
   */
  async extractPageTextModel(pageNum) {
    if (this.pageTextCache.has(pageNum)) {
      return this.pageTextCache.get(pageNum);
    }

    if (!this.pdfViewer.hasDocument()) {
      return [];
    }

    try {
      const pageRecord = this.documentModel ? this.documentModel.getPage(pageNum - 1) : null;
      let srcPdfjsDoc = this.pdfViewer.pdfDoc;
      let srcPageIndex = pageNum;

      if (pageRecord && pageRecord.docId) {
        const srcObj = this.documentModel.getSourceDoc(pageRecord.docId);
        if (srcObj && srcObj.pdfjsDoc) {
          srcPdfjsDoc = srcObj.pdfjsDoc;
        }
        srcPageIndex = pageRecord.sourceIndex + 1;
      }

      if (!srcPdfjsDoc) return [];

      const page = await srcPdfjsDoc.getPage(srcPageIndex);
      const userRotation = pageRecord?.rotation || 0;
      const totalRotation = ((page.rotate || 0) + userRotation) % 360;
      const viewport = page.getViewport({ scale: 1.0, rotation: totalRotation });

      const textContent = await page.getTextContent();
      const rawItems = textContent.items || [];
      const textItems = [];

      for (let i = 0; i < rawItems.length; i++) {
        const item = rawItems[i];
        const str = item.str || '';
        if (!str.trim() && str.length === 0) continue;

        const tx = item.transform[4];
        const ty = item.transform[5];
        const fontSize = Math.max(8, Math.round(Math.abs(item.transform[3] || item.height || 12)));
        const fontName = item.fontName || '';

        // Convert unscaled PDF coordinate to top-left Viewport space
        const p1 = viewport.convertToViewportPoint(tx, ty + fontSize);
        const p2 = viewport.convertToViewportPoint(tx + (item.width || fontSize), ty);

        const vx = Math.min(p1[0], p2[0]);
        const vy = Math.min(p1[1], p2[1]);
        const vw = Math.max(item.width || 8, Math.abs(p2[0] - p1[0]));
        const vh = Math.max(fontSize, Math.abs(p2[1] - p1[1]));

        textItems.push({
          index: i,
          str: item.str,
          currentText: item.str,
          x: vx,
          y: vy,
          width: vw,
          height: vh,
          fontSize,
          fontName,
          fontFamily: this.resolveFontFamily(fontName),
          bold: this.isBoldFont(fontName),
          italic: this.isItalicFont(fontName),
          color: '#000000',
          backgroundColor: '#FFFFFF',
          pageNumber: pageNum,
        });
      }

      this.pageTextCache.set(pageNum, textItems);
      return textItems;
    } catch (err) {
      console.warn(`Text extraction error on page ${pageNum}:`, err);
      return [];
    }
  }

  /**
   * Render interactive text run boxes for the current page
   */
  async renderCurrentPage() {
    if (!this.isActive || !this.textEditLayer) return;

    this.textEditLayer.innerHTML = '';
    const pageNum = this.pdfViewer.currentPage || 1;
    const items = await this.extractPageTextModel(pageNum);
    const scale = this.pdfViewer.scale || 1.0;

    // Dimensions match canvas
    const pageSize = this.pdfViewer.getPageSize();
    this.textEditLayer.style.width = `${Math.round(pageSize.width * scale)}px`;
    this.textEditLayer.style.height = `${Math.round(pageSize.height * scale)}px`;

    items.forEach((item, idx) => {
      const runEl = document.createElement('div');
      runEl.className = `pdf-text-run ${this.selectedRunIndex === idx ? 'is-selected' : ''}`;
      runEl.dataset.runIndex = String(idx);

      const vx = Math.round(item.x * scale);
      const vy = Math.round(item.y * scale);
      const vw = Math.max(12, Math.round(item.width * scale));
      const vh = Math.max(12, Math.round(item.height * scale));

      runEl.style.left = `${vx}px`;
      runEl.style.top = `${vy}px`;
      runEl.style.width = `${vw}px`;
      runEl.style.height = `${vh}px`;
      runEl.title = `Click to select, double-click to edit: "${item.str}"`;

      // Single click: Select text run
      runEl.addEventListener('click', (e) => {
        e.stopPropagation();
        if (this.activeInlineEditor) {
          this.commitInlineEdit();
        }
        this.selectRun(idx);
      });

      // Double click: Enter inline text editing
      runEl.addEventListener('dblclick', (e) => {
        e.stopPropagation();
        this.startInlineEdit(item, runEl);
      });

      this.textEditLayer.appendChild(runEl);
    });
  }

  selectRun(index) {
    this.selectedRunIndex = index;
    if (!this.textEditLayer) return;

    this.textEditLayer.querySelectorAll('.pdf-text-run').forEach((el) => {
      const isThis = el.dataset.runIndex === String(index);
      el.classList.toggle('is-selected', isThis);
    });

    const items = this.pageTextCache.get(this.pdfViewer.currentPage) || [];
    const item = items[index];
    if (item && this.editorApp.syncControlsWithSettings) {
      this.editorApp.syncControlsWithSettings({
        fontSize: item.fontSize,
        fontFamily: item.fontFamily,
        bold: item.bold,
        italic: item.italic,
        color: item.color || '#000000',
      }, 'text');
    }
  }

  deselectRun() {
    this.selectedRunIndex = null;
    if (this.textEditLayer) {
      this.textEditLayer.querySelectorAll('.pdf-text-run').forEach((el) => {
        el.classList.remove('is-selected');
      });
    }
  }

  /**
   * Start inline editing on a text run
   */
  startInlineEdit(item, runEl) {
    if (this.activeInlineEditor) {
      this.commitInlineEdit();
    }

    const scale = this.pdfViewer.scale || 1.0;
    const initialText = item.currentText || item.str;

    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'pdf-text-inline-editor';
    input.value = initialText;

    const scaledFontSize = Math.max(10, Math.round(item.fontSize * scale));
    input.style.fontSize = `${scaledFontSize}px`;
    input.style.fontFamily = item.fontFamily || 'Helvetica, sans-serif';
    input.style.fontWeight = item.bold ? '700' : '400';
    input.style.fontStyle = item.italic ? 'italic' : 'normal';
    input.style.color = item.color || '#000000';
    input.style.backgroundColor = item.backgroundColor || '#FFFFFF';

    runEl.innerHTML = '';
    runEl.appendChild(input);
    input.focus();
    input.select();

    this.activeInlineEditor = {
      input,
      item,
      runEl,
      originalText: initialText,
    };

    input.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') {
        e.preventDefault();
        this.commitInlineEdit();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        this.cancelInlineEdit();
      }
    });

    input.addEventListener('blur', () => {
      setTimeout(() => {
        if (this.activeInlineEditor && this.activeInlineEditor.input === input) {
          this.commitInlineEdit();
        }
      }, 150);
    });
  }

  /**
   * Commit the inline text edit and create a text_replacement annotation
   * @param {Object} [overrideItem=null]
   * @param {string} [overrideText=null]
   */
  commitInlineEdit(overrideItem = null, overrideText = null) {
    let item = overrideItem;
    let newText = overrideText;
    let originalText = '';

    if (this.activeInlineEditor) {
      const active = this.activeInlineEditor;
      this.activeInlineEditor = null;
      item = item || active.item;
      newText = newText !== null && newText !== undefined ? newText : (active.input ? active.input.value : '');
      originalText = active.originalText;
    }

    if (!item) return;
    if (!originalText) originalText = item.currentText || item.str;
    if (newText === null || newText === undefined) newText = item.currentText || item.str;

    if (newText === originalText && !overrideText) {
      this.renderCurrentPage();
      return;
    }

    // Update item model
    item.currentText = newText;

    // Calculate approximate replacement width based on character count change
    const charRatio = Math.max(1, newText.length) / Math.max(1, originalText.length);
    const estimatedWidth = Math.max(item.width, Math.round(item.width * charRatio));

    const curPage = this.pdfViewer.currentPage || 1;
    const curPageRecord = this.documentModel ? this.documentModel.getPage(curPage - 1) : null;
    const pageId = curPageRecord ? curPageRecord.id : String(curPage);

    // Create text_replacement annotation
    const annot = {
      id: 'text_rep_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 7),
      type: 'text_replacement',
      pageNumber: curPage,
      pageIndex: curPage - 1,
      pageId,
      originalText,
      text: newText,
      content: newText,
      newText,
      x: item.x,
      y: item.y,
      width: estimatedWidth,
      height: item.height,
      originalWidth: item.width,
      originalHeight: item.height,
      backgroundColor: item.backgroundColor || '#FFFFFF',
      isMasked: true,
      fontSize: item.fontSize,
      fontFamily: item.fontFamily || 'Helvetica',
      bold: Boolean(item.bold),
      italic: Boolean(item.italic),
      color: item.color || '#000000',
      style: {
        fontSize: item.fontSize,
        fontFamily: item.fontFamily || 'Helvetica',
        bold: Boolean(item.bold),
        italic: Boolean(item.italic),
        color: item.color || '#000000',
        align: 'left',
      },
    };

    if (this.annotationManager) {
      this.annotationManager.addAnnotation(annot, true);
    }

    this.onToast(`Edited: "${originalText}" → "${newText}"`);
    this.renderCurrentPage();
  }

  cancelInlineEdit() {
    if (!this.activeInlineEditor) return;
    this.activeInlineEditor = null;
    this.renderCurrentPage();
  }

  /**
   * Programmatic replacement of matching text across page or entire document (Find & Replace engine)
   * @param {Object} match - { pageNumber, text, bounds, matchIndex }
   * @param {string} replacementText
   * @returns {Object} created annotation
   */
  createReplacementFromMatch(match, replacementText) {
    const curPageRecord = this.documentModel ? this.documentModel.getPage(match.pageNumber - 1) : null;
    const pageId = curPageRecord ? curPageRecord.id : String(match.pageNumber);

    // Bounding box from first matching slice
    const b = (match.bounds && match.bounds[0]) || { x: 50, y: 100, width: 100, height: 16 };
    const origLen = Math.max(1, (match.textSnippet || match.matchedText || 'Text').length);
    const repLen = Math.max(1, replacementText.length);
    const estimatedWidth = Math.max(b.width, Math.round(b.width * (repLen / origLen)));

    return {
      id: 'text_rep_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 7),
      type: 'text_replacement',
      pageNumber: match.pageNumber,
      pageIndex: match.pageIndex ?? (match.pageNumber - 1),
      pageId,
      originalText: match.matchedText || match.textSnippet || '',
      text: replacementText,
      content: replacementText,
      newText: replacementText,
      x: b.x,
      y: b.y,
      width: estimatedWidth,
      height: b.height,
      originalWidth: b.width,
      originalHeight: b.height,
      backgroundColor: '#FFFFFF',
      isMasked: true,
      fontSize: Math.max(9, Math.round(b.height * 0.85)),
      fontFamily: 'Helvetica',
      bold: false,
      italic: false,
      color: '#000000',
      style: {
        fontSize: Math.max(9, Math.round(b.height * 0.85)),
        fontFamily: 'Helvetica',
        bold: false,
        italic: false,
        color: '#000000',
        align: 'left',
      },
    };
  }

  resolveFontFamily(fontName) {
    if (!fontName) return 'Helvetica';
    const lower = fontName.toLowerCase();
    if (lower.includes('times') || lower.includes('roman') || lower.includes('serif')) {
      return 'TimesRoman';
    }
    if (lower.includes('courier') || lower.includes('mono')) {
      return 'Courier';
    }
    return 'Helvetica';
  }

  isBoldFont(fontName) {
    if (!fontName) return false;
    const lower = fontName.toLowerCase();
    return lower.includes('bold') || lower.includes('black') || lower.includes('heavy') || lower.includes('700');
  }

  isItalicFont(fontName) {
    if (!fontName) return false;
    const lower = fontName.toLowerCase();
    return lower.includes('italic') || lower.includes('oblique');
  }
}
