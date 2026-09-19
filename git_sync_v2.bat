@echo off
rem ============================================================
rem  Git 동기화 도구 v2
rem  - 올리기 전에 올라갈 파일 목록을 보여 주고 확인을 받습니다.
rem  - 받기는 병합 커밋이 생기지 않는 방식을 먼저 시도합니다.
rem  - 이 파일은 CP949 (한국어 Windows 기본) 인코딩으로 저장해야 합니다.
rem ============================================================
setlocal enabledelayedexpansion
cd /d "%~dp0"

where git >nul 2>&1
if errorlevel 1 (
    echo.
    echo   git 을 찾을 수 없습니다. Git for Windows 설치 여부를 확인하세요.
    pause
    exit /b 1
)

call :CHECKIDENTITY

:MENU
set "sel="
cls
echo ============================================
echo   Git 동기화 도구 v2  ^(%cd%^)
echo ============================================
echo.
call :STATUSLINE
echo.
echo   1. 나갈 때        내 작업을 저장하고 GitHub에 올립니다 ^(push^)
echo   2. 도착했을 때    GitHub의 최신 작업을 받아옵니다 ^(pull^)
echo   3. 상태 자세히 보기      읽기만 하며 아무것도 바뀌지 않습니다
echo   4. 별도 브랜치^(worktree^)를 지금 브랜치로 병합
echo   5. 이 PC 초기 설정 확인 ^(이름/이메일^)
echo   6. 이 PC의 Claude Code 프로젝트 규칙 확인      읽기만 합니다
echo   0. 종료
echo.
echo   올리기 전에 올라갈 파일 목록이 나옵니다. 고객정보나 업무 자료가 없는지 꼭 확인하세요.
echo.
set /p "sel=번호 선택: "

if "!sel!"=="1" goto PUSH
if "!sel!"=="2" goto PULL
if "!sel!"=="3" goto STATUS
if "!sel!"=="4" goto WORKTREE
if "!sel!"=="5" goto IDENTITY
if "!sel!"=="6" goto CLAUDECHECK
if "!sel!"=="0" exit
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
:: 현재 브랜치와 ahead/behind 개수를 계산합니다.
:CALCAHEAD
set "curbranch="
for /f "delims=" %%b in ('git rev-parse --abbrev-ref HEAD 2^>nul') do set "curbranch=%%b"
set "ahead=0"
set "behind=0"
for /f "tokens=1,2" %%x in ('git rev-list --left-right --count HEAD...origin/%curbranch% 2^>nul') do (
    set "ahead=%%x"
    set "behind=%%y"
)
goto :eof

:: --------------------------------------------
:STATUSLINE
git fetch --quiet 2>nul
call :CALCAHEAD
echo   현재 브랜치: %curbranch%    내가 !ahead!개 앞섬, GitHub가 !behind!개 앞섬
git status --porcelain > "%temp%\gs_quick.txt"
set "qsize=0"
for %%A in ("%temp%\gs_quick.txt") do set "qsize=%%~zA"
if not "!qsize!"=="0" echo   ※ 저장^(커밋^) 안 된 변경이 있습니다.
if not "!ahead!"=="0" echo   ※ 아직 GitHub에 올리지 않은 커밋이 있습니다. 메뉴 1번
if not "!behind!"=="0" echo   ※ GitHub에 받지 않은 내용이 있습니다. 메뉴 2번
goto :eof

:: --------------------------------------------
:: 커밋 메시지를 입력받아 변수 MSG 에 넣습니다. 큰따옴표는 제거합니다.
:ASKMSG
set "MSG="
set /p "MSG=커밋 메시지 입력 (엔터=자동 시간기록, 큰따옴표는 쓰지 마세요): "
if not defined MSG set "MSG=sync: %date% %time%"
set "MSG=!MSG:"=!"
goto :eof

:: --------------------------------------------
:: 올라가면 안 될 수 있는 파일이 있는지 검사합니다. 결과는 RISK 변수.
:RISKCHECK
set "RISK=0"
git status --porcelain > "%temp%\gs_list.txt"
findstr /v /r /c:"^ D" /c:"^D " "%temp%\gs_list.txt" > "%temp%\gs_add.txt"
findstr /i /r /c:"\.zip" /c:"\.crdownload" /c:"\.bak" /c:"\.env" /c:"\.pem" /c:"\.key" /c:"\.bundle" /c:"backup" "%temp%\gs_add.txt" > "%temp%\gs_risk.txt" 2>nul
set "rsize=0"
for %%A in ("%temp%\gs_risk.txt") do set "rsize=%%~zA"
if not "!rsize!"=="0" set "RISK=1"
goto :eof

