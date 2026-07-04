import React, { useEffect, useMemo, useState } from 'react'

function generateId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

export default function App() {
  const [sessionId, setSessionId] = useState('')
  const [question, setQuestion] = useState('')
  const [messages, setMessages] = useState([])
  const [uploadFiles, setUploadFiles] = useState(null)
  const [status, setStatus] = useState({ index_ready: false, document_count: 0 })
  const [loadingUpload, setLoadingUpload] = useState(false)
  const [loadingChat, setLoadingChat] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const stored = localStorage.getItem('knowledgebot-session')
    if (stored) {
      setSessionId(stored)
      return
    }
    const next = generateId()
    localStorage.setItem('knowledgebot-session', next)
    setSessionId(next)
  }, [])

  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const res = await fetch('/api/status')
        if (!res.ok) throw new Error('Unable to load status')
        const json = await res.json()
        setStatus(json)
      } catch (err) {
        setError('Unable to contact the backend. Start the server and try again.')
      }
    }
    fetchStatus()
  }, [messages])

  const handleUpload = async (event) => {
    event.preventDefault()
    if (!uploadFiles || uploadFiles.length === 0) {
      setError('Please choose one or more PDF files to upload.')
      return
    }

    const formData = new FormData()
    Array.from(uploadFiles).forEach((file) => {
      formData.append('files', file)
    })

    setLoadingUpload(true)
    setError('')

    try {
      const res = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.detail || 'Upload failed')
      }
      const json = await res.json()
      setStatus((prev) => ({ ...prev, index_ready: true, document_count: json.document_count }))
      setMessages((prev) => [
        ...prev,
        { id: generateId(), role: 'system', text: `Uploaded ${json.files} file(s) and ${json.chunks} chunks.` },
      ])
    } catch (err) {
      setError(err.message)
    } finally {
      setLoadingUpload(false)
    }
  }

  const handleAsk = async (event) => {
    event.preventDefault()
    if (!question.trim()) {
      setError('Ask a question before submitting.')
      return
    }
    if (!status.index_ready) {
      setError('Upload PDF documents before asking questions.')
      return
    }

    setLoadingChat(true)
    setError('')

    const payload = { session_id: sessionId, question: question.trim() }
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.detail || 'Chat failed')
      }
      const json = await res.json()
      setMessages((prev) => [
        ...prev,
        { id: generateId(), role: 'user', text: question.trim() },
        { id: generateId(), role: 'assistant', text: json.answer, sources: json.sources },
      ])
      setQuestion('')
    } catch (err) {
      setError(err.message)
    } finally {
      setLoadingChat(false)
    }
  }

  const orderedMessages = useMemo(() => messages, [messages])

  return (
    <div className="app">
      <header className="hero">
        <div className="hero-inner">
          <h1>Knowledge Bot</h1>
          <p>Upload PDF documents and ask questions against your own content.</p>
          <div className="hero-status">
            <span className={status.index_ready ? 'badge ready' : 'badge waiting'}>
              {status.index_ready ? 'Index ready' : 'Upload PDFs to begin'}
            </span>
            <span className="badge">Docs: {status.document_count}</span>
          </div>
        </div>
      </header>

      <main className="main-card">
        <section className="panel upload-panel">
          <h2>Upload PDFs</h2>
          <form onSubmit={handleUpload}>
            <input
              type="file"
              accept="application/pdf"
              multiple
              onChange={(e) => setUploadFiles(e.target.files)}
            />
            <button type="submit" disabled={loadingUpload}>
              {loadingUpload ? 'Uploading…' : 'Upload and Index'}
            </button>
          </form>
          <p className="help-text">You can upload one or more PDF files and then ask questions about their contents.</p>
        </section>

        <section className="panel chat-panel">
          <h2>Ask a question</h2>
          <form onSubmit={handleAsk} className="chat-form">
            <input
              type="text"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="Ask something about the uploaded documents..."
            />
            <button type="submit" disabled={loadingChat || !status.index_ready}>
              {loadingChat ? 'Thinking…' : 'Send'}
            </button>
          </form>
          {error && <div className="error-box">{error}</div>}
        </section>

        <section className="panel messages-panel">
          <h2>Conversation</h2>
          {orderedMessages.length === 0 ? (
            <div className="empty-state">No conversation yet. Upload docs and ask a question.</div>
          ) : (
            <div className="messages-list">
              {orderedMessages.map((message) => (
                <div key={message.id} className={`message ${message.role}`}>
                  <div className="message-role">{message.role === 'assistant' ? 'Bot' : message.role === 'user' ? 'You' : 'System'}</div>
                  <div className="message-text">{message.text}</div>
                  {message.sources && (
                    <div className="message-sources">
                      <strong>Sources:</strong>
                      <ul>
                        {message.sources.map((source, idx) => (
                          <li key={idx}>{source.source} (page {source.page})</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
      </main>

      <footer className="footer">
        <p>Local PDF knowledge bot running with FastAPI and React.</p>
      </footer>
    </div>
  )
}
