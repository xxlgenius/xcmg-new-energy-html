@echo off
rem XCMG LED wall launcher: opens index.html fullscreen (Edge kiosk first, then Chrome, then default browser)
set "PAGE=%~dp0index.html"

set "EDGE=C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
if not exist "%EDGE%" set "EDGE=C:\Program Files\Microsoft\Edge\Application\msedge.exe"
if exist "%EDGE%" (
  start "" "%EDGE%" --kiosk "%PAGE%" --edge-kiosk-type=fullscreen
  exit /b
)

set "CHROME=C:\Program Files\Google\Chrome\Application\chrome.exe"
if not exist "%CHROME%" set "CHROME=C:\Program Files (x86)\Google\Chrome\Application\chrome.exe"
if exist "%CHROME%" (
  start "" "%CHROME%" --kiosk "%PAGE%"
  exit /b
)

start "" "%PAGE%"
