@echo off
title LuciVoid Backend (Local + Tunnel)
cd /d "%~dp0"
echo ============================================
echo  LuciVoid Audio Studio - Backend Lokal
echo  Biarkan jendela ini terbuka selama situs
echo  https://lucivoid-audio-studio.vercel.app
echo  dipakai. Tekan Ctrl+C atau tutup jendela
echo  ini untuk mematikan backend.
echo ============================================
echo.
node scripts/local-tunnel.js --update-vercel
echo.
echo Backend berhenti. Jendela akan tetap terbuka.
pause
