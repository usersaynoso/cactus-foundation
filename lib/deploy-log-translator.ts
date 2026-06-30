export function translateLogLine(rawLine: string): string | null {
  const line = rawLine

  if (line.includes('Cloning github.com/')) return 'Popping over to grab the latest code from GitHub...'
  if (line.includes('Cloning completed:')) return 'Got it. All the latest changes are here.'
  if (line.includes('Installing dependencies')) return 'Rounding up all the bits and bobs this needs to run...'
  if (line.includes('up to date in') || /added (\d+) packages?/i.test(line)) return 'All the bits and bobs are present and correct.'
  if (line.includes('Generated Prisma Client')) return 'Had a quiet word with the database. All sorted.'
  if (line.includes('[build-migrate] Prisma migrations')) return 'Having a rummage to see if the database needs any updates...'
  if (line.includes('No pending migrations to apply')) return 'Database is ship-shape, nothing to change.'

  const appliedMatch = line.includes('[module-migrations]') && line.includes('Applied') ? line.match(/Applied (\d+)/i) : null
  if (appliedMatch) return `Applied ${appliedMatch[1]} updates to your add-ons.`

  if (line.includes('[build-migrate] Module migrations')) return 'Checking your add-ons are all up to scratch...'
  if (line.includes('No active modules found')) return 'No modules installed -- Vercel will be well pleased.'
  if (line.includes('Creating an optimized production build')) return 'Pulling everything together into a proper build, this takes a moment...'
  if (line.includes('Compiled successfully')) return 'Turned all that code into something the server can actually run.'
  if (line.includes('Running TypeScript')) return 'Giving the code a thorough once-over for any silly mistakes...'
  if (line.includes('Finished TypeScript')) return 'Checked the code for any howlers. All clear.'
  if (line.includes('Collecting page data')) return 'Having a look at what pages need building...'

  if (line.includes('Generating static pages')) {
    const finalMatch = line.match(/\((\d+)\/\1\)/)
    if (finalMatch) return `All ${finalMatch[1]} pages built. Lovely.`
    return 'Knocking together all your pages, won\'t be a tick...'
  }

  if (line.includes('Build Completed')) return 'Done and dusted. Handing the baton to Vercel...'
  if (line.includes('Deploying outputs')) return "Vercel's got it now, shipping everything out..."
  if (line.includes('Deployment completed')) return 'Rolling out to your visitors now...'
  if (line.includes('Creating build cache')) return 'Just tidying up and putting things away neatly...'
  if (line.includes('Build cache uploaded')) return 'Bish bash bosh. You\'re live.'

  return null
}
