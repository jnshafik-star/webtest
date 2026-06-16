/**
 * ==========================================================================
 * VITALHUB - APPLICATION DRIVER, ROUTER, AND PERSISTENT DATABASE ENGINE
 * ==========================================================================
 */

// 0. FIREBASE CONFIGURATION & INITIALIZATION
const firebaseConfig = {
  apiKey: "AIzaSyA-COEB4QimF29xUOSWEex-RS5o9OVAZQA",
  authDomain: "vitalhub-e31f3.firebaseapp.com",
  projectId: "vitalhub-e31f3",
  storageBucket: "vitalhub-e31f3.firebasestorage.app",
  messagingSenderId: "458731848836",
  appId: "1:458731848836:web:6a0f33034e13274fd76ed1"
};

let auth = null;
if (typeof firebase !== 'undefined') {
  try {
    firebase.initializeApp(firebaseConfig);
    auth = firebase.auth();
  } catch (err) {
    console.error('Firebase initialization failed:', err);
  }
} else {
  console.warn('Firebase SDK not loaded. Authentication features are offline.');
}

// 1. DATABASE CONFIGURATION & OPERATIONS
const DB_NAME = 'VitalhubDB';
const DB_VERSION = 1;

class DBHelper {
  constructor() {
    this.db = null;
    this.useFallback = false;
    this.fallbackStore = {
      files: [],
      articles: [],
      reviews: []
    };

    // Load from localStorage if available
    try {
      const savedFiles = localStorage.getItem('vitalhub_fallback_files');
      const savedArticles = localStorage.getItem('vitalhub_fallback_articles');
      const savedReviews = localStorage.getItem('vitalhub_fallback_reviews');
      
      if (savedFiles) {
        this.fallbackStore.files = JSON.parse(savedFiles).map(f => {
          if (f._blobData) {
            f.blob = new Blob([f._blobData], { type: f._blobType });
          }
          return f;
        });
      }
      if (savedArticles) this.fallbackStore.articles = JSON.parse(savedArticles);
      if (savedReviews) this.fallbackStore.reviews = JSON.parse(savedReviews);
    } catch (e) {
      console.warn('Failed to load database fallback from localStorage:', e);
    }
  }

  _saveFallback(storeName) {
    try {
      if (storeName === 'files') {
        const filesToSave = this.fallbackStore.files.map(f => {
          const copy = { ...f };
          delete copy.blob;
          copy._blobData = "[Simulated File Data]";
          copy._blobType = f.blob ? f.blob.type : 'application/octet-stream';
          return copy;
        });
        localStorage.setItem('vitalhub_fallback_files', JSON.stringify(filesToSave));
      } else if (storeName === 'articles') {
        localStorage.setItem('vitalhub_fallback_articles', JSON.stringify(this.fallbackStore.articles));
      } else if (storeName === 'reviews') {
        localStorage.setItem('vitalhub_fallback_reviews', JSON.stringify(this.fallbackStore.reviews));
      }
    } catch (e) {
      console.warn('Failed to save database fallback to localStorage:', e);
    }
  }

  init() {
    return new Promise((resolve) => {
      if (typeof indexedDB === 'undefined') {
        console.warn('IndexedDB not supported. Using localStorage/in-memory fallback.');
        this.useFallback = true;
        resolve(null);
        return;
      }

      try {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onerror = (event) => {
          console.warn('Database failed to open, switching to fallback:', event.target.error);
          this.useFallback = true;
          resolve(null);
        };

        request.onsuccess = (event) => {
          this.db = event.target.result;
          resolve(this.db);
        };

        request.onupgradeneeded = (event) => {
          const db = event.target.result;

          // File Store: stores metadata and actual Blob
          if (!db.objectStoreNames.contains('files')) {
            db.createObjectStore('files', { keyPath: 'id' });
          }

          // News Store: stores articles
          if (!db.objectStoreNames.contains('articles')) {
            db.createObjectStore('articles', { keyPath: 'id' });
          }

          // Reviews Store: stores comments and ratings
          if (!db.objectStoreNames.contains('reviews')) {
            const reviewStore = db.createObjectStore('reviews', { keyPath: 'id' });
            reviewStore.createIndex('targetId', 'targetId', { unique: false });
          }
        };
      } catch (err) {
        console.warn('Database failed to open (exception), switching to fallback:', err);
        this.useFallback = true;
        resolve(null);
      }
    });
  }

  // Generic helper for transactions
  _getTransaction(storeName, mode) {
    if (!this.db) throw new Error('Database not initialized');
    const transaction = this.db.transaction(storeName, mode);
    const store = transaction.objectStore(storeName);
    return { transaction, store };
  }

  // --- File Store Methods ---
  getAllFiles() {
    return new Promise((resolve, reject) => {
      if (this.useFallback || !this.db) {
        resolve(this.fallbackStore.files);
        return;
      }
      try {
        const { store } = this._getTransaction('files', 'readonly');
        const request = store.getAll();
        request.onsuccess = () => resolve(request.result || []);
        request.onerror = () => reject(request.error);
      } catch (err) {
        console.warn('IndexedDB transaction failed, using fallback:', err);
        this.useFallback = true;
        resolve(this.fallbackStore.files);
      }
    });
  }

  getFile(id) {
    return new Promise((resolve, reject) => {
      if (this.useFallback || !this.db) {
        const found = this.fallbackStore.files.find(f => f.id === id);
        resolve(found || null);
        return;
      }
      try {
        const { store } = this._getTransaction('files', 'readonly');
        const request = store.get(id);
        request.onsuccess = () => resolve(request.result || null);
        request.onerror = () => reject(request.error);
      } catch (err) {
        console.warn('IndexedDB transaction failed, using fallback:', err);
        this.useFallback = true;
        const found = this.fallbackStore.files.find(f => f.id === id);
        resolve(found || null);
      }
    });
  }

  addFile(fileObj) {
    return new Promise((resolve, reject) => {
      if (this.useFallback || !this.db) {
        this.fallbackStore.files = this.fallbackStore.files.filter(f => f.id !== fileObj.id);
        this.fallbackStore.files.push(fileObj);
        this._saveFallback('files');
        resolve(fileObj.id);
        return;
      }
      try {
        const { store } = this._getTransaction('files', 'readwrite');
        const request = store.add(fileObj);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      } catch (err) {
        console.warn('IndexedDB transaction failed, using fallback:', err);
        this.useFallback = true;
        this.fallbackStore.files = this.fallbackStore.files.filter(f => f.id !== fileObj.id);
        this.fallbackStore.files.push(fileObj);
        this._saveFallback('files');
        resolve(fileObj.id);
      }
    });
  }

  updateFile(fileObj) {
    return new Promise((resolve, reject) => {
      if (this.useFallback || !this.db) {
        const idx = this.fallbackStore.files.findIndex(f => f.id === fileObj.id);
        if (idx !== -1) {
          this.fallbackStore.files[idx] = fileObj;
        } else {
          this.fallbackStore.files.push(fileObj);
        }
        this._saveFallback('files');
        resolve(fileObj.id);
        return;
      }
      try {
        const { store } = this._getTransaction('files', 'readwrite');
        const request = store.put(fileObj);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      } catch (err) {
        console.warn('IndexedDB transaction failed, using fallback:', err);
        this.useFallback = true;
        const idx = this.fallbackStore.files.findIndex(f => f.id === fileObj.id);
        if (idx !== -1) {
          this.fallbackStore.files[idx] = fileObj;
        } else {
          this.fallbackStore.files.push(fileObj);
        }
        this._saveFallback('files');
        resolve(fileObj.id);
      }
    });
  }

  // --- Article Store Methods ---
  getAllArticles() {
    return new Promise((resolve, reject) => {
      if (this.useFallback || !this.db) {
        resolve(this.fallbackStore.articles);
        return;
      }
      try {
        const { store } = this._getTransaction('articles', 'readonly');
        const request = store.getAll();
        request.onsuccess = () => resolve(request.result || []);
        request.onerror = () => reject(request.error);
      } catch (err) {
        console.warn('IndexedDB transaction failed, using fallback:', err);
        this.useFallback = true;
        resolve(this.fallbackStore.articles);
      }
    });
  }

  getArticle(id) {
    return new Promise((resolve, reject) => {
      if (this.useFallback || !this.db) {
        const found = this.fallbackStore.articles.find(a => a.id === id);
        resolve(found || null);
        return;
      }
      try {
        const { store } = this._getTransaction('articles', 'readonly');
        const request = store.get(id);
        request.onsuccess = () => resolve(request.result || null);
        request.onerror = () => reject(request.error);
      } catch (err) {
        console.warn('IndexedDB transaction failed, using fallback:', err);
        this.useFallback = true;
        const found = this.fallbackStore.articles.find(a => a.id === id);
        resolve(found || null);
      }
    });
  }

  addArticle(articleObj) {
    return new Promise((resolve, reject) => {
      if (this.useFallback || !this.db) {
        this.fallbackStore.articles = this.fallbackStore.articles.filter(a => a.id !== articleObj.id);
        this.fallbackStore.articles.push(articleObj);
        this._saveFallback('articles');
        resolve(articleObj.id);
        return;
      }
      try {
        const { store } = this._getTransaction('articles', 'readwrite');
        const request = store.add(articleObj);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      } catch (err) {
        console.warn('IndexedDB transaction failed, using fallback:', err);
        this.useFallback = true;
        this.fallbackStore.articles = this.fallbackStore.articles.filter(a => a.id !== articleObj.id);
        this.fallbackStore.articles.push(articleObj);
        this._saveFallback('articles');
        resolve(articleObj.id);
      }
    });
  }

  updateArticle(articleObj) {
    return new Promise((resolve, reject) => {
      if (this.useFallback || !this.db) {
        const idx = this.fallbackStore.articles.findIndex(a => a.id === articleObj.id);
        if (idx !== -1) {
          this.fallbackStore.articles[idx] = articleObj;
        } else {
          this.fallbackStore.articles.push(articleObj);
        }
        this._saveFallback('articles');
        resolve(articleObj.id);
        return;
      }
      try {
        const { store } = this._getTransaction('articles', 'readwrite');
        const request = store.put(articleObj);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      } catch (err) {
        console.warn('IndexedDB transaction failed, using fallback:', err);
        this.useFallback = true;
        const idx = this.fallbackStore.articles.findIndex(a => a.id === articleObj.id);
        if (idx !== -1) {
          this.fallbackStore.articles[idx] = articleObj;
        } else {
          this.fallbackStore.articles.push(articleObj);
        }
        this._saveFallback('articles');
        resolve(articleObj.id);
      }
    });
  }

  // --- Review Store Methods ---
  getReviewsByTarget(targetId) {
    return new Promise((resolve, reject) => {
      if (this.useFallback || !this.db) {
        const results = this.fallbackStore.reviews.filter(r => r.targetId === targetId);
        results.sort((a, b) => new Date(b.date) - new Date(a.date));
        resolve(results);
        return;
      }
      try {
        const { store } = this._getTransaction('reviews', 'readonly');
        const index = store.index('targetId');
        const request = index.getAll(targetId);
        request.onsuccess = () => {
          const results = request.result || [];
          results.sort((a, b) => new Date(b.date) - new Date(a.date));
          resolve(results);
        };
        request.onerror = () => reject(request.error);
      } catch (err) {
        console.warn('IndexedDB transaction failed, using fallback:', err);
        this.useFallback = true;
        const results = this.fallbackStore.reviews.filter(r => r.targetId === targetId);
        results.sort((a, b) => new Date(b.date) - new Date(a.date));
        resolve(results);
      }
    });
  }

  addReview(reviewObj) {
    return new Promise((resolve, reject) => {
      if (this.useFallback || !this.db) {
        this.fallbackStore.reviews = this.fallbackStore.reviews.filter(r => r.id !== reviewObj.id);
        this.fallbackStore.reviews.push(reviewObj);
        this._saveFallback('reviews');
        resolve(reviewObj.id);
        return;
      }
      try {
        const { store } = this._getTransaction('reviews', 'readwrite');
        const request = store.add(reviewObj);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      } catch (err) {
        console.warn('IndexedDB transaction failed, using fallback:', err);
        this.useFallback = true;
        this.fallbackStore.reviews = this.fallbackStore.reviews.filter(r => r.id !== reviewObj.id);
        this.fallbackStore.reviews.push(reviewObj);
        this._saveFallback('reviews');
        resolve(reviewObj.id);
      }
    });
  }

  getAllReviews() {
    return new Promise((resolve, reject) => {
      if (this.useFallback || !this.db) {
        resolve(this.fallbackStore.reviews);
        return;
      }
      try {
        const { store } = this._getTransaction('reviews', 'readonly');
        const request = store.getAll();
        request.onsuccess = () => resolve(request.result || []);
        request.onerror = () => reject(request.error);
      } catch (err) {
        console.warn('IndexedDB transaction failed, using fallback:', err);
        this.useFallback = true;
        resolve(this.fallbackStore.reviews);
      }
    });
  }
}

const db = new DBHelper();

