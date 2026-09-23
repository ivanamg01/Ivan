// @ts-nocheck
import React, { useState, useRef, useEffect } from 'react';
import {
  Camera, Copy, ExternalLink, Clock, ChevronLeft, Check,
  Trash2, Image as ImageIcon, AlertCircle, Download,
  BarChart3, MessageSquare, Crown, TrendingDown, Lock, Layers, Sparkles, Search,
  Sofa, Bike, Laptop, Lamp, DollarSign, ChevronRight, Share2, MessageCircle,
} from 'lucide-react';

const COLORS = {
  bgFrom: '#EAF3EC',
  bgTo: '#E1E6F1',
  ink: '#10182B',
  inkSoft: '#4B5468',
  muted: '#6B7280',
  green: '#1C7C54',
  greenSoft: '#E3F2E9',
  card: '#FFFFFF',
  border: '#DFE4EA',
  danger: '#B3432B',
  dangerSoft: '#FBEAE6',
};

const FONT = "'Manrope', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
const FREE_SCAN_LIMIT = 3;

const LOADING_MESSAGES = [
  'Identificando el artículo…',
  'Evaluando el estado…',
  'Buscando precios reales del mercado…',
  'Redactando el anuncio…',
];

const MONTH_LABELS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

function resizeImage(file, maxDim = 1024, quality = 0.82) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('No se pudo leer la imagen'));
    reader.onload = (e) => {
      const img = new Image();
      img.onerror = () => reject(new Error('Imagen no válida'));
      img.onload = () => {
        let width = img.width;
        let height = img.height;
        if (width > height && width > maxDim) {
          height = Math.round((height * maxDim) / width);
          width = maxDim;
        } else if (height >= width && height > maxDim) {
          width = Math.round((width * maxDim) / height);
          height = maxDim;
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

const SERVER_URL = 'https://rev-production-bf0d.up.railway.app';

async function analyzeItem(dataUrl) {
  const base64 = dataUrl.split(',')[1];
  const response = await fetch(`${SERVER_URL}/api/analyze-item`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ imageBase64: base64 }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'No se pudo conectar con el servidor.');
  return data;
}

async function analyzeForPurchase(dataUrl) {
  const base64 = dataUrl.split(',')[1];
  const response = await fetch(`${SERVER_URL}/api/analyze-purchase`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ imageBase64: base64 }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'No se pudo conectar con el servidor.');
  return data;
}

async function suggestNegotiationReply(itemContext, buyerMessage) {
  const response = await fetch(`${SERVER_URL}/api/negotiate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ itemContext, buyerMessage }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'No se pudo conectar con el servidor.');
  return (data.reply || '').trim();
}

async function suggestPriceDrop(item) {
  const response = await fetch(`${SERVER_URL}/api/price-drop`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      title: item.title,
      category: item.category,
      condition: item.condition,
      currency: item.currency,
      price: item.price,
    }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'No se pudo conectar con el servidor.');
  return (data.suggestion || '').trim();
}

function monthKey(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  return `usage:${y}-${m}`;
}

async function getScanCount() {
  try {
    const r = await window.storage.get(monthKey(), false);
    return r && r.value ? parseInt(r.value, 10) || 0 : 0;
  } catch (e) {
    return 0;
  }
}

async function incrementScanCount() {
  try {
    const current = await getScanCount();
    await window.storage.set(monthKey(), String(current + 1), false);
  } catch (e) {
    // best-effort
  }
}

async function getPremiumStatus() {
  try {
    const r = await window.storage.get('account:premium', false);
    return !!r && r.value === 'true';
  } catch (e) {
    return false;
  }
}

async function setPremiumStatus(value) {
  try {
    await window.storage.set('account:premium', value ? 'true' : 'false', false);
  } catch (e) {
    // best-effort
  }
}

async function saveToHistory(listing) {
  try {
    const key = `listing:${Date.now()}:${Math.random().toString(36).slice(2, 7)}`;
    await window.storage.set(key, JSON.stringify(listing), false);
  } catch (e) {
    // best-effort
  }
}

async function loadHistory() {
  try {
    const listResult = await window.storage.list('listing:', false);
    const keys = (listResult && listResult.keys) || [];
    const items = [];
    for (const k of keys) {
      try {
        const r = await window.storage.get(k, false);
        if (r && r.value) items.push({ storageKey: k, ...JSON.parse(r.value) });
      } catch (e) {
        // skip corrupt entry
      }
    }
    items.sort((a, b) => (b.date || 0) - (a.date || 0));
    return items;
  } catch (e) {
    return [];
  }
}

async function updateHistoryItem(key, patch) {
  try {
    const r = await window.storage.get(key, false);
    if (!r || !r.value) return;
    const current = JSON.parse(r.value);
    await window.storage.set(key, JSON.stringify({ ...current, ...patch }), false);
  } catch (e) {
    // best-effort
  }
}

async function deleteHistoryItem(key) {
  try {
    await window.storage.delete(key, false);
  } catch (e) {
    // best-effort
  }
}

function TopBar({ title, onBack, right }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 24px 8px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 32 }}>
        {onBack && (
          <button onClick={onBack} aria-label="Volver" style={iconButtonStyle}>
            <ChevronLeft size={20} color={COLORS.ink} />
          </button>
        )}
      </div>
      <div style={{ fontWeight: 700, fontSize: 15, color: COLORS.ink, letterSpacing: '-0.01em' }}>{title}</div>
      <div style={{ minWidth: 32, display: 'flex', justifyContent: 'flex-end' }}>{right}</div>
    </div>
  );
}

const iconButtonStyle = {
  width: 36,
  height: 36,
  borderRadius: 999,
  border: 'none',
  background: 'rgba(16,24,43,0.06)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  cursor: 'pointer',
};

function PrimaryButton({ children, onClick, disabled, style }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        width: '100%',
        padding: '17px 20px',
        borderRadius: 999,
        border: 'none',
        background: disabled ? '#B7BEC9' : COLORS.ink,
        color: '#FFFFFF',
        fontFamily: FONT,
        fontWeight: 700,
        fontSize: 16,
        cursor: disabled ? 'not-allowed' : 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        ...style,
      }}
    >
      {children}
    </button>
  );
}

function Chip({ icon, label, onClick, accent }) {
  return (
    <button onClick={onClick} style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
      width: '100%', padding: '12px 10px', borderRadius: 14,
      border: `1px solid ${accent ? COLORS.green : COLORS.border}`,
      background: accent ? COLORS.greenSoft : '#FFFFFF',
      color: accent ? COLORS.green : COLORS.ink, fontFamily: FONT, fontWeight: 700, fontSize: 13,
      cursor: 'pointer', textAlign: 'center', lineHeight: 1.25,
    }}>
      {icon} {label}
    </button>
  );
}

function StepDot({ icon, label }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 700, color: COLORS.inkSoft }}>
      {icon} {label}
    </div>
  );
}

function LockedTeaser({ label, onClick }) {
  return (
    <button onClick={onClick} style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, width: '100%',
      padding: '12px', borderRadius: 14, border: `1px dashed ${COLORS.border}`, background: 'rgba(255,255,255,0.5)',
      fontFamily: FONT, fontWeight: 700, fontSize: 12.5, color: COLORS.inkSoft, cursor: 'pointer', marginBottom: 12,
    }}>
      <Lock size={14} /> {label}
    </button>
  );
}

function HomeScreen({ onStart, onHistory, historyCount, onEarnings, onNegotiate, onUpgrade, onBatch, onBuy, isPremium, scanCount }) {
  return (
    <div className="screenFade" style={{ display: 'flex', flexDirection: 'column', minHeight: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '24px 24px 0' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 42, height: 42, borderRadius: 999, background: COLORS.ink,
            color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontWeight: 800, fontSize: 15,
          }}>R$</div>
          <div>
            <div style={{ fontWeight: 800, fontSize: 16, color: COLORS.ink, letterSpacing: '-0.01em' }}>Revalúa</div>
            <div style={{ fontSize: 11, color: COLORS.muted, fontWeight: 600, letterSpacing: '0.02em' }}>Tasación al instante</div>
          </div>
        </div>
        <button onClick={onHistory} style={{
          display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 999,
          border: `1px solid ${COLORS.border}`, background: 'rgba(255,255,255,0.6)', cursor: 'pointer',
          fontFamily: FONT, fontSize: 13, fontWeight: 700, color: COLORS.ink,
        }}>
          <Clock size={14} /> Historial{historyCount > 0 ? ` (${historyCount})` : ''}
        </button>
      </div>

      <div style={{ padding: '28px 24px 0' }}>
        <h1 style={{
          fontSize: 34, lineHeight: 1.12, fontWeight: 800, color: COLORS.ink,
          letterSpacing: '-0.02em', margin: 0,
        }}>
          Convierte lo que ya no usas en dinero
        </h1>
        <p style={{ fontSize: 16, lineHeight: 1.55, color: COLORS.inkSoft, marginTop: 14, fontWeight: 500 }}>
          Una foto. Un precio real. Un anuncio listo para pegar.
        </p>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 16 }}>
          <StepDot icon={<Camera size={13} />} label="Foto" />
          <ChevronRight size={13} color={COLORS.muted} />
          <StepDot icon={<DollarSign size={13} />} label="Precio" />
          <ChevronRight size={13} color={COLORS.muted} />
          <StepDot icon={<Share2 size={13} />} label="Publica" />
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, padding: '22px 24px 0' }}>
        <Chip icon={<BarChart3 size={15} />} label="Reporte" onClick={onEarnings} />
        <Chip icon={<MessageSquare size={15} />} label="Negociar" onClick={onNegotiate} />
        <Chip icon={<Search size={15} />} label="Identificar y comprar" onClick={onBuy} />
        <Chip icon={<Crown size={15} />} label="Premium" onClick={onUpgrade} accent={isPremium} />
      </div>

      <div style={{ padding: '20px 24px 0', flex: 1 }}>
        <HeroCollage />
      </div>

      <div style={{ padding: '24px 24px 8px' }}>
        <PrimaryButton onClick={onStart}>
          <Camera size={18} /> Tasar un artículo
        </PrimaryButton>
        <div style={{ textAlign: 'center', fontSize: 12, fontWeight: 600, marginTop: 10, color: isPremium ? COLORS.green : COLORS.muted }}>
          {isPremium ? 'Tasaciones ilimitadas ✓' : `Te quedan ${Math.max(0, FREE_SCAN_LIMIT - scanCount)} tasaciones gratis este mes`}
        </div>
      </div>
      <div style={{ padding: '0 24px 24px', textAlign: 'center' }}>
        <button onClick={onBatch} style={{
          background: 'none', border: 'none', color: COLORS.inkSoft, fontFamily: FONT,
          fontWeight: 700, fontSize: 13, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6,
        }}>
          <Layers size={14} /> Tasar varios a la vez {!isPremium && '(Premium)'}
        </button>
      </div>
    </div>
  );
}

function HeroCollage() {
  const items = [
    { Icon: Sofa, bg: 'linear-gradient(135deg, #2b3350 0%, #10182B 100%)', rotate: -6, style: { left: '6%', top: '6%', width: '40%', height: '34%' }, iconSize: 34 },
    { Icon: Bike, bg: 'linear-gradient(135deg, #229a6c 0%, #155c40 100%)', rotate: 5, style: { left: '8%', bottom: '6%', width: '34%', height: '32%' }, iconSize: 30 },
    { Icon: Lamp, bg: 'linear-gradient(135deg, #ffffff 0%, #eef1f5 100%)', rotate: -4, style: { right: '28%', bottom: '12%', width: '26%', height: '26%' }, iconSize: 26, dark: true },
    { Icon: Laptop, bg: 'linear-gradient(135deg, #4a5a82 0%, #2c3652 100%)', rotate: 4, style: { right: '4%', top: '10%', width: '40%', height: '50%' }, iconSize: 38 },
  ];
  return (
    <div style={{
      position: 'relative', width: '100%', paddingTop: '70%', borderRadius: 28,
      background: 'linear-gradient(160deg, #F4F8F4 0%, #E7ECF3 100%)',
      overflow: 'hidden', border: `1px solid ${COLORS.border}`,
    }}>
      {items.map((it, i) => (
        <div key={i} style={{
          position: 'absolute', ...it.style, transform: `rotate(${it.rotate}deg)`,
          background: '#fff', padding: 6, borderRadius: 16,
          boxShadow: '0 14px 28px rgba(16,24,43,0.18)',
        }}>
          <div style={{
            width: '100%', height: '100%', borderRadius: 10, background: it.bg,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <it.Icon size={it.iconSize} color={it.dark ? COLORS.ink : '#F4F8F4'} strokeWidth={1.6} />
          </div>
        </div>
      ))}
    </div>
  );
}

function CaptureScreen({ onBack, onPhoto, error }) {
  const fileInputRef = useRef(null);
  return (
    <div className="screenFade" style={{ display: 'flex', flexDirection: 'column', minHeight: '100%' }}>
      <TopBar title="Foto del artículo" onBack={onBack} />
      <div style={{ flex: 1, padding: '12px 24px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
        <button
          onClick={() => fileInputRef.current && fileInputRef.current.click()}
          style={{
            width: '100%', aspectRatio: '3 / 4', borderRadius: 24,
            border: `2px dashed ${COLORS.border}`, background: 'rgba(255,255,255,0.5)',
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            gap: 12, cursor: 'pointer', fontFamily: FONT,
          }}
        >
          <div style={{
            width: 60, height: 60, borderRadius: 999, background: COLORS.ink,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Camera size={26} color="#fff" />
          </div>
          <div style={{ fontWeight: 700, color: COLORS.ink, fontSize: 15 }}>Toca para tomar o subir una foto</div>
          <div style={{ fontSize: 13, color: COLORS.muted, textAlign: 'center', maxWidth: 220 }}>
            La tasación empieza en cuanto elijas la foto — sin pasos extra.
          </div>
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          style={{ display: 'none' }}
          onChange={(e) => {
            const file = e.target.files && e.target.files[0];
            if (file) onPhoto(file);
          }}
        />
        {error && (
          <div style={{
            marginTop: 16, display: 'flex', gap: 8, alignItems: 'flex-start', padding: '12px 14px',
            borderRadius: 14, background: COLORS.dangerSoft, color: COLORS.danger, fontSize: 13.5,
          }}>
            <AlertCircle size={16} style={{ flexShrink: 0, marginTop: 1 }} />
            <span>{error}</span>
          </div>
        )}
      </div>
    </div>
  );
}

function BuyCaptureScreen({ onBack, onPhoto, error }) {
  const fileInputRef = useRef(null);
  return (
    <div className="screenFade" style={{ display: 'flex', flexDirection: 'column', minHeight: '100%' }}>
      <TopBar title="Identificar y comprar" onBack={onBack} />
      <div style={{ flex: 1, padding: '12px 24px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
        <button
          onClick={() => fileInputRef.current && fileInputRef.current.click()}
          style={{
            width: '100%', aspectRatio: '3 / 4', borderRadius: 24,
            border: `2px dashed ${COLORS.border}`, background: 'rgba(255,255,255,0.5)',
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            gap: 12, cursor: 'pointer', fontFamily: FONT,
          }}
        >
          <div style={{
            width: 60, height: 60, borderRadius: 999, background: COLORS.ink,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Search size={26} color="#fff" />
          </div>
          <div style={{ fontWeight: 700, color: COLORS.ink, fontSize: 15 }}>Identificar producto</div>
          <div style={{ fontSize: 13, color: COLORS.muted, textAlign: 'center', maxWidth: 240 }}>
            Toma la foto de lo que no reconoces y buscamos dónde comprarlo.
          </div>
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          style={{ display: 'none' }}
          onChange={(e) => {
            const file = e.target.files && e.target.files[0];
            if (file) onPhoto(file);
          }}
        />
        {error && (
          <div style={{
            marginTop: 16, display: 'flex', gap: 8, alignItems: 'flex-start', padding: '12px 14px',
            borderRadius: 14, background: COLORS.dangerSoft, color: COLORS.danger, fontSize: 13.5,
          }}>
            <AlertCircle size={16} style={{ flexShrink: 0, marginTop: 1 }} />
            <span>{error}</span>
          </div>
        )}
      </div>
    </div>
  );
}

function BatchCaptureScreen({ onBack, onPhotos, error }) {
  const fileInputRef = useRef(null);
  return (
    <div className="screenFade" style={{ display: 'flex', flexDirection: 'column', minHeight: '100%' }}>
      <TopBar title="Varios artículos" onBack={onBack} />
      <div style={{ flex: 1, padding: '12px 24px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
        <button
          onClick={() => fileInputRef.current && fileInputRef.current.click()}
          style={{
            width: '100%', aspectRatio: '3 / 4', borderRadius: 24,
            border: `2px dashed ${COLORS.border}`, background: 'rgba(255,255,255,0.5)',
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            gap: 12, cursor: 'pointer', fontFamily: FONT,
          }}
        >
          <div style={{
            width: 60, height: 60, borderRadius: 999, background: COLORS.ink,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Layers size={26} color="#fff" />
          </div>
          <div style={{ fontWeight: 700, color: COLORS.ink, fontSize: 15 }}>Elige hasta 10 fotos a la vez</div>
          <div style={{ fontSize: 13, color: COLORS.muted, textAlign: 'center', maxWidth: 240 }}>
            Cada foto se convierte en su propio anuncio, uno por uno.
          </div>
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          style={{ display: 'none' }}
          onChange={(e) => {
            if (e.target.files && e.target.files.length) onPhotos(e.target.files);
          }}
        />
        {error && (
          <div style={{
            marginTop: 16, display: 'flex', gap: 8, alignItems: 'flex-start', padding: '12px 14px',
            borderRadius: 14, background: COLORS.dangerSoft, color: COLORS.danger, fontSize: 13.5,
          }}>
            <AlertCircle size={16} style={{ flexShrink: 0, marginTop: 1 }} />
            <span>{error}</span>
          </div>
        )}
      </div>
    </div>
  );
}

function AnalyzingScreen({ photoDataUrl, progress }) {
  const [msgIndex, setMsgIndex] = useState(0);
  useEffect(() => {
    const id = setInterval(() => {
      setMsgIndex((i) => (i + 1) % LOADING_MESSAGES.length);
    }, 1800);
    return () => clearInterval(id);
  }, []);
  return (
    <div className="screenFade" style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      minHeight: '100%', padding: 24, textAlign: 'center',
    }}>
      {photoDataUrl && (
        <div style={{
          width: 84, height: 84, borderRadius: 20, overflow: 'hidden', marginBottom: 20,
          border: `1px solid ${COLORS.border}`, boxShadow: '0 8px 20px rgba(16,24,43,0.1)',
        }}>
          <img src={photoDataUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        </div>
      )}
      <div className="spin" style={{
        width: 40, height: 40, borderRadius: 999, border: `3px solid ${COLORS.border}`,
        borderTopColor: COLORS.ink, marginBottom: 20,
      }} />
      <div style={{ fontWeight: 700, fontSize: 16, color: COLORS.ink, minHeight: 24 }}>
        {progress ? `Analizando ${progress.current} de ${progress.total}` : LOADING_MESSAGES[msgIndex]}
      </div>
      <div style={{ fontSize: 13, color: COLORS.muted, marginTop: 8 }}>{LOADING_MESSAGES[msgIndex]}</div>
    </div>
  );
}

function ErrorScreen({ message, onRetry, onBack }) {
  return (
    <div className="screenFade" style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      minHeight: '100%', padding: 32, textAlign: 'center',
    }}>
      <div style={{
        width: 56, height: 56, borderRadius: 999, background: COLORS.dangerSoft,
        display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 18,
      }}>
        <AlertCircle size={26} color={COLORS.danger} />
      </div>
      <div style={{ fontWeight: 700, fontSize: 16, color: COLORS.ink, marginBottom: 6 }}>No pudimos completar la tasación</div>
      <div style={{ fontSize: 13.5, color: COLORS.muted, marginBottom: 24 }}>{message}</div>
      <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <PrimaryButton onClick={onRetry}>Reintentar</PrimaryButton>
        <button onClick={onBack} style={{
          background: 'none', border: 'none', color: COLORS.inkSoft, fontFamily: FONT,
          fontWeight: 600, fontSize: 14, cursor: 'pointer', padding: 10,
        }}>Elegir otra foto</button>
      </div>
    </div>
  );
}

const labelStyle = {
  display: 'block', fontSize: 13, fontWeight: 700, color: COLORS.inkSoft,
  marginTop: 18, marginBottom: 7, letterSpacing: '0.01em',
};

const inputStyle = {
  width: '100%', padding: '14px 15px', borderRadius: 14, border: `1px solid ${COLORS.border}`,
  fontSize: 15, lineHeight: 1.5, color: COLORS.ink, fontFamily: FONT, background: '#fff', boxSizing: 'border-box',
};

function PlatformCard({ name, accent, textColor, copied, onCopy, href }) {
  return (
    <div style={{
      borderRadius: 18, border: `1px solid ${COLORS.border}`, background: COLORS.card,
      padding: 16, marginBottom: 12,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
        <div style={{ width: 10, height: 10, borderRadius: 999, background: accent }} />
        <div style={{ fontWeight: 700, fontSize: 14.5, color: COLORS.ink }}>{name}</div>
      </div>
      <div style={{ display: 'flex', gap: 10 }}>
        <button onClick={onCopy} style={{
          flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
          padding: '11px 12px', borderRadius: 12, border: `1px solid ${COLORS.border}`,
          background: '#fff', fontFamily: FONT, fontWeight: 700, fontSize: 13, cursor: 'pointer', color: COLORS.ink,
        }}>
          {copied ? <Check size={15} /> : <Copy size={15} />} {copied ? 'Copiado' : 'Copiar anuncio'}
        </button>
        <a href={href} target="_blank" rel="noopener noreferrer" style={{
          flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
          padding: '11px 12px', borderRadius: 12, border: 'none', textDecoration: 'none',
          background: accent, fontFamily: FONT, fontWeight: 700, fontSize: 13, color: textColor || '#fff',
        }}>
          <ExternalLink size={15} /> Abrir
        </a>
      </div>
    </div>
  );
}

function ResultScreen({ analysis, listing, setListing, photoDataUrl, onBack, bottomLabel, onBottomClick, isPremium, onUpgrade }) {
  const [copied, setCopied] = useState(null);
  const currency = analysis.currency || 'USD';
  const fullText = `${listing.title} — ${currency} ${Math.round(listing.price) || 0}\n\n${listing.description}\n\nEstado: ${analysis.condition || ''}`;

  const copy = async (key) => {
    try {
      await navigator.clipboard.writeText(fullText);
      setCopied(key);
      setTimeout(() => setCopied(null), 2200);
    } catch (e) {
      setCopied('failed');
      setTimeout(() => setCopied(null), 2200);
    }
  };

  return (
    <div className="screenFade" style={{ display: 'flex', flexDirection: 'column', minHeight: '100%' }}>
      <TopBar title="Tu anuncio" onBack={onBack} />
      <div style={{ flex: 1, padding: '4px 24px 16px', overflowY: 'auto' }}>
        {photoDataUrl && (
          <div style={{ borderRadius: 20, overflow: 'hidden', border: `1px solid ${COLORS.border}`, marginBottom: 16 }}>
            <img src={photoDataUrl} alt="Foto del artículo" style={{ width: '100%', display: 'block', maxHeight: 240, objectFit: 'cover' }} />
          </div>
        )}
        <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
          <span style={{
            padding: '6px 12px', borderRadius: 999, background: 'rgba(16,24,43,0.06)',
            fontSize: 12.5, fontWeight: 700, color: COLORS.ink,
          }}>{analysis.category || 'Artículo'}</span>
          <span style={{
            padding: '6px 12px', borderRadius: 999, background: COLORS.greenSoft,
            fontSize: 12.5, fontWeight: 700, color: COLORS.green,
          }}>{analysis.condition || 'Estado evaluado'}</span>
        </div>

        <div style={{
          borderRadius: 20, background: COLORS.card, border: `1px solid ${COLORS.border}`,
          padding: 20, marginBottom: 20,
        }}>
          <div style={{ fontSize: 12.5, color: COLORS.muted, fontWeight: 700 }}>Valor de mercado estimado</div>
          <div style={{ fontSize: 34, fontWeight: 800, color: COLORS.green, letterSpacing: '-0.02em', marginTop: 6 }}>
            {currency} {Math.round(listing.price) || 0}
          </div>
          <div style={{ fontSize: 13, color: COLORS.inkSoft, marginTop: 4 }}>
            Rango de mercado: {currency} {Math.round(analysis.estimated_value_low || 0)} – {Math.round(analysis.estimated_value_high || 0)}
          </div>
          {analysis.market_notes && (
            <div style={{ fontSize: 12.5, color: COLORS.muted, marginTop: 10, lineHeight: 1.5 }}>
              {analysis.market_notes}
            </div>
          )}
        </div>

        <label style={labelStyle}>Título</label>
        <input value={listing.title} onChange={(e) => setListing({ ...listing, title: e.target.value })} style={inputStyle} />

        <label style={labelStyle}>Precio ({currency})</label>
        <input
          type="number"
          value={listing.price}
          onChange={(e) => setListing({ ...listing, price: e.target.value })}
          style={inputStyle}
        />

        <label style={labelStyle}>Descripción</label>
        <textarea
          value={listing.description}
          onChange={(e) => setListing({ ...listing, description: e.target.value })}
          rows={4}
          style={{ ...inputStyle, resize: 'vertical' }}
        />

        <div style={{ marginTop: 22, marginBottom: 14, fontSize: 12.5, fontWeight: 700, color: COLORS.inkSoft }}>
          Publicar
        </div>

        <PlatformCard name="Facebook Marketplace" accent="#3B5BA9" copied={copied === 'fb'} onCopy={() => copy('fb')} href="https://www.facebook.com/marketplace/create/item" />
        <PlatformCard name="OfferUp" accent={COLORS.green} copied={copied === 'offerup'} onCopy={() => copy('offerup')} href="https://offerup.com" />

        <a
          href={`https://wa.me/?text=${encodeURIComponent(fullText)}`}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, width: '100%',
            padding: '13px 12px', borderRadius: 14, border: 'none', textDecoration: 'none',
            background: '#25D366', fontFamily: FONT, fontWeight: 700, fontSize: 13.5, color: '#fff', marginBottom: 12,
          }}
        >
          <MessageCircle size={16} /> Compartir por WhatsApp
        </a>
        <div style={{ fontSize: 11.5, color: COLORS.muted, marginTop: -6, marginBottom: 14, lineHeight: 1.5 }}>
          Se abre WhatsApp con el mensaje ya escrito — adjunta ahí la foto que descargues abajo.
        </div>

        {isPremium ? (
          <>
            <PlatformCard name="eBay" accent="#3665A6" copied={copied === 'ebay'} onCopy={() => copy('ebay')} href="https://www.ebay.com/sl/sell" />
            <PlatformCard name="Mercado Libre" accent="#D98400" copied={copied === 'ml'} onCopy={() => copy('ml')} href="https://www.mercadolibre.com" />
            <PlatformCard name="Vinted" accent="#178A54" copied={copied === 'vinted'} onCopy={() => copy('vinted')} href="https://www.vinted.com" />
          </>
        ) : (
          <LockedTeaser label="+ eBay, Mercado Libre y Vinted con Premium" onClick={() => onUpgrade('Publicar en más plataformas es una función Premium.')} />
        )}

        {copied === 'failed' && (
          <div style={{ fontSize: 12.5, color: COLORS.danger, marginTop: 4, marginBottom: 8 }}>
            No se pudo copiar automáticamente. Mantén presionado el texto de abajo para copiarlo.
          </div>
        )}

        {photoDataUrl && (
          <a
            href={photoDataUrl}
            download="revalua-foto.jpg"
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              padding: '11px 12px', borderRadius: 12, border: `1px solid ${COLORS.border}`,
              background: '#fff', fontFamily: FONT, fontWeight: 700, fontSize: 13, color: COLORS.ink,
              textDecoration: 'none', marginTop: 2, marginBottom: 14,
            }}
          >
            <Download size={15} /> Guardar foto para adjuntarla
          </a>
        )}

        <div style={{ fontSize: 11.5, color: COLORS.muted, lineHeight: 1.5 }}>
          Copiamos el anuncio para que lo pegues tú mismo — ni Facebook ni OfferUp permiten publicar de forma automática ni guardar tu contraseña desde apps externas.
        </div>
      </div>
      <div style={{ padding: 24 }}>
        <PrimaryButton onClick={onBottomClick} style={{ background: 'transparent', color: COLORS.inkSoft, border: `1px solid ${COLORS.border}` }}>
          {bottomLabel}
        </PrimaryButton>
      </div>
    </div>
  );
}

