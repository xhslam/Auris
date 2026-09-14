import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";

const PROJECT_ROOT = process.cwd();

const DIRECTORIES_TO_SKIP = new Set([
  ".git",
  ".next",
  "android",
  "coverage",
  "ios",
  "node_modules",
  "playwright-report",
  "test-results",
  "tests",
]);

const SCANNABLE_EXTENSIONS = new Set([
  ".cjs",
  ".js",
  ".json",
  ".md",
  ".mjs",
  ".ts",
  ".tsx",
  ".yaml",
  ".yml",
]);

const DOCUMENTED_ENV_KEYS = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "OPENAI_API_KEY",
  "AZURE_SPEECH_KEY",
  "AZURE_SPEECH_REGION",
  "SHADOWING_VOXCPM_URL",
  "SHADOWING_VOXCPM_MODEL_VERSION",
  "CAPACITOR_SERVER_URL",
];

const ENV_FILES_THAT_MUST_BE_IGNORED = [
  ".env",
  ".env.local",
  ".env.development",
  ".env.development.local",
  ".env.production",
  ".env.production.local",
  ".env.test",
  ".env.test.local",
];

const SECRET_PATTERNS = [
  {
    label: "OpenAI key literal",
    pattern: /\bsk-(?:proj-|svcacct-|live-|test-)?[A-Za-z0-9_-]{20,}\b/g,
  },
  {
    label: "Literal OPENAI_API_KEY assignment",
    pattern: /OPENAI_API_KEY\s*[:=]\s*["'`][^"'`\r\n]+["'`]/g,
  },
  {
    label: "Literal AZURE_SPEECH_KEY assignment",
    pattern: /AZURE_SPEECH_KEY\s*[:=]\s*["'`][^"'`\r\n]+["'`]/g,
  },
  {
    label: "Literal SUPABASE_SERVICE_ROLE_KEY assignment",
    pattern: /SUPABASE_SERVICE_ROLE_KEY\s*[:=]\s*["'`][^"'`\r\n]+["'`]/g,
  },
  {
    label: "Literal NEXT_PUBLIC_SUPABASE_ANON_KEY assignment",
    pattern: /NEXT_PUBLIC_SUPABASE_ANON_KEY\s*[:=]\s*["'`][^"'`\r\n]+["'`]/g,
  },
  {
    label: "Literal Azure subscription header",
    pattern: /Ocp-Apim-Subscription-Key["']?\s*:\s*["'`][^"'`\r\n]+["'`]/g,
  },
  {
    label: "Supabase client initialized with literal credentials",
    pattern:
      /create(?:Browser|Server)?Client\(\s*["'`]https:\/\/[^"'`\r\n]+\.supabase\.co["'`]\s*,\s*["'`][^"'`\r\n]{20,}["'`]/g,
  },
];

function getLineNumber(content, index) {
  return content.slice(0, index).split(/\r?\n/u).length;
}

function readDocumentedEnvKeys() {
  const examplePath = path.join(PROJECT_ROOT, ".env.example");

  if (!existsSync(examplePath)) {
    throw new Error("Missing .env.example");
  }

  const content = readFileSync(examplePath, "utf8");
  return new Set(
    content
      .split(/\r?\n/u)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#"))
      .map((line) => line.split("=")[0]?.trim())
      .filter(Boolean),
  );
}

function readEnvExampleEntries() {
  const examplePath = path.join(PROJECT_ROOT, ".env.example");
  const content = readFileSync(examplePath, "utf8");
  const entries = new Map();

  for (const rawLine of content.split(/\r?\n/u)) {
    const line = rawLine.trim();

    if (!line || line.startsWith("#")) {
      continue;
    }

    const [key, ...valueParts] = line.split("=");

    if (!key) {
      continue;
    }

    entries.set(key.trim(), valueParts.join("=").trim());
  }

  return entries;
}

function verifyEnvExample() {
  const documentedKeys = readDocumentedEnvKeys();
  const missingKeys = DOCUMENTED_ENV_KEYS.filter((key) => !documentedKeys.has(key));

  if (missingKeys.length === 0) {
    return [];
  }

  return missingKeys.map((key) => `.env.example is missing ${key}`);
}

function verifyEnvExampleValuesAreBlank() {
  const entries = readEnvExampleEntries();

  return [...entries.entries()]
    .filter(([, value]) => value.length > 0)
    .map(([key]) => `.env.example should keep ${key} blank`);
}

function isGitIgnored(relativePath) {
  try {
    execFileSync("git", ["check-ignore", relativePath], {
      cwd: PROJECT_ROOT,
      stdio: "ignore",
    });
    return true;
  } catch {
    return false;
  }
}

function verifyIgnoredEnvFiles() {
  try {
    execFileSync("git", ["rev-parse", "--show-toplevel"], {
      cwd: PROJECT_ROOT,
      stdio: "ignore",
    });
  } catch {
    return [];
  }

  return ENV_FILES_THAT_MUST_BE_IGNORED
    .filter((relativePath) => !isGitIgnored(relativePath))
    .map((relativePath) => `${relativePath} is not ignored by git`);
}

function collectScannableFiles(directory) {
  const entries = readdirSync(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    if (entry.name.startsWith(".env")) {
      continue;
    }

    const absolutePath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      if (DIRECTORIES_TO_SKIP.has(entry.name)) {
        continue;
      }

      files.push(...collectScannableFiles(absolutePath));
      continue;
    }

    if (!SCANNABLE_EXTENSIONS.has(path.extname(entry.name))) {
      continue;
    }

    files.push(absolutePath);
  }

  return files;
}

function scanForSecretLiterals() {
  const findings = [];

  for (const absolutePath of collectScannableFiles(PROJECT_ROOT)) {
    const content = readFileSync(absolutePath, "utf8");
    const relativePath = path.relative(PROJECT_ROOT, absolutePath).replaceAll("\\", "/");

    for (const { label, pattern } of SECRET_PATTERNS) {
      const matches = content.matchAll(pattern);

      for (const match of matches) {
        const index = match.index ?? 0;
        findings.push(
          `${relativePath}:${getLineNumber(content, index)} ${label}: ${match[0]}`,
        );
      }
    }
  }

  return findings;
}

const findings = [
  ...verifyEnvExample(),
  ...verifyEnvExampleValuesAreBlank(),
  ...verifyIgnoredEnvFiles(),
  ...scanForSecretLiterals(),
];

if (findings.length > 0) {
  console.error("Secret safety check failed:");
  for (const finding of findings) {
    console.error(`- ${finding}`);
  }
  process.exit(1);
}

console.log("Secret safety check passed.");
