# Export AetherControl scaffold to your laptop

## 1. Create an export archive in this environment

```bash
./scripts/export_aethercontrol.sh
```

This creates a tarball under `exports/` with all AetherControl scaffold files.

## 2. Copy to your laptop

Use `scp` from your laptop and replace host, user, and path:

```bash
scp user@your-server:/path/to/AetherControl/exports/aethercontrol-scaffold-*.tar.gz .
```

## 3. Extract locally

```bash
mkdir -p AetherControl
cd AetherControl
tar -xzf ../aethercontrol-scaffold-*.tar.gz
```

## 4. Put it in your new GitHub repo

```bash
git init
git add .
git commit -m "bootstrap AetherControl scaffold"
git remote add origin git@github.com:joaquimpsoares/AetherControl.git
git push -u origin main
```

## Better option

Instead of tar and scp, run Codex directly in a local clone of `joaquimpsoares/AetherControl` so all changes go to the correct repository from the start.
