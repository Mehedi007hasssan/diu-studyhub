const express = require('express');
const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');
const db = require('../db');
const { isAdminEmail } = require('../lib/config');
const { requireLogin } = require('../lib/auth');

const router = express.Router();

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) =>
    res.status(429).render('error', {
      title: 'Too many attempts',
      message: 'Too many attempts. Please wait a few minutes and try again.',
    }),
});

const allowedDomains = () =>
  (process.env.ALLOWED_EMAIL_DOMAINS || '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

function departments() {
  return db.prepare('SELECT id, code, name FROM departments ORDER BY name').all();
}

router.get('/register', (req, res) => {
  if (req.user) return res.redirect('/');
  res.render('register', {
    title: 'Create account',
    departments: departments(),
    errors: [],
    form: {},
    domains: allowedDomains(),
  });
});

router.post('/register', authLimiter, async (req, res) => {
  const form = {
    name: (req.body.name || '').trim(),
    student_id: (req.body.student_id || '').trim(),
    email: (req.body.email || '').trim().toLowerCase(),
    department_id: parseInt(req.body.department_id, 10) || null,
  };
  const password = req.body.password || '';
  const errors = [];

  if (form.name.length < 2 || form.name.length > 80) errors.push('Please enter your full name.');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) errors.push('Please enter a valid email.');
  const domains = allowedDomains();
  if (domains.length && !domains.some((d) => form.email.endsWith('@' + d))) {
    errors.push('Please use your university email (' + domains.map((d) => '@' + d).join(' or ') + ').');
  }
  if (form.student_id && !/^[A-Za-z0-9-]{3,30}$/.test(form.student_id)) {
    errors.push('Student ID may contain only letters, numbers and dashes.');
  }
  if (password.length < 8) errors.push('Password must be at least 8 characters.');
  if (password.length > 72) errors.push('Password is too long (max 72 characters).');
  if (password !== req.body.password2) errors.push('Passwords do not match.');
  if (!form.department_id || !db.prepare('SELECT 1 FROM departments WHERE id = ?').get(form.department_id)) {
    errors.push('Please choose your department.');
  }
  if (!errors.length && db.prepare('SELECT 1 FROM users WHERE email = ?').get(form.email)) {
    errors.push('An account with this email already exists.');
  }

  if (errors.length) {
    return res.status(400).render('register', {
      title: 'Create account',
      departments: departments(),
      errors,
      form,
      domains,
    });
  }

  const hash = await bcrypt.hash(password, 12);
  const info = db
    .prepare(
      'INSERT INTO users (name, student_id, email, password_hash, department_id, role) VALUES (?, ?, ?, ?, ?, ?)'
    )
    .run(
      form.name,
      form.student_id || null,
      form.email,
      hash,
      form.department_id,
      isAdminEmail(form.email) ? 'admin' : 'student'
    );

  req.session = { userId: Number(info.lastInsertRowid) };
  res.redirect('/');
});

router.get('/login', (req, res) => {
  if (req.user) return res.redirect('/');
  res.render('login', { title: 'Log in', error: null, email: '' });
});

// Pre-computed hash so login takes similar time whether or not the email exists.
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', 12);

router.post('/login', authLimiter, async (req, res) => {
  const email = (req.body.email || '').trim().toLowerCase();
  const password = req.body.password || '';
  const row = db.prepare('SELECT id, password_hash FROM users WHERE email = ?').get(email);
  const ok = await bcrypt.compare(password, row ? row.password_hash : DUMMY_HASH);
  if (!row || !ok) {
    return res.status(401).render('login', { title: 'Log in', error: 'Wrong email or password.', email });
  }
  const returnTo = req.session.returnTo;
  req.session = { userId: row.id }; // fresh session on login
  // only allow same-site relative redirects
  res.redirect(returnTo && /^\/(?!\/)/.test(returnTo) ? returnTo : '/');
});

router.post('/logout', (req, res) => {
  req.session = null;
  res.redirect('/');
});

router.get('/change-password', requireLogin, (req, res) => {
  res.render('change-password', { title: 'Change password', error: null, msg: null });
});

router.post('/change-password', requireLogin, async (req, res) => {
  const currentPassword = req.body.currentPassword || '';
  const newPassword = req.body.newPassword || '';
  const confirmPassword = req.body.confirmPassword || '';

  const user = db.prepare('SELECT id, password_hash FROM users WHERE id = ?').get(req.user.id);
  if (!user) return res.redirect('/login');

  const match = await bcrypt.compare(currentPassword, user.password_hash);
  if (!match) {
    return res.status(400).render('change-password', {
      title: 'Change password',
      error: 'Current password is incorrect.',
      msg: null,
    });
  }

  if (newPassword.length < 8) {
    return res.status(400).render('change-password', {
      title: 'Change password',
      error: 'New password must be at least 8 characters long.',
      msg: null,
    });
  }

  if (newPassword !== confirmPassword) {
    return res.status(400).render('change-password', {
      title: 'Change password',
      error: 'New passwords do not match.',
      msg: null,
    });
  }

  const hash = await bcrypt.hash(newPassword, 12);
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hash, req.user.id);

  res.render('change-password', {
    title: 'Change password',
    error: null,
    msg: 'Password updated successfully!',
  });
});

module.exports = router;
