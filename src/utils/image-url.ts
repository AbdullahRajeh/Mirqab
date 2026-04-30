export function buildImageUrl(imagePath: string, mediaBaseUrl: string): string {
  const trimmedBase = mediaBaseUrl.replace(/\/+$/, "");
  const trimmedPath = imagePath.replace(/^\/+/, "");
  return `${trimmedBase}/${trimmedPath}`;
}
