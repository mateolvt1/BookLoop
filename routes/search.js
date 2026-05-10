const router = require('express').Router();
const Book   = require('../models/Book');

// ── Helpers ───────────────────────────────────────────────────

// Extract a clean book object from a Google Books volume
function fromGoogleBook(item) {
  const info     = item.volumeInfo || {};
  const imageLinks = info.imageLinks || {};
  // Prefer the largest available cover, upgrade to zoom=1 for better res
  const coverUrl = (imageLinks.thumbnail || imageLinks.smallThumbnail || '')
    .replace('http://', 'https://')
    .replace('&edge=curl', '')
    .replace('zoom=1', 'zoom=1'); // keep zoom param

  return {
    openLibraryId: null,
    googleBooksId: item.id || null,
    title:       info.title        || 'Unknown Title',
    author:      (info.authors || []).join(', ') || 'Unknown Author',
    coverUrl,
    description: info.description  || '',
    publishYear: info.publishedDate ? parseInt(info.publishedDate) : null,
    categories:  info.categories   || [],
    pageCount:   info.pageCount    || null,
    avgRating:   info.averageRating   || null,
    ratingCount: info.ratingsCount    || null,
    source:      'google',
  };
}

// Extract a clean book object from an Open Library search doc
function fromOpenLibraryDoc(doc) {
  return {
    openLibraryId: doc.key || null,
    googleBooksId: null,
    title:       doc.title                          || 'Unknown Title',
    author:      (doc.author_name || [])[0]         || 'Unknown Author',
    coverUrl:    doc.cover_i
                   ? `https://covers.openlibrary.org/b/id/${doc.cover_i}-M.jpg`
                   : '',
    description: '',
    publishYear: doc.first_publish_year             || null,
    categories:  doc.subject ? doc.subject.slice(0,3) : [],
    source:      'openlibrary',
  };
}

// ── Search page (GET /search) ─────────────────────────────────
router.get('/', (req, res) => {
  res.render('search', {
    results: [],
    query:   '',
    saved:   req.query.saved || null,
    source:  null,
  });
});

// ── Search query (GET /search/query?q=...) ────────────────────
router.get('/query', async (req, res) => {
  const q      = (req.query.q || '').trim();
  const saved  = req.query.saved || null;
  if (!q) return res.redirect('/search');

  const googleKey = process.env.GOOGLE_BOOKS_API_KEY;
  let results = [];
  let source  = 'openlibrary';

  // ── 1. Try Google Books first ────────────────────────────────
  if (googleKey) {
    try {
      const gUrl = `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(q)}&maxResults=20&printType=books&key=${googleKey}`;
      const resp = await fetch(gUrl);
      const data = await resp.json();

      if (data.items && data.items.length > 0) {
        // Enrich with our DB ratings where we have them
        const googleIds = data.items.map(i => i.id).filter(Boolean);
        const savedBooks = await Book.find({ googleBooksId: { $in: googleIds } })
          .select('googleBooksId avgRating ratingCount');
        const ratingMap = {};
        savedBooks.forEach(b => { ratingMap[b.googleBooksId] = b; });

        results = data.items.map(item => {
          const book = fromGoogleBook(item);
          const saved = ratingMap[book.googleBooksId];
          if (saved) {
            book.avgRating   = saved.avgRating   || book.avgRating;
            book.ratingCount = saved.ratingCount || book.ratingCount;
            book.dbId        = String(saved._id);
          }
          return book;
        });
        source = 'google';
      }
    } catch (err) {
      console.error('Google Books search error:', err.message);
      // Fall through to Open Library
    }
  }

  // ── 2. Fallback to Open Library ──────────────────────────────
  if (results.length === 0) {
    try {
      const olUrl = `https://openlibrary.org/search.json?title=${encodeURIComponent(q)}&limit=20`;
      const resp  = await fetch(olUrl);
      const data  = await resp.json();

      if (data.docs && data.docs.length > 0) {
        // Enrich with our DB ratings
        const olIds = data.docs.map(d => d.key).filter(Boolean);
        const savedBooks = await Book.find({ openLibraryId: { $in: olIds } })
          .select('openLibraryId avgRating ratingCount');
        const ratingMap = {};
        savedBooks.forEach(b => { ratingMap[b.openLibraryId] = b; });

        results = data.docs.slice(0, 20).map(doc => {
          const book  = fromOpenLibraryDoc(doc);
          const saved = ratingMap[book.openLibraryId];
          if (saved) {
            book.avgRating   = saved.avgRating;
            book.ratingCount = saved.ratingCount;
            book.dbId        = String(saved._id);
          }
          return book;
        });
        source = 'openlibrary';
      }
    } catch (err) {
      console.error('Open Library search error:', err.message);
    }
  }

  res.render('search', { results, query: q, saved, source });
});

module.exports = router;
