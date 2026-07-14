var express = require('express');
var router = express.Router();
const bcrypt = require('bcrypt');
const sqlite3 = require('sqlite3').verbose();
const leoProfanity = require('leo-profanity');
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const priceFilePath = path.join(__dirname, '..', 'price.json');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const rateLimit = require('express-rate-limit');
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 500,
    message: { success: false, message: 'Too many requests, slow down!' }
});
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 30,
    message: { success: false, message: 'Too many login/signup attempts' }
});
const tokenLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 10,
    message: { success: false, message: 'Slow down!' }
});
const signupLimiter = rateLimit({
    windowMs: 24 * 60 * 60 * 1000,
    max: 5,
    message: { success: false, message: 'Account creation limit reached. Try again tomorrow.' }
});

router.use('/submitsignup', signupLimiter);
router.use('/submitlogin', authLimiter);
router.use('/submitsignup', authLimiter);
router.use('/give', tokenLimiter);
router.use(limiter);

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        const allowed = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
        if (!allowed.includes(file.mimetype)) {
            return cb(new Error('Invalid image type (PNG, JPEG, WEBP, GIF only)'));
        }
        cb(null, true);
    }
});

const db = new sqlite3.Database('./Database', (err) => {
    if (err) console.error('Could not open DB', err);
    else console.log('Database connected!');
});


router.get('/', async function(req, res, next) {
    try {
        const data = await fs.readFile(priceFilePath, 'utf8');
        const priceConfig = JSON.parse(data);

        res.render('index', {
            baseUrl: process.env.BASE_URL,
            price: priceConfig.displayPrice
        });

    } catch (error) {
        console.error("Error reading price file for homepage:", error);

        res.render('index', {
            baseUrl: process.env.BASE_URL,
            price: null 
        }); 
    }
});


