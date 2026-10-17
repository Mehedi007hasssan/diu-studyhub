const express = require('express');
const bcrypt = require('bcryptjs');
const prisma = require('../db');
const { isAdminEmail } = require('../lib/config');
const { requireLogin } = require('../lib/auth');
const { authLimiter } = require('../lib/ratelimit');
const { generateOtp, sendOtpEmail } = require('../lib/email');

const router = express.Router();

const allowedDomains = () =>
  (process.env.ALLOWED_EMAIL_DOMAINS || '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

async function getDepartments() {
  return await prisma.department.findMany({ orderBy: { name: 'asc' } });
}

// ---------------------------------------------------------------------
// REGISTRATION WITH 6-DIGIT EMAIL OTP VERIFICATION
// ---------------------------------------------------------------------

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

    let existingUser = null;
    if (!errors.length) {
      existingUser = await prisma.user.findUnique({ where: { email: form.email } });
      if (existingUser && existingUser.emailVerified) {
        errors.push('An account with this email already exists.');
      }
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
    if (existingUser && !existingUser.emailVerified) {
      // Update unverified pending user
      await prisma.user.update({
        where: { id: existingUser.id },
        data: {
          name: form.name,
          studentId: form.student_id || null,
          passwordHash: hash,
          departmentId: form.department_id,
        },
      });
    } else {
      // Create new user with emailVerified = false
      await prisma.user.create({
        data: {
          name: form.name,
          studentId: form.student_id || null,
          email: form.email,
          passwordHash: hash,
          departmentId: form.department_id,
          role: isAdminEmail(form.email) ? 'admin' : 'student',
          emailVerified: false,
        },
      });
    }

    // Generate 6-digit OTP code (valid for 10 minutes)
    const code = generateOtp();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    // Invalidate previous unused registration codes
    await prisma.verificationCode.updateMany({
      where: { email: form.email, type: 'register', used: false },
      data: { used: true },
    });

    await prisma.verificationCode.create({
      data: {
        email: form.email,
        code,
        type: 'register',
        expiresAt,
      },
    });

    // Send email
    const emailResult = await sendOtpEmail({
      to: form.email,
      code,
      type: 'register',
      name: form.name,
    });

    req.session.pendingVerifyEmail = form.email;
    let redirectUrl = '/verify-email?email=' + encodeURIComponent(form.email);
    if (!emailResult.ok && emailResult.error) {
      redirectUrl += '&error=' + encodeURIComponent(emailResult.error);
    }
    res.redirect(redirectUrl);
  } catch (err) {
    next(err);
  }
});

router.get('/verify-email', (req, res) => {
  if (req.user) return res.redirect('/');
  const email = (req.query.email || req.session.pendingVerifyEmail || '').trim().toLowerCase();
  if (!email) return res.redirect('/register');
  res.render('verify-otp', {
    title: 'Verify your email',
    email,
    error: req.query.error || null,
    msg: req.query.msg || null,
  });
});

router.post('/verify-email', authLimiter, async (req, res, next) => {
  try {
    const email = (req.body.email || '').trim().toLowerCase();
    const otp = (req.body.otp || '').trim();

    if (!email || !otp || otp.length !== 6) {
      return res.status(400).render('verify-otp', {
        title: 'Verify your email',
        email,
        error: 'Please enter the full 6-digit verification code.',
        msg: null,
      });
    }

    const record = await prisma.verificationCode.findFirst({
      where: {
        email,
        code: otp,
        type: 'register',
        used: false,
        expiresAt: { gt: new Date() },
      },
      orderBy: { id: 'desc' },
    });

    if (!record) {
      return res.status(400).render('verify-otp', {
        title: 'Verify your email',
        email,
        error: 'Invalid or expired verification code. Please check your inbox or click Resend.',
        msg: null,
      });
    }

    // Mark code as used and verify user
    await prisma.verificationCode.update({
      where: { id: record.id },
      data: { used: true },
    });

    const user = await prisma.user.update({
      where: { email },
      data: { emailVerified: true },
    });

    delete req.session.pendingVerifyEmail;
    req.session = { userId: user.id }; // Log in user automatically

    res.redirect('/login?verified=1');
  } catch (err) {
    next(err);
  }
});

