import cv2, math, time
from PIL import Image

def analyze_video(path, detector, max_seconds=120, max_frames=12):
    cap = cv2.VideoCapture(str(path))
    if not cap.isOpened(): raise ValueError('Video could not be decoded')
    try:
        fps = cap.get(cv2.CAP_PROP_FPS); count = cap.get(cv2.CAP_PROP_FRAME_COUNT)
        duration = count / fps if fps and fps > 0 else 0
        if duration <= 0 or duration > max_seconds: raise ValueError('Video duration is invalid or exceeds the configured limit')
        indices = sorted(set(round(i * max(count-1, 0) / max(max_frames-1,1)) for i in range(min(max_frames, max(1, int(count))))))
        frames=[]
        for n in indices:
            cap.set(cv2.CAP_PROP_POS_FRAMES, n); ok, frame=cap.read()
            if ok:
                rgb=cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
                score,_=detector.predict(Image.fromarray(rgb))
                frames.append({'frameIndex': int(n), 'timestampSeconds': round(n/fps, 3), 'syntheticScore': score})
        if not frames: raise ValueError('No decodable frames found')
        return frames, duration
    finally: cap.release()
