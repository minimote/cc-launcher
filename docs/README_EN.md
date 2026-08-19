# CC Launcher

<div align="center">

<img src="https://img.shields.io/badge/Node.js-22.13%2B-5FA04E?logo=nodedotjs&logoColor=white" alt="Node.js 22.13+ required">
<img src="https://img.shields.io/github/license/minimote/cc-launcher?color=blue&label=%C2%A9%20License" alt="License">

</div>

<p>

<div align="center">
    <a href="../README.md">中文</a> | English
    &emsp;----&emsp;
    <a href="https://gitee.com/minimote/cc-launcher">Gitee</a> | <a href="https://github.com/minimote/cc-launcher">GitHub</a>
</div>

<p>

> Launch Claude Code with a specified CC-Switch provider. Multiple Claude Code instances using different providers can run simultaneously without affecting the global active state in CC-Switch.

## Features

- Instance-level isolation: each Claude Code instance launches with its own settings file, mutually independent
- Read-only access to the cc-switch database, no modification to the original config
- Interactive provider selection; automatically prompts for selection when multiple providers share the same name
- Automatically filters critical system environment variables such as `PATH` and `HOME` to prevent accidental override of system settings
- Prevents global env leakage: merges cc-switch's common config and provider-specific config into a complete env, blanks the leaked keys in the global `~/.claude/settings.json` then overrides them with the complete env—both avoiding stale env from switch leftovers or hand edits leaking into this instance and preserving common tool toggles
- Prints the actual command before launch for easy copy to other terminals
- Injects a `CC_SWITCH_PROVIDER_ID` env var into each instance for external tool identification
- Bundled PowerShell script creates a shortcut with a DiceBear initials icon; double-click to launch
- Zero dependencies, uses only Node.js built-in modules (`node:sqlite`, etc.)

## Known Limitations

> **Only supports providers using the native `Anthropic Messages` protocol.**

This tool launches Claude Code by injecting the provider configuration via `claude --settings`; Claude Code connects directly to the provider's endpoint without going through CC-Switch's local router, so only providers using the native `Anthropic Messages` protocol are supported.

> **Non-env enum fields such as `effortLevel` cannot be isolated.**

Non-env enum fields such as `effortLevel` cannot be isolated via settings (`null`/`""` are stripped and then inherited from the global config), so they still follow the currently active provider.

## Project Structure

> `settings/settings_<id>.json` contains sensitive information such as API Key. It is ignored via `.gitignore`; do not commit it to remote repositories.

```text
cc-launcher/
├── docs/                  # Docs (English README, changelog)
├── icons/                 # Shortcut icons, generated at runtime (gitignored)
├── settings/              # Runtime-generated settings files (gitignored)
├── cc-launcher.mjs        # Main script; reads the cc-switch database and launches Claude Code
└── create-shortcut.ps1    # PowerShell script that creates a shortcut for a given provider
```

## Prerequisites

