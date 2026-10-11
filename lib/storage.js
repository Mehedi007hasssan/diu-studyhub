const fs = require('fs');
const path = require('path');
const { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const cloudinary = require('cloudinary').v2;

const isS3Configured = () => !!(process.env.S3_BUCKET || process.env.AWS_S3_BUCKET);
const isCloudinaryConfigured = () =>
  !!(process.env.CLOUDINARY_URL || (process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY));

let s3Client = null;
function getS3Client() {
  if (!s3Client) {
    const config = {
      region: process.env.AWS_REGION || process.env.S3_REGION || 'us-east-1',
    };
    if (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY) {
      config.credentials = {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      };
    }
    // Custom S3 endpoint for Cloudflare R2, Supabase Storage S3, or MinIO
    if (process.env.S3_ENDPOINT) {
      config.endpoint = process.env.S3_ENDPOINT;
      config.forcePathStyle = process.env.S3_FORCE_PATH_STYLE === 'true';
    }
    s3Client = new S3Client(config);
  }
  return s3Client;
}

if (isCloudinaryConfigured()) {
  if (process.env.CLOUDINARY_URL) {
    cloudinary.config();
  } else {
    cloudinary.config({
      cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
      api_key: process.env.CLOUDINARY_API_KEY,
      api_secret: process.env.CLOUDINARY_API_SECRET,
    });
  }
}

const LOCAL_UPLOAD_DIR = path.resolve(process.env.UPLOAD_DIR || path.join(__dirname, '..', 'uploads'));

/**
 * Uploads a file buffer directly to Cloud Object Storage (or local disk fallback in dev)
 */
async function uploadToStorage(storedName, buffer, mime) {
  if (isS3Configured()) {
    const bucket = process.env.S3_BUCKET || process.env.AWS_S3_BUCKET;
    const client = getS3Client();
    await client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: storedName,
        Body: buffer,
        ContentType: mime,
      })
    );
    return { provider: 's3', key: storedName };
  }

  if (isCloudinaryConfigured()) {
    return new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          public_id: path.parse(storedName).name,
          resource_type: 'raw',
          format: path.extname(storedName).replace('.', ''),
          folder: 'studyhub',
        },
        (error, result) => {
          if (error) return reject(error);
          resolve({ provider: 'cloudinary', key: storedName, url: result.secure_url });
        }
      );
      uploadStream.end(buffer);
    });
  }

  // Local filesystem fallback (for offline local development)
  fs.mkdirSync(LOCAL_UPLOAD_DIR, { recursive: true });
  const localPath = path.join(LOCAL_UPLOAD_DIR, storedName);
  await fs.promises.writeFile(localPath, buffer);
  return { provider: 'local', key: storedName };
}

/**
 * Gets a download URL or serves the file
 */
async function getFileDownloadUrl(storedName, originalName) {
  if (isS3Configured()) {
    const bucket = process.env.S3_BUCKET || process.env.AWS_S3_BUCKET;
    const client = getS3Client();
    const command = new GetObjectCommand({
      Bucket: bucket,
      Key: storedName,
      ResponseContentDisposition: `attachment; filename="${encodeURIComponent(originalName)}"`,
    });
    // Presigned URL valid for 15 minutes
    return await getSignedUrl(client, command, { expiresIn: 900 });
  }

  if (isCloudinaryConfigured()) {
    return cloudinary.url(`studyhub/${path.parse(storedName).name}`, {
      resource_type: 'raw',
      flags: `attachment:${encodeURIComponent(originalName)}`,
    });
  }

  return null; // Local file
}

/**
 * Gets an inline view URL (for PDFs and images)
 */
async function getFileViewUrl(storedName, mime) {
  if (isS3Configured()) {
    const bucket = process.env.S3_BUCKET || process.env.AWS_S3_BUCKET;
    const client = getS3Client();
    const command = new GetObjectCommand({
      Bucket: bucket,
      Key: storedName,
      ResponseContentType: mime,
      ResponseContentDisposition: 'inline',
    });
    return await getSignedUrl(client, command, { expiresIn: 900 });
  }

  if (isCloudinaryConfigured()) {
    return cloudinary.url(`studyhub/${path.parse(storedName).name}`, {
      resource_type: 'raw',
    });
  }

  return null;
}

/**
 * Deletes a file from storage
 */
async function deleteFromStorage(storedName) {
  if (!storedName) return;

  if (isS3Configured()) {
    try {
      const bucket = process.env.S3_BUCKET || process.env.AWS_S3_BUCKET;
      const client = getS3Client();
      await client.send(
        new DeleteObjectCommand({
          Bucket: bucket,
          Key: storedName,
        })
      );
    } catch (e) {
      console.error('Failed to delete from S3:', e);
    }
    return;
  }

  if (isCloudinaryConfigured()) {
    try {
      await cloudinary.uploader.destroy(`studyhub/${path.parse(storedName).name}`, { resource_type: 'raw' });
    } catch (e) {
      console.error('Failed to delete from Cloudinary:', e);
    }
    return;
  }

  // Local fallback
  try {
    const localPath = path.join(LOCAL_UPLOAD_DIR, path.basename(storedName));
    if (fs.existsSync(localPath)) {
      await fs.promises.unlink(localPath);
    }
  } catch {}
}

module.exports = {
  uploadToStorage,
  getFileDownloadUrl,
  getFileViewUrl,
  deleteFromStorage,
  LOCAL_UPLOAD_DIR,
  isS3Configured,
  isCloudinaryConfigured,
};
