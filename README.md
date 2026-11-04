# TrueLens AI — Digital Media Forensics & Deepfake Detection Platform

TrueLens AI is an end-to-end digital media forensics platform engineered to detect synthetic and manipulated media (images and video). It couples a high-performance Python FastAPI service leveraging verified ONNX Runtime checkpoints (CIFAKE EfficientNet-B0) with a modern, responsive React/TypeScript frontend featuring an interactive Frame Evidence Timeline (FET) and Supabase-backed telemetry.

---

## 🌟 Key Features

* **Real-time Deepfake Image Analysis**:
  * Powered by genuine **CIFAKE EfficientNet-B0 ONNX** model executed on CPU via ONNX Runtime without heavy PyTorch runtime overhead.
  * SHA-256 verified checkpoint weights pinned via `model-manifest.json`.
  * Computes model score, synthetic probability, risk assessment bands, and processing latency.

* **FET (Frame Evidence Timeline) Video Forensics**:
  * Multi-frame keyframe timeline sampling (248 analyzed frames at 24 fps).
  * Flagged anomaly detection with timecode markers on interactive scrubber track.
  * Frame-level anomaly score and confidence breakdown across facial inconsistencies, blending artifacts, and temporal transitions.

* **Telemetry & Analysis History**:
  * Real Supabase `public.analyses` database integration.
  * Private user authentication (Sign In / Sign Up) with Row Level Security (RLS) enforcement.
  * Aggregate live dashboard metrics: Total Analyses, Completed Analyses, Files Requiring Review, Modality Evidence Mix, and Activity Area Charts.
  * Filterable Analysis History with instant per-record inspection and client-side deletion persistence.

---

## 🏗️ Repository Architecture

```
truelens-ai/
├── backend/                      # Python FastAPI Detection Service
│   ├── app/                      # FastAPI routers, schemas, CORS, and model registry
│   │   ├── main.py               # Application endpoints & CORS configuration
│   │   ├── config.py             # Server settings & model paths
│   │   └── services/model_registry.py  # Model inference loader
│   ├── serve.py                  # Application runner (Uvicorn host 0.0.0.0, port 8000)
│   └── requirements.txt          # Python dependencies
│
├── detection/                    # Forensic models & checkpoints
│   └── checkpoints/
│       └── cifake-efficientnet-b0/
│           ├── model.onnx           # ONNX computational graph
│           ├── model.onnx.data      # Pinned external weight tensors (15.9 MB)
│           ├── model-manifest.json  # Checkpoint SHA-256 verification manifest
│           └── README.md            # Model provenance and evaluation card
│
├── public/                       # Frontend static assets
│   ├── trustlens-logo.jpg        # Circular deepfake analysis logo
│   └── deepfake-face.jpg         # Forensic evidence visualization art
│
├── src/                          # React + TypeScript Frontend Codebase
│   ├── App.tsx                   # Main application shell, router, FET & dashboard views
│   ├── services/
│   │   ├── api.ts                # FastAPI client & error handling
│   │   ├── supabase.ts           # Supabase client configuration
│   │   └── history.ts            # User analysis persistence & local deletion cache
│   ├── types.ts                  # TypeScript definitions (FETFrame, AnalysisRecord, etc.)
│   └── index.css                 # Tailwind base & custom forensic aesthetics
│
├── Dockerfile                    # Containerization for backend deployment
├── package.json                  # Node.js dependencies & scripts
├── vite.config.ts                # Vite build configuration
├── tailwind.config.ts            # Tailwind styling system
├── .gitignore                    # Excludes node_modules, dist, .venv, *.zip, and .env
└── README.md                     # Comprehensive platform overview & startup guide
```

---

## 🚀 Quickstart Guide

### 1. Start the Python FastAPI Backend

From the repository root:

```bash
# Create virtual environment
python -m venv .venv

# On Windows:
.venv\Scripts\activate
# On Linux/macOS:
# source .venv/bin/activate

# Install dependencies
pip install --upgrade pip
pip install -r backend/requirements.txt

# Run the server
python backend/serve.py
```

* **Health Endpoint**: `http://127.0.0.1:8000/api/v1/health`
* **Interactive Swagger Docs**: `http://127.0.0.1:8000/docs`

### 2. Start the React Frontend

In a separate terminal window from the repository root:

```bash
# Install frontend dependencies
npm install

# Configure environment variables
cp .env.example .env
```

Ensure your `.env` contains:

```env
VITE_API_BASE_URL=http://127.0.0.1:8000/api/v1
VITE_SUPABASE_URL=https://<your-supabase-project>.supabase.co
VITE_SUPABASE_ANON_KEY=<your-supabase-anon-key>
```

Launch the development server:

```bash
npm run dev
```

* Open [http://localhost:5173](http://localhost:5173) in your browser.

---

## 📡 API Endpoints

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/api/v1/health` | Service health status and loaded model readiness. |
| `POST` | `/api/v1/analyze/image` | Analyzes image multipart file (`file` field) with CIFAKE EfficientNet-B0 ONNX. |
| `POST` | `/api/v1/analyze/video` | Video endpoint interface (integrated with FET timeline). |

---

## 🛡️ License

MIT License.
