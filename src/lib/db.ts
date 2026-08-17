import dns from "node:dns";
import mongoose from "mongoose";

const MONGODB_URI = process.env.DATABASE_URL;

if (!MONGODB_URI) {
  throw new Error("Missing DATABASE_URL in environment variables");
}

dns.setDefaultResultOrder("ipv4first");
// Windows / local DNS resolvers often break mongodb+srv SRV lookups in Node.
// Only override to public resolvers for +srv URIs — a plain mongodb:// URI
// (explicit host list, no SRV lookup) gets no benefit from this, and forcing
// 8.8.8.8/1.1.1.1 can itself stall/timeout on networks that block those IPs.
if (MONGODB_URI.startsWith("mongodb+srv://")) {
  try {
    dns.setServers(["8.8.8.8", "1.1.1.1"]);
  } catch {
    // ignore if restricted
  }
}

interface MongooseCache {
  conn: typeof mongoose | null;
  promise: Promise<typeof mongoose> | null;
}

declare global {
  // eslint-disable-next-line no-var
  var mongooseCache: MongooseCache | undefined;
}

const cached: MongooseCache = global.mongooseCache ?? {
  conn: null,
  promise: null,
};

global.mongooseCache = cached;

export async function connectDB() {
  if (cached.conn) return cached.conn;

  if (!cached.promise) {
    cached.promise = mongoose.connect(MONGODB_URI!, {
      bufferCommands: false,
      // Fail fast so auth stays within ~3s instead of hanging on bad DNS/Atlas.
      serverSelectionTimeoutMS: 2500,
      connectTimeoutMS: 2500,
      socketTimeoutMS: 20000,
      family: 4,
      // Keep sockets warm for POS complete (parallel reserve + layer + insert).
      maxPoolSize: 24,
      minPoolSize: 4,
    });
  }

  cached.conn = await cached.promise;
  return cached.conn;
}
