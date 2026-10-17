import { afterEach, describe, expect, it, vi } from "vitest";
import { checkForRelease } from "../electron/core/release-check";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("checkForRelease", () => {
  it("returns the first published Aether release", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify([
            {
              tag_name: "draft-build",
              name: "Draft build",
              html_url:
                "https://github.com/gecut/aether-agent/releases/tag/draft-build",
              published_at: null,
              draft: true,
            },
            {
              tag_name: "build-42",
              name: null,
              html_url:
                "https://github.com/gecut/aether-agent/releases/tag/build-42",
              published_at: "2026-10-18T10:00:00Z",
              draft: false,
            },
          ]),
          { status: 200 },
        ),
      ),
    );

    await expect(checkForRelease("0.1.9")).resolves.toEqual({
      currentVersion: "0.1.9",
      tag: "build-42",
      name: "build-42",
      url: "https://github.com/gecut/aether-agent/releases/tag/build-42",
      publishedAt: "2026-10-18T10:00:00Z",
    });
  });

  it("rejects a release URL outside the Aether repository", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify([
            {
              tag_name: "build-42",
              name: "build-42",
              html_url: "https://example.com/download",
              published_at: null,
              draft: false,
            },
          ]),
          { status: 200 },
        ),
      ),
    );

    await expect(checkForRelease("0.1.9")).rejects.toThrow(
      "unexpected download location",
    );
  });
});
