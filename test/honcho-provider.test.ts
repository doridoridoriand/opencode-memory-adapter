import { describe, expect, it, vi } from "vitest";
import { HonchoProvider } from "../src/providers/honcho-provider.js";

describe("HonchoProvider", () => {
  it("stores memories as peer-backed session messages", async () => {
    const addPeers = vi.fn().mockResolvedValue(undefined);
    const addMessages = vi.fn().mockResolvedValue(undefined);
    const peerMessage = vi.fn().mockReturnValue({ type: "peer-message" });
    const sdk = {
      peer: vi.fn().mockResolvedValue({ message: peerMessage }),
      session: vi.fn().mockResolvedValue({
        addPeers,
        addMessages,
      }),
    };
    const provider = new HonchoProvider();
    (provider as any).getSdk = vi.fn().mockResolvedValue(sdk);

    const result = await provider.add("Store this", {
      category: "decision",
      source: "unit-test",
    });

    expect(sdk.peer).toHaveBeenCalledWith("opencode-memory-adapter", {
      metadata: { source: "opencode-memory-adapter" },
    });
    expect(sdk.session).toHaveBeenCalledWith(expect.stringMatching(/^memory-/), {
      metadata: {
        category: "decision",
        scope: "global",
        source: "unit-test",
        tags: [],
      },
    });
    expect(addPeers).toHaveBeenCalledTimes(1);
    expect(peerMessage).toHaveBeenCalledWith("Store this", {
      metadata: {
        category: "decision",
        scope: "global",
        source: "unit-test",
        tags: [],
      },
    });
    expect(addMessages).toHaveBeenCalledWith({ type: "peer-message" });
    expect(result.id).toMatch(/^memory-/);
  });

  it("searches with server-side filters and still filters results locally", async () => {
    const sdk = {
      search: vi.fn().mockResolvedValue([
        {
          sessionId: "session-1",
          content: "Keep this project memory",
          metadata: { category: "project", scope: "project" },
        },
        {
          sessionId: "session-2",
          content: "Wrong scope",
          metadata: { category: "project", scope: "global" },
        },
      ]),
    };
    const provider = new HonchoProvider();
    (provider as any).getSdk = vi.fn().mockResolvedValue(sdk);

    const results = await provider.search("project", {
      scope: "project",
      category: "project",
      topK: 3,
    });

    expect(sdk.search).toHaveBeenCalledWith("project", {
      limit: 3,
      filters: {
        metadata: {
          scope: "project",
          category: "project",
        },
      },
    });
    expect(results).toEqual([
      {
        id: "session-1",
        content: "Keep this project memory",
        metadata: {
          category: "project",
          scope: "project",
        },
      },
    ]);
  });

  it("lists sessions while preferring message metadata and only fetching fallback metadata when needed", async () => {
    const firstSession = {
      id: "session-1",
      metadata: { category: "project", scope: "project" },
      messages: vi.fn().mockResolvedValue({
        items: [
          {
            content: "Message metadata wins",
            metadata: { category: "project", scope: "project" },
          },
        ],
      }),
      getMetadata: vi.fn(),
    };
    const secondSession = {
      id: "session-2",
      metadata: { category: "decision", scope: "project" },
      messages: vi.fn().mockResolvedValue({
        items: [
          {
            content: "Session metadata fallback",
            metadata: {},
          },
        ],
      }),
      getMetadata: vi.fn(),
    };
    const thirdSession = {
      id: "session-3",
      metadata: {},
      messages: vi.fn().mockResolvedValue({
        items: [
          {
            content: "Fetched metadata fallback",
            metadata: {},
          },
        ],
      }),
      getMetadata: vi.fn().mockResolvedValue({
        category: "project",
        scope: "global",
      }),
    };
    const fourthSession = {
      id: "session-4",
      metadata: {},
      messages: vi.fn().mockResolvedValue({
        items: [],
      }),
      getMetadata: vi.fn(),
    };
    const sdk = {
      sessions: vi.fn().mockResolvedValue({
        toArray: vi.fn().mockResolvedValue([
          firstSession,
          secondSession,
          thirdSession,
          fourthSession,
        ]),
      }),
    };
    const provider = new HonchoProvider();
    (provider as any).getSdk = vi.fn().mockResolvedValue(sdk);

    const results = await provider.list({
      scope: "project",
      category: "project",
      limit: 10,
    });

    expect(sdk.sessions).toHaveBeenCalledWith({
      size: 10,
      reverse: true,
      filters: {
        metadata: {
          scope: "project",
          category: "project",
        },
      },
    });
    expect(firstSession.getMetadata).not.toHaveBeenCalled();
    expect(secondSession.getMetadata).not.toHaveBeenCalled();
    expect(thirdSession.getMetadata).toHaveBeenCalledTimes(1);
    expect(results).toEqual([
      {
        id: "session-1",
        content: "Message metadata wins",
        metadata: {
          category: "project",
          scope: "project",
        },
      },
    ]);
  });

  it("deletes sessions and summarizes recent search results", async () => {
    const deleteSession = {
      delete: vi.fn().mockResolvedValue(undefined),
    };
    const sdk = {
      session: vi.fn().mockResolvedValue(deleteSession),
    };
    const provider = new HonchoProvider();
    (provider as any).getSdk = vi.fn().mockResolvedValue(sdk);
    vi.spyOn(provider, "search").mockResolvedValue([
      {
        id: "session-1",
        content: "Recent conversation",
        metadata: { category: "conversation", scope: "global" },
      },
      {
        id: "session-2",
        content: "Recent decision",
        metadata: { category: "decision", scope: "project" },
      },
    ]);

    await provider.delete("session-1");
    const summary = await provider.summarize();

    expect(sdk.session).toHaveBeenCalledWith("session-1");
    expect(deleteSession.delete).toHaveBeenCalledTimes(1);
    expect(summary).toBe("[conversation] Recent conversation\n[decision] Recent decision");
  });
});