// 2. DYNAMIC MEDIA & COVER GENERATOR
function generateAbstractBanner(title, category) {
  const canvas = document.createElement('canvas');
  canvas.width = 800;
  canvas.height = 400;
  const ctx = canvas.getContext('2d');

  // Set up gradients based on category
  let grad = ctx.createLinearGradient(0, 0, 800, 400);
  if (category === 'tech') {
    grad.addColorStop(0, '#0f172a'); // slate-900
    grad.addColorStop(0.5, '#1e1b4b'); // indigo-950
    grad.addColorStop(1, '#0e7490'); // cyan-700
  } else if (category === 'updates') {
    grad.addColorStop(0, '#070f0b');
    grad.addColorStop(0.5, '#111827');
    grad.addColorStop(1, '#15803d'); // green-700
  } else if (category === 'gaming') {
    grad.addColorStop(0, '#0f172a');
    grad.addColorStop(0.5, '#31102f');
    grad.addColorStop(1, '#db2777'); // pink-600
  } else {
    grad.addColorStop(0, '#0f172a');
    grad.addColorStop(0.5, '#2e1065'); // violet-950
    grad.addColorStop(1, '#7c3aed'); // violet-600
  }

  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 800, 400);

  // Background Grid Lines
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.04)';
  ctx.lineWidth = 1;
  const gridSize = 40;
  for (let i = 0; i < canvas.width; i += gridSize) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i, canvas.height);
    ctx.stroke();
  }
  for (let j = 0; j < canvas.height; j += gridSize) {
    ctx.beginPath();
    ctx.moveTo(0, j);
    ctx.lineTo(canvas.width, j);
    ctx.stroke();
  }

  // Draw some geometric tech accents
  ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
  ctx.beginPath();
  ctx.arc(650, 200, 120, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(650, 200, 140, 0, Math.PI * 2);
  ctx.stroke();

  // Add category text badge
  ctx.fillStyle = 'rgba(255, 255, 255, 0.15)';
  ctx.fillRect(50, 50, 120, 30);
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 12px "Inter", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(category.toUpperCase(), 110, 65);

  // Title
  ctx.textAlign = 'left';
  ctx.font = '800 40px "Outfit", sans-serif';
  ctx.fillStyle = '#ffffff';
  
  // Wrap Title text
  const words = title.split(' ');
  let line = '';
  let y = 180;
  const maxWidth = 550;
  const lineHeight = 50;

  for (let n = 0; n < words.length; n++) {
    let testLine = line + words[n] + ' ';
    let metrics = ctx.measureText(testLine);
    let testWidth = metrics.width;
    if (testWidth > maxWidth && n > 0) {
      ctx.fillText(line, 50, y);
      line = words[n] + ' ';
      y += lineHeight;
    } else {
      line = testLine;
    }
  }
  ctx.fillText(line, 50, y);

  return canvas.toDataURL('image/jpeg');
}

// 3. SEED INITIAL DATABASE CONTENT (MOCK DATA)
async function seedDatabaseIfEmpty() {
  const fileCount = (await db.getAllFiles()).length;
  const articleCount = (await db.getAllArticles()).length;

  if (fileCount === 0 && articleCount === 0) {
    showToast('Initializing local database with sample contents...', 'info');

    // 1. MOCK ARTICLES
    const articles = [
      {
        id: 'art-1',
        title: 'The Dawn of Web3 and Decentralized File Systems',
        author: 'Marcus Vance',
        category: 'tech',
        publishDate: new Date(Date.now() - 3600000 * 24 * 2).toISOString(), // 2 days ago
        summary: 'An depth review of how IPFS and IndexedDB are reshaping local and decentralized user file storage protocols.',
        content: `<h2>The Local-First Revolution</h2>
        <p>In recent years, the paradigm of web applications has shifted dramatically towards local-first development. Empowering client side browsers to hold real records is no longer just a workaround for offline mode; it is becoming the core architect. By pairing IndexedDB with distributed networks like IPFS, applications can scale without needing expensive cloud databases.</p>
        <blockquote>"The database of the future doesn't run in a server rack; it runs on the device in your pocket."</blockquote>
        <h2>Why IndexedDB?</h2>
        <p>Unlike LocalStorage which limits application state to a tiny 5MB of stringified text, IndexedDB offers asynchronous, transactional storage of structured data. Crucially, it supports standard file storage (Blobs) directly on the client's hard drive, allowing websites to download, store, and build virtual local file shares.</p>
        <h2>Conclusion</h2>
        <p>As browsers grow more capable, the boundary of what a web application can do without a backend is expanding. We are just scratching the surface of decentralized web apps.</p>`,
        ratingSum: 14,
        ratingCount: 3,
        avgRating: 4.7
      },
      {
        id: 'art-2',
        title: 'Vitalhub Release Notes: Version 1.0.0 is Live',
        author: 'Lead Engineer',
        category: 'updates',
        publishDate: new Date(Date.now() - 3600000 * 48).toISOString(), // 48h ago
        summary: 'Explore the initial features of Vitalhub, our local-first file sharing and news article repository.',
        content: `<h2>Welcome to Vitalhub!</h2>
        <p>We are thrilled to present Vitalhub version 1.0.0. This portal showcases the capability of modern browser databases to manage community file uploads, downloads, article logs, and active review forums entirely client-side.</p>
        <h3>Feature Highlights:</h3>
        <ul>
          <li><strong>Binary Storage:</strong> Drag, drop, and save files directly as raw binary blobs in local storage.</li>
          <li><strong>Real Downloads:</strong> Download files from the hub. They are rebuilt from raw bytes and downloaded through standard browser hooks.</li>
          <li><strong>Review Matrix:</strong> Write comments and give star ratings to files and posts. Ratings update average scores instantly.</li>
          <li><strong>Dynamic Art:</strong> Canvas-driven cover art generation for custom user articles.</li>
        </ul>
        <p>This codebase is built using Vanilla CSS for glassmorphic visual aesthetics and pure ES6 Javascript for functional orchestration.</p>`,
        ratingSum: 5,
        ratingCount: 1,
        avgRating: 5.0
      },
      {
        id: 'art-3',
        title: 'Cyberpunk Aesthetic Design: Glassmorphism Secrets',
        author: 'Aria Crimson',
        category: 'gaming',
        publishDate: new Date(Date.now() - 3600000 * 120).toISOString(), // 5 days ago
        summary: 'Discover how backdrop-filters and alpha-tailored HSL colors create premium glow-effects.',
        content: `<h2>The Cyber-Glass Aesthetic</h2>
        <p>Modern UI design demands high-fidelity, interactive aesthetics. The "cyberpunk glassmorphism" look is achieved through a combination of transluscent layering, neon accents, and heavy background blurs.</p>
        <blockquote>"Contrast is key. A dark, muted slate background highlights vibrant neon glows with high visual urgency."</blockquote>
        <h3>Key CSS Recipes:</h3>
        <p>To implement this style, always combine <code>background-color</code> with alpha channels, a thin translucent border, and the <code>backdrop-filter</code> property:</p>
        <pre><code>background: rgba(22, 30, 49, 0.55);
backdrop-filter: blur(16px);
border: 1px solid rgba(255, 255, 255, 0.08);</code></pre>
        <p>Additionally, placing absolute glowing radial gradients behind containers creates a depth effect that simulates holographic interfaces. Hover states should leverage springy transitions to make the controls feel alive.</p>`,
        ratingSum: 9,
        ratingCount: 2,
        avgRating: 4.5
      }
    ];

    // Add generated covers to articles
    articles.forEach(art => {
      art.imageUrl = generateAbstractBanner(art.title, art.category);
    });

    // 2. MOCK FILES
    const files = [
      {
        id: 'file-1',
        name: 'Web_Performance_CheatSheet.pdf',
        uploader: 'CodeWizard',
        category: 'documents',
        version: '1.2.0',
        tags: 'web, pdf, cheatsheet, speed',
        description: 'A comprehensive checklist of performance metrics (LCP, FID, CLS) and how to optimize them using modern browser capabilities.',
        uploadDate: new Date(Date.now() - 3600000 * 10).toISOString(),
        downloadsCount: 15,
        ratingSum: 13,
        ratingCount: 3,
        avgRating: 4.3,
        blob: new Blob([
          "%PDF-1.4\n%...\n1 0 obj\n<< /Title (Web Performance CheatSheet) /Author (Vitalhub) >>\nendobj\n// Simulated PDF Raw Content bytes\nWeb Performance Tips:\n1. Minimize render-blocking JS\n2. Use WebP/AVIF formats\n3. Leverage CSS Grid & Flexbox\n4. Cache database queries using Service Workers."
        ], { type: 'application/pdf' })
      },
      {
        id: 'file-2',
        name: 'Retro_Console_Icons.svg',
        uploader: 'PixelArtist',
        category: 'images',
        version: '1.0.0',
        tags: 'svg, icons, retro, asset',
        description: 'Beautiful vector icons of classic retro consoles, perfect for dashboard designs and gaming UI concepts.',
        uploadDate: new Date(Date.now() - 3600000 * 24).toISOString(),
        downloadsCount: 8,
        ratingSum: 10,
        ratingCount: 2,
        avgRating: 5.0,
        blob: new Blob([
          `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
            <rect width="100" height="100" fill="#0b0f19"/>
            <circle cx="50" cy="50" r="40" fill="url(#grad)" stroke="#0e7490" stroke-width="4"/>
            <path d="M30 40h40v20H30z" fill="#1f293d"/>
            <circle cx="40" cy="50" r="3" fill="#ef4444"/>
            <circle cx="60" cy="50" r="3" fill="#eab308"/>
            <defs>
              <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stop-color="#7c3aed" />
                <stop offset="100%" stop-color="#0891b2" />
              </linearGradient>
            </defs>
          </svg>`
        ], { type: 'image/svg+xml' })
      },
      {
        id: 'file-3',
        name: 'IndexedDB_Helper_Module.js',
        uploader: 'VanillaGuru',
        category: 'software',
        version: '2.1.0',
        tags: 'js, helper, db, vanilla',
        description: 'A lightweight wrapper class for IndexedDB supporting transactions, index-based querying, and automatic version upgrades.',
        uploadDate: new Date(Date.now() - 3600000 * 36).toISOString(),
        downloadsCount: 24,
        ratingSum: 19,
        ratingCount: 4,
        avgRating: 4.8,
        blob: new Blob([
          `/**\n * IndexedDB Utility Wrapper\n */\nexport class DBWrapper {\n  constructor(name) {\n    this.name = name;\n  }\n  async init() {\n    return new Promise(resolve => console.log('DB Initialized'));\n  }\n}`
        ], { type: 'application/javascript' })
      }
    ];

    // 3. MOCK REVIEWS
    const reviews = [
      // Article reviews
      { id: 'rev-1', targetId: 'art-1', type: 'article', reviewerName: 'DevDino', rating: 5, text: 'This was an excellent read. The insights regarding local-first storage architecture are highly relevant for modern web apps.', date: new Date(Date.now() - 3600000 * 20).toISOString() },
      { id: 'rev-2', targetId: 'art-1', type: 'article', reviewerName: 'TechStacker', rating: 4, text: 'Very detailed comparison of Storage APIs. I would like to see a comparison with SQLite-WASM in the future.', date: new Date(Date.now() - 3600000 * 10).toISOString() },
      { id: 'rev-3', targetId: 'art-1', type: 'article', reviewerName: 'Lina_K', rating: 5, text: 'Spot on! The local-first revolution is here.', date: new Date(Date.now() - 3600000 * 2).toISOString() },
      { id: 'rev-4', targetId: 'art-2', type: 'article', reviewerName: 'SiteTester', rating: 5, text: 'The interface is stunning. Love the dark theme and smooth page swaps.', date: new Date(Date.now() - 3600000 * 30).toISOString() },
      { id: 'rev-5', targetId: 'art-3', type: 'article', reviewerName: 'PixelFlinger', rating: 4, text: 'Excellent CSS guide. Implementing glassmorphic panels is so much easier with these HSL values.', date: new Date(Date.now() - 3600000 * 70).toISOString() },
      { id: 'rev-6', targetId: 'art-3', type: 'article', reviewerName: 'UX_Explorer', rating: 5, text: 'Awesome design accents!', date: new Date(Date.now() - 3600000 * 15).toISOString() },
      // File reviews
      { id: 'rev-7', targetId: 'file-1', type: 'file', reviewerName: 'SpeedyPete', rating: 4, text: 'Incredibly handy sheet. The core web vitals target values are highly accurate.', date: new Date(Date.now() - 3600000 * 5).toISOString() },
      { id: 'rev-8', targetId: 'file-1', type: 'file', reviewerName: 'AuditMaster', rating: 4, text: 'Helped me speed up my portfolio project. Highly recommended.', date: new Date(Date.now() - 3600000 * 3).toISOString() },
      { id: 'rev-9', targetId: 'file-1', type: 'file', reviewerName: 'CritiqueGuy', rating: 5, text: 'Good pdf document.', date: new Date(Date.now() - 3600000 * 1).toISOString() },
      { id: 'rev-10', targetId: 'file-2', type: 'file', reviewerName: 'SegaFan', rating: 5, text: 'Crisp SVG scaling. Replaced my static pixel pngs instantly!', date: new Date(Date.now() - 3600000 * 12).toISOString() },
      { id: 'rev-11', targetId: 'file-3', type: 'file', reviewerName: 'JS_Geek', rating: 5, text: 'Cleanest wrapper code I have seen. No external libraries needed.', date: new Date(Date.now() - 3600000 * 18).toISOString() }
    ];

    // Write all to IDB
    for (const art of articles) await db.addArticle(art);
    for (const file of files) await db.addFile(file);
    for (const rev of reviews) await db.addReview(rev);

    showToast('Mock data populated successfully.', 'success');
  }
}

