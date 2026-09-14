---
site: example.com
inputs:
  query:
    type: text
    description: Search query
  apiToken:
    type: secret
    description: Opaque API credential slot
trigger: manual
---

1. action: navigate to https://example.com/search
2. action: type {query} into "Search"
3. extract: search results list
4. confirm: Submit the search results review?
5. action: click "Open top result"
6. goal: Summarize the open page for {query}
7. api: GET https://api.example.com/v1/search?q={query}
