"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import {
  AlignLeft,
  ArrowsIn,
  ArrowsOut,
  BookOpenText,
  Check,
  Columns,
  FileText,
  Minus,
  Pause,
  Play,
  Plus,
  SlidersHorizontal,
  SpeakerHigh,
  SquaresFour,
  Stop,
  TextAlignJustify,
  Wheelchair,
  X,
} from "@phosphor-icons/react";
import {
  DEFAULT_READER_SETTINGS,
  applyReaderSpacingPreset,
  type ReaderColumns,
  type ReaderFontFamily,
  type ReaderFontWeight,
  type ReaderSettings,
  type ReaderSpacingPreset,
  type ReaderTextAlign,
  type ReaderTheme,
} from "@/features/reading/reader-settings";
import "@/components/reading/reader-settings-dialog.css";

type ReaderSettingsTab = "text" | "spacing" | "appearance" | "layout" | "tts";

type ReaderSettingsDialogProps = {
  isSpeaking: boolean;
  onChange: (settings: ReaderSettings) => void;
  onClose: () => void;
  onPauseSpeech: () => void;
  onSpeak: () => void;
  onStopSpeech: () => void;
  open: boolean;
  settings: ReaderSettings;
};

const TABS: Array<{ id: ReaderSettingsTab; label: string }> = [
  { id: "text", label: "文字" },
  { id: "spacing", label: "间距" },
  { id: "appearance", label: "外观" },
  { id: "layout", label: "布局" },
  { id: "tts", label: "朗读" },
];

const FONT_OPTIONS: Array<{ id: ReaderFontFamily; label: string; preview: string }> = [
  { id: "publisher", label: "出版方默认", preview: "原版" },
  { id: "old-style", label: "古典衬线", preview: "典雅" },
  { id: "modern", label: "现代衬线", preview: "现代" },
  { id: "sans-serif", label: "无衬线", preview: "清晰" },
  { id: "humanist", label: "人文无衬线", preview: "人文" },
  { id: "monospace", label: "等宽字体", preview: "等宽" },
];

const FONT_WEIGHTS: Array<{ id: ReaderFontWeight; label: string }> = [
  { id: "publisher", label: "出版方默认" },
  { id: "200", label: "200 · 纤细" },
  { id: "400", label: "400 · 常规" },
  { id: "500", label: "500 · 中等" },
  { id: "700", label: "700 · 粗体" },
];

const THEMES: Array<{ id: ReaderTheme; label: string }> = [
  { id: "light", label: "明亮" },
  { id: "dark", label: "深色" },
  { id: "sepia", label: "棕褐" },
  { id: "paper", label: "纸张" },
  { id: "contrast-1", label: "高对比黑白" },
  { id: "contrast-2", label: "高对比黄黑" },
  { id: "contrast-3", label: "高对比蓝白" },
];

const SPACING_PRESETS: Array<{
  icon: React.ReactNode;
  id: ReaderSpacingPreset;
  label: string;
}> = [
  { icon: <BookOpenText />, id: "publisher", label: "出版方默认" },
  { icon: <ArrowsIn />, id: "tight", label: "紧凑" },
  { icon: <TextAlignJustify />, id: "balanced", label: "均衡" },
  { icon: <ArrowsOut />, id: "loose", label: "宽松" },
  { icon: <Wheelchair />, id: "accessible", label: "无障碍" },
  { icon: <SlidersHorizontal />, id: "custom", label: "自定义" },
];

