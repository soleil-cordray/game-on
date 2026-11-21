require('dotenv').config(); // load .env into process.env (to run 1st)
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const bcrypt = require('bcrypt');
const nodemailer = require('nodemailer');
const MongoClient = require('mongodb').MongoClient;

// =============================================================================
// SETUP
// =============================================================================

const PORT = process.env.PORT || 5001;
const URI = process.env.MONGODB_URI;
const DB_NAME = 'gameon';

const app = express();
app.use(cors());
app.use(bodyParser.json());

// DATABASE: connect once, every route shares 'db'
const mongoClient = new MongoClient(URI);
mongoClient.connect();
const db = mongoClient.db(DB_NAME);

// EMAIL: build transporter once, send-email reuses it
const transporter = nodemailer.createTransport({
  service: 'gmail',
  host: 'smtp.gmail.com',
  port: 587,
  secure: false,
  auth: {
    user: process.env.EMAIL_USERNAME, // sender
    pass: process.env.EMAIL_PASSWORD, // sender
  },
});

// =============================================================================
// ACCOUNT ROUTES
// [SU] SIGN UP:        (1) userCheck  (2) signup  (3) send-email  (4) verify
// [LI] LOG IN:         (1) users
// [PR] PASSWORD RESET: (1) email  (2) send-email  (3) updatepassword
// =============================================================================

// [SU.1] USERNAME EXISTENCE CHECK ---------------------------------------------
app.post('/api/userCheck', async (req, res) => {
  const { username } = req.body;
  var results;
  var error = "";

  try {
    results = await db.collection('users').find({
      Username: username }).toArray();

    if (results.length > 0) {
      error = "That username is taken.";
    }
  } catch (e) {
    console.error("userCheck failed:", e);
    error = "Something went wrong. Please try again.";
  }

  res.json({ result: results, error });
});

// [SU.2] CREATE ACCOUNT -------------------------------------------------------
app.post('/api/signup', async (req, res) => {
  const { username, email, password } = req.body;
  const verificationCode = Math.floor(100000 + Math.random() * 900000);
  const hash = await bcrypt.hash(password, 10);
  const newUser = {
    Username: username, Email: email.toLowerCase(), Password: hash,
    Validate: false, VerifyCode: verificationCode
  };
  var error = "";

  try {
    const results = await db.collection('users').find({
      Username: username }).toArray();

    if (results.length == 0) {
      db.collection('users').insertOne(newUser);
    } else {
      error = "That username is taken.";
    }
  } catch (e) {
    console.error("signup failed:", e);
    error = "Something went wrong. Please try again.";
  }

  res.json({ error });
});

// [SU.3 / PR.2] SEND EMAIL ----------------------------------------------------
app.post('/api/send-email', async (req, res) => {
  const { emailR, username } = req.body;
  var query;
  var message;
  var error = "";

  try {
    if (emailR && username) {
      // [SU.3] verify new account (username & email)
      query = { Username: username, Email: emailR };
      message = "Welcome to GameOn!\n\nYour verification code is: ";
    } else if (username === undefined && emailR) {
      // [PR.2] reset password (email only)
      query = { Email: emailR };
      message = "Welcome back!\n\nYour password reset code is: ";
    } else {
      error = "Email address is required.";
    }

    if (query) {
      const results = await db.collection('users').findOne(query);

      await transporter.sendMail({
        from: process.env.EMAIL_USERNAME, // sender
        to: emailR, // recipient
        subject: "GameOn Email Verification",
        text: message + results.VerifyCode,
      });
    }
  } catch (e) {
    console.error("send-email failed:", e);
    error = "Something went wrong. Please try again.";
  }

  res.json({ error });
});

// [SU.4] VERIFY EMAILED CODE --------------------------------------------------
app.post('/api/verify', async (req, res) => {
  const { email, code } = req.body;
  var error = "";

  try {
    const results = await db.collection('users').findOne({ Email: email });

    if (results && results.VerifyCode === code) {
      db.collection('users').updateOne(
        { Email: email }, { $set: { Validate: true } });
    } else {
      error = "That code doesn't match. Check your email and try again.";
    }
  } catch (e) {
    console.error("verify failed:", e);
    error = "Something went wrong. Please try again.";
  }

  res.json({ error });
});

// [LI.1] LOG IN ---------------------------------------------------------------
app.post('/api/users', async (req, res) => {
  const { username, password } = req.body;
  var match;
  var error = "";

  try {
    results = await db.collection('users').find({
      Username: username }).toArray();

    match = await bcrypt.compare(password, results[0].Password);

    if (!match) {
      error = "Username or password is incorrect.";
    }

    if (results.length <= 0) {
      error = "Username or password is incorrect.";
    }

    if (results[0].Validate === false) {
      error = "Account Not Validated"; // Login.js checks for this exact text
    }
  } catch (e) {
    console.error("users failed:", e);
    error = "Something went wrong. Please try again.";
  }

  res.json({ result: match, user: results[0].Username, error });
});

