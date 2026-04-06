// ─────────────────────────────────────────────────────────────────────────────
// telegram-ui · lib/tag-parser.ts
// Parse [BUTTONS:...] and [REACT:...] tags from agent output
// ─────────────────────────────────────────────────────────────────────────────

import { randomUUID } from "node:crypto";
import type { ParsedTags, PromptInfo } from "../types.js";

// ─── Patterns ───────────────────────────────────────────────────────────────

// [BUTTONS:Question text|Option A|Option B|Option C]
const RE_BUTTONS = /\[BUTTONS:([^\]]+)\]/;
// [REACT:👍]
const RE_REACT = /\[REACT:([^\]]{1,64})\]/;

// Strip all known tags (used to produce cleanText)
const RE_ALL_TAGS = /\[BUTTONS:[^\]]*\]|\[REACT:[^\]]*\]/g;

// ─── Public ──────────────────────────────────────────────────────────────────

/**
 * Parse all UI tags from an agent message.
 *
 * Returns the extracted prompt/reaction and the message text with tags removed.
 * If the message contains no tags, cleanText equals the original text and both
 * prompt and reaction are null.
 */
export function parseTags(text: string): ParsedTags {
  let prompt: PromptInfo | null = null;
  let reaction: string | null = null;

  // ── [BUTTONS:question|opt1|opt2|…] ──────────────────────────────────
  const buttonsMatch = text.match(RE_BUTTONS);
  if (buttonsMatch) {
    const parts = buttonsMatch[1].split("|");
    const question = parts[0].trim();
    const options = parts.slice(1).map(o => o.trim()).filter(Boolean);

    if (question && options.length >= 2) {
      prompt = { id: randomUUID(), question, options };
    }
  }

  // ── [REACT:emoji] ────────────────────────────────────────────────────
  const reactMatch = text.match(RE_REACT);
  if (reactMatch) {
    reaction = reactMatch[1].trim();
  }

  // ── Clean text (strip all tags, collapse extra blank lines) ──────────
  const cleanText = text
    .replace(RE_ALL_TAGS, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return { prompt, reaction, cleanText };
}

/** Quick check — returns true if the text contains at least one UI tag. */
export function hasTags(text: string): boolean {
  return RE_BUTTONS.test(text) || RE_REACT.test(text);
}
