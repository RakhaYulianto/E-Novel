const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

const storageKey = (name) => `rak-novel:${name}`;

const state = {
  library: null,
  novels: [],
  currentNovel: null,
  chapters: [],
  currentIndex: -1,
  bookQuery: '',
  chapterQuery: '',
  fontSize: Number(localStorage.getItem(storageKey('font-size'))) || 19
};

function init() {
  state.library = normalizeLibrary();
  state.novels = state.library.novels;

  if (!state.novels.length) {
    document.body.innerHTML = '<main class="error-state"><h1>Data novel tidak ditemukan.</h1><p>Pastikan data.js berisi window.NOVEL_LIBRARY atau window.NOVEL_DATA.</p></main>';
    return;
  }

  document.documentElement.style.setProperty('--reader-size', `${state.fontSize}px`);
  $('#siteTitle').textContent = state.library.siteTitle || 'Rak Novel';
  $('#siteSubtitle').textContent = state.library.siteSubtitle || 'Koleksi novel yang bisa terus ditambah.';

  restoreTheme();
  bindEvents();
  renderShelf();
  routeFromHash(false);
  updateProgress();
}

function normalizeLibrary() {
  const raw = window.NOVEL_LIBRARY || (window.NOVEL_DATA ? {
    siteTitle: 'Rak Novel',
    siteSubtitle: 'Koleksi cerita original yang bisa terus ditambah.',
    novels: [window.NOVEL_DATA]
  } : { novels: [] });

  const novels = (raw.novels || []).map((novel, index) => normalizeNovel(novel, index));
  return { ...raw, novels };
}

function normalizeNovel(novel, index) {
  const title = novel.title || `Novel ${index + 1}`;
  const arcs = Array.isArray(novel.arcs) ? novel.arcs : [];
  const stats = novel.stats || deriveStats(arcs);
  const id = novel.id || novel.slug || slugify(title);

  return {
    ...novel,
    id,
    slug: novel.slug || id,
    title,
    subtitle: novel.subtitle || '',
    synopsis: novel.synopsis || 'Sinopsis belum ditambahkan.',
    author: novel.author || 'Unknown Author',
    statusLabel: novel.statusLabel || statusLabel(novel.status || 'full'),
    cover: novel.cover || 'assets/default-cover.svg',
    tags: Array.isArray(novel.tags) ? novel.tags : [novel.language || 'Novel'],
    arcs,
    stats
  };
}

function deriveStats(arcs) {
  const chapters = arcs.flatMap(arc => arc.chapters || []);
  return {
    arcs: arcs.length,
    chapters: chapters.length,
    fullChapters: chapters.filter(ch => ch.status === 'full').length,
    draftChapters: chapters.filter(ch => ch.status === 'draft').length,
    outlineChapters: chapters.filter(ch => ch.status === 'outline').length
  };
}

function bindEvents() {
  $('#homeBtn').addEventListener('click', () => showShelf());
  $('#continueBtn').addEventListener('click', continueGlobalReading);
  $('#themeToggle').addEventListener('click', toggleTheme);
  $('#backToShelf').addEventListener('click', () => showShelf());
  $('#readerBackBtn').addEventListener('click', () => {
    if (state.currentNovel) showBook(state.currentNovel.id);
  });

  $('#bookSearch').addEventListener('input', (event) => {
    state.bookQuery = event.target.value;
    renderShelf();
  });

  $('#chapterSearch').addEventListener('input', (event) => {
    state.chapterQuery = event.target.value;
    if (state.currentNovel) renderBookChapters(state.currentNovel, '#detailArcList');
  });

  $('#readerChapterSearch').addEventListener('input', (event) => {
    state.chapterQuery = event.target.value;
    if (state.currentNovel) renderBookChapters(state.currentNovel, '#readerChapterList', true);
  });

  $('#readFirstBtn').addEventListener('click', () => {
    const first = getChapters(state.currentNovel)[0];
    if (first) showReader(state.currentNovel.id, first.id);
  });

  $('#readSavedBtn').addEventListener('click', () => {
    const saved = getSavedChapter(state.currentNovel.id);
    const first = getChapters(state.currentNovel)[0];
    if (saved || first) showReader(state.currentNovel.id, saved || first.id);
  });

  $('#prevChapter').addEventListener('click', () => {
    if (state.currentIndex > 0) {
      showReader(state.currentNovel.id, state.chapters[state.currentIndex - 1].id);
    }
  });

  $('#nextChapter').addEventListener('click', () => {
    if (state.currentIndex < state.chapters.length - 1) {
      showReader(state.currentNovel.id, state.chapters[state.currentIndex + 1].id);
    }
  });

  $('#fontDown').addEventListener('click', () => setFontSize(state.fontSize - 1));
  $('#fontUp').addEventListener('click', () => setFontSize(state.fontSize + 1));
  $('#mobileChapterBtn').addEventListener('click', () => $('#readerSidebar').classList.toggle('open'));

  document.addEventListener('click', (event) => {
    const bookButton = event.target.closest('[data-book-id]');
    if (bookButton) {
      showBook(bookButton.dataset.bookId);
      return;
    }

    const chapterButton = event.target.closest('[data-chapter-id]');
    if (chapterButton && state.currentNovel) {
      showReader(state.currentNovel.id, chapterButton.dataset.chapterId);
    }
  });

  window.addEventListener('scroll', updateProgress, { passive: true });
  window.addEventListener('popstate', () => routeFromHash(false));
}

