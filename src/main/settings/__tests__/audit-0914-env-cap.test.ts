// Independent audit fixture. Copy into src/main/settings/__tests__/audit-0914-env-cap.test.ts.
// Run: npm test -- src/main/settings/__tests__/audit-0914-env-cap.test.ts
// Pure composition of the shipping shape and seal checks. No files, shell,
// values or keystore calls. The supplied seal state stands for a previously
// authenticated name; this does not test encryption or tamper with a live seal.
import { expect, it, vi } from 'vitest';
vi.mock('electron', () => ({ app: { isReady: () => false }, safeStorage: {} }));
import { defaultGmuxSettings, envNameKey } from '@shared/settings';
import { dangerStateOf, sanitizeSettings, withSealedDangerState } from '../store';

const NAME = 'AUDIT_AUTHORISED_NAME';
const original = { ...defaultGmuxSettings(), envPassthrough: { claude: [NAME] } };
const seal = dangerStateOf(original);

it('control: the authenticated name survives ordinary shape and seal checks', () => {
  const got = withSealedDangerState(sanitizeSettings(original), seal);
  expect(got.settings.envPassthrough.claude).toEqual([NAME]);
  expect(got.rejected).toEqual([]);
});

it('untrusted prefix entries cannot silently displace an authenticated name', () => {
  const junk = Array.from({ length: 16 }, (_, i) => `AUDIT_UNTRUSTED_${i}`);
  const shaped = sanitizeSettings({ ...original, envPassthrough: { claude: [...junk, NAME] } });
  const got = withSealedDangerState(shaped, seal);
  const retained = got.settings.envPassthrough.claude?.includes(NAME) ?? false;
  const reported = got.rejected.includes(envNameKey('claude', NAME));
  console.log(JSON.stringify({ case: 'cap-before-seal', retained, reported,
    shapedCount: shaped.envPassthrough.claude?.length,
    rejectedCount: got.rejected.length, accepted: got.settings.envPassthrough }));
  expect(retained || reported).toBe(true);
});
