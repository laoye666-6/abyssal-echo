import './ui/styles.css';
import { GameApp } from '@/app';

function boot(): void {
  const appRoot = document.getElementById('app');
  if (!appRoot) return;
  const canvas = document.createElement('canvas');
  canvas.className = 'game';
  appRoot.appendChild(canvas);

  const app = new GameApp(canvas);
  app.boot();
  // QA/调试句柄（不影响游戏逻辑）
  (window as unknown as { __app: GameApp }).__app = app;

  // 开发辅助：?seed=123 固定种子
  void new URLSearchParams(location.search);
}

boot();
