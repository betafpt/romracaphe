# Script tu dong build APK cuc bo cho RomRa POS - Phien ban sieu cap tu tai Android SDK rut gon
$ErrorActionPreference = "Stop"

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "   ROM RA POS - CONG CU TU DONG BUILD APK CUC BO" -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host ""

$ToolsDir = Join-Path $PSScriptRoot ".tools"
if (!(Test-Path $ToolsDir)) {
    New-Item -ItemType Directory -Force -Path $ToolsDir | Out-Null
}

# 1. Tai va thiet lap JDK 17
$JdkDir = Join-Path $ToolsDir "jdk-17"
if (!(Test-Path $JdkDir)) {
    Write-Host "[1/4] Dang tai JDK 17 di dong (khoang 150MB)..." -ForegroundColor Yellow
    $JdkUrl = "https://github.com/adoptium/temurin17-binaries/releases/download/jdk-17.0.10%2B7/OpenJDK17U-jdk_x64_windows_hotspot_17.0.10_7.zip"
    $JdkZip = Join-Path $ToolsDir "jdk.zip"
    
    curl.exe -A "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" -L -o $JdkZip $JdkUrl
    
    Write-Host "Dang giai nen JDK 17..." -ForegroundColor Yellow
    Expand-Archive -Path $JdkZip -DestinationPath $ToolsDir -Force
    
    $ExtractedDir = Get-ChildItem -Path $ToolsDir -Directory | Where-Object { $_.Name -like "*jdk-17*" } | Select-Object -First 1
    if ($ExtractedDir) {
        Rename-Item -Path $ExtractedDir.FullName -NewName "jdk-17"
    }
    
    Remove-Item -Path $JdkZip -Force
    Write-Host "Thiet lap JDK 17 thanh cong!" -ForegroundColor Green
} else {
    Write-Host "[1/4] Da tim thay JDK 17 san co." -ForegroundColor Green
}

# 2. Tai va thiet lap Gradle 8.5
$GradleDir = Join-Path $ToolsDir "gradle-8.5"
if (!(Test-Path $GradleDir)) {
    Write-Host "[2/4] Dang tai Gradle 8.5 di dong (khoang 100MB)..." -ForegroundColor Yellow
    $GradleUrl = "https://github.com/gradle/gradle/releases/download/v8.5.0/gradle-8.5-bin.zip"
    $GradleZip = Join-Path $ToolsDir "gradle.zip"
    
    curl.exe -A "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" -L -o $GradleZip $GradleUrl
    
    Write-Host "Dang giai nen Gradle 8.5..." -ForegroundColor Yellow
    Expand-Archive -Path $GradleZip -DestinationPath $ToolsDir -Force
    
    $ExtractedDir = Get-ChildItem -Path $ToolsDir -Directory | Where-Object { $_.Name -like "*gradle-8.5*" } | Select-Object -First 1
    if ($ExtractedDir -and $ExtractedDir.Name -ne "gradle-8.5") {
        Rename-Item -Path $ExtractedDir.FullName -NewName "gradle-8.5"
    }
    
    Remove-Item -Path $GradleZip -Force
    Write-Host "Thiet lap Gradle 8.5 thanh cong!" -ForegroundColor Green
} else {
    Write-Host "[2/4] Da tim thay Gradle 8.5 san co." -ForegroundColor Green
}

