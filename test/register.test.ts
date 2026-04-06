// ─────────────────────────────────────────────────────────────────────────────
// telegram-ui · test/register.test.ts
// Integration tests for the plugin register() function
//
// Mocks the OpenClaw plugin API surface and the Telegram Bot API (fetch) to
// verify that message_sending interception, message_received resolution,
// and the explicit tools all work correctly end-to-end.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach } from "vitest";
import plugin from "../index.js";

// ── Mock API scaffolding ─────────────────────────────────────────────────────

interface MockApi {
  logger: { info: ReturnType<typeof vi.fn>; warn: ReturnType<typeof vi.fn>; error: ReturnType<typeof vi.fn>; debug: ReturnType<typeof vi.fn> };
  pluginConfig: Record<string, unknown>;
  config: { channels: { telegram: { token: string; allowFrom: (string | number)[] } } };
  registerService: ReturnType<typeof vi.fn>;
  registerCommand: ReturnType<typeof vi.fn>;
  registerTool: ReturnType<typeof vi.fn>;
  on: ReturnType<typeof vi.fn>;
  _handlers: Record<string, Function>;
  _tools: Record<string, { execute: Function }>;
}

function createMockApi(overrides?: Partial<Pick<MockApi, "pluginConfig" | "config">>): MockApi {
  const handlers: Record<string, Function> = {};
  const tools: Record<string, { execute: Function }> = {};

  return {
    logger: {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    },
    pluginConfig: { verbose: false, ...(overrides?.pluginConfig ?? {}) },
    config: overrides?.config ?? {
      channels: {
        telegram: {
          token: "fake-bot-token",
          allowFrom: ["123456"],
        },
      },
    },
    registerService: vi.fn(),
    registerCommand: vi.fn(),
    registerTool: vi.fn((def: any, _opts?: any) => {
      tools[def.name] = def;
    }),
    on: vi.fn((event: string, handler: Function) => {
      handlers[event] = handler;
    }),
    _handlers: handlers,
    _tools: tools,
  };
}

// ── Mock fetch (Telegram Bot API) ────────────────────────────────────────────

let fetchResponses: Record<string, object> = {};

function setFetchResponse(method: string, response: object): void {
  fetchResponses[method] = response;
}

function setupDefaultFetchResponses(): void {
  fetchResponses = {};
  setFetchResponse("sendMessage", { ok: true, result: { message_id: 100 } });
  setFetchResponse("editMessageText", { ok: true, result: true });
  setFetchResponse("setMessageReaction", { ok: true, result: true });
  setFetchResponse("getMe", { ok: true, result: { username: "testbot" } });
}

// ── Setup ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  setupDefaultFetchResponses();

  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    const method = url.split("/").pop() ?? "";
    const body = fetchResponses[method] ?? { ok: false, description: "unknown method" };
    return {
      json: async () => body,
    };
  }));
});

// ── Helpers ──────────────────────────────────────────────────────────────────

function registerPlugin(apiOverrides?: Partial<Pick<MockApi, "pluginConfig" | "config">>): MockApi {
  const api = createMockApi(apiOverrides);
  plugin.register(api);
  return api;
}

function getSendingHandler(api: MockApi): (event: { content: string }, ctx: { channelId: string }) => Promise<{ cancel: true } | void> {
  return api._handlers["message_sending"] as any;
}

function getReceivedHandler(api: MockApi): (event: any, ctx: { channelId: string }) => Promise<void> {
  return api._handlers["message_received"] as any;
}

// ═════════════════════════════════════════════════════════════════════════════
// Tests
// ═════════════════════════════════════════════════════════════════════════════

