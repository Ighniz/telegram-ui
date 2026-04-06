// ─────────────────────────────────────────────────────────────────────────────
// telegram-ui · lib/prompt-store.ts
// In-memory store for pending button prompts with TTL-based cleanup
// ─────────────────────────────────────────────────────────────────────────────

import type { Logger, PendingPrompt, PromptInfo } from "../types.js";

export class PromptStore {
  private readonly pending = new Map<string, PendingPrompt>();
  private totalProcessed = 0;
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly staleTtlMs: number,
    private readonly log?: Logger,
    private readonly onExpired?: (entry: PendingPrompt) => void,
  ) {}

  // ── Lifecycle ─────────────────────────────────────────────────────────

  start(): void {
    if (this.cleanupTimer) return;
    const interval = Math.max(this.staleTtlMs / 2, 30_000);
    this.cleanupTimer = setInterval(() => this.cleanStale(), interval);
    if (this.cleanupTimer && typeof this.cleanupTimer === "object" && "unref" in this.cleanupTimer) {
      (this.cleanupTimer as NodeJS.Timeout).unref();
    }
  }

  stop(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
  }

  // ── Core operations ───────────────────────────────────────────────────

  add(info: PromptInfo, messageId: number): void {
    this.pending.set(info.id, { messageId, info, sentAt: Date.now() });
  }

  has(promptId: string): boolean {
    return this.pending.has(promptId);
  }

  /**
   * Find a pending prompt whose options include the given text (exact match).
   * Used to detect button taps arriving as plain text messages.
   */
  findByOption(text: string): { promptId: string; entry: PendingPrompt } | null {
    const needle = text.trim();
    for (const [promptId, entry] of this.pending) {
      if (entry.info.options.includes(needle)) {
        return { promptId, entry };
      }
    }
    return null;
  }

  resolve(promptId: string): PendingPrompt | undefined {
    const entry = this.pending.get(promptId);
    if (entry) {
      this.pending.delete(promptId);
      this.totalProcessed++;
    }
    return entry;
  }

  // ── Stats ─────────────────────────────────────────────────────────────

  get pendingCount(): number { return this.pending.size; }
  get processedCount(): number { return this.totalProcessed; }

  // ── Cleanup ───────────────────────────────────────────────────────────

  cleanStale(): number {
    const now = Date.now();
    let removed = 0;

    for (const [id, entry] of this.pending) {
      if (now - entry.sentAt > this.staleTtlMs) {
        this.pending.delete(id);
        removed++;
        this.log?.debug?.(`[prompt-store] purged stale: ${id.slice(0, 8)}…`);
        try { this.onExpired?.(entry); } catch {}
      }
    }

    if (removed > 0) this.log?.info(`[prompt-store] cleaned ${removed} stale prompt(s)`);
    return removed;
  }
}