// 4. ROUTER & STATE MANAGER
class AppRouter {
  constructor() {
    this.routes = {
      '': this.renderDashboard.bind(this),
      'files': this.renderFiles.bind(this),
      'news': this.renderNews.bind(this),
      'profile': this.renderProfile.bind(this),
      'article': this.renderArticleDetail.bind(this),
      'shop': this.renderShop.bind(this),
      'videos': this.renderVideos.bind(this)
    };
    
    // Global active item state (e.g. active file details)
    this.activeFileId = null;
    this.activeArticleId = null;
  }

  init() {
    window.addEventListener('hashchange', () => this.handleRoute());
    window.addEventListener('load', () => this.handleRoute());
    // Immediately execute routing to catch load states that already fired
    this.handleRoute();
  }

  handleRoute() {
    const hash = window.location.hash.replace(/^#\//, '');
    const segments = hash.split('/');
    const route = segments[0] || '';
    const param = segments[1] || null;

    // Remove active state from all bottom nav tab links
    document.querySelectorAll('.bottom-nav-link').forEach(link => link.classList.remove('active'));
    
    // Hide all view panels
    document.querySelectorAll('.app-view').forEach(view => view.classList.remove('active'));

    // Highlight active nav item
    const navIdMap = {
      '': 'nav-home',
      'files': 'nav-files',
      'news': 'nav-news',
      'profile': 'nav-profile'
    };
    const activeNavId = navIdMap[route];
    if (activeNavId) {
      const el = document.getElementById(activeNavId);
      if (el) el.classList.add('active');
    }

    // Call route handler
    if (this.routes[route]) {
      this.routes[route](param);
    } else {
      // Fallback to dashboard
      window.location.hash = '#/';
    }
  }

  showTab(route, tabType) {
    window.location.hash = `#/${route}`;
    if (route === 'profile' && tabType) {
      setTimeout(() => {
        const fileTab = document.getElementById('profile-tab-toggle-file');
        const articleTab = document.getElementById('profile-tab-toggle-article');
        const filePanel = document.getElementById('profile-panel-file');
        const articlePanel = document.getElementById('profile-panel-article');

        if (tabType === 'article') {
          fileTab.classList.remove('active');
          articleTab.classList.add('active');
          filePanel.classList.remove('active');
          filePanel.style.display = 'none';
          articlePanel.classList.add('active');
          articlePanel.style.display = 'block';
        } else {
          fileTab.classList.add('active');
          articleTab.classList.remove('active');
          filePanel.classList.add('active');
          filePanel.style.display = 'block';
          articlePanel.classList.remove('active');
          articlePanel.style.display = 'none';
        }
      }, 50);
    }
  }

  // --- View Renderers ---

  // A. DASHBOARD VIEW
  async renderDashboard() {
    this.toggleViewContainer('view-dashboard');
    
    const files = await db.getAllFiles();
    const articles = await db.getAllArticles();
    const reviews = await db.getAllReviews();

    // 1. Calculate stats values
    const downloadsSum = files.reduce((acc, curr) => acc + (curr.downloadsCount || 0), 0);
    
    const statFiles = document.getElementById('stat-files');
    const statDownloads = document.getElementById('stat-downloads');
    const statArticles = document.getElementById('stat-articles');
    const statReviews = document.getElementById('stat-reviews');
    
    if (statFiles) statFiles.innerText = files.length;
    if (statDownloads) statDownloads.innerText = downloadsSum;
    if (statArticles) statArticles.innerText = articles.length;
    if (statReviews) statReviews.innerText = reviews.length;

    // 2. Render Recent Uploads (Top 4)
    const recentFilesEl = document.getElementById('dashboard-recent-files');
    recentFilesEl.innerHTML = '';

    const sortedFiles = [...files].sort((a, b) => new Date(b.uploadDate) - new Date(a.uploadDate)).slice(0, 4);
    if (sortedFiles.length === 0) {
      recentFilesEl.innerHTML = '<div class="item-meta">No files uploaded yet.</div>';
    } else {
      sortedFiles.forEach(file => {
        const item = document.createElement('div');
        item.className = 'dashboard-list-item';
        item.onclick = () => openFileModal(file.id);

        const iconClass = getFileIconClass(file.name);
        const fileExt = file.name.split('.').pop().toUpperCase().slice(0, 4);

        item.innerHTML = `
          <div class="item-left">
            <div class="file-icon-mini ${iconClass}">${fileExt}</div>
            <div class="item-info">
              <h4>${escapeHTML(file.name)}</h4>
              <p>Uploaded by ${escapeHTML(file.uploader)}</p>
            </div>
          </div>
          <div class="item-right">
            <div class="rating-badge">★ ${file.avgRating ? file.avgRating.toFixed(1) : '0.0'}</div>
            <span class="item-meta">${file.downloadsCount || 0} downloads</span>
          </div>
        `;
        recentFilesEl.appendChild(item);
      });
    }

    // 3. Render Trending Articles (Top 3 popular by reviews/rating)
    const recentArticlesEl = document.getElementById('dashboard-recent-articles');
    recentArticlesEl.innerHTML = '';

    const sortedArticles = [...articles].sort((a, b) => (b.avgRating || 0) - (a.avgRating || 0)).slice(0, 3);
    if (sortedArticles.length === 0) {
      recentArticlesEl.innerHTML = '<div class="item-meta">No news published yet.</div>';
    } else {
      sortedArticles.forEach(art => {
        const item = document.createElement('div');
        item.className = 'dashboard-list-item';
        item.onclick = () => window.location.hash = `#/article/${art.id}`;

        item.innerHTML = `
          <div class="item-left">
            <div class="item-info">
              <h4>${escapeHTML(art.title)}</h4>
              <p>By ${escapeHTML(art.author)} • ${formatDate(art.publishDate)}</p>
            </div>
          </div>
          <div class="item-right">
            <div class="rating-badge">★ ${art.avgRating ? art.avgRating.toFixed(1) : '0.0'}</div>
            <span class="item-meta">${art.category.toUpperCase()}</span>
          </div>
        `;
        recentArticlesEl.appendChild(item);
      });
    }
  }

  // B. FILES HUB VIEW
  async renderFiles() {
    this.toggleViewContainer('view-files');
    const files = await db.getAllFiles();
    renderFilesGrid(files);
  }

  // C. NEWS PORTAL VIEW
  async renderNews() {
    this.toggleViewContainer('view-news');
    const articles = await db.getAllArticles();
    renderNewsGrid(articles);
  }

  // E. PROFILE VIEW
  async renderProfile() {
    this.toggleViewContainer('view-profile');
    loadProfileFromStorage();
    await updateDatabaseSizeDisplay();
    
    // Update stats values
    const files = await db.getAllFiles();
    const articles = await db.getAllArticles();
    const reviews = await db.getAllReviews();
    const downloadsSum = files.reduce((acc, curr) => acc + (curr.downloadsCount || 0), 0);
    
    const statFiles = document.getElementById('stat-files');
    const statDownloads = document.getElementById('stat-downloads');
    const statArticles = document.getElementById('stat-articles');
    const statReviews = document.getElementById('stat-reviews');
    
    if (statFiles) statFiles.innerText = files.length;
    if (statDownloads) statDownloads.innerText = downloadsSum;
    if (statArticles) statArticles.innerText = articles.length;
    if (statReviews) statReviews.innerText = reviews.length;
  }

  // F. SHOP CATALOG VIEW
  renderShop(categoryParam) {
    this.toggleViewContainer('view-shop');
    
    const shopListEl = document.getElementById('shop-categories-list');
    const shopGridEl = document.getElementById('shop-grid-container');
    const backBtn = document.getElementById('btn-shop-back');
    const viewTitle = document.getElementById('shop-view-title');
    
    // Update category counts
    const categoryKeys = [
      'vehicles', 'fashion', 'phones', 'electronics',
      'furniture', 'accessories', 'networking', 'property',
      'services', 'repair', 'commercial', 'jobs',
      'food', 'babies', 'animals', 'beauty'
    ];
    
    categoryKeys.forEach(cat => {
      const count = mockShopItems.filter(i => i.category === cat).length;
      const el = document.getElementById(`count-${cat}`);
      if (el) el.innerText = `${count} items`;
    });

    const searchQuery = currentShopFilters.query.trim();

    if (searchQuery) {
      // Searching globally across all categories
      currentShopFilters.category = categoryParam || 'all';
      if (shopListEl) shopListEl.style.display = 'none';
      if (shopGridEl) shopGridEl.style.display = 'grid';
      if (backBtn) backBtn.style.display = 'inline-flex';
      if (viewTitle) viewTitle.innerText = 'Search Results';
      renderShopGrid();
    } else if (categoryParam) {
      // Viewing a specific category page
      currentShopFilters.category = categoryParam;
      if (shopListEl) shopListEl.style.display = 'none';
      if (shopGridEl) shopGridEl.style.display = 'grid';
      if (backBtn) backBtn.style.display = 'inline-flex';
      
      const titleMap = {
        vehicles: 'Vehicles Catalog',
        fashion: 'Fashion Catalog',
        phones: 'Phones Catalog',
        electronics: 'Electronics Catalog',
        furniture: 'Furniture Catalog',
        accessories: 'Accessories Catalog',
        networking: 'Networking products',
        property: 'Property (buildings & land)',
        services: 'Services Catalog',
        repair: 'Repair & construction',
        commercial: 'Commercial Equipment & Tools',
        jobs: 'Jobs Catalog',
        food: 'Food & agriculture',
        babies: 'Babies kits',
        animals: 'Animals & pets',
        beauty: 'Beauty & Personal care'
      };
      if (viewTitle) viewTitle.innerText = titleMap[categoryParam] || 'Store Catalog';
      renderShopGrid();
    } else {
      // Default category list view
      currentShopFilters.category = 'all';
      if (shopListEl) shopListEl.style.display = 'flex';
      if (shopGridEl) shopGridEl.style.display = 'none';
      if (backBtn) backBtn.style.display = 'none';
      if (viewTitle) viewTitle.innerText = 'Shop Tech & Goods';
    }
  }

  // G. VIDEOS PORTAL VIEW
  renderVideos() {
    this.toggleViewContainer('view-videos');
    initCustomVideoPlayers();
  }

  // E. ARTICLE DETAILS
  async renderArticleDetail(id) {
    if (!id) {
      window.location.hash = '#/news';
      return;
    }
    this.toggleViewContainer('view-article-detail');
    this.activeArticleId = id;
    
    const article = await db.getArticle(id);
    if (!article) {
      document.getElementById('article-detail-content').innerHTML = `
        <div style="padding: 4rem; text-align: center;">
          <h2>Article Not Found</h2>
          <p>The requested article does not exist or has been deleted.</p>
        </div>
      `;
      return;
    }

    // Load Article details
    const container = document.getElementById('article-detail-content');
    const badgeClass = getArticleBadgeClass(article.category);
    
    container.innerHTML = `
      <div class="article-hero-banner" style="background-image: url('${article.imageUrl}')">
        <div class="article-hero-content">
          <span class="article-hero-tag ${badgeClass}">${article.category}</span>
          <h1>${escapeHTML(article.title)}</h1>
          <div class="article-meta-line">
            <span>By <strong>${escapeHTML(article.author)}</strong></span>
            <span>Published: ${formatDate(article.publishDate)}</span>
          </div>
        </div>
      </div>
      <div class="article-body-content">
        ${article.content}
      </div>
    `;

    // Load Reviews
    await renderArticleReviews(id);

    const activeUser = auth ? auth.currentUser : null;
    const reviewerField = document.getElementById('article-reviewer-name');
    if (reviewerField) {
      reviewerField.value = activeUser ? (activeUser.displayName || activeUser.email.split('@')[0]) : '';
    }
  }

  // Utility to toggle view panels visibility
  toggleViewContainer(viewId) {
    document.querySelectorAll('.app-view').forEach(view => {
      if (view.id === viewId) {
        view.classList.add('active');
      } else {
        view.classList.remove('active');
      }
    });
    // Scroll to top of window
    window.scrollTo(0, 0);
  }
}

const appRouter = new AppRouter();
window.appRouter = appRouter; // Make global for navigation hooks

// 4.5 SHOP CATALOG MOCK DATA & RENDERING
const mockShopItems = [
  {
    id: 'shop-1',
    name: 'Model S Cyber-Edition',
    category: 'vehicles',
    price: '$89,900',
    description: 'Electric futuristic luxury sedan featuring a panoramic glassmorphic roof, autopilot, and ultra-high-range battery.',
    image: 'shop_vehicles.png'
  },
  {
    id: 'shop-2',
    name: 'Neo Cruiser e-Bike',
    category: 'vehicles',
    price: '$2,400',
    description: 'Urban electric retro cruiser. Up to 80 miles range, premium leather seat, integrated smart telemetry dash.',
    image: 'shop_vehicles.png'
  },
  {
    id: 'shop-3',
    name: 'Cyberpunk Glass Bomber Jacket',
    category: 'fashion',
    price: '$180',
    description: 'Techwear fashion statement with integrated electroluminescent fiber optics, waterproof zippers, and multi-pockets.',
    image: 'shop_fashion.png'
  },
  {
    id: 'shop-4',
    name: 'Quantum Stealth Running Shoes',
    category: 'fashion',
    price: '$140',
    description: 'Ultra-light running shoes with translucent nitrogen-infused cushioning soles and woven reflective upper mesh.',
    image: 'shop_fashion.png'
  },
  {
    id: 'shop-5',
    name: 'Vital-Phone X',
    category: 'phones',
    price: '$999',
    description: 'Next-generation smartphone with a transparent holographic display, bio-signature security, and 200MP camera.',
    image: 'shop_phones.png'
  },
  {
    id: 'shop-6',
    name: 'Hub-Fold Duo',
    category: 'phones',
    price: '$1,499',
    description: 'Dual-folding high-definition OLED display, customized metal hinge, and multi-window multitasking engine.',
    image: 'shop_phones.png'
  },
  {
    id: 'shop-7',
    name: 'Aero-Buds Pro',
    category: 'electronics',
    price: '$199',
    description: 'Translucent true wireless earbuds with custom adaptive noise cancelation and spatial audio support.',
    image: 'shop_electronics.png'
  },
  {
    id: 'shop-8',
    name: 'Holo-Watch Core',
    category: 'electronics',
    price: '$349',
    description: 'Interactive biometric smartwatch featuring a curved flexible display, oxygen level monitoring, and 7-day battery.',
    image: 'shop_electronics.png'
  }
];

let currentShopFilters = { query: '', category: 'all' };

function renderShopGrid() {
  const container = document.getElementById('shop-grid-container');
  if (!container) return;
  container.innerHTML = '';

  // Apply Query
  let filtered = mockShopItems.filter(item => {
    const q = currentShopFilters.query.toLowerCase();
    return item.name.toLowerCase().includes(q) || item.description.toLowerCase().includes(q);
  });

  // Apply Category
  if (currentShopFilters.category !== 'all') {
    filtered = filtered.filter(item => item.category === currentShopFilters.category);
  }

  if (filtered.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="empty-state-icon" style="width: 32px; height: 32px; margin-bottom: 8px;"><circle cx="12" cy="12" r="10"/><line x1="15" y1="15" x2="21" y2="21"/></svg>
        <h3>No shop items found</h3>
        <p>Try searching other keywords or switch category.</p>
      </div>
    `;
    return;
  }

  filtered.forEach(item => {
    const card = document.createElement('div');
    card.className = 'shop-card';
    card.innerHTML = `
      <div class="shop-card-image" style="background-image: url('${item.image}');">
        <span class="shop-card-badge">${escapeHTML(item.category)}</span>
      </div>
      <div class="shop-card-body">
        <div class="shop-card-info">
          <h3>${escapeHTML(item.name)}</h3>
          <p class="shop-card-desc">${escapeHTML(item.description)}</p>
        </div>
        <div class="shop-card-footer">
          <span class="shop-card-price">${escapeHTML(item.price)}</span>
          <button class="btn-buy-now" onclick="showToast('Simulated purchase: ${escapeHTML(item.name)} added to cart!', 'success')">Buy Now</button>
        </div>
      </div>
    `;
    container.appendChild(card);
  });
}

// 5. FILE HUB LOGIC & SEARCH/FILTERS
let currentFileFilters = { query: '', category: 'all', sort: 'newest' };

function renderFilesGrid(filesList) {
  const container = document.getElementById('files-grid-container');
  container.innerHTML = '';

  // Apply Search Query
  let filtered = filesList.filter(file => {
    const query = currentFileFilters.query.toLowerCase();
    return file.name.toLowerCase().includes(query) ||
           file.description.toLowerCase().includes(query) ||
           file.tags.toLowerCase().includes(query);
  });

  // Apply Category Filter
  if (currentFileFilters.category !== 'all') {
    filtered = filtered.filter(file => file.category === currentFileFilters.category);
  }

  // Apply Sorting
  filtered.sort((a, b) => {
    if (currentFileFilters.sort === 'newest') {
      return new Date(b.uploadDate) - new Date(a.uploadDate);
    } else if (currentFileFilters.sort === 'downloads') {
      return (b.downloadsCount || 0) - (a.downloadsCount || 0);
    } else if (currentFileFilters.sort === 'rating') {
      return (b.avgRating || 0) - (a.avgRating || 0);
    } else if (currentFileFilters.sort === 'name') {
      return a.name.localeCompare(b.name);
    }
    return 0;
  });

  if (filtered.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="empty-state-icon"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
        <h3>No files found</h3>
        <p>Try matching other words or switch category.</p>
      </div>
    `;
    return;
  }

  filtered.forEach(file => {
    const card = document.createElement('div');
    const iconClass = getFileIconClass(file.name);
    const fileExt = file.name.split('.').pop().toUpperCase().slice(0, 4);

    card.className = 'file-card';
    card.onclick = () => openFileModal(file.id);
    
    // Set custom visual border accent color using standard category style
    card.style.setProperty('--accent-color', getCategoryColor(file.category));

    card.innerHTML = `
      <div>
        <div class="file-card-top">
          <div class="file-icon-wrapper ${iconClass}">${fileExt}</div>
          <div class="file-card-meta">
            <h3>${escapeHTML(file.name)}</h3>
            <span class="file-category-lbl">${file.category}</span>
          </div>
        </div>
        <p class="file-description-box">${escapeHTML(file.description)}</p>
      </div>
      <div class="file-card-bottom">
        <div class="file-stats-badges">
          <span class="file-stat-chip">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>
            ${file.downloadsCount || 0}
          </span>
          <span class="file-stat-chip">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
            ${file.ratingCount || 0} rev
          </span>
        </div>
        <div class="rating-badge">★ ${file.avgRating ? file.avgRating.toFixed(1) : '0.0'}</div>
      </div>
    `;
    container.appendChild(card);
  });
}

// 6. NEWS PORTAL LOGIC & SEARCH/FILTERS
let currentNewsFilters = { query: '', category: 'all' };

function renderNewsGrid(articlesList) {
  const container = document.getElementById('news-grid-container');
  container.innerHTML = '';

  // Apply Query Filters
  let filtered = articlesList.filter(art => {
    const query = currentNewsFilters.query.toLowerCase();
    return art.title.toLowerCase().includes(query) ||
           art.summary.toLowerCase().includes(query) ||
           art.content.toLowerCase().includes(query);
  });

  // Apply Category Filters
  if (currentNewsFilters.category !== 'all') {
    filtered = filtered.filter(art => art.category === currentNewsFilters.category);
  }

  // Sort: Newest articles first
  filtered.sort((a, b) => new Date(b.publishDate) - new Date(a.publishDate));

  if (filtered.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="empty-state-icon"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2zM16 8h2M16 12h2M16 16h2M6 8h6v8H6z"/></svg>
        <h3>No articles found</h3>
        <p>Try searching other keywords.</p>
      </div>
    `;
    return;
  }

  filtered.forEach(art => {
    const card = document.createElement('div');
    const badgeClass = getArticleBadgeClass(art.category);
    card.className = 'news-card';
    card.onclick = () => window.location.hash = `#/article/${art.id}`;

    card.innerHTML = `
      <div class="news-card-banner" style="background-image: url('${art.imageUrl}')">
        <span class="news-card-tag ${badgeClass}">${art.category}</span>
      </div>
      <div class="news-card-body">
        <h3>${escapeHTML(art.title)}</h3>
        <p>${escapeHTML(art.summary)}</p>
        <div class="news-card-footer">
          <div class="author-meta">
            <span class="author-dot"></span>
            <span>By ${escapeHTML(art.author)}</span>
          </div>
          <span>★ ${art.avgRating ? art.avgRating.toFixed(1) : '0.0'}</span>
        </div>
      </div>
    `;
    container.appendChild(card);
  });
}

