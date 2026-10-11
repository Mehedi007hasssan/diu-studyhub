const { Prisma } = require('@prisma/client');

const hasInsensitive = Boolean(Prisma?.QueryMode?.insensitive);

/**
 * Portable string contains filter that works seamlessly across SQLite and PostgreSQL.
 */
function containsText(val) {
  const filter = { contains: val };
  if (hasInsensitive) {
    filter.mode = 'insensitive';
  }
  return filter;
}

module.exports = {
  containsText,
  hasInsensitive,
};
