#!/bin/sh
# /usr/local/bin/cactus-host - the command line. Install with:
#   install -m 0755 /opt/cactus-host/ops/cactus-host.sh /usr/local/bin/cactus-host
export CACTUS_HOST_CONFIG="${CACTUS_HOST_CONFIG:-/etc/cactus-host/config.json}"
exec /usr/bin/node --disable-warning=ExperimentalWarning /opt/cactus-host/main.ts "$@"
