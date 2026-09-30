// @vitest-environment jsdom

import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createQueryClientTestHarness } from "@/test/queryClientTestHarness";
import { hostFilePreviewQueryKey } from "./query-keys";
import { HEAVY_PAYLOAD_GC_TIME_MS } from "./query-policies";
import { useHostFilePreview } from "./host-file-preview-query";

const filesSdk = vi.hoisted(() => ({
  createPreview: vi.fn(),
  read: vi.fn(),
}));

vi.mock("@/lib/sdk", () => ({
  sdk: { files: filesSdk },
}));

const fetchMock = vi.fn();

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("useHostFilePreview", () => {
  it("uses a successful preview lease for media without reading or retaining file bytes", async () => {
    filesSdk.createPreview.mockResolvedValue({
      baseUrl: "/api/v1/file-previews/lease-1",
      expiresAtMs: Date.now() + 60_000,
    });
    filesSdk.read.mockResolvedValue({
      path: "/tmp/diagram.png",
      content: "iVBORw0KGgo=",
      contentEncoding: "base64",
      mimeType: "image/png",
      modifiedAtMs: 1,
      sha256: "hash",
      sizeBytes: 8,
    });
    const { queryClient, wrapper } = createQueryClientTestHarness();
    const { result } = renderHook(
      () => useHostFilePreview("host-1", "/tmp/diagram.png"),
      { wrapper },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(filesSdk.createPreview).toHaveBeenCalledTimes(1);
    expect(filesSdk.createPreview).toHaveBeenCalledWith(
      expect.objectContaining({ hostId: "host-1", rootPath: "/" }),
    );
    expect(filesSdk.read).not.toHaveBeenCalled();
    expect(result.current.data).toEqual({
      kind: "image",
      mimeType: "image/png",
      name: "diagram.png",
      path: "/tmp/diagram.png",
      url: "/api/v1/file-previews/lease-1/tmp/diagram.png",
    });
    expect(
      queryClient.getQueryCache().find({
        queryKey: hostFilePreviewQueryKey("host-1", "/tmp/diagram.png"),
      })?.gcTime,
    ).toBe(HEAVY_PAYLOAD_GC_TIME_MS);
  });

  it("renders text from the lease URL without reading through the files API", async () => {
    filesSdk.createPreview.mockResolvedValue({
      baseUrl: "/api/v1/file-previews/lease-2",
      expiresAtMs: Date.now() + 60_000,
    });
    fetchMock.mockResolvedValue(
      new Response("<h1>Report</h1>", {
        headers: { "content-type": "text/html; charset=utf-8" },
      }),
    );
    const { wrapper } = createQueryClientTestHarness();
    const { result } = renderHook(
      () => useHostFilePreview("host-1", "/tmp/report.html"),
      { wrapper },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(filesSdk.read).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      "/api/v1/file-previews/lease-2/tmp/report.html",
    );
    expect(result.current.data).toMatchObject({
      kind: "text",
      content: "<h1>Report</h1>",
      url: "/api/v1/file-previews/lease-2/tmp/report.html",
    });
  });

  it("keeps ambiguous TypeScript paths on the source-preview path", async () => {
    filesSdk.createPreview.mockResolvedValue({
      baseUrl: "/api/v1/file-previews/lease-3",
      expiresAtMs: Date.now() + 60_000,
    });
    fetchMock.mockResolvedValue(
      new Response("export const value = 1;\n", {
        headers: { "content-type": "video/mp2t" },
      }),
    );
    const { wrapper } = createQueryClientTestHarness();
    const { result } = renderHook(
      () => useHostFilePreview("host-1", "/tmp/example.ts"),
      { wrapper },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toMatchObject({
      kind: "text",
      content: "export const value = 1;\n",
    });
  });

  it("fails instead of reading the whole file when no preview lease is available", async () => {
    filesSdk.createPreview.mockRejectedValue(new Error("host unavailable"));
    const { wrapper } = createQueryClientTestHarness();
    const { result } = renderHook(
      () => useHostFilePreview("host-1", "/tmp/archive.zip"),
      { wrapper },
    );

    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(filesSdk.read).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("aborts an active read and releases the heavy cache entry when disabled", async () => {
    let readSignal: AbortSignal | undefined;
    filesSdk.createPreview.mockResolvedValue({
      baseUrl: "/api/v1/file-previews/lease-4",
      expiresAtMs: Date.now() + 60_000,
    });
    fetchMock.mockImplementation(
      (_url: string, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          const signal = init.signal!;
          readSignal = signal;
          signal.addEventListener("abort", () => reject(signal.reason));
        }),
    );
    const { queryClient, wrapper } = createQueryClientTestHarness();
    const { rerender } = renderHook(
      ({ enabled }) =>
        useHostFilePreview("host-1", "/tmp/example.txt", { enabled }),
      { initialProps: { enabled: true }, wrapper },
    );

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const activeQuery = queryClient.getQueryCache().find({
      queryKey: hostFilePreviewQueryKey("host-1", "/tmp/example.txt"),
    });
    expect(activeQuery).toBeDefined();

    vi.useFakeTimers();
    rerender({ enabled: false });
    expect(readSignal?.aborted).toBe(true);
    expect(activeQuery?.getObserversCount()).toBe(0);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(HEAVY_PAYLOAD_GC_TIME_MS + 1);
    });
    expect(
      queryClient.getQueryCache().find({
        queryKey: hostFilePreviewQueryKey("host-1", "/tmp/example.txt"),
      }),
    ).toBeUndefined();
  });
});
