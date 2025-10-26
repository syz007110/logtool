chcp 65001
@echo off
REM XML故障码转换工具 - Windows批处理脚本
REM 使用方法: convert_xml.bat input.xml [output.csv]

setlocal enabledelayedexpansion

if "%~1"=="" (
    echo 使用方法: convert_xml.bat input.xml [output.csv]
    echo.
    echo 示例:
    echo   convert_xml.bat FaultAnalysis_zh.xml
    echo   convert_xml.bat FaultAnalysis_zh.xml error_codes.csv
    echo.
    pause
    exit /b 1
)

set INPUT_FILE=%~1
set OUTPUT_FILE=%~2

REM 检查输入文件是否存在
if not exist "%INPUT_FILE%" (
    echo 错误: 输入文件不存在: %INPUT_FILE%
    pause
    exit /b 1
)

REM 如果没有指定输出文件，生成默认文件名
if "%OUTPUT_FILE%"=="" (
    for %%f in ("%INPUT_FILE%") do (
        set "OUTPUT_FILE=%%~nf_converted.csv"
    )
)

echo 开始转换XML文件...
echo 输入文件: %INPUT_FILE%
echo 输出文件: %OUTPUT_FILE%
echo.

REM 执行Python转换脚本
python xml_to_csv_converter.py "%INPUT_FILE%" -o "%OUTPUT_FILE%"

if %ERRORLEVEL% equ 0 (
    echo.
    echo ✅ 转换完成!
    echo 📁 输出文件: %OUTPUT_FILE%
) else (
    echo.
    echo ❌ 转换失败!
)

echo.
pause
