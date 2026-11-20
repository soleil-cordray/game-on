const bcrypt = require("bcrypt");
require('dotenv').config();
const express = require('express');
const MongoClient = require('mongodb').MongoClient;
const bodyParser = require('body-parser');
const cors = require('cors');
const nodemailer = require('nodemailer'); // email verification

const app = express();

const PORT = process.env.PORT || 5001;
app.set('port', PORT);

app.use(cors());
app.use(bodyParser.json());

const URI = process.env.MONGODB_URI;
const DB_NAME = "gameon";
const mongoClient = new MongoClient(URI);
mongoClient.connect();
const db = mongoClient.db(DB_NAME);

// =============================================================================
// ACCOUNT ROUTES
// =============================================================================

// SIGNUP ----------------------------------------------------------------------
app.post('/api/signup', async (req, res) => {
  const verificationCode = Math.floor(100000 + Math.random() * 900000);
  const { username, email, password } = req.body;
  const hash = await bcrypt.hash(password, 10);
  const newUser = {
    Username: username, Email: email.toLowerCase(), Password: hash,
    Validate: false, VerifyCode: verificationCode
  };

  var error = "";

  try {
    const results = await db.collection('users').find({
      Username: username
    }).toArray();

    if (results.length == 0) {
      db.collection('users').insertOne(newUser);
    } else {
      error = "User already exists";
    }
  } catch (e) {
    error = e;
  }

  res.json({ error })
});

// CHECK EXISTING USER ---------------------------------------------------------
app.post('/api/userCheck', async (req, res) => {
  const { username } = req.body;

  var results;
  var error = "";

  try {
    results = await db.collection('users').find({
      Username: username
    }).toArray();

    if (results.length > 0) {
      error = "User already exists";
    }
  } catch (e) {
    error = e;
  }

  res.json({ result: results, error });
});

// LOGIN -----------------------------------------------------------------------
app.post('/api/users', async (req, res) => {
  const { username, password } = req.body;

  var match;
  var error = "";

  try {
    results = await db.collection('users').find({
      Username: username
    }).toArray();

    match = await bcrypt.compare(password, results[0].Password);

    if (!match) {
      error = "Password does not match";
    }

    if (results.length <= 0) {
      error = "No Account Exists";
    }

    if (results[0].Validate === false) {
      error = "Account Not Validated";
    }
  } catch {
    error = "Error Occured";
  }

  res.json({ result: match, user: results[0].Username, error });
});

// EMAIL -----------------------------------------------------------------------
app.post('/api/email', async (req, res) => {
  const { email } = req.body;

  var results;
  var error = "";

  try {
    results = await db.collection('users').findOne({
      Email: email.toLowerCase()
    });

    if (!results.Email) {
      error = "No Email Found";
    }
  } catch (e) {
    error = "Error Finding Email";
  }

  res.json({ result: results, error });
});

// =============================================================================
// GAME ROUTES
// =============================================================================

app.post('/api/addReactionData', async (req, res) => {
  const { username, time, date, device } = req.body;
  const newData = {
    Username: username, Time: time, Date: date, Device: device
  };
  var error = '';

  try {
    const results = await db.collection('ReactionGame').find({
      Username: username
    }).toArray();

    if (results.length > 0) {
      if (time < results[0].Time) {
        const query = { Username: username }
        await db.collection("ReactionGame").deleteOne(query);
        db.collection('ReactionGame').insertOne(newData);
      }
    } else {
      db.collection('ReactionGame').insertOne(newData);
    }
  } catch (e) {
    error = e;
  }

  res.json({ error });
});

app.post('/api/ReactionLeaderboard', async (req, res) => {
  var error = '';
  var results;

  try {
    results = await db.collection('ReactionGame').find().sort({
      Time: 1
    }).toArray();

    if (results.length <= 0) {
      error = "No Data";
    }
  } catch (e) {
    error = e;
  }

  res.json({ results, error });
});

