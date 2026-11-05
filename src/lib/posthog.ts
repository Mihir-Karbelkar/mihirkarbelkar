import { analytics } from '../config/analytics';

if (typeof window !== 'undefined' && analytics.posthogKey) {
  const loadPostHog = async () => {
    const { default: posthog } = await import('posthog-js');
    posthog.init(analytics.posthogKey, {
      api_host: analytics.posthogHost,
      ui_host: 'https://us.posthog.com',
      autocapture: true,
      capture_pageview: true,
      capture_pageleave: true,
      person_profiles: 'identified_only',
      disable_session_recording: true,
    });
  };

  if ('requestIdleCallback' in window) {
    window.requestIdleCallback(() => void loadPostHog());
  } else {
    setTimeout(() => void loadPostHog(), 1);
  }
}
