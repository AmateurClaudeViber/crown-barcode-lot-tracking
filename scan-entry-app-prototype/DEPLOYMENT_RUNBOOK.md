# Deployment runbook — Crown Production Scan Entry App

For Jain (or whoever is on-ground) to run on the Arihant on-prem server. Written 17 Aug 2026, per Jain's decision that this layer will not be given remote access to that server — every step below is meant to be followed by hand, no technical background assumed beyond basic Windows use.

This app needs **nothing beyond Python itself** — no internet access required to run it, no packages to install. That was a deliberate choice, in case the server has no internet access.

## What you're deploying

Two files: `app.py` (the application) and `crown_production_prototype.db` (the database — currently loaded with illustrative sample data, not real production numbers). Both are in this same folder.

## Step 1 — Check whether Python is already on the server

Open Command Prompt (Start menu → type `cmd` → Enter) and run:

```
python --version
```

- If it prints something like `Python 3.10.x` or higher, skip to Step 2.
- If it says "not recognized" or similar, Python needs installing first:
  - If the server has internet access: download the installer from `python.org/downloads` (choose the Windows installer), run it, and **tick "Add python.exe to PATH"** on the first screen before clicking Install.
  - If the server has no internet access: the installer needs to be copied over from another machine (USB drive) — let me know and I'll flag the exact installer version to grab.
  - Re-run `python --version` afterward to confirm it worked.

## Step 2 — Copy this folder onto the server

Copy the whole `Scan Entry App` folder (both files) onto the server — via USB drive, or however files normally move onto that machine. Location doesn't matter, but note the path (e.g. `C:\CrownScanApp\`).

## Step 3 — Start the app

In Command Prompt, navigate to the folder and run it:

```
cd C:\CrownScanApp
python app.py
```

You should see:

```
Crown Production scan-entry app running at http://0.0.0.0:5000
Press Ctrl+C to stop.
```

Leave this window open — closing it stops the app. (This is fine for the pilot; once we're past pilot scale, this can be set up to run automatically in the background via Windows Task Scheduler — not needed yet.)

## Step 4 — Confirm it works, on the server itself

Open a web browser **on the server**, go to:

```
http://localhost:5000
```

You should see the "Crown Production — Scan Entry" page with a lot lookup form.

## Step 5 — Open the firewall so other devices can reach it

Right now, only the server itself can reach the app. For floor devices to use it, Windows Firewall needs an inbound rule:

1. Start menu → search "Windows Defender Firewall with Advanced Security" → open it
2. Left panel → "Inbound Rules" → right panel → "New Rule…"
3. Rule type: **Port** → Next
4. TCP, Specific local ports: **5000** → Next
5. Allow the connection → Next
6. Tick all three (Domain, Private, Public) unless you know the network profile — Next
7. Name it something like "Crown Scan App" → Finish

## Step 6 — Find the server's address on the local network

Still in Command Prompt on the server:

```
ipconfig
```

Look for "IPv4 Address" under the active network adapter — something like `192.168.1.50`. That's the address other devices on the same network will use.

## Step 7 — Access from a floor device

On any computer or tablet **on the same local network** as the server, open a browser and go to:

```
http://<the-ip-from-step-6>:5000
```

Example: `http://192.168.1.50:5000`

That's it — no login yet (access is by network reachability only during POC, per the interim access approach; the named-list access control is a separate, later step).

## If something doesn't work

- **Page won't load from another device**: usually the firewall rule (Step 5) or the devices aren't on the same network/subnet. Confirm both.
- **App crashes or won't start**: copy the exact error text from Command Prompt and send it over — I can diagnose from that without needing access to the server itself.
- **Need to reset the sample data**: just re-copy `crown_production_prototype.db` from this same source folder — it overwrites the working copy.

## What this is not (yet)

This is still a proof of concept, on illustrative sample data. Before this becomes the real Machine Shop / IST Inspection pilot, it still needs: the assumption that floor devices actually have reliable access to this local network confirmed (currently unconfirmed on the Project RAID Log), real barcode scanning hardware or a phone-camera workflow wired in (still just typed lot IDs today), and operator/supervisor training. Those are tracked separately on the Project Plan.
