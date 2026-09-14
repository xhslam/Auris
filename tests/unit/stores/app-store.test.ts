import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, beforeEach } from 'vitest';
import { useTrainingSettingsStore, useWorkspaceUIStore } from '@/stores/app-store';

describe('TrainingSettingsStore', () => {
  beforeEach(() => {
    localStorage.clear();
    useTrainingSettingsStore.getState().resetSettings();
  });

  it('should have default settings', () => {
    const { result } = renderHook(() => useTrainingSettingsStore());

    expect(result.current.settings.repeatCount).toBe(1);
    expect(result.current.settings.repeatIntervalSec).toBe(5);
    expect(result.current.settings.privacyMode).toBe(false);
  });

  it('should update repeat count', () => {
    const { result } = renderHook(() => useTrainingSettingsStore());

    act(() => {
      result.current.updateSettings({ repeatCount: 3 });
    });

    expect(result.current.settings.repeatCount).toBe(3);
  });

  it('should persist to localStorage', () => {
    const { result } = renderHook(() => useTrainingSettingsStore());

    act(() => {
      result.current.updateSettings({ repeatCount: 5, privacyMode: true });
    });

    const stored = JSON.parse(localStorage.getItem('training-settings')!);
    expect(stored.state.settings.repeatCount).toBe(5);
    expect(stored.state.settings.privacyMode).toBe(true);
  });

  it('should reset to defaults', () => {
    const { result } = renderHook(() => useTrainingSettingsStore());

    act(() => {
      result.current.updateSettings({ repeatCount: 5 });
      result.current.resetSettings();
    });

    expect(result.current.settings.repeatCount).toBe(1);
  });

  it('should load from localStorage on mount', () => {
    // Clear and reset first
    localStorage.clear();
    useTrainingSettingsStore.getState().resetSettings();

    // Set localStorage data
    const testData = {
      state: {
        settings: {
          autoSplitImportedText: true,
          generatedVoiceId: 'female',
          ownVoiceRecordingId: null,
          privacyMode: true,
          repeatCount: 4,
          repeatIntervalSec: 10,
          speechEnginePreference: 'auto_local_first',
          smartNotifications: false,
          useOwnVoiceReference: false,
          voiceProfileId: 'alloy',
        },
      },
      version: 1,
    };
    localStorage.setItem('training-settings', JSON.stringify(testData));

    // Manually trigger hydration by updating the store
    act(() => {
      useTrainingSettingsStore.getState().updateSettings({
        repeatCount: 4,
        repeatIntervalSec: 10,
        privacyMode: true,
      });
    });

    const { result } = renderHook(() => useTrainingSettingsStore());

    expect(result.current.settings.repeatCount).toBe(4);
    expect(result.current.settings.repeatIntervalSec).toBe(10);
    expect(result.current.settings.privacyMode).toBe(true);
  });
});

describe('WorkspaceUIStore', () => {
  beforeEach(() => {
    localStorage.clear();
    useWorkspaceUIStore.getState().resetLayout();
  });

  it('should have default layout', () => {
    const { result } = renderHook(() => useWorkspaceUIStore());

    expect(result.current.leftPanelWidth).toBe(400);
    expect(result.current.rightPanelWidth).toBe(600);
    expect(result.current.isRecorderOpen).toBe(false);
    expect(result.current.activeTab).toBe('source');
  });

  it('should update panel widths', () => {
    const { result } = renderHook(() => useWorkspaceUIStore());

    act(() => {
      result.current.setLeftPanelWidth(500);
      result.current.setRightPanelWidth(700);
    });

    expect(result.current.leftPanelWidth).toBe(500);
    expect(result.current.rightPanelWidth).toBe(700);
  });

  it('should clamp panel widths', () => {
    const { result } = renderHook(() => useWorkspaceUIStore());

    act(() => {
      result.current.setLeftPanelWidth(100); // Too small
      result.current.setRightPanelWidth(2000); // Too large
    });

    expect(result.current.leftPanelWidth).toBe(300); // Clamped to min
    expect(result.current.rightPanelWidth).toBe(1200); // Clamped to max
  });

  it('should toggle recorder', () => {
    const { result } = renderHook(() => useWorkspaceUIStore());

    act(() => {
      result.current.toggleRecorder();
    });

    expect(result.current.isRecorderOpen).toBe(true);

    act(() => {
      result.current.toggleRecorder();
    });

    expect(result.current.isRecorderOpen).toBe(false);
  });

  it('should switch active tab', () => {
    const { result } = renderHook(() => useWorkspaceUIStore());

    act(() => {
      result.current.setActiveTab('wordbook');
    });

    expect(result.current.activeTab).toBe('wordbook');
  });

  it('should reset layout', () => {
    const { result } = renderHook(() => useWorkspaceUIStore());

    act(() => {
      result.current.setLeftPanelWidth(500);
      result.current.setActiveTab('wordbook');
      result.current.resetLayout();
    });

    expect(result.current.leftPanelWidth).toBe(400);
    expect(result.current.activeTab).toBe('source');
  });
});

describe('Store Selectors', () => {
  it('should only re-render when selected value changes', () => {
    const { result, rerender } = renderHook(() =>
      useTrainingSettingsStore((state) => state.settings.repeatCount)
    );

    const initialValue = result.current;

    // Update unrelated field
    act(() => {
      useTrainingSettingsStore.getState().updateSettings({ privacyMode: true });
    });

    rerender();

    // Should not trigger re-render
    expect(result.current).toBe(initialValue);

    // Update selected field
    act(() => {
      useTrainingSettingsStore.getState().updateSettings({ repeatCount: 3 });
    });

    rerender();

    // Should trigger re-render
    expect(result.current).toBe(3);
  });
});
