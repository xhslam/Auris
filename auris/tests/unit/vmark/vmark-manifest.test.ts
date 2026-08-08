import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { z } from "zod";

const PROJECT_ROOT = process.cwd();
const PINNED_REPOSITORY = "https://github.com/xiaolai/vmark";
const PINNED_COMMIT = "7c409688dc510d87183bdc46308e1ee645c2579f";
const COMPARED_COMMIT = "e1eea49065282031a725d0c9387a0ce281cf5578";
const UPSTREAM_LICENSE_SHA256 =
  "87b3f4064cb76d1c7cc8c39546d7d62790b76372f37cfb9de1bb828a5f652b51";
const REQUIRED_MAPPING_FAMILIES = [
  "source-license-attribution",
  "upstream-comparison-tooling",
  "browser-pure-core",
  "browser-registry-window-view",
  "browser-chrome-ui",
  "browser-mcp",
  "browser-authority-grants-lease",
  "browser-sessions-security-recovery",
  "nia-legacy-genie",
  "nia-yaml-workflows",
  "browser-markdown-workflows",
  "multi-window-status",
];
const PROJECT_PATH_PATTERN =
  "^(?!/)(?!.*\\\\)(?!.*(?:^|/)\\.{1,2}(?:/|$))(?!.*//)(?!.*\\/$).+$";
const PHASE_DEFERRAL_PATTERN = /Phase [1-6]/;

const projectPathSchema = z
  .string()
  .min(1)
  .regex(new RegExp(PROJECT_PATH_PATTERN), "must be a relative project path");

const uniqueArray = <T extends z.ZodType<string>>(itemSchema: T) =>
  z
    .array(itemSchema)
    .min(1)
    .superRefine((items, context) => {
      if (new Set(items).size !== items.length) {
        context.addIssue({
          code: "custom",
          message: "must contain unique items",
        });
      }
    });

const mappingSchema = z.strictObject({
  mappingId: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  upstreamPaths: uniqueArray(projectPathSchema),
  aurisPaths: uniqueArray(projectPathSchema),
  disposition: z.enum(["copied", "adapted", "rewritten", "not-applicable"]),
  intentionalDifferences: uniqueArray(z.string().min(1)),
  lastComparedCommit: z.literal(COMPARED_COMMIT),
  tests: uniqueArray(projectPathSchema),
});

const portManifestSchema = z.strictObject({
  $schema: z.literal("./manifest.schema.json"),
  schemaVersion: z.literal(1),
  upstream: z.strictObject({
    repository: z.literal(PINNED_REPOSITORY),
    commit: z.literal(PINNED_COMMIT),
    license: z.literal("ISC"),
  }),
  entries: z
    .array(mappingSchema)
    .min(1)
    .superRefine((entries, context) => {
      const seenMappingIds = new Set<string>();
      entries.forEach((entry, index) => {
        if (seenMappingIds.has(entry.mappingId)) {
          context.addIssue({
            code: "custom",
            message: "mappingId must be unique",
            path: [index, "mappingId"],
          });
        }
        seenMappingIds.add(entry.mappingId);
      });
    }),
});

type PortManifest = z.infer<typeof portManifestSchema>;
type MutableEntry = {
  mappingId: string;
  upstreamPaths: string[];
  aurisPaths: string[];
  disposition: string;
  intentionalDifferences: string[];
  lastComparedCommit: string;
  tests: string[];
} & Record<string, unknown>;
type MutableManifest = {
  $schema: string;
  schemaVersion: number;
  upstream: {
    repository: string;
    commit: string;
    license: string;
  } & Record<string, unknown>;
  entries: MutableEntry[];
} & Record<string, unknown>;

const readText = (relativePath: string) =>
  readFileSync(path.join(PROJECT_ROOT, relativePath), "utf8");

const readJson = (relativePath: string): unknown =>
  JSON.parse(readText(relativePath)) as unknown;

