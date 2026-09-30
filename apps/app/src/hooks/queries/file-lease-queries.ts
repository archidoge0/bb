import {
  queryOptions,
  useQuery,
  type QueryClient,
} from "@tanstack/react-query";
import { buildFilePreviewLeaseContentUrl } from "@/lib/file-content-urls";
import {
  threadHostFileLeaseTarget,
  type FileLeaseTarget,
} from "@/lib/file-lease";
import { sdk } from "@/lib/sdk";
import { fileLeaseQueryKey } from "./query-keys";

const FILE_LEASE_TTL_MS = 60 * 60 * 1000;
const FILE_LEASE_REFRESH_MS = FILE_LEASE_TTL_MS / 2;

function fileLeaseQueryOptions(target: FileLeaseTarget | null) {
  return queryOptions({
    queryKey: fileLeaseQueryKey(target),
    queryFn: async ({ signal }) => {
      if (target === null) {
        throw new Error("File lease target is missing");
      }
      const lease = await sdk.files.createPreview({
        ...target,
        ttlMs: FILE_LEASE_TTL_MS,
        signal,
      });
      return lease.baseUrl;
    },
    enabled: target !== null,
    staleTime: FILE_LEASE_REFRESH_MS,
    gcTime: FILE_LEASE_REFRESH_MS,
    refetchInterval: FILE_LEASE_REFRESH_MS,
  });
}

export function useFileLeaseBaseUrl(
  target: FileLeaseTarget | null,
): string | null {
  return useQuery(fileLeaseQueryOptions(target)).data ?? null;
}

export function useThreadHostFileBaseUrl(
  threadId: string | null | undefined,
): string | null {
  return useFileLeaseBaseUrl(
    threadId ? threadHostFileLeaseTarget(threadId) : null,
  );
}

export async function fetchFileLeaseUrl(
  queryClient: QueryClient,
  target: FileLeaseTarget,
  relativePath: string,
): Promise<string> {
  const baseUrl = await queryClient.fetchQuery(fileLeaseQueryOptions(target));
  return buildFilePreviewLeaseContentUrl(baseUrl, relativePath);
}