describe("register — plugin wiring", () => {
  it("registers message_sending and message_received handlers", () => {
    const api = registerPlugin();
    const events = api.on.mock.calls.map((c: any) => c[0]);
    expect(events).toContain("message_sending");
    expect(events).toContain("message_received");
  });

  it("registers both tools", () => {
    const api = registerPlugin();
    const toolNames = api.registerTool.mock.calls.map((c: any) => c[0].name);
    expect(toolNames).toContain("telegram_ui_buttons");
    expect(toolNames).toContain("telegram_ui_react");
  });

  it("registers the cleanup service", () => {
    const api = registerPlugin();
    expect(api.registerService).toHaveBeenCalledOnce();
    expect(api.registerService.mock.calls[0][0].id).toBe("telegram-ui-cleanup");
  });

  it("registers the /uistatus command", () => {
    const api = registerPlugin();
    expect(api.registerCommand).toHaveBeenCalledOnce();
    expect(api.registerCommand.mock.calls[0][0].name).toBe("uistatus");
  });

  it("does not register handlers when config is missing", () => {
    const api = registerPlugin({
      config: { channels: { telegram: { token: "", allowFrom: [] } } },
    });
    expect(api.on).not.toHaveBeenCalled();
    expect(api.registerTool).not.toHaveBeenCalled();
  });
});

// ── message_sending hook ─────────────────────────────────────────────────────

describe("message_sending — tag interception", () => {
  it("ignores non-telegram channels", async () => {
    const api = registerPlugin();
    const handler = getSendingHandler(api);
    const result = await handler(
      { content: "[BUTTONS:Q|A|B]" },
      { channelId: "slack" },
    );
    expect(result).toBeUndefined();
  });

  it("ignores messages without tags", async () => {
    const api = registerPlugin();
    const handler = getSendingHandler(api);
    const result = await handler(
      { content: "Just a regular message" },
      { channelId: "telegram" },
    );
    expect(result).toBeUndefined();
  });

  it("intercepts [BUTTONS:...] and sends a button prompt", async () => {
    const api = registerPlugin();
    const handler = getSendingHandler(api);

    const result = await handler(
      { content: "[BUTTONS:Pick a color|Red|Blue|Green]" },
      { channelId: "telegram" },
    );

    expect(result).toEqual({ cancel: true });

    // Verify fetch was called with sendMessage
    const fetchMock = vi.mocked(fetch);
    const sendCalls = fetchMock.mock.calls.filter(c =>
      (c[0] as string).endsWith("/sendMessage"),
    );
    expect(sendCalls.length).toBe(1);

    const body = JSON.parse((sendCalls[0][1] as any).body);
    expect(body.chat_id).toBe("123456");
    expect(body.text).toContain("Pick a color");
    expect(body.parse_mode).toBe("HTML");
    expect(body.reply_markup).toBeDefined();
    expect(body.reply_markup.inline_keyboard).toHaveLength(3);
    expect(body.reply_markup.inline_keyboard[0][0].text).toBe("Red");
  });

  it("intercepts [REACT:...] and sets a reaction", async () => {
    const api = registerPlugin();
    const receivedHandler = getReceivedHandler(api);
    const sendingHandler = getSendingHandler(api);

    // First, capture a user message_id
    await receivedHandler(
      { content: "Hello", messageId: 42 },
      { channelId: "telegram" },
    );

    const result = await sendingHandler(
      { content: "[REACT:👍]" },
      { channelId: "telegram" },
    );

    expect(result).toEqual({ cancel: true });

    const fetchMock = vi.mocked(fetch);
    const reactionCalls = fetchMock.mock.calls.filter(c =>
      (c[0] as string).endsWith("/setMessageReaction"),
    );
    expect(reactionCalls.length).toBe(1);

    const body = JSON.parse((reactionCalls[0][1] as any).body);
    expect(body.message_id).toBe(42);
    expect(body.reaction).toEqual([{ type: "emoji", emoji: "👍" }]);
  });

  it("forwards clean text alongside button prompt", async () => {
    const api = registerPlugin();
    const handler = getSendingHandler(api);

    await handler(
      { content: "Here are your options. [BUTTONS:Choose|Yes|No]" },
      { channelId: "telegram" },
    );

    const fetchMock = vi.mocked(fetch);
    const sendCalls = fetchMock.mock.calls.filter(c =>
      (c[0] as string).endsWith("/sendMessage"),
    );

    // Two sendMessage calls: one for button prompt, one for clean text
    expect(sendCalls.length).toBe(2);

    // First call: button prompt (HTML)
    const buttonBody = JSON.parse((sendCalls[0][1] as any).body);
    expect(buttonBody.reply_markup).toBeDefined();

    // Second call: clean text (plain)
    const textBody = JSON.parse((sendCalls[1][1] as any).body);
    expect(textBody.text).toBe("Here are your options.");
    expect(textBody.reply_markup).toBeUndefined();
  });

  it("handles combined [REACT:...] + [BUTTONS:...] in one message", async () => {
    const api = registerPlugin();
    const receivedHandler = getReceivedHandler(api);
    const sendingHandler = getSendingHandler(api);

    await receivedHandler(
      { content: "Hi", messageId: 55 },
      { channelId: "telegram" },
    );

    await sendingHandler(
      { content: "[REACT:👋] Hey! [BUTTONS:What next?|Plan|Remind|Chat]" },
      { channelId: "telegram" },
    );

    const fetchMock = vi.mocked(fetch);
    const urls = fetchMock.mock.calls.map(c => (c[0] as string).split("/").pop());

    expect(urls).toContain("sendMessage"); // buttons + clean text
    expect(urls).toContain("setMessageReaction"); // reaction
  });

  it("skips reaction when no user message_id is captured", async () => {
    const api = registerPlugin();
    const handler = getSendingHandler(api);

    const result = await handler(
      { content: "[REACT:👍]" },
      { channelId: "telegram" },
    );

    // Still cancels (the tag was consumed)
    expect(result).toEqual({ cancel: true });

    // But no setMessageReaction call
    const fetchMock = vi.mocked(fetch);
    const reactionCalls = fetchMock.mock.calls.filter(c =>
      (c[0] as string).endsWith("/setMessageReaction"),
    );
    expect(reactionCalls.length).toBe(0);

    // Warning logged
    expect(api.logger.warn).toHaveBeenCalledWith(
      expect.stringContaining("no user message_id captured yet"),
    );
  });

  it("cancels even when sendMessage fails", async () => {
    setFetchResponse("sendMessage", { ok: false, description: "bot blocked" });

    const api = registerPlugin();
    const handler = getSendingHandler(api);

    const result = await handler(
      { content: "[BUTTONS:Q|A|B]" },
      { channelId: "telegram" },
    );

    expect(result).toEqual({ cancel: true });
    expect(api.logger.warn).toHaveBeenCalledWith(
      expect.stringContaining("send failed"),
    );
  });
});

