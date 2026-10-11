try { process.loadEnvFile(); } catch {}
const bcrypt = require('bcryptjs');
const prisma = require('../db');

async function main() {
  const [email, newPassword] = process.argv.slice(2);
  if (!email || !newPassword) {
    console.log('Usage: node scripts/change-password.js <email> <newPassword>');
    process.exit(1);
  }
  if (newPassword.length < 8) {
    console.error('Error: Password must be at least 8 characters long.');
    process.exit(1);
  }
  const user = await prisma.user.findUnique({ where: { email: email.toLowerCase().trim() } });
  if (!user) {
    console.error(`Error: User with email "${email}" not found.`);
    process.exit(1);
  }
  const hash = await bcrypt.hash(newPassword, 12);
  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: hash },
  });
  console.log(`Success! Password for ${user.name} (${user.email}) has been changed.`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
