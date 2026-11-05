# TrustLens AI - Frontend

The modern React + TypeScript + Vite web interface for the TrustLens AI Digital Media Forensics platform.

## Features
- Multi-modal forensic evaluation interface (Image, Video, Audio)
- Interactive AASIST waveform player with dynamic amplitude envelope visualization
- Video Frame Evidence Timeline (FET)
- Real-time Supabase authentication with password recovery
- Live forensic analysis history and modality distribution telemetry

## Prerequisites
- Node.js (v18 or higher recommended)
- npm or pnpm

## Getting Started

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Configure environment:**
   Verify `.env` has your API and Supabase endpoints:
   ```env
   VITE_API_BASE_URL=http://127.0.0.1:8000/api/v1
   VITE_SUPABASE_URL=https://your-project.supabase.co
   VITE_SUPABASE_ANON_KEY=your-anon-key
   ```

3. **Start the development server:**
   ```bash
   npm run dev
   ```
   Or simply double-click `start-frontend.bat`.

4. **Build for production:**
   ```bash
   npm run build
   ```
