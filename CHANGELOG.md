# 更新日志

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
