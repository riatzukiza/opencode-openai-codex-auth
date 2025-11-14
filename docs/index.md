# OpenHax Codex Plugin for OpenCode

> Access GPT-5 Codex through your ChatGPT Plus/Pro subscription in OpenCode

[![npm version](https://badge.fury.io/js/openhax%2Fcodex.svg)](https://www.npmjs.com/package/openhax/codex)
[![Tests](https://github.com/open-hax/codex/actions/workflows/ci.yml/badge.svg)](https://github.com/open-hax/codex/actions)

> **Maintained by the Open Hax team.** Follow the project at [github.com/open-hax/codex](https://github.com/open-hax/codex) for updates and contributions.

## ⚠️ Usage Notice

**This plugin is for personal development use only.** It uses OpenAI's official OAuth authentication (the same method as OpenAI's official Codex CLI) for individual coding assistance with your ChatGPT Plus/Pro subscription.

**Not for:** Commercial services, API resale, or multi-user applications. For production use, see [OpenAI Platform API](https://platform.openai.com/).

Users are responsible for compliance with [OpenAI's Terms of Use](https://openai.com/policies/terms-of-use/).

---

## Quick Links

### For Users
- [Getting Started](getting-started.md) - Complete installation and setup guide
- [Configuration Guide](configuration.md) - Advanced config options and patterns
- [Troubleshooting](troubleshooting.md) - Debug techniques and common issues
- [Privacy & Data Handling](privacy.md) - How your data is handled and protected
- [Release Notes](https://github.com/open-hax/codex/releases) - Version history and updates

### For Developers
Explore the engineering depth behind this plugin:
- [Architecture](development/ARCHITECTURE.md) - Technical design, AI SDK compatibility, store:false explained
- [Config System](development/CONFIG_FLOW.md) - How configuration loading and merging works
- [Config Fields](development/CONFIG_FIELDS.md) - Understanding config keys, `id`, and `name` fields
- [Testing Guide](development/TESTING.md) - Test scenarios, integration testing, verification matrix
- [CI & Release Automation](development/ci.md) - Secrets, mutation runs, and automatic publishing

---

## Getting Started

### Installation

Add to your config, run OpenCode, authenticate:

```bash
# 1. Add plugin to ~/.config/opencode/opencode.json
# 2. Run OpenCode
opencode

# 3. Authenticate
opencode auth login
```

### Updating

**⚠️ OpenCode does NOT auto-update plugins**

To get the latest version:
```bash
(cd ~ && sed -i.bak '/"openhax\/codex"/d' .cache/opencode/package.json && rm -rf .cache/opencode/node_modules/openhax/codex)
opencode  # Reinstalls latest
```

### Minimal Configuration

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": ["openhax/codex"],
  "model": "openai/gpt-5-codex"
}
```

### Quick Test

```bash
opencode run "write hello world to test.txt" --model=openai/gpt-5-codex
```

---

## Features

✅ **OAuth Authentication** - Secure ChatGPT Plus/Pro login
✅ **Multiple Models** - gpt-5, gpt-5-codex, gpt-5-codex-mini, gpt-5-mini, gpt-5-nano
✅ **Per-Model Configuration** - Different reasoning effort, verbosity for each variant
✅ **Multi-Turn Conversations** - Full conversation history with prompt caching (enabled by default)
✅ **Backwards Compatible** - Works with old and new config formats
✅ **Prompt Caching** - Enabled by default to reduce token usage and costs
✅ **Comprehensive Testing** - 159 unit tests + 14 integration tests

---

## Why This Plugin?

**Use your ChatGPT subscription instead of OpenAI API credits**

- No separate API key needed
- Access Codex models through ChatGPT Plus/Pro
- Same OAuth login as official Codex CLI
- Full feature parity with Codex CLI

---

## How It Works

The plugin intercepts OpenCode's OpenAI SDK requests and transforms them for the ChatGPT backend API:

1. **OAuth Token Management** - Handles token refresh automatically
2. **Request Transformation** - Converts OpenCode SDK format → Codex API format
3. **AI SDK Compatibility** - Filters SDK-specific constructs for Codex API
4. **Stateless Operation** - Works with ChatGPT backend's `store: false` requirement

See [Architecture](development/ARCHITECTURE.md) for technical details.

---

## Development

This plugin represents significant engineering effort to bridge OpenCode and the ChatGPT Codex backend:

- **7-step fetch flow** with precise transformations
- **AI SDK compatibility layer** handling `item_reference` and other SDK constructs
- **Stateless multi-turn** conversations via encrypted reasoning content
- **15-minute caching** to prevent GitHub API rate limits
- **Comprehensive test coverage** with actual API verification

**Explore the development docs** to see the depth of implementation:
- [Architecture Deep Dive](development/ARCHITECTURE.md)
- [Configuration System Internals](development/CONFIG_FLOW.md)
- [Testing & Verification](development/TESTING.md)

---

## Support

- **Issues**: [GitHub Issues](https://github.com/open-hax/codex/issues)
- **Releases**: [Release Notes](https://github.com/open-hax/codex/releases)
- **Main Repo**: [GitHub](https://github.com/open-hax/codex)


---

## License

GPL-3.0 License - See [LICENSE](../LICENSE) for details

---

**Trademark Notice:** Not affiliated with OpenAI. ChatGPT, GPT-5, Codex, and OpenAI are trademarks of OpenAI, L.L.C.
