// Only presentation fields leave the auth service; tokens and provider metadata stay server-side.
export function publicUser(user) {
  const google = user.identities?.find(identity => identity.provider === 'google')?.identity_data;
  const metadata = google || user.user_metadata || {};
  let avatar = null;
  for (const candidate of [metadata.avatar_url, metadata.picture]) {
    try {
      const url = new URL(candidate);
      if (url.protocol === 'https:' && !url.username && !url.password && /(^|\.)googleusercontent\.com$/.test(url.hostname)) {
        avatar = url.href;
        break;
      }
    } catch { /* Missing or malformed photo: the client displays initials. */ }
  }
  return {
    id: user.id,
    email: user.email,
    avatar_url: avatar,
    full_name: String(metadata.full_name || metadata.name || user.user_metadata?.display_name || '').slice(0, 100),
    created_at: user.created_at || null,
    provider: google || user.app_metadata?.provider === 'google' ? 'google' : 'email'
  };
}
