/**
 * SAVY PDF Workspace — Search & Document Navigation Engine (search-manager.js)
 * High-performance, client-side in-document search using PDF.js text extraction.
 *
 * Privacy Guarantee: Your PDF is processed locally in your browser and is never uploaded to SAVY servers.
 * Search operations run 100% in browser memory and do NOT modify the underlying PDF.
 */

export class SearchManager {
  constructor({ editorApp, onToast }) {
    this.editorApp = editorApp;
    this.pdfViewer = editorApp.pdfViewer;
    this.documentModel = editorApp.documentModel;
    this.onToast = onToast || (() => {});

    // State
    this.isOpen = false;
    this.query = '';
    this.caseSensitive = false;
    this.matches = []; // Array<{ pageNumber, pageIndex, bounds: Array<{x, y, width, height}>, matchIndex, textSnippet }>
    this.currentMatchIndex = -1;
    this.pageTextCache = new Map(); // pageIndex -> { items, fullText, charOffsets }
    this.isSearching = false;

    this.initElements();
    this.bindEvents();
  }

  initElements() {
    this.searchBar = document.getElementById('searchBarOverlay');
    this.searchInput = document.getElementById('searchInput');
    this.btnPrevMatch = document.getElementById('btnSearchPrev');
    this.btnNextMatch = document.getElementById('btnSearchNext');
    this.btnCloseSearch = document.getElementById('btnSearchClose');
    this.matchCountEl = document.getElementById('searchMatchCount');
    this.caseSensitiveBtn = document.getElementById('btnSearchCaseSensitive');
    this.searchSpinner = document.getElementById('searchSpinner');

    // Replace Controls
    this.btnToggleReplace = document.getElementById('btnToggleReplaceMode');
    this.searchReplaceRow = document.getElementById('searchReplaceRow');
    this.replaceInput = document.getElementById('replaceInput');
    this.searchScopeSelect = document.getElementById('searchScopeSelect');
    this.btnSearchReplace = document.getElementById('btnSearchReplace');
    this.btnSearchReplaceAll = document.getElementById('btnSearchReplaceAll');
    this.isReplaceMode = false;

    // Overlay element for highlights on top of canvas
    this.highlightOverlay = document.getElementById('searchHighlightOverlay');
    if (!this.highlightOverlay && this.editorApp.pdfPageWrapper) {
      this.highlightOverlay = document.createElement('div');
      this.highlightOverlay.id = 'searchHighlightOverlay';
      this.highlightOverlay.className = 'search-highlight-overlay';
      this.editorApp.pdfPageWrapper.appendChild(this.highlightOverlay);
    }
  }

