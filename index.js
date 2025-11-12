require("dotenv").config();
const express = require("express");
const cors = require("cors");
const axios = require("axios");

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

// Formular-Route für Kündigung
app.post("/submit", async (req, res) => {
  const { mitglied_vorname, mitglied_nachname, email } = req.body;

  try {
    await axios.post("https://api.brevo.com/v3/smtp/email", {
      sender: { email: "mitglieder@fc-badenia-stilgen.de" }, // deine Vereinsadresse (nach Domain-Verifizierung)
      to: [{ email }],
      subject: "Kündigungsbestätigung",
      textContent: `Hallo ${mitglied_vorname} ${mitglied_nachname},\n\nIhre Kündigung ist eingegangen.\n\nSportliche Grüße,\nFC Badenia St. Ilgen`
    }, {
      headers: {
        "api-key": process.env.BREVO_API_KEY,
        "Content-Type": "application/json"
      }
    });

    res.json({ ok: true, message: "Bestätigungsmail gesendet." });
  } catch (err) {
    console.error("❌ Fehler beim Mailversand:", err.response?.data || err.message);
    res.status(500).json({ ok: false, message: "Fehler beim Mailversand." });
  }
});

// Test-Route für Mailversand
app.get("/testmail", async (req, res) => {
  try {
    await axios.post("https://api.brevo.com/v3/smtp/email", {
      sender: { email: "info@fcbadenia.de" },
      to: [{ email: process.env.BREVO_USER }], // Test an dich selbst
      subject: "Testmail über Brevo API",
      textContent: "Dies ist eine Testmail über die Brevo API."
    }, {
      headers: {
        "api-key": process.env.BREVO_API_KEY,
        "Content-Type": "application/json"
      }
    });

    res.json({ ok: true, message: "Testmail gesendet." });
  } catch (err) {
    console.error("❌ Fehler bei Testmail:", err.response?.data || err.message);
    res.status(500).json({ ok: false, message: "Fehler bei Testmail." });
  }
});

// Server starten
app.listen(PORT, () => {
  console.log(`✅ Server läuft auf Port ${PORT}`);
});
