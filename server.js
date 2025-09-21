require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const path = require('path');
const bcrypt = require('bcrypt');

const User = require('./models/User');
const LoginLog = require('./models/LoginLog');

const { v4: uuidv4 } = require('uuid');

const sessions = new Map(); // SessionID → UserID

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log('MongoDB kapcsolódva'))
    .catch(err => console.error('MongoDB hiba:', err));

app.get('/api', (req, res) => {
    res.send('API fut és kapcsolódott a MongoDB-hez!');
});

app.post('/api/users', async (req, res) => {
    try {
        const { firstname, lastname, username, password, email, phone, station_assigned, rank, code } = req.body;

        // Jelszó bcrypted
        const saltRounds = 10;
        const hashedPassword = await bcrypt.hash(password, saltRounds);

        console.log(station_assigned)

        const user = new User({
            firstname,
            lastname,
            username,
            password: hashedPassword,
            email,
            phone,
            assigned_station: station_assigned,
            last_login: null,
            rank,
            code,
        });

        await user.save();
        res.status(201).json({ message: 'Felhasználó létrehozva', userId: user._id });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Hiba történt a felhasználó létrehozásakor', error: err.message });
    }
});

app.post('/api/admin-login', async (req, res) => {
    const ip = req.ip;
    const { code } = req.body;

    try {
        const user = await User.findOne({ code });
        if (!user) {
            await LoginLog.create({ user: null, success: false, ip });
            return res.status(401).json({ message: 'Érvénytelen kód' });
        }

        const sessionId = uuidv4();
        sessions.set(sessionId, user._id.toString());

        user.last_login = new Date();
        await user.save();
        await LoginLog.create({ user: user._id, success: true, ip });

        res.status(200).json({ message: 'Sikeres bejelentkezés kóddal', sessionId });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Hiba történt a kódos bejelentkezés során' });
    }
});

app.post('/api/login', async (req, res) => {
    const ip = req.ip; // kliens IP-je
    const { username, password } = req.body;

    try {
        const user = await User.findOne({ username });

        if (!user) {
            // Sikertelen login log
            await LoginLog.create({ user: null, success: false, ip });
            return res.status(401).json({ message: 'Hibás felhasználónév vagy jelszó' });
        }

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            // Sikertelen login log
            await LoginLog.create({ user: user._id, success: false, ip });
            return res.status(401).json({ message: 'Hibás felhasználónév vagy jelszó' });
        }

        // Sikeres login → Session ID
        const sessionId = uuidv4();
        sessions.set(sessionId, user._id.toString());

        // User utolsó bejelentkezés frissítése
        user.last_login = new Date();
        await user.save();

        // Login log létrehozása
        await LoginLog.create({ user: user._id, success: true, ip });

        res.json({ message: 'Sikeres bejelentkezés', sessionId });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Hiba történt a bejelentkezés során' });
    }
});

app.get('/api/me', async (req, res) => {
    const sessionId = req.header('Authorization'); // vagy cookie
    if (!sessionId || !sessions.has(sessionId)) {
        return res.status(401).json({ message: 'Érvénytelen Session ID' });
    }

    const userId = sessions.get(sessionId);

    try {
        const user = await User.findById(userId).select('-password'); // jelszó nélkül
        if (!user) return res.status(404).json({ message: 'Felhasználó nem található' });

        res.json(user);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Hiba a felhasználó lekérésekor' });
    }
});

app.post('/api/logout', (req, res) => {
    const sessionId = req.header('Authorization'); // vagy cookie
    if (sessionId && sessions.has(sessionId)) {
        sessions.delete(sessionId);
    }
    res.status(200).json({ message: 'Kijelentkezés sikeres' });
});

app.get('/api/users', async (req, res) => {
    try {
        const users = await User.find().select('-password'); // jelszó nélkül
        res.json(users);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Hiba a felhasználók lekérésekor' });
    }
});

