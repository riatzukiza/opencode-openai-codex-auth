# Review Response CLI Installation Fix

## Context
- The review-response workflow (`.github/workflows/review-response.yml:36-40`) installs the OpenCode CLI via `curl -fsSL https://opencode.ai/install.sh | sh`. That install script now returns HTTP 404, leaving the runner without the `opencode` binary and causing downstream steps to fail (`opencode run ...` in lines 52-60 cannot execute).
- User request: "do a global node module install" so that the automation can rely on npm to fetch the CLI instead of a missing shell script.
- Affected documentation: `spec/review-response-automation.md:35-44` still states "Install OpenCode CLI via official install script".

## Definition of Done
1. Update `.github/workflows/review-response.yml` so the "Install OpenCode CLI" step installs the CLI via a global Node module (`npm install -g opencode`) and guarantees the binary path is added to `$PATH` (`$GITHUB_PATH`).
2. Ensure the workflow still sets up Node 22 first, then installs the CLI, and that the rest of the job uses the same binary.
3. Update `spec/review-response-automation.md` (and any other docs referencing the old install script) to mention the npm global install method.
4. Optionally add a quick sanity check (e.g., `opencode --version`) in the workflow step to surface install issues early.
5. Confirm no other files still reference the defunct install script URL.
