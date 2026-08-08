#!/usr/bin/env python3
"""Optimise videos locally with the site's own settings, before they go up.

A faithful local stand-in for services/video-worker/video.py: same probe, same
silence test, same filter chain, same ffmpeg flags, same 5% minimum-saving rule.
The only differences are that the source is a local file rather than a download,
and the result is written to a directory instead of being pushed to B2.

Why do it here rather than upload and hit "Optimise" in the library: the library
route wakes a Fly machine to download the file it was just given, re-encode it
and write it back. Encoding the file we already have on disk gets the identical
bytes with no round trip - and if the encode turns out not to be worth it, we
never uploaded the fat version in the first place.

Keep the constants below in step with lib/media/video-quality.ts and
services/video-worker/video.py. If those change, this is wrong until it follows.

Usage:
    python3 optimise-videos.py <outDir> <file> [file...]

Prints a JSON report. Files that beat their source by more than 5% are written
to <outDir>/<name>.mp4; the ones that do not are written as
<outDir>/<name>.rejected.mp4 and must NOT be uploaded - upload their originals
instead, exactly as the worker would (it uploads nothing and reports
"Already as small as it gets").
"""
from __future__ import annotations

import json
import re
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path

# services/video-worker/video.py
X264_PRESET = "slow"
MIN_SAVING = 0.05
SILENCE_DBFS = -60.0
AUDIO_BITRATE = "128k"
# lib/media/video-quality.ts - 'balanced' is the library default
CRF = 23
MAX_WIDTH = 1920
MAX_FPS = 30


@dataclass
class Probe:
    width: int
    height: int
    fps: float
    duration: float
    has_audio: bool


def _parse_rate(raw) -> float:
    """'30000/1001' -> 29.97. Returns 0 for anything unusable."""
    if not isinstance(raw, str) or "/" not in raw:
        return 0.0
    num, _, den = raw.partition("/")
    try:
        n, d = float(num), float(den)
    except ValueError:
        return 0.0
    return n / d if d else 0.0


def probe_video(video: Path) -> Probe:
    proc = subprocess.run(
        ["ffprobe", "-v", "error", "-print_format", "json", "-show_streams", "-show_format", str(video)],
        capture_output=True, text=True,
    )
    if proc.returncode != 0:
        raise SystemExit(f"ffprobe failed on {video}: {proc.stderr[-300:]}")
    info = json.loads(proc.stdout)
    streams = info.get("streams") or []
    video_streams = [s for s in streams if s.get("codec_type") == "video"]
    if not video_streams:
        raise SystemExit(f"{video} has no video in it.")
    v = video_streams[0]

    # avg_frame_rate is the honest figure for a variable-rate source; r_frame_rate
    # reads absurdly high on some phone exports.
    fps = _parse_rate(v.get("avg_frame_rate")) or _parse_rate(v.get("r_frame_rate")) or 30.0

    duration = 0.0
    for candidate in (v.get("duration"), (info.get("format") or {}).get("duration")):
        try:
            duration = float(candidate)
            break
        except (TypeError, ValueError):
            continue

    # Rotated footage reports stored dimensions; ffmpeg auto-rotates on transcode,
    # so a width cap has to be measured against the DISPLAYED width.
    rotation = 0
    for sd in v.get("side_data_list") or []:
        if "rotation" in sd:
            try:
                rotation = abs(int(sd["rotation"])) % 180
            except (TypeError, ValueError):
                rotation = 0
    width, height = int(v.get("width") or 0), int(v.get("height") or 0)
    if rotation == 90:
        width, height = height, width
    if width <= 0 or height <= 0:
        raise SystemExit(f"{video} does not report a usable frame size.")

    return Probe(width, height, fps, duration,
                 any(s.get("codec_type") == "audio" for s in streams))


def is_silent(video: Path) -> bool:
    """True when the audio never rises above SILENCE_DBFS.

    Product footage routinely carries a dead stereo track. Dropping it saves
    weight and makes muted autoplay a choice rather than the only option."""
    proc = subprocess.run(
        ["ffmpeg", "-hide_banner", "-nostdin", "-v", "info", "-i", str(video),
         "-map", "0:a:0", "-af", "volumedetect", "-f", "null", "-"],
        capture_output=True, text=True,
    )
    m = re.search(r"max_volume:\s*(-?\d+(?:\.\d+)?) dB", proc.stderr)
    # Could not measure it - keep the audio rather than be silently destructive.
    return float(m.group(1)) <= SILENCE_DBFS if m else False


