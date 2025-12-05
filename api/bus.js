import { Redis } from '@upstash/redis'

const redis = Redis.fromEnv()

export default async function handler(req, res) {
  // --- AUTHENTICATION (Optional but recommended) ---
  // const auth = req.headers['authorization']
  // const isLocalNode = auth === `Bearer ${process.env.MANIFOLD_SECRET}`

  // --- GET REQUESTS (Reading State) ---
  if (req.method === 'GET') {
    const { mode } = req.query

    // Mode A: The Local Node asking for work (Tasks)
    if (mode === 'task') {
      const task = await redis.lpop('manifold_events')
      return res.status(200).json({ task: task ? JSON.parse(task) : null })
    }

    // Mode B: The Browser asking for the View (HTML)
    if (mode === 'view') {
      const html = await redis.get('manifold_snapshot')
      return res.status(200).json({ html: html || '' })
    }
  }

  // --- POST REQUESTS (Writing State) ---
  if (req.method === 'POST') {
    const { type, html, action, payload } = req.body

    // Type A: Local Node sending a new Snapshot
    if (type === 'SNAPSHOT') {
      if (!html) return res.status(400).json({ error: 'No HTML provided' })
      await redis.set('manifold_snapshot', html)
      return res.status(200).json({ status: 'Updated' })
    }

    // Type B: Browser sending a User Event
    if (type === 'EVENT') {
      const eventData = JSON.stringify({ action, payload, timestamp: Date.now() })
      await redis.rpush('manifold_events', eventData)
      return res.status(200).json({ status: 'Queued' })
    }
  }

  return res.status(405).json({ error: 'Method Not Allowed' })
}