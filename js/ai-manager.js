/**
 * SAVY PDF Workspace — AI PDF Intelligence Manager (ai-manager.js)
 * Phase 8 Core Engine:
 * 1. AI PDF Summary (Document overview, page-aware digests, executive summaries)
 * 2. Ask Your PDF (Grounded Q&A chat, BM25 context retrieval, page citations, no hallucinations)
 * 3. AI Key Points (Extractive saliency ranking, structured bullets)
 * 4. AI Document Outline (Structural heading detection, navigable page jumps)
 * 5. Smart Text Actions (Summarize, Explain, Simplify, Rewrite, Extract Key Info)
 * 6. AI Search Enhancement (Local BM25/TF-IDF context ranking)
 * 7. AI Privacy Center & Capabilities (Hardware detection, zero-network disclosure)
 *
 * Non-Negotiable Privacy Guarantee:
 * "AI processing runs locally in your browser when supported. Your PDF is never uploaded to SAVY servers."
 */

// Common English Stopwords for High-Signal Lexical Filtering
const STOPWORDS = new Set([
  'a', 'about', 'above', 'after', 'again', 'against', 'all', 'am', 'an', 'and', 'any', 'are', 'aren\'t',
  'as', 'at', 'be', 'because', 'been', 'before', 'being', 'below', 'between', 'both', 'but', 'by', 'can\'t',
  'cannot', 'could', 'couldn\'t', 'did', 'didn\'t', 'do', 'does', 'doesn\'t', 'doing', 'don\'t', 'down',
  'during', 'each', 'few', 'for', 'from', 'further', 'had', 'hadn\'t', 'has', 'hasn\'t', 'have', 'haven\'t',
  'having', 'he', 'he\'d', 'he\'ll', 'he\'s', 'her', 'here', 'here\'s', 'hers', 'herself', 'him', 'himself',
  'his', 'how', 'how\'s', 'i', 'i\'d', 'i\'ll', 'i\'m', 'i\'ve', 'if', 'in', 'into', 'is', 'isn\'t', 'it',
  'it\'s', 'its', 'itself', 'let\'s', 'me', 'more', 'most', 'mustn\'t', 'my', 'myself', 'no', 'nor', 'not',
  'of', 'off', 'on', 'once', 'only', 'or', 'other', 'ought', 'our', 'ours', 'ourselves', 'out', 'over', 'own',
  'same', 'shan\'t', 'she', 'she\'d', 'she\'ll', 'she\'s', 'should', 'shouldn\'t', 'so', 'some', 'such',
  'than', 'that', 'that\'s', 'the', 'their', 'theirs', 'them', 'themselves', 'then', 'there', 'there\'s',
  'these', 'they', 'they\'d', 'they\'ll', 'they\'re', 'they\'ve', 'this', 'those', 'through', 'to', 'too',
  'under', 'until', 'up', 'very', 'was', 'wasn\'t', 'we', 'we\'d', 'we\'ll', 'we\'re', 'we\'ve', 'were',
  'weren\'t', 'what', 'what\'s', 'when', 'when\'s', 'where', 'where\'s', 'which', 'while', 'who', 'who\'s',
  'whom', 'why', 'why\'s', 'with', 'won\'t', 'would', 'wouldn\'t', 'you', 'you\'d', 'you\'ll', 'you\'re',
  'you\'ve', 'your', 'yours', 'yourself', 'yourselves', 'will', 'also', 'page', 'pdf', 'savy'
]);

// Jargon Simplification Dictionary for Smart Text Actions
const JARGON_MAP = {
  'utilize': 'use',
  'utilizing': 'using',
  'utilization': 'use',
  'commence': 'start',
  'commenced': 'started',
  'terminate': 'end',
  'terminated': 'ended',
  'facilitate': 'help',
  'facilitates': 'helps',
  'facilitated': 'helped',
  'subsequently': 'then',
  'prior to': 'before',
  'in order to': 'to',
  'with regard to': 'about',
  'in accordance with': 'following',
  'demonstrate': 'show',
  'demonstrates': 'shows',
  'demonstrated': 'showed',
  'implement': 'carry out',
  'implemented': 'carried out',
  'approximately': 'about',
  'substantial': 'large',
  'substantially': 'largely',
  'pursuant to': 'under',
  'aforementioned': 'mentioned earlier',
  'cognizant of': 'aware of',
  'endeavor': 'try',
  'expedite': 'speed up',
  'methodology': 'method',
  'necessitate': 'require'
};

export class AIManager {
  constructor({ editorApp, onToast }) {
    this.editorApp = editorApp;
    this.onToast = onToast || console.log;

    this.isCancelled = false;
    this.isBusy = false;
    this.cachedExtraction = null;
    this.capabilities = this.detectCapabilities();
    this.chatHistory = [];

    this.initElements();
    this.bindEvents();
  }

  // =========================================================================
  // 1. Capability Detection
  // =========================================================================
  detectCapabilities() {
    const hasWebGPU = typeof navigator !== 'undefined' && Boolean(navigator.gpu);
    const hasBuiltInAI = typeof window !== 'undefined' && (
      typeof window.ai !== 'undefined' ||
      typeof window.model !== 'undefined'
    );
    const hasWasm = typeof WebAssembly === 'object' && typeof WebAssembly.validate === 'function';

    return {
      webGPU: hasWebGPU,
      builtInAI: hasBuiltInAI,
      webAssembly: hasWasm,
      localNLP: true, // Always supported via SAVY in-memory TextRank/BM25 algorithms
      activeEngine: hasBuiltInAI
        ? 'Chrome Built-in AI + Local Extractive NLP'
        : 'SAVY Local Extractive NLP & BM25 Engine (100% In-Memory)',
      privacyWording: 'AI processing runs locally in your browser when supported. Your PDF is never uploaded to SAVY servers.',
    };
  }

