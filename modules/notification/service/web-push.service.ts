import {
  createCipheriv,
  createECDH,
  createHmac,
  createPrivateKey,
  randomBytes,
  sign,
} from 'crypto';

export interface WebPushSubscriptionTarget {
  endpoint: string;
  p256dh: string;
  auth: string;
}

export interface WebPushSendResult {
  ok: boolean;
  status: number;
  responseText?: string;
}

interface VapidConfig {
  publicKey: string;
  privateKey: string;
  subject: string;
}

const WEB_PUSH_MAX_PAYLOAD_BYTES = 3_000;
const AES_GCM_RECORD_SIZE = 4_096;

function base64UrlEncode(value: Buffer | string): string {
  return Buffer.from(value).toString('base64url');
}

function base64UrlDecode(value: string): Buffer {
  return Buffer.from(value, 'base64url');
}

function bufferToArrayBuffer(value: Buffer): ArrayBuffer {
  return value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength) as ArrayBuffer;
}

function hasHostSuffix(hostname: string, suffix: string): boolean {
  return hostname === suffix || hostname.endsWith(`.${suffix}`);
}

/**
 * Browser push endpoints are bearer-like capabilities that the server POSTs to.
 * Restrict them to known Web Push providers so an authenticated user cannot turn
 * the delivery worker into a generic HTTPS/SSRF primitive.
 */
export function isAllowedWebPushEndpoint(endpoint: string): boolean {
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return false;
  }
  if (url.protocol !== 'https:' || url.username || url.password) return false;

  const hostname = url.hostname.toLowerCase();
  return hostname === 'fcm.googleapis.com'
    || hostname === 'android.googleapis.com'
    || hasHostSuffix(hostname, 'push.services.mozilla.com')
    || hasHostSuffix(hostname, 'push.apple.com')
    || hasHostSuffix(hostname, 'notify.windows.com');
}

function hmacSha256(key: Buffer, data: Buffer): Buffer {
  return createHmac('sha256', key).update(data).digest();
}

function hkdfExtract(salt: Buffer, inputKeyMaterial: Buffer): Buffer {
  return hmacSha256(salt, inputKeyMaterial);
}

function hkdfExpand(pseudoRandomKey: Buffer, info: Buffer, length: number): Buffer {
  const chunks: Buffer[] = [];
  let previous = Buffer.alloc(0);
  let counter = 1;

  while (Buffer.concat(chunks).length < length) {
    previous = hmacSha256(
      pseudoRandomKey,
      Buffer.concat([previous, info, Buffer.from([counter])]),
    );
    chunks.push(previous);
    counter += 1;
  }

  return Buffer.concat(chunks).subarray(0, length);
}

function readVapidConfig(): VapidConfig | null {
  const publicKey = process.env.WEB_PUSH_VAPID_PUBLIC_KEY?.trim();
  const privateKey = process.env.WEB_PUSH_VAPID_PRIVATE_KEY?.trim();
  const subject = process.env.WEB_PUSH_VAPID_SUBJECT?.trim() || 'mailto:support@sahamlens.id';
  if (!publicKey || !privateKey) return null;

  const publicBytes = base64UrlDecode(publicKey);
  const privateBytes = base64UrlDecode(privateKey);
  if (publicBytes.length !== 65 || publicBytes[0] !== 0x04 || privateBytes.length !== 32) {
    throw new Error('WEB_PUSH_VAPID_* tidak valid: public key harus P-256 uncompressed dan private key 32 byte');
  }
  if (!subject.startsWith('mailto:') && !subject.startsWith('https://')) {
    throw new Error('WEB_PUSH_VAPID_SUBJECT harus mailto: atau https://');
  }

  return { publicKey, privateKey, subject };
}

export function getWebPushPublicConfig(): { configured: boolean; publicKey: string | null } {
  const config = readVapidConfig();
  return { configured: config !== null, publicKey: config?.publicKey ?? null };
}

