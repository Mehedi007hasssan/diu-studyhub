try { process.loadEnvFile(); } catch {}
const prisma = require('../db');

async function main() {
  const [email, role] = process.argv.slice(2);
  if (!email || !['student', 'moderator', 'admin'].includes(role)) {
    console.error('Usage: npm run set-role -- <email> <student|moderator|admin>');
    process.exit(1);
  }
  const info = await prisma.user.updateMany({
    where: { email: email.toLowerCase().trim() },
    data: { role },
  });
  if (info.count === 0) {
    console.error('No user found with email ' + email + ' (register on the site first).');
    process.exit(1);
  }
  console.log(email + ' is now ' + role);
}

main().catch(console.error).finally(() => prisma.$disconnect());
