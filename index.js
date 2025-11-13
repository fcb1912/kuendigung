require("dotenv").config();
const express = require("express");
const cors = require("cors");
const axios = require("axios");
const crypto = require("crypto");

const app = express();
const PORT = process.env.PORT || 10000;

// Speicher für Tokens (später DB möglich)
const tokens = new Map();

app.use(express.json());
app.use(cors({
  origin: [
    "https://fcb1912.github.io", // GitHub Pages
    "http://localhost:5500",     // Lokale Tests
    "null"                       // Direktes Öffnen der Datei im Browser
  ]
}));

// Hilfsfunktion: Alter berechnen
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

// Formular-Route
app.post("/submit", async (req, res) => {
  const { mitglied_vorname, mitglied_nachname, geburtsdatum, email, telefon, bemerkung, elternName } = req.body;

  if (!email || email.trim() === "") {
    return res.status(400).json({ ok: false, message: "Keine gültige E-Mailadresse angegeben." });
  }

  const alter = berechneAlter(geburtsdatum);
  const token = crypto.randomUUID();
  tokens.set(token, { vorname: mitglied_vorname, nachname: mitglied_nachname, geburtsdatum, email, telefon, bemerkung, elternName, alter });

  try {
    // Bestätigungsmail mit HTML-Link + Fallback
    let empfaengerText = alter < 18 ? (elternName || "Erziehungsberechtigter") : mitglied_vorname;
    const verifyLink = `https://kuendigung.onrender.com/verify?token=${token}`;

    await axios.post("https://api.brevo.com/v3/smtp/email", {
      sender: { email: "mitglieder@fc-badenia-stilgen.de" },
      to: [{ email }],
      subject: "Bitte bestätigen Sie die Kündigung",
      textContent: `Hallo ${empfaengerText},

Bitte bestätigen Sie die Kündigung von ${mitglied_vorname} ${mitglied_nachname}.
Hier der Bestätigungslink (kopieren Sie ihn in den Browser, falls er nicht anklickbar ist):
${verifyLink}

Sportliche Grüße,
FC Badenia St. Ilgen`,
      htmlContent: `
        <p>Hallo ${empfaengerText},</p>
        <p>Bitte bestätigen Sie die Kündigung von <strong>${mitglied_vorname} ${mitglied_nachname}</strong>.</p>
        <p>
          <a href="${verifyLink}" 
             style="display:inline-block;padding:10px 14px;background:#003366;color:#fff;text-decoration:none;border-radius:4px;">
            Kündigung bestätigen
          </a>
        </p>
        <p>Falls der Button nicht funktioniert, nutzen Sie diesen Link:<br>
          <a href="${verifyLink}">${verifyLink}</a>
        </p>
        <p>Sportliche Grüße,<br>FC Badenia St. Ilgen</p>
      `
    }, {
      headers: {
        "api-key": process.env.BREVO_API_KEY,
        "Content-Type": "application/json"
      }
    });

    console.log("Verify-Link:", verifyLink);
    res.json({ ok: true, message: "Bestätigungsmail gesendet." });
  } catch (err) {
    console.error("❌ Fehler beim Mailversand:", err.response?.data || err.message);
    res.status(500).json({ ok: false, message: "Fehler beim Mailversand." });
  }
});

// Verify-Route
app.get("/verify", async (req, res) => {
  const { token } = req.query;
  const data = tokens.get(token);

  if (!data) {
    return res.status(400).send("❌ Ungültiger oder abgelaufener Link.");
  }

  try {
    // Admin-Mailtext mit freundlicher Bestätigung
    let adminText = `✅ Wir haben Ihre Kündigung erhalten und werden sie schnellstmöglich bestätigen.\n\n`;
    adminText += `--- Mitgliedsdaten ---\n`;
    adminText += `Name: ${data.vorname} ${data.nachname}\n`;
    adminText += `Geburtsdatum: ${data.geburtsdatum} (Alter: ${data.alter})\n\n`;

    adminText += `--- Kontakt ---\n`;
    adminText += `E-Mail: ${data.email}\n`;
    adminText += `Telefon: ${data.telefon || "-"}\n\n`;

    if (data.alter < 18) {
      adminText += `--- Erziehungsberechtigter ---\n`;
      adminText += `${data.elternName || "-"}\n\n`;
    }

    if (data.bemerkung) {
      adminText += `--- Bemerkung ---\n`;
      adminText += `${data.bemerkung}\n\n`;
    }

    await axios.post("https://api.brevo.com/v3/smtp/email", {
      sender: { email: "mitglieder@fc-badenia-stilgen.de" },
      to: [
        { email: data.email } // Anwender bekommt die Bestätigung
      ],
      cc: [
        { email: "mitglieder@fc-badenia-stilgen.de" } // Verein bekommt Kopie
      ],
      subject: `Kündigung von ${data.vorname} ${data.nachname}`,
      textContent: adminText,
      htmlContent: `
        <h2>✅ Wir haben Ihre Kündigung erhalten</h2>
        <p>Wir werden sie schnellstmöglich bestätigen.</p>

        <h3>Mitgliedsdaten</h3>
        <p><strong>Name:</strong> ${data.vorname} ${data.nachname}<br>
        <strong>Geburtsdatum:</strong> ${data.geburtsdatum} (Alter: ${data.alter})</p>

        <h3>Kontakt</h3>
        <p><strong>E-Mail:</strong> ${data.email}<br>
        <strong>Telefon:</strong> ${data.telefon || "-"}</p>

        ${data.alter < 18 ? `<h3>Erziehungsberechtigter</h3><p>${data.elternName || "-"}</p>` : ""}

        ${data.bemerkung ? `<h3>Bemerkung</h3><p>${data.bemerkung}</p>` : ""}
      `
    }, {
      headers: {
        "api-key": process.env.BREVO_API_KEY,
        "Content-Type": "application/json"
      }
    });

    res.send("✅ Die E-Mailadresse wurde bestätigt. Admin-Mail wurde verschickt.");
  } catch (err) {
    console.error("❌ Fehler beim Admin-Mailversand:", err.response?.data || err.message);
    res.status(500).send("Fehler beim Admin-Mailversand.");
  }
});

app.listen(PORT, () => {
  console.log(`✅ Server läuft auf Port ${PORT}`);
});
