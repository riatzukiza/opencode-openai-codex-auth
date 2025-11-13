# Getting Started

Complete installation and setup guide for the OpenCode OpenAI Codex Auth Plugin.

## ⚠️ Before You Begin

**This plugin is for personal development use only.** It uses OpenAI's official OAuth authentication for individual coding assistance with your ChatGPT Plus/Pro subscription.

**Not intended for:** Commercial services, API resale, multi-user applications, or any use that violates [OpenAI's Terms of Use](https://openai.com/policies/terms-of-use/).

For production applications, use the [OpenAI Platform API](https://platform.openai.com/).

---

## Prerequisites

- **OpenCode** installed ([installation guide](https://opencode.ai))
- **ChatGPT Plus or Pro subscription** (required for Codex access)
- **Node.js** 18+ (for OpenCode)

## Installation

### Step 1: Add Plugin to Config

OpenCode automatically installs plugins - no `npm install` needed!

**Choose your configuration style:**

#### Option A: Full Configuration (Recommended)

Get 11 pre-configured model variants with optimal settings (including Codex Mini).

Add this to `~/.config/opencode/opencode.json`:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": ["@promethean-os/opencode-openai-codex-auth"],
  "provider": {
    "openai": {
      "options": {
        "reasoningEffort": "medium",
        "reasoningSummary": "auto",
        "textVerbosity": "medium",
        "include": ["reasoning.encrypted_content"],
        "store": false
      },
      "models": {
        "gpt-5-codex-low": {
          "name": "GPT 5 Codex Low (OAuth)",
          "limit": {
            "context": 400000,
            "output": 128000
          },
          "options": {
            "reasoningEffort": "low",
            "reasoningSummary": "auto",
            "textVerbosity": "medium",
            "include": ["reasoning.encrypted_content"],
            "store": false
          }
        },
        "gpt-5-codex-medium": {
          "name": "GPT 5 Codex Medium (OAuth)",
          "limit": {
            "context": 400000,
            "output": 128000
          },
          "options": {
            "reasoningEffort": "medium",
            "reasoningSummary": "auto",
            "textVerbosity": "medium",
            "include": ["reasoning.encrypted_content"],
            "store": false
          }
        },
        "gpt-5-codex-high": {
          "name": "GPT 5 Codex High (OAuth)",
          "limit": {
            "context": 400000,
            "output": 128000
          },
          "options": {
            "reasoningEffort": "high",
            "reasoningSummary": "detailed",
            "textVerbosity": "medium",
            "include": ["reasoning.encrypted_content"],
            "store": false
          }
        },
        "gpt-5-codex-mini-medium": {
          "name": "GPT 5 Codex Mini Medium (OAuth)",
          "limit": {
            "context": 200000,
            "output": 100000
          },
          "options": {
            "reasoningEffort": "medium",
            "reasoningSummary": "auto",
            "textVerbosity": "medium",
            "include": ["reasoning.encrypted_content"],
            "store": false
          }
        },
        "gpt-5-codex-mini-high": {
          "name": "GPT 5 Codex Mini High (OAuth)",
          "limit": {
            "context": 200000,
            "output": 100000
          },
          "options": {
            "reasoningEffort": "high",
            "reasoningSummary": "detailed",
            "textVerbosity": "medium",
            "include": ["reasoning.encrypted_content"],
            "store": false
          }
        },
        "gpt-5-minimal": {
          "name": "GPT 5 Minimal (OAuth)",
          "limit": {
            "context": 400000,
            "output": 128000
          },
          "options": {
            "reasoningEffort": "minimal",
            "reasoningSummary": "auto",
            "textVerbosity": "low",
            "include": ["reasoning.encrypted_content"],
            "store": false
          }
        },
        "gpt-5-low": {
          "name": "GPT 5 Low (OAuth)",
          "limit": {
            "context": 400000,
            "output": 128000
          },
          "options": {
            "reasoningEffort": "low",
            "reasoningSummary": "auto",
            "textVerbosity": "low",
            "include": ["reasoning.encrypted_content"],
            "store": false
          }
        },
        "gpt-5-medium": {
          "name": "GPT 5 Medium (OAuth)",
          "limit": {
            "context": 400000,
            "output": 128000
          },
          "options": {
            "reasoningEffort": "medium",
            "reasoningSummary": "auto",
            "textVerbosity": "medium",
            "include": ["reasoning.encrypted_content"],
            "store": false
          }
        },
        "gpt-5-high": {
          "name": "GPT 5 High (OAuth)",
          "limit": {
            "context": 400000,
            "output": 128000
          },
          "options": {
            "reasoningEffort": "high",
            "reasoningSummary": "detailed",
            "textVerbosity": "high",
            "include": ["reasoning.encrypted_content"],
            "store": false
          }
        },
        "gpt-5-mini": {
          "name": "GPT 5 Mini (OAuth)",
          "limit": {
            "context": 400000,
            "output": 128000
          },
          "options": {
            "reasoningEffort": "low",
            "reasoningSummary": "auto",
            "textVerbosity": "low",
            "include": ["reasoning.encrypted_content"],
            "store": false
          }
        },
        "gpt-5-nano": {
          "name": "GPT 5 Nano (OAuth)",
          "limit": {
            "context": 400000,
            "output": 128000
          },
          "options": {
            "reasoningEffort": "minimal",
            "reasoningSummary": "auto",
            "textVerbosity": "low",
            "include": ["reasoning.encrypted_content"],
            "store": false
          }
        }
      }
    }
  }
}
```

**What you get:**
- ✅ GPT-5 Codex (Low/Medium/High reasoning)
- ✅ GPT-5 (Minimal/Low/Medium/High reasoning)
- ✅ gpt-5-mini, gpt-5-nano (lightweight variants)
- ✅ 400k context + 128k output window for every preset
- ✅ gpt-5-codex-mini (medium/high) plus gpt-5-mini & gpt-5-nano (lightweight variants)
- ✅ All visible in OpenCode model selector
- ✅ Optimal settings for each reasoning level

Prompt caching is enabled out of the box: when OpenCode sends its session identifier as `prompt_cache_key`, the plugin forwards it untouched so multi-turn runs reuse prior work. The plugin no longer synthesizes cache IDs; if the host omits that field, Codex treats the run as uncached. The CODEX_MODE bridge prompt bundled with the plugin is kept in sync with the latest Codex CLI release, so the OpenCode UI and Codex share the same tool contract. If you hit your ChatGPT subscription limits, the plugin returns a friendly Codex-style message with the 5-hour and weekly usage windows so you know when capacity resets.

> **Heads up:** OpenCode's context auto-compaction and usage sidebar only work when this full configuration is installed. The minimal configuration skips the per-model limits, so OpenCode cannot display token usage or compact history automatically.

#### Option B: Minimal Configuration

Just want to get started quickly?

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": ["@promethean-os/opencode-openai-codex-auth"],
  "model": "openai/gpt-5-codex"
}
```

Save to `~/.config/opencode/opencode.json`

**Trade-off**: Uses default settings (medium reasoning), no model variants in selector.

### Step 2: Authenticate

```bash
opencode auth login
```

1. Select **"OpenAI"**
2. Choose **"ChatGPT Plus/Pro (Codex Subscription)"**
3. Browser opens automatically for OAuth flow
4. Log in with your ChatGPT account
5. Done! Token saved to `~/.opencode/auth/openai.json`

**⚠️ Important**: If you have the official Codex CLI running, stop it first (both use port 1455 for OAuth callback).

### Step 3: Test It

```bash
# Quick test
opencode run "write hello world to test.txt" --model=openai/gpt-5-codex

# Or start interactive session
opencode
```

If using full config, you'll see all 11 variants (including Codex Mini) in the model selector!

---

## Configuration Locations

OpenCode checks multiple config files in order:

1. **Project config**: `./.opencode.json` (current directory)
2. **Parent configs**: Walks up directory tree
3. **Global config**: `~/.config/opencode/opencode.json`

**Recommendation**: Use global config for plugin, project config for model/agent overrides.

---

## ⚠️ Updating the Plugin (Important!)

**OpenCode does NOT automatically update plugins.**

When a new version is released, you must manually update:

```bash
# Step 1: Clear plugin cache
(cd ~ && sed -i.bak '/"@promethean-os\/opencode-openai-codex-auth"/d' .cache/opencode/package.json && rm -rf .cache/opencode/node_modules/@promethean-os/opencode-openai-codex-auth)

# Step 2: Restart OpenCode - it will reinstall the latest version
opencode
```

**When to update:**
- New features released
- Bug fixes available
- Security updates

**Check for updates**: [Releases Page](https://github.com/riatzukiza/opencode-openai-codex-auth/releases)

**Pro tip**: Subscribe to release notifications on GitHub to get notified of updates.

---

## Local Development Setup

For plugin development or testing unreleased changes:

```json
{
  "plugin": ["file:///absolute/path/to/your-fork/opencode-openai-codex-auth/dist"]
}
```

**Note**: Must point to `dist/` folder (built output), not root.

**Build the plugin:**
```bash
cd opencode-openai-codex-auth
npm install
npm run build
```

---

## Verifying Installation

### Check Plugin is Loaded

```bash
opencode --version
# Should not show any plugin errors
```

### Check Authentication

```bash
cat ~/.opencode/auth/openai.json
# Should show OAuth credentials (if authenticated)
```

### Test API Access

```bash
# Enable logging to verify requests
ENABLE_PLUGIN_REQUEST_LOGGING=1 opencode run "test" --model=openai/gpt-5-codex

# Check logs
ls ~/.opencode/logs/codex-plugin/
# Should show request logs
```

---

## 💰 Token Usage & Cost Optimization

**Prompt caching is enabled by default** to minimize your costs.

### What This Means
- Your conversation context is preserved across turns
- Token usage is significantly reduced for multi-turn conversations
- Lower overall costs compared to stateless operation

### Managing Caching
Create `~/.opencode/openai-codex-auth-config.json`:

```json
{
  "enablePromptCaching": true
}
```

**Settings:**
- `true` (default): Optimize for cost savings
- `false`: Fresh context each turn (higher costs)

**⚠️ Warning**: Disabling caching will dramatically increase token usage and costs.

---

## Next Steps

- [Configuration Guide](configuration.md) - Advanced config options
- [Troubleshooting](troubleshooting.md) - Common issues and solutions
- [Developer Docs](development/ARCHITECTURE.md) - Technical deep dive

**Back to**: [Documentation Home](index.md)
