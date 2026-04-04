// ============================================================
// Certificate Authority — identity is a cert, not a login
//
// No username. No password. No OAuth.
// A certificate IS the person.
//
// Flow:
//   1. Student installs app → cert minted, stored on device
//   2. Cert = device identity. Multiple devices = multiple certs
//      under one identity (cert chain)
//   3. Every shadow gets a provisional cert minted early
//   4. When the person arrives, we hand them their cert
//      with full history attached
//   5. The cert is what tells us "this device belongs to this person"
//   6. Lost device? Revoke cert. Data stays on server shadow
//      until new device claims it
//
// Teacher flow:
//   1. Students hint at "Prof. Vasquez" → shadow forms
//   2. Server mints provisional cert for the shadow
//   3. Prof. Vasquez installs app → enters name + institution
//   4. Server matches shadow → hands provisional cert
//   5. Cert now carries: all student-reported metadata,
//      grade distributions, common struggles
//   6. Server purges shadow data. Cert holder is sovereign.
//
// Parent flow:
//   1. Student under 13 → app asks for parent
//   2. Parent installs app → gets their own cert
//   3. Parent cert linked to child cert (chain)
//   4. Parent cert grants/revokes permissions on child cert
// ============================================================

const crypto = require('crypto');

// Cert structure — stored in server DB and on device
// The cert is a signed JSON blob, not x.509
// Lightweight, portable, verifiable

function mintCert(db, params) {
  const {
    accountId,
    role,         // student, teacher, parent, shadow
    displayName,
    institutionId,
    parentCertId, // for cert chaining (child → parent)
    shadowId,     // if minting for a shadow
  } = params;

  const certId = crypto.randomUUID();
  const keypair = crypto.generateKeyPairSync('ed25519');
  const publicKey = keypair.publicKey.export({ type: 'spki', format: 'pem' });
  const privateKey = keypair.privateKey.export({ type: 'pkcs8', format: 'pem' });

  const certPayload = {
    id: certId,
    account_id: accountId,
    role,
    display_name: displayName,
    institution_id: institutionId || null,
    parent_cert_id: parentCertId || null,
    shadow_id: shadowId || null,
    issued_at: new Date().toISOString(),
    revoked: false,
  };

  // Sign the payload
  const sign = crypto.createSign('Ed25519');
  sign.update(JSON.stringify(certPayload));
  const signature = sign.sign(keypair.privateKey, 'hex');

  // Store in DB
  db.query(
    `INSERT INTO certificates (id, account_id, role, public_key, cert_payload, signature, shadow_id, parent_cert_id, revoked, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, false, NOW())`,
    [certId, accountId, role, publicKey, JSON.stringify(certPayload), signature, shadowId, parentCertId]
  );

  // Return cert + private key (private key ONLY goes to the device, never stored server-side)
  return {
    cert: certPayload,
    signature,
    publicKey,
    privateKey, // device stores this, server never sees it again
  };
}

// Verify a cert signature
function verifyCert(certPayload, signature, publicKey) {
  try {
    const verify = crypto.createVerify('Ed25519');
    verify.update(JSON.stringify(certPayload));
    return verify.verify(publicKey, signature, 'hex');
  } catch {
    return false;
  }
}

// Mint a provisional cert for a shadow (teacher who doesn't exist yet)
async function mintShadowCert(db, shadowId, teacherName, institutionId) {
  const provisionalAccountId = `shadow_${crypto.randomUUID()}`;

  return mintCert(db, {
    accountId: provisionalAccountId,
    role: 'shadow',
    displayName: teacherName,
    institutionId,
    shadowId,
  });
}

// Claim a shadow cert — person arrives, gets the cert upgraded
async function claimShadowCert(db, realAccountId, shadowCertId) {
  // Get the shadow cert
  const cert = await db.query(
    'SELECT * FROM certificates WHERE id = $1 AND role = $2',
    [shadowCertId, 'shadow']
  );

  if (cert.rows.length === 0) return null;

  const shadow = cert.rows[0];

  // Mint a real cert for the person, linking to the shadow
  const realCert = mintCert(db, {
    accountId: realAccountId,
    role: 'teacher',
    displayName: JSON.parse(shadow.cert_payload).display_name,
    institutionId: JSON.parse(shadow.cert_payload).institution_id,
    shadowId: shadow.shadow_id,
  });

  // Revoke the shadow cert
  await db.query(
    "UPDATE certificates SET revoked = true, revoked_at = NOW(), revoked_reason = 'claimed' WHERE id = $1",
    [shadowCertId]
  );

  return realCert;
}

// Revoke a cert (lost device, parent revokes child, etc.)
async function revokeCert(db, certId, reason) {
  await db.query(
    'UPDATE certificates SET revoked = true, revoked_at = NOW(), revoked_reason = $1 WHERE id = $2',
    [reason, certId]
  );
}

// Add device to cert chain (same person, new device)
async function addDevice(db, parentCertId, accountId) {
  return mintCert(db, {
    accountId,
    role: 'device',
    displayName: 'additional_device',
    parentCertId,
  });
}

// Check if cert is valid (not revoked, signature checks out)
async function validateCert(db, certId) {
  const cert = await db.query(
    'SELECT * FROM certificates WHERE id = $1',
    [certId]
  );

  if (cert.rows.length === 0) return { valid: false, reason: 'not_found' };

  const c = cert.rows[0];
  if (c.revoked) return { valid: false, reason: 'revoked' };

  const payload = JSON.parse(c.cert_payload);
  const valid = verifyCert(payload, c.signature, c.public_key);

  return { valid, reason: valid ? 'ok' : 'bad_signature', cert: payload };
}

module.exports = {
  mintCert,
  verifyCert,
  mintShadowCert,
  claimShadowCert,
  revokeCert,
  addDevice,
  validateCert,
};
