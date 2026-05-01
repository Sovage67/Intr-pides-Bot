import { Events, type Message } from 'discord.js';
import { redis } from '../lib/redis.js';
import { prisma } from '../lib/prisma.js';
import { getGuildConfig } from '../lib/cache.js';
import { logger } from '../lib/logger.js';

const XP_COOLDOWN_SECONDS = 60;
const XP_PER_MESSAGE = { min: 15, max: 25 };

function xpForLevel(level: number): number {
  return 5 * level * level + 50 * level + 100;
}

export default {
  name: Events.MessageCreate,
  async execute(message: Message) {
    if (message.author.bot || !message.inGuild()) return;

    try {
      const config = await getGuildConfig(message.guildId, message.guild.name);
      const modules = config.modules as { levels?: boolean };
      if (modules.levels === false) return;

      // Cooldown anti-spam XP via Redis
      const cdKey = `xpcd:${message.guildId}:${message.author.id}`;
      const onCooldown = await redis.get(cdKey);
      if (onCooldown) return;
      await redis.set(cdKey, '1', 'EX', XP_COOLDOWN_SECONDS);

      const xpGain =
        Math.floor(Math.random() * (XP_PER_MESSAGE.max - XP_PER_MESSAGE.min + 1)) +
        XP_PER_MESSAGE.min;

      await prisma.user.upsert({
        where: { id: message.author.id },
        create: { id: message.author.id, username: message.author.username },
        update: { username: message.author.username },
      });

      const member = await prisma.member.upsert({
        where: { guildId_userId: { guildId: message.guildId, userId: message.author.id } },
        create: { guildId: message.guildId, userId: message.author.id, xp: xpGain },
        update: { xp: { increment: xpGain } },
      });

      const requiredXp = xpForLevel(member.level);
      if (member.xp >= requiredXp) {
        const newLevel = member.level + 1;
        await prisma.member.update({
          where: { guildId_userId: { guildId: message.guildId, userId: message.author.id } },
          data: { level: newLevel, xp: member.xp - requiredXp },
        });
        await message.channel
          .send(`🎉 <@${message.author.id}> passe au **niveau ${newLevel}** !`)
          .catch(() => {});
      }
    } catch (err) {
      logger.error({ err }, 'Erreur dans messageCreate (XP)');
    }
  },
};