function SelectField<T extends string>({
  label,
  onChange,
  options,
  value,
}: {
  label: string;
  onChange: (value: T) => void;
  options: Array<{ id: T; label: string }>;
  value: T;
}) {
  return (
    <label className="reader-settings__field">
      <span>{label}</span>
      <select onChange={(event) => onChange(event.target.value as T)} value={value}>
        {options.map((option) => (
          <option key={option.id} value={option.id}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function ToggleRow({
  checked,
  description,
  label,
  onChange,
}: {
  checked: boolean;
  description?: string;
  label: string;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="reader-settings__toggle-row">
      <span>
        <strong>{label}</strong>
        {description ? <small>{description}</small> : null}
      </span>
      <input
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        type="checkbox"
      />
      <span aria-hidden="true" className="reader-settings__switch">
        <Check weight="bold" />
      </span>
    </label>
  );
}

function RangeField({
  label,
  max,
  min,
  onChange,
  step,
  suffix = "",
  value,
}: {
  label: string;
  max: number;
  min: number;
  onChange: (value: number) => void;
  step: number;
  suffix?: string;
  value: number;
}) {
  const decimals = step < 0.1 ? 2 : step < 1 ? 1 : 0;
  const decrease = () => onChange(Math.max(min, Number((value - step).toFixed(decimals))));
  const increase = () => onChange(Math.min(max, Number((value + step).toFixed(decimals))));

  return (
    <div className="reader-settings__range-field">
      <span>{label}</span>
      <div className="reader-settings__range-control">
        <button aria-label={`减小${label}`} onClick={decrease} type="button">
          <Minus />
        </button>
        <input
          aria-label={label}
          max={max}
          min={min}
          onChange={(event) => onChange(Number(event.target.value))}
          step={step}
          type="range"
          value={value}
        />
        <button aria-label={`增大${label}`} onClick={increase} type="button">
          <Plus />
        </button>
        <output>{value.toFixed(decimals)}{suffix}</output>
      </div>
    </div>
  );
}

export function ReaderSettingsDialog({
  isSpeaking,
  onChange,
  onClose,
  onPauseSpeech,
  onSpeak,
  onStopSpeech,
  open,
  settings,
}: ReaderSettingsDialogProps) {
  const titleId = useId();
  const dialogRef = useRef<HTMLElement | null>(null);
  const [tab, setTab] = useState<ReaderSettingsTab>("text");
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);

  const update = <K extends keyof ReaderSettings>(key: K, value: ReaderSettings[K]) => {
    onChange({ ...settings, [key]: value });
  };

  useEffect(() => {
    if (!open) {
      return;
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
        return;
      }
      if (event.key !== "Tab") {
        return;
      }
      const focusable = Array.from(
        dialogRef.current?.querySelectorAll<HTMLElement>(
          'button:not(:disabled), select:not(:disabled), input:not(:disabled), [tabindex]:not([tabindex="-1"])',
        ) ?? [],
      );
      const first = focusable[0];
      const last = focusable.at(-1);
      if (!first || !last) {
        return;
      }
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.requestAnimationFrame(() => {
      dialogRef.current?.querySelector<HTMLElement>("button")?.focus();
    });
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose, open]);

  useEffect(() => {
    if (!open || typeof window === "undefined" || !window.speechSynthesis) {
      return;
    }
    const readVoices = () => setVoices(window.speechSynthesis.getVoices());
    readVoices();
    window.speechSynthesis.addEventListener("voiceschanged", readVoices);
    return () => window.speechSynthesis.removeEventListener("voiceschanged", readVoices);
  }, [open]);

  const englishVoices = useMemo(() => {
    const preferred = voices.filter((voice) => voice.lang.toLowerCase().startsWith("en"));
    return preferred.length > 0 ? preferred : voices;
  }, [voices]);

  if (!open) {
    return null;
  }

  return (
    <div className="reader-settings__backdrop" onMouseDown={onClose}>
      <section
        aria-labelledby={titleId}
        aria-modal="true"
        className="reader-settings"
        onMouseDown={(event) => event.stopPropagation()}
        ref={dialogRef}
        role="dialog"
      >
        <header className="reader-settings__header">
          <div>
            <span className="reader-settings__eyebrow">Auris 阅读工作室</span>
            <h2 id={titleId}>阅读设置</h2>
          </div>
          <div className="reader-settings__header-actions">
            <button
              className="reader-settings__reset"
              onClick={() => onChange(DEFAULT_READER_SETTINGS)}
              type="button"
            >
              恢复默认设置
            </button>
            <button aria-label="关闭阅读设置" onClick={onClose} type="button">
              <X />
            </button>
          </div>
        </header>

        <nav aria-label="阅读设置分类" className="reader-settings__tabs">
          {TABS.map((item) => (
            <button
              aria-selected={tab === item.id}
              data-active={tab === item.id ? "true" : "false"}
              key={item.id}
              onClick={() => setTab(item.id)}
              role="tab"
              type="button"
            >
              {item.label}
            </button>
          ))}
        </nav>

        <div className="reader-settings__body">
          {tab === "text" ? (
            <div className="reader-settings__stack">
              <div className="reader-settings__font-grid" role="group" aria-label="字体家族">
                {FONT_OPTIONS.map((font) => (
                  <button
                    aria-pressed={settings.fontFamily === font.id}
                    data-active={settings.fontFamily === font.id ? "true" : "false"}
                    data-font={font.id}
                    key={font.id}
                    onClick={() => update("fontFamily", font.id)}
                    type="button"
                  >
                    <span>{font.preview}</span>
                    <small>{font.label}</small>
                    {settings.fontFamily === font.id ? <Check weight="bold" /> : null}
                  </button>
                ))}
              </div>
              <SelectField
                label="字重"
                onChange={(value) => update("fontWeight", value)}
                options={FONT_WEIGHTS}
                value={settings.fontWeight}
              />
              <div className="reader-settings__field">
                <span>文字对齐</span>
                <div className="reader-settings__segments reader-settings__segments--three">
                  {([
                    ["publisher", "出版方默认", <FileText key="p" />],
                    ["start", "左对齐", <AlignLeft key="s" />],
                    ["justify", "两端对齐", <TextAlignJustify key="j" />],
                  ] as Array<[ReaderTextAlign, string, React.ReactNode]>).map(
                    ([id, label, icon]) => (
                      <button
                        data-active={settings.textAlign === id ? "true" : "false"}
                        key={id}
                        onClick={() => update("textAlign", id)}
                        type="button"
                      >
                        {icon}{label}
                      </button>
                    ),
                  )}
                </div>
              </div>
              <ToggleRow
                checked={settings.hyphens}
                description="在较窄页面中允许英文单词自动断行。"
                label="自动断词"
                onChange={(value) => update("hyphens", value)}
              />
              <ToggleRow
                checked={settings.normalizeText}
                description="统一装饰性大小写和不一致的空白。"
                label="规范化文字"
                onChange={(value) => update("normalizeText", value)}
              />
            </div>
          ) : null}

          {tab === "spacing" ? (
            <div className="reader-settings__stack">
              <div className="reader-settings__field">
                <span>间距预设</span>
                <div className="reader-settings__preset-grid">
                  {SPACING_PRESETS.map((preset) => (
                    <button
                      data-active={settings.spacingPreset === preset.id ? "true" : "false"}
                      key={preset.id}
                      onClick={() => {
                        if (preset.id === "custom") {
                          update("spacingPreset", "custom");
                        } else {
                          onChange(applyReaderSpacingPreset(settings, preset.id));
                        }
                      }}
                      type="button"
                    >
                      {preset.icon}<span>{preset.label}</span>
                    </button>
                  ))}
                </div>
              </div>
              <RangeField label="行高" max={2.4} min={1.2} onChange={(value) => onChange({ ...settings, lineHeight: value, spacingPreset: "custom" })} step={0.05} value={settings.lineHeight} />
              <RangeField label="段落间距" max={3} min={0} onChange={(value) => onChange({ ...settings, paragraphSpacing: value, spacingPreset: "custom" })} step={0.1} value={settings.paragraphSpacing} />
              <RangeField label="段首缩进" max={4} min={0} onChange={(value) => onChange({ ...settings, paragraphIndent: value, spacingPreset: "custom" })} step={0.1} value={settings.paragraphIndent} />
              <RangeField label="词间距" max={0.5} min={-0.1} onChange={(value) => onChange({ ...settings, wordSpacing: value, spacingPreset: "custom" })} step={0.01} value={settings.wordSpacing} />
              <RangeField label="字间距" max={0.2} min={-0.05} onChange={(value) => onChange({ ...settings, letterSpacing: value, spacingPreset: "custom" })} step={0.01} value={settings.letterSpacing} />
            </div>
          ) : null}

          {tab === "appearance" ? (
            <div className="reader-settings__stack">
              <RangeField label="字号" max={1.8} min={0.8} onChange={(value) => update("fontScale", value)} step={0.05} suffix="×" value={settings.fontScale} />
              <div className="reader-settings__field">
                <span>主题</span>
                <div className="reader-settings__theme-grid">
                  {THEMES.map((theme) => (
                    <button
                      data-active={settings.theme === theme.id ? "true" : "false"}
                      data-theme-swatch={theme.id}
                      key={theme.id}
                      onClick={() => update("theme", theme.id)}
                      type="button"
                    >
                      <span aria-hidden="true">Aa</span>{theme.label}
                      {settings.theme === theme.id ? <Check weight="bold" /> : null}
                    </button>
                  ))}
                </div>
              </div>
              <ToggleRow
                checked={settings.publisherStyles}
                description="保留源文档中的强调和语义样式。"
                label="保留出版方样式"
                onChange={(value) => update("publisherStyles", value)}
              />
            </div>
          ) : null}

          {tab === "layout" ? (
            <div className="reader-settings__stack">
              <div className="reader-settings__field">
                <span>分栏方式</span>
                <div className="reader-settings__layout-grid">
                  {([
                    ["auto", "自动", <SquaresFour key="a" />],
                    ["single", "单栏", <FileText key="s" />],
                    ["dual", "双栏", <Columns key="d" />],
                  ] as Array<[ReaderColumns, string, React.ReactNode]>).map(([id, label, icon]) => (
                    <button data-active={settings.columns === id ? "true" : "false"} key={id} onClick={() => update("columns", id)} type="button">
                      {icon}<span>{label}</span>
                    </button>
                  ))}
                </div>
              </div>
              <RangeField
                label="页面宽度"
                max={100}
                min={50}
                onChange={(value) => update("pageWidth", value)}
                step={1}
                suffix="%"
                value={settings.pageWidth}
              />
              <RangeField
                label="行宽"
                max={100}
                min={38}
                onChange={(value) => update("lineWidth", value)}
                step={1}
                suffix=" 字符"
                value={settings.lineWidth}
              />
              <div className="reader-settings__field">
                <span>阅读方式</span>
                <div className="reader-settings__segments">
                  <button data-active={settings.flow === "scroll" ? "true" : "false"} onClick={() => update("flow", "scroll")} type="button">连续滚动</button>
                  <button data-active={settings.flow === "paginated" ? "true" : "false"} onClick={() => update("flow", "paginated")} type="button">分页阅读</button>
                </div>
              </div>
              <p className="reader-settings__hint">
                页面宽度控制整张阅读画布，行宽控制每栏文字的最大长度；两者独立调节，左右边距始终对称。分页阅读会让每个段落自动吸附成一页。
              </p>
            </div>
          ) : null}

          {tab === "tts" ? (
            <div className="reader-settings__stack">
              <div className="reader-settings__tts-hero">
                <span><SpeakerHigh /></span>
                <div><strong>朗读当前书籍</strong><p>使用这台 Mac 已安装的系统语音。</p></div>
                <div className="reader-settings__tts-actions">
                  <button aria-label={isSpeaking ? "暂停朗读" : "开始朗读"} onClick={isSpeaking ? onPauseSpeech : onSpeak} type="button">
                    {isSpeaking ? <Pause weight="fill" /> : <Play weight="fill" />}
                  </button>
                  <button aria-label="停止朗读" onClick={onStopSpeech} type="button"><Stop weight="fill" /></button>
                </div>
              </div>
              <label className="reader-settings__field">
                <span>朗读声音</span>
                <select onChange={(event) => update("ttsVoice", event.target.value)} value={settings.ttsVoice}>
                  <option value="">系统默认 · 英语</option>
                  {englishVoices.map((voice) => <option key={voice.voiceURI} value={voice.voiceURI}>{voice.name} · {voice.lang}</option>)}
                </select>
              </label>
              <RangeField label="朗读速度" max={2} min={0.5} onChange={(value) => update("ttsRate", value)} step={0.05} suffix="×" value={settings.ttsRate} />
              <RangeField label="声音音调" max={1.6} min={0.5} onChange={(value) => update("ttsPitch", value)} step={0.05} value={settings.ttsPitch} />
            </div>
          ) : null}
        </div>
      </section>
    </div>
  );
}
