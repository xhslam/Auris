import path from "node:path";
import { z } from "zod";

const pluginManifestSchema = z.object({
  description: z.string().trim().min(1).optional(),
  id: z.string().trim().min(1, "Plugin manifest must declare a non-empty id."),
  main: z.string().trim().min(1).optional(),
  name: z.string().trim().min(1, "Plugin manifest must declare a non-empty name."),
  version: z.string().trim().min(1, "Plugin manifest must declare a non-empty version."),
});

export type PluginManifest = z.infer<typeof pluginManifestSchema> & {
  directoryPath: string;
  entryFile: string;
  entryPath: string;
};

export function parsePluginManifest(
  manifest: unknown,
  directoryPath: string,
): PluginManifest {
  const parsed = pluginManifestSchema.parse(manifest);
  const entryFile = parsed.main ?? "main.js";

  return {
    ...parsed,
    directoryPath,
    entryFile,
    entryPath: path.join(directoryPath, entryFile),
  };
}

export function parsePluginManifestJson(
  manifestJson: string,
  directoryPath: string,
): PluginManifest {
  return parsePluginManifest(JSON.parse(manifestJson) as unknown, directoryPath);
}