def build_filters(probe: Probe) -> list[str]:
    """Only ever downscales, only ever drops frame rate."""
    filters: list[str] = []
    if MAX_FPS > 0 and probe.fps > MAX_FPS + 0.01:
        filters.append(f"fps={MAX_FPS}")
    if MAX_WIDTH > 0 and probe.width > MAX_WIDTH:
        # -2 keeps the height even (4:2:0 requires it) and the aspect true.
        filters.append(f"scale={MAX_WIDTH}:-2:flags=lanczos")
    elif probe.width % 2 or probe.height % 2:
        filters.append("scale=trunc(iw/2)*2:trunc(ih/2)*2")
    return filters


def encode(source: Path, dest: Path, probe: Probe, keep_audio: bool) -> None:
    filters = build_filters(probe)
    out_fps = min(probe.fps, MAX_FPS) if MAX_FPS > 0 else probe.fps
    gop = max(2, int(round(out_fps * 2)))
    cmd = [
        "ffmpeg", "-y", "-hide_banner", "-nostdin", "-loglevel", "error",
        "-threads", "0",
        "-i", str(source),
        "-map", "0:v:0",
        *(["-map", "0:a:0"] if keep_audio else []),
        "-c:v", "libx264",
        "-preset", X264_PRESET,
        "-crf", str(CRF),
        "-profile:v", "high",
        "-level", "4.1",
        "-pix_fmt", "yuv420p",
        "-x264-params", "aq-mode=3",
        "-g", str(gop), "-keyint_min", str(max(1, gop // 2)),
        "-maxrate", "12M", "-bufsize", "24M",
    ]
    if filters:
        cmd += ["-vf", ",".join(filters)]
    cmd += ["-c:a", "aac", "-b:a", AUDIO_BITRATE, "-ac", "2"] if keep_audio else ["-an"]
    cmd += [
        # moov atom at the front, so a browser can start playing before the whole
        # file has arrived.
        "-movflags", "+faststart",
        # Drop the authoring tool's metadata and any stray data/subtitle streams.
        "-map_metadata", "-1",
        str(dest),
    ]
    proc = subprocess.run(cmd, capture_output=True, text=True)
    if proc.returncode != 0:
        raise SystemExit(f"encode failed for {source.name}: {proc.stderr[-400:]}")
    if not dest.exists() or dest.stat().st_size == 0:
        raise SystemExit(f"the re-encode produced an empty file for {source.name}")


def main() -> None:
    if len(sys.argv) < 3:
        raise SystemExit("usage: optimise-videos.py <outDir> <file> [file...]")
    out_dir = Path(sys.argv[1])
    out_dir.mkdir(parents=True, exist_ok=True)

    report = []
    for raw in sys.argv[2:]:
        source = Path(raw)
        probe = probe_video(source)
        keep_audio = probe.has_audio and not is_silent(source)
        # .strip() because supplier filenames routinely carry a trailing space
        # before the extension, which would otherwise become a trailing hyphen
        # in the storage key.
        dest = out_dir / (source.stem.strip() + ".mp4")
        encode(source, dest, probe, keep_audio)

        size_before = source.stat().st_size
        size_after = dest.stat().st_size
        optimised = size_after < size_before * (1 - MIN_SAVING)
        out_probe = probe_video(dest)
        if not optimised:
            dest = dest.rename(dest.with_suffix(".rejected.mp4"))

        report.append({
            "source": source.name,
            "sizeBefore": size_before,
            "rawEncode": size_after,
            # What should actually end up in the bucket.
            "uploadSize": size_after if optimised else size_before,
            "upload": str(dest) if optimised else str(source),
            "optimised": optimised,
            "reason": "" if optimised else "Already as small as it gets",
            "hadAudio": probe.has_audio,
            "keptAudio": keep_audio,
            "in": f"{probe.width}x{probe.height}@{round(probe.fps, 2)}",
            "out": f"{out_probe.width}x{out_probe.height}@{round(out_probe.fps, 2)}",
        })
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
