"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import * as faceapi from "face-api.js";
import { useFullscreen } from "@/hooks/useFullscreen";

interface FaceMonitorProps {
  onViolation: (type: string, metadata?: Record<string, unknown>) => void;
  isSubmitted: boolean;
}

const FACE_CHECK_INTERVAL = 3000;
const NOFACE_THRESHOLD = 3;

export default function FaceMonitor({ onViolation, isSubmitted }: FaceMonitorProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isReady, setIsReady] = useState(false);
  const [hasCamera, setHasCamera] = useState(false);
  const [debugImage, setDebugImage] = useState<string | null>(null);
  const noFaceCount = useRef(0);
  const modelsLoaded = useRef(false);
  const streamRef = useRef<MediaStream | null>(null);

  const { enter: enterFullscreen } = useFullscreen();

  const loadModels = useCallback(async () => {
    if (modelsLoaded.current) return;
    const MODEL_URL = "https://justadudewhohacks.github.io/face-api.js/models";
    try {
      await faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL);
      await faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL);
      modelsLoaded.current = true;
    } catch (e) {
      console.warn("Failed to load face-api models, continuing without face detection:", e);
    }
  }, []);

  const startCamera = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: 320, height: 240 },
      });
      streamRef.current = stream;
      setHasCamera(true);

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        const playPromise = videoRef.current.play();
        if (playPromise !== undefined) {
          await playPromise.catch(() => {});
        }
      }

      await loadModels();
      setIsReady(true);
    } catch (e) {
      console.error("Camera access denied:", e);
      setHasCamera(false);
    }
  }, [loadModels]);

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
  }, []);

  const checkFace = useCallback(async () => {
    if (!videoRef.current || !canvasRef.current || isSubmitted || !isReady) return;

    try {
      const video = videoRef.current;
      if (!video || video.readyState < 2) return;
      
      const displaySize = { width: video.videoWidth, height: video.videoHeight };
      faceapi.matchDimensions(canvasRef.current, displaySize);

      const detections = await faceapi
        .detectAllFaces(video, new faceapi.TinyFaceDetectorOptions())
        .withFaceLandmarks();

      if (detections.length === 0) {
        noFaceCount.current += 1;
        if (noFaceCount.current >= NOFACE_THRESHOLD) {
          onViolation("no_face_detected", { noface_count: noFaceCount.current });
          noFaceCount.current = 0;
        }
      } else {
        noFaceCount.current = 0;

        const landmarks = detections[0].landmarks;
        const leftEye = landmarks.getLeftEye();
        const rightEye = landmarks.getRightEye();
        const nose = landmarks.getNose();
        const mouth = landmarks.getMouth();
        const jaw = landmarks.getJawOutline();

        const angles = calculateHeadAngles(leftEye, rightEye, nose, mouth, jaw);
        if (angles.pitch > 25 || angles.yaw > 30 || angles.roll > 20) {
          onViolation("face_not_front", angles);
        }

        if (detections.length > 1) {
          onViolation("multiple_faces", { face_count: detections.length });
        }
      }

      if (!canvasRef.current) return;
      const ctx = canvasRef.current.getContext("2d");
      if (ctx) {
        ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
        const resized = faceapi.resizeResults(detections, displaySize);
        faceapi.draw.drawDetections(canvasRef.current, resized);
        faceapi.draw.drawFaceLandmarks(canvasRef.current, resized);
      }
    } catch (e) {
      console.error("Face detection error:", e);
    }
  }, [isSubmitted, isReady, onViolation]);

  const calculateHeadAngles = (
    leftEye: faceapi.Point[],
    rightEye: faceapi.Point[],
    nose: faceapi.Point[],
    mouth: faceapi.Point[],
    jaw: faceapi.Point[]
  ) => {
    const leftEyeCenter = leftEye.reduce(
      (acc, p) => ({ x: acc.x + p.x, y: acc.y + p.y }),
      { x: 0, y: 0 }
    );
    leftEyeCenter.x /= leftEye.length;
    leftEyeCenter.y /= leftEye.length;

    const rightEyeCenter = rightEye.reduce(
      (acc, p) => ({ x: acc.x + p.x, y: acc.y + p.y }),
      { x: 0, y: 0 }
    );
    rightEyeCenter.x /= rightEye.length;
    rightEyeCenter.y /= rightEye.length;

    const roll =
      (Math.atan2(rightEyeCenter.y - leftEyeCenter.y, rightEyeCenter.x - leftEyeCenter.x) *
        180) /
      Math.PI;

    const noseTip = nose[0];
    const leftEyebrowLeft = leftEye[0];
    const pitch = Math.abs(noseTip.y - (leftEyebrowLeft.y + leftEyeCenter.y) / 2);

    const jawLeft = jaw[0];
    const jawRight = jaw[jaw.length - 1];
    const jawCenter = { x: (jawLeft.x + jawRight.x) / 2, y: (jawLeft.y + jawRight.y) / 2 };
    const yaw = Math.abs(noseTip.x - jawCenter.x);

    return {
      pitch: Math.round(pitch / 5),
      yaw: Math.round(yaw / 5),
      roll: Math.round(roll),
    };
  };

  useEffect(() => {
    startCamera();
    return () => stopCamera();
  }, [startCamera, stopCamera]);

  useEffect(() => {
    if (!isReady || isSubmitted) return;

    const interval = setInterval(checkFace, FACE_CHECK_INTERVAL);
    return () => clearInterval(interval);
  }, [isReady, isSubmitted, checkFace]);

  useEffect(() => {
    if (isReady && !isSubmitted && hasCamera) {
      enterFullscreen();
    }
  }, [isReady, isSubmitted, hasCamera, enterFullscreen]);

  return (
    <div className="face-monitor">
      <video
        ref={videoRef}
        style={{ display: "none" }}
        width={320}
        height={240}
        muted
        playsInline
      />
      {hasCamera && (
        <canvas
          ref={canvasRef}
          style={{
            position: "fixed",
            top: 8,
            right: 8,
            width: 120,
            height: 90,
            borderRadius: 8,
            opacity: 0.7,
            zIndex: 9999,
          }}
        />
      )}
      <div
        style={{
          position: "fixed",
          top: 8,
          right: 8,
          width: 120,
          height: 90,
          background: "#222",
          borderRadius: 8,
          display: hasCamera ? "none" : "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "#888",
          fontSize: 10,
          zIndex: 9999,
        }}
      >
        {!hasCamera ? "Camera off" : "Loading..."}
      </div>
    </div>
  );
}