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
window.addEventListener('error', (e) => showFatal(e.error || e.message));
window.addEventListener('unhandledrejection', (e) => showFatal(e.reason));
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
