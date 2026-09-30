import type { EnvironmentFilePreviewSource } from "@bb/client-core";
import type { FilePreviewSource } from "@bb/server-contract";

export type FileLeaseTarget =
  | { hostId: string; rootPath: string }
  | { source: FilePreviewSource };

export function environmentFileLeaseTarget(
  environmentId: string,
  source: EnvironmentFilePreviewSource,
): FileLeaseTarget {
  switch (source.kind) {
    case "working-tree":
      return { source: { kind: "environment", environmentId } };
    case "head":
      return { source: { kind: "environment", environmentId, ref: "HEAD" } };
    case "merge-base":
      return {
        source: { kind: "environment", environmentId, ref: source.ref },
      };
    default: {
      const exhaustive: never = source;
      return exhaustive;
    }
  }
}

export interface ProjectFileRouting {
  environmentId: string | null;
  hostId: string | null;
}

export function projectFileLeaseTarget(
  projectId: string,
  routing: ProjectFileRouting,
): FileLeaseTarget {
  if (routing.environmentId !== null) {
    return {
      source: {
        kind: "project",
        projectId,
        environmentId: routing.environmentId,
      },
    };
  }
  return routing.hostId !== null
    ? { source: { kind: "project", projectId, hostId: routing.hostId } }
    : { source: { kind: "project", projectId } };
}

export function threadHostFileLeaseTarget(threadId: string): FileLeaseTarget {
  return { source: { kind: "thread-host", threadId } };
}

export function threadStorageFileLeaseTarget(
  threadId: string,
): FileLeaseTarget {
  return { source: { kind: "thread-storage", threadId } };
}

export function splitHostFilePath(absolutePath: string): {
  relativePath: string;
  rootPath: string;
} {
  if (/^[A-Za-z]:[\\/]/u.test(absolutePath)) {
    return {
      relativePath: absolutePath.slice(3).replace(/\\/gu, "/"),
      rootPath: `${absolutePath.slice(0, 2)}\\`,
    };
  }
  return { relativePath: absolutePath.replace(/^\/+/u, ""), rootPath: "/" };
}
