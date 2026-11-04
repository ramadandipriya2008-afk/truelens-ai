from datetime import datetime
from typing import Any, Literal
from pydantic import BaseModel, ConfigDict

class ModelInfo(BaseModel):
    name: str
    version: str | None = None
    checkpointVerified: bool = False
    device: str | None = None

class AnalysisResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    analysisId: str
    mediaType: Literal['image', 'video', 'audio']
    fileName: str
    fileSizeBytes: int
    createdAt: datetime
    processingTimeMs: float
    assessment: Literal['suspicious_synthetic_signals_detected', 'no_strong_synthetic_signals_detected', 'inconclusive']
    riskBand: Literal['low', 'moderate', 'high', 'unknown']
    modelScore: float | None
    confidence: float | None
    confidenceMethod: str
    evidence: list[dict[str, Any]]
    details: dict[str, Any]
    limitations: list[str]
    warnings: list[str]
    model: ModelInfo
