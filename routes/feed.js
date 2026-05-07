const router = require('express').Router();
const Post   = require('../models/Post');
const User   = require('../models/User');

function requireLogin(req, res, next) {
  if (!req.session.userId) return res.redirect('/login');
  next();
}

// Social feed
router.get('/', requireLogin, async (req, res) => {
  const me = await User.findById(req.session.userId);
  const posts = await Post.find({
    user: { $in: [req.session.userId, ...me.friends] }
  })
    .populate('user', 'username avatar')
    .populate('book', 'title coverUrl')
    .sort({ createdAt: -1 })
    .limit(30);
  res.render('feed', { posts });
});

// Create post
router.post('/', requireLogin, async (req, res) => {
  const { content, type } = req.body;
  await Post.create({ user: req.session.userId, content, type });
  res.redirect('/feed');
});

// Like a post
router.post('/:id/like', requireLogin, async (req, res) => {
  const post = await Post.findById(req.params.id);
  const idx  = post.likes.indexOf(req.session.userId);
  if (idx === -1) post.likes.push(req.session.userId);
  else post.likes.splice(idx, 1);
  await post.save();
  res.redirect('/feed');
});

module.exports = router;