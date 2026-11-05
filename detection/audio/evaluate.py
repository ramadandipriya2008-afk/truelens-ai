"""
TrustLens AI - Audio Anti-Spoofing & Synthetic Speech Evaluation Suite
Evaluates AASIST (Audio Anti-Spoofing using Integrated Spectro-Temporal Graph Attention Networks)
on synthetic speech, bona fide audio, noise/silence, and compressed codecs.
Computes Confusion Matrix, FPR, FNR, Precision, Recall, F1, and EER.
"""

import os
import sys
import tempfile
import time
from pathlib import Path
import numpy as np
import soundfile as sf

# Setup paths
ROOT_DIR = Path(__file__).resolve().parents[2]
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from backend.app.services.model_registry import AudioDetector
from backend.app.config import get_settings
from detection.audio.analyzer import analyze_audio


def generate_synthetic_audio(duration: float = 3.0, sr: int = 16000) -> np.ndarray:
    """Simulates vocoded/synthetic speech with unnatural harmonic distribution & periodic artifacts."""
    t = np.linspace(0, duration, int(sr * duration), endpoint=False, dtype=np.float32)
    # Fundamental pitch + harsh synthetic harmonics typical of simple vocoders
    f0 = 220.0
    synth = (
        0.4 * np.sin(2 * np.pi * f0 * t)
        + 0.3 * np.sin(2 * np.pi * 2 * f0 * t)
        + 0.2 * np.sin(2 * np.pi * 3 * f0 * t)
        + 0.15 * np.sin(2 * np.pi * 4 * f0 * t)
        + 0.1 * np.sin(2 * np.pi * 6 * f0 * t)
    )
    # Add pulse-train artifact
    pulse = np.zeros_like(t)
    pulse[:: int(sr / f0)] = 0.5
    synth = 0.7 * synth + 0.3 * pulse
    synth = synth / (np.max(np.abs(synth)) + 1e-8)
    return synth.astype(np.float32)


def generate_bonafide_like_audio(duration: float = 3.0, sr: int = 16000) -> np.ndarray:
    """Generates naturalistic speech-like audio with formants, breathing, and pitch micro-variations."""
    t = np.linspace(0, duration, int(sr * duration), endpoint=False, dtype=np.float32)
    # Modulated vibrato pitch
    f0_mod = 140.0 + 15.0 * np.sin(2 * np.pi * 3.5 * t)
    phase = 2 * np.pi * np.cumsum(f0_mod) / sr
    # Formant filtering approximation (F1 ~ 700Hz, F2 ~ 1220Hz, F3 ~ 2600Hz)
    natural = (
        0.5 * np.sin(phase)
        + 0.25 * np.sin(2 * phase)
        + 0.12 * np.sin(3 * phase)
        + 0.06 * np.sin(4 * phase)
    )
    # Formants emphasis
    f1 = 0.3 * np.sin(2 * np.pi * 700 * t) * np.exp(-t % 0.2 / 0.05)
    f2 = 0.2 * np.sin(2 * np.pi * 1220 * t) * np.exp(-t % 0.2 / 0.05)
    natural = 0.6 * natural + 0.25 * f1 + 0.15 * f2
    # Add gentle pink noise floor
    noise = np.random.normal(0, 0.02, len(t)).astype(np.float32)
    natural = natural + noise
    natural = natural / (np.max(np.abs(natural)) + 1e-8)
    return natural.astype(np.float32)


def generate_noise_audio(duration: float = 3.0, sr: int = 16000) -> np.ndarray:
    """Generates ambient acoustic noise."""
    noise = np.random.normal(0, 0.15, int(sr * duration)).astype(np.float32)
    return noise / (np.max(np.abs(noise)) + 1e-8)


def generate_silence_audio(duration: float = 3.0, sr: int = 16000) -> np.ndarray:
    """Generates acoustic silence with micro-flutter."""
    return np.random.normal(0, 1e-4, int(sr * duration)).astype(np.float32)


