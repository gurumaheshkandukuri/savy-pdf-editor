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
    description: 'Select text and viewport navigation',
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
    id: 'annotate_text',
    name: 'Text Annotation',
    icon: '/assets/icons/type.svg',
    phase: 2,
    status: 'disabled_phase_2',
    description: 'Add scalable text blocks, notes, and highlights',
    shortcut: 'T',
  },
  {
    id: 'draw_ink',
    name: 'Freehand Draw',
    icon: '/assets/icons/pen.svg',
    phase: 2,
    status: 'disabled_phase_2',
    description: 'Sketch, underline, and mark up pages with vector ink',
    shortcut: 'P',
  },
  {
    id: 'insert_image',
    name: 'Insert Image',
    icon: '/assets/icons/image.svg',
    phase: 2,
    status: 'disabled_phase_2',
    description: 'Insert images, stamps, and logos directly into pages',
    shortcut: 'I',
  },
  {
    id: 'add_signature',
    name: 'Digital Signature',
    icon: '/assets/icons/signature.svg',
    phase: 2,
    status: 'disabled_phase_2',
    description: 'Create and place cryptographic signatures or drawn initials',
    shortcut: 'S',
  },
  {
    id: 'organize_pages',
    name: 'Organize Pages',
    icon: '/assets/icons/layers.svg',
    phase: 2,
    status: 'disabled_phase_2',
    description: 'Rotate, reorder, delete, and extract PDF pages',
    shortcut: 'O',
  },
];

export class PDFTools {
  constructor({ onToolChange, onPhase2Notice }) {
    this.tools = [...TOOL_DEFINITIONS];
    this.activeToolId = 'select';
    this.onToolChange = onToolChange || (() => {});
    this.onPhase2Notice = onPhase2Notice || (() => {});
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

  /**
   * Attempt to select a tool.
   * If the tool belongs to Phase 2, triggers honest notification and does NOT activate.
   * @param {string} toolId
   */
  selectTool(toolId) {
    const tool = this.getTool(toolId);
    if (!tool) return false;

    if (tool.phase === 2) {
      this.onPhase2Notice(tool);
      return false;
    }

    this.activeToolId = toolId;
    this.onToolChange(tool);
    return true;
  }

  isPhase2(toolId) {
    const tool = this.getTool(toolId);
    return tool ? tool.phase === 2 : false;
  }
}
