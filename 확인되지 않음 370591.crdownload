@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0"

call :CHECKIDENTITY

:MENU
cls
echo ============================================
echo   Git 동기화 도구  (%cd%)
echo ============================================
echo.
call :STATUSLINE
echo.
echo   1. 나갈 때     - 지금까지 작업 저장 + 업로드 (push)
echo   2. 도착했을 때  - 최신 작업 받아오기 (pull)
echo   3. 상태 자세히 보기 (커밋 로그 + 브랜치 목록)
echo   4. 별도 브랜치(worktree) 지금 브랜치로 병합
echo   5. 이 PC 초기 설정 확인 (이름/이메일)
echo   0. 종료
echo.
set /p sel="번호 선택: "

if "%sel%"=="1" goto PUSH
if "%sel%"=="2" goto PULL
if "%sel%"=="3" goto STATUS
if "%sel%"=="4" goto WORKTREE
if "%sel%"=="5" goto IDENTITY
if "%sel%"=="0" exit
goto MENU

:: --------------------------------------------
:CHECKIDENTITY
git config user.email >nul 2>&1
if errorlevel 1 (
    echo.
    echo   [경고] 이 PC에는 git 사용자 정보^(이름/이메일^)가 설정되어 있지 않습니다.
    echo   커밋 시 오류가 날 수 있습니다. 메뉴 5번으로 먼저 설정하세요.
    echo.
    pause
)
goto :eof

:: --------------------------------------------
:STATUSLINE
for /f "delims=" %%b in ('git rev-parse --abbrev-ref HEAD 2^>nul') do set curbranch=%%b
git fetch --quiet 2>nul
set ahead=0
set behind=0
for /f "tokens=1,2" %%x in ('git rev-list --left-right --count HEAD...origin/%curbranch% 2^>nul') do (
    set ahead=%%x
    set behind=%%y
)
echo   현재 브랜치: %curbranch%   (내가 %ahead%개 앞섬 / 원격이 %behind%개 앞섬)
git status --porcelain > "%temp%\gs_quick.txt"
for %%A in ("%temp%\gs_quick.txt") do set qsize=%%~zA
if not "%qsize%"=="0" (
    echo   ※ 커밋 안 된 변경사항이 있습니다.
)
goto :eof

:: --------------------------------------------
:PUSH
echo.
echo [1/3] 변경사항 확인 중...
git status --porcelain > "%temp%\gs_check.txt"
for %%A in ("%temp%\gs_check.txt") do set size=%%~zA
if "%size%"=="0" (
    echo 변경된 파일이 없습니다. 바로 push만 시도합니다.
    goto DOPUSH
)

echo 변경된 파일:
git status --short
echo.
set /p msg="커밋 메시지 입력 (엔터=자동 시간기록): "
if "%msg%"=="" set msg=sync: %date% %time%

echo.
echo [2/3] 커밋 중...
git add -A
git commit -m "%msg%"

:DOPUSH
echo.
echo [3/3] 원격 저장소로 업로드 중...
git push
echo.
echo ============================================
echo   완료! 이제 다른 PC에서 옵션 2로 받으세요.
echo ============================================
pause
goto MENU

:: --------------------------------------------
:PULL
echo.
echo [1/2] 로컬에 커밋 안 된 변경사항 확인 중...
git status --porcelain > "%temp%\gs_check.txt"
for %%A in ("%temp%\gs_check.txt") do set size=%%~zA
if not "%size%"=="0" (
    echo.
    echo   [경고] 이 PC에 커밋되지 않은 변경사항이 있습니다:
    git status --short
    echo.
    echo   받아오기 전에 처리해야 합니다.
    echo   1. 지금 이 변경사항도 커밋하고 진행
    echo   2. 임시 보관^(stash^)만 하고 진행 ^(나중에 git stash pop으로 복원^)
    echo   3. 취소하고 메뉴로 돌아가기
    set /p sub="선택: "
    if "!sub!"=="1" (
        set /p msg2="커밋 메시지: "
        if "!msg2!"=="" set msg2=local: %date% %time%
        git add -A
        git commit -m "!msg2!"
    )
    if "!sub!"=="2" (
        git stash
        echo stash 완료. pull 이후 필요하면 git stash pop 을 직접 실행하세요.
    )
    if "!sub!"=="3" goto MENU
)

echo.
echo [2/2] 최신 내용 받아오는 중...
git pull

