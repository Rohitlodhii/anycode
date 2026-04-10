import chokidar from 'chokidar';
import type { BrowserWindow } from 'electron';

export class FileWatcher {
  private watchers = new Map<string, chokidar.FSWatcher>();

  watchProject(projectPath: string, window: BrowserWindow): void {
    if (this.watchers.has(projectPath)) {
      return;
    }

    const watcher = chokidar.watch(projectPath, {
      ignored: [/(^|[/\\])\../, /node_modules/],
      persistent: true,
      ignoreInitial: true,
    });

    watcher.on('change', (filePath: string) => {
      window.webContents.send('file:changed', { path: filePath });
    });

    this.watchers.set(projectPath, watcher);
  }

  unwatchProject(projectPath: string): void {
    const watcher = this.watchers.get(projectPath);
    if (watcher) {
      watcher.close();
      this.watchers.delete(projectPath);
    }
  }
}
