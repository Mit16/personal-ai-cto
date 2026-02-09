import dotenv from "dotenv";
dotenv.config();

export const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:3000";
export const DISCORD_TOKEN = process.env.DISCORD_TOKEN!;
export const DISCORD_CLIENT_ID = process.env.DISCORD_CLIENT_ID!;