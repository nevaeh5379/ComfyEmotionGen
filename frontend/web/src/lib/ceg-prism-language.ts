// Prism language definition for CEG (ComfyEmotionGen)
import type { Grammar } from "prismjs";

const cegPrismLanguage: Grammar = {
  comment: {
    pattern: /\{\{#[\s\S]*?#\}\}/,
    greedy: true,
  },
  tag: {
    pattern: /\{\{\/(?:axis|template|filename)\}\}|\{\{(?:axis|set|combine|exclude|template|filename)\}\}/,
  },
  keyword: {
    pattern: /\b(?:weighted|include|sample|seed|AND)\b/i,
  },
  string: {
    pattern: /"(?:[^"\\]|\\.)*"/,
    greedy: true,
  },
  number: /\b\d+(?:\.\d+)?\b/,
  operator: /[@~+*()=:]/,
  variable: {
    pattern: /\{\{[a-zA-Z_][a-zA-Z0-9_]*\}\}/,
  },
  "axis-key": {
    pattern: /^[ \t]*[a-zA-Z_][a-zA-Z0-9_]*(?=\s*:)/m,
  },
  identifier: /[a-zA-Z_][a-zA-Z0-9_]*/,
};

export default cegPrismLanguage;
