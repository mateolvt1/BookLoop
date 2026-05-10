const router  = require('express').Router();
const bcrypt  = require('bcryptjs');
const User    = require('../models/User');
const Post    = require('../models/Post');
const Review  = require('../models/Review');

function requireLogin(req, res, next) {
  if (!req.session.userId) return res.redirect('/login');
  next();
}

// ── Landing ───────────────────────────────────────────────────
router.get('/', (req, res) => {
  if (req.session.userId) return res.redirect('/home');
  res.render('index');
});

// ── Register ──────────────────────────────────────────────────
router.get('/register', (req, res) => res.render('register'));

router.post('/register', async (req, res) => {
  try {
    const { username, email, password } = req.body;
    const user = await User.create({ username, email, password });
    req.session.userId = user._id;
    res.redirect('/home');
  } catch (err) {
    res.render('register', { error: 'Username or email already taken.' });
  }
});

// ── Login ─────────────────────────────────────────────────────
router.get('/login', (req, res) => res.render('login'));

router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  const user = await User.findOne({ email });
  if (!user || !(await bcrypt.compare(password, user.password)))
    return res.render('login', { error: 'Invalid credentials.' });
  req.session.userId = user._id;
  res.redirect('/home');
});

// ── Logout ────────────────────────────────────────────────────
router.post('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/'));
});

// ── Profile ───────────────────────────────────────────────────
router.get('/profile/:username', async (req, res) => {
  const user = await User.findOne({ username: req.params.username })
    .populate('currentlyReading')
    .populate('favoriteBooks')
    .populate('readNext')
    .populate('friends', 'username');

  if (!user) return res.status(404).send('User not found');

  const userReviews = await Review.find({ user: user._id })
    .populate('book', 'title author coverUrl avgRating ratingCount')
    .sort({ createdAt: -1 });

  const userPosts = await Post.find({ user: user._id })
    .populate('book', 'title coverUrl')
    .sort({ createdAt: -1 })
    .limit(20);

  res.render('profile', { user, userReviews, userPosts });
});

// ── Edit bio ──────────────────────────────────────────────────
router.post('/users/bio', requireLogin, async (req, res) => {
  await User.findByIdAndUpdate(req.session.userId, { bio: req.body.bio });
  const user = await User.findById(req.session.userId);
  res.redirect('/profile/' + user.username);
});

// ── Upload profile image or banner (base64 → MongoDB) ─────────
// Accepts JSON: { type: 'avatar' | 'banner', data: 'data:image/...' }
// Limits base64 string to ~3MB (raw file ~2.25MB after encoding)
const MAX_B64 = 3 * 1024 * 1024 * 1.37; // ~4MB base64 chars

router.post('/users/upload-image', requireLogin, async (req, res) => {
  try {
    const { type, data } = req.body;

    if (!['avatar', 'banner'].includes(type)) {
      return res.json({ ok: false, error: 'Invalid type' });
    }
    if (!data || !data.startsWith('data:image/')) {
      return res.json({ ok: false, error: 'Invalid image data' });
    }
    if (data.length > MAX_B64) {
      return res.json({ ok: false, error: 'Image too large (max ~3MB)' });
    }

    const update = {};
    update[type] = data; // 'avatar' or 'banner'

    await User.findByIdAndUpdate(req.session.userId, update);
    res.json({ ok: true });

  } catch (err) {
    console.error('Image upload error:', err);
    res.json({ ok: false, error: 'Server error' });
  }
});

module.exports = router;
