import type { ExperimentalFileOpenOptions } from "@get-bb/plugin-sdk";
import { normalizeExperimentalLiveFileTarget } from "@/lib/live-file-navigation";
import {
  buildAbsoluteFilePath,
  getAbsoluteDirname,
  isAbsoluteFilePathWithinRoot,
  normalizeAbsoluteFilePath,
} from "@/lib/absolute-file-path";
import { buildFilePreviewLeaseContentUrl } from "@/lib/file-content-urls";
import {
  hostRootRelativePath,
  threadHostFileLeaseTarget,
  threadStorageFileLeaseTarget,
  type FileLeaseTarget,
} from "@/lib/file-lease";
import { buildMarkdownFileImageRouting } from "./markdown-file-image-routing";
import type { MarkdownLinkRouting } from "./markdown-link-routing";

type MarkdownDocumentTarget = Exclude<
  NonNullable<ReturnType<typeof normalizeExperimentalLiveFileTarget>>,
  { kind: "host" }
>;

export interface MarkdownDocument {
  rootPath: string;
  target: MarkdownDocumentTarget;
  threadId: string;
}

export function parseMarkdownDocument(
  document: unknown,
): MarkdownDocument | null {
  if (typeof document !== "object" || document === null) return null;
  if (
    !("target" in document) ||
    !("rootPath" in document) ||
    !("threadId" in document)
  )
    return null;
  const target = normalizeExperimentalLiveFileTarget(document.target);
  if (
    target === null ||
    target.kind === "host" ||
    typeof document.rootPath !== "string" ||
    typeof document.threadId !== "string" ||
    !document.threadId.trim() ||
    (target.kind === "thread-storage" && target.threadId !== document.threadId)
  )
    return null;
  const rootPath = normalizeAbsoluteFilePath({ path: document.rootPath });
  if (rootPath === null) return null;
  return { rootPath, target, threadId: document.threadId };
}

export function markdownDocumentFileLeaseTarget(
  document: MarkdownDocument,
): FileLeaseTarget {
  return document.target.kind === "workspace"
    ? threadHostFileLeaseTarget(document.threadId)
    : threadStorageFileLeaseTarget(document.threadId);
}

export function buildMarkdownDocumentLinkRouting({
  document,
  documentFileBaseUrl,
  hostFileBaseUrl,
  messageRouting,
  openFilePreview,
}: {
  document: MarkdownDocument;
  documentFileBaseUrl: string | null;
  hostFileBaseUrl: string | null;
  messageRouting: MarkdownLinkRouting;
  openFilePreview: (intent: ExperimentalFileOpenOptions) => boolean;
}): MarkdownLinkRouting {
  const { rootPath, target } = document;
  const documentPath = buildAbsoluteFilePath({ path: target.path, rootPath });
  const routing =
    documentFileBaseUrl === null
      ? undefined
      : buildMarkdownFileImageRouting({
          path: documentPath,
          rootPath,
          hostFileBaseUrl,
          resolveRelativeSrc: (rootRelativePath, absolutePath) =>
            buildFilePreviewLeaseContentUrl(
              documentFileBaseUrl,
              target.kind === "workspace"
                ? hostRootRelativePath(absolutePath)
                : rootRelativePath,
            ),
        });
  return {
    ...routing,
    onOpenLink: messageRouting.onOpenLink,
    localFile: {
      absoluteLinks: { kind: "trusted-host" },
      relativeLinks: {
        baseDir: getAbsoluteDirname({ path: documentPath }),
        rootPath,
      },
      onOpenLink: (link) => {
        if (
          !isAbsoluteFilePathWithinRoot({ candidatePath: link.path, rootPath })
        ) {
          return messageRouting.localFile?.onOpenLink(link) ?? false;
        }
        return openFilePreview({
          target: {
            ...target,
            path: link.path.slice(rootPath === "/" ? 1 : rootPath.length + 1),
          },
          location:
            link.lineRange === null
              ? null
              : {
                  kind: "range",
                  startLine: link.lineRange.startLineNumber,
                  endLine: link.lineRange.endLineNumber,
                },
        });
      },
    },
  };
}
