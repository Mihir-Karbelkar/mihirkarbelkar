export const analytics = {
  posthogKey:
    import.meta.env?.PUBLIC_POSTHOG_KEY ||
    'phc_zbbgKfTRKQWNThWG28cSuZJp2EozUYPkTPZsxbVLq9KT',
  posthogHost:
    import.meta.env?.PUBLIC_POSTHOG_HOST || 'https://us.i.posthog.com',
} as const;
