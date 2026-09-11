# SAVY — Free, Privacy-First Browser PDF Workspace

> **"Your files stay on your device."**

SAVY is a zero-cost, privacy-first, client-side PDF productivity workspace running entirely within the user's web browser. It requires no backend server, no cloud storage buckets, and zero paid API services. All PDF document parsing, page rendering, and future manipulation occur locally in browser memory.

---

## 1. Project Structure

```text
SAVY/
├── index.html              # Polished landing page with hero, upload dropzone, features & privacy matrix
├── editor.html             # Multi-panel SaaS productivity editor interface
├── css/
│   ├── style.css           # Landing page stylesheet (clean typography, responsive, accessible)
│   └── editor.css          # Editor layout stylesheet (3-panel SaaS workspace, toolbars, viewports)
├── js/
│   ├── app.js              # Landing page controller (drag-and-drop, local IndexedDB document handoff)
│   ├── editor.js           # Editor application coordinator (state manager, keyboard shortcuts, DOM bindings)
│   ├── pdf-viewer.js       # PDF.js wrapper (document loading, high-DPI canvas rendering, zoom & page navigation)
│   ├── pdf-tools.js        # Tool registry & lifecycle (Phase 1 viewing modes and Phase 2 disabled tool specs)
│   └── export.js           # pdf-lib export engine scaffolding & Phase 2 export pipeline interface
├── assets/
│   ├── icons/              # Clean SVG icons (tools, zoom, navigation, shields, files)
│   └── images/             # SAVY branding (vector logo mark & wordmark, privacy shield badges)
├── manifest.json           # Web App Manifest with standalone display configuration
├── robots.txt              # Standard robots directive allowing indexation of public pages
├── sitemap.xml             # XML sitemap indexing landing and editor entry points
├── metadata.json           # AI Studio applet metadata declaration
├── package.json            # Development environment configuration
├── vite.config.ts          # Vite multi-page configuration
└── README.md               # Architectural documentation & developer guide
```

---

## 2. Dependencies Used

### External Engines (Loaded via Reliable CDNs in Sandbox)
* **PDF.js (`v3.11.174`)**: Mozilla’s open-source library for client-side PDF document parsing and HTML5 canvas rendering.
* **pdf-lib (`v1.17.9`)**: Pure JavaScript PDF creation, assembly, and manipulation library ready for Phase 2 export workflows.

### Local Development Tooling
* **Vite (`^6.2.3`)**: Fast static development server and multi-page bundler.
* **HTML5 / Vanilla ES Modules**: Pure, standards-compliant JavaScript requiring no heavy application framework runtime.

---

## 3. What Was Implemented (Phase 1 Foundation)

### Landing Page (`index.html`)
1. **SAVY Branding**: Vector wordmark and clean icon mark.
2. **Product Messaging**: Clear headlines, subheadlines, and value propositions highlighting local processing.
3. **Primary CTAs**: Direct "Launch PDF Editor" button and "Browse Device Files" triggers.
4. **Local Upload Dropzone**: Drag-and-drop area supporting instant file selection with zero network transmission.
5. **Client-Side Handoff**: Uses browser `IndexedDB` (`SAVY_LOCAL_STORE`) to pass dropped PDF files directly from the landing page to the editor without query string limits or server uploads.
6. **Feature Overview Catalog**: Detailed cards distinguishing Phase 1 ready features from Phase 2 roadmap items.
7. **Privacy & Architecture Section**: Architectural explanation of the zero-cloud model and memory lifecycle.
8. **Security Comparison Table**: Comparison showing SAVY vs. traditional cloud PDF tools.
9. **Semantic & Responsive Footer**: Navigation links, open engine links, and copyright statements.

### Editor Workspace (`editor.html`)
1. **Top Navigation Header**:
   - SAVY brand link back to landing page.
   - Live file information chip (filename, page count, and formatted file size).
   - "Files Stay on Your Device" privacy indicator.
   - "Open PDF" file chooser button.
   - "Export" button with clear Phase 2 disabled badge.
2. **Left-Side Tool Panel**:
   - Operational Phase 1 tools: Selection Mode (`V`) and Hand/Pan Tool (`H`).
   - Visually polished Phase 2 tools: Text Annotation, Freehand Drawing, Insert Image, Digital Signature, and Page Organizer.
   - **Honest Disabled States**: Phase 2 tools show distinct visual styling and trigger informative toasts without pretending to alter documents.
3. **Main PDF Workspace**:
   - Empty state card with dropzone and browse button.
   - High-DPI canvas page viewport powered by PDF.js with real-time scaling for Retina displays.
   - Local loading spinner during document decoding.
4. **Floating Bottom Navigation**:
   - Previous and Next page controls with boundary state disabling.
   - Interactive page number input field (`Page X / Total Y`).
   - Zoom out (`-`), Zoom presets (`50%`, `75%`, `100%`, `125%`, `150%`, `200%`, `Fit Width`, `Fit Page`), and Zoom in (`+`).
5. **Right-Side Properties Panel**:
   - Document metadata inspector (name, size, total pages, PDF version).
   - Active tool details and Phase 2 roadmap configuration notes.
   - Local security status confirmation.
6. **Keyboard Shortcuts**:
   - `Cmd/Ctrl + O`: Open PDF file dialog.
   - `PageDown` / `ArrowRight`: Advance to next page.
   - `PageUp` / `ArrowLeft`: Return to previous page.
   - `+` / `=`: Zoom in.
   - `-`: Zoom out.

---

## 4. What Was Intentionally NOT Implemented (Phase 2 Scope)

To maintain strict adherence to project constraints and avoid deceptive placeholder functionality:
* **No Fake Editing**: No simulated text boxes, fake draw marks, or unrendered canvas overlays that pretend to alter the PDF.
* **No Simulated Export**: The export button informs the user that pdf-lib assembly is scheduled for Phase 2, rather than producing corrupt or dummy files.
* **No Server Upload APIs**: No backend endpoints, REST endpoints, or server-side file receivers were created.
* **No Third-Party Analytics**: No tracking pixels or telemetry libraries.
* **No Paid Services**: 100% free and open architecture.

---

## 5. Known Limitations

* **Single-Page Viewport in Phase 1**: The viewer currently renders one page at a time with instant navigation. Continuous vertical scrolling across multi-page documents is part of the Phase 2 rendering expansion.
* **Encrypted / Password-Protected PDFs**: PDFs with proprietary DRM or master passwords will display a standard parsing notice; decryption workflows are planned for subsequent milestones.

---

## 6. How to Run the Project Locally

1. **Clone or navigate to the project directory**:
   ```bash
   cd SAVY
   ```

2. **Install dependencies** (development server only):
   ```bash
   npm install
   ```

3. **Start the local development server**:
   ```bash
   npm run dev
   ```

4. **Access the application**:
   - Landing Page: `http://localhost:3000/` or `http://localhost:3000/index.html`
   - Editor Workspace: `http://localhost:3000/editor.html`

5. **Build for production static hosting**:
   ```bash
   npm run build
   ```
   The compiled output in `dist/` can be deployed for free on GitHub Pages, Cloudflare Pages, Vercel, Netlify, or any static web host.
