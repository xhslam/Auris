declare namespace niaPromptComposition {
  const CONTENT_SEPARATOR: string;

  function composeNiaPrompt(options: {
    body: string;
    content: string;
    context?: string;
  }): string;

  function formatNiaPromptContext(options?: {
    before?: string;
    after?: string;
  }): string;
}

export = niaPromptComposition;
