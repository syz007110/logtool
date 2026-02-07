import argparse
import hashlib
import json
import os
import re
import sqlite3
import sys
import time
import urllib.request
import urllib.error
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple


PROMPT_VERSION = "v1"


def _norm(s: str) -> str:
    return str(s or "")


def sha256_text(s: str) -> str:
    return hashlib.sha256(s.encode("utf-8")).hexdigest()


def safe_json_load(path: Path) -> Any:
    if not path.exists():
        return None
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return None


def ensure_dir(p: Path) -> None:
    p.mkdir(parents=True, exist_ok=True)


def normalize_base_url(base_url: str) -> str:
    s = str(base_url or "").strip()
    return s.rstrip("/")


def clamp_int(n: Any, min_v: int, max_v: int, fallback: int) -> int:
    try:
        v = int(str(n))
    except Exception:
        return fallback
    return max(min(v, max_v), min_v)


@dataclass
class Provider:
    id: str
    label: str
    kind: str
    requires_api_key: bool
    api_key: str
    base_url: str
    model: str
    timeout_ms: int
    temperature: float
    top_p: float


def load_providers(providers_file: Path) -> List[Provider]:
    raw = safe_json_load(providers_file)
    if not isinstance(raw, list):
        raise RuntimeError(f"providers-file invalid or not found: {providers_file}")

    out: List[Provider] = []
    seen = set()
    for spec in raw:
        if not isinstance(spec, dict):
            continue
        pid = str(spec.get("id") or "").strip()
        if not pid:
            continue
        key = pid.lower()
        if key in seen:
            continue
        seen.add(key)

        api_key_env = str(spec.get("apiKeyEnv") or "").strip()
        api_key = str(spec.get("apiKey") or (os.environ.get(api_key_env, "") if api_key_env else "") or "").strip()
        base_url = normalize_base_url(str(spec.get("baseUrl") or "").strip())
        model = str(spec.get("model") or "").strip()
        label = str(spec.get("label") or pid).strip() or pid
        kind = str(spec.get("kind") or "openai_compatible").strip()
        requires_api_key = bool(spec.get("requiresApiKey", True))
        timeout_ms = clamp_int(spec.get("timeoutMs"), 1000, 120000, 12000)
        temperature = float(spec.get("temperature", 0) or 0)
        top_p = float(spec.get("top_p", spec.get("topP", 0.1)) or 0.1)

        out.append(
            Provider(
                id=pid,
                label=label,
                kind=kind,
                requires_api_key=requires_api_key,
                api_key=api_key,
                base_url=base_url,
                model=model,
                timeout_ms=timeout_ms,
                temperature=temperature,
                top_p=top_p,
            )
        )
    if not out:
        raise RuntimeError(f"providers-file empty after filtering: {providers_file}")
    return out


def resolve_provider(providers: List[Provider], want_id: Optional[str]) -> Provider:
    want = str(want_id or "").strip()
    default_id = str(os.environ.get("SMART_SEARCH_LLM_DEFAULT_PROVIDER", "") or "").strip()

    if want:
        for p in providers:
            if p.id == want:
                return p
    if default_id:
        for p in providers:
            if p.id == default_id:
                return p
    return providers[0]


def llm_available(p: Provider) -> Tuple[bool, str]:
    dry_run = str(os.environ.get("TRANSLATE_DRY_RUN", "")).strip().lower() in ("1", "true", "yes", "on")
    if dry_run:
        return True, "dry_run"
    enabled = str(os.environ.get("SMART_SEARCH_LLM_ENABLED", "true")).strip().lower() not in ("0", "false", "no", "off")
    if not enabled:
        return False, "not_enabled"
    if p.requires_api_key and not p.api_key:
        return False, "missing_api_key"
    if not p.base_url:
        return False, "missing_base_url"
    if not p.model:
        return False, "missing_model"
    return True, "ok"


