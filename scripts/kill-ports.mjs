import { execSync } from 'child_process'

const ports = process.argv.slice(2).map(Number).filter(Boolean)
if (ports.length === 0) ports.push(3000, 3001)

if (process.platform === 'win32') {
  for (const port of ports) {
    try {
      const out = execSync(`netstat -ano | findstr :${port}`, { encoding: 'utf8' })
      const pids = new Set()
      for (const line of out.split('\n')) {
        if (!line.includes('LISTENING')) continue
        const pid = line.trim().split(/\s+/).at(-1)
        if (pid && pid !== '0') pids.add(pid)
      }
      for (const pid of pids) {
        try {
          execSync(`taskkill /F /PID ${pid}`, { stdio: 'ignore' })
          console.log(`Stopped process ${pid} on port ${port}`)
        } catch {
          /* already gone */
        }
      }
    } catch {
      /* nothing listening */
    }
  }
} else {
  for (const port of ports) {
    try {
      execSync(`lsof -ti:${port} | xargs kill -9 2>/dev/null`, { stdio: 'ignore', shell: true })
    } catch {
      /* nothing listening */
    }
  }
}
