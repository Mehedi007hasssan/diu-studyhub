// Emails listed in ADMIN_EMAILS (comma separated) become admins automatically:
// at startup if the account already exists, and at sign-up if it does not.
const adminEmails = () =>
  (process.env.ADMIN_EMAILS || '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

const isAdminEmail = (email) => adminEmails().includes(String(email || '').trim().toLowerCase());

module.exports = { adminEmails, isAdminEmail };
