---
nia: v1
description: Improve clarity and flow
scope: selection
category: editing
model: gpt-4o
action: replace
context: 1
approval: ask
input:
  type: text
  accept: md
  description: Source selection
output:
  type: text
  description: Improved selection
tags:
  - editing
  - clarity
---

You are an expert editor. Improve the clarity, flow, and conciseness
of the following text while preserving the author's voice and intent.

Return only the improved text — no explanations.

{{content}}
