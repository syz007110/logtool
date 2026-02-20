import io
import os
import sys
import re
from dataclasses import dataclass
from enum import Enum
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import numpy as np
from pdfminer.pdfdocument import PDFDocument
from pdfminer.pdfinterp import PDFResourceManager
from pdfminer.pdfpage import PDFPage
from pdfminer.pdfparser import PDFParser
from pdfminer.layout import LTChar, LTFigure, LTLine, LTPage
from pdfminer.pdffont import PDFCIDFont, PDFUnicodeNotDefined
from pdfminer.utils import apply_matrix_pt, mult_matrix
from pdfminer.pdfinterp import PDFGraphicState
from pymupdf import Document, Font

from pdf_doclayout import OnnxModel
from pdf_pdfinterp import PDFPageInterpreterEx
from pdf_converter import PDFConverterEx


@dataclass
class Paragraph:
    y: float
    x: float
    x0: float
    x1: float
    y0: float
    y1: float
    size: float
    brk: bool


class OpType(Enum):
    TEXT = "text"
    LINE = "line"


class KernelPDFConverter:
    def __init__(
        self,
        rsrcmgr: PDFResourceManager,
        layout: Dict[int, np.ndarray],
        thread: int,
        translate_fn,
        lang_out: str,
        noto_name: str,
        noto_font: Optional[Font],
        vfont: str = "",
        vchar: str = "",
    ) -> None:
        self._base = PDFConverterEx(rsrcmgr)
        self.vfont = vfont
        self.vchar = vchar
        self.thread = thread
        self.layout = layout
        self.noto_name = noto_name
        self.noto = noto_font
        self.translate_fn = translate_fn
        self.lang_out = lang_out
        self.fontmap = {}
        self.fontid = {}

    def begin_page(self, page, ctm):
        return self._base.begin_page(page, ctm)

    def end_page(self, page):
        return self.receive_layout(self._base.cur_item)

    def begin_figure(self, name, bbox, matrix):
        return self._base.begin_figure(name, bbox, matrix)

    def end_figure(self, name):
        return self._base.end_figure(name)

    def render_char(
        self,
        matrix,
        font,
        fontsize: float,
        scaling: float,
        rise: float,
        cid: int,
        ncs,
        graphicstate: PDFGraphicState,
    ) -> float:
        try:
            text = font.to_unichr(cid)
            assert isinstance(text, str), str(type(text))
        except PDFUnicodeNotDefined:
            text = self._base.handle_undefined_char(font, cid)
        textwidth = font.char_width(cid)
        textdisp = font.char_disp(cid)
        item = LTChar(
            matrix,
            font,
            fontsize,
            scaling,
            rise,
            text,
            textwidth,
            textdisp,
            ncs,
            graphicstate,
        )
        self._base.cur_item.add(item)
        item.cid = cid
        item.font = font
        return item.adv

    def receive_layout(self, ltpage: LTPage):
        # This logic mirrors PDFMathTranslate to preserve layout and formulas.
        sstk: list[str] = []
        pstk: list[Paragraph] = []
        vbkt: int = 0
        vstk: list[LTChar] = []
        vlstk: list[LTLine] = []
        vfix: float = 0
        var: list[list[LTChar]] = []
        varl: list[list[LTLine]] = []
        varf: list[float] = []
        vlen: list[float] = []
        lstk: list[LTLine] = []
        xt: LTChar = None
        xt_cls: int = -1
        vmax: float = ltpage.width / 4
        ops: str = ""

        def vflag(font: str, char: str):
            if isinstance(font, bytes):
                try:
                    font = font.decode("utf-8")
                except UnicodeDecodeError:
                    font = ""
            font = font.split("+")[-1]
            if re.match(r"\(cid:", char):
                return True
            if self.vfont:
                if re.match(self.vfont, font):
                    return True
            else:
                if re.match(
                    r"(CM[^R]|MS.M|XY|MT|BL|RM|EU|LA|RS|LINE|LCIRCLE|TeX-|rsfs|txsy|wasy|stmary|.*Mono|.*Code|.*Ital|.*Sym|.*Math)",
                    font,
                ):
                    return True
            if self.vchar:
                if re.match(self.vchar, char):
                    return True
            else:
                if (
                    char
                    and char != " "
                    and (
                        ord(char[0]) in range(0x370, 0x400)
                        or char[0] in ["\u00b7"]
                    )
                ):
                    return True
            return False

        for child in ltpage:
            if isinstance(child, LTChar):
                cur_v = False
                layout = self.layout[ltpage.pageid]
                h, w = layout.shape
                cx, cy = np.clip(int(child.x0), 0, w - 1), np.clip(int(child.y0), 0, h - 1)
                cls = layout[cy, cx]
                if child.get_text() == "•":
                    cls = 0
                if (
                    cls == 0
                    or (cls == xt_cls and len(sstk[-1].strip()) > 1 and child.size < pstk[-1].size * 0.79)
                    or vflag(child.fontname, child.get_text())
                    or (child.matrix[0] == 0 and child.matrix[3] == 0)
                ):
                    cur_v = True
                if not cur_v:
                    if vstk and child.get_text() == "(":
                        cur_v = True
                        vbkt += 1
                    if vbkt and child.get_text() == ")":
                        cur_v = True
                        vbkt -= 1
                if (
                    not cur_v
                    or cls != xt_cls
                    or (sstk[-1] != "" and abs(child.x0 - xt.x0) > vmax)
                ):
                    if vstk:
                        if (
                            not cur_v
                            and cls == xt_cls
                            and child.x0 > max([vch.x0 for vch in vstk])
                        ):
                            vfix = vstk[0].y0 - child.y0
                        if sstk[-1] == "":
                            xt_cls = -1
                        sstk[-1] += f"{{v{len(var)}}}"
                        var.append(vstk)
                        varl.append(vlstk)
                        varf.append(vfix)
                        vstk = []
                        vlstk = []
                        vfix = 0
                if not vstk:
                    if cls == xt_cls:
                        if child.x0 > xt.x1 + 1:
                            sstk[-1] += " "
                        elif child.x1 < xt.x0:
                            sstk[-1] += " "
                            pstk[-1].brk = True
                    else:
                        sstk.append("")
                        pstk.append(Paragraph(child.y0, child.x0, child.x0, child.x0, child.y0, child.y1, child.size, False))
                if not cur_v:
                    if (
                        child.size > pstk[-1].size
                        or len(sstk[-1].strip()) == 1
                    ) and child.get_text() != " ":
                        pstk[-1].y -= child.size - pstk[-1].size
                        pstk[-1].size = child.size
                    sstk[-1] += child.get_text()
                else:
                    if (
                        not vstk
                        and cls == xt_cls
                        and child.x0 > xt.x0
                    ):
                        vfix = child.y0 - xt.y0
                    vstk.append(child)
                pstk[-1].x0 = min(pstk[-1].x0, child.x0)
                pstk[-1].x1 = max(pstk[-1].x1, child.x1)
                pstk[-1].y0 = min(pstk[-1].y0, child.y0)
                pstk[-1].y1 = max(pstk[-1].y1, child.y1)
                xt = child
                xt_cls = cls
            elif isinstance(child, LTFigure):
                pass
            elif isinstance(child, LTLine):
                layout = self.layout[ltpage.pageid]
                h, w = layout.shape
                cx, cy = np.clip(int(child.x0), 0, w - 1), np.clip(int(child.y0), 0, h - 1)
                cls = layout[cy, cx]
                if vstk and cls == xt_cls:
                    vlstk.append(child)
                else:
                    lstk.append(child)
            else:
                pass
        if vstk:
            sstk[-1] += f"{{v{len(var)}}}"
            var.append(vstk)
            varl.append(vlstk)
            varf.append(vfix)
        for v in var:
            l = max([vch.x1 for vch in v]) - v[0].x0
            vlen.append(l)

        def worker(s: str):
            if not s.strip() or re.match(r"^\{v\d+\}$", s):
                return s
            return self.translate_fn(s)

        from concurrent.futures import ThreadPoolExecutor
        with ThreadPoolExecutor(max_workers=self.thread) as executor:
            news = list(executor.map(worker, sstk))

        def raw_string(fcur: str, cstk: str):
            if fcur == self.noto_name and self.noto is not None:
                return "".join(["%04x" % self.noto.has_glyph(ord(c)) for c in cstk])
            elif isinstance(self.fontmap.get(fcur), PDFCIDFont):
                return "".join(["%04x" % ord(c) for c in cstk])
            else:
                return "".join(["%02x" % ord(c) for c in cstk])

        LANG_LINEHEIGHT_MAP = {
            "zh-cn": 1.4, "zh-tw": 1.4, "zh-hans": 1.4, "zh-hant": 1.4, "zh": 1.4,
            "ja": 1.1, "ko": 1.2, "en": 1.2, "ar": 1.0, "ru": 0.8, "uk": 0.8, "ta": 0.8
        }
        default_line_height = LANG_LINEHEIGHT_MAP.get(self.lang_out.lower(), 1.1)
        ops_list = []

        def gen_op_txt(font, size, x, y, rtxt):
            return f"/{font} {size:f} Tf 1 0 0 1 {x:f} {y:f} Tm [<{rtxt}>] TJ "

        def gen_op_line(x, y, xlen, ylen, linewidth):
            return f"ET q 1 0 0 1 {x:f} {y:f} cm [] 0 d 0 J {linewidth:f} w 0 0 m {xlen:f} {ylen:f} l S Q BT "

        for id, new in enumerate(news):
            x = pstk[id].x
            y = pstk[id].y
            x0 = pstk[id].x0
            x1 = pstk[id].x1
            height = pstk[id].y1 - pstk[id].y0
            size = pstk[id].size
            brk = pstk[id].brk
            cstk = ""
            fcur = None
            lidx = 0
            tx = x
            ptr = 0
            ops_vals: list[dict] = []

            while ptr < len(new):
                vy_regex = re.match(r"\{\s*v([\d\s]+)\}", new[ptr:], re.IGNORECASE)
                mod = 0
                if vy_regex:
                    ptr += len(vy_regex.group(0))
                    try:
                        vid = int(vy_regex.group(1).replace(" ", ""))
                        adv = vlen[vid]
                    except Exception:
                        continue
                    if var[vid][-1].get_text():
                        mod = var[vid][-1].width
                else:
                    ch = new[ptr]
                    fcur_ = None
                    try:
                        if fcur_ is None and self.fontmap["tiro"].to_unichr(ord(ch)) == ch:
                            fcur_ = "tiro"
                    except Exception:
                        pass
                    if fcur_ is None:
                        fcur_ = self.noto_name
                    if fcur_ == self.noto_name and self.noto is not None:
                        adv = self.noto.char_lengths(ch, size)[0]
                    else:
                        adv = self.fontmap[fcur_].char_width(ord(ch)) * size
                    ptr += 1
                if (
                    fcur_ != fcur
                    or vy_regex
                    or x + adv > x1 + 0.1 * size
                ):
                    if cstk:
                        ops_vals.append({"type": OpType.TEXT, "font": fcur, "size": size, "x": tx, "dy": 0, "rtxt": raw_string(fcur, cstk), "lidx": lidx})
                        cstk = ""
                if brk and x + adv > x1 + 0.1 * size:
                    x = x0
                    lidx += 1
                if vy_regex:
                    fix = 0
                    if fcur is not None:
                        fix = varf[vid]
                    for vch in var[vid]:
                        vc = chr(vch.cid)
                        ops_vals.append({"type": OpType.TEXT, "font": self.fontid[vch.font], "size": vch.size, "x": x + vch.x0 - var[vid][0].x0, "dy": fix + vch.y0 - var[vid][0].y0, "rtxt": raw_string(self.fontid[vch.font], vc), "lidx": lidx})
                    for l in varl[vid]:
                        if l.linewidth < 5:
                            ops_vals.append({"type": OpType.LINE, "x": l.pts[0][0] + x - var[vid][0].x0, "dy": l.pts[0][1] + fix - var[vid][0].y0, "linewidth": l.linewidth, "xlen": l.pts[1][0] - l.pts[0][0], "ylen": l.pts[1][1] - l.pts[0][1], "lidx": lidx})
                else:
                    if not cstk:
                        tx = x
                        if x == x0 and ch == " ":
                            adv = 0
                        else:
                            cstk += ch
                    else:
                        cstk += ch
                adv -= mod
                fcur = fcur_
                x += adv
            if cstk:
                ops_vals.append({"type": OpType.TEXT, "font": fcur, "size": size, "x": tx, "dy": 0, "rtxt": raw_string(fcur, cstk), "lidx": lidx})

            line_height = default_line_height
            while (lidx + 1) * size * line_height > height and line_height >= 1:
                line_height -= 0.05

            for vals in ops_vals:
                if vals["type"] == OpType.TEXT:
                    ops_list.append(gen_op_txt(vals["font"], vals["size"], vals["x"], vals["dy"] + y - vals["lidx"] * size * line_height, vals["rtxt"]))
                elif vals["type"] == OpType.LINE:
                    ops_list.append(gen_op_line(vals["x"], vals["dy"] + y - vals["lidx"] * size * line_height, vals["xlen"], vals["ylen"], vals["linewidth"]))

        for l in lstk:
            if l.linewidth < 5:
                ops_list.append(gen_op_line(l.pts[0][0], l.pts[0][1], l.pts[1][0] - l.pts[0][0], l.pts[1][1] - l.pts[0][1], l.linewidth))

        ops = f"BT {''.join(ops_list)}ET "
        return ops


