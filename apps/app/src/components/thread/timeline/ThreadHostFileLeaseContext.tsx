import { createContext, useContext, type ReactNode } from "react";
import { useThreadHostFileBaseUrl } from "@/hooks/queries/file-lease-queries";

interface ThreadHostFileLease {
  baseUrl: string | null;
  threadId: string;
}

const ThreadHostFileLeaseContext = createContext<ThreadHostFileLease | null>(
  null,
);

export function ThreadHostFileLeaseProvider({
  children,
  threadId,
}: {
  children: ReactNode;
  threadId: string;
}) {
  const baseUrl = useThreadHostFileBaseUrl(threadId);
  return (
    <ThreadHostFileLeaseContext.Provider value={{ baseUrl, threadId }}>
      {children}
    </ThreadHostFileLeaseContext.Provider>
  );
}

export function useTimelineHostFileBaseUrl(
  threadId: string | null | undefined,
): string | null {
  const lease = useContext(ThreadHostFileLeaseContext);
  return lease !== null && lease.threadId === threadId ? lease.baseUrl : null;
}
