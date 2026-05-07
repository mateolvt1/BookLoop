const router = require('express').Router();
const User   = require('../models/User');
const Book   = require('../models/Book');

function requireLogin(req, res, next) {
  if (!req.session.userId) return res.redirect('/login');
  next();
}

// Add to currently reading
router.post('/reading/:bookId', requireLogin, async (req, res) => {
  await User.findByIdAndUpdate(req.session.userId, {
    $addToSet: { currentlyReading: req.params.bookId }
  });
  res.redirect('back');
});

// Add to favorites
router.post('/favorite/:bookId', requireLogin, async (req, res) => {
  await User.findByIdAndUpdate(req.session.userId, {
    $addToSet: { favoriteBooks: req.params.bookId }
  });
  res.redirect('back');
});

module.exports = router;