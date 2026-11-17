@echo off
chcp 65001 >nul
REM =====================================================================
REM  행복네컷 키오스크 실행 (Windows + Chrome)
REM   --kiosk                         : 전체화면 고정 (종료: Alt+F4)
REM   --kiosk-printing                : 인쇄 창 없이 "기본 프린터"로 바로 인쇄
REM   --use-fake-ui-for-media-stream  : 카메라 권한 창 자동 허용
REM   --user-data-dir                 : 평소 쓰는 크롬과 분리된 전용 프로필
REM =====================================================================
set "APP=%~dp0index.html"
set "CHROME=%ProgramFiles%\Google\Chrome\Application\chrome.exe"
if not exist "%CHROME%" set "CHROME=%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"
if not exist "%CHROME%" set "CHROME=%LocalAppData%\Google\Chrome\Application\chrome.exe"
if not exist "%CHROME%" (
  echo Chrome을 찾을 수 없습니다. Google Chrome을 설치해 주세요.
  pause
  exit /b 1
)
set "URL=file:///%APP:\=/%"
start "" "%CHROME%" --kiosk --kiosk-printing --use-fake-ui-for-media-stream --autoplay-policy=no-user-gesture-required --no-first-run --user-data-dir="%~dp0.chrome-kiosk" "%URL%"
