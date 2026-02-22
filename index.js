const express = require('express');
const fs = require('fs').promises;
const path = require('path');
const fetch = require('node-fetch'); // Добавляем node-fetch для серверных запросов
const app = express();
const PORT = 3000;

// Middleware
app.use(express.json());
app.use(express.static('public'));

// Путь к файлу с играми
const GAMES_FILE = path.join(__dirname, 'games.json');

// Функция для чтения игр
async function readGames() {
    try {
        const data = await fs.readFile(GAMES_FILE, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        // Если файла нет, создаем пустой массив
        return [];
    }
}

// Функция для записи игр
async function writeGames(games) {
    await fs.writeFile(GAMES_FILE, JSON.stringify(games, null, 2));
}

// API: Получить все игры
app.get('/api/games', async (req, res) => {
    try {
        const games = await readGames();
        res.json(games);
    } catch (error) {
        res.status(500).json({ error: 'Ошибка чтения игр' });
    }
});

// API: Проверить игру
app.get('/api/games/:id', async (req, res) => {
    try {
        const games = await readGames();
        const game = games.find(g => g.id == req.params.id);
        if (game) {
            res.json(game);
        } else {
            res.json({ exists: false });
        }
    } catch (error) {
        res.status(500).json({ error: 'Ошибка проверки игры' });
    }
});

// API: Добавить игру (для Roblox)
app.post('/api/register', async (req, res) => {
    try {
        const { gameId, gameName, players = 0 } = req.body;
        if (!gameId || !gameName) {
            return res.status(400).json({ error: 'Требуется gameId и gameName' });
        }
        let games = await readGames();
        // Ищем игру
        const existingIndex = games.findIndex(g => g.id == gameId);
        if (existingIndex !== -1) {
            // Обновляем существующую игру
            games[existingIndex].lastSeen = new Date().toISOString();
            games[existingIndex].visits = (games[existingIndex].visits || 0) + 1;
            games[existingIndex].players = players;
            await writeGames(games);
            return res.json({
                success: true,
                message: 'Статистика обновлена',
                game: games[existingIndex]
            });
        }
        // Добавляем новую игру
        const newGame = {
            id: gameId,
            name: gameName,
            added: new Date().toISOString(),
            lastSeen: new Date().toISOString(),
            visits: 1,
            players: players,
            genre: 'Не указан',
            url: `https://www.roblox.com/games/${gameId}/`
        };
        games.push(newGame);
        await writeGames(games);
        console.log(`✅ Новая игра: ${gameName} (ID: ${gameId})`);
        res.json({
            success: true,
            message: 'Игра успешно зарегистрирована',
            game: newGame
        });
    } catch (error) {
        console.error('Ошибка регистрации:', error);
        res.status(500).json({ error: 'Ошибка регистрации игры' });
    }
});

// API: Удалить игру
app.delete('/api/games/:id', async (req, res) => {
    try {
        let games = await readGames();
        const initialLength = games.length;
        games = games.filter(g => g.id != req.params.id);
        if (games.length === initialLength) {
            return res.status(404).json({ error: 'Игра не найдена' });
        }
        await writeGames(games);
        res.json({ success: true, message: 'Игра удалена' });
    } catch (error) {
        res.status(500).json({ error: 'Ошибка удаления игры' });
    }
});

// API: Статистика
app.get('/api/stats', async (req, res) => {
    try {
        const games = await readGames();
        const stats = {
            totalGames: games.length,
            totalVisits: games.reduce((sum, g) => sum + (g.visits || 0), 0),
            totalPlayers: games.reduce((sum, g) => sum + (g.players || 0), 0),
            lastUpdated: new Date().toISOString(),
            recentGames: games
                .sort((a, b) => new Date(b.lastSeen) - new Date(a.lastSeen))
                .slice(0, 5)
        };
        res.json(stats);
    } catch (error) {
        res.status(500).json({ error: 'Ошибка получения статистики' });
    }
});

// Новый API: Прокси для Roblox данных (чтобы избежать CORS на клиенте)
app.get('/api/roblox/games', async (req, res) => {
    const placeIds = req.query.placeIds;
    if (!placeIds) {
        return res.status(400).json({ error: 'Требуется placeIds' });
    }
    try {
        const response = await fetch(`https://games.roblox.com/v1/games?placeIds=${placeIds}`);
        if (!response.ok) {
            throw new Error('Ошибка от Roblox API');
        }
        const data = await response.json();
        res.json(data);
    } catch (error) {
        console.error('Ошибка прокси Roblox:', error);
        res.status(500).json({ error: 'Ошибка получения данных от Roblox' });
    }
});

// Главная страница
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Запуск сервера
app.listen(PORT, () => {
    console.log(`🚀 Сервер запущен: http://localhost:${PORT}`);
    console.log(`📊 API доступно по адресу: http://localhost:${PORT}/api/games`);
});
