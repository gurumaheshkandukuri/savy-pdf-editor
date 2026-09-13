# SAVY — Free, Privacy-First Browser PDF Workspace

> **"Your PDF is processed locally in your browser and is never uploaded to SAVY servers."**

SAVY is an open-source, zero-cost, privacy-first PDF productivity workspace running entirely within your web browser. Engineered with modern WebAssembly, HTML5 Canvas, and client-side JavaScript standards, SAVY requires no backend server, no cloud storage buckets, and zero paid API services. All PDF parsing, high-DPI rendering, vector editing, page organizing, toolbox conversions, and in-memory AI intelligence occur strictly within the client device sandbox.

---

## 1. Project Structure

```text
SAVY/
├── index.html              # Landing page (hero, dropzone, feature catalog, tools directory, FAQ, comparison matrix)
├── editor.html             # Multi-panel SaaS productivity editor workspace
├── privacy.html            # Standalone technical Privacy Policy & Security Architecture page
├── tools/                  # 10 dedicated client-side SEO tool pages
│   ├── pdf-editor.html     # Free Online PDF Editor
│   ├── merge-pdf.html      # Merge PDF Files Online
│   ├── split-pdf.html      # Split PDF Pages Online
│   ├── compress-pdf.html   # Compress PDF Online
│   ├── pdf-to-image.html   # Convert PDF to Images (PNG/JPG)
│   ├── image-to-pdf.html   # Convert Images (JPG/PNG/WebP) to PDF
│   ├── pdf-to-text.html    # Extract Text from PDF Online
│   ├── redact-pdf.html     # Redact PDF Documents Privately
│   ├── pdf-forms.html      # Fill Out Interactive PDF Forms Online
│   └── ocr-pdf.html        # Free OCR PDF Scanner
├── css/
│   ├── style.css           # Landing & tool pages stylesheet (clean typography, responsive, accessible, FAQ accordion)
│   └── editor.css          # Editor layout stylesheet (3-panel workspace, modals, toolbars, viewports)
├── js/
│   ├── app.js              # Landing page controller (drag-and-drop, local IndexedDB document handoff, FAQ accordion)
│   ├── tool-page.js        # Dedicated tool page controller (dropzone handoff to editor via IndexedDB)
│   ├── editor.js           # Editor coordinator (state manager, keyboard shortcuts, DOM bindings, toasts, action routing)
│   ├── pdf-viewer.js       # PDF.js wrapper (document loading, high-DPI canvas rendering, zoom, viewport sync)
│   ├── pdf-tools.js        # Tool registry & lifecycle (editing tools, toolbars, settings, single-key hotkeys)
│   ├── document-model.js   # Logical document model (stable page IDs, reorder, rotate, delete, insert, split)
│   ├── pdf-page-operations.js # pdf-lib page engine (compile, extract, split, merge, crop, resize, bates, forms)
│   ├── page-organizer.js   # Thumbnail sidebar (lazy rendering, drag-and-drop reorder, selection, batch actions)
│   ├── annotation-manager.js # Annotation lifecycle & coordinate transformation (keyed by stable pageId)
│   ├── history-manager.js  # Discrete Undo/Redo stack for annotations and page operations
│   ├── pdf-toolbox.js      # Phase 4 PDF Toolbox (Images->PDF, PDF->Images zip, Text, Compress, Metadata, Flatten)
│   ├── security-manager.js # Phase 5 Security Manager (Object URL tracking, inspector, memory reset, privacy center)
│   ├── redaction-manager.js # Phase 5 Redaction Engine (Permanent Visual Redaction & Sanitized Rasterization)
│   ├── search-manager.js   # Phase 6 Search & Highlight Engine (text extraction, bounding box overlay, next/prev)
│   ├── presentation-manager.js # Phase 6 Presentation Mode (fullscreen slide deck, keyboard navigation, HUD)
│   ├── ocr-manager.js      # Phase 6 Client-Side OCR Engine (Tesseract.js WebAssembly, multi-page recognition)
│   ├── productivity-manager.js # Phase 6 Productivity Coordinator (Crop, Resize, Headers/Footers, Bates, Stamps, Forms)
│   ├── ai-manager.js       # Phase 8 AI PDF Intelligence (Summary, Ask Your PDF, Key Points, Outline, BM25)
│   └── export.js           # PDF export interface (delegates to PDFPageOperations for multi-source assembly)
├── assets/
│   ├── icons/              # Clean SVG icons (tools, zoom, navigation, shields, organizer, redaction, AI, forms)
│   └── images/             # SAVY branding (vector logo mark, wordmark, og-preview 1200x630, apple-touch-icon 180x180)
├── public/                 # Static assets copied directly to dist/ during production build
│   ├── 404.html            # Standalone static 404 fallback page
│   ├── _redirects          # Clean URL routing rules for Netlify and Cloudflare Pages
│   ├── vercel.json         # Deployment configuration, routing rewrites, and security headers for Vercel
│   ├── robots.txt          # Web crawler indexation directives with query duplicate disallow
│   ├── sitemap.xml         # XML search engine sitemap with all 10 tool pages
│   ├── manifest.json       # Web App Manifest with standalone display configuration
│   └── sw.js               # Service Worker providing offline app-shell caching (zero document caching)
├── .github/
│   └── workflows/
│       └── deploy.yml      # Zero-config GitHub Actions workflow for automatic GitHub Pages deployment
├── LICENSE                 # Open-source MIT License
├── manifest.json           # Root Web App Manifest
├── sw.js                   # Root Service Worker
├── robots.txt              # Root robots directive
├── sitemap.xml             # Root XML sitemap
├── package.json            # Client-side dependency specification and build/test scripts
├── vite.config.ts          # Multi-page Vite production bundler configuration (relative base './')
└── README.md               # Architectural documentation & deployment manual
```

