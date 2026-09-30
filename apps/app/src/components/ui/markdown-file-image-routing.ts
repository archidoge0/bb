import type { MarkdownLinkRouting } from "./markdown-link-routing";
import {
  getAbsoluteDirname,
  buildAbsoluteFilePath,
  normalizeAbsoluteFilePath,
} from "@/lib/absolute-file-path";
import {
  buildFilePreviewLeaseContentUrl,
  getFilePreviewLeaseBaseUrl,
} from "@/lib/file-content-urls";
import { hostRootRelativePath } from "@/lib/file-lease";

const ROUTE_ROOT = "/__bb_markdown_file_root__";

export function buildMarkdownFileImageRouting({
  path,
  rootPath,
  hostFileBaseUrl,
  linkRouting,
  resolveRelativeSrc,
}: {
  path: string;
  rootPath: string | null;
  hostFileBaseUrl: string | null;
  linkRouting?: MarkdownLinkRouting;
  resolveRelativeSrc: (
    rootRelativePath: string,
    absolutePath: string,
  ) => string;
}): MarkdownLinkRouting | undefined {
  if (linkRouting?.localImage !== undefined) return linkRouting;
  const root = normalizeAbsoluteFilePath({ path: rootPath ?? ROUTE_ROOT });
  if (root === null) return linkRouting;
  const filePath = buildAbsoluteFilePath({
    path: rootPath === null ? path.replace(/^\/+/, "") : path,
    rootPath: root,
  });
  return {
    ...linkRouting,
    localImage: {
      absolutePaths:
        hostFileBaseUrl === null
          ? { kind: "contained", rootPath: root }
          : { kind: "trusted-host" },
      relativePaths: {
        baseDir: getAbsoluteDirname({ path: filePath }),
        rootPath: root,
      },
      resolveSrc: (image, sourceKind) => {
        if (sourceKind === "absolute" && hostFileBaseUrl !== null) {
          return buildFilePreviewLeaseContentUrl(
            hostFileBaseUrl,
            hostRootRelativePath(image.path),
          );
        }
        return resolveRelativeSrc(
          image.path.slice(root === "/" ? 1 : root.length + 1),
          image.path,
        );
      },
    },
  };
}

export function buildMarkdownLeaseImageRouting({
  path,
  rootPath,
  previewUrl,
}: {
  path: string;
  rootPath: string;
  previewUrl: string | undefined;
}): MarkdownLinkRouting | undefined {
  const baseUrl = getFilePreviewLeaseBaseUrl(previewUrl ?? "");
  if (baseUrl === null) return undefined;
  return buildMarkdownFileImageRouting({
    path,
    rootPath,
    hostFileBaseUrl: null,
    resolveRelativeSrc: (relativePath) =>
      buildFilePreviewLeaseContentUrl(baseUrl, relativePath),
  });
}
