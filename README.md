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

On **Linux**, you can add Launchpad to your application menu so it opens in your default browser:

```bash
cat > ~/.local/share/applications/launchpad.desktop << EOF
[Desktop Entry]
Name=Launchpad
Comment=GitHub deploy status dashboard
Exec=xdg-open http://localhost:3033
Type=Application
Categories=Development;
Icon=/path/to/your/launchpad/public/icon.svg
StartupNotify=false
EOF
```

Update the `Icon` path to match your clone location.

## Usage

1. On first visit, you'll be redirected to **Settings**
2. Select your GitHub organization from the dropdown
3. Pick which repositories to follow (use the search box to filter)
4. Click **Save** — you'll land on the dashboard
5. Hit **Refresh** anytime to fetch the latest branch status

## Configuration

Settings are stored in `config.json` (gitignored). To change your org or repos, visit http://localhost:3033/settings.

To use a different port, set the `PORT` environment variable:

```bash
PORT=4000 npm start
```
