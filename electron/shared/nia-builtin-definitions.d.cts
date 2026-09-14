declare namespace niaBuiltinDefinitions {
  interface BuiltInNiaDefinitionSource {
    readonly name: string;
    readonly source: string;
  }

  const BUILT_IN_NIA_DEFINITIONS: readonly BuiltInNiaDefinitionSource[];
}

declare const niaBuiltinDefinitions: {
  BUILT_IN_NIA_DEFINITIONS: readonly niaBuiltinDefinitions.BuiltInNiaDefinitionSource[];
};

export = niaBuiltinDefinitions;
