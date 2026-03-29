import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Analytics } from './analytics';
import { invoke } from '@tauri-apps/api/core';

describe('Analytics', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Analytics.reset();
  });

  describe('init', () => {
    it('calls invoke with init_analytics', async () => {
      vi.mocked(invoke).mockResolvedValueOnce(undefined);
      await Analytics.init();
      expect(invoke).toHaveBeenCalledWith('init_analytics');
    });

    it('sets initialized flag on success', async () => {
      vi.mocked(invoke).mockResolvedValueOnce(undefined);
      await Analytics.init();

      // After init, track should call invoke (meaning initialized=true)
      vi.mocked(invoke).mockResolvedValueOnce(undefined);
      await Analytics.track('test_event');
      expect(invoke).toHaveBeenCalledWith('track_event', expect.any(Object));
    });

    it('throws on failure', async () => {
      vi.mocked(invoke).mockRejectedValueOnce(new Error('init failed'));
      await expect(Analytics.init()).rejects.toThrow('init failed');
    });

    it('prevents duplicate initialization', async () => {
      vi.mocked(invoke).mockResolvedValue(undefined);
      await Analytics.init();
      await Analytics.init(); // second call should be no-op

      // init_analytics should only be called once
      const initCalls = vi.mocked(invoke).mock.calls.filter(
        (c) => c[0] === 'init_analytics'
      );
      expect(initCalls).toHaveLength(1);
    });
  });

  describe('track', () => {
    it('does nothing when not initialized', async () => {
      await Analytics.track('test_event');
      expect(invoke).not.toHaveBeenCalledWith('track_event', expect.any(Object));
    });

    it('calls invoke with event name and properties when initialized', async () => {
      vi.mocked(invoke).mockResolvedValue(undefined);
      await Analytics.init();

      await Analytics.track('button_click', { button: 'start' });
      expect(invoke).toHaveBeenCalledWith('track_event', {
        eventName: 'button_click',
        properties: { button: 'start' },
      });
    });

    it('handles invoke failure gracefully', async () => {
      vi.mocked(invoke).mockResolvedValueOnce(undefined); // init
      await Analytics.init();

      vi.mocked(invoke).mockRejectedValueOnce(new Error('network error'));
      // Should not throw
      await expect(Analytics.track('event')).resolves.toBeUndefined();
    });
  });

  describe('identify', () => {
    it('does nothing when not initialized', async () => {
      await Analytics.identify('user123');
      expect(invoke).not.toHaveBeenCalledWith('identify_user', expect.any(Object));
    });

    it('calls invoke and stores currentUserId', async () => {
      vi.mocked(invoke).mockResolvedValue(undefined);
      await Analytics.init();

      await Analytics.identify('user123', { plan: 'pro' });
      expect(invoke).toHaveBeenCalledWith('identify_user', {
        userId: 'user123',
        properties: { plan: 'pro' },
      });
      expect(Analytics.getCurrentUserId()).toBe('user123');
    });
  });

  describe('disable', () => {
    it('calls invoke and resets state', async () => {
      vi.mocked(invoke).mockResolvedValue(undefined);
      await Analytics.init();
      await Analytics.identify('user1');

      await Analytics.disable();

      expect(invoke).toHaveBeenCalledWith('disable_analytics');
      expect(Analytics.getCurrentUserId()).toBeNull();
    });
  });

  describe('isEnabled', () => {
    it('returns value from invoke', async () => {
      vi.mocked(invoke).mockResolvedValueOnce(true);
      const result = await Analytics.isEnabled();
      expect(result).toBe(true);
    });

    it('returns false on error', async () => {
      vi.mocked(invoke).mockRejectedValueOnce(new Error('fail'));
      const result = await Analytics.isEnabled();
      expect(result).toBe(false);
    });
  });

  describe('session management', () => {
    it('startSession returns null when not initialized', async () => {
      const result = await Analytics.startSession('user1');
      expect(result).toBeNull();
    });

    it('startSession calls invoke when initialized', async () => {
      vi.mocked(invoke).mockResolvedValue('session-123');
      await Analytics.init();

      const result = await Analytics.startSession('user1');
      expect(invoke).toHaveBeenCalledWith('start_analytics_session', { userId: 'user1' });
      expect(result).toBe('session-123');
    });

    it('endSession does nothing when not initialized', async () => {
      await Analytics.endSession();
      expect(invoke).not.toHaveBeenCalledWith('end_analytics_session');
    });

    it('isSessionActive returns false when not initialized', async () => {
      const result = await Analytics.isSessionActive();
      expect(result).toBe(false);
    });
  });

  describe('tracking methods (not initialized)', () => {
    it('trackDailyActiveUser does nothing', async () => {
      await Analytics.trackDailyActiveUser();
      expect(invoke).not.toHaveBeenCalledWith('track_daily_active_user');
    });

    it('trackUserFirstLaunch does nothing', async () => {
      await Analytics.trackUserFirstLaunch();
      expect(invoke).not.toHaveBeenCalledWith('track_user_first_launch');
    });

    it('trackMeetingStarted does nothing', async () => {
      await Analytics.trackMeetingStarted('m1', 'Meeting 1');
      expect(invoke).not.toHaveBeenCalledWith('track_meeting_started', expect.any(Object));
    });

    it('trackRecordingStarted does nothing', async () => {
      await Analytics.trackRecordingStarted('m1');
      expect(invoke).not.toHaveBeenCalledWith('track_recording_started', expect.any(Object));
    });
  });

  describe('convenience methods', () => {
    beforeEach(async () => {
      vi.mocked(invoke).mockResolvedValue(undefined);
      await Analytics.init();
    });

    it('trackPageView tracks with page name', async () => {
      await Analytics.trackPageView('dashboard');
      expect(invoke).toHaveBeenCalledWith('track_event', {
        eventName: 'page_view_dashboard',
        properties: { page: 'dashboard' },
      });
    });

    it('trackButtonClick tracks with button name', async () => {
      await Analytics.trackButtonClick('save', 'toolbar');
      expect(invoke).toHaveBeenCalledWith('track_event', {
        eventName: 'button_click_save',
        properties: { button: 'save', location: 'toolbar' },
      });
    });

    it('trackError tracks with error info', async () => {
      await Analytics.trackError('network', 'timeout');
      expect(invoke).toHaveBeenCalledWith('track_event', {
        eventName: 'error',
        properties: { error_type: 'network', error_message: 'timeout' },
      });
    });

    it('trackAppStarted tracks with timestamp', async () => {
      await Analytics.trackAppStarted();
      expect(invoke).toHaveBeenCalledWith('track_event', {
        eventName: 'app_started',
        properties: expect.objectContaining({ timestamp: expect.any(String) }),
      });
    });
  });

  describe('reset', () => {
    it('resets all internal state', async () => {
      vi.mocked(invoke).mockResolvedValue(undefined);
      await Analytics.init();
      await Analytics.identify('user1');

      Analytics.reset();

      expect(Analytics.getCurrentUserId()).toBeNull();
      // After reset, track should do nothing (not initialized)
      await Analytics.track('event');
      const trackCalls = vi.mocked(invoke).mock.calls.filter(
        (c) => c[0] === 'track_event'
      );
      expect(trackCalls).toHaveLength(0);
    });
  });

  describe('getPlatform', () => {
    it('detects platform from user agent', async () => {
      const result = await Analytics.getPlatform();
      // jsdom user agent contains 'linux' by default
      expect(typeof result).toBe('string');
    });
  });

  describe('getDeviceInfo', () => {
    it('returns device info object', async () => {
      const info = await Analytics.getDeviceInfo();
      expect(info).toHaveProperty('platform');
      expect(info).toHaveProperty('os_version');
      expect(info).toHaveProperty('architecture');
    });

    it('caches device info on subsequent calls', async () => {
      const info1 = await Analytics.getDeviceInfo();
      const info2 = await Analytics.getDeviceInfo();
      expect(info1).toBe(info2);
    });
  });
});
