"""ONNX Runtime wrapper for the CIFAKE EfficientNet-B0 research baseline.

The score is a model output for the CIFAKE domain, not calibrated certainty or
proof of provenance. The graph's scalar logit represents P(REAL) after sigmoid.
"""
from __future__ import annotations

import hashlib
import json
import logging
from pathlib import Path

import numpy as np
import onnxruntime as ort
from PIL import Image

log = logging.getLogger(__name__)

class ImageDetector:
    """Genuine ONNX detector implementing the interface used by `main.py`."""
    def __init__(self, model_path: str, device: str = "auto"):
        self.model_path = Path(model_path)
        self.model = None
        self.session = None
        self.error: str | None = None
        self.device = "CPUExecutionProvider"
        self.metadata = {
            "name": "CIFAKE EfficientNet-B0",
            "version": "2235b7af38d04956416238554080494d84091552",
            "architecture": "EfficientNet-B0 ONNX, opset 18",
            "class_order": ["synthetic", "real"],
            "dataset": "CIFAKE (CIFAR-10 real + Stable Diffusion v1.4 synthetic)",
            "training_split": "Model card reports 100,000 train / 20,000 test; not independently audited here",
            "seed": "Not published in model card",
            "license": "MIT (as declared by the Hugging Face model card; dataset terms remain separate)",
            "provenance": "https://huggingface.co/cftcimert/cifake-efficientnet-b0@2235b7af38d04956416238554080494d84091552",
            "input": "RGB float32 NCHW [1,3,224,224], ImageNet mean/std; direct bicubic resize to 224x224",
            "output": "one logit for P(REAL), sigmoid(logit); synthetic score is 1 - P(REAL)",
        }
        self._load()

    def _load(self) -> None:
        try:
            external_data = self.model_path.with_name("model.onnx.data")
            manifest_path = self.model_path.with_name("model-manifest.json")
            if not self.model_path.is_file():
                raise FileNotFoundError(f"ONNX model missing: {self.model_path.name}")
            if not external_data.is_file():
                raise FileNotFoundError("Required ONNX external tensor data file model.onnx.data is missing")
            if not manifest_path.is_file():
                raise FileNotFoundError("Pinned model-manifest.json is required to verify artifact provenance")
            manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
            for artifact in (self.model_path, external_data):
                expected = manifest.get("files", {}).get(artifact.name)
                if not expected:
                    raise ValueError(f"Model manifest has no SHA-256 for {artifact.name}")
                digest = hashlib.sha256(artifact.read_bytes()).hexdigest()
                if digest != expected:
                    raise ValueError(f"SHA-256 mismatch for {artifact.name}")

            # Force CPU provider for predictable CPU fallback across Windows/Linux.
            session = ort.InferenceSession(str(self.model_path), providers=["CPUExecutionProvider"])
            inputs, outputs = session.get_inputs(), session.get_outputs()
            if len(inputs) != 1 or inputs[0].name != "input" or inputs[0].type != "tensor(float)":
                raise ValueError("Unexpected ONNX input name/type")
            shape = inputs[0].shape
            if len(shape) != 4 or shape[1:] != [3, 224, 224]:
                raise ValueError(f"Unexpected ONNX input dimensions: {shape}")
            if len(outputs) != 1 or outputs[0].name != "logit" or outputs[0].type != "tensor(float)":
                raise ValueError("Unexpected ONNX output name/type")
            out_shape = outputs[0].shape
            if len(out_shape) != 2 or out_shape[1] != 1:
                raise ValueError(f"Unexpected ONNX output dimensions: {out_shape}")
            # Dry-run validates external data, execution provider, graph and output contract.
            probe = session.run(["logit"], {"input": np.zeros((1, 3, 224, 224), dtype=np.float32)})[0]
            if probe.shape != (1, 1) or not np.isfinite(probe).all():
                raise ValueError("ONNX dry-run returned an invalid output")
            self.session = session
            self.model = session
        except Exception as exc:
            self.error = f"{type(exc).__name__}: {exc}"
            log.warning("Image detector unavailable: %s", self.error)

    @property
    def ready(self) -> bool:
        return self.session is not None

    @staticmethod
    def _preprocess(image: Image.Image) -> np.ndarray:
        image = image.convert("RGB")
        # Match the model card's direct square bicubic resize (not crop/letterbox).
        # Pillow's BICUBIC resampling is the matching cubic filter; conversion
        # to [0,1] float32 mirrors ToTensor's uint8 behavior.
        image = image.resize((224, 224), resample=Image.Resampling.BICUBIC)
        tensor = np.asarray(image, dtype=np.float32).transpose(2, 0, 1) / 255.0
        mean = np.asarray([0.485, 0.456, 0.406], dtype=np.float32)[:, None, None]
        std = np.asarray([0.229, 0.224, 0.225], dtype=np.float32)[:, None, None]
        return np.ascontiguousarray(((tensor - mean) / std)[None, ...], dtype=np.float32)

    def predict(self, image: Image.Image) -> tuple[float, list[float]]:
        if not self.ready:
            raise RuntimeError("Image detection model unavailable")
        value = self.session.run(["logit"], {"input": self._preprocess(image)})[0]
        if value.shape != (1, 1) or not np.isfinite(value).all():
            raise RuntimeError("Model returned non-finite or incompatible output")
        logit = float(value[0, 0])
        # Stable sigmoid of the model card's P(REAL) logit.
        p_real = 1.0 / (1.0 + np.exp(-np.clip(logit, -80.0, 80.0)))
        p_synthetic = 1.0 - p_real
        return float(p_synthetic), [float(p_synthetic), float(p_real)]


