/* ============================================================
   01-ui.js — Fase 2 (Componentes), §5.6/§5.7/§5.8 del brief.
   Helpers de interfaz PUROS y compartidos entre index.html,
   docente.html y estudiante.html: toast, confirm, controlador
   genérico de modal. Sin lógica de negocio ni llamadas a
   Supabase — eso sigue embebido en cada archivo (§0.1).
   ============================================================ */

/* ---------------- Toast (reemplaza alert()) — §5.6 ---------------- */
(function () {
  var contenedor = null;
  function obtenerContenedor() {
    if (contenedor) return contenedor;
    contenedor = document.createElement('div');
    contenedor.id = 'toast-contenedor';
    contenedor.style.cssText = [
      'position:fixed', 'right:16px', 'bottom:16px', 'z-index:var(--z-toast,1100)',
      'display:flex', 'flex-direction:column', 'gap:8px', 'max-width:360px'
    ].join(';');
    document.body.appendChild(contenedor);
    return contenedor;
  }

  var iconos = {
    exito: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>',
    error: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>',
    info: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>'
  };
  var tonos = {
    exito: { bg: 'var(--ok-bg)', borde: 'var(--ok-borde)', texto: 'var(--ok-texto)' },
    error: { bg: 'var(--error-bg)', borde: 'var(--error-borde)', texto: 'var(--error-texto)' },
    info: { bg: 'var(--info-bg)', borde: 'var(--info-borde)', texto: 'var(--info-texto)' }
  };

  window.toast = function (mensaje, tono) {
    tono = tono === 'error' || tono === 'info' ? tono : 'exito';
    var cont = obtenerContenedor();

    // Máximo 3 apilados — el resto se colapsa (§5.6)
    var existentes = cont.querySelectorAll('.toast-item');
    if (existentes.length >= 3) {
      existentes[0].remove();
    }

    var t = tonos[tono];
    var el = document.createElement('div');
    el.className = 'toast-item';
    el.setAttribute('role', tono === 'error' ? 'alert' : 'status');
    el.style.cssText = [
      'display:flex', 'align-items:flex-start', 'gap:8px',
      'background:' + t.bg, 'border:1px solid ' + t.borde, 'color:' + t.texto,
      'padding:12px 14px', 'border-radius:var(--r-sm,8px)', 'box-shadow:var(--sombra-3)',
      'font-family:var(--f-cuerpo,inherit)', 'font-size:13.5px', 'line-height:1.4',
      'opacity:0', 'transform:translateY(8px)',
      'transition:opacity var(--dur-base,220ms) var(--ease-salida,ease), transform var(--dur-base,220ms) var(--ease-salida,ease)'
    ].join(';');
    el.innerHTML = '<span style="flex-shrink:0; margin-top:1px;">' + iconos[tono] + '</span><span style="flex:1;">' + mensaje + '</span>' +
      '<button type="button" aria-label="Cerrar" style="background:none;border:none;cursor:pointer;color:inherit;opacity:.6;padding:0;line-height:1;font-size:16px;">×</button>';

    cont.appendChild(el);
    requestAnimationFrame(function () {
      el.style.opacity = '1';
      el.style.transform = 'translateY(0)';
    });

    function cerrar() {
      el.style.opacity = '0';
      el.style.transform = 'translateY(8px)';
      setTimeout(function () { el.remove(); }, 150);
    }
    el.querySelector('button').addEventListener('click', cerrar);

    // Éxito/info se cierran solos a los 4s; error requiere cierre manual (§5.6)
    if (tono !== 'error') {
      setTimeout(cerrar, 4000);
    }
    return el;
  };
})();

