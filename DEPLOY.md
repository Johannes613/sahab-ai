# Deploy Sahab AI on AWS

Frontend and backend run together on **one EC2 instance** with Docker:

- `web`: Caddy serves the React app and forwards `/api`, `/files` and `/health` to the backend.
- `api`: the FastAPI backend with the trained models and the built-in Riyadh analysis.

Everything is served from one address, so there is no CORS setup and nothing to point the frontend
at. Analyses, downloaded satellite scenes and HTTPS certificates live in Docker volumes and survive
restarts and redeploys.

## What you need

- Your AWS account (the console in the Stockholm region, `eu-north-1`, works as is).
- Your Gemini API key.

## 1. Launch the instance

In the AWS console go to **EC2 → Instances → Launch instances** and set:

| Setting | Value |
|---|---|
| Name | `sahab-ai` |
| Application and OS image | **Ubuntu Server 24.04 LTS** (64-bit x86) |
| Instance type | **t3.large** (2 vCPU, 8 GiB). `t3.medium` (4 GiB) is the minimum; smaller ones will run out of memory. |
| Key pair | Create one if you want to use SSH. You can also choose "Proceed without a key pair" and use the browser-based connection in step 3. |
| Network settings → Edit | Create a security group with three rules: **SSH (22)** from **My IP**, **HTTP (80)** from **Anywhere**, **HTTPS (443)** from **Anywhere** |
| Configure storage | **40 GiB**, gp3 |

Do not open port 8000. The backend is only reachable through the web container.

Click **Launch instance**.

## 2. Give it a fixed address

**EC2 → Elastic IPs → Allocate Elastic IP address → Allocate**, then **Actions → Associate Elastic IP
address**, pick the `sahab-ai` instance. Without this, the address changes every time the instance is
stopped and started. (An Elastic IP that is not attached to a running instance is billed, so release
it if you delete the instance.)

## 3. Connect

**EC2 → Instances →** select `sahab-ai` **→ Connect → EC2 Instance Connect → Connect**. A terminal
opens in your browser.

## 4. Install and start

In that terminal:

```bash
git clone https://github.com/Johannes613/sahab-ai.git
bash sahab-ai/deploy/ec2-setup.sh
```

Paste your Gemini API key when asked (the input is hidden). The script installs Docker, adds swap,
builds both images, starts them, and prints the address. The first build takes several minutes.

## 5. Open it

Go to `http://<your Elastic IP>`. You should see the Riyadh dashboard straight away.

Check the backend with `http://<your Elastic IP>/health`. It should report
`"classifier_loaded": true` and `"gemini_configured": true`.

## Optional: HTTPS on your own domain

1. Create a DNS **A record** for your domain pointing at the Elastic IP.
2. Re-run the script with the domain:

   ```bash
   SITE_ADDRESS=sahab.example.com bash sahab-ai/deploy/ec2-setup.sh
   ```

Caddy then gets and renews a free HTTPS certificate by itself. Without a domain the site is plain
HTTP, which is fine for a demo but means the connection is not encrypted.

## Day-to-day

| Task | Command (in the instance's terminal) |
|---|---|
| Update to the latest code | `bash sahab-ai/deploy/ec2-setup.sh` |
| See logs | `cd sahab-ai && sudo docker compose logs -f` |
| Restart | `cd sahab-ai && sudo docker compose restart` |
| Stop paying for compute | Stop the instance in the console (disk and Elastic IP keep costing a little) |
| Change the Gemini key | edit `sahab-ai/sahab-api/.env`, then `sudo docker compose up -d` |

## Things to know

- **Anyone with the address can use it.** That includes starting analyses (each one downloads about 1 GB
  and uses CPU) and using the chat, which spends your Gemini quota. For a private demo, set the HTTP
  and HTTPS security group rules to **My IP** instead of Anywhere.
- **Your API key stays on the server** in `sahab-api/.env`. It is never sent to browsers and is not in
  the repository.
- **The first analysis of a scene is slower** because the scene is downloaded once (about 1 GB), then
  cached in a volume.
- **Only Riyadh has open satellite data.** Other Arab cities explain that no scene covers them; see the
  README for details.
