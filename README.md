# CC Launcher

<div align="center">

<img src="https://img.shields.io/badge/Node.js-22.13%2B-5FA04E?logo=nodedotjs&logoColor=white" alt="Node.js 22.13+ required">
<img src="https://img.shields.io/github/license/minimote/cc-launcher?color=blue&label=%C2%A9%20License" alt="License">

</div>

<p>

<div align="center">
    中文 | <a href="README_EN.md">English</a>
    &emsp;----&emsp;
    <a href="https://gitee.com/minimote/cc-launcher">Gitee</a> | <a href="https://github.com/minimote/cc-launcher">GitHub</a>
</div>

<p>

> 使用指定的 CC-Switch 供应商启动 Claude Code，可同时运行多个不同供应商的 Claude Code 实例，不影响 CC-Switch 的全局激活状态。

## 功能特点

- 实例级隔离：每个 Claude 实例使用独立 settings 文件启动，互不影响
- 只读访问 cc-switch 数据库，不修改原配置
- 支持交互式选择供应商，同名供应商自动提示选择
- 自动过滤 `PATH`、`HOME` 等系统关键环境变量，防止误覆盖系统设置
- 配套 PowerShell 脚本生成快捷方式，双击即用
- 零依赖，仅使用 Node.js 内置模块（`node:sqlite` 等）

## 已知限制

> **只支持使用原生 `Anthropic Messages` 协议的供应商。**

本工具通过 `claude --settings` 注入供应商配置启动，Claude Code 直连供应商端点，不经过 CC-Switch 的本地路由，因此只支持使用原生 `Anthropic Messages` 协议的供应商。

## 项目结构

> `settings/settings_<id>.json` 文件含 API Key 等敏感信息，已通过 `.gitignore` 忽略，请勿提交到远程代码仓库

```text
cc-launcher/
├── settings/              # 运行时生成的 settings 文件（已 gitignore）
├── cc-launcher.mjs        # 主脚本，读取 cc-switch 数据库并启动 Claude
└── create-shortcut.ps1    # PowerShell 脚本，为指定供应商创建快捷方式
```

## 前置要求

- Node.js 22.13 或更高版本（使用 `node:sqlite` 内置模块，实验性警告已自动屏蔽）
- 已安装 CC-Switch 并配置过至少一个 `claude` 类型供应商
- 已安装 `claude` CLI 并加入 PATH

## 快速开始

### 1. 直接运行

> 运行期间请勿删除 `settings/settings_<id>.json`
> 该类文件是实例隔离的配置来源，删除后 CC-Switch 切换供应商时 env 会被覆盖、失去隔离效果

```bash
# 交互选择供应商
node cc-launcher.mjs

# 指定供应商
node cc-launcher.mjs "Free-ds-v4-Flash"

# 指定供应商并透传参数给 claude
node cc-launcher.mjs "Free-ds-v4-Flash" --continue
```

### 2. 创建快捷方式（推荐）

编辑 [create-shortcut.ps1](create-shortcut.ps1) 顶部配置区：

```powershell
# CC-Switch 里的供应商名称
$ProviderName = ""
# 快捷方式的起始位置（项目目录）
$WorkingDirectory = "F:\AI\workspace\Claude"
```

运行脚本，会在项目目录下生成 `<ProviderName>.lnk`，`$ProviderName` 为空时生成通用快捷方式 `CC-Launcher.lnk`

```powershell
powershell -ExecutionPolicy Bypass -File .\create-shortcut.ps1
```

双击快捷方式即可启动 `Claude Code`（指定了 `$ProviderName` 则直接使用该供应商，否则进入交互选择）。

## 命令行用法

```bash
node cc-launcher.mjs [供应商名称] [claude 额外参数...]
```

| 参数位置    | 说明                                                       |
| :---------- | :--------------------------------------------------------- |
| 第 1 个参数 | CC-Switch 中的供应商名称（可选，不传则直接交互选择）       |
| 后续参数    | 透传给 `Claude Code` CLI，例如 `--continue`、`--resume` 等 |

## 工作原理

1. **检查数据库**：确认 `~/.cc-switch/cc-switch.db` 存在
2. **解析供应商**：
    - 未传名称 -> 列出所有 Anthropic Messages 协议的 `claude` 供应商交互选择
    - 找到唯一匹配 -> 直接使用
    - 找到多个同名 -> 交互选择具体项
    - 未找到 / 选中项协议不兼容 -> 重新选择
3. **过滤环境变量**：解析供应商的 `settings_config`，对其 `env` 字段做过滤——跳过系统关键变量（`PATH`、`HOME`、`USERPROFILE` 等）和非字符串值
4. **写 settings 文件**：将完整 settings 对象写入 `settings/settings_<id>.json`
5. **启动 Claude Code**：通过 `claude --settings <file>` 启动，额外参数透传

## 更新日志

[CHANGELOG](CHANGELOG.md)

## 相关项目

- **CodingPlan Usage Query**（[Gitee](https://gitee.com/minimote/coding-plan-usage-query) | [GitHub](https://github.com/minimote/coding-plan-usage-query)）：查询各平台 Coding Plan 的套餐用量和重置倒计时，推荐搭配 ccstatusline / ccstatusline-zh 的自定义命令放在 Claude Code 状态栏查看。

## License

[MIT License](LICENSE)
