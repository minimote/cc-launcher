<#
.SYNOPSIS
    为 cc-launcher.mjs 创建快捷方式

.DESCRIPTION
    改下面配置区的变量，直接运行即可

    注意：
    不要用 .cmd/.bat 包装本脚本，从 cmd 调用 powershell.exe 会被部分杀毒软件的主动防御拦截，报"拒绝访问"
#>

# 把字符串清理成 Windows 文件名安全形式，并加 8 位短 hash 后缀，
# 防止不同供应商名清理后塌缩到同一文件名而静默覆盖（如 "A B" 与 "A_B"）
# hash 后缀同时保证结果非空且不命中 CON/NUL 等保留名
function ConvertTo-SafeFileBase {
  param([string]$Name)
  $safe = $Name -replace '[<>:"/\\|?*]', '' -replace '\s+', '_'
  if (-not $safe) { $safe = 'provider' }
  $hashBytes = [System.Security.Cryptography.SHA1]::Create().ComputeHash([System.Text.Encoding]::UTF8.GetBytes($Name))
  $short = ([System.BitConverter]::ToString($hashBytes) -replace '-', '').Substring(0, 8).ToLower()
  return "${safe}_${short}"
}

# region 配置 ----------------

# CC-Switch 里的供应商名称（为空时进入交互选择）
$ProviderName = ""
# 快捷方式的起始位置（Claude Code工作目录）
$WorkingDirectory = "F:\AI\workspace\Claude"
# 快捷方式文件名（供应商名清理非法字符，为空时用通用名）
if ($ProviderName) {
  $shortcutBase = ConvertTo-SafeFileBase $ProviderName
} else {
  $shortcutBase = 'CC-Launcher'
}
$ShortcutName = "$shortcutBase.lnk"
# 图标 seed（供应商名为空时用 CC-Launch）
if ($ProviderName) {
  $iconSeed = $ProviderName
} else {
  $iconSeed = "CC-Launcher"
}

# endregion 配置 --------------------------------

# 等待按键后退出（避免窗口闪退）
function Wait-KeyExit {
  Write-Host "按任意键退出..." -ForegroundColor DarkGray
  $null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
}

