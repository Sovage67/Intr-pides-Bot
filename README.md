# Bot Intrépides — Bot Discord

Bot Discord (discord.js) du projet Bot Intrépides. Communique avec le dashboard via une base Supabase et un Redis Upstash partagés avec l'API.

## Démarrage local

```bash
cp .env.example .env
# Remplis .env avec tes vraies valeurs (token Discord, URLs Supabase, Redis Upstash)

npm install
npx prisma generate
npx prisma migrate deploy

# Enregistrer les slash commands sur Discord
npm run deploy-commands

# Lancer le bot en mode dev (auto-reload)
npm run dev
```

## Déploiement sur Render

Ce repo est conçu pour être déployé sur **Render** en tant que **Web Service** (free tier compatible avec UptimeRobot).

1. Push ce repo sur GitHub
2. Sur Render → New Web Service → connecte ce repo
3. Configuration suggérée :
   - Build command : `npm install && npm run build`
   - Start command : `npm start`
   - Health check path : `/health`
4. Variables d'environnement : copie celles de `.env.example` et remplis les vraies valeurs
5. Configure UptimeRobot pour ping `https://[ton-bot].onrender.com/health` toutes les 5 minutes

Voir le `DEPLOYMENT.md` à la racine du projet pour le guide complet.

## Structure

```
bot/
├── prisma/schema.prisma      # Schéma BDD (à garder synchro avec api/)
├── src/
│   ├── commands/             # Slash commands (auto-chargées)
│   ├── events/               # Events Discord
│   ├── lib/                  # Helpers (cache, prisma, redis, logger)
│   ├── scripts/              # Scripts utilitaires
│   ├── server.ts             # Serveur HTTP (UptimeRobot)
│   └── index.ts              # Point d'entrée
├── Dockerfile
├── render.yaml               # Config Render
└── package.json
```

## Ajouter une commande

Crée un fichier dans `src/commands/[catégorie]/` :

```typescript
import { SlashCommandBuilder } from 'discord.js';
import type { SlashCommand } from '../../lib/types.js';

const command: SlashCommand = {
  data: new SlashCommandBuilder().setName('hello').setDescription('Dit bonjour'),
  async execute(interaction) {
    await interaction.reply('Bonjour !');
  },
};

export default command;
```

Puis lance `npm run deploy-commands` pour la déployer auprès de Discord.
