# SAVY — Document Session Persistence Audit & Technical Report

**Date:** September 14, 2026  
**Status:** ✅ RESOLVED & VERIFIED  
**Component:** SAVY Core Workspace — Local Session Engine  
**Storage Architecture:** Browser-Local IndexedDB (`SAVY_LOCAL_STORE`, Version 2)  
**Privacy Guarantee:** Your files are processed locally in your browser and are never uploaded to SAVY servers. (SAVY may fetch static application resources, libraries, and updates over the network, which can subsequently be served from the browser/service-worker cache.)  

---

## 1. Executive Summary & Root Cause Analysis

### 1.1 The Production Bug
Prior to this fix, when a user opened a PDF document in SAVY, made edits (including text annotations, drawing ink, shapes, page rotations, blank page additions, page reordering), and subsequently refreshed the browser window (or experienced accidental navigation), all document state was lost. The workspace reloaded into the blank default empty state (`#emptyState`), forcing users to re-select their file and completely redo their modifications.

### 1.2 Root Cause Analysis
Comprehensive audit of `js/editor.js` and workspace state lifecycle revealed two fundamental root causes:

1. **Transient Memory State:** In-memory objects managing document pages (`DocumentModel`) and annotations (`AnnotationManager`) stored all mutations strictly in JavaScript memory heap variables. No persistent browser storage adapter was bound to their state change event pipelines.
2. **Destructive Temporary Handoff Deletion:** The cross-page document handoff mechanism in `getPendingDocument()` read the payload from IndexedDB store `pending_documents` and immediately executed `store.delete('active_pdf')`. Furthermore, documents opened directly in `/editor` (via file input, drag-and-drop, or toolbox) were never committed to IndexedDB. Consequently, upon any page refresh, `pending_documents` was empty, no fallback session store existed, and the editor defaulted to `#emptyState`.

---

## 2. Architecture of the 100% Client-Side Local Persistence Engine

To eliminate data loss while strictly preserving SAVY's zero-cloud privacy architecture, a dedicated **`SessionManager`** module was designed and integrated:

```
                                    SAVY WORKSPACE ARCHITECTURE
                                    
  +-----------------------------------------------------------------------------------+
  | BROWSER RUNTIME (Client Sandbox)                                                  |
  |                                                                                   |
  |  +------------------------+      +---------------------+     +-----------------+  |
  |  |     DocumentModel      |      |  AnnotationManager  |     |    PDFViewer    |  |
  |  |  (Pages, Order, Rot.)  |      |   (Text, Ink, Box)  |     |  (Page, Zoom)   |  |
  |  +-----------+------------+      +----------+----------+     +--------+--------+  |
  |              |                              |                         |           |
  |              | 'change' event               | onAnnotationChange      | Page/Zoom |
  |              +----------------------+       |                         |           |
  |                                     v       v                         v           |
  |                           +-----------------------------------------------+       |
  |                           |     SessionManager (js/session-manager.js)    |       |
  |                           |  - Debounced Auto-Save (400ms)                |       |
  |                           |  - Unload Flush (beforeunload / pagehide)     |       |
  |                           |  - Rehydration Engine (isRestoring Guard)     |       |
  |                           +-----------------------+-----------------------+       |
  |                                                   |                               |
  |                                                   v                               |
  |                           +-----------------------------------------------+       |
  |                           |       IndexedDB: SAVY_LOCAL_STORE (v2)        |       |
  |                           |  - pending_documents (Cross-page handoffs)    |       |
  |                           |  - document_sessions (Active session record)  |       |
  |                           +-----------------------+-----------------------+       |
  |                                                                                   |
  |  No Server Uploads   |  Local Processing Only  |  No LocalStorage Binary Abuse  |
  +-----------------------------------------------------------------------------------+
```

### 2.1 Storage Schema: IndexedDB `SAVY_LOCAL_STORE` (Version 2)
- **Database:** `SAVY_LOCAL_STORE`
- **Version:** `2`
- **Stores:**
  1. `pending_documents`: Ephemeral handoff store used by landing page and dedicated tool pages (`/tools/*`). Entries are single-use and cleared once consumed.
  2. `document_sessions`: Persistent store holding the active working document session.
