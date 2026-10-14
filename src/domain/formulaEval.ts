/**
 * 安全公式表达式求值器。
 * 支持四则运算、括号、一元正负号、百分号字面量不行(用 0.1)、常用函数：
 *   min(a,b) / max(a,b) / round(x) / floor(x) / ceil(x) / abs(x)
 * 变量名支持中文、字母、数字、下划线（如：售价、FOB、头程运费）。
 * 不使用 eval / new Function，杜绝代码注入。
 */

export class FormulaEvalError extends Error {}

type Tok =
  | { t: "num"; v: number }
  | { t: "var"; v: string }
  | { t: "fn"; v: string }
  | { t: "op"; v: "+" | "-" | "*" | "/" }
  | { t: "lparen" }
  | { t: "rparen" }
  | { t: "comma" };

const isDigit = (c: string) => c >= "0" && c <= "9";
const isIdStart = (c: string) => /[A-Za-z_\u4e00-\u9fa5]/.test(c);
const isIdPart = (c: string) => /[A-Za-z0-9_\u4e00-\u9fa5]/.test(c);

const FN_NAMES = new Set(["min", "max", "round", "floor", "ceil", "abs"]);

function tokenize(src: string): Tok[] {
  const toks: Tok[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (c === " " || c === "\t" || c === "\r" || c === "\n") { i++; continue; }
    if (isDigit(c) || (c === "." && isDigit(src[i + 1]))) {
      let j = i;
      while (j < src.length && (isDigit(src[j]) || src[j] === ".")) j++;
      const num = Number(src.slice(i, j));
      if (!Number.isFinite(num)) throw new FormulaEvalError(`无效数字「${src.slice(i, j)}」`);
      toks.push({ t: "num", v: num });
      i = j;
      continue;
    }
    if (isIdStart(c)) {
      let j = i;
      while (j < src.length && isIdPart(src[j])) j++;
      const id = src.slice(i, j);
      // 函数名后必须紧跟左括号才视为函数，否则按变量（允许用户起名为 min 等，但正常场景不冲突）
      let k = j;
      while (k < src.length && (src[k] === " " || src[k] === "\t")) k++;
      if (FN_NAMES.has(id) && src[k] === "(") {
        toks.push({ t: "fn", v: id });
      } else {
        toks.push({ t: "var", v: id });
      }
      i = j;
      continue;
    }
    if (c === "+" || c === "-" || c === "*" || c === "/") { toks.push({ t: "op", v: c }); i++; continue; }
    if (c === "(") { toks.push({ t: "lparen" }); i++; continue; }
    if (c === ")") { toks.push({ t: "rparen" }); i++; continue; }
    if (c === "，" || c === ",") { toks.push({ t: "comma" }); i++; continue; }
    if (c === "（") { toks.push({ t: "lparen" }); i++; continue; }
    if (c === "）") { toks.push({ t: "rparen" }); i++; continue; }
    if (c === "×" || c === "x" || c === "X") { toks.push({ t: "op", v: "*" }); i++; continue; }
    if (c === "÷") { toks.push({ t: "op", v: "/" }); i++; continue; }
    if (c === "−" || c === "–") { toks.push({ t: "op", v: "-" }); i++; continue; }
    throw new FormulaEvalError(`无法识别的字符「${c}」`);
  }
  return toks;
}

type Node =
  | { k: "num"; v: number }
  | { k: "var"; v: string }
  | { k: "bin"; op: "+" | "-" | "*" | "/"; l: Node; r: Node }
  | { k: "neg"; e: Node }
  | { k: "call"; fn: string; args: Node[] };

