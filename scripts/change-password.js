// Usage: node scripts/change-password.js <email> <newPassword>
// Example: node scripts/change-password.js mehedishuvo644@gmail.com MyNewSecretPass123!
const bcrypt = require('bcryptjs');
const db = require('../db');

const [email, newPassword] = process.argv.slice(2);

if (!email || !newPassword) {
  console.log('Usage: node scripts/change-password.js <email> <newPassword>');
  process.exit(1);
}

if (newPassword.length < 8) {
  console.error('Error: Password must be at least 8 characters long.');
  process.exit(1);
}

const user = db.prepare('SELECT id, name, email FROM users WHERE email = ?').get(email.toLowerCase().trim());
if (!user) {
  console.error(`Error: User with email "${email}" not found.`);
  process.exit(1);
}

const hash = bcrypt.hashSync(newPassword, 12);
db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hash, user.id);

console.log(`Success! Password for ${user.name} (${user.email}) has been changed.`);
