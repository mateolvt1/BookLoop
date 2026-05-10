const router = require('express').Router();

function requireLogin(req, res, next) {
  if (!req.session.userId) return res.redirect('/');
  next();
}

// ── In-memory caches ──────────────────────────────────────────
const nytCache      = new Map(); // listName → { data, fetchedAt }
const upcomingCache = { data: null, fetchedAt: 0 };
const NYT_TTL       = 60 * 60 * 1000;       // 1 hour  (NYT updates weekly)
const UPCOMING_TTL  = 6  * 60 * 60 * 1000;  // 6 hours (new releases don't change hourly)

// ── Home page ─────────────────────────────────────────────────
router.get('/', requireLogin, (req, res) => {
  res.render('home');
});

// ── NYT Bestsellers proxy ─────────────────────────────────────
router.get('/nyt-bestsellers', requireLogin, async (req, res) => {
  const listName = req.query.list || 'hardcover-fiction';
  const apiKey   = process.env.NYT_API_KEY;

  if (!apiKey) return res.json({ error: 'NYT_API_KEY not set in .env' });

  const cached = nytCache.get(listName);
  if (cached && Date.now() - cached.fetchedAt < NYT_TTL) return res.json(cached.data);

  try {
    const url  = `https://api.nytimes.com/svc/books/v3/lists/current/${encodeURIComponent(listName)}.json?api-key=${apiKey}`;
    const resp = await fetch(url);

    if (resp.status === 429) {
      if (cached) return res.json({ ...cached.data, stale: true });
      return res.json({ error: 'Rate limit reached (5 req/min). Wait a moment and try again.' });
    }
    if (!resp.ok) {
      return res.json({ error: `NYT API returned status ${resp.status}. Check your API key.` });
    }

    const data = await resp.json();
    if (!data || data.status !== 'OK') {
      const msg = data?.fault?.faultstring || data?.message || data?.errors?.[0]
                || `Unexpected response (status: ${data?.status ?? 'unknown'})`;
      return res.json({ error: msg });
    }

    const result = {
      listDisplayName: data.results.display_name,
      bestsellersDate: data.results.bestsellers_date,
      source: 'nyt',
      books: (data.results.books || []).map(b => ({
        title:       b.title,
        author:      b.author,
        coverUrl:    b.book_image || '',
        rank:        b.rank,
        weeksOn:     b.weeks_on_list,
        description: b.description,
        amazonUrl:   b.amazon_product_url,
      })),
    };

    nytCache.set(listName, { data: result, fetchedAt: Date.now() });
    res.json(result);

  } catch (err) {
    console.error('NYT fetch error:', err.message);
    if (cached) return res.json({ ...cached.data, stale: true });
    res.json({ error: 'Network error reaching NYT API.' });
  }
});

// ── Genre strip proxy ─────────────────────────────────────────
// Tries NYT first; falls back to Open Library if NYT has no list.
//
// NYT genre map — only genres NYT actually covers well
const NYT_GENRE_MAP = {
  'fiction':        'hardcover-fiction',
  'nonfiction':     'hardcover-nonfiction',
  'mystery':        'combined-print-and-e-book-fiction',
  'romance':        'romance',
  'young-adult':    'young-adult-hardcover',
  'self-help':      'advice-how-to-and-miscellaneous',
  'biography':      'biography',
  'graphic-manga':  'graphic-books-and-manga',
  'business':       'business-books',
  'sports':         'sports',
};

// Open Library slug map for genres NYT doesn't cover well
const OL_GENRE_MAP = {
  'sci-fi':        'science_fiction',
  'fantasy':       'fantasy',
  'horror':        'horror',
  'history':       'history',
  'science':       'science',
  'poetry':        'poetry',
  'classics':      'classics',
  'thriller':      'thriller',
};

router.get('/genre-books', requireLogin, async (req, res) => {
  const genre    = (req.query.genre || 'fiction').toLowerCase();
  const nytList  = NYT_GENRE_MAP[genre];
  const olSlug   = OL_GENRE_MAP[genre];
  const apiKey   = process.env.NYT_API_KEY;

  // ── Try NYT first ──────────────────────────────────────────
  if (nytList && apiKey) {
    const cached = nytCache.get(nytList);
    if (cached && Date.now() - cached.fetchedAt < NYT_TTL) {
      return res.json({ ...cached.data, source: 'nyt' });
    }

    try {
      const url  = `https://api.nytimes.com/svc/books/v3/lists/current/${encodeURIComponent(nytList)}.json?api-key=${apiKey}`;
      const resp = await fetch(url);

      if (resp.status === 429) {
        if (cached) return res.json({ ...cached.data, stale: true, source: 'nyt' });
        // Fall through to OL
      } else if (resp.ok) {
        const data = await resp.json();
        if (data && data.status === 'OK') {
          const result = {
            listDisplayName: data.results.display_name,
            source: 'nyt',
            books: (data.results.books || []).map(b => ({
              title:    b.title,
              author:   b.author,
              coverUrl: b.book_image || '',
              rank:     b.rank,
            })),
          };
          nytCache.set(nytList, { data: result, fetchedAt: Date.now() });
          return res.json(result);
        }
      }
    } catch (err) {
      console.error('NYT genre error:', err.message);
      // Fall through to Open Library
    }
  }

  // ── Fallback: Open Library subjects ───────────────────────
  const slug = olSlug || genre.replace(/\s+/g, '_').replace(/-/g, '_');
  try {
    const url  = `https://openlibrary.org/subjects/${encodeURIComponent(slug)}.json?limit=15`;
    const resp = await fetch(url);
    const data = await resp.json();

    if (!data || !data.works || !data.works.length) {
      return res.json({ error: `No books found for genre "${genre}"` });
    }

    const books = data.works.slice(0, 15).map(work => {
      const coverId = work.cover_id || (work.covers && work.covers[0]);
      return {
        title:    work.title,
        author:   work.authors && work.authors[0] ? work.authors[0].name : '',
        coverUrl: coverId ? `https://covers.openlibrary.org/b/id/${coverId}-M.jpg` : '',
      };
    });

    res.json({ listDisplayName: data.name || slug, source: 'openlibrary', books });

  } catch (err) {
    console.error('Open Library genre error:', err.message);
    res.json({ error: 'Could not load genre books.' });
  }
});

