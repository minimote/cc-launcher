# 更新日志

## v1.3.1-2026.08.19

### 修复

- 通用配置 env 在 cc-launcher 启动的实例里丢失的问题：cc-switch 的配置分两处存——通用配置（对所有供应商共享的 env，如 `CLAUDE_CODE_USE_POWERSHELL_TOOL` 等工具行为开关）存于数据库 `settings` 表 `common_config_claude`，供应商特有配置存于 `providers.settings_config`；cc-switch 切换时合并两者写入全局 `~/.claude/settings.json`（common 覆盖供应商同名 key）。本工具此前仅复刻供应商特有 env，导致通用开关缺失，又被 env 隔离逻辑置空而彻底丢失。现按 `meta.commonConfigEnabled` 门控（`true`=跟随 common、`false`/缺失=opt-out 不合并，与 cc-switch 对残留 `None` 供应商的「不合并」一致）读取通用配置 env，与供应商特有 env 合并（common 胜出，使改 common 后 `true` 供应商跟随新值，与 cc-switch 切换/编辑页愈合语义一致），作为完整 targetEnv 参与隔离

### 优化

- README/README_EN 补充「配置来源」「限制（仅复刻 env）」说明：阐明 cc-switch 配置分两处存及合并规则；说明本工具仅复刻 common 的 `env` 合并，不合并其非 env 字段（`hooks`、`permissions`、`enabledPlugins`、`statusLine`、`theme` 等）——Claude Code 对数组型字段跨 settings 来源是拼接而非覆盖，cc-launcher 叠在全局 `~/.claude/settings.json` 之上既无法用置空隔离它们（数组无 `""` 不回退机制，`disableAllHooks` 是全杀），强行写入又会与全局残留重复执行，故这些字段依赖全局泄漏（可能陈旧/丢失），如需随供应商正确生效请用 cc-switch 切换

## v1.3.0-2026.08.07

### 新增

- **env 隔离机制**：读取全局 `~/.claude/settings.json` 的 env，在生成的 settings 里把这些 key 置空（`""`，Claude Code 视为未设置、不被 strip）以抵消全局泄漏，再用目标供应商的 env 覆盖；直接读文件而非从 DB `is_current` 行推断，避免用户手改/切换残留导致 DB 与文件不同步时漏掉泄漏 key

### 优化

- `resolveClaudeExe` 改为遍历 `PATH` 查找 `claude.cmd`，替代 `where claude`：后者在中文区域按 GBK 输出 stdout，Node 按 UTF-8 解码会让含非 ASCII 字符的路径（如中文用户名）乱码、`existsSync` 恒失败而静默回退 `cmd.exe`；PATH 在 Node 里是 Unicode 字符串无此问题，且省去子进程开销（实测约 46ms → 1ms）
- 打印命令的主分支加 `&` 并用单引号包裹 exe 路径：含空格的路径裸写会被 PowerShell 按空格拆成命令名+参数而失败，`&` 调用 + 单引号整体作为命令名即可（spawn 本身用 argv 数组不受影响）
- 非字符串 env 值由「删除」改为「置空为 `""`」：删除会让该 key 回退到全局 settings.json 的泄漏值，置空则被 Claude Code 视为未设置，保留隔离
- README/README_EN 补充 `effortLevel` 等非 env 枚举字段无法隔离的说明、env 隔离机制说明，并补上 CC-Switch 仓库链接

### 修复

- 全局 `~/.claude/settings.json` 的 env 泄漏到目标实例的问题（cc-switch 切换时写入，用户手改或切换残留时可能与 DB 不同步，原先仅过滤目标供应商 env 无法完全防止全局泄漏）

## v1.2.0-2026.08.06

### 新增

- 启动时打印实际调用的命令（按 PowerShell 单引号规则转义），方便复制到其他终端直接运行
- 为每个实例注入 `CC_SWITCH_PROVIDER_ID` 环境变量，供外部工具识别当前供应商
- `create-shortcut.ps1` 调用 DiceBear API 生成首字母图标（随机背景色调色板，含非 ASCII 字符时自动缩小文字）作为快捷方式图标，下载失败回退默认图标，并支持「输入 1 回车重新生成」
- `create-shortcut.ps1` 校验供应商名：含前导/尾随空格、双引号或以反斜杠结尾时显式报错退出，避免双击静默启动失败
- `create-shortcut.ps1` 注明不要用 `.cmd`/`.bat` 包装本脚本（从 cmd 调用 powershell.exe 会被部分杀软主动防御拦截）

### 优化

- 直接定位并 spawn `claude.exe`，绕开 `cmd.exe` 参数重解析，避免参数里的 `%VAR%` 被展开、`& |` 被当作命令分隔符；定位失败时回退 `cmd.exe /c claude` 并给出警告
- settings 文件名与快捷方式文件名均做 Windows 文件名安全清理（替换 `\ / : * ? " < > |`），快捷方式名加 8 位 hash 后缀防止不同名清理后塌缩覆盖
- 文档（英文 README、更新日志）迁移至 `docs/` 目录；`.gitignore` 新增 `icons/`
- README 统一术语为「Claude Code」，补充命令打印、环境变量注入、图标生成等说明

### 修复

- 供应商 id 含 `/` 时写 settings 文件触发 ENOENT、含 `:` 时误写入 NTFS 备用数据流的问题（通过文件名清理修复）

## v1.1.0-2026.07.17

### 新增

- 供应商协议过滤：仅列出和使用原生 `Anthropic Messages` 协议的供应商；选中非该协议的供应商时提示重新选择
- `create-shortcut.ps1` 的 `$ProviderName` 留空时生成通用快捷方式 `CC-Launcher.lnk`，双击后进入交互选择
- 交互式选择支持 Esc 退出

### 优化

- settings 文件写入完整 settings 对象，原先仅写入过滤后的 `env` 字段
- 启动方式由 `spawn(shell: true)` 拼接命令字符串改为 `cmd.exe /c claude` 直接传参，避免参数拼接与 shell 转义问题
- 交互选择方向键改为循环切换，未识别按键不再重绘
- 整个选择流程复用同一个数据库连接，不再每次开关
- 选择列表标注「当前全局激活」供应商
- `create-shortcut.ps1` 提取 `Wait-KeyExit` 函数，消除多处重复的「按任意键退出」代码
- 精简多处错误提示文案

### 修复

- 系统关键环境变量过滤改为大小写不敏感（原先 `path`、`Path` 等非全大写形式不会被过滤）

## v1.0.1-2026.07.13

### 优化

- README 新增「已知限制」小节，说明仅支持 Anthropic 原生格式供应商
- `create-shortcut.ps1` 在错误退出和正常完成时增加「按任意键退出」暂停，避免双击运行窗口闪退

## v1.0.0-2026.07.13

### 新增

- 使用指定 CC-Switch 供应商启动 Claude Code，实现实例级隔离，不影响 CC-Switch 全局激活状态
- 从 cc-switch 数据库只读读取供应商配置，生成 settings 文件通过 `claude --settings` 启动
- 交互式供应商选择（上下键切换、回车确认），支持同名供应商多选与未找到时自动回退
- 自动过滤 `PATH`、`HOME` 等系统关键环境变量，防止误覆盖系统设置
- 配套 `create-shortcut.ps1` 脚本生成桌面快捷方式，双击即用
