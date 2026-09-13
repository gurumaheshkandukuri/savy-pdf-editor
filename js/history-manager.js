/**
 * SAVY PDF Workspace — History Manager (history-manager.js)
 * Manages discrete undo/redo action stacks for client-side annotations.
 * Memory-safe: Stores only delta object states, never cloning full PDF documents.
 */

export class HistoryManager {
  constructor({ onHistoryChange } = {}) {
    this.undoStack = [];
    this.redoStack = [];
    this.maxHistory = 50;
    this.onHistoryChange = onHistoryChange || (() => {});
  }

  /**
   * Record a new action into the undo stack and clear the redo stack.
   * @param {Object} action - { type: 'ADD'|'DELETE'|'MODIFY'|'BATCH', ...payload }
   */
  push(action) {
    this.undoStack.push(action);
    if (this.undoStack.length > this.maxHistory) {
      this.undoStack.shift();
    }
    this.redoStack = [];
    this.notify();
  }

  canUndo() {
    return this.undoStack.length > 0;
  }

  canRedo() {
    return this.redoStack.length > 0;
  }

  setAnnotationManager(annotationManager) {
    this.annotationManager = annotationManager;
  }

  /**
   * Revert the most recent action.
   * @param {AnnotationManager} [annotationManager]
   */
  undo(annotationManager) {
    if (!this.canUndo()) return false;
    const am = annotationManager || this.annotationManager;
    const action = this.undoStack.pop();
    this.applyInverse(action, am);
    this.redoStack.push(action);
    this.notify();
    return true;
  }

  /**
   * Re-apply the most recently undone action.
   * @param {AnnotationManager} [annotationManager]
   */
  redo(annotationManager) {
    if (!this.canRedo()) return false;
    const am = annotationManager || this.annotationManager;
    const action = this.redoStack.pop();
    this.applyForward(action, am);
    this.undoStack.push(action);
    this.notify();
    return true;
  }

  applyInverse(action, annotationManager) {
    const pageKey = action.pageId || action.pageNumber;
    switch (action.type) {
      case 'ADD':
        annotationManager.removeAnnotation(pageKey, action.annotation.id, false);
        break;
      case 'DELETE':
        annotationManager.insertAnnotation(pageKey, action.annotation, false);
        break;
      case 'MODIFY':
        annotationManager.updateAnnotationDirect(pageKey, action.id, action.before, false);
        break;
      case 'BATCH':
        for (let i = action.actions.length - 1; i >= 0; i--) {
          this.applyInverse(action.actions[i], annotationManager);
        }
        break;
      case 'DOCUMENT_PAGES':
        if (action.documentModel && action.before) {
          action.documentModel.restoreSnapshot(action.before);
        }
        break;
    }
  }

  applyForward(action, annotationManager) {
    const pageKey = action.pageId || action.pageNumber;
    switch (action.type) {
      case 'ADD':
        annotationManager.insertAnnotation(pageKey, action.annotation, false);
        break;
      case 'DELETE':
        annotationManager.removeAnnotation(pageKey, action.annotation.id, false);
        break;
      case 'MODIFY':
        annotationManager.updateAnnotationDirect(pageKey, action.id, action.after, false);
        break;
      case 'BATCH':
        for (let i = 0; i < action.actions.length; i++) {
          this.applyForward(action.actions[i], annotationManager);
        }
        break;
      case 'DOCUMENT_PAGES':
        if (action.documentModel && action.after) {
          action.documentModel.restoreSnapshot(action.after);
        }
        break;
    }
  }

  clear() {
    this.undoStack = [];
    this.redoStack = [];
    this.notify();
  }

  notify() {
    this.onHistoryChange({
      canUndo: this.canUndo(),
      canRedo: this.canRedo(),
    });
  }
}
