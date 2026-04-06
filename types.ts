// ─────────────────────────────────────────────────────────────────────────────
// telegram-ui · types.ts
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Plugin configuration (from openclaw.json → plugins.entries.telegram-ui.config).
 */
export interface PluginConfig {
  chatId?: string;
  botToken?: string;
  staleMins?: number;
  verbose?: boolean;
}

/**
 * Resolved (validated) configuration with all defaults applied.
 */
export interface ResolvedConfig {
  chatId: string;
  botToken: string;
  staleMins: number;
  verbose: boolean;
}

/**
 * A parsed button prompt from a [BUTTONS:...] tag.
 */
export interface PromptInfo {
  /** UUID generated at parse time */
  id: string;
  /** The question / prompt text shown above the buttons */
  question: string;
  /** The option labels — each becomes one button */
  options: string[];
}

/**
 * A pending button prompt that has been sent to Telegram.
 */
export interface PendingPrompt {
  /** Telegram message_id of the button message */
  messageId: number;
  /** The original prompt info */
  info: PromptInfo;
  /** Unix timestamp (ms) when the message was sent */
  sentAt: number;
}

/**
 * A parsed [LOCATION:lat,lon] tag.
 */
export interface LocationInfo {
  latitude: number;
  longitude: number;
}

/**
 * The result of parsing UI tags out of an agent message.
 */
export interface ParsedTags {
  /** Parsed button prompt, or null if no [BUTTONS:...] tag */
  prompt: PromptInfo | null;
  /** Reaction emoji, or null if no [REACT:...] tag */
  reaction: string | null;
  /** If true, [PIN] tag was present — pin the previous message */
  pin: boolean;
  /** If true, [UNPIN] tag was present — unpin the current pinned message */
  unpin: boolean;
  /** Parsed location, or null if no [LOCATION:...] tag */
  location: LocationInfo | null;
  /** Dice emoji to send, or null if no [DICE] tag (defaults to "🎲") */
  dice: string | null;
  /** Message text with all tags stripped and whitespace trimmed */
  cleanText: string;
}

/**
 * Minimal logger interface matching OpenClaw's plugin logger.
 */
export interface Logger {
  debug?: (message: string) => void;
  info: (message: string) => void;
  warn: (message: string) => void;
  error: (message: string) => void;
}
