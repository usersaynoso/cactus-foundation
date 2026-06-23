export const NEON_REGIONS = [
  { id: 'aws-us-east-2', label: 'US East (Ohio)' },
  { id: 'aws-us-east-1', label: 'US East (N. Virginia)' },
  { id: 'aws-us-west-2', label: 'US West (Oregon)' },
  { id: 'aws-eu-central-1', label: 'Europe (Frankfurt)' },
  { id: 'aws-eu-west-2', label: 'Europe (London)' },
  { id: 'aws-ap-southeast-1', label: 'Asia Pacific (Singapore)' },
  { id: 'aws-ap-southeast-2', label: 'Asia Pacific (Sydney)' },
  { id: 'aws-sa-east-1', label: 'South America (São Paulo)' },
] as const

export type NeonRegionId = (typeof NEON_REGIONS)[number]['id']
