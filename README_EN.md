# CC Launcher

<div align="center">

<img src="https://img.shields.io/badge/Node.js-22.13%2B-5FA04E?logo=nodedotjs&logoColor=white" alt="Node.js 22.13+ required">
<img src="https://img.shields.io/github/license/minimote/cc-launcher?color=blue&label=%C2%A9%20License" alt="License">

</div>

<p>

<div align="center">
    <a href="README.md">中文</a> | English
    &emsp;----&emsp;
    <a href="https://gitee.com/minimote/cc-launcher">Gitee</a> | <a href="https://github.com/minimote/cc-launcher">GitHub</a>
</div>

<p>

> Launch Claude Code with a specified CC-Switch provider. Multiple Claude Code instances using different providers can run simultaneously without affecting the global active state in CC-Switch.

## Features

- Instance-level isolation: each Claude instance launches with its own settings file, mutually independent
- Read-only access to the cc-switch database, no modification to the original config
- Interactive provider selection (arrow keys to navigate, Enter to confirm); automatically prompts for selection when multiple providers share the same name
- Automatically filters critical system environment variables such as `PATH` and `HOME` to prevent accidental override of system settings
- Bundled PowerShell script to create a desktop shortcut; double-click to launch
- Zero dependencies, uses only Node.js built-in modules (`node:sqlite`, etc.)

## Project Structure

> `settings/settings_<id>.json` contains sensitive information such as API keys. It is ignored via `.gitignore`; do not commit it to remote repositories.

```text
cc-launcher/
├── settings/              # Runtime-generated settings files (gitignored)
├── cc-launcher.mjs        # Main script; reads the cc-switch database and launches Claude
└── create-shortcut.ps1    # PowerShell script that creates a desktop shortcut for a given provider
```

## Prerequisites

- Node.js 22.13 or later (uses the built-in `node:sqlite` module; experimental warnings are automatically suppressed)
- CC-Switch desktop installed, with at least one `claude`-type provider configured
- `claude` CLI installed and available in PATH

## Quick Start

### 1. Run Directly

> Do not delete `settings/settings_<id>.json` while running.
> These files are the configuration source for instance isolation; deleting them causes env to be overwritten when switching providers in CC-Switch, breaking the isolation.

```bash
# Interactively select a provider
node cc-launcher.mjs

# Specify a provider
node cc-launcher.mjs "Free-ds-v4-Flash"

# Specify a provider and pass extra arguments to claude
node cc-launcher.mjs "Free-ds-v4-Flash" --continue
```

### 2. Create a Desktop Shortcut (Recommended)

Edit the configuration section at the top of [create-shortcut.ps1](create-shortcut.ps1):

```powershell
# Provider name in CC-Switch
$ProviderName = "Free-ds-v4-Flash"
# Shortcut working directory (project directory)
$WorkingDirectory = "F:\AI\workspace\Claude"
```

Run the script to generate `<ProviderName>.lnk` in the project directory:

```powershell
powershell -ExecutionPolicy Bypass -File .\create-shortcut.ps1
```

Double-click the shortcut to launch Claude Code with the specified provider.

## Command Line Usage

```bash
node cc-launcher.mjs [provider_name] [extra claude args...]
```

| Position       | Description                                                             |
| :------------- | :---------------------------------------------------------------------- |
| 1st argument   | Provider name in CC-Switch (optional; prompts interactively if omitted) |
| Remaining args | Passed through to the `claude` CLI, e.g. `--continue`, `--resume`       |

## How It Works

1. **Check database**: verifies `~/.cc-switch/cc-switch.db` exists
2. **Resolve provider**:
    - No name given -> list all `claude`-type providers for interactive selection
    - Single match -> use directly
    - Multiple matches with the same name -> prompt to pick one
    - Not found -> fall back to interactive selection (up to 3 retries)
3. **Extract env vars**: parses the provider's `settings_config`, extracts the `env` field, and filters out critical system variables (`PATH`, `HOME`, `USERPROFILE`, etc.) and non-string values
4. **Write settings file**: writes env to `settings/settings_<id>.json`
5. **Launch Claude**: runs `claude --settings <file>`, forwarding extra arguments

## Changelog

[CHANGELOG](CHANGELOG.md)

## Related Projects

- **CodingPlan Usage Query** ([Gitee](https://gitee.com/minimote/coding-plan-usage-query) | [GitHub](https://github.com/minimote/coding-plan-usage-query)): Query Coding Plan usage and reset countdowns across platforms; recommended for use with ccstatusline / ccstatusline-zh custom commands, displayed in the Claude Code status bar

## License

[MIT License](LICENSE)
