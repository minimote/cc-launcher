<#
.SYNOPSIS
    为 cc-launcher.mjs 创建快捷方式

.DESCRIPTION
    改下面配置区的变量，直接运行即可
#>

#region 配置 ----------------

# CC-Switch 里的供应商名称
$ProviderName = ""
# 快捷方式的起始位置（项目目录）
$WorkingDirectory = "F:\AI\workspace\Claude"

#endregion 配置 --------------------------------

# 等待按键后退出（避免窗口闪退）
function Wait-KeyExit {
    Write-Host "按任意键退出..." -ForegroundColor DarkGray
    [Console]::CursorVisible = $false
    $null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
    [Console]::CursorVisible = $true
}

# 脚本路径（与本文件同级）
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$MjsPath = Join-Path $ScriptDir "cc-launcher.mjs"

if (-not (Test-Path $MjsPath)) {
  Write-Host "错误：找不到 $MjsPath" -ForegroundColor Red
  Wait-KeyExit
  exit 1
}

# 查找 node.exe
$NodePath = (Get-Command node -ErrorAction SilentlyContinue).Source
if (-not $NodePath) {
  Write-Host "错误：未找到 node.exe ，请确认 Node.js 已安装并加入 PATH" -ForegroundColor Red
  Wait-KeyExit
  exit 1
}

# 检查目录是否存在
if (-not (Test-Path $WorkingDirectory)) {
  Write-Host "错误：起始位置不存在：$WorkingDirectory" -ForegroundColor Red
  Write-Host "请修改脚本配置区的 `$WorkingDirectory" -ForegroundColor Yellow
  Wait-KeyExit
  exit 1
}

# 快捷方式文件名与启动参数（供应商名为空时用通用名，启动后交互选择）
if ($ProviderName) {
  $ShortcutName = "$ProviderName.lnk"
  $Arguments = """$MjsPath"" ""$ProviderName"""
} else {
  $ShortcutName = "CC-Launcher.lnk"
  $Arguments = """$MjsPath"""
}
$ShortcutFile = Join-Path $ScriptDir $ShortcutName

# 创建快捷方式
try {
  $ws = New-Object -ComObject WScript.Shell
  $lnk = $ws.CreateShortcut($ShortcutFile)
  $lnk.TargetPath = $NodePath
  $lnk.Arguments = $Arguments
  $lnk.WorkingDirectory = $WorkingDirectory
  $lnk.IconLocation = "$NodePath,0"
  $lnk.Save()

  Write-Host "快捷方式已创建：" -ForegroundColor Green
  Write-Host "  $ShortcutFile" -ForegroundColor Cyan
  Write-Host ""
  Write-Host "  目标:      $NodePath $Arguments" -ForegroundColor Gray
  Write-Host "  起始位置:  $WorkingDirectory" -ForegroundColor Gray
  Write-Host ""
  Wait-KeyExit
} catch {
  Write-Host "创建快捷方式失败：$_" -ForegroundColor Red
  Wait-KeyExit
  exit 1
}
