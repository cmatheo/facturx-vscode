# Release automation setup

This project's versioning, changelog, and VS Code Marketplace publication are
automated by two chained GitHub Actions workflows:

- **`.github/workflows/ci.yml`** — runs on every push/PR: lint, format check, `tsc`,
  tests, and a packaging smoke test (`vsce package`, not published).
- **`.github/workflows/release-please.yml`** — runs on every push to `main`:
  - the `release-please` job maintains a standing "Release PR" that accumulates
    pending [Conventional Commits](https://www.conventionalcommits.org/) into a
    proposed version bump and `CHANGELOG.md` entry (this is
    [release-please](https://github.com/googleapis/release-please): it never
    publishes anything by itself, it only opens/updates that PR);
  - merging that PR creates a git tag and a GitHub Release, which triggers the
    `publish` job in the same workflow: it re-runs the full quality gate against the
    tagged commit, packages the `.vsix`, publishes it to the VS Code Marketplace, and
    attaches the `.vsix` to the GitHub Release.

Commit messages must follow Conventional Commits (`feat:`, `fix:`, `chore:`,
`feat!:`/`BREAKING CHANGE:` footer for a major bump, etc.) — this is enforced locally
by a commitlint `commit-msg` git hook (see below) and is what drives which part of
the semver release-please bumps automatically. `fix:` → patch, `feat:` → minor, a
breaking-change marker → major.

## One-time local setup (already done by `pnpm install`)

`pnpm install` runs `husky` via the `prepare` script, which installs two git hooks:

- **`pre-commit`**: runs `lint-staged` (ESLint `--fix` + Prettier on staged files),
  `tsc`, and the test suite.
- **`commit-msg`**: runs commitlint against the commit message.

Nothing else is needed to get the hooks working after a fresh clone.

## One-time Marketplace/Azure setup (must be done manually, by a maintainer)

Publishing uses **Microsoft Entra ID with workload identity federation** — no
Personal Access Token is stored anywhere, following Microsoft's current
[recommendation for secure automated publishing](https://code.visualstudio.com/api/working-with-extensions/publishing-extension#secure-automated-publishing-to-visual-studio-marketplace).
This requires a one-time setup that only a maintainer with access to the Azure
tenant and the Marketplace publisher account can perform — it cannot be scripted
from this repository.

1. **Create a user-assigned managed identity** in the Azure Portal (any subscription
   works, including a free one — this identity is never used to touch Azure
   resources, only to prove who's asking for a Marketplace publishing token). Note
   its **Client ID**, **Tenant ID**, and full **Resource ID**
   (`/subscriptions/<sub>/resourceGroups/<rg>/providers/Microsoft.ManagedIdentity/userAssignedIdentities/<name>`).

2. **Add a federated credential** on that managed identity (Azure Portal → the
   identity resource → _Federated credentials_ → _Add credential_), scoped to
   **GitHub Actions**, with:
   - Organization: `cmatheo`
   - Repository: `facturx-vscode`
   - Entity type: **Branch**, value `main` (the `publish` job only runs from a tag
     created off `main`, so a branch-scoped credential covers it; use an
     **Environment**-scoped credential instead if you want to gate publishing behind
     a required GitHub Environment reviewer).

3. **Authorize that identity on the Marketplace publisher**: go to
   `https://marketplace.visualstudio.com/manage/publishers/<your-publisher-id>`,
   and add the managed identity's Resource ID from step 1 as a manager with
   Contributor access.

4. **Add two repository secrets** (Settings → Secrets and variables → Actions) on
   `github.com/cmatheo/facturx-vscode`:
   - `AZURE_CLIENT_ID` — the managed identity's Client ID.
   - `AZURE_TENANT_ID` — the managed identity's Tenant ID.

   No `AZURE_SUBSCRIPTION_ID` secret is needed — the workflow logs in with
   `allow-no-subscriptions: true` since it never touches Azure Resource Manager.

5. **Set the real publisher id** in `package.json`'s `"publisher"` field (currently
   a placeholder, `TODO-set-your-marketplace-publisher-id`) to the id you registered
   in step 3.

Once all of the above is done, the very next Release PR merged on `main` will
publish automatically. Until then, the `publish` job will simply fail at the Azure
login step with a clear "credentials not found" error — `ci.yml` (lint/tests/package)
is unaffected either way.

## Publishing a `.vsix` manually (without the automation)

```sh
pnpm run package        # produces facturx-vscode.vsix locally
```
