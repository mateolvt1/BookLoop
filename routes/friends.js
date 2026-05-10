const router = require('express').Router();
const User   = require('../models/User');

function requireLogin(req, res, next) {
  if (!req.session.userId) return res.redirect('/login');
  next();
}

// Friends page
router.get('/', requireLogin, async (req, res) => {
  const me = await User.findById(req.session.userId).populate('friends', 'username favoriteBooks friends currentlyReading');
  const suggested = await User.find({
    _id: { $ne: req.session.userId, $nin: me.friends }
  }).limit(6).select('username favoriteBooks friends');
  res.render('friends', { friends: me.friends, suggested });
});

// Search users
router.get('/search', requireLogin, async (req, res) => {
  const q = req.query.q || '';
  const me = await User.findById(req.session.userId).populate('friends', 'username favoriteBooks friends currentlyReading');
  const searchResults = q
    ? await User.find({ username: new RegExp(q, 'i'), _id: { $ne: req.session.userId } }).limit(10).select('username favoriteBooks friends')
    : [];
  const suggested = await User.find({ _id: { $ne: req.session.userId, $nin: me.friends.map(f => f._id) } }).limit(6).select('username favoriteBooks friends');
  res.render('friends', { friends: me.friends, searchResults, searchQuery: q, suggested });
});

// Add friend
router.post('/add/:userId', requireLogin, async (req, res) => {
  if (req.params.userId !== req.session.userId) {
    await User.findByIdAndUpdate(req.session.userId, {
      $addToSet: { friends: req.params.userId }
    });
  }
  res.redirect('back');
});

// Remove friend
router.post('/remove/:userId', requireLogin, async (req, res) => {
  await User.findByIdAndUpdate(req.session.userId, {
    $pull: { friends: req.params.userId }
  });
  res.redirect('/friends');
});

module.exports = router;