app.delete('/api/users/:id', async (req, res) => {
    try {
        const { id } = req.params;

        // Find the user we want to delete
        const userToDelete = await User.findById(id);
        if (!userToDelete) {
            return res.status(404).json({ message: 'Felhasználó nem található' });
        }

        // If this user is an admin (rank 99), check how many admins exist
        if (userToDelete.rank === 99) {
            const adminCount = await User.countDocuments({ rank: 99 });
            if (adminCount <= 1) {
                return res.status(400).json({ message: 'Nem törölheted az utolsó admin felhasználót!' });
            }
        }

        // Proceed with deletion
        await User.findByIdAndDelete(id);
        res.json({ message: 'Felhasználó törölve' });

    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Hiba a felhasználó törlésekor' });
    }
});


app.put('/api/users/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { firstname, lastname, email, phone, assigned_station, rank, password, code } = req.body;

        // Build update object only with provided fields
        const updateData = {};
        if (firstname !== undefined) updateData.firstname = firstname;
        if (lastname !== undefined) updateData.lastname = lastname;
        if (email !== undefined) updateData.email = email;
        if (phone !== undefined) updateData.phone = phone;
        if (assigned_station !== undefined) updateData.assigned_station = assigned_station;
        if (rank !== undefined) updateData.rank = parseInt(rank); // ensure number
        if (code !== undefined) updateData.code = code;

        // Hash password if provided
        if (password) {
            const saltRounds = 10;
            updateData.password = await bcrypt.hash(password, saltRounds);
        }

        const updatedUser = await User.findByIdAndUpdate(id, updateData, { new: true }).select('-password');
        if (!updatedUser) {
            return res.status(404).json({ message: 'Felhasználó nem található' });
        }

        res.json({ message: 'Felhasználó frissítve', user: updatedUser });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Hiba a felhasználó frissítésekor' });
    }
});

app.post('/api/players', async (req, res) => {
    try {
        const { name, number, class: className } = req.body

        if (!name || !number || !className) {
            return res.status(400).json({ message: 'Minden mező kitöltése kötelező: name, number, class' });
        }

        const newPlayer = new (require('./models/Player'))({
            name,
            number,
            class: className
        });

        await newPlayer.save();
        res.status(201).json({ message: 'Játékos létrehozva', player: newPlayer });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Hiba történt a játékos létrehozásakor' });
    }
});

app.put('/api/players/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { name, number, class: className, points } = req.body;

        const updateData = {};
        if (name !== undefined) updateData.name = name;
        if (number !== undefined) updateData.number = number;
        if (className !== undefined) updateData.class = className;
        if (points !== undefined) updateData.points = points;

        const updatedPlayer = await require('./models/Player').findByIdAndUpdate(id, updateData, { new: true });

        if (!updatedPlayer) {
            return res.status(404).json({ message: 'Játékos nem található' });
        }

        res.json({ message: 'Játékos frissítve', player: updatedPlayer });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Hiba a játékos frissítésekor' });
    }
});

app.delete('/api/players/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const deletedPlayer = await require('./models/Player').findByIdAndDelete(id);

        if (!deletedPlayer) {
            return res.status(404).json({ message: 'Játékos nem található' });
        }

        res.json({ message: 'Játékos törölve' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Hiba a játékos törlésekor' });
    }
});

app.patch('/api/players/:id/points', async (req, res) => {
    try {
        const { id } = req.params;
        const { points } = req.body;

        if (typeof points !== 'number') {
            return res.status(400).json({ message: 'A points mező szám kell legyen' });
        }

        const player = await require('./models/Player').findById(id);
        if (!player) return res.status(404).json({ message: 'Játékos nem található' });

        player.points += points;
        await player.save();

        res.json({ message: 'Pontok frissítve', player });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Hiba a pontok frissítésekor' });
    }
});

app.get('/api/players', async (req, res) => {
    try {
        const players = await require('./models/Player').find().sort({ createdAt: -1 });
        res.json(players);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Hiba a játékosok lekérésekor' });
    }
});


app.get('/dashboard', (req, res) => {
    res.sendFile(__dirname + "/public/app/dashboard.html")
})

app.get('/dashboard/admin/users', (req, res) => {
    res.sendFile(__dirname + "/public/app/users.html")
})

app.get('/dashboard/players', (req, res) => {
    res.sendFile(__dirname + "/public/app/players.html")
})

app.get('/dashboard/admin/stations', (req, res) => {
    res.sendFile(__dirname + "/public/app/stations.html")
})

// Server indítás
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`Server fut a ${PORT} porton`));
