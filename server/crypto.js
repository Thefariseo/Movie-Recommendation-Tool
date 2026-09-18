export function randomSecret() {
  return Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('base64url');
}
export async function hash(value) {
  return Buffer.from(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))).toString('base64url');
}
async function key() {
  const raw = Buffer.from(process.env.INTEGRATION_ENCRYPTION_KEY || '', 'base64');
  if (raw.length !== 32) throw new Error('Integration encryption key must be 32 bytes.');
  return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
}
export async function encrypt(value) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt({
    name: 'AES-GCM',
    iv
  }, await key(), new TextEncoder().encode(JSON.stringify(value)));
  return `${Buffer.from(iv).toString('base64url')}.${Buffer.from(ciphertext).toString('base64url')}`;
}
export async function decrypt(value) {
  const [iv, data] = value.split('.');
  return JSON.parse(new TextDecoder().decode(await crypto.subtle.decrypt({
    name: 'AES-GCM',
    iv: Buffer.from(iv, 'base64url')
  }, await key(), Buffer.from(data, 'base64url'))));
}
