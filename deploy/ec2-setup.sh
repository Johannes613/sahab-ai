#!/usr/bin/env bash
# Sets up Sahab AI (frontend + backend) on a fresh Ubuntu 24.04 EC2 instance.
#
#   git clone https://github.com/Johannes613/sahab-ai.git && bash sahab-ai/deploy/ec2-setup.sh
#
# Optional environment variables:
#   GEMINI_API_KEY   skip the prompt
#   SITE_ADDRESS     a domain name (e.g. sahab.example.com) to get automatic HTTPS; default is plain HTTP
#
# Safe to run again: it updates the code and restarts the stack, and keeps your data and key.
set -euo pipefail

REPO_URL="${REPO_URL:-https://github.com/Johannes613/sahab-ai.git}"
APP_DIR="${APP_DIR:-$HOME/sahab-ai}"

step() { printf '\n== %s\n' "$1"; }

step "1/6  Installing Docker"
if ! command -v docker >/dev/null 2>&1; then
  sudo apt-get update -y
  sudo apt-get install -y docker.io docker-compose-v2 git curl
  sudo systemctl enable --now docker
fi
sudo usermod -aG docker "$USER" || true

step "2/6  Adding swap (keeps a small instance from running out of memory)"
if ! swapon --show | grep -q .; then
  sudo fallocate -l 4G /swapfile
  sudo chmod 600 /swapfile
  sudo mkswap /swapfile >/dev/null
  sudo swapon /swapfile
  echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab >/dev/null
else
  echo "swap already present"
fi

step "3/6  Getting the code"
if [ -d "$APP_DIR/.git" ]; then
  git -C "$APP_DIR" pull --ff-only
else
  git clone "$REPO_URL" "$APP_DIR"
fi
cd "$APP_DIR"

step "4/6  Configuration"
ENV_FILE=sahab-api/.env
if [ ! -f "$ENV_FILE" ]; then
  cp sahab-api/.env.example "$ENV_FILE"
fi
set_var() {  # set_var FILE KEY VALUE  (rewrites the line without sed, so odd characters are safe)
  local file="$1" key="$2" value="$3" tmp
  tmp="$(mktemp)"
  grep -v "^${key}=" "$file" > "$tmp" || true
  printf '%s=%s\n' "$key" "$value" >> "$tmp"
  cat "$tmp" > "$file"
  rm -f "$tmp"
}
if ! grep -q '^GEMINI_API_KEY=.\+' "$ENV_FILE" || grep -q 'your_gemini_key_here' "$ENV_FILE"; then
  KEY="${GEMINI_API_KEY:-}"
  if [ -z "$KEY" ]; then
    read -rsp "Paste your Gemini API key (input is hidden): " KEY
    echo
  fi
  set_var "$ENV_FILE" GEMINI_API_KEY "$KEY"
fi
# one analysis at a time on small instances: each run holds a ~1 GB scene in memory while it works
MEM_GB="$(free -g | awk '/^Mem:/ {print $2}')"
if [ "${MEM_GB:-0}" -lt 6 ]; then set_var "$ENV_FILE" MAX_CONCURRENT_RUNS 1; fi
chmod 600 "$ENV_FILE"
if [ -n "${SITE_ADDRESS:-}" ]; then
  set_var .env SITE_ADDRESS "$SITE_ADDRESS"
fi

step "5/6  Building and starting (the first build takes several minutes)"
sudo docker compose up -d --build

step "6/6  Waiting for the app to answer"
for _ in $(seq 1 60); do
  if curl -fsS http://localhost/health >/dev/null 2>&1; then break; fi
  sleep 3
done

TOKEN="$(curl -fsS -m 2 -X PUT http://169.254.169.254/latest/api/token -H 'X-aws-ec2-metadata-token-ttl-seconds: 60' 2>/dev/null || true)"
IP="$(curl -fsS -m 2 -H "X-aws-ec2-metadata-token: $TOKEN" http://169.254.169.254/latest/meta-data/public-ipv4 2>/dev/null || echo '<your-public-ip>')"

echo
curl -fsS http://localhost/health && echo || echo "The app is not answering yet. Check:  sudo docker compose logs --tail 80"
echo
if [ -n "${SITE_ADDRESS:-}" ]; then
  echo "Open:  https://${SITE_ADDRESS}   (point the domain's DNS A record at ${IP} first)"
else
  echo "Open:  http://${IP}"
fi
echo "Logs:  sudo docker compose logs -f"
echo "Update later:  bash deploy/ec2-setup.sh"
