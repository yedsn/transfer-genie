@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion

:: ========================================
:: Transfer Genie 打包脚本
:: ========================================

:: 默认安装目录（可以修改）
set "INSTALL_DIR=D:\Program Files\TransferGenie文件传输助手"

:: 项目根目录（脚本在 scripts 目录下，需要返回上级目录）
set "SCRIPT_DIR=%~dp0"
cd /d "%SCRIPT_DIR%.."
set "PROJECT_DIR=%CD%"

echo ========================================
echo Transfer Genie 打包脚本
echo ========================================
echo.

:: 检查是否有自定义安装目录参数
if not "%~1"=="" (
    set "INSTALL_DIR=%~1"
    echo 使用自定义安装目录: !INSTALL_DIR!
) else (
    echo 使用默认安装目录: !INSTALL_DIR!
)
echo.

:: 询问是否需要重新编译
set /p "BUILD_CHOICE=是否需要重新编译? (y/n，默认 n): "
if /i "!BUILD_CHOICE!"=="y" (
    echo.
    echo [1/3] 开始编译...
    echo 执行命令: cargo tauri build
    cargo tauri build
    if !errorlevel! neq 0 (
        echo.
        echo [错误] 编译失败！
        pause
        exit /b 1
    )
    echo [✓] 编译完成
) else (
    echo.
    echo [跳过编译] 使用现有的构建文件
)

:: 查找生成的 exe 文件
echo.
echo [2/3] 查找生成的 exe 文件...

set "EXE_FILE="
set "RELEASE_DIR=%PROJECT_DIR%\target\release"
set "BUNDLE_DIR=%RELEASE_DIR%\bundle"

:: 优先查找 release 目录中的 exe（portable 版本）
if exist "%RELEASE_DIR%\transfer-genie.exe" (
    set "EXE_FILE=%RELEASE_DIR%\transfer-genie.exe"
    set "EXE_TYPE=portable"
) else if exist "%RELEASE_DIR%\Transfer Genie.exe" (
    set "EXE_FILE=%RELEASE_DIR%\Transfer Genie.exe"
    set "EXE_TYPE=portable"
) else if exist "%BUNDLE_DIR%\nsis\Transfer Genie_0.1.0_x64-setup.exe" (
    set "EXE_FILE=%BUNDLE_DIR%\nsis\Transfer Genie_0.1.0_x64-setup.exe"
    set "EXE_TYPE=installer"
)

if "!EXE_FILE!"=="" (
    echo.
    echo [错误] 未找到编译后的 exe 文件！
    echo 请先运行 'cargo tauri build' 进行编译。
    echo.
    echo 查找路径:
    echo   - %RELEASE_DIR%\
    echo   - %BUNDLE_DIR%\nsis\
    pause
    exit /b 1
)

echo [✓] 找到 exe 文件: !EXE_FILE!
echo     类型: !EXE_TYPE!

:: 创建目标目录
echo.
echo [3/3] 复制文件到目标目录...

if not exist "!INSTALL_DIR!" (
    echo 创建目录: !INSTALL_DIR!
    mkdir "!INSTALL_DIR!" 2>nul
    if !errorlevel! neq 0 (
        echo.
        echo [错误] 无法创建目录，可能需要管理员权限！
        echo 请尝试以管理员身份运行此脚本。
        pause
        exit /b 1
    )
)

:: 复制 exe 文件
for %%F in ("!EXE_FILE!") do set "EXE_NAME=%%~nxF"
set "TARGET_FILE=!INSTALL_DIR!\!EXE_NAME!"

echo 复制: !EXE_FILE!
echo   到: !TARGET_FILE!

copy /y "!EXE_FILE!" "!TARGET_FILE!" >nul
if !errorlevel! neq 0 (
    echo.
    echo [错误] 复制文件失败，可能需要管理员权限！
    echo 请尝试以管理员身份运行此脚本。
    pause
    exit /b 1
)

:: 如果是 portable 版本，复制相关资源文件
if "!EXE_TYPE!"=="portable" (
    echo.
    echo 复制相关资源文件...
    
    :: 创建图标目录
    if not exist "!INSTALL_DIR!\icons" mkdir "!INSTALL_DIR!\icons" 2>nul
    
    :: 复制图标
    if exist "%PROJECT_DIR%icons\icon.ico" (
        copy /y "%PROJECT_DIR%icons\icon.ico" "!INSTALL_DIR!\icons\" >nul
        echo   - icons\icon.ico
    )
    if exist "%PROJECT_DIR%icons\icon.png" (
        copy /y "%PROJECT_DIR%icons\icon.png" "!INSTALL_DIR!\icons\" >nul
        echo   - icons\icon.png
    )
    
    :: 复制 README
    if exist "%PROJECT_DIR%README.md" (
        copy /y "%PROJECT_DIR%README.md" "!INSTALL_DIR%\" >nul
        echo   - README.md
    )
)

echo.
echo ========================================
echo [✓] 打包完成！
echo ========================================
echo.
echo 安装位置: !INSTALL_DIR!
echo 可执行文件: !EXE_NAME!
echo.

:: 询问是否打开目标目录
set /p "OPEN_DIR=是否打开安装目录? (y/n，默认 n): "
if /i "!OPEN_DIR!"=="y" (
    explorer "!INSTALL_DIR!"
) else (
    echo.
    echo 完成。
)

echo.
pause

