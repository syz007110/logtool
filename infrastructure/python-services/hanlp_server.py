# hanlp_rest_server.py
from flask import Flask, request, jsonify
import hanlp
from waitress import serve

# 创建 Flask 应用
app = Flask(__name__)

# 使用官方提供且轻量的中文分词模型标识，避免不存在的 CTB9_CONVSEG 报错
tokenizer = hanlp.load('COARSE_ELECTRA_SMALL_ZH')

# 尝试构建尽可能完整的 NLP 管线（分词/词性/NER/依存/关键词）
nlp_pipeline = None
try:
    # 逐步追加组件，某些组件不可用时忽略，尽量保证服务可用性
    pipe = hanlp.pipeline()
    try:
        pipe = pipe.append('tok/fine')
    except Exception:
        pipe = pipe.append('tok/coarse')
    try:
        pipe = pipe.append('pos')
    except Exception:
        pass
    try:
        pipe = pipe.append('ner/msra')
    except Exception:
        pass
    try:
        pipe = pipe.append('dep')
    except Exception:
        pass
    try:
        pipe = pipe.append('keyphrase')
    except Exception:
        pass
    nlp_pipeline = pipe
except Exception:
    nlp_pipeline = None
@app.route('/segment', methods=['POST'])
def segment():
    return parse()
@app.route('/parse', methods=['POST'])
def parse():
    """
    接收 JSON 请求:
    {
        "text": "要分词的文本"
    }
    返回分词结果 JSON
    """
    data = request.get_json()
    text = data.get('text', '')
    if not text:
        return jsonify({"error": "text 参数不能为空"}), 400
    result = tokenizer(text)
    return jsonify(result)

@app.route('/nlp', methods=['POST'])
def nlp_all():
    """
    综合 NLP 分析：分词、词性、NER、依存、关键词
    返回结构（字段尽可能填充，不可用则置空/空数组）：
    {
      "tokens": [..],
      "pos": [..],
      "ner": [ [start, end, label, span], ... ] 或框架默认格式,
      "dep": 任意框架返回的依存结构,
      "keywords": [..]
    }
    """
    try:
        data = request.get_json()
        text = data.get('text', '') if isinstance(data, dict) else ''
        if not text:
            return jsonify({"error": "text 参数不能为空"}), 400

        out = {
            'tokens': [],
            'pos': [],
            'ner': [],
            'dep': None,
            'keywords': []
        }

        # 基础分词
        try:
            toks = tokenizer(text)
            out['tokens'] = toks if isinstance(toks, list) else []
        except Exception:
            out['tokens'] = []

        # 管线尽力而为
        if nlp_pipeline is not None:
            try:
                res = nlp_pipeline(text)
                # 尝试尽量兼容不同字段命名
                if 'tok/fine' in res:
                    out['tokens'] = res.get('tok/fine', out['tokens'])
                elif 'tok/coarse' in res:
                    out['tokens'] = res.get('tok/coarse', out['tokens'])
                out['pos'] = res.get('pos', []) or []
                out['ner'] = res.get('ner', []) or res.get('ner/msra', []) or []
                out['dep'] = res.get('dep', None)
                out['keywords'] = res.get('keyphrase', []) or res.get('keywords', []) or []
            except Exception:
                pass

        # 简单降级关键词：若管线没有给出，取长度降序前5个不同 token
        if not out['keywords'] and out['tokens']:
            uniq = []
            seen = set()
            for t in out['tokens']:
                s = str(t)
                if s and s not in seen:
                    seen.add(s)
                    uniq.append(s)
            uniq.sort(key=lambda x: (-len(x), x))
            out['keywords'] = uniq[:5]

        return jsonify(out)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

if __name__ == "__main__":
    # 使用 Waitress 生产级 WSGI 服务器启动
    print("HanLP REST 服务启动，访问 http://127.0.0.1:8765")
    serve(app, host='0.0.0.0', port=8765)