- **Record Key:** `active_session`
- **Record Payload Structure:**
  - `id`: `'active_session'`
  - `version`: `2`
  - `updatedAt`: Epoch timestamp (ms)
  - `filename`: Document filename string (e.g., `contract.pdf`)
  - `filesize`: Original file size in bytes
  - `primaryDocId`: Primary DocumentModel document ID
  - `sourcePdfBytes`: `ArrayBuffer` copy of original PDF binary (IndexedDB structured clone)
  - `sourceDocs`: Array of secondary imported PDFs for multi-document operations
  - `pages`: Array of `PageRecord` objects (`id`, `docId`, `sourceIndex`, `width`, `height`, `rotation`, `baseRotation`, `isBlank`, `cropBox`)
  - `annotationsByPage`: Array of `[pageId, annotList]` tuples storing deep-cloned JSON annotation objects
  - `currentPage`: Active viewport page index
  - `scale`: Active viewport zoom level

---

## 3. Lifecycle & State Machine

### 3.1 Initial Document Ingestion
When a user opens a PDF:
1. `EditorApp.loadFile()` or `checkInitialPayload()` executes.
2. `SessionManager.clearActiveSession()` ensures any obsolete session is purged.
3. `PDFViewer.loadDocument()` loads and renders page 1.
4. `handleDocumentLoaded()` initializes `DocumentModel` and schedules an initial session save with a 100ms debounce.

### 3.2 Continuous Auto-Save
1. Any structural change in `DocumentModel` (rotate, delete, duplicate, reverse, blank page insertion, page reorder) fires the `change` event $\rightarrow$ triggers `sessionManager.scheduleSave(400)`.
2. Any annotation change in `AnnotationManager` (add, edit, resize, delete, style change) triggers `onAnnotationChange` $\rightarrow$ triggers `sessionManager.scheduleSave(400)`.
3. Undo and Redo actions trigger `historyManager.onHistoryChange` $\rightarrow$ triggers `sessionManager.scheduleSave(400)`.
4. Page navigation or zoom changes trigger debounced saves (800ms) to preserve user reading position.
5. In-flight debounced saves are immediately flushed to disk synchronously via `sessionManager.flushSave()` on `beforeunload` and `pagehide`.

### 3.3 Session Rehydration (Page Refresh)
When the user refreshes or re-enters `/editor`:
1. `checkInitialPayload()` first inspects `pending_documents`. If an explicit newly dropped document exists, it takes precedence.
2. If no handoff exists, it queries `sessionManager.loadActiveSession()`.
3. If an active session is found:
   - Sets `sessionManager.isRestoring = true` to guard against race conditions or duplicate saves.
   - Instantiates a Blob and File object from `sourcePdfBytes`.
   - Calls `pdfViewer.loadDocument()`. `handleDocumentLoaded()` recognizes `isRestoring` and returns early without overwriting the state with default pages.
   - Rehydrates `documentModel.pages` with exact rotations, dimensions, and custom pages.
   - Rehydrates secondary source documents.
   - Rehydrates all annotations into `annotationManager.annotationsByPage`.
   - Rehydrates viewport zoom (`scale`) and navigates to `currentPage`.
   - Re-renders active canvas, annotation layer, and page organizer thumbnails.
   - Clears `isRestoring = false` and displays toast: `Restored session: <filename>`.

### 3.4 Close Document Integrity
When the user explicitly clicks **"Close Document"**:
1. `EditorApp.closeDocument()` calls `sessionManager.clearActiveSession()`.
2. `SecurityManager.resetWorkspace()` clears memory, revokes object URLs, cancels render tasks, and ensures `sessionManager.clearActiveSession()` is executed.
3. Reloading the page after closing guarantees the editor opens in the clean empty state (`No document opened`, `#emptyState` visible) without resurrecting ghosts of closed documents.

---

## 4. Comprehensive Automated Verification Results

A 12-test automated browser QA harness (`scratch/test-session-persistence-qa.mjs`) was executed using headless Chromium with Chrome DevTools Protocol (CDP) over a local HTTP server emulating Cloudflare Pages production routing.

