"""Private stdio bridge. Tool schemas and execution both come from the active Run."""

import asyncio
import json
import os

import httpx
from mcp import types
from mcp.server.lowlevel import Server
from mcp.server.stdio import stdio_server


async def run():
    url = os.environ["DOT_TOOL_URL"].rstrip("/")
    headers = {"Authorization": "Bearer " + os.environ["DOT_RUN_TOKEN"]}
    async with httpx.AsyncClient(headers=headers, timeout=None) as client:
        response = await client.get(url, timeout=15)
        response.raise_for_status()
        definitions = [types.Tool.model_validate(item) for item in response.json()["tools"]]
        names = {definition.name for definition in definitions}

        async def list_tools(ctx, params):
            return types.ListToolsResult(tools=definitions)

        async def call_tool(ctx, params):
            if params.name not in names:
                return types.CallToolResult(is_error=True, content=[
                    types.TextContent(type="text", text="Unknown tool")])
            try:
                response = await client.post(url + "/" + params.name,
                                             json=params.arguments if params.arguments is not None else {})
                response.raise_for_status()
                result = response.json()
            except httpx.HTTPError:
                # Transport exception strings can expose URLs; do not echo them to the model.
                return types.CallToolResult(is_error=True, content=[
                    types.TextContent(type="text", text="Tool connection failed. The Run may have ended.")])
            content = []
            if "image_url" in result:
                data = result.pop("image_url").split(",", 1)[1]
                content.append(types.ImageContent(type="image", data=data, mime_type="image/png"))
            content.append(types.TextContent(type="text", text=json.dumps(result, ensure_ascii=False)))
            return types.CallToolResult(content=content, is_error="error" in result)

        server = Server("OhMyDots", on_list_tools=list_tools, on_call_tool=call_tool)
        async with stdio_server() as (read_stream, write_stream):
            await server.run(read_stream, write_stream, server.create_initialization_options())


if __name__ == "__main__":
    asyncio.run(run())