// 7. FILE DETAIL MODAL & DOWNLOAD ENGINE
async function openFileModal(fileId) {
  const file = await db.getFile(fileId);
  if (!file) return;

  appRouter.activeFileId = fileId;
  const modal = document.getElementById('file-detail-modal');

  // Populate Modal Fields
  const iconClass = getFileIconClass(file.name);
  const fileExt = file.name.split('.').pop().toUpperCase().slice(0, 4);

  document.getElementById('modal-file-icon').className = `file-icon-large ${iconClass}`;
  document.getElementById('modal-file-icon').innerText = fileExt;

  document.getElementById('modal-file-name').innerText = file.name;
  document.getElementById('modal-file-category').innerText = file.category;
  document.getElementById('modal-file-size').innerText = formatBytes(file.blob.size);
  document.getElementById('modal-file-downloads').innerText = `${file.downloadsCount || 0} downloads`;
  
  document.getElementById('modal-file-desc').innerText = file.description;
  document.getElementById('modal-file-uploader').innerText = file.uploader;
  document.getElementById('modal-file-date').innerText = formatDate(file.uploadDate);
  
  if (file.version) {
    document.getElementById('modal-file-version').innerText = file.version;
    document.getElementById('modal-file-version-div').style.display = 'block';
  } else {
    document.getElementById('modal-file-version-div').style.display = 'none';
  }

  // Tags
  const tagsContainer = document.getElementById('modal-file-tags');
  tagsContainer.innerHTML = '';
  if (file.tags) {
    file.tags.split(',').forEach(tag => {
      const cleanTag = tag.trim();
      if (!cleanTag) return;
      const span = document.createElement('span');
      span.className = 'modal-tag';
      span.innerText = cleanTag;
      tagsContainer.appendChild(span);
    });
  }

  // Render Reviews & Form Reset
  resetStarSelector('file');
  const activeUser = auth ? auth.currentUser : null;
  const reviewerField = document.getElementById('file-reviewer-name');
  if (reviewerField) {
    reviewerField.value = activeUser ? (activeUser.displayName || activeUser.email.split('@')[0]) : '';
  }
  document.getElementById('file-review-text').value = '';
  await renderFileReviews(fileId);

  // Show Modal
  modal.classList.add('active');
}

function closeFileModal() {
  document.getElementById('file-detail-modal').classList.remove('active');
  appRouter.activeFileId = null;
}

