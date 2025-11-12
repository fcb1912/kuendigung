require("dotenv").config();
const express = require("express");
const cors = require("cors");
const nodemailer = require("nodemailer");

const app = express();
const PORT = process.env.PORT || 10000;

// Middleware
app.use(express.json());
app.use(cors({
  origin: [
    "https://fcb1912.github.io", // GitHub Pages
    "http://localhost:5500",     // Lokale Tests
    "null"                       // Direktes Öffnen der Datei im Browser
  ]
}));

// Brevo SMTP Transporter
const transporter = nodemailer.createTransport({
  host: "smtp-relay.brevo.com",
  port: 587,
  secure: false, // STARTTLS
  auth: {
    user: process.env.BREVO_USER, // deine Brevo Login-E-Mail
    pass: process.env.BREVO_PASS  // dein generierter SMTP-Schlüssel
  }
});

// Formular-Route für Kündigung
app.post("/submit", async (req, res) => {
  const { mitglied_vorname, mitglied_nachname, email } = req.body;

  try {
    await transporter.sendMail({
      from: "mitglieder@fc-badenia-stilgen.de", // deine Vereinsadresse (nach Domain-Verifizierung bei Brevo)
      to: email,
      subject: "Kündigungsbestätigung",
      text: `Hallo ${mitglied_vorname} ${mitglied_nachname},\n\nIhre Kündigung ist eingegangen.\n\nSportliche Grüße,\nFC Badenia St. Ilgen`
    });

    res.json({ ok: true, message: "Bestätigungsmail gesendet." });
  } catch (err) {
    console.error("❌ Fehler beim Mailversand:", err);
    res.status(500).json({ ok: false, message: "Fehler beim Mailversand." });
  }
});

// Test-Route für Mailversand
app.get("/testmail", async (req, res) => {
  try {
    await transporter.sendMail({
      from: "info@fcbadenia.de",
      to: process.env.BREVO_USER, // Test an dich selbst
      subject: "Testmail über Brevo",
      text: "Dies ist eine Testmail über Brevo SMTP."
    });

    res.json({ ok: true, message: "Testmail gesendet." });
  } catch (err) {
    console.error("❌ Fehler bei Testmail:", err);
    res.status(500).json({ ok: false, message: "Fehler bei Testmail." });
  }
});

// Server starten
app.listen(PORT, () => {
  console.log(`✅ Server läuft auf Port ${PORT}`);
});
