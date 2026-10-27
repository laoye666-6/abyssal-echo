import './ui/styles.css';
import { GameApp } from '@/app';
import { TouchControls } from '@/ui/touch';
import { MobileGuard } from '@/ui/mobile';

function boot(): void {
  const appRoot = document.getElementById('app');
  if (!appRoot) return;
  const canvas = document.createElement('canvas');
  canvas.className = 'game';
  appRoot.appendChild(canvas);

  const app = new GameApp(canvas);
  app.boot();
  // 移动端触屏控制（桌面自动禁用）
  void new TouchControls(
    app.input,
    appRoot,
    () => {
      if (app.mode === 'running') app.pause();
    },
    () => app.mode === 'running',
  );
  // 移动端加固：横屏提示 + 禁长按菜单
  new MobileGuard(app);
  // QA/调试句柄（不影响游戏逻辑）
  (window as unknown as { __app: GameApp }).__app = app;

  // 开发辅助：?seed=123 固定种子
  void new URLSearchParams(location.search);
}

boot();
