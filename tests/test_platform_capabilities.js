import assert from 'node:assert/strict';
import {
  filterStorageProfilesForPlatform,
  isIosPlatform,
} from '../src-ui/src/utils/platform-capabilities.js';

const profiles = [
  { id: 'webdav-1', provider_kind: 'webdav' },
  { id: 'supabase-1', provider_kind: 'supabase' },
];

const iosCapabilities = {
  ios: true,
  supportedStorageProviders: ['supabase'],
};
assert.equal(isIosPlatform(iosCapabilities), true);
assert.deepEqual(
  filterStorageProfilesForPlatform(profiles, iosCapabilities).map((profile) => profile.id),
  ['supabase-1'],
);

const desktopCapabilities = {
  ios: false,
  supportedStorageProviders: ['webdav', 'supabase'],
};
assert.equal(isIosPlatform(desktopCapabilities), false);
assert.deepEqual(filterStorageProfilesForPlatform(profiles, desktopCapabilities), profiles);
assert.deepEqual(filterStorageProfilesForPlatform(profiles, null), profiles);
assert.deepEqual(filterStorageProfilesForPlatform(null, iosCapabilities), []);

console.log('platform capability filtering tests passed');
