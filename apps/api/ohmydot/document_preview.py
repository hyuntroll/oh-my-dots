"""Bounded DOCX text preview. No macros, embedded objects, or external links execute."""

from io import BytesIO
from xml.etree import ElementTree as ET
from zipfile import BadZipFile, ZipFile

NS = {"w": "http://schemas.openxmlformats.org/wordprocessingml/2006/main"}


def docx_preview(content):
    if len(content) > 8 * 1024 * 1024:
        raise ValueError("파일이 미리보기 제한을 초과했습니다.")
    try:
        with ZipFile(BytesIO(content)) as archive:
            entry = archive.getinfo("word/document.xml")
            if entry.file_size > 2 * 1024 * 1024:
                raise ValueError("문서 본문이 미리보기 제한을 초과했습니다.")
            xml = archive.read(entry)
        if b"<!DOCTYPE" in xml or b"<!ENTITY" in xml:
            raise ValueError("지원하지 않는 문서 형식입니다.")
        root = ET.fromstring(xml)
        body = root.find("w:body", NS)
        if body is None:
            raise ValueError("문서 본문을 찾을 수 없습니다.")
        blocks = []
        for item in body:
            if item.tag == "{" + NS["w"] + "}p":
                text = "".join(t.text or "" for t in item.findall(".//w:t", NS))
                style = item.find("w:pPr/w:pStyle", NS)
                label = style.get("{" + NS["w"] + "}val", "") if style is not None else ""
                blocks.append(
                    {
                        "text": text,
                        "kind": "heading" if label.lower().startswith(("heading", "title")) else "paragraph",
                    }
                )
            elif item.tag == "{" + NS["w"] + "}tbl":
                rows = [
                    [
                        "".join(t.text or "" for t in cell.findall(".//w:t", NS))
                        for cell in row.findall("w:tc", NS)
                    ]
                    for row in item.findall("w:tr", NS)
                ]
                blocks.append({"kind": "table", "rows": rows})
        return {
            "format": "docx",
            "blocks": blocks,
            "notice": "텍스트와 표 미리보기입니다. 원본의 페이지 나눔과 서식은 다운로드한 파일에서 확인할 수 있습니다.",
        }
    except (BadZipFile, KeyError, ET.ParseError):
        raise ValueError("DOCX 문서를 읽을 수 없습니다.") from None
