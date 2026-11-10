// Parser + evaluator for the OData $filter subset the client sends:
// comparisons (eq ne gt ge lt le), and / or / not, parentheses, `in (...)`,
// string / number / boolean / null / DateTimeOffset literals.

type Value = string | number | boolean | null | { ts: number };
type Node =
  | { t: "cmp"; op: string; field: string; value: Value }
  | { t: "in"; field: string; values: Value[] }
  | { t: "and" | "or"; a: Node; b: Node }
  | { t: "not"; a: Node };

type Tok = { k: "id" | "str" | "num" | "ts" | "lp" | "rp" | "comma"; v: string };

const TS_RE = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2}))?/;

function tokenize(s: string): Tok[] {
  const out: Tok[] = [];
  let i = 0;
  while (i < s.length) {
    const c = s[i]!;
    if (/\s/.test(c)) {
      i++;
    } else if (c === "(") {
      out.push({ k: "lp", v: c });
      i++;
    } else if (c === ")") {
      out.push({ k: "rp", v: c });
      i++;
    } else if (c === ",") {
      out.push({ k: "comma", v: c });
      i++;
    } else if (c === "'") {
      let v = "";
      i++;
      for (;;) {
        if (i >= s.length) throw new FilterError("Unterminated string");
        if (s[i] === "'") {
          if (s[i + 1] === "'") {
            v += "'";
            i += 2;
            continue;
          }
          i++;
          break;
        }
        v += s[i++];
      }
      out.push({ k: "str", v });
    } else {
      const ts = TS_RE.exec(s.slice(i));
      if (ts && ts[0].includes("-")) {
        out.push({ k: "ts", v: ts[0] });
        i += ts[0].length;
        continue;
      }
      const num = /^-?\d+(\.\d+)?/.exec(s.slice(i));
      if (num) {
        out.push({ k: "num", v: num[0] });
        i += num[0].length;
        continue;
      }
      const id = /^[A-Za-z_][A-Za-z0-9_/]*/.exec(s.slice(i));
      if (!id) throw new FilterError(`Unexpected character at ${i}`);
      out.push({ k: "id", v: id[0] });
      i += id[0].length;
    }
  }
  return out;
}

export class FilterError extends Error {}

export function parseFilter(src: string): Node {
  const toks = tokenize(src);
  let pos = 0;
  const peek = () => toks[pos];
  const next = () => {
    const t = toks[pos++];
    if (!t) throw new FilterError("Unexpected end of filter");
    return t;
  };
  const isWord = (w: string) => peek()?.k === "id" && peek()!.v.toLowerCase() === w;

  function value(): Value {
    const t = next();
    if (t.k === "str") return t.v;
    if (t.k === "num") return Number(t.v);
    if (t.k === "ts") return { ts: Date.parse(t.v) };
    if (t.k === "id" && t.v === "true") return true;
    if (t.k === "id" && t.v === "false") return false;
    if (t.k === "id" && t.v === "null") return null;
    throw new FilterError(`Expected a literal, got ${t.v}`);
  }

  function primary(): Node {
    if (isWord("not")) {
      next();
      return { t: "not", a: primary() };
    }
    if (peek()?.k === "lp") {
      next();
      const n = orExpr();
      if (next().k !== "rp") throw new FilterError("Expected )");
      return n;
    }
    const f = next();
    if (f.k !== "id") throw new FilterError(`Expected a field, got ${f.v}`);
    const op = next();
    if (op.k !== "id") throw new FilterError("Expected an operator");
    const o = op.v.toLowerCase();
    if (o === "in") {
      if (next().k !== "lp") throw new FilterError("Expected ( after in");
      const values = [value()];
      while (peek()?.k === "comma") {
        next();
        values.push(value());
      }
      if (next().k !== "rp") throw new FilterError("Expected )");
      return { t: "in", field: f.v, values };
    }
    if (!["eq", "ne", "gt", "ge", "lt", "le"].includes(o)) throw new FilterError(`Unsupported operator ${op.v}`);
    return { t: "cmp", op: o, field: f.v, value: value() };
  }

  function andExpr(): Node {
    let n = primary();
    while (isWord("and")) {
      next();
      n = { t: "and", a: n, b: primary() };
    }
    return n;
  }

  function orExpr(): Node {
    let n = andExpr();
    while (isWord("or")) {
      next();
      n = { t: "or", a: n, b: andExpr() };
    }
    return n;
  }

  const n = orExpr();
  if (pos !== toks.length) throw new FilterError("Trailing tokens in filter");
  return n;
}

function norm(v: unknown, like: Value): unknown {
  if (like !== null && typeof like === "object") {
    if (typeof v !== "string") return null;
    const ms = Date.parse(v);
    return Number.isNaN(ms) ? null : ms;
  }
  return v;
}

function compare(op: string, left: unknown, right: unknown): boolean {
  if (op === "eq") return left === right;
  if (op === "ne") return left !== right;
  if (left === null || left === undefined || right === null) return false;
  const l = left as number | string;
  const r = right as number | string;
  switch (op) {
    case "gt":
      return l > r;
    case "ge":
      return l >= r;
    case "lt":
      return l < r;
    case "le":
      return l <= r;
  }
  return false;
}

export function evaluate(node: Node, rec: Record<string, unknown>): boolean {
  switch (node.t) {
    case "and":
      return evaluate(node.a, rec) && evaluate(node.b, rec);
    case "or":
      return evaluate(node.a, rec) || evaluate(node.b, rec);
    case "not":
      return !evaluate(node.a, rec);
    case "in":
      return node.values.some((v) => compare("eq", norm(rec[node.field] ?? null, v), v && typeof v === "object" ? v.ts : v));
    case "cmp": {
      const right = node.value && typeof node.value === "object" ? node.value.ts : node.value;
      return compare(node.op, norm(rec[node.field] ?? null, node.value), right);
    }
  }
}