def translate_pdf_file(
    input_path: Path,
    output_path: Path,
    translate_text_fn,
    lang_in: str,
    lang_out: str,
    thread: int,
) -> Dict[str, Any]:
    model = OnnxModel.from_path_env()

    font_name = str(os.environ.get("TRANSLATE_PDF_FONT_NAME", "noto") or "noto").strip()
    font_path = str(os.environ.get("TRANSLATE_PDF_FONT_PATH", "") or "").strip() or None
    noto = Font(font_name, font_path) if font_path else None

    raw = input_path.read_bytes()
    doc_en = Document(stream=raw)
    stream = io.BytesIO()
    doc_en.save(stream)
    doc_zh = Document(stream=stream.getvalue())

    if font_path:
        for page in doc_zh:
            page.insert_font(font_name, font_path)

    layout: Dict[int, np.ndarray] = {}
    rsrcmgr = PDFResourceManager()
    converter = KernelPDFConverter(
        rsrcmgr=rsrcmgr,
        layout=layout,
        thread=thread,
        translate_fn=translate_text_fn,
        lang_out=lang_out,
        noto_name=font_name,
        noto_font=noto,
    )
    obj_patch = {}
    interpreter = PDFPageInterpreterEx(rsrcmgr, converter, obj_patch)

    parser = PDFParser(io.BytesIO(raw))
    doc = PDFDocument(parser)
    for pageno, page in enumerate(PDFPage.create_pages(doc)):
        page.pageno = pageno
        pix = doc_zh[page.pageno].get_pixmap()
        image = np.frombuffer(pix.samples, np.uint8).reshape(pix.height, pix.width, 3)[:, :, ::-1]
        page_layout = model.predict(image, imgsz=int(pix.height / 32) * 32)[0]
        box = np.ones((pix.height, pix.width))
        h, w = box.shape
        vcls = ["abandon", "figure", "table", "isolate_formula", "formula_caption"]
        for i, d in enumerate(page_layout.boxes):
            if page_layout.names[int(d.cls)] not in vcls:
                x0, y0, x1, y1 = d.xyxy.squeeze()
                x0, y0, x1, y1 = (
                    np.clip(int(x0 - 1), 0, w - 1),
                    np.clip(int(h - y1 - 1), 0, h - 1),
                    np.clip(int(x1 + 1), 0, w - 1),
                    np.clip(int(h - y0 + 1), 0, h - 1),
                )
                box[y0:y1, x0:x1] = i + 2
        for i, d in enumerate(page_layout.boxes):
            if page_layout.names[int(d.cls)] in vcls:
                x0, y0, x1, y1 = d.xyxy.squeeze()
                x0, y0, x1, y1 = (
                    np.clip(int(x0 - 1), 0, w - 1),
                    np.clip(int(h - y1 - 1), 0, h - 1),
                    np.clip(int(x1 + 1), 0, w - 1),
                    np.clip(int(h - y0 + 1), 0, h - 1),
                )
                box[y0:y1, x0:x1] = 0
        layout[page.pageno] = box
        page.page_xref = doc_zh.get_new_xref()
        doc_zh.update_object(page.page_xref, "<<>>")
        doc_zh.update_stream(page.page_xref, b"")
        doc_zh[page.pageno].set_contents(page.page_xref)
        interpreter.process_page(page)

    for obj_id, ops_new in obj_patch.items():
        doc_zh.update_stream(obj_id, ops_new.encode())

    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_bytes(doc_zh.write(deflate=True, garbage=3, use_objstms=1))
    return {"pages": doc_zh.page_count}