---

## 2. Dependencies & Third-Party Network Disclosures

SAVY has **zero backend servers** and transmits **zero document data** over the network. To maintain complete transparency, the following external libraries are downloaded by the client browser:

| Library / Resource | Source / CDN | Version | Purpose & Execution Details |
| :--- | :--- | :--- | :--- |
| **PDF.js** (Mozilla) | `cdnjs.cloudflare.com` | `3.11.174` | Client-side document parsing, text token extraction, and high-DPI canvas page rendering. |
| **PDF.js Web Worker** | `cdnjs.cloudflare.com` | `3.11.174` | Offloads PDF parsing and rasterization into an asynchronous background Web Worker thread. |
| **PDF.js CMaps** | `cdn.jsdelivr.net` | `3.11.174` | Standard character glyph font mappings for rendering non-Latin and CJK (Chinese, Japanese, Korean) PDF files. |
| **pdf-lib** | `cdnjs.cloudflare.com` | `1.17.1` | Client-side PDF binary creation, page assembly, rotation, extraction, watermarking, AcroForm generation, and compilation. |
| **Tesseract.js** | `cdn.jsdelivr.net` | `5.1.0` | *Optional & Lazy-Loaded:* Client-side OCR engine executing via WebAssembly in browser workers. Only downloaded if the user explicitly triggers OCR. |

All libraries run strictly inside the local browser sandbox. **No PDF document bytes, text tokens, images, or metadata are ever transmitted to any external server.**

---

## 3. Comprehensive Feature Catalog

### High-Fidelity Viewer (Phase 1)
- **High-DPI Canvas Rendering**: Crisp rendering on Retina/4K displays (`window.devicePixelRatio`).
- **Smooth Viewport Zooming**: Continuous zoom (50% to 300%), Fit Page, and Fit Width presets with pixel-perfect coordinate scaling.
- **Fast Page Navigation**: Keyboard arrow controls (`←`/`→`), Page Up/Down, direct page input jump, and next/prev buttons.

