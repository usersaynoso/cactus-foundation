// Everything cactus-host does to the machine outside its own files goes through
// here: running a command (git, systemd-run, systemctl, the Caddy reload), looking up
// a site's Linux user, making an HTTP request, telling the time. The real version
// talks to the box; the tests hand in a fake and check what would have been run.

import { spawn } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { request as httpRequest } from 'node:http'

export type RunOptions = {
  cwd?: string
  uid?: number
  gid?: number
  /** Replaces the inherited environment entirely when given. */
  env?: Record<string, string>
  /** Called with each complete line of combined stdout/stderr, as it arrives. */
  onLine?: (line: string) => void
  timeoutMs?: number
}

export type RunResult = {
  code: number
  /** The last 64 KB of combined output, for error messages. */
  output: string
}

export type LinuxUser = { uid: number; gid: number; home: string }

export type LocalRequest = {
  port: number
  path: string
  /** Sent as given. fetch() silently replaces Host, which is why this exists. */
  headers: Record<string, string>
  timeoutMs: number
  /** GET unless said otherwise. A POST is sent with an empty body. */
  method?: 'GET' | 'POST'
}

export type LocalResponse = { status: number; body: string }

export interface System {
  run(cmd: string, args: string[], opts?: RunOptions): Promise<RunResult>
  lookupUser(name: string): LinuxUser | null
  /** Outbound HTTPS (the domain check). */
  fetch(url: string, init?: RequestInit): Promise<Response>
  /** A request to a site's own port on loopback (`localhost`, which is what the site is bound to), with its real Host header. Never follows redirects. */
  local(req: LocalRequest): Promise<LocalResponse>
  now(): number
}

const LOCAL_BODY_LIMIT = 256 * 1024

const OUTPUT_TAIL = 64 * 1024

export function parsePasswd(text: string, name: string): LinuxUser | null {
  for (const line of text.split('\n')) {
    const fields = line.split(':')
    if (fields[0] !== name || fields.length < 7) continue
    const uid = Number(fields[2])
    const gid = Number(fields[3])
    if (!Number.isInteger(uid) || !Number.isInteger(gid)) return null
    return { uid, gid, home: fields[5] ?? '' }
  }
  return null
}

export const realSystem: System = {
  run(cmd, args, opts = {}) {
    return new Promise((resolve) => {
      const child = spawn(cmd, args, {
        cwd: opts.cwd,
        uid: opts.uid,
        gid: opts.gid,
        // Next's type declarations make NODE_ENV a required key of ProcessEnv; a
        // replacement environment for git or tar has no business carrying one.
        env: (opts.env ?? process.env) as NodeJS.ProcessEnv,
        stdio: ['ignore', 'pipe', 'pipe'],
        shell: false,
      })
      let tail = ''
      let partial = ''
      const onData = (chunk: Buffer) => {
        const text = chunk.toString('utf8')
        tail = (tail + text).slice(-OUTPUT_TAIL)
        if (!opts.onLine) return
        partial += text
        const lines = partial.split('\n')
        partial = lines.pop() ?? ''
        for (const line of lines) opts.onLine(line.replace(/\r$/, ''))
      }
      child.stdout.on('data', onData)
      child.stderr.on('data', onData)
      const timer = opts.timeoutMs
        ? setTimeout(() => {
            tail += `\n[cactus-host] stopped after ${Math.round((opts.timeoutMs ?? 0) / 60_000)} minutes\n`
            child.kill('SIGTERM')
          }, opts.timeoutMs)
        : null
      child.on('error', (err) => {
        if (timer) clearTimeout(timer)
        resolve({ code: 127, output: `${tail}${err.message}\n` })
      })
      child.on('close', (code) => {
        if (timer) clearTimeout(timer)
        if (partial && opts.onLine) opts.onLine(partial)
        resolve({ code: code ?? 1, output: tail })
      })
    })
  },
  lookupUser(name) {
    try {
      return parsePasswd(readFileSync('/etc/passwd', 'utf8'), name)
    } catch {
      return null
    }
  },
  fetch: (url, init) => fetch(url, init),
  local({ port, path, headers, timeoutMs, method = 'GET' }) {
    return new Promise((resolve, reject) => {
      const sent = method === 'POST' ? { ...headers, 'Content-Length': '0' } : headers
      const req = httpRequest({ host: 'localhost', port, path, method, headers: sent, timeout: timeoutMs }, (res) => {
        let body = ''
        res.setEncoding('utf8')
        res.on('data', (chunk: string) => {
          if (body.length < LOCAL_BODY_LIMIT) body += chunk
        })
        res.on('end', () => resolve({ status: res.statusCode ?? 0, body }))
        res.on('error', reject)
      })
      req.on('timeout', () => req.destroy(new Error(`no answer within ${Math.round(timeoutMs / 1000)}s`)))
      req.on('error', reject)
      req.end()
    })
  },
  now: () => Date.now(),
}

/** Runs a command and throws with its output when it does not exit 0. */
export async function mustRun(system: System, what: string, cmd: string, args: string[], opts?: RunOptions): Promise<RunResult> {
  const result = await system.run(cmd, args, opts)
  if (result.code !== 0) {
    const detail = result.output.trim().split('\n').slice(-5).join('\n')
    throw new Error(`${what} failed (exit ${result.code})${detail ? `:\n${detail}` : ''}`)
  }
  return result
}