echo.
git status --porcelain | findstr /b /r "UU AA DD UA AU" >nul
if not errorlevel 1 (
    echo.
    echo   ============================================
    echo     [충돌 발생] 아래 파일들이 병합 충돌 상태입니다.
    echo   ============================================
    git status --porcelain | findstr /b /r "UU AA DD UA AU"
    echo.
    echo   .bkit\ 또는 .omc\ 폴더 파일이면 자동 생성 파일이니
    echo   .gitignore 에 등록하고 git rm --cached 로 추적만 끊으면 됩니다.
    echo   그 외 실제 소스 파일은 Antigravity ^(Source Control 패널^)나
    echo   VS Code에서 직접 열어 충돌 표시^(^<^<^<^<^<^<^< / ======= / ^>^>^>^>^>^>^>^)를
    echo   해결한 뒤 git add . 하고 여기서 다시 1번^(push^)을 누르세요.
    echo.
) else (
    echo ============================================
    echo   완료! git log -1 --stat 으로 확인해보세요.
    echo ============================================
)
pause
goto MENU

:: --------------------------------------------
:STATUS
echo.
git status
echo.
echo --- 최근 커밋 5개 ---
git log --oneline -5
echo.
echo --- worktree / 브랜치 목록 ---
git worktree list
echo.
git branch -a
echo.
pause
goto MENU

:: --------------------------------------------
:WORKTREE
echo.
echo ============================================
echo   별도 브랜치를 지금 브랜치로 합치기
echo ============================================
echo.
echo 지금 브랜치: %curbranch%
echo.
echo ^(설명^) 다른 브랜치에서 따로 작업한 내용을, 지금 보고 있는
echo 브랜치^(%curbranch%^) 하나로 합쳐주는 기능입니다.
echo 합친 뒤 1번^(나갈 때^)으로 push 해야 다른 PC에서도 보입니다.
echo.

set count=0
for /f "tokens=*" %%b in ('git branch --list ^| findstr /v "^\*"') do (
    set /a count+=1
    set "branch!count!=%%b"
)

if "%count%"=="0" (
    echo 지금 병합할 수 있는 다른 브랜치가 없습니다.
    echo ^(현재 %curbranch% 하나만 있습니다. 그냥 돌아가셔도 됩니다.^)
    echo.
    pause
    goto MENU
)

echo 아래 중에서 지금 브랜치로 합치고 싶은 것을 번호로 선택하세요.
echo.
for /l %%i in (1,1,%count%) do (
    call echo   %%i. %%branch%%i%%
)
echo   0. 취소하고 메뉴로 돌아가기
echo.
set /p bsel="번호 선택: "
if "%bsel%"=="0" goto MENU

call set "wbranch=%%branch%bsel%%%"
if "%wbranch%"=="" (
    echo.
    echo 잘못된 번호입니다. 목록에 있는 번호만 입력하세요.
    echo.
    pause
    goto WORKTREE
)

echo.
echo 선택한 브랜치: %wbranch%
echo.
echo ^(미리보기^) 이 브랜치에만 있고 %curbranch% 에는 아직 없는 커밋들:
echo.
git log %curbranch%..%wbranch% --oneline
echo.
echo 위 커밋들이 전부 %curbranch% 로 들어가게 됩니다.
set /p confirm="이대로 병합할까요? (Y/N): "
if /i not "%confirm%"=="Y" goto MENU

echo.
echo 병합 중...
git merge %wbranch%
echo.
git status --porcelain | findstr /b /r "UU AA DD UA AU" >nul
if not errorlevel 1 (
    echo   ============================================
    echo     [충돌 발생] 아래 파일들이 자동으로 합쳐지지 못했습니다.
    echo   ============================================
    git status --porcelain | findstr /b /r "UU AA DD UA AU"
    echo.
    echo   .bkit\ 또는 .omc\ 폴더 파일이면 자동 생성 파일이니
    echo   .gitignore 에 등록하고 git rm --cached 로 추적만 끊으면 됩니다.
    echo   그 외 실제 소스 파일은 Antigravity ^(Source Control 패널^)나
    echo   VS Code에서 직접 열어 충돌 표시^(^<^<^<^<^<^<^< / ======= / ^>^>^>^>^>^>^>^)를
    echo   해결한 뒤 git add . 하고 여기서 1번^(나갈 때^)을 눌러 push 하세요.
) else (
    echo ============================================
    echo   병합 완료! 이제 1번^(나갈 때^)을 눌러 push 하세요.
    echo ============================================
)
echo.
pause
goto MENU

:: --------------------------------------------
:IDENTITY
echo.
echo 현재 설정된 사용자 정보:
git config user.name
git config user.email
echo.
set /p newname="새 이름 입력 (변경 안 하려면 엔터): "
if not "%newname%"=="" git config --global user.name "%newname%"
set /p newemail="새 이메일 입력 (변경 안 하려면 엔터): "
if not "%newemail%"=="" git config --global user.email "%newemail%"
echo.
echo 설정 완료.
pause
goto MENU
