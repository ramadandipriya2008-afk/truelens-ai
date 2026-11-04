import sys
from pathlib import Path
import uvicorn

BACKEND_DIR = Path(__file__).resolve().parent
ROOT_DIR = BACKEND_DIR.parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from app.main import app

if __name__ == '__main__':
    uvicorn.run(app, host='0.0.0.0', port=8000, workers=1, proxy_headers=True, forwarded_allow_ips='*')
