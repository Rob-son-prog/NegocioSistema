// server/s3.js
import fs from 'fs';
import path from 'path';
import { S3Client, PutObjectCommand, ListObjectsV2Command, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const {
  S3_ENDPOINT,
  S3_BUCKET,
  S3_ACCESS_KEY_ID,
  S3_SECRET_ACCESS_KEY,
} = process.env;

// Cliente S3 (Cloudflare R2)
export const s3 = new S3Client({
  region: 'auto',
  endpoint: S3_ENDPOINT,
  forcePathStyle: true,
  credentials: {
    accessKeyId: S3_ACCESS_KEY_ID,
    secretAccessKey: S3_SECRET_ACCESS_KEY,
  },
});

export async function uploadBuffer(key, buffer, contentType = 'application/octet-stream') {
  await s3.send(new PutObjectCommand({
    Bucket: S3_BUCKET,
    Key: key,
    Body: buffer,
    ContentType: contentType,
  }));
  return { key, size: buffer.length };
}

export async function listBackups(prefix = 'backups/', limit = 100) {
  const out = await s3.send(new ListObjectsV2Command({
    Bucket: S3_BUCKET,
    Prefix: prefix,
    MaxKeys: limit,
  }));
  return (out.Contents || []).map(o => ({
    key: o.Key,
    size: o.Size,
    lastModified: o.LastModified,
  }));
}

export async function presign(key, expiresIn = 600) {
  const cmd = new GetObjectCommand({ Bucket: S3_BUCKET, Key: key });
  const url = await getSignedUrl(s3, cmd, { expiresIn });
  return url;
}

export async function backupSqlite(dbPath) {
  const abs = path.resolve(dbPath);
  const buf = fs.readFileSync(abs);

  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const key = `backups/sqlite-${ts}.sqlite`;

  await uploadBuffer(key, buf, 'application/x-sqlite3');
  return { key, size: buf.length };
}
