/**
 * SAVY PDF Workspace — PDF Export Module (export.js)
 * Architecture foundation for client-side PDF document generation and modification
 * leveraging pdf-lib (CDN-loaded).
 *
 * Phase 1 Architecture: Establishes pipeline interfaces and disabled states.
 * Full byte compilation and annotation burning will be implemented in Phase 2.
 */

export class PDFExport {
  constructor({ onExportBlocked }) {
    this.onExportBlocked = onExportBlocked || (() => {});
    this.isPhase2Ready = false;
  }

  /**
   * Check availability of the pdf-lib runtime
   */
  isEngineLoaded() {
    return typeof window !== 'undefined' && Boolean(window.PDFLib);
  }

  /**
   * Trigger export attempt.
   * In Phase 1, safely informs the user that compilation is scheduled for Phase 2.
   * Never produces corrupt, mock, or fake files.
   */
  requestExport(docMetadata) {
    this.onExportBlocked({
      title: 'PDF Export Engine (Phase 2)',
      message:
        'Client-side PDF compilation via pdf-lib is planned for Phase 2. In Phase 1, your document is loaded and viewed purely in memory without modification.',
      docName: docMetadata?.name || 'document.pdf',
    });
    return false;
  }

  /**
   * Future Phase 2 pipeline entrypoint
   * @param {ArrayBuffer} sourceBytes
   * @param {Array<Object>} modificationLayers
   */
  async compileModifiedDocument(sourceBytes, modificationLayers = []) {
    if (!this.isEngineLoaded()) {
      throw new Error('pdf-lib is not available in the current environment.');
    }
    // Phase 2 implementation will use PDFLib.PDFDocument.load(sourceBytes)
    throw new Error('PDF export pipeline is scheduled for Phase 2.');
  }
}
