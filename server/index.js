// ============================================================
// StudySync Server
//
// A telephone switchboard. Nothing more.
//
// 1. WebSocket connections from local apps
// 2. Poll switchboard table for diffs
// 3. Ping recipients
// 4. Age gate on connect
//
// The server never reads message content.
// The server never stores personal data beyond account ID.
// The server is a dumb pipe with a notification light.
// ============================================================

const { WebSocketServer } = require('ws');
const { handleConnection, checkDiffs, checkAge, deliver, POLL_INTERVAL } = require('./switchboard');

const PORT = process.env.PORT || 3001;

// DB connection placeholder — Postgres in prod
let db = null;

function startServer(database) {
  db = database;

  const wss = new WebSocketServer({ port: PORT });

  wss.on('connection', async (ws, req) => {
    // Account ID from auth token (implementation depends on auth strategy)
    const accountId = new URL(req.url, 'http://localhost').searchParams.get('account_id');

    if (!accountId) {
      ws.close(4001, 'missing_account_id');
      return;
    }

    // Age gate
    const ageCheck = await checkAge(db, accountId);
    if (!ageCheck.allowed) {
      ws.send(JSON.stringify({ type: 'error', reason: ageCheck.reason }));
      ws.close(4003, ageCheck.reason);
      return;
    }

    handleConnection(ws, accountId);

    // Handle outgoing messages (local AI → server → recipient)
    ws.on('message', async (data) => {
      try {
        const msg = JSON.parse(data);

        if (msg.type === 'deliver') {
          const result = await deliver(
            db,
            accountId,
            msg.to_account_id,
            msg.channel,
            msg.payload,        // encrypted — server can't read it
            msg.payload_hash
          );
          ws.send(JSON.stringify({ type: 'deliver_result', ...result }));
        }

        if (msg.type === 'read') {
          // Mark messages as read
          await db.query(
            "UPDATE switchboard SET status = 'read' WHERE id = $1 AND to_account_id = $2",
            [msg.message_id, accountId]
          );
        }

        if (msg.type === 'fetch') {
          // Fetch pending messages (on reconnect)
          const pending = await db.query(
            `SELECT id, from_account_id, channel, payload, created_at
             FROM switchboard
             WHERE to_account_id = $1 AND status = 'pending'
             ORDER BY created_at`,
            [accountId]
          );
          ws.send(JSON.stringify({ type: 'pending', messages: pending.rows }));
        }
      } catch (err) {
        ws.send(JSON.stringify({ type: 'error', message: 'invalid_message' }));
      }
    });
  });

  // The diff poller — the server's heartbeat
  setInterval(() => checkDiffs(db), POLL_INTERVAL);

  console.log(`StudySync switchboard running on port ${PORT}`);
}

module.exports = { startServer };
