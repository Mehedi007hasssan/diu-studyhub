try { process.loadEnvFile(); } catch {}
const bcrypt = require('bcryptjs');
const prisma = require('../db');

async function seedAdmin() {
  const password = process.env.ADMIN_DEFAULT_PASSWORD || 'Admin123!';
  const hash = await bcrypt.hash(password, 12);
  const dept = (await prisma.department.findUnique({ where: { code: 'CSE' } })) || (await prisma.department.findFirst());
  const deptId = dept ? dept.id : null;

  const admins = [
    { name: 'Mehedi Hassan Shuvo', email: 'mehedishuvo644@gmail.com', studentId: 'DIU-OWNER' },
    { name: 'Mehedi Hassan Shuvo', email: 'mehedi007shuvo@gmail.com', studentId: 'OWNER-01' },
    { name: 'Mehedi Hassan Shuvo', email: 'mehedi@diu.edu.bd', studentId: 'DIU-FOUNDER' },
    { name: 'Mehedi Hassan Shuvo', email: 'admin@diu-studyhub.edu.bd', studentId: 'ADMIN-01' },
  ];

  for (const a of admins) {
    await prisma.user.upsert({
      where: { email: a.email },
      update: { role: 'admin', passwordHash: hash, name: a.name },
      create: {
        name: a.name,
        email: a.email,
        studentId: a.studentId,
        passwordHash: hash,
        departmentId: deptId,
        role: 'admin',
      },
    });
    console.log(`Admin account ready: ${a.name} (${a.email}) with password: ${password}`);
  }
}

seedAdmin().catch(console.error).finally(() => prisma.$disconnect());
