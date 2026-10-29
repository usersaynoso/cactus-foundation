// Client-safe half of lib/deploy/manual.ts: the words the admin shows when a commit
// was pushed to a host that cannot build it (a Vercel project with no Git link).
export const MANUAL_DEPLOY_MESSAGE =
  "The update is committed to GitHub, but this Vercel project isn't connected to Git, so Cactus can't build it. " +
  'Deploy the site yourself (for example with vercel deploy --prod from the repo), then refresh.'
