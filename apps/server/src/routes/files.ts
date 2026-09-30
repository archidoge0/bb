import path from "node:path";
import { randomUUID } from "node:crypto";
import type { Hono } from "hono";
import {
  publicApiRoutes,
  typedRoutes,
  type CreateFilePreviewRequest,
  type PublicApiSchema,
} from "@bb/server-contract";
import { COMMAND_TIMEOUT_MS } from "../constants.js";
import { ApiError } from "../errors.js";
import { browserRequestProblem } from "../browser-request-guard.js";
import type { AppDeps } from "../types.js";
import type { HostDaemonRpcCommand } from "@bb/host-daemon-contract";
import {
  callHostOnlineRpcForWork,
  callHostRetryableOnlineRpc,
} from "../services/hosts/online-rpc.js";
import {
  createDaemonFileContentResponse,
  requireDaemonFileContentResult,
  remapDaemonFileRouteError,
} from "../services/hosts/daemon-file-response.js";
import { serveDaemonFileStream } from "../services/hosts/daemon-file-stream.js";
import { createRawFileHeaders } from "../services/hosts/raw-file-headers.js";
import {
  assertUsableHostId,
  requirePrimaryHostId,
} from "../services/hosts/primary-host.js";
import {
  requirePublicProject,
  requireReadyEnvironment,
} from "../services/lib/entity-lookup.js";
import { resolveProjectWorkspaceTarget } from "../services/projects/project-workspace.js";
import {
  requireThreadEnvironmentHostId,
  requireThreadStorageTarget,
} from "../services/threads/thread-storage.js";
import {
  DEFAULT_PATH_LIST_EXCLUDE_NAMES,
  WORKSPACE_PATH_LIST_INCLUDE_HIDDEN,
} from "./path-list-policy.js";

const HOST_FILE_LIST_LIMIT_DEFAULT = 1000;

const FILE_PREVIEW_TTL_MS = 10 * 60 * 1000;

interface FilePreviewRoot {
  hostId: string;
  rootPath: string;
  ref: string | null;
}

interface FilePreviewLease extends FilePreviewRoot {
  expiresAtMs: number;
}

function isAbsoluteHostPath(value: string): boolean {
  return path.posix.isAbsolute(value) || path.win32.isAbsolute(value);
}

function normalizeHostPath(value: string): string {
  return path.win32.isAbsolute(value) && !path.posix.isAbsolute(value)
    ? path.win32.normalize(value)
    : path.posix.normalize(value);
}

function joinHostPath(rootPath: string, segments: string[]): string {
  return path.win32.isAbsolute(rootPath) && !path.posix.isAbsolute(rootPath)
    ? path.win32.join(rootPath, ...segments)
    : path.posix.join(rootPath, ...segments);
}

function requireAbsoluteHostRoot(rootPath: string): string {
  if (!isAbsoluteHostPath(rootPath)) {
    throw new ApiError(400, "invalid_path", "rootPath must be absolute", false);
  }
  return normalizeHostPath(rootPath);
}

function filePreviewLeaseKey(root: FilePreviewRoot): string {
  return JSON.stringify([root.hostId, root.rootPath, root.ref]);
}