function createVapidJwt(endpoint: string, config: VapidConfig): string {
  const audience = new URL(endpoint).origin;
  const publicBytes = base64UrlDecode(config.publicKey);
  const x = publicBytes.subarray(1, 33);
  const y = publicBytes.subarray(33, 65);

  const privateKey = createPrivateKey({
    key: {
      kty: 'EC',
      crv: 'P-256',
      x: base64UrlEncode(x),
      y: base64UrlEncode(y),
      d: config.privateKey,
    },
    format: 'jwk',
  });

  const header = base64UrlEncode(JSON.stringify({ typ: 'JWT', alg: 'ES256' }));
  const payload = base64UrlEncode(JSON.stringify({
    aud: audience,
    exp: Math.floor(Date.now() / 1000) + (12 * 60 * 60),
    sub: config.subject,
  }));
  const unsigned = `${header}.${payload}`;
  const signature = sign('sha256', Buffer.from(unsigned), {
    key: privateKey,
    dsaEncoding: 'ieee-p1363',
  });

  return `${unsigned}.${base64UrlEncode(signature)}`;
}

function encryptPayload(payload: Buffer, target: WebPushSubscriptionTarget): Buffer {
  if (payload.length > WEB_PUSH_MAX_PAYLOAD_BYTES) {
    throw new Error(`Payload Web Push terlalu besar (${payload.length} bytes)`);
  }

  const receiverPublicKey = base64UrlDecode(target.p256dh);
  const authSecret = base64UrlDecode(target.auth);
  if (receiverPublicKey.length !== 65 || receiverPublicKey[0] !== 0x04) {
    throw new Error('Push subscription p256dh tidak valid');
  }
  if (authSecret.length < 16) {
    throw new Error('Push subscription auth secret tidak valid');
  }

  const sender = createECDH('prime256v1');
  sender.generateKeys();
  const senderPublicKey = sender.getPublicKey();
  const sharedSecret = sender.computeSecret(receiverPublicKey);

  // RFC 8291 section 3.4: derive the Web Push input keying material first using
  // the subscription auth secret, then derive CEK/nonce using the per-message salt.
  const authPrk = hkdfExtract(authSecret, sharedSecret);
  const authInfo = Buffer.concat([
    Buffer.from('WebPush: info\0', 'utf8'),
    receiverPublicKey,
    senderPublicKey,
  ]);
  const inputKeyMaterial = hkdfExpand(authPrk, authInfo, 32);

  const salt = randomBytes(16);
  const prk = hkdfExtract(salt, inputKeyMaterial);
  const contentEncryptionKey = hkdfExpand(
    prk,
    Buffer.from('Content-Encoding: aes128gcm\0', 'utf8'),
    16,
  );
  const nonce = hkdfExpand(
    prk,
    Buffer.from('Content-Encoding: nonce\0', 'utf8'),
    12,
  );

  // Single final RFC 8188 record. 0x02 marks the final record; zero padding is not
  // needed because LensAlert payloads are deliberately small.
  const plaintext = Buffer.concat([payload, Buffer.from([0x02])]);
  const cipher = createCipheriv('aes-128-gcm', contentEncryptionKey, nonce);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final(), cipher.getAuthTag()]);

  const recordSize = Buffer.alloc(4);
  recordSize.writeUInt32BE(AES_GCM_RECORD_SIZE, 0);
  return Buffer.concat([
    salt,
    recordSize,
    Buffer.from([senderPublicKey.length]),
    senderPublicKey,
    ciphertext,
  ]);
}

export async function sendWebPush(
  target: WebPushSubscriptionTarget,
  payload: string,
): Promise<WebPushSendResult> {
  const config = readVapidConfig();
  if (!config) return { ok: false, status: 0, responseText: 'Web Push belum dikonfigurasi' };
  if (!isAllowedWebPushEndpoint(target.endpoint)) {
    throw new Error('Web Push endpoint provider tidak dikenali');
  }

  const jwt = createVapidJwt(target.endpoint, config);
  const encryptedBody = encryptPayload(Buffer.from(payload, 'utf8'), target);
  const response = await fetch(target.endpoint, {
    method: 'POST',
    headers: {
      Authorization: `vapid t=${jwt}, k=${config.publicKey}`,
      'Content-Encoding': 'aes128gcm',
      'Content-Type': 'application/octet-stream',
      TTL: '300',
      Urgency: 'high',
    },
    body: bufferToArrayBuffer(encryptedBody),
    cache: 'no-store',
  });

  const responseText = response.ok ? undefined : (await response.text()).slice(0, 500);
  return { ok: response.ok, status: response.status, responseText };
}
