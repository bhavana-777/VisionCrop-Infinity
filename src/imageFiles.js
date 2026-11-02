const SUPPORTED_MIME_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"];
const SUPPORTED_EXTENSIONS = [".jpg", ".jpeg", ".png", ".webp", ".heic", ".heif"];

export function isSupportedImage(file) {
  const extension = file.name.slice(file.name.lastIndexOf(".")).toLowerCase();
  return SUPPORTED_MIME_TYPES.includes(file.type.toLowerCase()) || SUPPORTED_EXTENSIONS.includes(extension);
}

export function isHeicImage(file) {
  const extension = file.name.slice(file.name.lastIndexOf(".")).toLowerCase();
  return file.type.toLowerCase().includes("heic") || file.type.toLowerCase().includes("heif")
    || extension === ".heic" || extension === ".heif";
}

export async function decodeImageFile(file) {
  if (!isHeicImage(file)) return file;

  const { default: heic2any } = await import("heic2any");
  const result = await heic2any({ blob: file, toType: "image/jpeg", quality: 0.92 });
  const decodedFile = Array.isArray(result) ? result[0] : result;
  if (!(decodedFile instanceof Blob)) {
    throw new Error("This HEIC image could not be decoded. Try a different image.");
  }
  return decodedFile;
}

export async function createImagePreviewURL(file) {
  return URL.createObjectURL(await decodeImageFile(file));
}

export async function loadImage(file) {
  const url = await createImagePreviewURL(file);
  try {
    const image = await new Promise((resolve, reject) => {
      const loadedImage = new Image();
      loadedImage.onload = () => resolve(loadedImage);
      loadedImage.onerror = () => reject(new Error("This image could not be opened. Try a different JPG, PNG, WebP, or HEIC file."));
      loadedImage.src = url;
    });
    return { image, url };
  } catch (error) {
    URL.revokeObjectURL(url);
    throw error;
  }
}
