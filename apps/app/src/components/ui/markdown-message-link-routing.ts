import type {
  MarkdownLinkRouting,
  MarkdownLocalFileLinkRouting,
} from "./markdown-link-routing.js";
import type { MarkdownPreviewLinkHandler } from "./markdown-link.js";
import type { MarkdownPreviewLocalFileLinkHandler } from "./markdown-local-file-link.js";
import { buildFilePreviewLeaseContentUrl } from "@/lib/file-content-urls";
import { splitHostFilePath } from "@/lib/file-lease";

interface BuildMarkdownMessageLinkRoutingArgs {
  hostFileBaseUrl: string | null;
  onOpenLink?: MarkdownPreviewLinkHandler;
  onOpenLocalFileLink?: MarkdownPreviewLocalFileLinkHandler;
  workspaceRootPath?: string;
}

export function buildMarkdownMessageLinkRouting({
  hostFileBaseUrl,
  onOpenLink,
  onOpenLocalFileLink,
  workspaceRootPath,
}: BuildMarkdownMessageLinkRoutingArgs): MarkdownLinkRouting | undefined {
  if (
    onOpenLink === undefined &&
    onOpenLocalFileLink === undefined &&
    hostFileBaseUrl === null
  ) {
    return undefined;
  }

  const routing: MarkdownLinkRouting = {};
  if (onOpenLink !== undefined) {
    routing.onOpenLink = onOpenLink;
  }
  if (hostFileBaseUrl !== null) {
    routing.localImage = {
      absolutePaths: { kind: "trusted-host" },
      resolveSrc: ({ path }) =>
        buildFilePreviewLeaseContentUrl(
          hostFileBaseUrl,
          splitHostFilePath(path).relativePath,
        ),
      ...(workspaceRootPath === undefined
        ? {}
        : {
            relativePaths: {
              baseDir: workspaceRootPath,
              rootPath: workspaceRootPath,
            },
          }),
    };
  }
  if (onOpenLocalFileLink !== undefined) {
    const localFile: MarkdownLocalFileLinkRouting = {
      absoluteLinks: { kind: "trusted-host" },
      onOpenLink: onOpenLocalFileLink,
    };
    if (workspaceRootPath !== undefined) {
      localFile.relativeLinks = {
        baseDir: workspaceRootPath,
        rootPath: workspaceRootPath,
      };
    }
    routing.localFile = localFile;
  }
  return routing;
}
