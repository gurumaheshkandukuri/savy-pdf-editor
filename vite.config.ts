import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  return {
    base: './',
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    build: {
      rollupOptions: {
        input: {
          main: path.resolve(__dirname, 'index.html'),
          editor: path.resolve(__dirname, 'editor.html'),
          privacy: path.resolve(__dirname, 'privacy.html'),
          pdfEditor: path.resolve(__dirname, 'tools/pdf-editor.html'),
          mergePdf: path.resolve(__dirname, 'tools/merge-pdf.html'),
          splitPdf: path.resolve(__dirname, 'tools/split-pdf.html'),
          compressPdf: path.resolve(__dirname, 'tools/compress-pdf.html'),
          pdfToImage: path.resolve(__dirname, 'tools/pdf-to-image.html'),
          imageToPdf: path.resolve(__dirname, 'tools/image-to-pdf.html'),
          pdfToText: path.resolve(__dirname, 'tools/pdf-to-text.html'),
          redactPdf: path.resolve(__dirname, 'tools/redact-pdf.html'),
          pdfForms: path.resolve(__dirname, 'tools/pdf-forms.html'),
          ocrPdf: path.resolve(__dirname, 'tools/ocr-pdf.html'),
        },
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {
        ignored: ['**/scratch/**', '**/dist/**'],
      },
    },
  };
});
