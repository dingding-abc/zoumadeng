#!/usr/bin/env python3
"""Validate a manually reviewed donation asset; never inspect payment accounts."""
import argparse
from datetime import date
import hashlib
import json
from pathlib import Path
import struct
import sys
import zlib


def check_png(data):
    if not data.startswith(b"\x89PNG\r\n\x1a\n"):
        raise ValueError("Image is not a PNG")
    position, chunks, has_data = 8, 0, False
    while position < len(data):
        if position + 12 > len(data):
            raise ValueError("Truncated PNG chunk")
        length = struct.unpack_from(">I", data, position)[0]
        end = position + 12 + length
        if end > len(data):
            raise ValueError("Truncated PNG data")
        kind = data[position + 4:position + 8]
        payload = data[position + 8:end - 4]
        crc = struct.unpack_from(">I", data, end - 4)[0]
        if zlib.crc32(kind + payload) & 0xFFFFFFFF != crc:
            raise ValueError("PNG checksum mismatch")
        if chunks == 0:
            if kind != b"IHDR" or length != 13:
                raise ValueError("PNG must start with IHDR")
            width, height = struct.unpack_from(">II", payload)
            if width < 128 or height < 128:
                raise ValueError("Image is too small; use a readable original PNG")
        has_data |= kind == b"IDAT" and length > 0
        if kind == b"IEND":
            if length or end != len(data) or not has_data:
                raise ValueError("Invalid PNG ending or missing image data")
            return
        position, chunks = end, chunks + 1
    raise ValueError("PNG has no IEND")


def check(root, require_enabled=False):
    config_path = root / "assets/donations/wechat.json"
    config = json.loads(config_path.read_text(encoding="utf-8"))
    if not isinstance(config, dict) or type(config.get("enabled")) is not bool:
        raise ValueError("enabled must be a JSON boolean")
    if config["enabled"] is False:
        if require_enabled:
            raise ValueError("Donation block is disabled; omit it or provide a verified image")
        return "HIDDEN: donation block is disabled; do not render a QR image"
    if config.get("image") != "assets/donations/wechat-receive.png":
        raise ValueError("Unexpected image path")
    if not isinstance(config.get("publicName"), str) or not config["publicName"].strip():
        raise ValueError("publicName is required")
    raw_date = config.get("verifiedOn")
    if not isinstance(raw_date, str):
        raise ValueError("Manual scan verification date is required")
    reviewed = date.fromisoformat(raw_date)
    if reviewed.isoformat() != raw_date or reviewed > date.today():
        raise ValueError("Verification date must be YYYY-MM-DD and not in the future")
    path = root / config["image"]
    if not path.resolve().is_relative_to(root.resolve()):
        raise ValueError("Image resolves outside project root")
    if path.stat().st_size > 10 * 1024 * 1024:
        raise ValueError("Use a PNG smaller than 10 MiB")
    data = path.read_bytes()
    check_png(data)
    expected = config.get("verifiedImageSha256")
    actual = hashlib.sha256(data).hexdigest()
    if expected != actual:
        raise ValueError("Image differs from the manually verified SHA-256")
    return "READY: PNG container and manual review record match; identity/scan validity are manual checks"


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, required=True)
    parser.add_argument("--require-enabled", action="store_true")
    args = parser.parse_args()
    try:
        print(check(args.root, args.require_enabled))
        return 0
    except (OSError, ValueError, TypeError, struct.error) as error:
        print(f"BLOCKED: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
