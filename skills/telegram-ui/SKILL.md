---
name: telegram-ui
description: Show Telegram inline buttons and emoji reactions in your replies. Use when offering choices, multiple-choice clarifications, or acknowledging messages. Triggers on "pick one", "choose", offering options, or any reply where tappable buttons improve UX.
---

# Telegram UI — Buttons & Reactions

You have two Telegram UI primitives. Use them freely in conversations.

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
[REACT:👍]
```

Reacts to the user's last message. Combinable with BUTTONS or standalone.

```
[REACT:👋] Hey! [BUTTONS:What do you need?|Quick question|Help with a task|Just chatting]
```

## Explicit Tools

For programmatic use (when you need the message ID back):

- **telegram_ui_buttons** — `{ question, options, follow_up_text? }`
- **telegram_ui_react** — `{ emoji }`

Prefer the tag syntax in normal conversation — it's simpler.

## Guidelines

- One BUTTONS tag per reply — don't stack multiple prompts
- Keep button labels short (1–5 words)
- Don't repeat the question in surrounding text
- React sparingly — it means "I saw this", not punctuation
