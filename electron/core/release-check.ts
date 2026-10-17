import { z } from "zod";
import type { ReleaseInfo } from "../../shared/types";

const releases = z.array(
  z.object({
    tag_name: z.string().min(1).max(200),
    name: z.string().nullable(),
    html_url: z.string().url(),
    published_at: z.string().nullable(),
    draft: z.boolean(),
  }),
);

/** Checks the public release feed without sending local project or account data. */
export async function checkForRelease(
  currentVersion: string,
): Promise<ReleaseInfo> {
  const response = await fetch(
    "https://api.github.com/repos/gecut/aether-agent/releases?per_page=10",
    {
      headers: {
        Accept: "application/vnd.github+json",
        "User-Agent": "Aether-Code-Release-Check",
      },
      signal: AbortSignal.timeout(10000),
    },
  );
  if (!response.ok) throw new Error("Could not reach the Aether release feed");
  const release = releases
    .parse(await response.json())
    .find((item) => !item.draft);
  if (!release) throw new Error("No Aether release is published yet");
  const url = new URL(release.html_url);
  if (
    url.hostname !== "github.com" ||
    !url.pathname.startsWith("/gecut/aether-agent/releases/tag/")
  )
    throw new Error(
      "The release feed returned an unexpected download location",
    );
  return {
    currentVersion,
    tag: release.tag_name,
    name: release.name || release.tag_name,
    url: release.html_url,
    ...(release.published_at ? { publishedAt: release.published_at } : {}),
  };
}
