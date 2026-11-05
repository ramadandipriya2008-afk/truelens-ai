"""
TrustLens AI - Audio Analysis Automated Unit Tests
Tests genuine AASIST Audio Anti-Spoofing pipeline across:
1. Valid audio formats (WAV, MP3, FLAC)
2. Corrupted audio payload handling
3. Unsupported file formats (e.g. text/binaries)
4. Empty file rejection
5. Audio duration validation (too short rejection)
6. Health and schema validation
7. Direct AASIST model inference & shape verification
"""

import io
import json
import sys
import unittest
import urllib.request
import urllib.error
from pathlib import Path
import numpy as np
import soundfile as sf

# Ensure backend root is on sys.path
BACKEND_DIR = Path(__file__).resolve().parents[1]
ROOT_DIR = BACKEND_DIR.parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from app.services.model_registry import AudioDetector
from app.config import get_settings

BASE_URL = "http://127.0.0.1:8000/api/v1"


def make_wav_bytes(duration=1.5, sr=16000):
    t = np.linspace(0, duration, int(sr * duration), endpoint=False, dtype=np.float32)
    waveform = 0.4 * np.sin(2 * np.pi * 440 * t)
    buf = io.BytesIO()
    sf.write(buf, waveform, sr, format="WAV", subtype="PCM_16")
    return buf.getvalue()


def post_multipart(url: str, filename: str, content: bytes, content_type: str = "audio/wav"):
    boundary = "----WebKitFormBoundaryAudioUnitTest"
    body = bytearray()
    body.extend(f"--{boundary}\r\n".encode())
    body.extend(f'Content-Disposition: form-data; name="file"; filename="{filename}"\r\n'.encode())
    body.extend(f"Content-Type: {content_type}\r\n\r\n".encode())
    body.extend(content)
    body.extend(f"\r\n--{boundary}--\r\n".encode())

    req = urllib.request.Request(
        url,
        data=bytes(body),
        headers={"Content-Type": f"multipart/form-data; boundary={boundary}"},
        method="POST"
    )
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            return resp.status, json.loads(resp.read().decode())
    except urllib.error.HTTPError as e:
        try:
            err_data = json.loads(e.read().decode())
        except Exception:
            err_data = {"detail": str(e)}
        return e.code, err_data


class TestAudioAnalysis(unittest.TestCase):
    def test_01_audio_health_reports_ready(self):
        req = urllib.request.Request(f"{BASE_URL}/health")
        with urllib.request.urlopen(req, timeout=5) as resp:
            self.assertEqual(resp.status, 200)
            data = json.loads(resp.read().decode())
            self.assertIn("audio", data["models"])
            self.assertTrue(data["models"]["audio"]["ready"])
            self.assertIn("AASIST", data["models"]["audio"]["name"])

    def test_02_valid_wav_analysis(self):
        wav_data = make_wav_bytes(duration=2.0, sr=16000)
        status, data = post_multipart(f"{BASE_URL}/analyze/audio", "speech_sample.wav", wav_data, "audio/wav")
        self.assertEqual(status, 200, str(data))
        self.assertEqual(data["mediaType"], "audio")
        self.assertEqual(data["fileName"], "speech_sample.wav")
        self.assertTrue(0.0 <= data["modelScore"] <= 1.0)
        self.assertIn(data["riskBand"], ["low", "moderate", "high"])
        self.assertTrue(data["model"]["checkpointVerified"])
        self.assertIn("AASIST", data["model"]["name"])
        self.assertTrue("evidence" in data and len(data["evidence"]) > 0)
        self.assertIn("waveformEnvelope", data["details"])
        self.assertEqual(len(data["details"]["waveformEnvelope"]), 64)
        self.assertTrue(len(data["limitations"]) > 0)

    def test_03_valid_flac_analysis(self):
        t = np.linspace(0, 1.0, 16000, endpoint=False, dtype=np.float32)
        buf = io.BytesIO()
        sf.write(buf, 0.3 * np.sin(2 * np.pi * 300 * t), 16000, format="FLAC")
        status, data = post_multipart(f"{BASE_URL}/analyze/audio", "tone.flac", buf.getvalue(), "audio/flac")
        self.assertEqual(status, 200, str(data))
        self.assertEqual(data["mediaType"], "audio")

    def test_04_empty_audio_rejected(self):
        status, data = post_multipart(f"{BASE_URL}/analyze/audio", "empty.wav", b"", "audio/wav")
        self.assertIn(status, [400, 415, 422])

    def test_05_corrupted_audio_rejected(self):
        corrupted_data = b"RIFF\x24\x00\x00\x00WAVEfmt \x10\x00\x00\x00\x01\x00\x01\x00\x80>\x00\x00\x00\x7d\x00\x00\x02\x00\x10\x00data\x00\x00\x00\x00" + b"\xde\xad\xbe\xef" * 10
        status, data = post_multipart(f"{BASE_URL}/analyze/audio", "corrupted.wav", corrupted_data, "audio/wav")
        self.assertIn(status, [400, 415, 422])

    def test_06_unsupported_audio_extension_rejected(self):
        status, data = post_multipart(f"{BASE_URL}/analyze/audio", "malicious.exe", b"MZ\x90\x00\x03\x00\x00\x00", "application/octet-stream")
        self.assertEqual(status, 415)

    def test_07_audio_too_short_rejected(self):
        short_data = make_wav_bytes(duration=0.05, sr=16000)
        status, data = post_multipart(f"{BASE_URL}/analyze/audio", "too_short.wav", short_data, "audio/wav")
        self.assertEqual(status, 400)
        self.assertIn("too short", data["detail"].lower())

    def test_08_audio_detector_direct_inference(self):
        settings = get_settings()
        detector = AudioDetector(settings.model_aasist_path)
        self.assertTrue(detector.ready)
        silence = np.zeros((1, 64600), dtype=np.float32)
        score, probs = detector.predict(silence)
        self.assertTrue(0.0 <= score <= 1.0)
        self.assertEqual(len(probs), 2)
        self.assertAlmostEqual(sum(probs), 1.0, places=4)


if __name__ == "__main__":
    unittest.main()
