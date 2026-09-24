#!/bin/sh

set -eu

TAILSCALE_AUTHKEY="${TAILSCALE_AUTHKEY:-${tskey:-}}"

if [ -z "$TAILSCALE_AUTHKEY" ]; then
    echo "TAILSCALE_AUTHKEY or tskey must be set" >&2
    exit 1
fi

/app/tailscaled --tun=userspace-networking --socks5-server=127.0.0.1:1055 --state=/var/lib/tailscale/tailscaled.state &

until /app/tailscale up --auth-key="$TAILSCALE_AUTHKEY" --hostname="${TAILSCALE_HOSTNAME:-litellm-local}"; do
    sleep 1
done

export ALL_PROXY="socks5://127.0.0.1:1055"
export NO_PROXY="${NO_PROXY:+${NO_PROXY},}127.0.0.1,localhost"

exec /app/docker/prod_entrypoint.sh "$@"
