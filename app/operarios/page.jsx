'use client';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { 
  ShieldCheck, AlertTriangle, CheckCircle2, 
  DollarSign, PackageCheck, LogOut, ArrowRight, X, Camera 
} from 'lucide-react';
import { Html5Qrcode } from 'html5-qrcode';

export default function OperariosModule() {
  // Autenticación por PIN
  const [pin, setPin] = useState('');
  const [usuarioActual, setUsuarioActual] = useState(null);
  const [pagoAcumuladoHoy, setPagoAcumuladoHoy] = useState(0);

  // Lector QR
  const [escaneandoQR, setEscaneandoQR] = useState(false);

  // Datos para Selección
  const [ordenes, setOrdenes] = useState([]);
  const [variantes, setVariantes] = useState([]);
  const [bultos, setBultos] = useState([]);
  const [etapas, setEtapas] = useState([]);

  // Formulario de Captura
  const [selectedOrden, setSelectedOrden] = useState('');
  const [selectedVariante, setSelectedVariante] = useState('');
  const [selectedBulto, setSelectedBulto] = useState('');
  const [selectedEtapa, setSelectedEtapa] = useState('');
  const [cantidadBuenas, setCantidadBuenas] = useState('');
  const [cantidadMerma, setCantidadMerma] = useState('0');
  const [motivoMerma, setMotivoMerma] = useState('');

  // UI States
  const [mensaje, setMensaje] = useState({ tipo: '', texto: '' });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    cargarCatalogos();
  }, []);

  useEffect(() => {
    if (usuarioActual) {
      calcularGananciasHoy(usuarioActual.id);
    }
  }, [usuarioActual]);

  useEffect(() => {
    let qrScanner = null;
    if (escaneandoQR) {
      qrScanner = new Html5Qrcode("reader");
      qrScanner.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 250, height: 250 } },
        (decodedText) => {
          procesarEscaneoQR(decodedText);
          qrScanner.stop().catch(() => {});
          setEscaneandoQR(false);
        },
        () => {}
      ).catch(() => {
        alert("No se pudo acceder a la cámara. Asegúrate de otorgar los permisos en tu navegador.");
        setEscaneandoQR(false);
      });
    }

    return () => {
      if (qrScanner && qrScanner.isScanning) {
        qrScanner.stop().catch(() => {});
      }
    };
  }, [escaneandoQR]);

  async function cargarCatalogos() {
    const { data: ords } = await supabase.from('ordenes_trabajo').select('*').eq('estado', 'activa');
    const { data: etps } = await supabase.from('etapas_produccion').select('*').order('orden_secuencia');
    setOrdenes(ords || []);
    setEtapas(etps || []);
  }

  async function autenticarConPIN(e) {
    e.preventDefault();
    setMensaje({ tipo: '', texto: '' });
    
    if (pin.length !== 4) {
      return setMensaje({ tipo: 'error', texto: 'El PIN debe ser exactamente de 4 dígitos.' });
    }

    const { data: user, error } = await supabase
      .from('usuarios')
      .select('*')
      .eq('pin_4_digitos', pin)
      .single();

    if (error || !user) {
      setMensaje({ tipo: 'error', texto: 'PIN incorrecto. Revisa tu código.' });
      setPin('');
    } else {
      setUsuarioActual(user);
      setPin('');
      setMensaje({ tipo: 'exito', texto: `¡Bienvenido/a, ${user.nombre}!` });
    }
  }

  async function calcularGananciasHoy(usuarioId) {
    const hoy = new Date().toISOString().split('T')[0];
    const { data: registros } = await supabase
      .from('registros_avance')
      .select('pago_calculado')
      .eq('usuario_id', usuarioId)
      .gte('created_at', hoy);

    if (registros) {
      const total = registros.reduce((sum, r) => sum + (parseFloat(r.pago_calculado) || 0), 0);
      setPagoAcumuladoHoy(total.toFixed(2));
    }
  }

  // AUTOLLENADO DE CAMPOS AL ESCANEAR EL CÓDIGO QR DEL BULTO
  async function procesarEscaneoQR(bultoIdEscaneado) {
    setLoading(true);
    setMensaje({ tipo: '', texto: '' });

    // Consultar el bulto y sus relaciones en Supabase
    const { data: bultoData, error } = await supabase
      .from('bultos')
      .select('*, variantes_corte(*, ordenes_trabajo(*))')
      .eq('id', bultoIdEscaneado)
      .single();

    if (error || !bultoData) {
      setLoading(false);
      return setMensaje({ tipo: 'error', texto: 'Código QR no válido o bulto no encontrado.' });
    }

    const varianteObj = bultoData.variantes_corte;
    const ordenObj = varianteObj?.ordenes_trabajo;

    if (!ordenObj || !varianteObj) {
      setLoading(false);
      return setMensaje({ tipo: 'error', texto: 'Error al asociar la orden del bulto.' });
    }

    // Cargar listas dependientes para mantener la coherencia del formulario
    const { data: vars } = await supabase.from('variantes_corte').select('*').eq('orden_id', ordenObj.id);
    const { data: listaBultos } = await supabase.from('bultos').select('*').eq('variante_id', varianteObj.id).order('numero_bulto');

    setSelectedOrden(ordenObj.id);
    setVariantes(vars || []);
    setSelectedVariante(varianteObj.id);
    setBultos(listaBultos || []);
    setSelectedBulto(bultoData.id);

    // Sugerir las piezas completas del bulto
    setCantidadBuenas(bultoData.cantidad_piezas.toString());
    setCantidadMerma('0');

    setLoading(false);
    setMensaje({ 
      tipo: 'exito', 
      texto: `¡Bulto #${bultoData.numero_bulto} de la Orden ${ordenObj.codigo_orden} cargado en automático!` 
    });
  }

  async function handleOrdenChange(ordenId) {
    setSelectedOrden(ordenId);
    setSelectedVariante('');
    setSelectedBulto('');
    if (ordenId) {
      const { data: vars } = await supabase.from('variantes_corte').select('*').eq('orden_id', ordenId);
      setVariantes(vars || []);
    } else {
      setVariantes([]);
      setBultos([]);
    }
  }

  async function handleVarianteChange(varianteId) {
    setSelectedVariante(varianteId);
    setSelectedBulto('');
    if (varianteId) {
      const { data: blts } = await supabase.from('bultos').select('*').eq('variante_id', varianteId).order('numero_bulto');
      setBultos(blts || []);
    } else {
      setBultos([]);
    }
  }

  async function registrarAvance(e) {
    e.preventDefault();
    setLoading(true);
    setMensaje({ tipo: '', texto: '' });

    const pzasBuenas = parseInt(cantidadBuenas) || 0;
    const pzasMerma = parseInt(cantidadMerma) || 0;

    if (pzasBuenas <= 0 && pzasMerma <= 0) {
      setLoading(false);
      return setMensaje({ tipo: 'error', texto: 'Debes registrar al menos 1 pieza buena o 1 merma.' });
    }

    if (pzasMerma > 0 && !motivoMerma.trim()) {
      setLoading(false);
      return setMensaje({ tipo: 'error', texto: 'Debes explicar el motivo de la merma.' });
    }

    const ahora = new Date().toISOString();

    const { error } = await supabase.from('registros_avance').insert([
      {
        bulto_id: selectedBulto,
        etapa_id: parseInt(selectedEtapa),
        usuario_id: usuarioActual.id,
        cantidad_buenas: pzasBuenas,
        cantidad_merma: pzasMerma,
        motivo_merma: pzasMerma > 0 ? motivoMerma : null,
        created_at: ahora
      }
    ]);

    setLoading(false);

    if (error) {
      setMensaje({ tipo: 'error', texto: error.message });
    } else {
      const horaFormateada = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      setMensaje({ tipo: 'exito', texto: `¡Producción registrada exitosamente a las ${horaFormateada}!` });
      setCantidadBuenas('');
      setCantidadMerma('0');
      setMotivoMerma('');
      setSelectedBulto('');
      calcularGananciasHoy(usuarioActual.id);
    }
  }

  function cerrarSesion() {
    setUsuarioActual(null);
    setSelectedOrden('');
    setSelectedVariante('');
    setSelectedBulto('');
    setSelectedEtapa('');
    setMensaje({ tipo: '', texto: '' });
  }

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f1f5f9', fontFamily: 'system-ui, sans-serif', color: '#0f172a', padding: '15px' }}>
      
      {/* HEADER DE LA PANTALLA */}
      <header style={{ backgroundColor: '#0f172a', color: '#ffffff', padding: '15px', borderRadius: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px', boxShadow: '0 4px 6px rgba(0,0,0,0.1)' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '18px', color: '#ffffff', fontWeight: 'bold' }}>MaquilaControl - Terminal de Planta</h1>
          {usuarioActual && (
            <span style={{ fontSize: '13px', color: '#38bdf8', fontWeight: 'bold' }}>
              Operario: {usuarioActual.nombre}
            </span>
          )}
        </div>

        {usuarioActual && (
          <button onClick={cerrarSesion} style={{ display: 'flex', alignItems: 'center', gap: '6px', backgroundColor: '#dc2626', color: '#ffffff', border: 'none', padding: '8px 12px', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer', fontSize: '13px' }}>
            <LogOut size={16} /> Salir
          </button>
        )}
      </header>

      {/* 1. LOGIN CON PIN DE 4 DÍGITOS */}
      {!usuarioActual ? (
        <main style={{ maxWidth: '400px', margin: '40px auto', backgroundColor: '#ffffff', padding: '25px', borderRadius: '12px', border: '1px solid #cbd5e1', boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }}>
          <div style={{ textAlign: 'center', marginBottom: '20px' }}>
            <ShieldCheck size={48} style={{ color: '#0284c7', margin: '0 auto 10px' }} />
            <h2 style={{ margin: 0, color: '#0f172a', fontWeight: 'bold' }}>Ingreso de Operario</h2>
            <p style={{ color: '#334155', fontSize: '14px', marginTop: '5px' }}>Ingresa tu PIN personal de 4 dígitos</p>
          </div>

          {mensaje.texto && (
            <div style={{ padding: '10px', borderRadius: '6px', marginBottom: '15px', backgroundColor: mensaje.tipo === 'error' ? '#fee2e2' : '#dcfce7', color: mensaje.tipo === 'error' ? '#991b1b' : '#166534', fontWeight: 'bold', fontSize: '14px', textAlign: 'center' }}>
              {mensaje.texto}
            </div>
          )}

          <form onSubmit={autenticarConPIN} style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
            <input 
              type="password" 
              maxLength={4} 
              autoFocus 
              required 
              value={pin} 
              onChange={(e) => setPin(e.target.value)} 
              placeholder="****" 
              style={{ padding: '15px', fontSize: '28px', textAlign: 'center', letterSpacing: '12px', border: '2px solid #0284c7', borderRadius: '8px', color: '#0f172a', backgroundColor: '#ffffff', outline: 'none' }} 
            />

            <button type="submit" style={{ backgroundColor: '#0284c7', color: '#ffffff', border: 'none', padding: '14px', borderRadius: '8px', fontSize: '16px', fontWeight: 'bold', cursor: 'pointer', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px' }}>
              Entrar al Sistema <ArrowRight size={20} />
            </button>
          </form>
        </main>
      ) : (

      /* 2. REGISTRO DE PRODUCCIÓN CON LECTOR QR */
        <main style={{ maxWidth: '600px', margin: '0 auto' }}>
          
          <div style={{ backgroundColor: '#0284c7', color: '#ffffff', padding: '15px 20px', borderRadius: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px', boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }}>
            <div>
              <span style={{ fontSize: '13px', textTransform: 'uppercase', opacity: 0.9, fontWeight: 'bold' }}>Mi Ganancia Acumulada Hoy:</span>
              <h2 style={{ margin: 0, fontSize: '28px', fontWeight: 'bold', color: '#ffffff' }}>${pagoAcumuladoHoy} MXN</h2>
            </div>
            <DollarSign size={36} style={{ opacity: 0.8 }} />
          </div>

          {/* BOTÓN PRINCIPAL DE CÁMARA QR */}
          <button 
            onClick={() => setEscaneandoQR(true)} 
            style={{ width: '100%', backgroundColor: '#16a34a', color: '#ffffff', border: 'none', padding: '16px', borderRadius: '10px', fontSize: '18px', fontWeight: 'bold', cursor: 'pointer', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '10px', marginBottom: '15px', boxShadow: '0 4px 8px rgba(0,0,0,0.12)' }}
          >
            <Camera size={24} /> Escanear Boleto de Bulto con QR
          </button>

          {/* MODAL DE ESCANEO DE CÁMARA */}
          {escaneandoQR && (
            <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(15, 23, 42, 0.9)', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', zIndex: 2000, padding: '20px' }}>
              <div style={{ backgroundColor: '#ffffff', padding: '20px', borderRadius: '12px', width: '100%', maxWidth: '400px', textAlign: 'center' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
                  <h3 style={{ margin: 0, color: '#0f172a', fontWeight: 'bold' }}>Apunta la cámara al QR</h3>
                  <button onClick={() => setEscaneandoQR(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#dc2626' }}><X size={24} /></button>
                </div>
                
                <div id="reader" style={{ width: '100%', borderRadius: '8px', overflow: 'hidden' }}></div>
                <p style={{ color: '#64748b', fontSize: '13px', marginTop: '10px' }}>El sistema autocompletará la orden y el bulto en cuanto lo reconozca.</p>
              </div>
            </div>
          )}

          {mensaje.texto && (
            <div style={{
              padding: '12px 15px',
              borderRadius: '8px',
              marginBottom: '15px',
              backgroundColor: mensaje.tipo === 'error' ? '#fee2e2' : '#dcfce7',
              color: mensaje.tipo === 'error' ? '#991b1b' : '#14532d',
              border: `1px solid ${mensaje.tipo === 'error' ? '#fca5a5' : '#86efac'}`,
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              fontWeight: 'bold',
              fontSize: '14px'
            }}>
              {mensaje.tipo === 'error' ? <AlertTriangle size={24} /> : <CheckCircle2 size={24} />}
              <span>{mensaje.texto}</span>
            </div>
          )}

          <div style={{ backgroundColor: '#ffffff', padding: '20px', borderRadius: '12px', border: '1px solid #cbd5e1', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
            <h3 style={{ margin: '0 0 15px 0', color: '#0f172a', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <PackageCheck size={22} style={{ color: '#0284c7' }} /> Datos del Bulto
            </h3>

            <form onSubmit={registrarAvance} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              
              <div>
                <label style={{ fontSize: '14px', fontWeight: 'bold', color: '#0f172a', display: 'block', marginBottom: '4px' }}>1. Orden de Trabajo Activa:</label>
                <select required value={selectedOrden} onChange={(e) => handleOrdenChange(e.target.value)} style={{ width: '100%', padding: '12px', border: '1px solid #64748b', borderRadius: '6px', color: '#0f172a', backgroundColor: '#ffffff', fontSize: '15px' }}>
                  <option value="">-- Seleccionar Orden --</option>
                  {ordenes.map((o) => (
                    <option key={o.id} value={o.id}>{o.codigo_orden} - {o.cliente}</option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ fontSize: '14px', fontWeight: 'bold', color: '#0f172a', display: 'block', marginBottom: '4px' }}>2. Tela y Talla:</label>
                <select required disabled={!selectedOrden} value={selectedVariante} onChange={(e) => handleVarianteChange(e.target.value)} style={{ width: '100%', padding: '12px', border: '1px solid #64748b', borderRadius: '6px', color: '#0f172a', backgroundColor: '#ffffff', fontSize: '15px' }}>
                  <option value="">-- Seleccionar Tela / Talla --</option>
                  {variantes.map((v) => (
                    <option key={v.id} value={v.id}>Tela: {v.codigo_tela} | Talla: {v.talla}</option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ fontSize: '14px', fontWeight: 'bold', color: '#0f172a', display: 'block', marginBottom: '4px' }}>3. Número de Bulto / Atado:</label>
                <select required disabled={!selectedVariante} value={selectedBulto} onChange={(e) => setSelectedBulto(e.target.value)} style={{ width: '100%', padding: '12px', border: '1px solid #64748b', borderRadius: '6px', color: '#0f172a', backgroundColor: '#ffffff', fontSize: '15px' }}>
                  <option value="">-- Seleccionar Bulto --</option>
                  {bultos.map((b) => (
                    <option key={b.id} value={b.id}>Bulto #{b.numero_bulto} ({b.cantidad_piezas} piezas programadas)</option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ fontSize: '14px', fontWeight: 'bold', color: '#0f172a', display: 'block', marginBottom: '4px' }}>4. Área / Proceso Elaborado:</label>
                <select required value={selectedEtapa} onChange={(e) => setSelectedEtapa(e.target.value)} style={{ width: '100%', padding: '12px', border: '1px solid #64748b', borderRadius: '6px', color: '#0f172a', backgroundColor: '#ffffff', fontSize: '15px' }}>
                  <option value="">-- Seleccionar Área --</option>
                  {etapas.map((e) => (
                    <option key={e.id} value={e.id}>{e.orden_secuencia}. {e.nombre} (${e.tarifa_destajo} MXN/pza)</option>
                  ))}
                </select>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ fontSize: '14px', fontWeight: 'bold', color: '#16a34a', display: 'block', marginBottom: '4px' }}>Piezas Buenas:</label>
                  <input type="number" min="0" required value={cantidadBuenas} onChange={(e) => setCantidadBuenas(e.target.value)} placeholder="0" style={{ width: '100%', padding: '12px', border: '2px solid #16a34a', borderRadius: '6px', color: '#0f172a', backgroundColor: '#ffffff', fontSize: '18px', fontWeight: 'bold' }} />
                </div>

                <div>
                  <label style={{ fontSize: '14px', fontWeight: 'bold', color: '#dc2626', display: 'block', marginBottom: '4px' }}>Mermas / Defectos:</label>
                  <input type="number" min="0" required value={cantidadMerma} onChange={(e) => setCantidadMerma(e.target.value)} placeholder="0" style={{ width: '100%', padding: '12px', border: '2px solid #dc2626', borderRadius: '6px', color: '#0f172a', backgroundColor: '#ffffff', fontSize: '18px', fontWeight: 'bold' }} />
                </div>
              </div>

              {parseInt(cantidadMerma) > 0 && (
                <div>
                  <label style={{ fontSize: '14px', fontWeight: 'bold', color: '#dc2626', display: 'block', marginBottom: '4px' }}>Motivo / Explicación de la Merma:</label>
                  <input required value={motivoMerma} onChange={(e) => setMotivoMerma(e.target.value)} placeholder="Ej. Tela manchada de origen, mala costura, etc." style={{ width: '100%', padding: '12px', border: '1px solid #dc2626', borderRadius: '6px', color: '#0f172a', backgroundColor: '#ffffff', fontSize: '14px' }} />
                </div>
              )}

              <button 
                type="submit" 
                disabled={loading}
                style={{
                  padding: '14px',
                  backgroundColor: '#0284c7',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontWeight: 'bold',
                  fontSize: '16px',
                  marginTop: '10px',
                  boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
                }}
              >
                {loading ? 'Validando con Servidor...' : 'Guardar y Validar Producción'}
              </button>

            </form>
          </div>
        </main>
      )}
    </div>
  );
}