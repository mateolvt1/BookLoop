const router  = require('express').Router();
const bcrypt  = require('bcryptjs');
const User    = require('../models/User');

// Home
router.get('/', (req, res) => res.render('index'));

// Register
router.get('/register', (req, res) => res.render('register'));
router.post('/register', async (req, res) => {
  try {
    const { username, email, password } = req.body;
    const user = await User.create({ username, email, password });
    req.session.userId = user._id;
    res.redirect('/feed');
  } catch (err) {
    res.render('register', { error: 'Username or email already taken.' });
  }
});

// Login
router.get('/login', (req, res) => res.render('login'));
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  const user = await User.findOne({ email });
  if (!user || !(await bcrypt.compare(password, user.password)))
    return res.render('login', { error: 'Invalid credentials.' });
  req.session.userId = user._id;
  res.redirect('/feed');
});

// Logout
router.post('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/'));
});

// Profile
router.get('/profile/:username', async (req, res) => {
  const user = await User.findOne({ username: req.params.username })
    .populate('currentlyReading favoriteBooks');
  if (!user) return res.status(404).send('User not found');
  res.render('profile', { user });
});

module.exports = router;