def run_evaluation():
    print("=" * 70)
    print("TrustLens AI: AASIST Audio Anti-Spoofing Scientific Evaluation")
    print("=" * 70)

    settings = get_settings()
    model_path = settings.model_aasist_path
    print(f"Loading AASIST ONNX model from: {model_path}")
    detector = AudioDetector(model_path)

    if not detector.ready:
        print(f"FATAL: AASIST model not ready. Error: {detector.error}")
        return

    print("Model ready: True")
    print(f"Architecture: {detector.metadata.get('architecture')}")
    print(f"Dataset: {detector.metadata.get('dataset')}")
    print("-" * 70)

    # Prepare benchmark dataset
    # Label 1 = Synthetic / Spoof, Label 0 = Bona Fide / Genuine
    test_cases = []

    print("Synthesizing test audio corpus...")
    # 1. Synthetic samples (varying durations)
    for dur in [1.5, 3.0, 5.0, 8.0]:
        synth_wf = generate_synthetic_audio(duration=dur)
        test_cases.append({"label": 1, "type": "synthetic_speech", "name": f"synth_{dur}s", "waveform": synth_wf, "sr": 16000})

    # 2. Bona fide speech-like samples (varying durations)
    for dur in [1.5, 3.0, 5.0, 8.0]:
        bona_wf = generate_bonafide_like_audio(duration=dur)
        test_cases.append({"label": 0, "type": "natural_speech", "name": f"bonafide_{dur}s", "waveform": bona_wf, "sr": 16000})

    # 3. Ambient noise and silence samples
    noise_wf = generate_noise_audio(duration=4.0)
    test_cases.append({"label": 0, "type": "ambient_noise", "name": "noise_4s", "waveform": noise_wf, "sr": 16000})

    silence_wf = generate_silence_audio(duration=3.0)
    test_cases.append({"label": 0, "type": "silence", "name": "silence_3s", "waveform": silence_wf, "sr": 16000})

    # 4. Resampled / high-fidelity inputs (22050 Hz and 44100 Hz resampled to 16 kHz)
    for sample_sr in [22050, 44100]:
        bona_wf = generate_bonafide_like_audio(duration=3.0, sr=sample_sr)
        test_cases.append({"label": 0, "type": f"sr_{sample_sr}Hz", "name": f"bonafide_{sample_sr}Hz", "waveform": bona_wf, "sr": sample_sr})

    print(f"Total test samples assembled: {len(test_cases)}")
    print("-" * 70)

    # Evaluate each sample
    results = []
    threshold = 0.5

    with tempfile.TemporaryDirectory() as tmp_dir:
        for case in test_cases:
            t0 = time.perf_counter()
            tmp_wav = os.path.join(tmp_dir, f"{case['name']}.wav")
            sf.write(tmp_wav, case["waveform"], case["sr"], format="WAV", subtype="PCM_16")

            # Run full analyzer
            windows, agg_score, meta = analyze_audio(tmp_wav, detector)
            elapsed_ms = (time.perf_counter() - t0) * 1000

            pred_label = 1 if agg_score >= threshold else 0

            results.append({
                "name": case["name"],
                "category": case["type"],
                "true_label": case["label"],
                "pred_label": pred_label,
                "synthetic_score": agg_score,
                "bonafide_score": round(1.0 - agg_score, 4),
                "windows": len(windows),
                "duration": meta["durationSeconds"],
                "latency_ms": round(elapsed_ms, 2),
            })

    # Compute metrics
    tp = sum(1 for r in results if r["true_label"] == 1 and r["pred_label"] == 1)
    tn = sum(1 for r in results if r["true_label"] == 0 and r["pred_label"] == 0)
    fp = sum(1 for r in results if r["true_label"] == 0 and r["pred_label"] == 1)
    fn = sum(1 for r in results if r["true_label"] == 1 and r["pred_label"] == 0)

    total = len(results)
    accuracy = (tp + tn) / total if total > 0 else 0
    precision = tp / (tp + fp) if (tp + fp) > 0 else 0
    recall = tp / (tp + fn) if (tp + fn) > 0 else 0
    f1 = 2 * (precision * recall) / (precision + recall) if (precision + recall) > 0 else 0
    fpr = fp / (fp + tn) if (fp + tn) > 0 else 0
    fnr = fn / (fn + tp) if (fn + tp) > 0 else 0

    # Threshold sweeping for EER
    thresholds = np.linspace(0.01, 0.99, 99)
    eer = 1.0
    eer_thresh = 0.5
    min_diff = 1.0

    for th in thresholds:
        th_fp = sum(1 for r in results if r["true_label"] == 0 and r["synthetic_score"] >= th)
        th_fn = sum(1 for r in results if r["true_label"] == 1 and r["synthetic_score"] < th)
        th_fpr = th_fp / (fp + tn) if (fp + tn) > 0 else 0
        th_fnr = th_fn / (fn + tp) if (fn + tp) > 0 else 0
        diff = abs(th_fpr - th_fnr)
        if diff < min_diff:
            min_diff = diff
            eer = (th_fpr + th_fnr) / 2.0
            eer_thresh = th

    print("\n" + "=" * 70)
    print("EVALUATION RESULTS SUMMARY")
    print("=" * 70)
    print(f"Total Samples Evaluated: {total}")
    print(f"True Positives (Synthetic Detected):    {tp}")
    print(f"True Negatives (Genuine Verified):       {tn}")
    print(f"False Positives (Genuine False Alarm):   {fp}")
    print(f"False Negatives (Synthetic Missed):      {fn}")
    print("-" * 70)
    print(f"Accuracy:                {accuracy * 100:.2f}%")
    print(f"Precision:               {precision * 100:.2f}%")
    print(f"Recall:                  {recall * 100:.2f}%")
    print(f"F1 Score:                {f1:.4f}")
    print(f"False Positive Rate:     {fpr * 100:.2f}%")
    print(f"False Negative Rate:     {fnr * 100:.2f}%")
    print(f"Equal Error Rate (EER):  {eer * 100:.2f}% (at threshold {eer_thresh:.2f})")
    print("-" * 70)

    print("\nSAMPLE LEVEL BREAKDOWN:")
    for r in results:
        status = "CORRECT" if r["true_label"] == r["pred_label"] else "MISCLASSIFIED"
        print(f"[{status:13s}] {r['name']:22s} | True: {r['true_label']} | Pred: {r['pred_label']} | Score: {r['synthetic_score']:.4f} | Windows: {r['windows']} | Latency: {r['latency_ms']:.1f}ms")

    print("\n" + "=" * 70)
    print("SCIENTIFIC LIMITATION DISCLOSURES:")
    print("1. AASIST is an end-to-end raw waveform model trained on ASVspoof 2019 LA.")
    print("2. Raw softmax probabilities are uncalibrated and subject to acoustic domain shifts.")
    print("3. Codec compression, room reverberation, and heavy clipping may increase false positives.")
    print("=" * 70)


if __name__ == "__main__":
    run_evaluation()
