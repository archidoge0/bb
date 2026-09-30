import { apiClient, toRelativeUrl } from "./api-server";

function encodePathSegments(path: string): string {
  return path.split("/").map(encodeURIComponent).join("/");
}

export function buildProjectAttachmentContentUrl(
  projectId: string,
  path: string,
): string {
  return toRelativeUrl(
    apiClient.projects[":id"].attachments.content.$url({
      param: { id: projectId },
      query: { path },
    }),
  );
}

export function getFilePreviewLeaseBaseUrl(url: string): string | null {
  return (
    /^((?:https?:\/\/[^/?#]+)?\/api\/v1\/file-previews\/[^/?#]+)(?:\/|$)/u.exec(
      url,
    )?.[1] ?? null
  );
}

export function buildFilePreviewLeaseContentUrl(
  baseUrl: string,
  path: string,
): string {
  return `${baseUrl.replace(/\/+$/u, "")}/${encodePathSegments(path)}`;
}
