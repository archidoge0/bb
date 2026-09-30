import { normalizeFilePreviewMimeType } from "@bb/client-core";
import { decodeBase64Bytes } from "./base64-bytes";

interface EncodedFileContent {
  content: string;
  contentEncoding: "base64" | "utf8";
  mimeType?: string | null;
}

export function decodeFileContentBytes({
  content,
  contentEncoding,
}: EncodedFileContent): Uint8Array<ArrayBuffer> {
  return contentEncoding === "base64"
    ? decodeBase64Bytes(content)
    : new TextEncoder().encode(content);
}

export function createFileContentBlob(file: EncodedFileContent): Blob {
  return new Blob([decodeFileContentBytes(file)], {
    type: normalizeFilePreviewMimeType(file.mimeType ?? null),
  });
}
