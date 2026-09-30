import { afterEach, describe, expect, it, vi } from "vitest";
import { loadPdfBlob, resolvePdfReadTarget } from "./pdf-source.js";

const ids = {
  threadId: "thr_1",
  environmentId: "env_1",
  projectId: "proj_1",
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("resolvePdfReadTarget", () => {
  it.each([
    {
      source: { kind: "workspace" as const, ...ids },
      path: "docs/a report.pdf",
      expected: {
        relativePath: "docs/a report.pdf",
        source: { kind: "environment", environmentId: "env_1" },
      },
    },
    {
      source: { kind: "host" as const, ...ids },
      path: "/tmp/a report.pdf",
      expected: {
        relativePath: "tmp/a report.pdf",
        source: { kind: "thread-host", threadId: "thr_1" },
      },
    },
    {
      source: { kind: "thread-storage" as const, ...ids },
      path: "exports/a report.pdf",
      expected: {
        relativePath: "exports/a report.pdf",
        source: { kind: "thread-storage", threadId: "thr_1" },
      },
    },
  ])("leases the $source.kind source", ({ source, path, expected }) => {
    expect(resolvePdfReadTarget(path, source)).toEqual(expected);
  });

  it("leases the project source for a project-backed compose preview", () => {
    expect(
      resolvePdfReadTarget("docs/handbook.pdf", {
        kind: "workspace",
        threadId: null,
        environmentId: null,
        projectId: "proj_1",
        experimental_hostId: "host_remote",
      }),
    ).toEqual({
      relativePath: "docs/handbook.pdf",
      source: { kind: "project", projectId: "proj_1", hostId: "host_remote" },
    });
  });
});

describe("loadPdfBlob", () => {
  it("reads the PDF through a lease for its source", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({ baseUrl: "/api/v1/file-previews/lease_1" }),
      )
      .mockResolvedValueOnce(
        new Response(new Uint8Array([37, 80, 68, 70]), {
          headers: { "content-type": "application/pdf" },
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    const blob = await loadPdfBlob(
      {
        relativePath: "docs/a report.pdf",
        source: { kind: "environment", environmentId: "env_1" },
      },
      new AbortController().signal,
    );

    expect(JSON.parse(fetchMock.mock.calls[0]?.[1].body)).toEqual({
      source: { kind: "environment", environmentId: "env_1" },
    });
    expect(fetchMock.mock.calls[1]?.[0]).toBe(
      "/api/v1/file-previews/lease_1/docs/a%20report.pdf",
    );
    expect(blob.type).toBe("application/pdf");
    expect(new Uint8Array(await blob.arrayBuffer())).toEqual(
      new Uint8Array([37, 80, 68, 70]),
    );
  });
});
