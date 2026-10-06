"""Curated procedure documents. No discovery, installation, or user path access."""

import hashlib
from pathlib import Path

_ROOT = Path(__file__).with_name("builtin_skills")
_SKILLS = (
    {
        "id": "verified-artifact",
        "title": "결과 파일 만들고 검증하기",
        "description": "요청한 내용을 파일로 정리하고 다시 읽어 실제 저장 결과를 확인합니다.",
        "version": "1.0",
    },
    {
        "id": "careful-computer-task",
        "title": "컴퓨터 작업 단계별 확인",
        "description": "화면 관찰, 사용자 제어권, 외부 변경 확인, 결과 검증 순서로 작업합니다.",
        "version": "1.0",
    },
)


def list_skills():
    """Only summaries enter context until a named procedure is requested."""
    return [dict(skill) for skill in _SKILLS]


def read_skill(skill_id):
    skill = next((item for item in _SKILLS if item["id"] == skill_id), None)
    if skill is None:
        raise ValueError("Unknown built-in skill. Choose an id from skills_list.")
    raw = (_ROOT / (skill["id"] + ".md")).read_bytes()
    if len(raw) > 16384:
        raise ValueError("Built-in skill exceeds 16 KiB")
    return {**skill, "content": raw.decode("utf-8"), "sha256": hashlib.sha256(raw).hexdigest()}
