require("dotenv").config();
const express = require("express");
const cors = require("cors");
const axios = require("axios");
const crypto = require("crypto");

const app = express();
const PORT = process.env.PORT || 10000;

/* ----------------------------------------------------
    TOKEN STORE — MIT ABLAUFZEIT
---------------------------------------------------- */
const tokens = new Map();
const TOKEN_LIFETIME_MS = 30 * 60 * 1000; // 30 Minuten

function storeToken(token, data) {
  tokens.set(token, {
    data,
    expires: Date.now() + TOKEN_LIFETIME_MS
  });
}

function getToken(token) {
  const entry = tokens.get(token);
  if (!entry) return null;

  if (Date.now() > entry.expires) {
    tokens.delete(token);
    return null;
  }

  return entry.data;
}

/* ----------------------------------------------------
    MIDDLEWARE
---------------------------------------------------- */
app.use(express.json());

app.use(
  cors({
    origin: [
      "https://fcb1912.github.io",
      "http://localhost:5500",
      "null"
    ]
  })
);

/* ----------------------------------------------------
    HILFSFUNKTIONEN
---------------------------------------------------- */
function berechneAlter(geburtsdatum) {
  const heute = new Date();
  const geb = new Date(geburtsdatum);

  let alter = heute.getFullYear() - geb.getFullYear();
  const m = heute.getMonth() - geb.getMonth();

  if (m < 0 || (m === 0 && heute.getDate() < geb.getDate())) {
    alter--;
  }

  return alter;
}

function validateSubmission(body) {
  const required = ["mitglied_vorname", "mitglied_nachname", "geburtsdatum", "email"];

  for (const field of required) {
    if (!body[field] || String(body[field]).trim() === "") {
      return `Feld fehlt oder ungültig: ${field}`;
    }
  }

  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(body.email)) {
    return "Ungültige E-Mailadresse.";
  }

  return null;
}

/* ----------------------------------------------------
    📩 POST /submit — Kündigung absenden
---------------------------------------------------- */
app.post("/submit", async (req, res) => {
  try {
    const error = validateSubmission(req.body);
    if (error) return res.status(400).json({ ok: false, message: error });

    const {
      mitglied_vorname,
      mitglied_nachname,
      geburtsdatum,
      email,
      telefon,
      bemerkung,
      elternName
    } = req.body;

    const alter = berechneAlter(geburtsdatum);

    const token = crypto.randomUUID();
    storeToken(token, {
      vorname: mitglied_vorname,
      nachname: mitglied_nachname,
      geburtsdatum,
      email,
      telefon,
      bemerkung,
      elternName,
      alter
    });

    const empfaengerText = alter < 18 ? (elternName || "Erziehungsberechtigter") : mitglied_vorname;
    const verifyLink = `https://kuendigung.onrender.com/verify?token=${token}`;

    await axios.post(
      "https://api.brevo.com/v3/smtp/email",
      {
        sender: { email: "mitglieder@fc-badenia-stilgen.de" },
        to: [{ email }],
        subject: "Bitte bestätigen Sie die Kündigung",
        htmlContent: `
          <p>Hallo ${empfaengerText},</p>
          <p>Bitte bestätigen Sie die Kündigung von <strong>${mitglied_vorname} ${mitglied_nachname}</strong>.</p>
          <p>
            <a href="${verifyLink}" style="display:inline-block;padding:10px 14px;background:#b30000;color:#fff;text-decoration:none;border-radius:4px;">
              Kündigung bestätigen
            </a>
          </p>
          <p>Falls der Button nicht funktioniert:<br>
            <a href="${verifyLink}">${verifyLink}</a>
          </p>
          <p>Sportliche Grüße,<br>FC Badenia St. Ilgen</p>
        `
      },
      {
        headers: {
          "api-key": process.env.BREVO_API_KEY,
          "Content-Type": "application/json"
        }
      }
    );

    res.json({ ok: true, message: "Bestätigungsmail gesendet." });
  } catch (err) {
    console.error("❌ Fehler beim Mailversand:", err.response?.data || err.message);
    res.status(500).json({ ok: false, message: "Technischer Fehler." });
  }
});

/* ----------------------------------------------------
    📩 GET /verify — Link in E-Mail klicken
---------------------------------------------------- */
app.get("/verify", async (req, res) => {
  try {
    const { token } = req.query;
    const data = getToken(token);

    if (!data) {
      return res.send(`
        <h1>❌ Ungültiger oder abgelaufener Link</h1>
        <p>Bitte prüfen Sie Ihre E-Mail oder wenden Sie sich an den Verein.</p>
      `);
    }

    let adminText = `
      Kündigung bestätigt.

      Name: ${data.vorname} ${data.nachname}
      Geburtsdatum: ${data.geburtsdatum} (Alter ${data.alter})
      Email: ${data.email}
      Telefon: ${data.telefon || "-"}
      ${data.alter < 18 ? `Erziehungsberechtigte Person: ${data.elternName || "-"}` : ""}
      ${data.bemerkung ? `Bemerkung: ${data.bemerkung}` : ""}
    `;

    await axios.post(
      "https://api.brevo.com/v3/smtp/email",
      {
        sender: { email: "mitglieder@fc-badenia-stilgen.de" },
        to: [{ email: data.email }],
        cc: [{ email: "mitglieder@fc-badenia-stilgen.de" }],
        subject: `Kündigung von ${data.vorname} ${data.nachname}`,
        textContent: adminText,
        htmlContent: `
          <h2>Wir haben Ihre Kündigung erhalten</h2>
          <p>Wir werden sie schnellstmöglich bearbeiten.</p>
        `
      },
      {
        headers: {
          "api-key": process.env.BREVO_API_KEY,
          "Content-Type": "application/json"
        }
      }
    );

    res.send(`
      <h2>Vielen Dank!</h2>
      <p>Die E-Mailadresse wurde erfolgreich bestätigt.</p>
    `);
  } catch (err) {
    console.error("❌ Fehler beim Verify-Vorgang:", err.response?.data || err.message);
    res.status(500).send("Technischer Fehler.");
  }
});

/* ----------------------------------------------------
    START
---------------------------------------------------- */
app.listen(PORT, () => {
  console.log(`✅ Server läuft auf Port ${PORT}`);
});
