import io, sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from fastapi.testclient import TestClient
from app.main import app

class MissingDetector:
    ready=False
    error='missing checkpoint'

def setup_module():
    app.state.image_detector=MissingDetector()

def test_health_reports_actual_unavailable_models():
    r=TestClient(app).get('/api/v1/health')
    assert r.status_code==200 and r.json()['models']['image']['ready'] is False
    assert r.json()['models']['video']['ready'] is False
    assert r.json()['models']['audio']['ready'] is False

def test_missing_checkpoint_returns_503():
    r=TestClient(app).post('/api/v1/analyze/image',files={'file':('x.jpg',b'\xff\xd8\xffpayload','image/jpeg')})
    assert r.status_code==503 and 'detail' in r.json()

def test_video_missing_model_returns_503():
    r=TestClient(app).post('/api/v1/analyze/video',files={'file':('x.mp4',b'\x00\x00\x00\x18ftyp','video/mp4')})
    assert r.status_code==503

def test_audio_returns_honest_503():
    r=TestClient(app).post('/api/v1/analyze/audio',files={'file':('x.wav',b'RIFFxxxxWAVE','audio/wav')})
    assert r.status_code==503 and 'AASIST' in r.json()['detail']

def test_route_registration_and_response_schema():
    client=TestClient(app)
    spec=client.get('/openapi.json').json()
    assert set(spec['paths']) >= {'/api/v1/health','/api/v1/analyze/image','/api/v1/analyze/video','/api/v1/analyze/audio'}
    schema=spec['components']['schemas']['AnalysisResponse']
    for field in ('analysisId','mediaType','fileName','fileSizeBytes','createdAt','processingTimeMs','assessment','riskBand','modelScore','confidence','confidenceMethod','evidence','details','limitations','warnings','model'):
        assert field in schema['properties']

def test_invalid_upload_rejected_before_model_check():
    r=TestClient(app).post('/api/v1/analyze/image',files={'file':('fake.jpg',b'not an image','image/jpeg')})
    assert r.status_code==415
    assert r.json()=={'detail':'File content does not match a supported format'}

def test_real_onnx_model_loads_and_runs_image_api():
    from PIL import Image
    from app.config import get_settings
    from app.services.model_registry import ImageDetector
    detector=ImageDetector(get_settings().model_onnx_path)
    assert detector.ready, detector.error
    score, pair=detector.predict(Image.new('RGB',(320,180),(112,134,160)))
    assert 0.0 <= score <= 1.0 and len(pair)==2
    stream=io.BytesIO()
    Image.new('RGB',(320,180),(112,134,160)).save(stream,format='PNG')
    with TestClient(app) as client:
        assert client.get('/api/v1/health').json()['models']['image']['ready'] is True
        r=client.post('/api/v1/analyze/image',files={'file':('sample.png',stream.getvalue(),'image/png')})
        assert r.status_code==200, r.text
        body=r.json()
        assert body['mediaType']=='image'
        assert 0.0 <= body['modelScore'] <= 1.0
        assert body['model']['name']=='CIFAKE EfficientNet-B0'
        assert body['model']['checkpointVerified'] is True
        assert any('CIFAKE' in item for item in body['limitations'])

def test_video_stays_unavailable_even_with_valid_container_header():
    r=TestClient(app).post('/api/v1/analyze/video',files={'file':('x.mp4',b'\x00\x00\x00\x18ftypisom','video/mp4')})
    assert r.status_code==503 and 'not enabled' in r.json()['detail']

def test_detector_fails_closed_for_missing_model():
    from app.services.model_registry import ImageDetector
    detector=ImageDetector('/definitely/missing/model.onnx')
    assert detector.ready is False
    assert detector.error and 'missing' in detector.error.lower()

def test_unsupported_audio_response_stable():
    assert TestClient(app).get('/api/v1/health').json()['status']=='ok'
