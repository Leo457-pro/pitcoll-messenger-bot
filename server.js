// Bot Messenger PITCOLL - servidor webhook 24/7 (Render)
// Reglas: tono serio, sin emojis, solo chats nuevos del dia. No publicar precio minimo.
const express = require('express');
const axios = require('axios');

const app = express();
app.use(express.json({ verify: (req, res, buf) => { req.rawBody = buf; } }));

const PAGE_TOKEN = process.env.PAGE_TOKEN || '';
const VERIFY_TOKEN = process.env.VERIFY_TOKEN || 'pitcoll-verify-2026';
const PAGE_ID = process.env.PAGE_ID || '1338437609353128';
const PORT = process.env.PORT || 3000;

// Log en memoria de eventos recibidos (consultable en /logs)
const LOGS = [];
function logEv(obj) {
  LOGS.push(Object.assign({ t: new Date().toISOString() }, obj));
  if (LOGS.length > 200) LOGS.shift();
}

// ---- Datos de la empresa ----
const INFO = {
  tel: '333 640 3814',
  direccion: 'Cl. 28 Sur #4104, barrio Santa Rita, Bogotá',
  direccionCorta: 'Cl. 28 Sur #4104, barrio Santa Rita',
};

// Palabras clave -> respuesta (serio, sin emojis, con nombre del comprador)
const TEMAS = [
  { re: /disponib|queda|tienes|tienen|aun|todavia|aún/i, resp: (n) => `${n}, la máquina está disponible. La entrega puede ser con envío en Bogotá o recogida en nuestra tienda en ${INFO.direccionCorta}. ¿Le interesa verla en persona o prefiere que le confirmemos envío?` },
  { re: /precio|cuanto|cu[aá]nto|vale|costo|cotiza|rebaja|descuento|menos|oferta|regate/i, resp: (n) => `${n}, con gusto le compartimos el precio y le contamos las opciones de pago. También quedamos atentos si quiere visitarnos en ${INFO.direccionCorta} para verla funcionando. ¿Qué máquina le interesa?` },
  { re: /ubicaci[oó]n|direccion|direcci[oó]n|d[oó]nde|donde est|tienda|visita/i, resp: (n) => `${n}, estamos en ${INFO.direccion}, Bogotá. Puede venir a ver la máquina funcionando sin compromiso. ¿Qué horario le acomoda?` },
  { re: /tel[eé]fono|telefono|celular|llamar|whatsapp|contacto/i, resp: (n) => `${n}, puede comunicarse al ${INFO.tel}. Quedamos atentos a su solicitud por este mismo canal también.` },
  { re: /garant[ií]a|garantia|defecto|fallo/i, resp: (n) => `${n}, las máquinas se entregan verificadas y funcionando. Le mostramos su operación antes de la entrega para que quede tranquilo con su compra.` },
  { re: /medida|dimensi[oó]n|dimens|tama[nñ]o|peso|ancho|alto|largo/i, resp: (n) => `${n}, le confirmo las medidas exactas de la máquina que le interesa. ¿Cuál es el modelo que está viendo?` },
  { re: /env[ií]o|envio|domicilio|entrega|transport/i, resp: (n) => `${n}, hacemos entregas en Bogotá y coordinamos envíos a otras ciudades. Le confirmamos el costo exacto según su dirección.` },
  { re: /horario|abierto|atienden|atencion|atención/i, resp: (n) => `${n}, puede visitarnos en ${INFO.direccion}. Le confirma un asesor el día y la hora que le acomoden.` },
];

const ESPERA = (n) => `${n}, su solicitud quedó recibida y en unos minutos le confirma un asesor por aquí mismo.`;

function saludo(first) {
  return first && String(first).trim() ? String(first).trim() : 'Buen día';
}

// ---- Verificacion del webhook ----
app.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    return res.status(200).send(challenge);
  }
  return res.sendStatus(403);
});

// ---- Recepcion de mensajes ----
app.post('/webhook', async (req, res) => {
  res.sendStatus(200); // confirmar rapido a Meta
  logEv({ tipo: 'POST', object: req.body ? req.body.object : null, entradas: req.body && req.body.entry ? req.body.entry.length : 0 });
  try {
    const body = req.body;
    if (body.object !== 'page') return;
    for (const entry of (body.entry || [])) {
      if (String(entry.id) !== String(PAGE_ID)) continue;
      for (const ev of (entry.messaging || [])) {
        if (ev.message && ev.message.text && !ev.message.is_echo) {
          await responder(ev.sender.id, ev.message.text);
        }
      }
    }
  } catch (e) {
    console.error('webhook error', e.message);
  }
});

async function enviarText(psid, texto) {
  try {
    await axios.post(
      `https://graph.facebook.com/v21.0/me/messages?access_token=${PAGE_TOKEN}`,
      { recipient: { id: psid }, message: { text: texto } },
      { headers: { 'Content-Type': 'application/json' } }
    );
    console.log('enviado a', psid, ':', texto.slice(0, 60));
  } catch (e) {
    console.error('envio falló', e.response ? JSON.stringify(e.response.data) : e.message);
  }
}

async function nombre(psid) {
  try {
    const r = await axios.get(`https://graph.facebook.com/v21.0/${psid}?fields=first_name&access_token=${PAGE_TOKEN}`);
    return r.data.first_name || '';
  } catch (e) {
    return '';
  }
}

async function responder(psid, texto) {
  const n = await nombre(psid);
  const pref = saludo(n);
  let respuesta = null;
  for (const t of TEMAS) {
    if (t.re.test(texto)) { respuesta = t.resp(pref); break; }
  }
  if (!respuesta) respuesta = ESPERA(pref);
  await enviarText(psid, respuesta);
}

app.get('/', (req, res) => res.send('PITCOLL bot OK'));
app.get('/logs', (req, res) => res.json({ total: LOGS.length, eventos: LOGS }));
app.listen(PORT, () => console.log('PITCOLL webhook activo en puerto', PORT));
