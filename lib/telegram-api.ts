// ─────────────────────────────────────────────────────────────────────────────
// telegram-ui · lib/telegram-api.ts
// Telegram Bot API wrapper — only depends on fetch (Node built-in)
// ─────────────────────────────────────────────────────────────────────────────

import type { Logger } from "../types.js";

const API_BASE = "https://api.telegram.org/bot";
const REQUEST_TIMEOUT_MS = 10_000;

interface TgResponse<T = unknown> {
  ok: boolean;
  result?: T;
  description?: string;
  error_code?: number;
}

async function tgFetch<T = unknown>(
  token: string,
  method: string,
  body: Record<string, unknown>,
  log?: Logger,
): Promise<TgResponse<T>> {
  const url = `${API_BASE}${token}/${method}`;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    clearTimeout(timer);

    const data = (await res.json()) as TgResponse<T>;
    if (!data.ok && log) {
      log.warn(`[telegram-api] ${method} failed: ${data.error_code} ${data.description}`);
    }
    return data;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    log?.error(`[telegram-api] ${method} network error: ${msg}`);
    return { ok: false, description: msg };
  }
}

// ─── Public API ─────────────────────────────────────────────────────────────

export class TelegramApi {
  constructor(
    private readonly token: string,
    private readonly log?: Logger,
  ) {}

  /** Verify the bot token and return bot info. */
  async getMe(): Promise<{ ok: true; username: string } | { ok: false; error: string }> {
    const res = await tgFetch<{ username: string }>(this.token, "getMe", {}, this.log);
    if (res.ok && res.result?.username) return { ok: true, username: res.result.username };
    return { ok: false, error: res.description ?? "unknown error" };
  }

  /**
   * Send a message to a chat.
   * Uses HTML parse mode by default; pass plain=true for unformatted text.
   * Returns message_id on success, null on failure.
   */
  async sendMessage(
    chatId: string,
    text: string,
    replyMarkup?: object,
    plain?: boolean,
  ): Promise<number | null> {
    const body: Record<string, unknown> = { chat_id: chatId, text };
    if (!plain) body.parse_mode = "HTML";
    if (replyMarkup) body.reply_markup = replyMarkup;

    const res = await tgFetch<{ message_id: number }>(
      this.token, "sendMessage", body, this.log,
    );
    return res.ok ? (res.result?.message_id ?? null) : null;
  }

  /**
   * Edit the text of an existing message.
   * Optionally attaches an inline keyboard; omitting replyMarkup removes buttons.
   * Uses HTML parse mode.
   */
  async editMessageText(
    chatId: string,
    messageId: number,
    text: string,
    replyMarkup?: object,
  ): Promise<boolean> {
    const body: Record<string, unknown> = {
      chat_id: chatId,
      message_id: messageId,
      text,
      parse_mode: "HTML",
    };
    if (replyMarkup) body.reply_markup = replyMarkup;
    const res = await tgFetch(this.token, "editMessageText", body, this.log);
    return res.ok;
  }

  /** Delete a message. */
  async deleteMessage(chatId: string, messageId: number): Promise<boolean> {
    const res = await tgFetch(
      this.token, "deleteMessage",
      { chat_id: chatId, message_id: messageId },
      this.log,
    );
    return res.ok;
  }

  /** Unpin the current pinned message in a chat. */
  async unpinChatMessage(chatId: string): Promise<boolean> {
    const res = await tgFetch(
      this.token,
      "unpinChatMessage",
      { chat_id: chatId },
      this.log,
    );
    return res.ok;
  }

  /**
   * Pin a message in a chat.
   * Disables notification by default.
   */
  async pinChatMessage(
    chatId: string,
    messageId: number,
    disableNotification = true,
  ): Promise<boolean> {
    const res = await tgFetch(this.token, "pinChatMessage", {
      chat_id: chatId,
      message_id: messageId,
      disable_notification: disableNotification,
    }, this.log);
    return res.ok;
  }

  /**
   * Send a location (map pin) to a chat.
   * Returns message_id on success, null on failure.
   */
  async sendLocation(
    chatId: string,
    latitude: number,
    longitude: number,
  ): Promise<number | null> {
    const res = await tgFetch<{ message_id: number }>(
      this.token, "sendLocation",
      { chat_id: chatId, latitude, longitude },
      this.log,
    );
    return res.ok ? (res.result?.message_id ?? null) : null;
  }

  /**
   * Send an animated dice/slot/dart emoji.
   * Valid emojis: 🎲 🎯 🏀 ⚽ 🎳 🎰
   * Returns message_id on success, null on failure.
   */
  async sendDice(
    chatId: string,
    emoji = "🎲",
  ): Promise<number | null> {
    const res = await tgFetch<{ message_id: number }>(
      this.token, "sendDice",
      { chat_id: chatId, emoji },
      this.log,
    );
    return res.ok ? (res.result?.message_id ?? null) : null;
  }

  /**
   * Add an emoji reaction to a message.
   * Requires Bot API 7.0+ (Telegram 2024+).
   */
  async setMessageReaction(
    chatId: string,
    messageId: number,
    emoji: string,
  ): Promise<boolean> {
    const res = await tgFetch(this.token, "setMessageReaction", {
      chat_id: chatId,
      message_id: messageId,
      reaction: [{ type: "emoji", emoji }],
    }, this.log);
    return res.ok;
  }
}
