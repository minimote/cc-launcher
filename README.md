# CC Launcher

<div align="center">

<img src="https://img.shields.io/badge/Node.js-22.13%2B-5FA04E?logo=nodedotjs&logoColor=white" alt="Node.js 22.13+ required">
<img src="https://img.shields.io/github/license/minimote/cc-launcher?color=blue&label=%C2%A9%20License" alt="License">

</div>

<p>

<div align="center">
    中文 | <a href="docs/README_EN.md">English</a>
    &emsp;----&emsp;
    <a href="https://gitee.com/minimote/cc-launcher">Gitee</a> | <a href="https://github.com/minimote/cc-launcher">GitHub</a>
</div>

<p>

> 使用指定的 CC-Switch 供应商启动 Claude Code，可同时运行多个不同供应商的 Claude Code 实例，不影响 CC-Switch 的全局激活状态。

## 功能特点

- 实例级隔离：每个 Claude Code 实例使用独立 settings 文件启动，互不影响
- 只读访问 cc-switch 数据库，不修改原配置
- 支持交互式选择供应商，同名供应商自动提示选择
- 自动过滤 `PATH`、`HOME` 等系统关键环境变量，防止误覆盖系统设置
- 防止全局 env 泄漏：置空全局 `~/.claude/settings.json` 的 env key 再用目标供应商覆盖，避免切换残留或手改导致旧供应商 env 串入本实例
- 启动时打印实际命令，方便复制到其他终端直接运行
- 为每个实例注入 `CC_SWITCH_PROVIDER_ID` 环境变量，供外部工具识别当前供应商
- 配套 PowerShell 脚本生成带 DiceBear 首字母图标的快捷方式，双击即用
- 零依赖，仅使用 Node.js 内置模块（`node:sqlite` 等）

## 已知限制

> **只支持使用原生 `Anthropic Messages` 协议的供应商。**

本工具通过 `claude --settings` 注入供应商配置启动，Claude Code 直连供应商端点，不经过 CC-Switch 的本地路由，因此只支持使用原生 `Anthropic Messages` 协议的供应商。

> **`effortLevel` 等非 env 枚举字段无法隔离。**

`effortLevel` 等非 env 枚举字段无法靠 settings 隔离（`null`/`""` 会被 strip 后继承全局），仍会跟随当前激活供应商。

## 项目结构

> `settings/settings_<id>.json` 文件含 API Key 等敏感信息，已通过 `.gitignore` 忽略，请勿提交到远程代码仓库

```text
cc-launcher/
├── docs/                  # 文档（英文 README、更新日志）
├── icons/                 # 快捷方式图标，运行时生成（已 gitignore）
├── settings/              # 运行时生成的 settings 文件（已 gitignore）
├── cc-launcher.mjs        # 主脚本，读取 cc-switch 数据库并启动 Claude Code
└── create-shortcut.ps1    # PowerShell 脚本，为指定供应商创建快捷方式
```

## 前置要求

- Node.js 22.13 或更高版本（使用 `node:sqlite` 内置模块，实验性警告已自动屏蔽）
- 已安装 [CC-Switch](https://github.com/farion1231/cc-switch) 并配置过至少一个 `claude` 供应商
- 已安装 `Claude Code` CLI 并加入 PATH

## 快速开始

### 1. 直接运行

> 运行期间请勿删除 `settings/settings_<id>.json`
> 该类文件是实例隔离的配置来源，删除后 CC-Switch 切换供应商时 env 会被覆盖、失去隔离效果

```bash
# 交互选择供应商
node cc-launcher.mjs

# 指定供应商
node cc-launcher.mjs "xxx"

# 指定供应商并透传参数给 Claude Code
node cc-launcher.mjs "xxx" --continue
```

### 2. 创建快捷方式（推荐）

编辑 [create-shortcut.ps1](create-shortcut.ps1) 顶部配置区：

```powershell
# CC-Switch 里的供应商名称
$ProviderName = ""
# 快捷方式的起始位置（项目目录）
$WorkingDirectory = "F:\AI\workspace\Claude"
```

运行脚本，会在项目目录下生成 `<清理后名>_<hash>.lnk`（供应商名清理非法字符并加 8 位 hash 后缀，防止不同名清理后塌缩覆盖），`$ProviderName` 为空时生成通用快捷方式 `CC-Launcher.lnk`。脚本还会调用 DiceBear API 生成首字母图标（随机背景色）作为快捷方式图标，下载失败则回退默认图标；生成后提示「输入 1 回车重新生成，其他键退出」。

```powershell
powershell -ExecutionPolicy Bypass -File .\create-shortcut.ps1
```

双击快捷方式即可启动 `Claude Code`（指定了 `$ProviderName` 则直接使用该供应商，否则进入交互选择）。

## 命令行用法

```bash
node cc-launcher.mjs [供应商名称] [Claude Code 额外参数...]
```

| 参数位置    | 说明                                                       |
| :---------- | :--------------------------------------------------------- |
| 第 1 个参数 | CC-Switch 中的供应商名称（可选，不传则直接交互选择）       |
| 后续参数    | 透传给 `Claude Code` CLI，例如 `--continue`、`--resume` 等 |

## 工作原理

1. **检查数据库**：确认 `~/.cc-switch/cc-switch.db` 存在
2. **解析供应商**：
    - 未传名称 -> 列出所有 `Anthropic Messages` 协议的 `claude` 供应商交互选择
    - 找到唯一匹配 -> 直接使用
    - 找到多个同名 -> 交互选择具体项
    - 未找到 / 选中项协议不兼容 -> 重新选择
3. **过滤环境变量**：解析供应商的 `settings_config`，对其 `env` 字段做过滤——跳过系统关键变量（`PATH`、`HOME`、`USERPROFILE` 等），非字符串值置空为 `""`（Claude Code 视为未设置，避免回退全局值）

    > **隔离机制**：cc-launcher 不改激活态，全局 `~/.claude/settings.json` 的 `env` 会泄漏到本实例（cc-switch 切换时写入，用户手改或切换残留时可能与 DB 不同步）；故直接读该文件的 env，把这些 key 在生成的 settings 里置空（`""`，Claude Code 视为未设置、不被 strip）以抵消泄漏，再用目标供应商的 env 覆盖

4. **写 settings 文件**：将完整 settings 对象写入 `settings/settings_<id>.json`
5. **启动 Claude Code**：通过 `claude --settings <file>` 启动，额外参数透传；启动前打印实际命令（方便复制到其他终端），并向子进程注入 `CC_SWITCH_PROVIDER_ID` 环境变量（供外部工具识别当前供应商）

## [更新日志](docs/CHANGELOG.md)

## 相关项目

- **CodingPlan Usage Query**（[Gitee](https://gitee.com/minimote/coding-plan-usage-query) | [GitHub](https://github.com/minimote/coding-plan-usage-query)）：查询各平台 Coding Plan 的套餐用量和重置倒计时，推荐搭配 ccstatusline / ccstatusline-zh 的自定义命令放在 Claude Code 状态栏查看。

## [MIT License](LICENSE)
