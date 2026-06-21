import { Client } from 'pg';
import * as dotenv from 'dotenv';
dotenv.config();

async function run() {
    const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
    const isLocal = url.includes('localhost') || url.includes('127.0.0.1');

    const connectionString = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/postgres';
    
    const client = new Client({ connectionString });
    await client.connect();

    const result = await client.query(`
        SELECT policyname, roles, cmd, qual, with_check 
        FROM pg_policies 
        WHERE tablename = 'requisitions';
    `);

    console.log("Requisitions policies:");
    console.table(result.rows);

    await client.end();
}
run();
