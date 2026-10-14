#!/usr/bin/env bash
# Bouw en zet de demo op Cloudflare Pages (project icn-zonnepanelen-demo).
# Nodig: CLOUDFLARE_API_TOKEN (alleen Pages + Workers) en CLOUDFLARE_ACCOUNT_ID in de omgeving,
# of `npx wrangler login`. De toegangscode staat als Pages-secret TOEGANGSCODE (niet in de repo).
set -euo pipefail
cd "$(dirname "$0")/.."
npm run build
npx wrangler pages deploy dist --project-name icn-zonnepanelen-demo --branch main --commit-dirty=true
