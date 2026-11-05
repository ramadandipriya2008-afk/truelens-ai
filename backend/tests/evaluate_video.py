import os, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from detection.video.evaluate import evaluate_pipeline

def test_video_pipeline_evaluation():
    evaluate_pipeline()

if __name__ == '__main__':
    evaluate_pipeline()
