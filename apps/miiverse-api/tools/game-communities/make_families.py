#!/usr/bin/env python3
"""Writes families.json from the hand-checked table below and checks it against the live community names.

    make_families.py <communities.json> [out]

communities.json is a dump of the communities collection (name, description). Every name in the table
must match exactly one game community; a name that matches none stops the run. Games listed newest
first: the first one's art is the family's icon. A game that appears in no row stands alone.
"""
import json, sys

F = [
 ("animal-crossing", "Animal Crossing", ["Animal Crossing: New Horizons", "Animal Crossing: New Leaf", "Animal Crossing: City Folk", "Animal Crossing: Wild World"]),
 ("bayonetta", "Bayonetta", ["Bayonetta 3", "Bayonetta 2"]),
 ("bleach", "Bleach", ["Bleach: Versus Crusade", "Bleach: The Blade of Fate"]),
 ("bomberman", "Bomberman", ["Bomberman 2", "Bomberman Blast"]),
 ("castlevania", "Castlevania", ["Castlevania: Judgment", "Castlevania: Portrait of Ruin"]),
 ("clubhouse-games", "Clubhouse Games", ["Clubhouse Games: 51 Worldwide Classics", "Clubhouse Games"]),
 ("conduit", "The Conduit", ["Conduit 2", "The Conduit"]),
 ("crystal-defenders", "Crystal Defenders", ["Crystal Defenders R2", "Crystal Defenders R1"]),
 ("deca-sports", "Deca Sports", ["Deca Sports 3", "Deca Sports 2"]),
 ("diablo", "Diablo", ["Diablo II: Resurrected", "Diablo III: Eternal Collection"]),
 ("dr-mario", "Dr. Mario", ["Dr. Luigi", "Dr. Mario: Miracle Cure", "Dr. Mario Online Rx"]),
 ("endless-ocean", "Endless Ocean", ["Endless Ocean 2: Adventures of the Deep", "Endless Ocean"]),
 ("excite", "Excite", ["Excitebike: World Rally", "Excitebots: Trick Racing"]),
 ("final-fantasy", "Final Fantasy", ["Final Fantasy Crystal Chronicles: Echoes of Time", "Final Fantasy Crystal Chronicles: Ring of Fates", "Final Fantasy Fables: Chocobo's Dungeon"]),
 ("guitar-hero", "Guitar Hero", ["Guitar Hero: Van Halen", "Guitar Hero: Smash Hits", "Guitar Hero: Metallica", "Guitar Hero World Tour", "Guitar Hero III: Legends of Rock"]),
 ("hooked", "Hooked!", ["Hooked! Again: Real Motion Fishing", "Hooked! Real Motion Fishing"]),
 ("kirby", "Kirby", ["Kirby's Dream Buffet", "Team Kirby Clash Deluxe"]),
 ("legend-of-zelda", "The Legend of Zelda", ["The Legend of Zelda: Tri Force Heroes", "The Legend of Zelda: Phantom Hourglass"]),
 ("luigis-mansion", "Luigi's Mansion", ["Luigi's Mansion 3", "Luigi's Mansion: Dark Moon"]),
 ("mario-and-sonic", "Mario & Sonic", ["Mario & Sonic at the London 2012 Olympic Games", "Mario & Sonic at the Olympic Winter Games", "Mario & Sonic at the Olympic Games"]),
 ("mario-kart", "Mario Kart", ["Mario Kart 8 Deluxe", "Mario Kart 8", "Mario Kart 7", "Mario Kart Wii", "Mario Kart DS"]),
 ("mario-maker", "Mario Maker", ["Super Mario Maker 2", "Super Mario Maker"]),
 ("mario-party", "Mario Party", ["Super Mario Party Jamboree", "Mario Party Superstars"]),
 ("mario-sports", "Mario Sports", ["Mario Golf: Super Rush", "Mario Strikers: Battle League", "Mario Tennis Aces", "Mario Sports Mix", "Mario Strikers Charged"]),
 ("mega-man", "Mega Man", ["Mega Man 10", "Mega Man 9", "Mega Man Star Force 3"]),
 ("metroid", "Metroid", ["Metroid Prime: Federation Force", "Metroid Prime Hunters"]),
 ("minecraft", "Minecraft", ["Minecraft Legends", "Minecraft Dungeons", "Minecraft: Nintendo Switch Edition", "Minecraft", "Minecraft: Wii U Edition"]),
 ("momotaro-dentetsu", "Momotaro Dentetsu", ["Momotaro Dentetsu 2010: Sengoku Ishin no Hero Daishuugou! no Maki", "Momotarou Dentetsu 16: Hokkaidou Daiidou no Maki!"]),
 ("monster-hunter", "Monster Hunter", ["Monster Hunter Generations Ultimate", "Monster Hunter XX", "Monster Hunter Stories", "Monster Hunter Generations", "Monster Hunter 4 Ultimate", "Monster Hunter 4", "Monster Hunter 3 Ultimate"]),
 ("mysims", "MySims", ["MySims SkyHeroes", "MySims Sports", "MySims Party"]),
 ("naruto-shippuden", "Naruto Shippuden", ["NARUTO SHIPPUDEN GEKITOU NINJATAISEN ! EX4", "Naruto Shippuden: Clash of Ninja Revolution 3"]),
 ("nba-2k", "NBA 2K", ["NBA 2K11", "NBA 2K10"]),
 ("neverwinter-nights", "Neverwinter Nights", ["Neverwinter Nights 2", "Neverwinter Nights: Enhanced Edition"]),
 ("nhl-2k", "NHL 2K", ["NHL 2K11", "NHL 2K10"]),
 ("pokemon", "Pokémon", ["Pokemon Scarlet / Violet", "Pokemon Legends: Arceus", "Pokemon Omega Ruby / Alpha Sapphire", "Pokemon X / Y", "Pokken Tournament", "Pokemon Rumble World", "Pokemon Black 2 / White 2", "Pokemon Black / White", "Pokemon Dungeon", "Pokemon Battle Revolution", "Pokemon Platinum", "Pokemon HeartGold / SoulSilver", "Pokemon Diamond / Pearl"]),
 ("pro-evolution-soccer", "Pro Evolution Soccer and Winning Eleven", ["Winning Eleven Play Maker 2012", "Pro Evolution Soccer 2011", "Winning Eleven Play Maker 2010", "World Soccer Winning Eleven Play Maker 2010", "Winning Eleven PLAY MAKER 2009", "Pro Evolution Soccer 2008", "World Soccer Winning Eleven Wii"]),
 ("puyo-puyo", "Puyo Puyo", ["Puyo Puyo Tetris", "Puyo Puyo 7", "Puyo Puyo!! 20th Anniversary", "Puyo Puyo Tsu", "Puyo Puyo"]),
 ("reload", "Reload", ["Reload: Target Down", "Reload"]),
 ("remington-super-slam-hunting", "Remington Super Slam Hunting", ["Remington Super Slam Hunting - Alaska", "Remington Super Slam Hunting - Africa"]),
 ("resident-evil", "Resident Evil", ["Resident Evil: The Mercenaries 3D", "Resident Evil: The Darkside Chronicles"]),
 ("risk-of-rain", "Risk of Rain", ["Risk of Rain Returns", "Risk of Rain 2", "Risk of Rain"]),
 ("rtl-winter-sports", "RTL Winter Sports", ["RTL Winter Sports 2011", "RTL Winter Sports 2010: The Great Tournament", "Winter Sports 3: The Great Tournament"]),
 ("samurai-warriors", "Samurai Warriors", ["Samurai Warriors 3", "Sengoku Musou 3: Moushouden"]),
 ("simple-series", "Simple Series", ["SIMPLE Wii Series Vol.6 THE Minna de Waiwai Combat", "@Simple Series Vol. 5: The Judo", "SIMPLE Wii Series Vol.4 THE Shooting Action", "Simple Series Vol. 3: The Mahjong", "Simple: The Number - Puzzle", "SIMPLE THE Block Kuzushi", "THE Block Kuzushi - With the Stage Creation feature"]),
 ("sonic", "Sonic", ["Sonic Colors", "Sonic Rush Adventure", "Sonic & All-Stars Racing Transformed", "Sonic & Sega All-Stars Racing", "Sonic and the Black Knight", "Sonic Riders: Zero Gravity", "Sonic DL"]),
 ("space-invaders", "Space Invaders", ["Space Invaders Get Even", "Space Invaders Extreme 2"]),
 ("splatoon", "Splatoon", ["Splatoon 3", "Splatoon 2", "Splatoon"]),
 ("street-fighter", "Street Fighter", ["Super Street Fighter IV 3D Edition", "Super Street Fighter II: The New Challengers"]),
 ("super-mario", "Super Mario", ["Super Mario Bros. Wonder", "Super Mario Bros. 35", "Super Mario 3D World + Bowser's Fury", "Super Mario Odyssey", "Super Mario 3D World"]),
 ("super-smash-bros", "Super Smash Bros.", ["Super Smash Bros. Ultimate", "Super Smash Bros. for Wii U", "Super Smash Bros. for Nintendo 3DS", "Super Smash Bros. Brawl"]),
 ("table-game-stadium", "Table Game Stadium", ["Table Game Stadium", "Table Game Stadium (D3-Yuki)"]),
 ("teenage-mutant-ninja-turtles", "Teenage Mutant Ninja Turtles", ["Teenage Mutant Ninja Turtles: Shredder's Revenge", "Teenage Mutant Ninja Turtles: Smash-Up"]),
 ("tetris", "Tetris", ["Tetris++", "Tetris Party Deluxe", "Tetris Party", "Tetris DS"]),
 ("torchlight", "Torchlight", ["Torchlight III", "Torchlight II"]),
 ("trackmania", "Trackmania", ["Trackmania Wii", "Trackmania"]),
 ("virtua-tennis", "Virtua Tennis", ["Virtua Tennis 4", "Virtua Tennis 2009"]),
 ("wargroove", "Wargroove", ["Wargroove 2", "Wargroove"]),
 ("worms", "Worms", ["Worms: Open Warfare 2", "Worms"]),
 ("yo-kai-watch", "Yo-kai Watch", ["Yo-kai Watch Blasters", "Yo-kai Watch 2"]),
]

def main():
    comms = json.load(open(sys.argv[1]))
    names = {}
    for c in comms:
        names.setdefault(c['name'].lower(), []).append(c)
    bad, seen = [], {}
    for slug, fam, games in F:
        for g in games:
            if len(names.get(g.lower(), [])) != 1:
                bad.append('%s: %r matches %d' % (slug, g, len(names.get(g.lower(), []))))
            if g.lower() in seen:
                bad.append('%r in %s and %s' % (g, seen[g.lower()], slug))
            seen[g.lower()] = slug
    if bad:
        sys.exit('\n'.join(bad))
    out = sys.argv[2] if len(sys.argv) > 2 else 'families.json'
    json.dump({'families': [{'slug': s, 'name': n, 'games': g} for s, n, g in F]}, open(out, 'w'), indent=1, ensure_ascii=False)
    games = [c for c in comms if ' on ' in c['description']]
    print('families', len(F), 'games in families', len(seen), 'games', len(games), 'shown after grouping', len(games) - len(seen) + len(F))

main()
