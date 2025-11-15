require("dotenv").config();
const express = require("express");
const cors = require("cors");
const axios = require("axios");
const crypto = require("crypto");

const app = express();
const PORT = process.env.PORT || 10000;

const tokens = new Map();

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

/* ---------------------------------
   Alter berechnen
---------------------------------- */

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

/* ---------------------------------
   Kündigung absenden
---------------------------------- */

app.post("/submit", async (req, res) => {
  const {
    mitglied_vorname,
    mitglied_nachname,
    geburtsdatum,
    email,
    telefon,
    bemerkung,
    elternName
  } = req.body;

  if (!email || email.trim() === "") {
    return res
      .status(400)
      .json({ ok: false, message: "Keine gültige E-Mailadresse angegeben." });
  }

  if (!telefon || telefon.trim() === "") {
    return res
      .status(400)
      .json({ ok: false, message: "Telefonnummer ist erforderlich." });
  }

  const alter = berechneAlter(geburtsdatum);
  const token = crypto.randomUUID();

  tokens.set(token, {
    data: {
      vorname: mitglied_vorname,
      nachname: mitglied_nachname,
      geburtsdatum,
      email,
      telefon,
      bemerkung,
      elternName,
      alter
    }
  });

  try {
    const empfaengerText =
      alter < 18 ? elternName || "Erziehungsberechtigte Person" : mitglied_vorname;

    const verifyLink = `https://kuendigung.onrender.com/verify?token=${token}`;

    await axios.post(
      "https://api.brevo.com/v3/smtp/email",
      {
        sender: { email: "mitglieder@fc-badenia-stilgen.de" },
        to: [{ email }],
        subject: "Bitte bestätigen Sie die Kündigung",
        htmlContent: `
          <div style="font-family:Arial,sans-serif;">
            <p>Hallo ${empfaengerText},</p>
            <p>Bitte bestätigen Sie die Kündigung von <strong>${mitglied_vorname} ${mitglied_nachname}</strong>.</p>
            <p>
              <a href="${verifyLink}" style="display:inline-block;padding:12px 18px;background:#b30000;color:#fff;text-decoration:none;border-radius:5px;">
                Kündigung bestätigen
              </a>
            </p>
            <p>Falls der Button nicht funktioniert, nutzen Sie diesen Link:<br>
              <a href="${verifyLink}">${verifyLink}</a>
            </p>
            <p>Sportliche Grüße,<br>FC Badenia St. Ilgen</p>
          </div>
        `,
        textContent: `Bitte bestätigen Sie die Kündigung: ${verifyLink}`
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
    res.status(500).json({ ok: false, message: "Fehler beim Mailversand." });
  }
});

/* ---------------------------------
   Bestätigungslink
---------------------------------- */

app.get("/verify", async (req, res) => {
  try {
    const { token } = req.query;
    const entry = tokens.get(token);

    // Token nur 1× gültig → sofort löschen
    tokens.delete(token);

    if (!entry) {
      return res.send(`
        <h1 style="color:#b30000;font-family:sans-serif;text-align:center;">❌ Ungültiger oder abgelaufener Link</h1>
      `);
    }

    const data = entry.data;

    const logoUrl = "https://fcb1912.github.io/kuendigung/logo.png";

    const htmlMail = `
      <div style="font-family:Arial, sans-serif; color:#222; padding:20px;">
        <div style="text-align:center; margin-bottom:20px;">
          <img src="${logoUrl}" alt="FC Badenia Logo" style="height:80px;">
        </div>

        <h2 style="color:#b30000;">Kündigung eingegangen</h2>
        <p>Wir haben Ihre Kündigung erhalten und werden sie schnellstmöglich bearbeiten.</p>

        <hr style="margin:20px 0;">

        <h3 style="color:#b30000;">Mitgliedsdaten</h3>
        <p>
          <strong>Name:</strong> ${data.vorname} ${data.nachname}<br>
          <strong>Geburtsdatum:</strong> ${data.geburtsdatum} (Alter: ${data.alter})
        </p>

        <h3 style="color:#b30000;">Kontakt</h3>
        <p>
          <strong>E-Mail:</strong> ${data.email}<br>
          <strong>Telefon:</strong> ${data.telefon}
        </p>

        ${data.alter < 18 ? `
          <h3 style="color:#b30000;">Erziehungsberechtigte Person</h3>
          <p>${data.elternName || "-"}</p>
        ` : ""}

        ${data.bemerkung ? `
          <h3 style="color:#b30000;">Bemerkung</h3>
          <p>${data.bemerkung}</p>
        ` : ""}

        <hr style="margin:20px 0;">
        <p>Sportliche Grüße<br>FC Badenia St. Ilgen</p>
      </div>
    `;

    const textMail = `
Kündigung eingegangen

Name: ${data.vorname} ${data.nachname}
Geburtsdatum: ${data.geburtsdatum} (Alter: ${data.alter})
E-Mail: ${data.email}
Telefon: ${data.telefon}
${data.alter < 18 ? `Erziehungsberechtigte Person: ${data.elternName}` : ""}
${data.bemerkung ? `Bemerkung: ${data.bemerkung}` : ""}
    `;

    await axios.post(
      "https://api.brevo.com/v3/smtp/email",
      {
        sender: { email: "mitglieder@fc-badenia-stilgen.de" },
        to: [{ email: data.email }],
        cc: [{ email: "mitglieder@fc-badenia-stilgen.de" }],
        subject: `Kündigung eingegangen – ${data.vorname} ${data.nachname}`,
        htmlContent: htmlMail,
        textContent: textMail
      },
      {
        headers: {
          "api-key": process.env.BREVO_API_KEY,
          "Content-Type": "application/json"
        }
      }
    );

    res.send(`
      <div style="font-family:sans-serif;text-align:center;padding:30px;">
        <div style="max-width:600px;margin:auto;padding:20px;border:2px solid #b30000;border-radius:8px;">
          <img src="${logoUrl}" style="height:80px;margin-bottom:20px;">
          <h2 style="color:#b30000;">Vielen Dank!</h2>
          <p>Ihre E-Mailadresse wurde erfolgreich bestätigt.</p>
          <button onclick="window.close()" style="margin-top:20px;padding:10px 15px;background:#b30000;color:#fff;border:none;border-radius:5px;cursor:pointer;">Fenster schließen</button>
        </div>
      </div>
    `);

  } catch (err) {
    console.error("❌ Fehler beim Verify:", err);
    res.status(500).send("Technischer Fehler.");
  }
});

app.listen(PORT, () => {
  console.log(`✅ Server läuft auf Port ${PORT}`);
});

