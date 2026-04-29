# e2e-encrypted-file-share

A minimal end-to-end encrypted file share. The server stores ciphertext only —
encryption and decryption both happen in the browser. Built as a 60-minute
live-coding exercise.

## Quick start

```bash
# backend (FastAPI + SQLite)
cd backend
python3.11 -m venv .venv          # or any Python 3.10+
.venv/bin/pip install -r requirements.txt
.venv/bin/uvicorn app.main:app --port 8000

# frontend (Vite + React + TS)
cd frontend
npm install
npm run dev                        # serves on http://localhost:5173
```

Open `http://localhost:5173`, pick a file, and share the URL it gives you.

## Flow

**Sender**
1. Pick a file
2. Browser generates an AES-GCM 256 key + random 12-byte IV
3. `[4-byte BE length][JSON {filename, mime}][file bytes]` is encrypted as one ciphertext
4. Ciphertext + IV are POSTed to the server
5. Server returns an opaque id; the UI builds a link of the form
   `…/r/<id>#key=<base64url>` — the key lives in the URL fragment, which
   browsers never send to the server.

**Recipient**
1. Opens the share URL
2. Reads the key from the URL fragment
3. GETs the ciphertext + IV from the server
4. Decrypts locally; unpacks filename/MIME header; renders preview or download

The UI shows every intermediate state — plaintext SHA-256, generated key, IV,
ciphertext hex, server response, decrypted hex — so the security boundary is
visible while you're using it.

## What the server sees

The server stores:

- `id` (opaque random 16 bytes, base64url)
- `iv_b64` (12 bytes)
- `size`, `created_at`
- the ciphertext blob (`data/<id>.bin`)

It does **not** see: the key, the filename, the MIME type, the plaintext, or
the plaintext size (within rounding to ciphertext size).

```bash
# convince yourself:
xxd backend/data/<id>.bin | head    # random bytes
sqlite3 backend/app.db 'select * from share'   # no filename, no key
```

The backend has no crypto code at all — it's a dumb blob store.

## Security tradeoffs

What this demo gets right (within scope):

- **Crypto is in the client.** `crypto.subtle` (WebCrypto), AES-GCM 256,
  random IV per file. No custom crypto.
- **Key in URL fragment.** Fragments are not sent to the server; the key
  never touches the wire.
- **Filename is encrypted** as part of the payload header.
- **Authenticated encryption.** AES-GCM tag failure → graceful "wrong secret"
  error, not a crash.

What this demo *deliberately* doesn't do, and what a real version would:

- **No auth, no users.** Anyone with the link + key can read. A real version
  would gate downloads on a capability token scoped to `file:read:<id>`
  (single-use, time-bounded, audited, server-enforced).
- **No revocation, no expiry.** A capability-token model gives you instant
  revocation; this demo can't take a link back.
- **Static origin trust.** The browser is trusted to run the right JS. In
  reality, integrity (Subresource Integrity, signed releases, a fixed origin
  policy) matters: a compromised origin defeats e2e encryption end-to-end.
- **No metadata privacy.** The server learns size and timing. Padding +
  blinded uploads would reduce that, at a cost.
- **Recipient binding.** Anyone who sees the URL can decrypt. A real version
  would bind a download to a specific recipient identity / device.

Threat classes touched (Multifactor framing):

- *Credential theft.* The link + fragment **is** the credential. Anywhere
  the URL leaks (chat history, screen share, browser history) the file is
  readable. A capability token bound to the recipient would scope the blast
  radius.
- *Confused deputy.* The server is intentionally incapable of decrypting on
  a caller's behalf; there's no endpoint that takes a key.

## Architecture

```
backend/
  app/
    main.py        # FastAPI app, two endpoints, Pydantic models
    models.py      # SQLModel: Share(id, iv_b64, size, created_at)
    storage.py     # filesystem blob store + id generator
    db.py / config.py
  data/<id>.bin    # ciphertext blobs
  app.db           # SQLite metadata

frontend/
  src/
    crypto.ts             # WebCrypto wrappers — only file that touches keys
    api.ts                # fetch wrappers, typed responses
    SenderPage.tsx        # 5-step sender UI
    RecipientPage.tsx     # 4-step recipient UI
    components/
      Step.tsx            # numbered step card with status pill
      HexPreview.tsx      # hex dump for showing ciphertext / plaintext bytes
```

API:

- `POST /files` → `{ iv_b64, ciphertext_b64 }` → `{ id }`
- `GET  /files/{id}` → `{ id, iv_b64, ciphertext_b64, size, created_at }`

Both directions use base64-encoded JSON. That's ~33% bigger than raw bytes
but makes the request/response trivial to inspect in DevTools — useful for a
demo that's largely about *showing* the security boundary. For larger files
you'd switch to multipart upload + binary download with the IV in a header.

## What's intentionally missing

- Auth / users / sharing model
- Revocation, expiration, one-time download
- Streaming encryption for large files
- Resumable uploads
- Production key management
