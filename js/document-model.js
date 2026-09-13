/**
 * SAVY PDF Workspace — Document Model (document-model.js)
 * Manages the logical document structure, page sequence, stable page identifiers,
 * page rotations, dimensions, blank pages, and multiple source documents.
 *
 * Privacy Guarantee: 100% in-browser state management. Zero cloud uploads.
 */

export class DocumentModel {
  constructor() {
    // Map of docId -> { id: string, name: string, arrayBuffer: ArrayBuffer, pdfjsDoc: any }
    this.sourceDocs = new Map();

    // Array of PageRecord objects representing the document order
    // { id: string, docId: string, sourceIndex: number, width: number, height: number, rotation: number, isBlank: boolean }
    this.pages = [];

    // Event listeners: Map<string, Set<Function>>
    this.listeners = new Map();

    this.primaryDocId = null;
    this.originalFilename = 'document.pdf';
  }

  /**
   * Initialize model from a newly loaded primary PDF
   * @param {ArrayBuffer} arrayBuffer
   * @param {string} filename
   * @param {any} pdfjsDoc
   */
  async loadInitialDocument(arrayBuffer, filename, pdfjsDoc) {
    this.sourceDocs.clear();
    this.pages = [];

    const docId = 'doc_' + Math.random().toString(36).substring(2, 9);
    this.primaryDocId = docId;
    this.originalFilename = filename || 'document.pdf';

    this.sourceDocs.set(docId, {
      id: docId,
      name: this.originalFilename,
      arrayBuffer: arrayBuffer.slice(0),
      pdfjsDoc,
    });

    const numPages = pdfjsDoc.numPages;
    for (let i = 1; i <= numPages; i++) {
      const pdfPage = await pdfjsDoc.getPage(i);
      const viewport = pdfPage.getViewport({ scale: 1.0 });

      this.pages.push({
        id: 'page_' + Math.random().toString(36).substring(2, 11) + '_' + i,
        docId,
        sourceIndex: i - 1,
        width: viewport.width,
        height: viewport.height,
        rotation: 0, // Additional user rotation in degrees (0, 90, 180, 270)
        baseRotation: pdfPage.rotate || 0,
        isBlank: false,
      });
    }

    this.emit('change', { type: 'LOAD', pages: this.pages });
    return this.pages;
  }

  /**
   * Add an external PDF source document into the workspace
   * @param {string} name
   * @param {ArrayBuffer} arrayBuffer
   * @param {any} pdfjsDoc
   * @returns {string} docId
   */
  addSourceDocument(name, arrayBuffer, pdfjsDoc) {
    const docId = 'doc_' + Math.random().toString(36).substring(2, 9);
    let buf = arrayBuffer;
    try {
      if (arrayBuffer && !arrayBuffer.detached && arrayBuffer.byteLength > 0) {
        buf = arrayBuffer.slice(0);
      }
    } catch {
      buf = arrayBuffer;
    }

    this.sourceDocs.set(docId, {
      id: docId,
      name: name || 'imported.pdf',
      arrayBuffer: buf,
      pdfjsDoc,
    });
    return docId;
  }

  getSourceDoc(docId) {
    return this.sourceDocs.get(docId) || null;
  }

  getPages() {
    return [...this.pages];
  }

  getPageCount() {
    return this.pages.length;
  }

  getPage(index) {
    return this.pages[index] || null;
  }

  getPageById(pageId) {
    return this.pages.find((p) => p.id === pageId) || null;
  }

  getPageIndexById(pageId) {
    return this.pages.findIndex((p) => p.id === pageId);
  }

  /**
   * Reorder page from fromIndex to toIndex
   * @param {number} fromIndex
   * @param {number} toIndex
   */
  reorderPage(fromIndex, toIndex) {
    if (
      fromIndex < 0 ||
      fromIndex >= this.pages.length ||
      toIndex < 0 ||
      toIndex >= this.pages.length ||
      fromIndex === toIndex
    ) {
      return false;
    }

    const [moved] = this.pages.splice(fromIndex, 1);
    this.pages.splice(toIndex, 0, moved);

    this.emit('change', { type: 'REORDER', fromIndex, toIndex, pages: this.pages });
    return true;
  }

  /**
   * Move page up (-1) or down (+1)
   * @param {number} index
   * @param {number} direction
   */
  movePage(index, direction) {
    const target = index + direction;
    return this.reorderPage(index, target);
  }

