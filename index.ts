// ─────────────────────────────────────────────────────────────────────────────
// telegram-ui · index.ts (v1.0.0)
// Plugin entry point — orchestration only, all logic lives in lib/
//
// Gives agents two Telegram UI primitives:
//   [BUTTONS:Question|Option A|Option B]  → inline keyboard prompt
//   [REACT:👍]                            → emoji reaction on last user message
//
// Tags can appear anywhere in an agent message (alone or alongside text).
// When tags are detected the original message is suppressed; any remaining
// text is forwarded to Telegram directly so the agent's intent is preserved.
// ─────────────────────────────────────────────────────────────────────────────

import type { Logger, PluginConfig, ResolvedConfig, PromptInfo, PendingPrompt } from "./types.js";
import { TelegramApi } from "./lib/telegram-api.js";
import { PromptStore } from "./lib/prompt-store.js";
import { parseTags, hasTags } from "./lib/tag-parser.js";
import {
  escapeHtml,
  formatPromptMessage,
  formatPromptResolved,
  formatPromptExpired,
  buildPromptKeyboard,
  formatStatus,
} from "./lib/message-formatter.js";

// ── Constants ────────────────────────────────────────────────────────────────

const PLUGIN_VERSION = "1.0.0";
const TAG = "telegram-ui";

// ── Config resolution ────────────────────────────────────────────────────────

function resolveConfig(
  pluginCfg: PluginConfig,
  telegramCfg: { token?: string; botToken?: string; allowFrom?: (string | number)[] },
  env: { TELEGRAM_BOT_TOKEN?: string; TELEGRAM_CHAT_ID?: string },
  log: Logger,
): ResolvedConfig | null {
  const botToken =
    pluginCfg.botToken ||
    telegramCfg.token ||
    telegramCfg.botToken ||
    env.TELEGRAM_BOT_TOKEN ||
    "";

  let chatId = pluginCfg.chatId || env.TELEGRAM_CHAT_ID || "";

  if (!chatId && Array.isArray(telegramCfg.allowFrom)) {
    const first = telegramCfg.allowFrom[0];
    const candidate = String(first ?? "");
    if (/^-?\d+$/.test(candidate)) {
      chatId = candidate;
      log.info(`[${TAG}] auto-resolved chatId from channels.telegram.allowFrom: ${chatId}`);
    }
  }

  if (!botToken || !chatId) {
    log.error(`[${TAG}] disabled — missing ${!botToken ? "botToken" : "chatId"}`);
    return null;
  }

  const staleMins =
    typeof pluginCfg.staleMins === "number" && pluginCfg.staleMins > 0
      ? pluginCfg.staleMins
      : 30;

  return { chatId, botToken, staleMins, verbose: pluginCfg.verbose === true };
}

// ── Plugin registration ──────────────────────────────────────────────────────

