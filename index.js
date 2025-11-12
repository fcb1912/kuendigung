require("dotenv").config();
const express = require("express");
const nodemailer = require("nodemailer");
const { v4: uuidv4 } = require("uuid");
const path = require("path");
const cors = require("cors");

const app = express();

// 🔓 CORS aktivieren – nur deine GitHub Pages Domain erlauben
app.use(cors({
  origin: "https://fcb1912.github.io"
}));

app.use(express.json());
app.use(express.static("public")); // liefert index.html automatisch

let kuendigungen = [];

// SMTP Transporter
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT),
  secure: process.env.SMTP_SECURE === "true",
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  }
});

// Formularannahme
app.post("/submit", async (req, res) => {
  const data = req.body;

  // Pflichtfelder prüfen
  if (!data.mitglied_vorname || !data.mitglied_nachname || !data.geburtsdatum || !data.email || !data.mobilnummer || !data.kuendigungsdatum) {
    return res.status(400).json({ ok: false, message: "Pflichtfelder fehlen." });
  }

  // Alter berechnen
  const geburtsdatum = new Date(data.geburtsdatum);
  const heute = new Date();
  let alter = heute.getFullYear() - geburtsdatum.getFullYear();
  const m = heute.getMonth() - geburtsdatum.getMonth();
  if (m < 0 || (m === 0 && heute.getDate() < geburtsdatum.getDate())) {
    alter--;
  }

  // Wenn unter 18 → Erziehungsberechtigte Pflicht
  if (alter < 18 && (!data.eltern_name || !data.eltern_email)) {
    return res.status(400).json({ ok: false, message: "Erziehungsberechtigte müssen angegeben werden." });
  }

  const token = uuidv4();
  const entry = {
    id: uuidv4(),
    eingangsdatum: new Date().toISOString(),
    ...data,
    alter,
    token,
    status: "offen"
  };
  kuendigungen.push(entry);

  const confirmLink = `${process.env.BASE_URL}/confirm?token=${token}`;

  // Mail an Mitglied
  await transporter.sendMail({
    from: process.env.MAIL_FROM,
    to: data.email,
    subject: "Bitte bestätigen Sie Ihre Kündigung",
    text: `Sehr geehrte/r ${data.mitglied_vorname} ${data.mitglied_nachname},

bitte bestätigen Sie Ihre Kündigung über folgenden Link:
${confirmLink}

Mit freundlichen Grüßen
FC Badenia St. Ilgen`,
    replyTo: process.env.MAIL_TO_VEREIN
  });

  // Info-Mail an Verein
  let vereinText = `Es wurde eine Kündigung eingereicht:

Name: ${data.mitglied_vorname} ${data.mitglied_nachname}
Geburtsdatum: ${data.geburtsdatum} (Alter: ${alter})
E-Mail: ${data.email}
Mobilnummer: ${data.mobilnummer}
Kündigungsdatum: ${data.kuendigungsdatum}
Grund: ${data.grund || "-"}

Status: offen (Bestätigung ausstehend)`;

  if (alter < 18) {
    vereinText += `

Erziehungsberechtigte/r: ${data.eltern_name}
E-Mail Erziehungsberechtigte/r: ${data.eltern_email}`;
  }

  await transporter.sendMail({
    from: process.env.MAIL_FROM,
    to: process.env.MAIL_TO_VEREIN,
    subject: "Neue Kündigung eingegangen (Bestätigung ausstehend)",
    text: vereinText
  });

  res.json({ ok: true, message: "Bestätigungsmail gesendet." });
});

// Bestätigung
app.get("/confirm", (req, res) => {
  const { token } = req.query;
  const entry = kuendigungen.find(k => k.token === token);

  if (!entry) return res.status(404).send("❌ Ungültiger oder bereits verwendeter Link.");
  if (entry.status === "bestätigt") return res.send("✅ Diese Kündigung ist bereits bestätigt.");

  entry.status = "bestätigt";
  entry.bestaetigt_am = new Date().toISOString();

  let vereinText = `Die Kündigung wurde bestätigt:

Name: ${entry.mitglied_vorname} ${entry.mitglied_nachname}
E-Mail: ${entry.email}
Kündigungsdatum: ${entry.kuendigungsdatum}
Bestätigt am: ${entry.bestaetigt_am}

Status: bestätigt`;

  if (entry.alter < 18) {
    vereinText += `

Erziehungsberechtigte/r: ${entry.eltern_name}
E-Mail Erziehungsberechtigte/r: ${entry.eltern_email}`;
  }

  transporter.sendMail({
    from: process.env.MAIL_FROM,
    to: process.env.MAIL_TO_VEREIN,
    subject: "Kündigung bestätigt",
    text: vereinText
  }).catch(err => console.error("Mailfehler:", err));

  res.send("✅ Ihre Kündigung wurde bestätigt! Vielen Dank.");
});

// Start
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server läuft auf Port ${PORT}`));