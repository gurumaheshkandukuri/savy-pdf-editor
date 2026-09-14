/**
 * SAVY PDF Workspace — Session Manager (js/session-manager.js)
 * Coordinates 100% browser-local, client-side document session persistence via IndexedDB.
 * Guarantees that active documents, page organization, rotations, and annotations
 * persist across page refreshes and browser tab reloads without any server uploads.
 *
 * PRIVACY GUARANTEE:
 * "Your working document is stored locally in your browser so it can be restored after a refresh."
 * Your files are processed locally in your browser and are never uploaded to SAVY servers.
 * SAVY may fetch static application resources, libraries, and updates over the network, which can subsequently be served from the browser/service-worker cache.
 */

export const DB_NAME = 'SAVY_LOCAL_STORE';
export const DB_VERSION = 2;
export const STORE_PENDING = 'pending_documents';
export const STORE_SESSIONS = 'document_sessions';
export const SESSION_KEY = 'active_session';

export class SessionManager {
  /**
   * @param {Object} options
   * @param {import('./editor.js').EditorApp} options.editorApp
   * @param {Function} [options.onToast]
   */
  constructor({ editorApp, onToast } = {}) {
    this.editorApp = editorApp;
    this.onToast = onToast || (() => {});
    this.saveTimer = null;
    this.isSaving = false;
    this.isRestoring = false;
    this.storageAvailable = true;

    this.bindUnloadEvents();
  }

  /**
   * Ensure pending changes are saved before navigation or page refresh.
   */
  bindUnloadEvents() {
    if (typeof window === 'undefined') return;

    window.addEventListener('beforeunload', () => {
      this.flushSave();
    });

    window.addEventListener('pagehide', () => {
      this.flushSave();
    });
  }

  /**
   * Open the local IndexedDB database, creating or migrating object stores as necessary.
   * @returns {Promise<IDBDatabase>}
   */
  openDB() {
    return new Promise((resolve, reject) => {
      if (typeof indexedDB === 'undefined') {
        this.storageAvailable = false;
        return reject(new Error('IndexedDB is not available in this browser environment.'));
      }

      const req = indexedDB.open(DB_NAME, DB_VERSION);

      req.onupgradeneeded = (event) => {
        const db = event.target.result;
        // Store 1: Cross-page handoffs from landing/tool pages
        if (!db.objectStoreNames.contains(STORE_PENDING)) {
          db.createObjectStore(STORE_PENDING);
        }
        // Store 2: Working document sessions
        if (!db.objectStoreNames.contains(STORE_SESSIONS)) {
          db.createObjectStore(STORE_SESSIONS);
        }
      };

      req.onsuccess = (event) => {
        this.storageAvailable = true;
        resolve(event.target.result);
      };

      req.onerror = (event) => {
        this.storageAvailable = false;
        reject(event.target.error || new Error('Failed to open IndexedDB.'));
      };
    });
  }

  /**
   * Check whether a valid active session is saved in IndexedDB.
   * @returns {Promise<boolean>}
   */
  async hasActiveSession() {
    try {
      const db = await this.openDB();
      return new Promise((resolve) => {
        const tx = db.transaction(STORE_SESSIONS, 'readonly');
        const store = tx.objectStore(STORE_SESSIONS);
        const req = store.get(SESSION_KEY);

        req.onsuccess = () => {
          const session = req.result;
          const isValid = Boolean(
            session &&
            session.sourcePdfBytes &&
            (session.sourcePdfBytes.byteLength > 0 || (session.sourcePdfBytes.buffer && session.sourcePdfBytes.buffer.byteLength > 0))
          );
          resolve(isValid);
        };

        req.onerror = () => resolve(false);
      });
    } catch {
      return false;
    }
  }

  /**
   * Retrieve the active saved session from IndexedDB.
   * @returns {Promise<Object|null>}
   */
  async loadActiveSession() {
    try {
      const db = await this.openDB();
      return new Promise((resolve) => {
        const tx = db.transaction(STORE_SESSIONS, 'readonly');
        const store = tx.objectStore(STORE_SESSIONS);
        const req = store.get(SESSION_KEY);

        req.onsuccess = () => {
          const session = req.result;
          if (!session || !session.sourcePdfBytes) {
            resolve(null);
            return;
          }
          resolve(session);
        };

        req.onerror = (e) => {
          console.warn('Could not read session from IndexedDB:', e);
          resolve(null);
        };
      });
    } catch (err) {
      console.warn('Session load error:', err);
      return null;
    }
  }