### Core Vector Editing Engine (Phase 2)
- **Inline Text Tool (`T`)**: Place customizable text annotations (Helvetica, Times Roman, Courier, 12–48pt, bold, italic, custom color).
- **Freehand Pen Drawing (`P`)**: Real-time smooth quadratic Bezier ink strokes with adjustable line thickness (1–20px) and palette selection.
- **Highlighter (`L`)**: Translucent highlight strokes and rectangular bounding areas with adjustable opacity.
- **Vector Geometric Shapes (`R`, `C`, `A`)**: Interactive creation of Rectangles, Circles/Ellipses, and Lines/Arrows with solid or transparent fills.
- **Local Image Placement (`I`)**: Place local PNG, JPG, and WebP images onto any PDF page with proportional scaling and move handles.
- **Digital Signatures (`S`)**: In-browser signature modal with drawing canvas, ink color options, clear canvas, and transparency support.
- **Selection & Transform (`V`)**: 8-point bounding box handles (NW, N, NE, E, SE, S, SW, W) for interactive moving, resizing, and deleting.
- **Discrete Action History (`Ctrl+Z`, `Ctrl+Y`)**: Complete Undo/Redo stack tracking edits without memory cloning.
- **Coordinate Invariance Layer**: Normalizes all annotations into physical 72-DPI PDF point space. Edits remain locked in place across all zoom levels and window resizes.

### PDF Page Organizer & Document Operations (Phase 3)
- **Page Thumbnail Sidebar**: Miniature preview cards rendered via PDF.js, live page badges, and selection checkboxes.
- **Multi-Page Selection & Batch Actions**: Click, shift/control multi-select, Select All, and Clear Selection.
- **Drag-and-Drop Page Reordering**: HTML5 drag-and-drop reordering with visual drop indicators and keyboard shift fallback.
- **Page Manipulation**: Delete pages (with 1-page minimum protection), duplicate pages, and rotate 90°/180° clockwise/counter-clockwise.
- **Multi-Document Operations**: Extract selected pages to standalone PDF, split PDF by page ranges, and merge multiple separate local PDF files.
- **Page Insertion**: Insert blank pages (Letter, A4, or match document) and insert selected pages from other local PDFs.
- **Annotation Stability Guarantee**: Annotations are bound to persistent logical page IDs (`page_xxx`), remaining pinned to their content across reordering, duplication, deletion, and rotation.

### Client-Side PDF Toolbox (Phase 4)
- **Images → PDF**: Convert JPG, JPEG, PNG, and WebP images into a single PDF document with custom page sizes (Fit to Image, Letter, A4) and orientation.
- **PDF → Images**: Convert current page, selected pages, or entire documents into high-resolution PNG or JPG images at 1x, 1.5x, or 2x scales. Multi-page exports are packaged into a standard in-memory `.zip` archive.
- **PDF → Text**: Client-side text extraction across pages with line reconstruction, page separators, clipboard copy, and `.txt` download.
- **PDF Compression**: Dual-mode client-side optimization with original vs. output byte size comparison (Lossless Stream Optimization and Visual Screen Optimization).
- **PDF Metadata Editor**: View, edit, and sanitize PDF Document Information dictionary fields (Title, Author, Subject, Keywords, Creator, Producer).
- **Watermark & Page Numbers Engine**: Apply customizable text watermarks (rotation, opacity, position) and burn professional legal page numbering formats (`Page {n} of {total}`).
- **PDF Flattening**: Permanently burns all active overlay annotations (text, pen strokes, shapes, signatures) into base PDF vector streams.

### Privacy, Document Security & Redaction (Phase 5)
- **Privacy Center & Indicator**: Accessible from header badge, sidebar, and landing page with full technical disclosures.
- **Dual-Mode Redaction Engine (`X`)**:
  - *Mode A (Permanent Visual Redaction)*: Burns solid opaque black vector rectangles into the PDF stream via `pdf-lib`.
  - *Mode B (Sanitized Redaction via Rasterization)*: Renders redacted pages to high-DPI canvas, permanently destroying underlying text tokens from the file. Programmatic text extraction confirms zero remaining characters.
- **Document Security & Privacy Inspector**: Live monitoring of sandbox status, metadata hygiene, active overlays, flattening state, and encryption status.
- **Session Memory Purge**: Single-click "Close Document" cancels active render tasks, purges models from RAM, and revokes all tracked Object URLs.