router.post('/webhook', (req, res) => {

    const sig = req.headers['stripe-signature'];
    let event;

    try {
        event = stripe.webhooks.constructEvent(
            req.body,
            sig,
            process.env.STRIPE_WEBHOOK_SECRET
        );
    } catch (err) {
        console.log("Webhook failed:", err.message);
        return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    if (event.type === 'checkout.session.completed') {
        const session = event.data.object;

        const username = session.metadata.username;
        const tokens = parseInt(session.metadata.tokens);

        db.run(
            'UPDATE users SET Tokens = Tokens + ?, Last_token_update = CURRENT_TIMESTAMP WHERE Username = ?',
            [tokens, username],
            (err) => {
                if (err) console.error(err);
                else console.log(`Added ${tokens} tokens to ${username}`);
            }
        );
    }

    res.sendStatus(200);
});

router.get('/leaderboard', (req, res) => {
    db.all(
        'SELECT id, Username, Tokens, Pfp, Bio FROM users ORDER BY Tokens DESC, Last_token_update ASC', [],
        (err, rows) => {
            if (err) { console.error(err); return res.json({ success: false }); }
            res.json(rows);
        }
    );
});

router.get('/user/:username', (req, res) => {
    db.get(
        'SELECT id, Username, Tokens, Pfp, Bio, Created_at FROM users WHERE Username = ?',
        [req.params.username],
        (err, user) => {
            if (!user) return res.json({ success: false });
            res.json({ success: true, user });
        }
    );
});

router.post('/upload-pfp', requireLogin, (req, res) => {
    upload.single('pfp')(req, res, async (err) => {
        if (err instanceof multer.MulterError) {
            return res.json({ success: false, message: err.code === 'LIMIT_FILE_SIZE' ? 'File too large' : err.message });
        }
        if (err) return res.json({ success: false, message: err.message || 'Upload failed' });
        if (!req.file) return res.json({ success: false, message: 'No file uploaded' });

        const ext = path.extname(req.file.originalname);
        const filename = req.session.UserID + ext;
        const destPath = path.join(__dirname, '..', 'public', 'pfps', filename);

        try {
            await fs.writeFile(destPath, req.file.buffer);

            db.run('UPDATE users SET Pfp = ? WHERE id = ?', [filename, req.session.UserID], (err) => {
                if (err) return res.json({ success: false, message: 'DB error' });
                res.json({ success: true, filename });
            });
        } catch (e) {
            console.error(e);
            res.json({ success: false, message: 'Server error' });
        }
    });
});

router.post('/update-settings', requireLogin, async (req, res) => {
    let { username, newPassword, newBiography, currentPassword } = req.body;

    db.get(
        'SELECT * FROM users WHERE Username = ?',
        [req.session.Username],
        async (err, user) => {

            if (!user) {
                return res.json({ success: false, message: 'User not found.' });
            }
            
            const passwordValid = await bcrypt.compare(currentPassword, user.Password);

            if (!passwordValid) {
                return res.json({ success: false, message: 'Incorrect password.' });
            }

            const isChangingUsername = username && username !== user.Username;
            const isChangingPassword = newPassword && newPassword.length > 0;
            const isChangingBio = newBiography !== undefined;

            const newUsername = username?.trim() || user.Username;
            let newHash = user.Password;

            if (isChangingUsername) {

                if (leoProfanity.check(newUsername)) {
                    return res.json({ success: false, message: 'Username not allowed.' });
                }

                if (newUsername.length > 20) {
                    return res.json({ success: false, message: 'Username is too long.' });
                }

                if (newUsername.length < 3) {
                    return res.json({ success: false, message: 'Username is too short.' });
                }

                if (!/^[a-z0-9_-]+$/.test(newUsername)) {
                    return res.json({
                        success: false,
                        message: 'Username can only contain letters, numbers, _ and -.'
                    });
                }
            }

            if (isChangingPassword) {

                if (newPassword === 'password') {
                    return res.json({ success: false, message: `Please don't make "password" your password!` });
                }

                if (newPassword.length < 8) {
                    return res.json({ success: false, message: 'Password is too short.' });
                }

                if (newPassword.includes(' ')) {
                    return res.json({ success: false, message: 'Password contains spaces.' });
                }

                newHash = await bcrypt.hash(newPassword, 10);
            }

            if (isChangingBio) {

                if (newBiography.length > 200) {
                    return res.json({
                        success: false,
                        message: 'Biography is too long.'
                    });
                }

                if (leoProfanity.check(newBiography)) {
                    return res.json({
                        success: false,
                        message: 'Biography not allowed.'
                    });
                }
            }

            db.run(
                'UPDATE users SET Username = ?, Password = ?, Bio = ? WHERE Username = ?',
                [newUsername, newHash, newBiography || user.Bio, req.session.Username],
                (err) => {
                    if (err) return res.json({ success: false, message: 'DB error' });

                    if (isChangingUsername) {
                        req.session.Username = newUsername;
                    }

                    res.json({ success: true });
                }
            );
        }
    );
});

router.get('/me-full', requireLogin, (req, res) => {
    db.get('SELECT Pfp, Bio, Tokens FROM users WHERE Username = ?', 
    [req.session.Username], (err, user) => {
        if (!user) return res.json({ success: false });
        res.json({ pfp: user.Pfp, bio: user.Bio, tokens: user.Tokens });
    });
});

router.get('/me', (req, res) => {
    if (req.session.Username) {
        res.json({ user: req.session.Username });
    } else {
        res.json({ user: null });
    }
});

function requireLogin(req, res, next) {
    if (req.session.Username) {
        next();
    } else {
        res.json({ success: false, message: 'Not logged in' });
    }
}

router.post('/logout', (req, res) => {
	req.session.destroy();
	res.json({ success: true });
});

router.post('/give', async (req, res) => {

    try {
        const tokens = Number(req.body.tokens);
        const baseUrl = process.env.BASE_URL;

        if (!req.session || !req.session.Username) {
            return res.json({ success: false, message: "no_user" });
        }

        if (!Number.isInteger(tokens) || tokens < 1 || tokens > 999) {
            return res.status(400).json({ error: 'Invalid token amount' });
        }

        const data = await fs.readFile(priceFilePath, 'utf8');
        const priceConfig = JSON.parse(data);

        const session = await stripe.checkout.sessions.create({
            mode: "payment",
            line_items: [{
                price_data: {
                    currency: 'gbp',
                    product_data: {
                        name: `${tokens} Tokens`
                    },
                    unit_amount: tokens * priceConfig.priceInPence,
                },
                quantity: 1
            }],
            metadata: {
                username: req.session.Username,
                tokens: String(tokens)
            },
            success_url: `${baseUrl}/?payment=success`,
            cancel_url: `${baseUrl}/?payment=cancel`,
        })

        res.json({ url: session.url });
    } catch (err) {
        console.error(err);
        res.json({ success: false, message: "payment_error" });
    }
});

// User tries to log in
router.post("/submitlogin", (req, res) => {

    // console.log(req.body);

    const { username, password } = req.body;

    if (!username || !password) {
        return res.json({ success: false, message: 'All fields required' });
    }

    const cleanUsername = username.toLowerCase();

    db.get('SELECT * FROM users WHERE Username = ?', [cleanUsername], async (err, user) => {
        if (!user) return res.json({ success: false, message: 'Invalid credentials' });

        const match = await bcrypt.compare(password, user.Password);
        if (!match) return res.json({ success: false, message: 'Invalid credentials' });

        req.session.UserID = user.id;
		req.session.Username = cleanUsername;
        console.log(req.session.UserID)
        console.log("LOGIN", user.id, cleanUsername);
        res.json({ success: true });
    });

});

router.post("/submitsignup", async (req, res) => {
	const { username, password } = req.body;

	if (leoProfanity.check(username)) {
		return res.json({ success: false, message: 'Username not allowed.' });
	}

	if (username.length > 13) {
		return res.json({ success: false, message: 'Username is too long.' });
	}

	if (password == "password") {
		return res.json({ success: false, message: `Im dissapointed in you.` });
	}

	if (username.length < 4) {
		return res.json({ success: false, message: 'Username is too short must be at least 3 characters.' });
	}

	if (password.length < 8) {
		return res.json({ success: false, message: 'Password is too short.' });
	}

	if(password.indexOf(' ') >= 0 && username.indexOf(' ') >= 0 ){
		return res.json({ success: false, message: 'Password and Username contains spaces.' });
	}

	if(password.indexOf(' ') >= 0 ){
		return res.json({ success: false, message: 'Password contains spaces.' });
	}

	if(username.indexOf(' ') >= 0 ){
		return res.json({ success: false, message: 'Username contains spaces.' });
	}

    const cleanUsername = username.toLowerCase();

    if (!/^[a-z0-9_-]+$/.test(cleanUsername)) {
        return res.json({
            success: false,
            message: 'Username can only contain letters, numbers, _ and -.'
        });
    }

	let hash = await bcrypt.hash(password, 10)

	db.run(
		"INSERT INTO users (Username, Password) VALUES (?, ?)",
		[cleanUsername, hash],
		function(err) {
			if (err) return res.json({ success: false, message: 'Username taken' });
			res.json({ success: true });
		}
	);
});

module.exports = router;
