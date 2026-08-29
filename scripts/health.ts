import dns from "node:dns";
import "dotenv/config";

dns.setDefaultResultOrder("ipv4first");
try {
  dns.setServers(["8.8.8.8", "1.1.1.1"]);
} catch {
  // ignore
}

import mongoose from "mongoose";
import { connectDB } from "../src/lib/db";
import { Product, Customer, Sale } from "../src/lib/models";

async function main() {
  await connectDB();
  const [products, customers, sales] = await Promise.all([
    Product.countDocuments(),
    Customer.countDocuments(),
    Sale.countDocuments(),
  ]);
  console.log("MongoDB connected");
  console.log(`Products: ${products}`);
  console.log(`Customers: ${customers}`);
  console.log(`Sales: ${sales}`);
  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await mongoose.disconnect().catch(() => undefined);
  process.exit(1);
});
