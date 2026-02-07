// interface\discord-bot\src\index.ts
import { Client, GatewayIntentBits, REST, Routes } from "discord.js";
import dotenv from "dotenv";
import * as goalCommand from "./commands/goal";

dotenv.config();

const client = new Client({
  intents: [GatewayIntentBits.Guilds],
});

const commands = [goalCommand.data.toJSON()];

const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN!);

(async () => {
  try {
    console.log("Registering slash commands...");

    await rest.put(Routes.applicationCommands(process.env.DISCORD_CLIENT_ID!), {
      body: commands,
    });

    console.log("Slash commands registered");
  } catch (error) {
    console.error("Command registration failed:", error);
  }
})();

client.on("ready", () => {
  console.log(`Discord bot logged in as ${client.user?.tag}`);
});

client.on("interactionCreate", async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  if (interaction.commandName === "goal") {
    await goalCommand.execute(interaction);
  }
});

client.login(process.env.DISCORD_TOKEN);
