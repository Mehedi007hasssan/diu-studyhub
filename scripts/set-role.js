// Usage: npm run set-role -- someone@example.com admin
// Roles: student | moderator | admin
try { process.loadEnvFile(); } catch {}
const db = require('../db');

const [email, role] = process.argv.slice(2);
if (!email || !['student', 'moderator', 'admin'].includes(role)) {
  console.error('Usage: npm run set-role -- <email> <student|moderator|admin>');
  process.exit(1);
}
const info = db.prepare('UPDATE users SET role = ? WHERE email = ?').run(role, email.toLowerCase());
if (info.changes === 0) {
  console.error('No user found with email ' + email + ' (register on the site first).');
  process.exit(1);
}
console.log(email + ' is now ' + role);
