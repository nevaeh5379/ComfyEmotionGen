export interface VisualVariable {
  id: string
  name: string
  value: string
}

export interface AxisEntryProperty {
  id: string
  name: string
  value: string
}

export interface VisualAxisEntry {
  id: string
  key: string
  fileKey: string
  value: string
  properties: AxisEntryProperty[]
  isComplex: boolean
}

export interface VisualAxis {
  id: string
  name: string
  include: string
  entries: VisualAxisEntry[]
}

export interface VisualCombine {
  id: string
  expression: string
}

export interface VisualExclude {
  id: string
  statement: string
}

export interface VisualOverride {
  id: string
  statement: string
  body: string
}

export interface ParsedTemplate {
  variables: VisualVariable[]
  axes: VisualAxis[]
  combines: VisualCombine[]
  excludes: VisualExclude[]
  overrides: VisualOverride[]
  templateBody: string
  filenameBody: string
  cleanFilename: boolean
}

const SET_PATTERN =
  /\{\{\s*set\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*=\s*"((?:[^"\\]|\\.)*)"\s*\}\}/g
const AXIS_PATTERN =
  /\{\{\s*axis\s+([a-zA-Z_][a-zA-Z0-9_]*)(?:\s+include="((?:[^"\\]|\\.)*)")?\s*\}\}([\s\S]*?)\{\{\s*\/axis\s*\}\}/gi
const SIMPLE_AXIS_ENTRY_PATTERN =
  /^([a-zA-Z_][a-zA-Z0-9_]*)(?:\s+as\s+"((?:[^"\\]|\\.)*)")?\s*:\s*"((?:[^"\\]|\\.)*)"$/
const COMPLEX_AXIS_ENTRY_PATTERN =
  /^([a-zA-Z_][a-zA-Z0-9_]*)(?:\s+as\s+"((?:[^"\\]|\\.)*)")?\s*:\s*\{\s*([^{}]+)\s*\}$/
const AXIS_PROPERTY_PATTERN =
  /([a-zA-Z_][a-zA-Z0-9_]*)\s*:\s*"((?:[^"\\]|\\.)*)"/g
const COMBINE_PATTERN = /\{\{\s*combine\s+([^}]+)\s*\}\}/g
const EXCLUDE_PATTERN = /\{\{\s*exclude\s+([^}]+)\s*\}\}/g
const OVERRIDE_PATTERN =
  /\{\{\s*override\s+([^}]+)\s*\}\}([\s\S]*?)\{\{\s*\/override\s*\}\}/g
const TEMPLATE_PATTERN =
  /\{\{\s*template\s*\}\}([\s\S]*?)\{\{\s*\/template\s*\}\}/i
const FILENAME_PATTERN =
  /\{\{\s*filename\s*\}\}([\s\S]*?)\{\{\s*\/filename\s*\}\}/i

function parseVariables(code: string): {
  variables: VisualVariable[]
  cleanFilename: boolean
} {
  const variables: VisualVariable[] = []
  let cleanFilename = true

  for (const match of code.matchAll(SET_PATTERN)) {
    const name = match[1] ?? ""
    const value = match[2] ?? ""
    if (name === "clean_filename") {
      cleanFilename = value.toLowerCase() === "true"
    } else {
      variables.push({
        id: `var-${String(variables.length)}`,
        name,
        value,
      })
    }
  }
  return { variables, cleanFilename }
}

function parseAxisProperties(
  source: string,
  axisIndex: number,
  entryIndex: number
): AxisEntryProperty[] {
  return Array.from(source.matchAll(AXIS_PROPERTY_PATTERN), (match, index) => ({
    id: `p-${String(axisIndex)}-${String(entryIndex)}-${String(index)}`,
    name: match[1] ?? "",
    value: match[2] ?? "",
  }))
}

function parseAxisEntry(
  source: string,
  axisIndex: number,
  entryIndex: number
): VisualAxisEntry | null {
  const simpleMatch = SIMPLE_AXIS_ENTRY_PATTERN.exec(source)
  if (simpleMatch !== null) {
    return {
      id: `e-${String(axisIndex)}-${String(entryIndex)}`,
      key: simpleMatch[1] ?? "",
      fileKey: simpleMatch[2] ?? "",
      value: simpleMatch[3] ?? "",
      properties: [],
      isComplex: false,
    }
  }

  const complexMatch = COMPLEX_AXIS_ENTRY_PATTERN.exec(source)
  if (complexMatch === null) return null
  return {
    id: `e-${String(axisIndex)}-${String(entryIndex)}`,
    key: complexMatch[1] ?? "",
    fileKey: complexMatch[2] ?? "",
    value: "",
    properties: parseAxisProperties(
      complexMatch[3] ?? "",
      axisIndex,
      entryIndex
    ),
    isComplex: true,
  }
}

function parseAxes(code: string): VisualAxis[] {
  return Array.from(code.matchAll(AXIS_PATTERN), (match, axisIndex) => {
    const entries: VisualAxisEntry[] = []
    for (const line of (match[3] ?? "").split("\n")) {
      const source = line.trim()
      if (source === "" || source.startsWith("#") || source.startsWith("//")) {
        continue
      }
      const entry = parseAxisEntry(source, axisIndex, entries.length)
      if (entry !== null) entries.push(entry)
    }
    return {
      id: `a-${String(axisIndex)}`,
      name: match[1] ?? "",
      include: match[2] ?? "",
      entries,
    }
  })
}

function parseCombines(code: string): VisualCombine[] {
  const expressions = Array.from(code.matchAll(COMBINE_PATTERN), (match) =>
    (match[1] ?? "").trim()
  ).filter((expression) => !expression.startsWith("/"))
  return expressions.map((expression, index) => ({
    id: `c-${String(index)}`,
    expression,
  }))
}

function parseExcludes(code: string): VisualExclude[] {
  return Array.from(code.matchAll(EXCLUDE_PATTERN), (match, index) => ({
    id: `ex-${String(index)}`,
    statement: (match[1] ?? "").trim(),
  }))
}

function parseOverrides(code: string): VisualOverride[] {
  return Array.from(code.matchAll(OVERRIDE_PATTERN), (match, index) => ({
    id: `ov-${String(index)}`,
    statement: (match[1] ?? "").trim(),
    body: (match[2] ?? "").replace(/^\n/, "").replace(/\n$/, ""),
  }))
}

function extractBlock(code: string, pattern: RegExp): string {
  return pattern.exec(code)?.[1] ?? ""
}

export function parseCegTemplate(code: string): ParsedTemplate {
  const { variables, cleanFilename } = parseVariables(code)
  return {
    variables,
    axes: parseAxes(code),
    combines: parseCombines(code),
    excludes: parseExcludes(code),
    overrides: parseOverrides(code),
    templateBody: extractBlock(code, TEMPLATE_PATTERN),
    filenameBody: extractBlock(code, FILENAME_PATTERN),
    cleanFilename,
  }
}
