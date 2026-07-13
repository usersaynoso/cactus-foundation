// About-panel content for the admin "version number" dialog: the Cactus
// Foundation blurb plus the credits list of the open-source projects Cactus is
// built on. Hand-curated (not auto-derived from package.json) so each entry gets
// a plain-English description grouped by what it actually does for the site.
//
// KEEP THIS IN STEP WITH package.json: when a dependency that a site owner would
// recognise is added or removed, update the matching entry here too. Transitive
// and purely-internal tooling deps are deliberately omitted - this is a credits
// roll, not a dependency dump.

export type CreditEntry = {
  name: string
  /** One line, plain English: what it does for the site. British spelling. */
  description: string
  url: string
}

export type CreditGroup = {
  title: string
  entries: CreditEntry[]
}

export const ABOUT = {
  name: 'Cactus Foundation',
  slogan: 'The website platform that looks after itself.',
  paragraph:
    'Cactus Foundation is a website platform for building and running proper websites without the usual faff. ' +
    'A visual page builder, media handling, user accounts, contact forms and a self-updating core all come in one ' +
    'tidy package, so you can get on with your business while the plumbing quietly looks after itself. Named after ' +
    'the plant that thrives while you forget to water it - which is rather the point.',
} as const

export const CREDITS: CreditGroup[] = [
  {
    title: 'Built with a little help',
    entries: [
      {
        name: 'Claude Code',
        description: "Anthropic's coding agent, which wrote a fair chunk of Cactus and still gets the blame for the bugs.",
        url: 'https://claude.com/claude-code',
      },
    ],
  },
  {
    title: 'Framework & page builder',
    entries: [
      { name: 'Next.js', description: 'The React framework everything runs on.', url: 'https://nextjs.org' },
      { name: 'React', description: 'The library that draws every screen you see.', url: 'https://react.dev' },
      { name: 'Puck', description: 'The drag-and-drop editor behind the visual page builder.', url: 'https://puckeditor.com' },
      { name: 'AOS', description: 'Gentle scroll animations for content as it comes into view.', url: 'https://michalsnik.github.io/aos/' },
    ],
  },
  {
    title: 'Data & storage',
    entries: [
      { name: 'Prisma', description: 'Talks to the database so the rest of Cactus does not have to.', url: 'https://www.prisma.io' },
      { name: 'PostgreSQL driver', description: 'The connection to your PostgreSQL database.', url: 'https://node-postgres.com' },
      { name: 'Vercel Blob', description: 'One of the places your uploaded files can live.', url: 'https://vercel.com/docs/vercel-blob' },
    ],
  },
  {
    title: 'Media & images',
    entries: [
      { name: 'Sharp', description: 'Resizes and optimises images so pages stay quick.', url: 'https://sharp.pixelplumbing.com' },
      { name: 'Cloudinary', description: 'An optional home and delivery network for your media.', url: 'https://cloudinary.com' },
      { name: 'ImageKit', description: 'Another optional media storage and delivery option.', url: 'https://imagekit.io' },
      { name: 'Amazon S3', description: 'S3-compatible storage for uploads, if you prefer it.', url: 'https://aws.amazon.com/s3/' },
      { name: 'Supabase Storage', description: 'A further storage option for your files.', url: 'https://supabase.com/storage' },
      { name: 'ONNX Runtime', description: 'Runs the in-browser model behind background and watermark removal.', url: 'https://onnxruntime.ai' },
      { name: 'Shiki', description: 'Pretty syntax highlighting for code blocks.', url: 'https://shiki.style' },
    ],
  },
  {
    title: 'Text & content',
    entries: [
      { name: 'Marked', description: 'Turns Markdown into the formatted text you read.', url: 'https://marked.js.org' },
      { name: 'DOMPurify', description: 'Scrubs anything nasty out of content before it is shown.', url: 'https://github.com/cure53/DOMPurify' },
      { name: 'Zod', description: 'Checks that data is the right shape before Cactus trusts it.', url: 'https://zod.dev' },
    ],
  },
  {
    title: 'Sign-in & security',
    entries: [
      { name: 'SimpleWebAuthn', description: 'Powers passkey sign-in, so you can skip passwords.', url: 'https://simplewebauthn.dev' },
      { name: 'bcrypt', description: 'Keeps stored passwords properly scrambled.', url: 'https://github.com/dcodeIO/bcrypt.js' },
      { name: 'OTPAuth', description: 'The engine behind authenticator-app two-factor codes.', url: 'https://github.com/hectorm/otpauth' },
      { name: 'QRCode', description: 'Draws the QR codes for setting up two-factor sign-in.', url: 'https://github.com/soldair/node-qrcode' },
    ],
  },
  {
    title: 'Email',
    entries: [
      { name: 'Nodemailer', description: 'Sends the emails Cactus needs to send.', url: 'https://nodemailer.com' },
      { name: 'ImapFlow', description: 'Reads incoming email for features that watch a mailbox.', url: 'https://imapflow.com' },
      { name: 'mailparser', description: 'Makes sense of the raw email that arrives.', url: 'https://nodemailer.com/extras/mailparser/' },
      { name: 'email-reply-parser', description: 'Trims quoted history so replies read cleanly.', url: 'https://github.com/crisp-oss/email-reply-parser' },
    ],
  },
  {
    title: 'Maps & payments',
    entries: [
      { name: 'Leaflet', description: 'The interactive maps you can drop onto a page.', url: 'https://leafletjs.com' },
      { name: 'Stripe', description: 'Handles card payments securely.', url: 'https://stripe.com' },
    ],
  },
  {
    title: 'Behind the scenes',
    entries: [
      { name: 'Octokit', description: 'How Cactus talks to GitHub for updates and integrations.', url: 'https://github.com/octokit' },
      { name: 'date-fns', description: 'Sorts out dates and times without the headache.', url: 'https://date-fns.org' },
      { name: 'nanoid', description: 'Generates the short, unique IDs used throughout.', url: 'https://github.com/ai/nanoid' },
    ],
  },
]
