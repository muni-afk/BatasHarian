@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js belum terpasang atau belum masuk PATH.
  echo Instal Node.js LTS dari https://nodejs.org/ lalu tutup dan buka lagi terminal.
  echo Setelah itu, jalankan file ini kembali.
  pause
  exit /b 1
)
if not exist data mkdir data
echo Menjalankan BatasHarian...
echo Tunggu 2-3 detik. Jendela server akan tetap terbuka selama aplikasi dipakai.
start "BatasHarian Server" /D "%~dp0" cmd /k "node server.js"
timeout /t 3 /nobreak >nul
start "" "http://127.0.0.1:3000"
endlocal
