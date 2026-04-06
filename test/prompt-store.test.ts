import { describe, it, expect, vi, beforeEach } from "vitest";
import { PromptStore } from "../lib/prompt-store.js";
import type { PromptInfo } from "../types.js";

function makePrompt(overrides?: Partial<PromptInfo>): PromptInfo {
  return {
    id: "test-id-1234",
    question: "Which color?",
    options: ["Red", "Green", "Blue"],
    ...overrides,
  };
}

describe("PromptStore — core operations", () => {
  let store: PromptStore;

  beforeEach(() => {
    store = new PromptStore(60_000);
  });

  it("starts empty", () => {
    expect(store.pendingCount).toBe(0);
    expect(store.processedCount).toBe(0);
  });

  it("adds a prompt and reports it as pending", () => {
    store.add(makePrompt(), 42);
    expect(store.pendingCount).toBe(1);
    expect(store.has("test-id-1234")).toBe(true);
  });

  it("resolves a prompt and increments processedCount", () => {
    store.add(makePrompt(), 42);
    const entry = store.resolve("test-id-1234");
    expect(entry).not.toBeUndefined();
    expect(entry!.messageId).toBe(42);
    expect(store.pendingCount).toBe(0);
    expect(store.processedCount).toBe(1);
  });

  it("returns undefined when resolving a non-existent id", () => {
    expect(store.resolve("no-such-id")).toBeUndefined();
    expect(store.processedCount).toBe(0);
  });
});

describe("PromptStore — findByOption", () => {
  let store: PromptStore;

  beforeEach(() => {
    store = new PromptStore(60_000);
    store.add(makePrompt({ id: "p1", options: ["Red", "Green", "Blue"] }), 10);
    store.add(makePrompt({ id: "p2", options: ["Yes", "No"] }), 20);
  });

  it("finds a prompt by exact option match", () => {
    const result = store.findByOption("Red");
    expect(result).not.toBeNull();
    expect(result!.promptId).toBe("p1");
  });

  it("finds the second prompt by its option", () => {
    const result = store.findByOption("No");
    expect(result).not.toBeNull();
    expect(result!.promptId).toBe("p2");
  });

  it("returns null for an unknown option", () => {
    expect(store.findByOption("Purple")).toBeNull();
  });

  it("is case-sensitive", () => {
    expect(store.findByOption("red")).toBeNull();
    expect(store.findByOption("RED")).toBeNull();
    expect(store.findByOption("Red")).not.toBeNull();
  });

  it("trims the input before matching", () => {
    expect(store.findByOption("  Green  ")).not.toBeNull();
  });

  it("returns null after the matching prompt is resolved", () => {
    store.resolve("p1");
    expect(store.findByOption("Red")).toBeNull();
  });
});

describe("PromptStore — stale cleanup", () => {
  it("calls onExpired and removes stale entries", () => {
    vi.useFakeTimers();
    const onExpired = vi.fn();
    const store = new PromptStore(1_000, undefined, onExpired);

    store.add(makePrompt(), 99);
    expect(store.pendingCount).toBe(1);

    vi.advanceTimersByTime(1_500);
    store.cleanStale();

    expect(store.pendingCount).toBe(0);
    expect(onExpired).toHaveBeenCalledOnce();
    vi.useRealTimers();
  });

  it("does not remove entries that are not yet stale", () => {
    vi.useFakeTimers();
    const store = new PromptStore(60_000);
    store.add(makePrompt(), 99);

    vi.advanceTimersByTime(30_000);
    store.cleanStale();

    expect(store.pendingCount).toBe(1);
    vi.useRealTimers();
  });
});