  /**
   * Schedule a debounced session save to avoid main-thread and I/O bottlenecks.
   * @param {number} [delay=400]
   */
  scheduleSave(delay = 400) {
    if (this.isRestoring) return;
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
    }
    this.saveTimer = setTimeout(() => {
      this.saveActiveSession().catch((err) => {
        console.warn('Background session save warning:', err);
      });
    }, delay);
  }

  /**
   * Synchronously cancel debounce timer and flush save immediately.
   */
  flushSave() {
    if (this.isRestoring) return;
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }
    this.saveActiveSession().catch(() => {});
  }

  /**
   * Serialize and persist the current working document state into IndexedDB.
   * @returns {Promise<boolean>}
   */
  async saveActiveSession() {
    if (!this.editorApp || this.isRestoring) return false;

    // Check if an active document is actually loaded
    const pdfViewer = this.editorApp.pdfViewer;
    const documentModel = this.editorApp.documentModel;
    const annotationManager = this.editorApp.annotationManager;

    if (!pdfViewer || !pdfViewer.pdfDoc) {
      return false;
    }

    const rawBytes = pdfViewer.getOriginalBytes ? pdfViewer.getOriginalBytes() : pdfViewer.rawArrayBuffer;
    if (!rawBytes || rawBytes.byteLength === 0) {
      return false;
    }

    this.isSaving = true;

    try {
      // 1. Prepare clean clone of primary PDF bytes
      let sourcePdfBytes;
      if (rawBytes instanceof ArrayBuffer) {
        sourcePdfBytes = rawBytes.slice(0);
      } else if (ArrayBuffer.isView(rawBytes)) {
        sourcePdfBytes = rawBytes.buffer.slice(rawBytes.byteOffset, rawBytes.byteOffset + rawBytes.byteLength);
      } else {
        sourcePdfBytes = new Uint8Array(rawBytes).buffer;
      }

      // 2. Serialize secondary source documents if any were imported
      const sourceDocs = [];
      if (documentModel && documentModel.sourceDocs) {
        for (const [docId, docObj] of documentModel.sourceDocs.entries()) {
          if (docId !== documentModel.primaryDocId && docObj && docObj.arrayBuffer) {
            let buf = docObj.arrayBuffer;
            if (buf instanceof ArrayBuffer) {
              buf = buf.slice(0);
            } else if (ArrayBuffer.isView(buf)) {
              buf = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
            }
            sourceDocs.push({
              id: docId,
              name: docObj.name || 'imported.pdf',
              arrayBuffer: buf,
            });
          }
        }
      }

      // 3. Serialize DocumentModel page records
      let pages = [];
      if (documentModel && typeof documentModel.getPages === 'function') {
        pages = documentModel.getPages().map((p) => ({
          id: p.id,
          docId: p.docId,
          sourceIndex: p.sourceIndex,
          width: p.width,
          height: p.height,
          rotation: p.rotation || 0,
          baseRotation: p.baseRotation || 0,
          isBlank: Boolean(p.isBlank),
          customWidth: p.customWidth,
          customHeight: p.customHeight,
          cropBox: p.cropBox ? { ...p.cropBox } : null,
        }));
      }

      // 4. Serialize AnnotationManager annotations by page ID
      const annotationsByPage = [];
      if (annotationManager && typeof annotationManager.getAllAnnotationsByPageId === 'function') {
        const allMap = annotationManager.getAllAnnotationsByPageId();
        for (const [pageId, annotList] of allMap.entries()) {
          if (Array.isArray(annotList) && annotList.length > 0) {
            try {
              // Deep clone serializable annotation objects
              const serializedList = JSON.parse(JSON.stringify(annotList));
              annotationsByPage.push([String(pageId), serializedList]);
            } catch (err) {
              console.warn(`Could not serialize annotations for page ${pageId}:`, err);
            }
          }
        }
      }

      // 5. Assemble session record
      const filename =
        this.editorApp.docMetadata?.name ||
        (documentModel && documentModel.originalFilename) ||
        pdfViewer.currentFile?.name ||
        'document.pdf';

      const filesize = this.editorApp.docMetadata?.size || sourcePdfBytes.byteLength;
      const currentPage = pdfViewer.currentPage || 1;
      const scale = pdfViewer.scale || 1.0;
      const primaryDocId = documentModel?.primaryDocId || null;

      const sessionData = {
        id: SESSION_KEY,
        version: DB_VERSION,
        updatedAt: Date.now(),
        filename,
        filesize,
        primaryDocId,
        sourcePdfBytes,
        sourceDocs,
        pages,
        annotationsByPage,
        currentPage,
        scale,
      };

      // 6. Write to IndexedDB
      const db = await this.openDB();
      await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_SESSIONS, 'readwrite');
        const store = tx.objectStore(STORE_SESSIONS);
        const req = store.put(sessionData, SESSION_KEY);

        req.onsuccess = () => resolve(true);
        req.onerror = (e) => reject(req.error || e);
      });

      return true;
    } catch (err) {
      console.warn('Session persistence error (graceful fallback):', err);
      // Non-blocking notification if quota exceeded
      if (err.name === 'QuotaExceededError') {
        this.onToast('Local browser storage quota reached. Edits remain in active memory.', 'warning');
      }
      return false;
    } finally {
      this.isSaving = false;
    }
  }

  /**
   * Permanently clear the active session from IndexedDB (called on Close Document).
   * @returns {Promise<boolean>}
   */
  async clearActiveSession() {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }

    try {
      const db = await this.openDB();
      return new Promise((resolve) => {
        const tx = db.transaction(STORE_SESSIONS, 'readwrite');
        const store = tx.objectStore(STORE_SESSIONS);
        const req = store.delete(SESSION_KEY);

        req.onsuccess = () => resolve(true);
        req.onerror = () => resolve(false);
      });
    } catch {
      return false;
    }
  }
}
