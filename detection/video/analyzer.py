import cv2, math, time, logging, base64
import numpy as np
from PIL import Image

log = logging.getLogger('trustlens.video')

def analyze_video(path, detector, max_seconds=120, max_frames=12):
    """
    Frame-level synthetic media signal analyzer using CIFAKE EfficientNet-B0 ONNX.

    Extracts decodable keyframes at controlled intervals, filters degenerate frames,
    runs verified ONNX inference on each frame, generates lightweight JPEG thumbnails,
    and aggregates scores using robust statistical consensus (median and 20% trimmed mean).
    Tracks temporal variance and flags when frame signals exhibit severe dispersion.
    """
    cap = cv2.VideoCapture(str(path))
    if not cap.isOpened():
        raise ValueError('Video file could not be decoded or is corrupted')
    try:
        fps = cap.get(cv2.CAP_PROP_FPS)
        count = cap.get(cv2.CAP_PROP_FRAME_COUNT)
        if not fps or fps <= 0 or math.isnan(fps):
            fps = 24.0

        duration = count / fps if count and count > 0 else 0
        if duration > max_seconds:
            raise ValueError(f'Video duration ({duration:.1f}s) exceeds the maximum allowed limit of {max_seconds}s')

        total_frames = int(count) if count and count > 0 else 0
        if total_frames > 0:
            sample_count = min(max_frames, max(1, total_frames))
            indices = sorted(set(round(i * (total_frames - 1) / max(sample_count - 1, 1)) for i in range(sample_count)))
        else:
            indices = list(range(max_frames))

        frames = []
        prev_gray = None
        stationary_frames_count = 0

        for n in indices:
            cap.set(cv2.CAP_PROP_POS_FRAMES, n)
            ok, frame = cap.read()
            if not ok or frame is None or frame.size == 0:
                continue

            # Safe validation: exclude degenerate / corrupt / completely dark frames
            gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
            frame_std = float(gray.std())
            frame_mean = float(gray.mean())
            if frame_std < 2.0 and frame_mean < 2.0:
                log.info("Skipping degenerate blank frame at index %d", n)
                continue

            # Check if stationary (near-identical to previous sampled frame)
            is_stationary = False
            if prev_gray is not None and prev_gray.shape == gray.shape:
                diff = cv2.absdiff(prev_gray, gray)
                mse = float(diff.mean())
                if mse < 1.5:  # Less than 1.5 intensity delta out of 255
                    is_stationary = True
                    stationary_frames_count += 1
            prev_gray = gray

            rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            pil_img = Image.fromarray(rgb)
            score, _ = detector.predict(pil_img)

            try:
                thumb = cv2.resize(frame, (160, 90), interpolation=cv2.INTER_AREA)
                _, buf = cv2.imencode('.jpg', thumb, [int(cv2.IMWRITE_JPEG_QUALITY), 75])
                thumb_b64 = "data:image/jpeg;base64," + base64.b64encode(buf).decode('ascii')
            except Exception:
                thumb_b64 = None

            frames.append({
                'frameIndex': int(n),
                'timestampSeconds': round(n / fps, 3),
                'syntheticScore': round(float(score), 4),
                'isFlagged': bool(score >= 0.5),
                'isStationary': is_stationary,
                'thumbnail': thumb_b64,
            })

        if not frames:
            raise ValueError('No decodable frames found in video file. The file may be empty or corrupted.')

        if duration <= 0 and frames:
            duration = max(f['timestampSeconds'] for f in frames) + (1.0 / fps)

        scores = [f['syntheticScore'] for f in frames]
        mean_score = float(np.mean(scores))
        median_score = float(np.median(scores))
        peak_score = float(np.max(scores))
        min_score = float(np.min(scores))
        score_std = float(np.std(scores))
        score_var = float(np.var(scores))

        # 20% trimmed mean to discount outlier compression/motion artifacts
        sorted_scores = sorted(scores)
        trim_k = max(1, int(len(sorted_scores) * 0.2)) if len(sorted_scores) >= 5 else 0
        if trim_k > 0 and len(sorted_scores) > 2 * trim_k:
            trimmed_scores = sorted_scores[trim_k:-trim_k]
            trimmed_mean = float(np.mean(trimmed_scores))
        else:
            trimmed_mean = mean_score

        # Robust aggregation: use median consensus as the primary central tendency
        # To avoid peak bias and temporal correlation distortion
        aggregate_score = round(median_score, 4)
        flagged_count = sum(1 for f in frames if f['isFlagged'])
        high_temporal_variance = bool(score_std > 0.25)

        meta = {
            'analyzedFrames': len(frames),
            'totalFrames': total_frames or len(frames),
            'durationSeconds': round(float(duration), 2),
            'fps': round(float(fps), 2),
            'flaggedFrames': flagged_count,
            'stationaryFrames': stationary_frames_count,
            'meanScore': round(mean_score, 4),
            'medianScore': round(median_score, 4),
            'trimmedMeanScore': round(trimmed_mean, 4),
            'peakScore': round(peak_score, 4),
            'minScore': round(min_score, 4),
            'scoreStd': round(score_std, 4),
            'scoreVariance': round(score_var, 4),
            'highTemporalVariance': high_temporal_variance,
            'aggregateScore': aggregate_score,
            'aggregationMethod': 'median_consensus (robust 50th percentile frame synthetic signal, eliminating outlier noise)',
        }

        return frames, aggregate_score, meta
    finally:
        cap.release()