function renderShelf() {
  const query = state.bookQuery.trim().toLowerCase();
  const books = state.novels.filter(book => bookMatches(book, query));
  $('#bookCount').textContent = `${books.length} novel`;

  $('#bookShelf').innerHTML = books.map(book => `
    <article class="book-card" style="--book-accent: ${escapeAttr(book.color || '#6f7fa7')}">
      <button class="book-open" type="button" data-book-id="${escapeAttr(book.id)}" aria-label="Buka ${escapeAttr(book.title)}">
        <span class="book-cover-frame">
          <img src="${escapeAttr(book.cover)}" alt="Sampul ${escapeAttr(book.title)}" loading="lazy" />
        </span>
        <span class="book-info">
          <span class="book-meta">${escapeHTML(book.statusLabel)} · ${escapeHTML(book.stats?.chapters ?? 0)} chapter</span>
          <strong>${escapeHTML(book.title)}</strong>
          <small>${escapeHTML(book.subtitle || book.author)}</small>
        </span>
      </button>
    </article>
  `).join('') || `<p class="empty-state">Belum ada novel yang cocok dengan pencarian.</p>`;
}

function renderBook(book) {
  state.currentNovel = book;
  state.chapters = getChapters(book);
  state.currentIndex = -1;

  $('#detailCover').src = book.cover;
  $('#detailCover').alt = `Sampul ${book.title}`;
  $('#detailStatus').textContent = `${book.statusLabel} · ${book.author}`;
  $('#detailTitle').textContent = book.title;
  $('#detailSubtitle').textContent = book.subtitle;
  $('#detailSynopsis').textContent = book.synopsis;

  $('#detailTags').innerHTML = (book.tags || []).map(tag => `<span>${escapeHTML(tag)}</span>`).join('');
  $('#detailStats').innerHTML = [
    ['Arc', book.stats?.arcs ?? book.arcs.length],
    ['Chapter', book.stats?.chapters ?? state.chapters.length],
    ['Full', book.stats?.fullChapters ?? state.chapters.filter(ch => ch.status === 'full').length]
  ].map(([label, value]) => `<div><strong>${escapeHTML(value)}</strong><span>${label}</span></div>`).join('');

  const lore = Array.isArray(book.lore) ? book.lore : [];
  $('#loreWrap').hidden = lore.length === 0;
  $('#loreGrid').innerHTML = lore.map(item => `
    <article class="lore-card">
      <h3>${escapeHTML(item.title)}</h3>
      <p>${escapeHTML(item.text)}</p>
    </article>
  `).join('');

  renderBookChapters(book, '#detailArcList');
}

function renderBookChapters(book, targetSelector, compact = false) {
  const query = state.chapterQuery.trim().toLowerCase();
  const html = (book.arcs || []).map(arc => {
    const chapters = (arc.chapters || []).filter(ch => chapterMatches(ch, arc, query));
    if (query && chapters.length === 0) return '';

    return `
      <section class="arc-card ${compact ? 'compact-arc' : ''}">
        <div class="arc-heading">
          <div>
            <p class="eyebrow">Arc ${escapeHTML(arc.number ?? '')}</p>
            <h3>${escapeHTML(arc.title || 'Untitled Arc')}</h3>
            ${compact ? '' : `<p>${escapeHTML(arc.subtitle || '')}</p>`}
          </div>
          <span>${chapters.length}/${(arc.chapters || []).length}</span>
        </div>
        <div class="chapter-list">
          ${chapters.map(chapter => renderChapterButton(chapter, compact)).join('')}
        </div>
      </section>
    `;
  }).join('');

  $(targetSelector).innerHTML = html || '<p class="empty-state">Tidak ada chapter yang cocok.</p>';
  markActiveChapter();
}