// ── Helper: fetch from Google Books with 503 detection ───────
async function googleBooksQuery(q, googleKey, maxResults = 10) {
  const url  = `https://www.googleapis.com/books/v1/volumes?q=${q}&maxResults=${maxResults}&printType=books&langRestrict=en&key=${googleKey}`;
  const resp = await fetch(url);
  const data = await resp.json();
  // Treat 503 / backend errors as a thrown error so callers can fallback
  if (data.error && (data.error.code === 503 || data.error.code >= 500)) {
    throw new Error(`Google Books API error ${data.error.code}: ${data.error.message}`);
  }
  return data;
}

// ── Helper: Open Library new/popular books as upcoming fallback ──
async function openLibraryUpcoming() {
  // Use OL's "new" subject pages which reflect recently catalogued titles
  const subjects = ['new_releases', 'fiction', 'thriller'];
  const seen = new Set();
  const results = [];

  for (const subject of subjects) {
    if (results.length >= 16) break;
    try {
      const url  = `https://openlibrary.org/subjects/${subject}.json?limit=10&sort=new`;
      const resp = await fetch(url);
      const data = await resp.json();
      (data.works || []).forEach(work => {
        if (results.length >= 16 || !work.title || seen.has(work.title)) return;
        const coverId  = work.cover_id || (work.covers && work.covers[0]);
        const coverUrl = coverId ? `https://covers.openlibrary.org/b/id/${coverId}-M.jpg` : '';
        if (!coverUrl) return;
        seen.add(work.title);
        results.push({
          title:    work.title,
          author:   work.authors && work.authors[0] ? work.authors[0].name : '',
          coverUrl,
          publishDate: work.first_publish_year ? String(work.first_publish_year) : '',
        });
      });
    } catch(e) { /* skip */ }
  }
  return results;
}

// ── Upcoming Releases proxy ───────────────────────────────────
// Google Books primary → Open Library fallback if Google is down.
router.get('/upcoming', requireLogin, async (req, res) => {
  const googleKey = process.env.GOOGLE_BOOKS_API_KEY;

  // Serve cache if still fresh
  if (upcomingCache.data && upcomingCache.data.books.length > 0 &&
      Date.now() - upcomingCache.fetchedAt < UPCOMING_TTL) {
    return res.json(upcomingCache.data);
  }

  const thisYear = new Date().getFullYear();

  // ── Try Google Books ─────────────────────────────────────
  if (googleKey) {
    try {
      const queries = [
        `subject:fiction&orderBy=newest`,
        `subject:nonfiction&orderBy=newest`,
        `subject:thriller&orderBy=newest`,
        `subject:science+fiction&orderBy=newest`,
      ];

      const seen    = new Set();
      const results = [];

      for (const q of queries) {
        if (results.length >= 16) break;
        try {
          const data = await googleBooksQuery(q, googleKey, 10);
          (data.items || []).forEach(item => {
            if (results.length >= 16) return;
            const info    = item.volumeInfo || {};
            const pubYear = parseInt(info.publishedDate || '0');
            if (!info.title || seen.has(info.title)) return;
            if (pubYear && pubYear < thisYear - 1) return;
            const imageLinks = info.imageLinks || {};
            const coverUrl   = (imageLinks.thumbnail || imageLinks.smallThumbnail || '')
              .replace('http://', 'https://').replace('&edge=curl', '');
            if (!coverUrl || !info.authors) return;
            seen.add(info.title);
            results.push({
              title:       info.title,
              author:      (info.authors || []).join(', '),
              coverUrl,
              publishDate: info.publishedDate || '',
            });
          });
        } catch(e) {
          // Single query failed (503) — log and continue to next query
          console.warn('Google Books sub-query failed:', e.message);
        }
      }

      if (results.length > 0) {
        const payload = { books: results, source: 'google', fetchedAt: new Date().toISOString() };
        upcomingCache.data      = payload;
        upcomingCache.fetchedAt = Date.now();
        return res.json(payload);
      }
      // If Google returned 0 results despite no throw, fall through to OL
      console.warn('Google Books returned 0 upcoming results — falling back to Open Library');
    } catch (err) {
      console.warn('Google Books upcoming failed, using Open Library fallback:', err.message);
    }
  }

  // ── Fallback: Open Library ────────────────────────────────
  try {
    const books   = await openLibraryUpcoming();
    const payload = { books, source: 'openlibrary', fetchedAt: new Date().toISOString() };
    if (books.length > 0) {
      upcomingCache.data      = payload;
      upcomingCache.fetchedAt = Date.now();
    }
    res.json(payload);
  } catch (err) {
    console.error('Upcoming fallback also failed:', err.message);
    res.json({ books: [], source: 'none', error: 'Could not load upcoming releases right now.' });
  }
});

module.exports = router;
