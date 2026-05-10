const router = require('express').Router();
const User   = require('../models/User');
const Book   = require('../models/Book');
const Review = require('../models/Review');

function requireLogin(req, res, next) {
  if (!req.session.userId) return res.redirect('/login');
  next();
}

// ── Helper: upsert a book from search result data ─────────────
// Works with either Google Books or Open Library source
async function upsertBook(data) {
  const {
    openLibraryId, googleBooksId,
    title, author, coverUrl, publishYear,
    description, categories, pageCount,
  } = data;

  // Build the query — use whichever ID we have
  const query = googleBooksId
    ? { googleBooksId }
    : { openLibraryId };

  const update = {
    title,
    author:      author      || 'Unknown',
    coverUrl:    coverUrl    || '',
    description: description || '',
    publishYear: publishYear ? parseInt(publishYear) : undefined,
    categories:  categories  || [],
    pageCount:   pageCount   || undefined,
  };

  // Set the ID fields only if present (avoid overwriting with null)
  if (googleBooksId) update.googleBooksId = googleBooksId;
  if (openLibraryId) update.openLibraryId = openLibraryId;

  return Book.findOneAndUpdate(query, update, { upsert: true, new: true });
}

// ── Currently Reading ────────────────────────────────────────
router.post('/reading/:bookId', requireLogin, async (req, res) => {
  await User.findByIdAndUpdate(req.session.userId, { $addToSet: { currentlyReading: req.params.bookId } });
  res.redirect('back');
});

router.delete('/reading/:bookId', requireLogin, async (req, res) => {
  await User.findByIdAndUpdate(req.session.userId, { $pull: { currentlyReading: req.params.bookId } });
  res.redirect('back');
});

router.post('/reading-from-search', requireLogin, async (req, res) => {
  const book = await upsertBook(req.body);
  await User.findByIdAndUpdate(req.session.userId, { $addToSet: { currentlyReading: book._id } });
  res.redirect('/search?saved=1');
});

// ── Favorites ────────────────────────────────────────────────
router.post('/favorite/:bookId', requireLogin, async (req, res) => {
  await User.findByIdAndUpdate(req.session.userId, { $addToSet: { favoriteBooks: req.params.bookId } });
  res.redirect('back');
});

router.delete('/favorite/:bookId', requireLogin, async (req, res) => {
  await User.findByIdAndUpdate(req.session.userId, { $pull: { favoriteBooks: req.params.bookId } });
  res.redirect('back');
});

router.post('/favorite-from-search', requireLogin, async (req, res) => {
  const book = await upsertBook(req.body);
  await User.findByIdAndUpdate(req.session.userId, { $addToSet: { favoriteBooks: book._id } });
  res.redirect('/search?saved=1');
});

// ── Read Next ────────────────────────────────────────────────
router.post('/readnext/:bookId', requireLogin, async (req, res) => {
  await User.findByIdAndUpdate(req.session.userId, { $addToSet: { readNext: req.params.bookId } });
  res.redirect('back');
});

router.delete('/readnext/:bookId', requireLogin, async (req, res) => {
  await User.findByIdAndUpdate(req.session.userId, { $pull: { readNext: req.params.bookId } });
  res.redirect('back');
});

router.post('/readnext-from-search', requireLogin, async (req, res) => {
  const book = await upsertBook(req.body);
  await User.findByIdAndUpdate(req.session.userId, { $addToSet: { readNext: book._id } });
  res.redirect('/search?saved=1');
});

// ── Global Star Rating ───────────────────────────────────────
router.post('/rate', requireLogin, async (req, res) => {
  const { rating, redirect: redir } = req.body;
  const stars = parseInt(rating, 10);
  if (!stars || stars < 1 || stars > 5) return res.redirect(redir || '/search');

  const book = await upsertBook(req.body);

  const existing = book.ratings.find(r => String(r.user) === String(req.session.userId));
  if (existing) existing.rating = stars;
  else book.ratings.push({ user: req.session.userId, rating: stars });
  await book.save();

  res.redirect(redir || '/search');
});

// ── User Review ──────────────────────────────────────────────
router.post('/review/:bookId', requireLogin, async (req, res) => {
  const { rating, text } = req.body;
  await Review.findOneAndUpdate(
    { user: req.session.userId, book: req.params.bookId },
    { user: req.session.userId, book: req.params.bookId,
      rating: rating ? parseInt(rating, 10) : undefined, text },
    { upsert: true, new: true }
  );

  // Sync rating into the global ratings array
  if (rating) {
    const book = await Book.findById(req.params.bookId);
    if (book) {
      const existing = book.ratings.find(r => String(r.user) === String(req.session.userId));
      if (existing) existing.rating = parseInt(rating, 10);
      else book.ratings.push({ user: req.session.userId, rating: parseInt(rating, 10) });
      await book.save();
    }
  }
  res.redirect('back');
});

module.exports = router;
