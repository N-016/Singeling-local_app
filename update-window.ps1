# Venstertje "Singeling App wordt bijgewerkt" tijdens het (stille) installeren
# van een update. De app zelf moet daarvoor helemaal dicht, dus dit draait er
# los van (main.js start het vlak voor quitAndInstall, vanuit een tijdelijke
# map). Het sluit zodra de nieuwe versie zichtbaar is opgestart, of na
# MaxSeconds. Ziet eruit als het laadscherm (splash.html).
param(
  [int]$OldPid,
  [string]$Version = '',
  [int]$Dark = 0,
  [string]$LogoPath = '',
  [string]$Marker = '',
  [int]$MaxSeconds = 180,
  [string]$ProcessName = 'Singeling App'
)

Add-Type -AssemblyName System.Windows.Forms, System.Drawing
Add-Type -Namespace SingelingUpdate -Name Dpi -MemberDefinition '[DllImport("user32.dll")] public static extern bool SetProcessDPIAware();'
[void][SingelingUpdate.Dpi]::SetProcessDPIAware()
[System.Windows.Forms.Application]::EnableVisualStyles()

# main.js start PowerShell verborgen (anders flitst er een zwart venster).
# Windows past "verborgen" toe op het eerste venster dat dit proces toont;
# dat moet niet ons venstertje zijn. Daarom eerst een onzichtbaar hulpvenster.
$warmUp = New-Object System.Windows.Forms.Form
$warmUp.ShowInTaskbar = $false
$warmUp.Opacity = 0
$warmUp.Show()
$warmUp.Close()

# Schaal voor schermen met 125%/150%: alle maten hieronder zijn voor 100%.
$graphics = [System.Drawing.Graphics]::FromHwnd([IntPtr]::Zero)
$scale = $graphics.DpiX / 96
$graphics.Dispose()
function S([double]$value) { [int][Math]::Round($value * $scale) }

$rgb = { param($r, $g, $b) [System.Drawing.Color]::FromArgb($r, $g, $b) }
if ($Dark -eq 1) {
  $bg = & $rgb 20 22 26; $fg = & $rgb 244 245 246; $muted = & $rgb 157 163 172
  $track = & $rgb 40 44 51; $border = & $rgb 53 59 69
} else {
  $bg = & $rgb 255 255 255; $fg = & $rgb 22 24 29; $muted = & $rgb 107 113 120
  $track = & $rgb 238 240 242; $border = & $rgb 223 226 230
}
$accent = & $rgb 255 81 0

$form = New-Object System.Windows.Forms.Form
$form.Text = 'Singeling App wordt bijgewerkt'
$form.FormBorderStyle = 'None'
$form.StartPosition = 'CenterScreen'
$form.ClientSize = New-Object System.Drawing.Size((S 440), (S 200))
$form.BackColor = $bg
$form.TopMost = $true
$form.ShowInTaskbar = $true
$form.Add_Paint({
  param($sender, $e)
  $pen = New-Object System.Drawing.Pen($border, 1)
  $e.Graphics.DrawRectangle($pen, 0, 0, $sender.ClientSize.Width - 1, $sender.ClientSize.Height - 1)
  $pen.Dispose()
})

# Oranje streep bovenaan, zoals bij de meldingen in de app.
$topLine = New-Object System.Windows.Forms.Panel
$topLine.BackColor = $accent
$topLine.Bounds = New-Object System.Drawing.Rectangle(0, 0, (S 440), (S 3))
$form.Controls.Add($topLine)

if ($LogoPath -and (Test-Path $LogoPath)) {
  $logo = New-Object System.Windows.Forms.PictureBox
  $logo.Image = [System.Drawing.Image]::FromFile($LogoPath)
  $logo.SizeMode = 'Zoom'
  $logo.Bounds = New-Object System.Drawing.Rectangle((S 36), (S 46), (S 48), (S 48))
  $form.Controls.Add($logo)
}

$title = New-Object System.Windows.Forms.Label
$title.Text = 'Singeling App wordt bijgewerkt'
$title.Font = New-Object System.Drawing.Font('Segoe UI Semibold', 13)
$title.ForeColor = $fg
$title.AutoSize = $true
$title.Location = New-Object System.Drawing.Point((S 98), (S 48))
$form.Controls.Add($title)

$sub = New-Object System.Windows.Forms.Label
$sub.Text = 'Even geduld, de app start zo vanzelf opnieuw.'
$sub.Font = New-Object System.Drawing.Font('Segoe UI', 9.5)
$sub.ForeColor = $muted
$sub.AutoSize = $true
$sub.MaximumSize = New-Object System.Drawing.Size((S 320), 0)
$sub.Location = New-Object System.Drawing.Point((S 100), (S 76))
$form.Controls.Add($sub)

# Laadbalkje: een oranje stukje dat steeds door het spoor schuift.
$trackPanel = New-Object System.Windows.Forms.Panel
$trackPanel.BackColor = $track
$trackPanel.Bounds = New-Object System.Drawing.Rectangle((S 36), (S 136), (S 368), (S 4))
$form.Controls.Add($trackPanel)
$bar = New-Object System.Windows.Forms.Panel
$bar.BackColor = $accent
$bar.Bounds = New-Object System.Drawing.Rectangle(-(S 120), 0, (S 120), (S 4))
$trackPanel.Controls.Add($bar)

if ($Version) {
  $ver = New-Object System.Windows.Forms.Label
  $ver.Text = "Naar versie $Version"
  $ver.Font = New-Object System.Drawing.Font('Segoe UI', 8.5)
  $ver.ForeColor = $muted
  $ver.AutoSize = $true
  $ver.Location = New-Object System.Drawing.Point((S 34), (S 156))
  $form.Controls.Add($ver)
}

$script:barX = -(S 120)
$animation = New-Object System.Windows.Forms.Timer
$animation.Interval = 16
$animation.Add_Tick({
  $script:barX += (S 5)
  if ($script:barX -gt $trackPanel.Width) { $script:barX = -$bar.Width }
  $bar.Left = $script:barX
})

# Klaar zodra de oude app weg is en de nieuwe een zichtbaar venster heeft
# (het laadscherm). Na een minuut een tip; na MaxSeconds hoe dan ook dicht.
$started = Get-Date
$watch = New-Object System.Windows.Forms.Timer
$watch.Interval = 500
$watch.Add_Tick({
  $elapsed = ((Get-Date) - $started).TotalSeconds
  $oldAlive = $OldPid -gt 0 -and (Get-Process -Id $OldPid -ErrorAction SilentlyContinue)
  if (-not $oldAlive) {
    $fresh = Get-Process -Name $ProcessName -ErrorAction SilentlyContinue |
      Where-Object { $_.Id -ne $OldPid -and $_.MainWindowHandle -ne [IntPtr]::Zero }
    if ($fresh) { $form.Close() }
  }
  if ($elapsed -gt 60) {
    $sub.Text = 'Dit duurt langer dan normaal. Start de Singeling App anders zelf opnieuw via het startmenu.'
  }
  if ($elapsed -gt $MaxSeconds) { $form.Close() }
})

$form.Add_Shown({
  # main.js wacht op dit bestand: pas dan sluit de app zich.
  if ($Marker) { New-Item -ItemType File -Path $Marker -Force | Out-Null }
  $animation.Start()
  $watch.Start()
  $form.Activate()
})

[void]$form.ShowDialog()