### Advanced PDF Productivity (Phase 6)
- **In-Page Search & Highlighting (`Ctrl+F`)**: Client-side text search using PDF.js `getTextContent()`, sub-character bounding box highlight overlays, multi-token chunk matching, case-sensitive toggle, match counter (`X of Y`), and auto-scrolling page navigation.
- **Lossless Crop Pages**: Losslessly updates `/CropBox` in the PDF page dictionary via `pdf-lib` without rasterization.
- **Page Resizing & Margins**: Resizes pages to A4, US Letter, or custom dimensions with custom margins (0–72pt) while preserving vector sharpness.
- **Headers & Footers**: Burns multi-position headers and footers with dynamic tokens (`{page}`, `{total}`, `{filename}`, `{date}`).
- **Legal Bates Numbering**: Padded discovery numbering with custom prefix, suffix, and 6-position alignment.
- **Document Status Stamps (`M`)**: Standard stamps (`APPROVED`, `CONFIDENTIAL`, `DRAFT`, `FINAL`) and custom stamp builder with rotation.
- **AcroForm Builder (`F`)**: Creates interactive ISO 32000 form fields (Text Input, Checkbox, Dropdown, Radio Groups) compatible with Adobe Acrobat and web browser form-fillers.
- **Client-Side OCR**: Local text recognition using `Tesseract.js` in WebAssembly workers with progress bar and plain text download.
- **Fullscreen Presentation Mode (`F5`)**: Distraction-free presentation slide deck with dark backdrop and keyboard arrow navigation.

### UX, Responsive Design & Performance (Phase 7)
- **Responsive Layouts**: Desktop (1440px+), Tablet (768–1024px), Mobile (390px), and Ultra-Compact (360px) with zero horizontal overflow.
- **Mobile Bottom Bar**: Prominent touch-friendly bottom navigation bar for mobile viewports (<768px).
- **Off-Canvas Drawer**: Slide-out Page Organizer drawer with interactive backdrop.
- **Keyboard Shortcuts Cheat Sheet (`?`)**: Full hotkey reference modal with single-key tool switching.
- **Non-Blocking Toast System**: Stacked notifications for success, warning, error, and info states.
- **Large Document Optimization (50+ Pages)**: `IntersectionObserver` deferred lazy-loading of thumbnails, in-memory LRU thumbnail caching, and cooperative event-loop yielding.
- **Offline PWA**: Web App Manifest and Service Worker providing offline app shell availability.

### AI PDF Intelligence (Phase 8)
- **100% Local NLP & Heuristic Engine**: Runs entirely within volatile browser RAM without external API calls or server queues.
- **Hardware Probing**: Runtime detection for WebGPU, Chrome Built-in Prompt API (`window.ai`), and WebAssembly.
- **TextRank PDF Summaries**: Graph centrality scoring generating concise, balanced, or executive deep-dive summaries with page citations.
- **Ask Your PDF (Grounded Q&A — Zero Hallucinations)**: BM25 relevance retrieval with strict grounding guardrails. Explicitly discloses when information is not present.
- **AI Key Points & Dynamic Outline**: Salient sentence extraction and structural heading detection with one-click page navigation.
- **Smart Text Actions**: Summarize, Explain, Simplify jargon (`utilize` $\rightarrow$ `use`), Rewrite concisely, and Extract Entities (dates, currencies, emails).
- **BM25 Ranked Context Search**: Relevance-ranked passage search with highlighted `<mark>` keywords.

### SEO, Discoverability & Public Launch (Phase 10)
- **10 Dedicated SEO Tool Pages**: `/tools/pdf-editor`, `/tools/merge-pdf`, `/tools/split-pdf`, `/tools/compress-pdf`, `/tools/pdf-to-image`, `/tools/image-to-pdf`, `/tools/pdf-to-text`, `/tools/redact-pdf`, `/tools/pdf-forms`, `/tools/ocr-pdf`.
- **Interactive Tool Handoff**: Dedicated dropzones with drag-over visual cues, file format validation, local IndexedDB document storage, and pre-activated tool action parameter routing (`?action=<tool>`).
- **Semantic HTML & Clean Heading Hierarchy**: Structured semantic elements (`<main>`, `<section>`, `<header>`, `<footer>`, `<nav>`, `<ol>`) with clean `<h1>` $\rightarrow$ `<h2>` $\rightarrow$ `<h3>` hierarchies.
- **Search Engine Optimization & Metadata**: Canonical URLs, meta descriptions, viewport scaling, Open Graph tags (`og:title`, `og:description`, `og:image`, `og:url`), and Twitter Cards (`summary_large_image`).
- **Authentic Schema.org Structured Data**: Complete JSON-LD markup declaring `WebApplication`/`SoftwareApplication` metadata, `BreadcrumbList` hierarchies, and rich `FAQPage` entities with real user Q&As.
- **Social Sharing Assets**: High-resolution 1200x630 Open Graph preview image (`og-preview.png`), SVG vector master (`og-preview.svg`), and 180x180 Apple Touch Icon (`apple-touch-icon.png`).
- **Indexation Directives**: `sitemap.xml` detailing priority and change frequency across all public pages, and `robots.txt` disallowing query duplicate states (`/editor.html?*`).
- **FAQ Accordion Component**: Interactive, accessible question-and-answer accordions with `aria-expanded` state tracking and smooth CSS transitions.