export function registerFileRoutes(app: Hono, deps: AppDeps): void {
  const { get, post } = typedRoutes<PublicApiSchema>(app, {
    onValidationError: (msg) => new ApiError(400, "invalid_request", msg),
  });
  const fileRoutes = publicApiRoutes.files;
  const previewRoutes = publicApiRoutes.filePreviews;
  const previewLeases = new Map<string, FilePreviewLease>();
  const previewLeaseIdsByKey = new Map<string, string>();

  const resolveHostId = (hostId: string | undefined): string => {
    const resolved = hostId ?? requirePrimaryHostId(deps);
    assertUsableHostId(deps, { hostId: resolved });
    return resolved;
  };

  const requirePrivilegedJsonMutation = (
    context: Parameters<typeof browserRequestProblem>[0],
  ): void => {
    const problem = browserRequestProblem(context, deps, {
      requireJsonForMutation: true,
    });
    if (problem === null) {
      return;
    }
    throw new ApiError(
      problem.status,
      problem.status === 403 ? "forbidden_origin" : "unsupported_media_type",
      problem.error,
      false,
    );
  };

  for (const route of [
    fileRoutes.write,
    fileRoutes.mkdir,
    fileRoutes.move,
    fileRoutes.remove,
  ]) {
    app.use(route.path, async (context, next) => {
      requirePrivilegedJsonMutation(context);
      await next();
    });
  }

  const runHostFileMutation = async <T>(
    hostId: string,
    run: () => Promise<T>,
  ): Promise<T> => {
    try {
      return await run();
    } finally {
      deps.workspaceReadCaches.invalidateHost(hostId);
    }
  };

  const runHostFileMutationCommand = <TCommand extends HostDaemonRpcCommand>(
    hostId: string,
    command: TCommand,
  ) =>
    runHostFileMutation(hostId, () =>
      callHostOnlineRpcForWork(deps, {
        hostId,
        timeoutMs: COMMAND_TIMEOUT_MS,
        command,
      }),
    );

  const withHostFileRoute = async <T>(
    hostIdInput: string | undefined,
    run: (hostId: string) => Promise<T>,
  ): Promise<T> => {
    const hostId = resolveHostId(hostIdInput);
    try {
      return await run(hostId);
    } catch (error) {
      return remapDaemonFileRouteError(error);
    }
  };

  post(fileRoutes.read, (context, payload) =>
    withHostFileRoute(payload.hostId, async (hostId) => {
      const result = await callHostRetryableOnlineRpc(deps, {
        hostId,
        timeoutMs: COMMAND_TIMEOUT_MS,
        command: {
          type: "host.read_file",
          path: payload.path,
          ...(payload.rootPath !== undefined
            ? { rootPath: payload.rootPath }
            : {}),
        },
      });
      return context.json(requireDaemonFileContentResult(result));
    }),
  );

  post(fileRoutes.write, (context, payload) =>
    withHostFileRoute(payload.hostId, async (hostId) => {
      const result = await runHostFileMutationCommand(hostId, {
        type: "host.write_file",
        path: payload.path,
        content: payload.content,
        contentEncoding: payload.contentEncoding ?? "utf8",
        createParents: payload.createParents ?? false,
        ...(payload.rootPath !== undefined
          ? { rootPath: payload.rootPath }
          : {}),
        ...(payload.expectedSha256 !== undefined
          ? { expectedSha256: payload.expectedSha256 }
          : {}),
        ...(payload.mode !== undefined ? { mode: payload.mode } : {}),
      });
      return context.json(result);
    }),
  );

  post(fileRoutes.list, (context, payload) =>
    withHostFileRoute(payload.hostId, async (hostId) => {
      const result = await callHostRetryableOnlineRpc(deps, {
        hostId,
        timeoutMs: COMMAND_TIMEOUT_MS,
        command: {
          type: "host.list_files",
          path: payload.path,
          limit: payload.limit ?? HOST_FILE_LIST_LIMIT_DEFAULT,
          includeHidden:
            payload.includeHidden ?? WORKSPACE_PATH_LIST_INCLUDE_HIDDEN,
          respectGitIgnore: false,
          excludeNames: [
            ...(payload.excludeNames ?? DEFAULT_PATH_LIST_EXCLUDE_NAMES),
          ],
          ...(payload.query !== undefined ? { query: payload.query } : {}),
        },
      });
      return context.json(result);
    }),
  );

  post(fileRoutes.listPaths, (context, payload) =>
    withHostFileRoute(payload.hostId, async (hostId) => {
      const result = await callHostRetryableOnlineRpc(deps, {
        hostId,
        timeoutMs: COMMAND_TIMEOUT_MS,
        command: {
          type: "host.list_paths",
          path: payload.path,
          limit: payload.limit ?? HOST_FILE_LIST_LIMIT_DEFAULT,
          includeFiles: payload.includeFiles,
          includeDirectories: payload.includeDirectories,
          includeHidden:
            payload.includeHidden ?? WORKSPACE_PATH_LIST_INCLUDE_HIDDEN,
          respectGitIgnore: false,
          excludeNames: [
            ...(payload.excludeNames ?? DEFAULT_PATH_LIST_EXCLUDE_NAMES),
          ],
          ...(payload.query !== undefined ? { query: payload.query } : {}),
        },
      });
      return context.json(result);
    }),
  );

  post(fileRoutes.mkdir, (context, payload) =>
    withHostFileRoute(payload.hostId, async (hostId) => {
      const result = await runHostFileMutationCommand(hostId, {
        type: "host.mkdir",
        path: payload.path,
        recursive: payload.recursive ?? false,
        ...(payload.rootPath !== undefined
          ? { rootPath: payload.rootPath }
          : {}),
      });
      return context.json(result);
    }),
  );

  post(fileRoutes.move, (context, payload) =>
    withHostFileRoute(payload.hostId, async (hostId) => {
      const result = await runHostFileMutationCommand(hostId, {
        type: "host.move_path",
        sourcePath: payload.sourcePath,
        destinationPath: payload.destinationPath,
        ...(payload.rootPath !== undefined
          ? { rootPath: payload.rootPath }
          : {}),
      });
      return context.json(result);
    }),
  );

  post(fileRoutes.remove, (context, payload) =>
    withHostFileRoute(payload.hostId, async (hostId) => {
      const result = await runHostFileMutationCommand(hostId, {
        type: "host.remove_path",
        path: payload.path,
        recursive: payload.recursive ?? false,
        ...(payload.rootPath !== undefined
          ? { rootPath: payload.rootPath }
          : {}),
      });
      return context.json(result);
    }),
  );

  const resolveFilePreviewRoot = async (
    payload: CreateFilePreviewRequest,
  ): Promise<FilePreviewRoot> => {
    if (!("source" in payload)) {
      return {
        hostId: resolveHostId(payload.hostId),
        rootPath: requireAbsoluteHostRoot(payload.rootPath),
        ref: null,
      };
    }
    const { source } = payload;
    switch (source.kind) {
      case "thread-storage": {
        const target = await requireThreadStorageTarget(deps, source.threadId);
        return {
          hostId: target.hostId,
          rootPath: target.storagePath,
          ref: null,
        };
      }
      case "thread-host":
        return {
          hostId: requireThreadEnvironmentHostId(deps, source.threadId),
          rootPath: "/",
          ref: null,
        };
      case "environment": {
        const environment = requireReadyEnvironment(
          deps.db,
          source.environmentId,
        );
        return {
          hostId: environment.hostId,
          rootPath: environment.path,
          ref: source.ref ?? null,
        };
      }
      case "project": {
        requirePublicProject(deps.db, source.projectId);
        const target = resolveProjectWorkspaceTarget(deps, {
          projectId: source.projectId,
          ...(source.environmentId !== undefined
            ? { environmentId: source.environmentId }
            : {}),
          ...(source.hostId !== undefined ? { hostId: source.hostId } : {}),
        });
        return { hostId: target.hostId, rootPath: target.path, ref: null };
      }
      default: {
        const exhaustive: never = source;
        return exhaustive;
      }
    }
  };

  post(fileRoutes.createPreview, async (context, payload) => {
    const root = await resolveFilePreviewRoot(payload);
    const now = Date.now();
    for (const [id, lease] of previewLeases) {
      if (lease.expiresAtMs <= now) {
        previewLeases.delete(id);
        previewLeaseIdsByKey.delete(filePreviewLeaseKey(lease));
      }
    }
    const key = filePreviewLeaseKey(root);
    const id = previewLeaseIdsByKey.get(key) ?? randomUUID();
    const expiresAtMs = Math.max(
      now + (payload.ttlMs ?? FILE_PREVIEW_TTL_MS),
      previewLeases.get(id)?.expiresAtMs ?? 0,
    );
    previewLeases.set(id, { ...root, expiresAtMs });
    previewLeaseIdsByKey.set(key, id);
    return context.json({
      baseUrl: `/api/v1/file-previews/${encodeURIComponent(id)}`,
      expiresAtMs,
    });
  });

  get(previewRoutes.content, async (context) => {
    const id = context.req.param("id");
    const lease = previewLeases.get(id);
    if (!lease || lease.expiresAtMs <= Date.now()) {
      previewLeases.delete(id);
      throw new ApiError(404, "not_found", "File preview expired", false);
    }
    const rawPath = context.req.param("filePath").replace(/\\/g, "/");
    const segments = rawPath.split("/");
    if (
      rawPath.startsWith("/") ||
      segments.some(
        (segment) => segment === "" || segment === "." || segment === "..",
      )
    ) {
      throw new ApiError(400, "invalid_path", "Invalid preview path", false);
    }
    const filePath = joinHostPath(lease.rootPath, segments);
    if (lease.ref !== null) {
      const result = await callHostRetryableOnlineRpc(deps, {
        hostId: lease.hostId,
        timeoutMs: COMMAND_TIMEOUT_MS,
        command: {
          type: "host.read_file",
          path: filePath,
          rootPath: lease.rootPath,
          ref: lease.ref,
        },
      }).catch(remapDaemonFileRouteError);
      const content = requireDaemonFileContentResult(result);
      return createDaemonFileContentResponse(content, {
        headers: createRawFileHeaders(content),
        ifNoneMatch: context.req.header("if-none-match"),
      });
    }
    return serveDaemonFileStream(
      deps,
      { hostId: lease.hostId, path: filePath, rootPath: lease.rootPath },
      context.req.raw,
      createRawFileHeaders,
    );
  });
}
