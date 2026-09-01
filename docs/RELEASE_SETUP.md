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
This isn't just the more secure option: **Azure DevOps is retiring global PATs on
December 1, 2026** ([announcement](https://devblogs.microsoft.com/devops/retirement-of-global-personal-access-tokens-in-azure-devops/)),
and the VS Code Marketplace runs on Azure DevOps under the hood, so PAT-based
`vsce publish` is being phased out regardless.

This requires a one-time setup that only a maintainer with access to the Azure
tenant and the Marketplace publisher account can perform — it cannot be scripted
from this repository. Microsoft's own walkthrough
([publishing-extension.md](https://code.visualstudio.com/api/working-with-extensions/publishing-extension#secure-automated-publishing-to-visual-studio-marketplace))
is written for Azure DevOps Pipelines specifically (it talks about "Service
Connections", an Azure DevOps-only concept); the steps below are the GitHub
Actions equivalent, cross-checked against a
[practitioner writeup from July 2026](https://www.emrecodes.net/posts/2026/07/10/vscode-marketplace-managed-identity.html)
that hit and documented the one genuinely undocumented gotcha (step 4 below).

1. **Create a user-assigned managed identity.** Azure Portal → search **"Managed
   Identities"** (not the generic "create a resource" flow) → **Create**. Any
   subscription works (a free one is fine — this identity never touches Azure
   resources, it only proves who's asking for a Marketplace publishing token) and
   any region. Name it something recognizable, e.g. `vscode-publisher`. Once
   created, open the resource and note its **Client ID** and **Tenant ID** (under
   _Overview_/_Properties_).

2. **Add a federated credential** on that managed identity: the identity resource →
   **Settings → Federated credentials → + Add credential**. Choose scenario
   **"GitHub Actions deploying Azure resources"**, then:
   - Organization: `cmatheo`
   - Repository: `facturx-vscode`
   - Entity type: **Environment** (not Branch/Tag — an environment-scoped
     credential doesn't need updating every time you cut a release off a
     different ref, and it lets you later add a required-reviewer protection
     rule on the GitHub side without touching Azure again)
   - GitHub environment name: `marketplace-publish`

3. **Create the matching GitHub Environment**: this repo's Settings →
   Environments → **New environment** → name it exactly `marketplace-publish`
   (must match step 2). No protection rules are required for it to work, but this
   is the natural place to add a required reviewer later if you want a manual
   approval gate before every publish.

4. **Add two repository secrets** (Settings → Secrets and variables → Actions):
   - `AZURE_CLIENT_ID` — the managed identity's Client ID.
   - `AZURE_TENANT_ID` — the managed identity's Tenant ID.

   No `AZURE_SUBSCRIPTION_ID` secret is needed — the workflow logs in with
   `allow-no-subscriptions: true` since it never touches Azure Resource Manager.

5. **Find the Marketplace-specific identity ID (the actual gotcha).** The
   Marketplace publisher's member list is backed by Azure DevOps identities, which
   are _not_ the same as the managed identity's Azure Resource ID — you need a
   separate ID that only appears by asking Azure DevOps's own profile API "who am
   I", authenticated as the managed identity. There's no portal page for this; you
   have to call it once:

   Temporarily add a throwaway workflow, e.g. `.github/workflows/debug-identity.yml`:

   ```yaml
   name: Debug Identity
   on: workflow_dispatch
   permissions:
     id-token: write
     contents: read
   jobs:
     debug:
       runs-on: ubuntu-latest
       environment: marketplace-publish
       steps:
         - uses: azure/login@v2
           with:
             client-id: ${{ secrets.AZURE_CLIENT_ID }}
             tenant-id: ${{ secrets.AZURE_TENANT_ID }}
             allow-no-subscriptions: true
         - run: az rest -u https://app.vssps.visualstudio.com/_apis/profile/profiles/me --resource 499b84ac-1321-427f-aa17-267ca6975798
   ```

   Push it, run it from the **Actions** tab → _Debug Identity_ → **Run workflow**,
   and copy the `id` field from the JSON printed in the log (not `publicAlias`,
   though they're the same value; the `499b84ac-...` GUID is Azure DevOps's own
   Entra app ID, not a secret — it's fine to leave in the workflow). Then **delete
   this workflow file** — it's a one-time lookup tool, not part of the release
   pipeline.

6. **Authorize that identity on the Marketplace publisher**: go to
   `https://marketplace.visualstudio.com/manage`, select your publisher, open the
   **Members** section → **Add**, paste the ID from step 5 into the search field,
   and set its role to **Contributor**.

7. **Set the real publisher id** in `package.json`'s `"publisher"` field (currently
   a placeholder, `TODO-set-your-marketplace-publisher-id`) to the id you
   registered when you created the publisher on Marketplace.

Once all of the above is done, the very next Release PR merged on `main` will
publish automatically. Until then, the `publish` job will simply fail at the Azure
login step with a clear "credentials not found" error — `ci.yml` (lint/tests/package)
is unaffected either way.

## Publishing a `.vsix` manually (without the automation)

```sh
pnpm run package        # produces facturx-vscode.vsix locally
```