  /**
   * Reorder all pages according to an array of page IDs
   * @param {Array<string>} orderedIds
   */
  reorderPagesByIds(orderedIds) {
    if (!Array.isArray(orderedIds) || orderedIds.length !== this.pages.length) {
      return false;
    }

    const pageMap = new Map(this.pages.map((p) => [p.id, p]));
    const newPages = [];

    for (const id of orderedIds) {
      const page = pageMap.get(id);
      if (!page) return false;
      newPages.push(page);
    }

    this.pages = newPages;
    this.emit('change', { type: 'REORDER_ALL', pages: this.pages });
    return true;
  }

  /**
   * Delete one or multiple pages by IDs or indices
   * Must NEVER leave 0 pages in the document.
   * @param {Array<string|number>|string|number} targets
   */
  deletePages(targets) {
    const targetArray = Array.isArray(targets) ? targets : [targets];
    if (targetArray.length === 0) return false;

    // Resolve IDs to delete
    const idsToDelete = new Set();
    for (const t of targetArray) {
      if (typeof t === 'number') {
        const p = this.pages[t];
        if (p) idsToDelete.add(p.id);
      } else if (typeof t === 'string') {
        idsToDelete.add(t);
      }
    }

    // Protection: Never allow deleting all pages
    if (idsToDelete.size >= this.pages.length) {
      throw new Error('Cannot delete all pages. The document must contain at least one page.');
    }

    const remainingPages = this.pages.filter((p) => !idsToDelete.has(p.id));
    const deletedIds = Array.from(idsToDelete);
    this.pages = remainingPages;

    this.emit('change', { type: 'DELETE', deletedIds, pages: this.pages });
    return deletedIds;
  }

  /**
   * Duplicate specified page(s)
   * Creates new PageRecord(s) immediately following each source page.
   * @param {Array<string|number>|string|number} targets
   * @returns {Array<{ originalId: string, newPage: Object }>}
   */
  duplicatePages(targets) {
    const targetArray = Array.isArray(targets) ? targets : [targets];
    if (targetArray.length === 0) return [];

    const idsToDup = new Set();
    for (const t of targetArray) {
      if (typeof t === 'number') {
        const p = this.pages[t];
        if (p) idsToDup.add(p.id);
      } else if (typeof t === 'string') {
        idsToDup.add(t);
      }
    }

    const duplications = [];
    const newPages = [];

    for (const p of this.pages) {
      newPages.push(p);
      if (idsToDup.has(p.id)) {
        const newId = 'page_' + Math.random().toString(36).substring(2, 11) + '_dup';
        const dupPage = {
          ...p,
          id: newId,
        };
        newPages.push(dupPage);
        duplications.push({ originalId: p.id, newPage: dupPage });
      }
    }

    this.pages = newPages;
    this.emit('change', { type: 'DUPLICATE', duplications, pages: this.pages });
    return duplications;
  }

  /**
   * Rotate pages by delta degrees (+90, -90, 180)
   * Normalizes rotation to 0, 90, 180, 270.
   * @param {Array<string|number>|string|number} targets
   * @param {number} degreesDelta
   */
  rotatePages(targets, degreesDelta = 90) {
    const targetArray = Array.isArray(targets) ? targets : [targets];
    if (targetArray.length === 0) return false;

    const idsToRotate = new Set();
    for (const t of targetArray) {
      if (typeof t === 'number') {
        const p = this.pages[t];
        if (p) idsToRotate.add(p.id);
      } else if (typeof t === 'string') {
        idsToRotate.add(t);
      }
    }

    for (const p of this.pages) {
      if (idsToRotate.has(p.id)) {
        let newRot = (p.rotation + degreesDelta) % 360;
        if (newRot < 0) newRot += 360;
        p.rotation = newRot;
      }
    }

    this.emit('change', { type: 'ROTATE', rotatedIds: Array.from(idsToRotate), pages: this.pages });
    return true;
  }

  duplicatePage(target) {
    return this.duplicatePages([target]);
  }

  rotatePage(target, degreesDelta = 90) {
    return this.rotatePages([target], degreesDelta);
  }

  deletePage(target) {
    return this.deletePages([target]);
  }

  /**
   * Reverse the page order of the entire document
   */
  reversePages() {
    this.pages.reverse();
    this.emit('change', { type: 'REVERSE', pages: this.pages });
    return true;
  }