const manifestJson = readJson("docs/vmark-port/manifest.json");
const jsonSchema = readJson("docs/vmark-port/manifest.schema.json");
const manifest = portManifestSchema.parse(manifestJson);

const EXPECTED_JSON_SCHEMA = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "https://auris.local/schemas/vmark-port-manifest-v1.json",
  title: "Auris VMark Port Manifest",
  description:
    "Many-to-many provenance mappings from a pinned VMark revision to Auris.",
  type: "object",
  additionalProperties: false,
  required: ["$schema", "schemaVersion", "upstream", "entries"],
  properties: {
    $schema: {
      const: "./manifest.schema.json",
    },
    schemaVersion: {
      const: 1,
    },
    upstream: {
      type: "object",
      additionalProperties: false,
      required: ["repository", "commit", "license"],
      properties: {
        repository: {
          type: "string",
          format: "uri",
          minLength: 1,
        },
        commit: {
          type: "string",
          pattern: "^[0-9a-f]{40}$",
        },
        license: {
          const: "ISC",
        },
      },
    },
    entries: {
      type: "array",
      minItems: 1,
      uniqueItems: true,
      items: {
        $ref: "#/$defs/mapping",
      },
    },
  },
  $defs: {
    projectPath: {
      type: "string",
      minLength: 1,
      pattern:
        "^(?!/)(?!.*\\\\)(?!.*(?:^|/)\\.{1,2}(?:/|$))(?!.*//)(?!.*\\/$).+$",
    },
    pathArray: {
      type: "array",
      minItems: 1,
      uniqueItems: true,
      items: {
        $ref: "#/$defs/projectPath",
      },
    },
    nonEmptyStringArray: {
      type: "array",
      minItems: 1,
      uniqueItems: true,
      items: {
        type: "string",
        minLength: 1,
      },
    },
    mapping: {
      type: "object",
      additionalProperties: false,
      required: [
        "mappingId",
        "upstreamPaths",
        "aurisPaths",
        "disposition",
        "intentionalDifferences",
        "lastComparedCommit",
        "tests",
      ],
      properties: {
        mappingId: {
          type: "string",
          pattern: "^[a-z0-9]+(?:-[a-z0-9]+)*$",
        },
        upstreamPaths: {
          $ref: "#/$defs/pathArray",
        },
        aurisPaths: {
          $ref: "#/$defs/pathArray",
        },
        disposition: {
          enum: ["copied", "adapted", "rewritten", "not-applicable"],
        },
        intentionalDifferences: {
          $ref: "#/$defs/nonEmptyStringArray",
        },
        lastComparedCommit: {
          type: "string",
          pattern: "^[0-9a-f]{40}$",
        },
        tests: {
          $ref: "#/$defs/pathArray",
        },
      },
    },
  },
};

const collectMissingTargetDeferrals = (candidate: PortManifest) =>
  candidate.entries.flatMap((entry) => {
    const missingTargets = entry.aurisPaths.filter(
      (target) => !existsSync(path.join(PROJECT_ROOT, target)),
    );
    const hasPhaseDeferral = entry.intentionalDifferences.some((difference) =>
      PHASE_DEFERRAL_PATTERN.test(difference),
    );

    return hasPhaseDeferral
      ? []
      : missingTargets.map((target) => `${entry.mappingId}: ${target}`);
  });

type InvalidMutation = {
  name: string;
  mutate: (candidate: MutableManifest) => void;
  expectedPath: Array<string | number>;
  expectedCode: string;
};

