#!/usr/bin/env python3
"""Face detection helper for ClipGenius AI.

Reads sampled frames from a video with OpenCV, runs a Haar cascade face
detector, and prints JSON: [{"t": <seconds>, "faces": [{"x","y","w","h"}]}]
"""
import argparse
import json
import sys

try:
    import cv2
except Exception as e:  # pragma: no cover
    print(json.dumps([]))
    sys.exit(0)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--video", required=True)
    parser.add_argument("--start", type=float, default=0.0)
    parser.add_argument("--end", type=float, default=0.0)
    parser.add_argument("--interval", type=float, default=1.0)
    args = parser.parse_args()

    cap = cv2.VideoCapture(args.video)
    if not cap.isOpened():
        print(json.dumps([]))
        return

    try:
        cascade = cv2.CascadeClassifier(
            cv2.data.haarcascades + "haarcascade_frontalface_default.xml"
        )
    except Exception:
        print(json.dumps([]))
        return
    if cascade is None or cascade.empty():
        print(json.dumps([]))
        return

    fps = cap.get(cv2.CAP_PROP_FPS) or 25.0
    duration = cap.get(cv2.CAP_PROP_FRAME_COUNT) / fps if fps else 0
    end = args.end if args.end > args.start else duration

    samples = []
    t = args.start
    step = max(0.25, args.interval)
    while t <= end + 1e-3:
        cap.set(cv2.CAP_PROP_POS_MSEC, t * 1000.0)
        ok, frame = cap.read()
        if not ok:
            break
        # Downscale for speed; cascade works fine on ~480px wide frames.
        h, w = frame.shape[:2]
        scale = 480.0 / w if w > 480 else 1.0
        if scale != 1.0:
            frame = cv2.resize(frame, (int(w * scale), int(h * scale)))
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        gray = cv2.equalizeHist(gray)
        faces = cascade.detectMultiScale(
            gray, scaleFactor=1.1, minNeighbors=5, minSize=(24, 24)
        )
        out_faces = []
        for (x, y, fw, fh) in faces:
            out_faces.append(
                {
                    "x": int(x / scale),
                    "y": int(y / scale),
                    "w": int(fw / scale),
                    "h": int(fh / scale),
                }
            )
        samples.append({"t": round(t, 3), "faces": out_faces})
        t += step

    cap.release()
    print(json.dumps(samples))


if __name__ == "__main__":
    main()
