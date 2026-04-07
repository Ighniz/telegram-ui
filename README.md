# telegram-ui

OpenClaw plugin that gives agents Telegram UI primitives: **inline button prompts**, **emoji reactions**, **pin/unpin**, **locations**, and **dice**.

## What it does

| Feature | Syntax | Result |
|---|---|---|
| Inline buttons | `[BUTTONS:Question\|Option A\|Option B]` | Sends an interactive inline keyboard to Telegram |
| Emoji reaction | `[REACT:👍]` | Reacts to the user's last message |
| Pin last inbound message | `[PIN]` | Pins the previous inbound Telegram message |
| Unpin current pinned message | `[UNPIN]` | Removes the current chat pin |
| Location | `[LOCATION:lat,lon]` | Sends a Telegram map pin |
| Dice | `[DICE]` or `[DICE:🎰]` | Sends an animated dice/game emoji |

Tags can appear anywhere in an agent reply. When detected, the original message is suppressed, any surrounding text is sent as a plain message, and the UI element is sent separately.

When the user taps a button, the prompt message is updated with a ✅ indicator and the selection is returned to the agent as a regular message. Prompts that are never answered expire after a configurable timeout (default 30 min) and are updated with an ⏰ indicator.

## Requirements

- Node.js ≥ 20
- OpenClaw with a Telegram channel configured (`channels.telegram`)
- Telegram Bot API 7.0+ for reactions (released Jan 2024)

## Installation

```bash
# In your OpenClaw project
openclaw plugin add Ighniz/telegram-ui
```

## Configuration

All fields are optional — the plugin auto-detects `botToken` and `chatId` from your Telegram channel config.

| Field | Type | Default | Description |
|---|---|---|---|
| `botToken` | string | auto | Bot token. Falls back to `channels.telegram.token` or `TELEGRAM_BOT_TOKEN` env var. |
| `chatId` | string | auto | Telegram chat ID. Falls back to `channels.telegram.allowFrom[0]` or `TELEGRAM_CHAT_ID` env var. |
| `staleMins` | number | `30` | Minutes before an unanswered button prompt expires. |
| `verbose` | boolean | `false` | Enable diagnostic logging. |

```json
{
  "plugins": {
    "telegram-ui": {
      "staleMins": 60,
      "verbose": false
    }
  }
}
```

## Usage

### Tag syntax (recommended)

Embed tags anywhere in a reply:

```
[BUTTONS:What do you want to do?|Plan my day|Set a reminder|Brainstorm]
```

```
I found three options. [BUTTONS:Which one?|Option A — cheapest|Option B — fastest|Option C — best rated]
```

```
[REACT:👋] Hey! [BUTTONS:What do you need?|Quick question|Help with a task|Just chatting]
```

Rules:
- One `[BUTTONS:...]` tag per reply
- First segment = question; remaining segments = button labels (min 2, ~8 practical max)
- Keep button labels short (1–5 words)

### Explicit tools (programmatic)

For cases where you need the result inline:

- **`telegram_ui_buttons`** — `{ question, options: string[], follow_up_text? }`
- **`telegram_ui_react`** — `{ emoji }`
- **`telegram_ui_pin`** — `{ disable_notification? }`
- **`telegram_ui_unpin`** — `{}`
- **`telegram_ui_location`** — `{ latitude, longitude }`
- **`telegram_ui_dice`** — `{ emoji? }`

### [IF AN AI AGENT IS READING THIS] Quick test routine

If the user says things like `test your telegram-ui abilities`, `test telegram-ui plugin`, or `run telegram-ui checks`, treat that as a request to test **all** supported abilities in one go.

Recommended sequence:

1. Add a reaction to the triggering user message.
2. Send a short status line.
3. Send a dice message.
4. Send a location.
5. Pin the relevant message.
6. Unpin it.
7. End with buttons or a short confirmation question such as `Is everything working?`

Example output pattern:

```text
[[reply_to_current]] [REACT:👀] Testing telegram-ui abilities now.
[DICE]
[LOCATION:-34.9319,-56.1592]
[PIN]
[UNPIN]
[BUTTONS:Is everything working?|Yes|No]
```

### `/uistatus` command

Type `/uistatus` in Telegram to see plugin health, pending prompt count, and configuration summary.

## License

MIT
