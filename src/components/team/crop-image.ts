export const OUTPUT_WIDTH = 800;
export const OUTPUT_HEIGHT = 1000;

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Could not read image"));
    image.src = src;
  });
}

/** Renders the selected 4:5 region to an 800x1000 JPEG. */
export async function cropToJpeg(
  src: string,
  area: { x: number; y: number; width: number; height: number },
): Promise<Blob> {
  const image = await loadImage(src);
  const canvas = document.createElement("canvas");
  canvas.width = OUTPUT_WIDTH;
  canvas.height = OUTPUT_HEIGHT;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas is not supported");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, OUTPUT_WIDTH, OUTPUT_HEIGHT);
  ctx.drawImage(image, area.x, area.y, area.width, area.height, 0, 0, OUTPUT_WIDTH, OUTPUT_HEIGHT);
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Could not encode photo"))), "image/jpeg", 0.85);
  });
}
