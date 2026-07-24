import assert from "node:assert/strict"

import { parseCegTemplate } from "../src/comfyui/utils/cegTemplateParser.ts"

const source = `{{set clean_filename = "false"}}
{{set style = "cinematic"}}
{{axis mood include="base.ceg"}}
# ignored
happy as "joy": "smile"
detail: { prompt: "sharp", weight: "1.2" }
{{/axis}}
{{combine mood + style}}
{{exclude mood == "sad"}}
{{override mood == "happy"}}
bright light
{{/override}}
{{template}}
portrait, {{mood}}
{{/template}}
{{filename}}{{style}}_{{mood}}{{/filename}}`

assert.deepEqual(parseCegTemplate(source), {
  variables: [{ id: "var-0", name: "style", value: "cinematic" }],
  axes: [
    {
      id: "a-0",
      name: "mood",
      include: "base.ceg",
      entries: [
        {
          id: "e-0-0",
          key: "happy",
          fileKey: "joy",
          value: "smile",
          properties: [],
          isComplex: false,
        },
        {
          id: "e-0-1",
          key: "detail",
          fileKey: "",
          value: "",
          properties: [
            { id: "p-0-1-0", name: "prompt", value: "sharp" },
            { id: "p-0-1-1", name: "weight", value: "1.2" },
          ],
          isComplex: true,
        },
      ],
    },
  ],
  combines: [{ id: "c-0", expression: "mood + style" }],
  excludes: [{ id: "ex-0", statement: 'mood == "sad"' }],
  overrides: [
    {
      id: "ov-0",
      statement: 'mood == "happy"',
      body: "bright light",
    },
  ],
  templateBody: "\nportrait, {{mood}}\n",
  filenameBody: "{{style}}_{{mood}}",
  cleanFilename: false,
})

assert.deepEqual(parseCegTemplate(""), {
  variables: [],
  axes: [],
  combines: [],
  excludes: [],
  overrides: [],
  templateBody: "",
  filenameBody: "",
  cleanFilename: true,
})

console.log("CEG template parser checks passed")
