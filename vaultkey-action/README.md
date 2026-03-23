# vaultkey-action

GitHub Action for installing vaultkey and loading encrypted secrets into workflow environment variables.

## Usage

```yaml
- uses: bang9/ai-tools/vaultkey-action@v2
  with:
    gh-pat: ${{ secrets.VAULT_GH_PAT }}
    vault-repo: your-org/your-secrets-repo
    password: ${{ secrets.VAULTKEY_PASSWORD }}
    secrets: |
      CLOUDFLARE_API_TOKEN=cloudflare CLOUDFLARE_API_TOKEN
      DB_PASSWORD=myapp/prod DB_PASSWORD
```

## Inputs

| Input | Required | Default | Description |
|-------|----------|---------|-------------|
| `password` | Yes | — | Vault password (sets `VAULTKEY_PASSWORD` for subsequent steps) |
| `gh-pat` | No | — | GitHub PAT with read access to the vault repo |
| `vault-repo` | No | — | Vault repo (e.g. `your-org/your-secrets-repo`) |
| `vault-url` | No | `""` | Full git URL override for non-GitHub remotes |
| `secrets` | No | `""` | Secrets to load as env vars (see format below) |
| `version` | No | `latest` | vaultkey version to install |
| `skip-install` | No | `false` | Skip install and use existing vaultkey on PATH |

## Secrets Format

One secret per line: `ENV_NAME=scope KEY`

```yaml
secrets: |
  CLOUDFLARE_API_TOKEN=cloudflare CLOUDFLARE_API_TOKEN
  DB_PASSWORD=myapp/prod DB_PASSWORD
  JWT_SECRET=menulens/prod JWT_SECRET
```

Each secret is decrypted and exported as a masked GitHub environment variable.

## How It Works

1. Resolves and installs the vaultkey binary (with caching and checksum verification)
2. Sets `VAULTKEY_PASSWORD` as a masked environment variable
3. Clones the vault repo via `vaultkey init --ci`
4. Decrypts each requested secret and exports it as a masked env var