function register(api: any): void {
  const log: Logger = api.logger;
  const startedAt = Date.now();

  // ─── 1. Resolve config ────────────────────────────────────────────────

  const config = resolveConfig(
    api.pluginConfig ?? {},
    api.config?.channels?.telegram ?? {},
    {
      TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN,
      TELEGRAM_CHAT_ID: process.env.TELEGRAM_CHAT_ID,
    },
    log,
  );

  if (!config) {
    log.warn(`[${TAG}] v${PLUGIN_VERSION} loaded (DISABLED — not configured)`);
    return;
  }

  // ─── 2. Initialize API client and store ──────────────────────────────

  const tg = new TelegramApi(config.botToken, config.verbose ? log : undefined);

  // Last Telegram message_id received from the user (for reactions).
  let lastUserMessageId: number | null = null;

  const store = new PromptStore(
    config.staleMins * 60_000,
    config.verbose ? log : undefined,
    // onExpired: edit the prompt message to show it timed out
    (entry) => {
      tg.editMessageText(
        config.chatId,
        entry.messageId,
        formatPromptExpired(entry.info.question),
      ).catch(() => {});
    },
  );

  const recentlyHandled = new Map<string, { prompt?: PendingPrompt; cleanText?: string; at: number }>();
  const RECENTLY_HANDLED_TTL_MS = 2 * 60_000;

  const pruneRecentlyHandled = () => {
    const now = Date.now();
    for (const [key, value] of recentlyHandled) {
      if (now - value.at > RECENTLY_HANDLED_TTL_MS) {
        recentlyHandled.delete(key);
      }
    }
  };

  const buildHandledKey = (content: string): string => content.trim();

  // ─── 3. Background service (cleanup timer + startup check) ───────────

  api.registerService({
    id: `${TAG}-cleanup`,
    start: async () => {
      store.start();
      const me = await tg.getMe();
      if (me.ok) {
        log.info(`[${TAG}] Telegram connected → @${me.username}`);
      } else {
        log.warn(`[${TAG}] Telegram unreachable on startup: ${me.error}`);
      }
    },
    stop: () => store.stop(),
  });

  // ─── 4. /uistatus command ─────────────────────────────────────────────

  api.registerCommand({
    name: "uistatus",
    description: "Show Telegram UI plugin health and stats",
    acceptsArgs: false,
    requireAuth: true,
    handler: async () => {
      const me = await tg.getMe();
      return {
        text: formatStatus({
          ok: me.ok,
          chatId: !!config.chatId,
          token: !!config.botToken,
          reachable: me.ok,
          botUsername: me.ok ? me.username : undefined,
          telegramError: me.ok ? undefined : me.error,
          pending: store.pendingCount,
          totalProcessed: store.processedCount,
          uptime: Date.now() - startedAt,
        }),
      };
    },
  });

  // ─── 5. message_sending — intercept [BUTTONS:…] and [REACT:…] tags ──

  api.on(
    "message_sending",
    async (
      event: { content?: string; metadata?: Record<string, unknown> },
      ctx: { channelId: string },
    ): Promise<{ cancel: true } | void> => {
      if (ctx.channelId !== "telegram") return;

      const content = typeof event.content === "string" ? event.content : "";
      log.info(`[${TAG}] message_sending fired — channel=${ctx.channelId} len=${content.length} hasTags=${hasTags(content)}`);
      if (!content || !hasTags(content)) return;
      log.info(`[${TAG}] intercepting message with tags`);

      try {
        log.info(`[${TAG}] parsing tags`);
        const { prompt, reaction, cleanText } = parseTags(content);
        const handledKey = buildHandledKey(content);
        pruneRecentlyHandled();
        log.info(
          `[${TAG}] parsed tags — prompt=${prompt ? "yes" : "no"} reaction=${reaction ? "yes" : "no"} cleanTextLen=${cleanText.length}`,
        );

        // Send the button prompt if present
        let pendingPrompt: PendingPrompt | undefined;
        if (prompt) {
          log.info(
            `[${TAG}] sending prompt — id=${prompt.id.slice(0, 8)}… options=${prompt.options.length}`,
          );
          const messageId = await tg.sendMessage(
            config.chatId,
            formatPromptMessage(prompt.question),
            buildPromptKeyboard(prompt.id, prompt.options),
          );
          log.info(`[${TAG}] prompt send completed — messageId=${messageId ?? "null"}`);

          if (messageId !== null) {
            log.info(`[${TAG}] storing prompt — id=${prompt.id.slice(0, 8)}… msg=${messageId}`);
            store.add(prompt, messageId);
            pendingPrompt = { messageId, info: prompt, sentAt: Date.now() };
            log.info(
              `[${TAG}] intercepted [BUTTONS] → sent prompt ${prompt.id.slice(0, 8)}… ` +
              `(${prompt.options.length} options, msg=${messageId})`,
            );
          } else {
            log.warn(`[${TAG}] intercepted [BUTTONS] but send failed — dropping`);
          }
        }

        // Apply emoji reaction if present
        if (reaction) {
          log.info(`[${TAG}] applying reaction — emoji=${reaction}`);
          if (lastUserMessageId !== null) {
            const ok = await tg.setMessageReaction(config.chatId, lastUserMessageId, reaction);
            if (ok) log.info(`[${TAG}] intercepted [REACT:${reaction}] on msg=${lastUserMessageId}`);
            else log.warn(`[${TAG}] intercepted [REACT:${reaction}] but reaction failed`);
          } else {
            log.warn(`[${TAG}] intercepted [REACT:${reaction}] but no user message_id captured yet`);
          }
        }

        // Forward any remaining text
        if (cleanText) {
          log.info(`[${TAG}] forwarding clean text — len=${cleanText.length}`);
          const forwardedId = await tg.sendMessage(config.chatId, escapeHtml(cleanText), undefined, true);
          log.info(`[${TAG}] clean text forwarded — messageId=${forwardedId ?? "null"}`);
        }

        recentlyHandled.set(handledKey, { prompt: pendingPrompt, cleanText, at: Date.now() });
        log.info(`[${TAG}] intercept completed successfully`);
        return { cancel: true };
      } catch (error: unknown) {
        const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
        log.error(`[${TAG}] intercept failed: ${message}`);
        throw error;
      }
    },
  );

  api.on(
    "message_sent",
    async (
      event: { content?: string; success?: boolean; error?: string },
      ctx: { channelId: string },
    ) => {
      if (ctx.channelId !== "telegram") return;

      const content = typeof event.content === "string" ? event.content : "";
      if (!content || !hasTags(content)) return;

      pruneRecentlyHandled();
      const handledKey = buildHandledKey(content);
      if (recentlyHandled.has(handledKey)) {
        if (config.verbose) log.info(`[${TAG}] message_sent fallback skipped — already handled`);
        return;
      }

      log.warn(`[${TAG}] message_sent fallback engaged — tags escaped message_sending interception`);
      const { prompt, reaction, cleanText } = parseTags(content);

      if (prompt) {
        const messageId = await tg.sendMessage(
          config.chatId,
          formatPromptMessage(prompt.question),
          buildPromptKeyboard(prompt.id, prompt.options),
        );

        if (messageId !== null) {
          store.add(prompt, messageId);
          log.info(
            `[${TAG}] fallback sent [BUTTONS] prompt ${prompt.id.slice(0, 8)}… ` +
            `(${prompt.options.length} options, msg=${messageId})`,
          );
        } else {
          log.warn(`[${TAG}] fallback [BUTTONS] send failed`);
        }
      }

      if (reaction) {
        if (lastUserMessageId !== null) {
          const ok = await tg.setMessageReaction(config.chatId, lastUserMessageId, reaction);
          if (ok) log.info(`[${TAG}] fallback [REACT:${reaction}] on msg=${lastUserMessageId}`);
          else log.warn(`[${TAG}] fallback [REACT:${reaction}] failed`);
        } else {
          log.warn(`[${TAG}] fallback [REACT:${reaction}] but no user message_id captured yet`);
        }
      }

      if (cleanText) {
        await tg.sendMessage(config.chatId, escapeHtml(cleanText), undefined, true);
      }

      recentlyHandled.set(handledKey, { cleanText, at: Date.now() });
    },
  );

  // ─── 6. message_received — capture message_id + resolve button taps ───

  api.on(
    "message_received",
    async (
      event: {
        content: string;
        messageId?: string | number;
        metadata?: Record<string, unknown>;
      },
      ctx: { channelId: string },
    ) => {
      if (ctx.channelId !== "telegram") return;

      // Capture the user's message_id so reactions can target it.
      const rawId =
        event.messageId ??
        event.metadata?.message_id ??
        event.metadata?.messageId;

      if (rawId !== undefined) {
        const parsed = Number(rawId);
        if (Number.isFinite(parsed)) {
          lastUserMessageId = parsed;
          if (config.verbose) log.info(`[${TAG}] captured user message_id=${parsed}`);
        }
      }

      // If the incoming text resolves a pending button prompt, update it.
      // Preferred callback shape: /tgui <promptId> <optionIndex>
      // Fallbacks: callback_data: /tgui <promptId> <optionIndex> or plain option text.
      const rawContent = event.content.trim();
      const content = rawContent.startsWith("callback_data:")
        ? rawContent.slice("callback_data:".length).trim()
        : rawContent;
      if (!content || store.pendingCount === 0) return;

      let promptId: string | null = null;
      let selected: string | null = null;
      let entry: { messageId: number; info: PromptInfo; sentAt: number } | null = null;

      const callbackMatch = content.match(/^\/tgui\s+(\S+)\s+(\d+)$/);
      if (callbackMatch) {
        const candidatePromptId = callbackMatch[1];
        const optionIndex = Number(callbackMatch[2]);
        const pending = store.resolve(candidatePromptId);
        if (!pending) return;
        const option = pending.info.options[optionIndex];
        if (typeof option !== "string") return;
        promptId = candidatePromptId;
        selected = option;
        entry = pending;
      } else {
        const match = store.findByOption(content);
        if (!match) return;
        promptId = match.promptId;
        selected = content;
        entry = store.resolve(match.promptId) ?? match.entry;
      }

      if (!promptId || !selected || !entry) return;

      log.info(`[${TAG}] resolved prompt ${promptId.slice(0, 8)}… → "${selected}"`);

      await tg.editMessageText(
        config.chatId,
        entry.messageId,
        formatPromptResolved(entry.info.question, selected),
      );
    },
  );

  // ─── 7. Explicit tools — reliable assistant-callable Telegram UI actions ─

  api.registerTool({
    name: "telegram_ui_buttons",
    label: "Telegram UI Buttons",
    description: "Send a Telegram inline-button prompt to the configured chat. Supports an optional follow-up text message.",
    parameters: {
      type: "object",
      properties: {
        question: { type: "string", description: "Question shown above the buttons." },
        options: {
          type: "array",
          description: "Button labels. One inline button per option.",
          items: { type: "string" },
          minItems: 2,
        },
        follow_up_text: {
          type: "string",
          description: "Optional plain text to send after the button prompt.",
        },
      },
      required: ["question", "options"],
      additionalProperties: false,
    },
    async execute(_toolCallId: string, params: { question?: unknown; options?: unknown; follow_up_text?: unknown }) {
      const question = typeof params.question === "string" ? params.question.trim() : "";
      const options = Array.isArray(params.options)
        ? params.options.filter((v): v is string => typeof v === "string").map(v => v.trim()).filter(Boolean)
        : [];
      const followUpText = typeof params.follow_up_text === "string" ? params.follow_up_text.trim() : "";

      if (!question) {
        return {
          content: [{ type: "text", text: JSON.stringify({ ok: false, error: "question is required" }, null, 2) }],
          details: { ok: false, error: "question is required" },
        };
      }
      if (options.length < 2) {
        return {
          content: [{ type: "text", text: JSON.stringify({ ok: false, error: "at least 2 options are required" }, null, 2) }],
          details: { ok: false, error: "at least 2 options are required" },
        };
      }

      const prompt: PromptInfo = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
        question,
        options,
      };

      const messageId = await tg.sendMessage(
        config.chatId,
        formatPromptMessage(prompt.question),
        buildPromptKeyboard(prompt.id, prompt.options),
      );

      if (messageId === null) {
        return {
          content: [{ type: "text", text: JSON.stringify({ ok: false, error: "failed to send button prompt" }, null, 2) }],
          details: { ok: false, error: "failed to send button prompt" },
        };
      }

      store.add(prompt, messageId);
      log.info(
        `[${TAG}] tool sent button prompt ${prompt.id.slice(0, 8)}… ` +
        `(${prompt.options.length} options, msg=${messageId})`,
      );

      let followUpMessageId: number | null = null;
      if (followUpText) {
        followUpMessageId = await tg.sendMessage(config.chatId, escapeHtml(followUpText), undefined, true);
      }

      const payload = {
        ok: true,
        question,
        options,
        messageId,
        ...(followUpMessageId !== null ? { followUpMessageId } : {}),
      };

      return {
        content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
        details: payload,
      };
    },
  }, { name: "telegram_ui_buttons" });

  api.registerTool({
    name: "telegram_ui_react",
    label: "Telegram UI React",
    description: "React to the last inbound Telegram user message with an emoji.",
    parameters: {
      type: "object",
      properties: {
        emoji: { type: "string", description: "Telegram emoji reaction to apply." },
      },
      required: ["emoji"],
      additionalProperties: false,
    },
    async execute(_toolCallId: string, params: { emoji?: unknown }) {
      const emoji = typeof params.emoji === "string" ? params.emoji.trim() : "";

      if (!emoji) {
        return {
          content: [{ type: "text", text: JSON.stringify({ ok: false, error: "emoji is required" }, null, 2) }],
          details: { ok: false, error: "emoji is required" },
        };
      }

      if (lastUserMessageId === null) {
        return {
          content: [{ type: "text", text: JSON.stringify({ ok: false, error: "no inbound Telegram message_id captured yet" }, null, 2) }],
          details: { ok: false, error: "no inbound Telegram message_id captured yet" },
        };
      }

      const ok = await tg.setMessageReaction(config.chatId, lastUserMessageId, emoji);
      const payload = ok
        ? { ok: true, emoji, messageId: lastUserMessageId }
        : { ok: false, emoji, messageId: lastUserMessageId, error: "reaction request failed" };

      if (ok) log.info(`[${TAG}] tool reacted ${emoji} to message_id=${lastUserMessageId}`);
      else log.warn(`[${TAG}] tool reaction ${emoji} failed for message_id=${lastUserMessageId}`);

      return {
        content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
        details: payload,
      };
    },
  }, { name: "telegram_ui_react" });

  // ─── Done ────────────────────────────────────────────────────────────

  if (config.verbose) {
    log.info(`[${TAG}] verbose logging enabled`);
  }
  log.info(`[${TAG}] v${PLUGIN_VERSION} loaded ✓`);
}

// ── Plugin export ────────────────────────────────────────────────────────────

export default {
  id: "telegram-ui",
  name: "Telegram UI",
  description:
    "Gives agents Telegram UI tools: inline button prompts and message reactions.",
  version: PLUGIN_VERSION,
  kind: "extension" as const,
  register,
};
