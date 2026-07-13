# 更新日志

## v1.0.0-2026.07.13

### 新增

- 使用指定 CC-Switch 供应商启动 Claude Code，实现实例级隔离，不影响 CC-Switch 全局激活状态
- 从 cc-switch 数据库只读读取供应商配置，生成 settings 文件通过 `claude --settings` 启动
- 交互式供应商选择（上下键切换、回车确认），支持同名供应商多选与未找到时自动回退
- 自动过滤 `PATH`、`HOME` 等系统关键环境变量，防止误覆盖系统设置
- 配套 `create-shortcut.ps1` 脚本生成桌面快捷方式，双击即用
