import os
import tempfile
import uuid
from contextlib import asynccontextmanager
from typing import List

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from dotenv import load_dotenv
from langchain_community.document_loaders import PyPDFLoader
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_huggingface import HuggingFaceEmbeddings
from langchain_pinecone import PineconeVectorStore
from langchain_groq import ChatGroq
from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder
from langchain_core.output_parsers import StrOutputParser
from langchain_core.runnables import RunnablePassthrough
from langchain_core.messages import HumanMessage, AIMessage
from pinecone import Pinecone, ServerlessSpec

load_dotenv()

# ── In-memory session store ────────────────────────────────────────────────────
sessions: dict[str, list] = {}   # session_id → chat_history
vector_store_ref: dict = {}       # shared vector store


@asynccontextmanager
async def lifespan(app: FastAPI):
	yield


app = FastAPI(title="Knowledge Bot API", lifespan=lifespan)

app.add_middleware(
	CORSMiddleware,
	allow_origins=["http://localhost:5173", "http://localhost:3000"],
	allow_credentials=True,
	allow_methods=["*"],
	allow_headers=["*"],
)


# ── Models ─────────────────────────────────────────────────────────────────────
class ChatRequest(BaseModel):
	session_id: str
	question: str


class ChatResponse(BaseModel):
	answer: str
	sources: List[dict]
	session_id: str


class StatusResponse(BaseModel):
	index_ready: bool
	index_name: str | None


# ── Helpers ────────────────────────────────────────────────────────────────────
def get_embeddings():
	return HuggingFaceEmbeddings(model_name="sentence-transformers/all-MiniLM-L6-v2")


def init_pinecone():
	api_key = os.getenv("PINECONE_API_KEY")
	index_name = os.getenv("PINECONE_INDEX_NAME")
	if not api_key or not index_name:
		raise HTTPException(status_code=500, detail="Pinecone env vars not set.")
	pc = Pinecone(api_key=api_key)
	existing = [i.name for i in pc.list_indexes()]
	if index_name not in existing:
		pc.create_index(
			name=index_name,
			dimension=384,
			metric="cosine",
			spec=ServerlessSpec(cloud="aws", region="us-east-1"),
		)
	return pc, index_name


def get_chain(vector_store):
	llm = ChatGroq(
		api_key=os.getenv("GROQ_API_KEY"),
		model_name="llama3-8b-8192",
		temperature=0.2,
	)
	retriever = vector_store.as_retriever(search_kwargs={"k": 4})

	prompt = ChatPromptTemplate.from_messages([
		("system",
		 "You are a helpful assistant that answers questions strictly based on the "
		 "provided document context. If the answer is not in the context, say so.\n\n"
		 "Context:\n{context}"),
		MessagesPlaceholder(variable_name="chat_history"),
		("human", "{question}"),
	])

	def format_docs(docs):
		return "\n\n".join(d.page_content for d in docs)

	chain = (
		RunnablePassthrough.assign(context=lambda x: format_docs(retriever.invoke(x["question"])))
		| prompt
		| llm
		| StrOutputParser()
	)
	return chain, retriever


# ── Routes ─────────────────────────────────────────────────────────────────────
@app.get("/status", response_model=StatusResponse)
def status():
	ready = "store" in vector_store_ref
	return StatusResponse(
		index_ready=ready,
		index_name=os.getenv("PINECONE_INDEX_NAME") if ready else None,
	)


@app.post("/upload")
async def upload(files: List[UploadFile] = File(...)):
	"""Chunk, embed, and push PDFs to Pinecone."""
	missing = [k for k in ["GROQ_API_KEY", "PINECONE_API_KEY", "PINECONE_INDEX_NAME"] if not os.getenv(k)]
	if missing:
		raise HTTPException(status_code=500, detail=f"Missing env vars: {missing}")

	splitter = RecursiveCharacterTextSplitter(chunk_size=800, chunk_overlap=100)
	all_docs = []

	for uf in files:
		if not uf.filename.endswith(".pdf"):
			continue
		content = await uf.read()
		with tempfile.NamedTemporaryFile(delete=False, suffix=".pdf") as tmp:
			tmp.write(content)
			tmp_path = tmp.name
		loader = PyPDFLoader(tmp_path)
		pages = loader.load()
		chunks = splitter.split_documents(pages)
		for chunk in chunks:
			chunk.metadata["source"] = uf.filename
		all_docs.extend(chunks)

	if not all_docs:
		raise HTTPException(status_code=400, detail="No valid PDF content found.")

	_, index_name = init_pinecone()
	embeddings = get_embeddings()
	store = PineconeVectorStore.from_documents(all_docs, embeddings, index_name=index_name)
	vector_store_ref["store"] = store

	return {"chunks": len(all_docs), "files": len(files), "index_name": index_name}


@app.post("/load")
def load_existing():
	"""Connect to an already-populated Pinecone index."""
	missing = [k for k in ["GROQ_API_KEY", "PINECONE_API_KEY", "PINECONE_INDEX_NAME"] if not os.getenv(k)]
	if missing:
		raise HTTPException(status_code=500, detail=f"Missing env vars: {missing}")

	index_name = os.getenv("PINECONE_INDEX_NAME")
	embeddings = get_embeddings()
	store = PineconeVectorStore.from_existing_index(index_name=index_name, embedding=embeddings)
	vector_store_ref["store"] = store
	return {"status": "connected", "index_name": index_name}


@app.post("/chat", response_model=ChatResponse)
def chat(req: ChatRequest):
	if "store" not in vector_store_ref:
		raise HTTPException(status_code=400, detail="No index loaded. Upload PDFs or load an existing index first.")

	history = sessions.setdefault(req.session_id, [])
	chain, retriever = get_chain(vector_store_ref["store"])

	# Get sources separately for citation
	source_docs = retriever.invoke(req.question)
	sources = [
		{
			"source": d.metadata.get("source", "unknown"),
			"page": d.metadata.get("page", "?"),
			"content": d.page_content[:400],
		}
		for d in source_docs
	]

	answer = chain.invoke({"question": req.question, "chat_history": history})

	history.append(HumanMessage(content=req.question))
	history.append(AIMessage(content=answer))

	return ChatResponse(answer=answer, sources=sources, session_id=req.session_id)


@app.delete("/chat/{session_id}")
def clear_session(session_id: str):
	sessions.pop(session_id, None)
	return {"cleared": session_id}


@app.post("/session")
def new_session():
	sid = str(uuid.uuid4())
	sessions[sid] = []
	return {"session_id": sid}