// Download Trigger
async function triggerFileDownload() {
  const fileId = appRouter.activeFileId;
  if (!fileId) return;

  const file = await db.getFile(fileId);
  if (!file || !file.blob) {
    showToast('Failed to download file. Source missing.', 'error');
    return;
  }

  try {
    // 1. Trigger actual browser download
    const url = URL.createObjectURL(file.blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = file.name;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    // 2. Increment download statistics locally
    file.downloadsCount = (file.downloadsCount || 0) + 1;
    await db.updateFile(file);

    // 3. UI Feedbacks
    document.getElementById('modal-file-downloads').innerText = `${file.downloadsCount} downloads`;
    showToast(`Downloading: ${file.name}`, 'success');
    
    // Refresh background pages stats if router is active
    if (window.location.hash === '#/') {
      appRouter.renderDashboard();
    } else if (window.location.hash === '#/files') {
      const files = await db.getAllFiles();
      renderFilesGrid(files);
    }
  } catch (err) {
    console.error(err);
    showToast('Download triggered, file stream build error.', 'error');
  }
}

// 8. COMMENT & RATINGS PROCESSOR (ARTICLE / FILE REVIEWS)
async function renderArticleReviews(articleId) {
  const reviews = await db.getReviewsByTarget(articleId);
  const avgData = calculateAverageRating(reviews);

  document.getElementById('article-avg-rating').innerText = avgData.avg.toFixed(1);
  document.getElementById('article-avg-stars').innerText = renderStars(avgData.avg);
  document.getElementById('article-reviews-count').innerText = `(${reviews.length} reviews)`;

  const listEl = document.getElementById('article-reviews-list');
  listEl.innerHTML = '';

  if (reviews.length === 0) {
    listEl.innerHTML = '<p class="stat-desc" style="text-align: center; padding: 2rem;">No reviews submitted yet. Be the first to comment!</p>';
    return;
  }

  reviews.forEach(rev => {
    const card = document.createElement('div');
    card.className = 'review-card';
    card.innerHTML = `
      <div class="review-card-header">
        <div>
          <span class="reviewer-name">${escapeHTML(rev.reviewerName)}</span>
          <div class="review-stars">${renderStars(rev.rating)}</div>
        </div>
        <span class="review-date">${formatDate(rev.date)}</span>
      </div>
      <p>${escapeHTML(rev.text)}</p>
    `;
    listEl.appendChild(card);
  });
}

async function renderFileReviews(fileId) {
  const reviews = await db.getReviewsByTarget(fileId);
  const avgData = calculateAverageRating(reviews);

  document.getElementById('modal-avg-rating').innerText = avgData.avg.toFixed(1);
  document.getElementById('modal-avg-stars').innerText = renderStars(avgData.avg);
  document.getElementById('modal-reviews-count').innerText = `(${reviews.length} reviews)`;

  const listEl = document.getElementById('modal-reviews-list');
  listEl.innerHTML = '';

  if (reviews.length === 0) {
    listEl.innerHTML = '<p class="stat-desc" style="text-align: center; padding: 1rem;">No feedback available yet.</p>';
    return;
  }

  reviews.forEach(rev => {
    const card = document.createElement('div');
    card.className = 'review-card';
    card.innerHTML = `
      <div class="review-card-header">
        <div>
          <span class="reviewer-name">${escapeHTML(rev.reviewerName)}</span>
          <div class="review-stars">${renderStars(rev.rating)}</div>
        </div>
        <span class="review-date">${formatDate(rev.date)}</span>
      </div>
      <p>${escapeHTML(rev.text)}</p>
    `;
    listEl.appendChild(card);
  });
}

// Submit Article Review
async function handleArticleReviewSubmit(event) {
  event.preventDefault();
  const articleId = appRouter.activeArticleId;
  if (!articleId) return;

  const reviewerName = document.getElementById('article-reviewer-name').value.trim();
  const rating = parseInt(document.getElementById('article-rating-value').value);
  const text = document.getElementById('article-review-text').value.trim();

  if (!reviewerName || !text) {
    showToast('Please fill out all fields.', 'error');
    return;
  }

  const review = {
    id: `rev-${Date.now()}`,
    targetId: articleId,
    type: 'article',
    reviewerName,
    rating,
    text,
    date: new Date().toISOString()
  };

  await db.addReview(review);
  
  // Recalculate article rating summary cache in IndexedDB
  const article = await db.getArticle(articleId);
  const reviews = await db.getReviewsByTarget(articleId);
  const summary = calculateAverageRating(reviews);
  article.avgRating = summary.avg;
  article.ratingCount = reviews.length;
  article.ratingSum = summary.sum;
  await db.updateArticle(article);

  // Clear Form & Rerender
  document.getElementById('article-reviewer-name').value = '';
  document.getElementById('article-review-text').value = '';
  resetStarSelector('article');
  
  showToast('Review submitted successfully!', 'success');
  await renderArticleReviews(articleId);
}

// Submit File Review
async function handleFileReviewSubmit(event) {
  event.preventDefault();
  const fileId = appRouter.activeFileId;
  if (!fileId) return;

  const reviewerName = document.getElementById('file-reviewer-name').value.trim();
  const rating = parseInt(document.getElementById('file-rating-value').value);
  const text = document.getElementById('file-review-text').value.trim();

  if (!reviewerName || !text) {
    showToast('Please fill out all fields.', 'error');
    return;
  }

  const review = {
    id: `rev-${Date.now()}`,
    targetId: fileId,
    type: 'file',
    reviewerName,
    rating,
    text,
    date: new Date().toISOString()
  };

  await db.addReview(review);
  
  // Recalculate file rating summary cache in IndexedDB
  const file = await db.getFile(fileId);
  const reviews = await db.getReviewsByTarget(fileId);
  const summary = calculateAverageRating(reviews);
  file.avgRating = summary.avg;
  file.ratingCount = reviews.length;
  file.ratingSum = summary.sum;
  await db.updateFile(file);

  // Clear Form & Rerender
  document.getElementById('file-reviewer-name').value = '';
  document.getElementById('file-review-text').value = '';
  resetStarSelector('file');

  showToast('Feedback submitted!', 'success');
  await renderFileReviews(fileId);
  
  // Refresh background grids
  if (window.location.hash === '#/files') {
    const files = await db.getAllFiles();
    renderFilesGrid(files);
  }
}

// 9. FORM CAPTURES, CREATION & UPLOADS
let uploadedFileObject = null;

function setupUploadViewHandlers() {
  // Tabs switcher
  const fileTab = document.getElementById('profile-tab-toggle-file');
  const articleTab = document.getElementById('profile-tab-toggle-article');
  const filePanel = document.getElementById('profile-panel-file');
  const articlePanel = document.getElementById('profile-panel-article');

  if (fileTab && articleTab && filePanel && articlePanel) {
    fileTab.addEventListener('click', () => {
      fileTab.classList.add('active');
      articleTab.classList.remove('active');
      filePanel.classList.add('active');
      filePanel.style.display = 'block';
      articlePanel.classList.remove('active');
      articlePanel.style.display = 'none';
    });

    articleTab.addEventListener('click', () => {
      articleTab.classList.add('active');
      fileTab.classList.remove('active');
      articlePanel.classList.add('active');
      articlePanel.style.display = 'block';
      filePanel.classList.remove('active');
      filePanel.style.display = 'none';
    });
  }

  // Drag & Drop Mechanics
  const dropZone = document.getElementById('drag-drop-zone');
  const fileInput = document.getElementById('file-input');
  const promptContent = document.getElementById('upload-zone-prompt');
  const displayContent = document.getElementById('selected-file-display');

  if (dropZone && fileInput) {
    dropZone.addEventListener('click', () => fileInput.click());

    dropZone.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropZone.classList.add('dragover');
    });

    ['dragleave', 'dragend', 'drop'].forEach(evt => {
      dropZone.addEventListener(evt, () => dropZone.classList.remove('dragover'));
    });

    dropZone.addEventListener('drop', (e) => {
      e.preventDefault();
      if (e.dataTransfer.files.length > 0) {
        handleSelectedFile(e.dataTransfer.files[0]);
      }
    });

    fileInput.addEventListener('change', (e) => {
      if (e.target.files.length > 0) {
        handleSelectedFile(e.target.files[0]);
      }
    });
  }

  function handleSelectedFile(file) {
    if (file.size > 200 * 1024 * 1024) {
      showToast('Maximum simulated file size limit is 200MB.', 'error');
      return;
    }
    
    uploadedFileObject = file;
    if (promptContent) promptContent.style.display = 'none';
    if (displayContent) {
      displayContent.style.display = 'block';
      const fileExt = file.name.split('.').pop().toUpperCase().slice(0, 4);
      const iconClass = getFileIconClass(file.name);

      displayContent.innerHTML = `
        <div class="selected-file-icon file-icon-wrapper ${iconClass}" style="margin: 0 auto 1rem auto; width: 60px; height: 60px; font-weight:800; display:flex; align-items:center; justify-content:center; border-radius:12px;">${fileExt}</div>
        <div class="selected-file-name" style="font-weight:600; font-size:1rem; margin-bottom:0.25rem;">${escapeHTML(file.name)}</div>
        <div class="selected-file-size" style="font-size:0.8rem; color:var(--text-muted); margin-bottom:1rem;">${formatBytes(file.size)}</div>
        <button type="button" class="btn btn-secondary btn-small" id="btn-remove-selected">Change File</button>
      `;

      document.getElementById('btn-remove-selected').addEventListener('click', (e) => {
        e.stopPropagation();
        uploadedFileObject = null;
        displayContent.style.display = 'none';
        promptContent.style.display = 'block';
        fileInput.value = '';
      });
    }

    // Smart autofill category based on name
    const ext = file.name.split('.').pop().toLowerCase();
    const catSelect = document.getElementById('file-category');
    if (catSelect) {
      if (['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp'].includes(ext)) {
        catSelect.value = 'images';
      } else if (['zip', 'rar', 'tar', 'gz', '7z'].includes(ext)) {
        catSelect.value = 'archives';
      } else if (['pdf', 'docx', 'doc', 'xlsx', 'pptx', 'txt'].includes(ext)) {
        catSelect.value = 'documents';
      } else if (['js', 'html', 'css', 'py', 'java', 'cpp', 'json', 'exe', 'sh'].includes(ext)) {
        catSelect.value = 'software';
      } else {
        catSelect.value = 'other';
      }
    }
  }

  // --- SUBMISSIONS HANDLERS ---
  const fileForm = document.getElementById('file-upload-form');
  if (fileForm) {
    fileForm.addEventListener('submit', async (e) => {
      e.preventDefault();

      if (!uploadedFileObject) {
        showToast('Please select or drop a file to upload.', 'error');
        return;
      }

      // Read active name from profile storage
      const uploader = localStorage.getItem('vitalhub_username') || 'Guest User';
      const category = document.getElementById('file-category').value;
      const version = document.getElementById('file-version').value.trim();
      const tags = document.getElementById('file-tags').value.trim();
      const description = document.getElementById('file-description').value.trim();

      const fileSubmitBtn = document.getElementById('btn-file-submit');
      fileSubmitBtn.disabled = true;
      fileSubmitBtn.innerText = 'Uploading...';

      setTimeout(async () => {
        const fileId = `file-${Date.now()}`;
        const newFileRecord = {
          id: fileId,
          name: uploadedFileObject.name,
          uploader: uploader,
          category,
          version: version || null,
          tags: tags || 'shared',
          description,
          uploadDate: new Date().toISOString(),
          downloadsCount: 0,
          ratingSum: 0,
          ratingCount: 0,
          avgRating: 0.0,
          blob: uploadedFileObject
        };

        try {
          await db.addFile(newFileRecord);
          showToast('File shared successfully!', 'success');
          
          // Reset
          uploadedFileObject = null;
          fileForm.reset();
          if (displayContent) displayContent.style.display = 'none';
          if (promptContent) promptContent.style.display = 'block';
          if (fileInput) fileInput.value = '';

          // Redirect to files tab
          window.location.hash = '#/files';
        } catch (err) {
          console.error(err);
          showToast('Failed to write file to local store.', 'error');
        } finally {
          fileSubmitBtn.disabled = false;
          fileSubmitBtn.innerText = 'Upload & Share File';
        }
      }, 800);
    });
  }

  // Write Article Submission
  const articleForm = document.getElementById('article-write-form');
  if (articleForm) {
    articleForm.addEventListener('submit', async (e) => {
      e.preventDefault();

      const title = document.getElementById('article-title').value.trim();
      // Read active author from profile storage
      const author = localStorage.getItem('vitalhub_username') || 'Guest User';
      const category = document.getElementById('article-category').value;
      const summary = document.getElementById('article-summary').value.trim();
      const contentText = document.getElementById('article-content').value;
      let imageUrl = document.getElementById('article-image').value.trim();

      if (!imageUrl) {
        // Generate abstract template
        imageUrl = generateAbstractBanner(title, category);
      }

      const articleSubmitBtn = document.getElementById('btn-article-submit');
      articleSubmitBtn.disabled = true;
      articleSubmitBtn.innerText = 'Publishing...';

      setTimeout(async () => {
        const htmlBody = contentText
          .split('\n\n')
          .map(p => {
            if (p.trim().startsWith('<')) return p;
            return `<p>${escapeHTML(p.trim()).replace(/\n/g, '<br>')}</p>`;
          })
          .join('\n');

        const articleId = `art-${Date.now()}`;
        const newArticle = {
          id: articleId,
          title,
          author,
          category,
          imageUrl,
          summary,
          content: htmlBody,
          publishDate: new Date().toISOString(),
          ratingSum: 0,
          ratingCount: 0,
          avgRating: 0.0
        };

        try {
          await db.addArticle(newArticle);
          showToast('News article published!', 'success');
          
          articleForm.reset();
          window.location.hash = '#/news';
        } catch (err) {
          console.error(err);
          showToast('Error publishing article to store.', 'error');
        } finally {
          articleSubmitBtn.disabled = false;
          articleSubmitBtn.innerText = 'Publish Article';
        }
      }, 600);
    });
  }
}

// 10. DECORATIVE ELEMENTS & EVENTS INTEGRATION
function setupStarInputHandlers() {
  ['article', 'file'].forEach(type => {
    const stars = document.querySelectorAll(`#${type}-star-input .star-btn`);
    const inputVal = document.getElementById(`${type}-rating-value`);

    stars.forEach(star => {
      // Hover effects
      star.addEventListener('mouseenter', () => {
        const val = parseInt(star.dataset.value);
        highlightStars(stars, val);
      });

      star.addEventListener('mouseleave', () => {
        const activeVal = parseInt(inputVal.value);
        highlightStars(stars, activeVal);
      });

      // Selection click
      star.addEventListener('click', () => {
        const val = parseInt(star.dataset.value);
        inputVal.value = val;
        highlightStars(stars, val);
      });
    });
  });
}

function highlightStars(stars, count) {
  stars.forEach(s => {
    const val = parseInt(s.dataset.value);
    if (val <= count) {
      s.classList.add('active');
    } else {
      s.classList.remove('active');
    }
  });
}

function resetStarSelector(type) {
  const stars = document.querySelectorAll(`#${type}-star-input .star-btn`);
  const inputVal = document.getElementById(`${type}-rating-value`);
  inputVal.value = '5';
  highlightStars(stars, 5);
}

// Toast notification trigger
function showToast(message, type = 'success') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  
  // Icon based on type
  let icon = '';
  if (type === 'success') {
    icon = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="btn-icon"><polyline points="20 6 9 17 4 12"/></svg>';
  } else if (type === 'error') {
    icon = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="btn-icon"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';
  } else {
    icon = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="btn-icon"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>';
  }

  toast.innerHTML = `${icon} <span>${escapeHTML(message)}</span>`;
  container.appendChild(toast);

  // Auto remove
  setTimeout(() => {
    toast.classList.add('toast-closing');
    toast.addEventListener('animationend', () => {
      toast.remove();
    });
  }, 3000);
}

