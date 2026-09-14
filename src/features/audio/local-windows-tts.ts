import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

type WindowsTtsInput = {
  text: string;
  voiceId: string;
};

type WindowsTtsResult = {
  audioBuffer: Buffer;
  contentType: string;
};

type WindowsTtsSynthesizer = (input: WindowsTtsInput) => Promise<Buffer | null>;

let synthesizerOverride: WindowsTtsSynthesizer | null = null;

function encodePowerShellArgument(value: string) {
  return Buffer.from(value, "utf8").toString("base64");
}

function getVoiceCandidates(voiceId: string) {
  if (voiceId === "male" || voiceId === "ash") {
    return [
      "Microsoft David Desktop",
      "Microsoft Mark Desktop",
      "Microsoft George Desktop",
    ];
  }

  return [
    "Microsoft Zira Desktop",
    "Microsoft Hazel Desktop",
    "Microsoft Aria Online (Natural)",
  ];
}

async function runWindowsTts(input: WindowsTtsInput) {
  const tempDirectory = await mkdtemp(join(tmpdir(), "shadowing-tts-"));
  const outputPath = join(tempDirectory, "speech.wav");
  const encodedText = encodePowerShellArgument(input.text);
  const voiceCandidates = getVoiceCandidates(input.voiceId)
    .map((voice) => `'${voice}'`)
    .join(", ");

  const script = [
    "Add-Type -AssemblyName System.Speech",
    "$text = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('" +
      encodedText +
      "'))",
    "$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer",
    `$voiceCandidates = @(${voiceCandidates})`,
    "foreach ($voice in $voiceCandidates) { try { $synth.SelectVoice($voice); break } catch { } }",
    `$synth.SetOutputToWaveFile('${outputPath.replace(/\\/g, "\\\\")}')`,
    "$synth.Speak($text)",
    "$synth.Dispose()",
  ].join("; ");

  try {
    await execFileAsync("powershell.exe", ["-NoProfile", "-Command", script], {
      windowsHide: true,
    });

    return await readFile(outputPath);
  } catch {
    return null;
  } finally {
    await rm(tempDirectory, { force: true, recursive: true });
  }
}

function getActiveSynthesizer() {
  return synthesizerOverride ?? runWindowsTts;
}

export function __setWindowsTtsSynthesizerForTests(
  synthesizer: WindowsTtsSynthesizer | null,
) {
  synthesizerOverride = synthesizer;
}

export async function synthesizeWithWindowsTts(
  input: WindowsTtsInput,
): Promise<WindowsTtsResult | null> {
  const audioBuffer = await getActiveSynthesizer()(input);

  if (!audioBuffer) {
    return null;
  }

  return {
    audioBuffer,
    contentType: "audio/wav",
  };
}
