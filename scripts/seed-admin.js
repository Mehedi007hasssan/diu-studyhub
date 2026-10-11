const bcrypt = require('bcryptjs');
const db = require('../db');

async function seedAdmin() {
  const password = process.env.ADMIN_DEFAULT_PASSWORD || 'Admin123!';
  const hash = await bcrypt.hash(password, 12);
  const dept = db.prepare("SELECT id FROM departments WHERE code = 'CSE'").get() || db.prepare('SELECT id FROM departments LIMIT 1').get();
  const deptId = dept ? dept.id : null;

  const admins = [
    { name: 'Mehedi Hassan Shuvo', email: 'mehedishuvo644@gmail.com', studentId: 'DIU-OWNER' },
    { name: 'Mehedi Hassan Shuvo', email: 'mehedi007shuvo@gmail.com', studentId: 'OWNER-01' },
    { name: 'Mehedi Hassan Shuvo', email: 'mehedi@diu.edu.bd', studentId: 'DIU-FOUNDER' },
    { name: 'Mehedi Hassan Shuvo', email: 'admin@diu-studyhub.edu.bd', studentId: 'ADMIN-01' }
  ];

  for (const a of admins) {
    const existing = db.prepare('SELECT id, role FROM users WHERE email = ?').get(a.email);
    if (existing) {
      db.prepare("UPDATE users SET name = ?, role = 'admin', password_hash = ? WHERE id = ?").run(a.name, hash, existing.id);
      console.log(`Updated user ${a.email} to admin.`);
    } else {
      db.prepare('INSERT INTO users (name, student_id, email, password_hash, department_id, role) VALUES (?, ?, ?, ?, ?, ?)').run(
        a.name, a.studentId, a.email, hash, deptId, 'admin'
      );
      console.log(`Created admin account for ${a.name} (${a.email}) with password: ${password}`);
    }
  }
}

seedAdmin().catch(console.error);
