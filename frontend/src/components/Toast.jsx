import { useEffect } from 'react';

const STYLES = {
  success: { border: '1px solid rgba(16,185,129,0.5)', background: 'rgba(16,185,129,0.12)', color: '#6ee7b7' },
  warning: { border: '1px solid rgba(245,158,11,0.5)', background: 'rgba(245,158,11,0.12)', color: '#fcd34d' },
  error:   { border: '1px solid rgba(239,68,68,0.5)',  background: 'rgba(239,68,68,0.12)',  color: '#fca5a5' },
};

export default function Toast({ msg, type, onHide }) {
  useEffect(() => {
    if (!msg) return;
    const t = setTimeout(onHide, 4000);
    return () => clearTimeout(t);
  }, [msg, onHide]);

  if (!msg) return null;

  return (
    <div style={{
      position: 'fixed', bottom: '28px', right: '28px', zIndex: 999,
      display: 'flex', alignItems: 'center', gap: '12px',
      padding: '14px 20px', borderRadius: '14px',
      backdropFilter: 'blur(16px)',
      fontSize: '13px', fontWeight: 500,
      maxWidth: '360px', boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
      ...STYLES[type || 'success'],
    }}>
      {msg}
    </div>
  );
}