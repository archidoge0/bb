import type { QueryClient } from "@tanstack/react-query";
import type { JSX, ReactNode } from "react";
import { ThreadHostFileLeaseProvider } from "@/components/thread/timeline/ThreadHostFileLeaseContext";
import { createQueryClientTestHarness } from "./queryClientTestHarness";

interface FileLeaseTestHarness {
  queryClient: QueryClient;
  wrapper: (props: { children: ReactNode }) => JSX.Element;
}

export function createFileLeaseTestHarness({
  timelineThreadId,
}: {
  timelineThreadId?: string;
}): FileLeaseTestHarness {
  const { queryClient, wrapper: QueryWrapper } = createQueryClientTestHarness();
  return {
    queryClient,
    wrapper: ({ children }) => (
      <QueryWrapper>
        {timelineThreadId === undefined ? (
          children
        ) : (
          <ThreadHostFileLeaseProvider threadId={timelineThreadId}>
            {children}
          </ThreadHostFileLeaseProvider>
        )}
      </QueryWrapper>
    ),
  };
}
