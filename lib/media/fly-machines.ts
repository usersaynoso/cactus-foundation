import { randomBytes } from 'node:crypto'
import { getSequenceMaxJobMachines } from '@/lib/config/env'
import type { ResolvedFly } from '@/lib/media/sequence-presets'

// Per-job Fly.io machines for the sequence worker.
//
// With a Fly token configured (Media > Scroll sequences, or SEQUENCE_FLY_TOKEN),
// every conversion gets its own short-lived machine cloned from the app's
// deploy-managed "template" machine: several videos convert in parallel instead
// of queueing, and each machine is destroyed the moment its job finishes so
// nothing idles on the bill. Two layers make sure of the destruction:
//
//   1. The completion webhook (app/api/webhooks/sequence) destroys the job's
//      machine as soon as the worker calls back - the prompt path.
//   2. The machine itself is created with auto_destroy + a SELF_DESTROY env the
//      worker honours by exiting once idle - the safety net for a lost callback.
//
// Requests are routed to a specific machine with the `fly-force-instance-id`
// header, which Fly's proxy honours on the app's public hostname. The template
// machine (the one `fly deploy` manages, recognisable by NOT carrying the
// SELF_DESTROY env) is never destroyed here - it is the source of the image,
// guest size and service config every clone copies.

const MACHINES_API = 'https://api.machines.dev/v1'

// There is deliberately NO built-in ceiling on simultaneous conversions: each
// one is a machine of its own and dies when it finishes, so ten at once costs
// the same as ten one after another. The ceiling used to be five, past which a
// conversion posted to the shared app URL instead - which looked like a graceful
// fallback and was anything but: an unrouted request is load-balanced across
// EVERY machine carrying the app's service config (all the job machines
// included), so the job landed on one machine and its status polls on another,
// which answered 404 and reported "the conversion service restarted and lost
// this job". A conversion in per-machine mode now always gets its own machine.
//
// SEQUENCE_MAX_JOB_MACHINES puts a lid back on if spend needs one; past that lid
// a conversion is refused in plain words rather than quietly misrouted.

// Idle seconds before a job machine exits of its own accord (the safety net -
// generous enough to cover the gap between frames finishing and the callback).
const JOB_MACHINE_IDLE_SECONDS = 240

export class FlyMachinesError extends Error {}

type FlyGuest = { cpu_kind?: string; cpus?: number; memory_mb?: number }
type FlyMachineConfig = {
  image?: string
  env?: Record<string, string>
  guest?: FlyGuest
  services?: unknown[]
  auto_destroy?: boolean
  restart?: { policy?: string }
}
type FlyMachine = {
  id: string
  name?: string
  state?: string
  region?: string
  config?: FlyMachineConfig
}

async function flyRequest(
  fly: ResolvedFly,
  method: string,
  path: string,
  body?: unknown,
): Promise<Response> {
  return fetch(`${MACHINES_API}/apps/${encodeURIComponent(fly.appName)}${path}`, {
    method,
    headers: {
      authorization: `Bearer ${fly.token}`,
      ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(30_000),
  })
}

async function listMachines(fly: ResolvedFly): Promise<FlyMachine[]> {
  const res = await flyRequest(fly, 'GET', '/machines')
  if (!res.ok) {
    throw new FlyMachinesError(`Fly would not list the worker machines (HTTP ${res.status}). Check the Fly token and app name.`)
  }
  return (await res.json()) as FlyMachine[]
}

function isJobMachine(m: FlyMachine): boolean {
  return m.config?.env?.SELF_DESTROY === '1'
}

// The deploy-managed machine every job machine is cloned from.
function findTemplate(machines: FlyMachine[]): FlyMachine | null {
  return machines.find((m) => !isJobMachine(m) && m.config?.image) ?? null
}

/**
 * Create a dedicated machine for one conversion job. Returns its machine id.
 * Throws FlyMachinesError when Fly will not play ball, or when the optional
 * SEQUENCE_MAX_JOB_MACHINES lid is already reached.
 */
export async function createJobMachine(fly: ResolvedFly): Promise<string> {
  const machines = await listMachines(fly)
  const template = findTemplate(machines)
  if (!template?.config?.image) {
    throw new FlyMachinesError('The Fly app has no deployed worker machine to clone. Deploy the sequence worker once (fly deploy) and try again.')
  }
  const max = getSequenceMaxJobMachines()
  if (max > 0) {
    const running = machines.filter((m) => isJobMachine(m) && m.state !== 'destroyed').length
    if (running >= max) {
      throw new FlyMachinesError(`${running} conversions are already running, which is the limit this site is set to. Wait for one to finish, then try again.`)
    }
  }

  const config: FlyMachineConfig = {
    image: template.config.image,
    guest: template.config.guest ?? { cpu_kind: 'shared', cpus: 2, memory_mb: 4096 },
    // The service block is what makes Fly's proxy route public traffic (and the
    // fly-force-instance-id header) to the clone - it must come along.
    services: template.config.services ?? [],
    env: {
      ...(template.config.env ?? {}),
      SELF_DESTROY: '1',
      IDLE_STOP_SECONDS: String(JOB_MACHINE_IDLE_SECONDS),
    },
    // Destroyed (not just stopped) when its process exits - the worker exits
    // itself once idle, so a machine whose callback went missing still dies.
    auto_destroy: true,
    restart: { policy: 'no' },
  }

  const createRes = await flyRequest(fly, 'POST', '/machines', {
    name: `seq-job-${randomBytes(3).toString('hex')}`,
    region: template.region,
    config,
  })
  if (!createRes.ok) {
    const detail = await createRes.text().catch(() => '')
    throw new FlyMachinesError(`Fly could not create a conversion machine (HTTP ${createRes.status}). ${detail.slice(0, 200)}`.trim())
  }
  const created = (await createRes.json()) as FlyMachine
  if (!created.id) throw new FlyMachinesError('Fly created a machine but returned no id.')

  // Wait for it to boot; the worker binds within a few seconds of 'started'.
  // Kept well inside the enqueue route's 60s ceiling: several machines booting
  // at once share the image pull, so a boot that took 19s alone can take longer
  // in a crowd, and a route that runs out of time strands a live machine.
  const waitRes = await flyRequest(fly, 'GET', `/machines/${created.id}/wait?state=started&timeout=35`)
  if (!waitRes.ok) {
    await destroyJobMachine(fly, created.id).catch(() => {})
    throw new FlyMachinesError(`The conversion machine did not start in time (HTTP ${waitRes.status}).`)
  }
  return created.id
}

/**
 * The Fly state of one machine ('started', 'stopped', 'destroyed', ...), or null
 * when Fly has no such machine (or will not say). Used by the status poll to
 * tell a job the worker genuinely lost from a poll that merely landed on the
 * wrong machine: a 404 from a machine that is still up is not proof of anything.
 */
export async function getJobMachineState(fly: ResolvedFly, machineId: string): Promise<string | null> {
  const res = await flyRequest(fly, 'GET', `/machines/${encodeURIComponent(machineId)}`)
  if (!res.ok) return null
  const machine = (await res.json().catch(() => null)) as FlyMachine | null
  return machine?.state ?? null
}

/** Destroy a job machine. Idempotent - a machine already gone is a success. */
export async function destroyJobMachine(fly: ResolvedFly, machineId: string): Promise<void> {
  const res = await flyRequest(fly, 'DELETE', `/machines/${encodeURIComponent(machineId)}?force=true`)
  if (!res.ok && res.status !== 404) {
    throw new FlyMachinesError(`Fly could not destroy machine ${machineId} (HTTP ${res.status}).`)
  }
}
