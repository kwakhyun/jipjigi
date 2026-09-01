from __future__ import annotations

import html
import re
from pathlib import Path

from PIL import Image as PILImage
from pypdf import PdfReader, PdfWriter
from pypdf.generic import (
    ArrayObject,
    BooleanObject,
    DecodedStreamObject,
    DictionaryObject,
    NameObject,
    NumberObject,
    TextStringObject,
)
from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen.canvas import Canvas
from reportlab.lib.utils import ImageReader
from reportlab.platypus import (
    BaseDocTemplate,
    CondPageBreak,
    Flowable,
    Frame,
    Image,
    KeepTogether,
    PageBreak,
    PageTemplate,
    Paragraph,
    Spacer,
    Table,
    TableStyle,
)


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "portfolio/jipjigi-portfolio.md"
OUTPUT = ROOT / "output/pdf/곽현_프론트엔드_포트폴리오_집지기.pdf"
TEMP_OUTPUT = ROOT / "tmp/pdfs/jipjigi-portfolio-untagged.pdf"

PAGE_WIDTH, PAGE_HEIGHT = A4
LEFT = 19 * mm
RIGHT = 19 * mm
TOP = 19 * mm
BOTTOM = 18 * mm
CONTENT_WIDTH = PAGE_WIDTH - LEFT - RIGHT

PURPLE = colors.HexColor("#6246EA")
PURPLE_LIGHT = colors.HexColor("#F1EEFF")
INK = colors.HexColor("#1D1D2B")
TEXT = colors.HexColor("#444457")
MUTED = colors.HexColor("#747484")
LINE = colors.HexColor("#E4E1EC")
SURFACE = colors.HexColor("#F8F7FB")


def register_fonts() -> None:
    font_path = Path("/System/Library/Fonts/Supplemental/AppleGothic.ttf")
    if not font_path.exists():
        font_path = Path("/System/Library/Fonts/Supplemental/NotoSansGothic-Regular.ttf")
    pdfmetrics.registerFont(TTFont("Jipjigi", str(font_path)))
    pdfmetrics.registerFontFamily(
        "Jipjigi",
        normal="Jipjigi",
        bold="Jipjigi",
        italic="Jipjigi",
        boldItalic="Jipjigi",
    )


register_fonts()
base = getSampleStyleSheet()
styles = {
    "title": ParagraphStyle(
        "TitleKo",
        parent=base["Title"],
        fontName="Jipjigi",
        fontSize=25,
        leading=32,
        textColor=INK,
        alignment=TA_LEFT,
        spaceAfter=7 * mm,
        wordWrap="CJK",
    ),
    "h2": ParagraphStyle(
        "Heading2Ko",
        parent=base["Heading2"],
        fontName="Jipjigi",
        fontSize=17,
        leading=23,
        textColor=INK,
        spaceBefore=6 * mm,
        spaceAfter=3.5 * mm,
        keepWithNext=True,
        wordWrap="CJK",
    ),
    "identity": ParagraphStyle(
        "IdentityKo",
        parent=base["BodyText"],
        fontName="Jipjigi",
        fontSize=9.8,
        leading=15,
        textColor=TEXT,
        spaceAfter=5 * mm,
        wordWrap="CJK",
    ),
    "h3": ParagraphStyle(
        "Heading3Ko",
        parent=base["Heading3"],
        fontName="Jipjigi",
        fontSize=12.3,
        leading=17,
        textColor=PURPLE,
        spaceBefore=4.5 * mm,
        spaceAfter=2 * mm,
        keepWithNext=True,
        wordWrap="CJK",
    ),
    "lead": ParagraphStyle(
        "LeadKo",
        parent=base["BodyText"],
        fontName="Jipjigi",
        fontSize=10.8,
        leading=18,
        textColor=TEXT,
        spaceAfter=3.5 * mm,
        wordWrap="CJK",
    ),
    "body": ParagraphStyle(
        "BodyKo",
        parent=base["BodyText"],
        fontName="Jipjigi",
        fontSize=9.5,
        leading=15.5,
        textColor=TEXT,
        spaceAfter=2.8 * mm,
        wordWrap="CJK",
        allowWidows=0,
        allowOrphans=0,
    ),
    "bullet": ParagraphStyle(
        "BulletKo",
        parent=base["BodyText"],
        fontName="Jipjigi",
        fontSize=9.2,
        leading=14.5,
        textColor=TEXT,
        leftIndent=5 * mm,
        firstLineIndent=-4 * mm,
        spaceAfter=1.7 * mm,
        wordWrap="CJK",
    ),
    "table": ParagraphStyle(
        "TableKo",
        parent=base["BodyText"],
        fontName="Jipjigi",
        fontSize=8,
        leading=11.4,
        textColor=TEXT,
        wordWrap="CJK",
    ),
    "table_head": ParagraphStyle(
        "TableHeadKo",
        parent=base["BodyText"],
        fontName="Jipjigi",
        fontSize=8.2,
        leading=11.6,
        textColor=INK,
        wordWrap="CJK",
    ),
    "caption": ParagraphStyle(
        "CaptionKo",
        parent=base["BodyText"],
        fontName="Jipjigi",
        fontSize=8,
        leading=11.5,
        textColor=MUTED,
        alignment=TA_CENTER,
        spaceBefore=1.5 * mm,
        spaceAfter=3 * mm,
        wordWrap="CJK",
    ),
}

