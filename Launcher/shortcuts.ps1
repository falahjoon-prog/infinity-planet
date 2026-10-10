# Puts "Infinity Planet" on the Desktop and in the Start menu (safe to run again).
$launcher = $PSScriptRoot
$root = Split-Path -Parent $launcher
$icon = Join-Path $root 'desktop\build\icon.ico'
if (-not (Test-Path $icon)) { $icon = Join-Path $root 'public\favicon.ico' }
$ws = New-Object -ComObject WScript.Shell
$desk = [Environment]::GetFolderPath('Desktop')
$menu = Join-Path ([Environment]::GetFolderPath('Programs')) 'Infinity Planet'
New-Item -ItemType Directory -Force -Path $menu | Out-Null
function Make($path, $target, $style, $desc) {
  $s = $ws.CreateShortcut($path)
  $s.TargetPath = $target
  $s.WorkingDirectory = $root
  $s.IconLocation = "$icon,0"
  $s.WindowStyle = $style
  $s.Description = $desc
  $s.Save()
}
$start = Join-Path $launcher 'Start Infinity Planet.bat'
$update = Join-Path $launcher 'Update Infinity Planet.bat'
Make (Join-Path $desk 'Infinity Planet.lnk') $start 7 'Start Infinity Planet'
Make (Join-Path $menu 'Infinity Planet.lnk') $start 7 'Start Infinity Planet'
Make (Join-Path $menu 'Update Infinity Planet.lnk') $update 1 'Install the latest Infinity Planet update'
