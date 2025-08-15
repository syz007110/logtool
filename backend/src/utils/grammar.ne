# Nearley grammar skeleton for NL -> filter conditions (optional, not wired yet)

@{%
// helpers injected by parser builder
function leaf(field, op, val) { return { field, operator: op, value: val }; }
function group(logic, conds) { return { logic, conditions: conds }; }
%}

Main -> _ OrExpr _ {% d => d[1] %}

OrExpr -> AndExpr ( _ OR _ AndExpr {% d => d[4] %} ):* {%
  function(d) {
    if (!d[1]) return null;
    const rest = d[2];
    if (!rest || rest.length === 0) return d[1];
    const conds = [d[1]].concat(rest.map(x => x));
    return group('OR', conds);
  }
%}

AndExpr -> Term ( _ AND _ Term {% d => d[4] %} ):* {%
  function(d) {
    if (!d[1]) return null;
    const rest = d[2];
    if (!rest || rest.length === 0) return d[1];
    const conds = [d[1]].concat(rest.map(x => x));
    return group('AND', conds);
  }
%}

Term -> Contains
      | NotContains
      | Between
      | InList
      | Paren

Paren -> "(" _ OrExpr _ ")" {% d => d[2] %}

Contains -> Field _ (REL|CONTAINS) _ Value {% d => leaf(d[0], 'contains', d[4]) %}
NotContains -> Field _ NOTCONTAINS _ Value {% d => leaf(d[0], 'notcontains', d[4]) %}
Between -> Field _ BETWEEN _ Value _ TO _ Value {% d => leaf(d[0], 'between', [d[4], d[8]]) %}
InList -> Field _ IN _ "(" _ List _ ")" {% d => leaf(d[0], 'in', d[6]) %}

List -> Value ( _ "," _ Value {% d => d[3] %} ):* {%
  function(d) { return [d[0]].concat(d[1].map(x => x)); }
%}

Field -> /timestamp|error_code|param1|param2|param3|param4|explanation/
Value -> /[^\s,)]+/

AND -> /AND|且|并且/
OR -> /OR|或|或者/
CONTAINS -> /包含|包括|含|相关|有关|关于/
NOTCONTAINS -> /不包含|不包括|不含/
BETWEEN -> /between|介于|之间/
TO -> /到|至|~|\-/
IN -> /in|之一|属于/

_ -> /[ \t]*/