INLINE = re.compile(r"(\[[^\]]+\]\([^)]*\)|\*\*[^*]+\*\*|`[^`]+`)")
IMAGE_MD = re.compile(r"!\[([^\]]*)\]\(([^)]*)\)")


def inline_markup(text: str) -> str:
    chunks: list[str] = []
    cursor = 0
    for match in INLINE.finditer(text):
        chunks.append(html.escape(text[cursor : match.start()]))
        token = match.group(0)
        if token.startswith("["):
            parsed = re.match(r"\[([^\]]+)\]\(([^)]*)\)", token)
            if parsed is None:
                raise ValueError(token)
            label, target = parsed.groups()
            chunks.append(
                f'<a href="{html.escape(target, quote=True)}" color="#6246EA"><u>{html.escape(label)}</u></a>'
            )
        elif token.startswith("**"):
            chunks.append(f"<b>{html.escape(token[2:-2])}</b>")
        else:
            chunks.append(
                f'<font color="#4A3EC6" backColor="#F1EEFF"> {html.escape(token[1:-1])} </font>'
            )
        cursor = match.end()
    chunks.append(html.escape(text[cursor:]))
    return "".join(chunks)


def paragraph(text: str, style: str = "body") -> Paragraph:
    return Paragraph(inline_markup(text), styles[style])


def parse_cells(line: str) -> list[str]:
    return [part.strip() for part in line.strip().strip("|").split("|")]


def image_flow(source: str, max_width: float, max_height: float) -> Image:
    path = (SOURCE.parent / source).resolve()
    if not path.exists():
        raise FileNotFoundError(path)
    with PILImage.open(path) as image:
        width, height = image.size
    scale = min(max_width / width, max_height / height)
    return Image(str(path), width=width * scale, height=height * scale)


def column_widths(headers: list[str]) -> list[float]:
    if len(headers) == 4:
        return [CONTENT_WIDTH * 0.14, CONTENT_WIDTH * 0.23, CONTENT_WIDTH * 0.17, CONTENT_WIDTH * 0.46]
    if len(headers) == 2:
        if headers[0] in {"구분", "영역", "대상"}:
            return [CONTENT_WIDTH * 0.23, CONTENT_WIDTH * 0.77]
        return [CONTENT_WIDTH * 0.50, CONTENT_WIDTH * 0.50]
    return [CONTENT_WIDTH / len(headers)] * len(headers)


def text_table(rows: list[list[str]]) -> Table:
    content: list[list[Paragraph]] = []
    for row_number, row in enumerate(rows):
        style = "table_head" if row_number == 0 else "table"
        content.append([paragraph(cell, style) for cell in row])
    table = Table(content, colWidths=column_widths(rows[0]), repeatRows=1, hAlign="LEFT")
    table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), PURPLE_LIGHT),
                ("GRID", (0, 0), (-1, -1), 0.45, LINE),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("LEFTPADDING", (0, 0), (-1, -1), 3 * mm),
                ("RIGHTPADDING", (0, 0), (-1, -1), 3 * mm),
                ("TOPPADDING", (0, 0), (-1, -1), 1.45 * mm),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 1.45 * mm),
                ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, SURFACE]),
            ]
        )
    )
    return table


