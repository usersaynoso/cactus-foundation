import { BlockList, isIP } from 'node:net'

// Cloudflare's published edge ranges - https://www.cloudflare.com/ips-v4 and
// /ips-v6, checked 2026-09-18. They change rarely; when they do, a missing
// range makes that edge's visitors share one rate-limit bucket (over-limiting,
// the safe way round), it never lets a forged header through.
const CLOUDFLARE_V4 = [
  '173.245.48.0/20', '103.21.244.0/22', '103.22.200.0/22', '103.31.4.0/22',
  '141.101.64.0/18', '108.162.192.0/18', '190.93.240.0/20', '188.114.96.0/20',
  '197.234.240.0/22', '198.41.128.0/17', '162.158.0.0/15', '104.16.0.0/13',
  '104.24.0.0/14', '172.64.0.0/13', '131.0.72.0/22',
]
const CLOUDFLARE_V6 = [
  '2400:cb00::/32', '2606:4700::/32', '2803:f800::/32', '2405:b500::/32',
  '2405:8100::/32', '2a06:98c0::/29', '2c0f:f248::/32',
]

const edges = new BlockList()
for (const cidr of CLOUDFLARE_V4) {
  const [net, bits] = cidr.split('/') as [string, string]
  edges.addSubnet(net, Number(bits), 'ipv4')
}
for (const cidr of CLOUDFLARE_V6) {
  const [net, bits] = cidr.split('/') as [string, string]
  edges.addSubnet(net, Number(bits), 'ipv6')
}

/** True when `ip` is one of Cloudflare's own edge addresses - i.e. the request
 *  really did arrive through Cloudflare, so its CF-Connecting-IP can be believed. */
export function isCloudflareEdge(ip: string): boolean {
  const family = isIP(ip)
  if (family === 4) return edges.check(ip, 'ipv4')
  if (family === 6) return edges.check(ip, 'ipv6')
  return false
}