# 3. Tai va thiet lap Android SDK rut gon (De khong can cai dat Android Studio)
$SdkDir = Join-Path $ToolsDir "android-sdk"
if (!(Test-Path $SdkDir)) {
    Write-Host "[3/4] Dang tai bo Android SDK rut gon (Sieu nhe, khoang 120MB)..." -ForegroundColor Yellow
    New-Item -ItemType Directory -Force -Path $SdkDir | Out-Null
    
    $PlatformsDir = Join-Path $SdkDir "platforms"
    $BuildToolsDir = Join-Path $SdkDir "build-tools"
    New-Item -ItemType Directory -Force -Path $PlatformsDir | Out-Null
    New-Item -ItemType Directory -Force -Path $BuildToolsDir | Out-Null
    
    # A. Tai Platform 34
    Write-Host "Dang tai Platform SDK 34..." -ForegroundColor Yellow
    $PlatformUrl = "https://dl.google.com/android/repository/platform-34_r03.zip"
    $PlatformZip = Join-Path $ToolsDir "platform-34.zip"
    curl.exe -A "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" -L -o $PlatformZip $PlatformUrl
    
    Write-Host "Dang giai nen Platform SDK 34..." -ForegroundColor Yellow
    Expand-Archive -Path $PlatformZip -DestinationPath $PlatformsDir -Force
    # Google giai nen ra thu muc android-34, can dam bao dung ten
    $ExtractedPlat = Get-ChildItem -Path $PlatformsDir -Directory | Select-Object -First 1
    if ($ExtractedPlat -and $ExtractedPlat.Name -ne "android-34") {
        Rename-Item -Path $ExtractedPlat.FullName -NewName "android-34"
    }
    Remove-Item -Path $PlatformZip -Force

    # B. Tai Build Tools 34.0.0
    Write-Host "Dang tai Build Tools 34.0.0..." -ForegroundColor Yellow
    $BuildToolsUrl = "https://dl.google.com/android/repository/build-tools_r34-windows.zip"
    $BuildToolsZip = Join-Path $ToolsDir "build-tools.zip"
    curl.exe -A "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" -L -o $BuildToolsZip $BuildToolsUrl
    
    Write-Host "Dang giai nen Build Tools..." -ForegroundColor Yellow
    Expand-Archive -Path $BuildToolsZip -DestinationPath $BuildToolsDir -Force
    # Google dat ten thu muc giai nen mac dinh la android-14, can rename thanh 34.0.0
    $ExtractedTools = Get-ChildItem -Path $BuildToolsDir -Directory | Select-Object -First 1
    if ($ExtractedTools -and $ExtractedTools.Name -ne "34.0.0") {
        Rename-Item -Path $ExtractedTools.FullName -NewName "34.0.0"
    }
    Remove-Item -Path $BuildToolsZip -Force
    
    # C. Tu dong chap nhan cac dieu khoan ban quyen Android SDK (Accept Licenses)
    Write-Host "Dang thiet lap cac dieu khoan ban quyen Android SDK (Accept Licenses)..." -ForegroundColor Yellow
    $LicensesDir = Join-Path $SdkDir "licenses"
    if (!(Test-Path $LicensesDir)) {
        New-Item -ItemType Directory -Force -Path $LicensesDir | Out-Null
    }
    $SdkLicenseFile = Join-Path $LicensesDir "android-sdk-license"
    "8933bad161ad5c72650d9001c28177e058b4f475`r`n24333f8a63b6825ea9c5514f83c2829b004d1fee`rd975f25078a87dd4db4022f16c08a5ae5ab050c9" | Out-File -FilePath $SdkLicenseFile -Encoding ascii -Force

    $PreviewLicenseFile = Join-Path $LicensesDir "android-sdk-preview-license"
    "84831b9409646a918e30573bab4c9c91346d8abd" | Out-File -FilePath $PreviewLicenseFile -Encoding ascii -Force
    
    Write-Host "Thiet lap Android SDK thanh cong!" -ForegroundColor Green
} else {
    # Neu da co Android SDK san, van thiet lap lai licenses cho chac chan
    $LicensesDir = Join-Path $SdkDir "licenses"
    if (!(Test-Path $LicensesDir)) {
        New-Item -ItemType Directory -Force -Path $LicensesDir | Out-Null
    }
    $SdkLicenseFile = Join-Path $LicensesDir "android-sdk-license"
    "8933bad161ad5c72650d9001c28177e058b4f475`r`n24333f8a63b6825ea9c5514f83c2829b004d1fee`rd975f25078a87dd4db4022f16c08a5ae5ab050c9" | Out-File -FilePath $SdkLicenseFile -Encoding ascii -Force

    $PreviewLicenseFile = Join-Path $LicensesDir "android-sdk-preview-license"
    "84831b9409646a918e30573bab4c9c91346d8abd" | Out-File -FilePath $PreviewLicenseFile -Encoding ascii -Force

    Write-Host "[3/4] Da tim thay Android SDK san co." -ForegroundColor Green
}

# 4. Thiet lap bien moi truong tam thoi cho phien lam viec
Write-Host "[4/4] Dang khoi tao moi truong build..." -ForegroundColor Yellow
$env:JAVA_HOME = $JdkDir
$env:ANDROID_HOME = $SdkDir
$env:Path = "$JdkDir\bin;$GradleDir\bin;" + $env:Path

# Truoc khi build, tao file local.properties de chi dan Gradle tim SDK
$LocalPropsFile = Join-Path $PSScriptRoot "android-app\local.properties"
$EscapedSdkDir = $SdkDir -replace '\\', '\\\\'
"sdk.dir=$EscapedSdkDir" | Out-File -FilePath $LocalPropsFile -Encoding ascii -Force

# Cho phep chay tiep neu gradle co xuat thong tin ra luong stderr
$ErrorActionPreference = "Continue"

# 4.5. Dong bo va thiet lap Logo ung dung tu public/img/logo.png
Write-Host "[4.5] Dang dong bo va thiet lap Logo ung dung..." -ForegroundColor Yellow
$LogoSource = Join-Path $PSScriptRoot "public\img\logo.png"
$ResDir = Join-Path $PSScriptRoot "android-app\app\src\main\res"

