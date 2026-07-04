# 🧠 Knowledge Bot

A local PDF knowledge bot built with **FastAPI** and **React**. Upload PDF documents, index them locally in memory, and ask questions over the extracted content.

## Features

- Upload multiple PDF files
- Extract text from PDF pages
- Create local embeddings with `sentence-transformers`
- Search similar document passages with `scikit-learn`
- Ask questions via a React chat interface

## Setup

1. Open PowerShell and navigate to the backend project:

   ```powershell
   cd C:\Users\DELL\Desktop\IAIP\frontend\knowledgebot-src
   ```

2. Create and activate Python 3.11 venv:

   ```powershell
   py -3.11 -m venv venv311
   .\venv311\Scripts\Activate.ps1
   ```

3. Install backend dependencies:

   ```powershell
   python -m pip install --upgrade pip
   python -m pip install -r requirements.txt
   ```

4. Install the frontend dependencies and start the UI:

   ```powershell
   cd frontend
   npm install
   npm run dev
   ```

5. Start the backend server from the backend directory:

   ```powershell
   cd ..
   .\venv311\Scripts\python.exe -m uvicorn api:app --reload --port 8000
   ```

6. Open the Vite URL shown in the terminal (usually `http://localhost:5173`).

## Notes

- This implementation is fully local and does not require Pinecone or Groq.
- Uploaded PDF text is kept in memory for the duration of the backend process.
- Restarting the backend will clear the indexed documents.