// ── message_received — button tap resolution ─────────────────────────────────

describe("message_received — callback resolution", () => {
  it("captures user message_id from event.messageId", async () => {
    const api = registerPlugin({ pluginConfig: { verbose: true } });
    const handler = getReceivedHandler(api);

    await handler(
      { content: "Hello", messageId: 77 },
      { channelId: "telegram" },
    );

    expect(api.logger.info).toHaveBeenCalledWith(
      expect.stringContaining("captured user message_id=77"),
    );
  });

  it("captures message_id from metadata.message_id", async () => {
    const api = registerPlugin({ pluginConfig: { verbose: true } });
    const handler = getReceivedHandler(api);

    await handler(
      { content: "Hello", metadata: { message_id: "88" } },
      { channelId: "telegram" },
    );

    expect(api.logger.info).toHaveBeenCalledWith(
      expect.stringContaining("captured user message_id=88"),
    );
  });

  it("ignores non-telegram channels", async () => {
    const api = registerPlugin({ pluginConfig: { verbose: true } });
    const handler = getReceivedHandler(api);

    await handler(
      { content: "Hello", messageId: 99 },
      { channelId: "discord" },
    );

    expect(api.logger.info).not.toHaveBeenCalledWith(
      expect.stringContaining("captured user message_id"),
    );
  });

  it("resolves a callback_data tap via /tgui format", async () => {
    const api = registerPlugin();
    const sendingHandler = getSendingHandler(api);
    const receivedHandler = getReceivedHandler(api);

    // 1. Send a button prompt to create a pending entry
    await sendingHandler(
      { content: "[BUTTONS:Pick|Alpha|Beta]" },
      { channelId: "telegram" },
    );

    // Extract the promptId from the sendMessage call
    const fetchMock = vi.mocked(fetch);
    const sendCall = fetchMock.mock.calls.find(c =>
      (c[0] as string).endsWith("/sendMessage"),
    );
    const sendBody = JSON.parse((sendCall![1] as any).body);
    const callbackData = sendBody.reply_markup.inline_keyboard[0][0].callback_data;
    const promptId = callbackData.split(" ")[1];

    // 2. Simulate user tapping button 1 (Beta)
    fetchMock.mockClear();
    await receivedHandler(
      { content: `/tgui ${promptId} 1`, messageId: 200 },
      { channelId: "telegram" },
    );

    // 3. Verify the message was edited with resolution
    const editCalls = fetchMock.mock.calls.filter(c =>
      (c[0] as string).endsWith("/editMessageText"),
    );
    expect(editCalls.length).toBe(1);

    const editBody = JSON.parse((editCalls[0][1] as any).body);
    expect(editBody.text).toContain("Pick");
    expect(editBody.text).toContain("✅");
    expect(editBody.text).toContain("Beta");
  });

  it("resolves via callback_data: prefix", async () => {
    const api = registerPlugin();
    const sendingHandler = getSendingHandler(api);
    const receivedHandler = getReceivedHandler(api);

    await sendingHandler(
      { content: "[BUTTONS:Q|Yes|No]" },
      { channelId: "telegram" },
    );

    const fetchMock = vi.mocked(fetch);
    const sendCall = fetchMock.mock.calls.find(c =>
      (c[0] as string).endsWith("/sendMessage"),
    );
    const callbackData = JSON.parse((sendCall![1] as any).body)
      .reply_markup.inline_keyboard[0][0].callback_data;

    fetchMock.mockClear();
    await receivedHandler(
      { content: `callback_data: ${callbackData}`, messageId: 300 },
      { channelId: "telegram" },
    );

    const editCalls = fetchMock.mock.calls.filter(c =>
      (c[0] as string).endsWith("/editMessageText"),
    );
    expect(editCalls.length).toBe(1);
  });

  it("resolves via plain option text fallback", async () => {
    const api = registerPlugin();
    const sendingHandler = getSendingHandler(api);
    const receivedHandler = getReceivedHandler(api);

    await sendingHandler(
      { content: "[BUTTONS:Fruit?|Apple|Banana]" },
      { channelId: "telegram" },
    );

    const fetchMock = vi.mocked(fetch);
    fetchMock.mockClear();

    await receivedHandler(
      { content: "Banana", messageId: 400 },
      { channelId: "telegram" },
    );

    const editCalls = fetchMock.mock.calls.filter(c =>
      (c[0] as string).endsWith("/editMessageText"),
    );
    expect(editCalls.length).toBe(1);
    const editBody = JSON.parse((editCalls[0][1] as any).body);
    expect(editBody.text).toContain("Banana");
  });

  it("ignores unrelated messages when prompts are pending", async () => {
    const api = registerPlugin();
    const sendingHandler = getSendingHandler(api);
    const receivedHandler = getReceivedHandler(api);

    await sendingHandler(
      { content: "[BUTTONS:Q|X|Y]" },
      { channelId: "telegram" },
    );

    const fetchMock = vi.mocked(fetch);
    fetchMock.mockClear();

    await receivedHandler(
      { content: "Something unrelated", messageId: 500 },
      { channelId: "telegram" },
    );

    const editCalls = fetchMock.mock.calls.filter(c =>
      (c[0] as string).endsWith("/editMessageText"),
    );
    expect(editCalls.length).toBe(0);
  });
});

