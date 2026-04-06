import { describe, it, expect } from "vitest";
import {
  escapeHtml,
  formatPromptMessage,
  formatPromptResolved,
  formatPromptExpired,
  buildPromptKeyboard,
} from "../lib/message-formatter.js";

describe("escapeHtml", () => {
  it("escapes &, <, and >", () => {
    expect(escapeHtml("a & b")).toBe("a &amp; b");
    expect(escapeHtml("<b>bold</b>")).toBe("&lt;b&gt;bold&lt;/b&gt;");
  });

  it("leaves safe characters unchanged", () => {
    expect(escapeHtml("Hello world!")).toBe("Hello world!");
  });
});

describe("formatPromptMessage", () => {
  it("wraps the question in bold HTML", () => {
    const result = formatPromptMessage("Which env?");
    expect(result).toBe("🎛 <b>Which env?</b>");
  });

  it("escapes HTML in the question", () => {
    const result = formatPromptMessage("A & B <test>");
    expect(result).toContain("A &amp; B &lt;test&gt;");
  });
});

describe("formatPromptResolved", () => {
  it("shows question and selected option", () => {
    const result = formatPromptResolved("Which env?", "Staging");
    expect(result).toContain("Which env?");
    expect(result).toContain("✅");
    expect(result).toContain("Staging");
  });
});

describe("formatPromptExpired", () => {
  it("shows question and expired indicator", () => {
    const result = formatPromptExpired("Which env?");
    expect(result).toContain("Which env?");
    expect(result).toContain("⏰");
    expect(result).toContain("Expired");
  });
});

describe("buildPromptKeyboard", () => {
  it("produces one button per row", () => {
    const kb = buildPromptKeyboard("prompt-123", ["Red", "Green", "Blue"]) as any;
    expect(kb.inline_keyboard).toHaveLength(3);
    expect(kb.inline_keyboard[0]).toHaveLength(1);
    expect(kb.inline_keyboard[0][0].text).toBe("Red");
    expect(kb.inline_keyboard[0][0].callback_data).toBe("/tgui prompt-123 0");
  });

  it("uses namespaced callback_data with prompt id and option index", () => {
    const kb = buildPromptKeyboard("abc", ["Yes", "No"]) as any;
    expect(kb.inline_keyboard[0][0].callback_data).toBe("/tgui abc 0");
    expect(kb.inline_keyboard[1][0].callback_data).toBe("/tgui abc 1");
  });
});