  /**
   * Insert a blank page at a specified position
   * @param {number} index - Insertion index (0 to pages.length)
   * @param {Object} [options]
   * @param {number} [options.width=612] - 72-DPI points (Letter = 612x792, A4 = 595x842)
   * @param {number} [options.height=792]
   */
  insertBlankPage(index = -1, options = {}) {
    const width = options.width || (this.pages[0]?.width ?? 612);
    const height = options.height || (this.pages[0]?.height ?? 792);

    const insertIdx = index < 0 || index > this.pages.length ? this.pages.length : index;
    const newId = 'page_' + Math.random().toString(36).substring(2, 11) + '_blank';

    const blankPage = {
      id: newId,
      docId: null,
      sourceIndex: -1,
      width,
      height,
      rotation: 0,
      baseRotation: 0,
      isBlank: true,
    };

    this.pages.splice(insertIdx, 0, blankPage);
    this.emit('change', { type: 'INSERT_BLANK', index: insertIdx, page: blankPage, pages: this.pages });
    return blankPage;
  }

  /**
   * Insert pages from another document at a specified position
   * @param {number} index
   * @param {string} docId
   * @param {Array<number>} [sourceIndices] - 0-based page indices to import
   */
  async insertPagesFromDocument(index, docId, sourceIndices = null) {
    const src = this.sourceDocs.get(docId);
    if (!src || !src.pdfjsDoc) {
      throw new Error(`Source document "${docId}" not found in model.`);
    }

    const numPages = src.pdfjsDoc.numPages;
    const indicesToImport = sourceIndices || Array.from({ length: numPages }, (_, i) => i);

    const insertedPages = [];
    for (const srcIdx of indicesToImport) {
      if (srcIdx < 0 || srcIdx >= numPages) continue;
      const page = await src.pdfjsDoc.getPage(srcIdx + 1);
      const viewport = page.getViewport({ scale: 1.0 });

      const newPage = {
        id: 'page_' + Math.random().toString(36).substring(2, 11) + '_imp',
        docId,
        sourceIndex: srcIdx,
        width: viewport.width,
        height: viewport.height,
        rotation: 0,
        baseRotation: page.rotate || 0,
        isBlank: false,
      };
      insertedPages.push(newPage);
    }

    const insertIdx = index < 0 || index > this.pages.length ? this.pages.length : index;
    this.pages.splice(insertIdx, 0, ...insertedPages);

    this.emit('change', { type: 'INSERT_PAGES', index: insertIdx, insertedPages, pages: this.pages });
    return insertedPages;
  }

  /**
   * Replace a page at index with another page
   * @param {number} index
   * @param {string} sourceDocId
   * @param {number} sourcePageIndex - 0-based
   */
  async replacePage(index, sourceDocId, sourcePageIndex) {
    if (index < 0 || index >= this.pages.length) {
      throw new Error(`Page index ${index} out of bounds.`);
    }

    const src = this.sourceDocs.get(sourceDocId);
    if (!src || !src.pdfjsDoc) {
      throw new Error(`Source document "${sourceDocId}" not found.`);
    }

    const page = await src.pdfjsDoc.getPage(sourcePageIndex + 1);
    const viewport = page.getViewport({ scale: 1.0 });

    const oldPage = this.pages[index];
    const newPage = {
      id: oldPage.id, // Preserves stable page ID so annotations stay intact!
      docId: sourceDocId,
      sourceIndex: sourcePageIndex,
      width: viewport.width,
      height: viewport.height,
      rotation: 0,
      baseRotation: page.rotate || 0,
      isBlank: false,
    };

    this.pages[index] = newPage;
    this.emit('change', { type: 'REPLACE', index, oldPage, newPage, pages: this.pages });
    return newPage;
  }

  /**
   * Snapshot and restore methods for undo/redo
   */
  createSnapshot() {
    return {
      pages: JSON.parse(JSON.stringify(this.pages)),
    };
  }

  restoreSnapshot(snapshot) {
    if (!snapshot || !Array.isArray(snapshot.pages)) return;
    this.pages = JSON.parse(JSON.stringify(snapshot.pages));
    this.emit('change', { type: 'RESTORE_SNAPSHOT', pages: this.pages });
  }

  // --- Simple Event System ---
  on(event, handler) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event).add(handler);
    return () => this.off(event, handler);
  }

  off(event, handler) {
    if (this.listeners.has(event)) {
      this.listeners.get(event).delete(handler);
    }
  }

  emit(event, data) {
    if (this.listeners.has(event)) {
      for (const handler of this.listeners.get(event)) {
        try {
          handler(data);
        } catch (err) {
          console.error(`DocumentModel event handler error for "${event}":`, err);
        }
      }
    }
  }

  clear() {
    this.sourceDocs.clear();
    this.pages = [];
    this.primaryDocId = null;
    this.originalFilename = 'document.pdf';
    this.emit('change', { type: 'CLEAR', pages: [] });
  }
}
