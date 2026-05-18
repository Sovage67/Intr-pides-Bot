/**
 * Script pour enregistrer les Slash Commands auprès de Discord.
 * À lancer après chaque modification d'une commande :
 *   npm run deploy-commands
 *
 * Pour un déploiement instantané sur un serveur de test, ajouter
 * DISCORD_GUILD_ID=... dans .env et le script utilisera ce serveur
 * au lieu d'un déploiement global (qui peut prendre jusqu'à 1h).
 */
import 'dotenv/config';
import { REST, Routes } from 'discord.js';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

async function main() {
  const token = process.env.DISCORD_TOKEN;
  const clientId = process.env.DISCORD_CLIENT_ID;
  const guildId = process.env.DISCORD_GUILD_ID;

  if (!token || !clientId) {
    throw new Error('DISCORD_TOKEN et DISCORD_CLIENT_ID requis dans .env');
  }

  const commands: object[] = [];
  const commandsPath = join(import.meta.dirname, '..', 'commands');

  // Seul le dossier "panels" est déployé sur Discord.
  // Les autres commandes (moderation, economy, utility) sont exécutées
  // directement via les menus déroulants des panels et n'apparaissent pas dans le /.
  const DEPLOYED_CATEGORIES = ['panels'];

  for (const category of readdirSync(commandsPath)) {
    if (!DEPLOYED_CATEGORIES.includes(category)) continue;
    const categoryPath = join(commandsPath, category);
    for (const file of readdirSync(categoryPath).filter(
      (f) => f.endsWith('.ts') || f.endsWith('.js'),
    )) {
      const mod = await import(pathToFileURL(join(categoryPath, file)).href);
      if (mod.default?.data) {
        commands.push(mod.default.data.toJSON());
      }
    }
  }

  const rest = new REST().setToken(token);

  const route = guildId
    ? Routes.applicationGuildCommands(clientId, guildId)
    : Routes.applicationCommands(clientId);

  console.log(`Déploiement de ${commands.length} commandes...`);
  await rest.put(route, { body: commands });
  console.log(`✓ Commandes déployées ${guildId ? `sur le serveur ${guildId}` : 'globalement'}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
