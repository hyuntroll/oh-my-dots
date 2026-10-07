from io import BytesIO
from zipfile import ZipFile

import pytest
from ohmydot.document_preview import docx_preview


def docx(xml):
    out = BytesIO()
    with ZipFile(out, "w") as archive:
        archive.writestr("word/document.xml", xml)
    return out.getvalue()


def test_real_text_headings_and_table_without_executing_markup():
    value = docx_preview(
        docx(
            """<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Report</w:t></w:r></w:p><w:tbl><w:tr><w:tc><w:p><w:r><w:t>&lt;script&gt;</w:t></w:r></w:p></w:tc></w:tr></w:tbl></w:body></w:document>"""
        )
    )
    assert value["blocks"] == [
        {"kind": "heading", "text": "Report"},
        {"kind": "table", "rows": [["<script>"]]},
    ]


def test_invalid_and_entity_documents_rejected():
    with pytest.raises(ValueError):
        docx_preview(b"not a document")
    with pytest.raises(ValueError):
        docx_preview(docx('<!DOCTYPE x [<!ENTITY a "data">]><x/>'))
    with pytest.raises(ValueError):
        docx_preview(b"x" * (8 * 1024 * 1024 + 1))
