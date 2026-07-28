@echo off
echo Memulai Frontend (Next.js) dan Backend (Python)...

:: Buka terminal baru dan jalankan frontend Next.js
start cmd /k "echo Menjalankan Frontend Next.js di port 3001... && npm run dev"

:: Buka terminal baru dan jalankan backend Python (sesuaikan dengan command backend Anda)
:: Misalnya jika backend dijalankan dengan "python backend/main.py" atau uvicorn:
start cmd /k "echo Menjalankan Backend Python... && cd backend && uvicorn main:app --reload"

echo Proses telah dijalankan di jendela terpisah!
exit
