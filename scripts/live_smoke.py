"""Exercise real Codex + PostgreSQL + container tools; output contains no credentials."""

import asyncio
import json
import time
import uuid
from pathlib import Path

import httpx


async def main():
    async with httpx.AsyncClient(base_url="http://localhost:3080", timeout=130) as c:
        (await c.get("/api/session")).raise_for_status()
        settings = (await c.get("/api/settings")).json()
        assert settings["provider"] == "codex" and settings["codex_connected"]
        report = []
        for number in range(1, 6):
            cid = (await c.post("/api/conversations")).json()["id"]
            text = (
                "Chromium을 열고 주소창을 사용해서 https://example.com 에 접속해 주세요. 실제 화면을 관찰해서 페이지 제목을 확인하고, "
                f"확인한 제목을 smoke/run-{number}.txt 파일에 기록한 뒤 다시 읽어 검증해 주세요. 공개 페이지 열기와 데모 파일 생성 작업입니다."
            )
            start = time.monotonic()
            r = await c.post(
                f"/api/conversations/{cid}/messages",
                json={"text": text, "idempotency_key": str(uuid.uuid4())},
            )
            r.raise_for_status()
            rid = r.json()["id"]
            async with asyncio.timeout(600):
                while True:
                    data = (await c.get(f"/api/conversations/{cid}")).json()
                    run = data["runs"][0]
                    if run["status"] in ["COMPLETED", "FAILED", "CANCELLED", "WAITING_USER"]:
                        break
                    await asyncio.sleep(2)
            artifact = await c.get(f"/api/artifacts/smoke/run-{number}.txt")
            row = {
                "attempt": number,
                "run_id": rid,
                "conversation_id": cid,
                "status": run["status"],
                "error": run["error"],
                "seconds": round(time.monotonic() - start, 1),
                "artifact_verified": artifact.status_code == 200
                and "Example Domain" in artifact.json().get("text", ""),
            }
            print(json.dumps(row), flush=True)
            report.append(row)
            Path("output/live-smoke.json").write_text(json.dumps(report, indent=2))
            if run["status"] != "COMPLETED" or not row["artifact_verified"]:
                raise RuntimeError("Live smoke failed")


if __name__ == "__main__":
    asyncio.run(main())
