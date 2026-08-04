import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import pkg from "../../generated/prisma/index.js";
const { PrismaClient } = pkg;

const adapter = new PrismaPg({
    connectionString: process.env.DATABASE_CONNECTION
})

const prisma = new PrismaClient({ adapter });

export { prisma }