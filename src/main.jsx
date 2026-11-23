import { Component, StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import './styles.css';

// Shows what went wrong instead of a blank screen, so problems on a phone
// can be read off the screen and reported.
class ErrorBoundary extends Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <main className="screen">
        <h1 className="h2">Something went wrong</h1>
        <pre style={{ whiteSpace: 'pre-wrap', color: 'var(--red-soft)', fontSize: 13 }}>
          {String(this.state.error?.stack || this.state.error)}
        </pre>
        <button className="btn" onClick={() => window.location.reload()}>Reload</button>
      </main>
    );
  }
}

// Errors outside React (e.g. while opening the socket) show up too.
// Only FrameIt's own errors are shown. Browser extensions and other
// third-party scripts on the page raise errors too; browsers report those
// as a bare "Script error." with no details, and they aren't ours to show.
const fromOurCode = (filename) => {
  if (!filename) return false;
  try {
    return new URL(filename, window.location.href).origin === window.location.origin;
  } catch {
    return false;
  }
};
window.addEventListener('error', (e) => {
  if (!e.error || e.message === 'Script error.' || !fromOurCode(e.filename)) {
    console.warn('Ignored an error from outside FrameIt:', e.message);
    return;
  }
  showFatal(e.error);
});
window.addEventListener('unhandledrejection', (e) => {
  // Rejections carry no source file; only show real Error objects whose
  // stack points at our own code.
  const stack = e.reason?.stack || '';
  if (!(e.reason instanceof Error) || !stack.includes(window.location.origin)) {
    console.warn('Ignored a rejection from outside FrameIt:', e.reason);
    return;
  }
  showFatal(e.reason);
});
function showFatal(err) {
  if (document.getElementById('fatal')) return;
  const el = document.createElement('pre');
  el.id = 'fatal';
  el.style.cssText = 'position:fixed;left:8px;right:8px;bottom:8px;z-index:99;white-space:pre-wrap;font-size:12px;background:#3a1a2a;color:#ffdce6;padding:10px;border-radius:10px';
  el.textContent = `Error: ${err?.stack || err}`;
  el.onclick = () => el.remove();
  document.body.appendChild(el);
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>
);
