import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { fetchGithubMetadata } from "@/lib/github";

// `parseGithubUrl` isn't exported, so its behavior (valid/invalid GitHub URLs,
// owner/repo extraction, `.git` suffix stripping) is exercised indirectly
// through `fetchGithubMetadata`'s public result shape and the request URL it
// builds. `global.fetch` is fully stubbed in every test below, so nothing here
// ever reaches api.github.com.

describe("fetchGithubMetadata", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe("invalid_url (parseGithubUrl-equivalent) paths", () => {
    it("rejects a URL whose host isn't github.com, without touching the network", async () => {
      const result = await fetchGithubMetadata("https://gitlab.com/acme/widgets");

      expect(result).toEqual({
        ok: false,
        reason: "invalid_url",
        message: "Not a recognizable GitHub repository URL.",
      });
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("rejects a github.com URL missing a repo segment", async () => {
      const result = await fetchGithubMetadata("https://github.com/acme-only");

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reason).toBe("invalid_url");
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("rejects a string that isn't a valid URL at all", async () => {
      const result = await fetchGithubMetadata("not a url");

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reason).toBe("invalid_url");
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("strips a trailing .git suffix when building the API request path", async () => {
      // Confirms the owner/repo parsing behavior even though it 404s here.
      fetchMock.mockResolvedValueOnce(new Response(null, { status: 404 }));

      await fetchGithubMetadata("https://github.com/acme/widgets.git");

      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(fetchMock.mock.calls[0][0]).toBe("https://api.github.com/repos/acme/widgets");
    });
  });

  describe("HTTP error paths", () => {
    it("maps a 404 response to not_found", async () => {
      fetchMock.mockResolvedValueOnce(new Response(null, { status: 404 }));

      const result = await fetchGithubMetadata("https://github.com/acme/widgets");

      expect(result).toEqual({
        ok: false,
        reason: "not_found",
        message: "Repository not found or private.",
      });
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it("maps a 403 response to rate_limited", async () => {
      fetchMock.mockResolvedValueOnce(new Response(null, { status: 403 }));

      const result = await fetchGithubMetadata("https://github.com/acme/widgets");

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toBe("rate_limited");
        expect(result.message).toMatch(/rate limit/i);
      }
    });

    it("maps a 429 response to rate_limited", async () => {
      fetchMock.mockResolvedValueOnce(new Response(null, { status: 429 }));

      const result = await fetchGithubMetadata("https://github.com/acme/widgets");

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reason).toBe("rate_limited");
    });

    it("maps a thrown network error to a generic error result", async () => {
      fetchMock.mockRejectedValueOnce(new TypeError("network down"));

      const result = await fetchGithubMetadata("https://github.com/acme/widgets");

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toBe("error");
        expect(result.message).toMatch(/could not reach github/i);
      }
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it("maps another non-ok status (e.g. 500) to a generic error result", async () => {
      fetchMock.mockResolvedValueOnce(new Response(null, { status: 500 }));

      const result = await fetchGithubMetadata("https://github.com/acme/widgets");

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toBe("error");
        expect(result.message).toBe("GitHub API error (500).");
      }
    });
  });
});
