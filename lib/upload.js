const path = require('path');
const crypto = require('crypto');
const multer = require('multer');
const { uploadToStorage, deleteFromStorage, getFileDownloadUrl, getFileViewUrl } = require('./storage');

// Vercel Serverless Functions have a strict incoming request body payload limit of 4.5 MB.
// When running in production on Vercel, requests over 4.5 MB return 413 FUNCTION_PAYLOAD_TOO_LARGE.
const MAX_MB = process.env.VERCEL ? 4 : (parseInt(process.env.MAX_UPLOAD_MB, 10) || 25);

const PK = [0x50, 0x4b, 0x03, 0x04]; // zip container (docx, pptx, xlsx, zip)
const OLE = [0xd0, 0xcf, 0x11, 0xe0]; // legacy Office (doc, ppt, xls)

// Whitelist: extension -> mime, expected leading bytes, and whether it is safe to show inline.
const FILE_TYPES = {
  '.pdf': { mime: 'application/pdf', magic: [0x25, 0x50, 0x44, 0x46], inline: true },
  '.ppt': { mime: 'application/vnd.ms-powerpoint', magic: OLE },
  '.pptx': {
    mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    magic: PK,
  },
  '.doc': { mime: 'application/msword', magic: OLE },
  '.docx': {
    mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    magic: PK,
  },
  '.xls': { mime: 'application/vnd.ms-excel', magic: OLE },
  '.xlsx': {
    mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    magic: PK,
  },
  '.png': { mime: 'image/png', magic: [0x89, 0x50, 0x4e, 0x47], inline: true },
  '.jpg': { mime: 'image/jpeg', magic: [0xff, 0xd8, 0xff], inline: true },
  '.jpeg': { mime: 'image/jpeg', magic: [0xff, 0xd8, 0xff], inline: true },
  '.zip': { mime: 'application/zip', magic: PK },
};

// Memory storage for serverless execution (no ephemeral disk writes)
const storage = multer.memoryStorage();

const upload = multer({
  storage,
  limits: { fileSize: MAX_MB * 1024 * 1024, files: 1, fields: 20 },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!FILE_TYPES[ext]) {
      return cb(
        new Error('That file type is not allowed. Use: ' + Object.keys(FILE_TYPES).join(', ') + '.')
      );
    }
    cb(null, true);
  },
});

// Check the real file header matches its extension directly from in-memory buffer,
// and compute SHA-256 for duplicate detection.
async function inspectFile(file) {
  if (!file || !file.buffer) return { ok: false };
  const ext = path.extname(file.originalname).toLowerCase();
  const spec = FILE_TYPES[ext];
  if (!spec) return { ok: false };

  // Inspect the first 8 bytes of the buffer
  const magicOk = spec.magic.every((b, i) => file.buffer[i] === b);
  if (!magicOk) return { ok: false };

  // Calculate cryptographic SHA-256 hash directly on buffer
  const sha256 = crypto.createHash('sha256').update(file.buffer).digest('hex');
  const storedName = crypto.randomBytes(16).toString('hex') + ext;

  return { ok: true, sha256, mime: spec.mime, storedName };
}

function removeStored(storedName) {
  return deleteFromStorage(storedName);
}

const isInline = (mime) => mime === 'application/pdf' || mime === 'image/png' || mime === 'image/jpeg';

module.exports = {
  upload,
  inspectFile,
  uploadToStorage,
  removeStored,
  getFileDownloadUrl,
  getFileViewUrl,
  isInline,
  MAX_MB,
  FILE_TYPES,
};