def product_image_table(header: str, image_line: str) -> Flowable:
    labels = parse_cells(header)
    images: list[Image] = []
    for cell in parse_cells(image_line):
        match = IMAGE_MD.fullmatch(cell)
        if match is None:
            raise ValueError(cell)
        _, path = match.groups()
        images.append(image_flow(path, 58 * mm, 126 * mm))
    table = Table(
        [
            [Paragraph(html.escape(label), styles["caption"]) for label in labels],
            images,
        ],
        colWidths=[CONTENT_WIDTH / 2, CONTENT_WIDTH / 2],
        hAlign="CENTER",
    )
    table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), PURPLE_LIGHT),
                ("BOX", (0, 0), (-1, -1), 0.6, LINE),
                ("INNERGRID", (0, 0), (-1, -1), 0.45, LINE),
                ("ALIGN", (0, 0), (-1, -1), "CENTER"),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("TOPPADDING", (0, 0), (-1, 0), 2.2 * mm),
                ("BOTTOMPADDING", (0, 0), (-1, 0), 1 * mm),
                ("TOPPADDING", (0, 1), (-1, 1), 3 * mm),
                ("BOTTOMPADDING", (0, 1), (-1, 1), 3 * mm),
            ]
        )
    )
    return KeepTogether([table, Spacer(1, 3 * mm)])


class CroppedImage(Flowable):
    def __init__(
        self,
        path: Path,
        crop: tuple[int, int, int, int],
        display_width: float,
    ):
        super().__init__()
        self.path = path
        self.crop_x, self.crop_y, self.crop_width, self.crop_height = crop
        with PILImage.open(path) as image:
            self.source_width, self.source_height = image.size
        self.width = display_width
        self.height = display_width * self.crop_height / self.crop_width

    def draw(self) -> None:
        scale = self.width / self.crop_width
        full_width = self.source_width * scale
        full_height = self.source_height * scale
        offset_x = -self.crop_x * scale
        offset_y = -(self.source_height - self.crop_y - self.crop_height) * scale
        self.canv.saveState()
        clipping = self.canv.beginPath()
        clipping.rect(0, 0, self.width, self.height)
        self.canv.clipPath(clipping, stroke=0, fill=0)
        self.canv.drawImage(
            ImageReader(str(self.path)),
            offset_x,
            offset_y,
            width=full_width,
            height=full_height,
            preserveAspectRatio=True,
            mask="auto",
        )
        self.canv.restoreState()


def cropped_figure(source: str, crop: tuple[int, int, int, int], caption: str) -> Flowable:
    path = (SOURCE.parent / source).resolve()
    figure = CroppedImage(path, crop, CONTENT_WIDTH * 0.78)
    figure.hAlign = "CENTER"
    return KeepTogether(
        [
            Spacer(1, 1.5 * mm),
            figure,
            Paragraph(html.escape(caption), styles["caption"]),
        ]
    )


class PortfolioDocument(BaseDocTemplate):
    def __init__(self, filename: str):
        super().__init__(
            filename,
            pagesize=A4,
            leftMargin=LEFT,
            rightMargin=RIGHT,
            topMargin=TOP,
            bottomMargin=BOTTOM,
            title="집지기 | 임대 운영 그로스 포트폴리오",
            author="곽현",
            subject="집지기 프론트엔드 그로스 포트폴리오",
        )
        frame = Frame(
            LEFT,
            BOTTOM,
            CONTENT_WIDTH,
            PAGE_HEIGHT - TOP - BOTTOM,
            leftPadding=0,
            rightPadding=0,
            topPadding=0,
            bottomPadding=0,
            id="main",
        )
        self.addPageTemplates(
            [PageTemplate(id="content", frames=[frame], onPageEnd=draw_page)]
        )

    def afterFlowable(self, flowable: Flowable) -> None:
        if not isinstance(flowable, Paragraph):
            return
        levels = {"TitleKo": 0, "Heading2Ko": 1, "Heading3Ko": 2}
        level = levels.get(flowable.style.name)
        if level is None:
            return
        key = f"section-{self.page}-{self.seq.nextf('section')}"
        self.canv.bookmarkPage(key)
        self.canv.addOutlineEntry(flowable.getPlainText(), key, level=level, closed=False)


def draw_page(canvas: Canvas, doc: BaseDocTemplate) -> None:
    canvas.saveState()
    canvas.setStrokeColor(PURPLE)
    canvas.setLineWidth(1.2)
    canvas.line(LEFT, PAGE_HEIGHT - 11 * mm, PAGE_WIDTH - RIGHT, PAGE_HEIGHT - 11 * mm)
    canvas.setFillColor(MUTED)
    canvas.setFont("Jipjigi", 7.8)
    canvas.drawString(LEFT, 9.5 * mm, "집지기 | 임대 운영 그로스 포트폴리오")
    canvas.drawRightString(PAGE_WIDTH - RIGHT, 9.5 * mm, str(doc.page))
    canvas.restoreState()