// 11. SEARCH AND FILTER EVENT ATTACHMENTS
function setupFiltersEvents() {
  // File Hub Search & Filters
  const fileSearch = document.getElementById('file-search-input');
  fileSearch.addEventListener('input', debounce(async (e) => {
    currentFileFilters.query = e.target.value.trim();
    const files = await db.getAllFiles();
    renderFilesGrid(files);
  }, 250));

  const fileCategoryFilters = document.getElementById('file-category-filters');
  fileCategoryFilters.addEventListener('click', async (e) => {
    const btn = e.target.closest('.filter-btn');
    if (!btn) return;

    fileCategoryFilters.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');

    currentFileFilters.category = btn.dataset.category;
    const files = await db.getAllFiles();
    renderFilesGrid(files);
  });

  const fileSort = document.getElementById('file-sort-select');
  fileSort.addEventListener('change', async (e) => {
    currentFileFilters.sort = e.target.value;
    const files = await db.getAllFiles();
    renderFilesGrid(files);
  });

  // News Search & Filters
  const newsSearch = document.getElementById('news-search-input');
  newsSearch.addEventListener('input', debounce(async (e) => {
    currentNewsFilters.query = e.target.value.trim();
    const articles = await db.getAllArticles();
    renderNewsGrid(articles);
  }, 250));

  const newsCategoryFilters = document.getElementById('news-category-filters');
  newsCategoryFilters.addEventListener('click', async (e) => {
    const btn = e.target.closest('.filter-btn');
    if (!btn) return;

    newsCategoryFilters.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');

    currentNewsFilters.category = btn.dataset.category;
    const articles = await db.getAllArticles();
    renderNewsGrid(articles);
  });

  // Shop Search & Filters
  const shopSearch = document.getElementById('shop-search-input');
  if (shopSearch) {
    shopSearch.addEventListener('input', debounce(() => {
      currentShopFilters.query = shopSearch.value.trim();
      // Re-invoke renderShop with active route param to update panels
      const hash = window.location.hash.replace(/^#\//, '');
      const segments = hash.split('/');
      const param = (segments[0] === 'shop' && segments[1]) ? segments[1] : null;
      appRouter.renderShop(param);
    }, 250));
  }
}

// 12. HELPER UTILITIES
function escapeHTML(str) {
  if (!str) return '';
  return str.replace(/[&<>'"]/g, 
    tag => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      "'": '&#39;',
      '"': '&quot;'
    }[tag] || tag)
  );
}

function formatDate(isoString) {
  if (!isoString) return '';
  const d = new Date(isoString);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatBytes(bytes, decimals = 1) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

function getFileIconClass(filename) {
  const ext = filename.split('.').pop().toLowerCase();
  if (['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp'].includes(ext)) return 'color-image';
  if (['zip', 'rar', 'tar', 'gz', '7z'].includes(ext)) return 'color-archive';
  if (['pdf'].includes(ext)) return 'color-pdf';
  if (['docx', 'doc', 'txt', 'xlsx'].includes(ext)) return 'color-doc';
  if (['js', 'html', 'css', 'py', 'json'].includes(ext)) return 'color-code';
  return 'color-other';
}

function getCategoryColor(category) {
  const map = {
    'documents': '#3b82f6', // blue
    'images': '#10b981',    // green
    'archives': '#eab308',  // yellow
    'software': '#a855f7',  // purple
    'other': '#6b7280'      // gray
  };
  return map[category] || '#7c3aed';
}

function getArticleBadgeClass(category) {
  if (category === 'tech') return 'tag-tech';
  if (category === 'updates') return 'tag-updates';
  if (category === 'gaming') return 'tag-gaming';
  return '';
}

function calculateAverageRating(reviewsList) {
  if (!reviewsList || reviewsList.length === 0) return { avg: 0, sum: 0 };
  const sum = reviewsList.reduce((acc, curr) => acc + curr.rating, 0);
  return { avg: sum / reviewsList.length, sum };
}

function renderStars(rating) {
  const val = Math.round(rating || 0);
  return '★'.repeat(val) + '☆'.repeat(5 - val);
}

function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

// 13. USER PROFILE, THEME ACCENTS & DATABASE UTILITIES
function logSystemMessage(message) {
  const logBox = document.getElementById('developer-log-box');
  if (logBox) {
    const div = document.createElement('div');
    const timestamp = new Date().toLocaleTimeString();
    div.innerText = `[${timestamp}] ${message}`;
    logBox.appendChild(div);
    logBox.scrollTop = logBox.scrollHeight;
  }
}

function loadProfileFromStorage() {
  const username = localStorage.getItem('vitalhub_username') || 'Guest User';
  const bio = localStorage.getItem('vitalhub_bio') || 'Contributor at Vitalhub. Passionate coder and designer.';
  
  const usernameInput = document.getElementById('profile-username');
  const bioInput = document.getElementById('profile-bio');
  if (usernameInput) usernameInput.value = username;
  if (bioInput) bioInput.value = bio;
  
  updateProfileDisplays(username, bio);
}

function updateProfileDisplays(username, bio) {
  const nameTitle = document.getElementById('profile-name-title');
  const avatarDisplay = document.getElementById('profile-avatar-display');
  if (nameTitle) nameTitle.innerText = username;
  if (avatarDisplay) {
    avatarDisplay.innerText = username.charAt(0).toUpperCase();
  }
  logSystemMessage(`Profile loaded: ${username}`);
}

function setupProfileEditHandler() {
  const form = document.getElementById('profile-edit-form');
  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const username = document.getElementById('profile-username').value.trim();
      const bio = document.getElementById('profile-bio').value.trim();
      
      if (!username) {
        showToast('Please enter an alias.', 'error');
        return;
      }
      
      const submitBtn = form.querySelector('button[type="submit"]');
      const originalText = submitBtn.innerText;
      submitBtn.disabled = true;
      submitBtn.innerText = 'Saving...';
      
      try {
        const activeUser = auth ? auth.currentUser : null;
        if (activeUser) {
          // Update display name in Firebase Auth
          await activeUser.updateProfile({ displayName: username });
          
          // Save bio locally keyed by user uid
          localStorage.setItem(`vitalhub_bio_${activeUser.uid}`, bio);
          localStorage.setItem('vitalhub_bio', bio);
        }
        
        localStorage.setItem('vitalhub_username', username);
        
        updateProfileDisplays(username, bio);
        showToast('Profile saved successfully!', 'success');
      } catch (err) {
        console.error(err);
        showToast('Failed to update Firebase profile.', 'error');
      } finally {
        submitBtn.disabled = false;
        submitBtn.innerText = originalText;
      }
    });
  }
}

// 14. FIREBASE AUTHENTICATION UTILITIES & STATE LIFECYCLE
function showVerificationScreen(email) {
  const authCard = document.getElementById('profile-auth-card');
  const detailsCard = document.getElementById('profile-details-card');
  const workspaceLocked = document.getElementById('profile-workspace-locked');
  const workspaceUnlocked = document.getElementById('profile-workspace-unlocked');
  const verificationCard = document.getElementById('profile-verification-card');
  const verificationMessage = document.getElementById('verification-message');
  
  if (authCard) authCard.style.display = 'none';
  if (detailsCard) detailsCard.style.display = 'none';
  if (workspaceLocked) workspaceLocked.style.display = 'block';
  if (workspaceUnlocked) workspaceUnlocked.style.display = 'none';
  if (verificationCard) verificationCard.style.display = 'block';
  if (verificationMessage) {
    verificationMessage.innerText = `We have sent you a verification email to ${email}. please verify it and log in.`;
  }
}

function initializeAuthStateListener() {
  if (!auth) {
    const authCard = document.getElementById('profile-auth-card');
    const detailsCard = document.getElementById('profile-details-card');
    const workspaceLocked = document.getElementById('profile-workspace-locked');
    const workspaceUnlocked = document.getElementById('profile-workspace-unlocked');
    
    if (authCard) authCard.style.display = 'block';
    if (detailsCard) detailsCard.style.display = 'none';
    if (workspaceLocked) workspaceLocked.style.display = 'block';
    if (workspaceUnlocked) workspaceUnlocked.style.display = 'none';
    
    // In offline guest mode, disable auth submission and update instructions
    const submitBtn = document.getElementById('btn-auth-submit');
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.innerText = 'Auth Offline';
    }
    const googleBtn = document.getElementById('btn-google-signin');
    if (googleBtn) {
      googleBtn.disabled = true;
      const btnText = googleBtn.querySelector('span');
      if (btnText) btnText.innerText = 'Google Auth Offline';
    }
    const authDesc = document.getElementById('auth-desc');
    if (authDesc) {
      authDesc.innerHTML = '<span style="color:var(--accent-violet);">Firebase offline or blocked.</span> Please check your internet connection to access user accounts. Local database is active.';
    }
    
    localStorage.setItem('sharehub_username', 'Guest User');
    localStorage.removeItem('sharehub_bio');
    updateProfileDisplays('Guest User', 'Please sign in to view bio.');
    logSystemMessage('Firebase auth not available. Running in guest-only mode.');
    return;
  }

  auth.onAuthStateChanged((user) => {
    const authCard = document.getElementById('profile-auth-card');
    const detailsCard = document.getElementById('profile-details-card');
    const workspaceLocked = document.getElementById('profile-workspace-locked');
    const workspaceUnlocked = document.getElementById('profile-workspace-unlocked');
    const verificationCard = document.getElementById('profile-verification-card');
    
    if (user) {
      // Check if email is verified
      if (!user.emailVerified) {
        auth.signOut().catch(console.error);
        showVerificationScreen(user.email);
        return;
      }

      // Logged In
      if (authCard) authCard.style.display = 'none';
      if (detailsCard) detailsCard.style.display = 'block';
      if (workspaceLocked) workspaceLocked.style.display = 'none';
      if (workspaceUnlocked) workspaceUnlocked.style.display = 'block';
      if (verificationCard) verificationCard.style.display = 'none';
      
      // Update username in localStorage for uploads and articles
      const displayName = user.displayName || user.email.split('@')[0];
      localStorage.setItem('vitalhub_username', displayName);
      
      // Load user specific bio
      const savedBio = localStorage.getItem(`vitalhub_bio_${user.uid}`) || 'Contributor at Vitalhub. Passionate coder and designer.';
      localStorage.setItem('vitalhub_bio', savedBio);
      
      // Update displays
      updateProfileDisplays(displayName, savedBio);
      
      // Sync form input values
      const usernameInput = document.getElementById('profile-username');
      const bioInput = document.getElementById('profile-bio');
      if (usernameInput) usernameInput.value = displayName;
      if (bioInput) bioInput.value = savedBio;
      
      logSystemMessage(`User session active: ${user.email}`);
    } else {
      // Logged Out
      if (verificationCard && verificationCard.style.display === 'block') {
        if (authCard) authCard.style.display = 'none';
        if (detailsCard) detailsCard.style.display = 'none';
        if (workspaceLocked) workspaceLocked.style.display = 'block';
        if (workspaceUnlocked) workspaceUnlocked.style.display = 'none';
      } else {
        if (authCard) authCard.style.display = 'block';
        if (detailsCard) detailsCard.style.display = 'none';
        if (workspaceLocked) workspaceLocked.style.display = 'block';
        if (workspaceUnlocked) workspaceUnlocked.style.display = 'none';
        if (verificationCard) verificationCard.style.display = 'none';
      }
      
      localStorage.setItem('vitalhub_username', 'Guest User');
      localStorage.removeItem('vitalhub_bio');
      
      // Update displays to default guest
      updateProfileDisplays('Guest User', 'Please sign in to view bio.');
      
      logSystemMessage('No user session active.');
    }
  });
}

