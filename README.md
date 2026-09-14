# SAVY

**A free, privacy-first, browser-based PDF workspace for editing, organizing, converting, and managing PDF documents locally.**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Build: Vite](https://img.shields.io/badge/Build-Vite%206.x-646CFF.svg?logo=vite&logoColor=white)](https://vitejs.dev/)
[![JavaScript: ES Modules](https://img.shields.io/badge/JavaScript-ES%20Modules-F7DF1E.svg?logo=javascript&logoColor=black)](https://developer.mozilla.org/en-US/docs/Web/JavaScript)
[![PDF Engine: PDF.js & pdf--lib](https://img.shields.io/badge/PDF%20Engine-PDF.js%20%7C%20pdf--lib-E0234E.svg)](https://mozilla.github.io/pdf.js/)
[![PWA: Ready](https://img.shields.io/badge/PWA-Offline%20App%20Shell-5A0FC8.svg)](manifest.json)
[![Hosting: Cloudflare Pages](https://img.shields.io/badge/Deploy-Cloudflare%20Pages-F38020.svg?logo=cloudflare&logoColor=white)](https://pages.cloudflare.com/)

[**Live Application**](https://savy-pdf-editor.pages.dev/) • [**GitHub Repository**](https://github.com/gurumaheshkandukuri/savy-pdf-editor) • [**Privacy Policy**](https://savy-pdf-editor.pages.dev/privacy)

---

> **"Your files are processed locally in your browser and are never uploaded to SAVY servers."**

SAVY is an open-source, privacy-first PDF productivity workspace designed to deliver professional-grade document manipulation directly inside modern web browsers. Built on open web standards—including HTML5 Canvas, Web Workers, WebAssembly, and modern client-side JavaScript—SAVY executes document parsing, rendering, editing, page organization, format conversion, and text recognition entirely on your device.

With SAVY, there is no backend document processing server, no remote file storage, and no required user account for standard workflows. Your sensitive contracts, invoices, personal records, and confidential PDFs stay where they belong: securely on your device.

---

## Features

SAVY provides a comprehensive set of verified, client-side document utilities organized into specialized workflows:

### PDF Editing & Workspace
- **High-Fidelity Document Viewer**: High-DPI canvas rendering optimized for Retina and 4K displays with continuous zoom (50%–300%), Fit Page, and Fit Width presets.
- **Vector Text Annotations**: Add custom text elements with customizable fonts (Helvetica, Times Roman, Courier), font sizes, weights, and color palettes.
- **Freehand Drawing & Highlighting**: Smooth quadratic Bezier ink pen tool with adjustable stroke width and translucent highlighter overlays.
- **Vector Shapes**: Draw rectangles, circles, ellipses, lines, and arrows with customizable border widths and fills.
- **Image Placement**: Embed local PNG, JPEG, and WebP images onto PDF pages with intuitive 8-point bounding box transform handles.
- **Digital Signatures**: Draw, customize, and place electronic signatures with transparent backgrounds.
- **Discrete Undo & Redo**: Multi-step history stack (`Ctrl+Z`, `Ctrl+Y`) tracking additions, edits, and deletions without unnecessary memory cloning.
- **Coordinate Invariance**: Mathematical 72-DPI coordinate transformation layer ensuring annotations stay locked to exact page points across all zoom levels.

### PDF Organization
- **Visual Page Organizer**: Interactive sidebar with live page thumbnail rendering and multi-page selection.
- **Drag-and-Drop Reordering**: Rearrange document sequence using native drag-and-drop or keyboard controls.
- **Page Rotation & Duplication**: Non-destructively rotate single pages, odd/even pages, or full documents in 90° increments, or duplicate target pages.
- **Page Extraction & Deletion**: Delete unwanted pages (with minimum single-page protection) or extract selected page ranges into a fresh PDF document.
- **Document Merging**: Combine multiple separate PDF files into a unified document with custom ordering.
- **Document Splitting**: Split documents into distinct files by specific page numbers or custom page ranges.
- **Page Numbering & Watermarks**: Stamp dynamic legal numbering (`Page {n} of {total}`) and custom semi-transparent watermarks with adjustable angle and opacity.

### PDF Conversion
- **PDF → Image (PNG / JPG)**: Render individual pages or complete documents into high-resolution images, with multi-page sets bundled into an in-memory ZIP archive.
- **Images → PDF**: Convert batches of JPG, PNG, and WebP files into a unified PDF document with configurable page margins and orientations.
- **PDF → Text**: Extract selectable text across document pages with line reconstruction, one-click clipboard copying, and `.txt` file export.
- **PDF → Word (.docx)**: Convert document text blocks and structure into compliant Microsoft Word OpenXML (`.docx`) files.
- **PDF → Excel (.xlsx)**: Parse aligned data columns and tabular content into valid OpenXML (`.xlsx`) workbooks.
- **PDF → PowerPoint (.pptx)**: Transform PDF pages into compliant ISO/IEC 29500 PresentationML slide decks with DrawingML shape packaging.
- **PDF → Markdown (.md)**: Extract structured headings, paragraphs, and lists into formatted Markdown files.
- **HTML → PDF**: Render structured HTML content (headings, paragraphs, tables, lists, and page breaks) into multi-page PDF documents.

### OCR & Documents
- **Client-Side Optical Character Recognition**: Recognize text from scanned documents and bitmap images locally using `Tesseract.js` in background WebAssembly workers.
- **Scan to PDF**: Capture physical documents using your device's camera stream with high-contrast filter options.
- **PDF Form Filling**: Inspect, complete, and flatten standard interactive ISO 32000 AcroForm fields (text boxes and checkboxes).
- **PDF Comparison**: Compare two PDF documents side-by-side with word-level Myers diff highlighting for fast review of revisions.
- **PDF Repair**: Re-index uncorrupted object streams and rebuild damaged cross-reference (xref) tables in local memory.

### Security & Privacy
- **Permanent Visual Redaction**: Burn solid opaque redaction blocks into the PDF structure.
- **Sanitized Raster Redaction**: Render sensitive pages onto high-resolution canvas surfaces, completely destroying underlying text glyphs and vectors before exporting.
- **Metadata Sanitization**: View, modify, or strip document information dictionary fields (Title, Author, Subject, Keywords, Creator).
- **Document Security Inspector**: Live overview of document sandbox state, active overlay elements, flattening status, and memory consumption.
- **Volatile Session Memory Purge**: Single-click "Close Document" cancels active rendering threads, clears data structures from RAM, and revokes all active blob URLs.

### Productivity & Navigation
- **In-Page Search & Highlighting (`Ctrl+F`)**: Search document text content with real-time bounding box highlights, case-matching toggles, and auto-scrolling navigation.
- **Lossless Crop Pages**: Adjust page boundary boxes (`/CropBox`) without lossy re-encoding.
- **Page Resizing & Margins**: Adjust dimensions to standard international sizes (A4, US Letter) with configurable margins.
- **Legal Bates Numbering**: Apply sequential indexed Bates numbering for discovery, compliance, and legal workflows.
- **Status Stamps**: Apply standard business stamps (`APPROVED`, `CONFIDENTIAL`, `DRAFT`, `FINAL`) or custom text stamps.
- **Distraction-Free Presentation Mode (`F5`)**: Display PDF slides in fullscreen with keyboard navigation and presenter HUD controls.

### Progressive Web App (PWA)
- **Offline Application Shell**: Service Worker (`sw.js`) caches application code, stylesheets, and icons for instant loading even without an internet connection.
- **Installable Desktop/Mobile App**: Web App Manifest (`manifest.json`) allows SAVY to be installed as a standalone desktop or mobile application.
- **Responsive Layout**: Fluid layouts accommodating desktop monitors (1440px+), laptops, tablets, and smartphones (390px) with dedicated touch navigation.

---

## Privacy First

SAVY was designed from the ground up around a strict client-side security architecture:

```
┌────────────────────────────────────────────────────────────────────────┐
│                        USER'S DEVICE (BROWSER)                         │
│                                                                        │
│   ┌──────────────────┐    Local Stream     ┌───────────────────────┐   │
│   │   PDF Document   │ ──────────────────> │   SAVY Web App        │   │
│   │   (Local Disk)   │                     │   (Sandboxed Memory)  │   │
│   └──────────────────┘                     └───────────────────────┘   │
│            ▲                                           │               │
│            │          Direct Local Download            ▼               │
│            └─────────────────────────────────── ┌───────────────────┐  │
│                                                 │   Processed File  │  │
│                                                 │   (In-Memory Blob)│  │
│                                                 └───────────────────┘  │
└────────────────────────────────────────────────────────────────────────┘
                                    │
                         ZERO DOCUMENT UPLOADS
                                    ▼
                         ┌────────────────────┐
                         │    SAVY SERVERS    │
                         │  (None / No-Op)    │
                         └────────────────────┘
```

- **Local Document Processing**: When you open a PDF, file bytes are read directly into browser memory using standard HTML5 `FileReader` and `Blob` APIs. All parsing, rendering, and modifications happen locally.
- **No Document Uploads**: Files are never transmitted to SAVY servers or third-party cloud processing buckets.
- **No Server-Side File Storage**: Because there is no backend application server, SAVY has no file storage mechanisms, databases, or logs containing your documents.
- **Transparent Network Model**: Network activity is restricted to fetching static application assets (HTML, CSS, JavaScript, icons, and WebAssembly bundles). When online, standard CDN requests load pre-compiled libraries; when offline, these assets are served from the local Service Worker cache.
- **Volatile Storage**: Documents are not stored in persistent browser databases (`localStorage` or remote databases). Closing the tab or clicking "Close Document" immediately purges document buffers and revokes in-memory Object URLs.

---

## Technology Stack

SAVY is engineered with modern, standards-compliant web technologies:

| Technology | Layer / Role | Description |
| :--- | :--- | :--- |
| **HTML5 & CSS3** | Presentation | Semantic markup, responsive flexbox/grid layouts, accessible forms, and custom property design tokens. |
| **JavaScript (ES2022+)** | Core Logic | Modular client-side architecture using native ES Modules for state management, document models, and UI routing. |
| **Vite 6.x** | Build & Bundler | High-speed build tool providing optimized asset bundling, tree-shaking, and multi-page static compilation. |
| **PDF.js (Mozilla)** | PDF Rendering | Parses PDF binaries, extracts text content streams, and rasterizes pages to HTML5 Canvas elements with high-DPI scaling. |
| **pdf-lib** | PDF Manipulation | Low-level client-side PDF binary creation, page assembly, metadata editing, AcroForm generation, and vector compiling. |
| **Tesseract.js** | OCR Engine | WebAssembly port of the Tesseract OCR engine, running optical character recognition in background Web Worker threads. |
| **OpenXML Engine** | Export Builders | Custom-built, standards-compliant packaging engine creating valid Microsoft Office `.docx`, `.xlsx`, and `.pptx` files. |
| **Web Workers** | Concurrency | Offloads intensive parsing and image processing tasks from the main thread to maintain a 60 FPS user interface. |
| **Service Worker & PWA** | Caching & Offline | Intercepts static asset requests to provide offline availability and installable desktop/mobile functionality. |

---

## Tool Suite

The following table summarizes the status of the tools currently available in SAVY:

| Tool | Category | Status | Technical Details |
| :--- | :--- | :--- | :--- |
| **Merge PDF** | PDF Organization | `Fully Functional` | Combines multiple PDF files with custom ordering into a single output document. |
| **Split PDF** | PDF Organization | `Fully Functional` | Extracts single pages, ranges, or bursts documents into standalone PDF files. |
| **Organize PDF** | PDF Organization | `Fully Functional` | Visual thumbnail organizer supporting drag-and-drop reordering, duplication, and deletion. |
| **Rotate PDF** | PDF Organization | `Fully Functional` | Rotates individual pages, all pages, or odd/even pages in 90° increments. |
| **Crop PDF** | PDF Organization | `Fully Functional` | Non-destructively adjusts `/CropBox` boundaries on target pages. |
| **Page Numbers** | PDF Organization | `Fully Functional` | Applies formatted page numbers across custom header/footer positions. |
| **Watermark PDF** | PDF Organization | `Fully Functional` | Stamps semi-transparent text watermarks with custom rotation, size, and opacity. |
| **PDF → JPG / PNG** | PDF Conversion | `Fully Functional` | Renders PDF pages to high-resolution PNG or JPEG images; packages sets into ZIP archives. |
| **Images → PDF** | PDF Conversion | `Fully Functional` | Converts JPG, PNG, and WebP images into formatted multi-page PDF documents. |
| **PDF → Text** | PDF Conversion | `Fully Functional` | Extracts raw and formatted text with line reconstruction and `.txt` file export. |
| **PDF → Word** | PDF Conversion | `Limited but Functional` | Generates compliant OpenXML `.docx` documents preserving text blocks and headings. |
| **PDF → Excel** | PDF Conversion | `Limited but Functional` | Extracts aligned tabular columns into valid OpenXML `.xlsx` spreadsheets. |
| **PDF → PowerPoint** | PDF Conversion | `Limited but Functional` | Builds compliant PresentationML `.pptx` slide decks with DrawingML page layouts. |
| **PDF → Markdown** | PDF Conversion | `Limited but Functional` | Converts document headings, lists, and paragraphs into formatted Markdown. |
| **PDF → PDF/A** | PDF Conversion | `Limited but Functional` | Embeds PDF/A-1b XMP metadata, sRGB color intents, and identification schemas. |
| **HTML → PDF** | PDF Conversion | `Limited but Functional` | Renders styled HTML (typography, tables, lists, breaks) into multi-page PDFs. |
| **OCR PDF** | OCR & Scanning | `Limited but Functional` | Extracts text from scanned documents locally using client-side WebAssembly. |
| **Scan → PDF** | OCR & Scanning | `Fully Functional` | Captures pages from webcams or mobile camera streams with document contrast filters. |
| **Redact PDF** | Security | `Fully Functional` | Permanently scrubs sensitive text via high-resolution rasterization and vector blocking. |
| **Compress PDF** | Optimization | `Fully Functional` | Optimizes document size through lossy image re-encoding and redundant stream cleanup. |
| **Compare PDF** | Productivity | `Fully Functional` | Performs side-by-side Myers diff analysis highlighting textual changes between revisions. |
| **PDF Forms** | Productivity | `Fully Functional` | Inspects, fills, and flattens interactive ISO 32000 AcroForm inputs and checkboxes. |
| **Repair PDF** | Recovery | `Limited but Functional` | Rebuilds corrupted trailer dictionaries and reconstructs damaged xref tables in memory. |
| **Image → Word** | Documents | `Fully Functional` | Converts scanned images into valid OpenXML `.docx` documents with DrawingML structures. |

*Note: Features that cannot currently be executed with high fidelity entirely in client browser memory without third-party servers (such as desktop-quality Word/Excel/PowerPoint-to-PDF rendering or native ISO 32000 cryptosystem passwords) are intentionally not exposed in the user interface to prevent placeholder outputs.*

---

## How It Works

SAVY operates as a pure client-side web application:

1. **Document Selection**: You select a file via drag-and-drop or the file picker. The browser reads the file bytes locally into a typed array (`Uint8Array`).
2. **Local Parsing & Rendering**: Mozilla's `PDF.js` parses the cross-reference tables and content streams inside a background Web Worker, rasterizing the requested viewport onto an HTML5 `<canvas>` surface.
3. **In-Memory Manipulation**: When you add annotations, organize pages, or convert formats, operations are executed in memory by `pdf-lib` and custom client-side builders.
4. **Interactive Preview**: Changes are immediately previewed on the canvas without making any network roundtrips.
5. **Instant Client-Side Export**: The finalized document is assembled into a binary `Blob`, and a temporary browser object URL triggers a direct local download to your filesystem.

---

## Getting Started

### Prerequisites
- [Node.js](https://nodejs.org/) (v18.0.0 or higher recommended)
- [npm](https://www.npmjs.com/) (v9.0.0 or higher)

### Installation

```bash
# Clone the repository
git clone https://github.com/gurumaheshkandukuri/savy-pdf-editor.git

# Navigate to the project directory
cd savy-pdf-editor

# Install dependencies
npm install
```

### Development Server

```bash
npm run dev
```

Starts the local Vite development server at `http://localhost:3000`. You can test the landing page at `/` or open the editor workspace at `/editor.html`.

### Building for Production

```bash
npm run build
```

Compiles and bundles the application into the `dist/` directory, optimized with minified assets and pre-rendered multi-page HTML entry points.

### Previewing the Production Build

```bash
npm run preview
```

Serves the compiled `dist/` folder locally to verify production behavior, clean URLs, and service worker registration.

### Running Automated QA Tests

```bash
npm test
```

Executes the comprehensive automated browser test suite (covering SEO, build integrity, responsive design, coordinate fidelity, toolbox converters, and document operations).

---

## Deployment

Because SAVY compiles to a 100% static client-side bundle, it can be hosted on any modern static web host or CDN:

### Cloudflare Pages (Production Setup)
- **Build command**: `npm run build`
- **Build output directory**: `dist`
- SAVY uses Cloudflare Pages native clean URL handling for its multi-page application.

### GitHub Pages
- A GitHub Actions workflow is provided in `.github/workflows/deploy.yml`.
- Go to repository **Settings** $\rightarrow$ **Pages** $\rightarrow$ **Source** $\rightarrow$ **GitHub Actions** to enable automatic builds on push to `main`.

### Vercel / Netlify
- Compatible out of the box using the included `vercel.json` and `public/_redirects` configuration files.

---

## Browser Support

SAVY supports all modern evergreen browsers that implement ES2022, WebAssembly, and standard HTML5 Canvas APIs:

| Browser | Supported Versions |
| :--- | :--- |
| **Google Chrome** | Version 90+ |
| **Microsoft Edge** | Version 90+ |
| **Mozilla Firefox** | Version 88+ |
| **Apple Safari** | Version 15+ |

---

## License

This project is licensed under the open-source **MIT License** — see the [LICENSE](LICENSE) file for complete details.

---

## Contributing

Contributions, issues, and feature suggestions are welcome! Feel free to check the [issues page](https://github.com/gurumaheshkandukuri/savy-pdf-editor/issues) to report bugs or submit pull requests.
