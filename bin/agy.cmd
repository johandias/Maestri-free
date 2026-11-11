@echo off
setlocal enabledelayedexpansion

set "AGY_BIN="
if exist "%USERPROFILE%\.gemini\bin\agy.exe" (
    set "AGY_BIN=%USERPROFILE%\.gemini\bin\agy.exe"
) else if exist "%LOCALAPPDATA%\agy\bin\agy.exe" (
    set "AGY_BIN=%LOCALAPPDATA%\agy\bin\agy.exe"
)

if not defined AGY_BIN (
    python "%~dp0..\core\agent_cli.py" agy %*
    exit /b %ERRORLEVEL%
)

if "%~1"=="" (
    "%AGY_BIN%"
    exit /b %ERRORLEVEL%
)

set "FIRST_ARG=%~1"
set "FIRST_CHAR=%FIRST_ARG:~0,1%"

if "%FIRST_CHAR%"=="-" (
    "%AGY_BIN%" %*
    exit /b %ERRORLEVEL%
)

if /i "%FIRST_ARG%"=="help" ( "%AGY_BIN%" %* & exit /b %ERRORLEVEL% )
if /i "%FIRST_ARG%"=="update" ( "%AGY_BIN%" %* & exit /b %ERRORLEVEL% )
if /i "%FIRST_ARG%"=="plugin" ( "%AGY_BIN%" %* & exit /b %ERRORLEVEL% )
if /i "%FIRST_ARG%"=="plugins" ( "%AGY_BIN%" %* & exit /b %ERRORLEVEL% )
if /i "%FIRST_ARG%"=="mcp" ( "%AGY_BIN%" %* & exit /b %ERRORLEVEL% )
if /i "%FIRST_ARG%"=="models" ( "%AGY_BIN%" %* & exit /b %ERRORLEVEL% )
if /i "%FIRST_ARG%"=="changelog" ( "%AGY_BIN%" %* & exit /b %ERRORLEVEL% )
if /i "%FIRST_ARG%"=="acp" ( "%AGY_BIN%" %* & exit /b %ERRORLEVEL% )
if /i "%FIRST_ARG%"=="agent" ( "%AGY_BIN%" %* & exit /b %ERRORLEVEL% )
if /i "%FIRST_ARG%"=="agents" ( "%AGY_BIN%" %* & exit /b %ERRORLEVEL% )
if /i "%FIRST_ARG%"=="install" ( "%AGY_BIN%" %* & exit /b %ERRORLEVEL% )
if /i "%FIRST_ARG%"=="mic-serve" ( "%AGY_BIN%" %* & exit /b %ERRORLEVEL% )
if /i "%FIRST_ARG%"=="remote-control" ( "%AGY_BIN%" %* & exit /b %ERRORLEVEL% )

"%AGY_BIN%" -p "%*"
exit /b %ERRORLEVEL%