function setupAuthFormHandler() {
  if (!auth) return;
  const form = document.getElementById('auth-form');
  const toggleBtn = document.getElementById('btn-auth-toggle');
  const submitBtn = document.getElementById('btn-auth-submit');
  const title = document.getElementById('auth-title');
  const desc = document.getElementById('auth-desc');
  const togglePrompt = document.getElementById('auth-toggle-prompt');
  
  let isSignUpMode = false;
  
  if (toggleBtn) {
    toggleBtn.addEventListener('click', (e) => {
      e.preventDefault();
      isSignUpMode = !isSignUpMode;
      if (isSignUpMode) {
        if (title) title.innerText = 'Create Account';
        if (desc) desc.innerText = 'Sign up for a free ShareHub account to start uploading files and publishing news.';
        if (submitBtn) submitBtn.innerText = 'Sign Up';
        if (togglePrompt) togglePrompt.innerText = 'Already have an account?';
        if (toggleBtn) toggleBtn.innerText = 'Sign In';
      } else {
        if (title) title.innerText = 'Sign In';
        if (desc) desc.innerText = 'Sign in to your ShareHub account to upload files and publish articles.';
        if (submitBtn) submitBtn.innerText = 'Sign In';
        if (togglePrompt) togglePrompt.innerText = "Don't have an account?";
        if (toggleBtn) toggleBtn.innerText = 'Sign Up';
      }
    });
  }
  
  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = document.getElementById('auth-email').value.trim();
      const password = document.getElementById('auth-password').value;
      
      if (!email || !password) {
        showToast('Please fill out all fields.', 'error');
        return;
      }
      
      if (password.length < 6) {
        showToast('Password must be at least 6 characters.', 'error');
        return;
      }
      
      submitBtn.disabled = true;
      const originalText = submitBtn.innerText;
      submitBtn.innerText = isSignUpMode ? 'Signing Up...' : 'Signing In...';
      
      try {
        if (isSignUpMode) {
          // Register
          const userCredential = await auth.createUserWithEmailAndPassword(email, password);
          const user = userCredential.user;
          logSystemMessage(`User created: ${email}. Sending verification email...`);
          await user.sendEmailVerification();
          logSystemMessage(`Verification email sent to: ${email}. Manually verify in Firebase Console if testing.`);
          await auth.signOut();
          showVerificationScreen(email);
          showToast('Account created! Verification email sent.', 'success');
        } else {
          // Login
          const userCredential = await auth.signInWithEmailAndPassword(email, password);
          const user = userCredential.user;
          if (!user.emailVerified) {
            logSystemMessage(`Unverified login attempt for: ${email}. Sending verification email...`);
            await user.sendEmailVerification();
            await auth.signOut();
            showVerificationScreen(email);
            showToast('Email not verified. Verification email sent.', 'warning');
          } else {
            showToast('Signed in successfully!', 'success');
          }
        }
        form.reset();
      } catch (err) {
        console.error(err);
        let errorMsg = 'Authentication failed.';
        if (err.code === 'auth/email-already-in-use') {
          errorMsg = 'Email already registered.';
        } else if (err.code === 'auth/invalid-credential') {
          errorMsg = 'Incorrect email or password.';
        } else if (err.code === 'auth/weak-password') {
          errorMsg = 'Password is too weak.';
        } else if (err.code === 'auth/invalid-email') {
          errorMsg = 'Invalid email address.';
        }
        showToast(errorMsg, 'error');
      } finally {
        submitBtn.disabled = false;
        submitBtn.innerText = originalText;
      }
    });
  }
  
  // Locked workspace Sign In focus button
  const focusBtn = document.getElementById('btn-focus-auth');
  if (focusBtn) {
    focusBtn.addEventListener('click', () => {
      const emailInput = document.getElementById('auth-email');
      if (emailInput) emailInput.focus();
    });
  }

  // Google Sign-In button handler
  const googleBtn = document.getElementById('btn-google-signin');
  if (googleBtn) {
    googleBtn.addEventListener('click', async () => {
      const btnText = googleBtn.querySelector('span');
      const originalText = btnText ? btnText.innerText : 'Continue with Google';
      try {
        googleBtn.disabled = true;
        if (btnText) btnText.innerText = 'Connecting...';
        
        const provider = new firebase.auth.GoogleAuthProvider();
        const result = await auth.signInWithPopup(provider);
        const user = result.user;
        
        showToast(`Welcome ${user.displayName || user.email}!`, 'success');
      } catch (err) {
        console.error(err);
        showToast(err.message || 'Google Sign-In failed.', 'error');
      } finally {
        googleBtn.disabled = false;
        if (btnText) btnText.innerText = originalText;
      }
    });
  }
}

function setupSignOutHandler() {
  const btn = document.getElementById('btn-sign-out');
  if (btn) {
    btn.addEventListener('click', async () => {
      if (!auth) return;
      try {
        await auth.signOut();
        showToast('Signed out successfully.', 'info');
      } catch (err) {
        console.error(err);
        showToast('Failed to sign out.', 'error');
      }
    });
  }
}

function setupVerificationViewHandlers() {
  const continueBtn = document.getElementById('btn-verification-continue');
  if (continueBtn) {
    continueBtn.addEventListener('click', () => {
      const authCard = document.getElementById('profile-auth-card');
      const verificationCard = document.getElementById('profile-verification-card');
      if (verificationCard) verificationCard.style.display = 'none';
      if (authCard) authCard.style.display = 'block';
    });
  }
  
  const resendBtn = document.getElementById('btn-verification-resend');
  if (resendBtn) {
    resendBtn.addEventListener('click', (e) => {
      e.preventDefault();
      showToast('To resend the verification link, please try signing in with your email and password.', 'info');
    });
  }
}

function setupStatsAccordionHandler() {
  const container = document.getElementById('profile-stats-card');
  if (container) {
    container.addEventListener('click', (e) => {
      const trigger = e.target.closest('.stats-accordion-trigger');
      if (!trigger) return;
      
      const item = trigger.closest('.stats-accordion-item');
      const content = item.querySelector('.stats-accordion-content');
      const arrow = trigger.querySelector('.accordion-arrow');
      
      const isExpanded = trigger.getAttribute('aria-expanded') === 'true';
      
      // Toggle expanded state
      trigger.setAttribute('aria-expanded', !isExpanded);
      
      if (!isExpanded) {
        content.classList.add('active');
        if (arrow) arrow.style.transform = 'rotate(180deg)';
      } else {
        content.classList.remove('active');
        if (arrow) arrow.style.transform = 'rotate(0deg)';
      }
    });
  }
}

function setupThemeAccentSelectors() {
  const container = document.getElementById('theme-accent-selectors');
  if (container) {
    container.addEventListener('click', (e) => {
      const btn = e.target.closest('.theme-chip-btn');
      if (!btn) return;
      const theme = btn.dataset.theme;
      applyThemeAccent(theme);
      showToast(`Accent theme set to ${theme}`, 'info');
    });
  }
  
  const savedTheme = localStorage.getItem('vitalhub_theme') || 'violet';
  applyThemeAccent(savedTheme);
}

function applyThemeAccent(themeName) {
  const root = document.documentElement;
  const container = document.getElementById('theme-accent-selectors');
  if (container) {
    container.querySelectorAll('.theme-chip-btn').forEach(btn => {
      if (btn.dataset.theme === themeName) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });
  }

  const themes = {
    violet: {
      primary: 'hsl(262, 83%, 65%)',
      hover: 'hsl(262, 83%, 58%)',
      glow: 'rgba(139, 92, 246, 0.3)'
    },
    cyan: {
      primary: 'hsl(190, 95%, 50%)',
      hover: 'hsl(190, 95%, 43%)',
      glow: 'rgba(6, 182, 212, 0.25)'
    },
    pink: {
      primary: 'hsl(330, 85%, 60%)',
      hover: 'hsl(330, 85%, 53%)',
      glow: 'rgba(236, 72, 153, 0.25)'
    },
    emerald: {
      primary: 'hsl(142, 76%, 45%)',
      hover: 'hsl(142, 76%, 38%)',
      glow: 'rgba(34, 197, 94, 0.2)'
    }
  };

  const selected = themes[themeName] || themes.violet;
  root.style.setProperty('--accent-violet', selected.primary);
  root.style.setProperty('--accent-violet-hover', selected.hover);
  root.style.setProperty('--accent-violet-glow', selected.glow);
  
  localStorage.setItem('vitalhub_theme', themeName);
  logSystemMessage(`Theme accent changed to: ${themeName}`);
}

async function updateDatabaseSizeDisplay() {
  const sizeEl = document.getElementById('others-db-size');
  if (!sizeEl) return;
  
  try {
    const files = await db.getAllFiles();
    const articles = await db.getAllArticles();
    const reviews = await db.getAllReviews();
    
    let totalBytes = 0;
    
    files.forEach(f => {
      if (f.blob) {
        totalBytes += f.blob.size;
      }
      totalBytes += JSON.stringify(f).length;
    });
    
    articles.forEach(a => {
      totalBytes += JSON.stringify(a).length;
    });
    
    reviews.forEach(r => {
      totalBytes += JSON.stringify(r).length;
    });
    
    sizeEl.innerText = formatBytes(totalBytes);
    logSystemMessage(`Database size updated: ${formatBytes(totalBytes)}`);
  } catch (err) {
    console.error('Failed to calculate DB size:', err);
    sizeEl.innerText = 'Error';
  }
}

function wipeAndResetDatabase() {
  const btn = document.getElementById('btn-clear-db');
  if (!btn) return;
  
  btn.addEventListener('click', async () => {
    if (confirm('Are you sure you want to WIPE the local database? This will clear all reviews, files, and articles and reload default mocks.')) {
      btn.disabled = true;
      btn.innerText = 'Wiping Store...';
      
      try {
        if (db.useFallback) {
          db.fallbackStore = { files: [], articles: [], reviews: [] };
          localStorage.removeItem('vitalhub_fallback_files');
          localStorage.removeItem('vitalhub_fallback_articles');
          localStorage.removeItem('vitalhub_fallback_reviews');
          
          await seedDatabaseIfEmpty();
          showToast('Database reset successfully!', 'success');
          
          const hash = window.location.hash;
          if (hash === '#/') {
            appRouter.renderDashboard();
          } else if (hash === '#/files') {
            appRouter.renderFiles();
          } else if (hash === '#/news') {
            appRouter.renderNews();
          } else if (hash === '#/profile') {
            appRouter.renderProfile();
          }
          
          btn.disabled = false;
          btn.innerText = 'Wipe & Reset Database';
          return;
        }

        if (db.db) {
          db.db.close();
        }
        
        const deleteReq = indexedDB.deleteDatabase(DB_NAME);
        deleteReq.onsuccess = async () => {
          logSystemMessage('Database deleted successfully.');
          
          await db.init();
          await seedDatabaseIfEmpty();
          
          showToast('Database reset successfully!', 'success');
          
          const hash = window.location.hash;
          if (hash === '#/') {
            appRouter.renderDashboard();
          } else if (hash === '#/files') {
            appRouter.renderFiles();
          } else if (hash === '#/news') {
            appRouter.renderNews();
          } else if (hash === '#/profile') {
            appRouter.renderProfile();
          }
          
          btn.disabled = false;
          btn.innerText = 'Wipe & Reset Database';
        };
        deleteReq.onerror = () => {
          showToast('Failed to delete database.', 'error');
          btn.disabled = false;
          btn.innerText = 'Wipe & Reset Database';
        };
      } catch (err) {
        console.error(err);
        showToast('Error resetting database.', 'error');
        btn.disabled = false;
        btn.innerText = 'Wipe & Reset Database';
      }
    }
  });
}

// --- GLOBAL INIT ---
(async () => {
  // 1. Init Database and Seed Mock Data (with local error fallback safety)
  try {
    await db.init();
    await seedDatabaseIfEmpty();
  } catch (err) {
    console.error('App database initialization failed:', err);
    db.useFallback = true;
  }

  // 2. Init router and setup UI handlers (guarded against missing elements)
  try {
    // Setup router hash handlers
    appRouter.init();

    // Setup interaction event handlers
    setupUploadViewHandlers();
    setupStarInputHandlers();
    setupFiltersEvents();

    // Connect static detail triggers
    const closeModalBtn = document.getElementById('btn-close-modal');
    if (closeModalBtn) {
      closeModalBtn.addEventListener('click', closeFileModal);
    }
    
    const downloadFileBtn = document.getElementById('btn-download-file');
    if (downloadFileBtn) {
      downloadFileBtn.addEventListener('click', triggerFileDownload);
    }
    
    // Overlay backdrop closes modal
    const detailModal = document.getElementById('file-detail-modal');
    if (detailModal) {
      detailModal.addEventListener('click', (e) => {
        if (e.target.id === 'file-detail-modal') closeFileModal();
      });
    }

    // Review submit handlers
    const artReviewForm = document.getElementById('article-review-form');
    if (artReviewForm) {
      artReviewForm.addEventListener('submit', handleArticleReviewSubmit);
    }
    
    const fileReviewForm = document.getElementById('file-review-form');
    if (fileReviewForm) {
      fileReviewForm.addEventListener('submit', handleFileReviewSubmit);
    }
    
    // Wire up write shortcut on News header
    const shortcutBtn = document.getElementById('btn-write-article-shortcut');
    if (shortcutBtn) {
      shortcutBtn.addEventListener('click', (e) => {
        e.preventDefault();
        appRouter.showTab('profile', 'article');
      });
    }

    // Wire up upload shortcut on File Hub header
    const uploadShortcutBtn = document.getElementById('btn-upload-file-shortcut');
    if (uploadShortcutBtn) {
      uploadShortcutBtn.addEventListener('click', (e) => {
        e.preventDefault();
        appRouter.showTab('profile', 'file');
      });
    }

    // Initialize Profile Details & Auth State Listener
    initializeAuthStateListener();
    setupProfileEditHandler();
    setupAuthFormHandler();
    setupVerificationViewHandlers();
    setupStatsAccordionHandler();
    setupSignOutHandler();

    // Initialize Theme Accent Selectors
    setupThemeAccentSelectors();

    // Initialize Database Maintenance Wipes
    wipeAndResetDatabase();

  } catch (err) {
    console.error('App UI load failure:', err);
  }
})();

// ==========================================================================
// 18. CUSTOM VIDEOS PORTAL ENGINE (WITH CANVAS OFFLINE FALLBACK)
// ==========================================================================
let videoStates = {
  1: { playing: false, currentTime: 0, duration: 8, timerId: null, isCanvas: false },
  2: { playing: false, currentTime: 0, duration: 10, timerId: null, isCanvas: false }
};