/* ---------------- Confirmar (reemplaza confirm()) — §5.7 ---------------- */
(function () {
  window.confirmarAccion = function (opciones) {
    opciones = opciones || {};
    var titulo = opciones.titulo || 'Confirmar';
    var cuerpo = opciones.cuerpo || '¿Deseás continuar?';
    var textoConfirmar = opciones.textoConfirmar || 'Confirmar';
    var textoCancelar = opciones.textoCancelar || 'Cancelar';
    var peligro = !!opciones.peligro;
    var palabraRequerida = opciones.palabraRequerida || null; // ej. "ELIMINAR" para acciones de alto riesgo

    return new Promise(function (resolve) {
      var overlay = document.createElement('div');
      overlay.className = 'modal-overlay activo';
      overlay.style.cssText = 'position:fixed;inset:0;background:rgba(6,35,26,.4);display:flex;align-items:center;justify-content:center;z-index:var(--z-modal,1000);';

      var inputHtml = palabraRequerida
        ? '<div class="campo" style="margin:16px 0 0;"><label style="display:block; font-size:13px; font-weight:500; margin-bottom:6px;">Escribí <strong>' + palabraRequerida + '</strong> para confirmar</label><input type="text" id="confirmar-palabra" class="select-css" autocomplete="off"></div>'
        : '';

      overlay.innerHTML =
        '<div class="modal-card" role="dialog" aria-modal="true" aria-labelledby="confirmar-titulo" style="background:#fff;border-radius:var(--r-lg,18px);padding:24px;width:100%;max-width:420px;box-shadow:var(--sombra-4);">' +
        '  <h2 id="confirmar-titulo" style="font-family:var(--f-display,inherit);font-size:19px;margin:0 0 8px;color:var(--verde-950,#04180F);">' + titulo + '</h2>' +
        '  <p style="color:var(--texto-suave);font-size:14px;line-height:1.5;margin:0;">' + cuerpo + '</p>' +
        inputHtml +
        '  <div style="display:flex;gap:12px;justify-content:flex-end;margin-top:20px;">' +
        '    <button type="button" class="btn-secundario" data-accion="cancelar">' + textoCancelar + '</button>' +
        '    <button type="button" class="' + (peligro ? 'btn-peligro' : 'btn-ingresar') + '" data-accion="confirmar" style="width:auto;' + (peligro ? '' : '') + '"' + (palabraRequerida ? ' disabled' : '') + '>' + textoConfirmar + '</button>' +
        '  </div>' +
        '</div>';

      document.body.appendChild(overlay);
      document.body.style.overflow = 'hidden';

      var btnCancelar = overlay.querySelector('[data-accion="cancelar"]');
      var btnConfirmar = overlay.querySelector('[data-accion="confirmar"]');
      var inputPalabra = overlay.querySelector('#confirmar-palabra');

      if (inputPalabra) {
        inputPalabra.addEventListener('input', function () {
          btnConfirmar.disabled = inputPalabra.value.trim() !== palabraRequerida;
        });
      }

      function cerrar(resultado) {
        document.body.style.overflow = '';
        document.removeEventListener('keydown', onKeydown);
        overlay.remove();
        resolve(resultado);
      }
      function onKeydown(e) {
        if (e.key === 'Escape') cerrar(false);
        if (e.key === 'Tab') {
          // trampa de foco simple entre los 2 botones
          var focoActual = document.activeElement;
          if (e.shiftKey && focoActual === btnCancelar) { e.preventDefault(); btnConfirmar.focus(); }
          else if (!e.shiftKey && focoActual === btnConfirmar) { e.preventDefault(); btnCancelar.focus(); }
        }
      }

      overlay.addEventListener('click', function (e) { if (e.target === overlay) cerrar(false); });
      btnCancelar.addEventListener('click', function () { cerrar(false); });
      btnConfirmar.addEventListener('click', function () { if (!btnConfirmar.disabled) cerrar(true); });
      document.addEventListener('keydown', onKeydown);

      btnCancelar.focus();
    });
  };
})();

/* ---------------- Controlador genérico de modal — §5.8 ---------------- */
/* Aplica ESC / clic-fuera / bloqueo de scroll a los .modal-overlay que ya
   existen en el HTML (index.html: modalAsignar, modalRegistrarPago,
   modalGestionCobranza, modalPasswordEstudiante, modalDetalleItems).
   No inventa la lógica de abrir/cerrar de cada uno — solo agrega el
   comportamiento común encima de la clase "activo" que cada módulo
   ya usa para mostrar/ocultar su modal. */
(function () {
  function cerrarModalVisible(overlay) {
    // Reutiliza el botón "Cancelar"/"Cerrar" de cada modal si existe,
    // así se ejecuta la limpieza propia de cada módulo (ej. limpiar
    // window.materiaActualAAsignar) en vez de solo ocultar la capa.
    var btnCerrar = overlay.querySelector('.btn-secundario');
    if (btnCerrar) { btnCerrar.click(); return; }
    overlay.classList.remove('activo');
  }

  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    var abierto = document.querySelector('.modal-overlay.activo');
    if (abierto) cerrarModalVisible(abierto);
  });

  document.addEventListener('click', function (e) {
    if (e.target.classList && e.target.classList.contains('modal-overlay') && e.target.classList.contains('activo')) {
      cerrarModalVisible(e.target);
    }
  });

  // Bloquea el scroll del body mientras cualquier modal esté abierto.
  var obs = new MutationObserver(function () {
    var hayModalAbierto = !!document.querySelector('.modal-overlay.activo');
    document.body.style.overflow = hayModalAbierto ? 'hidden' : '';
  });
  document.addEventListener('DOMContentLoaded', function () {
    document.querySelectorAll('.modal-overlay').forEach(function (m) {
      obs.observe(m, { attributes: true, attributeFilter: ['class'] });
    });
  });
})();
