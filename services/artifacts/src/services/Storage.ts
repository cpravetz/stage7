import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { logger } from '@stage7-nextgen/shared';
import { promises as fs } from 'fs';
import path from 'path';

// S3 configuration (preferred when provided)
const s3Bucket = process.env.ARTIFACTS_S3_BUCKET;
const s3Region = process.env.ARTIFACTS_S3_REGION || 'us-east-1';
const s3Endpoint = process.env.ARTIFACTS_S3_ENDPOINT;

// Local filesystem fallback
const localDir = process.env.ARTIFACTS_LOCAL_DIR;
// Base URL used to serve local files (optional)
const localBaseUrl = process.env.ARTIFACTS_LOCAL_BASE_URL;

let s3Client: S3Client | null = null;
if (s3Bucket) {
  const accessKey = process.env.ARTIFACTS_S3_ACCESS_KEY_ID || process.env.AWS_ACCESS_KEY_ID;
  const secretKey = process.env.ARTIFACTS_S3_SECRET_ACCESS_KEY || process.env.AWS_SECRET_ACCESS_KEY;
  const creds = accessKey ? { accessKeyId: accessKey, secretAccessKey: secretKey } : undefined;
  const clientConfig: any = { region: s3Region, credentials: creds as any };
  if (s3Endpoint) clientConfig.endpoint = s3Endpoint;
  s3Client = new S3Client(clientConfig);
  logger.info({ bucket: s3Bucket, region: s3Region, endpoint: s3Endpoint }, 'S3 storage configured for artifacts');
}

export async function uploadBufferToStorage(key: string, buffer: Buffer, contentType?: string): Promise<{ url?: string }> {
  // Try S3 first if configured
  if (s3Client && s3Bucket) {
    try {
      const cmd = new PutObjectCommand({ Bucket: s3Bucket, Key: key, Body: buffer, ContentType: contentType });
      await s3Client.send(cmd);
      const url = s3Endpoint ? `${s3Endpoint.replace(/\/$/, '')}/${s3Bucket}/${encodeURIComponent(key)}` : `https://${s3Bucket}.s3.${s3Region}.amazonaws.com/${encodeURIComponent(key)}`;
      return { url };
    } catch (err) {
      logger.warn({ err }, 'S3 upload failed, falling back to local filestore if available');
    }
  }

  // Local filesystem fallback
  if (localDir) {
    try {
      const destDir = path.resolve(localDir);
      await fs.mkdir(destDir, { recursive: true });
      const filePath = path.join(destDir, key);
      const fileDir = path.dirname(filePath);
      await fs.mkdir(fileDir, { recursive: true });
      await fs.writeFile(filePath, buffer);
      const url = localBaseUrl ? `${localBaseUrl.replace(/\/$/, '')}/${encodeURIComponent(key)}` : `/files/${encodeURIComponent(key)}`;
      return { url };
    } catch (err) {
      logger.warn({ err }, 'Local filestore write failed');
      return { url: undefined };
    }
  }

  // Nothing configured
  return { url: undefined };
}

export default { uploadBufferToStorage };