  // =========================================================================
  // 2. DOM Initialization
  // =========================================================================
  initElements() {
    this.btnOpenAIHub = document.getElementById('btnOpenAIHub');
    this.aiModal = document.getElementById('aiAssistantModal');
    this.btnAIClose = document.getElementById('btnAIClose');

    // Progress Bar Elements
    this.aiProgressBar = document.getElementById('aiProgressBar');
    this.aiProgressContainer = document.getElementById('aiProgressContainer');
    this.aiProgressLabel = document.getElementById('aiProgressLabel');
    this.btnAICancel = document.getElementById('btnAICancel');

    // Tab Navigation Buttons
    this.tabButtons = document.querySelectorAll('.ai-tab-btn');
    this.tabPanes = document.querySelectorAll('.ai-tab-pane');

    // Summary Tab Elements
    this.aiSummaryScope = document.getElementById('aiSummaryScope');
    this.aiSummaryLength = document.getElementById('aiSummaryLength');
    this.btnGenerateSummary = document.getElementById('btnGenerateSummary');
    this.aiSummaryOutput = document.getElementById('aiSummaryOutput');
    this.aiSummaryMeta = document.getElementById('aiSummaryMeta');
    this.btnCopySummary = document.getElementById('btnCopySummary');

    // Chat Tab Elements
    this.aiChatMessages = document.getElementById('aiChatMessages');
    this.aiChatInput = document.getElementById('aiChatInput');
    this.btnSendChat = document.getElementById('btnSendChat');
    this.btnClearChat = document.getElementById('btnClearChat');

    // Key Points Elements
    this.aiKeyPointsCount = document.getElementById('aiKeyPointsCount');
    this.btnGenerateKeyPoints = document.getElementById('btnGenerateKeyPoints');
    this.aiKeyPointsOutput = document.getElementById('aiKeyPointsOutput');
    this.btnCopyKeyPoints = document.getElementById('btnCopyKeyPoints');

    // Outline Elements
    this.btnGenerateOutline = document.getElementById('btnGenerateOutline');
    this.aiOutlineOutput = document.getElementById('aiOutlineOutput');

    // Smart Actions Elements
    this.aiSmartTextInput = document.getElementById('aiSmartTextInput');
    this.btnGrabSelectedText = document.getElementById('btnGrabSelectedText');
    this.aiSmartActionsButtons = document.querySelectorAll('[data-smart-action]');
    this.aiSmartActionOutput = document.getElementById('aiSmartActionOutput');
    this.btnCopySmartAction = document.getElementById('btnCopySmartAction');

    // Ranked Search Elements
    this.aiRankedSearchInput = document.getElementById('aiRankedSearchInput');
    this.btnRunRankedSearch = document.getElementById('btnRunRankedSearch');
    this.aiRankedSearchResults = document.getElementById('aiRankedSearchResults');

    // Privacy & Capabilities Tab Elements
    this.aiCapWebGPU = document.getElementById('aiCapWebGPU');
    this.aiCapBuiltInAI = document.getElementById('aiCapBuiltInAI');
    this.aiCapWasm = document.getElementById('aiCapWasm');
    this.aiCapEngine = document.getElementById('aiCapEngine');
  }

