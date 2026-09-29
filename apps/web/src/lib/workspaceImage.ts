// rooms-patches: turns an uploaded picture into a workspace badge image.

/** The badge is 30px (36px in the editor); 96px stays sharp at 3x. */
const WORKSPACE_IMAGE_SIZE = 96;

/** Reads an image file, crops it to a centered square and returns a 96px PNG data URL. */
export async function workspaceImageFromFile(file: File): Promise<string> {
  if (!file.type.startsWith("image/")) throw new Error("Choose an image file.");
  const url = URL.createObjectURL(file);
  try {
    // The load event, not decode(): Chromium defers decode() while the page is hidden.
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image();
      element.addEventListener("load", () => resolve(element), { once: true });
      element.addEventListener("error", () => reject(new Error("That image can't be read.")), {
        once: true,
      });
      element.src = url;
    });
    const side = Math.min(image.naturalWidth, image.naturalHeight);
    if (side === 0) throw new Error("That image can't be read.");
    const canvas = document.createElement("canvas");
    canvas.width = WORKSPACE_IMAGE_SIZE;
    canvas.height = WORKSPACE_IMAGE_SIZE;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("That image can't be read.");
    context.imageSmoothingQuality = "high";
    context.drawImage(
      image,
      (image.naturalWidth - side) / 2,
      (image.naturalHeight - side) / 2,
      side,
      side,
      0,
      0,
      WORKSPACE_IMAGE_SIZE,
      WORKSPACE_IMAGE_SIZE,
    );
    return canvas.toDataURL("image/png");
  } finally {
    URL.revokeObjectURL(url);
  }
}
