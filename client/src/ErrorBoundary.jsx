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
          background: '#f6f7f9',
          color: '#14181f',
          fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
          padding: '20px'
        }}>
          <div style={{
            maxWidth: 480,
            textAlign: 'center',
            background: '#ffffff',
            border: '1px solid #e4e7ec',
            borderRadius: 12,
            padding: 32,
            boxShadow: '0 1px 2px rgba(16,24,40,0.05)'
          }}>
            <div style={{
              width: 52, height: 52, margin: '0 auto 16px', borderRadius: 14,
              display: 'grid', placeItems: 'center',
              background: '#fdecec', color: '#dc2626', fontSize: 26
            }}>⚠️</div>
            <h2 style={{ margin: '0 0 8px', fontSize: 20 }}>Terjadi Kesalahan</h2>
            <p style={{ margin: '0 0 20px', color: '#8a919e', fontSize: 14 }}>
              Aplikasi mengalami error yang tidak terduga. Silakan refresh halaman.
            </p>
            <button
              onClick={() => window.location.reload()}
              style={{
                padding: '10px 24px',
                borderRadius: 9,
                border: '1px solid #4f46e5',
                background: '#4f46e5',
                color: '#fff',
                fontWeight: 600,
                cursor: 'pointer',
                fontSize: 14,
                fontFamily: 'inherit'
              }}
            >
              Refresh Halaman
            </button>
            {this.state.error && (
              <details style={{ marginTop: 16, textAlign: 'left' }}>
                <summary style={{ cursor: 'pointer', color: '#8a919e', fontSize: 12 }}>
                  Detail Error
                </summary>
                <pre style={{
                  marginTop: 8,
                  padding: 12,
                  background: '#f6f7f9',
                  border: '1px solid #e4e7ec',
                  borderRadius: 8,
                  fontSize: 11,
                  color: '#dc2626',
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