function initCustomVideoPlayers() {
  for (let id of [1, 2]) {
    const video = document.getElementById(`video-player-${id}`);
    const canvas = document.getElementById(`video-canvas-${id}`);
    const overlay = document.getElementById(`video-overlay-${id}`);
    const playBtn = document.getElementById(`play-btn-${id}`);
    const ctrlPlayBtn = document.getElementById(`ctrl-play-${id}`);
    const ctrlPlayIcon = document.getElementById(`ctrl-play-icon-${id}`);
    const progressBar = document.getElementById(`progress-bar-${id}`);
    const progressWrapper = progressBar.parentElement;
    const timer = document.getElementById(`timer-${id}`);

    if (!video || !canvas) continue;

    // Reset state
    if (videoStates[id].timerId) {
      cancelAnimationFrame(videoStates[id].timerId);
      videoStates[id].timerId = null;
    }
    videoStates[id].playing = false;
    videoStates[id].currentTime = 0;
    videoStates[id].isCanvas = false;
    video.style.display = 'block';
    canvas.style.display = 'none';
    overlay.classList.remove('playing');
    ctrlPlayIcon.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" style="width: 16px; height: 16px;"><path d="M8 5v14l11-7z"/></svg>`;
    
    updatePlayerUI(id);

    // Error handling -> Fallback to Canvas
    video.onerror = () => {
      switchToCanvas(id);
    };
    
    // Check if source failed to load
    if (video.error) {
      switchToCanvas(id);
    } else {
      setTimeout(() => {
        if (video.networkState === HTMLMediaElement.NETWORK_NO_SOURCE || video.readyState === 0) {
          switchToCanvas(id);
        }
      }, 300);
    }

    function switchToCanvas(id) {
      video.pause();
      video.style.display = 'none';
      canvas.style.display = 'block';
      videoStates[id].isCanvas = true;
      drawCanvasFrame(id, 0); // draw initial frame
    }

    // Toggle Play/Pause
    function togglePlay() {
      const state = videoStates[id];
      if (state.playing) {
        // Pause
        state.playing = false;
        overlay.classList.remove('playing');
        ctrlPlayIcon.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" style="width: 16px; height: 16px;"><path d="M8 5v14l11-7z"/></svg>`;
        if (!state.isCanvas) {
          video.pause();
        } else {
          if (state.timerId) {
            cancelAnimationFrame(state.timerId);
            state.timerId = null;
          }
        }
      } else {
        // Play
        state.playing = true;
        overlay.classList.add('playing');
        ctrlPlayIcon.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" style="width: 16px; height: 16px;"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>`;
        if (!state.isCanvas) {
          video.play().catch(() => switchToCanvas(id));
          updateVideoProgressLoop();
        } else {
          state.lastTime = performance.now();
          updateCanvasLoop();
        }
      }
    }

    // Overlay click / Play button click
    overlay.onclick = togglePlay;
    playBtn.onclick = (e) => { e.stopPropagation(); togglePlay(); };
    ctrlPlayBtn.onclick = (e) => { e.stopPropagation(); togglePlay(); };

    // Timeline seeking
    progressWrapper.onclick = (e) => {
      e.stopPropagation();
      const rect = progressWrapper.getBoundingClientRect();
      const pct = (e.clientX - rect.left) / rect.width;
      const state = videoStates[id];
      state.currentTime = pct * state.duration;
      if (!state.isCanvas) {
        video.currentTime = state.currentTime;
      } else {
        drawCanvasFrame(id, state.currentTime);
      }
      updatePlayerUI(id);
    };

    // Video native listeners (if video works)
    video.ontimeupdate = () => {
      if (!videoStates[id].isCanvas) {
        videoStates[id].currentTime = video.currentTime;
        videoStates[id].duration = video.duration || 10;
        updatePlayerUI(id);
      }
    };

    video.onended = () => {
      togglePlay();
    };

    // Canvas loop animation runner
    function updateCanvasLoop() {
      const state = videoStates[id];
      if (!state.playing) return;

      const now = performance.now();
      const dt = (now - state.lastTime) / 1000;
      state.lastTime = now;

      state.currentTime += dt;
      if (state.currentTime >= state.duration) {
        state.currentTime = 0; // loop
      }

      drawCanvasFrame(id, state.currentTime);
      updatePlayerUI(id);

      state.timerId = requestAnimationFrame(updateCanvasLoop);
    }

    // Video progress loop runner (if video playing)
    function updateVideoProgressLoop() {
      const state = videoStates[id];
      if (!state.playing || state.isCanvas) return;
      state.currentTime = video.currentTime;
      updatePlayerUI(id);
      requestAnimationFrame(updateVideoProgressLoop);
    }
  }

  // Wire up Floating Action Button (FAB)
  const fabBtn = document.getElementById('fab-add-video');
  if (fabBtn) {
    fabBtn.onclick = () => {
      showToast('Video upload feature coming soon! Publishing controls are on the Profile tab.', 'info');
    };
  }
}

function updatePlayerUI(id) {
  const state = videoStates[id];
  const progressBar = document.getElementById(`progress-bar-${id}`);
  const timer = document.getElementById(`timer-${id}`);
  
  if (progressBar) {
    const pct = (state.currentTime / state.duration) * 100;
    progressBar.style.width = `${pct}%`;
  }
  if (timer) {
    const cur = formatVideoTime(state.currentTime);
    const dur = formatVideoTime(state.duration);
    timer.innerText = `${cur} / ${dur}`;
  }
}

function formatVideoTime(sec) {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s < 10 ? '0' : ''}${s}`;
}

// DRAW ANIMATIONS ON FALLBACK CANVAS
function drawCanvasFrame(id, time) {
  const canvas = document.getElementById(`video-canvas-${id}`);
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const w = canvas.width;
  const h = canvas.height;

  // Clear background
  ctx.fillStyle = '#0b0f19';
  ctx.fillRect(0, 0, w, h);

  // Draw cyber grids grid lines
  ctx.strokeStyle = 'rgba(139, 92, 246, 0.05)';
  ctx.lineWidth = 1;
  const gridSz = 30;
  for (let x = 0; x < w; x += gridSz) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
  }
  for (let y = 0; y < h; y += gridSz) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
  }

  if (id === 1) {
    // Cyber-Cat Laser Fail (8s timeline)
    // 0s to 3s: Cat chases red dot
    // 3s to 4.5s: Cat pounces and misses (tumbles)
    // 4.5s to 7s: Cat dizzy (stars around head)
    // 7s to 8s: Cat returns to center
    
    let dotX = w / 2;
    let dotY = h / 2;
    let catX = w / 2;
    let catY = h / 2 + 50;
    let catState = 'idle';

    if (time < 3.0) {
      catState = 'running';
      const angle = time * Math.PI * 1.5;
      dotX = w / 2 + Math.cos(angle) * 120;
      dotY = h / 2 + Math.sin(angle) * 50 - 30;
      
      const lagTime = time - 0.2;
      const catAngle = Math.max(0, lagTime) * Math.PI * 1.5;
      catX = w / 2 + Math.cos(catAngle) * 120;
      catY = h / 2 + Math.sin(catAngle) * 50 - 30 + 10;
    } else if (time >= 3.0 && time < 4.5) {
      catState = 'falling';
      dotX = -100; dotY = -100;
      const jumpTime = time - 3.0;
      catX = w / 2 + 120 - jumpTime * 100;
      catY = h / 2 - 20 - Math.sin((jumpTime / 1.5) * Math.PI) * 60 + (jumpTime / 1.5) * 80;
    } else if (time >= 4.5 && time < 7.0) {
      catState = 'dizzy';
      dotX = -100; dotY = -100;
      catX = w / 2 - 30;
      catY = h / 2 + 50;
    } else {
      catState = 'idle';
      dotX = w / 2;
      dotY = h / 2;
      const returnPct = (time - 7.0) / 1.0;
      catX = (w / 2 - 30) + returnPct * 30;
      catY = h / 2 + 50;
    }

    // Draw Laser Pointer Dot
    if (dotX > 0) {
      ctx.fillStyle = '#ef4444';
      ctx.beginPath();
      ctx.arc(dotX, dotY, 6, 0, Math.PI * 2);
      ctx.fill();
    }

    // Draw Cyber-Cat
    ctx.save();
    ctx.translate(catX, catY);
    
    if (catState === 'running') {
      ctx.translate(0, Math.sin(time * 15) * 5);
    } else if (catState === 'falling') {
      ctx.rotate((time - 3.0) * Math.PI * 2);
    }
    
    ctx.fillStyle = '#374151';
    ctx.beginPath();
    ctx.ellipse(0, 0, 25, 18, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.beginPath();
    ctx.arc(20, -10, 14, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#1f2937';
    ctx.beginPath();
    ctx.moveTo(10, -18); ctx.lineTo(15, -28); ctx.lineTo(20, -22); ctx.fill();
    ctx.beginPath();
    ctx.moveTo(20, -22); ctx.lineTo(28, -28); ctx.lineTo(28, -18); ctx.fill();

    ctx.strokeStyle = '#374151';
    ctx.lineWidth = 5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-22, 0);
    const tailOffset = catState === 'running' ? Math.sin(time * 20) * 15 : Math.sin(time * 3) * 10;
    ctx.quadraticCurveTo(-35, tailOffset - 10, -38, tailOffset);
    ctx.stroke();

    ctx.strokeStyle = '#374151';
    ctx.lineWidth = 4;
    for (let lx of [-12, -4, 4, 12]) {
      ctx.beginPath();
      ctx.moveTo(lx, 10);
      const footY = catState === 'running' ? 22 + Math.sin(time * 15 + lx) * 5 : 22;
      ctx.lineTo(lx + (catState === 'running' ? Math.cos(time * 15 + lx) * 3 : 0), footY);
      ctx.stroke();
    }

    ctx.fillStyle = '#db2777';
    ctx.beginPath();
    ctx.arc(24, -12, 3, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();

    if (catState === 'dizzy') {
      ctx.fillStyle = '#f59e0b';
      const starAngle = time * 5;
      const numStars = 3;
      for (let i = 0; i < numStars; i++) {
        const offsetAngle = starAngle + (i * Math.PI * 2) / numStars;
        const starX = catX + 20 + Math.cos(offsetAngle) * 20;
        const starY = catY - 30 + Math.sin(offsetAngle) * 8;
        ctx.beginPath();
        ctx.arc(starX, starY, 3, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.font = 'bold 12px var(--font-title)';
      ctx.fillStyle = '#ef4444';
      ctx.fillText('CRASH!', catX - 4, catY - 45);
    }
  } else {
    // Robo-Dance Loop (10s timeline)
    const bob = Math.sin(time * 4) * 8;
    const pulse = Math.abs(Math.sin(time * 8)) * 10;
    ctx.fillStyle = 'rgba(6, 182, 212, 0.1)';
    ctx.strokeStyle = 'var(--accent-cyan)';
    ctx.lineWidth = 2;
    
    ctx.beginPath(); ctx.rect(20, h/2 - 60, 40, 120); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.arc(40, h/2, 20 + pulse, 0, Math.PI*2); ctx.stroke();
    
    ctx.beginPath(); ctx.rect(w - 60, h/2 - 60, 40, 120); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.arc(w - 40, h/2, 20 + pulse, 0, Math.PI*2); ctx.stroke();

    ctx.save();
    ctx.translate(w / 2, h / 2 + 40);

    ctx.fillStyle = '#1e293b';
    ctx.strokeStyle = 'var(--accent-cyan)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.roundRect(-20, -50 + bob, 40, 45, 8);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = 'rgba(6, 182, 212, 0.2)';
    ctx.beginPath();
    ctx.rect(-12, -42 + bob, 24, 20);
    ctx.fill();
    
    ctx.strokeStyle = 'var(--accent-pink)';
    ctx.lineWidth = 1.5;
    for (let lx = -9; lx <= 9; lx += 4) {
      const lineH = Math.sin(time * 25 + lx) * 6 + 7;
      ctx.beginPath();
      ctx.moveTo(lx, -32 + bob + lineH/2);
      ctx.lineTo(lx, -32 + bob - lineH/2);
      ctx.stroke();
    }

    ctx.fillStyle = '#334155';
    ctx.strokeStyle = 'var(--accent-cyan)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.roundRect(-16, -82 + bob * 1.3, 32, 26, 6);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = 'var(--accent-cyan)';
    ctx.beginPath(); ctx.arc(-7, -72 + bob * 1.3, 3, 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.arc(7, -72 + bob * 1.3, 3, 0, Math.PI*2); ctx.fill();

    ctx.strokeStyle = 'var(--accent-cyan)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, -82 + bob * 1.3);
    ctx.lineTo(0, -92 + bob * 1.3);
    ctx.stroke();
    ctx.fillStyle = 'var(--accent-pink)';
    ctx.beginPath();
    ctx.arc(0, -94 + bob * 1.3, 3, 0, Math.PI*2);
    ctx.fill();

    ctx.strokeStyle = '#475569';
    ctx.lineWidth = 6;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-20, -42 + bob);
    const lArmAngle = Math.sin(time * 6) * 45;
    ctx.lineTo(-20 - Math.cos((180 + lArmAngle) * Math.PI / 180) * 25, -42 + bob - Math.sin((180 + lArmAngle) * Math.PI / 180) * 25);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(20, -42 + bob);
    const rArmAngle = Math.cos(time * 6) * 60;
    ctx.lineTo(20 + Math.cos(rArmAngle * Math.PI / 180) * 25, -42 + bob - Math.sin(rArmAngle * Math.PI / 180) * 25);
    ctx.stroke();

    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.moveTo(-10, -5);
    const lLegB = Math.sin(time * 12) * 5;
    ctx.lineTo(-12, 15 - Math.max(0, lLegB));
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(10, -5);
    const rLegB = Math.cos(time * 12) * 5;
    ctx.lineTo(12, 15 - Math.max(0, rLegB));
    ctx.stroke();

    ctx.restore();

    ctx.font = 'bold 20px var(--font-title)';
    ctx.fillStyle = 'rgba(255,255,255,0.03)';
    ctx.textAlign = 'center';
    ctx.fillText('ROBO BEATS', w / 2, h / 2 - 80);
  }
}