---

## 4. Technical Realities & Documented Limitations

To maintain uncompromising honesty and transparency with users and enterprise reviewers, SAVY documents its architectural boundaries:

1. **Client-Side AI vs. Cloud LLMs**:
   SAVY's standard AI engine uses local Extractive NLP (TextRank graph centrality, BM25 ranking, and rule-based heuristic parsing). It runs 100% offline with zero external network dependencies. It extracts and ranks verbatim sentences from the loaded document with zero hallucination risk. When Chrome's Built-in Prompt API (`window.ai`) or local WebGPU models are detected, generative capability runs on local device hardware. SAVY will never silently send your document to a cloud model.
2. **Client-Side OCR Hardware Bounds**:
   OCR utilizes `Tesseract.js` running in browser WebAssembly. Recognition speed and accuracy depend on client CPU speed, available RAM, and scan resolution (300 DPI recommended). Complex low-contrast handwriting or skewed mobile photos may have lower recognition rates than server-based proprietary neural OCR clusters.
3. **AcroForm Form Field Support**:
   SAVY generates standard, compliant ISO 32000 AcroForm widgets (text inputs, checkboxes, dropdowns, radio groups). It deliberately does NOT support running untrusted, embedded PDF JavaScript calculation scripts for security and sandboxing reasons.
4. **Native PDF Encryption**:
   Standard client-side `pdf-lib` does not implement ISO 32000 cryptographic handlers (AES-128, AES-256, RC4). True password encryption requires a dedicated cryptographic implementation. SAVY refuses to fake or simulate encryption and transparently informs the user.
5. **Browser Tab Memory Ceilings**:
   Because SAVY processes documents entirely in browser RAM, extremely massive files (e.g. 500+ scanned high-resolution pages or files exceeding 500MB) may approach browser tab memory limits (typically 2GB to 4GB depending on the OS and browser).

---

## 5. Free Static Hosting Deployment Guides

Because SAVY is 100% client-side with no server or database, it can be deployed for **free** on any static web host or CDN.

### Option A: GitHub Pages (Recommended)

1. Push your repository to GitHub:
   ```bash
   git init
   git add .
   git commit -m "SAVY v1.0.0 Production Release"
   git branch -M main
   git remote add origin https://github.com/YOUR_USERNAME/savy-pdf-editor.git
   git push -u origin main
   ```
2. In your GitHub repository:
   - Go to **Settings** $\rightarrow$ **Pages**.
   - Under **Build and deployment** $\rightarrow$ **Source**, select **GitHub Actions**.
3. The included workflow `.github/workflows/deploy.yml` will automatically build the workspace and publish your site to `https://YOUR_USERNAME.github.io/savy-pdf-editor/`.
4. *Subdirectory Compatibility*: The `vite.config.ts` uses `base: './'`, ensuring all assets, scripts, service workers, and navigation links work out of the box on repository subpaths!

### Option B: Cloudflare Pages

