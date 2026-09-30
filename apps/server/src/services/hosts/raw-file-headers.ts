const HTML_MIME_TYPE = "text/html";
const HTML_PREVIEW_CONTENT_TYPE = "text/html; charset=utf-8";
const HTML_PREVIEW_CSP = "sandbox allow-scripts";

interface RawFileMetadata {
  mimeType?: string | null;
}

function isHtmlMimeType(value: string | null | undefined): boolean {
  return value?.split(";")[0]?.trim().toLowerCase() === HTML_MIME_TYPE;
}

export function createRawFileHeaders(file: RawFileMetadata): Headers {
  const headers = new Headers({ "x-content-type-options": "nosniff" });
  if (!isHtmlMimeType(file.mimeType)) {
    return headers;
  }
  headers.set("cache-control", "no-store");
  headers.set("content-security-policy", HTML_PREVIEW_CSP);
  headers.set("content-type", HTML_PREVIEW_CONTENT_TYPE);
  return headers;
}
