import type { PluginFileOpenerSource } from "@get-bb/plugin-sdk/app";

const PDF_MIME_TYPE = "application/pdf";
const FILE_PREVIEW_LEASE_URL = "/api/v1/files/previews";

type PdfLeaseSource =
  | { kind: "environment"; environmentId: string }
  | { kind: "project"; projectId: string; hostId?: string }
  | { kind: "thread-host"; threadId: string }
  | { kind: "thread-storage"; threadId: string };

export interface PdfReadTarget {
  relativePath: string;
  source: PdfLeaseSource;
}

function encodePathSegments(path: string): string {
  return path.split("/").map(encodeURIComponent).join("/");
}

export function resolvePdfReadTarget(
  path: string,
  source: PluginFileOpenerSource,
): PdfReadTarget | null {
  switch (source.kind) {
    case "workspace":
      if (source.environmentId !== null) {
        return {
          relativePath: path,
          source: { kind: "environment", environmentId: source.environmentId },
        };
      }
      if (source.projectId !== null) {
        return {
          relativePath: path,
          source: {
            kind: "project",
            projectId: source.projectId,
            ...(source.experimental_hostId
              ? { hostId: source.experimental_hostId }
              : {}),
          },
        };
      }
      return null;
    case "host":
      return source.threadId === null
        ? null
        : {
            relativePath: path.replace(/^\/+/u, ""),
            source: { kind: "thread-host", threadId: source.threadId },
          };
    case "thread-storage":
      return source.threadId === null
        ? null
        : {
            relativePath: path,
            source: { kind: "thread-storage", threadId: source.threadId },
          };
  }
}

function normalizeMimeType(value: string): string {
  return value.split(";", 1)[0]!.trim().toLowerCase();
}

function requirePdfMimeType(value: string | null): void {
  if (value === null || normalizeMimeType(value) !== PDF_MIME_TYPE) {
    throw new Error("The file response was not a PDF.");
  }
}

async function requireOk(response: Response): Promise<Response> {
  if (!response.ok) {
    throw new Error(`PDF request failed with status ${response.status}.`);
  }
  return response;
}

async function createLeaseBaseUrl(
  source: PdfLeaseSource,
  signal: AbortSignal,
): Promise<string> {
  const response = await requireOk(
    await fetch(FILE_PREVIEW_LEASE_URL, {
      body: JSON.stringify({ source }),
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      method: "POST",
      signal,
    }),
  );
  const lease: unknown = await response.json();
  if (
    typeof lease !== "object" ||
    lease === null ||
    !("baseUrl" in lease) ||
    typeof lease.baseUrl !== "string"
  ) {
    throw new Error("The file preview lease response was invalid.");
  }
  return lease.baseUrl;
}

export async function loadPdfBlob(
  target: PdfReadTarget,
  signal: AbortSignal,
): Promise<Blob> {
  const baseUrl = await createLeaseBaseUrl(target.source, signal);
  const response = await requireOk(
    await fetch(`${baseUrl}/${encodePathSegments(target.relativePath)}`, {
      credentials: "same-origin",
      signal,
    }),
  );
  requirePdfMimeType(response.headers.get("content-type"));
  return response.blob();
}