class AudioDetector:
    """Genuine ONNX detector implementing AASIST Audio Anti-Spoofing."""
    def __init__(self, model_path: str, device: str = "auto"):
        self.model_path = Path(model_path)
        self.session = None
        self.error: str | None = None
        self.device = "CPUExecutionProvider"
        self.metadata = {
            "name": "AASIST",
            "version": "130e536266b7c537f9a13029e1612a9f392fd1cc827783683b6d1c062a3db5e1",
            "architecture": "Integrated Spectro-Temporal Graph Attention Network",
            "class_order": ["spoof", "bonafide"],
            "dataset": "ASVspoof 2019 Logical Access (LA)",
            "license": "MIT",
            "provenance": "https://huggingface.co/SpeechAntiSpoofingBenchmarks/AASIST",
            "input": "mono raw waveform float32 [batch, 64600] at 16000 Hz",
            "output": "2-class logits [batch, 2] corresponding to [spoof, bona_fide]",
        }
        self._load()

    def _load(self) -> None:
        try:
            manifest_path = self.model_path.with_name("model-manifest.json")
            if not self.model_path.is_file():
                raise FileNotFoundError(f"AASIST ONNX model missing: {self.model_path.name}")
            if not manifest_path.is_file():
                raise FileNotFoundError("Pinned model-manifest.json is required to verify AASIST provenance")
            manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
            expected = manifest.get("files", {}).get(self.model_path.name)
            if not expected:
                raise ValueError(f"Model manifest has no SHA-256 for {self.model_path.name}")
            digest = hashlib.sha256(self.model_path.read_bytes()).hexdigest()
            if digest != expected:
                raise ValueError(f"SHA-256 mismatch for {self.model_path.name}")

            session = ort.InferenceSession(str(self.model_path), providers=["CPUExecutionProvider"])
            inputs, outputs = session.get_inputs(), session.get_outputs()
            if len(inputs) != 1 or inputs[0].name != "wav":
                raise ValueError(f"Unexpected AASIST input name/type: {inputs}")
            if len(outputs) != 1 or outputs[0].name != "logits":
                raise ValueError(f"Unexpected AASIST output name/type: {outputs}")

            # Dry run test with 64,600 samples
            probe = session.run(["logits"], {"wav": np.zeros((1, 64600), dtype=np.float32)})[0]
            if probe.shape != (1, 2) or not np.isfinite(probe).all():
                raise ValueError("AASIST dry-run returned an invalid output")
            self.session = session
        except Exception as exc:
            self.error = f"{type(exc).__name__}: {exc}"
            log.warning("Audio detector unavailable: %s", self.error)

    @property
    def ready(self) -> bool:
        return self.session is not None

    def predict(self, waveform: np.ndarray) -> tuple[float, list[float]]:
        if not self.ready:
            raise RuntimeError("Audio detection model unavailable")
        if waveform.ndim != 2 or waveform.shape != (1, 64600):
            raise ValueError(f"Invalid input shape {waveform.shape}, expected (1, 64600)")
        out = self.session.run(["logits"], {"wav": waveform.astype(np.float32)})[0]
        logits = out[0]
        exp_l = np.exp(logits - np.max(logits))
        probs = exp_l / np.sum(exp_l)
        p_spoof = float(probs[0])
        p_bonafide = float(probs[1])
        return p_spoof, [p_spoof, p_bonafide]
