"""
/api/sign_upload — returns Cloudinary signature for direct browser-to-CDN upload
No file binary ever touches our server.
"""
import time
import hashlib
import os
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional
from core.security import get_current_student

router = APIRouter(tags=["uploads"])

CLOUDINARY_API_SECRET = os.getenv("CLOUDINARY_API_SECRET", "")
CLOUDINARY_API_KEY    = os.getenv("CLOUDINARY_API_KEY", "")
CLOUDINARY_CLOUD_NAME = os.getenv("CLOUDINARY_CLOUD_NAME", "")

ALLOWED_PURPOSES = {"question_media", "student_photo"}
ALLOWED_FORMATS  = {"jpg", "jpeg", "png", "webp", "gif", "mp3", "wav", "mp4", "webm", "pdf"}
MAX_BYTES        = 20 * 1024 * 1024  # 20 MB hard limit via Cloudinary eager transform

class SignUploadRequest(BaseModel):
    filename:    str
    filetype:    str
    purpose:     str = "question_media"
    folder:      Optional[str] = None

@router.post("/sign_upload")
async def sign_upload(req: SignUploadRequest, user=Depends(get_current_student)):
    if req.purpose not in ALLOWED_PURPOSES:
        raise HTTPException(status_code=400, detail=f"Invalid purpose. Allowed: {ALLOWED_PURPOSES}")

    ext = req.filename.rsplit(".", 1)[-1].lower() if "." in req.filename else ""
    if ext not in ALLOWED_FORMATS:
        raise HTTPException(status_code=400, detail=f"File type .{ext} not allowed")

    if not CLOUDINARY_API_SECRET:
        raise HTTPException(status_code=500, detail="Cloudinary not configured")

    timestamp = int(time.time())
    folder    = req.folder or f"exam_portal/{req.purpose}"

    # Cloudinary signature: SHA1 of sorted params + api_secret
    params = {
        "folder":    folder,
        "timestamp": timestamp,
    }
    if req.purpose == "question_media":
        # Enforce eager transformation: resize large images, convert to webp
        params["eager"] = "c_limit,w_1280,h_1280,q_auto,f_webp"
        params["eager_async"] = "true"

    params_str = "&".join(f"{k}={v}" for k, v in sorted(params.items()))
    signature  = hashlib.sha1(f"{params_str}{CLOUDINARY_API_SECRET}".encode()).hexdigest()

    return {
        "cloud_name": CLOUDINARY_CLOUD_NAME,
        "api_key":    CLOUDINARY_API_KEY,
        "timestamp":  timestamp,
        "signature":  signature,
        "folder":     folder,
        "eager":      params.get("eager"),
        "eager_async": params.get("eager_async"),
        "upload_url": f"https://api.cloudinary.com/v1_1/{CLOUDINARY_CLOUD_NAME}/auto/upload",
    }