def build_story(markdown: str) -> list[Flowable]:
    lines = markdown.splitlines()
    story: list[Flowable] = []
    index = 0
    body_paragraphs = 0
    while index < len(lines):
        stripped = lines[index].strip()
        if not stripped:
            index += 1
            continue
        if stripped == "<!-- pagebreak -->":
            story.append(PageBreak())
            index += 1
            continue
        crop_match = re.fullmatch(
            r"<!-- crop-image:\s*(.*?)\s*\|\s*(\d+),(\d+),(\d+),(\d+)\s*\|\s*(.*?)\s*-->",
            stripped,
        )
        if crop_match:
            source, x, y, width, height, caption = crop_match.groups()
            story.append(
                cropped_figure(
                    source,
                    (int(x), int(y), int(width), int(height)),
                    caption,
                )
            )
            index += 1
            continue
        if stripped.startswith("# "):
            story.append(Paragraph(inline_markup(stripped[2:]), styles["title"]))
            index += 1
            continue
        if stripped.startswith("## "):
            story.extend([CondPageBreak(35 * mm), Paragraph(inline_markup(stripped[3:]), styles["h2"])])
            index += 1
            continue
        if stripped.startswith("### "):
            story.extend([CondPageBreak(24 * mm), Paragraph(inline_markup(stripped[4:]), styles["h3"])])
            index += 1
            continue
        if stripped.startswith("|") and index + 1 < len(lines) and re.match(r"^\|?\s*:?-+", lines[index + 1].strip()):
            header = stripped
            index += 2
            if index < len(lines) and "![" in lines[index]:
                story.append(product_image_table(header, lines[index].strip()))
                index += 1
                continue
            rows = [parse_cells(header)]
            while index < len(lines) and lines[index].strip().startswith("|"):
                rows.append(parse_cells(lines[index]))
                index += 1
            story.extend([text_table(rows), Spacer(1, 2.8 * mm)])
            continue
        image_match = IMAGE_MD.fullmatch(stripped)
        if image_match:
            alt, path = image_match.groups()
            max_height = 80 * mm if "growth-desktop" in path else 115 * mm
            image = image_flow(path, CONTENT_WIDTH, max_height)
            image.hAlign = "CENTER"
            story.append(KeepTogether([image, Paragraph(html.escape(alt), styles["caption"])]))
            index += 1
            continue
        if stripped.startswith("**곽현 | 프론트엔드 개발자**"):
            story.append(paragraph(stripped, "identity"))
            index += 1
            continue
        list_match = re.match(r"^(\d+)\.\s+(.*)$", stripped)
        if list_match:
            number, content = list_match.groups()
            story.append(Paragraph(inline_markup(content), styles["bullet"], bulletText=f"{number}."))
            index += 1
            continue
        paragraph_lines = [stripped]
        index += 1
        while index < len(lines):
            candidate = lines[index].strip()
            if not candidate:
                break
            if (
                candidate == "<!-- pagebreak -->"
                or candidate.startswith(("#", "|", "!["))
                or re.match(r"^\d+\.\s+", candidate)
            ):
                break
            paragraph_lines.append(candidate)
            index += 1
        style = "lead" if body_paragraphs < 2 else "body"
        story.append(paragraph(" ".join(paragraph_lines), style))
        body_paragraphs += 1
    return story


