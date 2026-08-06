# 更新日志

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
