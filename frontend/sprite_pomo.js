// ── Animador de sprites de POMO ───────────────────────────────
// Uso: const pomo = new SpritePomo(document.getElementById('contenedor'))
//      pomo.setEstado('estudiando')   // valor de sprite_estado desde Supabase
//
// El sprite_estado es calculado AUTOMÁTICAMENTE por un trigger en Supabase
// según el estado del dispositivo (MQTT) y el historial de sesiones.
// La web solo lo lee y lo muestra — no lo calcula ni lo setea manualmente.

const ANIMACIONES = {
  idle:       { frames: ['pomope_idle1.png','pomope_idle2.png'],                                                              fps: 2  },
  estudiando: { frames: ['pomope_student1.png','pomope_student2.png'],                                                        fps: 3  },
  triste:     { frames: ['pomope_sad1.png','pomope_sad2.png','pomope_sad3.png','pomope_sad4.png'],                            fps: 4  },
  naciendo:   { frames: ['pomope_born1.png','pomope_born2.png'],                                                              fps: 2  },
  muriendo:   { frames: ['pomope_death1.png','pomope_death2.png','pomope_death3.png','pomope_death4.png',
                          'pomope_death5.png','pomope_death6.png','pomope_death7.png','pomope_death8.png'], fps: 6, once: true },
}

// Mapa desde sprite_estado (campo de Supabase) → animación
const ESTADO_A_ANIM = {
  naciendo:    'naciendo',
  muriendo:    'muriendo',
  estudiando:  'estudiando',
  descansando: 'idle',
  durmiendo:   'idle',
  celebrando:  'estudiando',
  asustado:    'triste',
  esperando:   'idle',
}

// Texto descriptivo del estado (se muestra sobre el sprite)
export const ESTADO_A_TEXTO = {
  naciendo:    '✨ Recién nacido — ¡haz tu primera sesión!',
  muriendo:    '💀 Agotado — necesita sesiones urgente',
  estudiando:  '📚 Estudiando concentrado',
  descansando: '☕ Descansando',
  durmiendo:   '😴 Durmiendo — desconectado',
  celebrando:  '🎉 ¡Celebrando un logro!',
  asustado:    '😨 ¡Celular fuera del cofre!',
  esperando:   '⏳ Esperando la próxima sesión',
}

export class SpritePomo {
  constructor(contenedor, carpeta = 'sprites/') {
    this.carpeta   = carpeta
    this.img       = new Image()
    this.img.style.cssText = 'image-rendering:pixelated;width:100%;height:100%;object-fit:contain'
    contenedor.appendChild(this.img)

    this.animActual  = null
    this.indiceFrame = 0
    this.intervalo   = null
    this.terminado   = false
    this.estadoActual = null

    // Precargar todos los frames
    this.cache = {}
    Object.values(ANIMACIONES).forEach(a => {
      a.frames.forEach(f => {
        const im = new Image()
        im.src = carpeta + f
        this.cache[f] = im
      })
    })

    this.setEstado('naciendo')
  }

  // estadoSupabase: valor de sprite_estado en la base de datos
  // Se llama automáticamente cuando Supabase Realtime notifica un cambio
  setEstado(estadoSupabase) {
    const nombreAnim   = ESTADO_A_ANIM[estadoSupabase] ?? 'idle'
    const cambioEstado = estadoSupabase !== this.estadoActual
    this.estadoActual  = estadoSupabase

    // Actualizar label de estado si existe en el DOM
    const labelEl = document.getElementById('pomoStatusLabel')
    const textEl  = document.getElementById('pomoStatusText')
    if (labelEl && textEl) {
      textEl.textContent = ESTADO_A_TEXTO[estadoSupabase] ?? '⏳ Esperando...'
      // Color del label según estado
      labelEl.className = 'pomo-status-label estado-' + estadoSupabase
      // Si el estado cambió, vuelve a mostrar el banner (por si lo habían cerrado)
      if (cambioEstado) labelEl.classList.remove('hidden')
    }

    if (nombreAnim === this.animActual && !this.terminado) return
    this._iniciarAnim(nombreAnim)
  }

  _iniciarAnim(nombre) {
    if (this.intervalo) clearInterval(this.intervalo)
    const anim        = ANIMACIONES[nombre] ?? ANIMACIONES.idle
    this.animActual   = nombre
    this.indiceFrame  = 0
    this.terminado    = false

    this._mostrarFrame(anim)

    this.intervalo = setInterval(() => {
      this.indiceFrame++
      if (this.indiceFrame >= anim.frames.length) {
        if (anim.once) {
          this.indiceFrame = anim.frames.length - 1
          this.terminado   = true
          clearInterval(this.intervalo)
        } else {
          this.indiceFrame = 0
        }
      }
      this._mostrarFrame(anim)
    }, 1000 / anim.fps)
  }

  _mostrarFrame(anim) {
    const nombreArchivo = anim.frames[this.indiceFrame]
    const cached = this.cache[nombreArchivo]
    this.img.src = cached?.complete ? cached.src : (this.carpeta + nombreArchivo)
  }

  detener() {
    if (this.intervalo) clearInterval(this.intervalo)
  }
}
