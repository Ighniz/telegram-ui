import { describe, it, expect } from "vitest";
import { parseTags, hasTags } from "../lib/tag-parser.js";

describe("hasTags", () => {
  it("returns false for plain text", () => {
    expect(hasTags("Hello there!")).toBe(false);
  });

  it("detects [BUTTONS:...]", () => {
    expect(hasTags("[BUTTONS:Pick one|A|B]")).toBe(true);
  });

  it("detects [REACT:...]", () => {
    expect(hasTags("[REACT:👍]")).toBe(true);
  });

  it("detects mixed message", () => {
    expect(hasTags("Sure! [REACT:😊]")).toBe(true);
  });

  it("detects [PIN]", () => {
    expect(hasTags("[PIN]")).toBe(true);
  });

  it("detects [UNPIN]", () => {
    expect(hasTags("[UNPIN]")).toBe(true);
  });

  it("detects [LOCATION:lat,lon]", () => {
    expect(hasTags("[LOCATION:40.4168,-3.7038]")).toBe(true);
  });

  it("detects [DICE]", () => {
    expect(hasTags("[DICE]")).toBe(true);
  });
});

describe("parseTags — buttons", () => {
  it("parses a basic button prompt", () => {
    const { prompt, reaction, cleanText } = parseTags("[BUTTONS:Which env?|Dev|Staging|Prod]");
    expect(prompt).not.toBeNull();
    expect(prompt!.question).toBe("Which env?");
    expect(prompt!.options).toEqual(["Dev", "Staging", "Prod"]);
    expect(prompt!.id).toMatch(/^[0-9a-f-]{36}$/); // UUID
    expect(reaction).toBeNull();
    expect(cleanText).toBe("");
  });

  it("trims whitespace from question and options", () => {
    const { prompt } = parseTags("[BUTTONS:  What now?  |  Yes  |  No  ]");
    expect(prompt!.question).toBe("What now?");
    expect(prompt!.options).toEqual(["Yes", "No"]);
  });

  it("rejects a prompt with fewer than 2 options", () => {
    const { prompt } = parseTags("[BUTTONS:Question|Only one option]");
    expect(prompt).toBeNull();
  });

  it("rejects a prompt with no options", () => {
    const { prompt } = parseTags("[BUTTONS:Question only]");
    expect(prompt).toBeNull();
  });

  it("generates a unique id per parse", () => {
    const a = parseTags("[BUTTONS:Q|A|B]");
    const b = parseTags("[BUTTONS:Q|A|B]");
    expect(a.prompt!.id).not.toBe(b.prompt!.id);
  });
});

describe("parseTags — reactions", () => {
  it("parses a reaction-only message", () => {
    const { prompt, reaction, cleanText } = parseTags("[REACT:👍]");
    expect(reaction).toBe("👍");
    expect(prompt).toBeNull();
    expect(cleanText).toBe("");
  });

  it("parses a multi-char emoji reaction", () => {
    const { reaction } = parseTags("[REACT:🙏]");
    expect(reaction).toBe("🙏");
  });

  it("trims whitespace from the emoji", () => {
    const { reaction } = parseTags("[REACT:  ✅  ]");
    expect(reaction).toBe("✅");
  });
});

describe("parseTags — pin, location, and dice", () => {
  it("parses [PIN]", () => {
    const { pin, unpin, location, dice, cleanText } = parseTags("[PIN]");
    expect(pin).toBe(true);
    expect(unpin).toBe(false);
    expect(location).toBeNull();
    expect(dice).toBeNull();
    expect(cleanText).toBe("");
  });

  it("parses [UNPIN]", () => {
    const { pin, unpin, location, dice, cleanText } = parseTags("[UNPIN]");
    expect(pin).toBe(false);
    expect(unpin).toBe(true);
    expect(location).toBeNull();
    expect(dice).toBeNull();
    expect(cleanText).toBe("");
  });

  it("parses a valid [LOCATION:lat,lon]", () => {
    const { location, pin, unpin, dice, cleanText } = parseTags("[LOCATION:40.4168,-3.7038]");
    expect(location).toEqual({ latitude: 40.4168, longitude: -3.7038 });
    expect(pin).toBe(false);
    expect(unpin).toBe(false);
    expect(dice).toBeNull();
    expect(cleanText).toBe("");
  });

  it("rejects invalid [LOCATION:lat,lon] values", () => {
    const { location } = parseTags("[LOCATION:not-a-lat,-3.7038]");
    expect(location).toBeNull();
  });

  it("parses [DICE] with default emoji", () => {
    const { dice, pin, unpin, location, cleanText } = parseTags("[DICE]");
    expect(dice).toBe("🎲");
    expect(pin).toBe(false);
    expect(unpin).toBe(false);
    expect(location).toBeNull();
    expect(cleanText).toBe("");
  });

  it("parses [DICE:🎰] with explicit emoji", () => {
    const { dice } = parseTags("[DICE:🎰]");
    expect(dice).toBe("🎰");
  });
});

describe("parseTags — clean text", () => {
  it("preserves text before a reaction tag", () => {
    const { cleanText, reaction } = parseTags("Got it! [REACT:👍]");
    expect(cleanText).toBe("Got it!");
    expect(reaction).toBe("👍");
  });

  it("preserves text after a buttons tag", () => {
    const { cleanText, prompt } = parseTags("[BUTTONS:Choose|A|B]\nLet me know!");
    expect(cleanText).toBe("Let me know!");
    expect(prompt).not.toBeNull();
  });

  it("collapses excess blank lines left by tag removal", () => {
    const { cleanText } = parseTags("Intro\n\n[REACT:👍]\n\n\nOutro");
    expect(cleanText).not.toMatch(/\n{3,}/);
  });

  it("returns empty string when message is only tags", () => {
    const { cleanText } = parseTags("[REACT:😊][BUTTONS:Q|A|B][PIN][UNPIN][LOCATION:1,2][DICE]");
    expect(cleanText).toBe("");
  });

  it("handles plain text with no tags unchanged", () => {
    const { cleanText } = parseTags("Hello world");
    expect(cleanText).toBe("Hello world");
  });
});

describe("parseTags — combined tags", () => {
  it("parses both reaction and buttons in the same message", () => {
    const { prompt, reaction, cleanText } = parseTags(
      "[REACT:🤔] Hmm, let me ask...\n[BUTTONS:What do you prefer?|Option A|Option B]",
    );
    expect(reaction).toBe("🤔");
    expect(prompt!.question).toBe("What do you prefer?");
    expect(prompt!.options).toEqual(["Option A", "Option B"]);
    expect(cleanText).toBe("Hmm, let me ask...");
  });
});
