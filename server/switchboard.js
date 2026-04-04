// ============================================================
// Switchboard — the telephone exchange
//
// Watches the switchboard table for new rows.
// Pings the recipient's WebSocket.
// Never reads content. Only reads the diff.
//
// That's the entire server.
// ============================================================

const POLL_INTERVAL = 1000; // 1 second — check for new rows

// In-memory connection map: account_id → WebSocket
const connections = new Map();

// Last seen row per account (for diff detection)
const cursors = new Map();

function handleConnection(ws, accountId) {
  connections.set(accountId, ws);
  cursors.set(accountId, Date.now());

  ws.on('close', () => {
    connections.delete(accountId);
    cursors.delete(accountId);
  });
}

// The diff checker — this is the server's only job
async function checkDiffs(db) {
  for (const [accountId, ws] of connections) {
    const cursor = cursors.get(accountId);

    // Find new rows in switchboard for this account
    const newRows = await db.query(
      `SELECT id, from_account_id, channel, created_at
       FROM switchboard
       WHERE to_account_id = $1 AND status = 'pending' AND created_at > $2
       ORDER BY created_at`,
      [accountId, new Date(cursor)]
    );

    if (newRows.rows.length > 0) {
      // Ping the WebSocket — just the metadata, never the content
      ws.send(JSON.stringify({
        type: 'incoming',
        count: newRows.rows.length,
        channels: [...new Set(newRows.rows.map(r => r.channel))],
        from: [...new Set(newRows.rows.map(r => r.from_account_id))],
      }));

      // Update cursor
      const latest = newRows.rows[newRows.rows.length - 1].created_at;
      cursors.set(accountId, latest);
    }
  }
}

// Age gate — check before any connection is established
async function checkAge(db, accountId) {
  const account = await db.query(
    'SELECT age_bracket, parental_consent FROM accounts WHERE id = $1',
    [accountId]
  );

  if (!account.rows[0]) return { allowed: false, reason: 'account_not_found' };

  const { age_bracket, parental_consent } = account.rows[0];

  if (age_bracket === 'under_13' && !parental_consent) {
    return { allowed: false, reason: 'parental_consent_required' };
  }

  return { allowed: true };
}

// Contact pair validation — both sides must approve
async function canCommunicate(db, fromId, toId) {
  const pair = await db.query(
    `SELECT * FROM contact_pairs
     WHERE ((account_a = $1 AND account_b = $2) OR (account_a = $2 AND account_b = $1))
       AND status = 'active'`,
    [fromId, toId]
  );

  if (pair.rows.length === 0) return false;

  const p = pair.rows[0];

  // Both sides must have approved
  if (!p.a_approved || !p.b_approved) return false;

  // If either is under_13, parent must have approved
  if (p.a_parent_approved === 0 || p.b_parent_approved === 0) {
    // Check if parent approval is needed
    const accounts = await db.query(
      'SELECT id, age_bracket FROM accounts WHERE id IN ($1, $2)',
      [fromId, toId]
    );
    for (const acc of accounts.rows) {
      if (acc.age_bracket === 'under_13') {
        const isA = acc.id === p.account_a;
        if (isA && !p.a_parent_approved) return false;
        if (!isA && !p.b_parent_approved) return false;
      }
    }
  }

  return true;
}

// Write to switchboard — the only write operation
async function deliver(db, fromId, toId, channel, encryptedPayload, payloadHash) {
  // Validate contact pair
  const allowed = await canCommunicate(db, fromId, toId);
  if (!allowed) {
    // Log the rejection — not the content, the reason
    await db.query(
      `INSERT INTO safety_log (id, from_account_id, to_account_id, reason, channel, created_at)
       VALUES ($1, $2, $3, 'no_active_contact_pair', $4, NOW())`,
      [crypto.randomUUID(), fromId, toId, channel]
    );
    return { delivered: false, reason: 'not_authorized' };
  }

  const id = crypto.randomUUID();
  await db.query(
    `INSERT INTO switchboard (id, from_account_id, to_account_id, channel, payload, payload_hash, status, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, 'pending', NOW())`,
    [id, fromId, toId, channel, encryptedPayload, payloadHash]
  );

  return { delivered: true, id };
}

// Grade level → age bracket mapping
function gradeToAgeBracket(gradeLevel) {
  if (!gradeLevel) return '18_plus';
  const g = gradeLevel.toUpperCase();
  if (g === 'K' || parseInt(g) <= 5) return 'under_13';
  if (parseInt(g) <= 8) return 'under_13'; // conservative: 6-8 requires consent
  if (parseInt(g) <= 12) return '13_to_17';
  return '18_plus';
}

module.exports = {
  handleConnection,
  checkDiffs,
  checkAge,
  canCommunicate,
  deliver,
  gradeToAgeBracket,
  POLL_INTERVAL,
};