:: --------------------------------------------
:: 변경 목록을 보여 주고, 확인을 받은 뒤 전부 커밋합니다. 결과는 COMMITOK 변수.
:COMMITALL
set "COMMITOK=0"
echo.
echo   저장^(커밋^)할 변경 목록입니다.  M=수정  A=추가  D=삭제  ??=새 파일
git status --short
call :RISKCHECK
if "!RISK!"=="1" (
    echo.
    echo   [주의] 올라가면 안 될 수 있는 파일이 포함돼 있습니다:
    type "%temp%\gs_risk.txt"
    echo.
    echo   압축파일, 백업, 다운로드 임시파일, 키 파일이 아닌지 확인하세요.
    set "yes2="
    set /p "yes2=그래도 포함해서 진행하려면 YES 를 입력하세요: "
    if /i not "!yes2!"=="YES" (
        echo.
        echo   취소했습니다. 아무것도 저장하거나 올리지 않았습니다.
        goto :eof
    )
)
echo.
set "go="
set /p "go=위 목록을 모두 저장할까요? y 또는 n: "
if /i not "!go!"=="y" (
    echo.
    echo   취소했습니다. 아무것도 저장하거나 올리지 않았습니다.
    goto :eof
)
call :ASKMSG
echo.
echo   저장^(커밋^) 중...
git add -A
git commit -m "!MSG!"
if errorlevel 1 (
    echo.
    echo   [오류] 저장에 실패했습니다. 위 메시지를 확인하세요.
    goto :eof
)
set "COMMITOK=1"
goto :eof

:: --------------------------------------------
:PUSH
echo.
echo [1/4] 상태를 확인합니다. GitHub 최신 정보도 함께 확인합니다.
git fetch --quiet 2>nul
call :CALCAHEAD
if not "!behind!"=="0" (
    echo.
    echo   [중단] GitHub에 이 PC가 아직 받지 않은 내용이 !behind!개 있습니다.
    echo   먼저 메뉴 2번으로 받은 뒤 다시 올려 주세요. 아무것도 올리지 않았습니다.
    echo.
    pause
    goto MENU
)
git status --porcelain > "%temp%\gs_check.txt"
set "size=0"
for %%A in ("%temp%\gs_check.txt") do set "size=%%~zA"
if "!size!"=="0" (
    if "!ahead!"=="0" (
        echo.
        echo   올릴 내용이 없습니다. 이미 GitHub와 같은 상태입니다.
        pause
        goto MENU
    )
    echo.
    echo   저장할 변경은 없고, 이미 저장된 커밋 !ahead!개를 올립니다.
    goto SHOWPUSH
)
echo.
echo [2/4] 저장 단계
call :COMMITALL
if not "!COMMITOK!"=="1" (
    echo.
    echo   저장하지 않았으므로 올리지 않았습니다.
    pause
    goto MENU
)

:SHOWPUSH
call :CALCAHEAD
echo.
echo [3/4] GitHub에 올라갈 내용입니다.
echo.
echo   올라갈 커밋:
git log --oneline origin/%curbranch%..HEAD
echo.
echo   올라갈 파일 목록 ^(A=추가 M=수정 D=삭제^):
git diff --name-status origin/%curbranch%..HEAD
echo.
echo   이 내용이 GitHub에 올라갑니다. 고객정보나 업무 자료가 없는지 확인하세요.
set "go2="
set /p "go2=GitHub에 올릴까요? y 또는 n: "
if /i not "!go2!"=="y" (
    echo.
    echo   올리지 않았습니다. 저장한 커밋은 이 PC에 남아 있습니다.
    pause
    goto MENU
)
echo.
echo [4/4] GitHub로 올리는 중...
git push
if errorlevel 1 (
    echo.
    echo   [오류] 올리기에 실패했습니다. 위 메시지를 확인하세요.
) else (
    echo.
    echo   ============================================
    echo     올리기 완료. 다른 PC에서는 메뉴 2번으로 받으세요.
    echo   ============================================
)
pause
goto MENU

