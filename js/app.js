/**
 * SAVY PDF Workspace — Landing Page Controller (app.js)
 * Coordinates user interactions, local drag-and-drop file ingestion,
 * and client-side transfer to the editor workspace.
 *
 * Privacy Guarantee: No network payloads or telemetry.
 */

const DB_NAME = 'SAVY_LOCAL_STORE';
const STORE_NAME = 'pending_documents';

function openIndexedDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = (e) => resolve(e.target.result);
    request.onerror = (e) => reject(e.target.error);
  });
}

async function storePendingDocument(file) {
  try {
    const db = await openIndexedDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const payload = {
        file: file,
        name: file.name,
        size: file.size,
        timestamp: Date.now(),
      };
      const req = store.put(payload, 'active_pdf');
      req.onsuccess = () => resolve(true);
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.warn('Local storage handoff warning:', err);
    return false;
  }
}

function initLanding() {
  const uploadZone = document.getElementById('landingUploadZone');
  const fileInput = document.getElementById('landingFileInput');
  const btnBrowse = document.getElementById('btnLandingBrowse');
  const inlineError = document.getElementById('landingInlineError');
  const loadingState = document.getElementById('landingLoadingState');

  function showError(msg) {
    if (inlineError) {
      inlineError.textContent = msg;
      inlineError.style.display = 'flex';
    }
    if (loadingState) loadingState.style.display = 'none';
    uploadZone?.setAttribute('aria-invalid', 'true');
  }

  function clearError() {
    if (inlineError) {
      inlineError.textContent = '';
      inlineError.style.display = 'none';
    }
    uploadZone?.removeAttribute('aria-invalid');
  }

  async function handleSelectedFile(file) {
    if (!file) return;

    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      showError('Please select a valid PDF file (.pdf). Other formats are not supported for direct editing.');
      return;
    }

    clearError();
    if (loadingState) loadingState.style.display = 'flex';
    if (btnBrowse) btnBrowse.disabled = true;

    // Save to local IndexedDB for the editor session
    await storePendingDocument(file);

    // Redirect to the editor clean URL
    window.location.href = '/editor';
  }

  // Click on dropzone or browse button
  uploadZone?.addEventListener('click', (e) => {
    // Only open if not clicking a direct inner link
    if (e.target !== fileInput) {
      fileInput?.click();
    }
  });

  btnBrowse?.addEventListener('click', (e) => {
    e.stopPropagation();
    fileInput?.click();
  });

  fileInput?.addEventListener('change', (e) => {
    const file = e.target.files?.[0];
    if (file) {
      handleSelectedFile(file);
    }
  });

  // Drag and drop events
  ['dragenter', 'dragover'].forEach((eventName) => {
    uploadZone?.addEventListener(eventName, (e) => {
      e.preventDefault();
      e.stopPropagation();
      uploadZone.classList.add('dragover');
    });
  });

  ['dragleave', 'drop'].forEach((eventName) => {
    uploadZone?.addEventListener(eventName, (e) => {
      e.preventDefault();
      e.stopPropagation();
      uploadZone.classList.remove('dragover');
    });
  });

  uploadZone?.addEventListener('drop', (e) => {
    const dt = e.dataTransfer;
    const file = dt?.files?.[0];
    if (file) {
      handleSelectedFile(file);
    }
  });

  // Smooth scroll for nav anchor links
  document.querySelectorAll('a[href^="#"]').forEach((anchor) => {
    anchor.addEventListener('click', function (e) {
      const targetId = this.getAttribute('href');
      if (targetId && targetId.length > 1) {
        const targetEl = document.querySelector(targetId);
        if (targetEl) {
          e.preventDefault();
          targetEl.scrollIntoView({ behavior: 'smooth' });
        }
      }
    });
  });

  // FAQ Accordion interactivity
  document.querySelectorAll('.faq-item-trigger').forEach((trigger) => {
    trigger.addEventListener('click', () => {
      const item = trigger.closest('.faq-item');
      if (item) {
        const isOpen = item.classList.contains('open');
        document.querySelectorAll('.faq-item.open').forEach((openItem) => {
          if (openItem !== item) openItem.classList.remove('open');
        });
        item.classList.toggle('open', !isOpen);
        trigger.setAttribute('aria-expanded', !isOpen ? 'true' : 'false');
      }
    });
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initLanding);
} else {
  initLanding();
}
