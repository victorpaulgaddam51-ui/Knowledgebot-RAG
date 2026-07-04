import os
import tempfile
import uuid
from typing import List

from dotenv import load_dotenv
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from pypdf import PdfReader
from sentence_transformers import SentenceTransformer
from sklearn.neighbors import NearestNeighbors
import numpy as np

load_dotenv()

EMBEDDING_MODEL_NAME = "sentence-transformers/all-MiniLM-L6-v2"
EMBEDDING_MODEL = SentenceTransformer(EMBEDDING_MODEL_NAME)

app = FastAPI(title="Knowledge Bot API")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

sessions: dict[str, list[dict]] = {}
vector_store = {
    "docs": [],
    "embeddings": None,
    "index": None,
}


class ChatRequest(BaseModel):
    session_id: str
    question: str


class ChatResponse(BaseModel):
    answer: str
    sources: List[dict]
    session_id: str


class StatusResponse(BaseModel):
    index_ready: bool
    document_count: int


def clean_text(text: str) -> str:
    return " ".join(text.strip().split())


def chunk_text(text: str, chunk_size: int = 800, overlap: int = 100) -> List[str]:
    cleaned = clean_text(text)
    if len(cleaned) <= chunk_size:
        return [cleaned]

    chunks = []
    start = 0
    while start < len(cleaned):
        end = min(len(cleaned), start + chunk_size)
        chunk = cleaned[start:end]
        if end < len(cleaned):
            last_space = chunk.rfind(" ")
            if last_space > int(chunk_size * 0.6):
                end = start + last_space
                chunk = cleaned[start:end]
        chunks.append(chunk.strip())
        start = max(end - overlap, end)
    return [c for c in chunks if c]


def build_index():
    if not vector_store["docs"]:
        vector_store["embeddings"] = None
        vector_store["index"] = None
        return

    embeddings = np.vstack([doc["embedding"] for doc in vector_store["docs"]])
    vector_store["embeddings"] = embeddings
    vector_store["index"] = NearestNeighbors(n_neighbors=min(10, len(embeddings)), metric="cosine")
    vector_store["index"].fit(embeddings)


def embed_texts(texts: List[str]) -> np.ndarray:
    return EMBEDDING_MODEL.encode(texts, convert_to_numpy=True, normalize_embeddings=True)


@app.get("/status", response_model=StatusResponse)
def status():
    return StatusResponse(
        index_ready=vector_store["index"] is not None,
        document_count=len(vector_store["docs"]),
    )


@app.post("/upload")
async def upload(files: List[UploadFile] = File(...)):
    documents = []
    for uploaded_file in files:
        if not uploaded_file.filename.lower().endswith(".pdf"):
            continue
        content = await uploaded_file.read()
        with tempfile.NamedTemporaryFile(delete=False, suffix=".pdf") as tmp:
            tmp.write(content)
            tmp_path = tmp.name
        reader = PdfReader(tmp_path)
        for page_number, page in enumerate(reader.pages, start=1):
            text = page.extract_text() or ""
            for chunk in chunk_text(text):
                documents.append(
                    {
                        "text": chunk,
                        "source": uploaded_file.filename,
                        "page": page_number,
                    }
                )

    if not documents:
        raise HTTPException(status_code=400, detail="No valid PDF pages were uploaded.")

    texts = [doc["text"] for doc in documents]
    embeddings = embed_texts(texts)
    for doc, emb in zip(documents, embeddings):
        doc["embedding"] = emb

    vector_store["docs"].extend(documents)
    build_index()

    return {
        "files": len(files),
        "chunks": len(documents),
        "document_count": len(vector_store["docs"]),
    }


@app.post("/chat", response_model=ChatResponse)
def chat(req: ChatRequest):
    if vector_store["index"] is None or vector_store["embeddings"] is None:
        raise HTTPException(status_code=400, detail="No documents have been uploaded yet.")

    query_embedding = embed_texts([req.question])[0:1]
    distances, indexes = vector_store["index"].kneighbors(query_embedding, n_neighbors=min(5, len(vector_store["docs"])))
    hits = [vector_store["docs"][idx] for idx in indexes[0]]

    answer = "Here are the most relevant passages from the uploaded documents."
    answer += "\n\n" + "\n\n".join(f"{hit['source']} (page {hit['page']}): {hit['text']}" for hit in hits[:3])

    sources = [
        {"source": hit["source"], "page": hit["page"], "content": hit["text"][:400]}
        for hit in hits
    ]

    sessions.setdefault(req.session_id, []).append({"question": req.question, "answer": answer})

    return ChatResponse(answer=answer, sources=sources, session_id=req.session_id)

@app.post("/session")
def new_session():
    sid = str(uuid.uuid4())
    sessions[sid] = []
    return {"session_id": sid}


@app.post("/session/clear")
def clear_session(session_id: str):
    sessions.pop(session_id, None)
    return {"cleared": session_id}