// ── telegram_ui_buttons tool ─────────────────────────────────────────────────

describe("telegram_ui_buttons tool", () => {
  it("sends a button prompt and returns ok", async () => {
    const api = registerPlugin();
    const tool = api._tools["telegram_ui_buttons"];

    const result = await tool.execute("call-1", {
      question: "Pick a color",
      options: ["Red", "Blue"],
    });

    expect(result.details.ok).toBe(true);
    expect(result.details.messageId).toBe(100);
    expect(result.details.question).toBe("Pick a color");
    expect(result.details.options).toEqual(["Red", "Blue"]);
  });

  it("sends a follow-up text message when provided", async () => {
    const api = registerPlugin();
    const tool = api._tools["telegram_ui_buttons"];

    await tool.execute("call-2", {
      question: "Pick",
      options: ["A", "B"],
      follow_up_text: "Choose wisely!",
    });

    const fetchMock = vi.mocked(fetch);
    const sendCalls = fetchMock.mock.calls.filter(c =>
      (c[0] as string).endsWith("/sendMessage"),
    );
    expect(sendCalls.length).toBe(2);

    const followUpBody = JSON.parse((sendCalls[1][1] as any).body);
    expect(followUpBody.text).toBe("Choose wisely!");
  });

  it("returns error when question is missing", async () => {
    const api = registerPlugin();
    const tool = api._tools["telegram_ui_buttons"];

    const result = await tool.execute("call-3", { question: "", options: ["A", "B"] });
    expect(result.details.ok).toBe(false);
    expect(result.details.error).toContain("question");
  });

  it("returns error when fewer than 2 options", async () => {
    const api = registerPlugin();
    const tool = api._tools["telegram_ui_buttons"];

    const result = await tool.execute("call-4", { question: "Q", options: ["Only one"] });
    expect(result.details.ok).toBe(false);
    expect(result.details.error).toContain("2 options");
  });

  it("returns error when sendMessage fails", async () => {
    setFetchResponse("sendMessage", { ok: false, description: "blocked" });

    const api = registerPlugin();
    const tool = api._tools["telegram_ui_buttons"];

    const result = await tool.execute("call-5", { question: "Q", options: ["A", "B"] });
    expect(result.details.ok).toBe(false);
    expect(result.details.error).toContain("failed");
  });
});

