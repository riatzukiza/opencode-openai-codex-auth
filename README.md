# OpenAI ChatGPT OAuth Plugin for opencode

[![npm version](https://img.shields.io/npm/v/opencode-openai-codex-auth.svg)](https://www.npmjs.com/package/opencode-openai-codex-auth)
[![Tests](https://github.com/numman-ali/opencode-openai-codex-auth/actions/workflows/ci.yml/badge.svg)](https://github.com/numman-ali/opencode-openai-codex-auth/actions)
[![npm downloads](https://img.shields.io/npm/dm/opencode-openai-codex-auth.svg)](https://www.npmjs.com/package/opencode-openai-codex-auth)

This plugin enables opencode to use OpenAI's Codex backend via ChatGPT Plus/Pro OAuth authentication, allowing you to use your ChatGPT subscription instead of OpenAI Platform API credits.

> **Found this useful?**
Follow me on [X @nummanthinks](https://x.com/nummanthinks) for future updates and more projects!

## ⚠️ Terms of Service & Usage Notice

**Important:** This plugin is designed for **personal development use only** with your own ChatGPT Plus/Pro subscription. By using this tool, you agree to:

- ✅ Use only for individual productivity and coding assistance
- ✅ Respect OpenAI's rate limits and usage policies
- ✅ Not use to power commercial services or resell access
- ✅ Comply with [OpenAI's Terms of Use](https://openai.com/policies/terms-of-use/) and [Usage Policies](https://openai.com/policies/usage-policies/)

**This tool uses OpenAI's official OAuth authentication** (the same method as OpenAI's official Codex CLI). However, users are responsible for ensuring their usage complies with OpenAI's terms.

### ⚠️ Not Suitable For:
- Commercial API resale or white-labeling
- High-volume automated extraction beyond personal use
- Applications serving multiple users with one subscription
- Any use that violates OpenAI's acceptable use policies

**For production applications or commercial use, use the [OpenAI Platform API](https://platform.openai.com/) with proper API keys.**

---

## Features

- ✅ **ChatGPT Plus/Pro OAuth authentication** - Use your existing subscription
- ✅ **9 pre-configured model variants** - Low/Medium/High reasoning for both gpt-5 and gpt-5-codex
- ✅ **Zero external dependencies** - Lightweight with only @openauthjs/openauth
- ✅ **Auto-refreshing tokens** - Handles token expiration automatically
- ✅ **Smart auto-updating Codex instructions** - Tracks latest stable release with ETag caching
- ✅ **Full tool support** - write, edit, bash, grep, glob, and more
- ✅ **CODEX_MODE** - Codex-OpenCode bridge prompt with Task tool & MCP awareness (enabled by default)
- ✅ **Automatic tool remapping** - Codex tools → opencode tools
- ✅ **Configurable reasoning** - Control effort, summary verbosity, and text output
- ✅ **Type-safe & tested** - Strict TypeScript with 159 unit tests + 14 integration tests
- ✅ **Modular architecture** - Easy to maintain and extend

## Installation

### Quick Start

**No npm install needed!** opencode automatically installs plugins when you add them to your config.

#### Recommended: Full Configuration (Codex CLI Experience)

For the complete experience with all reasoning variants matching the official Codex CLI:

1. **Copy the full configuration** from [`config/full-opencode.json`](./config/full-opencode.json) to your opencode config file:
```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": [
    "opencode-openai-codex-auth"
  ],
  "provider": {
    "openai": {
      "options": {
        "reasoningEffort": "medium",
        "reasoningSummary": "auto",
        "textVerbosity": "medium",
        "include": [
          "reasoning.encrypted_content"
        ],
        "store": false
      },
      "models": {
        "gpt-5-codex-low": {
          "name": "GPT 5 Codex Low (OAuth)",
          "options": {
            "reasoningEffort": "low",
            "reasoningSummary": "auto",
            "textVerbosity": "medium",
            "include": [
              "reasoning.encrypted_content"
            ],
            "store": false
          }
        },
        "gpt-5-codex-medium": {
          "name": "GPT 5 Codex Medium (OAuth)",
          "options": {
            "reasoningEffort": "medium",
            "reasoningSummary": "auto",
            "textVerbosity": "medium",
            "include": [
              "reasoning.encrypted_content"
            ],
            "store": false
          }
        },
        "gpt-5-codex-high": {
          "name": "GPT 5 Codex High (OAuth)",
          "options": {
            "reasoningEffort": "high",
            "reasoningSummary": "detailed",
            "textVerbosity": "medium",
            "include": [
              "reasoning.encrypted_content"
            ],
            "store": false
          }
        },
        "gpt-5-minimal": {
          "name": "GPT 5 Minimal (OAuth)",
          "options": {
            "reasoningEffort": "minimal",
            "reasoningSummary": "auto",
            "textVerbosity": "low",
            "include": [
              "reasoning.encrypted_content"
            ],
            "store": false
          }
        },
        "gpt-5-low": {
          "name": "GPT 5 Low (OAuth)",
          "options": {
            "reasoningEffort": "low",
            "reasoningSummary": "auto",
            "textVerbosity": "low",
            "include": [
              "reasoning.encrypted_content"
            ],
            "store": false
          }
        },
        "gpt-5-medium": {
          "name": "GPT 5 Medium (OAuth)",
          "options": {
            "reasoningEffort": "medium",
            "reasoningSummary": "auto",
            "textVerbosity": "medium",
            "include": [
              "reasoning.encrypted_content"
            ],
            "store": false
          }
        },
        "gpt-5-high": {
          "name": "GPT 5 High (OAuth)",
          "options": {
            "reasoningEffort": "high",
            "reasoningSummary": "detailed",
            "textVerbosity": "high",
            "include": [
              "reasoning.encrypted_content"
            ],
            "store": false
          }
        },
        "gpt-5-mini": {
          "name": "GPT 5 Mini (OAuth)",
          "options": {
            "reasoningEffort": "low",
            "reasoningSummary": "auto",
            "textVerbosity": "low",
            "include": [
              "reasoning.encrypted_content"
            ],
            "store": false
          }
        },
        "gpt-5-nano": {
          "name": "GPT 5 Nano (OAuth)",
          "options": {
            "reasoningEffort": "minimal",
            "reasoningSummary": "auto",
            "textVerbosity": "low",
            "include": [
              "reasoning.encrypted_content"
            ],
            "store": false
          }
        }
      }
    }
  }
}
```

   **Global config**: `~/.config/opencode/opencode.json`
   **Project config**: `<project>/.opencode.json`

   This gives you 9 model variants with different reasoning levels:
   - **gpt-5-codex** (low/medium/high) - Code-optimized reasoning
   - **gpt-5** (minimal/low/medium/high) - General-purpose reasoning
   - **gpt-5-mini** and **gpt-5-nano** - Lightweight variants

   All appear in the opencode model selector as "GPT 5 Codex Low (OAuth)", "GPT 5 High (OAuth)", etc.

#### Alternative: Minimal Configuration

For a simpler setup (uses plugin defaults: medium reasoning, auto summaries):

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": [
    "opencode-openai-codex-auth"
  ],
  "model": "openai/gpt-5-codex"
}
```

**Note**: This gives you basic functionality but you won't see the different reasoning variants in the model selector.

2. **That's it!** opencode will auto-install the plugin on first run.

> **New to opencode?** Learn more at [opencode.ai](https://opencode.ai)

## Authentication

```bash
opencode auth login
```

Select "OpenAI" → "ChatGPT Plus/Pro (Codex Subscription)"

> **⚠️ First-time setup**: Stop Codex CLI if running (both use port 1455)

---

## Updating the Plugin

**⚠️ Important**: OpenCode does NOT auto-update plugins.

To install the latest version:

```bash
# Clear plugin cache
(cd ~ && sed -i.bak '/"opencode-openai-codex-auth"/d' .cache/opencode/package.json && rm -rf .cache/opencode/node_modules/opencode-openai-codex-auth)

# Restart OpenCode - it will reinstall latest version
opencode
```

Check [releases](https://github.com/numman-ali/opencode-openai-codex-auth/releases) for version history.

## Usage

If using the full configuration, select from the model picker in opencode, or specify via command line:

```bash
# Use different reasoning levels for gpt-5-codex
opencode run "simple task" --model=openai/gpt-5-codex-low
opencode run "complex task" --model=openai/gpt-5-codex-high

# Use different reasoning levels for gpt-5
opencode run "quick question" --model=openai/gpt-5-minimal
opencode run "deep analysis" --model=openai/gpt-5-high

# Or with minimal config (uses defaults)
opencode run "create a hello world file" --model=openai/gpt-5-codex
opencode run "solve this complex problem" --model=openai/gpt-5
```

### Available Model Variants (Full Config)

When using [`config/full-opencode.json`](./config/full-opencode.json), you get these pre-configured variants:

| CLI Model ID | TUI Display Name | Reasoning Effort | Best For |
|--------------|------------------|-----------------|----------|
| `gpt-5-codex-low` | GPT 5 Codex Low (OAuth) | Low | Fast code generation |
| `gpt-5-codex-medium` | GPT 5 Codex Medium (OAuth) | Medium | Balanced code tasks |
| `gpt-5-codex-high` | GPT 5 Codex High (OAuth) | High | Complex code & tools |
| `gpt-5-minimal` | GPT 5 Minimal (OAuth) | Minimal | Quick answers, simple tasks |
| `gpt-5-low` | GPT 5 Low (OAuth) | Low | Faster responses with light reasoning |
| `gpt-5-medium` | GPT 5 Medium (OAuth) | Medium | Balanced general-purpose tasks |
| `gpt-5-high` | GPT 5 High (OAuth) | High | Deep reasoning, complex problems |
| `gpt-5-mini` | GPT 5 Mini (OAuth) | Low | Lightweight tasks |
| `gpt-5-nano` | GPT 5 Nano (OAuth) | Minimal | Maximum speed |

**Usage**: `--model=openai/<CLI Model ID>` (e.g., `--model=openai/gpt-5-codex-low`)
**Display**: TUI shows the friendly name (e.g., "GPT 5 Codex Low (OAuth)")

All accessed via your ChatGPT Plus/Pro subscription.

### Using in Custom Commands

**Important**: Always include the `openai/` prefix:

```yaml
# ✅ Correct
model: openai/gpt-5-codex-low

# ❌ Wrong - will fail
model: gpt-5-codex-low
```

See [Configuration Guide](https://numman-ali.github.io/opencode-openai-codex-auth/configuration) for advanced usage.

### Plugin Defaults

When no configuration is specified, the plugin uses these defaults for all GPT-5 models:

```json
{
  "reasoningEffort": "medium",
  "reasoningSummary": "auto",
  "textVerbosity": "medium"
}
```

- **`reasoningEffort: "medium"`** - Balanced computational effort for reasoning
- **`reasoningSummary: "auto"`** - Automatically adapts summary verbosity
- **`textVerbosity: "medium"`** - Balanced output length

These defaults match the official Codex CLI behavior and can be customized (see Configuration below).

## Configuration

### Recommended: Use Pre-Configured File

The easiest way to get started is to use [`config/full-opencode.json`](./config/full-opencode.json), which provides:
- 9 pre-configured model variants matching Codex CLI presets
- Optimal settings for each reasoning level
- All variants visible in the opencode model selector

See [Installation](#installation) for setup instructions.

### Custom Configuration

If you want to customize settings yourself, you can configure options at provider or model level.

#### Available Settings

⚠️ **Important**: The two base models have different supported values.

| Setting | GPT-5 Values | GPT-5-Codex Values | Plugin Default |
|---------|-------------|-------------------|----------------|
| `reasoningEffort` | `minimal`, `low`, `medium`, `high` | `low`, `medium`, `high` | `medium` |
| `reasoningSummary` | `auto`, `detailed` | `auto`, `detailed` | `auto` |
| `textVerbosity` | `low`, `medium`, `high` | `medium` only | `medium` |
| `include` | Array of strings | Array of strings | `["reasoning.encrypted_content"]` |

> **Note**: `minimal` effort is auto-normalized to `low` for gpt-5-codex (not supported by the API).

#### Plugin-Level Settings

Set these in `~/.opencode/openai-codex-auth-config.json`:

- `codexMode` (default `true`): enable the Codex ↔ OpenCode bridge prompt
- `enablePromptCaching` (default `false`): keep a stable `prompt_cache_key` and preserved message IDs so Codex can reuse cached prompts

#### Global Configuration Example

Apply settings to all models:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": ["opencode-openai-codex-auth"],
  "model": "openai/gpt-5-codex",
  "provider": {
    "openai": {
      "options": {
        "reasoningEffort": "high",
        "reasoningSummary": "detailed"
      }
    }
  }
}
```

#### Custom Model Variants Example

Create your own named variants in the model selector:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": ["opencode-openai-codex-auth"],
  "provider": {
    "openai": {
      "models": {
        "codex-fast": {
          "name": "My Fast Codex",
          "options": {
            "reasoningEffort": "low"
          }
        },
        "gpt-5-smart": {
          "name": "My Smart GPT-5",
          "options": {
            "reasoningEffort": "high",
            "textVerbosity": "high"
          }
        }
      }
    }
  }
}
```

**Config key** (e.g., `codex-fast`) is used in CLI: `--model=openai/codex-fast`
**`name` field** (e.g., `"My Fast Codex"`) appears in model selector
**Model type** is auto-detected from the key (contains "codex" → gpt-5-codex, else → gpt-5)

### Advanced Configuration

For advanced options, custom presets, and troubleshooting:

**📖 [Configuration Guide](https://numman-ali.github.io/opencode-openai-codex-auth/configuration)** - Complete reference with examples

## Rate Limits & Responsible Use

This plugin respects the same rate limits enforced by OpenAI's official Codex CLI:

- **Rate limits are determined by your ChatGPT subscription tier** (Plus/Pro)
- **Limits are enforced server-side** through OAuth tokens
- **The plugin does NOT and CANNOT bypass** OpenAI's rate limits

### Best Practices:
- ✅ Use for individual coding tasks, not bulk processing
- ✅ Avoid rapid-fire automated requests
- ✅ Monitor your usage to stay within subscription limits
- ✅ Consider the OpenAI Platform API for higher-volume needs
- ❌ Do not use for commercial services without proper API access
- ❌ Do not share authentication tokens or credentials

**Note:** Excessive usage or violations of OpenAI's terms may result in temporary throttling or account review by OpenAI.

---

## Requirements

- **ChatGPT Plus or Pro subscription** (required)
- **OpenCode** installed ([opencode.ai](https://opencode.ai))

## Troubleshooting

**Common Issues:**

- **401 Unauthorized**: Run `opencode auth login` again
- **Model not found**: Add `openai/` prefix (e.g., `--model=openai/gpt-5-codex-low`)
- **"Item not found" errors**: Update to latest plugin version

**Full troubleshooting guide**: [docs/troubleshooting.md](https://numman-ali.github.io/opencode-openai-codex-auth/troubleshooting)

## Debug Mode

Enable detailed logging:

```bash
DEBUG_CODEX_PLUGIN=1 opencode run "your prompt"
```

For full request/response logs:

```bash
ENABLE_PLUGIN_REQUEST_LOGGING=1 opencode run "your prompt"
```

Logs saved to: `~/.opencode/logs/codex-plugin/`

See [Troubleshooting Guide](https://numman-ali.github.io/opencode-openai-codex-auth/troubleshooting) for details.

## Frequently Asked Questions

### Is this against OpenAI's Terms of Service?

This plugin uses **OpenAI's official OAuth authentication** (the same method as their official Codex CLI). It's designed for personal coding assistance with your own ChatGPT subscription.

However, **users are responsible for ensuring their usage complies with OpenAI's Terms of Use**. This means:
- Personal use for your own development
- Respecting rate limits
- Not reselling access or powering commercial services
- Following OpenAI's acceptable use policies

### Can I use this for my commercial application?

**No.** This plugin is intended for **personal development only**.

For commercial applications, production systems, or services serving multiple users, you must obtain proper API access through the [OpenAI Platform API](https://platform.openai.com/).

### Will my account get banned?

Using OAuth authentication for personal coding assistance aligns with OpenAI's official Codex CLI use case. However, violating OpenAI's terms could result in account action:

**Safe use:**
- Personal coding assistance
- Individual productivity
- Legitimate development work
- Respecting rate limits

**Risky use:**
- Commercial resale of access
- Powering multi-user services
- High-volume automated extraction
- Violating OpenAI's usage policies

### What's the difference between this and scraping session tokens?

**Critical distinction:**
- ✅ **This plugin:** Uses official OAuth authentication through OpenAI's authorization server
- ❌ **Session scraping:** Extracts cookies/tokens from browsers (clearly violates TOS)

OAuth is a **proper, supported authentication method**. Session token scraping and reverse-engineering private APIs are explicitly prohibited by OpenAI's terms.

### Can I use this to avoid paying for the OpenAI API?

**This is not a "free API alternative."**

This plugin allows you to use your **existing ChatGPT subscription** for terminal-based coding assistance (the same use case as OpenAI's official Codex CLI).

If you need API access for applications, automation, or commercial use, you should purchase proper API access from OpenAI Platform.

### Is this affiliated with OpenAI?

**No.** This is an independent open-source project. It uses OpenAI's publicly available OAuth authentication system but is not endorsed, sponsored, or affiliated with OpenAI.

ChatGPT, GPT-5, and Codex are trademarks of OpenAI.

---

## Credits & Attribution

This plugin implements OAuth authentication for OpenAI's Codex backend, using the same authentication flow as:
- [OpenAI's official Codex CLI](https://github.com/openai/codex)
- OpenAI's OAuth authorization server (https://chatgpt.com/oauth)

### Acknowledgments

Based on research and working implementations from:
- [ben-vargas/ai-sdk-provider-chatgpt-oauth](https://github.com/ben-vargas/ai-sdk-provider-chatgpt-oauth)
- [ben-vargas/ai-opencode-chatgpt-auth](https://github.com/ben-vargas/ai-opencode-chatgpt-auth)
- [openai/codex](https://github.com/openai/codex) OAuth flow
- [sst/opencode](https://github.com/sst/opencode)

### Trademark Notice

**Not affiliated with OpenAI.** ChatGPT, GPT-5, GPT-4, GPT-3, Codex, and OpenAI are trademarks of OpenAI, L.L.C. This is an independent open-source project and is not endorsed by, sponsored by, or affiliated with OpenAI.

---

## Documentation

**📖 Documentation:**
- [Installation](#installation) - Get started in 2 minutes
- [Configuration](#configuration) - Customize your setup
- [Troubleshooting](#troubleshooting) - Common issues
- [GitHub Pages Docs](https://numman-ali.github.io/opencode-openai-codex-auth/) - Extended guides
- [Developer Docs](https://numman-ali.github.io/opencode-openai-codex-auth/development/ARCHITECTURE) - Technical deep dive

## License

MIT