1. Log in to the [Cloudflare Dashboard](https://dash.cloudflare.com/) and navigate to **Workers & Pages** $\rightarrow$ **Create Application** $\rightarrow$ **Pages** $\rightarrow$ **Connect to Git**.
2. Select your repository.
3. Configure build settings:
   - **Framework preset**: `Vite`
   - **Build command**: `npm run build`
   - **Build output directory**: `dist`
4. Click **Save and Deploy**. Cloudflare Pages automatically honors the included `public/_redirects` file for client-side routing.

### Option C: Vercel

1. Import your GitHub repository on [Vercel](https://vercel.com/new).
2. Configure project settings:
   - **Framework Preset**: `Vite`
   - **Build Command**: `npm run build`
   - **Output Directory**: `dist`
3. Click **Deploy**. Vercel automatically applies the included `vercel.json` for clean URLs, routing rewrites, and strict security headers (`nosniff`, `DENY` framing).

### Option D: Netlify

1. Connect your repository on [Netlify](https://app.netlify.com/).
2. Set build configuration:
   - **Build command**: `npm run build`
   - **Publish directory**: `dist`
3. Click **Deploy Site**. Netlify automatically uses `public/_redirects` to route all page requests cleanly.

---

## 6. Local Development & Verification

### Prerequisites
- Node.js `v18.0.0` or higher
- npm `v9.0.0` or higher

### Installation
```bash
# Clone the repository
git clone https://github.com/YOUR_USERNAME/savy-pdf-editor.git
cd savy-pdf-editor

# Install development dependencies
npm install
```

### Development Server
```bash
npm run dev
```
Open `http://localhost:3000` to view the landing page, or `http://localhost:3000/editor.html` to access the editor.

### Production Build
```bash
npm run build
```
Compiles and minifies all assets into the `dist/` directory.

### Preview Production Build Locally
```bash
npm run preview
```
Runs a local static web server serving the compiled `dist/` folder on port 4173.

### Automated Regression Test Suites
SAVY features an automated test harness executed directly against live browser instances via the Chrome DevTools Protocol (CDP):

```bash
npm test
```

Runs **automated tests across 10 comprehensive suites**:
- **Phase 10 Suite**: SEO meta tag verification, Open Graph & Twitter Cards, Schema.org JSON-LD validity, 10 dedicated tool pages, sitemap & robots directives, and live dropzone handoff.
- **Phase 9 Suite**: Production build integrity, manifest, robots, sitemap, 404, static security headers, and in-browser compiled runtime validation.
- **Phase 8 Suite**: AI summarization, BM25 grounded Q&A, anti-hallucination guardrails, key points, outline navigation, smart transforms, and privacy compliance.
- **Phase 7 Suite**: Multi-device viewport responsiveness (360px–1440px), mobile bottom bar, off-canvas drawer, toasts, keyboard shortcuts, 52-page lazy-loading, and WCAG AA compliance.
- **Phase 6 Suite**: In-page search, lossless crop, page resizing, headers/footers, Bates numbering, stamps, AcroForm generation, OCR modal, and document inspector.
- **Phase 5 Suite**: Security inspector, visual redaction, sanitized raster redaction, memory wipe, and 0-upload network audit.
- **Phase 4 Suite**: WebP/JPG/PNG to PDF, PDF to image conversion, text extraction, lossless compression, and flattening.
- **Phase 3 Suite**: Page organizer, drag-and-drop reordering, rotation, deletion, blank page insertion, split, merge, and persistent annotation stability.
- **Phase 2 Suite**: Core editing engine, text, pen, highlights, vector shapes, signatures, 8-point transform handles, undo/redo, and export.
- **Zoom Fidelity Suite**: Coordinate invariance and pixel-perfect rendering across 50%, 100%, 150%, 200%, Fit Width, and Fit Page zoom levels.

---

## 7. Security & Privacy Audit Summary

A source code audit verified:
- **0** `fetch()` or `XMLHttpRequest` calls in client application modules (only `sw.js` uses standard `fetch()` to cache offline app shell assets).
- **0** `WebSocket` connections used by client modules.
- **0** `navigator.sendBeacon` telemetry transmissions.
- **0** tracking cookies, profiling cookies, or third-party analytics pixels.
- **0** document content written to persistent `localStorage` or `sessionStorage`.
- **0** hardcoded local paths, test credentials, or API keys in source code.
- **0** external font phone-homes (uses native system font stack).

---

## 8. License

This project is licensed under the open-source **MIT License** — see the [LICENSE](./LICENSE) file for details.