// ── telegram_ui_react tool ───────────────────────────────────────────────────

describe("telegram_ui_react tool", () => {
  it("applies a reaction to the last captured message", async () => {
    const api = registerPlugin();
    const receivedHandler = getReceivedHandler(api);
    const tool = api._tools["telegram_ui_react"];

    await receivedHandler(
      { content: "Hi", messageId: 60 },
      { channelId: "telegram" },
    );

    const result = await tool.execute("call-r1", { emoji: "👍" });
    expect(result.details.ok).toBe(true);
    expect(result.details.emoji).toBe("👍");
    expect(result.details.messageId).toBe(60);
  });

  it("returns error when no message_id captured", async () => {
    const api = registerPlugin();
    const tool = api._tools["telegram_ui_react"];

    const result = await tool.execute("call-r2", { emoji: "👍" });
    expect(result.details.ok).toBe(false);
    expect(result.details.error).toContain("no inbound");
  });

  it("returns error when emoji is empty", async () => {
    const api = registerPlugin();
    const tool = api._tools["telegram_ui_react"];

    const result = await tool.execute("call-r3", { emoji: "" });
    expect(result.details.ok).toBe(false);
    expect(result.details.error).toContain("emoji");
  });

  it("returns error when reaction API call fails", async () => {
    setFetchResponse("setMessageReaction", { ok: false, description: "bad emoji" });

    const api = registerPlugin();
    const receivedHandler = getReceivedHandler(api);
    const tool = api._tools["telegram_ui_react"];

    await receivedHandler(
      { content: "Hi", messageId: 70 },
      { channelId: "telegram" },
    );

    const result = await tool.execute("call-r4", { emoji: "🐛" });
    expect(result.details.ok).toBe(false);
    expect(result.details.error).toContain("failed");
  });
});
