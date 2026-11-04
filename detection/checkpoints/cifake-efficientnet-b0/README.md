---
license: mit
library_name: onnx
pipeline_tag: image-classification
tags:
  - image-classification
  - onnx
  - efficientnet
  - deepfake-detection
  - ai-generated-image-detection
  - cifake
  - transfer-learning
  - pytorch
  - binary-classification
datasets:
  - birdy654/cifake-real-and-ai-generated-synthetic-images
metrics:
  - accuracy
model-index:
  - name: CIFAKE-EfficientNet-B0
    results:
      - task:
          type: image-classification
          name: Binary Image Classification
        dataset:
          name: CIFAKE
          type: birdy654/cifake-real-and-ai-generated-synthetic-images
        metrics:
          - type: accuracy
            value: 97.85
            name: Test Accuracy
---

# CIFAKE — Real vs AI-Generated Image Classifier

A binary image classifier that distinguishes **real photographs** from **AI-generated (synthetic) images**, built with **EfficientNet-B0** and transfer learning.

## Model Description

This model was trained to detect AI-generated images using the [CIFAKE dataset](https://www.kaggle.com/datasets/birdy654/cifake-real-and-ai-generated-synthetic-images), which contains 120,000 images (60K real from CIFAR-10 + 60K synthetic from Stable Diffusion v1.4).

- **Architecture**: EfficientNet-B0 (pretrained on ImageNet)
- **Task**: Binary classification (Real vs Fake)
- **Output**: Single logit → apply sigmoid to get P(Real)
- **Format**: ONNX (opset 17)
- **Input**: RGB image tensor of shape `[batch, 3, 224, 224]`, normalized with ImageNet statistics

## Training Details

### Two-Phase Training Strategy

| Phase | Epochs | Strategy | Learning Rate | Scheduler |
|-------|--------|----------|---------------|-----------|
| 1 | 10 | Feature extraction (backbone frozen) | 3e-4 | — |
| 2 | 5 | Full fine-tuning (all layers) | 3e-5 | CosineAnnealingLR |

- **Optimizer**: AdamW (weight_decay=1e-2)
- **Loss**: BCEWithLogitsLoss
- **Batch Size**: 128
- **Mixed Precision**: FP16 via `torch.autocast`

### Preprocessing

```python
transforms.Resize((224, 224), interpolation=InterpolationMode.BICUBIC, antialias=True)
transforms.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225])
```

## Performance

| Metric | Value |
|--------|-------|
| **Test Accuracy** | **97.85%** |

Evaluated on 20,000 test images (10K real + 10K AI-generated).

## Usage

### Python (ONNX Runtime)

```python
import numpy as np
import onnxruntime as ort
from PIL import Image
from torchvision import transforms
from torchvision.transforms import InterpolationMode

# Load model
session = ort.InferenceSession("model.onnx")

# Preprocess image
transform = transforms.Compose([
    transforms.Resize((224, 224), interpolation=InterpolationMode.BICUBIC, antialias=True),
    transforms.ToTensor(),
    transforms.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225])
])

image = Image.open("your_image.jpg").convert("RGB")
input_tensor = transform(image).unsqueeze(0).numpy()

# Run inference
logit = session.run(None, {"input": input_tensor})[0]
probability = 1 / (1 + np.exp(-logit))  # sigmoid

label = "REAL" if probability >= 0.5 else "FAKE"
confidence = float(probability) if label == "REAL" else float(1 - probability)
print(f"{label} ({confidence * 100:.2f}% confidence)")
```

## Labels

| Index | Class | Description |
|-------|-------|-------------|
| 0 | FAKE | AI-generated synthetic image |
| 1 | REAL | Real photograph (from CIFAR-10) |

The model outputs a single logit. After applying sigmoid:
- `sigmoid(logit) >= 0.5` → **REAL**
- `sigmoid(logit) < 0.5` → **FAKE**

## Dataset

The [CIFAKE dataset](https://www.kaggle.com/datasets/birdy654/cifake-real-and-ai-generated-synthetic-images) consists of:

| Split | Real | Fake | Total |
|-------|------|------|-------|
| Train | 50,000 | 50,000 | 100,000 |
| Test | 10,000 | 10,000 | 20,000 |

## Citation

```bibtex
@article{bird2024cifake,
  title={CIFAKE: Image Classification and Explainable Identification of AI-Generated Synthetic Images},
  author={Bird, Jordan J and Lotfi, Ahmad},
  journal={IEEE Access},
  year={2024},
  doi={10.1109/ACCESS.2024.3356122}
}
```

## License

This model is released under the [MIT License](https://opensource.org/licenses/MIT).
