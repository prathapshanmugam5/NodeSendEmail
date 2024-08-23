const express = require('express');
const nodemailer = require('nodemailer');
const crypto = require('crypto');
const mysql = require('mysql2');
const cron = require('node-cron');

const app = express();
app.use(express.json());

// MySQL connection setup without specifying the database
const db = mysql.createConnection({
  host: 'localhost',
  user: 'root',
  password: 'root',
  port: 3306
});

// Connect to MySQL
db.connect(err => {
  if (err) {
    console.error('Error connecting to MySQL:', err);
    return;
  }
  console.log('Connected to MySQL');

  // Create the database if it does not exist
  db.query('CREATE DATABASE IF NOT EXISTS otpDatabase', (error, results) => {
    if (error) {
      console.error('Error creating database:', error);
    } else {
      console.log('Database created successfully!');

      // Now, connect to the newly created database
      db.changeUser({ database: 'otpDatabase' }, (err) => {
        if (err) {
          console.error('Error switching to database:', err);
          return;
        }
        console.log('Connected to otpDatabase');

        // Create the table if it does not exist
        const createTableQuery = `
          CREATE TABLE IF NOT EXISTS otps (
            id INT AUTO_INCREMENT PRIMARY KEY,
            email VARCHAR(255) NOT NULL,
            otp VARCHAR(6) NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
          )
        `;
        db.query(createTableQuery, (error, results) => {
          if (error) {
            console.error('Error creating table:', error);
          } else {
            console.log('Table created successfully!');
          }
        });
      });
    }
  });
});

// Rest of your code (nodemailer setup, routes, cron job, etc.)


// Nodemailer setup
const transporter = nodemailer.createTransport({
  host: 'smtp.gmail.com',
  port: 587,
  secure: false,
  auth: {
    user: 'prathapshanmugam5@gmail.com',
    pass: 'hdlh hkrg lfby wkrb',
  },
});

// Send email endpoint
app.post('/send-email', async (req, res) => {
  const { to, subject, text } = req.body;

  try {
    const info = await transporter.sendMail({
      from: '"Prathap" <prathapshanmugam5@gmail.com>',
      to,
      subject,
      text,
    });

    res.status(200).json({ message: 'Email sent successfully!', info });
  } catch (error) {
    console.error('Error sending email:', error);
    res.status(500).json({ message: 'Failed to send email', error: error.message });
  }
});

// Generate OTP endpoint
app.post('/generate-otp', async (req, res) => {
  const { to } = req.body;
  const otp = crypto.randomInt(100000, 999999).toString();

  const query = 'SELECT * FROM otps WHERE email = ? AND TIMESTAMPDIFF(MINUTE, created_at, NOW()) < 5';
  
  db.query(query, [to], (error, results) => {
    if (error) {
      console.error('Error checking for existing OTP:', error);
      return res.status(500).json({ message: 'Failed to generate OTP', error: error.message });
    }

    if (results.length > 0) {
      return res.status(429).json({ message: 'OTP already sent within the last 5 minutes. Please try again later.' });
    }

    const query = 'INSERT INTO otps (email, otp) VALUES (?, ?)';
    
    db.query(query, [to, otp], async (error, results) => {
      if (error) {
        console.error('Error inserting OTP:', error);
        return res.status(500).json({ message: 'Failed to generate OTP', error: error.message });
      }

      try {
        await transporter.sendMail({
          from: '"Prathap" <prathapshanmugam5@gmail.com>',
          to,
          subject: 'OTP Verification',
          text: `Your OTP is ${otp}`,
        });

        res.status(200).json({ message: 'OTP generated and sent successfully!', otpId: results.insertId });
      } catch (error) {
        console.error('Error sending OTP email:', error);
        res.status(500).json({ message: 'Failed to send OTP', error: error.message });
      }
    });
  });
});

// Verify OTP endpoint
app.post('/verify-otp', (req, res) => {
  const { email, otp } = req.body;

  const query = 'SELECT * FROM otps WHERE email = ? AND otp = ?';
  
  db.query(query, [email, otp], (error, results) => {
    if (error) {
      console.error('Error verifying OTP:', error);
      return res.status(500).json({ message: 'Failed to verify OTP', error: error.message });
    }

    if (results.length > 0) {
      res.status(200).json({ message: 'OTP verified successfully!' });
    } else {
      res.status(401).json({ message: 'Invalid OTP' });
    }
  });
});

// Delete OTPs older than 5 minutes
cron.schedule('* * * * *', () => {
  const query = 'DELETE FROM otps WHERE TIMESTAMPDIFF(MINUTE, created_at, NOW()) > 5';
  db.query(query, (error, results) => {
    if (error) {
      console.error('Error deleting OTPs:', error);
    } else {
      console.log('OTPs deleted successfully!');
    }
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});