# 用 DiceBear 生成首字母头像图标（.ico），成功返回路径，失败返回 $null
# 文档 https://dicebear.zhcndoc.com/styles/initials/
function New-DiceBearIcon {
  param(
    [string]$Seed,
    [string]$IconsDir
  )

  # 文件名：清理非法字符 + hash 后缀，防止不同 seed 清理后塌缩覆盖
  $safeName = ConvertTo-SafeFileBase $Seed

  Write-Host ""
  Write-Host "正在生成图标 (seed: $Seed)..." -ForegroundColor Gray

  # 下载 PNG（DiceBear initials 风格，256px，随机背景色）
  # .NET Framework（PS 5.1）需显式启用 TLS 1.2/1.3；PS 7 的 HttpClient 默认协商系统支持的最高版本
  $tls = [System.Net.SecurityProtocolType]::Tls12
  if ([System.Enum]::IsDefined([System.Net.SecurityProtocolType], 'Tls13')) {
    $tls = $tls -bor [System.Net.SecurityProtocolType]::Tls13
  }
  [System.Net.ServicePointManager]::SecurityProtocol = $tls
  # 含非 ASCII 字符（如中文）时缩小文字，纯英文不缩放
  if ($Seed -match '[^\x00-\x7F]') {
    $scaleParam = '&scale=0.7'
  } else {
    $scaleParam = ''
  }
  # 随机背景色：DiceBear 调色板 + 纯黑，不指定 textColor 让 DiceBear 自动配黑白
  $palette = @('c44f4f','ac6039','8e6e2f','777728','627e2a','48822b',
    '2d862d','2b8248','2b8265','2a7e7e','347a9d','4b73c3',
    '6a6acd','825ec9','9f53c6','bb3ebb','c14497','c34b73',
  '000000')
  $bgColor = $palette | Get-Random
  # 文件名含背景色代码，不同色不同文件，绕过系统图标缓存
  $icoPath = Join-Path $IconsDir "${safeName}_${bgColor}.ico"
  $url = "https://api.dicebear.com/10.x/initials/png?seed=$([Uri]::EscapeDataString($Seed))&size=256&borderRadius=50&initialsVariant=alt&initialsProbability=100&backgroundColor=$bgColor$scaleParam"
  try {
    Add-Type -AssemblyName System.Net.Http
    $client = [System.Net.Http.HttpClient]::new()
    # 限定 15s 超时，避免离线/网络挂起时默认 100s 长阻塞
    $client.Timeout = [System.TimeSpan]::FromSeconds(15)
    try {
      $png = $client.GetByteArrayAsync($url).Result
    } finally {
      $client.Dispose()
    }
  } catch {
    Write-Host "图标下载失败（可能超时或网络不通）：$_" -ForegroundColor Yellow
    return $null
  }

  # 拼接 ICO：6 字节 ICONDIR + 16 字节 ICONDIRENTRY + PNG 原始数据
  # 现代 ICO（Vista+）支持直接嵌入 PNG 字节
  $ico = [System.Collections.Generic.List[byte]]::new()
  [void]$ico.AddRange([byte[]](0, 0, 1, 0, 1, 0)) # ICONDIR: reserved=0, type=1(图标), count=1
  [void]$ico.Add(0) # width (0 = 256)
  [void]$ico.Add(0) # height (0 = 256)
  [void]$ico.Add(0) # color count
  [void]$ico.Add(0) # reserved
  [void]$ico.AddRange([byte[]](1, 0)) # color planes = 1
  [void]$ico.AddRange([byte[]](32, 0)) # bits per pixel = 32
  [void]$ico.AddRange([BitConverter]::GetBytes([uint32]$png.Length)) # 图像数据大小
  [void]$ico.AddRange([BitConverter]::GetBytes([uint32]22)) # 图像数据偏移 (6 + 16)
  [void]$ico.AddRange($png)

  try {
    New-Item -ItemType Directory -Force -Path $IconsDir | Out-Null
    [System.IO.File]::WriteAllBytes($icoPath, $ico.ToArray())
  } catch {
    Write-Host "图标写入失败：$_" -ForegroundColor Yellow
    return $null
  }

  Write-Host "图标已生成：$icoPath" -ForegroundColor Green
  # 输出背景色预览（ANSI 24-bit 真彩色）
  $r = [Convert]::ToInt32($bgColor.Substring(0,2), 16)
  $g = [Convert]::ToInt32($bgColor.Substring(2,2), 16)
  $b = [Convert]::ToInt32($bgColor.Substring(4,2), 16)
  $e = [char]27
  Write-Host "图标背景颜色：#$bgColor [$e[48;2;$r;$g;${b}m      $e[0m]" -ForegroundColor Gray
  return $icoPath
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

# 校验供应商名：原始名会原样进命令行参数（mjs 用它精确匹配数据库里的 name），
# 含破坏性字符时文件名会被清理成看似正常，但双击会静默启动失败，故在此显式报错
if ($ProviderName) {
  if ($ProviderName -ne $ProviderName.Trim()) {
    Write-Host "错误：`$ProviderName 含前导或尾随空格，请核对后重试：'$ProviderName'" -ForegroundColor Red
    Wait-KeyExit
    exit 1
  }
  if ($ProviderName -match '"' -or $ProviderName -match '\\$') {
    Write-Host "错误：`$ProviderName 含双引号或以反斜杠结尾，无法作为命令行参数，请改名：'$ProviderName'" -ForegroundColor Red
    Wait-KeyExit
    exit 1
  }
}

# 启动参数（供应商名为空时进入交互选择）
if ($ProviderName) {
  $Arguments = """$MjsPath"" ""$ProviderName"""
} else {
  $Arguments = """$MjsPath"""
}
$ShortcutFile = Join-Path $ScriptDir $ShortcutName

$IconsDir = Join-Path $ScriptDir "icons"
$iconPath = $null
do {
  $newIcon = New-DiceBearIcon -Seed $iconSeed -IconsDir $IconsDir
  if ($newIcon) {
    $iconPath = $newIcon
  } else {
    # 生成失败：若之前已成功生成过图标则沿用，避免一次失败丢掉用户已选的图标
    if ($iconPath) {
      Write-Host "本次生成失败，沿用上一次的图标：$iconPath" -ForegroundColor Yellow
    } else {
      Write-Host "图标生成失败，快捷方式将使用默认图标" -ForegroundColor Yellow
    }
    break
  }
  $choice = (Read-Host "输入 1 回车重新生成，其他输入回车退出").Trim()
} while ($choice -eq "1")

Write-Host ""
# 创建快捷方式
try {
  $ws = New-Object -ComObject WScript.Shell
  $lnk = $ws.CreateShortcut($ShortcutFile)
  $lnk.TargetPath = $NodePath
  $lnk.Arguments = $Arguments
  $lnk.WorkingDirectory = $WorkingDirectory
  if ($iconPath) {
    $lnk.IconLocation = "$iconPath,0"
  }
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
