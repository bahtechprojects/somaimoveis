/**
 * Criptografia simetrica para guardar segredos no banco
 * (senha do certificado A1, tokens de API, etc).
 *
 * Algoritmo: AES-256-GCM. Chave deriva do env var ENCRYPTION_KEY usando
 * SHA-256 (32 bytes). IV de 12 bytes randomizado por mensagem.
 *
 * Formato armazenado: base64(iv || authTag || ciphertext)
 */
import crypto from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

function getKey(): Buffer {
  const raw = process.env.ENCRYPTION_KEY;
  if (!raw) {
    throw new Error(
      "ENCRYPTION_KEY nao definida. Adicione no .env (qualquer string com pelo menos 32 chars)",
    );
  }
  return crypto.createHash("sha256").update(raw).digest();
}

/**
 * Criptografa uma string e retorna em base64.
 * Use pra senhas/tokens. Para arquivos, encripta os bytes (Buffer) direto.
 */
export function encryptString(plaintext: string): string {
  const key = getKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, encrypted]).toString("base64");
}

/**
 * Descriptografa uma string previamente cifrada com encryptString.
 */
export function decryptString(ciphertextB64: string): string {
  const key = getKey();
  const data = Buffer.from(ciphertextB64, "base64");
  const iv = data.subarray(0, IV_LENGTH);
  const authTag = data.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const encrypted = data.subarray(IV_LENGTH + AUTH_TAG_LENGTH);
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  const decrypted = Buffer.concat([
    decipher.update(encrypted),
    decipher.final(),
  ]);
  return decrypted.toString("utf8");
}

/**
 * Verifica se a chave de criptografia esta configurada.
 * Use no startup pra falhar cedo se faltar config.
 */
export function isEncryptionConfigured(): boolean {
  return !!process.env.ENCRYPTION_KEY && process.env.ENCRYPTION_KEY.length >= 16;
}
