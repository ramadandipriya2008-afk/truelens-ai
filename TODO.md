# TRUSTLENS AI – Implementation Checklist

## Responsive application shell and navigation
- Provide a responsive React/TypeScript application with desktop, tablet, and mobile layouts.
- Use the supplied black-rock, reflective-water, red-light artwork and premium editorial styling with warm white/light grey surfaces, charcoal type, red accents, serif headings, shadows, and motion.
- Make navigation between Dashboard, About, New Analysis, Analyze Media, Verification Report, Model Evolution, and Analysis History work.
- Make every visible button functional and provide user notifications for important actions.

## Dashboard and About
- Dashboard presents clearly labeled DEMO DATA statistics, activity charts, modality distribution, recent analyses, and report shortcuts.
- About covers project introduction, mission, evidence timeline, model evaluation, and an accessible explanation of the demo workflow.

## New Analysis workflow
- Provide Video/Image/Audio selection, three-step progress, drag-and-drop upload and file browsing.
- Validate MP4/MOV/AVI/MKV, JPG/PNG/WEBP, WAV/MP3/M4A/FLAC according to selected modality.
- Show file preview/details, allow removal, and expose modality-specific configuration options.
- Provide a prominent Start Analysis action that routes into the demo analysis flow.

## Analyze Media and Verification Report
- Analyze Media includes file details plus media-aware demo experiences for video frames, image zoom, and audio waveform/player.
- Verification Report includes verification ID, DEMO DATA authenticity assessment, confidence visualization, status states, evidence, suspicious frames, metadata, and working client-side report export.

## Model Evolution and Analysis History
- Model Evolution shows DEMO DATA model versions, accuracy, precision, false-positive rate, comparison charts, and dataset history.
- Analysis History supports search, filters, pagination, and report-viewing actions using DEMO DATA records.

## Future Python integration and delivery
- Keep reusable TypeScript interfaces and isolated API service files with configurable FastAPI base URL.
- Do not implement backend, database, Supabase, or AI models; never imply real detection.
- Include README installation/build instructions, verify navigation/uploads/workflow, run a production build, and provide a downloadable ZIP.
