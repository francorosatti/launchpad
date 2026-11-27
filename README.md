# Launchpad

Local dashboard to track which GitHub repositories need to be deployed to QA or Production.

Shows branch comparison status across your repos at a glance:
- **QA deploys needed**: `development` branch is ahead of `qa`
- **Production deploys needed**: `qa` branch is ahead of `master`

Each pending deploy links directly to the GitHub compare view so you can review the changes.

## Prerequisites

- [Node.js](https://nodejs.org/) 18+
- [GitHub CLI](https://cli.github.com/) (`gh`) installed and authenticated

Verify both are ready:

```bash
node --version    # v18+
gh auth status    # should show ✓ Logged in
```

## Installation

```bash
git clone git@github.com:francorosatti/launchpad.git
cd launchpad
npm install
```

## Running

### Manual

```bash
npm start
```

Open http://localhost:3033 in your browser.

### Auto-start on login

<details>
<summary><strong>Linux (systemd)</strong></summary>

1. Edit `launchpad.service` and update `WorkingDirectory` to match your clone path and the `PATH` environment variable to include the directory where `gh` is installed:

   ```ini
   WorkingDirectory=/path/to/your/launchpad
   Environment=PATH=/your/gh/bin/dir:/usr/local/bin:/usr/bin:/bin
   ```

   Find your `gh` path with `which gh`.

2. Install and enable the service:

   ```bash
   mkdir -p ~/.config/systemd/user
   cp launchpad.service ~/.config/systemd/user/
   systemctl --user daemon-reload
   systemctl --user enable launchpad.service
   systemctl --user start launchpad.service
   ```

3. Verify it's running:

   ```bash
   systemctl --user status launchpad.service
   ```

</details>

<details>
<summary><strong>macOS (launchd)</strong></summary>

1. Create the plist file:

   ```bash
   cat > ~/Library/LaunchAgents/com.launchpad.plist << 'EOF'
   <?xml version="1.0" encoding="UTF-8"?>
   <!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
   <plist version="1.0">
   <dict>
     <key>Label</key>
     <string>com.launchpad</string>
     <key>ProgramArguments</key>
     <array>
       <string>/usr/local/bin/node</string>
       <string>server.js</string>
     </array>
     <key>WorkingDirectory</key>
     <string>/path/to/your/launchpad</string>
     <key>EnvironmentVariables</key>
     <dict>
       <key>NODE_ENV</key>
       <string>production</string>
     </dict>
     <key>RunAtLoad</key>
     <true/>
     <key>KeepAlive</key>
     <true/>
     <key>StandardOutPath</key>
     <string>/tmp/launchpad.log</string>
     <key>StandardErrorPath</key>
     <string>/tmp/launchpad.err</string>
   </dict>
   </plist>
   EOF
   ```

2. Update the plist with your paths:
   - Set `WorkingDirectory` to your clone path
   - Set the node path to the output of `which node`

3. Load and start the service:

   ```bash
   launchctl load ~/Library/LaunchAgents/com.launchpad.plist
   ```

4. Verify it's running:

   ```bash
   launchctl list | grep launchpad
   ```

To stop and unload:

```bash
launchctl unload ~/Library/LaunchAgents/com.launchpad.plist
```

</details>

<details>
<summary><strong>Windows (Task Scheduler)</strong></summary>

1. Open **Task Scheduler** (`taskschd.msc`)

2. Click **Create Task** (not "Create Basic Task")

3. **General** tab:
   - Name: `Launchpad`
   - Check "Run only when user is logged on"

4. **Triggers** tab:
   - Click **New**, set "Begin the task" to **At log on**

5. **Actions** tab:
   - Click **New**
   - Action: **Start a program**
   - Program/script: `node` (or the full path from `where node`)
   - Add arguments: `server.js`
   - Start in: `C:\path\to\your\launchpad`

6. Click **OK** to save

Alternatively, use PowerShell:

```powershell
$action = New-ScheduledTaskAction -Execute "node" -Argument "server.js" -WorkingDirectory "C:\path\to\your\launchpad"
$trigger = New-ScheduledTaskTrigger -AtLogOn
Register-ScheduledTask -TaskName "Launchpad" -Action $action -Trigger $trigger -Description "GitHub deploy status dashboard"
```

To verify, run `npm start` manually first, then check http://localhost:3033.

</details>

The dashboard will be available at http://localhost:3033 every time you log in.

### App menu shortcut (optional)

On **Linux**, you can add Launchpad to your application menu. The shortcut starts the service automatically if it's not running, then opens the dashboard in your browser.

1. Edit `launchpad.desktop` and update the `Icon` path to match your clone location:

   ```ini
   Icon=/path/to/your/launchpad/public/icon.png
   ```

2. Install the shortcut:

   ```bash
   cp launchpad.desktop ~/.local/share/applications/
   ```

## Usage

1. On first visit, you'll be redirected to **Settings**
2. Select your GitHub organization from the dropdown
3. Pick which repositories to follow (use the search box to filter)
4. Click **Save** — you'll land on the dashboard
5. Hit **Refresh** anytime to fetch the latest branch status

### Fixing vulnerabilities with Claude Code

Repos with open Dependabot alerts are pre-selected in the first column. Adjust the selection, then click **Fix vulnerabilities**. A dialog shows the prompt Claude will get (one line per repo, plus the steps: pull `qa`, create a worktree, `npm audit fix`, handle remaining alerts, ask before major upgrades, lint/test, rebase, open a PR).

The prompt also includes safeguards learned from earlier runs:
- npm runs with `NODE_ENV=development`, so dev-only alerts aren't hidden by a shell set to production.
- `npm ls` is diffed after every change, so a major version pulled in by a patch or minor bump of its parent still counts as a major and waits for your approval. Nothing is pushed while an approval is pending.
- Lint and tests run in a copy outside the repo folder, so a nested worktree can't load the main checkout's `node_modules`.
- Before each PR, every open alert is checked against `package-lock.json`, and the coordinating session repeats that check instead of trusting the subagent's report. Edit it if needed, for example to note that a repo is a shared library, then click **Launch Claude Code**.

Repos listed under **Shared libraries** in Settings (for example `forward-kafka-integrator`) are handled first: Claude fixes the library, opens its PR with a conventional `fix(deps)` commit, and waits for you to merge and release it. It then updates the other selected repos to the new version in their own fixes.

Launchpad opens a new terminal window in your local repositories folder running an interactive `claude` session with that prompt. You approve major upgrades and answer questions in that window.

Requirements:
- [Claude Code](https://docs.claude.com/en/docs/claude-code) (`claude`) installed. Launchpad looks in `PATH`, then `~/.local/bin`, `~/.claude/local`, `/usr/local/bin` and `/opt/homebrew/bin`.
- A terminal it can open: `terminator` (preferred), `gnome-terminal` or `x-terminal-emulator` on Linux, Terminal.app on macOS. When running as a systemd service, the user manager needs `DISPLAY` (GNOME sets this for you; check with `systemctl --user show-environment`).
- The repos cloned under the local repositories folder (default `~/Documents/github`, configurable in **Settings**). The dialog warns about selected repos that aren't cloned there.

## Configuration

Settings are stored in `config.json` (gitignored). To change your org or repos, visit http://localhost:3033/settings.

To use a different port, set the `PORT` environment variable:

```bash
PORT=4000 npm start
```