router.post('/resend-otp', authLimiter, async (req, res, next) => {
  try {
    const email = (req.body.email || '').trim().toLowerCase();
    const type = req.body.type === 'reset_password' ? 'reset_password' : 'register';

    if (!email) return res.redirect('/login');

    const user = await prisma.user.findUnique({ where: { email } });
    if (user) {
      // Invalidate existing unused codes
      await prisma.verificationCode.updateMany({
        where: { email, type, used: false },
        data: { used: true },
      });

      const code = generateOtp();
      await prisma.verificationCode.create({
        data: {
          email,
          code,
          type,
          expiresAt: new Date(Date.now() + 10 * 60 * 1000),
        },
      });

      const emailResult = await sendOtpEmail({
        to: email,
        code,
        type,
        name: user.name,
      });

      if (!emailResult.ok && emailResult.error) {
        const dest = type === 'reset_password' ? '/reset-password' : '/verify-email';
        return res.redirect(`${dest}?email=${encodeURIComponent(email)}&error=${encodeURIComponent(emailResult.error)}`);
      }
    }

    if (type === 'reset_password') {
      res.redirect('/reset-password?email=' + encodeURIComponent(email) + '&msg=A new 6-digit recovery code has been sent.');
    } else {
      res.redirect('/verify-email?email=' + encodeURIComponent(email) + '&msg=A new 6-digit verification code has been sent.');
    }
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------
// FORGOT & RESET PASSWORD WITH 6-DIGIT OTP
// ---------------------------------------------------------------------

router.get('/forgot-password', (req, res) => {
  if (req.user) return res.redirect('/');
  res.render('forgot-password', {
    title: 'Forgot password',
    error: null,
    email: '',
  });
});

router.post('/forgot-password', authLimiter, async (req, res, next) => {
  try {
    const email = (req.body.email || '').trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).render('forgot-password', {
        title: 'Forgot password',
        error: 'Please enter a valid email address.',
        email,
      });
    }

    const user = await prisma.user.findUnique({ where: { email } });
    if (user) {
      // Invalidate previous reset codes
      await prisma.verificationCode.updateMany({
        where: { email, type: 'reset_password', used: false },
        data: { used: true },
      });

      const code = generateOtp();
      await prisma.verificationCode.create({
        data: {
          email,
          code,
          type: 'reset_password',
          expiresAt: new Date(Date.now() + 10 * 60 * 1000),
        },
      });

      await sendOtpEmail({
        to: email,
        code,
        type: 'reset_password',
        name: user.name,
      });
    }

    // Always redirect to reset-password to prevent email enumeration attacks
    res.redirect('/reset-password?email=' + encodeURIComponent(email));
  } catch (err) {
    next(err);
  }
});

router.get('/reset-password', (req, res) => {
  if (req.user) return res.redirect('/');
  const email = (req.query.email || '').trim().toLowerCase();
  res.render('reset-password', {
    title: 'Set new password',
    email,
    error: req.query.error || null,
    msg: req.query.msg || null,
  });
});

router.post('/reset-password', authLimiter, async (req, res, next) => {
  try {
    const email = (req.body.email || '').trim().toLowerCase();
    const otp = (req.body.otp || '').trim();
    const newPassword = req.body.newPassword || '';
    const confirmPassword = req.body.confirmPassword || '';

    const fail = (error) => {
      return res.status(400).render('reset-password', {
        title: 'Set new password',
        email,
        error,
        msg: null,
      });
    };

    if (!email || !otp || otp.length !== 6) {
      return fail('Please enter the full 6-digit recovery code.');
    }
    if (newPassword.length < 8) {
      return fail('New password must be at least 8 characters long.');
    }
    if (newPassword.length > 72) {
      return fail('Password is too long (max 72 characters).');
    }
    if (newPassword !== confirmPassword) {
      return fail('New passwords do not match.');
    }

    const record = await prisma.verificationCode.findFirst({
      where: {
        email,
        code: otp,
        type: 'reset_password',
        used: false,
        expiresAt: { gt: new Date() },
      },
      orderBy: { id: 'desc' },
    });

    if (!record) {
      return fail('Invalid or expired 6-digit recovery code. Please check your email or click Resend.');
    }

    // Mark code as used
    await prisma.verificationCode.update({
      where: { id: record.id },
      data: { used: true },
    });

    // Hash and update user password
    const hash = await bcrypt.hash(newPassword, 12);
    await prisma.user.update({
      where: { email },
      data: {
        passwordHash: hash,
        emailVerified: true, // Also ensure user is verified
      },
    });

    res.redirect('/login?reset=1');
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------
// LOGIN & LOGOUT
// ---------------------------------------------------------------------

router.get('/login', (req, res) => {
  if (req.user) return res.redirect('/');
  res.render('login', {
    title: 'Log in',
    error: null,
    email: '',
    reset: req.query.reset === '1',
    verified: req.query.verified === '1',
  });
});

const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', 12);

router.post('/login', authLimiter, async (req, res, next) => {
  try {
    const email = (req.body.email || '').trim().toLowerCase();
    const password = req.body.password || '';

    const user = await prisma.user.findUnique({ where: { email } });
    const ok = await bcrypt.compare(password, user ? user.passwordHash : DUMMY_HASH);

    if (!user || !ok) {
      return res.status(401).render('login', {
        title: 'Log in',
        error: 'Wrong email or password.',
        email,
        reset: false,
        verified: false,
      });
    }

    // If user registered but never verified their 6-digit OTP
    if (!user.emailVerified) {
      const code = generateOtp();
      await prisma.verificationCode.updateMany({
        where: { email, type: 'register', used: false },
        data: { used: true },
      });
      await prisma.verificationCode.create({
        data: {
          email,
          code,
          type: 'register',
          expiresAt: new Date(Date.now() + 10 * 60 * 1000),
        },
      });
      await sendOtpEmail({
        to: email,
        code,
        type: 'register',
        name: user.name,
      });
      req.session.pendingVerifyEmail = email;
      return res.redirect('/verify-email?email=' + encodeURIComponent(email) + '&msg=Please enter the 6-digit code sent to your email to activate your account.');
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

// ---------------------------------------------------------------------
// CHANGE PASSWORD (AUTHENTICATED)
// ---------------------------------------------------------------------

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
