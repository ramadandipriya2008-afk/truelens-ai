import math
import logging
from pathlib import Path
import numpy as np
import scipy.signal
import soundfile as sf
import av

log = logging.getLogger("trustlens.audio")

def decode_audio_file(file_path: Path | str) -> tuple[np.ndarray, int]:
    """
    Decodes an audio file (WAV, MP3, FLAC, OGG, M4A) to a 1D float32 mono array in [-1.0, 1.0].
    Tries soundfile first; falls back to PyAV for M4A/AAC or containerized streams.
    """
    path_str = str(file_path)
    # Attempt 1: soundfile (fastest for WAV, MP3, FLAC, OGG)
    try:
        data, sr = sf.read(path_str, dtype='float32')
        if data.size == 0:
            raise ValueError("Audio file contains 0 samples")
        if data.ndim > 1:
            data = np.mean(data, axis=1) # convert to mono
        # Ensure [-1.0, 1.0] float32
        max_val = float(np.max(np.abs(data)))
        if max_val > 1.0:
            data = data / max_val
        return data, int(sr)
    except Exception as sf_err:
        log.debug("soundfile decode failed for %s, trying PyAV: %s", path_str, sf_err)

    # Attempt 2: PyAV (supports M4A, AAC, and any container format)
    try:
        container = av.open(path_str)
        audio_stream = next((s for s in container.streams if s.type == 'audio'), None)
        if not audio_stream:
            raise ValueError("No decodable audio stream found in file")
        frames = []
        for frame in container.decode(audio_stream):
            frames.append(frame.to_ndarray())
        container.close()
        if not frames:
            raise ValueError("Audio stream could not be decoded or is empty")
        data = np.concatenate(frames, axis=-1).astype(np.float32)
        if np.max(np.abs(data)) > 1.0:
            data = data / 32768.0
        if data.ndim > 1:
            data = np.mean(data, axis=0)
        return data, int(audio_stream.rate)
    except Exception as av_err:
        raise ValueError(f"Could not decode audio file: {av_err}") from av_err

def resample_to_16k(wav: np.ndarray, orig_sr: int) -> np.ndarray:
    if orig_sr == 16000:
        return wav.astype(np.float32)
    gcd = math.gcd(int(orig_sr), 16000)
    up = 16000 // gcd
    down = orig_sr // gcd
    return scipy.signal.resample_poly(wav, up, down).astype(np.float32)

def generate_waveform_envelope(wav: np.ndarray, num_points: int = 64) -> list[float]:
    if len(wav) == 0:
        return [0.0] * num_points
    chunk_size = max(1, len(wav) // num_points)
    envelope = []
    for i in range(num_points):
        chunk = wav[i * chunk_size : (i + 1) * chunk_size]
        if len(chunk) > 0:
            val = float(np.sqrt(np.mean(chunk ** 2))) # RMS
            envelope.append(round(min(1.0, val * 3.0), 3))
        else:
            envelope.append(0.0)
    return envelope

def analyze_audio(
    file_path: Path | str,
    detector,
    max_seconds: int = 120,
    min_seconds: float = 0.2,
    max_windows: int = 8,
) -> tuple[list[dict], float, dict]:
    """
    Genuine AASIST Audio Anti-Spoofing analysis on raw 16 kHz waveforms.
    """
    raw_wav, orig_sr = decode_audio_file(file_path)
    duration = len(raw_wav) / float(orig_sr)

    if duration < min_seconds:
        raise ValueError(f"Audio duration ({duration:.2f}s) is too short. Minimum duration is {min_seconds}s.")
    if duration > max_seconds:
        raise ValueError(f"Audio duration ({duration:.1f}s) exceeds maximum allowed limit of {max_seconds}s.")

    # Resample to 16,000 Hz
    wav_16k = resample_to_16k(raw_wav, orig_sr)
    target_len = 64600 # 4.0375s at 16kHz
    total_samples = len(wav_16k)

    windows = []
    scores = []

    if total_samples < target_len:
        # Replicate audio to fill target_len
        repeats = int(np.ceil(target_len / total_samples))
        chunk = np.tile(wav_16k, repeats)[:target_len]
        synth_score, probs = detector.predict(chunk[np.newaxis, :])
        scores.append(synth_score)
        windows.append({
            "windowIndex": 0,
            "timestampStart": 0.0,
            "timestampEnd": round(duration, 2),
            "syntheticScore": round(float(synth_score), 4),
            "bonafideScore": round(float(probs[1]), 4),
            "isFlagged": bool(synth_score >= 0.5),
        })
    else:
        # Multiple windows
        window_count = min(max_windows, max(1, total_samples // (target_len // 2)))
        step = (total_samples - target_len) / max(1, window_count - 1)
        for i in range(window_count):
            start_idx = int(round(i * step))
            chunk = wav_16k[start_idx : start_idx + target_len]
            synth_score, probs = detector.predict(chunk[np.newaxis, :])
            scores.append(synth_score)
            windows.append({
                "windowIndex": i,
                "timestampStart": round(start_idx / 16000.0, 2),
                "timestampEnd": round((start_idx + target_len) / 16000.0, 2),
                "syntheticScore": round(float(synth_score), 4),
                "bonafideScore": round(float(probs[1]), 4),
                "isFlagged": bool(synth_score >= 0.5),
            })

    mean_score = float(np.mean(scores))
    median_score = float(np.median(scores))
    peak_score = float(np.max(scores))
    min_score = float(np.min(scores))
    score_std = float(np.std(scores))
    aggregate_score = round(median_score, 4)

    waveform_envelope = generate_waveform_envelope(wav_16k, num_points=64)

    meta = {
        "analyzedWindows": len(windows),
        "durationSeconds": round(float(duration), 2),
        "originalSampleRate": orig_sr,
        "processedSampleRate": 16000,
        "meanScore": round(mean_score, 4),
        "medianScore": round(median_score, 4),
        "peakScore": round(peak_score, 4),
        "minScore": round(min_score, 4),
        "scoreStd": round(score_std, 4),
        "aggregateScore": aggregate_score,
        "aggregationMethod": "median_consensus across temporal spectro-temporal graph windows",
        "waveformEnvelope": waveform_envelope,
    }

    return windows, aggregate_score, meta
