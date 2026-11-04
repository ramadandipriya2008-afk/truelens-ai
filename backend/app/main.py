import logging, tempfile, time, uuid
from datetime import datetime, timezone
from pathlib import Path
from fastapi import FastAPI, UploadFile, File, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from PIL import Image, UnidentifiedImageError
from pydantic import ValidationError
from .config import get_settings
from .schemas.analysis import AnalysisResponse
from .services.model_registry import ImageDetector

logging.basicConfig(level=logging.INFO, format='%(asctime)s %(levelname)s %(name)s %(message)s')
log=logging.getLogger('trustlens')
s=get_settings()
app=FastAPI(title=s.app_name, version='1.0.0', description='Synthetic media signal analysis; not news or claim fact-checking.')
app.add_middleware(
    CORSMiddleware,
    allow_origins=['http://localhost:5173', 'http://127.0.0.1:5173'],
    allow_credentials=True,
    allow_methods=['GET', 'POST', 'OPTIONS'],
    allow_headers=['*'],
    expose_headers=['*'],
)

@app.on_event('startup')
def initialize():
    app.state.image_detector=ImageDetector(s.model_onnx_path)

@app.get('/health')
@app.get('/api/v1/health')
def health():
    detector=getattr(app.state,'image_detector',None); ready=bool(detector and detector.ready)
    return {'status':'ok','models':{'image':{'ready':ready,'name':'CIFAKE EfficientNet-B0 ONNX','reason':None if ready else (getattr(detector,'error',None) or 'Model not loaded')},'video':{'ready':False,'name':'Video analysis','reason':'Video inference is not enabled until separately verified'},'audio':{'ready':False,'name':'AASIST','reason':'Compatible verified implementation and checkpoint are not configured'}}}

async def receive(file: UploadFile, limit: int, allowed: tuple[str,...]):
    if not file.filename: raise HTTPException(400,'A filename is required')
    fd,path=tempfile.mkstemp(prefix='trustlens-')
    import os
    size=0
    try:
        with os.fdopen(fd,'wb') as out:
            while True:
                chunk=await file.read(1024*1024)
                if not chunk: break
                size+=len(chunk)
                if size>limit: raise HTTPException(413,'Uploaded file exceeds the size limit')
                out.write(chunk)
        with open(path,'rb') as f: head=f.read(16)
        if not any(head.startswith(sig) for sig in allowed): raise HTTPException(415,'File content does not match a supported format')
        return Path(path),size
    except Exception:
        Path(path).unlink(missing_ok=True); raise
    finally: await file.close()

IMAGE_SIG=(b'\xff\xd8\xff',b'\x89PNG\r\n\x1a\n',b'GIF87a',b'GIF89a',b'RIFF')
VIDEO_SIG=(b'\x00\x00\x00',b'RIFF',b'\x1aE\xdf\xa3')
AUDIO_SIG=(b'ID3',b'RIFF',b'OggS',b'fLaC',b'\xff\xfb',b'\xff\xf3',b'\xff\xf2')

def unavailable(): raise HTTPException(503,'Required detection model is unavailable; no analysis was performed')

@app.post('/analyze/image', response_model=AnalysisResponse)
@app.post('/api/v1/analyze/image', response_model=AnalysisResponse)
async def analyze_image(file: UploadFile=File(...)):
    det=app.state.image_detector
    path,size=await receive(file,s.image_max_bytes,IMAGE_SIG); start=time.perf_counter()
    try:
        if not det.ready: unavailable()
        try:
            with Image.open(path) as im:
                im.verify()
            with Image.open(path) as im: score,_=det.predict(im)
        except (UnidentifiedImageError,OSError,Image.DecompressionBombError): raise HTTPException(400,'Invalid or unsafe image file')
        assessment='suspicious_synthetic_signals_detected' if score>=.5 else 'no_strong_synthetic_signals_detected'
        return AnalysisResponse(analysisId=str(uuid.uuid4()),mediaType='image',fileName=Path(file.filename).name,fileSizeBytes=size,createdAt=datetime.now(timezone.utc),processingTimeMs=round((time.perf_counter()-start)*1000,2),assessment=assessment,riskBand='high' if score>=.8 else 'moderate' if score>=.5 else 'low',modelScore=score,confidence=None,confidenceMethod='Not calibrated; model score is a class probability, not confidence',evidence=[{'type':'whole_image_classifier','syntheticScore':score}],details={'threshold':.5,'classOrder':det.metadata['class_order'],'dataset':det.metadata.get('dataset'),'scoreDefinition':det.metadata.get('output')},limitations=['Research/demo baseline trained on CIFAKE (CIFAR-10 real images and Stable Diffusion v1.4 synthetic images); it may not generalize to modern generators, edited images, screenshots, or other domains.','The model card reports 97.85% CIFAKE test accuracy; this value is self-reported and has not been independently verified here.','A classifier score is not calibrated confidence or proof of manipulation/authorship.'],warnings=['Does not assess whether depicted claims or events are true.'],model={'name':det.metadata.get('name','CIFAKE EfficientNet-B0 ONNX'),'version':det.metadata.get('version'),'checkpointVerified':True,'device':det.device})
    finally: path.unlink(missing_ok=True)

@app.post('/api/v1/analyze/video',response_model=AnalysisResponse)
async def analyze_video(file: UploadFile=File(...)):
    path, _ = await receive(file, s.video_max_bytes, VIDEO_SIG)
    try:
        raise HTTPException(503, 'Video analysis is not enabled until its model pipeline has been separately verified')
    finally:
        path.unlink(missing_ok=True)

@app.post('/api/v1/analyze/audio')
async def analyze_audio(file: UploadFile=File(...)):
    raise HTTPException(503,'AASIST detection is unavailable: no verified compatible implementation and checkpoint are configured')

@app.exception_handler(Exception)
async def unexpected(request: Request, exc: Exception):
    if isinstance(exc,HTTPException): return await app.exception_handlers[HTTPException](request,exc)
    log.exception('Unhandled request failure')
    from fastapi.responses import JSONResponse
    return JSONResponse(status_code=500,content={'detail':'Unexpected server error'})
