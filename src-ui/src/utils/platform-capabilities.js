export function isIosPlatform(capabilities) {
  return !!capabilities?.ios;
}

export function filterStorageProfilesForPlatform(profiles, capabilities) {
  if (!Array.isArray(profiles)) return [];
  const supportedProviders = capabilities?.supportedStorageProviders
    || capabilities?.supported_storage_providers;
  if (!Array.isArray(supportedProviders) || !supportedProviders.length) return profiles;
  return profiles.filter((profile) => supportedProviders.includes(profile?.provider_kind));
}
