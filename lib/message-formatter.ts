// ─────────────────────────────────────────────────────────────────────────────
// telegram-ui · lib/message-formatter.ts
// HTML message formatting and inline keyboard builders for Telegram
// ─────────────────────────────────────────────────────────────────────────────

// ─── HTML escaping ───────────────────────────────────────────────────────────

/** Escape text for Telegram HTML parse mode. */
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// ─── Button prompt messages ──────────────────────────────────────────────────

/** Format the initial button prompt message. */
export function formatPromptMessage(question: string): string {
  return `🎛 <b>${escapeHtml(question)}</b>`;
}

/** Format the prompt message after the user has selected an option. */
export function formatPromptResolved(question: string, selected: string): string {
  return [
    `🎛 <b>${escapeHtml(question)}</b>`,
    ``,
    `✅ ${escapeHtml(selected)}`,
  ].join("\n");
}

/** Format the prompt message when it expires before the user responds. */
export function formatPromptExpired(question: string): string {
  return [
    `🎛 <b>${escapeHtml(question)}</b>`,
    ``,
    `⏰ <i>Expired</i>`,
  ].join("\n");
}

// ─── Inline keyboard ─────────────────────────────────────────────────────────

/** Build an inline keyboard with one button per row using namespaced callback_data. */
export function buildPromptKeyboard(promptId: string, options: string[]): object {
  return {
    inline_keyboard: options.map((opt, index) => [
      { text: opt, callback_data: `/tgui ${promptId} ${index}` },
    ]),
  };
}

// ─── /uistatus output ────────────────────────────────────────────────────────

export function formatStatus(info: {
  ok: boolean;
  chatId: boolean;
  token: boolean;
  reachable: boolean;
  botUsername?: string;
  telegramError?: string;
  pending: number;
  totalProcessed: number;
  uptime: number;
}): string {
  const uptimeMin = Math.floor(info.uptime / 60_000);
  const lines = [
    `${info.ok ? "🟢" : "🔴"} Telegram UI Status`,
    ``,
    `Config: chatId=${info.chatId ? "✓" : "✗"} · token=${info.token ? "✓" : "✗"}`,
  ];

  if (info.reachable) {
    lines.push(`Telegram: ✓ connected (@${info.botUsername ?? "?"})`);
  } else {
    lines.push(`Telegram: ✗ ${info.telegramError ?? "unreachable"}`);
  }

  lines.push(
    ``,
    `Pending prompts: ${info.pending} · Resolved: ${info.totalProcessed}`,
    `Uptime: ${uptimeMin}m`,
  );

  return lines.join("\n");
}
