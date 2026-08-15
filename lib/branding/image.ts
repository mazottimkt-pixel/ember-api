export type ValidatedLogo = { bytes: Uint8Array; mimeType: "image/png" | "image/jpeg"; extension: "png" | "jpg"; width: number; height: number; hasTransparency: boolean; extremeAspectRatio: boolean; small: boolean };
const MAX_LOGO_BYTES = 5 * 1024 * 1024;

function png(bytes: Uint8Array) {
  const signature = [137, 80, 78, 71, 13, 10, 26, 10];
  if (!signature.every((value, index) => bytes[index] === value) || bytes.length < 33) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return { width: view.getUint32(16), height: view.getUint32(20), hasTransparency: [4, 6].includes(bytes[25]) };
}
function jpeg(bytes: Uint8Array) {
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  let offset = 2;
  while (offset + 9 < bytes.length) {
    if (bytes[offset] !== 0xff) { offset += 1; continue; }
    const marker = bytes[offset + 1];
    const length = (bytes[offset + 2] << 8) + bytes[offset + 3];
    if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker))
      return { height: (bytes[offset + 5] << 8) + bytes[offset + 6], width: (bytes[offset + 7] << 8) + bytes[offset + 8], hasTransparency: false };
    if (length < 2) break;
    offset += length + 2;
  }
  return null;
}

export async function validateLogo(file: File): Promise<ValidatedLogo> {
  if (!file.size) throw new Error("BRANDING_LOGO_EMPTY");
  if (file.size > MAX_LOGO_BYTES) throw new Error("BRANDING_LOGO_TOO_LARGE");
  if (!['image/png', 'image/jpeg'].includes(file.type)) throw new Error("BRANDING_LOGO_TYPE_INVALID");
  const bytes = new Uint8Array(await file.arrayBuffer());
  const info = png(bytes) ?? jpeg(bytes);
  if (!info) throw new Error("BRANDING_LOGO_CORRUPTED");
  if (!info.width || !info.height || info.width > 12000 || info.height > 12000) throw new Error("BRANDING_LOGO_DIMENSIONS_INVALID");
  const ratio = Math.max(info.width / info.height, info.height / info.width);
  return { bytes, mimeType: file.type as "image/png" | "image/jpeg", extension: file.type === "image/png" ? "png" : "jpg",
    ...info, extremeAspectRatio: ratio > 8, small: info.width < 80 || info.height < 40 };
}
