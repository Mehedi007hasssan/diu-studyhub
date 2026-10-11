const bcrypt = require('bcryptjs');
const prisma = require('../db');
const seed = require('../data/seed');
const { adminEmails } = require('../lib/config');

async function main() {
  console.log('Seeding departments...');
  for (const [code, name] of seed.departments) {
    await prisma.department.upsert({
      where: { code },
      update: { name },
      create: { code, name },
    });
  }

  console.log('Seeding courses...');
  for (const [dcode, ccode, title] of seed.courses) {
    const dept = await prisma.department.findUnique({ where: { code: dcode } });
    if (dept) {
      await prisma.course.upsert({
        where: {
          departmentId_code: {
            departmentId: dept.id,
            code: ccode,
          },
        },
        update: { title },
        create: {
          departmentId: dept.id,
          code: ccode,
          title,
        },
      });
    }
  }

  console.log('Seeding admin accounts...');
  const defaultPassword = process.env.ADMIN_DEFAULT_PASSWORD || 'Admin123!';
  const hash = await bcrypt.hash(defaultPassword, 12);
  const cse = await prisma.department.findUnique({ where: { code: 'CSE' } });
  const deptId = cse ? cse.id : null;

  const defaultAdmins = [
    { name: 'Mehedi Hassan Shuvo', email: 'mehedishuvo644@gmail.com', studentId: 'DIU-OWNER' },
    { name: 'Mehedi Hassan Shuvo', email: 'mehedi007shuvo@gmail.com', studentId: 'OWNER-01' },
    { name: 'Mehedi Hassan Shuvo', email: 'mehedi@diu.edu.bd', studentId: 'DIU-FOUNDER' },
    { name: 'Mehedi Hassan Shuvo', email: 'admin@diu-studyhub.edu.bd', studentId: 'ADMIN-01' },
  ];

  for (const a of defaultAdmins) {
    await prisma.user.upsert({
      where: { email: a.email },
      update: { role: 'admin', name: a.name },
      create: {
        name: a.name,
        email: a.email,
        studentId: a.studentId,
        passwordHash: hash,
        departmentId: deptId,
        role: 'admin',
      },
    });
  }

  // Also promote any emails defined in ADMIN_EMAILS env variable
  for (const email of adminEmails()) {
    await prisma.user.updateMany({
      where: { email, role: { not: 'admin' } },
      data: { role: 'admin' },
    });
  }

  console.log('Database seeding completed successfully.');
}

main()
  .catch((e) => {
    console.error('Seeding error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
