import React from 'react';

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('[ErrorBoundary]', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          minHeight: '100vh',
          display: 'grid',
          placeItems: 'center',
          background: '#050505',
          color: '#f1eef9',
          fontFamily: 'Inter, system-ui, sans-serif',
          padding: '20px'
        }}>
          <div style={{
            maxWidth: 480,
            textAlign: 'center',
            background: '#0e0e10',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 16,
            padding: 32
          }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>⚠️</div>
            <h2 style={{ margin: '0 0 8px', fontSize: 20 }}>Terjadi Kesalahan</h2>
            <p style={{ margin: '0 0 20px', color: '#b6acd5', fontSize: 14 }}>
              Aplikasi mengalami error yang tidak terduga. Silakan refresh halaman.
            </p>
            <button
              onClick={() => window.location.reload()}
              style={{
                padding: '10px 24px',
                borderRadius: 8,
                border: '1px solid rgba(105,97,208,0.4)',
                background: 'linear-gradient(135deg, #6961D0, #443C9F)',
                color: '#fff',
                fontWeight: 700,
                cursor: 'pointer',
                fontSize: 14
              }}
            >
              Refresh Halaman
            </button>
            {this.state.error && (
              <details style={{ marginTop: 16, textAlign: 'left' }}>
                <summary style={{ cursor: 'pointer', color: '#6e6589', fontSize: 12 }}>
                  Detail Error
                </summary>
                <pre style={{
                  marginTop: 8,
                  padding: 12,
                  background: '#161618',
                  borderRadius: 8,
                  fontSize: 11,
                  color: '#E24B4A',
                  overflow: 'auto',
                  maxHeight: 200
                }}>
                  {this.state.error.message}
                  {'\n'}
                  {this.state.error.stack}
                </pre>
              </details>
            )}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