- Node.js 22.13 or later (uses the built-in `node:sqlite` module; experimental warnings are automatically suppressed)
- [CC-Switch](https://github.com/farion1231/cc-switch) installed, with at least one `claude` provider configured
- `Claude Code` CLI installed and available in PATH

## Quick Start

### 1. Run Directly

> Do not delete `settings/settings_<id>.json` while running.
> These files are the configuration source for instance isolation; deleting them causes env to be overwritten when switching providers in CC-Switch, breaking the isolation.

```bash
# Interactively select a provider
node cc-launcher.mjs

# Specify a provider
node cc-launcher.mjs "xxx"

# Specify a provider and pass extra arguments to Claude Code
node cc-launcher.mjs "xxx" --continue
```

### 2. Create a Shortcut (Recommended)

Edit the configuration section at the top of [create-shortcut.ps1](../create-shortcut.ps1):

```powershell
# Provider name in CC-Switch
$ProviderName = ""
# Shortcut working directory (project directory)
$WorkingDirectory = "F:\AI\workspace\Claude"
```

Run the script to generate `<sanitized_name>_<hash>.lnk` in the project directory (the provider name is sanitized of illegal characters and suffixed with an 8-char hash to prevent different names from collapsing to the same filename and overwriting each other); when `$ProviderName` is empty, a generic shortcut `CC-Launcher.lnk` is generated instead. The script also calls the DiceBear API to generate an initials icon (random background color) for the shortcut, falling back to the default icon on download failure; it then prompts "type 1 + Enter to regenerate, otherwise press Enter to exit".

```powershell
powershell -ExecutionPolicy Bypass -File .\create-shortcut.ps1
```

Double-click the shortcut to launch `Claude Code` (uses the specified provider if `$ProviderName` is set, otherwise enters interactive selection).

## Command Line Usage

```bash
node cc-launcher.mjs [provider_name] [extra Claude Code args...]
```

| Position       | Description                                                                  |
| :------------- | :--------------------------------------------------------------------------- |
| 1st argument   | Provider name in CC-Switch (optional; prompts interactively if omitted)      |
| Remaining args | Passed through to the `Claude Code` CLI, e.g. `--continue`, `--resume`, etc. |

## How It Works

1. **Check database**: verifies `~/.cc-switch/cc-switch.db` exists
2. **Resolve provider**:
    - No name given -> list all `claude` providers that use the `Anthropic Messages` protocol for interactive selection
    - Single match -> use directly
    - Multiple matches with the same name -> prompt to pick one
    - Not found / selected provider's protocol is incompatible -> re-select
3. **Filter env vars**: merges "common config env + provider-specific env" into a complete targetEnv and filters it--skipping critical system variables (`PATH`, `HOME`, `USERPROFILE`, etc.); non-string values are set to `""` (treated as unset by Claude Code, avoiding fallback to global values)

    > **Config source**: cc-switch stores config in two places--common config (env shared across all providers, such as tool toggles like `CLAUDE_CODE_USE_POWERSHELL_TOOL`) in the `settings` table key `common_config_claude`, and provider-specific config (real endpoints like `ANTHROPIC_BASE_URL`) in `providers.settings_config`; on switch it merges both into the global `~/.claude/settings.json` (common overrides provider on key collision). This tool replicates that env merge (gated by `meta.commonConfigEnabled`: `true` = follow common, `false` = opt-out, no merge); common wins so that editing common propagates to `true` providers, otherwise the common toggles would be missing and get blanked by the isolation logic.
    >
    > **Isolation mechanism**: cc-launcher does not change the active state; the `env` in the global `~/.claude/settings.json` leaks into this instance (written by cc-switch on switch, may diverge from the DB when hand-edited or after leftover switches). Therefore it reads that file's env directly and sets those keys to empty (`""`, treated as unset by Claude Code and not stripped) in the generated settings to cancel the leak, then overwrites them with the complete targetEnv.
    >
    > **Limitation (env only)**: This tool only merges the `env` portion of the common config, not its non-env fields (`hooks`, `permissions`, `enabledPlugins`, `statusLine`, `theme`, etc.). Claude Code **concatenates** array fields (`hooks`, `permissions.allow/deny/ask`) across settings sources rather than overriding, and since cc-launcher is layered on top of the global `~/.claude/settings.json`, it can neither isolate them via blanking (arrays have no `""`-style non-fallback mechanism; `disableAllHooks` is all-or-nothing) nor apply them cleanly—writing them in would duplicate with stale global entries. These non-env fields therefore rely on global leakage (may be stale/missing); if you need them to apply correctly per provider, switch via cc-switch.

4. **Write settings file**: writes the full settings object to `settings/settings_<id>.json`
5. **Launch Claude Code**: launches via `claude --settings <file>`, forwarding extra arguments; prints the actual command before launch (for easy copy to other terminals) and injects a `CC_SWITCH_PROVIDER_ID` env var into the subprocess (for external tool identification)

## [Changelog](CHANGELOG.md)

## Related Projects

- **CodingPlan Usage Query** ([Gitee](https://gitee.com/minimote/coding-plan-usage-query) | [GitHub](https://github.com/minimote/coding-plan-usage-query)): Query Coding Plan package usage and reset countdowns across platforms; recommended for use with ccstatusline / ccstatusline-zh custom commands, displayed in the Claude Code status bar.

## [MIT License](LICENSE)