const INVALID_MUTATIONS: InvalidMutation[] = [
  {
    name: "a missing top-level key",
    mutate: (candidate) => {
      Reflect.deleteProperty(candidate, "schemaVersion");
    },
    expectedPath: ["schemaVersion"],
    expectedCode: "invalid_value",
  },
  {
    name: "an extra top-level key",
    mutate: (candidate) => {
      candidate.unexpected = true;
    },
    expectedPath: [],
    expectedCode: "unrecognized_keys",
  },
  {
    name: "a missing manifest $schema",
    mutate: (candidate) => {
      Reflect.deleteProperty(candidate, "$schema");
    },
    expectedPath: ["$schema"],
    expectedCode: "invalid_value",
  },
  {
    name: "a removed mapping required field",
    mutate: (candidate) => {
      Reflect.deleteProperty(candidate.entries[0], "tests");
    },
    expectedPath: ["entries", 0, "tests"],
    expectedCode: "invalid_type",
  },
  {
    name: "an extra mapping key",
    mutate: (candidate) => {
      candidate.entries[0].unexpected = true;
    },
    expectedPath: ["entries", 0],
    expectedCode: "unrecognized_keys",
  },
  {
    name: "an invalid mapping id",
    mutate: (candidate) => {
      candidate.entries[0].mappingId = "Invalid Mapping";
    },
    expectedPath: ["entries", 0, "mappingId"],
    expectedCode: "invalid_format",
  },
  {
    name: "a duplicate mapping id",
    mutate: (candidate) => {
      candidate.entries[1].mappingId = candidate.entries[0].mappingId;
    },
    expectedPath: ["entries", 1, "mappingId"],
    expectedCode: "custom",
  },
  {
    name: "duplicate tests",
    mutate: (candidate) => {
      candidate.entries[0].tests.push(candidate.entries[0].tests[0]);
    },
    expectedPath: ["entries", 0, "tests"],
    expectedCode: "custom",
  },
  {
    name: "duplicate upstream paths",
    mutate: (candidate) => {
      candidate.entries[0].upstreamPaths.push(
        candidate.entries[0].upstreamPaths[0],
      );
    },
    expectedPath: ["entries", 0, "upstreamPaths"],
    expectedCode: "custom",
  },
  {
    name: "duplicate Auris paths",
    mutate: (candidate) => {
      candidate.entries[0].aurisPaths.push(candidate.entries[0].aurisPaths[0]);
    },
    expectedPath: ["entries", 0, "aurisPaths"],
    expectedCode: "custom",
  },
  {
    name: "an unknown disposition",
    mutate: (candidate) => {
      candidate.entries[0].disposition = "forked";
    },
    expectedPath: ["entries", 0, "disposition"],
    expectedCode: "invalid_value",
  },
  {
    name: "a malformed upstream path",
    mutate: (candidate) => {
      candidate.entries[0].upstreamPaths[0] = "../LICENSE";
    },
    expectedPath: ["entries", 0, "upstreamPaths", 0],
    expectedCode: "invalid_format",
  },
  {
    name: "a malformed Auris path",
    mutate: (candidate) => {
      candidate.entries[0].aurisPaths[0] = "/tmp/UPSTREAM-LICENSE.txt";
    },
    expectedPath: ["entries", 0, "aurisPaths", 0],
    expectedCode: "invalid_format",
  },
  {
    name: "a malformed test path",
    mutate: (candidate) => {
      candidate.entries[0].tests[0] = "tests\\outside.test.ts";
    },
    expectedPath: ["entries", 0, "tests", 0],
    expectedCode: "invalid_format",
  },
  {
    name: "a stale entry comparison commit",
    mutate: (candidate) => {
      candidate.entries[0].lastComparedCommit = "a".repeat(40);
    },
    expectedPath: ["entries", 0, "lastComparedCommit"],
    expectedCode: "invalid_value",
  },
  {
    name: "an invalid upstream commit",
    mutate: (candidate) => {
      candidate.upstream.commit = "not-a-commit";
    },
    expectedPath: ["upstream", "commit"],
    expectedCode: "invalid_value",
  },
];

