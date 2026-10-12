'use client';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { QRCodeSVG } from 'qrcode.react';
import { 
  Factory, Users, DollarSign, Package, AlertTriangle, 
  PlusCircle, RefreshCw, BarChart3, Receipt, Calendar, Clock,
  Edit2, Trash2, X, Check, Search, UserCheck, Printer, Ban, AlertOctagon
} from 'lucide-react';

export default function AdminDashboard() {
  const [seccion, setSeccion] = useState('dashboard');
  const [ordenes, setOrdenes] = useState([]);
  const [usuarios, setUsuarios] = useState([]);
  const [etapas, setEtapas] = useState([]);
  const [avancePorEtapas, setAvancePorEtapas] = useState({});
  const [mermasRecientes, setMermasRecientes] = useState([]);
  const [registrosNomina, setRegistrosNomina] = useState([]);
  const [filtroFecha, setFiltroFecha] = useState('todos');
  const [filtroUsuario, setFiltroUsuario] = useState('');
  const [busquedaOperario, setBusquedaOperario] = useState('');
  const [loading, setLoading] = useState(false);

  // Formulario Orden
  const [codigoOrden, setCodigoOrden] = useState('');
  const [cliente, setCliente] = useState('');
  const [detalles, setDetalles] = useState('');
  const [codigoTela, setCodigoTela] = useState('');
  const [talla, setTalla] = useState('M');
  const [piezasTotales, setPiezasTotales] = useState('');
  const [piezasPorBulto, setPiezasPorBulto] = useState('24');

  // Modal Impresión QR
  const [ordenSeleccionadaQR, setOrdenSeleccionadaQR] = useState(null);

  // Formulario Operario (Crear)
  const [nombreOp, setNombreOp] = useState('');
  const [pinOp, setPinOp] = useState('');
  const [rolOp, setRolOp] = useState('operario');

  // Estado para Edición de Operario
  const [usuarioEditando, setUsuarioEditando] = useState(null);
  const [editNombre, setEditNombre] = useState('');
  const [editPin, setEditPin] = useState('');
  const [editRol, setEditRol] = useState('operario');

  useEffect(() => {
    cargarTodo();
  }, [filtroFecha]);

  async function cargarTodo() {
    setLoading(true);

    const { data: ords } = await supabase.from('ordenes_trabajo').select('*, variantes_corte(*, bultos(*))').order('created_at', { ascending: false });
    const { data: usrs } = await supabase.from('usuarios').select('*').order('nombre');
    const { data: etps } = await supabase.from('etapas_produccion').select('*').order('orden_secuencia');
    const { data: merms } = await supabase.from('registros_avance').select('*, usuarios(nombre), etapas_produccion(nombre), bultos(numero_bulto, variantes_corte(codigo_tela, ordenes_trabajo(codigo_orden)))').gt('cantidad_merma', 0).order('created_at', { ascending: false }).limit(10);
    const { data: registros } = await supabase.from('registros_avance').select('bulto_id, etapa_id, cantidad_buenas');

    const avanceMap = {};
    if (registros) {
      registros.forEach((r) => {
        const key = `${r.bulto_id}_${r.etapa_id}`;
        avanceMap[key] = (avanceMap[key] || 0) + (r.cantidad_buenas || 0);
      });
    }

    let queryNomina = supabase.from('registros_avance').select('*, usuarios(nombre, rol), etapas_produccion(nombre), bultos(numero_bulto, variantes_corte(codigo_tela, ordenes_trabajo(codigo_orden)))').order('created_at', { ascending: false });
    
    if (filtroFecha === 'hoy') {
      const hoy = new Date().toISOString().split('T')[0];
      queryNomina = queryNomina.gte('created_at', hoy);
    } else if (filtroFecha === 'semana') {
      const hace7Dias = new Date();
      hace7Dias.setDate(hace7Dias.getDate() - 7);
      queryNomina = queryNomina.gte('created_at', hace7Dias.toISOString());
    }

    const { data: dataNomina } = await queryNomina;

    setOrdenes(ords || []);
    setUsuarios(usrs || []);
    setEtapas(etps || []);
    setMermasRecientes(merms || []);
    setAvancePorEtapas(avanceMap);
    setRegistrosNomina(dataNomina || []);
    setLoading(false);
  }

  async function guardarNuevaOrden(e) {
    e.preventDefault();
    setLoading(true);

    const { data: ord, error: err1 } = await supabase.from('ordenes_trabajo').insert([{ codigo_orden: codigoOrden, cliente, detalles_extra: detalles, estado: 'activa' }]).select().single();
    if (err1) return alert('Error al crear orden: ' + err1.message);

    const totalPzas = parseInt(piezasTotales);
    const { data: varCorte, error: err2 } = await supabase.from('variantes_corte').insert([{ orden_id: ord.id, codigo_tela: codigoTela, talla, cantidad_programada: totalPzas }]).select().single();
    if (err2) return alert('Error al crear variante: ' + err2.message);

    const pzaBulto = parseInt(piezasPorBulto);
    const numBultosCompletos = Math.floor(totalPzas / pzaBulto);
    const residuo = totalPzas % pzaBulto;
    const bultosAInsertar = [];

    for (let i = 1; i <= numBultosCompletos; i++) {
      bultosAInsertar.push({ variante_id: varCorte.id, numero_bulto: i, cantidad_piezas: pzaBulto });
    }
    if (residuo > 0) {
      bultosAInsertar.push({ variante_id: varCorte.id, numero_bulto: numBultosCompletos + 1, cantidad_piezas: residuo });
    }

    const { error: err3 } = await supabase.from('bultos').insert(bultosAInsertar);
    if (err3) return alert('Error al generar bultos: ' + err3.message);

    alert(`¡Orden creada exitosamente! Se generaron ${bultosAInsertar.length} bultos para producción.`);
    setCodigoOrden(''); setCliente(''); setDetalles(''); setCodigoTela(''); setPiezasTotales('');
    cargarTodo();
    setSeccion('dashboard');
  }

  // FUNCIONES PARA CANCELAR Y ELIMINAR ÓRDENES
  async function cancelarOrden(id, codigo) {
    const confirmar = confirm(`¿Deseas cambiar el estado de la orden "${codigo}" a CANCELADA?\nLos operarios ya no podrán registrarle más bultos.`);
    if (!confirmar) return;

    setLoading(true);
    const { error } = await supabase
      .from('ordenes_trabajo')
      .update({ estado: 'cancelada' })
      .eq('id', id);

    setLoading(false);
    if (error) {
      alert('Error al cancelar la orden: ' + error.message);
    } else {
      alert(`La orden ${codigo} ha sido marcada como Cancelada.`);
      cargarTodo();
    }
  }

  async function reactivarOrden(id, codigo) {
    setLoading(true);
    const { error } = await supabase
      .from('ordenes_trabajo')
      .update({ estado: 'activa' })
      .eq('id', id);

    setLoading(false);
    if (error) {
      alert('Error al reactivar la orden: ' + error.message);
    } else {
      alert(`La orden ${codigo} ha sido reactivada.`);
      cargarTodo();
    }
  }

  async function eliminarOrden(id, codigo) {
    const confirmacion1 = confirm(`⚠️ ATENCIÓN: ¿Estás seguro de ELIMINAR PERMANENTEMENTE la orden "${codigo}"?\nSe eliminarán sus variantes y bultos asociados.`);
    if (!confirmacion1) return;

    const confirmacion2 = prompt(`Escribe "${codigo}" para confirmar la eliminación definitiva:`);
    if (confirmacion2 !== codigo) {
      return alert('Confirmación no coincide. Eliminación cancelada.');
    }

    setLoading(true);
    const { error } = await supabase
      .from('ordenes_trabajo')
      .delete()
      .eq('id', id);

    setLoading(false);
    if (error) {
      alert('Error al eliminar la orden: ' + error.message);
    } else {
      alert(`La orden ${codigo} fue eliminada permanentemente.`);
      cargarTodo();
    }
  }

  async function crearUsuario(e) {
    e.preventDefault();
    if (pinOp.length !== 4) return alert('El PIN debe ser exactamente de 4 dígitos');

    const { error } = await supabase.from('usuarios').insert([{ nombre: nombreOp, pin_4_digitos: pinOp, rol: rolOp }]);
    if (error) return alert('Error al crear usuario: ' + error.message);

    alert('Usuario registrado con éxito');
    setNombreOp(''); setPinOp('');
    cargarTodo();
  }

  function iniciarEdicionUsuario(u) {
    setUsuarioEditando(u);
    setEditNombre(u.nombre);
    setEditPin(u.pin_4_digitos);
    setEditRol(u.rol);
  }

  async function guardarEdicionUsuario(e) {
    e.preventDefault();
    if (editPin.length !== 4) return alert('El PIN debe ser de 4 dígitos');

    const { error } = await supabase
      .from('usuarios')
      .update({ nombre: editNombre, pin_4_digitos: editPin, rol: editRol })
      .eq('id', usuarioEditando.id);

    if (error) {
      alert('Error al actualizar usuario: ' + error.message);
    } else {
      alert('Usuario actualizado correctamente');
      setUsuarioEditando(null);
      cargarTodo();
    }
  }

  async function eliminarUsuario(id, nombre) {
    const confirmar = confirm(`¿Estás seguro de que deseas eliminar al operario "${nombre}"?`);
    if (!confirmar) return;

    const { error } = await supabase.from('usuarios').delete().eq('id', id);
    if (error) alert('Error al eliminar usuario: ' + error.message);
    else cargarTodo();
  }

  async function actualizarTarifa(id, nuevaTarifa) {
    await supabase.from('etapas_produccion').update({ tarifa_destajo: parseFloat(nuevaTarifa) }).eq('id', id);
    cargarTodo();
  }

  function calcularTotalArea(variantes, etapaId) {
    let totalBuenas = 0;
    variantes.forEach((v) => {
      v.bultos.forEach((b) => {
        const key = `${b.id}_${etapaId}`;
        totalBuenas += avancePorEtapas[key] || 0;
      });
    });
    return totalBuenas;
  }

  const registrosNominaFiltrados = registrosNomina.filter((item) => {
    const coincideUsuarioSelect = filtroUsuario ? item.usuario_id === filtroUsuario : true;
    const nombreOperario = item.usuarios?.nombre?.toLowerCase() || '';
    const coincideBusquedaText = busquedaOperario ? nombreOperario.includes(busquedaOperario.toLowerCase()) : true;
    return coincideUsuarioSelect && coincideBusquedaText;
  });

  const granTotalNomina = registrosNominaFiltrados.reduce((sum, item) => sum + (parseFloat(item.pago_calculado) || 0), 0);
  const totalPiezasFiltradas = registrosNominaFiltrados.reduce((sum, item) => sum + (parseInt(item.cantidad_buenas) || 0), 0);

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f1f5f9', fontFamily: 'system-ui, sans-serif', color: '#0f172a' }}>
      {/* Navbar Superior */}
      <nav style={{ backgroundColor: '#0f172a', color: '#ffffff', padding: '15px 30px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Factory size={28} style={{ color: '#38bdf8' }} />
          <h1 style={{ margin: 0, fontSize: '20px', color: '#ffffff', fontWeight: 'bold' }}>MaquilaControl - Panel del Dueño</h1>
        </div>
        <button onClick={cargarTodo} style={{ display: 'flex', alignItems: 'center', gap: '6px', background: '#1e293b', border: '1px solid #475569', color: '#ffffff', padding: '8px 12px', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>
          <RefreshCw size={16} /> Refrescar Datos
        </button>
      </nav>

      {/* Submenu Nivel Superior */}
      <div style={{ backgroundColor: '#ffffff', borderBottom: '2px solid #cbd5e1', padding: '10px 30px', display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
        <TabButton activo={seccion === 'dashboard'} onClick={() => setSeccion('dashboard')} icon={<Package size={18} />} label="Avance por Áreas" />
        <TabButton activo={seccion === 'nomina'} onClick={() => setSeccion('nomina')} icon={<Receipt size={18} />} label="Nómina y Destajos" />
        <TabButton activo={seccion === 'nueva_orden'} onClick={() => setSeccion('nueva_orden')} icon={<PlusCircle size={18} />} label="Programar Orden" />
        <TabButton activo={seccion === 'mermas'} onClick={() => setSeccion('mermas')} icon={<AlertTriangle size={18} />} label="Mermas e Inspección" />
        <TabButton activo={seccion === 'tarifas'} onClick={() => setSeccion('tarifas')} icon={<DollarSign size={18} />} label="Tarifas / Destajo" />
        <TabButton activo={seccion === 'usuarios'} onClick={() => setSeccion('usuarios')} icon={<Users size={18} />} label="Operarios y PINs" />
      </div>

      <main style={{ padding: '30px', maxWidth: '1200px', margin: '0 auto' }}>
        {loading && <p style={{ color: '#1e293b', fontWeight: 'bold' }}>Cargando información del sistema...</p>}

        {/* 1. DASHBOARD GENERAL */}
        {seccion === 'dashboard' && (
          <div>
            <h2 style={{ color: '#0f172a', fontWeight: 'bold' }}>Avance Real en Tiempo Real por Áreas de Producción</h2>
            <div style={{ display: 'grid', gap: '25px', marginTop: '20px' }}>
              {ordenes.map((o) => {
                const totalPiezasOrden = o.variantes_corte.reduce((sum, v) => sum + v.cantidad_programada, 0);
                const esCancelada = o.estado === 'cancelada';

                return (
                  <div key={o.id} style={{ backgroundColor: esCancelada ? '#fef2f2' : '#ffffff', border: `1px solid ${esCancelada ? '#fca5a5' : '#cbd5e1'}`, borderRadius: '10px', padding: '20px', boxShadow: '0 2px 6px rgba(0,0,0,0.06)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '2px solid #f1f5f9', paddingBottom: '12px', flexWrap: 'wrap', gap: '10px' }}>
                      <div>
                        <h3 style={{ margin: 0, color: esCancelada ? '#991b1b' : '#0f172a', fontWeight: 'bold', fontSize: '18px', textDecoration: esCancelada ? 'line-through' : 'none' }}>{o.codigo_orden}</h3>
                        <span style={{ color: '#475569', fontSize: '14px', fontWeight: '500' }}>Cliente: <strong style={{ color: '#0f172a' }}>{o.cliente}</strong> | Meta Total: <strong style={{ color: '#0284c7' }}>{totalPiezasOrden} Piezas</strong></span>
                      </div>

                      {/* BOTONES DE GESTIÓN DE ORDEN (IMPRIMIR, CANCELAR, ELIMINAR) */}
                      <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                        <button onClick={() => setOrdenSeleccionadaQR(o)} style={{ backgroundColor: '#0284c7', color: '#fff', border: 'none', padding: '6px 12px', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px' }}>
                          <Printer size={15} /> Imprimir Boletos QR
                        </button>

                        {!esCancelada ? (
                          <button onClick={() => cancelarOrden(o.id, o.codigo_orden)} style={{ backgroundColor: '#eab308', color: '#ffffff', border: 'none', padding: '6px 12px', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px' }}>
                            <Ban size={15} /> Cancelar Orden
                          </button>
                        ) : (
                          <button onClick={() => reactivarOrden(o.id, o.codigo_orden)} style={{ backgroundColor: '#16a34a', color: '#ffffff', border: 'none', padding: '6px 12px', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px' }}>
                            <Check size={15} /> Reactivar Orden
                          </button>
                        )}

                        <button onClick={() => eliminarOrden(o.id, o.codigo_orden)} style={{ backgroundColor: '#dc2626', color: '#ffffff', border: 'none', padding: '6px 12px', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px' }}>
                          <Trash2 size={15} /> Eliminar
                        </button>

                        <span style={{ backgroundColor: esCancelada ? '#fee2e2' : '#dcfce7', color: esCancelada ? '#991b1b' : '#14532d', padding: '6px 14px', borderRadius: '20px', fontSize: '12px', fontWeight: 'bold', border: `1px solid ${esCancelada ? '#fca5a5' : '#86efac'}` }}>
                          {o.estado.toUpperCase()}
                        </span>
                      </div>
                    </div>

                    <div style={{ marginTop: '20px' }}>
                      <h4 style={{ fontSize: '15px', color: '#0f172a', marginBottom: '12px', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <BarChart3 size={18} style={{ color: '#0284c7' }} /> Avance Acumulado por Área / Proceso:
                      </h4>

                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px' }}>
                        {etapas.map((et) => {
                          const registradas = calcularTotalArea(o.variantes_corte, et.id);
                          const porcentaje = totalPiezasOrden > 0 ? Math.min(Math.round((registradas / totalPiezasOrden) * 100), 100) : 0;

                          return (
                            <div key={et.id} style={{ backgroundColor: '#f8fafc', border: '1px solid #cbd5e1', padding: '12px', borderRadius: '8px' }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', fontWeight: 'bold', color: '#0f172a', marginBottom: '6px' }}>
                                <span>{et.orden_secuencia}. {et.nombre}</span>
                                <span>{porcentaje}%</span>
                              </div>

                              <div style={{ fontSize: '16px', fontWeight: 'bold', color: registradas > 0 ? '#0284c7' : '#94a3b8', marginBottom: '8px' }}>
                                {registradas} / {totalPiezasOrden} <span style={{ fontSize: '12px', fontWeight: 'normal', color: '#64748b' }}>pzas</span>
                              </div>

                              <div style={{ width: '100%', backgroundColor: '#e2e8f0', height: '8px', borderRadius: '4px', overflow: 'hidden' }}>
                                <div style={{ width: `${porcentaje}%`, backgroundColor: porcentaje === 100 ? '#16a34a' : '#0284c7', height: '100%', transition: 'width 0.3s' }} />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* 2. NÓMINA Y DESTAJOS */}
        {seccion === 'nomina' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px', flexWrap: 'wrap', gap: '10px' }}>
              <div>
                <h2 style={{ color: '#0f172a', fontWeight: 'bold', margin: 0 }}>Cálculo de Nómina y Destajos</h2>
                <p style={{ color: '#475569', fontSize: '14px', margin: '4px 0 0 0' }}>Filtra o busca por operario para conocer su pago exacto acumulado.</p>
              </div>

              <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', backgroundColor: '#ffffff', padding: '6px 12px', borderRadius: '8px', border: '1px solid #cbd5e1' }}>
                  <Search size={16} style={{ color: '#0284c7' }} />
                  <input type="text" placeholder="Buscar por operario..." value={busquedaOperario} onChange={(e) => setBusquedaOperario(e.target.value)} style={{ border: 'none', outline: 'none', color: '#0f172a', fontWeight: 'bold', fontSize: '14px', width: '160px' }} />
                  {busquedaOperario && <button onClick={() => setBusquedaOperario('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', padding: 0 }}><X size={14} /></button>}
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', backgroundColor: '#ffffff', padding: '6px 12px', borderRadius: '8px', border: '1px solid #cbd5e1' }}>
                  <UserCheck size={16} style={{ color: '#0284c7' }} />
                  <select value={filtroUsuario} onChange={(e) => setFiltroUsuario(e.target.value)} style={{ padding: '4px', border: 'none', outline: 'none', fontWeight: 'bold', color: '#0f172a', backgroundColor: '#ffffff' }}>
                    <option value="">-- Todos los Operarios --</option>
                    {usuarios.map((u) => (<option key={u.id} value={u.id}>{u.nombre}</option>))}
                  </select>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', backgroundColor: '#ffffff', padding: '6px 12px', borderRadius: '8px', border: '1px solid #cbd5e1' }}>
                  <Calendar size={16} style={{ color: '#0284c7' }} />
                  <select value={filtroFecha} onChange={(e) => setFiltroFecha(e.target.value)} style={{ padding: '4px', border: 'none', outline: 'none', fontWeight: 'bold', color: '#0f172a', backgroundColor: '#ffffff' }}>
                    <option value="hoy">Únicamente Hoy</option>
                    <option value="semana">Última Semana (7 Días)</option>
                    <option value="todos">Acumulado Histórico</option>
                  </select>
                </div>
              </div>
            </div>

            <div style={{ backgroundColor: '#0284c7', color: '#ffffff', padding: '20px', borderRadius: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', boxShadow: '0 2px 6px rgba(0,0,0,0.08)' }}>
              <div>
                <span style={{ fontSize: '13px', textTransform: 'uppercase', fontWeight: 'bold', opacity: 0.9 }}>
                  {filtroUsuario || busquedaOperario ? 'Total a Pagar para Operario Filtrado:' : 'Gran Total a Pagar en Planta:'}
                </span>
                <h2 style={{ margin: 0, fontSize: '32px', fontWeight: 'bold', color: '#ffffff' }}>${granTotalNomina.toFixed(2)} MXN</h2>
                <span style={{ fontSize: '13px', opacity: 0.9 }}>Piezas elaboradas acumuladas: <strong>{totalPiezasFiltradas} pzas</strong></span>
              </div>
              <DollarSign size={48} style={{ opacity: 0.8 }} />
            </div>

            <div style={{ backgroundColor: '#ffffff', border: '1px solid #cbd5e1', borderRadius: '8px', overflow: 'hidden', boxShadow: '0 2px 4px rgba(0,0,0,0.06)' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '14px', color: '#0f172a' }}>
                <thead style={{ backgroundColor: '#e2e8f0', borderBottom: '2px solid #cbd5e1' }}>
                  <tr>
                    <th style={{ padding: '14px', color: '#0f172a', fontWeight: 'bold' }}>Fecha y Hora Exacta</th>
                    <th style={{ padding: '14px', color: '#0f172a', fontWeight: 'bold' }}>Operario</th>
                    <th style={{ padding: '14px', color: '#0f172a', fontWeight: 'bold' }}>Orden / Bulto</th>
                    <th style={{ padding: '14px', color: '#0f172a', fontWeight: 'bold' }}>Área / Proceso</th>
                    <th style={{ padding: '14px', color: '#0f172a', fontWeight: 'bold' }}>Piezas Buenas</th>
                    <th style={{ padding: '14px', color: '#0f172a', fontWeight: 'bold' }}>Pago Generado ($)</th>
                  </tr>
                </thead>
                <tbody>
                  {registrosNominaFiltrados.length === 0 ? (
                    <tr><td colSpan="6" style={{ padding: '25px', textAlign: 'center', color: '#475569', fontWeight: 'bold' }}>No se encontraron registros de producción.</td></tr>
                  ) : (
                    registrosNominaFiltrados.map((item) => {
                      const fechaObj = new Date(item.created_at);
                      return (
                        <tr key={item.id} style={{ borderBottom: '1px solid #e2e8f0' }}>
                          <td style={{ padding: '14px', color: '#0f172a', fontWeight: 'bold' }}>
                            {fechaObj.toLocaleDateString()} <span style={{ color: '#0284c7', marginLeft: '6px' }}>{fechaObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
                          </td>
                          <td style={{ padding: '14px', color: '#0f172a', fontWeight: 'bold' }}>{item.usuarios?.nombre || 'Desconocido'}</td>
                          <td style={{ padding: '14px', color: '#334155' }}>{item.bultos?.variantes_corte?.ordenes_trabajo?.codigo_orden || 'Sin Orden'} (Bulto #{item.bultos?.numero_bulto || '-'})</td>
                          <td style={{ padding: '14px', color: '#334155' }}>{item.etapas_produccion?.nombre || 'General'}</td>
                          <td style={{ padding: '14px', color: '#0284c7', fontWeight: 'bold' }}>{item.cantidad_buenas} pzas</td>
                          <td style={{ padding: '14px', color: '#16a34a', fontWeight: 'bold', fontSize: '16px' }}>${parseFloat(item.pago_calculado).toFixed(2)} MXN</td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* MODAL DE IMPRESIÓN DE BOLETOS QR */}
        {ordenSeleccionadaQR && (
          <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(15, 23, 42, 0.85)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000, padding: '20px' }}>
            <div style={{ backgroundColor: '#ffffff', padding: '25px', borderRadius: '12px', width: '100%', maxWidth: '700px', maxHeight: '90vh', overflowY: 'auto' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '2px solid #e2e8f0', paddingBottom: '12px', marginBottom: '20px' }}>
                <div>
                  <h3 style={{ margin: 0, color: '#0f172a', fontWeight: 'bold' }}>Boletos de Bulto con Código QR</h3>
                  <span style={{ fontSize: '14px', color: '#0284c7', fontWeight: 'bold' }}>{ordenSeleccionadaQR.codigo_orden} - {ordenSeleccionadaQR.cliente}</span>
                </div>
                <button onClick={() => setOrdenSeleccionadaQR(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b' }}><X size={24} /></button>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '15px' }}>
                {ordenSeleccionadaQR.variantes_corte?.map((v) => 
                  v.bultos?.map((b) => (
                    <div key={b.id} style={{ border: '2px dashed #0284c7', padding: '15px', borderRadius: '8px', textAlign: 'center', backgroundColor: '#f8fafc' }}>
                      <h4 style={{ margin: '0 0 4px 0', fontSize: '16px', color: '#0f172a', fontWeight: 'bold' }}>Bulto #{b.numero_bulto}</h4>
                      <p style={{ margin: '0 0 8px 0', fontSize: '12px', color: '#475569' }}>Tela: {v.codigo_tela} | Talla: {v.talla}</p>
                      
                      <div style={{ padding: '8px', background: '#ffffff', display: 'inline-block', borderRadius: '6px', margin: '6px 0', border: '1px solid #e2e8f0' }}>
                        <QRCodeSVG value={b.id} size={130} />
                      </div>
                      
                      <div style={{ marginTop: '4px', fontSize: '14px', fontWeight: 'bold', color: '#16a34a' }}>{b.cantidad_piezas} PIEZAS</div>
                      <span style={{ fontSize: '10px', color: '#94a3b8', wordBreak: 'break-all' }}>ID: {b.id.substring(0, 8)}...</span>
                    </div>
                  ))
                )}
              </div>

              <button onClick={() => window.print()} style={{ marginTop: '20px', width: '100%', backgroundColor: '#16a34a', color: '#fff', border: 'none', padding: '14px', borderRadius: '8px', fontWeight: 'bold', fontSize: '16px', cursor: 'pointer', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px' }}>
                <Printer size={20} /> Imprimir Etiquetas para Taller
              </button>
            </div>
          </div>
        )}

        {/* 3. PROGRAMAR NUEVA ORDEN */}
        {seccion === 'nueva_orden' && (
          <div style={{ backgroundColor: '#ffffff', padding: '25px', borderRadius: '8px', border: '1px solid #cbd5e1', maxWidth: '600px' }}>
            <h2 style={{ color: '#0f172a', fontWeight: 'bold' }}>Programar Orden e Imprimir Bultos</h2>
            <form onSubmit={guardarNuevaOrden} style={{ display: 'flex', flexDirection: 'column', gap: '15px', marginTop: '15px' }}>
              <div>
                <label style={{ fontSize: '14px', fontWeight: 'bold', color: '#0f172a' }}>Código / Folio de Orden:</label>
                <input required value={codigoOrden} onChange={(e) => setCodigoOrden(e.target.value)} placeholder="Ej. #073 CAMISA M/L" style={{ width: '100%', padding: '10px', marginTop: '4px', border: '1px solid #64748b', borderRadius: '4px', color: '#0f172a', backgroundColor: '#ffffff' }} />
              </div>
              <div>
                <label style={{ fontSize: '14px', fontWeight: 'bold', color: '#0f172a' }}>Cliente:</label>
                <input required value={cliente} onChange={(e) => setCliente(e.target.value)} placeholder="Ej. FRANK + PORTER" style={{ width: '100%', padding: '10px', marginTop: '4px', border: '1px solid #64748b', borderRadius: '4px', color: '#0f172a', backgroundColor: '#ffffff' }} />
              </div>
              <div>
                <label style={{ fontSize: '14px', fontWeight: 'bold', color: '#0f172a' }}>Detalles / Especificaciones Especiales:</label>
                <input value={detalles} onChange={(e) => setDetalles(e.target.value)} placeholder="Ej. Bordado en puños" style={{ width: '100%', padding: '10px', marginTop: '4px', border: '1px solid #64748b', borderRadius: '4px', color: '#0f172a', backgroundColor: '#ffffff' }} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div>
                  <label style={{ fontSize: '14px', fontWeight: 'bold', color: '#0f172a' }}>Código de Tela:</label>
                  <input required value={codigoTela} onChange={(e) => setCodigoTela(e.target.value)} placeholder="Ej. FP 1069" style={{ width: '100%', padding: '10px', marginTop: '4px', border: '1px solid #64748b', borderRadius: '4px', color: '#0f172a', backgroundColor: '#ffffff' }} />
                </div>
                <div>
                  <label style={{ fontSize: '14px', fontWeight: 'bold', color: '#0f172a' }}>Talla:</label>
                  <select value={talla} onChange={(e) => setTalla(e.target.value)} style={{ width: '100%', padding: '10px', marginTop: '4px', border: '1px solid #64748b', borderRadius: '4px', color: '#0f172a', backgroundColor: '#ffffff' }}>
                    <option value="XCH">XCH</option>
                    <option value="CH">CH</option>
                    <option value="M">M</option>
                    <option value="G">G</option>
                    <option value="EG">EG</option>
                  </select>
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div>
                  <label style={{ fontSize: '14px', fontWeight: 'bold', color: '#0f172a' }}>Piezas Totales a Cortar:</label>
                  <input type="number" required value={piezasTotales} onChange={(e) => setPiezasTotales(e.target.value)} placeholder="Ej. 244" style={{ width: '100%', padding: '10px', marginTop: '4px', border: '1px solid #64748b', borderRadius: '4px', color: '#0f172a', backgroundColor: '#ffffff' }} />
                </div>
                <div>
                  <label style={{ fontSize: '14px', fontWeight: 'bold', color: '#0f172a' }}>Tamaño Estándar de Bulto:</label>
                  <input type="number" required value={piezasPorBulto} onChange={(e) => setPiezasPorBulto(e.target.value)} style={{ width: '100%', padding: '10px', marginTop: '4px', border: '1px solid #64748b', borderRadius: '4px', color: '#0f172a', backgroundColor: '#ffffff' }} />
                </div>
              </div>
              <button type="submit" style={{ backgroundColor: '#0284c7', color: '#ffffff', border: 'none', padding: '12px', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer', marginTop: '10px', fontSize: '15px' }}>
                Generar Orden y Bultos Automáticos
              </button>
            </form>
          </div>
        )}

        {/* 4. INSPECCIÓN DE MERMAS */}
        {seccion === 'mermas' && (
          <div>
            <h2 style={{ color: '#0f172a', fontWeight: 'bold' }}>Reporte Reciente de Mermas y Telas Defectuosas</h2>
            <div style={{ backgroundColor: '#ffffff', border: '1px solid #cbd5e1', borderRadius: '8px', overflow: 'hidden', marginTop: '15px' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '14px', color: '#0f172a' }}>
                <thead style={{ backgroundColor: '#e2e8f0', borderBottom: '2px solid #cbd5e1' }}>
                  <tr>
                    <th style={{ padding: '12px', color: '#0f172a', fontWeight: 'bold' }}>Fecha</th>
                    <th style={{ padding: '12px', color: '#0f172a', fontWeight: 'bold' }}>Operario</th>
                    <th style={{ padding: '12px', color: '#0f172a', fontWeight: 'bold' }}>Orden / Bulto</th>
                    <th style={{ padding: '12px', color: '#0f172a', fontWeight: 'bold' }}>Área Detectada</th>
                    <th style={{ padding: '12px', color: '#0f172a', fontWeight: 'bold' }}>Cant. Merma</th>
                    <th style={{ padding: '12px', color: '#0f172a', fontWeight: 'bold' }}>Motivo Explicado</th>
                  </tr>
                </thead>
                <tbody>
                  {mermasRecientes.length === 0 ? (
                    <tr><td colSpan="6" style={{ padding: '20px', textAlign: 'center', color: '#475569', fontWeight: 'bold' }}>No hay reporte de mermas registradas.</td></tr>
                  ) : (
                    mermasRecientes.map((m) => (
                      <tr key={m.id} style={{ borderBottom: '1px solid #e2e8f0' }}>
                        <td style={{ padding: '12px', color: '#334155' }}>{new Date(m.created_at).toLocaleDateString()}</td>
                        <td style={{ padding: '12px', color: '#0f172a' }}><strong>{m.usuarios?.nombre}</strong></td>
                        <td style={{ padding: '12px', color: '#334155' }}>{m.bultos?.variantes_corte?.ordenes_trabajo?.codigo_orden} (Bulto #{m.bultos?.numero_bulto})</td>
                        <td style={{ padding: '12px', color: '#334155' }}>{m.etapas_produccion?.nombre}</td>
                        <td style={{ padding: '12px', color: '#dc2626', fontWeight: 'bold' }}>{m.cantidad_merma} pzas</td>
                        <td style={{ padding: '12px', color: '#334155' }}>{m.motivo_merma || 'Sin detalle'}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* 5. TARIFAS Y DESTAJOS */}
        {seccion === 'tarifas' && (
          <div style={{ backgroundColor: '#ffffff', padding: '25px', borderRadius: '8px', border: '1px solid #cbd5e1', maxWidth: '600px' }}>
            <h2 style={{ color: '#0f172a', fontWeight: 'bold' }}>Configuración de Tarifas por Destajo ($ / Pieza)</h2>
            <p style={{ color: '#334155', fontSize: '14px', fontWeight: '500' }}>El sistema calcula automáticamente la nómina del operario al multiplicar sus piezas buenas por estas tarifas.</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '15px' }}>
              {etapas.map((et) => (
                <div key={et.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px', backgroundColor: '#f8fafc', borderRadius: '6px', border: '1px solid #cbd5e1' }}>
                  <span style={{ color: '#0f172a', fontWeight: 'bold' }}>{et.orden_secuencia}. {et.nombre}</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ color: '#0f172a', fontWeight: 'bold' }}>$</span>
                    <input type="number" step="0.10" defaultValue={et.tarifa_destajo} onBlur={(e) => actualizarTarifa(et.id, e.target.value)} style={{ width: '90px', padding: '8px', border: '1px solid #64748b', borderRadius: '4px', color: '#0f172a', fontWeight: 'bold', backgroundColor: '#ffffff' }} />
                    <span style={{ fontSize: '13px', color: '#334155', fontWeight: 'bold' }}>MXN/pza</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 6. GESTIÓN DE OPERARIOS */}
        {seccion === 'usuarios' && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
            <div style={{ backgroundColor: '#ffffff', padding: '20px', borderRadius: '8px', border: '1px solid #cbd5e1' }}>
              <h3 style={{ color: '#0f172a', fontWeight: 'bold' }}>Registrar Nuevo Operario o Supervisor</h3>
              <form onSubmit={crearUsuario} style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '10px' }}>
                <input required value={nombreOp} onChange={(e) => setNombreOp(e.target.value)} placeholder="Nombre completo" style={{ padding: '10px', border: '1px solid #64748b', borderRadius: '4px', color: '#0f172a', backgroundColor: '#ffffff' }} />
                <input required type="password" maxLength={4} value={pinOp} onChange={(e) => setPinOp(e.target.value)} placeholder="PIN Único de 4 dígitos" style={{ padding: '10px', border: '1px solid #64748b', borderRadius: '4px', color: '#0f172a', backgroundColor: '#ffffff' }} />
                <select value={rolOp} onChange={(e) => setRolOp(e.target.value)} style={{ padding: '10px', border: '1px solid #64748b', borderRadius: '4px', color: '#0f172a', backgroundColor: '#ffffff' }}>
                  <option value="operario">Operario de Planta</option>
                  <option value="supervisor">Supervisor de Área</option>
                  <option value="admin">Administrador General</option>
                </select>
                <button type="submit" style={{ backgroundColor: '#16a34a', color: '#ffffff', border: 'none', padding: '12px', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer', fontSize: '15px' }}>
                  Guardar Usuario
                </button>
              </form>
            </div>

            <div style={{ backgroundColor: '#ffffff', padding: '20px', borderRadius: '8px', border: '1px solid #cbd5e1' }}>
              <h3 style={{ color: '#0f172a', fontWeight: 'bold' }}>Lista de Operarios Registrados</h3>
              <ul style={{ listStyle: 'none', padding: 0, margin: '10px 0 0 0' }}>
                {usuarios.map((u) => (
                  <li key={u.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', borderBottom: '1px solid #e2e8f0' }}>
                    <div>
                      <strong style={{ color: '#0f172a', fontSize: '15px', display: 'block' }}>{u.nombre}</strong>
                      <span style={{ fontSize: '12px', color: '#334155', fontWeight: 'bold' }}>
                        Rol: {u.rol.toUpperCase()} | PIN: <span style={{ fontFamily: 'monospace', backgroundColor: '#e2e8f0', padding: '2px 6px', borderRadius: '4px' }}>{u.pin_4_digitos}</span>
                      </span>
                    </div>

                    <div style={{ display: 'flex', gap: '6px' }}>
                      <button onClick={() => iniciarEdicionUsuario(u)} style={{ backgroundColor: '#0284c7', color: '#ffffff', border: 'none', padding: '6px 10px', borderRadius: '4px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px', fontWeight: 'bold' }}>
                        <Edit2 size={14} /> Editar
                      </button>
                      <button onClick={() => eliminarUsuario(u.id, u.nombre)} style={{ backgroundColor: '#dc2626', color: '#ffffff', border: 'none', padding: '6px 10px', borderRadius: '4px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px', fontWeight: 'bold' }}>
                        <Trash2 size={14} /> Eliminar
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}

        {/* MODAL EDICIÓN OPERARIO */}
        {usuarioEditando && (
          <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(15, 23, 42, 0.75)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 }}>
            <div style={{ backgroundColor: '#ffffff', padding: '25px', borderRadius: '10px', width: '90%', maxWidth: '450px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px', borderBottom: '1px solid #e2e8f0', paddingBottom: '10px' }}>
                <h3 style={{ margin: 0, color: '#0f172a', fontWeight: 'bold' }}>Editar Operario</h3>
                <button onClick={() => setUsuarioEditando(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b' }}><X size={20} /></button>
              </div>

              <form onSubmit={guardarEdicionUsuario} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div>
                  <label style={{ fontSize: '14px', fontWeight: 'bold', color: '#0f172a', display: 'block', marginBottom: '4px' }}>Nombre Completo:</label>
                  <input required value={editNombre} onChange={(e) => setEditNombre(e.target.value)} style={{ width: '100%', padding: '10px', border: '1px solid #64748b', borderRadius: '4px', color: '#0f172a', backgroundColor: '#ffffff' }} />
                </div>
                <div>
                  <label style={{ fontSize: '14px', fontWeight: 'bold', color: '#0f172a', display: 'block', marginBottom: '4px' }}>PIN de 4 dígitos:</label>
                  <input required maxLength={4} value={editPin} onChange={(e) => setEditPin(e.target.value)} style={{ width: '100%', padding: '10px', border: '1px solid #64748b', borderRadius: '4px', color: '#0f172a', backgroundColor: '#ffffff', letterSpacing: '4px', fontWeight: 'bold' }} />
                </div>
                <div>
                  <label style={{ fontSize: '14px', fontWeight: 'bold', color: '#0f172a', display: 'block', marginBottom: '4px' }}>Rol en el Sistema:</label>
                  <select value={editRol} onChange={(e) => setEditRol(e.target.value)} style={{ width: '100%', padding: '10px', border: '1px solid #64748b', borderRadius: '4px', color: '#0f172a', backgroundColor: '#ffffff' }}>
                    <option value="operario">Operario de Planta</option>
                    <option value="supervisor">Supervisor de Área</option>
                    <option value="admin">Administrador General</option>
                  </select>
                </div>

                <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
                  <button type="submit" style={{ flex: 1, backgroundColor: '#0284c7', color: '#ffffff', border: 'none', padding: '12px', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '6px' }}>
                    <Check size={18} /> Guardar Cambios
                  </button>
                  <button type="button" onClick={() => setUsuarioEditando(null)} style={{ backgroundColor: '#64748b', color: '#ffffff', border: 'none', padding: '12px', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer' }}>
                    Cancelar
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

function TabButton({ activo, onClick, icon, label }) {
  return (
    <button onClick={onClick} style={{ display: 'flex', alignItems: 'center', gap: '8px', backgroundColor: activo ? '#0284c7' : '#f1f5f9', color: activo ? '#ffffff' : '#0f172a', border: '1px solid #cbd5e1', padding: '10px 18px', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer', fontSize: '14px' }}>
      {icon} {label}
    </button>
  );
}