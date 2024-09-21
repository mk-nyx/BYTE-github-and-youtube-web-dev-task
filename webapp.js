require("dotenv").config();
const express = require("express");
const session = require("express-session");
const axios = require("axios");
const passport = require("passport");
const githubStrategy = require("passport-github2").Strategy;
const googleStrategy = require("passport-google-oauth20").Strategy;
const { google } = require("googleapis");

const app = express();

app.use(express.static("static"));

// session setup
app.use(session({
    secret: process.env.sessionSecret,
    resave: false,
    saveUninitialized: false,
    cookie: {
        httpOnly: true,
        secure: false,
        maxAge: 24 * 60 * 60 * 1000, // 24 hours
    },
}));

// setting up passport
app.use(passport.initialize());
app.use(passport.session());

passport.serializeUser((user, done) => done(null, user));
passport.deserializeUser((user, done) => done(null, user));

// function to get all the followers from all pages in a list
async function getAllFollowers(accessToken, account) {
    let page = 1;
    let allFollowers = [];
    while (true) {
        const apiurl = `https://api.github.com/users/${account}/followers?page=${page}&per_page=100`;
        const response = await axios.get(apiurl, {
            headers: { Authorization: `token$ {accessToken}`, 'If-None-Match': '' }
        });
        if (response.data.length === 0) {
            break;
        }
        allFollowers = allFollowers.concat(response.data);
        page++;
    }
    return allFollowers;
}

// GitHub strategy
passport.use(new githubStrategy({
    clientID: process.env.github_clientId,
    clientSecret: process.env.github_clientSecret,
    callbackURL: "http://localhost:3000/auth/github/callback"
},
    async function (accessToken, refreshToken, profile, done) {
        try {
            console.log("Authenticating GitHub user:", profile.username);
            const followers = await getAllFollowers(accessToken, "bytemait");
            console.log(`Fetched ${followers.length} followers for bytemait`);

            const isFollowing = followers.some(follower => follower.id.toString() === profile.id.toString());
            console.log(`User ${profile.username} is following bytemait: ${isFollowing}`);

            if (isFollowing) {
                return done(null, profile);
            }
            else {
                return done(null, false, { message: `You must follow the bytemait GitHub account.` });
            }
        } catch (error) {
            console.error("Error in GitHub Strategy:", error);
            return done(error);
        }
    }
));

// Google Strategy
passport.use("google", new googleStrategy({
    clientID: process.env.google_clientId,
    clientSecret: process.env.google_clientSecret,
    callbackURL: "http://localhost:3000/auth/google/callback",
    scope: ['profile', 'email', 'https://www.googleapis.com/auth/youtube.readonly']
},
    async function (accessToken, refreshToken, profile, done) {
        try {
            const oauth2client = new google.auth.OAuth2();
            oauth2client.setCredentials({ access_token: accessToken });

            const youtube = google.youtube({
                version: 'v3',
                auth: oauth2client
            });

            const response = await youtube.subscriptions.list({
                part: 'snippet',
                mine: true
            });

            console.log("Authenticating YouTube user...")

            const isSubscribed = response.data.items.some(item => item.snippet.resourceId.channelId === "UCgIzTPYitha6idOdrr7M8sQ");
            console.log("User is subscribed to BYTE-mait:", isSubscribed);

            if (isSubscribed) {
                return done(null, profile);
            }
            else {
                return done(null, false, { message: `You must subscribe the BYTE-mait YouTube Channel.` });
            }
        } catch (error) {
            console.error("Error in Google Strategy:", error);
            return done(error);
        }
    }
));

// function to check if user is still logged in or not
const ensureAuthenticated = function (req, res, next) {
    if (req.isAuthenticated()) {
        next();
    }
    else {
        res.redirect("/");
    }
}

// routes

// main page route
app.get("/", function (req, res) {
    if (req.user) {
        return res.redirect("/access-private");
    }
    res.sendFile(__dirname + "/authorization.html");
});

// auth github route
app.get('/auth/github', passport.authenticate('github', { scope: ['user:follow'] }));

app.get("/auth/github/callback",
    passport.authenticate("github", { failureRedirect: "/access-failed" }),
    function (req, res) {
        res.redirect("/access-private");
    }
);

// auth google route
app.get("/auth/google", passport.authenticate("google"));

app.get("/auth/google/callback",
    passport.authenticate("google", { failureRedirect: "/access-failed" }),
    function (req, res) {
        res.redirect("/access-private");
    }
);

// access granted successfully route
app.get("/access-private", ensureAuthenticated, function (req, res) {
    res.sendFile(__dirname + "/private-secret.html");
});

// acess failed route
app.get("/access-failed", function (req, res) {
    res.sendFile(__dirname + "/access-denied.html")
});

app.get("/logout", function (req, res) {
    req.logOut(function (err) {
        if (err) {
            return next(err)
        }
        res.redirect("/");
    });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, function () {
    console.log("Server is running on port 3000");
});