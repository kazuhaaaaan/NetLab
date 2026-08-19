// Parser HTML aman untuk NetBrowser — TANPA eval, TANPA fetch, TANPA iframe.
// Tokenizer sederhana → elemen React. Mendukung subset HTML statis yang
// umum dibuat Website Editor: heading, paragraf, link, daftar, tabel,
// gambar placeholder, pre, hr, div/span, form GET + input/button.
// Semua atribut selain href/action/name/value/placeholder/type disaring.
import React from 'react';

export interface HtmlNode {
  tag: string;
  attrs: Record<string, string>;
  children: HtmlNode[];
  text: string;
}

interface Token {
  type: 'open' | 'close' | 'text' | 'selfclose';
  tag?: string;
  attrs?: Record<string, string>;
  text?: string;
}

const VOID_TAGS = new Set(['br', 'hr', 'img', 'input', 'meta', 'link']);

/** Tag yang TIDAK PERNAH dirender (kontennya dibuang): executable/embed. */
const DANGEROUS_TAGS = new Set(['script', 'style', 'iframe', 'object', 'embed', 'base', 'meta', 'link']);

function tokenize(html: string): Token[] {
  const tokens: Token[] = [];
  const re = /<!--[\s\S]*?-->|<(\/?)([a-zA-Z0-9]+)([^>]*)>|([^<]+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    if (m[4] !== undefined) {
      tokens.push({ type: 'text', text: m[4] });
      continue;
    }
    const closing = m[1] === '/';
    const tag = m[2].toLowerCase();
    const rest = m[3] || '';
    if (closing) {
      tokens.push({ type: 'close', tag });
      continue;
    }
    const selfClose = /\/\s*$/.test(rest) || VOID_TAGS.has(tag);
    const attrs: Record<string, string> = {};
    const attrRe = /([a-zA-Z_:][-a-zA-Z0-9_:]*)\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/g;
    let am: RegExpExecArray | null;
    while ((am = attrRe.exec(rest)) !== null) {
      attrs[am[1].toLowerCase()] = am[3] ?? am[4] ?? am[5] ?? '';
    }
    tokens.push(selfClose ? { type: 'selfclose', tag, attrs } : { type: 'open', tag, attrs });
  }
  return tokens;
}

const BLOCK_TAGS = new Set(['html', 'head', 'body', 'div', 'p', 'ul', 'ol', 'li', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'pre', 'table', 'tr', 'td', 'th', 'form', 'section', 'header', 'footer', 'br', 'hr']);

