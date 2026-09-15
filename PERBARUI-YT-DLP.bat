@echo off
title Perbarui yt-dlp (LuciVoid Audio Studio)
cd /d "%~dp0server\bin"
echo ============================================
echo  Perbarui yt-dlp - LuciVoid Audio Studio
echo  Jalankan ini kalau import YouTube mulai
echo  sering gagal: extractor YouTube berubah
echo  terus, jadi binary yang tua lambat-laun
echo  pasti mulai error.
echo ============================================
echo.

where curl >nul 2>nul
if errorlevel 1 goto nocurl

if not exist yt-dlp.exe goto unduh
set "OLDV="
for /f "delims=" %%v in ('yt-dlp.exe --version') do set "OLDV=%%v"
echo Binary lama: versi %OLDV% - dibackup sebagai yt-dlp.exe.bak-%OLDV%
move /y yt-dlp.exe "yt-dlp.exe.bak-%OLDV%" >nul

:unduh
echo Mengunduh yt-dlp terbaru dari GitHub (sumber resmi)...
curl -sL -o yt-dlp.exe "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe"
if errorlevel 1 goto gagal
set "NEWV="
for /f "delims=" %%v in ('yt-dlp.exe --version') do set "NEWV=%%v"
if not defined NEWV goto gagal
echo.
echo SELESAI - yt-dlp sekarang versi %NEWV%
echo Restart JALANKAN-BACKEND.bat agar versi baru dipakai.
echo (File backup lama boleh dihapus kalau semuanya sudah lancar.)
pause
exit /b 0

:nocurl
echo curl tidak ditemukan di Windows ini.
echo Unduh manual dari: https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe
echo lalu letakkan di server\bin\yt-dlp.exe
pause
exit /b 1

:gagal
echo UNDUH GAGAL - memulihkan binary lama...
set "RESTORE="
for /f "delims=" %%f in ('dir /b "yt-dlp.exe.bak-*" 2^>nul') do set "RESTORE=%%f"
if defined RESTORE move /y "%RESTORE%" yt-dlp.exe >nul
if defined RESTORE echo Dipulihkan ke versi lama (%RESTORE%). Cek koneksi internet lalu coba lagi.
pause
exit /b 1
