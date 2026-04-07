# Changelog

All notable changes to this project will be documented in this file.

The format is inspired by Keep a Changelog, and this project follows SemVer.

## [Unreleased]

## [1.1.0] - 2026-04-06

### Added
- New Telegram UI tags: `[PIN]`, `[UNPIN]`, `[LOCATION:lat,lon]`, `[DICE]`, `[DICE:emoji]`.
- Matching explicit tools: `telegram_ui_pin`, `telegram_ui_unpin`, `telegram_ui_location`, `telegram_ui_dice`.
- Agent-oriented test routine guidance in README for validating all plugin abilities in one flow.

### Changed
- Plugin positioning expanded from buttons/reactions to a broader Telegram UI toolkit.

## [1.0.0] - 2026-04-06

### Added
- Initial standalone release of `telegram-ui` as an OpenClaw plugin.
- Inline button prompt support via `[BUTTONS:Question|Option A|Option B]`.
- Emoji reaction support via `[REACT:emoji]`.
- Prompt lifecycle handling (selection confirmation and stale prompt expiration).
- `/uistatus` command for health/config visibility.
- ClawHub publishing metadata (`openclaw.compat.pluginApi`, `openclaw.build.openclawVersion`).
