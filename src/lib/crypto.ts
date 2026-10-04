/**
 * FlareDrop CDN - Military-Grade Web Crypto Engine
 * Native Web Crypto API (SubtleCrypto) - 100% Cloudflare Workers & Node.js 18+ compliant.
 * Zero external npm dependencies.
 */

// Helper: Uint8Array <-> Hex string
export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

export function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes;
}

// Helper: Base64Url <-> Uint8Array
export function base64UrlEncode(bytes: Uint8Array | string): string {
  const str = typeof bytes === 'string' ? bytes : String.fromCharCode(...bytes);
  return btoa(str)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

export function base64UrlDecode(str: string): Uint8Array {
  let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4 !== 0) {
    base64 += '=';
  }
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * 1. PBKDF2 Password Hashing (100,000 iterations, 16-byte random salt, SHA-256)
 * Format: pbkdf2$100000$<saltHex>$<hashHex>
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const enc = new TextEncoder();
  
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    enc.encode(password),
    { name: 'PBKDF2' },
    false,
    ['deriveBits', 'deriveKey']
  );

  const derivedKey = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt,
      iterations: 100000,
      hash: 'SHA-256',
    },
    keyMaterial,
    256 // 32 bytes
  );

  const hashHex = bytesToHex(new Uint8Array(derivedKey));
  const saltHex = bytesToHex(salt);
  return `pbkdf2$100000$${saltHex}$${hashHex}`;
}

/**
 * 2. Timing-Safe PBKDF2 Password Verification
 */
export async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  if (!storedHash || !storedHash.startsWith('pbkdf2$')) {
    // Legacy plaintext fallback check if old dev accounts exist
    return storedHash === password;
  }

  const parts = storedHash.split('$');
  if (parts.length !== 4) return false;

  const iterations = parseInt(parts[1], 10);
  const salt = hexToBytes(parts[2]);
  const expectedHash = hexToBytes(parts[3]);

  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    enc.encode(password),
    { name: 'PBKDF2' },
    false,
    ['deriveBits']
  );

  const derivedKey = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: salt as any,
      iterations,
      hash: 'SHA-256',
    },
    keyMaterial,
    256
  );

  const actualHash = new Uint8Array(derivedKey);
  if (actualHash.length !== expectedHash.length) return false;

  // Constant-time byte comparison to eliminate side-channel timing attacks
  let diff = 0;
  for (let i = 0; i < actualHash.length; i++) {
    diff |= actualHash[i] ^ expectedHash[i];
  }
  return diff === 0;
}

/**
 * 3. HMAC-SHA256 JWT Generation
 */
export async function signJwt(payload: Record<string, any>, secret: string): Promise<string> {
  const enc = new TextEncoder();
  const header = { alg: 'HS256', typ: 'JWT' };

  const encodedHeader = base64UrlEncode(enc.encode(JSON.stringify(header)));
  const encodedPayload = base64UrlEncode(enc.encode(JSON.stringify(payload)));
  const dataToSign = `${encodedHeader}.${encodedPayload}`;

  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const signature = await crypto.subtle.sign('HMAC', key, enc.encode(dataToSign));
  const encodedSignature = base64UrlEncode(new Uint8Array(signature));

  return `${dataToSign}.${encodedSignature}`;
}

/**
 * 4. HMAC-SHA256 JWT Verification & Payload Extraction
 */
export async function verifyJwt(token: string, secret: string): Promise<Record<string, any> | null> {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;

    const [headerB64, payloadB64, signatureB64] = parts;
    const dataToVerify = `${headerB64}.${payloadB64}`;
    const enc = new TextEncoder();

    const key = await crypto.subtle.importKey(
      'raw',
      enc.encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify']
    );

    const signature = base64UrlDecode(signatureB64);
    const isValid = await crypto.subtle.verify('HMAC', key, signature as any, enc.encode(dataToVerify));
    if (!isValid) return null;

    const payloadBytes = base64UrlDecode(payloadB64);
    const payload = JSON.parse(new TextDecoder().decode(payloadBytes));

    // Expiry check
    if (payload.exp && Math.floor(Date.now() / 1000) > payload.exp) {
      return null; // Expired
    }

    return payload;
  } catch {
    return null;
  }
}

/**
 * 5. Scoped API Key Generator & Hasher
 * Format: fd_live_sk_<32_random_hex>
 */
export async function hashApiKey(key: string): Promise<string> {
  const enc = new TextEncoder();
  const digest = await crypto.subtle.digest('SHA-256', enc.encode(key));
  return bytesToHex(new Uint8Array(digest));
}

export async function generateApiKey(name: string): Promise<{
  id: string;
  name: string;
  key: string;
  keyPrefix: string;
  keyHash: string;
  createdAt: string;
}> {
  const randomBytes = crypto.getRandomValues(new Uint8Array(24));
  const hexPart = bytesToHex(randomBytes);
  const key = `fd_live_sk_${hexPart}`;
  const keyPrefix = key.substring(0, 15);
  const keyHash = await hashApiKey(key);
  const id = `key_${Date.now()}`;
  const createdAt = new Date().toISOString();

  return {
    id,
    name: name.trim() || 'Default Upload Key',
    key,
    keyPrefix,
    keyHash,
    createdAt,
  };
}
