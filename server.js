require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const path = require('path');
const bcrypt = require('bcrypt');

const User = require('./models/User');
const LoginLog = require('./models/LoginLog');
const Station = require('./models/Station');

const { sendMail } = require("./utils/mailer")

const { v4: uuidv4 } = require('uuid');

const sessions = new Map(); // SessionID → UserID

const accessCode = "123456"


const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// --- Socket.io Setup ---
const http = require('http');
const server = http.createServer(app);
const { Server } = require('socket.io');
const io = new Server(server, {
    cors: { origin: "*" }
});

function broadcastUpdate() {
    io.emit('stationsUpdated');
}


mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log('MongoDB kapcsolódva'))
    .catch(err => console.error('MongoDB hiba:', err));

app.get('/api', (req, res) => {
    res.send('API fut és kapcsolódott a MongoDB-hez!');
});

app.post('/api/users', async (req, res) => {
    try {
        const { firstname, lastname, username, password, email, phone, station_assigned, rank, code } = req.body;

        const ip = req.ip;

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

        const result = await sendMail({
            to: user.email,
            subject: "Üdvözlünk rendszerünkben!",
            text: `Sikeres regisztráció történt a rendszerünkben.

Felhasználói adataid:
---------------------
Felhasználónév: ${user.username}
E-mail cím: ${user.email}
Regisztráció IP címe: ${ip}
Időpont: ${new Date().toLocaleString("hu-HU")}

Ha nem te hoztad létre ezt a fiókot, kérjük, azonnal lépj kapcsolatba az adminisztrátorral.`,

            html: `
    <div style="font-family: Arial, sans-serif; color: #333; max-width: 500px; margin: auto; border: 1px solid #ddd; border-radius: 10px; padding: 20px;">
      <h2 style="color: #007bff;">Üdvözlünk a rendszerünkben, ${user.firstname}!</h2>
      <p>Az alábbi adatokkal lettél feljegyezve az adatbázisunkba:</p>

      <table style="width: 100%; border-collapse: collapse; margin-top: 10px;">
        <tr>
          <td style="padding: 8px; font-weight: bold;">Felhasználónév:</td>
          <td style="padding: 8px;">${user.username}</td>
        </tr>
        <tr>
          <td style="padding: 8px; font-weight: bold;">E-mail cím:</td>
          <td style="padding: 8px;">${user.email}</td>
        </tr>
        <tr>
          <td style="padding: 8px; font-weight: bold;">Telefonszám:</td>
          <td style="padding: 8px;">${user.phone}</td>
        </tr>
        <tr>
          <td style="padding: 8px; font-weight: bold;">Jelszó:</td>
          <td style="padding: 8px;">${password}</td>
        </tr>
        <tr>
          <td style="padding: 8px; font-weight: bold;">Bej. Kód:</td>
          <td style="padding: 8px;">${user.code}</td>
        </tr>
        <tr>
          <td style="padding: 8px; font-weight: bold;">Regisztráció ideje:</td>
          <td style="padding: 8px;">${new Date().toLocaleString("hu-HU")}</td>
        </tr>
      </table>

      <p style="margin-top: 20px;">
        Ha már van egy aktív fiókod, de nem te hoztad létre ezt a fiókot, kérjük jelezd az adminisztrátor felé.
      </p>

      <hr style="margin-top: 30px;">
      <p style="font-size: 12px; color: #777;">Ez egy automatikus üzenet, kérjük, ne válaszolj rá.</p>
    </div>
  `,
        });

        if (!result.success) {
            console.error("❌ Email küldési hiba:", result.error);
        } else {
            console.log("📩 Regisztrációs e-mail elküldve:", user.email);
        }

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

        // console.log(user)
        // console.log(user.email)

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

        const result = await sendMail({
            to: user.email,
            subject: "Új bejelentkezés",
            text: `Új bejelentkezést észleltünk a fiókodba.\n\nFelhasználó: ${user.username}\nIP: ${ip}\nIdőpont: ${new Date().toLocaleString("hu-HU")}`,
            html: `
        <h3>Új bejelentkezést észleltünk</h3>
        <p><b>Felhasználó:</b> ${user.username}</p>
        <p><b>IP cím:</b> ${ip}</p>
        <p><b>Időpont:</b> ${new Date().toLocaleString("hu-HU")}</p>
        <p>Ha ez nem te voltál, <a href="#">változtasd meg a jelszavadat!</a></p>
      `,
        });

        if (!result.success) console.error("Email küldési hiba:", result.error);

        res.json({ message: 'Sikeres bejelentkezés', sessionId });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Hiba történt a bejelentkezés során.' });
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
        const { firstname, lastname, email, phone, assigned_station, rank, password, code, username } = req.body;

        // Build update object only with provided fields
        const updateData = {};
        if (firstname !== undefined) updateData.firstname = firstname;
        if (lastname !== undefined) updateData.lastname = lastname;
        if (email !== undefined) updateData.email = email;
        if (username !== undefined) updateData.username = username;
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

// Get all stations
app.get('/api/stations', async (req, res) => {
    try {
        const stations = await Station.find();
        res.json(stations);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// Get one station
app.get('/api/stations/:id', async (req, res) => {
    try {
        const station = await Station.findById(req.params.id);
        if (!station) return res.status(404).json({ message: 'Station not found' });
        res.json(station);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// Create new station
app.post('/api/stations', async (req, res) => {
    try {
        const station = new Station(req.body);
        const newStation = await station.save();
        res.status(201).json(newStation);
        broadcastUpdate();
    } catch (err) {
        res.status(400).json({ message: err.message });
    }
});

// Update station
app.put('/api/stations/:id', async (req, res) => {
    try {
        const updated = await Station.findByIdAndUpdate(req.params.id, req.body, { new: true });
        if (!updated) return res.status(404).json({ message: 'Station not found' });
        res.json(updated);
        broadcastUpdate();
    } catch (err) {
        res.status(400).json({ message: err.message });
    }
});

// Delete station
app.delete('/api/stations/:id', async (req, res) => {
    try {
        const deleted = await Station.findByIdAndDelete(req.params.id);
        if (!deleted) return res.status(404).json({ message: 'Station not found' });
        res.json({ message: 'Station deleted' });
        broadcastUpdate();
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// Toggle station status
app.patch('/api/stations/:id/status/:status', async (req, res) => {
    try {
        const { id, status } = req.params;
        const station = await Station.findById(id);

        if (!station) {
            return res.status(404).json({ message: 'Station not found' });
        }

        // Convert status param to a boolean safely
        const normalizedStatus =
            status === 'true' || status === '1' || status === 'on';

        station.status = normalizedStatus;

        await station.save();

        res.status(200).json(station);
        broadcastUpdate();
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});


// Set delay
app.patch('/api/stations/:id/delay', async (req, res) => {
    try {
        const { delay } = req.body;
        const station = await Station.findByIdAndUpdate(
            req.params.id,
            { delay },
            { new: true }
        );
        if (!station) return res.status(404).json({ message: 'Station not found' });

        res.json(station);
        broadcastUpdate();
    } catch (err) {
        res.status(400).json({ message: err.message });
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

app.get('/api/logs/auth', async (req, res) => {
    try {
        const logs = await LoginLog.find()
        res.json(logs)
    } catch (error) {
        console.log(error)
        res.status(500).json({ message: "Hiba az azonosítási napló lekérésekor" })
    }
})

// Fetch player by their number
app.get('/api/users/number/:number', async (req, res) => {
    try {
        const { number } = req.params;
        const Player = require('./models/Player');
        const player = await Player.findOne({ number });
        if (!player) {
            return res.status(404).json({ message: 'Player not found' });
        }
        res.json(player);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Error fetching user', error: err.message });
    }
});

app.post('/api/points/register', async (req, res) => {
    try {
        const { userNumber, stationId, points } = req.body;

        if (!userNumber || !stationId || typeof points !== 'number') {
            return res.status(400).json({ message: 'Missing or invalid data' });
        }

        // Use Player model instead of User
        const Player = require('./models/Player');
        const player = await Player.findOne({ number: userNumber });
        if (!player) return res.status(404).json({ message: 'Player not found' });

        console.log(player)

        // Find the station
        const station = await Station.findById(stationId);
        if (!station) return res.status(404).json({ message: 'Station not found' });

        // Update player’s point balance
        player.points += points;
        await player.save();

        // Log this transaction
        const PointLog = require('./models/PointLog');
        await PointLog.create({
            user: player._id,
            station: station._id,
            points,
        });

        res.json({ message: 'Points added successfully', newBalance: player.points });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Error registering points', error: err.message });
    }
});

// Fetch point logs (improved for point logs page)
app.get('/api/logs/points', async (req, res) => {
    try {
        const PointLog = require('./models/PointLog');
        const { playerId, stationId } = req.query;

        const query = {};
        if (playerId) query.user = playerId;
        if (stationId) query.station = stationId;

        const logs = await PointLog.find(query).sort({ timestamp: -1 });
        res.json(logs);
    } catch (err) {
        res.status(500).json({ message: 'Error fetching point logs', error: err.message });
    }
});

// Fetch point logs (for checking if player has been at station)
app.get('/api/points/logs', async (req, res) => {
    try {
        const PointLog = require('./models/PointLog');
        const { playerId, stationId } = req.query;

        const query = {};
        if (playerId) query.user = playerId;
        if (stationId) query.station = stationId;

        const logs = await PointLog.find(query).sort({ timestamp: -1 });
        res.json(logs);
    } catch (err) {
        res.status(500).json({ message: 'Error fetching point logs', error: err.message });
    }
});

// Edit point log
app.put('/api/points/logs/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { user, station, points, timestamp } = req.body;

        const PointLog = require('./models/PointLog');
        const Player = require('./models/Player');

        const log = await PointLog.findById(id);
        if (!log) return res.status(404).json({ message: 'Log not found' });

        // Adjust old player's points
        if (log.user.toString() !== user) {
            const oldPlayer = await Player.findById(log.user);
            if (oldPlayer) {
                oldPlayer.points -= log.points;
                await oldPlayer.save();
            }
        } else {
            const samePlayer = await Player.findById(log.user);
            if (samePlayer) {
                samePlayer.points -= log.points;
                await samePlayer.save();
            }
        }

        // Update log
        log.user = user;
        log.station = station;
        log.points = points;
        log.timestamp = timestamp;
        await log.save();

        // Add points to new player
        const newPlayer = await Player.findById(user);
        if (newPlayer) {
            newPlayer.points += points;
            await newPlayer.save();
        }

        res.json({ message: 'Log updated successfully', log });
    } catch (err) {
        res.status(500).json({ message: 'Error updating log', error: err.message });
    }
});

// Delete/revoke point log
app.delete('/api/points/logs/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const PointLog = require('./models/PointLog');
        const Player = require('./models/Player');

        const log = await PointLog.findById(id);
        if (!log) return res.status(404).json({ message: 'Log not found' });

        // Subtract points from player
        const player = await Player.findById(log.user);
        if (player) {
            player.points -= log.points;
            await player.save();
        }

        await log.deleteOne();
        res.json({ message: 'Log revoked successfully' });
    } catch (err) {
        res.status(500).json({ message: 'Error revoking log', error: err.message });
    }
});

app.get("/api/auth/accesscode", async (req, res) => {
    const codeToCheck = req.query.code;
    try {
        if (!codeToCheck) {
            return res.status(401).json({ message: "No code provided" });
        }

        if (codeToCheck === accessCode) {
            return res.status(202).json({ message: "Access granted" });
        } else {
            return res.status(401).json({ message: "Invalid code" });
        }
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: "Server error" });
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

app.get('/dashboard/station', (req, res) => {
    res.sendFile(__dirname + "/public/app/station.html")
})

app.get("/display/monitor", (req, res) => {
    res.sendFile(__dirname + "/public/app/monitor.html")
})

app.get("/dashboard/admin/login-logs", (req, res) => {
    res.sendFile(__dirname + "/public/app/loginlogs.html")
})

app.get("/dashboard/admin/points-logs", (req, res) => {
    res.sendFile(__dirname + "/public/app/pointlogs.html")
})
// TEMORARLY

app.get("*", (req, res) => {
    res.sendFile(__dirname + "/public/app/404.html")
})

// Server indítás
const PORT = process.env.PORT || 8080;
server.listen(PORT, () => console.log(`Server fut a ${PORT} porton`));
