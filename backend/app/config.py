from functools import lru_cache
from pathlib import Path
from pydantic_settings import BaseSettings, SettingsConfigDict

ROOT = Path(__file__).resolve().parents[2]

class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file='.env', extra='ignore')
    app_name: str = 'TrustLens AI API'
    cors_origins: str = 'http://localhost:5173,http://127.0.0.1:5173'
    image_max_bytes: int = 20 * 1024 * 1024
    video_max_bytes: int = 100 * 1024 * 1024
    audio_max_bytes: int = 50 * 1024 * 1024
    video_max_seconds: int = 120
    video_sample_frames: int = 12
    model_onnx_path: str = str(ROOT / 'detection' / 'checkpoints' / 'cifake-efficientnet-b0' / 'model.onnx')
    model_aasist_path: str = str(ROOT / 'detection' / 'checkpoints' / 'aasist' / 'model.onnx')
    device: str = 'auto'
    upload_timeout_seconds: int = 60

    @property
    def allowed_origins(self) -> list[str]:
        return [x.strip() for x in self.cors_origins.split(',') if x.strip()]

@lru_cache
def get_settings() -> Settings:
    return Settings()
