#!/bin/sh
# Lets HTTPS in from Cloudflare's edge only, so nobody can reach a site around the
# CDN (and its firewall) by going to the server's address directly.
# Run as root after `ufw allow OpenSSH` and before `ufw enable`; re-run now and then,
# as Cloudflare publishes changes to its ranges at https://www.cloudflare.com/ips/
set -eu
for family in v4 v6; do
  curl -fsS "https://www.cloudflare.com/ips-$family" | while read -r range; do
    [ -n "$range" ] && ufw allow proto tcp from "$range" to any port 443 comment 'Cloudflare'
  done
done
ufw reload
