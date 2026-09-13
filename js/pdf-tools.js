/**
 * SAVY PDF Workspace — Tool Registry & Lifecycle (pdf-tools.js)
 * Manages active viewport tools and provides clean disabled specifications
 * for tools scheduled for Phase 2 implementation.
 *
 * Strict Rule: Phase 2 tools NEVER pretend to execute or alter documents.
 */

export const TOOL_DEFINITIONS = [
  {
    id: 'select',
    name: 'Select',
    icon: '/assets/icons/mouse-pointer.svg',
    phase: 1,
    status: 'active',
    description: 'Select, move, resize, and edit annotations (Esc to deselect)',
    shortcut: 'V',
  },
  {
    id: 'hand',
    name: 'Hand Tool',
    icon: '/assets/icons/hand.svg',
    phase: 1,
    status: 'active',
    description: 'Pan around the document canvas',
    shortcut: 'H',
  },
  {
    id: 'edit_text',
    name: 'Edit Text',
    icon: '/assets/icons/type.svg',
    phase: 2,
    status: 'active',
    description: 'Visual text replacement: click existing text to mask and replace words',
    shortcut: 'E',
  },
  {
    id: 'annotate_text',
    name: 'Add Text',
    icon: '/assets/icons/type.svg',
    phase: 2,
    status: 'active',
    description: 'Click anywhere on page to create new text box',
    shortcut: 'T',
  },
  {
    id: 'draw_ink',
    name: 'Freehand Pen',
    icon: '/assets/icons/pen.svg',
    phase: 2,
    status: 'active',
    description: 'Draw smooth freehand ink markup directly on pages',
    shortcut: 'P',
  },
  {
    id: 'highlight',
    name: 'Highlight',
    icon: '/assets/icons/highlighter.svg',
    phase: 2,
    status: 'active',
    description: 'Drag to highlight areas or content with semi-transparent tint',
    shortcut: 'L',
  },
  {
    id: 'shape_rect',
    name: 'Rectangle',
    icon: '/assets/icons/square.svg',
    phase: 2,
    status: 'active',
    description: 'Drag to draw vector rectangles or boxes',
    shortcut: 'R',
  },
  {
    id: 'shape_circle',
    name: 'Circle',
    icon: '/assets/icons/circle.svg',
    phase: 2,
    status: 'active',
    description: 'Drag to draw vector circles and ellipses',
    shortcut: 'C',
  },
  {
    id: 'shape_line',
    name: 'Line / Arrow',
    icon: '/assets/icons/arrow-up-right.svg',
    phase: 2,
    status: 'active',
    description: 'Drag to draw straight lines and directional arrows',
    shortcut: 'A',
  },
  {
    id: 'insert_image',
    name: 'Insert Image',
    icon: '/assets/icons/image.svg',
    phase: 2,
    status: 'active',
    description: 'Upload and place PNG, JPG, or WebP images onto the page',
    shortcut: 'I',
  },
  {
    id: 'add_signature',
    name: 'Signature',
    icon: '/assets/icons/signature.svg',
    phase: 2,
    status: 'active',
    description: 'Draw and place signatures locally',
    shortcut: 'S',
  },
  {
    id: 'redact',
    name: 'Redact Area',
    icon: '/assets/icons/eye-off.svg',
    phase: 5,
    status: 'active',
    description: 'Draw redaction boxes to permanently mask or sanitize sensitive content',
    shortcut: 'X',
  },
  {
    id: 'stamp',
    name: 'Stamp',
    icon: '/assets/icons/stamp.svg',
    phase: 6,
    status: 'active',
    description: 'Place approved, draft, confidential, or custom status stamps',
    shortcut: 'M',
  },
  {
    id: 'form_field',
    name: 'Form Field',
    icon: '/assets/icons/form.svg',
    phase: 6,
    status: 'active',
    description: 'Insert interactive AcroForm text fields, checkboxes, dropdowns, and radios',
    shortcut: 'F',
  },
];

export class PDFTools {
  constructor({ onToolChange, onPhase2Notice, onSettingsChange }) {
    this.tools = [...TOOL_DEFINITIONS];
    this.activeToolId = 'select';
    this.onToolChange = onToolChange || (() => {});
    this.onPhase2Notice = onPhase2Notice || (() => {});
    this.onSettingsChange = onSettingsChange || (() => {});

    // Active tool settings
    this.settings = {
      color: '#2563EB',
      strokeWidth: 3,
      fillColor: 'transparent',
      opacity: 1.0,
      fontSize: 16,
      fontFamily: 'Helvetica',
      bold: false,
      italic: false,
      underline: false,
      align: 'left',
      arrow: false,
    };
  }

  getTools() {
    return this.tools;
  }

  getTool(id) {
    return this.tools.find((t) => t.id === id) || null;
  }

  getActiveTool() {
    return this.getTool(this.activeToolId);
  }

  getSettings() {
    return { ...this.settings };
  }

  updateSettings(newSettings) {
    this.settings = { ...this.settings, ...newSettings };
    this.onSettingsChange(this.settings);
  }

  /**
   * Select a tool.
   * If the tool belongs to Phase 3 (e.g. page organize), triggers honest notification.
   * @param {string} toolId
   */
  selectTool(toolId) {
    const tool = this.getTool(toolId);
    if (!tool) return false;

    if (tool.status === 'disabled_phase_3' || tool.phase === 3) {
      this.onPhase2Notice(tool);
      return false;
    }

    this.activeToolId = toolId;
    this.onToolChange(tool);
    return true;
  }

  isPhase3(toolId) {
    const tool = this.getTool(toolId);
    return tool ? tool.phase === 3 : false;
  }
}
