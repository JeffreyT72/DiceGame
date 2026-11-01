-- SQLite
SELECT * FROM player_stats;
SELECT * FROM users;

UPDATE player_stats SET currency = 100 WHERE user_id = 'ce55c84366ca7f9cbe12495d166e4d2a';

ALTER table player_stats ADD COLUMN character_name TEXT;

UPDATE player_stats SET character_name = (SELECT username FROM users WHERE users.id = player_stats.user_id);