/** Saring atribut: hanya yang aman untuk rendering statis. */
function safeAttrs(tag: string, attrs: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  const allowed = new Set(['href', 'title', 'alt', 'action', 'name', 'value', 'placeholder', 'type', 'method', 'width', 'height', 'colspan', 'rowspan']);
  for (const [k, v] of Object.entries(attrs)) {
    if (!allowed.has(k)) continue;
    if (k === 'href' && !/^https?:\/\//i.test(v) && !v.startsWith('/')) continue;
    out[k] = v;
  }
  return out;
}

function parseTokens(tokens: Token[], i: number): { nodes: HtmlNode[]; next: number } {
  const nodes: HtmlNode[] = [];
  let idx = i;
  while (idx < tokens.length) {
    const t = tokens[idx];
    if (t.type === 'close') return { nodes, next: idx + 1 };
    if (t.type === 'text') {
      const text = t.text ?? '';
      if (text.trim().length > 0) nodes.push({ tag: '#text', attrs: {}, children: [], text });
      idx++;
      continue;
    }
    if (t.type === 'selfclose') {
      if (DANGEROUS_TAGS.has(t.tag!)) {
        idx++;
        continue;
      }
      nodes.push({ tag: t.tag!, attrs: safeAttrs(t.tag!, t.attrs || {}), children: [], text: '' });
      idx++;
      continue;
    }
    // open
    const tag = t.tag!;
    if (DANGEROUS_TAGS.has(tag)) {
      // lewati seluruh subtree (tanpa render, tanpa eval)
      const inner = parseTokens(tokens, idx + 1);
      idx = inner.next;
      continue;
    }
    const inner = parseTokens(tokens, idx + 1);
    nodes.push({ tag, attrs: safeAttrs(tag, t.attrs || {}), children: inner.nodes, text: '' });
    idx = inner.next;
  }
  return { nodes, next: idx };
}

export function parseHtml(html: string): HtmlNode[] {
  return parseTokens(tokenize(html), 0).nodes;
}

export interface RenderOptions {
  onLinkClick: (href: string) => void;
}

function renderChildren(nodes: HtmlNode[], opts: RenderOptions): React.ReactNode[] {
  return nodes.map((n, i) => renderNode(n, opts, i));
}

function renderNode(node: HtmlNode, opts: RenderOptions, key: number): React.ReactNode {
  const { tag, attrs, children, text } = node;
  const kids = renderChildren(children, opts);

  const linkClick = (e: React.MouseEvent) => {
    e.preventDefault();
    opts.onLinkClick(attrs['href'] ?? '');
  };

  switch (tag) {
    case '#text':
      return React.createElement(React.Fragment, { key }, text);
    case 'html':
    case 'head':
      return React.createElement(React.Fragment, { key }, kids);
    case 'title':
      return null;
    case 'body':
      return React.createElement('div', { key, className: 'win-html-body' }, kids);
    case 'h1':
    case 'h2':
    case 'h3':
    case 'h4':
    case 'h5':
    case 'h6':
      return React.createElement(tag, { key, className: `win-html-${tag}` }, kids);
    case 'p':
      return React.createElement('p', { key, className: 'win-html-p' }, kids);
    case 'a':
      return React.createElement(
        'a',
        {
          key,
          className: 'win-html-a',
          href: attrs['href'] ?? '#',
          onClick: linkClick,
        },
        kids
      );
    case 'br':
      return React.createElement('br', { key });
    case 'hr':
      return React.createElement('hr', { key, className: 'win-html-hr' });
    case 'b':
    case 'strong':
      return React.createElement('strong', { key }, kids);
    case 'i':
    case 'em':
      return React.createElement('em', { key }, kids);
    case 'u':
      return React.createElement('u', { key }, kids);
    case 'pre':
      return React.createElement('pre', { key, className: 'win-html-pre' }, kids);
    case 'ul':
      return React.createElement('ul', { key, className: 'win-html-ul' }, kids);
    case 'ol':
      return React.createElement('ol', { key, className: 'win-html-ol' }, kids);
    case 'li':
      return React.createElement('li', { key }, kids);
    case 'div':
    case 'section':
    case 'header':
    case 'footer':
      return React.createElement('div', { key, className: `win-html-${tag}` }, kids);
    case 'span':
      return React.createElement('span', { key }, kids);
    case 'table':
      return React.createElement('table', { key, className: 'win-html-table' }, kids);
    case 'tr':
      return React.createElement('tr', { key }, kids);
    case 'td':
    case 'th':
      return React.createElement(tag, { key, className: `win-html-${tag}` }, kids);
    case 'img':
      return React.createElement('div', {
        key,
        className: 'win-html-img',
        title: attrs['alt'] ?? attrs['title'] ?? 'gambar (simulasi)',
      }, attrs['alt'] ? `[gambar: ${attrs['alt']}]` : '[gambar]');
    case 'form':
      return React.createElement(
        'form',
        {
          key,
          className: 'win-html-form',
          onSubmit: (e: React.FormEvent) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget as HTMLFormElement);
            const qs = new URLSearchParams();
            fd.forEach((v, k) => qs.append(k, String(v)));
            const action = attrs['action'] ?? '';
            const sep = action.includes('?') ? '&' : '?';
            opts.onLinkClick(action + sep + qs.toString());
          },
        },
        kids
      );
    case 'input':
      return React.createElement('input', {
        key,
        name: attrs['name'],
        type: attrs['type'] === 'submit' ? 'submit' : 'text',
        defaultValue: attrs['value'],
        placeholder: attrs['placeholder'],
        className: 'win-html-input',
      });
    case 'button':
      return React.createElement('button', { key, type: 'submit', className: 'win-html-btn' }, kids);
    default:
      return React.createElement('span', { key }, kids);
  }
}

export function renderHtml(nodes: HtmlNode[], opts: RenderOptions): React.ReactNode {
  return renderChildren(nodes, opts);
}

/** Ambil judul <title> dari HTML (untuk tab browser). */
export function htmlTitle(html: string): string | null {
  const m = html.match(/<title[^>]*>([^<]*)<\/title>/i);
  return m && m[1].trim() ? m[1].trim() : null;
}

/** Hilangkan tag dari HTML (untuk ringkasan teks). */
export function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 300);
}