describe("VMark port manifest", () => {
  it("strictly validates the complete runtime manifest contract", () => {
    expect(portManifestSchema.safeParse(manifestJson).success).toBe(true);
  });

  it.each(INVALID_MUTATIONS)(
    "rejects $name at the intended contract boundary",
    ({ mutate, expectedPath, expectedCode }) => {
      const candidate = structuredClone(manifest) as MutableManifest;
      mutate(candidate);

      const result = portManifestSchema.safeParse(candidate);

      expect(result.success).toBe(false);
      if (result.success) {
        return;
      }
      expect(result.error.issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            code: expectedCode,
            path: expectedPath,
          }),
        ]),
      );
    },
  );

  it("freezes the complete JSON Schema v1 contract", () => {
    expect(jsonSchema).toEqual(EXPECTED_JSON_SCHEMA);
  });

  it("contains every approved family with unique mapping members", () => {
    const mappingIds = manifest.entries.map((entry) => entry.mappingId);
    const mappingMembers = new Set<string>();

    expect(new Set(mappingIds).size).toBe(mappingIds.length);
    expect(mappingIds).toEqual(expect.arrayContaining(REQUIRED_MAPPING_FAMILIES));

    for (const entry of manifest.entries) {
      for (const memberPath of [...entry.upstreamPaths, ...entry.aurisPaths]) {
        const memberKey = `${entry.mappingId}\0${memberPath}`;
        expect(mappingMembers.has(memberKey)).toBe(false);
        mappingMembers.add(memberKey);
      }
    }
  });

  it("covers every reviewed browser, Nia, workflow, window, and status source family", () => {
    const mappedUpstreamPaths = manifest.entries.flatMap(
      (entry) => entry.upstreamPaths,
    );

    expect(mappedUpstreamPaths).toEqual(
      expect.arrayContaining([
        "src-tauri/src/browser/registry.rs",
        "src-tauri/src/genies",
        "src-tauri/src/workflow",
        "src/lib/browser/workflow/runner.ts",
        "src-tauri/src/mcp_bridge/window_routing.rs",
        "src/components/WindowStatusPanel",
        "src/services/persistence/windowStatusStorage.ts",
        "src/stores/windowStatusStore.ts",
      ]),
    );
    expect(
      manifest.entries.every(
        (entry) => entry.lastComparedCommit === COMPARED_COMMIT,
      ),
    ).toBe(true);
  });

  it("requires phase deferrals only for Auris targets that do not exist yet", () => {
    expect(
      manifest.entries.flatMap((entry) =>
        entry.aurisPaths
          .filter((target) => !existsSync(path.join(PROJECT_ROOT, target)))
          .map((target) => `${entry.mappingId}: ${target}`),
      ),
    ).toEqual([]);
    expect(collectMissingTargetDeferrals(manifest)).toEqual([]);

    const completedMapping = structuredClone(manifest);
    completedMapping.entries[0].intentionalDifferences = [
      "The README adds permanent provenance context.",
    ];
    expect(collectMissingTargetDeferrals(completedMapping)).toEqual([]);

    const newlyDeferredMapping = structuredClone(manifest);
    newlyDeferredMapping.entries[0].aurisPaths = [
      "src/features/browser/new-unimplemented-target.ts",
    ];
    newlyDeferredMapping.entries[0].intentionalDifferences = [
      "A permanent platform distinction.",
    ];
    expect(collectMissingTargetDeferrals(newlyDeferredMapping)).toEqual([
      "source-license-attribution: src/features/browser/new-unimplemented-target.ts",
    ]);
  });

  it("freezes the upstream notice and verifies README attribution", () => {
    const upstreamLicense = readText("docs/vmark-port/UPSTREAM-LICENSE.txt");
    const readme = readText("docs/vmark-port/README.md");

    expect(createHash("sha256").update(upstreamLicense).digest("hex")).toBe(
      UPSTREAM_LICENSE_SHA256,
    );
    expect(readme).toContain(PINNED_REPOSITORY);
    expect(readme).toContain(PINNED_COMMIT);
    expect(readme).toContain("UPSTREAM-LICENSE.txt");
    expect(readme).toMatch(/ISC[- ]licensed/i);
    expect(readme).toMatch(
      /not affiliated\s+with, sponsored by, or endorsed by/i,
    );
  });
});
