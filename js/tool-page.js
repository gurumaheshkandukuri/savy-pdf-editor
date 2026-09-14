/**
 * SAVY — Tool Page Controller (js/tool-page.js)
 * Manages client-side drag-and-drop file selection on dedicated tool landing pages
 * and safely hands off the file to the SAVY Editor session via local IndexedDB.
 *
 * PRIVACY GUARANTEE:
 * "Your PDF is processed locally in your browser and is never uploaded to SAVY servers."
 */

const DB_NAME = 'SAVY_LOCAL_STORE';
const DB_VERSION = 2;
const STORE_NAME = 'pending_documents';
const STORE_SESSIONS = 'document_sessions';

function openIndexedDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
      if (!db.objectStoreNames.contains(STORE_SESSIONS)) {
        db.createObjectStore(STORE_SESSIONS);
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

function initToolPage() {
  const uploadZone = document.getElementById('toolUploadZone');
  const fileInput = document.getElementById('toolFileInput');
  const btnBrowse = document.getElementById('btnToolBrowse');
  const toolAction = uploadZone?.getAttribute('data-tool-action') || '';
  const acceptImages = uploadZone?.getAttribute('data-accept-images') === 'true';

  function showError(msg) {
    let errEl = document.getElementById('toolInlineError');
    if (!errEl && uploadZone) {
      errEl = document.createElement('div');
      errEl.id = 'toolInlineError';
      errEl.className = 'upload-inline-error';
      errEl.setAttribute('role', 'alert');
      errEl.setAttribute('aria-live', 'polite');
      uploadZone.appendChild(errEl);
    }
    if (errEl) {
      errEl.textContent = msg;
      errEl.style.display = 'flex';
    }
    uploadZone?.setAttribute('aria-invalid', 'true');
    const loadingEl = document.getElementById('toolLoadingState');
    if (loadingEl) loadingEl.style.display = 'none';
  }

  function clearError() {
    const errEl = document.getElementById('toolInlineError');
    if (errEl) {
      errEl.textContent = '';
      errEl.style.display = 'none';
    }
    uploadZone?.removeAttribute('aria-invalid');
  }

  function showLoading(msg = 'Preparing document in local memory...') {
    let loadingEl = document.getElementById('toolLoadingState');
    if (!loadingEl && uploadZone) {
      loadingEl = document.createElement('div');
      loadingEl.id = 'toolLoadingState';
      loadingEl.className = 'upload-loading-state';
      loadingEl.setAttribute('role', 'status');
      loadingEl.setAttribute('aria-live', 'polite');
      loadingEl.innerHTML = `<div class="upload-spinner"></div><span>${msg}</span>`;
      uploadZone.appendChild(loadingEl);
    }
    if (loadingEl) {
      loadingEl.style.display = 'flex';
    }
    if (btnBrowse) btnBrowse.disabled = true;
  }

  async function handleSelectedFile(file) {
    if (!file) return;

    if (!acceptImages) {
      if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
        showError('Please select a valid PDF file (.pdf) for this tool.');
        return;
      }
    } else {
      const validTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/jpg'];
      const validExts = ['.jpg', '.jpeg', '.png', '.webp'];
      const isImg = validTypes.includes(file.type) || validExts.some(ext => file.name.toLowerCase().endsWith(ext));
      if (!isImg) {
        showError('Please select a supported image file (JPG, PNG, or WebP).');
        return;
      }
    }

    clearError();
    showLoading();

    // Save to local IndexedDB for editor session
    await storePendingDocument(file);

    // Redirect to editor with pre-activated tool action via clean URL
    const query = toolAction ? `?action=${encodeURIComponent(toolAction)}` : '';
    window.location.href = `/editor${query}`;
  }

  // Click browse triggers hidden input
  uploadZone?.addEventListener('click', (e) => {
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
    if (file) handleSelectedFile(file);
  });

  // Drag-and-drop visual states
  ['dragenter', 'dragover'].forEach((eventName) => {
    uploadZone?.addEventListener(eventName, (e) => {
      e.preventDefault();
      e.stopPropagation();
      uploadZone.classList.add('drag-over');
    });
  });

  ['dragleave', 'drop'].forEach((eventName) => {
    uploadZone?.addEventListener(eventName, (e) => {
      e.preventDefault();
      e.stopPropagation();
      uploadZone.classList.remove('drag-over');
    });
  });

  uploadZone?.addEventListener('drop', (e) => {
    const dt = e.dataTransfer;
    const file = dt?.files?.[0];
    if (file) handleSelectedFile(file);
  });

  // FAQ Accordion interactivity
  document.querySelectorAll('.faq-item-trigger').forEach((trigger) => {
    trigger.addEventListener('click', () => {
      const item = trigger.closest('.faq-item');
      if (item) {
        const isOpen = item.classList.contains('open');
        // Close all other open items in the same container
        document.querySelectorAll('.faq-item.open').forEach((openItem) => {
          if (openItem !== item) openItem.classList.remove('open');
        });
        item.classList.toggle('open', !isOpen);
      }
    });
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initToolPage);
} else {
  initToolPage();
}