function parse(tokens: Tok[]): Node {
  let pos = 0;
  const peek = () => tokens[pos];
  const next = () => tokens[pos++];

  function parseExpr(): Node {
    let left = parseTerm();
    while (peek()?.t === "op" && ((peek() as { v: string }).v === "+" || (peek() as { v: string }).v === "-")) {
      const op = (next() as { t: "op"; v: "+" | "-" }).v;
      left = { k: "bin", op, l: left, r: parseTerm() };
    }
    return left;
  }

  function parseTerm(): Node {
    let left = parseUnary();
    while (peek()?.t === "op" && ((peek() as { v: string }).v === "*" || (peek() as { v: string }).v === "/")) {
      const op = (next() as { t: "op"; v: "*" | "/" }).v;
      left = { k: "bin", op, l: left, r: parseUnary() };
    }
    return left;
  }

  function parseUnary(): Node {
    if (peek()?.t === "op" && ((peek() as { v: string }).v === "+" || (peek() as { v: string }).v === "-")) {
      const op = (next() as { t: "op"; v: "+" | "-" }).v;
      const e = parseUnary();
      return op === "-" ? { k: "neg", e } : e;
    }
    return parsePrimary();
  }

  function parsePrimary(): Node {
    const tok = next();
    if (!tok) throw new FormulaEvalError("公式不完整");
    if (tok.t === "num") return { k: "num", v: tok.v };
    if (tok.t === "var") return { k: "var", v: tok.v };
    if (tok.t === "fn") {
      if (peek()?.t !== "lparen") throw new FormulaEvalError(`函数 ${tok.v} 后需要括号`);
      next();
      const args: Node[] = [];
      if (peek()?.t !== "rparen") {
        args.push(parseExpr());
        while (peek()?.t === "comma") { next(); args.push(parseExpr()); }
      }
      if (peek()?.t !== "rparen") throw new FormulaEvalError(`函数 ${tok.v} 缺少右括号`);
      next();
      return { k: "call", fn: tok.v, args };
    }
    if (tok.t === "lparen") {
      const e = parseExpr();
      if (peek()?.t !== "rparen") throw new FormulaEvalError("缺少右括号");
      next();
      return e;
    }
    throw new FormulaEvalError("公式语法错误");
  }

  const ast = parseExpr();
  if (pos < tokens.length) throw new FormulaEvalError("公式末尾有多余内容");
  return ast;
}

const FNS: Record<string, (...a: number[]) => number> = {
  min: (...a) => Math.min(...a),
  max: (...a) => Math.max(...a),
  round: (x) => Math.round(x),
  floor: (x) => Math.floor(x),
  ceil: (x) => Math.ceil(x),
  abs: (x) => Math.abs(x),
};

function evalNode(nd: Node, vars: Record<string, number>): number {
  switch (nd.k) {
    case "num": return nd.v;
    case "var": {
      if (nd.v in vars) return vars[nd.v];
      // 英文变量名大小写不敏感（如 FOB / fob 均可）
      const lower = nd.v.toLowerCase();
      for (const k of Object.keys(vars)) {
        if (k.toLowerCase() === lower) return vars[k];
      }
      throw new FormulaEvalError(`未知变量「${nd.v}」`);
    }
    case "neg": return -evalNode(nd.e, vars);
    case "bin": {
      const l = evalNode(nd.l, vars);
      const r = evalNode(nd.r, vars);
      switch (nd.op) {
        case "+": return l + r;
        case "-": return l - r;
        case "*": return l * r;
        case "/": return l / r;
      }
    }
    case "call": {
      const fn = FNS[nd.fn];
      return fn(...nd.args.map((a) => evalNode(a, vars)));
    }
  }
}

export type CompiledFormula = (vars: Record<string, number>) => number;

/** 编译公式；语法错误抛 FormulaEvalError。返回的函数在变量缺失时抛 FormulaEvalError。 */
export function compileFormula(src: string): CompiledFormula {
  const ast = parse(tokenize(src));
  return (vars) => evalNode(ast, vars);
}

/** 编译失败返回 null（用于设置页实时校验与引擎侧安全回退） */
export function tryCompileFormula(src: string | undefined | null): CompiledFormula | null {
  if (!src || !src.trim()) return null;
  try {
    return compileFormula(src);
  } catch {
    return null;
  }
}