class SqliteCache:
    def __init__(self, db_path: Path):
        ensure_dir(db_path.parent)
        self.db_path = db_path
        self.conn = sqlite3.connect(str(db_path))
        self._init()

    def _init(self) -> None:
        cur = self.conn.cursor()
        cur.execute(
            """
            CREATE TABLE IF NOT EXISTS translation_cache (
              cache_key TEXT PRIMARY KEY,
              created_at INTEGER NOT NULL,
              provider_id TEXT NOT NULL,
              model TEXT NOT NULL,
              lang_in TEXT NOT NULL,
              lang_out TEXT NOT NULL,
              glossary_hash TEXT NOT NULL,
              prompt_version TEXT NOT NULL,
              original_text TEXT NOT NULL,
              translated_text TEXT NOT NULL
            )
            """
        )
        self.conn.commit()

    def get(self, cache_key: str) -> Optional[str]:
        cur = self.conn.cursor()
        cur.execute("SELECT translated_text FROM translation_cache WHERE cache_key = ?", (cache_key,))
        row = cur.fetchone()
        return row[0] if row else None

    def set(self, cache_key: str, payload: Dict[str, Any]) -> None:
        cur = self.conn.cursor()
        cur.execute(
            """
            INSERT OR REPLACE INTO translation_cache
            (cache_key, created_at, provider_id, model, lang_in, lang_out, glossary_hash, prompt_version, original_text, translated_text)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                cache_key,
                int(time.time()),
                payload["provider_id"],
                payload["model"],
                payload["lang_in"],
                payload["lang_out"],
                payload["glossary_hash"],
                payload["prompt_version"],
                payload["original_text"],
                payload["translated_text"],
            ),
        )
        self.conn.commit()


def glossary_load(glossary_file: Path) -> Tuple[List[Tuple[str, str]], List[Tuple[str, List[str]]], str]:
    """
    Returns: (entries, synonyms, glossary_hash)
    entries: [(source, target)]
    synonyms: [(canonical, [variants...])]
    """
    raw = safe_json_load(glossary_file)
    entries: List[Tuple[str, str]] = []
    synonyms: List[Tuple[str, List[str]]] = []

    if isinstance(raw, dict):
        arr = raw.get("entries")
        if isinstance(arr, list):
            for item in arr:
                if isinstance(item, dict):
                    s = str(item.get("source") or "").strip()
                    t = str(item.get("target") or "").strip()
                    if s and t:
                        entries.append((s, t))
        syn = raw.get("synonyms")
        if isinstance(syn, list):
            for item in syn:
                if isinstance(item, dict):
                    canonical = str(item.get("canonical") or "").strip()
                    variants = item.get("variants")
                    if canonical and isinstance(variants, list):
                        vs = [str(v).strip() for v in variants if str(v).strip()]
                        if vs:
                            synonyms.append((canonical, vs))
    elif isinstance(raw, list):
        for item in raw:
            if isinstance(item, dict):
                s = str(item.get("source") or "").strip()
                t = str(item.get("target") or "").strip()
                if s and t:
                    entries.append((s, t))

    # stable hash
    norm_obj = {
        "entries": sorted(entries, key=lambda x: (x[0], x[1])),
        "synonyms": sorted([(c, sorted(vs)) for (c, vs) in synonyms], key=lambda x: x[0]),
    }
    glossary_hash = sha256_text(json.dumps(norm_obj, ensure_ascii=False, separators=(",", ":")))
    return entries, synonyms, glossary_hash


def apply_synonym_fixes(text: str, synonyms: List[Tuple[str, List[str]]]) -> str:
    out = text
    for canonical, variants in synonyms:
        for v in variants:
            if not v:
                continue
            # keep simple: case-sensitive for now; users can add variants
            out = out.replace(v, canonical)
    return out


def make_term_placeholders(text: str, entries: List[Tuple[str, str]]) -> Tuple[str, Dict[str, str], List[str]]:
    """
    Replace matched source terms with placeholders {{T0001}}.
    Returns: (text_with_placeholders, placeholder_to_target, used_sources)
    """
    if not entries:
        return text, {}, []

    # longest first to avoid partial overlap
    sorted_entries = sorted(entries, key=lambda x: len(x[0]), reverse=True)
    placeholder_map: Dict[str, str] = {}
    used_sources: List[str] = []
    out = text
    idx = 1
    for src, tgt in sorted_entries:
        if src and src in out:
            ph = f"{{{{T{idx:04d}}}}}"
            idx += 1
            out = out.replace(src, ph)
            placeholder_map[ph] = tgt
            used_sources.append(src)
    return out, placeholder_map, used_sources


def restore_placeholders(text: str, placeholder_map: Dict[str, str]) -> str:
    out = text
    for ph, tgt in placeholder_map.items():
        out = out.replace(ph, tgt)
    return out


def protect_markdown(text: str) -> Tuple[str, Dict[str, str]]:
    """
    Protect code blocks, inline code, and link urls.
    Returns: (protected_text, token_map)
    """
    token_map: Dict[str, str] = {}
    counter = 0

    def token(prefix: str) -> str:
        nonlocal counter
        counter += 1
        return f"[[{prefix}_{counter:04d}]]"

    # fenced code blocks ```...```
    def repl_fenced(m: re.Match) -> str:
        t = token("CODEBLOCK")
        token_map[t] = m.group(0)
        return t

    out = re.sub(r"```[\s\S]*?```", repl_fenced, text)

    # inline code `...` (single-line)
    def repl_inline(m: re.Match) -> str:
        t = token("INLINE")
        token_map[t] = m.group(0)
        return t

    out = re.sub(r"`[^`\n]+`", repl_inline, out)

    # protect markdown link urls: ](url)
    def repl_url(m: re.Match) -> str:
        url = m.group(1)
        t = token("URL")
        token_map[t] = url
        return f"]({t})"

    out = re.sub(r"\]\(([^)]+)\)", repl_url, out)
    return out, token_map


def restore_markdown(text: str, token_map: Dict[str, str]) -> str:
    out = text
    # restore urls first (they're inside parentheses)
    for k, v in token_map.items():
        out = out.replace(k, v)
    return out


def split_paragraphs_keep_separators(text: str) -> List[Tuple[str, bool]]:
    """
    Returns list of (segment, is_separator).
    Separator segments are blank lines (\\n\\n...), preserved as-is.
    """
    parts: List[Tuple[str, bool]] = []
    pattern = re.compile(r"(\n\s*\n+)")
    last = 0
    for m in pattern.finditer(text):
        if m.start() > last:
            parts.append((text[last:m.start()], False))
        parts.append((m.group(1), True))
        last = m.end()
    if last < len(text):
        parts.append((text[last:], False))
    return parts


def split_long_text(text: str, max_chars: int) -> List[str]:
    s = text
    if len(s) <= max_chars:
        return [s]

    # split by sentence punctuation
    seps = re.compile(r"([。！？.!?]\s+|\n)")
    chunks: List[str] = []
    buf = ""
    for part in seps.split(s):
        if not part:
            continue
        if len(buf) + len(part) <= max_chars:
            buf += part
        else:
            if buf:
                chunks.append(buf)
                buf = ""
            if len(part) <= max_chars:
                buf = part
            else:
                # hard split
                for i in range(0, len(part), max_chars):
                    chunks.append(part[i : i + max_chars])
                buf = ""
    if buf:
        chunks.append(buf)
    return chunks


def build_translation_messages(source_lang: str, target_lang: str, text: str) -> List[Dict[str, str]]:
    # Keep prompt minimal to save tokens.
    system = (
        "You are a professional translation engine.\n"
        f"Translate from {source_lang} to {target_lang}.\n"
        "Rules:\n"
        "- Output ONLY the translated text. No explanations.\n"
        "- Preserve placeholders like {{T0001}} exactly.\n"
        "- Preserve tokens like [[CODEBLOCK_0001]] and [[INLINE_0001]] and [[URL_0001]] exactly.\n"
        "- Keep original formatting as much as possible.\n"
    )
    return [
        {"role": "system", "content": system},
        {"role": "user", "content": text},
    ]


def call_openai_compatible(provider: Provider, messages: List[Dict[str, str]]) -> Tuple[str, Dict[str, Any]]:
    url = provider.base_url.rstrip("/") + "/chat/completions"
    headers: Dict[str, str] = {"Accept": "application/json", "Content-Type": "application/json"}
    if provider.requires_api_key and provider.api_key:
        headers["Authorization"] = f"Bearer {provider.api_key}"

    body = {
        "model": provider.model,
        "temperature": provider.temperature if provider.temperature is not None else 0,
        "top_p": provider.top_p if provider.top_p is not None else 0.1,
        "messages": messages,
    }

    payload = json.dumps(body).encode("utf-8")
    req = urllib.request.Request(url, data=payload, headers=headers, method="POST")
    timeout = provider.timeout_ms / 1000.0

    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            raw = resp.read().decode("utf-8", errors="replace")
            data = json.loads(raw) if raw else {}
    except urllib.error.HTTPError as e:
        raw = ""
        try:
            raw = e.read().decode("utf-8", errors="replace")
        except Exception:
            pass
        raise RuntimeError(f"LLM request failed: {getattr(e, 'code', 'N/A')} {raw[:500]}")
    except urllib.error.URLError as e:
        raise RuntimeError(f"LLM request failed: {str(e)[:500]}")

    content = (((data.get("choices") or [{}])[0].get("message") or {}).get("content") or "")
    usage = data.get("usage") or None
    model = data.get("model") or provider.model
    return str(content), {"usage": usage, "model": model, "provider": provider.id}


def translate_text_with_cache(
    cache: SqliteCache,
    provider: Provider,
    lang_in: str,
    lang_out: str,
    glossary_hash: str,
    original_text: str,
) -> Tuple[str, Dict[str, Any], bool]:
    # Dry-run mode: no external LLM call (for local smoke tests).
    dry_run = str(os.environ.get("TRANSLATE_DRY_RUN", "")).strip().lower() in ("1", "true", "yes", "on")

    # Build stable cache key: provider+model+langpair+glossary+prompt+textHash
    text_hash = sha256_text(original_text)
    key = sha256_text("|".join([provider.id, provider.model, lang_in, lang_out, glossary_hash, PROMPT_VERSION, text_hash]))
    cached = cache.get(key)
    if cached is not None:
        return cached, {"cached": True}, True

    if dry_run:
        translated = original_text
        cache.set(
            key,
            {
                "provider_id": provider.id,
                "model": provider.model,
                "lang_in": lang_in,
                "lang_out": lang_out,
                "glossary_hash": glossary_hash,
                "prompt_version": PROMPT_VERSION,
                "original_text": original_text,
                "translated_text": translated,
            },
        )
        return translated, {"dryRun": True}, False

    messages = build_translation_messages(lang_in, lang_out, original_text)
    content, meta = call_openai_compatible(provider, messages)
    translated = str(content).strip()

    cache.set(
        key,
        {
            "provider_id": provider.id,
            "model": provider.model,
            "lang_in": lang_in,
            "lang_out": lang_out,
            "glossary_hash": glossary_hash,
            "prompt_version": PROMPT_VERSION,
            "original_text": original_text,
            "translated_text": translated,
        },
    )
    return translated, meta, False


def _merge_usage(u1: Optional[Dict], u2: Optional[Dict]) -> Dict[str, int]:
    """Merge two usage dicts (input_tokens/output_tokens or prompt_tokens/completion_tokens) for logging."""
    def _in(d: Dict) -> int:
        return int(d.get("input_tokens") or d.get("prompt_tokens") or 0)

    def _out(d: Dict) -> int:
        return int(d.get("output_tokens") or d.get("completion_tokens") or 0)

    a = u1 or {}
    b = u2 or {}
    return {
        "input_tokens": _in(a) + _in(b),
        "output_tokens": _out(a) + _out(b),
    }


def translate_plain_text(
    text: str,
    provider: Provider,
    cache: SqliteCache,
    lang_in: str,
    lang_out: str,
    entries: List[Tuple[str, str]],
    synonyms: List[Tuple[str, List[str]]],
    glossary_hash: str,
    max_chars: int,
    is_markdown: bool,
) -> Tuple[str, Dict[str, Any]]:
    token_map: Dict[str, str] = {}
    work = text
    if is_markdown:
        work, token_map = protect_markdown(work)

    # Term placeholders (locked)
    work, placeholder_map, _used_sources = make_term_placeholders(work, entries)

    segments = split_paragraphs_keep_separators(work)
    out_parts: List[str] = []
    meta = {"chunks": 0, "cachedChunks": 0, "usage": {"input_tokens": 0, "output_tokens": 0}}

    for seg, is_sep in segments:
        if is_sep:
            out_parts.append(seg)
            continue
        if not seg.strip():
            out_parts.append(seg)
            continue

        subchunks = split_long_text(seg, max_chars=max_chars)
        translated_sub: List[str] = []
        for ch in subchunks:
            meta["chunks"] += 1
            translated, _m, was_cached = translate_text_with_cache(
                cache=cache,
                provider=provider,
                lang_in=lang_in,
                lang_out=lang_out,
                glossary_hash=glossary_hash,
                original_text=ch,
            )
            if was_cached:
                meta["cachedChunks"] += 1
            meta["usage"] = _merge_usage(meta.get("usage"), _m.get("usage"))
            translated_sub.append(translated)
        out_parts.append("".join(translated_sub))

    out = "".join(out_parts)
    out = restore_placeholders(out, placeholder_map)
    out = apply_synonym_fixes(out, synonyms)
    if is_markdown:
        out = restore_markdown(out, token_map)
    return out, meta


def translate_json_value(
    value: Any,
    provider: Provider,
    cache: SqliteCache,
    lang_in: str,
    lang_out: str,
    entries: List[Tuple[str, str]],
    synonyms: List[Tuple[str, List[str]]],
    glossary_hash: str,
    max_chars: int,
) -> Tuple[Any, Dict[str, Any]]:
    meta = {"strings": 0, "chunks": 0, "cachedChunks": 0, "usage": {"input_tokens": 0, "output_tokens": 0}}

    def walk(v: Any) -> Any:
        if isinstance(v, str):
            meta["strings"] += 1
            translated, m = translate_plain_text(
                text=v,
                provider=provider,
                cache=cache,
                lang_in=lang_in,
                lang_out=lang_out,
                entries=entries,
                synonyms=synonyms,
                glossary_hash=glossary_hash,
                max_chars=max_chars,
                is_markdown=False,
            )
            meta["chunks"] += m.get("chunks", 0)
            meta["cachedChunks"] += m.get("cachedChunks", 0)
            meta["usage"] = _merge_usage(meta.get("usage"), m.get("usage"))
            return translated
        if isinstance(v, list):
            return [walk(x) for x in v]
        if isinstance(v, dict):
            return {k: walk(val) for k, val in v.items()}
        return v

    return walk(value), meta


def iter_docx_text_targets(doc):
    # paragraphs
    for p in doc.paragraphs:
        yield p
    # tables
    for table in doc.tables:
        for row in table.rows:
            for cell in row.cells:
                for p in cell.paragraphs:
                    yield p
    # headers/footers
    for section in doc.sections:
        for p in section.header.paragraphs:
            yield p
        for table in section.header.tables:
            for row in table.rows:
                for cell in row.cells:
                    for p in cell.paragraphs:
                        yield p
        for p in section.footer.paragraphs:
            yield p
        for table in section.footer.tables:
            for row in table.rows:
                for cell in row.cells:
                    for p in cell.paragraphs:
                        yield p


def translate_docx_file(
    input_path: Path,
    output_path: Path,
    provider: Provider,
    cache: SqliteCache,
    lang_in: str,
    lang_out: str,
    entries: List[Tuple[str, str]],
    synonyms: List[Tuple[str, List[str]]],
    glossary_hash: str,
    max_chars: int,
) -> Dict[str, Any]:
    try:
        from docx import Document  # type: ignore
    except Exception as e:
        raise RuntimeError(
            "python-docx is required to translate .docx files. Please install it in your Python environment."
        ) from e

    doc = Document(str(input_path))
    meta = {"paragraphs": 0, "chunks": 0, "cachedChunks": 0, "usage": {"input_tokens": 0, "output_tokens": 0}}

    for p in iter_docx_text_targets(doc):
        txt = p.text
        if not txt or not txt.strip():
            continue
        meta["paragraphs"] += 1
        translated, m = translate_plain_text(
            text=txt,
            provider=provider,
            cache=cache,
            lang_in=lang_in,
            lang_out=lang_out,
            entries=entries,
            synonyms=synonyms,
            glossary_hash=glossary_hash,
            max_chars=max_chars,
            is_markdown=False,
        )
        meta["chunks"] += m.get("chunks", 0)
        meta["cachedChunks"] += m.get("cachedChunks", 0)
        meta["usage"] = _merge_usage(meta.get("usage"), m.get("usage"))
        # NOTE: This will lose run-level styling, but preserves paragraph structure.
        p.text = translated

    ensure_dir(output_path.parent)
    doc.save(str(output_path))
    return meta


def translate_file(
    input_path: Path,
    output_path: Path,
    provider: Provider,
    cache: SqliteCache,
    lang_in: str,
    lang_out: str,
    entries: List[Tuple[str, str]],
    synonyms: List[Tuple[str, List[str]]],
    glossary_hash: str,
    max_chars: int,
) -> Dict[str, Any]:
    ext = input_path.suffix.lower()
    if ext == ".docx":
        return translate_docx_file(
            input_path=input_path,
            output_path=output_path,
            provider=provider,
            cache=cache,
            lang_in=lang_in,
            lang_out=lang_out,
            entries=entries,
            synonyms=synonyms,
            glossary_hash=glossary_hash,
            max_chars=max_chars,
        )
    if ext in (".txt", ".md"):
        raw = input_path.read_text(encoding="utf-8", errors="ignore")
        translated, meta = translate_plain_text(
            text=raw,
            provider=provider,
            cache=cache,
            lang_in=lang_in,
            lang_out=lang_out,
            entries=entries,
            synonyms=synonyms,
            glossary_hash=glossary_hash,
            max_chars=max_chars,
            is_markdown=(ext == ".md"),
        )
        ensure_dir(output_path.parent)
        output_path.write_text(translated, encoding="utf-8")
        return meta
    if ext == ".json":
        raw = input_path.read_text(encoding="utf-8", errors="ignore")
        obj = json.loads(raw)
        translated_obj, meta = translate_json_value(
            value=obj,
            provider=provider,
            cache=cache,
            lang_in=lang_in,
            lang_out=lang_out,
            entries=entries,
            synonyms=synonyms,
            glossary_hash=glossary_hash,
            max_chars=max_chars,
        )
        ensure_dir(output_path.parent)
        output_path.write_text(json.dumps(translated_obj, ensure_ascii=False, indent=2), encoding="utf-8")
        return meta
    raise RuntimeError(f"unsupported file type: {ext}")


def cmd_translate_file(args: argparse.Namespace) -> int:
    input_path = Path(args.input).resolve()
    output_path = Path(args.output).resolve()
    providers_file = Path(args.providers_file).resolve()
    glossary_file = Path(args.glossary_file).resolve()
    max_chars = int(args.max_chars)

    providers = load_providers(providers_file)
    provider = resolve_provider(providers, args.provider_id)
    ok, reason = llm_available(provider)
    if not ok:
        raise RuntimeError(f"LLM not available: {reason}")

    entries, synonyms, glossary_hash = glossary_load(glossary_file)

    # cache location: ../uploads/translate/cache.sqlite (single-machine)
    backend_root = Path(__file__).resolve().parents[1]
    raw_cache_db = str(os.environ.get("TRANSLATE_CACHE_DB", "") or "").strip()
    if raw_cache_db:
        cache_db = Path(raw_cache_db).expanduser()
    else:
        cache_db = backend_root / "translation-kernel" / ".cache" / "cache.sqlite"
    cache = SqliteCache(cache_db)

    meta = translate_file(
        input_path=input_path,
        output_path=output_path,
        provider=provider,
        cache=cache,
        lang_in=args.source_lang,
        lang_out=args.target_lang,
        entries=entries,
        synonyms=synonyms,
        glossary_hash=glossary_hash,
        max_chars=max_chars,
    )

    out = {
        "ok": True,
        "meta": {
            **meta,
            "provider": {"id": provider.id, "model": provider.model},
            "promptVersion": PROMPT_VERSION,
            "glossaryHash": glossary_hash,
        },
        "warnings": [
            "docx translation may lose run-level styling (bold/italic) in this first version."
        ]
        if input_path.suffix.lower() == ".docx"
        else [],
    }
    sys.stdout.write(json.dumps(out, ensure_ascii=False))
    return 0


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(prog="translation-kernel")
    sub = p.add_subparsers(dest="command", required=True)

    t = sub.add_parser("translate-file", help="Translate a file and write output")
    t.add_argument("--input", required=True)
    t.add_argument("--output", required=True)
    t.add_argument("--source-lang", required=True)
    t.add_argument("--target-lang", required=True)
    t.add_argument("--providers-file", required=True)
    t.add_argument("--provider-id", required=False, default=None)
    t.add_argument("--glossary-file", required=True)
    t.add_argument("--max-chars", required=False, default=str(int(os.environ.get("TRANSLATE_CHUNK_MAX_CHARS", "1200"))))
    t.set_defaults(func=cmd_translate_file)

    return p


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()
    try:
        return int(args.func(args))
    except Exception as e:
        err = {"ok": False, "error": str(e), "type": e.__class__.__name__}
        sys.stderr.write(json.dumps(err, ensure_ascii=False) + "\n")
        return 2


if __name__ == "__main__":
    raise SystemExit(main())

