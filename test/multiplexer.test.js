import { describe, it, expect, beforeEach } from "vitest";
import { NoneMultiplexer } from "../lib/multiplexer/none.js";
import { getWebhookState } from "../routes/webhooks.js";

describe("multiplexer", () => {
  describe("NoneMultiplexer", () => {
    let mux;
    beforeEach(() => { mux = new NoneMultiplexer(); });

    it("should return correct type", () => {
      expect(mux.getType()).toBe("none");
    });

    it("should report no capabilities", () => {
      const caps = mux.getCapabilities();
      expect(caps.stateDetection).toBe(false);
      expect(caps.notifications).toBe(false);
      expect(caps.embeddedBrowser).toBe(false);
      expect(caps.splitPanes).toBe(false);
    });

    it("hasSession should always return false", async () => {
      expect(await mux.hasSession("test")).toBe(false);
    });

    it("listSessions should return empty array", async () => {
      expect(await mux.listSessions("wb-")).toEqual([]);
    });

    it("capturePane should return null", async () => {
      expect(await mux.capturePane("test", 0, 30)).toBeNull();
    });

    it("getAttachCommand should return empty string", () => {
      expect(mux.getAttachCommand("test")).toBe("");
    });

    it("createSession should not throw", async () => {
      await expect(mux.createSession("test", "/tmp", [{ cmd: "echo" }])).resolves.toBeUndefined();
    });
  });

  describe("TmuxMultiplexer", () => {
    it("should return correct type and capabilities", async () => {
      const { TmuxMultiplexer } = await import("../lib/multiplexer/tmux.js");
      const mux = new TmuxMultiplexer();
      expect(mux.getType()).toBe("tmux");
      const caps = mux.getCapabilities();
      expect(caps.stateDetection).toBe(true);
      expect(caps.splitPanes).toBe(true);
      expect(caps.notifications).toBe(false);
    });

    it("getAttachCommand should return tmux attach command", async () => {
      const { TmuxMultiplexer } = await import("../lib/multiplexer/tmux.js");
      const mux = new TmuxMultiplexer();
      expect(mux.getAttachCommand("wb-ghostty-blue")).toBe("tmux attach -t wb-ghostty-blue");
    });
  });

  describe("CmuxMultiplexer", () => {
    it("should return correct type and capabilities", async () => {
      const { CmuxMultiplexer } = await import("../lib/multiplexer/cmux.js");
      const mux = new CmuxMultiplexer();
      expect(mux.getType()).toBe("cmux");
      const caps = mux.getCapabilities();
      expect(caps.stateDetection).toBe(false);
      expect(caps.notifications).toBe(true);
      expect(caps.embeddedBrowser).toBe(true);
    });

    it("getAttachCommand should return empty string", async () => {
      const { CmuxMultiplexer } = await import("../lib/multiplexer/cmux.js");
      const mux = new CmuxMultiplexer();
      expect(mux.getAttachCommand("test")).toBe("");
    });

    it("capturePane should always return null", async () => {
      const { CmuxMultiplexer } = await import("../lib/multiplexer/cmux.js");
      const mux = new CmuxMultiplexer();
      expect(await mux.capturePane("test", 0, 30)).toBeNull();
    });

    it("hasSession should return false when socket unavailable", async () => {
      const { CmuxMultiplexer } = await import("../lib/multiplexer/cmux.js");
      const mux = new CmuxMultiplexer();
      expect(await mux.hasSession("test")).toBe(false);
    });
  });

  describe("factory", () => {
    it("detectMultiplexer should return a valid type", async () => {
      const { detectMultiplexer } = await import("../lib/multiplexer/index.js");
      const type = detectMultiplexer();
      expect(["tmux", "cmux", "none"]).toContain(type);
    });

    it("getMultiplexer should return an instance", async () => {
      const { getMultiplexer, resetMultiplexer } = await import("../lib/multiplexer/index.js");
      resetMultiplexer();
      const mux = await getMultiplexer();
      expect(mux).toBeDefined();
      expect(typeof mux.getType).toBe("function");
      expect(typeof mux.hasSession).toBe("function");
      expect(typeof mux.createSession).toBe("function");
    });

    it("getMultiplexer should return cached instance", async () => {
      const { getMultiplexer, resetMultiplexer } = await import("../lib/multiplexer/index.js");
      resetMultiplexer();
      const a = await getMultiplexer();
      const b = await getMultiplexer();
      expect(a).toBe(b);
    });
  });

  describe("webhook state", () => {
    it("getWebhookState returns null for unknown color", () => {
      expect(getWebhookState("nonexistent")).toBeNull();
    });
  });
});
