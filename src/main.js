const { app, BrowserWindow, ipcMain, dialog, shell, Menu } = require('electron');
const path = require('path');
const fs = require('fs');
const { simpleGit } = require('simple-git');
const chokidar = require('chokidar');

let mainWindow;
let activeWatcher = null;

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1300,
        height: 850,
        minWidth: 900,
        minHeight: 600,
        title: 'LiveGit',
        backgroundColor: '#0d1117',
        frame: false,
        titleBarStyle: 'hidden',
        trafficLightPosition: { x: 16, y: 16 },
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false
        }
    });

    mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));
    mainWindow.on('closed', () => { mainWindow = null; });
}

app.whenReady().then(createWindow);
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (!mainWindow) createWindow(); });

ipcMain.handle('window:minimize', () => mainWindow?.minimize());
ipcMain.handle('window:maximize', () => {
    if (mainWindow?.isMaximized()) mainWindow.unmaximize();
    else mainWindow?.maximize();
});
ipcMain.handle('window:close', () => mainWindow?.close());
ipcMain.handle('window:isMaximized', () => mainWindow?.isMaximized());

ipcMain.handle('dialog:openFolder', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
        properties: ['openDirectory'],
        title: 'Git-Repository wahlen'
    });
    if (result.canceled) return null;
    return result.filePaths[0];
});

ipcMain.handle('git:open', async (_, repoPath) => {
    if (!repoPath || !fs.existsSync(repoPath)) {
        return { error: 'Pfad existiert nicht' };
    }
    if (!fs.existsSync(path.join(repoPath, '.git'))) {
        return { error: 'Kein Git-Repository an diesem Pfad' };
    }

    try {
        const git = simpleGit(repoPath);
        const [log, status, branches, remotes] = await Promise.all([
            git.log(['--all', '--max-count=200']),
            git.status(),
            git.branch(['-a']),
            git.getRemotes(true)
        ]);

        let pushedHashes = new Set();
        let localOnlyHashes = new Set();
        try {
            const tracking = status.tracking;
            if (tracking) {
                const mergeBase = (await git.raw(['merge-base', tracking, 'HEAD'])).trim();
                const remoteCommits = (await git.raw(['rev-list', tracking])).trim().split('\n').filter(Boolean);
                pushedHashes = new Set(remoteCommits);
                const localCommits = (await git.raw(['rev-list', 'HEAD'])).trim().split('\n').filter(Boolean);
                for (const h of localCommits) {
                    if (!pushedHashes.has(h)) localOnlyHashes.add(h);
                }
            } else {
                const allCommits = (await git.raw(['rev-list', 'HEAD'])).trim().split('\n').filter(Boolean);
                for (const h of allCommits) localOnlyHashes.add(h);
            }
        } catch(e) {}

        if (activeWatcher) { await activeWatcher.close(); activeWatcher = null; }

        activeWatcher = chokidar.watch(repoPath, {
            ignored: [
                '**/node_modules/**', '**/.git/**', '**/dist/**',
                '**/build/**', '**/.next/**', '**/__pycache__/**',
                '**/.cache/**', '**/*.log'
            ],
            persistent: true,
            ignoreInitial: true,
            awaitWriteFinish: { stabilityThreshold: 250, pollInterval: 80 }
        });

        activeWatcher.on('all', (event, filePath) => {
            const rel = path.relative(repoPath, filePath).replace(/\\/g, '/');
            if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send('live:change', {
                    event, file: rel, timestamp: new Date().toISOString()
                });
            }
        });

        return {
            success: true,
            path: repoPath,
            log: log.all.map(c => ({
                hash: c.hash,
                hashShort: c.hash.substring(0, 7),
                message: c.message,
                author: c.author_name,
                email: c.author_email,
                date: c.date,
                refs: c.refs || '',
                pushed: pushedHashes.has(c.hash),
                localOnly: localOnlyHashes.has(c.hash)
            })),
            status: {
                current: status.current,
                tracking: status.tracking,
                staged: status.staged || [],
                modified: status.modified || [],
                created: status.created || [],
                deleted: status.deleted || [],
                conflicted: status.conflicted || [],
                renamed: status.renamed || [],
                ahead: status.ahead,
                behind: status.behind
            },
            branches: branches.all,
            currentBranch: branches.current,
            remotes: remotes.map(r => ({ name: r.name, refs: r.refs.fetch || r.refs.push || '' }))
        };
    } catch (err) {
        return { error: err.message };
    }
});

ipcMain.handle('git:commitDiff', async (_, repoPath, hash) => {
    try {
        const git = simpleGit(repoPath);
        const diff = await git.show([hash, '--stat=200', '--patch']);
        return { diff };
    } catch (err) {
        return { error: err.message };
    }
});

ipcMain.handle('git:fileDiff', async (_, repoPath, filePath) => {
    try {
        const git = simpleGit(repoPath);
        const diff = await git.diff(['--', filePath]);
        return { diff: diff || '' };
    } catch (err) {
        return { error: err.message };
    }
});

ipcMain.handle('git:fileContent', async (_, repoPath, filePath) => {
    try {
        const full = path.join(repoPath, filePath);
        if (!fs.existsSync(full)) return { error: 'Datei nicht gefunden', content: '' };
        const stat = fs.statSync(full);
        if (stat.isDirectory()) return { error: 'Verzeichnis', content: '' };
        if (stat.size > 500000) return { error: 'Datei zu gross', content: '' };
        return { content: fs.readFileSync(full, 'utf8') };
    } catch (err) {
        return { error: err.message, content: '' };
    }
});

ipcMain.handle('git:fileTree', async (_, repoPath) => {
    try {
        const git = simpleGit(repoPath);
        const files = await git.raw(['ls-files']);
        return { files: files.trim().split('\n').filter(Boolean) };
    } catch (err) {
        return { error: err.message, files: [] };
    }
});

ipcMain.handle('git:refreshStatus', async (_, repoPath) => {
    try {
        const git = simpleGit(repoPath);
        const status = await git.status();
        return {
            current: status.current,
            tracking: status.tracking,
            staged: status.staged || [],
            modified: status.modified || [],
            created: status.created || [],
            deleted: status.deleted || [],
            conflicted: status.conflicted || [],
            renamed: status.renamed || [],
            ahead: status.ahead,
            behind: status.behind
        };
    } catch (err) {
        return { error: err.message };
    }
});

ipcMain.handle('shell:showInFolder', (_, fullPath) => {
    shell.showItemInFolder(fullPath);
});

ipcMain.handle('shell:openPath', (_, fullPath) => {
    shell.openPath(fullPath);
});

ipcMain.handle('shell:openExternal', (_, url) => {
    shell.openExternal(url);
});

ipcMain.handle('git:diffStats', async (_, repoPath, filePath) => {
    try {
        const git = simpleGit(repoPath);
        const diff = await git.diff(['--numstat', '--', filePath]);
        if (!diff.trim()) return { adds: 0, dels: 0 };
        const parts = diff.trim().split('\t');
        return { adds: parseInt(parts[0]) || 0, dels: parseInt(parts[1]) || 0 };
    } catch (err) {
        return { adds: 0, dels: 0, error: err.message };
    }
});

ipcMain.handle('context:menu', (_, options) => {
    return new Promise((resolve) => {
        const items = options.map(o => ({
            label: o.label,
            click: () => resolve(o.id)
        }));
        const menu = Menu.buildFromTemplate(items);
        menu.popup({ window: mainWindow });
        menu.on('menu-will-close', () => {
            setTimeout(() => resolve(null), 100);
        });
    });
});
