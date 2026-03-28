const MAGIC_BYTES: Record<string, number[][]> = {
  "application/pdf": [[0x25, 0x50, 0x44, 0x46]], // %PDF
  "image/jpeg": [[0xFF, 0xD8, 0xFF]],
  "image/png": [[0x89, 0x50, 0x4E, 0x47]],
  "image/webp": [[0x52, 0x49, 0x46, 0x46]], // RIFF (WebP starts with RIFF....WEBP)
};

export function validateMagicBytes(buffer: ArrayBuffer, expectedType: string): boolean {
  const signatures = MAGIC_BYTES[expectedType];
  if (!signatures) return true; // unknown type, skip validation

  const bytes = new Uint8Array(buffer);
  return signatures.some((sig) =>
    sig.every((byte, i) => bytes[i] === byte)
  );
}