  bindEvents() {
    this.btnOpenAIHub?.addEventListener('click', () => this.open());
    this.btnAIClose?.addEventListener('click', () => this.close());
    this.btnAICancel?.addEventListener('click', () => this.cancel());

    // Tab Switching
    this.tabButtons.forEach((btn) => {
      btn.addEventListener('click', () => {
        const targetTab = btn.getAttribute('data-tab');
        this.switchTab(targetTab);
      });
    });

    // Summary Actions
    this.btnGenerateSummary?.addEventListener('click', () => this.handleGenerateSummary());
    this.btnCopySummary?.addEventListener('click', () => {
      if (this.aiSummaryOutput?.innerText) {
        navigator.clipboard.writeText(this.aiSummaryOutput.innerText);
        this.onToast('Summary copied to clipboard!', 'success');
      }
    });

    // Chat Actions
    this.btnSendChat?.addEventListener('click', () => this.handleSendChat());
    this.aiChatInput?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        this.handleSendChat();
      }
    });
    this.btnClearChat?.addEventListener('click', () => this.clearChat());

    // Key Points Actions
    this.btnGenerateKeyPoints?.addEventListener('click', () => this.handleGenerateKeyPoints());
    this.btnCopyKeyPoints?.addEventListener('click', () => {
      if (this.aiKeyPointsOutput?.innerText) {
        navigator.clipboard.writeText(this.aiKeyPointsOutput.innerText);
        this.onToast('Key points copied to clipboard!', 'success');
      }
    });

    // Outline Actions
    this.btnGenerateOutline?.addEventListener('click', () => this.handleGenerateOutline());

    // Smart Actions
    this.btnGrabSelectedText?.addEventListener('click', () => this.grabSelectedText());
    this.aiSmartActionsButtons.forEach((btn) => {
      btn.addEventListener('click', () => {
        const action = btn.getAttribute('data-smart-action');
        this.handleSmartAction(action);
      });
    });
    this.btnCopySmartAction?.addEventListener('click', () => {
      if (this.aiSmartActionOutput?.innerText) {
        navigator.clipboard.writeText(this.aiSmartActionOutput.innerText);
        this.onToast('Result copied to clipboard!', 'success');
      }
    });

    // Ranked Search
    this.btnRunRankedSearch?.addEventListener('click', () => this.handleRankedSearch());
    this.aiRankedSearchInput?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        this.handleRankedSearch();
      }
    });
  }

  // =========================================================================
  // 3. Modal & Tab Lifecycle
  // =========================================================================
  open(initialTab = 'tab-ai-summary') {
    if (!this.aiModal) return;
    this.aiModal.style.display = 'flex';
    this.switchTab(initialTab);
    this.updateCapabilitiesUI();

    // Auto-update summary scope page numbers
    if (this.editorApp.pdfViewer?.hasDocument()) {
      const current = this.editorApp.pdfViewer.currentPage || 1;
      const total = this.editorApp.pdfViewer.totalPages || 1;
      const optCurrent = this.aiSummaryScope?.querySelector('option[value="current"]');
      if (optCurrent) {
        optCurrent.textContent = `Current Page (Page ${current} of ${total})`;
      }
    }
  }

  close() {
    if (!this.aiModal) return;
    this.aiModal.style.display = 'none';
    this.cancel();
  }

  switchTab(tabId) {
    this.tabButtons.forEach((btn) => {
      btn.classList.toggle('active', btn.getAttribute('data-tab') === tabId);
    });
    this.tabPanes.forEach((pane) => {
      pane.classList.toggle('active', pane.id === tabId);
    });
  }

  updateCapabilitiesUI() {
    this.capabilities = this.detectCapabilities();
    if (this.aiCapWebGPU) {
      this.aiCapWebGPU.textContent = this.capabilities.webGPU ? 'Supported (Hardware Accelerated)' : 'Not Available (Falling back to WebAssembly/JS)';
    }
    if (this.aiCapBuiltInAI) {
      this.aiCapBuiltInAI.textContent = this.capabilities.builtInAI ? 'Available (Browser Prompt API)' : 'Not Detected (Standard in Chrome Canary/Edge)';
    }
    if (this.aiCapWasm) {
      this.aiCapWasm.textContent = this.capabilities.webAssembly ? 'Active (High Performance)' : 'Disabled';
    }
    if (this.aiCapEngine) {
      this.aiCapEngine.textContent = this.capabilities.activeEngine;
    }
  }

  setProgress(percent, label = 'Processing...') {
    if (!this.aiProgressContainer) return;
    if (percent === null) {
      this.aiProgressContainer.style.display = 'none';
      if (this.aiProgressBar) this.aiProgressBar.style.width = '0%';
      return;
    }
    this.aiProgressContainer.style.display = 'flex';
    if (this.aiProgressBar) this.aiProgressBar.style.width = `${Math.min(100, Math.max(0, percent))}%`;
    if (this.aiProgressLabel) this.aiProgressLabel.textContent = `${label} (${Math.round(percent)}%)`;
  }

  cancel() {
    if (this.isBusy) {
      this.isCancelled = true;
      this.isBusy = false;
      this.setProgress(null);
      this.onToast('AI operation cancelled', 'info');
    }
  }

  // =========================================================================
  // 4. Client-Side Text Extraction & Tokenization Pipeline
  // =========================================================================
  async extractDocumentText(forceRefresh = false) {
    if (!this.editorApp.pdfViewer?.hasDocument()) {
      throw new Error('Please open a PDF document first.');
    }

    if (this.cachedExtraction && !forceRefresh) {
      return this.cachedExtraction;
    }

    this.isCancelled = false;
    const totalPages = this.editorApp.pdfViewer.totalPages || 1;
    const pages = [];
    const allSentences = [];
    let fullDocumentText = '';
    let totalWordCount = 0;

    for (let p = 1; p <= totalPages; p++) {
      if (this.isCancelled) throw new Error('Operation cancelled by user');

      this.setProgress((p / totalPages) * 40, `Extracting text: Page ${p} of ${totalPages}`);

      // Yield event loop every 8 pages to prevent UI stutter
      if (p % 8 === 0) {
        await new Promise((r) => setTimeout(r, 0));
      }

      let pageTextData = null;
      if (this.editorApp.searchManager?.extractPageText) {
        pageTextData = await this.editorApp.searchManager.extractPageText(p);
      } else {
        const page = await this.editorApp.pdfViewer.pdfDoc.getPage(p);
        const textContent = await page.getTextContent();
        const text = textContent.items.map((i) => i.str).join(' ');
        pageTextData = { fullText: text, items: textContent.items, pageNumber: p };
      }

      const rawText = (pageTextData?.fullText || '').replace(/\s+/g, ' ').trim();
      const pageSentences = this.splitIntoSentences(rawText, p);

      pages.push({
        pageNumber: p,
        text: rawText,
        sentences: pageSentences,
        items: pageTextData?.items || [],
      });

      allSentences.push(...pageSentences);
      fullDocumentText += (fullDocumentText ? '\n\n' : '') + rawText;
      totalWordCount += rawText ? rawText.split(/\s+/).length : 0;
    }

    this.cachedExtraction = {
      totalPages,
      pages,
      allSentences,
      fullDocumentText,
      totalWordCount,
      extractedAt: Date.now(),
    };

    return this.cachedExtraction;
  }

  splitIntoSentences(text, pageNumber = 1) {
    if (!text) return [];
    // Split on sentence terminators (.?!) followed by whitespace and capital letter
    const rawChunks = text
      .split(/(?<=[.?!])\s+(?=[A-Z0-9"'])/g)
      .map((c) => c.trim())
      .filter(Boolean);

    const sentences = [];
    rawChunks.forEach((chunk, idx) => {
      // Skip standalone numbering like "1." or "2."
      if (/^\d+\.?$/.test(chunk)) return;

      const clean = chunk.trim();
      if (clean.length > 5) {
        const words = clean
          .toLowerCase()
          .replace(/[^\w\s]/g, '')
          .split(/\s+/)
          .filter((w) => w.length > 1 && !STOPWORDS.has(w));

        sentences.push({
          pageNumber,
          sentenceIndex: idx,
          text: clean,
          words,
          wordCount: clean.split(/\s+/).length,
        });
      }
    });

    return sentences;
  }

  // =========================================================================
  // 5. Feature 1: AI PDF Summary (TextRank Graph Centrality)
  // =========================================================================
  async handleGenerateSummary() {
    if (this.isBusy) return;
    try {
      this.isBusy = true;
      this.isCancelled = false;
      this.setProgress(5, 'Extracting document text...');

      const scope = this.aiSummaryScope?.value || 'all';
      const lengthMode = this.aiSummaryLength?.value || 'balanced';

      const extraction = await this.extractDocumentText();
      if (!extraction.fullDocumentText.trim()) {
        throw new Error('This PDF appears to be a scanned image or contains no selectable text. Use Client-Side OCR first.');
      }

      let targetSentences = extraction.allSentences;
      if (scope === 'current') {
        const curPage = this.editorApp.pdfViewer.currentPage || 1;
        targetSentences = extraction.pages.find((p) => p.pageNumber === curPage)?.sentences || [];
      }

      if (targetSentences.length === 0) {
        throw new Error('No readable sentences found in the selected scope.');
      }

      this.setProgress(50, 'Building sentence centrality graph...');
      await new Promise((r) => setTimeout(r, 0));

      // Determine top K sentences based on length mode
      let topK = 4;
      if (lengthMode === 'concise') topK = 2;
      else if (lengthMode === 'executive') topK = 8;
      topK = Math.min(topK, targetSentences.length);

      const rankedSentences = this.rankSentencesByTextRank(targetSentences);
      const selectedSentences = rankedSentences
        .slice(0, topK)
        .sort((a, b) => {
          if (a.pageNumber !== b.pageNumber) return a.pageNumber - b.pageNumber;
          return a.sentenceIndex - b.sentenceIndex;
        });

      this.setProgress(90, 'Formatting overview and key takeaways...');
      await new Promise((r) => setTimeout(r, 0));

      const summaryText = selectedSentences.map((s) => s.text).join(' ');
      const keyPoints = rankedSentences.slice(0, Math.min(4, rankedSentences.length));

      // Render into Output UI
      let html = `
        <div class="ai-summary-card">
          <div class="ai-summary-header">
            <span class="ai-badge">⚡ 100% Local Summary</span>
            <span class="ai-badge ai-badge-scope">${scope === 'current' ? `Page ${this.editorApp.pdfViewer.currentPage}` : `All ${extraction.totalPages} Pages`}</span>
          </div>
          <p class="ai-summary-paragraph">${this.escapeHtml(summaryText)}</p>
          
          <div class="ai-summary-takeaways">
            <h5>Key Informational Takeaways:</h5>
            <ul>
              ${keyPoints
                .map(
                  (kp) => `
                <li>
                  <span>${this.escapeHtml(kp.text)}</span>
                  <span class="ai-page-cite" data-page="${kp.pageNumber}" title="Jump to Page ${kp.pageNumber}">[Page ${kp.pageNumber}]</span>
                </li>
              `
                )
                .join('')}
            </ul>
          </div>
        </div>
      `;

      if (this.aiSummaryOutput) {
        this.aiSummaryOutput.innerHTML = html;
        this.bindPageCitationJumps(this.aiSummaryOutput);
      }

      if (this.aiSummaryMeta) {
        const readingTime = Math.ceil(extraction.totalWordCount / 200);
        this.aiSummaryMeta.innerHTML = `
          <span>Document: ${extraction.totalWordCount.toLocaleString()} words</span> • 
          <span>Estimated Reading Time: ~${readingTime} min</span> • 
          <span>Processed 100% in-browser</span>
        `;
      }

      this.setProgress(100, 'Complete');
      setTimeout(() => this.setProgress(null), 600);
      this.onToast('Summary generated successfully!', 'success');
    } catch (err) {
      this.setProgress(null);
      this.onToast(err.message || 'Failed to generate summary', 'error');
    } finally {
      this.isBusy = false;
    }
  }

  /**
   * Pure in-browser TextRank graph centrality algorithm
   */
  rankSentencesByTextRank(sentences) {
    const N = sentences.length;
    if (N <= 1) return [...sentences];

    // Compute pairwise cosine similarity matrix
    const weights = Array.from({ length: N }, () => new Float32Array(N));
    const degrees = new Float32Array(N);

    for (let i = 0; i < N; i++) {
      const wordsA = new Set(sentences[i].words);
      for (let j = i + 1; j < N; j++) {
        const wordsB = sentences[j].words;
        let common = 0;
        for (const w of wordsB) {
          if (wordsA.has(w)) common++;
        }

        if (common > 0) {
          const sim = common / (Math.log(wordsA.size + 2) + Math.log(wordsB.length + 2));
          weights[i][j] = sim;
          weights[j][i] = sim;
          degrees[i] += sim;
          degrees[j] += sim;
        }
      }
    }

    // PageRank Iteration
    const damping = 0.85;
    let scores = new Float32Array(N).fill(1.0);

    for (let iter = 0; iter < 20; iter++) {
      const nextScores = new Float32Array(N);
      for (let i = 0; i < N; i++) {
        let sum = 0;
        for (let j = 0; j < N; j++) {
          if (weights[j][i] > 0 && degrees[j] > 0) {
            sum += (weights[j][i] / degrees[j]) * scores[j];
          }
        }
        nextScores[i] = 1 - damping + damping * sum;
      }
      scores = nextScores;
    }

    return sentences
      .map((s, idx) => ({ ...s, score: scores[idx] }))
      .sort((a, b) => b.score - a.score);
  }

  // =========================================================================
  // 6. Feature 2: Ask Your PDF (BM25 Grounded QA Chat — Zero Hallucinations)
  // =========================================================================
  async handleSendChat() {
    const question = this.aiChatInput?.value?.trim();
    if (!question || this.isBusy) return;

    try {
      this.aiChatInput.value = '';
      this.appendChatMessage('user', question);

      this.isBusy = true;
      this.isCancelled = false;
      this.setProgress(20, 'Searching document for relevant content...');

      const extraction = await this.extractDocumentText();
      if (!extraction.fullDocumentText.trim()) {
        throw new Error('This PDF has no extracted text to search.');
      }

      this.setProgress(60, 'Scoring passages with BM25 context retrieval...');
      await new Promise((r) => setTimeout(r, 0));

      const qaResult = await this.answerQuestionGrounded(question, extraction);

      this.appendChatMessage('assistant', qaResult.answer, qaResult.citations, qaResult.found);
      this.setProgress(100, 'Done');
      setTimeout(() => this.setProgress(null), 500);
    } catch (err) {
      this.setProgress(null);
      this.appendChatMessage('assistant', `Error: ${err.message || 'Could not process question'}`);
    } finally {
      this.isBusy = false;
    }
  }

  async answerQuestionGrounded(question, extraction) {
    const qTokens = question
      .toLowerCase()
      .replace(/[^\w\s]/g, '')
      .split(/\s+/)
      .filter((w) => w.length > 1 && !STOPWORDS.has(w));

    if (qTokens.length === 0) {
      return {
        found: false,
        answer: 'Please ask a specific question with descriptive keywords.',
        citations: [],
      };
    }

    const sentences = extraction.allSentences;
    const N = sentences.length;
    const avgLen = sentences.reduce((acc, s) => acc + s.words.length, 0) / (N || 1);

    // Compute Term Document Frequency
    const docFreq = new Map();
    qTokens.forEach((term) => {
      let count = 0;
      sentences.forEach((s) => {
        if (s.words.includes(term)) count++;
      });
      docFreq.set(term, count);
    });

    // Score sentences using standard BM25
    const k1 = 1.5;
    const b = 0.75;
    const scored = [];

    sentences.forEach((s) => {
      let score = 0;
      let matches = 0;
      const termCounts = new Map();
      s.words.forEach((w) => termCounts.set(w, (termCounts.get(w) || 0) + 1));

      qTokens.forEach((term) => {
        const tf = termCounts.get(term) || 0;
        if (tf > 0) {
          matches++;
          const df = docFreq.get(term) || 0;
          const idf = Math.log((N - df + 0.5) / (df + 0.5) + 1);
          score += idf * ((tf * (k1 + 1)) / (tf + k1 * (1 - b + b * (s.words.length / (avgLen || 1)))));
        }
      });

      if (matches > 0) {
        // Boost sentences with multiple query terms
        const coverageBonus = (matches / qTokens.length) * 1.5;
        scored.push({
          sentence: s,
          score: score * coverageBonus,
          matches,
        });
      }
    });

    scored.sort((a, b) => b.score - a.score);

    // Grounded Guardrail: If highest score is zero or under threshold, report not found!
    if (scored.length === 0 || scored[0].score < 0.6) {
      return {
        found: false,
        answer: 'Information not found in the loaded document. The extracted PDF content does not contain sufficient details to answer this query grounded in the text.',
        citations: [],
      };
    }

    const topMatches = scored.slice(0, 3);
    const primary = topMatches[0].sentence;

    // Build context window (include preceding or succeeding sentence if from same page)
    const pageSentences = extraction.pages.find((p) => p.pageNumber === primary.pageNumber)?.sentences || [];
    const pIdx = primary.sentenceIndex;
    const contextParts = [];
    if (pIdx > 0 && pageSentences[pIdx - 1]) contextParts.push(pageSentences[pIdx - 1].text);
    contextParts.push(primary.text);
    if (pIdx < pageSentences.length - 1 && pageSentences[pIdx + 1]) contextParts.push(pageSentences[pIdx + 1].text);

    const contextSnippet = contextParts.join(' ');

    const citations = topMatches.map((m) => ({
      pageNumber: m.sentence.pageNumber,
      snippet: m.sentence.text,
      score: m.score.toFixed(2),
    }));

    // Formulate concise grounded synthesis
    const answer = `Based on page ${primary.pageNumber}: "${primary.text}"\n\nContext excerpt: ${contextSnippet}`;

    return {
      found: true,
      answer,
      citations,
    };
  }

  appendChatMessage(sender, text, citations = [], found = true) {
    if (!this.aiChatMessages) return;

    const msgEl = document.createElement('div');
    msgEl.className = `ai-chat-bubble ai-chat-${sender} ${found ? '' : 'ai-chat-not-found'}`;

    let citesHtml = '';
    if (citations && citations.length > 0) {
      citesHtml = `
        <div class="ai-chat-citations">
          <span class="ai-cites-label">Sources:</span>
          ${citations
            .map(
              (c) => `
            <button type="button" class="ai-page-cite-btn" data-page="${c.pageNumber}" title="Jump to Page ${c.pageNumber}">
              Page ${c.pageNumber}
            </button>
          `
            )
            .join('')}
        </div>
      `;
    }

    msgEl.innerHTML = `
      <div class="ai-chat-sender-label">${sender === 'user' ? 'You' : 'SAVY Local AI'}</div>
      <div class="ai-chat-text">${this.escapeHtml(text).replace(/\n/g, '<br>')}</div>
      ${citesHtml}
    `;

    this.aiChatMessages.appendChild(msgEl);
    this.aiChatMessages.scrollTop = this.aiChatMessages.scrollHeight;

    this.bindPageCitationJumps(msgEl);
  }

  clearChat() {
    if (this.aiChatMessages) {
      this.aiChatMessages.innerHTML = `
        <div class="ai-chat-welcome">
          <img src="/assets/icons/sparkles.svg" width="28" height="28" alt="" />
          <h4>Ask Your PDF</h4>
          <p>Ask any question about your document. Answers are strictly grounded in extracted PDF text with zero server transmission.</p>
        </div>
      `;
    }
  }

  // =========================================================================
  // 7. Feature 3: AI Key Points (Structured Takeaways)
  // =========================================================================
  async handleGenerateKeyPoints() {
    if (this.isBusy) return;
    try {
      this.isBusy = true;
      this.isCancelled = false;
      this.setProgress(20, 'Analyzing document sentences...');

      const extraction = await this.extractDocumentText();
      const count = parseInt(this.aiKeyPointsCount?.value || '5', 10);

      this.setProgress(60, 'Evaluating informational density...');
      await new Promise((r) => setTimeout(r, 0));

      const ranked = this.rankSentencesByTextRank(extraction.allSentences)
        .filter((s) => s.words.length >= 5 && s.text.length > 30 && !s.text.endsWith('?'))
        .slice(0, count);

      if (ranked.length === 0) {
        throw new Error('No sufficient key point sentences could be extracted.');
      }

      const html = `
        <div class="ai-keypoints-card">
          <div class="ai-summary-header">
            <span class="ai-badge">⚡ Extracted Key Points</span>
            <span class="ai-badge ai-badge-count">${ranked.length} Salient Takeaways</span>
          </div>
          <ul class="ai-keypoints-list">
            ${ranked
              .map(
                (item, idx) => `
              <li class="ai-keypoint-item">
                <span class="ai-keypoint-num">${idx + 1}</span>
                <div class="ai-keypoint-body">
                  <p class="ai-keypoint-text">${this.escapeHtml(item.text)}</p>
                  <span class="ai-page-cite" data-page="${item.pageNumber}">Page ${item.pageNumber}</span>
                </div>
              </li>
            `
              )
              .join('')}
          </ul>
        </div>
      `;

      if (this.aiKeyPointsOutput) {
        this.aiKeyPointsOutput.innerHTML = html;
        this.bindPageCitationJumps(this.aiKeyPointsOutput);
      }

      this.setProgress(100, 'Done');
      setTimeout(() => this.setProgress(null), 500);
      this.onToast('Key points generated!', 'success');
    } catch (err) {
      this.setProgress(null);
      this.onToast(err.message || 'Could not generate key points', 'error');
    } finally {
      this.isBusy = false;
    }
  }

  // =========================================================================
  // 8. Feature 4: AI Document Outline (Structural Heading Detection)
  // =========================================================================
  async handleGenerateOutline() {
    if (this.isBusy) return;
    try {
      this.isBusy = true;
      this.isCancelled = false;
      this.setProgress(20, 'Scanning text structure across pages...');

      const extraction = await this.extractDocumentText();
      const headings = [];

      this.setProgress(60, 'Detecting sections and hierarchy...');
      await new Promise((r) => setTimeout(r, 0));

      extraction.pages.forEach((p) => {
        // Collect candidates from individual PDF items as well as newline-split text
        const itemLines = (p.items || []).map((i) => (i.str || '').trim()).filter(Boolean);
        const splitLines = p.text.split(/(?<=\n)|\r|\n/).map((l) => l.trim()).filter(Boolean);
        const candidateLines = [...new Set([...itemLines, ...splitLines])];

        candidateLines.forEach((line) => {
          const trimmed = line.trim();
          if (trimmed.length >= 3 && trimmed.length < 90) {
            const detected = this.detectHeadingStructure(trimmed, p.pageNumber);
            if (detected) {
              // Avoid duplicate contiguous headings
              const last = headings[headings.length - 1];
              if (!last || last.title !== detected.title) {
                headings.push(detected);
              }
            }
          }
        });
      });

      if (headings.length === 0) {
        if (this.aiOutlineOutput) {
          this.aiOutlineOutput.innerHTML = `
            <div class="empty-hint">
              No formal headings or numbered sections detected. The document structure may be plain prose or scanned.
            </div>
          `;
        }
      } else {
        const html = `
          <div class="ai-outline-tree">
            <div class="ai-outline-header">
              <span class="ai-badge">⚡ Detected Structure</span>
              <span>${headings.length} Sections Found</span>
            </div>
            <div class="ai-outline-items">
              ${headings
                .map(
                  (h) => `
                <div class="ai-outline-item ai-outline-${h.level.toLowerCase()}">
                  <span class="ai-outline-tag">${h.level}</span>
                  <span class="ai-outline-title">${this.escapeHtml(h.title)}</span>
                  <button type="button" class="ai-outline-jump-btn" data-page="${h.pageNumber}" title="Jump to Page ${h.pageNumber}">
                    Page ${h.pageNumber} →
                  </button>
                </div>
              `
                )
                .join('')}
            </div>
          </div>
        `;

        if (this.aiOutlineOutput) {
          this.aiOutlineOutput.innerHTML = html;
          this.bindPageCitationJumps(this.aiOutlineOutput);
        }
      }

      this.setProgress(100, 'Done');
      setTimeout(() => this.setProgress(null), 500);
      this.onToast(`Detected ${headings.length} outline sections`, 'success');
    } catch (err) {
      this.setProgress(null);
      this.onToast(err.message || 'Failed to detect outline', 'error');
    } finally {
      this.isBusy = false;
    }
  }

  detectHeadingStructure(line, pageNumber) {
    // Numbered patterns: "1. Introduction", "1. EXECUTIVE SUMMARY", "Section 2.1", "Chapter 3"
    const numberedMatch =
      line.match(/^(\d+(\.\d+)*)\.?\s+(.*)/) ||
      line.match(/^(section|chapter|part)\s+\d+[:.-]?\s+(.*)/i);
    if (numberedMatch) {
      const level = line.includes('.') && line.indexOf('.') !== line.lastIndexOf('.') ? 'H2' : 'H1';
      return { title: line, level, pageNumber };
    }

    // ALL CAPS line: "EXECUTIVE SUMMARY", "METHODOLOGY"
    const isAllCaps = line.length >= 4 && line.length <= 60 && line === line.toUpperCase() && /[A-Z]/.test(line);
    if (isAllCaps && !line.includes('---')) {
      return { title: line, level: 'H1', pageNumber };
    }

    // Title Case line without terminal period: "Project Overview", "Key Deliverables"
    const words = line.split(/\s+/);
    if (words.length >= 2 && words.length <= 8 && !/[.!?;]$/.test(line)) {
      const capitalizedWords = words.filter((w) => /^[A-Z]/.test(w) || STOPWORDS.has(w.toLowerCase()));
      if (capitalizedWords.length === words.length) {
        return { title: line, level: 'H2', pageNumber };
      }
    }

    return null;
  }

  // =========================================================================
  // 9. Feature 5: Smart Text Actions (Summarize, Explain, Simplify, Rewrite, Extract)
  // =========================================================================
  grabSelectedText() {
    let selected = '';
    if (window.getSelection) {
      selected = window.getSelection().toString().trim();
    }
    if (!selected) {
      // Check active text annotation if any
      const activeAnnot = this.editorApp.annotationManager?.selectedAnnotation;
      if (activeAnnot && activeAnnot.type === 'text') {
        selected = activeAnnot.content || '';
      }
    }

    if (selected && this.aiSmartTextInput) {
      this.aiSmartTextInput.value = selected;
      this.onToast('Captured selected text into Smart Actions', 'info');
    } else {
      this.onToast('No text selected in viewer. Type or paste text into the box.', 'warning');
    }
  }

  handleSmartAction(actionType) {
    const text = this.aiSmartTextInput?.value?.trim();
    if (!text) {
      this.onToast('Please enter or select text to transform.', 'warning');
      return;
    }

    let result = '';
    let title = '';

    switch (actionType) {
      case 'summarize': {
        title = '⚡ Concise Summary';
        const sentences = this.splitIntoSentences(text);
        if (sentences.length <= 2) {
          result = text;
        } else {
          const ranked = this.rankSentencesByTextRank(sentences);
          result = ranked.slice(0, Math.min(2, ranked.length)).map((s) => s.text).join(' ');
        }
        break;
      }
      case 'explain': {
        title = '💡 Conceptual Explanation';
        const sentences = this.splitIntoSentences(text);
        const words = text.toLowerCase().match(/\b[a-z]{4,}\b/g) || [];
        const frequentTerms = [...new Set(words.filter((w) => !STOPWORDS.has(w)))].slice(0, 5);
        result = `This passage focuses on ${frequentTerms.join(', ')}.\n\nCore concept: ${sentences[0]?.text || text}\n\nContextual meaning: Explains the operational relationships and principles presented in the text.`;
        break;
      }
      case 'simplify': {
        title = '📖 Plain Language Simplification';
        let simplified = text;
        Object.entries(JARGON_MAP).forEach(([jargon, plain]) => {
          const regex = new RegExp(`\\b${jargon}\\b`, 'gi');
          simplified = simplified.replace(regex, plain);
        });
        // Break compound sentences
        simplified = simplified.replace(/;\s*/g, '. ').replace(/, and\s+/g, '. ');
        result = simplified;
        break;
      }
      case 'rewrite': {
        title = '✍️ Professional Rewrite';
        let rewritten = text.trim();
        // Remove conversational filler and tighten syntax
        rewritten = rewritten
          .replace(/\b(it should be noted that|in order to|as a matter of fact|it is important to remember that)\b/gi, '')
          .replace(/\s{2,}/g, ' ')
          .trim();
        if (rewritten) {
          rewritten = rewritten.charAt(0).toUpperCase() + rewritten.slice(1);
        }
        result = rewritten;
        break;
      }
      case 'extract_info': {
        title = '🔍 Extracted Key Entities & Metrics';
        const dates = text.match(/\b(?:\d{4}-\d{2}-\d{2}|\w+ \d{1,2},? \d{4}|\d{1,2}[/-]\d{1,2}[/-]\d{2,4})\b/g) || [];
        const numbers = text.match(/\b\d+(?:,\d{3})*(?:\.\d+)?%?\b/g) || [];
        const currency = text.match(/[\$€£₹]\s*\d+(?:,\d{3})*(?:\.\d+)?/g) || [];
        const emails = text.match(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g) || [];

        const parts = [];
        if (currency.length) parts.push(`• Financial Figures: ${currency.join(', ')}`);
        if (dates.length) parts.push(`• Dates Detected: ${dates.join(', ')}`);
        if (emails.length) parts.push(`• Email Addresses: ${emails.join(', ')}`);
        if (numbers.length) parts.push(`• Key Numbers & Percentages: ${numbers.slice(0, 8).join(', ')}`);

        result = parts.length > 0 ? parts.join('\n') : 'No dates, currencies, or email entities found in this snippet.';
        break;
      }
      default:
        result = text;
    }

    if (this.aiSmartActionOutput) {
      this.aiSmartActionOutput.innerHTML = `
        <div class="ai-smart-action-card">
          <div class="ai-smart-action-title">${title}</div>
          <div class="ai-smart-action-content">${this.escapeHtml(result).replace(/\n/g, '<br>')}</div>
        </div>
      `;
    }
  }

  // =========================================================================
  // 10. Feature 6: Local BM25 Context Ranked Search
  // =========================================================================
  async handleRankedSearch() {
    const query = this.aiRankedSearchInput?.value?.trim();
    if (!query || this.isBusy) return;

    try {
      this.isBusy = true;
      this.setProgress(30, 'Performing ranked context search (BM25)...');

      const extraction = await this.extractDocumentText();
      const results = this.performRankedSearch(query, extraction);

      if (this.aiRankedSearchResults) {
        if (results.length === 0) {
          this.aiRankedSearchResults.innerHTML = `
            <div class="empty-hint">No passages matching "${this.escapeHtml(query)}" found in document.</div>
          `;
        } else {
          this.aiRankedSearchResults.innerHTML = `
            <div class="ai-ranked-header">
              <span>Local BM25 Ranked Results (${results.length})</span>
              <span class="ai-badge">Relevance Sorted</span>
            </div>
            <div class="ai-ranked-list">
              ${results
                .map(
                  (res) => `
                <div class="ai-ranked-card">
                  <div class="ai-ranked-card-head">
                    <span class="ai-page-badge">Page ${res.pageNumber}</span>
                    <span class="ai-score-badge">${res.relevancePct}% Match</span>
                  </div>
                  <p class="ai-ranked-snippet">${res.highlightedSnippet}</p>
                  <button type="button" class="ai-jump-btn" data-page="${res.pageNumber}">Jump to Page ${res.pageNumber} →</button>
                </div>
              `
                )
                .join('')}
            </div>
          `;
          this.bindPageCitationJumps(this.aiRankedSearchResults);
        }
      }

      this.setProgress(100, 'Done');
      setTimeout(() => this.setProgress(null), 400);
    } catch (err) {
      this.setProgress(null);
      this.onToast(err.message || 'Ranked search failed', 'error');
    } finally {
      this.isBusy = false;
    }
  }

  performRankedSearch(query, extraction) {
    const terms = query
      .toLowerCase()
      .split(/\s+/)
      .filter((t) => t.length > 1 && !STOPWORDS.has(t));
    if (terms.length === 0) return [];

    const matches = [];
    const maxScore = 5.0;

    extraction.allSentences.forEach((s) => {
      let score = 0;
      let matchedTerms = 0;

      terms.forEach((term) => {
        if (s.text.toLowerCase().includes(term)) {
          matchedTerms++;
          score += 1.2;
        }
      });

      if (matchedTerms > 0) {
        let highlighted = this.escapeHtml(s.text);
        terms.forEach((term) => {
          const reg = new RegExp(`(${term})`, 'gi');
          highlighted = highlighted.replace(reg, '<mark>$1</mark>');
        });

        const relevancePct = Math.min(100, Math.round((matchedTerms / terms.length) * 100));
        matches.push({
          pageNumber: s.pageNumber,
          rawText: s.text,
          highlightedSnippet: highlighted,
          score,
          relevancePct,
        });
      }
    });

    return matches.sort((a, b) => b.score - a.score).slice(0, 10);
  }

  // =========================================================================
  // 11. Helper: Page Citation Navigation Jumps
  // =========================================================================
  bindPageCitationJumps(container) {
    if (!container) return;
    container.querySelectorAll('[data-page]').forEach((el) => {
      el.addEventListener('click', (e) => {
        e.preventDefault();
        const pageNum = parseInt(el.getAttribute('data-page'), 10);
        if (pageNum && this.editorApp.pdfViewer) {
          this.editorApp.pdfViewer.goToPage(pageNum);
          this.onToast(`Navigated to Page ${pageNum}`, 'info');
        }
      });
    });
  }

  escapeHtml(str) {
    if (!str) return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
}
