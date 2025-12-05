import { Redis } from '@upstash/redis';

const redis = Redis.fromEnv();

export default async function handler(req, res) {
  // --- GET: The View (Browser Request) ---
  if (req.method === 'GET') {
    const { mode, path } = req.query;
    
    // 1. Browser asking for a specific page (e.g., /students)
    if (mode === 'view') {
      const currentPath = path || '/';
      // Try to get the cached reality frame
      const html = await redis.get(`page:${currentPath}`);
      
      // If the frame is missing (Void Sector), signal the Core to construct it
      if (!html) {
        // Check if a request is already pending to avoid spamming the queue
        const pending = await redis.get(`pending:${currentPath}`);
        if (!pending) {
            await redis.rpush('manifold_events', JSON.stringify({ 
                type: 'NAVIGATE', 
                path: currentPath, 
                timestamp: Date.now() 
            }));
            await redis.setex(`pending:${currentPath}`, 10, 'true'); // Debounce for 10s
        }
        
        return res.status(200).json({ 
            html: `
            <div style="height:100vh; display:flex; align-items:center; justify-content:center; background:#0f172a; color:#94a3b8; font-family:monospace;">
                <div style="text-align:center;">
                    <h1>constructing reality...</h1>
                    <p>signal dispatched to core.</p>
                </div>
            </div>
            <script>setTimeout(() => window.location.reload(), 2000)</script>
            ` 
        });
      }
      return res.status(200).json({ html });
    }

    // 2. Core asking for Tasks (The Heartbeat)
    if (mode === 'task') {
      const task = await redis.lpop('manifold_events');
      return res.status(200).json({ task: task ? JSON.parse(task) : null });
    }
  }

  // --- POST: The Core (Writing Reality) ---
  if (req.method === 'POST') {
    const { type, html, path } = req.body;

    // Core pushing a constructed page
    if (type === 'SNAPSHOT') {
      const targetPath = path || '/';
      await redis.set(`page:${targetPath}`, html);
      await redis.del(`pending:${targetPath}`); // Clear the pending flag
      return res.status(200).json({ status: 'Reality Stabilized' });
    }
  }
  
  return res.status(405).json({ error: 'Method Not Allowed' });
}