if (Test-Path $LogoSource) {
    # Dinh nghia ham resize anh an toan bang .NET
    $ResizeScript = {
        param (
            [string]$SourcePath,
            [string]$TargetPath,
            [int]$Width,
            [int]$Height
        )
        try {
            Add-Type -AssemblyName System.Drawing
            $srcBmp = [System.Drawing.Image]::FromFile($SourcePath)
            $destBmp = New-Object System.Drawing.Bitmap($Width, $Height)
            $g = [System.Drawing.Graphics]::FromImage($destBmp)
            
            $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
            $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
            $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
            
            $g.DrawImage($srcBmp, 0, 0, $Width, $Height)
            $destBmp.Save($TargetPath, [System.Drawing.Imaging.ImageFormat]::Png)
            
            $g.Dispose()
            $destBmp.Dispose()
            $srcBmp.Dispose()
        } catch {
            # Fallback neu co loi .NET
            Copy-Item -Path $SourcePath -Destination $TargetPath -Force
        }
    }

    # Cac kich thuoc mipmap cua Android
    $Mipmaps = @(
        @{ Dir = "mipmap-mdpi"; Size = 48 },
        @{ Dir = "mipmap-hdpi"; Size = 72 },
        @{ Dir = "mipmap-xhdpi"; Size = 96 },
        @{ Dir = "mipmap-xxhdpi"; Size = 144 },
        @{ Dir = "mipmap-xxxhdpi"; Size = 192 }
    )

    foreach ($mip in $Mipmaps) {
        $TargetDir = Join-Path $ResDir $mip.Dir
        if (!(Test-Path $TargetDir)) {
            New-Item -ItemType Directory -Force -Path $TargetDir | Out-Null
        }
        $TargetFile = Join-Path $TargetDir "ic_launcher.png"
        & $ResizeScript -SourcePath $LogoSource -TargetPath $TargetFile -Width $mip.Size -Height $mip.Size
    }
    
    # Tao thu muc drawable va copy logo goc vao do
    $DrawableDir = Join-Path $ResDir "drawable"
    if (!(Test-Path $DrawableDir)) {
        New-Item -ItemType Directory -Force -Path $DrawableDir | Out-Null
    }
    Copy-Item -Path $LogoSource -Destination (Join-Path $DrawableDir "logo.png") -Force

    Write-Host "Dong bo logo va tao cac thu muc mipmap thanh cong!" -ForegroundColor Green
} else {
    Write-Host "Canh bao: Khong tim thay logo nguon tai $LogoSource. Bo qua buoc thiet lap logo." -ForegroundColor Yellow
}

# 5. Tien hanh build APK tu thu muc android-app
Write-Host ""
Write-Host "=== DANG BAT DAU BIEN DICH FILE APK (ASSEMBLE DEBUG) ===" -ForegroundColor Cyan
Write-Host "Qua trinh nay se dien ra trong khoang 1-2 phut..." -ForegroundColor Yellow

# Tat sach cac tien trinh Java/Gradle chay ngam cu de giai phong file lock tranh kẹt build
Write-Host "Dang don dep cac tien trinh Java/Gradle chay ngam cu de giai phong file lock..." -ForegroundColor Yellow
try {
    Stop-Process -Name "java" -Force -ErrorAction SilentlyContinue
} catch {}

$AndroidAppDir = Join-Path $PSScriptRoot "android-app"
Push-Location $AndroidAppDir

try {
    # Chay lenh build gradle
    & gradle assembleDebug --no-daemon --no-build-cache
    
    Pop-Location
    
    # Copy file APK ra ngoai thu muc goc
    $ApkPath = Join-Path $AndroidAppDir "app\build\outputs\apk\debug\app-debug.apk"
    $DestApk = Join-Path $PSScriptRoot "RomRaPOS.apk"
    
    if (Test-Path $ApkPath) {
        Copy-Item -Path $ApkPath -Destination $DestApk -Force
        
        # Copy file APK vao thu muc public de ho tro tai online
        $WebApk = Join-Path $PSScriptRoot "public\RomRaPOS.apk"
        Copy-Item -Path $ApkPath -Destination $WebApk -Force
        
        Write-Host ""
        Write-Host "==========================================================" -ForegroundColor Green
        Write-Host "   BUILD APK THANH CONG RUC RO!" -ForegroundColor Green
        Write-Host "   File cai dat cua ban da duoc tao ra tai:" -ForegroundColor Green
        Write-Host "   $DestApk" -ForegroundColor White
        Write-Host "   Va thu muc Web tinh tai:" -ForegroundColor Green
        Write-Host "   $WebApk" -ForegroundColor White
        Write-Host "==========================================================" -ForegroundColor Green
    } else {
        Write-Host "Loi: Khong tim thay file APK sau khi build." -ForegroundColor Red
    }
} catch {
    Pop-Location
    Write-Host ""
    Write-Host "CO LOI XAY RA TRONG QUA TRINH BUILD:" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    Write-Host "Vui long thu lai." -ForegroundColor Yellow
}
