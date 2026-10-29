import React from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router-dom';
import { router } from './router.jsx';
import './styles.css';

class ErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { failed: false }; }
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error) { console.info('MAFIAS recovered from a rendering error:', error?.message); }
  render() {
    if (this.state.failed)
      return (
        <main className="crash">
          <p className="eyebrow"><span /> THE GRAVEYARD IS SLEEPING <span /></p>
          <h1>THE SHADOWS<br /><em>RESIST.</em></h1>
          <p className="copy">Something went wrong while rendering the experience.</p>
          <button className="enter" onClick={() => window.location.reload()}>RELOAD EXPERIENCE <b>→</b></button>
        </main>
      );
    return this.props.children;
  }
}

const rootEl = document.getElementById('root');
if (!rootEl) throw new Error('Missing #root');

createRoot(rootEl).render(
  <React.StrictMode>
    <ErrorBoundary>
      <RouterProvider router={router} />
    </ErrorBoundary>
  </React.StrictMode>
);
