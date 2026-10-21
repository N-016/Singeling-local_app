// npm test: controleert de regels in rules.js (draait ook vóór elke build).
const assert = require('node:assert');
const { isInternalUrl, isAuthUrl, isFileUrl, compareVersions, criticalUpdateFrom } = require('../rules');

assert.equal(isInternalUrl('https://snglng.lovable.app/assemblies/1'), true);
assert.equal(isInternalUrl('https://x.snglng.lovable.app/'), true);
assert.equal(isInternalUrl('https://snglng.lovable.app.evil.com/'), false);
assert.equal(isInternalUrl('https://evil.com/?snglng.lovable.app'), false);
assert.equal(isInternalUrl('https://snglng.lovable.app@evil.com/'), false);
assert.equal(isInternalUrl('niet een url'), false);
assert.equal(isAuthUrl('https://login.microsoftonline.com/x'), true);
assert.equal(isAuthUrl('https://microsoftonline.com.evil.com/'), false);
assert.equal(isFileUrl('https://abc.supabase.co/storage/v1/object/sign/docs/310811.pdf?token=x'), true);
assert.equal(isFileUrl('https://abc.supabase.co/auth/v1/authorize?provider=azure'), false);
assert.equal(isFileUrl('https://evil.com/storage/x.pdf'), false);

assert.ok(compareVersions('1.3.0', '1.3.0-beta.2') > 0);
assert.ok(compareVersions('1.3.0-beta.10', '1.3.0-beta.2') > 0);
assert.ok(compareVersions('1.2.4', '1.3.0-beta.1') < 0);

const release = (body) => ({ version: '1.3.1', releaseName: 'v1.3.1', releaseNotes: body });
assert.deepEqual(criticalUpdateFrom(release('<p><strong>Kritieke update</strong> – minimale versie: 1.3.0<br>Reden: klokboekingen</p>'), '1.2.4'), { reason: 'klokboekingen' });
assert.equal(criticalUpdateFrom(release('<p><strong>Kritieke update</strong> – minimale versie: 1.3.0</p>'), '1.3.0'), null);
assert.equal(criticalUpdateFrom(release('<p>Dit is geen kritieke update.</p>'), '1.2.4'), null);
assert.deepEqual(criticalUpdateFrom(release('Kritieke update'), '1.3.0'), { reason: '' });

console.log('rules.js: alle controles geslaagd');

// Pagina-soort voor de gebruiksgegevens: nooit een ordernummer of klant erin.
const { pageKind } = require('../rules');
assert.equal(pageKind('https://snglng.lovable.app/sales-orders/30044?tab=kwaliteit'), '/sales-orders/:id');
assert.equal(pageKind('https://snglng.lovable.app/qrm-connect'), '/qrm-connect');
assert.equal(pageKind('https://snglng.lovable.app/dashboard-wvb-3'), '/dashboard-wvb-3');
assert.equal(pageKind('https://snglng.lovable.app/customers/3360'), '/customers/:id');
assert.equal(pageKind('https://snglng.lovable.app/sales-orders/IOR67916'), '/sales-orders/:id');
assert.equal(pageKind('https://snglng.lovable.app/x/550e8400-e29b-41d4-a716-446655440000'), '/x/:id');
assert.equal(pageKind('https://snglng.lovable.app/'), '/');
assert.equal(pageKind('https://snglng.lovable.app/a/b/c/d/e'), '/a/b/c');
assert.equal(pageKind('https://evil.com/sales-orders/1'), null);
assert.equal(pageKind('niet een url'), null);
console.log('pageKind: alle controles geslaagd');
