import path from "node:path";
import { ApiError } from "../../errors.js";

const HTML_MIME_TYPE = "text/html";
const HTML_PREVIEW_CONTENT_TYPE = "text/html; charset=utf-8";
const HTML_PREVIEW_CSP = "sandbox allow-scripts";
const HTML_PREVIEW_MAX_BYTES = 5 * 1024 * 1024;

interface RawFileMetadata {
  mimeType?: string | null;
  sizeBytes: number;
}

export function isHtmlMimeType(value: string | null | undefined): boolean {
  return value?.split(";")[0]?.trim().toLowerCase() === HTML_MIME_TYPE;
}

export function createRawFileHeaders(file: RawFileMetadata): Headers {
  const headers = new Headers({ "x-content-type-options": "nosniff" });
  if (!isHtmlMimeType(file.mimeType)) {
    return headers;
  }
  if (file.sizeBytes > HTML_PREVIEW_MAX_BYTES) {
    throw new ApiError(
      413,
      "file_too_large",
      "HTML preview exceeds the 5 MB limit",
      false,
    );
  }
  headers.set("cache-control", "no-store");
  headers.set("content-security-policy", HTML_PREVIEW_CSP);
  headers.set("content-type", HTML_PREVIEW_CONTENT_TYPE);
  return headers;
}

export function hostPathRoot(filePath: string): string {
  return path.win32.isAbsolute(filePath) && !path.posix.isAbsolute(filePath)
    ? path.win32.parse(filePath).root
    : "/";
}