// [PR.1] FIND ACCOUNT VIA EMAIL -----------------------------------------------
app.post('/api/email', async (req, res) => {
  const { email } = req.body;
  var results;
  var error = "";

  try {
    results = await db.collection('users').findOne({
      Email: email.toLowerCase() });

    if (!results) {
      error = "No account uses that email.";
    }
  } catch (e) {
    console.error("email failed:", e);
    error = "Something went wrong. Please try again.";
  }

  res.json({ result: results, error });
});

// [PR.3] CHANGE PASSWORD ------------------------------------------------------
app.post('/api/updatepassword', async (req, res) => {
  const { email, password } = req.body;
  const hash = await bcrypt.hash(password, 10);
  var error = "";

  try {
    await db.collection('users').updateOne(
      { Email: email }, { $set: { Password: hash } });
  } catch (e) {
    console.error("updatepassword failed:", e);
    error = "Something went wrong. Please try again.";
  }

  res.json({ error });
});

// =============================================================================
// GAME ROUTES
// user keeps one row per game (their best); a better result replaces it
// [RG] REACTION GAME (lowest time):
//      (1) addReactionData  (2) ReactionLeaderboard  (3) userReactionData
// [TG] TYPING GAME (highest score):
//      (1) addTypingData  (2) TypingLeaderboard  (3) userTypingData
// =============================================================================

// [RG.1] SAVE RESULT ----------------------------------------------------------
app.post('/api/addReactionData', async (req, res) => {
  const { username, time, date, device } = req.body;
  const newData = {
    Username: username, Time: time, Date: date, Device: device
  };
  var error = "";

  try {
    const results = await db.collection('ReactionGame').find({
      Username: username }).toArray();

    if (results.length > 0) {
      if (time < results[0].Time) {
        await db.collection('ReactionGame').deleteOne({ Username: username });
        db.collection('ReactionGame').insertOne(newData);
      }
    } else {
      db.collection('ReactionGame').insertOne(newData);
    }
  } catch (e) {
    console.error("addReactionData failed:", e);
    error = "Something went wrong. Please try again.";
  }

  res.json({ error });
});

// [RG.2] GET LEADERBOARD ------------------------------------------------------
app.post('/api/ReactionLeaderboard', async (req, res) => {
  var results;
  var error = "";

  try {
    results = await db.collection('ReactionGame').find().sort({
      Time: 1 }).toArray();

    if (results.length <= 0) {
      error = "No scores yet.";
    }
  } catch (e) {
    console.error("ReactionLeaderboard failed:", e);
    error = "Something went wrong. Please try again.";
  }

  res.json({ results, error });
});

// [RG.3] GET USER'S BEST ------------------------------------------------------
app.post('/api/userReactionData', async (req, res) => {
  const { username } = req.body;
  var error = "";

  try {
    const results = await db.collection('ReactionGame').find({
      Username: username }).toArray();

    if (results.length <= 0) {
      error = "No scores yet for this user.";
    } else {
      var userTime = results[0].Time;
    }
  } catch (e) {
    console.error("userReactionData failed:", e);
    error = "Something went wrong. Please try again.";
  }

  res.json({ userTime, error });
});

// [TG.1] SAVE RESULT ----------------------------------------------------------
app.post('/api/addTypingData', async (req, res) => {
  const { accuracy, date, device, score, speed, username } = req.body;
  const newData = {
    Accuracy: accuracy, Date: date, Device: device,
    Score: score, Speed: speed, Username: username
  };
  var error = "";

  try {
    const results = await db.collection('TypingGame').find({
      Username: username }).toArray();

    if (results.length > 0) {
      if (score > results[0].Score) {
        await db.collection('TypingGame').deleteOne({ Username: username });
        db.collection('TypingGame').insertOne(newData);
      }
    } else if (username === 'Guest') {
      error = "Guest scores are not saved.";
    } else {
      db.collection('TypingGame').insertOne(newData);
    }
  } catch (e) {
    console.error("addTypingData failed:", e);
    error = "Something went wrong. Please try again.";
  }

  res.json({ error });
});

// [TG.2] GET LEADERBOARD ------------------------------------------------------
app.post('/api/TypingLeaderboard', async (req, res) => {
  var results;
  var error = "";

  try {
    results = await db.collection('TypingGame').find().sort({
      Score: -1 }).toArray();

    if (results.length <= 0) {
      error = "No scores yet.";
    }
  } catch (e) {
    console.error("TypingLeaderboard failed:", e);
    error = "Something went wrong. Please try again.";
  }

  res.json({ results, error });
});

// [TG.3] GET USER'S BEST ------------------------------------------------------
app.post('/api/userTypingData', async (req, res) => {
  const { username } = req.body;
  var error = "";

  try {
    const results = await db.collection('TypingGame').find({
      Username: username }).toArray();

    if (results.length <= 0) {
      error = "No scores yet for this user.";
    } else {
      var userScore = results[0].Score;
    }
  } catch (e) {
    console.error("userTypingData failed:", e);
    error = "Something went wrong. Please try again.";
  }

  res.json({ userScore, error });
});

// =============================================================================
// START SERVER
// =============================================================================

app.listen(PORT, () => {
  console.log("Server listening on port " + PORT);
});
