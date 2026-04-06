// ─────────────────────────────────────────────────────────────────────────────
// telegram-ui · lib/tag-parser.ts
// Parse [BUTTONS:...] and [REACT:...] tags from agent output
// ─────────────────────────────────────────────────────────────────────────────

import { randomUUID } from "node:crypto";
import type { ParsedTags, PromptInfo, LocationInfo } from "../types.js";

// ─── Patterns ───────────────────────────────────────────────────────────────

// [BUTTONS:Question text|Option A|Option B|Option C]
const RE_BUTTONS = /\[BUTTONS:([^\]]+)\]/;
// [REACT:👍]
const RE_REACT = /\[REACT:([^\]]{1,64})\]/;
// [PIN]
const RE_PIN = /\[PIN\]/;
// [UNPIN]
const RE_UNPIN = /\[UNPIN\]/;
// [LOCATION:lat,lon]
const RE_LOCATION = /\[LOCATION:([^\]]+)\]/;
// [DICE] or [DICE:🎰]
const RE_DICE = /\[DICE(?::([^\]]{1,64}))?\]/;

// Strip all known tags (used to produce cleanText)
const RE_ALL_TAGS = /\[BUTTONS:[^\]]*\]|\[REACT:[^\]]*\]|\[PIN\]|\[UNPIN\]|\[LOCATION:[^\]]*\]|\[DICE(?::[^\]]{1,64})?\]/g;

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
  let pin = false;
  let unpin = false;
  let location: LocationInfo | null = null;
  let dice: string | null = null;

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

  // ── [PIN] ────────────────────────────────────────────────────────────
  if (RE_PIN.test(text)) {
    pin = true;
  }

  // ── [UNPIN] ─────────────────────────────────────────────────────────
  if (RE_UNPIN.test(text)) {
    unpin = true;
  }

  // ── [LOCATION:lat,lon] ──────────────────────────────────────────────
  const locationMatch = text.match(RE_LOCATION);
  if (locationMatch) {
    const parts = locationMatch[1].split(",").map(s => s.trim());
    if (parts.length === 2) {
      const lat = Number(parts[0]);
      const lon = Number(parts[1]);
      if (Number.isFinite(lat) && Number.isFinite(lon)) {
        location = { latitude: lat, longitude: lon };
      }
    }
  }

  // ── [DICE] or [DICE:emoji] ──────────────────────────────────────────
  const diceMatch = text.match(RE_DICE);
  if (diceMatch) {
    dice = diceMatch[1]?.trim() || "🎲";
  }

  // ── Clean text (strip all tags, collapse extra blank lines) ──────────
  const cleanText = text
    .replace(RE_ALL_TAGS, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return { prompt, reaction, pin, unpin, location, dice, cleanText };
}

/** Quick check — returns true if the text contains at least one UI tag. */
export function hasTags(text: string): boolean {
  return RE_BUTTONS.test(text) || RE_REACT.test(text) || RE_PIN.test(text) || RE_UNPIN.test(text) || RE_LOCATION.test(text) || RE_DICE.test(text);
}
