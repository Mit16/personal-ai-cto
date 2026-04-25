import { Client, GatewayIntentBits, REST, Routes } from "discord.js";
import { DISCORD_TOKEN, DISCORD_CLIENT_ID } from "./config/config.js";
import * as goalCommand from "./commands/commands.js";
import express from "express";

const app = express();
const PORT = process.env.PORT || 3000;

app.get("/", (req, res) => {
  res.send("Discord bot is running!");
});

app.listen(PORT, () => {
  console.log(`Dummy web server listening on port ${PORT} to satisfy Render health checks.`);
});

const client = new Client({
  intents: [GatewayIntentBits.Guilds],
});

const commands = [
  goalCommand.data.toJSON(),
  goalCommand.statusData.toJSON(),
  goalCommand.reviewData.toJSON(),
  goalCommand.enforceData.toJSON(),
  goalCommand.summaryData.toJSON(),
];

const rest = new REST({ version: "10" }).setToken(DISCORD_TOKEN);

(async () => {
  try {
    console.log("Registering slash commands...");

    await rest.put(Routes.applicationCommands(DISCORD_CLIENT_ID), {
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
    await goalCommand.executeGoal(interaction);
  }

  if (interaction.commandName === "status") {
    await goalCommand.executeStatus(interaction);
  }

  if (interaction.commandName === "review_latest_commit") {
    await goalCommand.executeReview(interaction);
  }

  if (interaction.commandName === "enforce") {
    await goalCommand.executeEnforce(interaction);
  }

  if (interaction.commandName === "weekly_summary") {
    await goalCommand.executeSummary(interaction);
  }
});

client.login(DISCORD_TOKEN);
