"""Private stdio tool bridge for Codex. Never inherits GUI or shell service credentials."""

import base64
import os

import httpx
from mcp.server.mcpserver import MCPServer
from mcp.server.mcpserver.utilities.types import Image

server = MCPServer("OhMyDots")
URL = os.environ["DOT_TOOL_URL"]
HEADERS = {"Authorization": "Bearer " + os.environ["DOT_RUN_TOKEN"]}


async def invoke(name, args):
    async with httpx.AsyncClient(timeout=None) as client:
        response = await client.post(URL + "/" + name, headers=HEADERS, json=args)
        response.raise_for_status()
        result = response.json()
        if "image_url" in result:
            data = result.pop("image_url").split(",", 1)[1]
            return [Image(data=base64.b64decode(data), format="png"), str(result)]
        return result


@server.tool()
async def desktop_screenshot():
    """Observe actual desktop screenshot."""
    return await invoke("desktop_screenshot", {})


@server.tool()
async def desktop_windows():
    """List real desktop windows."""
    return await invoke("desktop_windows", {})


@server.tool()
async def desktop_input(
    action: str,
    x: int = 0,
    y: int = 0,
    text: str = "",
    key: str = "",
    app: str = "chromium",
    delta: int = 0,
    window_id: str = "",
):
    """Operate GUI with screenshot coordinates or X11 keys. Takeover blocks inputs."""
    return await invoke(
        "desktop_input",
        dict(action=action, x=x, y=y, text=text, key=key, app=app, delta=delta, window_id=window_id),
    )


@server.tool()
async def shell_exec(command: str, cwd: str = "/workspace"):
    """Run bounded shell in isolated computer workspace, independent from takeover."""
    return await invoke("shell_exec", dict(command=command, cwd=cwd))


@server.tool()
async def artifact_write(path: str, text: str):
    """Write relative UTF-8 artifact; read it back before claiming success."""
    return await invoke("artifact_write", dict(path=path, text=text))


@server.tool()
async def artifact_read(path: str):
    """Read and verify an artifact relative to /workspace/artifacts."""
    return await invoke("artifact_read", dict(path=path))


@server.tool()
async def ask_user(question: str, options: list[str] | None = None, recommended_index: int = 0):
    """Ask a question with 2-4 concise options and a recommended index; custom input is always available."""
    return await invoke("ask_user", dict(question=question, options=options, recommended_index=recommended_index))


if __name__ == "__main__":
    server.run(transport="stdio")
