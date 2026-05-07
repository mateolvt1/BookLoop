const router = require('express').Router();
const Book   = require('../models/Book');

// Search page
router.get('/', (req, res) => res.render('search', { results: [], query: '' }));

// Search Open Library API
router.get('/query', async (req, res) => {
  const q = req.query.q;
  const url = `https://openlibrary.org/search.json?title=${encodeURIComponent(q)}&limit=12`;
  const resp = await fetch(url);
  const data = await resp.json();

  const results = data.docs.map(book => ({
    openLibraryId: book.key,
    title:      book.title,
    author:     book.author_name?.[0] || 'Unknown',
    coverUrl:   book.cover_i
                  ? `https://covers.openlibrary.org/b/id/${book.cover_i}-M.jpg`
                  : '',
    publishYear: book.first_publish_year,
  }));

  res.render('search', { results, query: q });
});

// Save a book to MongoDB
router.post('/save', async (req, res) => {
  const { openLibraryId, title, author, coverUrl, publishYear } = req.body;
  await Book.findOneAndUpdate(
    { openLibraryId },
    { openLibraryId, title, author, coverUrl, publishYear },
    { upsert: true, new: true }
  );
  res.redirect('/search?saved=1');
});

module.exports = router;