app.post('/api/addTypingData', async (req, res) => {
  const { accuracy, date, device, score, speed, username } = req.body;
  const newData = {
    Accuracy: accuracy, Date: date, Device: device,
    Score: score, Speed: speed, Username: username
  };
  var error = '';

  try {
    const results = await db.collection('TypingGame').find({
      Username: username
    }).toArray();

    if (results.length > 0) {
      if (score > results[0].Score) {
        const query = { Username: username }
        await db.collection("TypingGame").deleteOne(query);
        db.collection('TypingGame').insertOne(newData);
      }
    } else if (username === "Guest") {
      error = "Guest Account";
    } else {
      db.collection('TypingGame').insertOne(newData);
    }
  } catch (e) {
    error = e;
  }

  res.json({ error });
});

app.post('/api/TypingLeaderboard', async (req, res) => {
  var error = '';
  var results;

  try {
    results = await
    db.collection('TypingGame').find().sort({ Score: -1 }).toArray();

    if (results.length <= 0) {
      error = "No Data";
    }
  } catch (e) {
    error = e;
  }

  res.json({ results, error });
});

app.post('/api/userTypingData', async (req, res) => {
  const { username } = req.body;
  var error = '';

  try {
    const results = await db.collection('TypingGame').find({
      Username: username
    }).toArray();

    if (results.length <= 0) {
      error = "No User Exists";
    }

    var userScore = results[0].Score;
  } catch (e) {
    error = e;
  }

  res.json({ userScore, error });
});

app.post('/api/userReactionData', async (req, res) => {
  const { username } = req.body;
  var error = '';

  try {
    const results = await db.collection('ReactionGame').find({
      Username: username
    }).toArray();

    if (results.length <= 0) {
      error = "No User Exists";
    }

    var userTime = results[0].Time;
  } catch (e) {
    error = e;
  }

  res.json({ userTime, error });
});

// POST route to send email
app.post('/api/send-email', async (req, res) => {
  const { emailR, username } = req.body;
  var message = '';

  try {
    if (username === undefined && emailR) {
      // Reset Password
      const results = await db.collection('users').findOne({ Email: emailR });
      message = `Welcome to GameOn!\n\nLets reset your password!\nYour reset code is : ${results.VerifyCode}`;
    } else if (emailR && username) {
      // Get this verification code in database along with the user's emailR
      const results = await db.collection('users').findOne({
        Username: username, Email: emailR
      });

      message = `Welcome to GameOn!\n\nYour verificaion code is : ${results.VerifyCode}`;
    } else {
      res.status(200).send('Error sending email getting user/email');
    }

    // Create a nodemailer transporter
    let transporter = nodemailer.createTransport({
      service: 'gmail', // Use Gmail as the email service
      host: "smtp.gmail.com",
      port: 587,
      secure: false,
      auth: {
        user: process.env.EMAIL_USERNAME, // sender
        pass: process.env.EMAIL_PASSWORD, // sender
      },
    });

    // Define email options
    let mailOptions = {
      from: process.env.EMAIL_USERNAME, // sender
      to: emailR, // Recipient email address
      subject: 'GameOn Email Verification', // Email subject
      text: message, // Plain text body
    };

    // Send email
    transporter.sendMail(mailOptions, (error, info) => {
      if (error) {
        console.error('Error sending email:', error);
        res.status(200).send('Error sending email transporter.sendMail');
      } else {
        res.status(200).send('Email sent successfully');
      }
    });
  } catch(e) {
    error = e;
  }
});

app.post('/api/verify', async (req, res) => {
  const { email, code } = req.body;
  var error = '';
  const results = await db.collection('users').findOne({ Email: email });

  if (results.VerifyCode === code) {
    const filter = { Email: email };
    db.collection('users').updateOne(filter, { $set: { Validate: true } });
  } else {
    error = 'Does Not Match!';
  }

  res.json({ error });
});

app.post('/api/updatepassword', async (req, res) => {
  const { email, password } = req.body;
  var error = '';
  const hash = await bcrypt.hash(password, 10);

  try {
    await db.collection('users').findOne({ Email: email });
    const filter = { Email: email };
    await db.collection('users').updateOne(filter, {
      $set: { Password: hash }
    });
  } catch (e) {
    error = e;
  }

  res.json({ error })
});

app.use((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'Origin, X-Requested-With, Content-Type, Accept, Authorization'
  );
  res.setHeader(
    'Access-Control-Allow-Methods',
    'GET, POST, PATCH, DELETE, OPTIONS'
  );
});

app.listen(PORT, () => {
    console.log('Server listening on port ' + PORT);
});
