import cv2, math, time, logging
from PIL import Image

log = logging.getLogger('trustlens.video')

def analyze_video(path, detector, max_seconds=120, max_frames=12):
    """
    Genuine frame-level synthetic media signal analyzer using CIFAKE EfficientNet-B0 ONNX.
    
    Extracts frames at controlled intervals, runs ONNX inference on each frame,
    and aggregates scores using a weighted hybrid method (70% mean, 30% peak anomaly).
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
        for n in indices:
            cap.set(cv2.CAP_PROP_POS_FRAMES, n)
            ok, frame = cap.read()
            if ok and frame is not None and frame.size > 0:
                rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
                score, _ = detector.predict(Image.fromarray(rgb))
                frames.append({
                    'frameIndex': int(n),
                    'timestampSeconds': round(n / fps, 3),
                    'syntheticScore': round(float(score), 4),
                    'isFlagged': bool(score >= 0.5)
                })

        if not frames:
            raise ValueError('No decodable frames found in video file. The file may be empty or corrupted.')

        if duration <= 0 and frames:
            duration = max(f['timestampSeconds'] for f in frames) + (1.0 / fps)

        scores = [f['syntheticScore'] for f in frames]
        mean_score = sum(scores) / len(scores)
        peak_score = max(scores)
        aggregate_score = round(0.7 * mean_score + 0.3 * peak_score, 4)
        flagged_count = sum(1 for f in frames if f['isFlagged'])

        meta = {
            'analyzedFrames': len(frames),
            'totalFrames': total_frames or len(frames),
            'durationSeconds': round(float(duration), 2),
            'fps': round(float(fps), 2),
            'flaggedFrames': flagged_count,
            'meanScore': round(mean_score, 4),
            'peakScore': round(peak_score, 4),
            'aggregateScore': aggregate_score,
            'aggregationMethod': 'weighted_average (70% mean, 30% peak frame score)',
        }

        return frames, aggregate_score, meta
    finally:
        cap.release()
