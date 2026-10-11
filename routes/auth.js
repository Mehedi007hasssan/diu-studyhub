const express = require('express');
const bcrypt = require('bcryptjs');
const prisma = require('../db');
const { isAdminEmail } = require('../lib/config');
const { requireLogin } = require('../lib/auth');
const { authLimiter } = require('../lib/ratelimit');

const router = express.Router();

const allowedDomains = () =>
  (process.env.ALLOWED_EMAIL_DOMAINS || '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

async function getDepartments() {
  return await prisma.department.findMany({ orderBy: { name: 'asc' } });
}

router.get('/register', async (req, res, next) => {
  if (req.user) return res.redirect('/');
  try {
    const departments = await getDepartments();
    res.render('register', {
      title: 'Create account',
      departments,
      errors: [],
      form: {},
      domains: allowedDomains(),
    });
  } catch (err) {
    next(err);
  }
});

router.post('/register', authLimiter, async (req, res, next) => {
  try {
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

    let dept = null;
    if (form.department_id) {
      dept = await prisma.department.findUnique({ where: { id: form.department_id } });
    }
    if (!dept) errors.push('Please choose your department.');

    if (!errors.length) {
      const existingUser = await prisma.user.findUnique({ where: { email: form.email } });
      if (existingUser) errors.push('An account with this email already exists.');
    }

    if (errors.length) {
      const departments = await getDepartments();
      return res.status(400).render('register', {
        title: 'Create account',
        departments,
        errors,
        form,
        domains,
      });
    }

    const hash = await bcrypt.hash(password, 12);
    const user = await prisma.user.create({
      data: {
        name: form.name,
        studentId: form.student_id || null,
        email: form.email,
        passwordHash: hash,
        departmentId: form.department_id,
        role: isAdminEmail(form.email) ? 'admin' : 'student',
      },
    });

    req.session = { userId: user.id };
    res.redirect('/');
  } catch (err) {
    next(err);
  }
});

router.get('/login', (req, res) => {
  if (req.user) return res.redirect('/');
  res.render('login', { title: 'Log in', error: null, email: '' });
});

const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', 12);

router.post('/login', authLimiter, async (req, res, next) => {
  try {
    const email = (req.body.email || '').trim().toLowerCase();
    const password = req.body.password || '';

    const user = await prisma.user.findUnique({ where: { email } });
    const ok = await bcrypt.compare(password, user ? user.passwordHash : DUMMY_HASH);

    if (!user || !ok) {
      return res.status(401).render('login', { title: 'Log in', error: 'Wrong email or password.', email });
    }

    const returnTo = req.session.returnTo;
    req.session = { userId: user.id }; // fresh session on login
    res.redirect(returnTo && /^\/(?!\/)/.test(returnTo) ? returnTo : '/');
  } catch (err) {
    next(err);
  }
});

router.post('/logout', (req, res) => {
  req.session = null;
  res.redirect('/');
});

router.get('/change-password', requireLogin, (req, res) => {
  res.render('change-password', { title: 'Change password', error: null, msg: null });
});

router.post('/change-password', requireLogin, async (req, res, next) => {
  try {
    const currentPassword = req.body.currentPassword || '';
    const newPassword = req.body.newPassword || '';
    const confirmPassword = req.body.confirmPassword || '';

    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    if (!user) return res.redirect('/login');

    const match = await bcrypt.compare(currentPassword, user.passwordHash);
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
    await prisma.user.update({
      where: { id: req.user.id },
      data: { passwordHash: hash },
    });

    res.render('change-password', {
      title: 'Change password',
      error: null,
      msg: 'Password updated successfully!',
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