  bindEvents() {
    // Global shortcut Ctrl+F / Cmd+F (Find) and Ctrl+H / Cmd+H (Replace)
    window.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === 'f' || e.key === 'F')) {
        e.preventDefault();
        this.open(false);
      } else if ((e.ctrlKey || e.metaKey) && (e.key === 'h' || e.key === 'H')) {
        e.preventDefault();
        this.open(true);
      }
    });

    if (this.btnToggleReplace) {
      this.btnToggleReplace.addEventListener('click', () => {
        this.toggleReplaceMode();
      });
    }

    if (this.btnSearchReplace) {
      this.btnSearchReplace.addEventListener('click', () => {
        this.replaceCurrent();
      });
    }

    if (this.btnSearchReplaceAll) {
      this.btnSearchReplaceAll.addEventListener('click', () => {
        this.replaceAll();
      });
    }

    if (this.replaceInput) {
      this.replaceInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          this.replaceCurrent();
        } else if (e.key === 'Escape') {
          e.preventDefault();
          this.close();
        }
      });
    }

    if (this.btnCloseSearch) {
      this.btnCloseSearch.addEventListener('click', () => this.close());
    }

    if (this.searchInput) {
      let debounceTimer = null;
      this.searchInput.addEventListener('input', () => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
          this.performSearch();
        }, 200);
      });

      this.searchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          if (e.shiftKey) {
            this.prevMatch();
          } else {
            this.nextMatch();
          }
        } else if (e.key === 'Escape') {
          e.preventDefault();
          this.close();
        } else if (e.key === 'ArrowDown') {
          e.preventDefault();
          this.nextMatch();
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          this.prevMatch();
        }
      });
    }

    if (this.btnNextMatch) {
      this.btnNextMatch.addEventListener('click', () => this.nextMatch());
    }

    if (this.btnPrevMatch) {
      this.btnPrevMatch.addEventListener('click', () => this.prevMatch());
    }

    if (this.caseSensitiveBtn) {
      this.caseSensitiveBtn.addEventListener('click', () => {
        this.caseSensitive = !this.caseSensitive;
        this.caseSensitiveBtn.classList.toggle('active', this.caseSensitive);
        this.performSearch();
      });
    }

    // Re-render highlights whenever page renders or zoom changes
    const originalRenderPage = this.pdfViewer.renderPage.bind(this.pdfViewer);
    this.pdfViewer.renderPage = async (...args) => {
      const result = await originalRenderPage(...args);
      if (this.isOpen && this.matches.length > 0) {
        this.renderHighlightsForCurrentPage();
      }
      return result;
    };
  }

  toggleReplaceMode(show) {
    if (show !== undefined) {
      this.isReplaceMode = Boolean(show);
    } else {
      this.isReplaceMode = !this.isReplaceMode;
    }
    if (this.searchReplaceRow) {
      this.searchReplaceRow.style.display = this.isReplaceMode ? 'flex' : 'none';
    }
    if (this.btnToggleReplace) {
      this.btnToggleReplace.textContent = this.isReplaceMode ? '▼' : '▶';
      this.btnToggleReplace.classList.toggle('active', this.isReplaceMode);
    }
    if (this.isReplaceMode && this.replaceInput) {
      this.replaceInput.focus();
    }
  }

  open(showReplace = false) {
    if (!this.searchBar) return;
    this.isOpen = true;
    this.searchBar.style.display = 'flex';
    if (showReplace) {
      this.toggleReplaceMode(true);
    }
    if (this.searchInput) {
      if (!this.searchInput.value) {
        this.searchInput.focus();
        this.searchInput.select();
      } else if (showReplace && this.replaceInput) {
        this.replaceInput.focus();
        this.replaceInput.select();
      } else {
        this.searchInput.focus();
        this.searchInput.select();
      }
    }
    if (this.searchInput && this.searchInput.value) {
      this.performSearch();
    }
  }

  close() {
    if (!this.searchBar) return;
    this.isOpen = false;
    this.searchBar.style.display = 'none';
    this.clearHighlights();
  }

  async replaceCurrent() {
    if (this.currentMatchIndex < 0 || this.matches.length === 0) {
      this.onToast('No match selected to replace.');
      return;
    }

    const match = this.matches[this.currentMatchIndex];
    if (!match) return;

    const replacementText = this.replaceInput ? this.replaceInput.value : '';
    const textEditorManager = this.editorApp.textEditorManager;
    if (!textEditorManager) return;

    const annotation = textEditorManager.createReplacementFromMatch(match, replacementText);
    if (!annotation) {
      this.onToast('Failed to create replacement.');
      return;
    }

    this.editorApp.annotationManager.addAnnotation(annotation, true);

    this.invalidateCache();
    textEditorManager.invalidateCache();

    this.onToast(`Replaced text with "${replacementText}".`);
    await this.performSearch();
  }

  async replaceAll() {
    if (this.matches.length === 0) {
      this.onToast('No matches found to replace.');
      return;
    }

    const scope = this.searchScopeSelect ? this.searchScopeSelect.value : 'all';
    const curPage = this.pdfViewer.currentPage || 1;

    const targetMatches = scope === 'current'
      ? this.matches.filter((m) => m.pageNumber === curPage)
      : [...this.matches];

    if (targetMatches.length === 0) {
      this.onToast('No matches found on the current page to replace.');
      return;
    }

    const replacementText = this.replaceInput ? this.replaceInput.value : '';
    const textEditorManager = this.editorApp.textEditorManager;
    if (!textEditorManager) return;

    const batchActions = [];

    for (const match of targetMatches) {
      const annotation = textEditorManager.createReplacementFromMatch(match, replacementText);
      if (annotation) {
        this.editorApp.annotationManager.addAnnotation(annotation, false);
        const pageKey = annotation.pageId || String(annotation.pageNumber || (annotation.pageIndex + 1));
        batchActions.push({
          type: 'ADD',
          pageNumber: annotation.pageNumber || (annotation.pageIndex + 1),
          pageId: pageKey,
          annotation: { ...annotation },
        });
      }
    }

    if (batchActions.length > 0) {
      this.editorApp.historyManager.push({
        type: 'BATCH',
        actions: batchActions,
      });

      this.invalidateCache();
      textEditorManager.invalidateCache();

      // Render current page annotations
      this.editorApp.annotationManager.render();

      this.onToast(`Replaced ${batchActions.length} occurrences with "${replacementText}".`);
      await this.performSearch();
    }
  }

  clearHighlights() {
    if (this.highlightOverlay) {
      this.highlightOverlay.innerHTML = '';
    }
  }

  invalidateCache() {
    this.pageTextCache.clear();
    this.matches = [];
    this.currentMatchIndex = -1;
    this.clearHighlights();
    this.updateMatchCountUI();
  }

  async extractPageText(pageNumber) {
    if (this.pageTextCache.has(pageNumber)) {
      return this.pageTextCache.get(pageNumber);
    }

    const pageRecord = this.documentModel ? this.documentModel.getPage(pageNumber - 1) : null;
    if (pageRecord && pageRecord.isBlank) {
      const blankData = { items: [], fullText: '', charOffsets: [], pageNumber, viewport: null };
      this.pageTextCache.set(pageNumber, blankData);
      return blankData;
    }

    let srcPdfjsDoc = this.pdfViewer.pdfDoc;
    let srcPageIndex = pageNumber;

    if (pageRecord && pageRecord.docId) {
      const srcObj = this.documentModel.getSourceDoc(pageRecord.docId);
      if (srcObj && srcObj.pdfjsDoc) {
        srcPdfjsDoc = srcObj.pdfjsDoc;
      }
      srcPageIndex = pageRecord.sourceIndex + 1;
    }

    if (!srcPdfjsDoc) {
      return { items: [], fullText: '', charOffsets: [], pageNumber, viewport: null };
    }

    try {
      const page = await srcPdfjsDoc.getPage(srcPageIndex);
      const userRotation = pageRecord?.rotation || 0;
      const totalRotation = ((page.rotate || 0) + userRotation) % 360;
      const viewport = page.getViewport({ scale: 1.0, rotation: totalRotation });

      const textContent = await page.getTextContent();
      const items = textContent.items || [];

      // Build continuous text and character offset maps
      let fullText = '';
      const charOffsets = []; // { itemIndex, charIndexInItem } for each char in fullText

      items.forEach((item, itemIdx) => {
        const str = item.str || '';
        for (let c = 0; c < str.length; c++) {
          charOffsets.push({ itemIndex: itemIdx, charIndex: c });
        }
        fullText += str;

        // Add virtual space between items if hasEOL or not ending in space
        if (item.hasEOL || (str.length > 0 && !str.endsWith(' '))) {
          fullText += ' ';
          charOffsets.push({ itemIndex: itemIdx, charIndex: str.length, isSeparator: true });
        }
      });

      const data = { items, fullText, charOffsets, pageNumber, viewport };
      this.pageTextCache.set(pageNumber, data);
      return data;
    } catch (err) {
      console.warn(`Text extraction error on page ${pageNumber}:`, err);
      return { items: [], fullText: '', charOffsets: [], pageNumber, viewport: null };
    }
  }

  async performSearch() {
    if (!this.searchInput) return;
    const rawQuery = this.searchInput.value;
    this.query = rawQuery.trim();

    if (!this.query) {
      this.matches = [];
      this.currentMatchIndex = -1;
      this.clearHighlights();
      this.updateMatchCountUI();
      return;
    }

    if (!this.pdfViewer.hasDocument()) {
      return;
    }

    if (this.searchSpinner) this.searchSpinner.style.display = 'inline-block';
    this.isSearching = true;

    try {
      const totalPages = this.documentModel ? this.documentModel.getPageCount() : (this.pdfViewer.totalPages || 0);
      const allMatches = [];
      const searchQuery = this.caseSensitive ? this.query : this.query.toLowerCase();

      for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
        // Yield to event loop every 8 pages to avoid UI thread starvation in large documents
        if (pageNum % 8 === 0) {
          await new Promise((r) => setTimeout(r, 0));
        }

        const pageData = await this.extractPageText(pageNum);
        if (!pageData.fullText) continue;

        const targetText = this.caseSensitive ? pageData.fullText : pageData.fullText.toLowerCase();
        let startIndex = 0;

        while (startIndex < targetText.length) {
          const matchPos = targetText.indexOf(searchQuery, startIndex);
          if (matchPos === -1) break;

          const matchEnd = matchPos + searchQuery.length;

          // Resolve bounding boxes for this match across items
          const bounds = this.calculateMatchBounds(pageData, matchPos, matchEnd);

          if (bounds && bounds.length > 0) {
            allMatches.push({
              pageNumber: pageNum,
              pageIndex: pageNum - 1,
              startIndex: matchPos,
              endIndex: matchEnd,
              bounds,
              textSnippet: pageData.fullText.substring(Math.max(0, matchPos - 20), Math.min(pageData.fullText.length, matchEnd + 20)),
            });
          }

          startIndex = matchPos + Math.max(1, searchQuery.length);
        }
      }

      this.matches = allMatches;

      if (this.matches.length > 0) {
        // Find nearest match on or after current page
        const curPage = this.pdfViewer.currentPage || 1;
        let bestIdx = this.matches.findIndex((m) => m.pageNumber >= curPage);
        if (bestIdx === -1) bestIdx = 0;
        this.currentMatchIndex = bestIdx;
        this.goToMatch(this.currentMatchIndex);
      } else {
        this.currentMatchIndex = -1;
        this.clearHighlights();
      }

      this.updateMatchCountUI();
    } finally {
      if (this.searchSpinner) this.searchSpinner.style.display = 'none';
      this.isSearching = false;
    }
  }

  /**
   * Calculates bounding boxes in unscaled PDF points for a substring match
   */
  calculateMatchBounds(pageData, matchStart, matchEnd) {
    const { items, charOffsets, viewport } = pageData;
    if (!items || items.length === 0 || !viewport) return [];

    const bounds = [];
    const itemSlices = new Map(); // itemIdx -> { startChar, endChar }

    for (let i = matchStart; i < matchEnd && i < charOffsets.length; i++) {
      const mapping = charOffsets[i];
      if (!mapping || mapping.isSeparator) continue;

      const itemIdx = mapping.itemIndex;
      if (!itemSlices.has(itemIdx)) {
        itemSlices.set(itemIdx, { startChar: mapping.charIndex, endChar: mapping.charIndex + 1 });
      } else {
        const slice = itemSlices.get(itemIdx);
        slice.endChar = Math.max(slice.endChar, mapping.charIndex + 1);
      }
    }

    for (const [itemIdx, slice] of itemSlices.entries()) {
      const item = items[itemIdx];
      if (!item || !item.transform) continue;

      const strLen = (item.str || '').length || 1;
      const charWidth = item.width / strLen;
      const sliceStart = Math.min(slice.startChar, strLen);
      const sliceEnd = Math.min(slice.endChar, strLen);
      const sliceCharCount = Math.max(1, sliceEnd - sliceStart);

      // Unscaled PDF Coordinates:
      // item.transform is [scaleX, skewY, skewX, scaleY, tx, ty]
      const tx = item.transform[4];
      const ty = item.transform[5];
      const fontHeight = Math.abs(item.height || item.transform[3] || 12);

      const xOffset = sliceStart * charWidth;
      const subWidth = sliceCharCount * charWidth;

      // Convert PDF coordinate point to Viewport point (top-left origin, scale=1.0)
      const p1 = viewport.convertToViewportPoint(tx + xOffset, ty + fontHeight);
      const p2 = viewport.convertToViewportPoint(tx + xOffset + subWidth, ty);

      const vx = Math.min(p1[0], p2[0]);
      const vy = Math.min(p1[1], p2[1]);
      const vw = Math.abs(p2[0] - p1[0]);
      const vh = Math.abs(p2[1] - p1[1]);

      bounds.push({
        x: vx,
        y: vy,
        width: Math.max(vw, 4),
        height: Math.max(vh, fontHeight),
      });
    }

    return bounds;
  }

  nextMatch() {
    if (this.matches.length === 0) return;
    this.currentMatchIndex = (this.currentMatchIndex + 1) % this.matches.length;
    this.goToMatch(this.currentMatchIndex);
  }

  prevMatch() {
    if (this.matches.length === 0) return;
    this.currentMatchIndex = (this.currentMatchIndex - 1 + this.matches.length) % this.matches.length;
    this.goToMatch(this.currentMatchIndex);
  }

  async goToMatch(index) {
    if (index < 0 || index >= this.matches.length) return;
    const match = this.matches[index];

    if (this.pdfViewer.currentPage !== match.pageNumber) {
      await this.pdfViewer.renderPage(match.pageNumber);
    } else {
      this.renderHighlightsForCurrentPage();
    }

    this.updateMatchCountUI();
    this.scrollActiveMatchIntoView();
  }

  renderHighlightsForCurrentPage() {
    if (!this.highlightOverlay) return;
    this.highlightOverlay.innerHTML = '';

    const curPage = this.pdfViewer.currentPage || 1;
    const scale = this.pdfViewer.scale || 1.0;

    const pageMatches = this.matches
      .map((match, globalIdx) => ({ match, globalIdx }))
      .filter(({ match }) => match.pageNumber === curPage);

    if (pageMatches.length === 0) return;

    const fragment = document.createDocumentFragment();

    pageMatches.forEach(({ match, globalIdx }) => {
      const isActive = globalIdx === this.currentMatchIndex;

      match.bounds.forEach((b) => {
        const highlightBox = document.createElement('div');
        highlightBox.className = `search-highlight-box ${isActive ? 'active' : ''}`;
        highlightBox.style.left = `${b.x * scale}px`;
        highlightBox.style.top = `${b.y * scale}px`;
        highlightBox.style.width = `${b.width * scale}px`;
        highlightBox.style.height = `${b.height * scale}px`;

        if (isActive) {
          highlightBox.setAttribute('data-active-match', 'true');
        }

        fragment.appendChild(highlightBox);
      });
    });

    this.highlightOverlay.appendChild(fragment);
  }

  scrollActiveMatchIntoView() {
    setTimeout(() => {
      const activeEl = this.highlightOverlay?.querySelector('[data-active-match="true"]');
      if (activeEl) {
        activeEl.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
      }
    }, 50);
  }

  updateMatchCountUI() {
    if (!this.matchCountEl) return;
    if (!this.query || this.matches.length === 0) {
      this.matchCountEl.textContent = this.query ? '0 matches' : '';
      if (this.btnNextMatch) this.btnNextMatch.disabled = true;
      if (this.btnPrevMatch) this.btnPrevMatch.disabled = true;
      return;
    }

    this.matchCountEl.textContent = `${this.currentMatchIndex + 1} of ${this.matches.length}`;
    if (this.btnNextMatch) this.btnNextMatch.disabled = false;
    if (this.btnPrevMatch) this.btnPrevMatch.disabled = false;
  }
}