function BatchAnalyzingScreen({ progress }) {
  return <AnalyzingScreen photoDataUrl={null} progress={progress} />;
}

function BatchResultsScreen({ items, onSelect, onFinish, onDiscard }) {
  return (
    <div className="screenFade" style={{ display: 'flex', flexDirection: 'column', minHeight: '100%' }}>
      <TopBar title={`${items.length} artículos`} onBack={onDiscard} />
      <div style={{ flex: 1, padding: '4px 24px 12px', overflowY: 'auto' }}>
        {items.map((item, i) => (
          <div key={i} style={{
            display: 'flex', alignItems: 'center', gap: 12, padding: '10px 4px',
            borderBottom: `1px solid ${COLORS.border}`, cursor: item.analysis ? 'pointer' : 'default',
          }} onClick={() => item.analysis && onSelect(i)}>
            {item.photoDataUrl ? (
              <img src={item.photoDataUrl} alt="" style={{ width: 46, height: 46, borderRadius: 12, objectFit: 'cover', flexShrink: 0 }} />
            ) : (
              <div style={{ width: 46, height: 46, borderRadius: 12, background: COLORS.dangerSoft, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <AlertCircle size={18} color={COLORS.danger} />
              </div>
            )}
            <div style={{ flex: 1, minWidth: 0 }}>
              {item.analysis ? (
                <>
                  <div style={{ fontWeight: 700, fontSize: 13.5, color: COLORS.ink, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.listing.title}</div>
                  <div style={{ fontSize: 12, color: COLORS.green, fontWeight: 700, marginTop: 2 }}>
                    {item.analysis.currency || 'USD'} {Math.round(item.listing.price) || 0}
                  </div>
                </>
              ) : (
                <div style={{ fontSize: 12.5, color: COLORS.danger }}>{item.error || 'No se pudo analizar esta foto.'}</div>
              )}
            </div>
          </div>
        ))}
      </div>
      <div style={{ padding: 24 }}>
        <PrimaryButton onClick={onFinish}>Guardar todos y terminar</PrimaryButton>
      </div>
    </div>
  );
}

function BuyResultsScreen({ analysis, photoDataUrl, onBack, onHome }) {
  const results = analysis.results || [];
  return (
    <div className="screenFade" style={{ display: 'flex', flexDirection: 'column', minHeight: '100%' }}>
      <TopBar title="Dónde comprarla" onBack={onBack} />
      <div style={{ flex: 1, padding: '4px 24px 16px', overflowY: 'auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18 }}>
          {photoDataUrl && (
            <img src={photoDataUrl} alt="" style={{ width: 52, height: 52, borderRadius: 14, objectFit: 'cover', flexShrink: 0, border: `1px solid ${COLORS.border}` }} />
          )}
          <div>
            <div style={{ fontWeight: 800, fontSize: 16, color: COLORS.ink }}>{analysis.item_name || 'Artículo identificado'}</div>
            {analysis.description && (
              <div style={{ fontSize: 12.5, color: COLORS.muted, marginTop: 2 }}>{analysis.description}</div>
            )}
          </div>
        </div>

        <div style={{ fontSize: 12.5, fontWeight: 700, color: COLORS.inkSoft, marginBottom: 12 }}>
          {results.length > 0 ? `Encontramos ${results.length} anuncio${results.length > 1 ? 's' : ''}:` : 'No encontramos anuncios disponibles ahora mismo.'}
        </div>

        {results.map((r, i) => (
          <div key={i} style={{
            borderRadius: 18, border: `1px solid ${COLORS.border}`, background: COLORS.card,
            padding: 16, marginBottom: 12,
          }}>
            <div style={{ fontWeight: 700, fontSize: 14, color: COLORS.ink }}>{r.title || 'Anuncio encontrado'}</div>
            <div style={{ fontSize: 13, color: COLORS.green, fontWeight: 700, marginTop: 4 }}>
              {r.price != null ? `${r.currency || ''} ${Math.round(r.price)}` : 'Precio no indicado'} {r.source ? `· ${r.source}` : ''}
            </div>
            <a href={r.url} target="_blank" rel="noopener noreferrer" style={{
              marginTop: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              padding: '10px 12px', borderRadius: 12, border: 'none', textDecoration: 'none',
              background: COLORS.ink, fontFamily: FONT, fontWeight: 700, fontSize: 13, color: '#fff',
            }}>
              <ExternalLink size={14} /> Ver anuncio y comprar
            </a>
          </div>
        ))}

        <div style={{ fontSize: 11.5, color: COLORS.muted, marginTop: 12, lineHeight: 1.5 }}>
          Estos resultados vienen de una búsqueda en vivo — confirma siempre precio y disponibilidad en el sitio antes de comprar.
        </div>
      </div>
      <div style={{ padding: 24 }}>
        <PrimaryButton onClick={onHome} style={{ background: 'transparent', color: COLORS.inkSoft, border: `1px solid ${COLORS.border}` }}>
          Volver al inicio
        </PrimaryButton>
      </div>
    </div>
  );
}

function HistoryScreen({ items, onBack, onDelete, onToggleSold, isPremium, onUpgrade }) {
  const [suggestions, setSuggestions] = useState({});

  const isStale = (item) => item.date && Date.now() - item.date > 7 * 24 * 60 * 60 * 1000;

  const suggestDrop = async (item) => {
    setSuggestions((s) => ({ ...s, [item.storageKey]: { loading: true } }));
    try {
      const text = await suggestPriceDrop(item);
      setSuggestions((s) => ({ ...s, [item.storageKey]: { loading: false, text } }));
    } catch (e) {
      setSuggestions((s) => ({ ...s, [item.storageKey]: { loading: false, error: 'No se pudo generar una sugerencia.' } }));
    }
  };

  return (
    <div className="screenFade" style={{ display: 'flex', flexDirection: 'column', minHeight: '100%' }}>
      <TopBar title="Historial" onBack={onBack} />
      <div style={{ flex: 1, padding: '4px 24px 24px' }}>
        {items.length === 0 ? (
          <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            padding: '60px 20px', textAlign: 'center', color: COLORS.muted,
          }}>
            <ImageIcon size={32} style={{ marginBottom: 12, opacity: 0.5 }} />
            <div style={{ fontSize: 14, fontWeight: 600 }}>Aún no has tasado ningún artículo.</div>
          </div>
        ) : (
          items.map((item) => {
            const sug = suggestions[item.storageKey];
            const stale = isStale(item);
            return (
              <div key={item.storageKey} style={{ padding: '14px 4px', borderBottom: `1px solid ${COLORS.border}` }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 14, color: COLORS.ink }}>{item.title}</div>
                    <div style={{ fontSize: 12.5, color: COLORS.muted, marginTop: 2 }}>
                      {item.currency || 'USD'} {Math.round(item.price || 0)} · {item.category || ''}
                    </div>
                  </div>
                  <button onClick={() => onDelete(item.storageKey)} style={iconButtonStyle}>
                    <Trash2 size={16} color={COLORS.danger} />
                  </button>
                </div>
                <button
                  onClick={() => onToggleSold(item.storageKey, !item.sold)}
                  style={{
                    marginTop: 10, display: 'inline-flex', alignItems: 'center', gap: 6,
                    padding: '6px 12px', borderRadius: 999, border: `1px solid ${item.sold ? COLORS.green : COLORS.border}`,
                    background: item.sold ? COLORS.greenSoft : '#fff', color: item.sold ? COLORS.green : COLORS.muted,
                    fontFamily: FONT, fontWeight: 700, fontSize: 12, cursor: 'pointer',
                  }}
                >
                  <Check size={13} /> {item.sold ? 'Vendido' : 'Marcar como vendido'}
                </button>
                {stale && (
                  <div style={{ marginTop: 10 }}>
                    {isPremium ? (
                      sug && sug.text ? (
                        <div style={{ fontSize: 12.5, color: COLORS.green, background: COLORS.greenSoft, padding: '8px 10px', borderRadius: 10 }}>{sug.text}</div>
                      ) : sug && sug.error ? (
                        <div style={{ fontSize: 12.5, color: COLORS.danger }}>{sug.error}</div>
                      ) : (
                        <button onClick={() => suggestDrop(item)} disabled={sug && sug.loading} style={{
                          display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none',
                          color: COLORS.inkSoft, fontFamily: FONT, fontWeight: 700, fontSize: 12.5, cursor: 'pointer', padding: 0,
                        }}>
                          <TrendingDown size={14} /> {sug && sug.loading ? 'Consultando…' : 'Sugerir bajar precio'}
                        </button>
                      )
                    ) : (
                      <button onClick={() => onUpgrade('Las sugerencias de precio son una función Premium.')} style={{
                        display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none',
                        color: COLORS.muted, fontFamily: FONT, fontWeight: 700, fontSize: 12.5, cursor: 'pointer', padding: 0,
                      }}>
                        <Lock size={13} /> Sugerir bajar precio (Premium)
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

function EarningsScreen({ history, onBack }) {
  const soldItems = history.filter((h) => h.sold);
  const totalItems = history.length;
  const totalSoldValue = soldItems.reduce((sum, h) => sum + (Number(h.price) || 0), 0);
  const currency = (history[0] && history[0].currency) || 'USD';
  const now = new Date();
  const monthSums = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const sum = soldItems
      .filter((h) => h.date && new Date(h.date).getFullYear() === d.getFullYear() && new Date(h.date).getMonth() === d.getMonth())
      .reduce((s, h) => s + (Number(h.price) || 0), 0);
    monthSums.push({ label: MONTH_LABELS[d.getMonth()], value: sum });
  }
  const maxVal = Math.max(1, ...monthSums.map((m) => m.value));
  const thisMonthSum = monthSums[monthSums.length - 1].value;

  return (
    <div className="screenFade" style={{ display: 'flex', flexDirection: 'column', minHeight: '100%' }}>
      <TopBar title="Reporte" onBack={onBack} />
      <div style={{ flex: 1, padding: '4px 24px 24px' }}>
        <div style={{ borderRadius: 20, background: COLORS.card, border: `1px solid ${COLORS.border}`, padding: 20, marginBottom: 24 }}>
          <div style={{ fontSize: 12.5, color: COLORS.muted, fontWeight: 700 }}>Ganancias confirmadas</div>
          <div style={{ fontSize: 32, fontWeight: 800, color: COLORS.green, marginTop: 6, letterSpacing: '-0.02em' }}>
            {currency} {Math.round(totalSoldValue)}
          </div>
          <div style={{ fontSize: 13, color: COLORS.inkSoft, marginTop: 4 }}>
            {soldItems.length} de {totalItems} artículos tasados se marcaron como vendidos · este mes: {currency} {Math.round(thisMonthSum)}
          </div>
        </div>

        <div style={{ fontSize: 12.5, fontWeight: 700, color: COLORS.inkSoft, marginBottom: 12 }}>Últimos 6 meses (vendido)</div>
        <div style={{ display: 'flex', alignItems: 'flex-end', height: 140, gap: 8 }}>
          {monthSums.map((m, i) => (
            <div key={i} style={{ flex: 1, height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', alignItems: 'center', gap: 6 }}>
              <div style={{ width: '70%', height: `${Math.max(4, (m.value / maxVal) * 100)}%`, background: COLORS.green, borderRadius: 6 }} />
              <div style={{ fontSize: 10, color: COLORS.muted, fontWeight: 600 }}>{m.label}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function NegotiateScreen({ onBack }) {
  const [itemContext, setItemContext] = useState('');
  const [buyerMsg, setBuyerMsg] = useState('');
  const [reply, setReply] = useState(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);
  const [copied, setCopied] = useState(false);

  const handleSuggest = async () => {
    if (!buyerMsg.trim()) return;
    setLoading(true); setErr(null); setReply(null);
    try {
      const text = await suggestNegotiationReply(itemContext, buyerMsg);
      setReply(text);
    } catch (e) {
      setErr(e.message || 'No se pudo generar una respuesta.');
    } finally {
      setLoading(false);
    }
  };

  const copyReply = async () => {
    try {
      await navigator.clipboard.writeText(reply || '');
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (e) {
      // ignore
    }
  };

  return (
    <div className="screenFade" style={{ display: 'flex', flexDirection: 'column', minHeight: '100%' }}>
      <TopBar title="Asistente de negociación" onBack={onBack} />
      <div style={{ flex: 1, padding: '4px 24px 24px', overflowY: 'auto' }}>
        <label style={labelStyle}>Artículo y precio (opcional)</label>
        <input value={itemContext} onChange={(e) => setItemContext(e.target.value)} placeholder="Ej. Cámara Pentax K1000, $80" style={inputStyle} />

        <label style={labelStyle}>Mensaje del comprador</label>
        <textarea value={buyerMsg} onChange={(e) => setBuyerMsg(e.target.value)} rows={4} placeholder='Ej. "¿Aceptas 50?"' style={{ ...inputStyle, resize: 'vertical' }} />

        <div style={{ marginTop: 16 }}>
          <PrimaryButton onClick={handleSuggest} disabled={loading || !buyerMsg.trim()}>
            <Sparkles size={16} /> {loading ? 'Pensando…' : 'Sugerir respuesta'}
          </PrimaryButton>
        </div>

        {err && (
          <div style={{ marginTop: 16, fontSize: 13, color: COLORS.danger }}>{err}</div>
        )}

        {reply && (
          <div style={{ marginTop: 20, borderRadius: 16, border: `1px solid ${COLORS.border}`, background: COLORS.card, padding: 16 }}>
            <div style={{ fontSize: 13.5, color: COLORS.ink, lineHeight: 1.55 }}>{reply}</div>
            <button onClick={copyReply} style={{
              marginTop: 12, display: 'flex', alignItems: 'center', gap: 6, background: 'none',
              border: `1px solid ${COLORS.border}`, borderRadius: 10, padding: '8px 12px',
              fontFamily: FONT, fontWeight: 700, fontSize: 12.5, color: COLORS.ink, cursor: 'pointer',
            }}>
              {copied ? <Check size={14} /> : <Copy size={14} />} {copied ? 'Copiado' : 'Copiar respuesta'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function UpgradeScreen({ reason, isPremium, onActivate, onDeactivate, onBack }) {
  const features = [
    'Tasaciones ilimitadas cada mes',
    'Publica también en eBay, Mercado Libre y Vinted',
    'Reporte mensual de ganancias',
    'Asistente de negociación con compradores',
    'Sugerencias para bajar precio en artículos sin vender',
    'Tasa hasta 10 artículos a la vez',
  ];
  return (
    <div className="screenFade" style={{ display: 'flex', flexDirection: 'column', minHeight: '100%' }}>
      <TopBar title="Revalúa Premium" onBack={onBack} />
      <div style={{ flex: 1, padding: '4px 24px 12px' }}>
        {reason && (
          <div style={{ padding: '12px 14px', borderRadius: 14, background: 'rgba(16,24,43,0.05)', fontSize: 12.5, color: COLORS.inkSoft, marginBottom: 18 }}>
            {reason}
          </div>
        )}
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 18 }}>
          <div style={{ width: 64, height: 64, borderRadius: 999, background: COLORS.greenSoft, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Crown size={30} color={COLORS.green} />
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 20 }}>
          {features.map((f, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
              <Check size={16} color={COLORS.green} style={{ flexShrink: 0, marginTop: 2 }} />
              <span style={{ fontSize: 14, color: COLORS.ink, fontWeight: 500 }}>{f}</span>
            </div>
          ))}
        </div>
        <div style={{ textAlign: 'center', fontSize: 26, fontWeight: 800, color: COLORS.ink }}>$4.99<span style={{ fontSize: 14, fontWeight: 600, color: COLORS.muted }}>/mes</span></div>
        <div style={{ textAlign: 'center', fontSize: 11.5, color: COLORS.muted, marginTop: 6 }}>
          Modo demostración — activar aquí no genera ningún cobro real.
        </div>
      </div>
      <div style={{ padding: 24 }}>
        {isPremium ? (
          <>
            <div style={{
              textAlign: 'center', padding: '13px', borderRadius: 999, background: COLORS.greenSoft,
              color: COLORS.green, fontWeight: 700, fontSize: 14, marginBottom: 10,
            }}>
              Premium activado ✓
            </div>
            <button onClick={onDeactivate} style={{
              width: '100%', background: 'none', border: 'none', color: COLORS.muted,
              fontFamily: FONT, fontWeight: 600, fontSize: 13, cursor: 'pointer', padding: 8,
            }}>Desactivar (demo)</button>
          </>
        ) : (
          <PrimaryButton onClick={onActivate}>Activar Premium (demo)</PrimaryButton>
        )}
      </div>
    </div>
  );
}

export default function RevaluaApp() {
  const [screen, setScreen] = useState('home');
  const [photoDataUrl, setPhotoDataUrl] = useState(null);
  const [analysis, setAnalysis] = useState(null);
  const [listing, setListing] = useState({ title: '', price: 0, description: '' });
  const [error, setError] = useState(null);
  const [history, setHistory] = useState([]);
  const [isPremium, setIsPremium] = useState(false);
  const [scanCount, setScanCount] = useState(0);
  const [upgradeReason, setUpgradeReason] = useState('');
  const [batchItems, setBatchItems] = useState([]);
  const [batchProgress, setBatchProgress] = useState({ current: 0, total: 0 });
  const [activeBatchIndex, setActiveBatchIndex] = useState(null);
  const [batchError, setBatchError] = useState(null);
  const [buyPhotoDataUrl, setBuyPhotoDataUrl] = useState(null);
  const [buyAnalysis, setBuyAnalysis] = useState(null);
  const [buyError, setBuyError] = useState(null);

  const refreshHistory = async () => {
    const items = await loadHistory();
    setHistory(items);
  };

  useEffect(() => {
    (async () => {
      const [items, premium, count] = await Promise.all([loadHistory(), getPremiumStatus(), getScanCount()]);
      setHistory(items);
      setIsPremium(premium);
      setScanCount(count);
    })();
  }, []);

  const goUpgrade = (reason) => {
    setUpgradeReason(reason || '');
    setScreen('upgrade');
  };

  const activatePremium = async () => {
    await setPremiumStatus(true);
    setIsPremium(true);
    setScreen('home');
  };

  const deactivatePremium = async () => {
    await setPremiumStatus(false);
    setIsPremium(false);
  };

  const runAnalysisWith = async (dataUrl) => {
    setError(null);
    setScreen('analyzing');
    try {
      const result = await analyzeItem(dataUrl);
      const nextListing = {
        title: result.title || result.item_name || 'Artículo en venta',
        price: result.suggested_price || result.estimated_value_low || 0,
        description: result.description || '',
      };
      setAnalysis(result);
      setListing(nextListing);
      incrementScanCount();
      setScanCount((c) => c + 1);
      saveToHistory({
        title: nextListing.title,
        price: Number(nextListing.price) || 0,
        currency: result.currency,
        category: result.category,
        condition: result.condition,
        date: Date.now(),
        sold: false,
      }).then(refreshHistory);
      setScreen('results');
    } catch (e) {
      setError(e.message || 'Ocurrió un error inesperado.');
      setScreen('error');
    }
  };

  const handlePhoto = async (file) => {
    setError(null);
    try {
      const resized = await resizeImage(file);
      setPhotoDataUrl(resized);
      runAnalysisWith(resized);
    } catch (e) {
      setError('No se pudo procesar la imagen. Intenta con otra foto.');
    }
  };

  const goSingleCapture = () => {
    if (!isPremium && scanCount >= FREE_SCAN_LIMIT) {
      goUpgrade('Ya usaste tus 3 tasaciones gratis este mes.');
      return;
    }
    setScreen('capture');
  };

  const goBatchCapture = () => {
    if (!isPremium) {
      goUpgrade('Tasar varios artículos a la vez es una función Premium.');
      return;
    }
    setBatchError(null);
    setScreen('batch-capture');
  };

  const goBuyCapture = () => {
    if (!isPremium) {
      goUpgrade('Buscar dónde comprar una pieza es una función Premium.');
      return;
    }
    setBuyError(null);
    setScreen('buy-capture');
  };

  const runBuySearchWith = async (dataUrl) => {
    setBuyError(null);
    setScreen('buy-analyzing');
    try {
      const result = await analyzeForPurchase(dataUrl);
      setBuyAnalysis(result);
      setScreen('buy-results');
    } catch (e) {
      setBuyError(e.message || 'Ocurrió un error inesperado.');
      setScreen('buy-error');
    }
  };

  const handleBuyPhoto = async (file) => {
    setBuyError(null);
    try {
      const resized = await resizeImage(file);
      setBuyPhotoDataUrl(resized);
      runBuySearchWith(resized);
    } catch (e) {
      setBuyError('No se pudo procesar la imagen. Intenta con otra foto.');
    }
  };

  const handleBatchPhotos = async (files) => {
    const fileArray = Array.from(files).slice(0, 10);
    setScreen('batch-analyzing');
    const results = [];
    for (let i = 0; i < fileArray.length; i++) {
      setBatchProgress({ current: i + 1, total: fileArray.length });
      try {
        const resized = await resizeImage(fileArray[i]);
        const result = await analyzeItem(resized);
        const nextListing = {
          title: result.title || result.item_name || 'Artículo en venta',
          price: result.suggested_price || result.estimated_value_low || 0,
          description: result.description || '',
        };
        results.push({ photoDataUrl: resized, analysis: result, listing: nextListing });
      } catch (e) {
        results.push({ photoDataUrl: null, analysis: null, listing: null, error: e.message || 'Error al analizar esta foto.' });
      }
    }
    setBatchItems(results);
    setScreen('batch-results');
  };

  const openBatchItem = (idx) => {
    const item = batchItems[idx];
    setAnalysis(item.analysis);
    setListing(item.listing);
    setPhotoDataUrl(item.photoDataUrl);
    setActiveBatchIndex(idx);
    setScreen('results');
  };

  const finishBatchDetail = () => {
    setBatchItems((items) => items.map((it, idx) => (idx === activeBatchIndex ? { ...it, listing } : it)));
    setActiveBatchIndex(null);
    setScreen('batch-results');
  };

  const finishBatch = async () => {
    for (const item of batchItems) {
      if (item.analysis) {
        await saveToHistory({
          title: item.listing.title,
          price: Number(item.listing.price) || 0,
          currency: item.analysis.currency,
          category: item.analysis.category,
          condition: item.analysis.condition,
          date: Date.now(),
          sold: false,
        });
      }
    }
    await refreshHistory();
    setBatchItems([]);
    setScreen('home');
  };

  const handleDeleteHistory = async (key) => {
    await deleteHistoryItem(key);
    refreshHistory();
  };

  const handleToggleSold = async (key, sold) => {
    await updateHistoryItem(key, { sold });
    refreshHistory();
  };

  const resetFlow = () => {
    setPhotoDataUrl(null);
    setAnalysis(null);
    setListing({ title: '', price: 0, description: '' });
    setError(null);
    setActiveBatchIndex(null);
    setBuyPhotoDataUrl(null);
    setBuyAnalysis(null);
    setBuyError(null);
    setScreen('home');
  };

  return (
    <div style={{
      width: '100%', minHeight: '100vh', display: 'flex', justifyContent: 'center',
      background: `linear-gradient(160deg, ${COLORS.bgFrom} 0%, ${COLORS.bgTo} 100%)`,
      fontFamily: FONT,
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Manrope:wght@500;600;700;800&display=swap');
        * { box-sizing: border-box; }
        input:focus, textarea:focus { outline: 2px solid ${COLORS.ink}; outline-offset: 1px; }
        button { font-family: ${FONT}; }
        @keyframes screenFadeIn { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
        .screenFade { animation: screenFadeIn 0.28s ease; }
        @keyframes spin { to { transform: rotate(360deg); } }
        .spin { animation: spin 0.9s linear infinite; }
        @media (prefers-reduced-motion: reduce) {
          .screenFade { animation: none; }
          .spin { animation: spin 1.6s linear infinite; }
        }
      `}</style>
      <div style={{ width: '100%', maxWidth: 430, minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
        {screen === 'home' && (
          <HomeScreen
            onStart={goSingleCapture}
            onHistory={() => setScreen('history')}
            historyCount={history.length}
            onEarnings={() => (isPremium ? setScreen('earnings') : goUpgrade('El reporte de ganancias es una función Premium.'))}
            onNegotiate={() => (isPremium ? setScreen('negotiate') : goUpgrade('El asistente de negociación es una función Premium.'))}
            onUpgrade={() => goUpgrade('')}
            onBatch={goBatchCapture}
            onBuy={goBuyCapture}
            isPremium={isPremium}
            scanCount={scanCount}
          />
        )}
        {screen === 'capture' && (
          <CaptureScreen onBack={resetFlow} onPhoto={handlePhoto} error={error} />
        )}
        {screen === 'batch-capture' && (
          <BatchCaptureScreen onBack={resetFlow} onPhotos={handleBatchPhotos} error={batchError} />
        )}
        {screen === 'buy-capture' && (
          <BuyCaptureScreen onBack={resetFlow} onPhoto={handleBuyPhoto} error={buyError} />
        )}
        {screen === 'analyzing' && <AnalyzingScreen photoDataUrl={photoDataUrl} />}
        {screen === 'buy-analyzing' && <AnalyzingScreen photoDataUrl={buyPhotoDataUrl} />}
        {screen === 'batch-analyzing' && <BatchAnalyzingScreen progress={batchProgress} />}
        {screen === 'error' && (
          <ErrorScreen message={error} onRetry={() => runAnalysisWith(photoDataUrl)} onBack={() => setScreen('capture')} />
        )}
        {screen === 'buy-error' && (
          <ErrorScreen message={buyError} onRetry={() => runBuySearchWith(buyPhotoDataUrl)} onBack={() => setScreen('buy-capture')} />
        )}
        {screen === 'results' && analysis && (
          <ResultScreen
            analysis={analysis}
            listing={listing}
            setListing={setListing}
            photoDataUrl={photoDataUrl}
            onBack={activeBatchIndex !== null ? finishBatchDetail : () => setScreen('capture')}
            bottomLabel={activeBatchIndex !== null ? 'Volver a la lista' : 'Volver al inicio'}
            onBottomClick={activeBatchIndex !== null ? finishBatchDetail : resetFlow}
            isPremium={isPremium}
            onUpgrade={goUpgrade}
          />
        )}
        {screen === 'batch-results' && (
          <BatchResultsScreen items={batchItems} onSelect={openBatchItem} onFinish={finishBatch} onDiscard={() => { setBatchItems([]); setScreen('home'); }} />
        )}
        {screen === 'buy-results' && buyAnalysis && (
          <BuyResultsScreen analysis={buyAnalysis} photoDataUrl={buyPhotoDataUrl} onBack={() => setScreen('buy-capture')} onHome={resetFlow} />
        )}
        {screen === 'history' && (
          <HistoryScreen items={history} onBack={() => setScreen('home')} onDelete={handleDeleteHistory} onToggleSold={handleToggleSold} isPremium={isPremium} onUpgrade={goUpgrade} />
        )}
        {screen === 'earnings' && <EarningsScreen history={history} onBack={() => setScreen('home')} />}
        {screen === 'negotiate' && <NegotiateScreen onBack={() => setScreen('home')} />}
        {screen === 'upgrade' && (
          <UpgradeScreen reason={upgradeReason} isPremium={isPremium} onActivate={activatePremium} onDeactivate={deactivatePremium} onBack={() => setScreen('home')} />
        )}
      </div>
    </div>
  );
}
