// Se agrega a index.html con: <script type="module" src="reservas.js"></script> (antes de </body>)
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getFirestore, writeBatch, doc, collection, query, where, getDocs, serverTimestamp }
  from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { initializeAppCheck, ReCaptchaEnterpriseProvider } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app-check.js";
import { firebaseConfig, recaptchaSiteKey } from "./firebase-config.js";

const app = initializeApp(firebaseConfig);
if (recaptchaSiteKey) initializeAppCheck(app, { provider: new ReCaptchaEnterpriseProvider(recaptchaSiteKey), isTokenAutoRefreshEnabled: true });
const db = getFirestore(app);
// Corrige precios: las tarjetas muestran $10/$25/$50 pero el cálculo usaba 25/40/60
Object.assign(packagePrices, { "Básico": 10, "Comando": 25, "Extremo": 50 });
calculatePrice();

const f = document.getElementById('bookingForm');
const btn = f.querySelector('[type=submit]');
btn.insertAdjacentHTML('beforebegin',
  '<label class="flex items-start gap-2 text-xs text-gray-400"><input type="checkbox" required class="mt-0.5"> Acepto que PF Paintball use mis datos solo para gestionar mi reserva y contactarme sobre ella.</label>');

const NO = 'Esta fecha no está disponible';
let taken = new Set();
function aviso(m) {
  const d = document.createElement('div'); d.textContent = m;
  d.className = 'fixed top-24 left-1/2 -translate-x-1/2 z-[10000] px-5 py-3 rounded-xl bg-neonPink text-white font-bold shadow-xl text-center';
  document.body.appendChild(d); setTimeout(() => d.remove(), 3500);
}
const slotId = (fecha, hora) => `${fecha}_${hora.replace(/[: ]/g, '')}`;

async function refresh() {
  const d = document.getElementById('custDate').value;
  if (!d) return;
  try {
    const s = await getDocs(query(collection(db, 'disponibilidad'), where('fecha', '==', d)));
    taken = new Set(s.docs.map(x => x.data().hora));
    const sel = document.getElementById('custTime');
    sel.querySelectorAll('option').forEach(o => {
      if (!o.value) return;
      o.textContent = o.value + (taken.has(o.value) ? ' (Reservado)' : '');
    });
    if (taken.has(sel.value)) sel.value = '';
    document.querySelectorAll('#timeSlotsContainer button').forEach(b => {
      const t = taken.has(b.querySelector('span').textContent);
      b.classList.toggle('opacity-40', t);
      if (t) b.lastElementChild.textContent = 'Reservado';
    });
  } catch (e) { console.error(e); }
}
document.getElementById('custTime').addEventListener('change', e => {
  if (taken.has(e.target.value)) { e.target.value = ''; aviso(NO); }
});
const prevSlot = window.selectTimeSlot;
window.selectTimeSlot = t => { if (taken.has(t)) return aviso(NO); prevSlot(t); };
const prev = window.updateSelectedDayView;
window.updateSelectedDayView = d => { prev(d); refresh(); };
document.getElementById('custDate').addEventListener('change', refresh);

let busy = false;
f.addEventListener('submit', async e => {
  e.preventDefault(); e.stopImmediatePropagation();
  if (busy) return; busy = true; btn.disabled = true;
  const v = id => document.getElementById(id).value.trim();
  const codigo = 'PF-' + crypto.getRandomValues(new Uint32Array(1))[0].toString(36).toUpperCase().slice(0, 6);
  const r = { codigo, nombre: v('custName'), telefono: v('custPhone'), email: v('custEmail'),
    fecha: v('custDate'), hora: v('custTime'), jugadores: parseInt(v('custPlayers')),
    paquete: v('custPackage'), total: calculatePrice(), estado: 'pendiente', creada: serverTimestamp() };
  if (taken.has(r.hora)) { aviso(NO); busy = false; btn.disabled = false; return; }
  try {
    const b = writeBatch(db);
    b.set(doc(db, 'reservas', codigo), r);
    b.set(doc(db, 'disponibilidad', slotId(r.fecha, r.hora)), { fecha: r.fecha, hora: r.hora });
    await b.commit();
    savedBookings.push({ id: codigo, name: r.nombre, date: r.fecha, time: r.hora, players: r.jugadores, total: r.total });
    renderUserBookings();
    document.getElementById('modalSummary').innerHTML = `
      <p><strong class="text-white">Código Reserva:</strong> ${codigo}</p>
      <p><strong class="text-white">Fecha y Hora:</strong> ${r.fecha} a las ${r.hora}</p>
      <p><strong class="text-white">Jugadores:</strong> ${r.jugadores} personas</p>
      <p><strong class="text-white">Paquete:</strong> ${r.paquete}</p>
      <p><strong class="text-white">Total Estimado:</strong> <span class="text-neonGreen font-bold">$${r.total} USD</span></p>
      <p class="text-neonYellow">Te enviamos un correo con los detalles. Te confirmaremos por WhatsApp.</p>`;
    document.getElementById('bookingModal').classList.remove('hidden');
    for (let i = 0; i < 5; i++) setTimeout(() => createShotEffect(innerWidth / 2 + Math.random() * 300 - 150, innerHeight / 2 + Math.random() * 300 - 150), i * 150);
    refresh();
  } catch (err) {
    console.error(err);
    if (err.code === 'permission-denied') aviso(NO); else alert('No se pudo guardar tu reserva. Inténtalo de nuevo.');
    refresh();
  } finally { busy = false; btn.disabled = false; }
}, true);
