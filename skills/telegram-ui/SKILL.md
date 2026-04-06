---
name: telegram-ui
description: Show Telegram inline buttons, emoji reactions, pin and unpin messages, send locations, roll dice, and run a full Telegram UI self-test in your replies. Use when offering choices, acknowledging messages, pinning or unpinning, sending map pins, sending playful dice/game emojis, or when the user asks to test telegram-ui abilities or test the telegram-ui plugin.
---

# Telegram UI

You have several Telegram UI primitives. Use them freely in conversations.

## Inline Buttons

Embed this tag anywhere in your reply:

```
[BUTTONS:Question text|Option A|Option B|Option C]
```

- First segment = question shown above buttons
- Each `|`-separated value after = one button
- Minimum 2 options, up to ~8 practical
- Text around the tag is sent as a plain message; the tag becomes buttons

### Examples

```
[BUTTONS:What do you want to do?|Plan my day|Set a reminder|Brainstorm]
```

```
I found three options. [BUTTONS:Which one?|Option A — cheapest|Option B — fastest|Option C — best rated]
```

## Emoji Reactions

```
[REACT:emoji]
```

Replace `emoji` with whatever fits the moment — 👍 agreement, ❤️ appreciation, 😂 humor, 👋 greeting, etc. Reacts to the user's last message.

A reaction can be your **entire response** — no text needed. When the user is just teaching, confirming, or acknowledging something and no extra value would come from a text reply, prefer a reaction alone.

```
[REACT:👋] Hey! [BUTTONS:What do you need?|Quick question|Help with a task|Just chatting]
```

## Pin and Unpin

```
[PIN]
```

Pins the last inbound Telegram message.

```
[UNPIN]
```

Removes the current pinned message.

## Location

```
[LOCATION:lat,lon]
```

Sends a Telegram location pin.

## Dice

```
[DICE]
```

Or choose a supported emoji explicitly:

```
[DICE:🎰]
```

Supported Telegram dice/game emojis commonly include: `🎲 🎯 🏀 ⚽ 🎳 🎰`

## Full Self-Test Routine

When the user says things like:
- `test your telegram-ui abilities`
- `test telegram-ui plugin`
- `run telegram-ui checks`

Treat that as a request to test **all** abilities in sequence, without waiting for button taps between steps.

Recommended sequence:

1. Send a reaction on the user message.
2. Send a plain text status line saying the full telegram-ui test is running.
3. Send inline buttons for a final confirmation question only.
4. Send a dice message.
5. Send a location.
6. Pin the relevant recent message.
7. Unpin it.
8. Optionally end with a short text asking whether everything worked.

Use the buttons near the end or alongside the final confirmation, not as a gate that blocks the rest of the routine.

Example pattern:

```text
[REACT:👀] Testing telegram-ui abilities now.
[DICE]
[LOCATION:-34.9319,-56.1592]
[PIN]
[UNPIN]
[BUTTONS:Is everything working?|Yes|No]
```

If the user asks to test a specific ability only, test just that ability.

## Explicit Tools

For programmatic use (when you need the message ID back):

- **telegram_ui_buttons** — `{ question, options, follow_up_text? }`
- **telegram_ui_react** — `{ emoji }`
- **telegram_ui_pin** — `{ disable_notification? }`
- **telegram_ui_unpin** — `{}`
- **telegram_ui_location** — `{ latitude, longitude }`
- **telegram_ui_dice** — `{ emoji? }`

Prefer the tag syntax in normal conversation, unless a tool return value matters.

## Guidelines

- One BUTTONS tag per reply — don't stack multiple prompts
- Keep button labels short (1–5 words)
- Don't repeat the question in surrounding text
- React sparingly — use it when it genuinely replaces or enhances a reply, not as punctuation