| # | Test Case | Target State / Action | Result | Verification Details |
|---|---|---|---|---|
| **1** | Initial Clean State | Fresh visit to `/editor` | **✅ PASS** | `#emptyState` displayed, `#fileName` is 'No document opened', no PDF loaded |
| **2** | Document Ingestion & Save | Load 3-page sample PDF | **✅ PASS** | Document rendered (3 pages); IndexedDB `active_session` written with valid bytes |
| **3** | Text Annotation Persistence | Add text annotation $\rightarrow$ `Page.reload` | **✅ PASS** | PDF reloaded; Text annotation restored on Page 1 (`PERSISTENCE_TEST_TEXT_OK`) |
| **4** | Freehand Ink Persistence | Add ink stroke $\rightarrow$ `Page.reload` | **✅ PASS** | PDF reloaded; Freehand ink annotation restored on Page 1 |
| **5** | Shape (Rectangle) Persistence | Add rectangle shape $\rightarrow$ `Page.reload` | **✅ PASS** | PDF reloaded; Shape annotation restored on Page 1 |
| **6** | Page Rotation Persistence | Rotate Page 1 by 90° $\rightarrow$ `Page.reload` | **✅ PASS** | PDF reloaded; Page 1 rotation restored to 90° |
| **7** | Page Insertion (Blank Page) | Insert blank page $\rightarrow$ `Page.reload` | **✅ PASS** | Total pages restored to 4; Page 2 confirmed blank |
| **8** | Active Viewport & Zoom | Navigate to p.3, 150% zoom $\rightarrow$ reload | **✅ PASS** | Viewport restored on Page 3 with scale 1.5 |
| **9** | Close Document Integrity | Close Document $\rightarrow$ reload | **✅ PASS** | IndexedDB session deleted; reload opens clean empty state (zero resurrection) |
| **10** | Landing Page Precedence | Stage handoff file $\rightarrow$ load editor | **✅ PASS** | Explicit newly dropped file takes precedence and replaces old session |
| **11** | Direct File Open Precedence | Open new PDF over active $\rightarrow$ reload | **✅ PASS** | Newly opened PDF replaces session and persists on refresh |
| **12** | Privacy & Local Document Processing | Monitor network requests during tests | **✅ PASS** | Verified: Your files are processed locally in your browser and are never uploaded to SAVY servers. (SAVY may fetch static application resources, libraries, and updates over the network, which can subsequently be served from the browser/service-worker cache.) |

**Overall Suite Result: 12 / 12 PASSED (100% SUCCESS RATE)**

---

## 5. Visual Artifacts & Screenshot Evidence

Full-page Chromium CDP screenshots were captured during automated test execution and saved to the session artifacts directory:

1. **`session-before-refresh.png`** (101,521 bytes)  
   Shows active PDF document with custom text annotation and edits placed on the canvas before browser refresh.
2. **`session-after-refresh.png`** (100,519 bytes)  
   Shows identical PDF document, page sequence, and annotations rehydrated seamlessly after browser reload.
3. **`session-after-close-document.png`** (92,670 bytes)  
   Shows clean empty workspace state after user clicked "Close Document" and reloaded, verifying zero ghost resurrection.

---

## 6. Non-Regression Verification

1. **Cloudflare Pages Clean URL MPA Routing:**  
   Ran `node scratch/test-routing-qa.mjs` across all 15 direct routes (`/`, `/editor`, `/privacy`, `/terms`, `/tools/*`). All 15 passed with zero loops and zero console errors.
2. **Production Bundle Build:**  
   Ran `npm run build` with Vite 6.4.3. All 43 modules compiled with zero warnings or errors in 888ms.
3. **Parked Features:**  
   True existing-PDF text replacement / Find & Replace remains completely untouched and parked.
4. **Privacy Policy Disclosure:**  
   Updated Section 4 of `privacy.html` with transparent disclosure of local IndexedDB session persistence.

---

## 7. Conclusion

The critical production bug where SAVY loses PDF and edits on page refresh is **fully resolved**. The local session persistence engine provides robust, seamless session recovery for all supported document edits while preserving SAVY's core commitment to 100% client-side privacy.