function renderChapterButton(chapter, compact = false) {
  return `
    <button class="chapter-item ${compact ? 'compact' : ''}" type="button" data-chapter-id="${escapeAttr(chapter.id)}">
      <span class="chapter-label">${escapeHTML(chapter.label || `Chapter ${chapter.number ?? ''}`)}</span>
      <span class="chapter-title-wrap">
        <strong>${escapeHTML(chapter.title || 'Untitled Chapter')}</strong>
        <small>${escapeHTML(statusDescription(chapter.status))} · ${readingTime(chapter)}</small>
      </span>
      ${compact ? '' : '<span class="read-chip">Baca</span>'}
    </button>
  `;
}

function showShelf(pushHash = true) {
  showOnly('shelf');
  state.currentNovel = null;
  state.currentIndex = -1;
  $('#mobileChapterBtn').classList.remove('visible');
  if (pushHash) history.pushState(null, '', '#home');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function showBook(bookId, pushHash = true) {
  const book = state.novels.find(item => item.id === bookId);
  if (!book) return showShelf(pushHash);

  state.chapterQuery = '';
  $('#chapterSearch').value = '';
  $('#readerChapterSearch').value = '';

  renderBook(book);
  showOnly('book');
  $('#mobileChapterBtn').classList.remove('visible');
  if (pushHash) history.pushState(null, '', `#book/${encodeURIComponent(book.id)}`);
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function showReader(bookId, chapterId, pushHash = true) {
  const book = state.novels.find(item => item.id === bookId);
  if (!book) return showShelf(pushHash);

  state.currentNovel = book;
  state.chapters = getChapters(book);
  const index = state.chapters.findIndex(chapter => chapter.id === chapterId);
  if (index < 0) return showBook(book.id, pushHash);

  state.currentIndex = index;
  const chapter = state.chapters[index];

  $('#readerNovelTitle').textContent = book.title;
  $('#readerArc').textContent = `Arc ${chapter.arc?.number ?? ''}`;
  $('#readerTitle').textContent = `${chapter.label || `Chapter ${chapter.number}`}: ${chapter.title || 'Untitled Chapter'}`;
  $('#chapterMeta').textContent = `${chapter.arc?.title || 'Untitled Arc'} · ${readingTime(chapter)} · ${wordCount(chapter).toLocaleString('id-ID')} kata`;

  const banner = $('#statusBanner');
  if (chapter.status && chapter.status !== 'full') {
    banner.hidden = false;
    banner.textContent = chapter.status === 'draft' ? 'Catatan: chapter ini masih draft.' : 'Catatan: chapter ini masih outline.';
  } else {
    banner.hidden = true;
  }

  const languageText = [book.language, ...(book.tags || [])].join(' ').toLowerCase();
  $('#chapterBody').setAttribute('lang', languageText.includes('indonesia') || languageText.includes('indonesian') ? 'id' : 'en');
  $('#chapterBody').innerHTML = (chapter.content || [])
    .filter(paragraph => String(paragraph).trim())
    .map(paragraph => `<p>${formatInline(paragraph)}</p>`)
    .join('');

  $('#prevChapter').disabled = index === 0;
  $('#nextChapter').disabled = index === state.chapters.length - 1;

  renderBookChapters(book, '#readerChapterList', true);
  markActiveChapter();
  saveLastRead(book.id, chapter.id);
  showOnly('reader');
  $('#readerSidebar').classList.remove('open');
  $('#mobileChapterBtn').classList.add('visible');

  if (pushHash) history.pushState(null, '', `#read/${encodeURIComponent(book.id)}/${encodeURIComponent(chapter.id)}`);
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function showOnly(view) {
  $('#shelfView').hidden = view !== 'shelf';
  $('#bookView').hidden = view !== 'book';
  $('#readerView').hidden = view !== 'reader';
}

function routeFromHash(pushHash = true) {
  const hash = decodeURIComponent(location.hash.replace('#', ''));
  if (!hash || hash === 'home') return showShelf(pushHash);

  const [view, bookId, chapterId] = hash.split('/');
  if (view === 'book' && bookId) return showBook(bookId, pushHash);
  if (view === 'read' && bookId && chapterId) return showReader(bookId, chapterId, pushHash);
  showShelf(pushHash);
}

function getChapters(book) {
  return (book.arcs || []).flatMap(arc => (arc.chapters || []).map(chapter => ({ ...chapter, arc })));
}

function bookMatches(book, query) {
  if (!query) return true;
  const text = [book.title, book.subtitle, book.synopsis, book.author, ...(book.tags || [])].join(' ').toLowerCase();
  return text.includes(query);
}

function chapterMatches(chapter, arc, query) {
  if (!query) return true;
  const text = [chapter.label, chapter.title, chapter.summary, chapter.source, arc.title, arc.subtitle, ...(chapter.content || [])].join(' ').toLowerCase();
  return text.includes(query);
}

function markActiveChapter() {
  const current = state.chapters[state.currentIndex]?.id;
  $$('[data-chapter-id]').forEach(button => button.classList.toggle('active', button.dataset.chapterId === current));
}

function continueGlobalReading() {
  const last = localStorage.getItem(storageKey('last-read-global'));
  if (last) {
    try {
      const parsed = JSON.parse(last);
      if (parsed.bookId && parsed.chapterId) return showReader(parsed.bookId, parsed.chapterId);
    } catch (_) {}
  }
  const firstBook = state.novels[0];
  const firstChapter = getChapters(firstBook)[0];
  if (firstBook && firstChapter) showReader(firstBook.id, firstChapter.id);
}

function saveLastRead(bookId, chapterId) {
  localStorage.setItem(storageKey(`last-read-${bookId}`), chapterId);
  localStorage.setItem(storageKey('last-read-global'), JSON.stringify({ bookId, chapterId }));
}

function getSavedChapter(bookId) {
  return localStorage.getItem(storageKey(`last-read-${bookId}`));
}

function wordCount(chapter) {
  return (chapter.content || []).join(' ').trim().split(/\s+/).filter(Boolean).length;
}

function readingTime(chapter) {
  const minutes = Math.max(1, Math.round(wordCount(chapter) / 230));
  return `${minutes} menit baca`;
}

function statusLabel(status) {
  if (status === 'full') return 'Siap Dibaca';
  if (status === 'draft') return 'Draft';
  if (status === 'mixed') return 'Campuran';
  return 'Outline';
}

function statusDescription(status) {
  if (status === 'full') return 'Siap dibaca';
  if (status === 'draft') return 'Draft';
  if (status === 'mixed') return 'Campuran';
  return 'Outline';
}

function setFontSize(size) {
  state.fontSize = Math.max(16, Math.min(24, size));
  document.documentElement.style.setProperty('--reader-size', `${state.fontSize}px`);
  localStorage.setItem(storageKey('font-size'), state.fontSize);
}

function restoreTheme() {
  const theme = localStorage.getItem(storageKey('theme'));
  if (theme === 'dark') document.body.classList.add('dark');
  $('#themeToggle').textContent = document.body.classList.contains('dark') ? '☀' : '☾';
}

function toggleTheme() {
  document.body.classList.toggle('dark');
  const isDark = document.body.classList.contains('dark');
  localStorage.setItem(storageKey('theme'), isDark ? 'dark' : 'light');
  $('#themeToggle').textContent = isDark ? '☀' : '☾';
}

function updateProgress() {
  const height = document.documentElement.scrollHeight - window.innerHeight;
  const progress = height <= 0 ? 0 : (window.scrollY / height) * 100;
  $('#readProgress').style.width = `${Math.min(100, Math.max(0, progress))}%`;
}

function slugify(value) {
  return String(value).toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'novel';
}

function escapeHTML(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function escapeAttr(value) {
  return escapeHTML(value).replaceAll('`', '&#096;');
}

function formatInline(value) {
  const safe = escapeHTML(value);
  return safe
    .replace(/\[([^\]]+)\]/g, '<span class="spell">$1</span>')
    .replace(/“([^”]+)”/g, '“<span class="dialogue">$1</span>”')
    .replace(/&quot;([^&]+)&quot;/g, '&quot;<span class="dialogue">$1</span>&quot;');
}

init();