def tag_pdf(source: Path, output: Path) -> None:
    reader = PdfReader(str(source))
    writer = PdfWriter()
    writer.pdf_header = "%PDF-1.7"
    writer.clone_document_from_reader(reader)

    root = writer.root_object
    root[NameObject("/Lang")] = TextStringObject("ko-KR")
    root[NameObject("/MarkInfo")] = DictionaryObject(
        {
            NameObject("/Marked"): BooleanObject(True),
            NameObject("/Suspects"): BooleanObject(False),
        }
    )
    root[NameObject("/ViewerPreferences")] = DictionaryObject(
        {NameObject("/DisplayDocTitle"): BooleanObject(True)}
    )

    structure_root = DictionaryObject(
        {
            NameObject("/Type"): NameObject("/StructTreeRoot"),
            NameObject("/K"): ArrayObject(),
        }
    )
    structure_root_ref = writer._add_object(structure_root)
    document_element = DictionaryObject(
        {
            NameObject("/Type"): NameObject("/StructElem"),
            NameObject("/S"): NameObject("/Document"),
            NameObject("/P"): structure_root_ref,
            NameObject("/K"): ArrayObject(),
        }
    )
    document_element_ref = writer._add_object(document_element)
    structure_root[NameObject("/K")] = document_element_ref

    parent_tree_numbers = ArrayObject()
    page_elements = ArrayObject()
    for page_index, page in enumerate(writer.pages):
        page[NameObject("/StructParents")] = NumberObject(page_index)
        page[NameObject("/Tabs")] = NameObject("/S")
        content = page.get_contents()
        original_data = content.get_data() if content is not None else b""
        tagged_stream = DecodedStreamObject()
        tagged_stream.set_data(
            b"/Sect <</MCID 0>> BDC\n" + original_data + b"\nEMC\n"
        )
        page[NameObject("/Contents")] = writer._add_object(tagged_stream)

        section = DictionaryObject(
            {
                NameObject("/Type"): NameObject("/StructElem"),
                NameObject("/S"): NameObject("/Sect"),
                NameObject("/P"): document_element_ref,
                NameObject("/Pg"): page.indirect_reference,
                NameObject("/K"): NumberObject(0),
            }
        )
        section_ref = writer._add_object(section)
        page_elements.append(section_ref)
        parent_tree_numbers.extend(
            [NumberObject(page_index), ArrayObject([section_ref])]
        )

    document_element[NameObject("/K")] = page_elements
    parent_tree = DictionaryObject(
        {NameObject("/Nums"): parent_tree_numbers}
    )
    structure_root[NameObject("/ParentTree")] = writer._add_object(parent_tree)
    structure_root[NameObject("/ParentTreeNextKey")] = NumberObject(len(writer.pages))
    root[NameObject("/StructTreeRoot")] = structure_root_ref
    writer.add_metadata(
        {
            "/Title": "집지기 | 임대 운영 그로스 포트폴리오",
            "/Author": "곽현",
            "/Subject": "곽현 프론트엔드 개발자 포트폴리오",
            "/Keywords": "프론트엔드, Next.js, React, 그로스, 임대 관리",
        }
    )
    with output.open("wb") as stream:
        writer.write(stream)


def verify() -> None:
    reader = PdfReader(str(OUTPUT))
    if len(reader.pages) != 5:
        raise RuntimeError(f"Expected 5 pages, got {len(reader.pages)}")
    extracted = "\n".join(page.extract_text() or "" for page in reader.pages)
    required = [
        "집지기 | 임대 운영 그로스 포트폴리오",
        "곽현 | 프론트엔드 개발자",
        "khyun9685@gmail.com",
        "제품 화면",
        "해결하려는 문제",
        "핵심 설계 판단",
        "기술 구성",
        "품질 검증",
        "운영 전환 경계",
    ]
    missing = [value for value in required if value not in extracted]
    if missing:
        raise RuntimeError(f"Missing content: {missing}")
    root = reader.trailer["/Root"]
    if root.get("/Lang") != "ko-KR":
        raise RuntimeError("PDF language metadata is missing")
    mark_info = root.get("/MarkInfo") or {}
    if not mark_info.get("/Marked") or not root.get("/StructTreeRoot"):
        raise RuntimeError("PDF tagging structure is missing")
    for page_number, page in enumerate(reader.pages, 1):
        if page.get("/StructParents") is None:
            raise RuntimeError(f"Page {page_number} has no StructParents")
        contents = page.get_contents()
        if contents is None or b"/MCID 0" not in contents.get_data():
            raise RuntimeError(f"Page {page_number} has no marked content")
    annotations = sum(len(page.get("/Annots", [])) for page in reader.pages)
    print(f"created={OUTPUT}")
    print(f"pages={len(reader.pages)}")
    print(f"annotations={annotations}")
    print(f"bytes={OUTPUT.stat().st_size}")


def main() -> None:
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    TEMP_OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    markdown = SOURCE.read_text(encoding="utf-8")
    document = PortfolioDocument(str(TEMP_OUTPUT))
    document.build(build_story(markdown))
    tag_pdf(TEMP_OUTPUT, OUTPUT)
    TEMP_OUTPUT.unlink(missing_ok=True)
    verify()


if __name__ == "__main__":
    main()