:: --------------------------------------------
:PULL
echo.
echo [1/3] GitHub 최신 정보를 확인합니다...
git fetch --quiet 2>nul
call :CALCAHEAD
if "!behind!"=="0" (
    echo.
    echo   받을 내용이 없습니다. 이미 최신입니다.
    pause
    goto MENU
)
git status --porcelain > "%temp%\gs_check.txt"
set "size=0"
for %%A in ("%temp%\gs_check.txt") do set "size=%%~zA"
if not "!size!"=="0" (
    echo.
    echo   [경고] 이 PC에 저장되지 않은 변경사항이 있습니다:
    git status --short
    echo.
    echo   받아오기 전에 처리해야 합니다.
    echo   1. 이 변경도 저장^(커밋^)하고 진행
    echo   2. 임시 보관^(stash^)만 하고 진행. 나중에 git stash pop 으로 복원
    echo   3. 취소하고 메뉴로 돌아가기
    set "sub="
    set /p "sub=선택: "
    if "!sub!"=="1" goto PULLCOMMIT
    if "!sub!"=="2" goto PULLSTASH
    goto MENU
)
goto PULLSHOW

:PULLCOMMIT
call :COMMITALL
if not "!COMMITOK!"=="1" (
    echo.
    echo   저장하지 않았으므로 받기를 중단합니다.
    pause
    goto MENU
)
goto PULLSHOW

:PULLSTASH
git stash
echo   임시 보관 완료. 받은 뒤 필요하면 git stash pop 을 직접 실행하세요.

:PULLSHOW
echo.
echo [2/3] 받으면 바뀌는 파일 목록입니다. ^(A=추가 M=수정 D=삭제^)
git diff --name-status HEAD..origin/%curbranch%
echo.
set "go3="
set /p "go3=위 내용으로 받을까요? y 또는 n: "
if /i not "!go3!"=="y" (
    echo.
    echo   취소했습니다. 아무것도 받지 않았습니다.
    pause
    goto MENU
)
echo.
echo [3/3] 받는 중...
git pull --ff-only
if errorlevel 1 (
    echo.
    echo   [알림] 앞으로 감기 방식으로는 받을 수 없습니다.
    echo   이 PC와 GitHub 양쪽에 서로 다른 작업이 있어서 이력이 갈라졌다는 뜻입니다.
    echo   병합 방식으로 받으면 병합 커밋이 하나 생기고, 같은 파일을 고쳤다면 충돌이 날 수 있습니다.
    set "go4="
    set /p "go4=병합 방식으로 다시 받을까요? y 또는 n, 모르겠으면 n: "
    if /i "!go4!"=="y" git pull --no-rebase --no-edit
)

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
    echo   ============================================
    echo     받기 끝. 최근 기록은 메뉴 3번에서 확인할 수 있습니다.
    echo   ============================================
)
pause
goto MENU

:: --------------------------------------------
:STATUS
echo.
git status -sb
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
set "bsel="
set "wbranch="
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
set /p "bsel=번호 선택: "
if "!bsel!"=="0" goto MENU
if "!bsel!"=="" goto WORKTREE

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
set "confirm="
set /p "confirm=이대로 병합할까요? (Y/N): "
if /i not "!confirm!"=="Y" goto MENU

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
set "newname="
set /p "newname=새 이름 입력 (변경 안 하려면 엔터): "
if not "!newname!"=="" git config --global user.name "!newname!"
set "newemail="
set /p "newemail=새 이메일 입력 (변경 안 하려면 엔터): "
if not "!newemail!"=="" git config --global user.email "!newemail!"
echo.
echo 설정 완료.
pause
goto MENU

:: --------------------------------------------
:CLAUDECHECK
echo.
echo 이 PC의 Claude Code 프로젝트 규칙 확인 ^(읽기만 합니다^)
echo.
set "ROOT="
for /f "delims=" %%r in ('git rev-parse --show-toplevel 2^>nul') do set "ROOT=%%r"
echo   저장소 위치: !ROOT!
set "P=!ROOT!/it_audit_project"
echo.
echo   [프로젝트 파일]  git 으로 받은 것
for %%f in ("CLAUDE.md" ".claude/settings.json" ".claude/agents/reviewer.md" ".claude/agents/tester.md") do (
    if exist "!P!/%%~f" (echo     [있음] %%~f) else (echo     [없음] %%~f)
)
if exist "!P!/CLAUDE.md" for %%A in ("!P!/CLAUDE.md") do if %%~zA EQU 0 echo     [주의] CLAUDE.md 가 비어 있습니다. Claude Code가 규칙을 읽지 못합니다.
echo.
echo   [이 PC에만 있는 것]  git 으로 옮겨지지 않으니 직접 확인
if exist "%USERPROFILE%\.claude\CLAUDE.md" (echo     [있음] 전역 CLAUDE.md) else (echo     [없음] 전역 CLAUDE.md  다른 PC에서 복사하세요)
where claude >nul 2>&1
if errorlevel 1 (echo     [없음] claude 명령. Claude Code 설치 여부를 확인하세요) else (echo     [있음] claude 명령)
echo.
pause
goto MENU
