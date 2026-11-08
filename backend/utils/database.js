// database.js
import postgres from "postgres";
import dotenv from "dotenv";

dotenv.config();

// ✅ Always enforce SSL for Supabase
const sql = postgres(process.env.DATABASE_URL, {
  ssl: { rejectUnauthorized: false },
  max: 10,
  idle_timeout: 20,
  connect_timeout: 10,
});

// Optional: a test function you can call manually
const testConnection = async () => {
  try {
    await sql`SELECT 1`;
    console.log("✅ Database connected successfully!");
  } catch (error) {
    console.error("❌ Database connection failed:", error.message);
    process.exit(1);
  }
};

export default sql;
