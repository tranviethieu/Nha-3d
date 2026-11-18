import { useEffect, useState } from 'react';

export function Toast({ toast }: { toast: { text: string; id: number } | null }) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (!toast) return;
    setVisible(true);
    const t = setTimeout(() => setVisible(false), 1600);
    return () => clearTimeout(t);
  }, [toast]);
  return <div className="panel toast" style={{ opacity: visible ? 1 : 0 }}>{toast?.text}</div>;
}
