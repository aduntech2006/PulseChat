// test-db.js
import postgres from "postgres";
import dotenv from "dotenv";

dotenv.config();

const sql = postgres(process.env.DATABASE_URL, {
  ssl: { rejectUnauthorized: false }, // Required for Supabase
});

(async () => {
  try {
    // Simple test query
    const result = await sql`SELECT NOW() AS current_time`;
    console.log("✅ Database connected!");
    console.log("🕒 Current time:", result[0].current_time);

    // List available tables
    const tables = await sql`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
    `;
    console.log("📋 Available tables:", tables.map(t => t.table_name));
    
    process.exit(0);
  } catch (err) {
    console.error("❌ Database connection failed:", err.message);
    process.exit(1);
  } finally {
    await sql.end({ timeout: 5 }); // close pool
  }
})();
